import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceEngine, setTrack } from '../engine.js';
import { RaceRenderer } from '../renderer.js';

const TAU = Math.PI * 2;
const originalMatchMedia = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
test.afterEach(() => {
  setTrack('coast');
  if (originalMatchMedia) Object.defineProperty(globalThis, 'matchMedia', originalMatchMedia);
  else delete globalThis.matchMedia;
});

// Record the renderer's real program, resource and draw calls. No alternate
// animation helper or shader implementation runs in these integration tests.
function recordingGL() {
  let id = 0, buffer, program, viewport;
  const values = new Map();
  const gl = {
    draws: [], sources: new Map(), shaders: new Map(),
    resources: { buffers: 0, programs: 0, textures: 0, uploads: 0, subuploads: 0 },
  };
  for (const name of ['ARRAY_BUFFER', 'STATIC_DRAW', 'DYNAMIC_DRAW', 'FLOAT', 'TRIANGLES', 'LINES',
    'BLEND', 'DEPTH_TEST', 'SCISSOR_TEST', 'VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS',
    'LINK_STATUS', 'TEXTURE_2D', 'TEXTURE0', 'TEXTURE1', 'TEXTURE2', 'RGBA', 'UNSIGNED_BYTE',
    'CULL_FACE', 'LEQUAL', 'SRC_ALPHA', 'ONE', 'ONE_MINUS_SRC_ALPHA', 'CLAMP_TO_EDGE', 'LINEAR']) gl[name] = name;
  gl.createShader = () => ({ id: ++id });
  for (const [method, counter] of [['createBuffer', 'buffers'], ['createProgram', 'programs'], ['createTexture', 'textures']])
    gl[method] = () => { gl.resources[counter]++; return { id: ++id }; };
  gl.bufferData = () => gl.resources.uploads++;
  gl.bufferSubData = () => gl.resources.subuploads++;
  gl.getShaderParameter = gl.getProgramParameter = () => true;
  gl.getAttribLocation = (_, name) => ({ aPosition: 0, aNormal: 1, aColor: 2, aEmission: 3, aUV: 4 })[name];
  gl.getUniformLocation = (owner, name) => ({ owner, name });
  gl.shaderSource = (shader, source) => gl.sources.set(shader, source);
  gl.attachShader = (owner, shader) => gl.shaders.set(owner, [...(gl.shaders.get(owner) || []), shader]);
  gl.bindBuffer = (_, next) => { buffer = next; };
  gl.useProgram = owner => { program = owner; };
  gl.viewport = (...bounds) => { viewport = bounds; };
  for (const name of ['uniform1f', 'uniform1i', 'uniform3fv']) gl[name] = (location, value) => {
    if (!values.has(location.owner)) values.set(location.owner, {});
    values.get(location.owner)[location.name] = typeof value === 'number' ? value : Array.from(value);
  };
  gl.drawArrays = (type, first, count) => gl.draws.push({
    program, buffer, type, first, count, viewport, uniforms: { ...values.get(program) },
  });
  for (const name of ['compileShader', 'linkProgram', 'deleteShader', 'deleteBuffer', 'bindTexture',
    'texImage2D', 'texParameteri', 'enable', 'depthFunc', 'disable', 'clearColor', 'blendFunc',
    'enableVertexAttribArray', 'depthMask', 'disableVertexAttribArray', 'activeTexture', 'scissor',
    'clear', 'pixelStorei', 'uniformMatrix4fv', 'vertexAttribPointer']) gl[name] = () => {};
  return gl;
}

function scene({ reducedMotion, track = 'coast' } = {}) {
  if (reducedMotion) Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: query => {
    assert.equal(query, '(prefers-reduced-motion: reduce)');
    return reducedMotion;
  } });
  else delete globalThis.matchMedia;
  setTrack(track);
  const gl = recordingGL(), events = new Map();
  const canvas = { width: 1200, height: 700, getContext: () => gl, addEventListener: (name, fn) => events.set(name, fn) };
  const renderer = new RaceRenderer(canvas), engine = new RaceEngine();
  assert.equal(renderer.available, true, renderer.error);
  return { renderer, engine, gl, events, canvas };
}

function frame(scene, dt = 1 / 60, now = 0) {
  const { renderer, engine, gl } = scene;
  gl.draws.length = 0;
  renderer.render(engine, dt, now);
  const sky = gl.draws.filter(draw => draw.program === renderer.skyProgram);
  assert.equal(sky.length, renderer.singlePlayer || renderer.entryProgress !== null ? 1 : 2);
  for (const draw of sky) {
    assert.equal(draw.uniforms.uAuroraPhase, renderer.auroraPhase);
    assert.ok(Number.isFinite(draw.uniforms.uAuroraPhase));
    assert.ok(draw.uniforms.uAuroraPhase >= 0 && draw.uniforms.uAuroraPhase < TAU);
    assert.equal(draw.buffer, renderer.skyBuffer);
    assert.deepEqual([draw.type, draw.first, draw.count], [gl.TRIANGLES, 0, 6]);
  }
  return sky;
}

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `expected ${expected}, got ${actual}`);
}

test('the real renderer starts still, advances during countdown/racing, and freezes outside play', () => {
  const s = scene(), { renderer, engine } = s;
  assert.equal(renderer.auroraPhase, 0);
  assert.equal(renderer.auroraMotionQuery, null);
  frame(s, .04, 900000);
  assert.equal(renderer.auroraPhase, 0, 'menu time cannot start or jump the sky');
  engine.start(1);
  const untouched = structuredClone({ time: engine.time, countdown: engine.countdown, cars: engine.cars });
  frame(s, .025);
  near(renderer.auroraPhase, TAU / 4000);
  const first = renderer.auroraPhase;
  engine.pause();
  frame(s, .05, 9999999);
  assert.equal(renderer.auroraPhase, first);
  engine.resume();
  frame(s, .025);
  near(renderer.auroraPhase, first * 2);
  engine.state = 'racing';
  frame(s, .025);
  near(renderer.auroraPhase, first * 3);
  assert.deepEqual({ time: engine.time, countdown: engine.countdown, cars: engine.cars }, untouched,
    'the visual clock must not advance physics, race time, or the starting countdown');
  const running = renderer.auroraPhase;
  for (const state of ['finished', 'menu', 'paused']) {
    engine.state = state;
    frame(s, .05);
    assert.equal(renderer.auroraPhase, running, state);
  }
});

test('entry overview animates from the menu but pause and finish take priority over an active entry', () => {
  const s = scene(), { renderer, engine } = s;
  renderer.setEntryProgress(.35);
  frame(s, .04);
  near(renderer.auroraPhase, TAU / 2500);
  const phase = renderer.auroraPhase;
  for (const state of ['paused', 'finished']) {
    engine.state = state;
    frame(s, .04);
    assert.equal(renderer.auroraPhase, phase);
  }
  engine.state = 'menu';
  renderer.setEntryProgress(null);
  frame(s, .04);
  assert.equal(renderer.auroraPhase, phase);
  renderer.setEntryProgress(.75);
  frame(s, .04);
  near(renderer.auroraPhase, phase * 2);
});

test('finite frame deltas are capped, invalid deltas cannot poison the phase, and the cycle wraps continuously', () => {
  const s = scene(), { renderer, engine } = s;
  engine.start(1);
  frame(s, .02, 1000);
  near(renderer.auroraPhase, TAU / 5000);
  const start = renderer.auroraPhase;
  frame(s, 120, 1e15);
  near(renderer.auroraPhase - start, TAU / 2000);
  const capped = renderer.auroraPhase;
  for (const dt of [0, -.01, NaN, Infinity, -Infinity, '0.04', null]) {
    // Camera damping has its own contract; keep a fresh camera when injecting
    // malformed frame deltas to isolate the new visual clock's public boundary.
    renderer.cameras = [null, null];
    frame(s, dt);
    assert.equal(renderer.auroraPhase, capped, String(dt));
  }
  renderer.auroraPhase = TAU - .001;
  frame(s, .05);
  near(renderer.auroraPhase, TAU / 2000 - .001);
  const before = renderer.auroraPhase;
  frame(s, .01, -1e15);
  near(renderer.auroraPhase - before, TAU / 10000);
});

test('both players share one visual-clock tick and one existing sky pass each without new frame resources', () => {
  const s = scene(), { renderer, engine, gl } = s;
  engine.start(1);
  const resources = { ...gl.resources };
  const sky = frame(s, .01);
  near(renderer.auroraPhase, TAU / 10000);
  assert.deepEqual(sky.map(draw => draw.viewport), [[0, 0, 600, 700], [600, 0, 600, 700]]);
  const signature = () => gl.draws.map(({ program, buffer, type, count, viewport }) => ({ program, buffer, type, count, viewport }));
  const initialDraws = signature();
  for (let i = 0; i < 16; i++) {
    frame(s, .02, i * 100000);
    assert.deepEqual(signature(), initialDraws, 'aurora only changes shader input, not the scene draw list');
    assert.deepEqual(gl.resources, resources, 'no per-frame geometry, texture or program allocation/upload');
  }
  renderer.setSinglePlayer(true);
  const previous = renderer.auroraPhase;
  const singleSky = frame(s, .01);
  near(renderer.auroraPhase - previous, TAU / 10000);
  assert.deepEqual(singleSky[0].viewport, [0, 0, 1200, 700]);
  const fragment = gl.shaders.get(renderer.skyProgram).map(shader => gl.sources.get(shader)).find(source => source.includes('gl_FragColor'));
  assert.match(fragment, /uniform\s+float\s+[^;]*\buAuroraPhase\b/);
  assert.match(fragment, /auroraSky\([^;]*uAuroraPhase/,
    'the compiled sky program actually consumes the same phase uniform recorded at draw time');
});

test('reduced motion starts at zero and responds to preference changes without rebuilding the world', () => {
  const preference = { matches: true };
  const s = scene({ reducedMotion: preference }), { renderer, engine, gl } = s;
  assert.equal(renderer.auroraMotionQuery, preference);
  engine.start(1);
  const resources = { ...gl.resources };
  frame(s, .05);
  assert.equal(renderer.auroraPhase, 0);
  preference.matches = false;
  frame(s, .05);
  assert.ok(renderer.auroraPhase > 0);
  preference.matches = true;
  engine.pause();
  frame(s, .05);
  assert.equal(renderer.auroraPhase, 0, 'turning reduced motion on also resets a paused, already animated sky');
  engine.resume();
  renderer.setEntryProgress(.5);
  frame(s, .05);
  assert.equal(renderer.auroraPhase, 0, 'the intro also respects reduced motion');
  assert.deepEqual(gl.resources, resources);
});

test('context loss freezes the clock, restoration preserves it, and choosing a new map restarts it', () => {
  const s = scene(), { renderer, engine, gl, events, canvas } = s;
  engine.start(1);
  frame(s, .04);
  const beforeLoss = renderer.auroraPhase;
  let prevented = false;
  events.get('webglcontextlost')({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(renderer.available, false);
  gl.draws.length = 0;
  renderer.render(engine, .04);
  assert.equal(gl.draws.length, 0);
  assert.equal(renderer.auroraPhase, beforeLoss);
  events.get('webglcontextrestored')();
  assert.equal(renderer.available, true, renderer.error);
  assert.equal(renderer.auroraPhase, beforeLoss);
  frame(s, 0);
  assert.equal(renderer.auroraPhase, beforeLoss);
  frame(s, .04);
  near(renderer.auroraPhase, beforeLoss * 2);
  const beforeHidden = renderer.auroraPhase;
  canvas.width = 0;
  gl.draws.length = 0;
  renderer.render(engine, .05);
  assert.equal(gl.draws.length, 0);
  assert.equal(renderer.auroraPhase, beforeHidden);
  canvas.width = 1200;
  engine.selectTrack('coast-shanghai');
  renderer.rebuild(engine);
  assert.equal(renderer.auroraPhase, 0);
  assert.equal(renderer.colorTheme, 'ice');
  frame(s, .05);
  assert.equal(renderer.auroraPhase, 0, 'the new map remains still in its menu');
  engine.start(1);
  frame(s, .01);
  near(renderer.auroraPhase, TAU / 10000);
});
