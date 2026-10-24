import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, TRACKS, RaceEngine, setTrack, trackPoint, projectTrack } from '../src/engine.js';
import { RaceRenderer, roadsideLamps } from '../src/renderer.js';
import { entrySegmentBlocked } from '../src/entry-cameras.js';
import { LONDON_MAGIC_ZONE, londonMagicPlacements } from '../src/london-magic-layout.js';
import { londonMagicState } from '../src/london-magic-effects.js';
import { MAGIC_FLIGHT_ROUTE, MAGIC_FLIGHT_CYCLE, londonMagicFlight } from '../src/london-magic-flight.js';

test.afterEach(() => setTrack('coast'));
const difference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const near = (actual, expected, epsilon = 1e-7) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('the complete flight stays above the accepted London racing centerline and well inside both magic gates', () => {
  setTrack('coast-london');
  const route = MAGIC_FLIGHT_ROUTE, items = londonMagicPlacements();
  assert.ok(route.start > LONDON_MAGIC_ZONE.start + 150);
  assert.ok(route.end < LONDON_MAGIC_ZONE.end - 150);
  assert.ok(route.end - route.start > 1000, 'the flyover must cover the racing stretch, not orbit a roadside plot');
  const stations = [], heights = [];
  let previous = null;
  for (let frame = 0; frame <= 960; frame++) {
    const time = frame / 960 * MAGIC_FLIGHT_CYCLE, pose = londonMagicFlight(time);
    assert.ok(Object.values(pose).every(Number.isFinite));
    assert.ok(pose.s >= route.start - 1e-8 && pose.s <= route.end + 1e-8);
    const road = projectTrack(pose.x, pose.z, pose.s), exact = trackPoint(pose.s);
    assert.ok(road.distance < 1e-5, `flight wandered away from the road at ${time}`);
    near(pose.x, exact.x); near(pose.z, exact.y);
    assert.ok(pose.y - road.elevation >= 125 && pose.y - road.elevation <= 160);
    for (const gate of items.filter(item => item.kind === 'magic-gate'))
      assert.ok(Math.hypot(pose.x - gate.x, pose.z - gate.z) > gate.radius + 50,
        'visible gate arches are not collision hulls; keep the complete car away from their plot');
    assert.deepEqual(londonMagicState(items, time).car, pose, 'the live effects state must use the road flyover');
    if (previous) {
      assert.ok(Math.hypot(pose.x - previous.x, pose.y - previous.y, pose.z - previous.z) < 9,
        'the cycle cannot teleport or snap between its travel and turning segments');
      assert.ok(Math.abs(difference(pose.angle, previous.angle)) < .08,
        'the car turns continuously instead of reversing its nose in one frame');
    }
    stations.push(pose.s); heights.push(pose.y - road.elevation); previous = pose;
  }
  near(Math.min(...stations), route.start); near(Math.max(...stations), route.end);
  assert.ok(Math.max(...heights) - Math.min(...heights) > 5, 'the flyover retains a gentle vertical float');
});

test('moving legs point the original +X car nose along travel, and turnarounds remain smooth across every phase boundary', () => {
  setTrack('coast-london');
  const { travelSeconds: travel, turnSeconds: turn } = MAGIC_FLIGHT_ROUTE;
  near(MAGIC_FLIGHT_CYCLE, 2 * (travel + turn));
  const epsilon = .0001;
  for (let time = .02; time < MAGIC_FLIGHT_CYCLE; time += .037) {
    const before = londonMagicFlight(time - epsilon), pose = londonMagicFlight(time), after = londonMagicFlight(time + epsilon);
    const dx = after.x - before.x, dz = after.z - before.z, distance = Math.hypot(dx, dz);
    if (distance > .00001) {
      const alignment = (Math.cos(pose.angle) * dx + Math.sin(pose.angle) * dz) / distance;
      assert.ok(alignment > .999, `car flies sideways or backwards at ${time}`);
    }
  }
  for (const time of [0, travel, travel + turn, 2 * travel + turn, MAGIC_FLIGHT_CYCLE]) {
    const before = londonMagicFlight((time - epsilon + MAGIC_FLIGHT_CYCLE) % MAGIC_FLIGHT_CYCLE);
    const after = londonMagicFlight(time + epsilon);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) < .005);
    assert.ok(Math.abs(difference(after.angle, before.angle)) < .001);
    assert.ok(Math.abs(after.roll - before.roll) < .001);
    assert.ok(Math.abs(after.pitch - before.pitch) < .001);
  }
  for (const time of [0, .1, 3.7, travel, travel + turn / 2, 19.4, MAGIC_FLIGHT_CYCLE - .01]) {
    const first = londonMagicFlight(time), next = londonMagicFlight(time + MAGIC_FLIGHT_CYCLE * 1000);
    for (const key of ['x', 'y', 'z', 's', 'roll', 'pitch']) near(first[key], next[key], 1e-6);
    near(difference(first.angle, next.angle), 0, 1e-7);
  }
});

test('the visual flying car is London-only across all twelve retained maps', () => {
  for (const id of Object.keys(TRACKS)) {
    setTrack(id);
    const items = londonMagicPlacements();
    for (const time of [0, MAGIC_FLIGHT_CYCLE / 3, 1000]) {
      const pose = londonMagicFlight(time), live = londonMagicState(items, time).car;
      if (id === 'coast-london') { assert.ok(pose); assert.deepEqual(live, pose); }
      else { assert.equal(pose, null, id); assert.equal(live, null, id); }
    }
  }
});

function recordingGL() {
  let bound, program, id = 0, viewport;
  const values = new Map();
  const gl = { buffers: new Map(), draws: [], uploads: 0, subloads: 0, creates: 0 };
  for (const name of ['ARRAY_BUFFER', 'STATIC_DRAW', 'DYNAMIC_DRAW', 'TRIANGLES', 'LINES', 'BLEND',
    'SRC_ALPHA', 'ONE', 'ONE_MINUS_SRC_ALPHA']) gl[name] = name;
  for (const name of ['createShader', 'createProgram', 'createBuffer', 'createTexture'])
    gl[name] = () => { gl.creates++; return { id: ++id }; };
  gl.getShaderParameter = gl.getProgramParameter = () => true;
  gl.getAttribLocation = () => 0;
  gl.getUniformLocation = (owner, name) => ({ owner, name });
  gl.useProgram = owner => { program = owner; };
  gl.bindBuffer = (_, buffer) => { bound = buffer; };
  gl.bufferData = (_, data) => { gl.uploads++; gl.buffers.set(bound, data); };
  gl.bufferSubData = () => gl.subloads++;
  gl.deleteBuffer = buffer => gl.buffers.delete(buffer);
  for (const name of ['uniform1f', 'uniform1i', 'uniform3fv']) gl[name] = (location, value) => {
    if (!values.has(location.owner)) values.set(location.owner, {});
    values.get(location.owner)[location.name] = typeof value === 'number' ? value : Array.from(value);
  };
  gl.uniformMatrix4fv = (location, _, matrix) => {
    if (!values.has(location.owner)) values.set(location.owner, {});
    values.get(location.owner)[location.name] = Array.from(matrix);
  };
  gl.viewport = x => { viewport = x; };
  gl.drawArrays = (type, first, count) => gl.draws.push({ buffer: bound, program, viewport, count, type, uniforms: { ...values.get(program) } });
  for (const name of ['shaderSource', 'compileShader', 'attachShader', 'linkProgram', 'deleteShader',
    'bindTexture', 'texImage2D', 'texParameteri', 'depthFunc', 'clearColor', 'enableVertexAttribArray',
    'vertexAttribPointer', 'disableVertexAttribArray', 'activeTexture', 'scissor', 'clear', 'pixelStorei',
    'depthMask', 'blendFunc', 'enable', 'disable']) gl[name] = () => {};
  return gl;
}

function uploadedBounds(data) {
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < data.length; index += 11) for (let axis = 0; axis < 3; axis++) {
    low[axis] = Math.min(low[axis], data[index + axis]);
    high[axis] = Math.max(high[axis], data[index + axis]);
  }
  return Array.from({ length: 8 }, (_, bits) => low.map((value, axis) => bits & (1 << axis) ? high[axis] : value));
}
const transform = (matrix, point) => [0, 1, 2].map(row =>
  matrix[row] * point[0] + matrix[4 + row] * point[1] + matrix[8 + row] * point[2] + matrix[12 + row]);

test('actual rendered car bounds clear road props and cameras for a full cycle; the flyover never enters physical traffic', () => {
  setTrack('coast-london');
  const gl = recordingGL(), renderer = new RaceRenderer({ width: 1440, height: 820, getContext: () => gl, addEventListener() {} });
  assert.equal(renderer.available, true, renderer.error);
  const engine = new RaceEngine();
  engine.setObstacles(renderer.obstacles);
  const obstacles = structuredClone(renderer.obstacles), physicalWorld = engine.obstacleWorld;
  const originalCars = structuredClone(engine.cars), traffic = structuredClone(engine.traffic);
  const mesh = renderer.magicMeshes.car, localCorners = uploadedBounds(gl.buffers.get(mesh.buffer));
  const lamps = roadsideLamps().flatMap(lamp => ['mast', 'arm', 'head', 'lens'].map(key => {
    const { position: p, size: s } = lamp[key];
    return { type: 'box', x: p[0], y: p[2], halfWidth: s[0] / 2, halfDepth: s[2] / 2,
      angle: lamp.angle, minHeight: p[1] - s[1] / 2, maxHeight: p[1] + s[1] / 2 };
  }));
  const initialUploads = gl.uploads, initialCreates = gl.creates;
  let previousCarDraw;
  for (let frame = 0; frame <= 240; frame++) {
    engine.time = frame / 240 * MAGIC_FLIGHT_CYCLE;
    const pose = londonMagicFlight(engine.time);
    // Put both actual chase cameras on the flyover stretch so culling is also
    // exercised. Static scene and physics objects remain the production ones.
    for (const car of engine.cars) Object.assign(car, trackPoint(pose.s - 200));
    renderer.resetCameras(engine);
    gl.draws.length = 0;
    renderer.render(engine, 0, frame * 10000);
    const draws = gl.draws.filter(draw => draw.buffer === mesh.buffer);
    assert.equal(draws.length, 2, 'each player should see the same flying car over this road');
    assert.deepEqual(draws[0].uniforms.uModel, draws[1].uniforms.uModel, 'both views use the same flight clock');
    const matrix = draws[0].uniforms.uModel;
    near(matrix[12], pose.x, .001); near(matrix[13], pose.y, .001); near(matrix[14], pose.z, .001);
    const corners = localCorners.map(point => transform(matrix, point));
    for (const point of corners) {
      const projected = projectTrack(point[0], point[2], pose.s);
      assert.ok(projected.distance < TRACK.roadWidth / 2 - 8, `body overhangs the racing road at ${engine.time}`);
      assert.ok(point[1] - projected.elevation > 120, 'banking and pitching cannot lower wheels into overhead street fittings');
    }
    for (let index = 0; index < 8; index++) for (const bit of [1, 2, 4]) if (!(index & bit)) {
      assert.equal(entrySegmentBlocked(corners[index], corners[index | bit], obstacles, 2), false,
        'the actual oriented vehicle hull intersects scenery');
      assert.equal(entrySegmentBlocked(corners[index], corners[index | bit], lamps, 2), false,
        'the actual oriented vehicle hull intersects a rendered streetlight');
    }
    for (const camera of renderer.cameras)
      assert.ok(Math.hypot(pose.x - camera.eye[0], pose.y - camera.eye[1], pose.z - camera.eye[2]) > 70);
    for (const lane of [-25, 0, 25]) {
      const ground = { ...trackPoint(pose.s, lane), height: 25, speed: 0 };
      assert.equal(physicalWorld.resolveCar(ground), 0, 'flying decoration cannot become a ground traffic obstacle');
    }
    if (previousCarDraw) {
      const dx = pose.x - previousCarDraw.pose.x, dz = pose.z - previousCarDraw.pose.z;
      if (Math.hypot(dx, dz) > 1 && frame % 120 !== 0) {
        const forward = Math.hypot(matrix[0], matrix[2]);
        assert.ok((matrix[0] * dx + matrix[2] * dz) / (forward * Math.hypot(dx, dz)) > .995,
          'the uploaded model matrix must orient its original +X nose along travel');
      }
    }
    previousCarDraw = { pose, matrix };
  }
  assert.equal(gl.uploads, initialUploads, 'flight cannot rebuild its model or the static map');
  assert.equal(gl.creates, initialCreates, 'flight cannot allocate extra GPU objects');
  assert.equal(engine.obstacleWorld, physicalWorld);
  assert.deepEqual(renderer.obstacles, obstacles, 'the flight never adds a collider');
  assert.deepEqual(engine.traffic, traffic, 'the flying Ford is not inserted into driving traffic');
  engine.cars = originalCars;
  engine.time = 7.125; engine.state = 'paused';
  for (const car of engine.cars) Object.assign(car, trackPoint(londonMagicFlight(engine.time).s - 200));
  renderer.resetCameras(engine); renderer.render(engine, .016, 0);
  const paused = structuredClone(renderer.magicState.car), pausedCars = structuredClone(engine.cars);
  renderer.render(engine, .05, 1e12);
  assert.deepEqual(renderer.magicState.car, paused, 'pause is governed by simulation time, not wall time');
  assert.deepEqual(engine.cars, pausedCars, 'rendering the flight never updates the drivers');
  assert.equal(engine.time, 7.125);
  engine.reset();
  for (let step = 0; step <= 30; step++) {
    renderer.setEntryProgress(step / 30).render(engine, 0, 0);
    const { car } = renderer.magicState, eye = renderer.entryCamera.eye;
    assert.ok(Math.hypot(car.x - eye[0], car.y - eye[1], car.z - eye[2]) > 70,
      'the fixed intro-time flight must not pass through any of the three production entry cameras');
  }
});
