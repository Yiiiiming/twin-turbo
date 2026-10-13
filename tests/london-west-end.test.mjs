import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TRACK, RaceEngine, setTrack, trackPoint, projectTrack } from '../engine.js';
import { ObstacleWorld } from '../collisions.js';
import { RaceRenderer, londonLandmarkPlacements, sceneryPlacements, updateChaseCamera } from '../renderer.js';
import { WEST_END_LANDMARKS, addWestEndLandmark } from '../london-west-end.js';

const originalRouteHash = '757fc0db6fe66dd89f80d116da07f7eb284f5e3962c84564f039517b9c679096';
const westEndKinds = new Set(WEST_END_LANDMARKS.map(item => item.kind));
const newLandmarks = () => londonLandmarkPlacements().filter(item => westEndKinds.has(item.kind));
test.afterEach(() => setTrack('coast'));

// Collect the real primitive vertices, including rotated corners and curved roofs.
// Looking only at declared plot dimensions misses overhanging marquees and cornices.
class BoundsMesh {
  constructor(center) {
    this.center = center; this.radius = 0; this.minY = Infinity; this.maxY = -Infinity;
    this.vertices = 0; this.colors = new Set();
  }
  vertex(p) {
    assert.ok(p.every(Number.isFinite), `invalid vertex ${p}`);
    this.radius = Math.max(this.radius, Math.hypot(p[0] - this.center.x, p[2] - this.center.z));
    this.minY = Math.min(this.minY, p[1]); this.maxY = Math.max(this.maxY, p[1]); this.vertices++;
  }
  triangle(a, b, c, color) { [a, b, c].forEach(p => this.vertex(p)); this.colors.add(String(color)); }
  quad(a, b, c, d, color) { [a, b, c, d].forEach(p => this.vertex(p)); this.colors.add(String(color)); }
  box(x, y, z, w, h, d, color, angle = 0) {
    assert.ok(w > 0 && h > 0 && d > 0, 'box dimensions must be positive');
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
      this.vertex([x + Math.cos(angle) * a * w / 2 - Math.sin(angle) * c * d / 2,
        y + b * h / 2, z + Math.sin(angle) * a * w / 2 + Math.cos(angle) * c * d / 2]);
    }
    this.colors.add(String(color));
  }
  cone(x, y, z, r, h, color, sides = 8, top = 0, phase = 0) {
    assert.ok(r > 0 && h > 0 && top >= 0, 'cone dimensions must be positive');
    for (let i = 0; i < sides; i++) for (const up of [false, true]) {
      const a = i / sides * Math.PI * 2 + phase;
      this.vertex([x + Math.cos(a) * (up ? top : r), y + (up ? h : 0), z + Math.sin(a) * (up ? top : r)]);
    }
    this.colors.add(String(color));
  }
  disk(x, y, z, rx, rz, color, sides = 12, angle = 0) {
    for (let i = 0; i < sides; i++) {
      const a = i / sides * Math.PI * 2, dx = Math.cos(a) * rx, dz = Math.sin(a) * rz;
      this.vertex([x + dx * Math.cos(angle) - dz * Math.sin(angle), y, z + dx * Math.sin(angle) + dz * Math.cos(angle)]);
    }
    this.colors.add(String(color));
  }
}

function fakeGL() {
  const gl = { buffers: new Map() }; let bound, id = 0;
  for (const name of ['createShader', 'createProgram', 'createBuffer', 'createTexture']) gl[name] = () => ({ id: ++id });
  gl.getShaderParameter = gl.getProgramParameter = () => true;
  gl.getAttribLocation = () => 0; gl.getUniformLocation = (_, name) => name;
  gl.bindBuffer = (_, buffer) => { bound = buffer; }; gl.bufferData = (_, array) => gl.buffers.set(bound, array);
  for (const name of ['uniformMatrix4fv', 'deleteBuffer', 'drawArrays', 'shaderSource', 'compileShader', 'attachShader',
    'linkProgram', 'deleteShader', 'bindTexture', 'texImage2D', 'texParameteri', 'enable', 'depthFunc', 'disable',
    'clearColor', 'blendFunc', 'enableVertexAttribArray', 'vertexAttribPointer', 'depthMask', 'useProgram',
    'disableVertexAttribArray', 'activeTexture', 'uniform1i', 'uniform1f', 'uniform3fv', 'viewport', 'scissor', 'clear', 'pixelStorei']) gl[name] = () => {};
  return gl;
}

test('West End scenery preserves the complete existing London route and checkpoint configuration', () => {
  setTrack('coast-london');
  const snapshot = JSON.stringify({ track: TRACK, samples: Array.from({ length: 1661 }, (_, i) => trackPoint(i * 10)) });
  assert.equal(createHash('sha256').update(snapshot).digest('hex'), originalRouteHash);
});

test('all four new landmarks have detailed finite geometry inside their reserved roadside plots', () => {
  setTrack('coast-london');
  assert.equal(WEST_END_LANDMARKS.length, 4); assert.equal(westEndKinds.size, 4);
  assert.deepEqual([...westEndKinds].sort(), ['london-palladium', 'palace-theatre', 'piccadilly-circus', 'royal-opera-house']);
  assert.deepEqual(new Set(newLandmarks().map(item => item.kind)), westEndKinds);
  for (const item of newLandmarks()) {
    for (const angle of [item.angle, .713, 2.8]) {
      const mesh = new BoundsMesh(item); addWestEndLandmark(mesh, { ...item, angle });
      assert.ok(mesh.vertices > 500, `${item.kind} needs real architectural geometry`);
      assert.ok(mesh.colors.size >= 4, `${item.kind} needs distinguishable structural materials`);
      assert.ok(mesh.radius <= item.radius + .25, `${item.kind} radius ${mesh.radius} exceeds reserved ${item.radius}`);
      assert.ok(mesh.minY >= -.25 && mesh.maxY > 30, `${item.kind} vertical extent ${mesh.minY}…${mesh.maxY}`);
    }
  }
});

test('new London plots clear every road branch, the river and neighboring architecture', () => {
  setTrack('coast-london'); const all = londonLandmarkPlacements(), street = sceneryPlacements();
  for (const item of newLandmarks()) {
    const nearest = projectTrack(item.x, item.z);
    assert.ok(nearest.distance >= TRACK.roadWidth / 2 + item.radius + 18, `${item.kind} encroaches on road`);
    assert.ok(nearest.distance < 350, `${item.kind} is too distant from the racing view`);
    assert.ok(Math.abs(item.z - TRACK.river.centerZ) >= TRACK.river.halfWidth + item.radius + 24, `${item.kind} is in the river`);
    for (const other of all) if (other.kind !== item.kind) {
      assert.ok(Math.hypot(other.x - item.x, other.z - item.z) >= other.radius + item.radius + 25, `${item.kind}/${other.kind} overlap`);
    }
    for (const other of street) {
      assert.ok(Math.hypot(other.x - item.x, other.z - item.z) >= other.radius + item.radius + 30, `${item.kind}/${other.kind} overlap`);
    }
  }
});

test('each West End facade faces the racecourse instead of showing its back to the drivers', () => {
  setTrack('coast-london');
  for (const item of newLandmarks()) {
    const road = trackPoint(item.s), dx = road.x - item.x, dz = road.y - item.z;
    // The models' detailed front is local −Z. Transform that normal to world space.
    const alignment = (Math.sin(item.angle) * dx - Math.cos(item.angle) * dz) / Math.hypot(dx, dz);
    assert.ok(alignment > .999, `${item.kind} facade is turned away from the road (${alignment})`);
    assert.ok(Math.abs(road.elevation) < .01, `${item.kind} should be on a flat roadside, not a bridge ramp`);
  }
});

test('landmarks are solid, every racing lane remains clear, and the new geometry never intersects chase cameras', () => {
  setTrack('coast-london'); const gl = fakeGL();
  const renderer = new RaceRenderer({ width: 1440, height: 820, getContext: () => gl, addEventListener() {} });
  assert.equal(renderer.available, true, renderer.error);
  let floats = 0;
  for (const data of gl.buffers.values()) {
    floats += data.length;
    for (const value of data) assert.ok(Number.isFinite(value), 'complete GPU mesh contains an invalid value');
  }
  assert.ok(floats < 10_000_000, `${(floats * 4 / 1e6).toFixed(2)} MB exceeds the 40 MB geometry budget`);
  const engine = new RaceEngine({ obstacles: renderer.obstacles });
  const landmarks = newLandmarks();
  // Existing lamps on bridge ramps can already cross a stationary outer-lane
  // camera. This scenery-only change must introduce no new camera obstruction.
  const newObstacles = renderer.obstacles.filter(obstacle => landmarks.some(item =>
    Math.hypot(item.x - obstacle.x, item.z - obstacle.y) <= item.radius));
  const cameraWorld = new ObstacleWorld(newObstacles);
  assert.ok(newObstacles.length > 4, 'new landmark hulls must reach the renderer obstacle world');
  for (const item of landmarks) {
    const probe = { x: item.x, y: item.z, elevation: 0, angle: item.angle, speed: 0, height: 25 };
    assert.ok(engine.obstacleWorld.resolveCar(probe) > 0, `${item.kind} lacks solid physical geometry`);
  }
  for (let s = 0; s < TRACK.length; s += 17) for (const lane of [-30, 0, 30]) {
    const pose = trackPoint(s, lane), car = { ...pose, height: 25, speed: 0 };
    assert.equal(engine.obstacleWorld.resolveCar(car), 0, `car obstructed at ${s}/${lane}`);
    for (const speed of [0, 363, 517]) {
      const camera = updateChaseCamera({ ...pose, speed, boosting: speed === 517 }, null);
      const probe = { x: camera.eye[0], y: camera.eye[2], elevation: camera.eye[1] - 4, height: 8, angle: pose.angle, speed: 0 };
      assert.equal(cameraWorld.resolveCar(probe), 0, `new landmark obstructs camera at ${s}/${lane}/${speed}`);
    }
  }
});
