/** Shared, DOM-free building geometry. The closed-course clearance is removed
 * from both visible footprints and collision walls, never from physics alone. */
import polygonClipping from 'polygon-clipping';
import { geographicToWorld, pointOnTrack } from './tracks.js';

const hash = n => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return value - Math.floor(value); };
const area = ring => Math.abs(ring.reduce((sum, p, i) => {
  const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;
const multiArea = polygons => polygons.reduce((sum, polygon) => sum + area(polygon[0]) - polygon.slice(1).reduce((holes, ring) => holes + area(ring), 0), 0);
const bounds = ring => ({ minX: Math.min(...ring.map(p => p[0])), minY: Math.min(...ring.map(p => p[1])),
  maxX: Math.max(...ring.map(p => p[0])), maxY: Math.max(...ring.map(p => p[1])) });
const overlaps = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

class GeometryIndex {
  constructor(items, size = 450) {
    this.items = items; this.size = size; this.cells = new Map();
    items.forEach((item, index) => {
      for (const key of this.keys(item.bounds)) {
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(index);
      }
    });
  }
  *keys(box) {
    for (let x = Math.floor(box.minX / this.size); x <= Math.floor(box.maxX / this.size); x++)
      for (let y = Math.floor(box.minY / this.size); y <= Math.floor(box.maxY / this.size); y++) yield `${x},${y}`;
  }
  query(box) {
    const found = new Set();
    for (const key of this.keys(box)) for (const index of this.cells.get(key) || []) found.add(index);
    return [...found].map(index => this.items[index]).filter(item => overlaps(box, item.bounds));
  }
}

function closeRing(points) {
  const ring = points.map(point => Array.isArray(point) ? [point[0], point[1]] : [point.x, point.y]);
  if (ring.length && (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) ring.push([...ring[0]]);
  return ring;
}

function capsule(a, b, radius) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x), ring = [];
  for (let i = 0; i <= 8; i++) {
    const phase = angle - Math.PI / 2 + i * Math.PI / 8;
    ring.push([b.x + Math.cos(phase) * radius, b.y + Math.sin(phase) * radius]);
  }
  for (let i = 0; i <= 8; i++) {
    const phase = angle + Math.PI / 2 + i * Math.PI / 8;
    ring.push([a.x + Math.cos(phase) * radius, a.y + Math.sin(phase) * radius]);
  }
  ring.push([...ring[0]]); return ring;
}

export function createRoadClearance(track, { clearance = track.roadWidth / 2 + 8 } = {}) {
  const pieces = [];
  for (const segment of track.segments) {
    const count = segment.kind === 'line' ? Math.max(1, Math.ceil(segment.length / 400))
      : Math.max(1, Math.ceil(segment.length / 14), Math.ceil(Math.abs(segment.sweep) / .14));
    for (let index = 0; index < count; index++) {
      const a = pointOnTrack(track, segment.s + segment.length * index / count);
      const b = pointOnTrack(track, segment.s + segment.length * (index + 1) / count);
      const middle = pointOnTrack(track, segment.s + segment.length * (index + .5) / count);
      const ring = capsule(a, b, clearance + .1);
      pieces.push({ polygon: [ring], bounds: bounds(ring),
        minHeight: Math.min(a.elevation, b.elevation, middle.elevation) - .5,
        maxHeight: Math.max(a.elevation, b.elevation, middle.elevation) + track.carHeight + 3 });
    }
  }
  return { clearance, pieces, index: new GeometryIndex(pieces) };
}

function footprintParts(polygons) {
  return polygons.filter(polygon => area(polygon[0]) > 2).map(polygon => ({
    outer: polygon[0].map(([x, y]) => ({ x, y })),
    holes: polygon.slice(1).filter(ring => area(ring) > 2).map(ring => ring.map(([x, y]) => ({ x, y }))),
  }));
}

export function clipBuildingFootprint(points, clearance, { minHeight = 0, height = Infinity } = {}) {
  const ring = closeRing(points);
  if (ring.length < 4 || area(ring) < 2) return { parts: [], adjusted: false };
  const clips = clearance.index.query(bounds(ring)).filter(piece => minHeight < piece.maxHeight && height > piece.minHeight);
  const result = clips.length ? polygonClipping.difference([ring], ...clips.map(piece => piece.polygon)) : [[ring]];
  return { parts: footprintParts(result), adjusted: area(ring) - multiArea(result) > .1 };
}

const inside = (point, ring) => {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point.y) !== (b[1] > point.y) && point.x < (b[0] - a[0]) * (point.y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
};

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseFloat(value); return Number.isFinite(parsed) ? parsed : null;
}

/** height is the absolute roof elevation, minHeight is the bottom elevation.
 * Each part's outer/holes rings supply BOTH roof/facade meshes and the emitted
 * solid boundary obstacles. Missing heights are explicitly marked estimated. */
export function buildCityGeometry(map, track, { roadClearance = track.roadWidth / 2 + 8,
  renderDistance = 2400, includeLandmarks = false } = {}) {
  const toWorld = coordinates => coordinates.map(([lon, lat]) => geographicToWorld(track.projection, lon, lat));
  const clearance = createRoadClearance(track, { clearance: roadClearance });
  const landmarkRings = (map.landmarks || []).filter(landmark => landmark.footprint?.length)
    .map(landmark => ({ ring: closeRing(toWorld(landmark.footprint)), id: `${landmark.osmType}/${landmark.osmId}` }));
  const landmarkIds = new Set(landmarkRings.map(landmark => landmark.id));
  const source = [];
  for (const [index, building] of (map.buildings || []).entries()) {
    if (!includeLandmarks && landmarkIds.has(building.id)) continue;
    if (number(building.distanceToRouteMeters) !== null && building.distanceToRouteMeters * track.unitsPerMeter > renderDistance) continue;
    const coordinates = building.coordinates || building.footprint;
    if (!coordinates || coordinates.length < 3) continue;
    const points = toWorld(coordinates), ring = closeRing(points);
    if (area(ring) < 2) continue;
    const center = { x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
    if (!includeLandmarks && landmarkRings.some(landmark => inside(center, landmark.ring))) continue;
    const tags = building.tags || {};
    const measured = number(building.height) ?? number(tags.height);
    const levels = number(building.levels) ?? number(tags['building:levels']);
    const heightMeters = measured ?? (levels !== null ? levels * 3.4 : 14 + hash(index) * 12);
    const floorMeters = number(tags.min_height) ?? ((number(tags['building:min_level']) ?? 0) * 3.4);
    const minHeight = Math.max(0, floorMeters * track.unitsPerMeter);
    const height = Math.max(minHeight + 1, heightMeters * track.unitsPerMeter);
    source.push({ id: building.id, index, ring, bounds: bounds(ring), center, height, minHeight,
      heightEstimated: measured === null, isPart: Boolean(tags['building:part'] && tags['building:part'] !== 'no'), tags });
  }
  const groundParts = new GeometryIndex(source.filter(building => building.isPart && building.minHeight < 1));
  const buildings = [], obstacles = [];
  const stats = { sourceBuildings: map.buildings?.length || 0, renderedBuildings: 0, adjustedBuildings: 0,
    parentFootprintsTrimmed: 0, omittedByClearance: 0, obstacles: 0 };
  for (const building of source) {
    let polygons = [[building.ring]];
    if (!building.isPart) {
      // Preserve detailed ground-level parts instead of rendering a second
      // complete parent volume through them. Elevated parts retain their base.
      const children = groundParts.query(building.bounds).filter(part => {
        if (!inside(part.center, building.ring)) return false;
        const intersection = polygonClipping.intersection([building.ring], [part.ring]);
        return multiArea(intersection) > area(part.ring) * .9;
      });
      if (children.length) {
        polygons = polygonClipping.difference(polygons, ...children.map(part => [part.ring]));
        stats.parentFootprintsTrimmed++;
      }
    }
    const beforeArea = multiArea(polygons);
    const clips = clearance.index.query(building.bounds).filter(piece => building.minHeight < piece.maxHeight && building.height > piece.minHeight);
    if (clips.length && polygons.length) polygons = polygonClipping.difference(polygons, ...clips.map(piece => piece.polygon));
    const adjusted = beforeArea - multiArea(polygons) > .1;
    const parts = footprintParts(polygons);
    if (adjusted) stats.adjustedBuildings++;
    if (!parts.length) { if (adjusted) stats.omittedByClearance++; continue; }
    buildings.push({ id: building.id, index: building.index, height: building.height, minHeight: building.minHeight,
      heightEstimated: building.heightEstimated, adjusted, isPart: building.isPart, tags: building.tags, parts });
    for (const [partIndex, part] of parts.entries()) for (const [ringIndex, ring] of [part.outer, ...part.holes].entries()) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i], b = ring[i + 1], length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length < .05) continue;
        obstacles.push({ id: `building-${building.id}-${partIndex}-${ringIndex}-${i}`, type: 'box',
          x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, halfWidth: length / 2, halfDepth: .35,
          angle: Math.atan2(b.y - a.y, b.x - a.x), minHeight: building.minHeight, maxHeight: building.height });
      }
    }
  }
  stats.renderedBuildings = buildings.length; stats.obstacles = obstacles.length;
  return { buildings, obstacles, stats, roadClearance };
}
