import test from 'node:test';
import assert from 'node:assert/strict';
import { ObstacleWorld } from '../collisions.js';
import { RaceEngine, TRACK, trackPoint, projectTrack, mod } from '../engine.js';
import { sceneObstacles, sceneryPlacements, roadsideLamps, cornerMarkers } from '../renderer.js';

const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const carAt = (x, y, angle = 0, speed = 200) => ({ x, y, angle, speed, impact: 0 });
const box = (x, y, halfWidth, halfDepth, angle = 0) => ({ type: 'box', x, y, halfWidth, halfDepth, angle });
const circle = (x, y, radius) => ({ type: 'circle', x, y, radius });
const actualObstacles = sceneObstacles();

function isClear(car, obstacle, radius = 21) {
  if (obstacle.type === 'circle') return Math.hypot(car.x - obstacle.x, car.y - obstacle.y) >= radius + obstacle.radius - 1e-6;
  const cosine = Math.cos(obstacle.angle), sine = Math.sin(obstacle.angle);
  const dx = car.x - obstacle.x, dy = car.y - obstacle.y;
  const x = dx * cosine + dy * sine, y = -dx * sine + dy * cosine;
  return Math.hypot(Math.max(0, Math.abs(x) - obstacle.halfWidth),
    Math.max(0, Math.abs(y) - obstacle.halfDepth)) >= radius - 1e-6;
}

test('circle impacts stop penetration and slow an incoming car', () => {
  const obstacle = circle(100, 100, 12), world = new ObstacleWorld([obstacle]);
  const car = carAt(76, 100, 0, 363);
  assert.equal(world.resolveCar(car), 1);
  assert.ok(isClear(car, obstacle));
  assert.ok(car.speed < 0 && Math.abs(car.speed) < 30);
  assert.equal(car.impact, 1);
});

test('coincident centers are separated finitely, even without a previous position', () => {
  for (const obstacle of [circle(100, 100, 12), box(100, 100, 40, 10), box(100, 100, 40, 10, .7)]) {
    const world = new ObstacleWorld([obstacle]), car = carAt(100, 100, 0, 0);
    assert.equal(world.resolveCar(car), 1);
    assert.ok(Number.isFinite(car.x + car.y + car.speed));
    assert.ok(isClear(car, obstacle));
  }
});

test('rotated building faces resolve along the physical OBB normal', () => {
  const angle = Math.PI / 4, obstacle = box(500, 400, 80, 35, angle);
  const car = carAt(500 + Math.cos(angle) * 92, 400 + Math.sin(angle) * 92, angle + Math.PI, 363);
  const world = new ObstacleWorld([obstacle]);
  assert.equal(world.resolveCar(car), 1);
  assert.ok(isClear(car, obstacle));
  near(-(car.x - 500) * Math.sin(angle) + (car.y - 400) * Math.cos(angle), 0);
  assert.ok(Math.abs(car.speed) < 30);
});

test('box corners use circle-to-corner distance and allow clear diagonal space', () => {
  const obstacle = box(0, 0, 50, 30), world = new ObstacleWorld([obstacle]);
  const clear = carAt(68, 48, Math.PI, 100);
  assert.equal(world.resolveCar(clear), 0);
  near(clear.x, 68); near(clear.y, 48);
  const overlapping = carAt(60, 40, -3 * Math.PI / 4, 200);
  assert.equal(world.resolveCar(overlapping), 1);
  assert.ok(isClear(overlapping, obstacle));
  near(overlapping.x - 50, overlapping.y - 30);
});

test('a car embedded in a building exits its nearest face', () => {
  const obstacle = box(0, 0, 100, 40), world = new ObstacleWorld([obstacle]);
  const car = carAt(70, 15, 0, 0);
  assert.equal(world.resolveCar(car), 1);
  near(car.x, 70);
  assert.ok(car.y >= 61 && car.y < 61.01);
  assert.ok(isClear(car, obstacle));
});

test('side scrapes preserve useful forward speed while head-on impacts stop the car', () => {
  const obstacle = box(0, 0, 200, 2), world = new ObstacleWorld([obstacle]);
  const car = carAt(-100, -20, .12, 363);
  world.resolveCar(car);
  assert.ok(isClear(car, obstacle));
  assert.ok(car.speed > 350 && car.speed < 363);
  assert.ok(car.impact > 0);
});

test('forward and reverse escape do not receive an inward collision impulse', () => {
  const obstacle = box(0, 0, 2, 200), world = new ObstacleWorld([obstacle]);
  for (const [angle, speed] of [[Math.PI, 120], [0, -120]]) {
    const car = carAt(-20, 0, angle, speed);
    world.resolveCar(car);
    near(car.speed, speed);
    assert.ok(isClear(car, obstacle));
    const previous = { x: car.x, y: car.y };
    car.x += Math.cos(car.angle) * car.speed / 60;
    car.y += Math.sin(car.angle) * car.speed / 60;
    assert.equal(world.resolveCar(car, previous), 0);
    assert.ok(car.x < previous.x);
  }
});

test('reversing into a barrier slows the reverse motion and separates correctly', () => {
  const obstacle = box(0, 0, 2, 200), world = new ObstacleWorld([obstacle]);
  const car = carAt(-20, 0, Math.PI, -115);
  world.resolveCar(car);
  assert.ok(isClear(car, obstacle));
  assert.ok(car.speed > 0 && car.speed < 10);
  assert.ok(car.impact > 0);
});

test('multiple simultaneous wall contacts converge outside both surfaces', () => {
  const obstacles = [box(0, 0, 2, 200), box(0, 0, 200, 2)];
  const world = new ObstacleWorld(obstacles), car = carAt(-10, -10, Math.PI / 4, 363);
  assert.equal(world.resolveCar(car), 2);
  assert.ok(obstacles.every(obstacle => isClear(car, obstacle)));
  assert.ok(car.x < -23 && car.y < -23);
  assert.ok(Number.isFinite(car.speed));
});

test('maximum-speed fixed ticks cannot cross thin lamp poles or guardrails', () => {
  for (const obstacle of [circle(0, 0, .3), box(0, 0, .25, 500), box(0, 0, .3, 100, .3)]) {
    const world = new ObstacleWorld([obstacle]), car = carAt(-80, 0, 0, 517);
    let touched = false;
    for (let tick = 0; tick < 240; tick++) {
      const previous = { x: car.x, y: car.y };
      car.speed = Math.min(517, car.speed + 484 / 120);
      car.x += car.speed / 120;
      const contacts = world.resolveCar(car, previous);
      touched ||= contacts > 0;
      assert.ok(isClear(car, obstacle));
      assert.ok(car.x < 0, 'the car remains on the approach side');
    }
    assert.equal(touched, true);
  }
});

test('swept resolution catches a thin obstacle between distant endpoints', () => {
  for (const obstacle of [circle(0, 0, .3), box(0, 0, .25, 500)]) {
    const world = new ObstacleWorld([obstacle]), car = carAt(150, 0, 0, 517);
    assert.equal(world.resolveCar(car, { x: -150, y: 0 }), 1);
    assert.ok(isClear(car, obstacle));
    assert.ok(car.x < -21);
  }
});

test('spatial hashing checks only nearby objects in a world containing 1,600 objects', () => {
  const obstacles = [];
  for (let x = 0; x < 40; x++) for (let y = 0; y < 40; y++) obstacles.push(circle(x * 300, y * 300, 8));
  const world = new ObstacleWorld(obstacles);
  let candidateChecks = 0;
  for (let i = 0; i < 2000; i++) {
    const car = carAt((i % 40) * 300 + 70, (Math.floor(i / 40) % 40) * 300 + 70);
    assert.equal(world.resolveCar(car), 0);
    candidateChecks += world.lastCandidateChecks;
  }
  assert.ok(candidateChecks < 2000 * 10, `only ${candidateChecks} local shape checks were needed`);
});

test('production scene provides real trees, buildings, rocks, lamps, signposts and rails', () => {
  assert.ok(actualObstacles.length > 800);
  assert.ok(actualObstacles.some(obstacle => obstacle.type === 'box' && obstacle.halfWidth > 30 && obstacle.halfDepth > 30));
  assert.ok(actualObstacles.some(obstacle => obstacle.type === 'box' && Math.min(obstacle.halfWidth, obstacle.halfDepth) <= 2 && Math.max(obstacle.halfWidth, obstacle.halfDepth) > 10));
  const kinds = new Set();
  for (const placement of sceneryPlacements()) {
    const atPlacement = actualObstacles.find(obstacle => Math.hypot(obstacle.x - placement.x, obstacle.y - placement.z) < 1e-6);
    if (atPlacement) kinds.add(placement.kind);
  }
  assert.deepEqual([...kinds].sort(), ['building', 'palm', 'pine', 'rock']);
  for (const lamp of roadsideLamps()) {
    assert.ok(actualObstacles.some(obstacle => Math.hypot(obstacle.x - lamp.mast.position[0], obstacle.y - lamp.mast.position[2]) < 1e-6));
  }
  for (const marker of cornerMarkers()) {
    assert.ok(actualObstacles.some(obstacle => Math.hypot(obstacle.x - marker.x, obstacle.y - marker.y) < 1e-6));
  }
});

test('actual scene obstacles resist a moving car at their physical ground footprints', () => {
  const representatives = new Map();
  for (const obstacle of actualObstacles) {
    const key = obstacle.type === 'circle' ? (obstacle.radius < 5 ? 'trunk' : 'rock')
      : Math.max(obstacle.halfWidth, obstacle.halfDepth) > 30 ? 'building-or-rail' : 'lamp-or-sign';
    if (!representatives.has(key)) representatives.set(key, obstacle);
  }
  assert.equal(representatives.size, 4);
  for (const obstacle of representatives.values()) {
    const angle = obstacle.type === 'box' ? obstacle.angle : 0;
    const extent = obstacle.type === 'box' ? obstacle.halfWidth : obstacle.radius;
    const car = carAt(obstacle.x + Math.cos(angle) * (extent + 10),
      obstacle.y + Math.sin(angle) * (extent + 10), angle + Math.PI, 517);
    const world = new ObstacleWorld([obstacle]);
    assert.equal(world.resolveCar(car), 1);
    assert.ok(isClear(car, obstacle));
    assert.ok(Math.abs(car.speed) < 50);
  }
});

test('RaceEngine injection survives restart and fixed substeps stop a real driven car', () => {
  const spawn = trackPoint(TRACK.startDistance - 30, 22);
  const obstacle = box(spawn.x - 150, spawn.y, 3, 15);
  const engine = new RaceEngine({ laps: 1 }).setObstacles([obstacle]);
  const world = engine.obstacleWorld;
  engine.start();
  assert.equal(engine.obstacleWorld, world);
  for (let tick = 0; tick < 30; tick++) engine.step(.1);
  let hit = false;
  for (let tick = 0; tick < 1200; tick++) {
    engine.step(1 / 120, new Set(['KeyW', 'ShiftLeft']));
    const car = engine.cars[0];
    if (car.impact > 0) hit = true;
    assert.ok(isClear(car, obstacle));
    assert.ok(car.x > obstacle.x + obstacle.halfWidth);
  }
  assert.equal(hit, true);
  const stoppedX = engine.cars[0].x;
  for (let tick = 0; tick < 120; tick++) engine.step(1 / 120, new Set(['KeyS']));
  assert.ok(engine.cars[0].x > stoppedX + 40, 'reverse escapes the barrier');
  engine.reset();
  assert.equal(engine.obstacleWorld, world);
});

for (const player of [1, 2]) {
  test(`production obstacle world leaves spawn clear and player ${player} can drive three full laps`, () => {
    const engine = new RaceEngine({ obstacles: actualObstacles }).start();
    for (const car of engine.cars) assert.ok(actualObstacles.every(obstacle => isClear(car, obstacle)));
    let impacts = 0, offroad = 0;
    const car = engine.cars[player - 1];
    for (let frame = 0; frame < 60 * 180 && engine.state !== 'finished'; frame++) {
      const projection = projectTrack(car.x, car.y);
      const target = trackPoint(projection.s + 75 + Math.abs(car.speed) * .14, player === 1 ? 24 : -24);
      const error = mod(Math.atan2(target.y - car.y, target.x - car.x) - car.angle + Math.PI, Math.PI * 2) - Math.PI;
      const keys = new Set([player === 1 ? 'KeyW' : 'ArrowUp']);
      if (error > .025) keys.add(player === 1 ? 'KeyD' : 'ArrowRight');
      if (error < -.025) keys.add(player === 1 ? 'KeyA' : 'ArrowLeft');
      if (car.impact > 0) impacts++;
      if (car.offroad) offroad++;
      engine.step(1 / 60, keys);
    }
    assert.equal(engine.state, 'finished');
    assert.equal(engine.winner.id, player);
    assert.equal(car.lap, 3);
    assert.equal(impacts, 0, 'real generated scenery must not cause invisible road collisions');
    assert.equal(offroad, 0);
    assert.ok(car.bestLap >= 40 && car.bestLap <= 50);
  });
}
