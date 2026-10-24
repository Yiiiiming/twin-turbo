import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_THEMES, normalizeColorTheme, themeForTrack, remapHologramColor, themeCssColor } from '../color-themes.js';
import { RaceEngine, TRACKS, setTrack } from '../engine.js';
import { RaceRenderer } from '../renderer.js';

const CITIES = {
  'coast-london': 'purple', 'coast-paris': 'purple', 'coast-beijing': 'red',
  'coast-austin': 'orange', 'coast-rio': 'green', 'coast-shanghai': 'ice',
};
test.afterEach(() => setTrack('coast'));

test('each city selects its agreed palette; other accepted maps and unknown identifiers retain purple', () => {
  for (const id of Object.keys(TRACKS)) assert.equal(themeForTrack(id), CITIES[id] || 'purple', id);
  for (const id of ['missing-city', '', undefined, null, '__proto__', 'constructor', 'toString']) {
    assert.equal(themeForTrack(id), 'purple');
    assert.equal(normalizeColorTheme(id), 'purple');
  }
  for (const id of Object.keys(COLOR_THEMES)) assert.equal(normalizeColorTheme(id), id);
  assert.equal(COLOR_THEMES.orange.accent.toLowerCase(), '#bf5700', 'Austin uses the requested UT burnt orange');
});

test('purple preserves exact existing numbers and CSS tokens without mutating or aliasing color input', () => {
  for (const color of [[.18, .48, .62], [0, .000001, 1], [-.2, 1.2, .47], [.1, .1, .1]]) {
    const frozen = Object.freeze(color.slice()), actual = remapHologramColor(frozen, 'purple');
    assert.deepEqual(actual, color);
    assert.notEqual(actual, frozen);
    assert.deepEqual(remapHologramColor(frozen, 'invalid-theme'), color);
  }
  for (const value of ['#9875f8', '#abcd', 'rgba(24, 32, 70, 0.35)', 'rgb(100, 200, 255)', 'var(--tone)']) {
    assert.equal(themeCssColor(value, 'purple'), value);
    assert.equal(themeCssColor(value, 'unknown-theme'), value);
  }
});

test('city remapping preserves grayscale and peak intensity while staying finite and within display range', () => {
  for (const id of Object.keys(COLOR_THEMES)) {
    for (const neutral of [0, .002, .08, .4, .85, 1])
      assert.deepEqual(remapHologramColor([neutral, neutral, neutral], id), [neutral, neutral, neutral]);
    for (const r of [0, .05, .3, .75, 1]) for (const g of [0, .1, .55, 1]) for (const b of [0, .25, .9, 1]) {
      const original = [r, g, b], input = Object.freeze(original.slice());
      const actual = remapHologramColor(input, id);
      assert.equal(actual.length, 3);
      assert.ok(actual.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 1), id);
      assert.ok(Math.abs(Math.max(...actual) - Math.max(...original)) < 1e-12, 'theme selection cannot make a dark surface brighter');
      assert.deepEqual(input, original);
    }
    if (id !== 'purple') {
      const actual = remapHologramColor([-1, 2, .5], id);
      assert.ok(actual.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 1));
    }
  }
  const color = [.15, .2, .7];
  const red = remapHologramColor(color, 'red'), orange = remapHologramColor(color, 'orange');
  const green = remapHologramColor(color, 'green'), ice = remapHologramColor(color, 'ice');
  assert.ok(red[0] > red[1] && red[0] > red[2]);
  assert.ok(orange[0] > orange[1] && orange[1] > orange[2]);
  assert.ok(green[1] > green[0] && green[1] > green[2]);
  assert.ok(ice[2] > ice[1] && ice[1] > ice[0]);
  assert.equal(new Set([red, orange, green, ice].map(value => value.join(','))).size, 4);
});

function rgbaParts(value) {
  const match = value.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
  assert.ok(match, `expected usable CSS rgba, got ${value}`);
  return match.slice(1).map(Number);
}

test('hex and rgb CSS remapping preserves opacity, including short and eight-digit hex', () => {
  const cases = [
    ['#9875f8', 1], ['#98f', 1], ['#9875f880', 128 / 255], ['#98f8', 136 / 255],
    ['#9875f800', 0], ['rgba(152, 117, 248, 0.35)', .35], ['rgb(152, 117, 248)', 1],
  ];
  for (const id of ['red', 'orange', 'green', 'ice']) for (const [value, alpha] of cases) {
    const actual = rgbaParts(themeCssColor(value, id));
    assert.ok(actual.slice(0, 3).every(channel => channel >= 0 && channel <= 255));
    assert.ok(Math.abs(actual[3] - alpha) < 1e-12, `${id} must preserve opacity of ${value}`);
  }
  assert.deepEqual(rgbaParts(themeCssColor('#8888', 'red')), [136, 136, 136, 136 / 255]);
  assert.deepEqual(rgbaParts(themeCssColor('rgba(255,255,255,0.6)', 'green')), [255, 255, 255, .6]);
  for (const value of ['transparent', 'var(--tone)', 'not-a-color', null, undefined, 42])
    assert.equal(themeCssColor(value, 'red'), value, 'unrecognized tokens must not turn into broken rgba');
});

function recordingGL() {
  let id = 0, bound, program;
  const gl = { buffers: new Map(), sources: new Map(), shaders: new Map(), draws: [] };
  const values = new Map();
  for (const name of ['ARRAY_BUFFER', 'STATIC_DRAW', 'DYNAMIC_DRAW', 'FLOAT', 'TRIANGLES', 'LINES', 'BLEND',
    'DEPTH_TEST', 'SCISSOR_TEST', 'VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS',
    'TEXTURE_2D', 'TEXTURE0', 'TEXTURE1', 'TEXTURE2', 'RGBA', 'UNSIGNED_BYTE', 'CULL_FACE', 'LEQUAL',
    'SRC_ALPHA', 'ONE', 'ONE_MINUS_SRC_ALPHA', 'CLAMP_TO_EDGE', 'LINEAR']) gl[name] = name;
  for (const name of ['createShader', 'createProgram', 'createBuffer', 'createTexture']) gl[name] = () => ({ id: ++id });
  gl.getShaderParameter = gl.getProgramParameter = () => true;
  gl.getAttribLocation = (_, name) => ({ aPosition: 0, aNormal: 1, aColor: 2, aEmission: 3, aUV: 4 })[name];
  gl.getUniformLocation = (owner, name) => ({ owner, name });
  gl.shaderSource = (shader, source) => gl.sources.set(shader, source);
  gl.attachShader = (owner, shader) => gl.shaders.set(owner, [...(gl.shaders.get(owner) || []), shader]);
  gl.bindBuffer = (_, buffer) => { bound = buffer; };
  gl.bufferData = (_, data) => gl.buffers.set(bound, data);
  gl.bufferSubData = (_, offset, data) => gl.buffers.get(bound)?.set(data, offset / 4);
  gl.deleteBuffer = buffer => gl.buffers.delete(buffer);
  gl.useProgram = owner => { program = owner; };
  for (const name of ['uniform1f', 'uniform1i', 'uniform3fv']) gl[name] = (location, value) => {
    if (!values.has(location.owner)) values.set(location.owner, {});
    values.get(location.owner)[location.name] = typeof value === 'number' ? value : Array.from(value);
  };
  gl.drawArrays = (type, first, count) => gl.draws.push({ program, buffer: bound, type, first, count, uniforms: { ...values.get(program) } });
  for (const name of ['compileShader', 'linkProgram', 'deleteShader', 'bindTexture', 'texImage2D', 'texParameteri',
    'enable', 'depthFunc', 'disable', 'clearColor', 'blendFunc', 'enableVertexAttribArray', 'depthMask',
    'disableVertexAttribArray', 'activeTexture', 'scissor', 'clear', 'pixelStorei', 'uniformMatrix4fv',
    'vertexAttribPointer', 'viewport']) gl[name] = () => {};
  return gl;
}

function scene() {
  const gl = recordingGL(), events = new Map();
  const canvas = { width: 1200, height: 700, getContext: () => gl, addEventListener: (name, callback) => events.set(name, callback) };
  const renderer = new RaceRenderer(canvas);
  assert.equal(renderer.available, true, renderer.error);
  return { renderer, gl, events };
}

function assertRenderedTheme(renderer, gl, engine, theme, split = false) {
  renderer.setSinglePlayer(!split);
  gl.draws.length = 0;
  renderer.render(engine, 1 / 60, 1);
  const main = gl.draws.filter(draw => draw.program === renderer.mainProgram);
  const sky = gl.draws.filter(draw => draw.program === renderer.skyProgram);
  assert.ok(main.length > 0);
  assert.equal(sky.length, split ? 2 : 1);
  for (const draw of [...main, ...sky]) assert.equal(draw.uniforms.uColorTheme, COLOR_THEMES[theme].index);
  for (const draw of main) {
    const edge = draw.buffer === renderer.meshes.ambientEdges.buffer;
    assert.equal(draw.uniforms.uHologramLine, edge ? 1 : 0, 'the explicit line override must reset before actors, cars, shadows and ghosts');
    assert.equal(draw.type, edge ? gl.LINES : gl.TRIANGLES);
    assert.deepEqual(draw.uniforms.uFog, renderer.activeFog);
  }
  assert.equal(main.filter(draw => draw.uniforms.uHologramLine === 1).length, split ? 2 : 1);
  assert.ok(renderer.activeFog.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
}

for (const [trackId, theme] of Object.entries(CITIES)) test(`${trackId}: initial scene sends the same city palette to both render programs`, () => {
  setTrack(trackId);
  const { renderer, gl } = scene(), engine = new RaceEngine();
  assert.equal(renderer.colorTheme, theme);
  assertRenderedTheme(renderer, gl, engine, theme, true);
});

test('map rebuilding and real context-restoration callbacks select the current city rather than a stale palette', () => {
  setTrack('coast-beijing');
  const { renderer, gl, events } = scene(), engine = new RaceEngine();
  for (const id of ['coast-austin', 'coast-rio', 'coast-shanghai', 'coast-paris', 'coast-pines', 'coast-beijing']) {
    engine.selectTrack(id); renderer.rebuild(engine);
    assert.equal(renderer.colorTheme, CITIES[id] || 'purple');
    assertRenderedTheme(renderer, gl, engine, CITIES[id] || 'purple');
  }
  let prevented = false;
  events.get('webglcontextlost')({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(renderer.available, false);
  engine.selectTrack('coast-shanghai');
  gl.buffers.clear(); // Lost WebGL contexts discard their GPU objects.
  events.get('webglcontextrestored')();
  assert.equal(renderer.available, true, renderer.error);
  assert.equal(renderer.colorTheme, 'ice');
  assert.equal(renderer.trackId, 'coast-shanghai');
  assertRenderedTheme(renderer, gl, engine, 'ice');
});

test('actual shader classification recolors scenery and explicit contours but excludes landmark, player and ghost identity colors', () => {
  setTrack('coast-beijing');
  const { renderer, gl } = scene(), engine = new RaceEngine();
  renderer.setSinglePlayer(true);
  const car = engine.cars[0];
  renderer.setGhostPoses([[{ slotId: 0, x: car.x, y: car.y + 70, angle: car.angle, elevation: car.elevation }]]);
  assertRenderedTheme(renderer, gl, engine, 'red');
  const source = gl.shaders.get(renderer.mainProgram).map(shader => gl.sources.get(shader)).find(text => text.includes('gl_FragColor'));
  const branch = source.match(/if\s*\(([^\n]+)\)\s*\n\s*color\s*=\s*themeColor\(color,uColorTheme\)/);
  assert.ok(branch, 'inspect the active fragment program\'s classification before its palette call');
  // These scalar GLSL comparisons are also JS expressions. Evaluate the actual
  // uploaded shader predicate against real uploaded materials, not a test copy.
  assert.match(branch[1], /^[\w\s.><=&|()]+$/);
  const entersTheme = new Function('surfaceMode', 'uHologramLine', `return (${branch[1]});`);
  const modes = buffer => new Set(Array.from({ length: gl.buffers.get(buffer).length / 11 }, (_, i) => Math.floor((gl.buffers.get(buffer)[i * 11 + 10] + .001) / 4)));
  for (const key of ['terrain', 'water', 'road']) for (const mode of modes(renderer.meshes[key].buffer))
    assert.equal(entersTheme(mode, 0), true, `${key} must adopt the city palette`);
  const propsModes = modes(renderer.meshes.props.buffer);
  assert.ok(propsModes.has(0) && propsModes.has(3) && propsModes.has(6));
  assert.equal(entersTheme(0, 0), false, 'landmarks in the shared props batch retain their original material');
  assert.equal(entersTheme(3, 0), true, 'ordinary props in that same batch are themed');
  assert.equal(entersTheme(6, 0), true, 'laser buildings adopt the city palette without recoloring real landmarks');
  for (const mesh of [...renderer.meshes.cars, renderer.meshes.ghost, renderer.meshes.ghostGold, renderer.meshes.flames])
    for (const mode of modes(mesh.buffer)) assert.equal(entersTheme(mode, 0), false, 'vehicle/ghost/flame identity stays independent of the map');
  for (const mode of modes(renderer.meshes.ambientEdges.buffer)) assert.equal(entersTheme(mode, 1), true);
  assert.ok(gl.draws.some(draw => draw.buffer === renderer.meshes.ghost.buffer && draw.uniforms.uHologramLine === 0));
  const skySource = gl.shaders.get(renderer.skyProgram).map(shader => gl.sources.get(shader)).find(text => text.includes('gl_FragColor'));
  assert.match(skySource, /themeColor\(auroraSky\(vUV,uHeading,uAspect,uMagic,uAuroraPhase\),uColorTheme\)/);
});
