import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TRACK, setTrack, trackPoint, projectTrack } from '../engine.js';
import { ObstacleWorld } from '../collisions.js';
import { RaceRenderer, londonLandmarkPlacements, sceneryPlacements, updateChaseCamera } from '../renderer.js';
import { ROYAL_LANDMARKS, addRoyalLandmark } from '../london-royal-landmarks.js';
import { RIVERSIDE_LANDMARKS, addRiversideLandmark } from '../london-riverside-landmarks.js';

const additions = [...ROYAL_LANDMARKS, ...RIVERSIDE_LANDMARKS];
const kinds = new Set(additions.map(item => item.kind));
const addedPlots = () => londonLandmarkPlacements().filter(item => kinds.has(item.kind));
const addModel = (mesh, item) => (ROYAL_LANDMARKS.some(model => model.kind === item.kind) ? addRoyalLandmark : addRiversideLandmark)(mesh, item);
test.afterEach(() => setTrack('coast'));

// Measure generated vertices, not descriptor dimensions: roofs, columns and
// projecting cornices must all stay within each plot after arbitrary rotation.
class GeometryProbe {
  constructor(center) { this.center = center; this.radius = 0; this.minY = Infinity; this.maxY = -Infinity; this.vertices = 0; this.colors = new Set(); this.colliders = []; }
  vertex(p) {
    assert.ok(p.every(Number.isFinite), `non-finite vertex ${p}`);
    this.radius = Math.max(this.radius, Math.hypot(p[0] - this.center.x, p[2] - this.center.z));
    this.minY = Math.min(this.minY, p[1]); this.maxY = Math.max(this.maxY, p[1]); this.vertices++;
  }
  triangle(a, b, c, color) { [a, b, c].forEach(p => this.vertex(p)); this.colors.add(String(color)); }
  quad(a, b, c, d, color) { [a, b, c, d].forEach(p => this.vertex(p)); this.colors.add(String(color)); }
  box(x, y, z, w, h, d, color, angle = 0) {
    assert.ok(w > 0 && h > 0 && d > 0, 'nonpositive box dimensions');
    const c = Math.cos(angle), s = Math.sin(angle);
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const e of [-1, 1]) this.vertex([x + c * a * w / 2 - s * e * d / 2, y + b * h / 2, z + s * a * w / 2 + c * e * d / 2]);
    this.colors.add(String(color));
    if (this.colliders && y + h / 2 > 0) this.colliders.push({ type: 'box', x, y: z, halfWidth: w / 2, halfDepth: d / 2, angle, minHeight: y - h / 2, maxHeight: y + h / 2 });
  }
  cone(x, y, z, r, h, color, sides = 8, top = 0, phase = 0) {
    assert.ok(r > 0 && h > 0 && top >= 0, 'nonpositive curved dimensions');
    for (let i = 0; i < sides; i++) for (const upper of [false, true]) {
      const a = i / sides * Math.PI * 2 + phase, radius = upper ? top : r;
      this.vertex([x + Math.cos(a) * radius, y + (upper ? h : 0), z + Math.sin(a) * radius]);
    }
    this.colors.add(String(color));
    if (this.colliders && y + h > 0) this.colliders.push({ type: 'circle', x, y: z, radius: Math.max(r, top), minHeight: y, maxHeight: y + h });
  }
  disk(x, y, z, rx, rz, color, sides = 12, angle = 0) {
    for (let i = 0; i < sides; i++) { const a = i / sides * Math.PI * 2, dx = Math.cos(a) * rx, dz = Math.sin(a) * rz; this.vertex([x + dx * Math.cos(angle) - dz * Math.sin(angle), y, z + dx * Math.sin(angle) + dz * Math.cos(angle)]); }
    this.colors.add(String(color));
  }
}

function fakeGL() {
  const gl = { buffers: new Map() }; let bound, id = 0;
  for (const name of ['createShader', 'createProgram', 'createBuffer', 'createTexture']) gl[name] = () => ({ id: ++id });
  gl.getShaderParameter = gl.getProgramParameter = () => true;
  gl.getAttribLocation = () => 0; gl.getUniformLocation = (_, name) => name;
  gl.bindBuffer = (_, buffer) => { bound = buffer; }; gl.bufferData = (_, array) => gl.buffers.set(bound, array);
  for (const name of ['uniformMatrix4fv', 'deleteBuffer', 'drawArrays', 'shaderSource', 'compileShader', 'attachShader', 'linkProgram', 'deleteShader', 'bindTexture', 'texImage2D', 'texParameteri', 'enable', 'depthFunc', 'disable', 'clearColor', 'blendFunc', 'enableVertexAttribArray', 'vertexAttribPointer', 'depthMask', 'useProgram', 'disableVertexAttribArray', 'activeTexture', 'uniform1i', 'uniform1f', 'uniform3fv', 'viewport', 'scissor', 'clear', 'pixelStorei']) gl[name] = () => {};
  return gl;
}

test('five additions preserve the London course and every existing West End plot', () => {
  setTrack('coast-london');
  const snapshot = JSON.stringify({ track: TRACK, samples: Array.from({ length: 1661 }, (_, i) => trackPoint(i * 10)) });
  assert.equal(createHash('sha256').update(snapshot).digest('hex'), '17bacb9b4fbcd7c8d603caf6d3a751ddf2bef00139593151c5114650c86f52be');
  for (const [kind, s, side, radius] of [['palace-theatre', 1900, -1, 128], ['london-palladium', 3500, -1, 135], ['royal-opera-house', 5500, 1, 145], ['piccadilly-circus', 11300, 1, 150]]) {
    const item = londonLandmarkPlacements().find(item => item.kind === kind), p = trackPoint(s, side * (radius + 94));
    assert.ok(item, `${kind} was removed`);
    assert.deepEqual({ s: item.s, side: item.side, radius: item.radius, x: item.x, z: item.z, angle: item.angle }, { s, side, radius, x: p.x, z: p.y, angle: p.angle + (side < 0 ? Math.PI : 0) });
  }
});

test('five distinct buildings have finite architectural detail within their rotated plots', () => {
  setTrack('coast-london');
  assert.equal(additions.length, 5);
  assert.deepEqual([...kinds].sort(), ['british-museum', 'buckingham-palace', 'shakespeares-globe', 'st-pauls-cathedral', 'westminster-abbey']);
  assert.deepEqual(new Set(addedPlots().map(item => item.kind)), kinds);
  for (const item of addedPlots()) for (const angle of [item.angle, .713, 2.8]) {
    const mesh = new GeometryProbe(item); addModel(mesh, { ...item, angle, elevation: 17 });
    assert.ok(mesh.vertices > 1000, `${item.kind} has insufficient architectural detail`);
    assert.ok(mesh.colors.size >= 4, `${item.kind} lacks distinct structural materials`);
    assert.ok(mesh.radius <= item.radius + .25, `${item.kind}: actual radius ${mesh.radius} exceeds reserved ${item.radius}`);
    assert.ok(mesh.minY >= 16.75 && mesh.maxY > 77, `${item.kind}: invalid transformed height ${mesh.minY}…${mesh.maxY}`);
    assert.ok(mesh.colliders.length > 0, `${item.kind} has no solid hull`);
  }
});

test('new facades face the street and clear other buildings, all road branches and the river', () => {
  setTrack('coast-london'); const all = londonLandmarkPlacements(), street = sceneryPlacements();
  for (const item of addedPlots()) {
    const nearest = projectTrack(item.x, item.z), road = trackPoint(item.s), dx = road.x - item.x, dz = road.y - item.z;
    assert.ok(nearest.distance >= TRACK.roadWidth / 2 + item.radius + 25, `${item.kind} enters a road clearance zone`);
    assert.ok(nearest.distance < 350, `${item.kind} is too far from the racing view`);
    assert.ok(Math.abs(item.z - TRACK.river.centerZ) >= TRACK.river.halfWidth + item.radius + 25, `${item.kind} is in the river`);
    assert.ok((Math.sin(item.angle) * dx - Math.cos(item.angle) * dz) / Math.hypot(dx, dz) > .999, `${item.kind} shows its rear to drivers`);
    assert.ok(Math.abs(road.elevation) < .01, `${item.kind} is placed on a bridge ramp`);
    for (const other of all) if (other.kind !== item.kind) assert.ok(Math.hypot(other.x - item.x, other.z - item.z) >= other.radius + item.radius + 25, `${item.kind}/${other.kind} overlap`);
    for (const other of street) assert.ok(Math.hypot(other.x - item.x, other.z - item.z) >= other.radius + item.radius + 30, `${item.kind}/${other.kind} overlap`);
  }
});

test('real landmark hulls are rendered and solid while the Globe courtyard remains open', () => {
  setTrack('coast-london'); const gl = fakeGL();
  const renderer = new RaceRenderer({ width: 1440, height: 820, getContext: () => gl, addEventListener() {} });
  assert.equal(renderer.available, true, renderer.error);
  let floats = 0;
  for (const data of gl.buffers.values()) { floats += data.length; for (const value of data) assert.ok(Number.isFinite(value), 'complete GPU mesh contains an invalid value'); }
  assert.ok(floats < 10_000_000, `${(floats * 4 / 1e6).toFixed(2)} MB exceeds the existing 40 MB geometry budget`);
  const allHulls = [];
  for (const item of addedPlots()) {
    const mesh = new GeometryProbe(item); addModel(mesh, item); allHulls.push(...mesh.colliders);
    for (const hull of mesh.colliders) {
      assert.ok(renderer.obstacles.some(actual => Object.entries(hull).filter(([key]) => key !== 'id').every(([key, value]) => typeof value === 'number' ? Math.abs(actual[key] - value) < 1e-7 : actual[key] === value)), `${item.kind} hull was omitted from the renderer`);
    }
    const groundHull = mesh.colliders.find(hull => hull.minHeight < 25 && hull.maxHeight > 0);
    assert.ok(groundHull, `${item.kind} has no solid structure at car height`);
    const world = new ObstacleWorld(mesh.colliders), car = { x: groundHull.x, y: groundHull.y, angle: item.angle, speed: 0, elevation: 0, height: 25 };
    assert.ok(world.resolveCar(car) > 0, `${item.kind} ground hull is not solid`);
    if (item.kind === 'shakespeares-globe') assert.equal(world.resolveCar({ x: item.x, y: item.z, angle: item.angle, speed: 0, elevation: 0, height: 25 }), 0, 'open-air courtyard must not have an invisible solid cylinder');
  }
  // Isolate only the new hulls, so a pre-existing street lamp cannot conceal a
  // regression or falsely implicate these scenery additions.
  const world = new ObstacleWorld(allHulls);
  for (let s = 0; s < TRACK.length; s += 17) for (const lane of [-30, 0, 30]) {
    const pose = trackPoint(s, lane);
    assert.equal(world.resolveCar({ ...pose, height: 25, speed: 0 }), 0, `new hull obstructs car at ${s}/${lane}`);
    for (const speed of [0, 363, 517]) {
      const camera = updateChaseCamera({ ...pose, speed, boosting: speed === 517 }, null);
      assert.equal(world.resolveCar({ x: camera.eye[0], y: camera.eye[2], elevation: camera.eye[1] - 4, height: 8, angle: pose.angle, speed: 0 }), 0, `new hull obstructs chase camera at ${s}/${lane}/${speed}`);
    }
  }
});
