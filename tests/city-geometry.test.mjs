import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildCityGeometry, createRoadClearance, clipBuildingFootprint } from '../city-geometry.js';
import { createClosedTrack, pointOnTrack } from '../tracks.js';
import { RaceEngine, TRACKS, setTrack } from '../engine.js';
import { ObstacleWorld } from '../collisions.js';
import { RaceAI } from '../ai.js';
import londonMap from '../assets/london-map.json' with { type: 'json' };
afterEach(() => setTrack('coast'));

const projection = { longitude: 0, latitude: 0, longitudeMeters: 1, latitudeMeters: 1, unitsPerMeter: 1, offsetX: 0, offsetY: 0 };
const track = createClosedTrack({ id: 'geometry-test', name: 'Geometry test', city: 'Test', projection,
  unitsPerMeter: 1, width: 2000, height: 1800, points: [{ x: 200, y: 200 }, { x: 1600, y: 200 }, { x: 1600, y: 1400 }, { x: 200, y: 1400 }] });
const rectangle = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }, { x: x1, y: y1 }];
const building = (id, points, extra = {}) => ({ id, coordinates: points.map(p => [p.x, -p.y]), height: 30, ...extra });
const ringArea = ring => Math.abs(ring.reduce((sum, p, i) => {
  const q = ring[(i + 1) % ring.length]; return sum + p.x * q.y - q.x * p.y;
}, 0)) / 2;

test('road clearance changes the visible footprint and its collision walls together', () => {
  const geometry = buildCityGeometry({ buildings: [building('straddling-road', rectangle(500, 180, 700, 300))] }, track);
  assert.equal(geometry.buildings.length, 1); assert.equal(geometry.buildings[0].adjusted, true);
  assert.equal(geometry.stats.adjustedBuildings, 1);
  const part = geometry.buildings[0].parts[0];
  assert.ok(part.outer.every(point => point.y >= 253));
  assert.equal(geometry.obstacles.length, part.outer.length - 1);
  for (let i = 0; i < part.outer.length - 1; i++) {
    const a = part.outer[i], b = part.outer[i + 1], wall = geometry.obstacles[i];
    assert.equal(wall.x, (a.x + b.x) / 2); assert.equal(wall.y, (a.y + b.y) / 2);
    assert.equal(wall.minHeight, geometry.buildings[0].minHeight); assert.equal(wall.maxHeight, geometry.buildings[0].height);
  }
  const world = new ObstacleWorld(geometry.obstacles, { carRadius: 12 });
  const car = { x: 600, y: 290, angle: Math.PI / 2, speed: 200, elevation: 0, height: 9 };
  assert.equal(world.resolveCar(car, { x: 600, y: 200 }), 1);
  assert.ok(car.y < 242, 'a real swept car stops at the new visible facade');
});

test('buildings outside the race clearance and overhangs above the car retain their footprint', () => {
  const clearance = createRoadClearance(track);
  for (const [points, floor] of [[rectangle(500, 400, 700, 500), 0], [rectangle(500, 180, 700, 300), 50]]) {
    const clipped = clipBuildingFootprint(points, clearance, { minHeight: floor, height: floor + 30 });
    assert.equal(clipped.adjusted, false); assert.equal(clipped.parts.length, 1);
    assert.deepEqual(clipped.parts[0].outer, points);
  }
  const geometry = buildCityGeometry({ buildings: [building('raised', rectangle(500, 180, 700, 300), { height: 80, tags: { min_height: '50' } })] }, track);
  assert.equal(geometry.buildings[0].minHeight, 50);
  assert.equal(geometry.buildings[0].heightEstimated, false);
  const world = new ObstacleWorld(geometry.obstacles, { carRadius: 12 });
  assert.equal(world.resolveCar({ x: 500, y: 200, speed: 200, angle: 0, elevation: 0, height: 9 }), 0);
  assert.equal(world.resolveCar({ x: 500, y: 200, speed: 200, angle: 0, elevation: 50, height: 9 }), 1);
});

test('ground building parts replace duplicate parent volume while raised details preserve the building below', () => {
  const geometry = buildCityGeometry({ buildings: [
    building('parent', rectangle(400, 500, 600, 700)),
    building('ground-part', rectangle(400, 500, 500, 700), { height: 60, tags: { 'building:part': 'yes' } }),
    building('raised-detail', rectangle(540, 550, 580, 650), { height: 50, tags: { 'building:part': 'yes', min_height: '40' } }),
  ] }, track);
  assert.equal(geometry.stats.parentFootprintsTrimmed, 1);
  const parent = geometry.buildings.find(building => building.id === 'parent');
  assert.equal(parent.parts.reduce((sum, part) => sum + ringArea(part.outer), 0), 20000);
  assert.equal(geometry.buildings.find(building => building.id === 'raised-detail').minHeight, 40);
  assert.ok(parent.parts[0].outer.some(point => point.x === 600), 'base under the raised detail is retained');
});

test('actual London buildings leave physical racing clearance at street, tunnel and bridge levels', () => {
  const geometry = buildCityGeometry(londonMap, TRACKS.london);
  assert.ok(geometry.stats.renderedBuildings > 4000);
  assert.ok(geometry.stats.adjustedBuildings > 0 && geometry.stats.adjustedBuildings < 250);
  assert.ok(geometry.stats.parentFootprintsTrimmed > 100);
  const world = new ObstacleWorld(geometry.obstacles, { carRadius: 12 });
  for (let s = 0; s < TRACKS.london.length; s += 25) for (const lane of [-30, 0, 30]) {
    const p = pointOnTrack(TRACKS.london, s, lane);
    const car = { ...p, speed: 200, height: 9 };
    assert.equal(world.resolveCar(car), 0, `clear road at s=${s}, lane=${lane}, height=${p.elevation}`);
  }
});

test('computer completes London with actual clipped building walls and oncoming buses', () => {
  setTrack('london');
  const geometry = buildCityGeometry(londonMap, TRACKS.london);
  const engine = new RaceEngine({ laps: 1, obstacles: geometry.obstacles }).start(), driver = new RaceAI();
  let impacts = 0, offroad = 0;
  for (let frame = 0; frame < 60 * 260 && !engine.cars[1].finished; frame++) {
    engine.step(1 / 60, driver.update(engine, 1 / 60));
    impacts += engine.cars[1].impact > 0 ? 1 : 0;
    offroad += engine.cars[1].offroad ? 1 : 0;
  }
  assert.equal(engine.cars[1].finished, true); assert.equal(engine.cars[1].lap, 1);
  assert.equal(driver.rescues, 0); assert.equal(impacts, 0); assert.equal(offroad, 0);
});
