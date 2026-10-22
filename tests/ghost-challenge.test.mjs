import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGE_COLORS, PACE_DELAYS_MS, paceReplay, createGhostChallenge, loadGhostChallenge } from '../ghost-challenge.js';
import { validateReplay, validateRaceReplay, sampleReplay, ghostVersionForCity } from '../ghost-replay.js';
import { RaceEngine, TRACK, setTrack, trackPoint } from '../engine.js';
import { RaceAI } from '../ai.js';
import { RaceRenderer } from '../renderer.js';

function replay(timeMs = 39000, laps = 1) {
  const frames = [];
  for (let time = 0; time < timeMs; time += 100) {
    const phase = time / timeMs * Math.PI * 2 * laps;
    frames.push([time, 1000 * Math.cos(phase), 1000 * Math.sin(phase), Math.atan2(Math.cos(phase), -Math.sin(phase)), 20 + Math.sin(phase) * 10]);
  }
  frames.push([timeMs, 1000, 0, Math.PI / 2, 20]);
  return { version: 1, durationMs: timeMs, frames,
    ...(laps === 3 ? { kind: 'race', laps, lapEndsMs: [Math.round(timeMs / 3), Math.round(timeMs * 2 / 3), timeMs] } : {}) };
}
let nextId = 0;
function candidate(name, timeMs = 39000, laps = 1, id = `record-${++nextId}`) {
  return { entry: { id, name, timeMs, playerId: 1, mode: 'ai',
    ...(laps === 3 ? { kind: 'race', laps: 3 } : {}) }, replay: replay(timeMs, laps) };
}

test('challenge takes three fastest different human names and three slower pace ghosts without mutating history', () => {
  const input = [candidate('Alice', 40000), candidate('Bob', 39000), candidate('ＡLICE', 37000), candidate('Carol', 38000), candidate('Dave', 41000)];
  const original = structuredClone(input), result = createGhostChallenge(input);
  assert.deepEqual(result.ghosts.slice(0, 3).map(g => g.entry.name), ['ＡLICE', 'Carol', 'Bob']);
  assert.equal(result.humanCount, 3); assert.equal(result.paceCount, 3);
  assert.deepEqual(result.ghosts.slice(3).map(g => g.targetMs), PACE_DELAYS_MS.map(delay => 39000 + delay));
  assert.equal(new Set(result.ghosts.map(g => g.color)).size, 6);
  assert.deepEqual(result.ghosts.map(g => g.slotId), [0, 1, 2, 3, 4, 5]);
  assert.ok(result.ghosts.slice(3).every(g => g.synthetic && g.entry.isHuman === false && g.entry.playerId === 0));
  result.ghosts[0].replay.frames[0][1] = 9999;
  assert.deepEqual(input, original, 'rendering or selection cannot change a stored attempt');
});

test('pace replay preserves the driven path and all three lap boundaries on a stretched clock', () => {
  for (const laps of [1, 3]) {
    const original = replay(laps === 1 ? 39000 : 117000, laps), saved = structuredClone(original);
    const paced = paceReplay(original, original.durationMs + 3070);
    assert.ok(laps === 1 ? validateReplay(paced) : validateRaceReplay(paced));
    const ratio = paced.durationMs / original.durationMs;
    for (const frame of paced.frames) {
      const index = paced.lapEndsMs?.indexOf(frame[0]) ?? -1;
      const sourceTime = frame[0] === paced.durationMs ? original.durationMs : index >= 0 ? original.lapEndsMs[index] : frame[0] / ratio;
      const pose = sampleReplay(original, sourceTime);
      assert.ok(Math.hypot(frame[1] - pose.x, frame[2] - pose.y) < 1e-7);
      assert.ok(Math.abs(frame[4] - pose.elevation) < 1e-7);
    }
    assert.deepEqual(original, saved);
    assert.equal(sampleReplay(paced, paced.durationMs + 1), null, 'finished ghosts never wrap around');
    if (laps === 3) assert.deepEqual(paced.lapEndsMs, original.lapEndsMs.map(t => Math.round(t * ratio)));
  }
});

test('empty and partially populated boards do not invent human records', () => {
  assert.deepEqual(createGhostChallenge([]), { laps: 1, ghosts: [], humanCount: 0, paceCount: 0 });
  for (const n of [1, 2]) {
    const challenge = createGhostChallenge(Array.from({ length: n }, (_, i) => candidate(`Racer${i}`, 39000 + i * 1000)));
    assert.equal(challenge.humanCount, n); assert.equal(challenge.paceCount, 3);
    assert.equal(challenge.ghosts.length, n + 3);
  }
  const invalid = candidate('Robot'); invalid.entry.playerId = 2;
  const mismatch = candidate('Mismatch'); mismatch.entry.timeMs++;
  assert.equal(createGhostChallenge([invalid, mismatch]).ghosts.length, 0);
});

test('loader uses the selected city and race version, skips broken replays and never submits a score', async () => {
  for (const city of ['coast-london', 'coast-beijing', 'coast-shanghai', 'coast-austin']) for (const laps of [1, 3]) {
    const version = ghostVersionForCity(city, laps), start = laps === 3 ? 117000 : 39000;
    const candidates = [candidate('Missing', start - 1000, laps), candidate('First', start, laps), candidate('Second', start + 1000, laps), candidate('Third', start + 2000, laps)];
    const requests = [];
    const fetchImpl = async (input, options) => {
      const url = new URL(input); requests.push(url.pathname);
      assert.equal(options.method, undefined); assert.equal(url.searchParams.get('city'), city); assert.equal(url.searchParams.get('version'), version);
      if (url.pathname === '/api/laps') return { ok: true, json: async () => ({ city, version, entries: candidates.map(c => c.entry) }) };
      const item = candidates.find(c => url.pathname.endsWith(c.entry.id));
      if (item.entry.name === 'Missing') return { ok: false };
      return { ok: true, json: async () => ({ city, version, ...item }) };
    };
    const result = await loadGhostChallenge({ city, laps, fetchImpl });
    assert.equal(result.humanCount, 3); assert.equal(result.failedCount, 1); assert.equal(result.ghosts.length, 6);
    assert.equal(requests.length, 5); assert.ok(result.ghosts.every(g => laps === 3 ? validateRaceReplay(g.replay) : validateReplay(g.replay)));
  }
});

test('loader rejects category mismatch and supports canceling an in-flight preparation', async () => {
  await assert.rejects(loadGhostChallenge({ city: 'coast', fetchImpl: async () => ({ ok: true, json: async () => ({ city: 'coast-london', version: 'coast-ghost-v1', entries: [] }) }) }), /category mismatch/);
  const controller = new AbortController();
  const promise = loadGhostChallenge({ city: 'coast', signal: controller.signal, fetchImpl: (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })) });
  controller.abort(); await assert.rejects(promise, /cancelled/);
});

test('solo uses one physical car, preserves the starting grid, and local mode restores both racers', () => {
  setTrack('coast'); const engine = new RaceEngine(), start = structuredClone(engine.cars[0]);
  engine.setPlayerCount(1); assert.equal(engine.cars.length, 1); assert.deepEqual(engine.cars[0], start);
  engine.start(1); for (let i = 0; i < 30; i++) engine.step(.1);
  assert.doesNotThrow(() => engine.step(.1, new Set(['KeyW']))); assert.equal(engine.cars.length, 1);
  assert.throws(() => engine.setPlayerCount(2), /before starting/);
  engine.reset().setPlayerCount(2); assert.deepEqual(engine.cars.map(c => c.id), [1, 2]);
  assert.deepEqual(engine.cars[0], start);
  engine.setPlayerCount(1).selectTrack('coast-london'); assert.equal(engine.cars.length, 1);
  setTrack('coast');
});

test('a real one-car race concludes when its human finishes one or three laps', () => {
  setTrack('coast');
  for (const laps of [1, 3]) {
    const engine = new RaceEngine({ playerCount: 1 }).start(laps);
    // The existing deterministic driver is a test-only source of human keys;
    // challenge gameplay does not instantiate it or create a second car.
    const driver = new RaceAI({ carId: 1 });
    for (let step = 0; step < 60 * 220 && engine.state !== 'finished'; step++) engine.step(1 / 60, driver.update(engine));
    assert.equal(engine.state, 'finished'); assert.equal(engine.cars.length, 1);
    assert.equal(engine.winner, engine.cars[0]); assert.equal(engine.cars[0].lap, laps);
    assert.equal(engine.time, engine.cars[0].finishTime); assert.equal(driver.rescues, 0);
  }
});

test('solo renderer retains six independently colored poses without touching physical cars; local still limits to two', () => {
  const renderer = Object.create(RaceRenderer.prototype); renderer.singlePlayer = true;
  const engine = new RaceEngine({ playerCount: 1 }), before = structuredClone(engine.cars);
  const poses = CHALLENGE_COLORS.map(({ slotId }) => ({ slotId, x: 10 * slotId, y: 100, angle: .2, elevation: 4 }));
  renderer.setGhostPoses([poses]); assert.equal(renderer.ghostPoses[0].length, 6);
  assert.deepEqual(renderer.ghostPoses[0].map(p => p.slotId), [0, 1, 2, 3, 4, 5]);
  poses[0].x = 999; assert.equal(renderer.ghostPoses[0][0].x, 0);
  assert.deepEqual(engine.cars, before);
  renderer.setSinglePlayer(false).setGhostPoses([poses]); assert.equal(renderer.ghostPoses[0].length, 2);
});

function mockGL() {
  const calls = [], uploads = [], uniforms = new Map(),buffers=new Map();
  let boundBuffer, depthWrite=true, viewport;
  const enabled = new Set();
  const gl = { calls, uploads, uniforms, buffers, draws: [] };
  for (const [i, name] of ['ARRAY_BUFFER','STATIC_DRAW','VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','TEXTURE_2D','RGBA','UNSIGNED_BYTE','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','LINEAR','DEPTH_TEST','LEQUAL','CULL_FACE','SRC_ALPHA','ONE_MINUS_SRC_ALPHA','FLOAT','TRIANGLES','TEXTURE0','TEXTURE1','TEXTURE2','SCISSOR_TEST','BLEND','UNPACK_FLIP_Y_WEBGL'].entries()) gl[name] = i + 1;
  gl.COLOR_BUFFER_BIT = 0x4000; gl.DEPTH_BUFFER_BIT = 0x100;
  let count = 0;
  for (const name of ['createShader','createProgram','createBuffer','createTexture']) gl[name] = () => ({ id: ++count });
  gl.getShaderParameter = gl.getProgramParameter = () => true;
  gl.getAttribLocation = (_, name) => ({ aPosition: 0, aNormal: 1, aColor: 2, aEmission: 3 })[name];
  gl.getUniformLocation = (_, name) => name;
  gl.uniformMatrix4fv = (name, transpose, value) => { assert.equal(transpose, false); assert.equal(value.length, 16); assert.ok([...value].every(Number.isFinite)); uniforms.set(name, value); };
  gl.bufferData = (_, data) => { assert.ok([...data].every(Number.isFinite)); uploads.push(data.length); buffers.set(boundBuffer,data); };
  for (const name of ['shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindBuffer','bindTexture','texImage2D','texParameteri','enable','depthFunc','disable','clearColor','blendFunc','enableVertexAttribArray','vertexAttribPointer','drawArrays','depthMask','useProgram','disableVertexAttribArray','activeTexture','uniform1i','uniform1f','uniform3fv','viewport','scissor','clear','pixelStorei']) gl[name] = (...args) => { calls.push([name, ...args]); };
  gl.bindBuffer=(_,buffer)=>{boundBuffer=buffer;};
  gl.depthMask=value=>{depthWrite=value;calls.push(['depthMask',value]);};
  gl.enable=value=>{enabled.add(value);calls.push(['enable',value]);};
  gl.disable=value=>{enabled.delete(value);calls.push(['disable',value]);};
  gl.viewport=(...args)=>{viewport=args;calls.push(['viewport',...args]);};
  gl.drawArrays=(...args)=>{calls.push(['drawArrays',...args]);gl.draws.push({buffer:boundBuffer,model:uniforms.get('uModel')?.slice(),depthWrite,blending:enabled.has(gl.BLEND),viewport:viewport?.slice()});};
  return gl;
}


test('six challenge ghost colors are really drawn transparently in the single full-width viewport', () => {
  setTrack('coast');
  const gl = mockGL(), renderer = new RaceRenderer({ width: 1280, height: 800, getContext: () => gl, addEventListener: () => {} });
  const engine = new RaceEngine({ playerCount: 1 }), before = structuredClone(engine.cars), obstacles = renderer.obstacles;
  renderer.setSinglePlayer(true).setGhostPoses([CHALLENGE_COLORS.map(({ slotId }) => ({ slotId, x: 100 + slotId * 20, y: 200, angle: .2, elevation: 3 }))]);
  renderer.render(engine);
  assert.equal(renderer.ghostMeshes.length, 6);
  for (const [index, mesh] of renderer.ghostMeshes.entries()) {
    const draws = gl.draws.filter(draw => draw.buffer === mesh.buffer);
    assert.equal(draws.length, 1); assert.deepEqual(draws[0].viewport, [0, 0, 1280, 800]);
    assert.equal(draws[0].blending, true); assert.equal(draws[0].depthWrite, false);
    const rgb = CHALLENGE_COLORS[index].color.slice(1).match(/../g).map(hex => parseInt(hex, 16) / 255);
    const vertices = gl.buffers.get(mesh.buffer);
    for (let at = 0; at < vertices.length; at += 11) {
      rgb.forEach((v, axis) => assert.ok(Math.abs(vertices[at + 6 + axis] - v) < 1e-6));
      assert.ok(vertices[at + 9] > .1 && vertices[at + 9] < .4);
    }
  }
  assert.equal(gl.draws.filter(draw => renderer.meshes.cars.some(mesh => draw.buffer === mesh.buffer)).length, 1);
  assert.deepEqual(engine.cars, before); assert.equal(renderer.obstacles, obstacles);
  const uploads = gl.uploads.length; renderer.render(engine); assert.equal(gl.uploads.length, uploads, 'colors are uploaded once, not every frame');
});
