import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceEngine, TRACK, registerTrack, setTrack, trackPoint, GRID_HANDICAP_SECONDS } from '../engine.js';

const original = TRACK;
const segments = [
  { kind: 'line', x1: 1000, y1: 1000, x2: 21000, y2: 1000, length: 20000, angle: 0, s: 0 },
  { kind: 'line', x1: 21000, y1: 1000, x2: 21000, y2: 4000, length: 3000, angle: Math.PI / 2, s: 20000 },
  { kind: 'line', x1: 21000, y1: 4000, x2: 1000, y2: 4000, length: 20000, angle: Math.PI, s: 23000 },
  { kind: 'line', x1: 1000, y1: 4000, x2: 1000, y2: 1000, length: 3000, angle: -Math.PI / 2, s: 43000 },
];
// Long, straight test hills keep steering and changing road geometry out of the
// comparison; every run still uses the shipped engine's public step method.
for (const [name, rise] of [['flat', 0], ['up', 2000], ['down', -2000]]) {
  registerTrack({ ...original, id: `slope-test-${name}`, width: 23000, height: 5000, length: 46000,
    startDistance: 0, segments, sections: [], elevationProfile: rise ? [{ start: 0, end: 20000, from: 0, to: rise }] : [] });
}
test.afterEach(() => setTrack('coast'));
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
function scenario(grade, { speed = 0, heading = 0, id = 1, rescue = 0 } = {}) {
  setTrack(`slope-test-${grade}`);
  const engine = new RaceEngine(), car = engine.cars[id - 1], position = trackPoint(10000);
  Object.assign(car, { x: position.x, y: position.y, angle: position.angle + heading, elevation: position.elevation,
    speed, _lastTrackS: position.s, _lastX: position.x, _lastY: position.y, rescueCooldown: rescue });
  Object.assign(engine.cars[2 - id], { finished: true, finishTime: 0 });
  engine.state = 'racing';
  return { engine, car, initial: { x: car.x, y: car.y } };
}
function advance(run, seconds, keys = ['KeyW'], hz = 60) {
  for (let frame = 0; frame < Math.round(seconds * hz); frame++) run.engine.step(1 / hz, new Set(keys));
  return run.car.speed;
}
function cruise(grade, options = {}, keys = ['KeyW'], seconds = 3, hz = 60) {
  const run = scenario(grade, options); advance(run, seconds, keys, hz); return run;
}

test('flat road retains the 240 display-speed baseline, original acceleration, boost and handicap', () => {
  const run = scenario('flat'); advance(run, .1);
  near(run.car.speed, 258.5 * .1);
  advance(run, 1.4); near(run.car.speed, 363);
  assert.equal(Math.round(run.car.speed * .66), 240);
  advance(run, .1, ['KeyW', 'ShiftLeft']); near(run.car.speed, 363 + 484 * .1);
  advance(run, .3, ['KeyW', 'ShiftLeft']); near(run.car.speed, 517);
  assert.equal(GRID_HANDICAP_SECONDS, .15);
});

test('equal throttle produces sustained uphill slowing and downhill gains within twenty percent', () => {
  const flat = cruise('flat', { speed: 200 }), uphill = cruise('up', { speed: 200 }), downhill = cruise('down', { speed: 200 });
  near(flat.car.speed, 363);
  assert.ok(uphill.car.speed < flat.car.speed * .9 && uphill.car.speed >= flat.car.speed * .8);
  assert.ok(downhill.car.speed > flat.car.speed * 1.1 && downhill.car.speed <= flat.car.speed * 1.2);
  assert.ok(uphill.car.x - uphill.initial.x < flat.car.x - flat.initial.x);
  assert.ok(downhill.car.x - downhill.initial.x > flat.car.x - flat.initial.x);
  const speed = downhill.car.speed; advance(downhill, .2);
  assert.ok(downhill.car.speed > 363 * 1.1 && Math.abs(downhill.car.speed - speed) < 2, 'the next throttle frame cannot erase the downhill gain');
});

test('boost uses the same bounded slope assist while flat boost remains 517', () => {
  const up = cruise('up', { speed: 363 }, ['KeyW', 'ShiftLeft'], 1);
  const flat = cruise('flat', { speed: 363 }, ['KeyW', 'ShiftLeft'], 1);
  const down = cruise('down', { speed: 363 }, ['KeyW', 'ShiftLeft'], 1);
  near(flat.car.speed, 517);
  assert.ok(up.car.speed < 517 * .9 && up.car.speed > 517 * .8);
  assert.ok(down.car.speed > 517 * 1.1 && down.car.speed < 517 * 1.2);
});

test('lifting retains downhill momentum but both braking controls overcome gravity', () => {
  const up = cruise('up', { speed: 300 }, [], .5), flat = cruise('flat', { speed: 300 }, [], .5), down = cruise('down', { speed: 300 }, [], .5);
  assert.ok(up.car.speed < flat.car.speed && flat.car.speed < down.car.speed && down.car.speed < 300);
  const braked = cruise('down', { speed: 300 }, ['KeyS'], .5);
  assert.ok(braked.car.speed < down.car.speed - 100, 'braking strongly slows even on a descent');
  const stopped = cruise('down', { speed: 300 }, ['KeyW', 'KeyS'], 1.5);
  near(stopped.car.speed, 0);
  advance(stopped, .5, []); near(stopped.car.speed, 0);
});

test('heading reversal swaps the incline, perpendicular driving stays flat, and reverse gear respects travel direction', () => {
  const reversed = cruise('up', { speed: 200, heading: Math.PI });
  const down = cruise('down', { speed: 200 });
  near(reversed.car.speed, down.car.speed, 1e-6);
  const acrossUp = scenario('up', { speed: 200, heading: Math.PI / 2 }); advance(acrossUp, .1);
  const acrossFlat = scenario('flat', { speed: 200, heading: Math.PI / 2 }); advance(acrossFlat, .1);
  near(acrossUp.car.speed, acrossFlat.car.speed);
  const reverseDown = cruise('up', { speed: -50 }, ['KeyS'], 2), reverseUp = cruise('down', { speed: -50 }, ['KeyS'], 2);
  assert.ok(reverseDown.car.speed < -115 * 1.1); assert.ok(reverseUp.car.speed > -115 * .9 && reverseUp.car.speed < 0);
});

test('no-input cars and rescued cars remain still on slopes, and both drivers share identical physics', () => {
  for (const grade of ['up', 'down']) {
    const idle = cruise(grade, {}, [], 2); near(idle.car.speed, 0); near(idle.car.x, idle.initial.x);
    const rescued = cruise(grade, { speed: 300, rescue: 2 }, ['KeyW', 'ShiftLeft'], 1);
    near(rescued.car.speed, 0); near(rescued.car.x, rescued.initial.x); assert.ok(rescued.car.rescueCooldown > 0);
    const one = cruise(grade, { speed: 200 }, ['KeyW'], 2), two = cruise(grade, { speed: 200, id: 2 }, ['ArrowUp'], 2);
    near(one.car.speed, two.car.speed); near(one.car.x, two.car.x);
  }
});

test('the same hill stays deterministic at 30, 60 and 120 display frames per second', () => {
  for (const grade of ['up', 'down']) {
    const runs = [30, 60, 120].map(hz => cruise(grade, { speed: 200 }, ['KeyW'], 3, hz));
    for (const run of runs.slice(1)) { near(run.car.speed, runs[0].car.speed, 1e-6); near(run.car.x, runs[0].car.x, 1e-6); }
  }
});
