import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { RaceEngine, TRACK, TRACKS, setTrack, trackPoint, projectTrack, mod } from '../engine.js';
import { geographicToWorld, roadSurface } from '../tracks.js';
import londonMap from '../assets/london-map.json' with { type: 'json' };
import { RaceAI } from '../ai.js';
afterEach(() => setTrack('coast'));
const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);

test('London uses surveyed OSM roads at a uniform six units per metre and a closed circuit', () => {
  setTrack('london');
  assert.equal(TRACK.id, 'london'); assert.equal(TRACK.unitsPerMeter, 6);
  assert.ok(TRACK.length / 6 > 6800 && TRACK.length / 6 < 7050);
  assert.ok(TRACK.metadata.streetNames.includes('Gerrard Street'));
  for (const distance of [0, 1, TRACK.length - 1, TRACK.length, TRACK.length + 1]) {
    const p = trackPoint(distance), q = projectTrack(p.x, p.y, p.s);
    near(mod(q.s - p.s + TRACK.length / 2, TRACK.length) - TRACK.length / 2, 0);
  }
  let worstRoadDeviation = 0;
  for (const [longitude, latitude] of londonMap.route.coordinates) {
    const point = geographicToWorld(TRACK.projection, longitude, latitude);
    worstRoadDeviation = Math.max(worstRoadDeviation, projectTrack(point.x, point.y).distance / 6);
  }
  assert.ok(worstRoadDeviation < 10, `road rounding remains within the real junctions: ${worstRoadDeviation} metres`);
  for (const segment of TRACK.segments) {
    const a = trackPoint(segment.s - 1e-5), b = trackPoint(segment.s + 1e-5);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < .00003);
    assert.ok(Math.abs(Math.atan2(Math.sin(a.angle - b.angle), Math.cos(a.angle - b.angle))) < .016);
  }
});

test('track selection resets cars, traffic and old scenery while preserving chosen laps', () => {
  const engine = new RaceEngine({ laps: 5, obstacles: [{ type: 'circle', x: 300, y: 300, radius: 20 }] });
  engine.start(); engine.selectTrack('london');
  assert.equal(TRACK, TRACKS.london); assert.equal(engine.laps, 5); assert.equal(engine.state, 'menu');
  assert.equal(engine.obstacleWorld.obstacles.length, 0); assert.equal(engine.obstacleWorld.carRadius, 12);
  assert.ok(engine.traffic.length >= 3); assert.equal(engine.time, 0);
  near(projectTrack(engine.cars[0].x, engine.cars[0].y).offset, -18);
  near(projectTrack(engine.cars[1].x, engine.cars[1].y).offset, 22);
  engine.selectTrack('coast');
  assert.equal(TRACK.id, 'coast'); assert.equal(engine.traffic.length, 0);
  assert.equal(engine.obstacleWorld.carRadius, 21); assert.equal(engine.laps, 5);
  assert.throws(() => engine.selectTrack('missing-city'), RangeError);
});

test('OSM bridges and underpass receive continuous matching road elevations and gradients', () => {
  setTrack('london');
  assert.equal(TRACK.sections.filter(section => section.type === 'bridge').length, 2);
  assert.equal(TRACK.sections.filter(section => section.type === 'tunnel' && !section.passage).length, 1);
  for (const section of TRACK.sections) {
    const middle = (section.start + section.end) / 2;
    const surface = trackPoint(middle);
    near(surface.elevation, section.peak); near(surface.slope, 0);
    assert.equal(surface[section.type], true);
    for (const edge of [section.start, section.end]) {
      near(trackPoint(edge).elevation, 0);
      near(trackPoint(edge).slope, 0);
      assert.ok(Math.abs(trackPoint(edge - .01).elevation - trackPoint(edge + .01).elevation) < .001);
    }
    const rising = section.start + section.ramp / 2;
    const numericSlope = (roadSurface(TRACK, rising + .001).elevation - roadSurface(TRACK, rising - .001).elevation) / .002;
    near(trackPoint(rising).slope, numericSlope);
  }
});

test('elevated cars follow the bridge deck and slopes gently affect acceleration', () => {
  setTrack('london');
  const bridge = TRACK.sections.find(section => section.type === 'bridge');
  const speeds = [];
  for (const s of [bridge.start + bridge.ramp / 2, bridge.end - bridge.ramp / 2]) {
    const engine = new RaceEngine(); engine.state = 'racing';
    const car = engine.cars[0], p = trackPoint(s, -18);
    Object.assign(car, { x: p.x, y: p.y, angle: p.angle, speed: 200, _lastTrackS: p.s, _lastX: p.x, _lastY: p.y });
    engine.step(1 / 120, new Set(['KeyW']));
    const actual = projectTrack(car.x, car.y, car._lastTrackS);
    near(car.elevation, actual.elevation); near(car.slope, actual.slope);
    assert.ok(car.elevation > 0); speeds.push(car.speed);
  }
  assert.ok(speeds[1] > speeds[0], 'same throttle gains slightly more speed downhill');
  assert.ok(speeds[1] - speeds[0] < 1, 'slope adjustment remains subtle');
});

test('buses use oncoming main-road lanes, freeze on pause and cannot overlap a player', () => {
  setTrack('london');
  const engine = new RaceEngine(); engine.state = 'racing';
  const bus = engine.traffic[0], oldS = bus.s;
  const forward = trackPoint(bus.s).angle;
  assert.ok(Math.cos(bus.angle - forward) < -.999);
  assert.ok(bus.lane > 0); assert.equal(bus.length / TRACK.unitsPerMeter, 11);
  engine.step(.1);
  assert.ok(mod(oldS - bus.s, TRACK.length) > 0);
  engine.pause(); const frozen = structuredClone(engine.traffic);
  engine.step(.1); assert.deepEqual(engine.traffic, frozen); engine.resume();
  const car = engine.cars[0], distance = bus.length / 2 + TRACK.carRadius + 15;
  Object.assign(car, { x: bus.x + Math.cos(bus.angle) * distance, y: bus.y + Math.sin(bus.angle) * distance,
    angle: bus.angle + Math.PI, speed: 200, elevation: bus.elevation, _lastTrackS: bus.s });
  let impact = false;
  for (let frame = 0; frame < 120; frame++) {
    engine.step(1 / 120, new Set(['KeyW'])); impact ||= car.impact > 0;
    const dx = car.x - bus.x, dy = car.y - bus.y;
    const x = dx * Math.cos(bus.angle) + dy * Math.sin(bus.angle);
    const y = -dx * Math.sin(bus.angle) + dy * Math.cos(bus.angle);
    assert.ok(Math.hypot(Math.max(0, Math.abs(x) - bus.length / 2), Math.max(0, Math.abs(y) - bus.width / 2)) >= TRACK.carRadius - .01);
  }
  assert.equal(impact, true);
});

for (const hz of [30, 120]) {
  test(`computer drives every London checkpoint, both bridges and the real underpass at ${hz} Hz`, () => {
    setTrack('london');
    const engine = new RaceEngine({ laps: 1 }).start(), driver = new RaceAI();
    let impacts = 0, offroad = 0, highest = 0, lowest = 0;
    const seenSections = new Set();
    for (let frame = 0; frame < hz * 260 && !engine.cars[1].finished; frame++) {
      engine.step(1 / hz, driver.update(engine, 1 / hz));
      const car = engine.cars[1];
      impacts += car.impact > 0 ? 1 : 0; offroad += car.offroad ? 1 : 0;
      highest = Math.max(highest, car.elevation); lowest = Math.min(lowest, car.elevation);
      for (const section of TRACK.sections) if (car._lastTrackS >= section.start && car._lastTrackS <= section.end) seenSections.add(section.id);
    }
    assert.equal(engine.cars[1].finished, true); assert.equal(engine.cars[1].lap, 1);
    assert.equal(engine.state, 'racing', 'human is still allowed to finish after the AI');
    assert.equal(engine.winner.id, 2); assert.equal(driver.rescues, 0);
    assert.equal(impacts, 0); assert.equal(offroad, 0);
    near(highest, 66); near(lowest, -36);
    assert.equal(seenSections.size, TRACK.sections.length);
    assert.ok(engine.cars[1].lastLap > 150 && engine.cars[1].lastLap < 230);
  });
}
