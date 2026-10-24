import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceEngine, TRACKS, setTrack, trackPoint } from '../src/engine.js';
import { GhostRecorder, validateReplay } from '../src/ghost-replay.js';
import { RaceAI } from '../src/ai.js';

const dt = 1 / 120;
const forward = new Set(['KeyW', 'ShiftLeft']);
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);
function start(laps = 1, playerCount = 1) {
  const engine = new RaceEngine({ laps, playerCount }).start();
  for (let i = 0; i < 30; i++) engine.step(.1);
  return engine;
}
function launch(engine, keys = forward, recorder) {
  for (let i = 0; i < 1200 && !engine.cars[0]._started; i++) {
    engine.step(dt, keys); recorder?.sample(engine, [1]);
  }
  assert.ok(engine.cars[0]._started, 'a normal forward launch must reach the line');
  return engine.cars[0];
}

test('one-lap standing-start guard leaves normal acceleration, nitro and small steering unchanged on all 12 maps', () => {
  assert.equal(Object.keys(TRACKS).length, 12);
  for (const city of Object.keys(TRACKS)) for (const boost of [false, true]) {
    setTrack(city);
    const guarded = start(1, 2), ordinary = start(3, 2);
    for (let step = 0; step < 180 && guarded.cars.some(c => !c._started); step++) {
      const keys = new Set(['KeyW', 'ArrowUp', ...(boost ? ['ShiftLeft', 'Enter'] : [])]);
      if (step < 9) { keys.add('KeyA'); keys.add('ArrowRight'); }
      guarded.step(dt, keys); ordinary.step(dt, keys);
      for (let id = 0; id < 2; id++) {
        const actual = guarded.cars[id], expected = ordinary.cars[id];
        for (const field of ['x', 'y', 'angle', 'speed', 'boost', '_lapStartTime']) near(actual[field], expected[field]);
        assert.equal(actual._started, expected._started); assert.equal(actual.launchResetCount, 0, city);
      }
    }
    assert.ok(guarded.cars.every(c => c._started), city);
  }
  setTrack('coast');
});

test('reverse run-ups reset to the same stationary grid and cannot improve line-crossing speed on any map', () => {
  for (const city of Object.keys(TRACKS)) {
    setTrack(city);
    const normal = start(), exploit = start();
    const expected = launch(normal);
    for (let tick = 0; tick < 360; tick++) exploit.step(dt, new Set(['KeyS']));
    const car = exploit.cars[0], grid = trackPoint(car._gridS, car._lane);
    assert.ok(car.launchResetCount > 0, city); assert.equal(car._started, false);
    assert.equal(car.launchResetReason, 'backward');
    near(car.x, grid.x, .05); near(car.y, grid.y, .05);
    assert.ok(car.speed >= -2.5);
    // Return from the held reverse key exactly as a driver would. A tiny
    // substep below the rear tolerance must not become an acceleration bonus.
    launch(exploit);
    assert.ok(car.speed <= expected.speed + 3, `${city}: run-up gained crossing speed`);
    assert.ok(car._lapStartTime >= expected._lapStartTime + 2.9, city);
    assert.equal(car.rescueCount, 0, 'the new launch is valid rather than silently disqualified');
  }
  setTrack('coast');
  const oldBehavior = start(3);
  for (let tick = 0; tick < 360; tick++) oldBehavior.step(dt, new Set(['KeyS']));
  assert.ok(launch(oldBehavior).speed > 360, 'fixture genuinely reproduced the old rolling-start advantage');
});

test('sideways detours and a backwards-facing launch cannot build speed before the line', () => {
  setTrack('coast');
  for (const angle of [Math.PI / 2, Math.PI]) {
    const engine = start(), car = engine.cars[0], grid = trackPoint(car._gridS, car._lane);
    car.angle += angle;
    for (let step = 0; step < 240 && !car.launchResetCount; step++) engine.step(dt, forward);
    assert.equal(car.launchResetCount, 1); assert.equal(car._started, false);
    assert.equal(car.launchResetReason, angle === Math.PI ? 'backward' : 'detour');
    near(car.x, grid.x); near(car.y, grid.y); near(car.angle, grid.angle); near(car.speed, 0);
    assert.equal(car._launchPathLength, 0);
    assert.ok(engine.time > 0, 'launch reset never rewinds the GO clock');
    const remainingBoost = car.boost;
    engine.step(dt, forward);
    assert.ok(car.boost <= remainingBoost + 12 * dt + 1e-7, 'reset grants no nitro refill');
  }
});

test('manual rescue clears the approach budget without changing the grid or bypassing its cooldown', () => {
  setTrack('coast'); const engine = start(), car = engine.cars[0];
  for (let n = 0; n < 20; n++) engine.step(dt, forward);
  assert.ok(car._launchPathLength > 0); assert.equal(car._started, false);
  const time = engine.time, boost = car.boost;
  engine.rescue(1);
  assert.equal(car._launchPathLength, 0); assert.equal(car.launchResetCount, 0);
  assert.equal(car.rescueCount, 1); assert.equal(car.rescueCooldown, 2); near(engine.time, time); near(car.boost, boost);
  const grid = trackPoint(car._gridS, car._lane);
  for (let n = 0; n < 120; n++) engine.step(dt, forward);
  near(car.x, grid.x); near(car.y, grid.y); near(car.speed, 0);
  launch(engine); assert.equal(car.launchResetCount, 0);
});

test('a restarted one-lap attempt records its normal standing-start lap and preserves the elapsed GO time', () => {
  setTrack('coast');
  const attempts = [];
  for (const backwards of [false, true]) {
    const engine = new RaceEngine({ laps: 1, playerCount: 1 }).start(), recorder = new GhostRecorder();
    recorder.sample(engine, [1]);
    for (let i = 0; i < 30; i++) { engine.step(.1); recorder.sample(engine, [1]); }
    if (backwards) {
      for (let i = 0; i < 360; i++) { engine.step(dt, new Set(['KeyS'])); recorder.sample(engine, [1]); }
      // Release through the rear boundary, giving an exact stationary reset.
      while (engine.cars[0].speed !== 0) { engine.step(dt, new Set(['KeyS'])); recorder.sample(engine, [1]); }
    }
    launch(engine, forward, recorder);
    const driver = new RaceAI({ carId: 1 });
    for (let step = 0; step < 180 * 60 && engine.state !== 'finished'; step++) {
      engine.step(1 / 60, driver.update(engine)); recorder.sample(engine, [1]);
    }
    const replay = recorder.bestReplay(1), car = engine.cars[0];
    assert.equal(engine.state, 'finished'); assert.equal(driver.rescues, 0); assert.ok(validateReplay(replay));
    const initialSpeed = Math.hypot(replay.frames[1][1] - replay.frames[0][1], replay.frames[1][2] - replay.frames[0][2]) * 1000 / replay.frames[1][0];
    assert.ok(initialSpeed < 210);
    attempts.push({ replay, car });
  }
  near(attempts[0].car.lastLap, attempts[1].car.lastLap, 1e-6);
  assert.deepEqual(attempts[0].replay, attempts[1].replay);
  assert.ok(attempts[1].car.finishTime >= attempts[0].car.finishTime + 3 - 1e-6);
});

test('already-started racing and valid three-lap flying-lap records retain their existing behavior', () => {
  setTrack('coast'); const oneLap = start(), car = launch(oneLap);
  for (let n = 0; n < 180; n++) oneLap.step(dt, new Set(['KeyS']));
  assert.ok(car.speed < 0); assert.equal(car.launchResetCount, 0);
  const engine = new RaceEngine({ laps: 3, playerCount: 1 }).start(), recorder = new GhostRecorder(), driver = new RaceAI({ carId: 1 });
  const laps = []; recorder.sample(engine, [1]);
  for (let n = 0; n < 220 * 60 && engine.state !== 'finished'; n++) {
    engine.step(1 / 60, driver.update(engine)); laps.push(...recorder.sample(engine, [1]));
  }
  assert.equal(engine.state, 'finished'); assert.equal(driver.rescues, 0); assert.equal(laps.length, 3);
  assert.equal(engine.cars[0].launchResetCount, 0);
  for (const { replay } of laps) assert.ok(validateReplay(replay));
  const flying = laps[1].replay, first = flying.frames[0], second = flying.frames[1];
  assert.ok(Math.hypot(second[1] - first[1], second[2] - first[2]) * 1000 / second[0] > 250,
    'a legitimate later lap may start fast and must not be filtered as a reverse-start exploit');
  assert.ok(recorder.fullRaceReplay(1));
});
