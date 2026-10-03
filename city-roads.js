/** DOM-free London road surfaces. Background streets are clipped away from the
 * closed race course; pavements are cut by every nearby street at junctions. */
import ClipperLib from 'clipper-lib';
import { createRoadClearance } from './city-geometry.js';
import { geographicToWorld, distanceAlongTrack, pointOnTrack } from './tracks.js';

// Integer clipping is deliberate: nearly coincident street joins made floating
// sweep-line implementations fail differently in Node and browsers. A unit here
// is 1/6 metre; 0.001 world-unit quantization is well below visible resolution.
const CLIP_SCALE = 1000;
function integerPaths(geometry) {
  if (!geometry?.length) return [];
  const polygons = typeof geometry[0]?.[0]?.[0] === 'number' ? [geometry] : geometry;
  const paths = [];
  for (const polygon of polygons) for (let i=0;i<polygon.length;i++) {
    const path = polygon[i].map(([x,y])=>({X:Math.round(x*CLIP_SCALE),Y:Math.round(y*CLIP_SCALE)}));
    if(path.length<3)continue;
    const signed=ClipperLib.Clipper.Area(path);
    if(Math.abs(signed)<1)continue;
    if((i===0&&signed<0)||(i>0&&signed>0))path.reverse();
    paths.push(path);
  }
  return paths;
}
function integerBoolean(operation, first, ...others) {
  const subject=integerPaths(first),clips=others.flatMap(integerPaths);
  if(!subject.length){const remaining=others.filter(geometry=>geometry?.length);return operation==='union'&&remaining.length?integerBoolean('union',remaining[0],...remaining.slice(1)):[];}
  const clipper=new ClipperLib.Clipper();clipper.StrictlySimple=true;
  clipper.AddPaths(operation==='union'?[...subject,...clips]:subject,ClipperLib.PolyType.ptSubject,true);
  if(operation!=='union'&&clips.length)clipper.AddPaths(clips,ClipperLib.PolyType.ptClip,true);
  if(operation==='intersection'&&!clips.length)return [];
  const tree=new ClipperLib.PolyTree();
  clipper.Execute({union:ClipperLib.ClipType.ctUnion,difference:ClipperLib.ClipType.ctDifference,intersection:ClipperLib.ClipType.ctIntersection}[operation],tree,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);
  const polygons=[],convert=node=>{const ring=node.Contour().map(p=>[p.X/CLIP_SCALE,p.Y/CLIP_SCALE]);if(ring.length)ring.push([...ring[0]]);return ring;};
  const visit=node=>{for(const child of node.Childs()){
    if(!child.IsHole()){const outer=convert(child);if(outer.length>=4)polygons.push([outer,...child.Childs().filter(h=>h.IsHole()).map(convert)]);}
    visit(child);
  }};visit(tree);return polygons;
}
const polygonClipping={
  union:(first,...rest)=>integerBoolean('union',first,...rest),
  difference:(first,...rest)=>integerBoolean('difference',first,...rest),
  intersection:(first,...rest)=>integerBoolean('intersection',first,...rest),
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const bounds = ring => ({ minX: Math.min(...ring.map(p => p[0])), minY: Math.min(...ring.map(p => p[1])), maxX: Math.max(...ring.map(p => p[0])), maxY: Math.max(...ring.map(p => p[1])) });
const around = (p, radius) => ({ minX: p.x - radius, minY: p.y - radius, maxX: p.x + radius, maxY: p.y + radius });
const overlaps = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
const area = ring => Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const rounded = n => Math.round(n * 1e3) / 1e3;
const coordinate = (x, y) => [rounded(x), rounded(y)];

class SpatialIndex {
  constructor(items, cellSize = 300) {
    this.items = items; this.cellSize = cellSize; this.cells = new Map();
    items.forEach((item, index) => { for (const key of this.keys(item.bounds)) {
      if (!this.cells.has(key)) this.cells.set(key, []); this.cells.get(key).push(index);
    } });
  }
  *keys(box) { for (let x = Math.floor(box.minX / this.cellSize); x <= Math.floor(box.maxX / this.cellSize); x++)
    for (let y = Math.floor(box.minY / this.cellSize); y <= Math.floor(box.maxY / this.cellSize); y++) yield `${x},${y}`; }
  query(box) { const found = new Set(); for (const key of this.keys(box)) for (const id of this.cells.get(key) || []) found.add(id);
    return [...found].map(id => this.items[id]).filter(item => overlaps(box, item.bounds)); }
}

function capsule(a, b, radius) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x), ring = [];
  for (let i = 0; i <= 8; i++) { const phase = angle - Math.PI / 2 + i * Math.PI / 8; ring.push(coordinate(b.x + Math.cos(phase) * radius, b.y + Math.sin(phase) * radius)); }
  for (let i = 0; i <= 8; i++) { const phase = angle + Math.PI / 2 + i * Math.PI / 8; ring.push(coordinate(a.x + Math.cos(phase) * radius, a.y + Math.sin(phase) * radius)); }
  ring.push([...ring[0]]); return ring;
}

/** A union of bounded capsules gives round joins without offset-line spikes.
 * Duplicate vertices and reversals are safe, unlike a naive normal ribbon. */
export function bufferRoadPolyline(points, width) {
  if (!(width > 0) || !Number.isFinite(width)) throw new TypeError('Road width must be positive and finite.');
  const parts = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) throw new TypeError('Road vertices must be finite.');
    if (Math.hypot(b.x - a.x, b.y - a.y) < .01) continue;
    parts.push([capsule(a, b, width / 2)]);
  }
  return parts.length ? polygonClipping.union(...parts) : [];
}

function surfaces(polygons, id, height) {
  return polygons.filter(rings => area(rings[0]) > 1).map((rings, index) => ({ id: `${id}-${index}`, height,
    outer: rings[0].map(([x, y]) => ({ x, y })), holes: rings.slice(1).filter(ring => area(ring) > 1).map(ring => ring.map(([x, y]) => ({ x, y }))) }));
}
function widthForRoad(road, scale) {
  const tags = road.tags || {}, measured = Number.parseFloat(tags.width), lanes = Number.parseFloat(tags.lanes);
  if (measured > 0) return clamp(measured * scale, 2.5 * scale, 18 * scale);
  if (['pedestrian', 'footway', 'path', 'cycleway'].includes(tags.highway)) return 3 * scale;
  if (lanes > 0) return clamp(lanes * 3.1 * scale, 4 * scale, 18 * scale);
  return (['trunk', 'primary', 'secondary'].includes(tags.highway) ? 11 : 7) * scale;
}
function gradeSeparated(tags = {}) {
  return Boolean((tags.tunnel && tags.tunnel !== 'no') || (tags.bridge && tags.bridge !== 'no') || (Number(tags.layer) || 0) !== 0);
}
function nearestExact(track, point) {
  const s = distanceAlongTrack(track, point), p = pointOnTrack(track, s);
  return { ...p, distance: Math.hypot(point.x - p.x, point.y - p.y) };
}
function interpolated(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }

function courseIndex(track) {
  const pieces = [];
  for (let s = 0; s < track.length; s += 16) {
    const a = pointOnTrack(track, s), b = pointOnTrack(track, Math.min(s + 16, track.length));
    pieces.push({ a, b, s, length: Math.min(16, track.length - s), bounds: bounds([[a.x, a.y], [b.x, b.y]]) });
  }
  const index = new SpatialIndex(pieces, 200);
  return { index, project(point, radius) {
    let best = null;
    for (const line of index.query(around(point, radius))) {
      const dx = line.b.x - line.a.x, dy = line.b.y - line.a.y;
      const t = clamp(((point.x - line.a.x) * dx + (point.y - line.a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      const p = interpolated(line.a, line.b, t), distance = Math.hypot(point.x - p.x, point.y - p.y);
      if (!best || distance < best.distance) best = { ...p, distance, s: (line.s + t * line.length) % track.length };
    }
    return best;
  } };
}

/** Return { backgroundRoadSurfaces, sidewalkSurfaces, branchClosures, stats }.
 * Surfaces have {id,outer:[{x,y}],holes:[ring],height}. Closure endpoints a/b
 * give the barrier long axis, angle in x/y, elevation in world units. */
export function createRoadStudy(map, track, { renderDistanceMeters = 150, courseMargin = 12, sidewalkWidth = 8, closureMargin = 8 } = {}) {
  const scale = track.unitsPerMeter || 6, renderDistance = renderDistanceMeters * scale;
  const corridor = createRoadClearance(track, { clearance: track.roadWidth / 2 + courseMargin });
  const tunnelCuts=createTunnelOpenings(track).map(surface=>{const polygon=[surface.outer,...surface.holes].map(ring=>ring.map(p=>[p.x,p.y]));return {polygon,bounds:bounds(polygon[0])};});
  const course = courseIndex(track), roads = [], stats = { sourceRoads: map.roads?.length || 0, visibleRoads: 0, clippedRoads: 0, skippedLayers: 0, branchClosures: 0 };
  for (const road of map.roads || []) {
    if (gradeSeparated(road.tags) || road.tags?.highway === 'steps') { stats.skippedLayers++; continue; }
    const points = (road.coordinates || []).map(p => geographicToWorld(track.projection, ...p));
    if (points.length < 2) continue;
    const width = widthForRoad(road, scale), runs = []; let run = [];
    // Splitting long source edges bounds the scene to the visible route corridor.
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 150));
      for (let step = 0; step < count; step++) {
        const from = interpolated(a, b, step / count), to = interpolated(a, b, (step + 1) / count), middle = interpolated(from, to, .5);
        const near = course.project(middle, renderDistance + 100);
        if (near && near.distance <= renderDistance + width / 2) { if (!run.length) run.push(from); run.push(to); }
        else if (run.length) { runs.push(run); run = []; }
      }
    }
    if (run.length) runs.push(run);
    if (!runs.length) continue;
    stats.visibleRoads++;
    for (const [runIndex, points] of runs.entries()) {
      const asphalt = bufferRoadPolyline(points, width), pavement = bufferRoadPolyline(points, width + sidewalkWidth * 2);
      for (const [partIndex, polygon] of asphalt.entries()) {
        roads.push({ id: `${road.id}-${runIndex}-${partIndex}`, sourceId: road.id, points, width, polygon, bounds: bounds(polygon[0]), pavement, tags: road.tags || {} });
      }
    }
  }
  const roadIndex = new SpatialIndex(roads), backgroundRoadSurfaces = [], sidewalkSurfaces = [], branchClosures = [];
  for (const road of roads) {
    const clips = corridor.index.query(bounds(road.pavement.flat(2))).filter(piece => piece.minHeight <= .5 && piece.maxHeight >= 0).map(piece => piece.polygon);
    // Even a deep tunnel needs its surface layers cut: retaining those layers
    // made the chase camera pass through a false ceiling at both ramp mouths.
    clips.push(...tunnelCuts.filter(cut=>overlaps(cut.bounds,bounds(road.pavement.flat(2)))).map(cut=>cut.polygon));
    const asphalt = clips.length ? polygonClipping.difference(road.polygon, ...clips) : [road.polygon];
    if (clips.length) stats.clippedRoads++;
    backgroundRoadSurfaces.push(...surfaces(asphalt, road.id, .10));
    const neighbors = roadIndex.query(bounds(road.pavement.flat(2))).map(item => item.polygon);
    const pavement = polygonClipping.difference(road.pavement, ...neighbors, ...clips);
    sidewalkSurfaces.push(...surfaces(pavement, `${road.id}-pavement`, .16));

    // A branch barrier is outside even the car's widest normal racing line.
    // Sample centerline exits rather than source-way IDs: a racing way can have
    // an unused continuation at exactly the junction players tend to misread.
    const barrierLength = road.width + 6, safeDistance = track.roadWidth / 2 + closureMargin;
    const targetDistance = safeDistance + barrierLength / 2;
    const touchesCourse = road.points.some((p, i) => {
      if (!i) return (course.project(p, track.roadWidth)?.distance ?? Infinity) < track.roadWidth / 2 + 2;
      const a = road.points[i - 1], steps = Math.max(1, Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) / 20));
      for (let j = 0; j <= steps; j++) if ((course.project(interpolated(a, p, j / steps), track.roadWidth)?.distance ?? Infinity) < track.roadWidth / 2 + 2) return true;
      return false;
    });
    if (!touchesCourse) continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i], distance = Math.hypot(b.x - a.x, b.y - a.y);
      if (distance < .01) continue;
      const count = Math.max(1, Math.ceil(distance / 14));
      let previous = a, previousProjection = course.project(previous, targetDistance + 30);
      for (let k = 1; k <= count; k++) {
        const current = interpolated(a, b, k / count), projection = course.project(current, targetDistance + 30);
        const d0 = previousProjection?.distance ?? Infinity, d1 = projection?.distance ?? Infinity;
        if ((d0 < targetDistance && d1 >= targetDistance) || (d1 < targetDistance && d0 >= targetDistance)) {
          let low = previous, high = current;
          if (d0 >= targetDistance) [low, high] = [high, low];
          for (let pass = 0; pass < 10; pass++) { const middle = interpolated(low, high, .5); const p = course.project(middle, targetDistance + 30);
            if (p && p.distance < targetDistance) low = middle; else high = middle; }
          const center = interpolated(low, high, .5), nearest = nearestExact(track, center);
          const alongX = (b.x - a.x) / distance, alongY = (b.y - a.y) / distance;
          const tangentDot = Math.abs(alongX * Math.cos(nearest.angle) + alongY * Math.sin(nearest.angle));
          const endA = { x: center.x - alongY * barrierLength / 2, y: center.y + alongX * barrierLength / 2 };
          const endB = { x: center.x + alongY * barrierLength / 2, y: center.y - alongX * barrierLength / 2 };
          const protectedCourse = nearest.tunnel || nearest.bridge || Math.abs(nearest.elevation) > .5;
          const duplicate = branchClosures.some(item => Math.hypot(item.x - center.x, item.y - center.y) < 40);
          const clear = !protectedCourse && !duplicate && tangentDot < .91 && Array.from({ length: 13 }, (_, j) => interpolated(endA, endB, j / 12)).every(p => nearestExact(track, p).distance >= safeDistance - .2);
          if (clear) branchClosures.push({ id: `branch-${road.id}-${i}-${k}`, sourceId: road.sourceId, a: endA, b: endB,
            x: center.x, y: center.y, angle: Math.atan2(endB.y - endA.y, endB.x - endA.x), length: barrierLength,
            elevation: 0, s: nearest.s, side: Math.sign((center.x - nearest.x) * -Math.sin(nearest.angle) + (center.y - nearest.y) * Math.cos(nearest.angle)) });
        }
        previous = current; previousProjection = projection;
      }
    }
  }
  stats.branchClosures = branchClosures.length;
  return { backgroundRoadSurfaces, sidewalkSurfaces, branchClosures, stats };
}

/** Main-road guide width narrows through the mapped central Admiralty arch. */
export function courseGuideHalfWidth(track, distance) {
  let half = track.roadWidth / 2 - 2;
  const passage = (track.sections || []).find(section => section.passage && distance >= section.start - 190 && distance <= section.end + 120);
  if (passage) {
    const blend = Math.min(clamp((distance - passage.start + 190) / 150, 0, 1), clamp((passage.end + 120 - distance) / 80, 0, 1));
    half += (18 - half) * blend;
  }
  return half;
}

function trackSamples(track, start, end, step = 8) {
  const distances = new Set([start, end]);
  for (let s = Math.ceil(start / step) * step; s < end; s += step) distances.add(s);
  // Keep short line/arc joins that would otherwise lie between both grid samples.
  for (const segment of track.segments) for (const s of [segment.s, segment.s + segment.length]) if (s > start && s < end) distances.add(s);
  return [...distances].sort((a, b) => a - b).map(s => ({ ...pointOnTrack(track, s), sampleS: s }));
}

function varyingBuffer(points, radiusAt) {
  const pieces = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (Math.hypot(b.x - a.x, b.y - a.y) < .01) continue;
    const angle = Math.atan2(b.y - a.y, b.x - a.x), ring = [], radiusA = radiusAt(a), radiusB = radiusAt(b);
    for (let j = 0; j <= 8; j++) { const phase = angle - Math.PI / 2 + j * Math.PI / 8; ring.push(coordinate(b.x + Math.cos(phase) * radiusB, b.y + Math.sin(phase) * radiusB)); }
    for (let j = 0; j <= 8; j++) { const phase = angle + Math.PI / 2 + j * Math.PI / 8; ring.push(coordinate(a.x + Math.cos(phase) * radiusA, a.y + Math.sin(phase) * radiusA)); }
    ring.push([...ring[0]]); pieces.push([ring]);
  }
  return pieces.length ? polygonClipping.union(...pieces) : [];
}

function endpointCut(point, forward, reach) {
  const tangent = { x: Math.cos(point.angle), y: Math.sin(point.angle) }, normal = { x: -tangent.y, y: tangent.x };
  const convert = (x, y) => coordinate(point.x + tangent.x * x + normal.x * y, point.y + tangent.y * x + normal.y * y);
  const ring = [convert(0, -reach), convert(forward * reach, -reach), convert(forward * reach, reach), convert(0, reach)];
  ring.push([...ring[0]]); return [ring];
}

/** Round-buffer surfaces for the main ground-level course. Taking differences
 * of whole footprints, rather than offsetting a ribbon, keeps the inner kerb
 * and painted edge from folding across tight corners (radius < road width/2).
 * Bridges/tunnels retain their original 3D samples and road-deck elevations. */
export function createCourseRoadStudy(track) {
  const elevated = (track.sections || []).filter(section => !section.passage && Math.abs(section.peak || 0) > .001).sort((a, b) => a.start - b.start);
  const elevatedPaths = elevated.map(section => ({ id: section.id, points: trackSamples(track, section.start, section.end) }));
  const ranges = []; let start = 0;
  for (const section of elevated) { if (section.start > start) ranges.push({ start, end: section.start }); start = Math.max(start, section.end); }
  if (start < track.length) ranges.push({ start, end: track.length });
  const runs = ranges.map(range => ({ ...range, points: trackSamples(track, range.start, range.end) }));
  if (runs.length > 1 && runs[0].start === 0 && runs.at(-1).end === track.length) {
    const first = runs.shift(), last = runs.pop();
    runs.push({ start: last.start, end: first.end, points: [...last.points, ...first.points.slice(1)] });
  }
  const flatAsphaltSurfaces = [], flatPavementSurfaces = [], flatKerbSurfaces = [], flatGuideSurfaces = [], pedestrianSurfaces = [];
  const asphaltPolygons = [];
  for (const [index, run] of runs.entries()) {
    const points = run.points, closed = !elevated.length;
    const cuts = closed ? [] : [endpointCut(points[0], -1, track.roadWidth * 2), endpointCut(points.at(-1), 1, track.roadWidth * 2)];
    const crop = polygons => cuts.length ? polygonClipping.difference(polygons, ...cuts) : polygons;
    const asphalt = crop(bufferRoadPolyline(points, track.roadWidth));
    const pavement = crop(bufferRoadPolyline(points, track.roadWidth + 18));
    const kerbOutside = crop(bufferRoadPolyline(points, track.roadWidth + 4));
    const guideOutside = crop(varyingBuffer(points, p => courseGuideHalfWidth(track, p.s) + .625));
    const guideInside = crop(varyingBuffer(points, p => courseGuideHalfWidth(track, p.s) - .625));
    const kerb = polygonClipping.difference(kerbOutside, asphalt);
    const guide = polygonClipping.difference(guideOutside, guideInside);
    asphaltPolygons.push(...asphalt);
    flatAsphaltSurfaces.push(...surfaces(asphalt, `course-${index}`, .4));
    flatPavementSurfaces.push(...surfaces(pavement, `course-pavement-${index}`, .25));
    flatKerbSurfaces.push(...surfaces(kerb, `course-kerb-${index}`, .6));
    flatGuideSurfaces.push(...surfaces(guide, `course-guide-${index}`, .48));
  }
  for (const [index, street] of (track.streets || []).filter(street => street.highway === 'pedestrian').entries()) {
    if (!(street.end > street.start)) continue;
    const polygon = bufferRoadPolyline(trackSamples(track, street.start, street.end), track.roadWidth);
    const clipped = polygonClipping.intersection(polygon, asphaltPolygons);
    pedestrianSurfaces.push(...surfaces(clipped, `course-pedestrian-${index}`, .42));
  }
  return { flatAsphaltSurfaces, flatPavementSurfaces, flatKerbSurfaces, flatGuideSurfaces, pedestrianSurfaces, elevatedPaths };
}

export function tunnelCoveredRange(section) {
  const ramp = section.ramp ?? (section.end - section.start) * .3;
  return { start: section.start + ramp * .85, end: section.end - ramp * .85, clearance: 26, thickness: 4 };
}

/** Shared opening cuts remove every street/paving/park layer above the lowered
 * road, not only the large terrain plane. The covered volume supplies its roof. */
export function createTunnelOpenings(track) {
  return (track.sections || []).filter(section => section.type === 'tunnel' && !section.passage).flatMap(section => {
    const covered=tunnelCoveredRange(section),entryPoints=trackSamples(track,section.start,covered.start),exitPoints=trackSamples(track,covered.end,section.end);
    const entry=polygonClipping.difference(bufferRoadPolyline(entryPoints,track.roadWidth+14),endpointCut(entryPoints.at(-1),1,track.roadWidth*2));
    const exit=polygonClipping.difference(bufferRoadPolyline(exitPoints,track.roadWidth+14),endpointCut(exitPoints[0],-1,track.roadWidth*2));
    return [...surfaces(entry,`tunnel-entry-${section.id}`,0),...surfaces(exit,`tunnel-exit-${section.id}`,0)];
  });
}

export function subtractGroundFootprints(points, footprints) {
  const subject = [points.map(p => [p.x, p.y])];
  const cuts = footprints.map(surface => [surface.outer, ...(surface.holes || [])].map(ring => ring.map(p => [p.x, p.y])));
  return surfaces(polygonClipping.difference(subject, ...cuts), 'ground-cut', 0);
}

/** Closed, welded strips follow both the curve and grade. Unlike adjacent
 * horizontal boxes, they have no stair-step seams admitting daylight. */
function sweptSolid(points, sectionAt) {
  const positions = [], indices = [];
  for (const point of points) {
    const { left, right, bottom, top } = sectionAt(point);
    for (const [lane, height] of [[left,bottom],[right,bottom],[right,top],[left,top]])
      positions.push(point.x - Math.sin(point.angle) * lane, height, point.y + Math.cos(point.angle) * lane);
  }
  for (let i=1;i<points.length;i++) for (let side=0;side<4;side++) {
    const a=(i-1)*4+side,b=i*4+side,c=i*4+(side+1)%4,d=(i-1)*4+(side+1)%4;
    indices.push(a,b,c,a,c,d);
  }
  const last=(points.length-1)*4;
  indices.push(0,1,2,0,2,3,last,last+2,last+1,last,last+3,last+2);
  return { positions, indices };
}

export function createTunnelStudy(track) {
  const sections = [];
  for (const section of (track.sections || []).filter(section => section.type === 'tunnel' && !section.passage)) {
    const covered = tunnelCoveredRange(section), distances = new Set(trackSamples(track,section.start,section.end).map(p=>p.sampleS));
    distances.add(covered.start);distances.add(covered.end);
    const points=[...distances].sort((a,b)=>a-b).map(s=>({...pointOnTrack(track,s),sampleS:s}));
    const isCovered=p=>p.sampleS>=covered.start-.001&&p.sampleS<=covered.end+.001;
    const wallTop=p=>isCovered(p)?Math.max(2,p.elevation+covered.clearance+covered.thickness):2;
    const wallLane=track.roadWidth/2+4, wallHalfThickness=4, meshes=[],obstacles=[];
    for(const side of [-1,1]) {
      meshes.push({id:`tunnel-wall-${section.id}-${side}`,kind:'wall',...sweptSolid(points,p=>({left:side*wallLane-wallHalfThickness,right:side*wallLane+wallHalfThickness,bottom:p.elevation-1,top:wallTop(p)}))});
      for(let i=1;i<points.length;i++) {
        const pa=points[i-1],pb=points[i],a=pointOnTrack(track,pa.s,side*wallLane),b=pointOnTrack(track,pb.s,side*wallLane);
        const length=Math.hypot(b.x-a.x,b.y-a.y);if(length<.001)continue;
        obstacles.push({id:`wall-${section.id}-${pa.sampleS}-${side}`,type:'box',x:(a.x+b.x)/2,y:(a.y+b.y)/2,halfWidth:length/2+.08,halfDepth:wallHalfThickness,
          angle:Math.atan2(b.y-a.y,b.x-a.x),minHeight:Math.min(pa.elevation,pb.elevation)-1,maxHeight:Math.max(wallTop(pa),wallTop(pb))});
      }
    }
    const roofPoints=trackSamples(track,covered.start,covered.end);
    meshes.push({id:`tunnel-roof-${section.id}`,kind:'roof',...sweptSolid(roofPoints,p=>({left:-wallLane-wallHalfThickness,right:wallLane+wallHalfThickness,
      bottom:p.elevation+covered.clearance,top:p.elevation+covered.clearance+covered.thickness}))});
    for(let i=1;i<roofPoints.length;i++) {
      const a=roofPoints[i-1],b=roofPoints[i],length=Math.hypot(b.x-a.x,b.y-a.y);if(length<.001)continue;
      obstacles.push({id:`roof-${section.id}-${a.sampleS}`,type:'box',x:(a.x+b.x)/2,y:(a.y+b.y)/2,halfWidth:length/2+.08,halfDepth:wallLane+wallHalfThickness,
        angle:Math.atan2(b.y-a.y,b.x-a.x),minHeight:Math.min(a.elevation,b.elevation)+covered.clearance,maxHeight:Math.max(a.elevation,b.elevation)+covered.clearance+covered.thickness});
    }
    // The lintel fills the soil face ABOVE the clear driving aperture. There is
    // no end cap at car height and no ground plane across the approach ramp.
    for(const [name,from,to] of [['entry',covered.start,covered.start+5],['exit',covered.end-5,covered.end]]){
      const portalPoints=trackSamples(track,from,to);
      meshes.push({id:`tunnel-portal-${section.id}-${name}`,kind:'portal',...sweptSolid(portalPoints,p=>({left:-wallLane-wallHalfThickness,right:wallLane+wallHalfThickness,bottom:p.elevation+covered.clearance,top:2}))});
      const a=portalPoints[0],b=portalPoints.at(-1);
      obstacles.push({id:`portal-${section.id}-${name}`,type:'box',x:(a.x+b.x)/2,y:(a.y+b.y)/2,halfWidth:Math.hypot(b.x-a.x,b.y-a.y)/2+.08,halfDepth:wallLane+wallHalfThickness,
        angle:Math.atan2(b.y-a.y,b.x-a.x),minHeight:Math.min(a.elevation,b.elevation)+covered.clearance,maxHeight:2});
    }
    const lamps=[];for(let s=covered.start+45;s<covered.end;s+=90){const p=pointOnTrack(track,s);lamps.push({...p,height:p.elevation+24.5});}
    sections.push({id:section.id,section,covered,meshes,obstacles,lamps});
  }
  return {openings:createTunnelOpenings(track),sections};
}
