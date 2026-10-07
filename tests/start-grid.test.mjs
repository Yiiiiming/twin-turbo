import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceEngine, TRACK, trackPoint, projectTrack, mod, GRID_HANDICAP_SECONDS } from '../engine.js';

const near = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected} (±${tolerance})`);
const relativeS = value => mod(value - TRACK.startDistance + TRACK.length / 2, TRACK.length) - TRACK.length / 2;
const firstCorner = TRACK.segments.find(segment => segment.kind === 'arc');
const cornerExit = firstCorner.s + firstCorner.length;

// Integrate the real analytic road's lane length, including the wrapped grid
// straight. This measures a driver holding their starting lane, not a racing
// line that may change lanes or use a different speed through the corner.
function laneLength(from, to, lane) {
  let length = 0;
  for (let lap = Math.floor(from / TRACK.length); lap <= Math.floor(to / TRACK.length); lap++) {
    for (const segment of TRACK.segments) {
      const a = Math.max(from, segment.s + lap * TRACK.length);
      const b = Math.min(to, segment.s + segment.length + lap * TRACK.length);
      if (b > a) length += (b - a) * (segment.kind === 'arc' ? 1 - segment.direction * lane / segment.radius : 1);
    }
  }
  return length;
}
function moveLane(s, distance, lane) {
  let next = s;
  while (distance > 1e-8) {
    const wrapped = mod(next, TRACK.length);
    const segment = TRACK.segments.find(value => wrapped < value.s + value.length - 1e-8) || TRACK.segments[0];
    const scale = segment.kind === 'arc' ? 1 - segment.direction * lane / segment.radius : 1;
    const available = Math.max(1e-8, segment.s + segment.length - wrapped);
    const travel = Math.min(available, distance / scale);
    next += travel; distance -= travel * scale;
  }
  return next;
}
function running(laps = 1) {
  const engine = new RaceEngine({ laps }).start(laps);
  for (let i = 0; i < 30; i++) engine.step(.1);
  assert.equal(engine.state, 'racing');
  return engine;
}

test('the opening lane difference is preserved while the inner grid handicap is set to 0.15 cruise seconds', () => {
  const engine = new RaceEngine();
  const [outer, inner] = engine.cars;
  near(firstCorner.radius, 598); near(firstCorner.sweep, Math.PI);
  near(outer._lane, -18); near(inner._lane, 22);
  const oldOuter = laneLength(-30, cornerExit, outer._lane);
  const oldInner = laneLength(-30, cornerExit, inner._lane);
  near(oldOuter, 2667.2210746113124);
  near(oldInner, 2541.5573684677207);
  near(oldOuter - oldInner, 40 * Math.PI);
  near(outer._gridS, -30);
  near(GRID_HANDICAP_SECONDS, .15);
  near(inner._gridS, -84.45);
  near((outer._gridS - inner._gridS) / 363, .15);
  near(laneLength(outer._gridS, cornerExit, outer._lane) - laneLength(inner._gridS, cornerExit, inner._lane), 40 * Math.PI - 54.45);
  assert.ok(engine.cars.every(car => car._gridS < TRACK.startDistance && !car._started && car.lap === 0));
  for (const car of engine.cars) near(relativeS(projectTrack(car.x, car.y).s), car._gridS);
});

test('both launch with identical acceleration and caps, but independently start timing on crossing the common line', () => {
  const engine = running();
  const starts = new Map();
  for (let tick = 0; tick < 240; tick++) {
    engine.step(1 / 120, new Set(['KeyW', 'ArrowUp']));
    near(engine.cars[0].speed, engine.cars[1].speed);
    for (const car of engine.cars) {
      assert.equal(car.lap, 0, 'crossing the line starts timing and awards no lap');
      if (car._started && !starts.has(car.id)) starts.set(car.id, car._lapStartTime);
      if (!car._started) assert.equal(car.lapTime, 0);
      else near(car.lapTime, engine.time - starts.get(car.id));
    }
  }
  assert.equal(starts.size, 2);
  // Semi-implicit acceleration at 120 Hz interpolates both exact line passages.
  near(starts.get(1), .4776483704300459, .002);
  assert.ok(starts.get(2) > starts.get(1), "the inner car crosses later from its staggered grid position");
  assert.ok(starts.get(2) < .85, "the reduced handicap crosses sooner than the old 1.093s grid");
  near(engine.cars[0].speed, 363); near(engine.cars[1].speed, 363);
  for (let tick = 0; tick < 42; tick++) {
    engine.step(1 / 120, new Set(['KeyW', 'ArrowUp', 'ShiftLeft', 'Enter']));
    near(engine.cars[0].speed, engine.cars[1].speed);
  }
  near(engine.cars[0].speed, 517); near(engine.cars[1].speed, 517);
});

test('lane-preserving paths retain the reduced handicap and earn valid independent first laps', () => {
  const engine = running(), speed = 360, dt = 1 / 120;
  const distances = new Map(engine.cars.map(car => [car.id, car._gridS]));
  const crossing = new Map(), exits = new Map();
  for (let frame = 0; frame < 7000 && engine.state !== 'finished'; frame++) {
    for (const car of engine.cars) {
      if (car.finished) continue;
      const previous = distances.get(car.id), next = moveLane(previous, speed * dt, car._lane);
      const point = trackPoint(next, car._lane);
      car.x = point.x; car.y = point.y; car.angle = point.angle; car.speed = 0;
      distances.set(car.id, next);
      if (previous < cornerExit && next >= cornerExit) exits.set(car.id,
        engine.time + laneLength(previous, cornerExit, car._lane) / speed);
    }
    engine.step(dt);
    for (const car of engine.cars) {
      assert.equal(car.missedCheckpoint, false);
      if (car._started && !crossing.has(car.id)) crossing.set(car.id, car._lapStartTime);
    }
  }
  near(exits.get(1) - exits.get(2), (40 * Math.PI - 54.45) / speed, 1e-6);
  near(crossing.get(1), 30 / speed, 1e-6);
  near(crossing.get(2), (30 + 54.45) / speed, 1e-6);
  assert.equal(engine.state, 'finished');
  for (const car of engine.cars) {
    assert.equal(car.lap, 1); assert.equal(car.finished, true);
    near(car.bestLap, laneLength(0, TRACK.length, car._lane) / speed, 1e-5);
    near(car.finishTime, crossing.get(car.id) + car.bestLap, 1e-6);
  }
});

test('a pre-line rescue restores each grid slot, while post-line rescue keeps earned checkpoint timing', () => {
  const engine = running();
  for (const car of engine.cars) {
    car.x += 300; car.y += 300;
    engine.rescue(car.id);
    near(relativeS(projectTrack(car.x, car.y).s), car._gridS);
    near(projectTrack(car.x, car.y).offset, car._lane);
    assert.equal(car._started, false); assert.equal(car.lap, 0);
    car.rescueCooldown = 0;
  }
  for (let tick = 0; tick < 150; tick++) engine.step(1 / 120, new Set(['KeyW', 'ArrowUp']));
  for (const car of engine.cars) {
    assert.equal(car._started, true);
    const started = car._lapStartTime;
    engine.rescue(car.id);
    near(relativeS(projectTrack(car.x, car.y).s), 18);
    assert.equal(car._lapStartTime, started);
    assert.equal(car._nextCheckpoint, 1); assert.equal(car.lap, 0);
  }
});
