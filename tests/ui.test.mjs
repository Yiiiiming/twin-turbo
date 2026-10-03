import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { trackPoint, projectTrack, mod } from '../engine.js';

const sourceURL = new URL('../main.js', import.meta.url);
const engineURL = new URL('../engine.js', import.meta.url);
let instance = 0;

class MockClassList {
  constructor(value = '') { this.values = new Set(value.split(/\s+/).filter(Boolean)); }
  contains(value) { return this.values.has(value); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  toggle(value, force) {
    const enabled = force === undefined ? !this.contains(value) : Boolean(force);
    if (enabled) this.add(value); else this.remove(value);
    return enabled;
  }
}

class MockTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, handler) {
    const handlers = this.listeners.get(name) || [];
    handlers.push(handler); this.listeners.set(name, handlers);
  }
  removeEventListener(name, handler) {
    this.listeners.set(name, (this.listeners.get(name) || []).filter(item => item !== handler));
  }
  dispatch(name, values = {}) {
    const event = { type: name, target: this, repeat: false, pending: [],
      metaKey: false, ctrlKey: false, altKey: false, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...values };
    for (const handler of this.listeners.get(name) || []) {
      const result = handler(event);
      if (result?.then) event.pending.push(result);
    }
    return event;
  }
}

class MockNode extends MockTarget {
  constructor(tagName, ownerDocument, attributes = {}) {
    super(); this.tagName = tagName.toUpperCase(); this.ownerDocument = ownerDocument;
    this.attributes = { ...attributes }; this.id = attributes.id || '';
    this.classList = new MockClassList(attributes.class); this.style = {};
    this.dataset = {}; this.children = []; this.parentElement = null;
    this.textContent = ''; this.innerHTML = ''; this.disabled = 'disabled' in attributes;
    this.open = false; this.isContentEditable = false;
    this.clientWidth = 1200; this.clientHeight = 700; this.width = 1200; this.height = 700;
    for (const [name, value] of Object.entries(attributes)) {
      if (name.startsWith('data-')) this.dataset[name.slice(5)] = value;
    }
  }
  get firstElementChild() { return this.children[0] || this.appendChild(new MockNode('strong', this.ownerDocument)); }
  get lastElementChild() { return this.children.at(-1) || this.firstElementChild; }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return name in this.attributes; }
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  click() { if (!this.disabled) return this.dispatch('click'); }
  async requestFullscreen() {
    this.fullscreenRequests = (this.fullscreenRequests || 0) + 1;
    this.ownerDocument.fullscreenElement = this;
  }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch('close'); }
  getBoundingClientRect() { return { left: 200, right: 1000, top: 100, bottom: 600, width: 800, height: 500 }; }
  matches(selector) {
    return selector.split(',').some(item => {
      const value = item.trim();
      if (value === '[contenteditable]' || value.startsWith('[contenteditable=')) return this.isContentEditable;
      if (value === '[role="button"]') return this.getAttribute('role') === 'button';
      if (value === 'a[href]') return this.tagName === 'A' && this.hasAttribute('href');
      return value.toUpperCase() === this.tagName;
    });
  }
  closest(selector) {
    for (let current = this; current; current = current.parentElement) {
      if (current.matches(selector)) return current;
    }
    return null;
  }
  querySelector(selector) {
    let child = this.children.find(item => item.matches(selector));
    if (!child) child = this.appendChild(new MockNode(selector, this.ownerDocument));
    return child;
  }
  getContext() { return this.context ||= canvasContext(); }
}

function canvasContext() {
  const state = { calls: [], counts: new Map(), depth: 0 };
  const selected = new Set(['rect', 'clip', 'drawImage', 'setTransform', 'translate', 'clearRect', 'fillText']);
  return new Proxy(state, {
    get(target, name) {
      if (name in target) return target[name];
      return (...args) => {
        for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `Canvas ${String(name)} received a nonfinite number`);
        state.counts.set(name, (state.counts.get(name) || 0) + 1);
        if (selected.has(name)) state.calls.push([name, ...args]);
        if (name === 'save') state.depth++;
        if (name === 'restore') { state.depth--; assert.ok(state.depth >= 0, 'Canvas restore has a matching save'); }
        if (name === 'createLinearGradient' || name === 'createRadialGradient') return { addColorStop() {} };
        if (name === 'measureText') return { width: String(args[0]).length * 8 };
      };
    },
    set(target, name, value) { target[name] = value; return true; },
  });
}

async function loadUI(t, { graphicsAvailable = true } = {}) {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const document = new MockTarget();
  const nodes = new Map(), lapButtons = [], lapLabels = [];
  document.body = new MockNode('body', document); document.activeElement = document.body;
  document.hidden = false;
  document.fullscreenElement = null;
  document.fullscreenExits = 0;
  document.exitFullscreen = async () => {
    document.fullscreenElement = null; document.fullscreenExits++;
  };
  document.getElementById = id => {
    assert.ok(nodes.has(id), `main.js references an existing HTML id: ${id}`);
    return nodes.get(id);
  };
  document.createElement = tag => new MockNode(tag, document);
  document.querySelectorAll = selector => {
    if (selector === '[data-laps]') return lapButtons;
    if (selector === '.total-laps') return lapLabels;
    return [];
  };
  for (const match of html.matchAll(/<([a-z][a-z\d-]*)\b([^>]*)>/gi)) {
    const attributes = {};
    for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attributes[attr[1]] = attr[2] ?? '';
    if (!attributes.id && !('data-laps' in attributes) && !attributes.class?.includes('total-laps')) continue;
    const node = new MockNode(match[1], document, attributes);
    if (node.id) nodes.set(node.id, node);
    if ('data-laps' in attributes) lapButtons.push(node);
    if (attributes.class?.includes('total-laps')) lapLabels.push(node);
  }
  nodes.get('countdown').appendChild(new MockNode('strong', document));
  nodes.get('countdown').appendChild(new MockNode('span', document));
  const window = new MockTarget(); window.devicePixelRatio = 1;
  let clock = 0;
  const frames = [], delayed = [];
  const globals = { document, window, Element: MockNode, HTMLElement: MockNode,
    performance: { now: () => clock },
    ResizeObserver: class { constructor(callback) { this.callback = callback; } observe() { this.callback(); } },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    setTimeout: callback => { delayed.push(callback); return delayed.length; },
  };
  const originals = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  });
  // WebGL is a renderer concern. Record its public contract while running the
  // shipped application event handlers and real race engine unchanged.
  const rendererModule = `export function sceneWeights() {
    return { coast: 1, alpine: 0, city: 0 };
  }
  export class RaceRenderer {
    constructor(canvas, options) {
      this.canvas = canvas; this.options = options;
      this.available = ${JSON.stringify(graphicsAvailable)};
      this.resetCalls = []; this.renderCount = 0;
    }
    resetCameras(engine, playerId) {
      this.resetCalls.push({ playerId,
        cars: engine.cars.map(({id,x,y,angle}) => ({id,x,y,angle})) });
    }
    render(engine, dt, now) {
      this.renderCount++; this.lastRender = { engine, dt, now };
    }
  }`;
  const rendererURL = `data:text/javascript;base64,${Buffer.from(rendererModule).toString('base64')}`;
  const source = (await readFile(sourceURL, 'utf8'))
    .replace("from './engine.js'", `from '${engineURL.href}'`)
    .replace("from './renderer.js'", `from '${rendererURL}'`);
  // Load shipped application source unmodified except dependency resolution and
  // read-only test exports. No duplicated event handlers or production hooks.
  const entry = `${source}\nexport { engine, keys, renderer };\n// test instance ${++instance}`;
  const application = await import(`data:text/javascript;base64,${Buffer.from(entry).toString('base64')}`);
  const ui = {
    ...application, nodes, document, window, lapButtons, lapLabels, html,
    frame(dt = 1 / 60) {
      clock += dt * 1000;
      assert.equal(frames.length, 1, 'one animation loop is scheduled');
      frames.shift()(clock);
      assert.equal(nodes.get('hud').context.depth, 0, 'frame restores HUD Canvas state');
    },
    advance(seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) this.frame(); },
    click(id) { return nodes.get(id).click(); },
    key(code, options = {}) { return window.dispatch('keydown', { code, target: document.activeElement, ...options }); },
    keyup(code, options = {}) { return window.dispatch('keyup', { code, target: document.activeElement, ...options }); },
  };
  ui.frame();
  return ui;
}

test('real main.js delegates scene rendering and draws two player maps on the separate HUD', async t => {
  const ui = await loadUI(t);
  assert.equal(ui.engine.state, 'menu');
  assert.equal(ui.nodes.get('race-status').textContent, '等待发车');
  assert.equal(ui.nodes.get('pause').disabled, true);
  assert.equal(ui.renderer.canvas, ui.nodes.get('game'));
  assert.equal(ui.renderer.renderCount, 1);
  assert.equal(ui.renderer.lastRender.engine, ui.engine);
  assert.equal(ui.renderer.resetCalls.length, 1);
  assert.notEqual(ui.renderer.resetCalls[0].cars[0].y, ui.renderer.resetCalls[0].cars[1].y);
  assert.equal(ui.renderer.resetCalls[0].playerId, undefined, 'initial setup resets both cameras');
  assert.equal(ui.nodes.get('game').context, undefined, 'main.js must not acquire a 2D context on its WebGL canvas');
  const hudContext = ui.nodes.get('hud').context;
  assert.equal(hudContext.counts.get('clearRect'), 1);
  assert.equal(hudContext.counts.get('scale'), 2);
  assert.ok(hudContext.calls.some(call => call[0] === 'translate' && call[1] === 418 && call[2] === 577));
  assert.ok(hudContext.calls.some(call => call[0] === 'translate' && call[1] === 1018 && call[2] === 577));
  assert.equal(ui.nodes.get('graphics-note').classList.contains('hidden'), true);
  assert.equal(ui.nodes.get('scene1').textContent, '海岸港湾');
  assert.equal(ui.nodes.get('scene2').textContent, '海岸港湾');
});

test('unavailable WebGL blocks race starts and availability recovery restores controls', async t => {
  const ui = await loadUI(t, { graphicsAvailable: false });
  assert.equal(ui.nodes.get('graphics-note').classList.contains('hidden'), false);
  assert.equal(ui.nodes.get('start').disabled, true);
  assert.equal(ui.nodes.get('again').disabled, true);
  ui.click('start'); ui.click('restart'); ui.key('Space'); ui.frame();
  assert.equal(ui.engine.state, 'menu');
  assert.equal(ui.renderer.resetCalls.length, 1);
  ui.renderer.available = true; ui.frame();
  assert.equal(ui.nodes.get('graphics-note').classList.contains('hidden'), true);
  assert.equal(ui.nodes.get('start').disabled, false);
  assert.equal(ui.nodes.get('again').disabled, false);
  ui.click('start'); ui.frame();
  assert.equal(ui.engine.state, 'countdown');
  assert.equal(ui.renderer.resetCalls.length, 2);
});

test('losing graphics during a race freezes time and requires explicit resume after recovery', async t => {
  const ui = await loadUI(t);
  ui.click('start'); ui.advance(3.1);
  ui.key('KeyW'); ui.key('ArrowUp'); ui.advance(.3);
  const time = ui.engine.time;
  const positions = ui.engine.cars.map(({ x, y }) => ({ x, y }));
  ui.renderer.available = false; ui.frame();
  assert.equal(ui.engine.state, 'paused'); assert.equal(ui.keys.size, 0);
  assert.equal(ui.engine.time, time);
  assert.equal(ui.nodes.get('graphics-note').classList.contains('hidden'), false);
  assert.deepEqual(ui.engine.cars.map(({ x, y }) => ({ x, y })), positions);
  ui.advance(.1); assert.equal(ui.engine.time, time);
  ui.renderer.available = true; ui.advance(.1);
  assert.equal(ui.engine.state, 'paused'); assert.equal(ui.engine.time, time);
  assert.equal(ui.nodes.get('graphics-note').classList.contains('hidden'), true);
  assert.equal(ui.nodes.get('pause-panel').classList.contains('hidden'), false);
  ui.click('resume'); ui.frame();
  assert.equal(ui.engine.state, 'racing'); assert.ok(ui.engine.time > time);
  assert.equal(ui.keys.size, 0);
});

test('fullscreen targets the entire race stage with scoreboard and arena and has a working exit', async t => {
  const ui = await loadUI(t);
  const opening = /<div\b[^>]*\bid="race-stage"[^>]*>/.exec(ui.html);
  assert.ok(opening, 'HTML provides the full race stage');
  const contentStart = opening.index + opening[0].length;
  let depth = 1, closing = -1;
  for (const match of ui.html.slice(contentStart).matchAll(/<\/?div\b[^>]*>/g)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) { closing = contentStart + match.index; break; }
  }
  assert.ok(closing > contentStart);
  const contents = ui.html.slice(contentStart, closing);
  assert.match(contents, /<section\b[^>]*class="scoreboard"/);
  assert.match(contents, /<section\b[^>]*class="arena"/);
  assert.match(contents, /id="game"/);
  assert.match(contents, /id="fullscreen-exit"/);
  await Promise.all(ui.click('fullscreen').pending);
  assert.equal(ui.document.fullscreenElement, ui.nodes.get('race-stage'));
  assert.equal(ui.nodes.get('race-stage').fullscreenRequests, 1);
  assert.equal(ui.document.activeElement, ui.nodes.get('game'));
  await Promise.all(ui.click('fullscreen-exit').pending);
  assert.equal(ui.document.fullscreenElement, null);
  assert.equal(ui.document.fullscreenExits, 1);
  assert.equal(ui.document.activeElement, ui.nodes.get('game'));
});

test('lap selection, start focus, countdown HUD and both keyboard drivers use actual handlers', async t => {
  const ui = await loadUI(t);
  ui.lapButtons.find(button => button.dataset.laps === '5').click();
  assert.ok(ui.lapLabels.every(label => label.textContent === 5));
  assert.equal(ui.lapButtons[1].getAttribute('aria-pressed'), 'true');
  ui.click('start'); ui.frame();
  assert.equal(ui.engine.laps, 5); assert.equal(ui.engine.state, 'countdown');
  assert.equal(ui.document.activeElement.id, 'game');
  assert.equal(ui.nodes.get('countdown').classList.contains('hidden'), false);
  assert.equal(ui.nodes.get('countdown').firstElementChild.textContent, 3);
  assert.equal(ui.nodes.get('menu').classList.contains('hidden'), true);
  ui.advance(3);
  assert.equal(ui.engine.state, 'racing');
  assert.equal(ui.nodes.get('race-status').textContent, '比赛进行中');
  ui.key('KeyW'); ui.key('ArrowUp'); ui.advance(0.4);
  assert.ok(ui.engine.cars.every(car => car.speed > 70));
  ui.key('ShiftLeft'); ui.key('Enter'); ui.advance(0.1);
  assert.ok(ui.engine.cars.every(car => car.boost < 100));
  assert.ok(Number(ui.nodes.get('speed1').textContent) > 0);
  assert.ok(Number(ui.nodes.get('speed2').textContent) > 0);
  assert.ok(parseFloat(ui.nodes.get('boost1').style.width) < 100);
  ui.keyup('KeyW'); ui.keyup('ArrowUp');
  assert.equal(ui.keys.has('KeyW'), false); assert.equal(ui.keys.has('ArrowUp'), false);
  const previousSpeeds = ui.engine.cars.map(car => car.speed);
  ui.key('KeyS'); ui.key('ArrowDown'); ui.advance(.15);
  assert.ok(ui.engine.cars.every((car, index) => car.speed < previousSpeeds[index]), 'both brake handlers reduce speed');
  ui.keyup('KeyS'); ui.keyup('ArrowDown');
});

test('pause, resume, blur and hidden-tab handlers prevent stale acceleration', async t => {
  const ui = await loadUI(t);
  ui.click('start'); ui.advance(3.1);
  ui.key('KeyW'); ui.advance(0.1);
  ui.key('Escape'); ui.frame();
  assert.equal(ui.engine.state, 'paused'); assert.equal(ui.keys.size, 0);
  ui.key('Escape', { repeat: true });
  assert.equal(ui.engine.state, 'paused', 'holding Escape cannot toggle pause repeatedly');
  assert.equal(ui.nodes.get('pause-panel').classList.contains('hidden'), false);
  const time = ui.engine.time;
  ui.key('KeyW'); ui.advance(0.1); ui.click('resume'); ui.frame();
  assert.equal(ui.engine.state, 'racing'); assert.equal(ui.keys.has('KeyW'), false);
  assert.ok(ui.engine.time > time); assert.equal(ui.document.activeElement.id, 'game');
  ui.key('ArrowUp'); ui.window.dispatch('blur'); ui.frame();
  assert.equal(ui.engine.state, 'paused'); assert.equal(ui.keys.size, 0);
  ui.click('resume'); ui.key('KeyW'); ui.document.hidden = true;
  ui.document.dispatch('visibilitychange'); ui.frame();
  assert.equal(ui.engine.state, 'paused'); assert.equal(ui.keys.size, 0);
});

test('help dialog blocks game shortcuts and preserves a paused race until explicit resume', async t => {
  const ui = await loadUI(t);
  ui.click('start'); ui.advance(3.1); ui.key('KeyW'); ui.click('help');
  assert.equal(ui.nodes.get('help-dialog').open, true);
  assert.equal(ui.engine.state, 'paused'); assert.equal(ui.keys.size, 0);
  const before = ui.engine.time;
  for (const code of ['KeyW', 'ArrowUp', 'Enter', 'Space', 'Escape']) {
    const event = ui.key(code); assert.equal(event.defaultPrevented, false);
  }
  ui.click('restart'); ui.advance(0.1);
  assert.equal(ui.engine.state, 'paused'); assert.equal(ui.engine.time, before);
  assert.equal(ui.keys.size, 0);
  ui.click('help-done'); assert.equal(ui.nodes.get('help-dialog').open, false);
  assert.equal(ui.engine.state, 'paused');
  ui.click('resume'); ui.frame(); assert.equal(ui.engine.state, 'racing');
});

test('focused buttons retain native Enter and Space activation, canvas Enter remains player 2 boost', async t => {
  const ui = await loadUI(t);
  for (const code of ['Enter', 'Space']) {
    ui.nodes.get('sound').focus();
    const event = ui.key(code);
    assert.equal(event.defaultPrevented, false, `${code} on a focused button retains native activation`);
    assert.equal(ui.engine.state, 'menu'); assert.equal(ui.keys.has(code), false);
  }
  ui.nodes.get('start').focus();
  const startKey = ui.key('Space');
  assert.equal(startKey.defaultPrevented, false);
  ui.click('start'); ui.advance(3.1);
  assert.equal(ui.document.activeElement.id, 'game');
  const boostKey = ui.key('Enter');
  assert.equal(boostKey.defaultPrevented, true); assert.equal(ui.keys.has('Enter'), true);
  ui.keyup('Enter');
  ui.nodes.get('help').focus();
  const helpKey = ui.key('Enter');
  assert.equal(helpKey.defaultPrevented, false); assert.equal(ui.keys.has('Enter'), false);
  ui.click('help'); assert.equal(ui.nodes.get('help-dialog').open, true);
});

test('modified browser shortcuts are preserved and sound toggle reports its state', async t => {
  const ui = await loadUI(t);
  ui.click('start'); ui.advance(3.1);
  for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) {
    const event = ui.key('KeyW', { [modifier]: true });
    assert.equal(event.defaultPrevented, false);
    assert.equal(ui.keys.has('KeyW'), false);
  }
  ui.click('sound');
  assert.equal(ui.nodes.get('sound').getAttribute('aria-pressed'), 'true');
  assert.equal(ui.nodes.get('sound').querySelector('span').textContent, '声音开');
  ui.click('sound');
  assert.equal(ui.nodes.get('sound').getAttribute('aria-pressed'), 'false');
  assert.equal(ui.nodes.get('sound').querySelector('span').textContent, '声音关');
});

test('rescue shortcuts update real car penalty and player HUD', async t => {
  const ui = await loadUI(t);
  ui.click('start'); ui.advance(3.1);
  const resets = ui.renderer.resetCalls.length;
  ui.key('KeyQ'); ui.key('Slash'); ui.frame();
  assert.ok(ui.engine.cars.every(car => car.rescueCooldown > 1.9));
  assert.equal(ui.nodes.get('offroad1').textContent, '返回赛道 · 罚停中');
  assert.equal(ui.nodes.get('offroad2').textContent, '返回赛道 · 罚停中');
  assert.equal(ui.renderer.resetCalls.length, resets + 2);
  assert.deepEqual(ui.renderer.resetCalls.slice(resets).map(call => call.playerId), [1, 2],
    'each rescue resets only the rescued player camera');
  for (const car of ui.engine.cars) {
    const cameraReset = ui.renderer.resetCalls.at(-1).cars[car.id - 1];
    assert.equal(cameraReset.x, car.x); assert.equal(cameraReset.y, car.y);
  }
});

test('a complete real-control race renders results and again/menu actions reset state', async t => {
  const ui = await loadUI(t);
  ui.click('start'); ui.advance(3.1);
  const steering = new Set();
  for (let frame = 0; frame < 60 * 240 && ui.engine.state !== 'finished'; frame++) {
    const car = ui.engine.cars[0], projection = projectTrack(car.x, car.y);
    const lane = 24;
    const target = trackPoint(projection.s + 75 + Math.abs(car.speed) * .14, lane);
    const error = mod(Math.atan2(target.y - car.y, target.x - car.x) - car.angle + Math.PI, Math.PI * 2) - Math.PI;
    let safeSpeed = 470, straightAhead = true;
    for (let ahead = 0; ahead <= 320; ahead += 40) {
      const curvature = trackPoint(projection.s + ahead).curvature;
      if (!curvature) continue;
      straightAhead = false;
      const laneRadius = Math.abs(1 / curvature) - Math.sign(curvature) * lane;
      safeSpeed = Math.min(safeSpeed, laneRadius * 1.6);
    }
    if (car.speed > safeSpeed + 8) { ui.key('KeyS'); ui.keyup('KeyW'); }
    else { ui.key('KeyW'); ui.keyup('KeyS'); }
    if (error > .025) { ui.key('KeyD'); steering.add('right'); } else ui.keyup('KeyD');
    if (error < -.025) { ui.key('KeyA'); steering.add('left'); } else ui.keyup('KeyA');
    if (straightAhead && Math.abs(error) < .12 && car.boost > 25) ui.key('ShiftLeft'); else ui.keyup('ShiftLeft');
    ui.frame();
  }
  assert.equal(ui.engine.state, 'finished');
  assert.equal(ui.engine.winner.id, 1); assert.equal(ui.engine.winner.lap, 3);
  assert.deepEqual([...steering].sort(), ['left', 'right']);
  assert.equal(ui.nodes.get('result').classList.contains('hidden'), false);
  assert.equal(ui.nodes.get('winner-name').textContent, '青色闪电获胜！');
  const displayedTime = ui.nodes.get('finish-time').textContent;
  assert.match(displayedTime, /^\d{2}:\d{2}\.\d{2}$/);
  const [minutes, seconds] = displayedTime.split(':').map(Number);
  assert.ok(Math.abs(minutes * 60 + seconds - ui.engine.winner.finishTime) <= .0051);
  assert.notEqual(ui.nodes.get('best-lap').textContent, '—');
  assert.equal(ui.keys.size, 0);
  ui.click('again'); ui.frame();
  assert.equal(ui.engine.state, 'countdown'); assert.equal(ui.engine.winner, null);
  assert.equal(ui.nodes.get('result').classList.contains('hidden'), true);
  assert.equal(ui.nodes.get('timer').textContent, '00:00.00');
  ui.click('back-menu'); ui.frame();
  assert.equal(ui.engine.state, 'menu'); assert.equal(ui.engine.cars[0].lap, 0);
  assert.equal(ui.nodes.get('menu').classList.contains('hidden'), false);
});
