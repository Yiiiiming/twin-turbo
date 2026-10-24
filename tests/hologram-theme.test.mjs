import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { TRACKS, RaceEngine, setTrack, trackPoint } from '../src/engine.js';
import { RaceRenderer, harborLandmarkPlacements } from '../src/renderer.js';
import { hologramEdges } from '../src/hologram-edges.js';

// Captured from the actual production uploads before the visual-only change,
// not generated from the themed implementation. This is not a route baseline
// and has no update mode. The existing route-lock tests remain authoritative.
const locks = JSON.parse(readFileSync(new URL('./fixtures/hologram-scene-locks.json', import.meta.url), 'utf8'));
const WORLD = ['terrain', 'water', 'road', 'props', 'magic'];
const MODES = { terrain: 1, water: 2, road: 4, 'cars[0]': 5, 'cars[1]': 5 };
const VISIBLE_CITIES = ['coast-london','coast-beijing','coast-shanghai','coast-rio','coast-austin','coast-paris'];
// October 24: the user explicitly added Dumbledore summoning the four house
// banners. Preserve every pre-existing snapshot; allow only these two new,
// nonphysical actor meshes. Cloth reuses the already-reserved spell buffer.
const CEREMONY_MESHES = ['magicActors.dumbledore:body', 'magicActors.dumbledore:arm'];
const sha = data => createHash('sha256').update(data).digest('hex');
const floatHash = data => sha(Buffer.from(data.buffer, data.byteOffset, data.byteLength));

function channelHash(data, offset, width, stride = 11) {
  const channel = new Float32Array(data.length / stride * width);
  for (let vertex = 0, out = 0; vertex < data.length; vertex += stride)
    for (let i = 0; i < width; i++) channel[out++] = data[vertex + offset + i];
  return floatHash(channel);
}

function recordingGL() {
  let id = 0, bound, program, viewport;
  const uniforms = new Map();
  const gl = { buffers: new Map(), draws: [], uploads: [], attributes: [], sources: [] };
  for (const name of ['ARRAY_BUFFER', 'STATIC_DRAW', 'DYNAMIC_DRAW', 'FLOAT', 'TRIANGLES', 'LINES', 'BLEND', 'DEPTH_TEST',
    'SCISSOR_TEST', 'VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS', 'TEXTURE_2D',
    'TEXTURE0', 'TEXTURE1', 'TEXTURE2', 'RGBA', 'UNSIGNED_BYTE', 'CULL_FACE', 'LEQUAL', 'SRC_ALPHA',
    'ONE', 'ONE_MINUS_SRC_ALPHA', 'CLAMP_TO_EDGE', 'LINEAR']) gl[name] = name;
  for (const name of ['createShader', 'createProgram', 'createBuffer', 'createTexture']) gl[name] = () => ({ id: ++id });
  gl.getShaderParameter = gl.getProgramParameter = () => true;
  gl.getAttribLocation = (_, name) => ({ aPosition: 0, aNormal: 1, aColor: 2, aEmission: 3, aUV: 4 })[name];
  gl.getUniformLocation = (owner, name) => ({ owner, name });
  gl.shaderSource = (shader, source) => gl.sources.push({ shader, source });
  gl.bindBuffer = (_, buffer) => { bound = buffer; };
  gl.bufferData = (_, data, usage) => {
    gl.buffers.set(bound, Float32Array.from(data));
    gl.uploads.push({ buffer: bound, usage });
  };
  gl.bufferSubData = (_, offset, data) => gl.buffers.get(bound)?.set(data, offset / 4);
  gl.deleteBuffer = buffer => gl.buffers.delete(buffer);
  gl.useProgram = owner => { program = owner; };
  for (const name of ['uniform1f', 'uniform1i', 'uniform3fv']) gl[name] = (location, value) => {
    uniforms.set(`${location.owner.id}:${location.name}`, typeof value === 'number' ? value : Array.from(value));
  };
  gl.uniformMatrix4fv = (location, transpose, value) => {
    assert.equal(transpose, false);
    assert.ok(Array.from(value).every(Number.isFinite), 'render matrices remain finite');
    uniforms.set(`${location.owner.id}:${location.name}`, Array.from(value));
  };
  gl.vertexAttribPointer = (location, size, type, normalized, stride, offset) => {
    gl.attributes.push({ program, buffer: bound, location, size, type, normalized, stride, offset });
  };
  gl.viewport = (...value) => { viewport = value; };
  gl.drawArrays = (type, first, count) => {
    gl.draws.push({ program, buffer: bound, type, first, count, viewport: viewport.slice() });
  };
  for (const name of ['compileShader', 'attachShader', 'linkProgram', 'deleteShader', 'bindTexture', 'texImage2D',
    'texParameteri', 'enable', 'depthFunc', 'disable', 'clearColor', 'blendFunc', 'enableVertexAttribArray',
    'depthMask', 'disableVertexAttribArray', 'activeTexture', 'scissor', 'clear', 'pixelStorei']) gl[name] = () => {};
  return gl;
}

function scene() {
  const gl = recordingGL();
  const renderer = new RaceRenderer({ width: 1200, height: 700, getContext: () => gl, addEventListener() {} });
  assert.equal(renderer.available, true, renderer.error);
  return { gl, renderer };
}

function meshes(renderer) {
  const result = {};
  for (const [name, mesh] of Object.entries(renderer.meshes)) {
    if (Array.isArray(mesh)) mesh.forEach((entry, i) => { result[`${name}[${i}]`] = entry; });
    else result[name] = mesh;
  }
  for (const [name, mesh] of Object.entries(renderer.magicMeshes)) result[`magicActors.${name}`] = mesh;
  renderer.posterMeshes.forEach((mesh, i) => { result[`posters[${i}]`] = mesh; });
  return result;
}

function assertModes(data, name, expected, landmarkRange) {
  const seen = new Set();
  // The dynamic spell buffer reserves spare capacity, which need not end on
  // a complete triangle. Its active draw count is tested by london-magic.
  if (name !== 'magicActors.effects') assert.equal(data.length % 33, 0);
  for (let offset = 0; offset < data.length; offset += 33) {
    let triangleMode;
    for (let corner = 0; corner < 3 && offset + corner * 11 < data.length; corner++) {
      const vertex = offset / 11 + corner, encoded = data[offset + corner * 11 + 10];
      const mode = Math.floor(encoded / 4), emission = encoded - mode * 4;
      assert.ok(Number.isFinite(encoded) && emission >= 0 && emission <= 1 + 2e-6,
        `${name}: encoded mode cannot corrupt the original emission interval`);
      if (triangleMode === undefined) triangleMode = mode;
      else assert.equal(mode, triangleMode, `${name}: a triangle may not interpolate between material classes`);
      if (name === 'props') {
        const inLandmark = vertex >= landmarkRange[0] && vertex < landmarkRange[1];
        assert.ok(mode === 3 || (mode === 0 && inLandmark) || (mode === 6 && !inLandmark),
          `props vertex ${vertex}: landmark mode 0 is protected and building mode 6 must stay outside its range`);
      } else assert.equal(mode, expected, `${name}: every vertex receives its complete material classification`);
      seen.add(mode);
    }
  }
  if (name === 'props') {
    assert.ok(seen.has(3), 'trees, lamps and barriers must retain the ordinary prop theme');
    assert.equal(seen.has(0), landmarkRange[1] > landmarkRange[0], 'named landmarks remain exempt on each themed map');
  }
}

function assertSceneUnchanged(id, renderer, gl) {
  const expected = locks.tracks[id], actualMeshes = meshes(renderer), owned = new Set();
  const ceremonyNames = id === 'coast-london' ? CEREMONY_MESHES : [];
  assert.deepEqual(Object.keys(actualMeshes).sort(), [...Object.keys(expected.meshes), 'ambientEdges', ...ceremonyNames].sort(),
    `${id}: only the environment edges and explicitly requested London ceremony actor may be added`);
  assert.equal(renderer.obstacles.length, expected.obstacles.count, `${id}: collider count changed`);
  assert.equal(sha(JSON.stringify(renderer.obstacles)), expected.obstacles.sha256,
    `${id}: every collider, order, orientation and height interval must remain unchanged`);
  let bytes = 0;
  for (const [name, lock] of Object.entries(expected.meshes)) {
    const mesh = actualMeshes[name], data = mesh.buffer ? gl.buffers.get(mesh.buffer) : new Float32Array();
    assert.ok(data instanceof Float32Array, `${id}/${name}: production buffer is missing`);
    assert.equal(data.length, lock.vertices * (lock.stride || 11), `${id}/${name}: geometry count changed`);
    if (mesh.buffer) owned.add(mesh.buffer);
    bytes += data.byteLength;
    if (lock.stride === 11) {
      assert.equal(channelHash(data, 0, 3), lock.positions, `${id}/${name}: actual world-space vertices moved`);
      assert.equal(channelHash(data, 3, 3), lock.normals, `${id}/${name}: normals or winding changed`);
      assert.equal(channelHash(data, 6, 4), lock.rgba, `${id}/${name}: original paint or opacity was overwritten`);
      assertModes(data, name, MODES[name] || 0, expected.landmarkVertices);
    }
    if (lock.raw) assert.equal(floatHash(data), lock.raw,
      `${id}/${name}: protected models, posters and effects must remain byte-for-byte identical`);
  }
  const edges = actualMeshes.ambientEdges, edgeData = gl.buffers.get(edges.buffer);
  assert.ok(edgeData instanceof Float32Array && edgeData.length > 0, `${id}: environment edge mesh is missing`);
  assert.equal(edgeData.length % 22, 0, 'each edge consists of two vertices in the original eleven-float format');
  assert.equal(edges.count, edgeData.length / 11);
  assert.ok(edgeData.every(Number.isFinite), 'environment edge vertices and material channels stay finite');
  owned.add(edges.buffer); bytes += edgeData.byteLength;
  let ceremonyBytes = 0;
  for (const name of ceremonyNames) {
    const mesh = actualMeshes[name], data = gl.buffers.get(mesh.buffer);
    assert.ok(data instanceof Float32Array && data.length > 0, `${name}: missing actor geometry`);
    assert.equal(mesh.count, data.length / 11);
    assert.ok(data.every(Number.isFinite), `${name}: finite geometry is required`);
    assertModes(data, name, 0, expected.landmarkVertices);
    owned.add(mesh.buffer); ceremonyBytes += data.byteLength;
  }
  assert.ok(ceremonyBytes < 35_000, 'the new actor must leave room for all six ghosts under the unchanged 40 MB cap');
  bytes += ceremonyBytes;
  const extras = [...gl.buffers].filter(([buffer]) => !owned.has(buffer)).map(([, data]) => ({ floats: data.length, raw: floatHash(data) }));
  assert.deepEqual(extras, expected.otherUploads, `${id}: no additional geometry upload beyond the single edge batch`);
  bytes += extras.reduce((sum, entry) => sum + entry.floats * 4, 0);
  return bytes;
}

test.afterEach(() => setTrack('coast'));

function surfaceQuad(points, mode = 3) {
  // Identical lighting normals deliberately exercise geometric hard-edge
  // detection rather than treating artist-supplied normal overrides as topology.
  return [0, 1, 2, 0, 2, 3].flatMap(i => [...points[i], 0, 1, 0, .3, .4, .5, 1, mode * 4 + .25]);
}
const edgeKey = (a, b) => [a.join(','), b.join(',')].sort().join('|');
function edgeKeys(data) {
  const keys = [];
  for (let i = 0; i < data.length; i += 22)
    keys.push(edgeKey(Array.from(data.slice(i, i + 3)), Array.from(data.slice(i + 11, i + 14))));
  return keys;
}

test('environment outlines ignore landmarks, remove flat diagonals and retain real hard folds without modifying input', () => {
  const a = [0, 0, 0], b = [100, 0, 0], c = [100, 0, 100], d = [0, 0, 100];
  const flat = Float32Array.from(surfaceQuad([a, b, c, d])), before = flat.slice();
  const outline = hologramEdges(flat).data;
  assert.deepEqual(edgeKeys(outline).sort(), [edgeKey(a, b), edgeKey(b, c), edgeKey(c, d), edgeKey(d, a)].sort());
  assert.equal(edgeKeys(outline).includes(edgeKey(a, c)), false, 'the triangulation diagonal is not a luminous structure');
  assert.deepEqual(flat, before, 'edge extraction never changes the actual solid scene');
  for (const mode of [0, 1, 2, 4, 5]) {
    assert.equal(hologramEdges(Float32Array.from(surfaceQuad([a, b, c, d], mode))).data.length, 0,
      `material ${mode}: only ordinary props and buildings receive this extra edge pass`);
  }
  const mixed = Float32Array.from([...flat, ...surfaceQuad([a, b, c, d], 0)]);
  assert.deepEqual(hologramEdges(mixed).data, outline, 'coincident landmark faces cannot add lines or suppress environmental edges');
  const folded = Float32Array.from([...flat, ...surfaceQuad([a, b, [100, 100, 0], [0, 100, 0]])]);
  const keys = edgeKeys(hologramEdges(folded).data);
  assert.equal(keys.length, 7, 'two quads keep their six outer sides plus their shared hard crease');
  assert.equal(keys.filter(key => key === edgeKey(a, b)).length, 1, 'the physical ninety-degree crease survives exactly once');
});

test('ordinary building outlines retain the same geometry, brighten only their own lines and exempt landmarks and cars', () => {
  const points=[[0,0,0],[100,0,0],[100,100,0],[0,100,0]];
  const props=hologramEdges(Float32Array.from(surfaceQuad(points,3))).data;
  const building=Float32Array.from(surfaceQuad(points,6)),before=building.slice();
  const outlines=hologramEdges(building).data;
  assert.deepEqual(edgeKeys(outlines),edgeKeys(props),'the brighter architectural pass adds no lines or triangulation diagonals');
  assert.deepEqual(building,before,'building classification never edits its solid mesh');
  for(let i=0;i<outlines.length;i+=11){
    assert.deepEqual(outlines.slice(i,i+6),props.slice(i,i+6));
    for(let color=6;color<9;color++){
      assert.ok(outlines[i+color]>props[i+color]);
      assert.ok(outlines[i+color]<props[i+color]*1.3,'the extra building illumination stays modest');
    }
    assert.equal(outlines[i+9],1,'outlines stay opaque');assert.equal(outlines[i+10],1,'outlines use the existing emissive pass');
  }
  const withProtected=Float32Array.from([...building,...surfaceQuad(points,0),...surfaceQuad(points,5)]);
  assert.deepEqual(hologramEdges(withProtected).data,outlines,'coincident landmarks and player cars neither add nor suppress building edges');
  const mixed=building.slice(0,33);mixed[21]=12.25;
  assert.equal(hologramEdges(mixed).data.length,0,'a triangle cannot mix ordinary-prop and building classes');
});

test('dense environment outlines are deterministic and leave room for the complete six-ghost challenge', () => {
  const source = [];
  for (let i = 0; i < 4096; i++) {
    const x = i * 300;
    source.push(...surfaceQuad([[x, 0, 0], [x + 100, 0, 0], [x + 100, 0, 100], [x, 0, 100]],i%2?6:3));
  }
  const input = Float32Array.from(source), before = input.slice(), result = hologramEdges(input).data;
  assert.ok(result.length > 0);
  assert.ok(result.byteLength <= 792_000, 'a dense city cannot allocate more than 9,000 two-vertex edges');
  assert.equal(result.length % 22, 0);
  assert.deepEqual(hologramEdges(input).data, result, 'rebuilding the same city produces identical line selection and color');
  const reversed = [];
  for (let i = source.length - 33; i >= 0; i -= 33) reversed.push(...source.slice(i, i + 33));
  assert.deepEqual(hologramEdges(Float32Array.from(reversed)).data, result, 'the budget cannot depend on incidental triangle insertion order');
  assert.deepEqual(input, before);
});

test('the visual-theme regression covers all twelve accepted maps', () => {
  assert.equal(locks.schemaVersion, 1);
  assert.equal(Object.keys(locks.tracks).length, 12);
  assert.deepEqual(Object.keys(locks.tracks).sort(), Object.keys(TRACKS).sort());
});

for (const id of Object.keys(locks.tracks)) test(`${id}: production geometry, collisions, original paint and material coverage are preserved`, () => {
  setTrack(id);
  const { renderer, gl } = scene();
  const bytes = assertSceneUnchanged(id, renderer, gl);
  const data = gl.buffers.get(renderer.meshes.props.buffer);
  if(VISIBLE_CITIES.includes(id))assert.ok(data.some((value,i)=>i%11===10&&Math.floor(value/4)===6),
    `${id}: actual uploaded ordinary buildings must receive their separate laser projection material`);
  // Inspect real uploaded vertices at every declared landmark, in addition to
  // the complete channel hashes. A material switch accidentally wrapping only
  // the first landmark must not pass because other protected objects exist.
  for (const landmark of harborLandmarkPlacements()) {
    const radius = landmark.radius || 150;
    // The old placement catalog also contains a parked bus. It is an ordinary
    // vehicle, explicitly included in the new environment theme, not a building.
    const expectedMode = landmark.kind === 'london-bus' ? 3 : 0;
    let matchingVertices = 0;
    for (let i = locks.tracks[id].landmarkVertices[0] * 11; i < locks.tracks[id].landmarkVertices[1] * 11; i += 11) {
      if (Math.floor(data[i + 10] / 4) === expectedMode && data[i + 1] > (landmark.elevation || 0) + 12
        && Math.hypot(data[i] - landmark.x, data[i + 2] - landmark.z) <= radius) matchingVertices++;
    }
    assert.ok(matchingVertices >= 3, `${id}/${landmark.kind}: recognizable above-ground model must retain material class ${expectedMode}`);
  }
  const engine = new RaceEngine(), before = structuredClone(engine.cars), uploadCount = gl.uploads.length;
  // Texture readiness is independent of environment classification. Exercise
  // the real poster program as well as the world buffers, after artwork loads.
  for (const poster of renderer.posterMeshes) renderer.textures[poster.textureKey].ready = 1;
  renderer.render(engine, 1 / 60, 1);
  renderer.render(engine, 1 / 60, 2);
  assert.equal(gl.uploads.length, uploadCount, `${id}: animation must not re-upload static geometry each frame`);
  assert.deepEqual(engine.cars, before, 'rendering never mutates driving or fuel state');
  for (const name of WORLD) {
    const mesh = renderer.meshes[name];
    if (!mesh.count) continue;
    assert.equal(gl.draws.filter(draw => draw.buffer === mesh.buffer).length, 4,
      `${id}/${name}: exactly one batched draw per viewport per frame; no duplicate wireframe pass`);
  }
  const edges = gl.draws.filter(draw => draw.buffer === renderer.meshes.ambientEdges.buffer);
  assert.equal(edges.length, 4, 'exactly one environment edge draw per viewport per frame');
  assert.ok(edges.every(draw => draw.type === gl.LINES), 'hard edges render as lines, never duplicate solid triangles');
  for (const attribute of gl.attributes.filter(call => call.program === renderer.mainProgram)) {
    assert.equal(attribute.stride, 44, 'mode encoding must reuse the existing eleven-float vertex format');
    assert.equal(attribute.normalized, false);
  }
  const posters = gl.draws.filter(draw => draw.program === renderer.posterProgram);
  assert.equal(posters.length, renderer.posterMeshes.length * 4, 'landmark artwork keeps its separate unchanged material pass');
  assert.ok(bytes < 40_000_000, `${id}: ${(bytes / 1e6).toFixed(3)} MB exceeds the unchanged 40 MB geometry limit`);
});

for (const sample of [
  { id: 'coast-london', s: 1200, solo: 13, split: 26 },
  { id: 'coast-london', s: 6940, solo: 22, split: 44 },
  { id: 'coast-pines', s: 1200, solo: 11, split: 22 },
]) test(`${sample.id} at ${sample.s}: hologram shading adds exactly one edge draw per viewport`, () => {
  setTrack(sample.id);
  const { renderer, gl } = scene(), engine = new RaceEngine(), position = trackPoint(sample.s);
  for (const car of engine.cars) Object.assign(car, position, { _lastTrackS: sample.s });
  for (const [single, expected] of [[true, sample.solo], [false, sample.split]]) {
    renderer.setSinglePlayer(single);
    gl.draws.length = 0;
    renderer.render(engine, 1 / 60, 1);
    const ceremonyBuffers = new Set(['dumbledore:body', 'dumbledore:arm'].map(name => renderer.magicMeshes[name]?.buffer).filter(Boolean));
    const ceremonyDraws = gl.draws.filter(draw => ceremonyBuffers.has(draw.buffer));
    assert.ok(ceremonyDraws.length <= (single ? 2 : 4), 'each new actor part may render at most once per viewport');
    assert.equal(gl.draws.length - ceremonyDraws.length, expected + (single ? 1 : 2),
      'measured pre-theme count plus one edge batch, with no ghosts or loaded artwork');
  }
});

test('switching city and restoring cinematic views cannot lose the theme or retain an extra render pass', () => {
  setTrack('coast-london');
  const { renderer, gl } = scene(), engine = new RaceEngine();
  engine.selectTrack('coast-pines'); renderer.rebuild(engine);
  const bytes = assertSceneUnchanged('coast-pines', renderer, gl);
  const uploads = gl.uploads.length;
  for (const progress of [0, .5, 1]) {
    gl.draws.length = 0;
    renderer.setEntryProgress(progress).render(engine, 1 / 60, 1);
    const props = gl.draws.filter(draw => draw.buffer === renderer.meshes.props.buffer);
    assert.equal(props.length, 1, 'each cinematic shot uses one complete scene draw');
    assert.deepEqual(props[0].viewport, [0, 0, 1200, 700]);
  }
  gl.draws.length = 0;
  renderer.setEntryProgress(null).render(engine, 1 / 60, 2);
  assert.equal(gl.draws.filter(draw => draw.buffer === renderer.meshes.props.buffer).length, 2, 'local split view resumes without a duplicated scene');
  assert.equal(gl.uploads.length, uploads, 'camera shots and mode changes only update uniforms');
  assert.ok(bytes < 40_000_000, 'switching maps preserves the existing hard GPU limit');
});

test('London stays under 40 MB after all six challenge ghost colors are actually uploaded and drawn', () => {
  setTrack('coast-london');
  const { renderer, gl } = scene(), engine = new RaceEngine();
  engine.setPlayerCount(1);
  renderer.setSinglePlayer(true);
  const car = engine.cars[0];
  renderer.setGhostPoses([Array.from({ length: 6 }, (_, slotId) => ({
    slotId, x: car.x + slotId * 12, y: car.y + 70, angle: car.angle, elevation: car.elevation,
  }))]);
  renderer.render(engine, 1 / 60, 1);
  assert.equal(renderer.ghostMeshes.length, 6, 'exercise the real four lazy uploads, not only the initial two ghost meshes');
  const ghostBuffers = new Set(renderer.ghostMeshes.map(mesh => mesh.buffer));
  assert.equal(gl.draws.filter(draw => ghostBuffers.has(draw.buffer)).length, 6);
  const bytes = [...gl.buffers.values()].reduce((sum, data) => sum + data.byteLength, 0);
  assert.ok(bytes < 40_000_000, `${(bytes / 1e6).toFixed(3)} MB: the full default challenge must fit the unchanged limit`);
  const uploads = gl.uploads.length;
  renderer.render(engine, 1 / 60, 2);
  assert.equal(gl.uploads.length, uploads, 'extra colors upload once and are reused on following frames');
});
