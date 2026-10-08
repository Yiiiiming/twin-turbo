import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TRACK, TRACKS, setTrack, trackPoint, projectTrack, mod } from '../engine.js';
import { RaceAI } from '../ai.js';
import { GHOST_VERSION } from '../ghost-client.js';
import { validateReplay, validateRaceReplay, RACE_GHOST_VERSION } from '../ghost-replay.js';
import { LEADERBOARD_VERSION } from '../leaderboard.js';

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
    this.classList = new MockClassList(attributes.class); this.style = { setProperty(name, value) { this[name] = value; } };
    this.dataset = {}; this.children = []; this.parentElement = null;
    this.textContent = ''; this.innerHTML = ''; this.disabled = 'disabled' in attributes;
    this.value = '';
    this.open = false; this.hidden = 'hidden' in attributes; this.isContentEditable = false;
    this.clientWidth = 1200; this.clientHeight = 700; this.width = 1200; this.height = 700;
    for (const [name, value] of Object.entries(attributes)) {
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    }
  }
  get firstElementChild() { return this.children[0] || this.appendChild(new MockNode('strong', this.ownerDocument)); }
  get lastElementChild() { return this.children.at(-1) || this.firstElementChild; }
  appendChild(child) { if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(item=>item!==child); child.parentElement = this; this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  replaceChildren(...children) { this.children = []; children.forEach(child => this.appendChild(child)); }
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
  scrollIntoView(options) { this.scrollCalls ||= []; this.scrollCalls.push(options); }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch('close'); }
  getBoundingClientRect() { return { left: 200, right: 1000, top: 100, bottom: 600, width: 800, height: 500 }; }
  matches(selector) {
    return selector.split(',').some(item => {
      const value = item.trim();
      if (value === '[contenteditable]' || value.startsWith('[contenteditable=')) return this.isContentEditable;
      if (value === '[role="button"]') return this.getAttribute('role') === 'button';
      if (value === 'a[href]') return this.tagName === 'A' && this.hasAttribute('href');
      if (value.startsWith('.')) return value.slice(1).split('.').every(name => this.classList.contains(name));
      const tag = /^([a-z][a-z0-9-]*)/i.exec(value)?.[1];
      const attributes = [...value.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)];
      if (attributes.length) return (!tag || tag.toUpperCase() === this.tagName) && attributes.every(([, name, expected]) =>
        expected === undefined ? this.hasAttribute(name) : this.getAttribute(name) === expected);
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
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  getContext() { return this.context ||= canvasContext(); }
}

function canvasContext() {
  const state = { calls: [], counts: new Map(), depth: 0 };
  const selected = new Set(['rect', 'clip', 'drawImage', 'setTransform', 'translate', 'clearRect', 'fillRect', 'fillText']);
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

async function loadUI(t, { graphicsAvailable = true, fetchImpl, search = '?city=coast', language = 'zh', configureRace = true } = {}) {
  setTrack('coast'); t.after(() => setTrack('coast'));
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const document = new MockTarget();
  const nodes = new Map(), allNodes = [], lapButtons = [], lapLabels = [], modeButtons = [], requests = [];
  document.body = new MockNode('body', document); document.activeElement = document.body;
  document.documentElement = new MockNode('html', document);
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
  document.createElementNS = (_, tag) => new MockNode(tag, document);
  document.querySelectorAll = selector => {
    if (selector === '[data-laps]') return lapButtons;
    if (selector === '.total-laps') return lapLabels;
    if (selector === '[data-mode]') return modeButtons;
    return allNodes.filter(node => node.matches(selector));
  };
  for (const match of html.matchAll(/<([a-z][a-z\d-]*)\b([^>]*)>/gi)) {
    const attributes = {};
    for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attributes[attr[1]] = attr[2] ?? '';
    if (!attributes.id && !Object.keys(attributes).some(name => name.startsWith('data-')) && !attributes.class) continue;
    const node = new MockNode(match[1], document, attributes); allNodes.push(node);
    if (node.id) nodes.set(node.id, node);
    if ('data-laps' in attributes) lapButtons.push(node);
    if ('data-mode' in attributes) modeButtons.push(node);
    if (attributes.class?.includes('total-laps')) lapLabels.push(node);
  }
  nodes.get('result').appendChild(nodes.get('result-save-host'));
  nodes.get('result-save-host').appendChild(nodes.get('records-results'));
  nodes.get('records-results').appendChild(nodes.get('records-result-list'));
  nodes.get('records-center').appendChild(nodes.get('records-pending-host'));
  nodes.get('countdown').appendChild(new MockNode('strong', document));
  nodes.get('countdown').appendChild(new MockNode('span', document));
  const window = new MockTarget(); window.devicePixelRatio = 1;
  const stored = new Map(); window.localStorage = { getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,String(value)),removeItem:key=>stored.delete(key) };
  let clock = 0;
  const frames = [], delayed = [];
  const globals = { document, window, localStorage: window.localStorage, location: {search}, Element: MockNode, HTMLElement: MockNode,
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      if (fetchImpl) return fetchImpl(url, options);
      if (url.includes('/api/laps') || url.includes('/api/ghosts')) return { ok: true, status: 200, json: async () => ({ version:new URL(url).searchParams.get('version'),city:new URL(url).searchParams.get('city'),entries:[] }) };
      return { ok: true, status: 200, json: async () => url.includes('/api/qualify')
        ? { rank: null, entries: [] }
        : { version: LEADERBOARD_VERSION, city: new URL(url).searchParams.get('city'), laps: Number(new URL(url).searchParams.get('laps')), entries: [] } };
    },
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
      this.obstacles = [{ type: 'circle', x: 100, y: 100, radius: 12 }];
      this.resetCalls = []; this.rebuildCalls = []; this.renderCount = 0;
    }
    setGhostPoses(poses) { this.ghostPoses = poses; }
    setSinglePlayer(enabled) { this.singlePlayer=Boolean(enabled);return this; }
    rebuild(engine) { this.rebuildCalls.push(engine); engine.setObstacles(this.obstacles);this.resetCameras(engine);return this; }
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
    .replace("from './i18n.js'", `from '${new URL('../i18n.js', import.meta.url).href}'`)
    .replace("from './controls.js'", `from '${new URL('../controls.js', import.meta.url).href}'`)
    .replace("from './split-timing.js'", `from '${new URL('../split-timing.js', import.meta.url).href}'`)
    .replace("from './ghost-client.js'", `from '${new URL('../ghost-client.js', import.meta.url).href}'`)
    .replace("from './ghost-replay.js'", `from '${new URL('../ghost-replay.js', import.meta.url).href}'`)
    .replace("from './engine.js'", `from '${engineURL.href}'`)
    .replace("from './renderer.js'", `from '${rendererURL}'`)
    .replace("from './city-renderer.js'", `from '${new URL('../city-renderer.js', import.meta.url).href}'`)
    .replace("from './ai.js'", `from '${new URL('../ai.js', import.meta.url).href}'`)
    .replace("from './unified-records.js'", `from '${new URL('../unified-records.js', import.meta.url).href}'`)
    .replace("from './leaderboard-client.js'", `from '${new URL('../leaderboard-client.js', import.meta.url).href}'`);
  // Load shipped application source unmodified except dependency resolution and
  // read-only test exports. No duplicated event handlers or production hooks.
  const entry = `${source}\nexport { engine, keys, renderer, ai, bindings, leaderboard, ghostClient, ghostRecorder, splitTiming, i18n, trackCards };\n// test instance ${++instance}`;
  const application = await import(`data:text/javascript;base64,${Buffer.from(entry).toString('base64')}`);
  const ui = {
    ...application, nodes, allNodes, document, window, lapButtons, lapLabels, modeButtons, html, requests,
    async flush() { for (let pass = 0; pass < 12; pass++) await Promise.resolve(); },
    frame(dt = 1 / 60) {
      clock += dt * 1000;
      assert.equal(frames.length, 1, 'one animation loop is scheduled');
      frames.shift()(clock);
      assert.equal(nodes.get('hud').context.depth, 0, 'frame restores HUD Canvas state');
    },
    advance(seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) this.frame(); },
    click(id) { return nodes.get(id).click(); },
    launch(id = 'start') { const event = this.click(id); if (nodes.get('race-setup-dialog').open) this.click('setup-launch'); return event; },
    key(code, options = {}) { return window.dispatch('keydown', { code, target: document.activeElement, ...options }); },
    keyup(code, options = {}) { return window.dispatch('keyup', { code, target: document.activeElement, ...options }); },
  };
  if(language)ui.click(`language-${language}`);
  // Physics scenarios choose their intended configuration through real controls;
  // the dedicated defaults test leaves the product's initial choices untouched.
  if(configureRace){
    application.trackCards.get('coast').button.click();
    // Coast-based physics scenarios begin after the explicit map selection.
    application.renderer.rebuildCalls.length = 0;
    application.renderer.resetCalls.splice(0, application.renderer.resetCalls.length - 1);
    modeButtons.find(button=>button.dataset.mode==='local').click();
    lapButtons.find(button=>button.dataset.laps==='3').click();
    nodes.get('records-tab-3').click();
  }
  ui.frame();
  await ui.flush();
  return ui;
}

test('real main.js delegates scene rendering and draws two player maps on the separate HUD', async t => {
  const ui = await loadUI(t);
  assert.equal(ui.engine.state, 'menu');
  assert.equal(ui.nodes.get('race-status').textContent, '等待发车');
  assert.equal(ui.nodes.get('pause').disabled, true);
  assert.equal(ui.renderer.canvas, ui.nodes.get('game'));
  assert.ok(ui.engine.obstacleWorld, 'renderer obstacle data is injected into the engine');
  assert.equal(ui.engine.obstacleWorld.obstacles.length, 1);
  assert.equal(ui.engine.obstacleWorld.obstacles[0].radius, ui.renderer.obstacles[0].radius);
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
  ui.launch(); ui.launch('restart'); ui.key('Space'); ui.frame();
  assert.equal(ui.engine.state, 'menu');
  assert.equal(ui.renderer.resetCalls.length, 1);
  ui.renderer.available = true; ui.frame();
  assert.equal(ui.nodes.get('graphics-note').classList.contains('hidden'), true);
  assert.equal(ui.nodes.get('start').disabled, false);
  assert.equal(ui.nodes.get('again').disabled, false);
  ui.launch(); ui.frame();
  assert.equal(ui.engine.state, 'countdown');
  assert.equal(ui.renderer.resetCalls.length, 2);
});

test('losing graphics during a race freezes time and requires explicit resume after recovery', async t => {
  const ui = await loadUI(t);
  ui.launch(); ui.advance(3.1);
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
  assert.match(contents, /id="records-results"/, 'fullscreen results contain the actual nickname save forms');
  assert.doesNotMatch(ui.html, /id="(?:record-dialog|ghost-results|lap-list|board-list)"/, 'old duplicate boards and nickname dialog are absent');
  await Promise.all(ui.click('fullscreen').pending);
  assert.equal(ui.document.fullscreenElement, ui.nodes.get('race-stage'));
  assert.equal(ui.nodes.get('race-stage').fullscreenRequests, 1);
  assert.equal(ui.document.activeElement, ui.nodes.get('game'));
  await Promise.all(ui.click('fullscreen-exit').pending);
  assert.equal(ui.document.fullscreenElement, null);
  assert.equal(ui.document.fullscreenExits, 1);
  assert.equal(ui.document.activeElement, ui.nodes.get('game'));
});

test('start and Space open preparation before countdown, with an explicit no-ghost launch', async t => {
  const ui = await loadUI(t);
  ui.click('start');
  assert.equal(ui.nodes.get('race-setup-dialog').open, true);
  assert.equal(ui.engine.state, 'menu');
  assert.match(ui.nodes.get('race-setup-summary').textContent, /3 圈/);
  ui.key('KeyW'); ui.advance(.2);
  assert.equal(ui.engine.time, 0); assert.equal(ui.keys.size, 0);
  ui.click('setup-close');
  assert.equal(ui.nodes.get('race-setup-dialog').open, false);
  assert.equal(ui.engine.state, 'menu');
  ui.nodes.get('game').focus(); ui.key('Space');
  assert.equal(ui.nodes.get('race-setup-dialog').open, true);
  assert.equal(ui.engine.state, 'menu');
  ui.nodes.get('ghost-enabled').checked = true;
  ui.click('setup-skip'); ui.frame();
  assert.equal(ui.nodes.get('race-setup-dialog').open, false);
  assert.equal(ui.engine.state, 'countdown');
  assert.equal(ui.nodes.get('ghost-enabled').checked, false);
  assert.equal(ui.nodes.get('ghost-race-label').textContent, '');
  ui.advance(3.1);
  ui.click('restart'); ui.frame();
  assert.equal(ui.nodes.get('race-setup-dialog').open, true);
  assert.equal(ui.engine.state, 'paused', 'opening restart preparation first pauses the current race');
  const before = ui.engine.time; ui.advance(.2);
  assert.equal(ui.engine.time, before);
  ui.click('setup-launch'); ui.frame();
  assert.equal(ui.engine.state, 'countdown'); assert.equal(ui.engine.time, 0);
});

test('custom bindings reject conflicts and reserved keys, then drive the real player with the new key', async t => {
  const ui = await loadUI(t);
  const bind = (player, action) => ui.document.querySelectorAll('[data-bind-player][data-bind-action]')
    .find(button => button.dataset.bindPlayer === String(player) && button.dataset.bindAction === action);
  ui.click('open-bindings');
  assert.equal(ui.nodes.get('bindings-dialog').open, true);
  bind(1, 'accelerate').click();
  ui.key('ArrowUp');
  assert.match(ui.nodes.get('bindings-message').textContent, /已用于/);
  assert.notEqual(bind(1, 'accelerate').textContent, '↑');
  ui.key('Space');
  assert.match(ui.nodes.get('bindings-message').textContent, /空格|Esc/);
  assert.equal(ui.engine.state, 'menu');
  ui.key('KeyI');
  assert.equal(bind(1, 'accelerate').textContent, 'I');
  assert.ok(ui.document.querySelectorAll('[data-control-player="1"][data-control-action="accelerate"]')
    .every(node => node.textContent === 'I'), 'help and visible key hints reflect the selected binding');
  ui.click('bindings-done'); ui.launch(); ui.advance(3.1);
  ui.key('KeyW'); ui.advance(.3);
  assert.equal(ui.engine.cars[0].speed, 0, 'the former binding no longer accelerates');
  ui.key('KeyI'); ui.advance(.4);
  assert.ok(ui.engine.cars[0].speed > 70);
  ui.keyup('KeyI');
  ui.key('Escape'); ui.click('pause-menu'); ui.frame();
  ui.click('open-bindings'); ui.click('bindings-reset');
  assert.equal(bind(1, 'accelerate').textContent, 'W');
  ui.click('bindings-done'); ui.launch(); ui.advance(3.1); ui.key('KeyW'); ui.advance(.4);
  assert.ok(ui.engine.cars[0].speed > 70);
});

test('single-player orange changes appearance and labels while retaining P1 controls and independent AI', async t => {
  const ui = await loadUI(t);
  ui.click('open-bindings');
  const p2Accelerate = ui.document.querySelectorAll('[data-bind-player][data-bind-action]')
    .find(button => button.dataset.bindPlayer === '2' && button.dataset.bindAction === 'accelerate');
  p2Accelerate.click(); ui.key('KeyK'); ui.click('bindings-done');
  ui.modeButtons.find(button => button.dataset.mode === 'ai').click();
  const orange = ui.document.querySelectorAll('[data-player-color]').find(button => button.dataset.playerColor === 'orange');
  orange.click();
  assert.equal(orange.getAttribute('aria-pressed'), 'true');
  assert.match(ui.nodes.get('player1-name').textContent, /橙色风暴/);
  assert.match(ui.nodes.get('player2-name').textContent, /AI.*青色闪电/);
  ui.launch(); ui.advance(3.1);
  assert.equal(ui.engine.cars[0].id, 1); assert.equal(ui.engine.cars[0].colorIndex, 1);
  assert.equal(ui.engine.cars[1].id, 2); assert.equal(ui.engine.cars[1].colorIndex, 0);
  assert.equal(ui.engine.cars[0]._lane, -18); assert.equal(ui.engine.cars[1]._lane, 22);
  ui.key('KeyW'); ui.advance(.4);
  assert.ok(ui.engine.cars[0].speed > 70, 'P1 driving controls still drive the human orange car');
  assert.ok(ui.engine.cars[1].speed > 70, 'AI drives via canonical controls despite remapping P2 acceleration');
  assert.ok(ui.ai.elapsed > 0);
});

test('lap selection, start focus, countdown HUD and both keyboard drivers use actual handlers', async t => {
  const ui = await loadUI(t);
  ui.lapButtons.find(button => button.dataset.laps === '1').click();
  assert.ok(ui.lapLabels.every(label => label.textContent === 1));
  assert.equal(ui.lapButtons.find(button => button.dataset.laps === '1').getAttribute('aria-pressed'), 'true');
  ui.launch(); ui.frame();
  assert.equal(ui.engine.laps, 1); assert.equal(ui.engine.state, 'countdown');
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
  ui.launch(); ui.advance(3.1);
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
  ui.launch(); ui.advance(3.1); ui.key('KeyW'); ui.click('help');
  assert.equal(ui.nodes.get('help-dialog').open, true);
  assert.equal(ui.engine.state, 'paused'); assert.equal(ui.keys.size, 0);
  const before = ui.engine.time;
  for (const code of ['KeyW', 'ArrowUp', 'Enter', 'Space', 'Escape']) {
    const event = ui.key(code); assert.equal(event.defaultPrevented, false);
  }
  ui.launch('restart'); ui.advance(0.1);
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
  ui.launch(); ui.advance(3.1);
  assert.equal(ui.document.activeElement.id, 'game');
  const boostKey = ui.key('Enter');
  assert.equal(boostKey.defaultPrevented, true); assert.equal(ui.keys.has('Enter'), true);
  ui.keyup('Enter');
  ui.nodes.get('help').focus();
  const helpKey = ui.key('Enter');
  assert.equal(helpKey.defaultPrevented, false); assert.equal(ui.keys.has('Enter'), false);
  ui.click('help'); assert.equal(ui.nodes.get('help-dialog').open, true);
});

test('single-player mode drives only player 2 through AI controls and freezes the AI while paused', async t => {
  const ui = await loadUI(t);
  assert.equal(ui.modeButtons.find(button => button.dataset.mode === 'local').getAttribute('aria-pressed'), 'true');
  ui.modeButtons.find(button => button.dataset.mode === 'ai').click();
  assert.equal(ui.nodes.get('player2-name').textContent, 'AI · 橙色风暴');
  assert.equal(ui.nodes.get('player2-controls').classList.contains('hidden'), true);
  ui.launch(); ui.advance(3.1);
  ui.key('ArrowUp'); ui.key('ArrowLeft'); ui.key('Enter');
  assert.deepEqual([...ui.bindings.frameKeys(ui.keys, true)].sort(), ['KeyA', 'KeyW', 'ShiftLeft'], 'both physical layouts map solely to human canonical controls in solo mode');
  ui.keyup('ArrowUp'); ui.keyup('ArrowLeft'); ui.keyup('Enter');
  assert.equal(ui.engine.cars[1].rescueCooldown, 0);
  ui.key('KeyW'); ui.advance(.4);
  assert.ok(ui.engine.cars[0].speed > 0); assert.ok(ui.engine.cars[1].speed > 0);
  const elapsed = ui.ai.elapsed;
  ui.key('Escape'); ui.advance(.2);
  assert.equal(ui.ai.elapsed, elapsed);
  ui.click('resume'); ui.frame(); assert.ok(ui.ai.elapsed > elapsed);
});

test('finish overlay directly offers the sole nickname form without leaving fullscreen or stealing input shortcuts', async t => {
  const ui = await loadUI(t);
  ui.modeButtons.find(button => button.dataset.mode === 'ai').click();
  ui.launch(); ui.advance(3.1);
  const winner = ui.engine.cars[0];
  Object.assign(winner, { finished: true, lap: 3, finishTime: 120.125, bestLap: 39.8 });
  Object.assign(ui.engine.cars[1], { finished: true, lap: 3, finishTime: 130.2, bestLap: 42.1 });
  ui.engine.winner = winner; ui.engine.state = 'finished'; ui.frame(); await ui.flush();
  assert.equal(ui.leaderboard.cards.length, 1);
  assert.equal(ui.nodes.get('records-results').hidden, false);
  assert.equal(ui.requests.filter(request => request.url.includes('/api/qualify')).length, 0);
  assert.equal(ui.requests.filter(request => request.method === 'POST').length, 0, 'results wait for an explicit save');
  await Promise.all(ui.click('fullscreen').pending);
  const positions = ui.engine.cars.map(({x,y}) => ({x,y}));
  const card = ui.leaderboard.cards[0];
  assert.equal(ui.nodes.has('show-records'),false,'no separate button or navigation is needed to save');
  assert.equal(ui.nodes.get('records-results').parentElement,ui.nodes.get('result-save-host'));
  assert.equal(card.input.closest('form').parentElement,ui.nodes.get('records-result-list'));
  assert.equal(ui.document.fullscreenElement,ui.nodes.get('race-stage'),'inline saving remains inside the fullscreen stage');
  assert.equal(ui.nodes.get('records-center').scrollCalls?.length||0,0,'finishing never scrolls to the page leaderboard');
  assert.equal((ui.html.match(/id="records-results"/g)||[]).length,1,'there is only one save area');
  assert.equal(ui.document.activeElement, card.input, 'only human result receives keyboard focus');
  for (const code of ['KeyW', 'Space', 'Enter', 'ArrowUp', 'Escape']) {
    assert.equal(ui.key(code).defaultPrevented, false);
  }
  card.input.dispatch('compositionstart');
  assert.equal(ui.key('Space', { isComposing: true, keyCode: 229 }).defaultPrevented, false);
  card.input.dispatch('compositionend');
  assert.equal(ui.engine.state, 'finished'); assert.equal(ui.keys.size, 0);
  assert.deepEqual(ui.engine.cars.map(({x,y}) => ({x,y})), positions);
  ui.click('back-menu'); ui.frame();
  assert.equal(ui.engine.state, 'menu');
  assert.equal(ui.leaderboard.cards.length, 1, 'returning to menu preserves the unsaved result');
  assert.equal(ui.leaderboard.cards[0], card);
  assert.equal(ui.nodes.get('records-results').parentElement,ui.nodes.get('records-pending-host'),'unsaved forms stay accessible after returning to the menu');
  ui.launch(); ui.frame();
  assert.equal(ui.leaderboard.cards.length, 0, 'starting a new race clears prior results');
});

test('an AI victory lets the human finish, then offers only the human record', async t => {
  const ui = await loadUI(t);
  ui.modeButtons.find(button => button.dataset.mode === 'ai').click();
  ui.launch(); ui.advance(3.1);
  const winner = ui.engine.cars[1];
  Object.assign(winner, { finished: true, lap: 3, finishTime: 139, bestLap: 46 });
  ui.engine.winner = winner; ui.engine.time = 139; ui.frame(); await ui.flush();
  assert.equal(ui.engine.state, 'racing');
  assert.equal(ui.leaderboard.cards.length, 0);
  assert.equal(ui.requests.filter(request => request.url.includes('/api/qualify')).length, 0);
  assert.equal(ui.nodes.get('finisher2').classList.contains('hidden'), false);
  ui.key('KeyW'); ui.advance(.3);
  assert.ok(ui.engine.cars[0].speed > 0);
  Object.assign(ui.engine.cars[0], { finished: true, lap: 3, finishTime: 143.8, bestLap: 46.5 });
  ui.engine.state = 'finished'; ui.frame(); await ui.flush();
  assert.equal(ui.leaderboard.cards.length, 1);
  assert.equal(ui.leaderboard.cards[0].playerId, 1);
  assert.equal(ui.requests.filter(request => request.url.includes('/api/qualify')).length, 0);
  assert.equal(ui.nodes.get('winner-name').textContent, 'AI · 橙色风暴获胜！');
  assert.equal(ui.nodes.get('result-driver2').textContent, '青色闪电');
});

test('both human finishers get independent name cards in finish order even when player 2 wins', async t => {
  const ui = await loadUI(t);
  ui.launch(); ui.advance(3.1);
  Object.assign(ui.engine.cars[0], { finished: true, lap: 3, finishTime: 120.2, bestLap: 40 });
  Object.assign(ui.engine.cars[1], { finished: true, lap: 3, finishTime: 120.1, bestLap: 39.9 });
  ui.engine.winner = ui.engine.cars[1]; ui.engine.state = 'finished'; ui.frame(); await ui.flush();
  assert.deepEqual(ui.leaderboard.cards.map(card => card.playerId), [2, 1]);
  const [firstCard, secondCard] = ui.leaderboard.cards;
  firstCard.input.value = 'Orange Racer'; secondCard.input.value = 'Cyan Racer';
  assert.notEqual(firstCard.input, secondCard.input, 'each human can enter their own nickname');
  assert.equal(ui.nodes.get('winner-name').textContent, '橙色风暴获胜！');
  assert.equal(ui.nodes.get('result-driver1').textContent, '橙色风暴');
  assert.equal(ui.nodes.get('result-driver2').textContent, '青色闪电');
  assert.equal(ui.nodes.get('finish-time').textContent, '02:00.10');
  assert.equal(ui.nodes.get('finish-time2').textContent, '02:00.20');
  assert.equal(ui.nodes.get('best-lap2').textContent, '00:40.00');
  assert.equal(ui.nodes.get('finisher1').classList.contains('hidden'), true);
  assert.equal(ui.nodes.get('finisher2').classList.contains('hidden'), true);
  ui.frame(); await ui.flush();
  assert.deepEqual(ui.leaderboard.cards, [firstCard, secondCard], 'rendering another frame does not replace name cards');
  assert.equal(firstCard.input.value, 'Orange Racer'); assert.equal(secondCard.input.value, 'Cyan Racer');
  assert.equal(ui.requests.filter(request => request.method === 'POST').length, 0);
  ui.click('again');ui.frame();assert.equal(ui.engine.state,'menu','again returns to the map choices');
  assert.equal(ui.nodes.get('race-setup-dialog').open,false,'again does not skip straight into preparing the previous map');
  assert.deepEqual(ui.leaderboard.cards,[firstCard,secondCard]);
  ui.trackCards.get('coast-neon').button.click();ui.frame();assert.equal(TRACK.id,'coast-neon');
  ui.click('start');assert.equal(ui.nodes.get('race-setup-dialog').open,true);assert.equal(ui.engine.state,'menu');
});

test('the first finisher waits without interrupting the other player or showing save cards', async t => {
  const ui = await loadUI(t);
  ui.launch(); ui.advance(3.1);
  const first = ui.engine.cars[0];
  Object.assign(first, { finished: true, lap: 3, finishTime: 120.125, bestLap: 39.8, speed: 0 });
  ui.engine.winner = first; ui.engine.time = 120.125;
  ui.key('ArrowUp'); ui.key('Enter'); ui.advance(.3); await ui.flush();
  assert.equal(ui.engine.state, 'racing');
  assert.ok(ui.engine.time > first.finishTime);
  assert.ok(ui.engine.cars[1].speed > 0);
  assert.equal(ui.keys.has('ArrowUp'), true);
  assert.equal(ui.nodes.get('result').classList.contains('hidden'), true);
  assert.equal(ui.leaderboard.cards.length, 0);
  assert.equal(ui.requests.filter(request => request.url.includes('/api/qualify')).length, 0);
  assert.equal(ui.nodes.get('finisher1').classList.contains('hidden'), false);
  assert.equal(ui.nodes.get('finisher2').classList.contains('hidden'), true);
  assert.equal(ui.nodes.get('finisher-place1').textContent, '第 1 名 · 已完赛');
  assert.equal(ui.nodes.get('finisher-time1').textContent, '02:00.13');
  assert.equal(ui.nodes.get('race-status').textContent, '等待另一位完赛');
  const resets = ui.renderer.resetCalls.length;
  ui.key('KeyQ'); ui.frame();
  assert.equal(ui.renderer.resetCalls.length, resets, 'a finished car cannot reset the camera or show a rescue penalty');
  ui.key('Escape'); ui.frame();
  const pausedAt = ui.engine.time;
  assert.equal(ui.engine.state, 'paused');
  ui.advance(.1); assert.equal(ui.engine.time, pausedAt);
  ui.click('resume'); ui.key('ArrowUp'); ui.advance(.1);
  assert.equal(ui.engine.state, 'racing');
  assert.ok(ui.engine.time > pausedAt);
  assert.equal(first.finishTime, 120.125);
  assert.equal(ui.nodes.get('finisher1').classList.contains('hidden'), false);
  ui.launch('restart'); ui.frame();
  assert.equal(ui.engine.state, 'countdown');
  assert.equal(ui.nodes.get('finisher1').classList.contains('hidden'), true);
  assert.equal(ui.engine.winner, null);
});

test('modified browser shortcuts are preserved and sound toggle reports its state', async t => {
  const ui = await loadUI(t);
  ui.launch(); ui.advance(3.1);
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
  ui.launch(); ui.advance(3.1);
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

test('both player scoreboards count consecutive full laps despite brief shoulder excursions at a gate', async t => {
  const ui = await loadUI(t);
  ui.launch(); ui.advance(3.1);
  const gate = TRACK.startDistance + TRACK.length / TRACK.checkpoints;
  let verifiedLaps = 0;
  const grassFrames = [0, 0];
  // Smooth, continuous position samples exercise the actual engine and HUD.
  // The old logic lost an entire lap after only 1–2 frames beyond the asphalt.
  for (let s = TRACK.startDistance - 25; s < TRACK.startDistance + TRACK.length * 2 + 10; s += 5) {
    const circuitDistance = TRACK.startDistance + mod(s - TRACK.startDistance, TRACK.length);
    for (const [index, car] of ui.engine.cars.entries()) {
      const lane = index === 0 ? 22 : -18;
      const bump = Math.max(0, 1 - Math.abs(circuitDistance - gate) / 100) * (62 - Math.abs(lane));
      const p = trackPoint(s, lane + Math.sign(lane) * bump);
      car.x = p.x; car.y = p.y; car.angle = p.angle; car.speed = 0;
    }
    ui.frame(1 / 120);
    for (const [index, car] of ui.engine.cars.entries()) if (car.offroad) grassFrames[index]++;
    const expected = Math.max(0, Math.floor((s - TRACK.startDistance) / TRACK.length));
    if (expected > verifiedLaps) {
      for (const car of ui.engine.cars) {
        assert.equal(car.lap, expected, `player ${car.id} earns full lap ${expected} after a short shoulder excursion`);
        assert.equal(Number(ui.nodes.get('lap' + car.id).textContent), expected,
          `player ${car.id} scoreboard updates on the finish crossing frame`);
        assert.equal(car.missedCheckpoint, false);
      }
      verifiedLaps = expected;
    }
  }
  assert.equal(verifiedLaps, 2);
  assert.ok(grassFrames.every(count => count > 0), 'both cars genuinely leave the asphalt briefly');
  assert.equal(ui.engine.state, 'racing');
});

test('a real-control race saves one nickname for total, lap and complete three-lap ghost, retries only the failed part, and resets cleanly', async t => {
  let failedLapOnce = false;
  const savedTotals = [], savedLaps = [], savedRaces = [];
  const ui = await loadUI(t, { fetchImpl: async (url, options = {}) => {
    const lap = url.includes('/api/laps') || url.includes('/api/ghosts'), body = options.body ? JSON.parse(options.body) : null;
    const isRace = (body?.version || new URL(url).searchParams.get('version')) === RACE_GHOST_VERSION;
    const category = lap ? { version: isRace ? RACE_GHOST_VERSION : GHOST_VERSION, city: 'coast' }
      : { version: LEADERBOARD_VERSION, city: 'coast', laps: body?.laps || Number(new URL(url).searchParams.get('laps')) || 3 };
    if (body) {
      if (lap && !isRace && !failedLapOnce) {
        failedLapOnce = true;
        return { ok: false, status: 503, json: async () => ({ error: 'temporary_failure' }) };
      }
      const entry = { ...body, ...(isRace ? { kind: 'race', laps: 3 } : {}), createdAt: 1 };
      delete entry.replay;
      (lap ? isRace ? savedRaces : savedLaps : savedTotals).push(entry);
      return { ok: true, status: 200, json: async () => ({ ...category, saved: true, entry, entries: lap ? isRace ? savedRaces : savedLaps : savedTotals }) };
    }
    return { ok: true, status: 200, json: async () => ({ ...category, entries: lap ? isRace ? savedRaces : savedLaps : savedTotals }) };
  } });
  ui.launch(); ui.advance(3.1);
  const steering = new Set();
  const opponent = new RaceAI();
  for (let frame = 0; frame < 60 * 240 && ui.engine.state !== 'finished'; frame++) {
    const car = ui.engine.cars[0], projection = projectTrack(car.x, car.y);
    const lane = -24;
    const target = trackPoint(projection.s + 75 + Math.abs(car.speed) * .14, lane);
    const error = mod(Math.atan2(target.y - car.y, target.x - car.x) - car.angle + Math.PI, Math.PI * 2) - Math.PI;
    let safeSpeed = 517, straightAhead = true;
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
    const opponentKeys = opponent.update(ui.engine, 1 / 60);
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']) {
      if (opponentKeys.has(code)) ui.key(code); else ui.keyup(code);
    }
    ui.frame();
  }
  assert.equal(ui.engine.state, 'finished');
  assert.equal(ui.engine.winner.id, 1); assert.equal(ui.engine.winner.lap, 3);
  assert.ok(ui.engine.cars.every(car => car.finished));
  assert.deepEqual([...steering].sort(), ['left', 'right']);
  assert.equal(ui.nodes.get('result').classList.contains('hidden'), false);
  assert.equal(ui.nodes.get('winner-name').textContent, '青色闪电获胜！');
  const displayedTime = ui.nodes.get('finish-time').textContent;
  assert.match(displayedTime, /^\d{2}:\d{2}\.\d{2}$/);
  const [minutes, seconds] = displayedTime.split(':').map(Number);
  assert.ok(Math.abs(minutes * 60 + seconds - ui.engine.winner.finishTime) <= .0051);
  assert.notEqual(ui.nodes.get('best-lap').textContent, '—');
  assert.notEqual(ui.nodes.get('best-lap2').textContent, '—');
  assert.equal(ui.nodes.get('result-driver2').textContent, '橙色风暴');
  assert.notEqual(ui.nodes.get('finish-time').textContent, ui.nodes.get('finish-time2').textContent);
  assert.equal(ui.keys.size, 0);
  assert.equal(ui.leaderboard.cards.length, 2, 'both human finishers receive one combined save card each');
  assert.equal(ui.nodes.get('records-results').hidden, false);
  for (const car of ui.engine.cars) {
    const replay = ui.ghostRecorder.bestReplay(car.id);
    assert.ok(validateReplay(replay), 'actual harbor race creates a complete valid replay');
    assert.equal(replay.durationMs, Math.round(car.bestLap * 1000));
    const fullRace = ui.ghostRecorder.fullRaceReplay(car.id);
    assert.ok(validateRaceReplay(fullRace), 'actual controls record every lap of the race from GO');
    assert.equal(fullRace.durationMs, Math.round(car.finishTime * 1000));
    assert.equal(fullRace.lapEndsMs.length, 3);
    assert.equal(fullRace.frames[0][0], 0);
    assert.equal(ui.nodes.get('personal-best'+car.id).textContent, ui.nodes.get(car.id===1?'best-lap':'best-lap2').textContent);
  }
  const cards = ui.leaderboard.cards;
  const winnerCard = cards.find(card => card.playerId === 1);
  winnerCard.input.value = 'Harbor Champion';
  const saveForm = winnerCard.input.closest('form');
  assert.ok(saveForm, 'the nickname and save action share one form');
  await Promise.all(saveForm.dispatch('submit').pending); await ui.flush();
  const posts = () => ui.requests.filter(request => request.method === 'POST');
  const totalPosts = () => posts().filter(request => request.url.includes('/api/records'));
  const lapPosts = () => posts().filter(request => request.url.includes('/api/laps') && JSON.parse(request.body).version === GHOST_VERSION);
  const racePosts = () => posts().filter(request => request.url.includes('/api/laps') && JSON.parse(request.body).version === RACE_GHOST_VERSION);
  assert.equal(totalPosts().length, 1);
  assert.equal(lapPosts().length, 1);
  assert.equal(savedTotals.length, 1); assert.equal(savedLaps.length, 0); assert.equal(savedRaces.length, 1);
  assert.equal(racePosts().length, 1);
  const raceSubmission = JSON.parse(racePosts()[0].body);
  assert.equal(raceSubmission.name, 'Harbor Champion'); assert.ok(validateRaceReplay(raceSubmission.replay));
  const totalSubmission = JSON.parse(totalPosts()[0].body), lapSubmission = JSON.parse(lapPosts()[0].body);
  assert.equal(totalSubmission.name, 'Harbor Champion');
  assert.equal(lapSubmission.name, totalSubmission.name, 'one nickname is shared by both records');
  assert.equal(totalSubmission.timeMs, Math.round(ui.engine.cars[0].finishTime * 1000));
  assert.equal(lapSubmission.timeMs, Math.round(ui.engine.cars[0].bestLap * 1000));
  assert.ok(validateReplay(lapSubmission.replay), 'the saved ghost is the actual recorded best lap');
  assert.equal(winnerCard.input.disabled, true, 'partial success keeps the original submission identity');
  assert.equal(winnerCard.button.disabled, false, 'only the unsuccessful portion can be retried');
  assert.equal(ui.engine.state,'finished','a failed save must not leave the results screen');
  await Promise.all(saveForm.dispatch('submit').pending); await ui.flush();
  assert.equal(totalPosts().length, 1, 'confirmed race record is not submitted again');
  assert.equal(lapPosts().length, 2);
  assert.deepEqual(JSON.parse(lapPosts()[1].body), lapSubmission, 'retry retains the same replay, nickname, and submission ID');
  assert.equal(savedTotals.length, 1); assert.equal(savedLaps.length, 1); assert.equal(savedRaces.length, 1);
  assert.equal(racePosts().length, 1, 'a confirmed complete race ghost is not resubmitted');
  assert.equal(winnerCard.button.disabled, true);
  const runnerUpCard = cards.find(card => card.playerId === 2);
  assert.equal(runnerUpCard.input.disabled, false, 'the other human still has an independent unsaved result');
  assert.equal(ui.engine.state,'finished','saving the first human cannot interrupt the second human');
  runnerUpCard.input.value='Harbor Runner Up';
  await Promise.all(runnerUpCard.input.closest('form').dispatch('submit').pending);await ui.flush();ui.frame();
  assert.equal(runnerUpCard.done,true);assert.equal(ui.engine.state,'menu','saving all human cards returns to map selection');
  assert.equal(ui.nodes.get('menu').classList.contains('hidden'),false);
  assert.equal(ui.nodes.get('race-setup-dialog').open,false);
  ui.trackCards.get('coast-bay').button.click();await ui.flush();ui.frame();
  assert.equal(TRACK.id,'coast-bay');ui.launch();ui.frame();
  assert.equal(ui.leaderboard.cards.length, 0);
  assert.equal(ui.ghostRecorder.bestReplay(1), null); assert.equal(ui.ghostRecorder.fullRaceReplay(1), null);
  assert.equal(ui.engine.state, 'countdown'); assert.equal(ui.engine.winner, null);
  assert.equal(ui.nodes.get('result').classList.contains('hidden'), true);
  assert.equal(ui.nodes.get('timer').textContent, '00:00.00');
  ui.click('back-menu'); ui.frame();
  assert.equal(ui.engine.state, 'menu'); assert.equal(ui.engine.cars[0].lap, 0);
  assert.equal(ui.nodes.get('menu').classList.contains('hidden'), false);
});

for (const search of ['', '?city=london']) {
  test(`harbor release is isolated from city parameters (${search || 'default'})`, async t => {
    const ui = await loadUI(t, { search, configureRace: false });
    assert.equal(TRACK.id, 'coast-london');
    assert.equal(ui.renderer.canvas, ui.nodes.get('game'));
    assert.equal(ui.nodes.has('city-game'), false);
    assert.equal(ui.nodes.has('board-city'), false);
    assert.doesNotMatch(ui.html, /data-city=|london-guide|白金汉宫|伦敦/);
    assert.ok(ui.requests.length > 0);
    for (const request of ui.requests) {
      assert.equal(new URL(request.url).searchParams.get('city'), 'coast-london');
      assert.equal(new URL(request.url).searchParams.get('version'), request.url.includes('/api/laps') ? GHOST_VERSION : LEADERBOARD_VERSION);
    }
    ui.launch();
    ui.advance(3.4);
    assert.equal(ui.engine.state, 'racing');
    assert.equal(TRACK.id, 'coast-london');
  });
}

test('two nickname ghosts lock at start, replay independently in both viewports, and remain selected for the next race', async t => {
  const recorded = { version: 1, durationMs: 42000, frames: Array.from({length:421},(_,i)=>[i*100,100+i*.1,200,0,0]) };
  const record = {id:'harbor-local-ghost',name:'Harbor Racer',timeMs:42000,playerId:1,mode:'local',createdAt:1};
  const secondRecord = {id:'harbor-second-ghost',name:'Gold Racer',timeMs:42000,playerId:2,mode:'local',createdAt:2};
  const secondReplay = {...recorded,frames:recorded.frames.map(frame=>[frame[0],300+frame[0]/500,500,0,0])};
  const ui=await loadUI(t,{fetchImpl:async url=>({ok:true,status:200,json:async()=> {
    const second = url.includes(secondRecord.id) || new URL(url).searchParams.get('name')?.toLowerCase() === 'gold racer';
    return url.includes('/api/ghosts/') ? {version:GHOST_VERSION,city:'coast',entry:second?secondRecord:record,replay:second?secondReplay:recorded} :
      url.includes('/api/ghosts?') ? {version:GHOST_VERSION,city:'coast',entries:[second?secondRecord:record]} :
      url.includes('/api/laps') ? {version:GHOST_VERSION,city:'coast',entries:[record,secondRecord]} :
      {version:LEADERBOARD_VERSION,city:'coast',laps:3,entries:[]};
  }})});
  ui.lapButtons.find(button => button.dataset.laps === '1').click();
  assert.equal(ui.nodes.get('ghost-enabled').checked,false);
  assert.equal(ui.nodes.get('ghost-name').disabled,false, 'the top search is usable without enabling a slot first');
  ui.nodes.get('ghost-enabled').checked=true;ui.nodes.get('ghost-enabled').dispatch('change');
  ui.nodes.get('ghost-name').value='harbor racer';
  await Promise.all(ui.nodes.get('ghost-search-form').dispatch('submit').pending);
  assert.equal(ui.nodes.get('ghost-choice').value,record.id);
  await Promise.all(ui.click('ghost-load').pending);
  assert.equal(ui.ghostClient.selected.entry.name,record.name);
  ui.click('ghost-slot-1');
  ui.nodes.get('ghost-name').value='Gold Racer';
  await Promise.all(ui.nodes.get('ghost-search-form').dispatch('submit').pending);
  await Promise.all(ui.click('ghost-load').pending);
  assert.deepEqual(ui.ghostClient.selections().map(ghost=>ghost.entry.id),[record.id,secondRecord.id]);
  ui.launch();ui.advance(3.1);
  assert.equal(ui.nodes.get('ghost-enabled').disabled,true);
  assert.match(ui.nodes.get('ghost-race-label').textContent,/Harbor Racer/);
  ui.key('KeyW');ui.advance(.9);ui.key('ArrowUp');ui.advance(1.3);
  assert.ok(ui.engine.cars.every(car=>car._started));
  const [[left,leftGold],[right,rightGold]]=ui.renderer.ghostPoses;
  assert.ok(left&&right&&leftGold&&rightGold,'each racing half contains both selected ghosts');
  assert.notEqual(left.x,right.x,'later-starting player uses their own lap clock');
  for(let i=0;i<2;i++) {
    assert.ok(Math.abs(ui.renderer.ghostPoses[i][0].x-(100+ui.engine.cars[i].lapTime))<.001);
    assert.ok(Math.abs(ui.renderer.ghostPoses[i][1].x-(300+2*ui.engine.cars[i].lapTime))<.001);
    assert.deepEqual(ui.renderer.ghostPoses[i].map(pose=>pose.slotId),[0,1]);
  }
  ui.key('Escape');ui.frame();const paused=structuredClone(ui.renderer.ghostPoses);
  ui.advance(.4);assert.deepEqual(ui.renderer.ghostPoses,paused);
  ui.click('pause-menu');ui.frame();
  assert.equal(ui.engine.state,'menu');assert.equal(ui.nodes.get('ghost-enabled').disabled,false);
  assert.ok(ui.renderer.ghostPoses.every(poses=>poses.length===0));
  assert.match(ui.nodes.get('ghost-race-label').textContent,/Harbor Racer/);
  assert.deepEqual(ui.ghostClient.selections().map(ghost=>ghost.entry.id),[record.id,secondRecord.id], 'returning to the menu retains both chosen opponents');
});


test('checkpoint HUD reports a real same-point gap, ghost comparison, and resets with the race', async t => {
  const ui=await loadUI(t);
  ui.lapButtons.find(button => button.dataset.laps === '1').click();
  const replay={version:1,durationMs:42000,frames:Array.from({length:421},(_,i)=>{
    const p=trackPoint(TRACK.startDistance+TRACK.length*i/420,-24);
    return [i*100,p.x,p.y,p.angle,p.elevation];
  })};
  ui.nodes.get('ghost-enabled').checked=true;
  ui.ghostClient.select({entry:{id:'split-ghost',name:'Split Racer',timeMs:42000,playerId:1,mode:'local'},replay});
  ui.launch();ui.advance(3.1);
  const quarter=TRACK.startDistance+TRACK.length/4;
  let passedFirst=false,compared=false;
  for(let s=TRACK.startDistance-25;s<quarter+90;s+=5){
    for(const car of ui.engine.cars){
      const p=trackPoint(s-(car.id===2?60:0),car.id===1?-24:24);
      car.x=p.x;car.y=p.y;car.angle=p.angle;car.speed=0;
    }
    ui.frame(1/120);
    const one=ui.splitTiming.latest(1),two=ui.splitTiming.latest(2);
    if(one&&!two){
      passedFirst=true;assert.equal(ui.nodes.get('split1').classList.contains('hidden'),false);
      assert.match(ui.nodes.get('split-point1').textContent,/第 1 圈 · 计时点 01/);
      assert.equal(ui.nodes.get('split-gap1').textContent,'对手尚未通过');
      assert.match(ui.nodes.get('split-ghost1').children.map(node=>node.textContent).join(' '),/领先紫色幽灵 −[0-9.]+ 秒/);
    }
    if(one&&two){
      compared=true;assert.equal(ui.nodes.get('split-gap1').textContent,'领先对手 −0.10 秒');
      assert.equal(ui.nodes.get('split-gap2').textContent,'落后对手 +0.10 秒');
      assert.equal(ui.nodes.get('split-gap1').classList.contains('split-ahead'),true);
      assert.equal(ui.nodes.get('split-gap2').classList.contains('split-behind'),true);break;
    }
  }
  assert.ok(passedFirst&&compared);
  ui.key('Escape');ui.frame();assert.equal(ui.nodes.get('split1').classList.contains('hidden'),true);
  ui.click('resume');ui.frame();assert.equal(ui.nodes.get('split1').classList.contains('hidden'),false);
  ui.launch('restart');ui.frame();assert.equal(ui.splitTiming.latest(1),null);
  assert.equal(ui.nodes.get('split1').classList.contains('hidden'),true);
});


test('AI mode accepts either steering layout for the selected human color and keeps the AI independent', async t => {
  const ui = await loadUI(t);
  ui.modeButtons.find(button => button.dataset.mode === 'ai').click();
  ui.document.querySelectorAll('[data-player-color]').find(button => button.dataset.playerColor === 'orange').click();
  ui.launch(); ui.advance(3.1); ui.key('ArrowUp'); ui.advance(.4);
  assert.ok(ui.engine.cars[0].speed > 70, 'up arrow accelerates the human orange car');
  assert.ok(ui.engine.cars[1].speed > 70, 'AI still drives itself');
  ui.key('ArrowRight'); ui.frame(); assert.ok(ui.engine.cars[0].steer > 0);
  ui.keyup('ArrowRight'); ui.key('ArrowLeft'); ui.advance(.2); assert.ok(ui.engine.cars[0].steer < 0);
  ui.keyup('ArrowLeft'); ui.keyup('ArrowUp');
  const speed = ui.engine.cars[0].speed; ui.key('ArrowDown'); ui.advance(.15); assert.ok(ui.engine.cars[0].speed < speed);
  ui.keyup('ArrowDown'); ui.key('KeyW'); ui.advance(.4); assert.ok(ui.engine.cars[0].speed > 70);
  ui.key('Enter'); ui.frame(); assert.ok(ui.engine.cars[0].boost < 100, 'the arrow layout also offers the human boost');
});

test('start preparation lists complete three-lap ghosts with two color choices and runs them from the shared GO clock', async t => {
  const makeReplay = offset => ({ version: 1, kind: 'race', laps: 3, durationMs: 90000, lapEndsMs: [30000, 60000, 90000],
    frames: Array.from({ length: 901 }, (_, index) => [index * 100, offset + index / 10, 100, 0, 0]) });
  const ghosts = [{ id: 'three-purple', name: '完整三圈甲', playerId: 1, mode: 'local', createdAt: 1, timeMs: 90000, kind: 'race', laps: 3 },
    { id: 'three-gold', name: '完整三圈乙', playerId: 2, mode: 'local', createdAt: 2, timeMs: 90000, kind: 'race', laps: 3 }];
  const ui = await loadUI(t, { fetchImpl: async raw => {
    const url = new URL(raw), kind = url.searchParams.get('version');
    if (url.pathname.startsWith('/api/ghosts/')) {
      const index = ghosts.findIndex(entry => url.pathname.endsWith(entry.id));
      return { ok: true, json: async () => ({ city: 'coast', version: kind, entry: ghosts[index], replay: makeReplay(100 + index * 200) }) };
    }
    if (url.pathname === '/api/laps') return { ok: true, json: async () => ({ city: 'coast', version: kind, entries: kind === RACE_GHOST_VERSION ? ghosts : [] }) };
    return { ok: true, json: async () => ({ city: 'coast', version: LEADERBOARD_VERSION, laps: 3, entries: [] }) };
  } });
  ui.click('start'); await ui.flush();
  assert.equal(ui.nodes.get('race-setup-dialog').open, true); assert.equal(ui.engine.state, 'menu');
  assert.match(ui.nodes.get('ghost-picker-title').textContent, /3 圈/);
  assert.ok(ui.html.indexOf('id="ghost-search-form"') < ui.html.indexOf('id="ghost-picker-list"'), 'personal search sits above the choice leaderboard');
  assert.equal(ui.ghostClient.pickerButtons.length, 4, 'every row offers purple and gold buttons');
  const choose = (id, slotId) => ui.ghostClient.pickerButtons.find(item => item.entry.id === id && item.slotId === slotId).button.click();
  await Promise.all(choose('three-purple', 0).pending); await ui.flush();
  await Promise.all(choose('three-gold', 1).pending); await ui.flush();
  assert.deepEqual(ui.ghostClient.selections().map(ghost => ghost.entry.id), ['three-purple', 'three-gold']);
  ui.click('setup-launch'); ui.advance(3.2);
  assert.equal(ui.engine.state, 'racing');
  assert.ok(ui.engine.cars.every(car => !car._started), 'comparison begins before either car reaches the timing line');
  for (const poses of ui.renderer.ghostPoses) {
    assert.equal(poses.length, 2); assert.ok(Math.abs(poses[0].x - (100 + ui.engine.time)) < .001);
    assert.ok(Math.abs(poses[1].x - (300 + ui.engine.time)) < .001);
  }
  ui.key('Escape'); ui.frame(); const paused = structuredClone(ui.renderer.ghostPoses); ui.advance(.4);
  assert.deepEqual(ui.renderer.ghostPoses, paused);
  ui.click('pause-menu'); ui.frame();
  ui.lapButtons.find(button => button.dataset.laps === '1').click();
  assert.equal(ui.ghostClient.selections().length, 0, 'switching to sprint cannot carry three-lap ghosts into the wrong mode');
});

test('language choice is required before starting, persists the choice, and switching mid-race pauses safely', async t => {
  const ui=await loadUI(t,{language:null});
  const dialog=ui.nodes.get('language-dialog');assert.equal(dialog.open,true);
  ui.click('start');ui.key('Space');ui.click('setup-launch');ui.frame();
  assert.equal(ui.engine.state,'menu');assert.equal(ui.nodes.get('race-setup-dialog').open,false);
  assert.equal(dialog.dispatch('cancel').defaultPrevented,true,'Escape cannot bypass the initial language choice');
  ui.click('language-en');assert.equal(dialog.open,false);assert.equal(ui.i18n.language,'en');
  assert.equal(ui.document.documentElement.lang,'en');assert.equal(ui.window.localStorage.getItem('twin-turbo-language'),'en');
  assert.equal(ui.nodes.get('track-title').textContent,'Coastline Grand Prix');
  ui.click('start');assert.match(ui.nodes.get('race-setup-summary').textContent,/3 laps/);
  ui.click('setup-skip');ui.advance(3.2);ui.key('KeyW');ui.advance(.2);
  ui.click('language-toggle');assert.equal(dialog.open,true);assert.equal(ui.engine.state,'paused');
  const time=ui.engine.time;ui.advance(.2);assert.equal(ui.engine.time,time);
  ui.click('language-zh');assert.equal(ui.i18n.language,'zh');assert.equal(ui.nodes.get('track-title').textContent,'海岸技术环线');
  assert.equal(ui.window.localStorage.getItem('twin-turbo-language'),'zh');assert.equal(ui.engine.state,'paused');
  ui.click('resume');ui.frame();assert.equal(ui.engine.state,'racing');assert.equal(ui.keys.size,0);
});

test('changing a harbor circuit resets its opponents, recording, splits and leaderboard and is blocked during a race',async t=>{
  const ui=await loadUI(t);
  assert.deepEqual([...ui.trackCards.keys()],Object.keys(TRACKS));assert.equal(ui.trackCards.size,12);assert.equal([...ui.trackCards.keys()].at(-1),'coast-paris');
  assert.deepEqual([...ui.trackCards.keys()].slice(0,4),['coast-london','coast-rio','coast-austin','coast-beijing']);
  for(const {button,preview}of ui.trackCards.values()){assert.equal(button.tagName,'BUTTON');assert.equal(preview.tagName,'SVG');assert.ok(preview.querySelector('path').getAttribute('d').startsWith('M'));}
  ui.ghostClient.select({entry:{id:'prior-lap',name:'旧赛道记录',timeMs:42000,playerId:1,mode:'local'},
    replay:{version:1,durationMs:42000,frames:[[0,100,100,0,0],[42000,100,100,0,0]]}});
  ui.ai.elapsed=99;ui.ghostRecorder.racers.set(1,{best:{durationMs:42000}});ui.splitTiming.racers.set(1,{});
  ui.leaderboard.showResults([{playerId:1,mode:'local',city:'coast',laps:3,finished:true,timeMs:140000}]);
  assert.equal(ui.leaderboard.cards.length,1);
  ui.trackCards.get('coast-bay').button.click();await ui.flush();ui.frame();
  assert.equal(TRACK.id,'coast-bay');assert.equal(ui.ghostClient.city,'coast-bay');assert.equal(ui.leaderboard.city,'coast-bay');
  assert.equal(ui.ai.elapsed,0);assert.equal(ui.ghostClient.selections().length,0);assert.equal(ui.leaderboard.cards.length,0);
  assert.equal(ui.ghostRecorder.bestReplay(1),null);assert.equal(ui.splitTiming.latest(1),null);
  assert.equal(ui.renderer.rebuildCalls.length,1);assert.ok(ui.renderer.ghostPoses.every(poses=>poses.length===0));
  assert.equal(ui.nodes.get('track-title').textContent,TRACK.name);assert.equal(ui.trackCards.get('coast-bay').button.getAttribute('aria-pressed'),'true');
  const latest=ui.requests.filter(request=>request.url.includes('/api/leaderboard')).at(-1);
  assert.equal(new URL(latest.url).searchParams.get('city'),'coast-bay');
  ui.launch();ui.frame();assert.ok([...ui.trackCards.values()].every(card=>card.button.disabled));
  ui.trackCards.get('coast-ridge').button.click();assert.equal(TRACK.id,'coast-bay');
  ui.advance(3.1);ui.key('Escape');ui.frame();ui.trackCards.get('coast-pines').button.click();
  assert.equal(TRACK.id,'coast-bay','paused games retain their original circuit');
  ui.click('pause-menu');ui.frame();assert.ok([...ui.trackCards.values()].every(card=>!card.button.disabled));
  ui.trackCards.get('coast-ridge').button.click();await ui.flush();ui.frame();assert.equal(TRACK.id,'coast-ridge');
  assert.equal(ui.renderer.rebuildCalls.length,2);
});

test('every harbor map starts local and AI races in both one-lap sprint and three-lap modes',async t=>{
  const ui=await loadUI(t);
  assert.deepEqual(ui.lapButtons.map(button=>Number(button.dataset.laps)).sort(),[1,3]);
  assert.doesNotMatch(ui.html,/data-laps="5"|id="records-tab-5"/);
  for(const [id,track]of Object.entries(TRACKS))for(const mode of ['local','ai'])for(const laps of [1,3]){
    ui.trackCards.get(id).button.click();
    ui.modeButtons.find(button=>button.dataset.mode===mode).click();
    ui.lapButtons.find(button=>Number(button.dataset.laps)===laps).click();
    ui.click('start');await ui.flush();
    assert.equal(TRACK.id,id);assert.equal(ui.ghostClient.laps,laps);assert.equal(ui.ghostClient.city,id);
    assert.match(ui.nodes.get('race-setup-summary').textContent,new RegExp(track.name));
    const ghostRequest=ui.requests.filter(request=>request.url.includes('/api/laps')).at(-1);
    assert.equal(new URL(ghostRequest.url).searchParams.get('city'),id);
    assert.equal(new URL(ghostRequest.url).searchParams.get('version'),laps===3?RACE_GHOST_VERSION:GHOST_VERSION);
    ui.click('setup-skip');ui.advance(3.1);assert.equal(ui.engine.state,'racing');assert.equal(ui.engine.laps,laps);
    ui.key('ArrowUp');if(mode==='local')ui.key('KeyW');ui.advance(.3);
    assert.ok(ui.engine.cars.every(car=>car.speed>50),`${id}/${mode}/${laps} both racers move`);
    if(mode==='ai')assert.ok(ui.ai.elapsed>0);
    ui.key('Escape');ui.click('pause-menu');ui.frame();assert.equal(ui.engine.state,'menu');
    assert.equal(ui.ai.elapsed,0);assert.ok(ui.engine.cars.every(car=>car.lap===0&&car.speed===0));
  }
});

test('leaderboard map browsing is independent of the current race and keeps unsaved results tied to their source map',async t=>{
  const ui=await loadUI(t),board=ui.nodes.get('records-track-choice');
  assert.deepEqual(board.children.map(option=>option.value),Object.keys(TRACKS));
  ui.leaderboard.showResults([{playerId:1,mode:'local',city:'coast',laps:3,finished:true,timeMs:140000}]);
  const initial=ui.leaderboard.cards[0];initial.input.value='保留中的昵称';
  board.value='coast-ridge';board.dispatch('change');await ui.flush();
  assert.equal(TRACK.id,'coast');assert.equal(ui.ghostClient.city,'coast');assert.equal(ui.leaderboard.city,'coast-ridge');
  assert.equal(ui.renderer.rebuildCalls.length,0,'viewing a board does not rebuild the game');
  assert.equal(ui.leaderboard.cards[0],initial);assert.equal(initial.input.value,'保留中的昵称');assert.equal(initial.city,'coast');
  assert.match(ui.nodes.get('records-track').textContent,/云脊/);assert.equal(ui.nodes.get('track-title').textContent,'海岸技术环线');
  ui.launch();ui.advance(3.1);
  board.value='coast-bay';board.dispatch('change');await ui.flush();
  assert.equal(TRACK.id,'coast');assert.equal(ui.engine.state,'racing');assert.equal(ui.leaderboard.locked,true);
  assert.equal(ui.ghostClient.locked,true);assert.equal(ui.leaderboard.city,'coast-bay');
  Object.assign(ui.engine.cars[0],{finished:true,lap:3,finishTime:140,bestLap:46});
  Object.assign(ui.engine.cars[1],{finished:true,lap:3,finishTime:141,bestLap:46.2});
  ui.engine.winner=ui.engine.cars[0];ui.engine.state='finished';ui.frame();await ui.flush();
  assert.equal(ui.leaderboard.cards.length,2,'finishing the current race still creates cards while another map board is selected');
  assert.ok(ui.leaderboard.cards.every(card=>card.city==='coast'));assert.equal(TRACK.id,'coast');
  const cards=[...ui.leaderboard.cards];cards[0].input.value='最终昵称';
  board.value='coast-pines';board.dispatch('change');await ui.flush();
  assert.deepEqual(ui.leaderboard.cards,cards);assert.equal(cards[0].input.value,'最终昵称');
  assert.equal(ui.leaderboard.city,'coast-pines');assert.equal(ui.engine.state,'finished');
});

test('fresh product defaults to London, AI sprint and the fastest-lap board, with both complete keyboard layouts on the human side',async t=>{
  const ui=await loadUI(t,{configureRace:false});
  assert.equal(TRACK.id,'coast-london');
  assert.equal(ui.ghostClient.city,'coast-london');
  assert.equal(ui.leaderboard.city,'coast-london');
  assert.equal(ui.leaderboard.raceCity,'coast-london');
  assert.equal(ui.nodes.get('records-track-choice').value,'coast-london');
  assert.equal(ui.trackCards.get('coast-london').button.getAttribute('aria-pressed'),'true');
  assert.equal(ui.modeButtons.find(button=>button.dataset.mode==='ai').getAttribute('aria-pressed'),'true');
  assert.equal(ui.lapButtons.find(button=>button.dataset.laps==='1').getAttribute('aria-pressed'),'true');
  assert.equal(ui.leaderboard.category,'lap');
  assert.equal(ui.nodes.get('records-tab-lap').getAttribute('aria-selected'),'true');
  const alternative=ui.nodes.get('player1-alternate-controls');assert.equal(alternative.classList.contains('hidden'),false);
  assert.equal(ui.nodes.get('player2-controls').classList.contains('hidden'),true);
  for(const action of ['accelerate','left','brake','right','boost','rescue']){
    const hints=ui.document.querySelectorAll(`[data-control-player="2"][data-control-action="${action}"]`);
    assert.ok(hints.length>=3,'both normal P2 hints and the human alternate row include '+action);
    assert.ok(hints.every(node=>node.textContent===ui.bindings.label(2,action)));
  }
  assert.doesNotMatch(ui.nodes.get('ai-control-note').textContent,/WASD|方向键|Arrow|Enter|Shift/,'AI note no longer attributes human controls to the opponent');
  ui.modeButtons.find(button=>button.dataset.mode==='local').click();assert.equal(alternative.classList.contains('hidden'),true);
  ui.modeButtons.find(button=>button.dataset.mode==='ai').click();assert.equal(alternative.classList.contains('hidden'),false);
  ui.launch();ui.advance(3.1);assert.equal(ui.engine.laps,1);assert.equal(ui.engine.state,'racing');
  ui.key('ArrowUp');ui.advance(.3);assert.ok(ui.engine.cars.every(car=>car.speed>50));assert.ok(ui.ai.elapsed>0);
});

test('solo mode uses one full human HUD and camera for both colors, while local mode restores two views',async t=>{
 const ui=await loadUI(t,{configureRace:false});
 assert.equal(ui.renderer.singlePlayer,true);assert.equal(ui.document.body.classList.contains('solo-mode'),true);
 const context=ui.nodes.get('hud').context;let before=context.counts.get('scale')||0;context.calls.length=0;ui.frame();
 assert.equal(context.counts.get('scale')-before,1,'only the human minimap is drawn');
 assert.ok(context.calls.some(call=>call[0]==='translate'&&call[1]===1018&&call[2]===577));
 assert.ok(!context.calls.some(call=>call[0]==='fillText'&&call[1]==='VS'));
 assert.ok(!context.calls.some(call=>call[0]==='fillRect'&&call[1]===597));
 ui.allNodes.find(node=>node.dataset.playerColor==='orange').click();ui.launch();ui.advance(3.1);
 assert.equal(ui.engine.cars[0].colorIndex,1);assert.equal(ui.renderer.singlePlayer,true,'orange human remains the first camera');
 ui.key('Escape');ui.frame();ui.click('pause-menu');ui.frame();
 ui.modeButtons.find(button=>button.dataset.mode==='local').click();before=context.counts.get('scale');context.calls.length=0;ui.frame();
 assert.equal(ui.renderer.singlePlayer,false);assert.equal(ui.document.body.classList.contains('solo-mode'),false);
 assert.equal(context.counts.get('scale')-before,2);assert.ok(context.calls.some(call=>call[0]==='fillText'&&call[1]==='VS'));
});
