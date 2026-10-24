/** Road geometry shared by the simulation and city renderer. Coordinates use
 * x=east, y=south; elevations and road dimensions use the same world units. */
const TAU = Math.PI * 2;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const mod = (n, divisor) => ((n % divisor) + divisor) % divisor;

export function pointOnTrack(track, distance, lane = 0) {
  const s = mod(distance, track.length), segments = track.segments;
  let low = 0, high = segments.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (s < segments[middle].s + segments[middle].length) high = middle; else low = middle + 1;
  }
  const segment = segments[low], along = s - segment.s;
  let x, y, angle, curvature = 0;
  if (segment.kind === 'line') {
    x = segment.x1 + (segment.x2 - segment.x1) * along / segment.length;
    y = segment.y1 + (segment.y2 - segment.y1) * along / segment.length;
    angle = segment.angle;
  } else {
    const radial = segment.startAngle + segment.direction * along / segment.radius;
    x = segment.cx + Math.cos(radial) * segment.radius; y = segment.cy + Math.sin(radial) * segment.radius;
    angle = radial + segment.direction * Math.PI / 2; curvature = segment.direction / segment.radius;
  }
  return { x: x - Math.sin(angle) * lane, y: y + Math.cos(angle) * lane, angle, curvature, s, ...roadSurface(track, s) };
}

export function geographicToWorld(projection, longitude, latitude) {
  return {
    x: (longitude - projection.longitude) * projection.longitudeMeters * projection.unitsPerMeter + projection.offsetX,
    y: (projection.latitude - latitude) * projection.latitudeMeters * projection.unitsPerMeter + projection.offsetY,
  };
}

/** Equirectangular local projection: a city-sized route keeps metre scale,
 * orientation, and relative landmark positions without stretching either axis. */
export function projectGeographicRoute(coordinates, { unitsPerMeter = 6, padding = 720 } = {}) {
  if (!Array.isArray(coordinates) || coordinates.length < 3 || !(unitsPerMeter > 0)) {
    throw new TypeError('A geographic circuit needs at least three [longitude, latitude] points.');
  }
  for (const p of coordinates) if (!Array.isArray(p) || !Number.isFinite(p[0] + p[1])) {
    throw new TypeError('Geographic coordinates must be finite longitude/latitude pairs.');
  }
  const longitude = coordinates.reduce((sum, p) => sum + p[0], 0) / coordinates.length;
  const latitude = coordinates.reduce((sum, p) => sum + p[1], 0) / coordinates.length;
  const projection = { longitude, latitude, longitudeMeters: 111320 * Math.cos(latitude * Math.PI / 180),
    latitudeMeters: 111320, unitsPerMeter, offsetX: 0, offsetY: 0 };
  let points = coordinates.map(([lon, lat]) => geographicToWorld(projection, lon, lat));
  projection.offsetX = padding - Math.min(...points.map(p => p.x));
  projection.offsetY = padding - Math.min(...points.map(p => p.y));
  points = coordinates.map(([lon, lat]) => geographicToWorld(projection, lon, lat));
  return { projection: Object.freeze(projection), points,
    width: Math.max(...points.map(p => p.x)) + padding,
    height: Math.max(...points.map(p => p.y)) + padding };
}

function distanceToLine(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  let farthest = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = distanceToLine(points[i], points[0], points.at(-1));
    if (distance > farthest) { farthest = distance; index = i; }
  }
  if (farthest <= tolerance) return [points[0], points.at(-1)];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

/** Round road junctions with tangent circular arcs. Long straight streets stay
 * straight; unlike an unconstrained spline, no curve overshoots its junction. */
export function createClosedTrack({ id, name, city, points, roadWidth = 90, radius = 90,
  simplifyTolerance = 3, width, height, unitsPerMeter = 6, projection = null,
  sections = [], landmarks = [], metadata = {}, trafficSections = [] }) {
  const unique = points.filter((point, index) => !index || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > .01);
  if (unique.length > 1 && Math.hypot(unique[0].x - unique.at(-1).x, unique[0].y - unique.at(-1).y) < .01) unique.pop();
  if (unique.length < 3) throw new TypeError('A closed road needs at least three distinct points.');
  const midpoint = Math.floor(unique.length / 2);
  const route = [...simplify(unique.slice(0, midpoint + 1), simplifyTolerance).slice(0, -1),
    ...simplify([...unique.slice(midpoint), unique[0]], simplifyTolerance).slice(0, -1)];
  const corners = route.map((p, i) => {
    const before = route[mod(i - 1, route.length)], after = route[(i + 1) % route.length];
    const inLength = Math.hypot(p.x - before.x, p.y - before.y), outLength = Math.hypot(after.x - p.x, after.y - p.y);
    const incoming = { x: (p.x - before.x) / inLength, y: (p.y - before.y) / inLength };
    const outgoing = { x: (after.x - p.x) / outLength, y: (after.y - p.y) / outLength };
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
    const turn = Math.atan2(cross, incoming.x * outgoing.x + incoming.y * outgoing.y);
    if (Math.abs(turn) < .015 || Math.abs(turn) > Math.PI - .05) return { entry: p, exit: p, arc: null };
    const trim = Math.min(radius * Math.tan(Math.abs(turn) / 2), inLength * .42, outLength * .42);
    const effectiveRadius = trim / Math.tan(Math.abs(turn) / 2);
    const entry = { x: p.x - incoming.x * trim, y: p.y - incoming.y * trim };
    const exit = { x: p.x + outgoing.x * trim, y: p.y + outgoing.y * trim };
    const direction = Math.sign(turn);
    const cx = entry.x - incoming.y * direction * effectiveRadius;
    const cy = entry.y + incoming.x * direction * effectiveRadius;
    return { entry, exit, arc: { kind: 'arc', cx, cy, radius: effectiveRadius,
      startAngle: Math.atan2(entry.y - cy, entry.x - cx), sweep: turn, direction,
      length: effectiveRadius * Math.abs(turn) } };
  });
  const segments = []; let length = 0;
  const add = segment => {
    if (segment.length < 1e-6) return;
    segments.push(Object.freeze({ ...segment, s: length })); length += segment.length;
  };
  for (let i = 0; i < corners.length; i++) {
    const from = corners[i].exit, to = corners[(i + 1) % corners.length].entry;
    add({ kind: 'line', x1: from.x, y1: from.y, x2: to.x, y2: to.y,
      length: Math.hypot(to.x - from.x, to.y - from.y), angle: Math.atan2(to.y - from.y, to.x - from.x) });
    const nextArc = corners[(i + 1) % corners.length].arc;
    if (nextArc) add(nextArc);
  }
  if (!(length > 100)) throw new TypeError('A racing circuit must have a usable length.');
  const normalizeSection = section => Object.freeze({ ...section,
    start: section.start ?? section.from * length,
    end: section.end ?? section.to * length,
  });
  return Object.freeze({ id, name, city, width, height, roadWidth, checkpointMargin: 24,
    length, startDistance: 0, checkpoints: Math.max(32, Math.ceil(length / 350)),
    carRadius: 12, carCollisionDistance: 24, carHeight: 9, unitsPerMeter,
    projection, segments: Object.freeze(segments), sourcePoints: Object.freeze(unique),
    sections: Object.freeze(sections.map(normalizeSection)), landmarks: Object.freeze(landmarks),
    metadata: Object.freeze(metadata), trafficSections: Object.freeze(trafficSections.map(normalizeSection)) });
}

/** Road-deck height with flat crowns and smooth entry/exit gradients. A tunnel
 * may use a zero peak when its roof, rather than a depression, provides cover. */
export function roadSurface(track, distance) {
  const s = mod(distance, track.length);
  let elevation = 0, slope = 0, tunnel = false, bridge = false;
  for (const profile of track.elevationProfile || []) {
    if (s < profile.start || s > profile.end) continue;
    const span = profile.end - profile.start, t = clamp((s - profile.start) / span, 0, 1);
    elevation = profile.from + (profile.to - profile.from) * t * t * (3 - 2 * t);
    slope = (profile.to - profile.from) * 6 * t * (1 - t) / span;
    bridge = elevation > 3;
    break;
  }
  for (const section of track.sections || []) {
    const span = mod(section.end - section.start, track.length) || track.length;
    const along = mod(s - section.start, track.length);
    if (along > span) continue;
    tunnel ||= section.type === 'tunnel'; bridge ||= section.type === 'bridge';
    const ramp = Math.min(section.ramp ?? span * .3, span / 2);
    const phase = Math.min(along, span - along) / Math.max(1, ramp);
    const t = clamp(phase, 0, 1), peak = section.peak ?? 0;
    elevation += peak * (t * t * (3 - 2 * t));
    if (phase < 1) slope += peak * 6 * t * (1 - t) / Math.max(1, ramp) * (along < span / 2 ? 1 : -1);
  }
  return { elevation, slope, tunnel, bridge };
}

/** Used once when binding OSM street boundaries to the rounded road. */
export function distanceAlongTrack(track, point) {
  let bestSquared = Infinity, bestS = 0;
  for (const segment of track.segments) {
    let along, x, y;
    if (segment.kind === 'line') {
      const dx = segment.x2 - segment.x1, dy = segment.y2 - segment.y1;
      along = clamp(((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / segment.length, 0, segment.length);
      x = segment.x1 + dx * along / segment.length; y = segment.y1 + dy * along / segment.length;
    } else {
      const radial = Math.atan2(point.y - segment.cy, point.x - segment.cx);
      const turn = mod(segment.direction * (radial - segment.startAngle), TAU);
      if (turn <= Math.abs(segment.sweep)) along = turn * segment.radius;
      else {
        const a = segment.startAngle, b = a + segment.sweep;
        const startDistance = Math.hypot(point.x - segment.cx - Math.cos(a) * segment.radius, point.y - segment.cy - Math.sin(a) * segment.radius);
        const endDistance = Math.hypot(point.x - segment.cx - Math.cos(b) * segment.radius, point.y - segment.cy - Math.sin(b) * segment.radius);
        along = startDistance < endDistance ? 0 : segment.length;
      }
      const angle = segment.startAngle + segment.direction * along / segment.radius;
      x = segment.cx + Math.cos(angle) * segment.radius; y = segment.cy + Math.sin(angle) * segment.radius;
    }
    const squared = (x - point.x) ** 2 + (y - point.y) ** 2;
    if (squared < bestSquared) { bestSquared = squared; bestS = mod(segment.s + along, track.length); }
  }
  return bestS;
}

export function createLondonTrack(map) {
  const projected = projectGeographicRoute(map.route.coordinates, { unitsPerMeter: 6, padding: 1000 });
  const base = createClosedTrack({ id: 'london', name: '伦敦 · 王宫与泰晤士', city: 'London',
    ...projected, roadWidth: 90, radius: 90, simplifyTolerance: 3,
    metadata: { license: map.license, lengthMeters: map.route.lengthMeters, streetNames: map.route.streetNames,
      adaptations: map.route.raceAdaptations, source: map.route.coordinateSource },
    landmarks: map.landmarks || [] });
  const sourceDistances = projected.points.map(point => distanceAlongTrack(base, point));
  sourceDistances[0] = 0;
  // The final repeated source node denotes the end, rather than zero, for ranges.
  sourceDistances[sourceDistances.length - 1] = base.length;
  const streets = map.route.segments.map(segment => ({ ...segment,
    start: sourceDistances[segment.fromIndex], end: sourceDistances[segment.toIndex] }));
  const sections = [];
  for (const street of streets) {
    const type = street.bridge && street.bridge !== 'no' ? 'bridge'
      : street.tunnel && street.tunnel !== 'no' ? 'tunnel' : null;
    if (!type) continue;
    const previous = sections.at(-1);
    if (previous?.type === type && Math.abs(previous.end - street.start) < 1) {
      previous.end = street.end;
      if (street.name.includes('Bridge')) previous.name = street.name;
      previous.wayIds.push(street.wayId);
    } else sections.push({ id: `london-${type}-${sections.length + 1}`, type, name: street.name,
      start: street.start, end: street.end, wayIds: [street.wayId], passage: street.tunnel === 'building_passage',
      adapted: false });
  }
  for (const section of sections) {
    // OSM confirms the structures, not surveyed deck heights. Modest modelled
    // gradients provide the vertical road surface; metadata preserves that limit.
    section.peak = section.type === 'bridge' ? (section.name.includes('Westminster') ? 48 : 66)
      : section.passage ? 0 : -36;
    section.heightSource = 'Modelled deck profile; structure and position from OpenStreetMap';
    section.ramp = Math.min((section.end - section.start) * .3, 420);
  }
  const roads = [];
  for (const street of streets) {
    const previous = roads.at(-1);
    if (previous?.name === street.name && Math.abs(previous.end - street.start) < 1) previous.end = street.end;
    else roads.push({ name: street.name, start: street.start, end: street.end, highway: street.highway });
  }
  const busRoads = new Set(['The Mall', 'Waterloo Bridge', 'Westminster Bridge', 'Birdcage Walk']);
  const trafficSections = roads.filter(road => busRoads.has(road.name) && road.end - road.start > 700)
    .map(road => ({ id: `traffic-${road.name.toLowerCase().replace(/\s/g, '-')}`, name: road.name,
      start: road.start + 100, end: road.end - 100, lane: 27 }));
  return Object.freeze({ ...base, startDistance: 150, sections: Object.freeze(sections.map(Object.freeze)),
    trafficSections: Object.freeze(trafficSections.map(Object.freeze)),
    streets: Object.freeze(streets.map(Object.freeze)), sourceDistances: Object.freeze(sourceDistances) });
}
