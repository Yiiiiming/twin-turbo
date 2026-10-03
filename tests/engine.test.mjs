import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceEngine, TRACK, trackPoint, projectTrack, mod } from '../engine.js';

const near = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
const angleDifference = (a, b) => mod(a - b + Math.PI, Math.PI * 2) - Math.PI;
const distanceDifference = (a, b) => mod(a - b + TRACK.length / 2, TRACK.length) - TRACK.length / 2;

function running(laps = 3) {
  const engine = new RaceEngine({ laps });
  engine.start();
  for (let i = 0; i < 30; i++) engine.step(0.1);
  assert.equal(engine.state, 'racing');
  return engine;
}

// Supply a physically continuous centerline path to isolate checkpoint logic
// from the player's steering accuracy. Each position is under one frame's
// allowed displacement; the production public step processes every sample.
function sample(engine, car, distance, lane = 22) {
  const p = trackPoint(distance, lane);
  car.x = p.x; car.y = p.y; car.angle = p.angle; car.speed = 0;
  engine.step(1 / 120);
}

function path(engine, car, from, to, lane = 22) {
  const direction = Math.sign(to - from);
  for (let s = from + direction * 5; direction * (to - s) > 0; s += direction * 5) {
    sample(engine, car, s, lane);
  }
  sample(engine, car, to, lane);
}

test('analytic projection round trips both turn directions, all lanes and the finish seam', () => {
  for (let s = 0; s < TRACK.length; s += 7.3) {
    for (const lane of [-59, -35, 0, 35, 59]) {
      const p = trackPoint(s, lane);
      const projected = projectTrack(p.x, p.y);
      near(distanceDifference(projected.s, s), 0);
      near(projected.distance, Math.abs(lane));
      near(projected.offset, lane);
    }
  }
  for (const segment of TRACK.segments) {
    const before = trackPoint(segment.s - 1e-5), after = trackPoint(segment.s + 1e-5);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 2.01e-5);
    assert.ok(Math.abs(angleDifference(after.angle, before.angle)) < 1e-6);
  }
  for (const s of [-1e-6, 0, 1e-6, TRACK.length - 1e-6, TRACK.length, TRACK.length + 1e-6]) {
    const p = trackPoint(s, 22), projected = projectTrack(p.x, p.y);
    near(distanceDifference(projected.s, s), 0);
  }
  const start = trackPoint(TRACK.startDistance);
  near(start.x, 1820); near(start.y, 3718); near(start.angle, Math.PI);
});

test('technical circuit has a long straight, opposite S bends and a distinct hairpin', () => {
  assert.ok(TRACK.length > 2 * (960 + Math.PI * 400));
  assert.ok(TRACK.length > 15000 && TRACK.length < 17000);
  assert.ok(TRACK.segments.some(segment => segment.kind === 'line' && segment.length >= 750));
  const turns = TRACK.segments.filter(segment => segment.kind === 'arc');
  assert.ok(turns.some(segment => segment.sweep < 0));
  assert.ok(turns.some(segment => segment.sweep > 0));
  assert.ok(turns.some(segment => segment.sweep === -Math.PI));
  assert.ok(turns.every(segment => segment.radius >= 520));
  const samples = [];
  for (let s = 0; s < TRACK.length; s += 20) samples.push(trackPoint(s));
  for (const point of samples) {
    assert.ok(point.x > TRACK.roadWidth / 2 + 23 && point.x < TRACK.width - TRACK.roadWidth / 2 - 23);
    assert.ok(point.y > TRACK.roadWidth / 2 + 23 && point.y < TRACK.height - TRACK.roadWidth / 2 - 23);
  }
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      if (Math.abs(distanceDifference(samples[i].s, samples[j].s)) < 600) continue;
      assert.ok(Math.hypot(samples[i].x - samples[j].x, samples[i].y - samples[j].y) >= 299,
        'Nonadjacent roads must leave generous grass between the racing surfaces');
    }
  }
});

test('projection selects a real bounded segment even far away from the circuit', () => {
  for (const [x, y] of [[0, 0], [2500, 1650], [660, 530], [1100, 970],
    [1340, 1030], [430, 1200], [1760, 1210], [2000, 300]]) {
    const projected = projectTrack(x, y);
    const roundTrip = trackPoint(projected.s);
    near(projected.x, roundTrip.x); near(projected.y, roundTrip.y);
    near(projected.distance, Math.hypot(x - projected.x, y - projected.y));
    for (let s = 0; s < TRACK.length; s += 9) {
      const reference = trackPoint(s);
      assert.ok(projected.distance <= Math.hypot(x - reference.x, y - reference.y) + 1e-7);
    }
  }
});

test('countdown holds cars, clamps long frames, and tolerates invalid dt', () => {
  const engine = new RaceEngine().start();
  const x = engine.cars[0].x;
  engine.step(Infinity); engine.step(NaN); engine.step(-1);
  near(engine.countdown, 3);
  engine.step(20, new Set(['KeyW']));
  near(engine.countdown, 2.9);
  near(engine.time, 0); near(engine.cars[0].x, x);
  for (let i = 0; i < 29; i++) engine.step(0.1, new Set(['KeyW']));
  assert.equal(engine.state, 'racing');
  near(engine.cars[0].x, x);
  engine.step(0.05, new Set(['KeyW']));
  assert.ok(engine.cars[0].x < x);
  assert.ok(engine.cars[0].speed > 0);
});

test('pause freezes countdown and race, resume preserves the previous phase', () => {
  const engine = new RaceEngine().start();
  engine.step(0.1); engine.pause(); engine.step(0.1);
  assert.equal(engine.state, 'paused'); near(engine.countdown, 2.9);
  engine.resume(); assert.equal(engine.state, 'countdown');
  for (let i = 0; i < 29; i++) engine.step(0.1);
  engine.step(0.08, new Set(['KeyW']));
  const before = { x: engine.cars[0].x, time: engine.time };
  engine.pause(); engine.step(0.1, new Set(['KeyW']));
  near(engine.cars[0].x, before.x); near(engine.time, before.time);
  engine.resume(); engine.step(0.08, new Set(['KeyW']));
  assert.ok(engine.time > before.time); assert.ok(engine.cars[0].x < before.x);
});

test('controls accelerate, brake into reverse, steer, and use rechargeable boost', () => {
  const engine = running();
  const car = engine.cars[0];
  for (let i = 0; i < 40; i++) engine.step(1 / 120, new Set(['KeyW']));
  assert.ok(car.speed > 70);
  const angle = car.angle;
  engine.step(0.08, new Set(['KeyW', 'KeyD', 'ShiftLeft']));
  assert.ok(car.boost < 100); assert.ok(car.boosting);
  assert.ok(car.angle !== angle);
  const boost = car.boost;
  engine.step(0.08, new Set(['KeyS']));
  assert.ok(car.boost > boost); assert.equal(car.boosting, false);
  for (let i = 0; i < 100; i++) engine.step(1 / 120, new Set(['KeyS']));
  assert.ok(car.speed < 0);
  const second = engine.cars[1];
  for (let i = 0; i < 40; i++) engine.step(1 / 120, new Set(['ArrowUp', 'Enter']));
  assert.ok(second.speed > 70); assert.ok(second.boost < 100);
});

test('start crossing is not a lap, ordered full circuits complete the race', () => {
  const engine = running(3);
  const car = engine.cars[0];
  const start = TRACK.startDistance;
  path(engine, car, start - 30, start + 5);
  assert.equal(car.lap, 0); assert.equal(car._started, true);
  let from = start + 5;
  for (let lap = 1; lap <= 3; lap++) {
    const to = start + lap * TRACK.length + 5;
    path(engine, car, from, to);
    assert.equal(car.lap, lap);
    assert.ok(car.bestLap > 0);
    if (lap < 3) assert.equal(engine.state, 'racing');
    from = to;
  }
  assert.equal(engine.state, 'finished');
  assert.equal(engine.winner.id, 1); assert.equal(car.finished, true);
  const time = engine.time;
  engine.step(0.1, new Set(['KeyW'])); near(engine.time, time);
  engine.start(5);
  assert.equal(engine.laps, 5); assert.equal(engine.state, 'countdown');
  assert.equal(engine.winner, null); assert.equal(engine.cars[0].lap, 0);
  assert.equal(engine.cars[0].bestLap, null);
});

test('driving backward around the track never starts or completes a lap', () => {
  const engine = running();
  const car = engine.cars[0];
  const from = TRACK.startDistance - 30;
  path(engine, car, from, from - TRACK.length - 50);
  assert.equal(car.lap, 0); assert.equal(car._started, false);
  near(car.progress, 0);
});

test('teleporting across an expected checkpoint does not award it', () => {
  const engine = running();
  const car = engine.cars[0];
  const start = TRACK.startDistance;
  path(engine, car, start - 30, start + 5);
  const gate = start + TRACK.length / TRACK.checkpoints;
  sample(engine, car, gate + 10);
  assert.equal(car._nextCheckpoint, 1);
  assert.equal(car.missedCheckpoint, true);
  path(engine, car, gate + 10, start + TRACK.length + 10);
  assert.equal(car.lap, 0); assert.equal(car._nextCheckpoint, 1);
});

test('crossing a checkpoint offroad is rejected; rescue restores earned progress', () => {
  const engine = running();
  const car = engine.cars[0];
  const start = TRACK.startDistance;
  path(engine, car, start - 30, start + 5);
  const gate = start + TRACK.length / TRACK.checkpoints;
  path(engine, car, start + 5, gate - 20);
  sample(engine, car, gate - 15, 85);
  path(engine, car, gate - 15, gate + 20, 85);
  assert.equal(car.offroad, true);
  assert.equal(car._nextCheckpoint, 1);
  assert.equal(car.missedCheckpoint, true);
  engine.rescue(1);
  assert.equal(car.offroad, false); assert.equal(car.missedCheckpoint, false);
  assert.equal(car._nextCheckpoint, 1); assert.equal(car.lap, 0);
  near(projectTrack(car.x, car.y).s, mod(start + 18, TRACK.length));
  path(engine, car, start + 18, gate + 5);
  assert.equal(car._nextCheckpoint, 2);
});

test('cutting through the hairpin infield skips no checkpoints and rescue restores the approach', () => {
  const engine = running();
  const car = engine.cars[0];
  const hairpin = TRACK.segments.find(segment => segment.kind === 'arc' && segment.sweep === -Math.PI);
  path(engine, car, TRACK.startDistance - 30, hairpin.s - 10);
  const earned = car._nextCheckpoint, checkpoint = car._lastCheckpointS;
  const entry = trackPoint(hairpin.s), exit = trackPoint(hairpin.s + hairpin.length);
  // Physically continuous grass shortcut between the parallel legs.
  for (let fraction = 0; fraction <= 1; fraction += .01) {
    car.x = entry.x + (exit.x - entry.x) * fraction;
    car.y = entry.y; car.speed = 0;
    engine.step(1 / 120);
  }
  assert.equal(car._nextCheckpoint, earned);
  assert.equal(car.lap, 0);
  engine.rescue(1);
  near(distanceDifference(projectTrack(car.x, car.y).s, checkpoint + 18), 0);
  assert.equal(car._nextCheckpoint, earned);
  path(engine, car, checkpoint + 18, TRACK.length + 5);
  assert.equal(car.lap, 1);
});

test('exact car overlap resolves finitely and world boundaries contain cars', () => {
  const engine = running();
  for (const car of engine.cars) {
    car.x = 600; car.y = 350; car.speed = 200; car.angle = 0;
  }
  engine.step(1 / 120);
  assert.ok(Math.hypot(engine.cars[0].x - engine.cars[1].x,
    engine.cars[0].y - engine.cars[1].y) >= 37);
  for (const car of engine.cars) {
    assert.ok(Number.isFinite(car.x + car.y + car.speed + car.angle));
  }
  const car = engine.cars[0];
  car.x = 24; car.y = 40; car.angle = Math.PI; car.speed = 400;
  engine.step(0.1, new Set(['KeyW']));
  assert.ok(car.x >= 23); assert.ok(car.x <= TRACK.width - 23);
  assert.ok(car.y >= 23); assert.ok(car.y <= TRACK.height - 23);
});

test('offroad driving slows a fast car and a long racing frame advances at most 100ms', () => {
  const engine = running();
  const car = engine.cars[0];
  car.x = 550; car.y = 350; car.angle = 0; car.speed = 330;
  const before = engine.time;
  engine.step(5, new Set(['KeyW', 'ShiftLeft']));
  near(engine.time - before, 0.1);
  assert.equal(car.offroad, true); assert.equal(car.boosting, false);
  assert.ok(car.speed < 280);
});

test('rescue has a real two-second immobilization penalty without lap or time credit', () => {
  const engine = running();
  const car = engine.cars[0];
  engine.rescue(1);
  const x = car.x, y = car.y, time = engine.time;
  for (let i = 0; i < 19; i++) engine.step(0.1, new Set(['KeyW', 'ShiftLeft']));
  near(car.x, x); near(car.y, y); near(car.speed, 0);
  near(engine.time - time, 1.9); assert.equal(car.lap, 0);
  assert.ok(car.rescueCooldown > 0);
  engine.pause(); engine.step(0.1);
  near(car.rescueCooldown, 0.1);
  engine.resume();
  engine.step(0.1, new Set(['KeyW']));
  engine.step(0.1, new Set(['KeyW']));
  assert.ok(car.x < x); assert.ok(car.speed > 0);
});

test('collisions next to a world wall cannot push either car outside the world', () => {
  const engine = running();
  for (const car of engine.cars) { car.x = 23; car.y = 23; car.speed = 0; }
  for (let i = 0; i < 120; i++) {
    engine.step(1 / 120);
    for (const car of engine.cars) {
      assert.ok(car.x >= 23 && car.y >= 23);
      assert.ok(car.x <= TRACK.width - 23 && car.y <= TRACK.height - 23);
      assert.ok(Number.isFinite(car.speed));
    }
  }
});

for (const fps of [30, 60, 120]) {
  for (const player of [1, 2]) {
    test(`real controls complete 3 ordered laps at ${fps} FPS for player ${player}`, () => {
      const engine = new RaceEngine().start();
      let offroadFrames = 0;
      let usedBoost = false;
      const usedSteering = new Set();
      for (let frame = 0; frame < fps * 210 && engine.state !== 'finished'; frame++) {
        const car = engine.cars[player - 1];
        const projection = projectTrack(car.x, car.y);
        const lane = player === 1 ? 24 : -24;
        const target = trackPoint(projection.s + 75 + Math.abs(car.speed) * .14, lane);
        const targetAngle = Math.atan2(target.y - car.y, target.x - car.x);
        const error = mod(targetAngle - car.angle + Math.PI, Math.PI * 2) - Math.PI;
        let safeSpeed = 470, straightAhead = true;
        for (let ahead = 0; ahead <= 320; ahead += 40) {
          const curvature = trackPoint(projection.s + ahead).curvature;
          if (!curvature) continue;
          straightAhead = false;
          const laneRadius = Math.abs(1 / curvature) - Math.sign(curvature) * lane;
          safeSpeed = Math.min(safeSpeed, laneRadius * 1.6);
        }
        const keys = new Set();
        if (car.speed > safeSpeed + 8) {
          keys.add(player === 1 ? 'KeyS' : 'ArrowDown');
        } else keys.add(player === 1 ? 'KeyW' : 'ArrowUp');
        if (error > .025) { keys.add(player === 1 ? 'KeyD' : 'ArrowRight'); usedSteering.add('right'); }
        if (error < -.025) { keys.add(player === 1 ? 'KeyA' : 'ArrowLeft'); usedSteering.add('left'); }
        if (straightAhead && Math.abs(error) < .12 && car.boost > 25) keys.add(player === 1 ? 'ShiftLeft' : 'Enter');
        if (car.offroad) offroadFrames++;
        if (car.boosting) usedBoost = true;
        engine.step(1 / fps, keys);
      }
      assert.equal(engine.state, 'finished');
      assert.equal(engine.winner.id, player);
      assert.equal(engine.cars[player - 1].lap, 3);
      assert.equal(offroadFrames, 0);
      assert.equal(usedBoost, true);
      assert.deepEqual([...usedSteering].sort(), ['left', 'right']);
      assert.ok(engine.time > 115 && engine.time < 165);
      assert.ok(engine.cars[player - 1].bestLap > 40 && engine.cars[player - 1].bestLap < 60);
    });
  }
}

for (const player of [1, 2]) {
  test(`player ${player} completes a normal unboosted lap in 45–55 seconds`, () => {
    const engine = new RaceEngine({ laps: 1 }).start();
    const car = engine.cars[player - 1];
    let offroadFrames = 0;
    for (let frame = 0; frame < 60 * 75 && engine.state !== 'finished'; frame++) {
      const projection = projectTrack(car.x, car.y);
      const target = trackPoint(projection.s + 75 + Math.abs(car.speed) * .14, player === 1 ? 24 : -24);
      const error = angleDifference(Math.atan2(target.y - car.y, target.x - car.x), car.angle);
      const keys = new Set([player === 1 ? 'KeyW' : 'ArrowUp']);
      if (error > .025) keys.add(player === 1 ? 'KeyD' : 'ArrowRight');
      if (error < -.025) keys.add(player === 1 ? 'KeyA' : 'ArrowLeft');
      if (car.offroad) offroadFrames++;
      engine.step(1 / 60, keys);
    }
    assert.equal(engine.state, 'finished');
    assert.equal(engine.winner.id, player);
    assert.equal(offroadFrames, 0);
    near(car.boost, 100);
    assert.ok(car.lastLap >= 45 && car.lastLap <= 55, `Measured normal lap: ${car.lastLap}s`);
  });
}
