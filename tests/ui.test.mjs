import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TRACK, TRACKS, setTrack, trackPoint, projectTrack, mod } from '../src/engine.js';
import { RaceAI } from '../src/ai.js';
import { GHOST_VERSION } from '../src/ghost-client.js';
import { validateReplay, RACE_GHOST_VERSION, ghostVersionForCity } from '../src/ghost-replay.js';
import { LEADERBOARD_VERSION } from '../src/leaderboard.js';

const sourceURL = new URL('../src/main.js', import.meta.url);
const engineURL = new URL('../src/engine.js', import.meta.url);
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
    this.ownerDocument.dispatch('fullscreenchange');
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
  contains(node) { for(let current=node;current;current=current.parentElement)if(current===this)return true;return false; }
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

async function loadUI(t, { graphicsAvailable = true, fetchImpl, search = '?city=coast', language = 'zh', configureRace = false, fullCatalog = false, initialTrack = 'coast', fullscreenAtLoad = false, entryDuration = 0, storageValues = {} } = {}) {
  setTrack(initialTrack); t.after(() => setTrack('coast'));
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
    document.dispatch('fullscreenchange');
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
  const stage=nodes.get('race-stage'),requestFullscreen=stage.requestFullscreen.bind(stage);
  stage.requestFullscreen=()=>{
    stage.fullscreenAttempts=(stage.fullscreenAttempts||0)+1;
    // Browsers normally reject the initial request without user activation.
    if(stage.fullscreenAttempts===1&&!fullscreenAtLoad)return Promise.reject(new Error('User activation required'));
    return requestFullscreen();
  };
  const window = new MockTarget(); window.devicePixelRatio = 1;
  const stored = new Map(Object.entries(storageValues)); window.localStorage = { getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,String(value)),removeItem:key=>stored.delete(key) };
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
    setEntryProgress(progress) { this.entryProgress=progress;return this; }
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
  // Timing integration uses a deterministic entry clock. race-entry.test.mjs
  // exercises the real animation controller and reduced-motion lifecycle.
  const entryModule=`export function createRaceEntry(document){let active=false,elapsed=0;const starts=[];const stage=document.getElementById('race-stage');
    function cancel(){active=false;stage.classList.remove('race-entry-active');}
    return {starts,start(track){starts.push(track);elapsed=0;active=${entryDuration}>0;stage.classList.toggle('race-entry-active',active);},
      update(dt){if(active){elapsed+=dt;if(elapsed>=${entryDuration}-1e-9)cancel();}return {active,previewProgress:elapsed>=3.6?Math.min(1,(elapsed-3.6)/6):null};},
      skip:cancel,cancel,get active(){return active;},get elapsed(){return elapsed;}};}`;
  const entryURL=`data:text/javascript;base64,${Buffer.from(entryModule).toString('base64')}`;
  // Historical physics scenarios explicitly opt into the full catalog fixture;
  // ordinary UI loads exercise the exact shipped six-city visibility policy.
  const visibilityURL = fullCatalog
    ? `data:text/javascript;base64,${Buffer.from("export const DEFAULT_TRACK_ID='coast-london';export function getVisibleTracks(tracks){return Object.values(tracks)}export function isTrackSelectable(id,tracks){return Object.hasOwn(tracks,id)}").toString('base64')}`
    : new URL('../src/track-visibility.js', import.meta.url).href;
  const source = (await readFile(sourceURL, 'utf8'))
    // Decorative pointer animation is independent of the deterministic race loop.
    .replace("import './ui-effects.js';", "import 'data:text/javascript,export{}';")
    .replace("from './race-entry.js'", `from '${entryURL}'`)
    .replace("from './driving-tutorial.js'", `from '${new URL('../src/driving-tutorial.js', import.meta.url).href}'`)
    .replace("from './i18n.js'", `from '${new URL('../src/i18n.js', import.meta.url).href}'`)
    .replace("from './display-names.js'", `from '${new URL('../src/display-names.js', import.meta.url).href}'`)
    .replace("from './track-visibility.js'", `from '${visibilityURL}'`)
    .replace("from './color-theme-ui.js'", `from '${new URL('../src/color-theme-ui.js', import.meta.url).href}'`)
    .replace("from './color-themes.js'", `from '${new URL('../src/color-themes.js', import.meta.url).href}'`)
    .replace("from './race-hud.js'", `from '${new URL('../src/race-hud.js', import.meta.url).href}'`)
    .replace("from './controls.js'", `from '${new URL('../src/controls.js', import.meta.url).href}'`)
    .replace("from './split-timing.js'", `from '${new URL('../src/split-timing.js', import.meta.url).href}'`)
    .replace("from './ghost-challenge.js'", `from '${new URL('../src/ghost-challenge.js', import.meta.url).href}'`)
    .replace("from './ghost-client.js'", `from '${new URL('../src/ghost-client.js', import.meta.url).href}'`)
    .replace("from './ghost-replay.js'", `from '${new URL('../src/ghost-replay.js', import.meta.url).href}'`)
    .replace("from './engine.js'", `from '${engineURL.href}'`)
    .replace("from './renderer.js'", `from '${rendererURL}'`)
    .replace("from './city-renderer.js'", `from '${new URL('../city-renderer.js', import.meta.url).href}'`)
    .replace("from './ai.js'", `from '${new URL('../src/ai.js', import.meta.url).href}'`)
    .replace("from './unified-records.js'", `from '${new URL('../src/unified-records.js', import.meta.url).href}'`)
    .replace("from './leaderboard-client.js'", `from '${new URL('../src/leaderboard-client.js', import.meta.url).href}'`);
  // Load shipped application source unmodified except dependency resolution and
  // read-only test exports. No duplicated event handlers or production hooks.
  const entry = `${source}\nexport { engine, keys, renderer, bindings, leaderboard, ghostClient, ghostRecorder, splitTiming, i18n, trackCards, activeGhosts, challengeSetup, raceEntry, drivingTutorial, selectCircuit };\n// test instance ${++instance}`;
  const application = await import(`data:text/javascript;base64,${Buffer.from(entry).toString('base64')}`);
  const ui = {
    ...application, application, nodes, allNodes, document, window, lapButtons, lapLabels, modeButtons, html, requests,
    async flush() { for (let pass = 0; pass < 60; pass++) await Promise.resolve(); },
    frame(dt = 1 / 60) {
      clock += dt * 1000;
      assert.equal(frames.length, 1, 'one animation loop is scheduled');
      frames.shift()(clock);
      assert.equal(nodes.get('hud').context.depth, 0, 'frame restores HUD Canvas state');
    },
    advance(seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) this.frame(); },
    click(id) { return nodes.get(id).click(); },
    launch(id = 'start') { const event = this.click(id); if (nodes.get('race-setup-dialog').open) this.click('setup-launch'); return event; },
    async launchPrepared(id = 'start') { this.click(id); await this.flush(); this.click('setup-launch'); },
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
    nodes.get('records-tab-1').click();
  }
  ui.frame();
  await ui.flush();
  return ui;
}

function loadCoastUI(t, options={}) {
  return loadUI(t,{configureRace:true,fullCatalog:true,...options});
}

test('real main.js delegates scene rendering and draws two player maps on the separate HUD', async t => {
  const ui = await loadCoastUI(t);
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
  assert.equal(ui.engine.cars.length, 2);
  assert.notEqual(ui.engine.cars[0].y, ui.engine.cars[1].y, 'explicit local mode restores both separated start slots');
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
  const ui = await loadCoastUI(t, { graphicsAvailable: false });
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
  const ui = await loadCoastUI(t);
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

test('fullscreen stays beside pause, tracks native exits and language changes, and keeps legacy race details hidden', async t => {
  const ui = await loadCoastUI(t);
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
  const scoreboard=/<section\b[^>]*class="scoreboard"[^>]*>([\s\S]*?)<\/section>/.exec(ui.html)?.[1];
  assert.ok(scoreboard);
  const actions=/<div\b[^>]*class="race-actions"[^>]*>([\s\S]*?)<\/div>/.exec(scoreboard)?.[1];
  assert.match(actions,/id="fullscreen"/);assert.match(actions,/id="pause"/);
  const settings=/<dialog\b[^>]*id="settings-dialog"[^>]*>([\s\S]*?)<\/dialog>/.exec(ui.html)?.[1];
  assert.doesNotMatch(settings,/id="fullscreen"/,'settings no longer duplicate the top-right fullscreen control');
  assert.equal(ui.nodes.get('fullscreen-exit').hidden,true);
  const details=ui.allNodes.find(node=>node.classList.contains('pause-race-details'));
  assert.equal(details.hidden,true);assert.equal(details.getAttribute('aria-hidden'),'true');
  const assertLabel=label=>{
    assert.equal(ui.nodes.get('fullscreen-label').textContent,label);
    assert.equal(ui.nodes.get('fullscreen').getAttribute('aria-label'),label);
    assert.equal(ui.nodes.get('fullscreen').getAttribute('title'),label);
  };
  assertLabel('全屏');
  await Promise.all(ui.click('fullscreen').pending);
  assert.equal(ui.document.fullscreenElement, ui.nodes.get('race-stage'));
  assert.equal(ui.nodes.get('race-stage').fullscreenRequests, 1);
  assert.equal(ui.document.activeElement, ui.nodes.get('game'));
  assertLabel('退出全屏');
  ui.click('language-en');assertLabel('Exit fullscreen');
  // The browser's Esc exits fullscreen outside the application's click handler.
  ui.document.fullscreenElement=null;ui.document.dispatch('fullscreenchange');
  assertLabel('Fullscreen');
  await Promise.all(ui.click('fullscreen').pending);assertLabel('Exit fullscreen');
  await Promise.all(ui.click('fullscreen').pending);assertLabel('Fullscreen');
  assert.equal(ui.document.fullscreenExits,1,'the same visible button also exits fullscreen');
  ui.click('language-zh');assertLabel('全屏');
  await Promise.all(ui.click('fullscreen').pending);assertLabel('退出全屏');
  await Promise.all(ui.click('fullscreen-exit').pending);
  assert.equal(ui.document.fullscreenElement, null);
  assert.equal(ui.document.fullscreenExits, 2);
  assert.equal(ui.document.activeElement, ui.nodes.get('game'));
  assertLabel('全屏');
});

test('page load can enter fullscreen and never reverses the first manual exit',async t=>{
  const ui=await loadCoastUI(t,{fullscreenAtLoad:true}),stage=ui.nodes.get('race-stage');
  assert.equal(stage.fullscreenAttempts,1);
  assert.equal(ui.document.fullscreenElement,stage);
  assert.equal(ui.nodes.get('fullscreen-label').textContent,'退出全屏');
  ui.window.dispatch('click',{target:ui.nodes.get('fullscreen'),isTrusted:true});
  await Promise.all(ui.click('fullscreen').pending);
  assert.equal(ui.document.fullscreenElement,null);
  assert.equal(ui.document.fullscreenExits,1);
  ui.window.dispatch('click',{target:ui.nodes.get('start'),isTrusted:true});
  assert.equal(stage.fullscreenAttempts,1,'a successful load consumes the first-gesture fallback');
});

test('native fullscreen exit pauses once regardless of Escape event order, repeats or blur',async t=>{
  for(const order of ['no key event','keydown first','fullscreenchange first'])await t.test(order,async t=>{
    const ui=await loadCoastUI(t);ui.launch();ui.advance(3.1);ui.key('KeyW');ui.advance(.1);
    const stage=ui.nodes.get('race-stage'),attempts=stage.fullscreenAttempts,time=ui.engine.time;
    const exit=()=>{ui.document.fullscreenElement=null;ui.document.dispatch('fullscreenchange');};
    if(order==='keydown first'){ui.key('Escape');exit();}
    else {exit();if(order==='fullscreenchange first')ui.key('Escape');}
    assert.equal(ui.engine.state,'paused');assert.equal(ui.keys.size,0);
    ui.key('Escape',{repeat:true});ui.window.dispatch('blur');ui.document.dispatch('fullscreenchange');ui.advance(.2);
    assert.equal(ui.engine.state,'paused');assert.equal(ui.engine.time,time);
    assert.equal(ui.nodes.get('pause-panel').classList.contains('hidden'),false);
    assert.equal(ui.document.fullscreenElement,null);assert.equal(stage.fullscreenAttempts,attempts);
    ui.keyup('Escape');ui.window.dispatch('focus');ui.key('Escape');ui.frame();
    assert.equal(ui.engine.state,'racing','a later, separate Escape press can resume in window mode');
    assert.equal(ui.document.fullscreenElement,null);assert.equal(stage.fullscreenAttempts,attempts,'keyboard resume does not re-enter fullscreen');
  });
});

test('P pauses and resumes without changing fullscreen, while the resume button requests it synchronously',async t=>{
  const ui=await loadCoastUI(t);ui.launch();ui.advance(3.1);
  const stage=ui.nodes.get('race-stage'),attempts=stage.fullscreenAttempts;
  ui.key('KeyP');ui.frame();assert.equal(ui.engine.state,'paused');assert.equal(ui.document.fullscreenElement,stage);
  assert.match(ui.nodes.get('pause').innerHTML,/<kbd>P<\/kbd>/);
  ui.key('KeyP',{repeat:true});assert.equal(ui.engine.state,'paused');
  ui.keyup('KeyP');ui.key('KeyP');assert.equal(ui.engine.state,'racing');assert.equal(stage.fullscreenAttempts,attempts);
  ui.document.fullscreenElement=null;ui.document.dispatch('fullscreenchange');
  ui.key('KeyP');assert.equal(ui.engine.state,'racing');assert.equal(ui.document.fullscreenElement,null,'P can resume outside fullscreen');
  assert.equal(stage.fullscreenAttempts,attempts);
  ui.keyup('KeyP');ui.key('KeyP');assert.equal(ui.engine.state,'paused');
  ui.click('resume');assert.equal(stage.fullscreenAttempts,attempts+1,'request runs inside the trusted button handler before an await');
  assert.equal(ui.document.fullscreenElement,stage);assert.equal(ui.engine.state,'racing');assert.equal(ui.keys.size,0);
  let helpParts=ui.nodes.get('pause-help-text').children;
  assert.deepEqual(helpParts.filter(node=>node.tagName==='KBD').map(node=>node.textContent),['Esc']);
  assert.match(helpParts.map(node=>node.textContent).join(''),/Esc 退出全屏会自动暂停/);
  ui.click('language-en');assert.equal(ui.nodes.get('pause-shortcut').textContent,'P');
  helpParts=ui.nodes.get('pause-help-text').children;
  assert.match(helpParts.map(node=>node.textContent).join(''),/without leaving fullscreen/);
  assert.deepEqual(helpParts.filter(node=>node.tagName==='KBD').map(node=>node.textContent),['Esc']);
});

test('a custom P driving binding retains its action and changes pause hints to Escape',async t=>{
  const ui=await loadCoastUI(t),bind=ui.document.querySelectorAll('[data-bind-player][data-bind-action]').find(button=>button.dataset.bindPlayer==='2'&&button.dataset.bindAction==='accelerate');
  ui.click('open-bindings');bind.click();ui.key('KeyP');ui.click('bindings-done');
  assert.equal(ui.bindings.code(2,'accelerate'),'KeyP');assert.match(ui.nodes.get('pause').innerHTML,/<kbd>Esc<\/kbd>/);
  assert.equal(ui.nodes.get('pause-shortcut').textContent,'Esc');
  const helpParts=ui.nodes.get('pause-help-text').children;
  assert.match(helpParts.map(node=>node.textContent).join(''),/P 已用于/);
  assert.deepEqual(helpParts.filter(node=>node.tagName==='KBD').map(node=>node.textContent),['P']);
  assert.equal(JSON.parse(ui.window.localStorage.getItem('twin-turbo-controls-v1'))[1].accelerate,'KeyP');
  ui.launch();ui.advance(3.1);ui.key('KeyP');ui.advance(.4);
  assert.equal(ui.engine.state,'racing');assert.ok(ui.engine.cars[1].speed>70,'P still accelerates the selected player');
  ui.keyup('KeyP');ui.click('pause');ui.key('KeyP');assert.equal(ui.engine.state,'paused','a driving key cannot resume a paused game');
  ui.click('pause-bindings');ui.click('bindings-reset');ui.click('bindings-done');
  assert.match(ui.nodes.get('pause').innerHTML,/<kbd>P<\/kbd>/);ui.nodes.get('game').focus();ui.key('KeyP');assert.equal(ui.engine.state,'racing');
});

test('leaving fullscreen during either intro phase shows a usable pause and preserves the full countdown',async t=>{
  for(const elapsed of [1,4])await t.test(`intro at ${elapsed}s`,async t=>{
    const ui=await loadCoastUI(t,{entryDuration:9.6});ui.launch();ui.advance(elapsed);
    assert.equal(ui.raceEntry.active,true);ui.document.fullscreenElement=null;ui.document.dispatch('fullscreenchange');ui.frame();
    assert.equal(ui.raceEntry.active,false);assert.equal(ui.renderer.entryProgress,null);
    assert.equal(ui.engine.state,'paused');assert.equal(ui.engine.countdown,3);assert.equal(ui.engine.time,0);
    assert.equal(ui.nodes.get('pause-panel').classList.contains('hidden'),false);
    ui.click('resume');assert.equal(ui.engine.state,'countdown');assert.equal(ui.engine.countdown,3);
    ui.advance(2.9);assert.equal(ui.engine.state,'countdown');ui.advance(.2);assert.equal(ui.engine.state,'racing');
  });
});

test('fullscreen re-shows only an open language dialog above the stage and preserves the focused language choice',async t=>{
  const ui=await loadCoastUI(t,{language:null}),dialog=ui.nodes.get('language-dialog'),choice=ui.nodes.get('language-en');
  dialog.appendChild(choice);choice.focus();
  assert.equal(dialog.open,true);
  let reopened=0;
  const show=dialog.showModal.bind(dialog);
  dialog.showModal=()=>{reopened++;show();};
  const setup=ui.nodes.get('race-setup-dialog');
  let setupClosed=0;setup.addEventListener('close',()=>setupClosed++);
  await ui.nodes.get('race-stage').requestFullscreen();
  assert.equal(reopened,1,'the still-open language dialog is brought back to the top layer');
  assert.equal(dialog.open,true);
  assert.equal(ui.document.activeElement,choice,'the existing focused language button is restored');
  assert.equal(setupClosed,0,'fullscreen does not cycle setup or cancel its loading state');
  ui.click('language-en');
  assert.equal(dialog.open,false);assert.equal(ui.i18n.language,'en');
  await ui.document.exitFullscreen();
  await ui.nodes.get('race-stage').requestFullscreen();
  assert.equal(reopened,1,'a completed language choice is never reopened by later fullscreen changes');
});

test('blocked page-load fullscreen retries synchronously on the first trusted click, Enter or Space',async t=>{
  for(const kind of ['click','Enter','Space'])await t.test(kind,async t=>{
    const ui=await loadCoastUI(t),stage=ui.nodes.get('race-stage'),request=stage.requestFullscreen.bind(stage);
    assert.equal(stage.fullscreenAttempts,1,'page load attempted fullscreen once');
    assert.equal(ui.document.fullscreenElement,null);
    let insideGesture=false;
    stage.requestFullscreen=()=>{assert.equal(insideGesture,true);return request();};
    const type=kind==='click'?'click':'keydown',event={target:ui.nodes.get('start'),code:kind};
    ui.window.dispatch(type,event);
    assert.equal(stage.fullscreenAttempts,1,'synthetic interactions do not consume the fallback');
    insideGesture=true;ui.window.dispatch(type,{...event,isTrusted:true});insideGesture=false;
    assert.equal(stage.fullscreenAttempts,2,'request happens before the trusted handler returns');
    await ui.flush();
    assert.equal(ui.document.fullscreenElement,stage);
    await ui.document.exitFullscreen();
    ui.window.dispatch(type,{...event,isTrusted:true});
    assert.equal(stage.fullscreenAttempts,2,'later ordinary gestures do not undo a fullscreen exit');
  });
});

test('a first trusted manual fullscreen click owns its request instead of toggling the fallback back off',async t=>{
  const ui=await loadCoastUI(t),stage=ui.nodes.get('race-stage');
  ui.window.dispatch('click',{target:ui.nodes.get('fullscreen'),isTrusted:true});
  assert.equal(stage.fullscreenAttempts,1,'capture leaves the manual control in charge');
  await Promise.all(ui.click('fullscreen').pending);
  assert.equal(stage.fullscreenAttempts,2);
  assert.equal(ui.document.fullscreenElement,stage);
  assert.equal(ui.document.fullscreenExits,0);
});

test('actual launch retries fullscreen synchronously after a blocked load without forcing setup, menu or an already-fullscreen race',async t=>{
  const ui=await loadCoastUI(t),stage=ui.nodes.get('race-stage');
  const request=stage.requestFullscreen.bind(stage);
  let launchClick=false;
  stage.requestFullscreen=()=>{
    assert.equal(launchClick,true,'native request stays in the launch click before any asynchronous work');
    return request();
  };
  assert.equal(stage.fullscreenAttempts,1,'the blocked initial request does not suppress launch');
  assert.equal(stage.fullscreenRequests||0,0);
  ui.click('start');
  assert.equal(stage.fullscreenRequests||0,0,'preparing a race does not enter fullscreen');
  launchClick=true;ui.window.dispatch('click',{target:ui.nodes.get('setup-launch'),isTrusted:true});ui.click('setup-launch');launchClick=false;
  assert.equal(stage.fullscreenRequests,1,'request starts before the click handler returns');
  assert.equal(ui.engine.state,'countdown');
  await ui.flush();
  assert.equal(ui.document.fullscreenElement,stage);
  assert.equal(ui.nodes.get('fullscreen-label').textContent,'退出全屏');
  ui.click('restart');ui.click('setup-launch');
  assert.equal(stage.fullscreenRequests,1,'restarting an already-fullscreen race does not request again');
  await Promise.all(ui.click('fullscreen').pending);
  ui.click('pause-menu');
  assert.equal(ui.document.fullscreenElement,null);
  assert.equal(stage.fullscreenRequests,1,'returning to the menu does not re-enter fullscreen');
  ui.click('start');
  assert.equal(stage.fullscreenRequests,1);
  launchClick=true;ui.click('setup-skip');launchClick=false;
  assert.equal(stage.fullscreenRequests,2,'the no-ghost launch uses the same direct request');
  assert.equal(ui.engine.state,'countdown');
  await ui.flush();
});

test('unavailable or denied automatic fullscreen stays quiet, retries on launch and never blocks a race or manual fullscreen',async t=>{
  for(const failure of ['missing API','disabled policy','synchronous rejection','promise rejection'])await t.test(failure,async t=>{
    const ui=await loadCoastUI(t),stage=ui.nodes.get('race-stage'),request=stage.requestFullscreen.bind(stage);
    let attempts=0;
    if(failure==='missing API')stage.requestFullscreen=undefined;
    else if(failure==='disabled policy')ui.document.fullscreenEnabled=false;
    else stage.requestFullscreen=()=>{
      attempts++;
      if(failure==='synchronous rejection')throw new Error('Fullscreen unavailable');
      return Promise.reject(new Error('Fullscreen denied'));
    };
    ui.window.dispatch('click',{target:ui.nodes.get('start'),isTrusted:true});
    await ui.flush();
    ui.window.dispatch('click',{target:ui.nodes.get('start'),isTrusted:true});
    assert.equal(attempts,failure.includes('rejection')?1:0,'ordinary gestures have only one fallback attempt');
    ui.launch();await ui.flush();
    assert.equal(ui.engine.state,'countdown');
    assert.equal(ui.document.fullscreenElement,null);
    assert.equal(ui.nodes.get('fullscreen').getAttribute('title'),'全屏','automatic failure shows no error prompt');
    ui.click('restart');ui.click('setup-launch');await ui.flush();
    assert.equal(ui.engine.state,'countdown');
    assert.equal(attempts,failure.includes('rejection')?3:0,'each explicit launch retries despite prior automatic rejection');
    stage.requestFullscreen=request;ui.document.fullscreenEnabled=true;
    await Promise.all(ui.click('fullscreen').pending);
    assert.equal(ui.document.fullscreenElement,stage,'the explicit fullscreen control remains usable');
  });
});

test('race-state styling follows menu, countdown, racing, paused and finished transitions',async t=>{
  const ui=await loadCoastUI(t);
  assert.equal(ui.document.body.dataset.raceState,'menu');
  ui.launch();ui.frame();assert.equal(ui.document.body.dataset.raceState,'countdown');
  ui.advance(3.1);assert.equal(ui.document.body.dataset.raceState,'racing');
  ui.key('Escape');ui.frame();assert.equal(ui.document.body.dataset.raceState,'paused');
  ui.click('resume');ui.frame();assert.equal(ui.document.body.dataset.raceState,'racing');
  for(const [index,car]of ui.engine.cars.entries())Object.assign(car,{finished:true,lap:1,finishTime:42+index,bestLap:41+index});
  ui.engine.winner=ui.engine.cars[0];ui.engine.state='finished';ui.frame();await ui.flush();
  assert.equal(ui.document.body.dataset.raceState,'finished');
  ui.click('back-menu');ui.frame();assert.equal(ui.document.body.dataset.raceState,'menu');
});

test('records overlay stays in fullscreen and preserves the same unsaved form across close actions',async t=>{
  const ui=await loadCoastUI(t),panel=ui.nodes.get('records-center'),forms=ui.nodes.get('records-results');
  assert.equal(panel.hidden,true);
  ui.leaderboard.showResults([{playerId:1,mode:'local',city:'coast',laps:1,finished:true,timeMs:42000}]);
  const card=ui.leaderboard.cards[0];card.input.value='保留的昵称';
  await ui.nodes.get('race-stage').requestFullscreen();
  ui.nodes.get('menu-records').focus();ui.click('menu-records');
  assert.equal(panel.hidden,false);assert.equal(ui.document.activeElement,panel);
  assert.equal(ui.document.fullscreenElement,ui.nodes.get('race-stage'));assert.equal(ui.document.fullscreenExits,0);
  ui.key('Space');ui.key('KeyW');ui.frame();
  assert.equal(ui.engine.state,'menu');assert.equal(ui.nodes.get('race-setup-dialog').open,false);assert.equal(ui.keys.size,0);
  card.input.focus();const inputEscape=ui.key('Escape');
  assert.equal(inputEscape.defaultPrevented,false);assert.equal(panel.hidden,false,'typing keeps its normal keyboard behavior');
  ui.click('help');const dialogEscape=ui.key('Escape');
  assert.equal(dialogEscape.defaultPrevented,false);assert.equal(panel.hidden,false,'native dialog Esc has priority over the record overlay');
  ui.click('help-done');panel.focus();const escape=ui.key('Escape');
  assert.equal(escape.defaultPrevented,true);assert.equal(panel.hidden,true);assert.equal(ui.engine.state,'menu');
  assert.equal(ui.document.activeElement,ui.nodes.get('menu-records'));
  ui.click('menu-records');ui.click('records-close');assert.equal(panel.hidden,true);
  ui.click('menu-records');ui.click('records-start');assert.equal(panel.hidden,true);
  assert.equal(ui.document.activeElement,ui.nodes.get('start'));
  assert.equal(ui.leaderboard.cards[0],card);assert.equal(card.input.value,'保留的昵称');
  assert.equal(ui.nodes.get('records-results'),forms);assert.equal(forms.parentElement,ui.nodes.get('records-pending-host'));
});

test('opening records during a race pauses it and closing with Esc does not resume it',async t=>{
  const ui=await loadCoastUI(t);ui.launch();ui.advance(3.1);ui.key('KeyW');ui.advance(.2);
  const time=ui.engine.time;ui.click('menu-records');ui.frame();
  assert.equal(ui.engine.state,'paused');assert.equal(ui.keys.size,0);
  assert.equal(ui.nodes.get('records-center').hidden,false);
  ui.key('Escape');ui.advance(.2);
  assert.equal(ui.nodes.get('records-center').hidden,true);assert.equal(ui.engine.state,'paused');assert.equal(ui.engine.time,time);
  ui.click('resume');ui.frame();assert.equal(ui.engine.state,'racing');
});

test('settings dialog clears driving input, yields Esc to the native dialog and never resumes automatically',async t=>{
  const ui=await loadCoastUI(t),dialog=ui.nodes.get('settings-dialog');
  ui.click('menu-settings');assert.equal(dialog.open,true);assert.equal(ui.engine.state,'menu');
  assert.equal(ui.key('Space').defaultPrevented,false);assert.equal(ui.nodes.get('race-setup-dialog').open,false);
  ui.click('close-settings');assert.equal(dialog.open,false);assert.equal(ui.document.activeElement,ui.nodes.get('menu-settings'));
  ui.launch();ui.advance(3.1);ui.key('KeyW');ui.advance(.2);
  const time=ui.engine.time;ui.click('pause-settings');ui.frame();
  assert.equal(dialog.open,true);assert.equal(ui.engine.state,'paused');assert.equal(ui.keys.size,0);
  for(const code of ['KeyW','ArrowUp','Enter','Space','Escape'])assert.equal(ui.key(code).defaultPrevented,false);
  ui.advance(.2);assert.equal(ui.engine.time,time);assert.equal(ui.keys.size,0);
  const cancel=dialog.dispatch('cancel');assert.equal(cancel.defaultPrevented,false);
  dialog.close();ui.frame();assert.equal(ui.engine.state,'paused','native close must not restart the engine');
  assert.equal(ui.document.activeElement,ui.nodes.get('pause-settings'));
  ui.click('resume');ui.frame();assert.equal(ui.engine.state,'racing');
});

test('start and Space open preparation before countdown, with an explicit no-ghost launch', async t => {
  const ui = await loadCoastUI(t);
  ui.click('start');
  assert.equal(ui.nodes.get('race-setup-dialog').open, true);
  assert.equal(ui.engine.state, 'menu');
  assert.match(ui.nodes.get('race-setup-summary').textContent, /1 圈/);
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

test('cinematic entry freezes every race clock and recorder through blur and hidden tabs, then retains the full countdown',async t=>{
  const ui=await loadCoastUI(t,{entryDuration:9.6});
  const startEngine=ui.engine.start.bind(ui.engine);
  ui.engine.start=(...args)=>{assert.equal(ui.raceEntry.active,true,'the opaque entry cover exists before the engine can expose the racing scene');return startEngine(...args);};
  let recordings=0,splits=0;
  const record=ui.ghostRecorder.sample.bind(ui.ghostRecorder),split=ui.splitTiming.sample.bind(ui.splitTiming);
  ui.ghostRecorder.sample=(...args)=>{recordings++;return record(...args);};
  ui.splitTiming.sample=(...args)=>{splits++;return split(...args);};
  ui.launch();const start=ui.engine.cars.map(car=>[car.x,car.y,car.angle]);
  assert.equal(ui.raceEntry.active,true);assert.equal(ui.renderer.entryProgress,0);
  assert.equal(ui.raceEntry.starts.at(-1),'coast');
  ui.key('KeyW');ui.key('ArrowUp');ui.advance(3.9);
  assert.equal(ui.keys.size,0);assert.equal(ui.engine.time,0);assert.equal(ui.engine.countdown,3);
  assert.equal(recordings,0);assert.equal(splits,0);
  assert.deepEqual(ui.engine.cars.map(car=>[car.x,car.y,car.angle]),start);
  assert.ok(ui.renderer.entryProgress>0&&ui.renderer.entryProgress<1);
  const elapsed=ui.raceEntry.elapsed;
  ui.window.dispatch('blur');ui.advance(1);
  assert.equal(ui.raceEntry.elapsed,elapsed);assert.equal(ui.engine.state,'countdown');
  ui.window.dispatch('focus');ui.document.hidden=true;ui.document.dispatch('visibilitychange');ui.advance(1);
  assert.equal(ui.raceEntry.elapsed,elapsed);assert.equal(ui.engine.countdown,3);
  ui.document.hidden=false;ui.document.dispatch('visibilitychange');
  while(ui.raceEntry.active)ui.frame();
  assert.equal(ui.renderer.entryProgress,null,'the final preview snapshot cannot retain the cinematic camera');
  assert.equal(ui.engine.time,0);assert.equal(ui.engine.countdown,3);
  assert.equal(recordings,0);assert.equal(splits,0);
  assert.equal(ui.nodes.get('countdown').classList.contains('hidden'),false);
  ui.advance(2.9);assert.equal(ui.engine.state,'countdown');
  ui.advance(.2);assert.equal(ui.engine.state,'racing');assert.ok(recordings>0&&splits>0);
});

test('entry skips and cancellation restore normal cameras without moving cars or consuming countdown',async t=>{
  const ui=await loadCoastUI(t,{entryDuration:9.6});ui.launch();ui.advance(2.5);
  ui.key('Escape');assert.equal(ui.raceEntry.active,false);assert.equal(ui.renderer.entryProgress,null);
  assert.equal(ui.engine.countdown,3);assert.equal(ui.engine.state,'countdown');
  ui.click('restart');assert.equal(ui.renderer.entryProgress,null);ui.click('setup-launch');
  assert.equal(ui.raceEntry.active,true);ui.advance(.4);ui.key('Space');
  assert.equal(ui.raceEntry.active,false);assert.equal(ui.engine.countdown,3);assert.equal(ui.keys.size,0);
  ui.click('restart');ui.click('setup-launch');ui.advance(2.5);ui.click('pause-menu');ui.frame();
  assert.equal(ui.raceEntry.active,false);assert.equal(ui.renderer.entryProgress,null);assert.equal(ui.engine.state,'menu');
  assert.equal(ui.nodes.get('race-stage').classList.contains('race-entry-active'),false);
});

function accelerateToBoost(ui,codes,players,expected=true){
  for(const code of codes)ui.key(code);
  for(let i=0;i<60;i++){
    const eligible=players.map(id=>ui.engine.cars[id-1].speed>40);
    ui.frame();
    if(eligible.every(Boolean)){
      for(const id of players)assert.equal(ui.engine.cars[id-1].boosting,expected,`P${id}: first full tick above the existing speed threshold`);
      return;
    }
  }
  assert.fail('real acceleration must reach the existing boost threshold');
}
function bindUI(ui,player,action,code){
  ui.click('open-bindings');
  ui.document.querySelectorAll('[data-bind-player][data-bind-action]').find(button=>Number(button.dataset.bindPlayer)===player&&button.dataset.bindAction===action).click();
  ui.key(code);ui.click('bindings-done');
  assert.equal(ui.bindings.code(player,action),code);
}
test('both boost keys held before launch survive setup and the whole intro without spending fuel during countdown',async t=>{
  const ui=await loadCoastUI(t,{entryDuration:9.6});
  ui.key('ShiftLeft',{target:ui.document.body});ui.click('start');
  ui.key('Enter',{target:ui.document.body});ui.click('setup-launch');
  ui.advance(3.9);assert.equal(ui.keys.size,0,'cinematic continues to reject ordinary driving input');
  while(ui.raceEntry.active)ui.frame();
  assert.equal(ui.engine.countdown,3);assert.equal(ui.engine.time,0);
  ui.key('KeyW');ui.key('ArrowUp');ui.advance(2.9);
  assert.ok(ui.engine.cars.every(car=>car.boost===100&&car.speed===0&&!car.boosting),'holding boost never consumes fuel or launches during 3–2–1');
  ui.advance(.11);accelerateToBoost(ui,['KeyW','ArrowUp'],[1,2]);
  assert.ok(ui.engine.cars.every(car=>car.boost<100),'neither player needs a second boost keydown');
  ui.keyup('ShiftLeft');ui.frame();
  assert.equal(ui.engine.cars[0].boosting,false);assert.equal(ui.engine.cars[1].boosting,true);
  ui.keyup('Enter');ui.frame();assert.equal(ui.engine.cars[1].boosting,false);
});
test('custom boost held during intro survives restart and skip, including the alternate solo layout',async t=>{
  const ui=await loadCoastUI(t,{entryDuration:9.6});
  bindUI(ui,1,'boost','KeyB');bindUI(ui,2,'boost','ShiftRight');
  ui.launch();ui.key('KeyB');ui.key('ShiftRight');ui.advance(.3);
  ui.click('restart');ui.click('setup-launch');ui.advance(.2);ui.key('Space');ui.advance(3.01);
  accelerateToBoost(ui,['KeyW','ArrowUp'],[1,2]);
  ui.keyup('KeyB');ui.keyup('ShiftRight');ui.click('pause-menu');
  ui.modeButtons.find(button=>button.dataset.mode==='ai').click();
  ui.key('ShiftRight',{target:ui.document.body});ui.click('start');ui.click('setup-skip');
  ui.key('Space');ui.advance(3.01);accelerateToBoost(ui,['ArrowUp'],[1]);
  assert.equal(ui.engine.cars.length,1,'alternate P2 binding drives only the actual solo car');
  ui.keyup('ShiftRight');ui.frame();assert.equal(ui.engine.cars[0].boosting,false);
});
test('releasing boost, losing focus or hiding the page during intro clears its physical hold',async t=>{
  for(const reason of ['keyup','blur','hidden'])await t.test(reason,async t=>{
    const ui=await loadCoastUI(t,{entryDuration:9.6});ui.launch();ui.key('ShiftLeft');ui.advance(.2);
    if(reason==='keyup')ui.keyup('ShiftLeft');
    else if(reason==='blur'){ui.window.dispatch('blur');ui.window.dispatch('focus');}
    else{ui.document.hidden=true;ui.document.dispatch('visibilitychange');ui.document.hidden=false;ui.document.dispatch('visibilitychange');}
    ui.key('Space');ui.advance(3.01);accelerateToBoost(ui,['KeyW'],[1],false);
    assert.equal(ui.engine.cars[0].boost,100);
    ui.key('ShiftLeft');ui.frame();assert.equal(ui.engine.cars[0].boosting,true);
    if(reason==='keyup')ui.keyup('ShiftLeft');
    else if(reason==='blur'){ui.window.dispatch('blur');ui.window.dispatch('focus');}
    else{ui.document.hidden=true;ui.document.dispatch('visibilitychange');ui.document.hidden=false;ui.document.dispatch('visibilitychange');}
    ui.frame();assert.equal(ui.engine.cars[0].boosting,false,'release or focus loss also stops an active boost');
    if(reason!=='keyup'){ui.click('resume');ui.key('KeyW');ui.frame();assert.equal(ui.engine.cars[0].boosting,false,'resuming never resurrects a hold lost outside the game');}
  });
});
test('typing, settings, key capture and native launch activation cannot become a held boost',async t=>{
  const ui=await loadCoastUI(t,{entryDuration:9.6});
  bindUI(ui,1,'boost','KeyB'); // Choosing B is a binding edit, not a driving keydown.
  ui.key('KeyB',{target:ui.document.createElement('input')});
  ui.click('menu-settings');ui.key('KeyB');ui.click('close-settings');
  ui.click('start');ui.key('Enter',{target:ui.nodes.get('setup-launch')});ui.click('setup-launch');
  ui.key('Space');ui.advance(3.01);accelerateToBoost(ui,['KeyW','ArrowUp'],[1,2],false);
  assert.ok(ui.engine.cars.every(car=>car.boost===100));
});
test('holding native launch Enter cannot become boost when repeats follow focus into the game',async t=>{
  for(const mode of ['local','ai'])await t.test(mode,async t=>{
    const ui=await loadCoastUI(t,{entryDuration:9.6});
    ui.modeButtons.find(button=>button.dataset.mode===mode).click();
    ui.click('start');await ui.flush();
    ui.key('Enter',{target:ui.nodes.get('setup-launch')});ui.click('setup-launch');
    assert.equal(ui.document.activeElement.id,'game');
    ui.key('Enter',{repeat:true});ui.advance(.2);ui.key('Space');
    ui.key('Enter',{repeat:true});ui.advance(3.01);
    const player=mode==='local'?2:1;
    accelerateToBoost(ui,['ArrowUp'],[player],false);
    ui.key('Enter',{repeat:true});ui.frame();
    assert.equal(ui.engine.cars[player-1].boosting,false,'ordinary racing input must also reject the original button hold');
    assert.equal(ui.engine.cars[player-1].boost,100);
    ui.keyup('Enter');ui.key('Enter');ui.frame();
    assert.equal(ui.engine.cars[player-1].boosting,true,'a fresh canvas Enter still boosts normally');
  });
});
test('a held key removed from boost bindings cannot leak into its newly assigned rescue action',async t=>{
  const ui=await loadCoastUI(t,{entryDuration:9.6});
  bindUI(ui,1,'boost','KeyB');ui.key('KeyB',{target:ui.document.body});
  bindUI(ui,1,'boost','ShiftLeft');bindUI(ui,1,'rescue','KeyB');
  ui.launch();ui.key('Space');ui.advance(3.01);accelerateToBoost(ui,['KeyW'],[1],false);
  assert.equal(ui.engine.cars[0].rescueCount,0);assert.equal(ui.engine.cars[0].boost,100);
});

test('tutorial advances through five real driving actions with no ghosts, qualification, saved cards or recordings',async t=>{
  const ui=await loadCoastUI(t,{entryDuration:9.6});
  ui.modeButtons.find(button=>button.dataset.mode==='tutorial').click();
  const beforeRequests=ui.requests.length;
  let recordings=0,splits=0,results=0,newRaces=0,ghostStarts=0;
  ui.ghostRecorder.sample=()=>recordings++;ui.splitTiming.sample=()=>splits++;
  ui.leaderboard.showResults=()=>results++;ui.leaderboard.newRace=()=>newRaces++;ui.ghostClient.startRace=()=>{ghostStarts++;return[];};
  ui.click('start');
  assert.equal(ui.engine.cars.length,1);assert.equal(ui.renderer.singlePlayer,true);
  assert.equal(ui.nodes.get('race-setup-dialog').open,false);assert.equal(ui.raceEntry.active,true);
  assert.equal(ui.drivingTutorial.element.hidden,true);assert.equal(ui.application.activeGhosts.length,0);
  ui.key('Space');ui.advance(3.1);
  assert.equal(ui.drivingTutorial.element.hidden,false);
  ui.key('KeyA');ui.advance(.2);ui.keyup('KeyA');assert.equal(ui.drivingTutorial.step,0,'stationary steering does not count as acceleration');
  const until=step=>{for(let n=0;n<120&&ui.drivingTutorial.step<step;n++)ui.frame();assert.equal(ui.drivingTutorial.step,step);};
  ui.key('KeyW');until(1);
  ui.key('KeyA');until(2);ui.keyup('KeyA');ui.keyup('KeyW');
  ui.key('KeyS');until(3);ui.keyup('KeyS');
  const fuelBefore=ui.engine.cars[0].boost;
  const guideDriver=new RaceAI({carId:1});
  const boostFrame=()=>{const steering=guideDriver.update(ui.engine,1/60);for(const code of ['KeyA','KeyD'])steering.has(code)?ui.key(code):ui.keyup(code);ui.frame();};
  ui.key('KeyW');ui.key('ShiftLeft');
  // Continue steering through the longer boost exercise using real key input.
  for(let n=0;n<150&&fuelBefore-ui.engine.cars[0].boost<58;n++)boostFrame();
  assert.ok(fuelBefore-ui.engine.cars[0].boost>=58&&fuelBefore-ui.engine.cars[0].boost<60);
  assert.equal(ui.drivingTutorial.step,3,'the flame-length instruction stays visible until sixty fuel units have actually been used');
  assert.match(ui.drivingTutorial.element.children[2].textContent,/时速盘下沿的亮弧越长/);
  assert.match(ui.drivingTutorial.element.children[2].textContent,/尾焰也会随余量缩短/);
  for(let n=0;n<30&&ui.drivingTutorial.step<4;n++)boostFrame();
  assert.equal(ui.drivingTutorial.step,4);assert.ok(fuelBefore-ui.engine.cars[0].boost>=60);
  assert.equal(ui.drivingTutorial.element.children[3].children[0].textContent,'Q','reset instruction only shows the primary rescue key');
  for(const code of ['KeyW','ShiftLeft','KeyA','KeyD'])ui.keyup(code);
  const car=ui.engine.cars[0],resets=car.rescueCount;
  ui.key('KeyQ');ui.frame();await ui.flush();
  assert.equal(car.rescueCount,resets+1);assert.equal(ui.drivingTutorial.completed,true);assert.equal(ui.engine.state,'paused');
  assert.equal(ui.nodes.get('result').classList.contains('hidden'),true);
  assert.equal(ui.nodes.get('pause-panel').classList.contains('hidden'),true);
  assert.equal(ui.document.activeElement,ui.drivingTutorial.element.children.at(-1));
  assert.deepEqual([recordings,splits,results,newRaces,ghostStarts],[0,0,0,0,0]);
  assert.equal(ui.requests.length,beforeRequests,'practice performs no ghost matching, qualification or upload');
  assert.equal(ui.drivingTutorial.element.children[2].textContent,'');
  assert.equal(ui.drivingTutorial.element.children[2].hidden,true);
  assert.equal(ui.drivingTutorial.element.children[1].textContent,'准备好出发了');
  ui.click('language-en');
  assert.equal(ui.drivingTutorial.element.children[2].textContent,'');
  assert.equal(ui.drivingTutorial.element.children[2].hidden,true);
  assert.equal(ui.drivingTutorial.element.children[1].textContent,'Ready to race');
  assert.equal(ui.drivingTutorial.element.children.at(-1).textContent,'Back to menu');
  ui.drivingTutorial.element.children.at(-1).click();ui.frame();
  assert.equal(ui.engine.state,'menu');assert.equal(ui.drivingTutorial.element.hidden,true);assert.equal(results,0);
});

test('tutorial counts only actual boost spending across refills and ignores recovery or launch teleports',async t=>{
  const ui=await loadCoastUI(t),guide=ui.drivingTutorial,car={speed:0,angle:0,boost:100,boosting:false,rescueCount:0,launchResetCount:0};
  guide.start(car);
  car.speed=55;guide.update(car,new Set(['KeyW']));
  car.angle=.1;guide.update(car,new Set(['KeyW','KeyA']));
  car.speed=30;guide.update(car,new Set(['KeyS']));assert.equal(guide.step,3);
  const boostKeys=new Set(['KeyW','ShiftLeft']);
  for(const reset of ['rescueCount','launchResetCount']){
    car[reset]++;car.boost=0;car.boosting=true;guide.update(car,boostKeys);
    assert.equal(guide.step,3,`${reset}: fuel changes during a teleport cannot complete the lesson`);
    car.boost=100;car.boosting=false;guide.update(car,new Set());
  }
  const spend=amount=>{car.boosting=true;for(let i=0;i<amount;i++){car.boost--;guide.update(car,boostKeys);}};
  spend(29);assert.equal(guide.step,3);
  car.boost=100;car.boosting=false;guide.update(car,new Set());assert.equal(guide.step,3,'recharging is not consumption');
  spend(30);assert.equal(guide.step,3,'fifty-nine units across two attempts are still insufficient');
  spend(1);assert.equal(guide.step,4,'sixty genuine units complete the nitro step');
});

test('tutorial pause hides the guide, resume keeps the lesson, and restart repeats entry with a fresh full countdown',async t=>{
  const ui=await loadCoastUI(t,{entryDuration:9.6});
  ui.modeButtons.find(button=>button.dataset.mode==='tutorial').click();ui.click('start');ui.key('Space');ui.advance(3.1);
  ui.key('KeyW');ui.advance(.4);ui.keyup('KeyW');assert.equal(ui.drivingTutorial.step,1);
  ui.key('Escape');ui.frame();
  assert.equal(ui.engine.state,'paused');assert.equal(ui.drivingTutorial.element.hidden,true);
  assert.equal(ui.nodes.get('pause-panel').classList.contains('hidden'),false);
  const time=ui.engine.time;ui.advance(.5);assert.equal(ui.engine.time,time);
  ui.key('KeyP');ui.frame();
  assert.equal(ui.engine.state,'racing');assert.equal(ui.drivingTutorial.step,1);assert.equal(ui.drivingTutorial.element.hidden,false);
  ui.key('Escape');ui.frame();ui.click('restart');ui.frame(0);
  assert.equal(ui.raceEntry.active,true);assert.equal(ui.raceEntry.elapsed,0);
  assert.equal(ui.drivingTutorial.step,0);assert.equal(ui.drivingTutorial.element.hidden,true);
  assert.equal(ui.engine.state,'countdown');assert.equal(ui.engine.countdown,3);assert.equal(ui.engine.time,0);
  ui.key('Space');ui.advance(3.1);assert.equal(ui.drivingTutorial.element.hidden,false);
  ui.drivingTutorial.element.children.at(-1).click();ui.frame();
  assert.equal(ui.engine.state,'menu');assert.equal(ui.raceEntry.active,false);assert.equal(ui.drivingTutorial.element.hidden,true);
});

test('tutorial follows custom and alternate controls, survives resets, and finishes a practice lap without the record flow',async t=>{
  const ui=await loadCoastUI(t);
  assert.equal(ui.bindings.set(1,'accelerate','KeyF').ok,true);
  ui.modeButtons.find(button=>button.dataset.mode==='tutorial').click();ui.click('start');ui.advance(3.1);
  assert.match(ui.drivingTutorial.element.children[3].children[0].textContent,/F.*↑/);
  ui.key('KeyW');ui.advance(.4);ui.keyup('KeyW');assert.equal(ui.drivingTutorial.step,0);
  ui.key('ArrowUp');ui.advance(.4);ui.keyup('ArrowUp');assert.equal(ui.drivingTutorial.step,1);
  ui.key('Slash');ui.frame();assert.equal(ui.engine.cars[0].rescueCount,1);assert.equal(ui.drivingTutorial.step,1,'an early reset leaves the unfinished lesson available');
  ui.click('language-en');assert.equal(ui.drivingTutorial.element.children[1].textContent,'Steer while moving');
  let results=0;ui.leaderboard.showResults=()=>results++;
  const car=ui.engine.cars[0];Object.assign(car,{finished:true,lap:1,finishTime:41,bestLap:40});ui.engine.winner=car;ui.engine.state='finished';ui.frame();await ui.flush();
  assert.equal(ui.drivingTutorial.completed,true);assert.match(ui.drivingTutorial.element.children[2].textContent,/Practice lap complete/);
  assert.equal(ui.nodes.get('result').classList.contains('hidden'),true);assert.equal(results,0);
  assert.equal(ui.ghostRecorder.bestReplay(1),null);assert.equal(ui.requests.filter(request=>request.method==='POST').length,0);
  ui.nodes.get('game').focus();ui.key('KeyU');assert.equal(ui.drivingTutorial.completed,true);assert.equal(ui.nodes.get('race-setup-dialog').open,false);
  ui.key('Escape');assert.equal(ui.engine.state,'menu');assert.equal(results,0);
});

test('restart preparation can return to the main menu without launching or retaining a paused race', async t => {
  const ui = await loadCoastUI(t);
  ui.trackCards.get('coast-london').button.click();
  ui.launch(); ui.advance(3.1); ui.key('KeyW'); ui.advance(.2);
  ui.click('restart'); ui.frame();
  assert.equal(ui.engine.state, 'paused');
  assert.equal(ui.nodes.get('race-setup-dialog').open, true);
  ui.click('setup-menu'); ui.frame();
  assert.equal(ui.nodes.get('race-setup-dialog').open, false);
  assert.equal(ui.engine.state, 'menu');
  assert.equal(ui.engine.time, 0);
  assert.equal(ui.keys.size, 0);
  assert.equal(ui.ghostClient.locked, false, 'closing the dialog must not reactivate ghosts');
  assert.equal(ui.nodes.get('pause-panel').classList.contains('hidden'), true);
  assert.equal(ui.nodes.get('menu').classList.contains('hidden'), false);
  assert.equal(ui.document.activeElement, ui.nodes.get('start'));
  assert.equal(TRACK.id, 'coast-london', 'keep the selected circuit');
  assert.ok([...ui.trackCards.values()].every(({button}) => !button.disabled));
  ui.advance(.2); assert.equal(ui.engine.state, 'menu');
  ui.click('start'); ui.click('setup-menu'); ui.frame();
  assert.equal(ui.engine.state, 'menu', 'the same action also works before the first launch');
  assert.equal(ui.nodes.get('race-setup-dialog').open, false);
});

test('U opens the existing restart preparation from the countdown, racing and pause without resetting early',async t=>{
  const ui=await loadCoastUI(t,{entryDuration:9.6});
  assert.match(ui.html,/<button id="restart"[^>]*aria-keyshortcuts="U">重开 <kbd[^>]*>U<\/kbd><\/button>/);
  ui.key('KeyU');assert.equal(ui.nodes.get('race-setup-dialog').open,false,'menu does not launch a race');
  ui.launch();assert.equal(ui.raceEntry.active,true);
  const starts=ui.raceEntry.starts.length;
  ui.key('KeyU');assert.equal(ui.raceEntry.starts.length,starts,'entry animation is not restarted');
  assert.equal(ui.nodes.get('race-setup-dialog').open,false);
  ui.key('Space');assert.equal(ui.engine.state,'countdown');
  assert.equal(ui.key('KeyU').defaultPrevented,true);
  assert.equal(ui.engine.state,'paused');assert.equal(ui.nodes.get('race-setup-dialog').open,true);
  assert.equal(ui.engine.time,0);assert.equal(ui.raceEntry.starts.length,starts);
  ui.click('setup-close');ui.key('KeyU',{repeat:true});
  assert.equal(ui.nodes.get('race-setup-dialog').open,false,'holding U cannot reopen the dialog');
  ui.key('KeyU');assert.equal(ui.nodes.get('race-setup-dialog').open,true,'U works while paused');
  ui.click('setup-close');ui.click('resume');ui.advance(3.1);ui.key('KeyW');ui.advance(.2);
  const time=ui.engine.time,poses=ui.engine.cars.map(({x,y,rescueCount})=>({x,y,rescueCount}));
  ui.key('KeyU');ui.advance(.2);
  assert.equal(ui.engine.state,'paused');assert.equal(ui.engine.time,time);assert.equal(ui.keys.size,0);
  assert.deepEqual(ui.engine.cars.map(({x,y,rescueCount})=>({x,y,rescueCount})),poses,'restart waits for confirmation and never rescues');
  ui.click('setup-launch');
  assert.equal(ui.raceEntry.starts.length,starts+1);assert.equal(ui.engine.time,0);assert.equal(ui.raceEntry.active,true);
});

test('U restart respects text editing, system shortcuts and modal controls, and cannot become a driving binding',async t=>{
  const ui=await loadCoastUI(t);ui.launch();ui.advance(3.1);
  for(const tag of ['input','textarea','select','div']){
    const target=ui.document.createElement(tag);target.isContentEditable=tag==='div';
    assert.equal(ui.key('KeyU',{target}).defaultPrevented,false);
    assert.equal(ui.nodes.get('race-setup-dialog').open,false);assert.equal(ui.engine.state,'racing');
  }
  for(const options of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true},{keyCode:229}]){
    assert.equal(ui.key('KeyU',options).defaultPrevented,false);
    assert.equal(ui.nodes.get('race-setup-dialog').open,false);assert.equal(ui.engine.state,'racing');
  }
  ui.click('pause-settings');assert.equal(ui.key('KeyU').defaultPrevented,false);
  assert.equal(ui.nodes.get('race-setup-dialog').open,false);ui.click('close-settings');
  ui.click('pause-bindings');
  const bind=ui.document.querySelectorAll('[data-bind-player][data-bind-action]').find(button=>button.dataset.bindPlayer==='1'&&button.dataset.bindAction==='rescue');
  bind.click();ui.key('KeyU');
  assert.equal(ui.nodes.get('race-setup-dialog').open,false);
  assert.equal(ui.bindings.code(1,'rescue'),'KeyQ');assert.match(ui.nodes.get('bindings-message').textContent,/U/);
  ui.key('Escape');ui.click('bindings-done');ui.click('resume');
  ui.key('KeyU');assert.equal(ui.nodes.get('race-setup-dialog').open,true);
});

test('a migrated U rescue binding opens restart without rescue, while tutorial U repeats the existing lesson flow',async t=>{
  const saved=[{accelerate:'KeyW',brake:'KeyS',left:'KeyA',right:'KeyD',boost:'ShiftLeft',rescue:'KeyU'},
    {accelerate:'ArrowUp',brake:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',boost:'Enter',rescue:'Slash'}];
  const ui=await loadCoastUI(t,{storageValues:{'twin-turbo-controls-v1':JSON.stringify(saved)}});
  ui.launch();ui.advance(3.1);ui.key('KeyU');
  assert.equal(ui.nodes.get('race-setup-dialog').open,true);assert.equal(ui.engine.cars[0].rescueCount,0);
  assert.equal(ui.bindings.code(1,'rescue'),'KeyQ');
  ui.click('setup-menu');ui.modeButtons.find(button=>button.dataset.mode==='tutorial').click();ui.click('start');ui.advance(3.1);
  ui.key('KeyW');ui.advance(.4);ui.keyup('KeyW');assert.equal(ui.drivingTutorial.step,1);
  ui.key('KeyU',{repeat:true});assert.equal(ui.drivingTutorial.step,1);
  ui.key('KeyU');assert.equal(ui.drivingTutorial.step,0);assert.equal(ui.engine.state,'countdown');assert.equal(ui.engine.time,0);
  assert.equal(ui.nodes.get('race-setup-dialog').open,false,'tutorial uses its existing direct restart flow');
});

test('custom bindings reject conflicts and reserved keys, then drive the real player with the new key', async t => {
  const ui = await loadCoastUI(t);
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

test('the fixed cyan single-player car supports both control layouts, centered grid and no physical AI', async t => {
  const ui = await loadCoastUI(t);
  ui.click('open-bindings');
  const p2Accelerate = ui.document.querySelectorAll('[data-bind-player][data-bind-action]')
    .find(button => button.dataset.bindPlayer === '2' && button.dataset.bindAction === 'accelerate');
  p2Accelerate.click(); ui.key('KeyK'); ui.click('bindings-done');
  ui.modeButtons.find(button => button.dataset.mode === 'ai').click();
  ui.click('menu-settings');
  assert.deepEqual(ui.document.querySelectorAll('[data-player-color]'),[]);
  assert.match(ui.nodes.get('player1-name').textContent, /青色闪电/);
  ui.click('close-settings');
  assert.equal(ui.engine.cars.length, 1);
  await ui.launchPrepared(); ui.advance(3.1);
  assert.equal(ui.engine.cars[0].id, 1); assert.equal(ui.engine.cars[0].colorIndex, 0);
  assert.equal(ui.engine.cars[0]._lane, 0);
  ui.key('KeyW'); ui.advance(.4);
  assert.ok(ui.engine.cars[0].speed > 70, 'P1 driving controls still drive the cyan car');
  ui.keyup('KeyW'); ui.key('KeyK'); ui.advance(.2);
  assert.ok(ui.engine.cars[0].speed > 100, 'remapped alternate acceleration also drives the human');
  assert.equal(ui.engine.cars.length, 1, 'no hidden physical opponent can collide or finish');
});

test('the final countdown beat clears before either car or race clock can move',async t=>{
  for(const entryDuration of [0,9.6])await t.test(`entry duration ${entryDuration}s`,async t=>{
    const ui=await loadCoastUI(t,{entryDuration});
    ui.launch();
    if(entryDuration)ui.advance(entryDuration);
    const overlay=ui.nodes.get('countdown');
    const grid=ui.engine.cars.map(({x,y})=>({x,y}));
    ui.key('KeyW');ui.key('ArrowUp');ui.key('ShiftLeft');ui.key('Enter');
    const beats=new Set();
    for(let frame=1;frame<=99;frame++){
      ui.frame(.03);
      assert.equal(ui.engine.state,'countdown');
      assert.equal(overlay.classList.contains('hidden'),false);
      const beat=String(overlay.firstElementChild.textContent);beats.add(beat);
      assert.equal(beat,String(Math.ceil(3-frame*.03)));
      assert.equal(ui.engine.time,0);
      ui.engine.cars.forEach((car,i)=>{
        assert.equal(car.speed,0);assert.equal(car.boost,100);
        assert.equal(car.x,grid[i].x);assert.equal(car.y,grid[i].y);
      });
    }
    assert.deepEqual([...beats],['3','2','1']);
    // A 50 ms frame crosses the remaining 30 ms of the visible "1".
    ui.frame(.05);
    assert.equal(ui.engine.state,'racing');
    assert.equal(overlay.classList.contains('hidden'),true,'no lingering GO overlay');
    assert.equal(ui.engine.time,0,'the first clear race frame is still time zero');
    ui.engine.cars.forEach((car,i)=>{
      assert.equal(car.speed,0);assert.equal(car.boost,100);
      assert.equal(car.x,grid[i].x);assert.equal(car.y,grid[i].y);
    });
    ui.frame(.03);
    assert.ok(ui.engine.time>0);
    assert.ok(ui.engine.cars.every(car=>car.speed>0),'held throttle takes effect on the clear track');
    assert.equal(overlay.classList.contains('hidden'),true);
  });
});

test('fixed single lap, start focus, countdown HUD and both keyboard drivers use actual handlers', async t => {
  const ui = await loadCoastUI(t);
  assert.deepEqual(ui.lapButtons,[]);
  assert.ok(ui.lapLabels.every(label => label.textContent === 1));
  assert.deepEqual(ui.engine.cars.map(car=>car.colorIndex),[0,1]);
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
  const ui = await loadCoastUI(t);
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
  const ui = await loadCoastUI(t);
  ui.launch(); ui.advance(3.1); ui.key('KeyW'); ui.click('help');
  assert.equal(ui.nodes.get('help-dialog').open, true);
  assert.equal(ui.engine.state, 'paused'); assert.equal(ui.keys.size, 0);
  const before = ui.engine.time;
  for (const code of ['KeyW', 'ArrowUp', 'Enter', 'Space', 'Escape', 'KeyU']) {
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
  const ui = await loadCoastUI(t);
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

test('single-player routes both keyboard layouts to one human car and pauses its race clock', async t => {
  const ui = await loadCoastUI(t);
  assert.equal(ui.modeButtons.find(button => button.dataset.mode === 'local').getAttribute('aria-pressed'), 'true');
  ui.modeButtons.find(button => button.dataset.mode === 'ai').click();
  assert.equal(ui.nodes.get('mode-label').textContent, '幽灵挑战');
  assert.equal(ui.nodes.get('player2-controls').classList.contains('hidden'), true);
  await ui.launchPrepared(); ui.advance(3.1);
  ui.key('ArrowUp'); ui.key('ArrowLeft'); ui.key('Enter');
  assert.deepEqual([...ui.bindings.frameKeys(ui.keys, true)].sort(), ['KeyA', 'KeyW', 'ShiftLeft'], 'both physical layouts map solely to human canonical controls in solo mode');
  ui.keyup('ArrowUp'); ui.keyup('ArrowLeft'); ui.keyup('Enter');
  ui.key('KeyW'); ui.advance(.4);
  assert.equal(ui.engine.cars.length, 1); assert.ok(ui.engine.cars[0].speed > 0);
  const time = ui.engine.time, position = { x: ui.engine.cars[0].x, y: ui.engine.cars[0].y };
  ui.key('Escape'); ui.advance(.2);
  assert.equal(ui.engine.time, time); assert.deepEqual({ x: ui.engine.cars[0].x, y: ui.engine.cars[0].y }, position);
  ui.click('resume'); ui.frame(); assert.ok(ui.engine.time > time);
});

test('finish overlay directly offers the sole nickname form without leaving fullscreen or stealing input shortcuts', async t => {
  const ui = await loadCoastUI(t);
  ui.modeButtons.find(button => button.dataset.mode === 'ai').click();
  await ui.launchPrepared(); ui.advance(3.1);
  const winner = ui.engine.cars[0];
  Object.assign(winner, { finished: true, lap: 1, finishTime: 120.125, bestLap: 39.8 });
  ui.engine.winner = winner; ui.engine.state = 'finished'; ui.frame(); await ui.flush();
  assert.equal(ui.leaderboard.cards.length, 1);
  assert.equal(ui.nodes.get('records-results').hidden, false);
  assert.equal(ui.requests.filter(request => request.url.includes('/api/qualify')).length, 0);
  assert.equal(ui.requests.filter(request => request.method === 'POST').length, 0, 'results wait for an explicit save');
  assert.equal(ui.document.fullscreenElement,ui.nodes.get('race-stage'),'launch already entered fullscreen');
  const positions = ui.engine.cars.map(({x,y}) => ({x,y}));
  const card = ui.leaderboard.cards[0];
  assert.equal(ui.nodes.has('show-records'),false,'no separate button or navigation is needed to save');
  assert.equal(ui.nodes.get('records-results').parentElement,ui.nodes.get('result-save-host'));
  assert.equal(card.input.closest('form').parentElement,ui.nodes.get('records-result-list'));
  assert.equal(ui.document.fullscreenElement,ui.nodes.get('race-stage'),'inline saving remains inside the fullscreen stage');
  assert.equal(ui.nodes.get('records-center').scrollCalls?.length||0,0,'finishing never scrolls to the page leaderboard');
  assert.equal((ui.html.match(/id="records-results"/g)||[]).length,1,'there is only one save area');
  assert.equal(ui.document.activeElement, card.input, 'only human result receives keyboard focus');
  for (const code of ['KeyW', 'Space', 'Enter', 'ArrowUp', 'Escape', 'KeyU']) {
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
  await ui.launchPrepared(); ui.frame();
  assert.equal(ui.leaderboard.cards.length, 0, 'starting a new race clears prior results');
});

test('both human finishers get independent name cards in finish order even when player 2 wins', async t => {
  const ui = await loadCoastUI(t);
  ui.launch(); ui.advance(3.1);
  Object.assign(ui.engine.cars[0], { finished: true, lap: 1, finishTime: 120.2, bestLap: 40 });
  Object.assign(ui.engine.cars[1], { finished: true, lap: 1, finishTime: 120.1, bestLap: 39.9 });
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
  const ui = await loadCoastUI(t);
  ui.launch(); ui.advance(3.1);
  const first = ui.engine.cars[0];
  Object.assign(first, { finished: true, lap: 1, finishTime: 120.125, bestLap: 39.8, speed: 0 });
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
  const ui = await loadCoastUI(t);
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
  const ui = await loadCoastUI(t);
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

test('both player scoreboards finish the single lap despite brief shoulder excursions at a gate', async t => {
  const ui = await loadCoastUI(t);
  ui.launch(); ui.advance(3.1);
  const gate = TRACK.startDistance + TRACK.length / TRACK.checkpoints;
  let verifiedLaps = 0;
  const grassFrames = [0, 0];
  // Smooth, continuous position samples exercise the actual engine and HUD.
  // The old logic lost an entire lap after only 1–2 frames beyond the asphalt.
  for (let s = TRACK.startDistance - 25; s < TRACK.startDistance + TRACK.length + 10 && ui.engine.state !== 'finished'; s += 5) {
    const circuitDistance = TRACK.startDistance + mod(s - TRACK.startDistance, TRACK.length);
    for (const [index, car] of ui.engine.cars.entries()) {
      const lane = car._lane;
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
  assert.equal(verifiedLaps, 1);
  assert.ok(grassFrames.every(count => count > 0), 'both cars genuinely leave the asphalt briefly');
  assert.equal(ui.engine.state, 'finished');
});

test('a real-control one-lap race saves one nickname for total and lap ghost, retries only the failed part, and resets cleanly', async t => {
  let failedLapOnce = false;
  const savedTotals = [], savedLaps = [], savedRaces = [];
  const ui = await loadCoastUI(t, { fetchImpl: async (url, options = {}) => {
    const lap = url.includes('/api/laps') || url.includes('/api/ghosts'), body = options.body ? JSON.parse(options.body) : null;
    const isRace = (body?.version || new URL(url).searchParams.get('version')) === RACE_GHOST_VERSION;
    const category = lap ? { version: isRace ? RACE_GHOST_VERSION : GHOST_VERSION, city: 'coast' }
      : { version: LEADERBOARD_VERSION, city: 'coast', laps: body?.laps || Number(new URL(url).searchParams.get('laps')) || 1 };
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
  assert.equal(ui.engine.winner.id, 1); assert.equal(ui.engine.winner.lap, 1);
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
    assert.equal(ui.ghostRecorder.fullRaceReplay(car.id), null, 'single-lap races never create a retired three-lap replay');
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
  assert.equal(savedTotals.length, 1); assert.equal(savedLaps.length, 0); assert.equal(savedRaces.length, 0);
  assert.equal(racePosts().length, 0, 'single-lap results do not post a three-lap ghost');
  const totalSubmission = JSON.parse(totalPosts()[0].body), lapSubmission = JSON.parse(lapPosts()[0].body);
  assert.equal(totalSubmission.name, 'Harbor Champ', 'a new nickname is capped at twelve characters before both submissions');
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
  assert.equal(savedTotals.length, 1); assert.equal(savedLaps.length, 1); assert.equal(savedRaces.length, 0);
  assert.equal(racePosts().length, 0, 'retry cannot create a retired three-lap ghost');
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
    assert.doesNotMatch(ui.html, /data-city=|london-guide|city-game\.js/);
    assert.ok(ui.requests.length > 0);
    for (const request of ui.requests) {
      assert.equal(new URL(request.url).searchParams.get('city'), 'coast-london');
      assert.equal(new URL(request.url).searchParams.get('version'), request.url.includes('/api/laps') ? GHOST_VERSION : LEADERBOARD_VERSION);
    }
    await ui.launchPrepared();
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
  const ui=await loadCoastUI(t,{fetchImpl:async url=>({ok:true,status:200,json:async()=> {
    const second = url.includes(secondRecord.id) || new URL(url).searchParams.get('name')?.toLowerCase() === 'gold racer';
    return url.includes('/api/ghosts/') ? {version:GHOST_VERSION,city:'coast',entry:second?secondRecord:record,replay:second?secondReplay:recorded} :
      url.includes('/api/ghosts?') ? {version:GHOST_VERSION,city:'coast',entries:[second?secondRecord:record]} :
      url.includes('/api/laps') ? {version:GHOST_VERSION,city:'coast',entries:[record,secondRecord]} :
      {version:LEADERBOARD_VERSION,city:'coast',laps:1,entries:[]};
  }})});
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
  const ui=await loadCoastUI(t);
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
      assert.equal(ui.nodes.get('split-gap1').hidden,true,'a driver with no measured time does not show a sentence');
      const ghostRow=ui.nodes.get('split-ghost1').children[0];
      assert.equal(ghostRow.children[0].textContent,'Split Racer');
      assert.match(ghostRow.children[1].textContent,/^−[0-9.]+ 秒$/);
    }
    if(one&&two){
      compared=true;assert.deepEqual(ui.nodes.get('split-gap1').children.map(node=>node.textContent),['橙色风暴','−0.10 秒']);
      assert.deepEqual(ui.nodes.get('split-gap2').children.map(node=>node.textContent),['青色闪电','+0.10 秒']);
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

test('driving HUD omits navigation prompts on straights and turns while retaining wrong-way warnings',async t=>{
  const ui=await loadCoastUI(t);ui.launch();ui.advance(3.1);
  const context=ui.nodes.get('hud').context,car=ui.engine.cars[0];
  const stations=[TRACK.segments.find(segment=>segment.kind==='line').s+100,
    TRACK.segments.find(segment=>segment.kind==='arc').s+100];
  for(const station of stations){
    const p=trackPoint(station);
    Object.assign(car,{x:p.x,y:p.y,angle:p.angle,elevation:p.elevation,_lastTrackS:p.s,speed:100,offroad:false});
    context.calls.length=0;ui.frame(0);
    const texts=context.calls.filter(call=>call[0]==='fillText').map(call=>call[1]).join(' ');
    assert.doesNotMatch(texts,/直道|前方[左右]弯|松油减速|窄拱门|Straight|turn ·|Narrow passage/);
  }
  car.angle+=Math.PI;context.calls.length=0;ui.frame(0);
  assert.ok(context.calls.some(call=>call[0]==='fillText'&&/逆向行驶/.test(call[1])));
});

test('nitro charge lives in each speed dial without above-car bars or labels at every boost level',async t=>{
  const ui=await loadCoastUI(t);ui.launch();ui.advance(3.1);ui.click('pause');
  const context=ui.nodes.get('hud').context,shapes=[];
  context.roundRect=(...bounds)=>shapes.push({bounds,color:context.fillStyle});
  for(const [charge,boosting]of [[100,false],[25,true],[0,false]]){
    ui.engine.cars.forEach(car=>Object.assign(car,{boost:charge,boosting}));
    shapes.length=0;context.calls.length=0;ui.frame(0);
    for(const car of ui.engine.cars){
      assert.equal(ui.nodes.get('speed-nitro'+car.id).style.strokeDashoffset,String(100-charge));
      assert.equal(ui.nodes.get('speed-nitro'+car.id).style.opacity,charge>0?'1':'0');
    }
    assert.doesNotMatch(context.calls.filter(call=>call[0]==='fillText').map(call=>call[1]).join(' '),/NITRO|%/);
    assert.equal(shapes.filter(shape=>shape.color==='#0b192680').length,0,'the above-car charge shell is removed');
    assert.equal(shapes.filter(shape=>shape.bounds[3]===4&&['#51dfe5','#ff9870','#c6f56b','#ffffff26'].includes(shape.color)).length,0,'no floating charge strip remains');
  }
});

test('all six solo split rivals follow actual checkpoint crossing order without promoting the nearest or dropping the remaining five',async t=>{
  const fixture=challengeFixture();fixture.entries[0].name='<b>Alice</b>';fixture.board=fixture.entries;
  fixture.replay=entry=>({version:1,durationMs:entry.timeMs,frames:Array.from({length:entry.timeMs/100+1},(_,i)=>{
    const p=trackPoint(TRACK.startDistance+TRACK.length*i*100/entry.timeMs,-24);
    return[i*100,p.x,p.y,p.angle,p.elevation];
  })});
  const ui=await loadCoastUI(t,{fetchImpl:challengeFetch(fixture)});
  ui.modeButtons.find(button=>button.dataset.mode==='ai').click();await ui.launchPrepared();ui.advance(3.1);
  // Feed a measured first-quarter result to the UI; replay checkpoints still
  // come from the actual route samples, with 10.50/10.75/11.00-second humans.
  ui.splitTiming.racers.get(1).latest={playerId:1,lap:1,index:1,timeMs:10750,lapTimeMs:10750};
  ui.frame(0);
  const main=ui.nodes.get('split-gap1'),rows=ui.nodes.get('split-ghost1').children;
  const checkpointOrder=ui.splitTiming.ghosts.map(ghost=>({name:ghost.entry.name,timeMs:ghost.times[0]}))
    .sort((a,b)=>a.timeMs-b.timeMs);
  assert.ok(checkpointOrder.every(ghost=>Number.isFinite(ghost.timeMs)));
  assert.equal(main.hidden,false);assert.equal(rows.length,5);
  const allRows=[main,...rows],shownNames=allRows.map(row=>row.children[0].textContent);
  assert.deepEqual(shownNames,checkpointOrder.map(ghost=>ghost.name));
  assert.equal(new Set(shownNames).size,6,'every comparable opponent appears exactly once');
  assert.notEqual(main.children[0].textContent,'Bob','the tied nearest rival must not jump ahead of earlier checkpoint crossings');
  assert.deepEqual(rows.find(row=>row.children[0].textContent==='Bob').children.map(node=>node.textContent),['Bob','+0.00 秒']);
  for(const [index,row]of allRows.entries()){
    assert.match(row.children[1].textContent,/^[+−]\d+\.\d{2} 秒$/);
    const shown=Number(row.children[1].textContent.replace('−','-').split(' ')[0]);
    const deltaMs=10750-checkpointOrder[index].timeMs;
    assert.equal(shown,Math.sign(deltaMs)*Math.round(Math.abs(deltaMs)/10)/100||0);
  }
  const alice=allRows.find(row=>row.children[0].textContent==='<b>Alice</b>');
  assert.ok(alice);assert.equal(alice.children[1].textContent,'+0.25 秒','positive means the player passed this point later');
  assert.ok(allRows.every(row=>row.children.length===2&&row.children[0].getAttribute('data-i18n-skip')!==null));
  assert.ok(!rows.some(row=>row.children[0].textContent===main.children[0].textContent),'the first rival must not be repeated');
  assert.equal(alice.children[0].innerHTML,'','a nickname resembling markup remains literal text');
  const fastest=checkpointOrder[0];ui.splitTiming.racers.get(1).latest.lapTimeMs=fastest.timeMs-100;ui.frame(0);
  assert.deepEqual(main.children.map(node=>node.textContent),[fastest.name,'−0.10 秒']);
  assert.equal(main.classList.contains('split-ahead'),true);
  assert.ok(!ui.nodes.get('split-ghost1').children.some(row=>row.children[0].textContent===fastest.name));
  assert.deepEqual([main,...ui.nodes.get('split-ghost1').children].map(row=>row.children[0].textContent),shownNames,
    'changing the player gap never changes the rivals’ checkpoint crossing order');
});


test('checkpoint rank arrows use separate colors and preserve twelve-character names and crossing order',async t=>{
  const fixture=challengeFixture();fixture.entries[0].name='abcdefghijklmnop';fixture.board=fixture.entries;
  const ui=await loadCoastUI(t,{fetchImpl:challengeFetch(fixture)});
  ui.modeButtons.find(button=>button.dataset.mode==='ai').click();await ui.launchPrepared();ui.advance(3.1);
  const before=[9000,11000,12000,13000,14000,15000],after=[23000,19000,21000,22000,24000,25000];
  ui.splitTiming.ghosts.forEach((ghost,index)=>{ghost.times=[before[index],after[index],30000,42000];});
  const racer=ui.splitTiming.racers.get(1);
  racer.records.set('1:1',{playerId:1,lap:1,index:1,timeMs:10000,lapTimeMs:10000});
  racer.latest={playerId:1,lap:1,index:2,timeMs:20000,lapTimeMs:20000};ui.frame(0);
  const rows=[ui.nodes.get('split-gap1'),...ui.nodes.get('split-ghost1').children];
  const order=[1,2,3,0,4,5],changes=[2,1,1,-4,0,0];
  for(const [index,row]of rows.entries()){
    assert.equal(row.children.length,2,'name and time remain separate columns');
    const ghost=ui.application.activeGhosts[order[index]],identity=row.children[0];
    assert.equal(row.style.color,ghost.color,'identity retains its rival color');
    if(changes[index]){
      assert.equal(identity.children[0].textContent,`${changes[index]>0?'↑':'↓'}${Math.abs(changes[index])}`);
      assert.match(identity.children[0].className,changes[index]>0?/rank-up/:/rank-down/);
      assert.equal(identity.children[1].textContent,ghost.displayName||ghost.entry.name);
    }else assert.equal(identity.children.length,0,'unchanged places have no badge');
    assert.match(row.children[1].textContent,/^[+−]\d+\.\d{2} 秒$/);
  }
  const longIdentity=rows[3].children[0];
  assert.equal(longIdentity.getAttribute('title'),'abcdefghijklmnop');
  assert.equal(longIdentity.children[1].textContent,'abcdefghijk…');
  assert.equal(ui.nodes.get('challenge-roster').children[0].children[0].children[0].textContent,'abcdefghijk…');
  assert.equal(ui.nodes.get('challenge-live-list').children[0].children[0].textContent,'abcdefghijk…');
});

test('Ghost Challenge accepts either steering layout for its cyan car', async t => {
  const ui = await loadCoastUI(t);
  ui.modeButtons.find(button => button.dataset.mode === 'ai').click();
  ui.click('menu-settings');
  assert.deepEqual(ui.document.querySelectorAll('[data-player-color]'),[]);
  ui.click('close-settings');
  await ui.launchPrepared(); ui.advance(3.1); ui.key('ArrowUp'); ui.advance(.4);
  assert.ok(ui.engine.cars[0].speed > 70, 'up arrow accelerates the cyan car');
  assert.equal(ui.engine.cars[0].colorIndex,0);
  assert.equal(ui.engine.cars.length, 1, 'all steering input affects only the human');
  ui.key('ArrowRight'); ui.frame(); assert.ok(ui.engine.cars[0].steer > 0);
  ui.keyup('ArrowRight'); ui.key('ArrowLeft'); ui.advance(.2); assert.ok(ui.engine.cars[0].steer < 0);
  ui.keyup('ArrowLeft'); ui.keyup('ArrowUp');
  const speed = ui.engine.cars[0].speed; ui.key('ArrowDown'); ui.advance(.15); assert.ok(ui.engine.cars[0].speed < speed);
  ui.keyup('ArrowDown'); ui.key('KeyW'); ui.advance(.4); assert.ok(ui.engine.cars[0].speed > 70);
  ui.key('Enter'); ui.frame(); assert.ok(ui.engine.cars[0].boost < 100, 'the arrow layout also offers the human boost');
});

test('public setup and leaderboard exclude retired three-lap ghosts even in stale mixed responses', async t => {
  const lap = { id: 'current-lap', name: '单圈车手', playerId: 1, mode: 'local', createdAt: 2, timeMs: 42000 };
  const retired = { id: 'retired-race', name: '历史三圈', playerId: 1, mode: 'local', createdAt: 1, timeMs: 90000, kind: 'race', laps: 3 };
  const replay = { version: 1, durationMs: 42000, frames: Array.from({ length: 421 }, (_, i) => [i * 100, 100 + i / 10, 200, 0, 0]) };
  const ui = await loadCoastUI(t, { fetchImpl: async raw => {
    const url = new URL(raw), city = url.searchParams.get('city'), version = url.searchParams.get('version');
    if (url.pathname.startsWith('/api/ghosts/')) return { ok: true, json: async () => ({ city, version, entry: lap, replay }) };
    if (url.pathname === '/api/laps') return { ok: true, json: async () => ({ city, version, entries: [retired, lap] }) };
    return { ok: true, json: async () => ({ city, version, laps: 1, entries: [] }) };
  } });
  assert.deepEqual(ui.lapButtons, []);
  assert.equal(ui.nodes.has('records-tab-3'), false);
  ui.click('records-tab-lap'); await ui.flush();
  assert.deepEqual(ui.leaderboard.entries.map(entry => entry.id), [lap.id]);
  assert.equal(ui.leaderboard.challengeButtons.length, 1);
  ui.click('start'); await ui.flush();
  assert.equal(ui.nodes.get('race-setup-dialog').open, true);
  assert.match(ui.nodes.get('ghost-picker-title').textContent, /单圈/);
  assert.deepEqual([...new Set(ui.ghostClient.pickerButtons.map(item => item.entry.id))], [lap.id]);
  assert.equal(ui.ghostClient.pickerButtons.length, 2, 'the valid single-lap row still offers both ghost colors');
  ui.ghostClient.setLaps(3); assert.equal(ui.ghostClient.laps, 1);
  ui.click('setup-close');
  await ui.leaderboard.onChallenge({ ...retired, city: 'coast' }); await ui.flush();
  assert.equal(ui.nodes.get('race-setup-dialog').open, false, 'a stale three-lap challenge cannot reopen setup');
  assert.equal(ui.engine.laps, 1);
  for (const request of ui.requests) {
    const url = new URL(request.url);
    assert.notEqual(url.searchParams.get('laps'), '3');
    assert.doesNotMatch(url.searchParams.get('version') || '', /race-ghost/);
  }
});

test('language choice is required before starting, persists the choice, and switching mid-race pauses safely', async t => {
  const ui=await loadCoastUI(t,{language:null});
  const dialog=ui.nodes.get('language-dialog');assert.equal(dialog.open,true);
  ui.click('start');ui.key('Space');ui.click('setup-launch');ui.frame();
  assert.equal(ui.engine.state,'menu');assert.equal(ui.nodes.get('race-setup-dialog').open,false);
  assert.equal(dialog.dispatch('cancel').defaultPrevented,true,'Escape cannot bypass the initial language choice');
  ui.click('language-en');assert.equal(dialog.open,false);assert.equal(ui.i18n.language,'en');
  assert.equal(ui.document.documentElement.lang,'en');assert.equal(ui.window.localStorage.getItem('twin-turbo-language'),'en');
  assert.equal(ui.nodes.get('track-title').textContent,'Coastline Grand Prix');
  ui.click('start');assert.match(ui.nodes.get('race-setup-summary').textContent,/1 lap/);
  ui.click('setup-skip');ui.advance(3.2);ui.key('KeyW');ui.advance(.2);
  ui.click('language-toggle');assert.equal(dialog.open,true);assert.equal(ui.engine.state,'paused');
  const time=ui.engine.time;ui.advance(.2);assert.equal(ui.engine.time,time);
  ui.click('language-zh');assert.equal(ui.i18n.language,'zh');assert.equal(ui.nodes.get('track-title').textContent,'海岸技术环线');
  assert.equal(ui.window.localStorage.getItem('twin-turbo-language'),'zh');assert.equal(ui.engine.state,'paused');
  ui.click('resume');ui.frame();assert.equal(ui.engine.state,'racing');assert.equal(ui.keys.size,0);
});

test('only six city maps appear in the menu, numbering and board selector in both languages',async t=>{
  const ui=await loadUI(t,{configureRace:false});
  const expected=['coast-london','coast-beijing','coast-shanghai','coast-rio','coast-austin','coast-paris'];
  assert.equal(Object.keys(TRACKS).length,12,'hidden circuits remain in the engine catalog');
  assert.deepEqual([...ui.trackCards.keys()],expected);
  assert.deepEqual(ui.nodes.get('track-cards').children.map(button=>button.dataset.track),expected);
  assert.equal(ui.nodes.get('map-count').textContent,'06 CIRCUITS');
  const board=ui.nodes.get('records-track-choice');
  for(const language of ['zh','en']){
    ui.click(`language-${language}`);
    assert.deepEqual(board.children.map(option=>option.value),expected);
    for(const [index,id]of expected.entries()){
      const track=TRACKS[id],card=ui.trackCards.get(id),number=String(index+1).padStart(2,'0');
      const name=language==='en'?(track.nameEn||'Coastline Grand Prix'):track.name;
      assert.equal(card.button.children[0].textContent,number);
      assert.equal(card.label.textContent,name);assert.equal(board.children[index].textContent,name);
      card.button.click();await ui.flush();ui.frame();
      assert.equal(TRACK.id,id);assert.equal(ui.ghostClient.city,id);assert.equal(ui.leaderboard.city,id);
      assert.equal(board.value,id);assert.equal(card.button.getAttribute('aria-pressed'),'true');
      assert.equal(ui.nodes.get('track-title').textContent,name);assert.equal(ui.nodes.get('records-track').textContent,name);
      assert.equal(ui.nodes.get('track-english').textContent,`${number} / ${(track.nameEn||'COASTLINE GRAND PRIX').toUpperCase()}`);
    }
  }
});

test('stale hidden choices return to London and hidden records cannot launch another map or erase retained data',async t=>{
  const hidden=['coast','coast-bay','coast-pines','coast-neon','coast-marina','coast-ridge'];
  const routes=hidden.map(id=>TRACKS[id]);
  const ui=await loadUI(t,{initialTrack:'coast-ridge',search:'?city=coast-ridge'});
  const board=ui.nodes.get('records-track-choice');
  assert.equal(TRACK.id,'coast-london');assert.equal(board.value,'coast-london');
  assert.equal(ui.trackCards.size,6);assert.match(ui.html,/id="map-count">06 CIRCUITS/);
  ui.leaderboard.raceCity='coast-ridge';
  ui.leaderboard.showResults([{playerId:1,mode:'local',city:'coast-ridge',laps:1,finished:true,timeMs:140000}]);
  const pending=ui.leaderboard.cards[0];pending.input.value='保留的旧地图成绩';
  const replay={id:'prior-hidden-replay',city:'coast-ridge',name:'Existing driver',timeMs:42000};
  ui.leaderboard.lapCache.set(replay.id,replay);
  const requestCount=ui.requests.length,rebuildCount=ui.renderer.rebuildCalls.length;
  for(const id of hidden){
    assert.equal(ui.trackCards.has(id),false);assert.ok(!board.children.some(option=>option.value===id));
    ui.application.selectCircuit(id);
    board.value=id;board.dispatch('change');
    await ui.leaderboard.onChallenge({id:'old-record',city:id,kind:'lap',laps:1,name:'Old driver',timeMs:42000,playerId:1,mode:'local'});
    assert.equal(TRACK.id,'coast-london');assert.equal(ui.leaderboard.city,'coast-london');
    assert.equal(board.value,'coast-london');assert.equal(ui.engine.state,'menu');
    assert.equal(ui.nodes.get('race-setup-dialog').open,false);
  }
  await ui.flush();assert.equal(ui.requests.length,requestCount,'hidden choices do not fetch or launch hidden ghosts');
  assert.equal(ui.renderer.rebuildCalls.length,rebuildCount);
  assert.equal(ui.leaderboard.cards[0],pending);assert.equal(pending.input.value,'保留的旧地图成绩');
  assert.equal(ui.leaderboard.lapCache.get(replay.id),replay);
  assert.deepEqual(hidden.map(id=>TRACKS[id]),routes,'visibility never removes or replaces route data');
});

test('map selection applies each visible city palette immediately',async t=>{
  const ui=await loadUI(t,{configureRace:false});
  assert.equal(ui.document.documentElement.dataset.colorTheme,'purple');
  const palettes={
    'coast-london':'purple','coast-beijing':'red','coast-shanghai':'ice',
    'coast-rio':'green','coast-austin':'orange','coast-paris':'purple',
  };
  for(const [id,palette]of Object.entries(palettes)){
    ui.trackCards.get(id).button.click();
    assert.equal(ui.document.documentElement.dataset.colorTheme,palette,id);
    assert.equal(TRACK.id,id);
  }
  assert.doesNotMatch(ui.html,/data-color-theme-choice|id="color-theme-settings"/,'map themes add no manual setting');
});

test('the active map palette survives language, leaderboard browsing, pause and return to menu',async t=>{
  const ui=await loadUI(t),theme=()=>ui.document.documentElement.dataset.colorTheme;
  ui.modeButtons.find(button=>button.dataset.mode==='local').click();
  ui.trackCards.get('coast-austin').button.click();assert.equal(theme(),'orange');
  ui.click('language-en');assert.equal(theme(),'orange');
  ui.click('menu-settings');assert.equal(theme(),'orange');ui.click('close-settings');
  const board=ui.nodes.get('records-track-choice');
  board.value='coast-beijing';board.dispatch('change');await ui.flush();
  assert.equal(ui.leaderboard.city,'coast-beijing');assert.equal(TRACK.id,'coast-austin');
  assert.equal(theme(),'orange','browsing another leaderboard does not recolor the chosen map');
  ui.launch();ui.advance(3.1);assert.equal(ui.engine.state,'racing');
  ui.click('pause-settings');ui.frame();assert.equal(ui.engine.state,'paused');assert.equal(theme(),'orange');
  ui.click('close-settings');ui.click('pause-menu');ui.frame();
  assert.equal(ui.engine.state,'menu');assert.equal(theme(),'orange');
  ui.trackCards.get('coast-beijing').button.click();assert.equal(theme(),'red');
});

test('changing a harbor circuit resets its opponents, recording, splits and leaderboard and is blocked during a race',async t=>{
  const ui=await loadCoastUI(t);
  assert.deepEqual([...ui.trackCards.keys()],Object.keys(TRACKS));assert.equal(ui.trackCards.size,12);
  assert.deepEqual([...ui.trackCards.keys()].slice(0,6),['coast-london','coast-beijing','coast-shanghai','coast-rio','coast-austin','coast-paris']);
  for(const {button,preview}of ui.trackCards.values()){assert.equal(button.tagName,'BUTTON');assert.equal(preview.tagName,'SVG');assert.ok(preview.querySelector('path').getAttribute('d').startsWith('M'));}
  ui.ghostClient.select({entry:{id:'prior-lap',name:'旧赛道记录',timeMs:42000,playerId:1,mode:'local'},
    replay:{version:1,durationMs:42000,frames:[[0,100,100,0,0],[42000,100,100,0,0]]}});
  ui.ghostRecorder.racers.set(1,{best:{durationMs:42000}});ui.splitTiming.racers.set(1,{});
  ui.leaderboard.showResults([{playerId:1,mode:'local',city:'coast',laps:1,finished:true,timeMs:140000}]);
  assert.equal(ui.leaderboard.cards.length,1);
  ui.trackCards.get('coast-bay').button.click();await ui.flush();ui.frame();
  assert.equal(TRACK.id,'coast-bay');assert.equal(ui.ghostClient.city,'coast-bay');assert.equal(ui.leaderboard.city,'coast-bay');
  assert.equal(ui.ghostClient.selections().length,0);assert.equal(ui.leaderboard.cards.length,0);
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

test('every harbor map offers only one-lap local and Ghost Challenge races',async t=>{
  const ui=await loadCoastUI(t);
  assert.deepEqual(ui.lapButtons,[]);
  assert.doesNotMatch(ui.html,/data-laps="[35]"|id="records-tab-[35]"/);
  for(const [id,track]of Object.entries(TRACKS))for(const mode of ['local','ai'])for(const laps of [1]){
    ui.trackCards.get(id).button.click();
    ui.modeButtons.find(button=>button.dataset.mode===mode).click();
    ui.click('start');await ui.flush();
    assert.equal(TRACK.id,id);assert.equal(ui.ghostClient.laps,laps);assert.equal(ui.ghostClient.city,id);
    assert.match(ui.nodes.get('race-setup-summary').textContent,new RegExp(track.name));
    const ghostRequest=ui.requests.filter(request=>request.url.includes('/api/laps')).at(-1);
    assert.equal(new URL(ghostRequest.url).searchParams.get('city'),id);
    assert.equal(new URL(ghostRequest.url).searchParams.get('version'),id==='coast-shanghai'?(laps===3?'coast-race-ghost-v3':'coast-ghost-v3'):['coast-austin','coast-beijing'].includes(id)?(laps===3?'coast-race-ghost-v2':'coast-ghost-v2'):(laps===3?RACE_GHOST_VERSION:GHOST_VERSION));
    ui.click('setup-skip');ui.advance(3.1);assert.equal(ui.engine.state,'racing');assert.equal(ui.engine.laps,laps);
    ui.key('ArrowUp');if(mode==='local')ui.key('KeyW');ui.advance(.3);
    assert.ok(ui.engine.cars.every(car=>car.speed>50),`${id}/${mode}/${laps} both racers move`);
    assert.equal(ui.engine.cars.length,mode==='ai'?1:2,'physical car count follows the selected mode');
    ui.key('Escape');ui.click('pause-menu');ui.frame();assert.equal(ui.engine.state,'menu');
    assert.ok(ui.engine.cars.every(car=>car.lap===0&&car.speed===0));
  }
});

test('leaderboard map browsing is independent of the current race and keeps unsaved results tied to their source map',async t=>{
  const ui=await loadCoastUI(t),board=ui.nodes.get('records-track-choice');
  assert.deepEqual(board.children.map(option=>option.value),Object.keys(TRACKS));
  ui.leaderboard.showResults([{playerId:1,mode:'local',city:'coast',laps:1,finished:true,timeMs:140000}]);
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
  Object.assign(ui.engine.cars[0],{finished:true,lap:1,finishTime:140,bestLap:46});
  Object.assign(ui.engine.cars[1],{finished:true,lap:1,finishTime:141,bestLap:46.2});
  ui.engine.winner=ui.engine.cars[0];ui.engine.state='finished';ui.frame();await ui.flush();
  assert.equal(ui.leaderboard.cards.length,2,'finishing the current race still creates cards while another map board is selected');
  assert.ok(ui.leaderboard.cards.every(card=>card.city==='coast'));assert.equal(TRACK.id,'coast');
  const cards=[...ui.leaderboard.cards];cards[0].input.value='最终昵称';
  board.value='coast-pines';board.dispatch('change');await ui.flush();
  assert.deepEqual(ui.leaderboard.cards,cards);assert.equal(cards[0].input.value,'最终昵称');
  assert.equal(ui.leaderboard.city,'coast-pines');assert.equal(ui.engine.state,'finished');
});

test('fresh product defaults to London, Ghost Challenge sprint and the fastest-lap board, with both complete keyboard layouts on the human side',async t=>{
  const ui=await loadUI(t,{configureRace:false});
  assert.equal(TRACK.id,'coast-london');
  assert.equal(ui.ghostClient.city,'coast-london');
  assert.equal(ui.leaderboard.city,'coast-london');
  assert.equal(ui.leaderboard.raceCity,'coast-london');
  assert.equal(ui.nodes.get('records-track-choice').value,'coast-london');
  assert.equal(ui.trackCards.get('coast-london').button.getAttribute('aria-pressed'),'true');
  assert.equal(ui.modeButtons.find(button=>button.dataset.mode==='ai').getAttribute('aria-pressed'),'true');
  assert.deepEqual(ui.lapButtons,[]);
  for(const id of ['mode-description','player-color-description','player-color-select'])assert.equal(ui.nodes.has(id),false);
  assert.equal(ui.engine.cars[0].colorIndex,0);
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
  await ui.launchPrepared();ui.advance(3.1);assert.equal(ui.engine.laps,1);assert.equal(ui.engine.state,'racing');
  ui.key('ArrowUp');ui.advance(.3);assert.equal(ui.engine.cars.length,1);assert.ok(ui.engine.cars[0].speed>50);
});

test('stale orange preferences cannot change cyan solo/tutorial identity, while local mode keeps both views and colors',async t=>{
 const ui=await loadUI(t,{configureRace:false,storageValues:{'twin-turbo-player-color':'orange','twin-turbo-car-color':'orange'}});
 assert.equal(ui.renderer.singlePlayer,true);assert.equal(ui.document.body.classList.contains('solo-mode'),true);
 const context=ui.nodes.get('hud').context;let before=context.counts.get('scale')||0;context.calls.length=0;ui.frame();
 assert.equal(context.counts.get('scale')-before,1,'only the human minimap is drawn');
 assert.ok(context.calls.some(call=>call[0]==='translate'&&call[1]===1018&&call[2]===577));
 assert.ok(!context.calls.some(call=>call[0]==='fillText'&&call[1]==='VS'));
 assert.ok(!context.calls.some(call=>call[0]==='fillRect'&&call[1]===597));
 ui.click('menu-settings');assert.equal(ui.nodes.has('player-color-select'),false);ui.click('close-settings');
 await ui.launchPrepared();ui.advance(3.1);
 assert.equal(ui.engine.cars[0].colorIndex,0);assert.equal(ui.engine.cars[0]._lane,0);
 assert.equal(ui.renderer.singlePlayer,true,'cyan human uses the first camera');
 ui.key('Escape');ui.frame();ui.click('pause-settings');
 assert.deepEqual(ui.document.querySelectorAll('[data-player-color]'),[]);
 assert.equal(ui.engine.cars[0].colorIndex,0,'a paused race retains its cyan identity');
 ui.click('close-settings');ui.click('pause-menu');ui.frame();
 ui.modeButtons.find(button=>button.dataset.mode==='local').click();before=context.counts.get('scale');context.calls.length=0;ui.frame();
 assert.equal(ui.renderer.singlePlayer,false);assert.equal(ui.document.body.classList.contains('solo-mode'),false);
 assert.equal(ui.engine.cars.length,2,'returning to local mode restores the second physical human car');
 assert.deepEqual(ui.engine.cars.map(car=>car.colorIndex),[0,1]);
 assert.equal(context.counts.get('scale')-before,2);assert.ok(context.calls.some(call=>call[0]==='fillText'&&call[1]==='VS'));
 ui.modeButtons.find(button=>button.dataset.mode==='ai').click();
 assert.equal(ui.engine.cars[0].colorIndex,0,'returning to solo remains cyan');
 ui.modeButtons.find(button=>button.dataset.mode==='tutorial').click();ui.launch();ui.advance(3.1);
 assert.equal(ui.engine.cars.length,1);assert.equal(ui.engine.cars[0].colorIndex,0);assert.equal(ui.engine.cars[0]._lane,0);
 assert.equal(ui.renderer.singlePlayer,true);assert.equal(ui.drivingTutorial.active,true);
 assert.equal(ui.window.localStorage.getItem('twin-turbo-player-color'),'orange','obsolete preferences are ignored, not erased');
});

function challengeFixture(laps = 1) {
  const times = laps === 3 ? [126000, 129000, 132000] : [42000, 43000, 44000];
  const entries = times.map((timeMs,index) => ({ id:`challenge-driver-${index}`, name:['Alice','Bob','Carol'][index],
    timeMs, playerId:1, mode:'local', createdAt:index+1, ...(laps===3?{kind:'race',laps:3}:{}) }));
  // The challenge must tolerate old responses containing repeat names or a
  // legacy AI entry without displacing eligible human ladder steps.
  const board = [entries[0], {...entries[0], id:'challenge-repeat-alice', name:'ＡＬＩＣＥ', timeMs:times[0]+100},
    {...entries[0], id:'challenge-legacy-ai', name:'Old AI', timeMs:times[0]+200, playerId:2, mode:'ai'}, ...entries.slice(1)];
  const replay = entry => ({version:1,durationMs:entry.timeMs,
    frames:Array.from({length:entry.timeMs/100+1},(_,i)=>[i*100,100+i/10,200,0,0]),
    ...(laps===3?{kind:'race',laps:3,lapEndsMs:[entry.timeMs/3,entry.timeMs*2/3,entry.timeMs]}:{})});
  return {entries, board, replay};
}

function challengeFetch(fixture, {beforeBoard} = {}) {
  return async raw => {
    const url=new URL(raw), city=url.searchParams.get('city'), version=url.searchParams.get('version');
    if(url.pathname==='/api/laps') {
      await beforeBoard?.(url);
      return {ok:true,status:200,json:async()=>({city,version,entries:fixture.board})};
    }
    if(url.pathname.startsWith('/api/ghosts/')) {
      const entry=fixture.board.find(entry=>url.pathname.endsWith('/'+entry.id));
      return {ok:true,status:200,json:async()=>({city,version,entry,replay:fixture.replay(entry)})};
    }
    return {ok:true,status:200,json:async()=>({city,version,laps:Number(url.searchParams.get('laps'))||1,entries:[]})};
  };
}

test('automatic solo setup waits for matching, then starts three distinct human ghosts and three pace ghosts with one physical car', async t=>{
  let hold=false, release;
  const fixture=challengeFixture(1), gate=new Promise(resolve=>{release=resolve;});
  const ui=await loadCoastUI(t,{fetchImpl:challengeFetch(fixture,{beforeBoard:()=>hold?gate:undefined})});
  ui.modeButtons.find(button=>button.dataset.mode==='ai').click();
  hold=true;ui.click('start');await ui.flush();
  assert.equal(ui.nodes.get('race-setup-dialog').open,true);
  assert.equal(ui.nodes.get('challenge-setup').hidden,false);
  assert.equal(ui.nodes.get('manual-ghost-setup').hidden,true);
  assert.equal(ui.nodes.get('setup-launch').disabled,true,'cannot race a roster that is still loading');
  assert.equal(ui.nodes.get('challenge-status').hidden,false);
  assert.equal(ui.nodes.get('challenge-status').textContent,'正在匹配…');
  ui.click('setup-launch');ui.advance(.1);assert.equal(ui.engine.state,'menu');
  release();await ui.flush();
  assert.equal(ui.nodes.get('setup-launch').disabled,false);
  assert.equal(ui.nodes.get('setup-launch').textContent,'开始挑战');
  const roster=ui.application.challengeSetup;
  assert.equal(roster.humanCount,3);assert.equal(roster.paceCount,3);
  assert.deepEqual(roster.ghosts.filter(ghost=>!ghost.synthetic).map(ghost=>ghost.entry.name),['Alice','Bob','Carol']);
  assert.equal(new Set(roster.ghosts.map(ghost=>ghost.color)).size,6);
  assert.deepEqual(roster.ghosts.map(ghost=>ghost.slotId),[0,1,2,3,4,5]);
  for(const [index,ghost] of roster.ghosts.entries()){
    if(!ghost.synthetic)continue;
    const gap=ghost.replay.durationMs-roster.ghosts[index-1].replay.durationMs;
    assert.ok(gap>=800&&gap<=1200,'each machine fills the requested 0.8–1.2 second window');
    assert.equal(ghost.entry.timeMs,ghost.replay.durationMs,'the roster reports the actual generated replay duration');
    assert.equal(ghost.targetMs,ghost.replay.durationMs,'live and final ranking use the same actual duration');
  }
  assert.equal(ui.nodes.get('challenge-roster').children.length,6);
  assert.equal(ui.nodes.get('challenge-status').textContent,'');
  assert.equal(ui.nodes.get('challenge-status').hidden,true);
  assert.equal(ui.nodes.get('challenge-shortfall').hidden,true);
  assert.equal(ui.nodes.get('challenge-retry').hidden,true);
  assert.equal(ui.requests.filter(request=>request.url.includes('/api/ghosts/')).length,3,'repeat names and legacy AI never fetch a replay');
  ui.click('setup-launch');ui.advance(3.1);
  assert.equal(ui.engine.state,'racing');assert.equal(ui.engine.cars.length,1);
  assert.equal(ui.application.activeGhosts.length,6);assert.equal(ui.renderer.singlePlayer,true);
  assert.equal(ui.nodes.get('challenge-live-list').children.length,6);
  assert.equal(ui.nodes.get('challenge-live').hidden,false);
  assert.equal(ui.renderer.ghostPoses[0].length,0,'lap ghosts wait for the human timing-line crossing');
  ui.key('KeyW');ui.advance(1);
  assert.equal(ui.engine.cars[0]._started,true);
  assert.equal(ui.renderer.ghostPoses[0].length,6);
  const poses=structuredClone(ui.renderer.ghostPoses), time=ui.engine.time;
  ui.key('Escape');ui.advance(.2);
  assert.equal(ui.engine.time,time);assert.deepEqual(ui.renderer.ghostPoses,poses);
  ui.click('resume');ui.frame();assert.ok(ui.engine.time>time);
  ui.advance(2.1);
  assert.equal(ui.nodes.get('challenge-live').hidden,true,'the grid list leaves the left edge after three racing seconds');
  assert.equal(ui.nodes.get('race-position1').hidden,false,'current position remains at the top');
  assert.equal(ui.nodes.get('position-total1').textContent,'/ 7');
  assert.ok(Number(ui.nodes.get('position-place1').textContent)>=1);
  assert.equal(ui.nodes.get('speed-mode1').textContent,'KM/H');
  assert.ok(Number(ui.nodes.get('speed-fill1').style.strokeDashoffset)<100,'actual movement fills the speed dial');
  assert.equal(ui.nodes.has('setup-start-rule'),false,'the removed rule is not in the setup');
  assert.equal(ui.requests.filter(request=>request.method==='POST').length,0,'matching and pacing never submit records');
});

test('three close human records appear together before machine filling in the opening roster',async t=>{
  const fixture=challengeFixture();
  fixture.entries.forEach((entry,index)=>{entry.timeMs=[48830,48840,49540][index];});fixture.board=fixture.entries;
  fixture.replay=entry=>{
    const frames=[];for(let time=0;time<entry.timeMs;time+=100)frames.push([time,100+time/1000,200,0,0]);
    frames.push([entry.timeMs,100+entry.timeMs/1000,200,0,0]);
    return{version:1,durationMs:entry.timeMs,frames};
  };
  const ui=await loadCoastUI(t,{fetchImpl:challengeFetch(fixture)});
  ui.modeButtons.find(button=>button.dataset.mode==='ai').click();ui.click('start');await ui.flush();
  const ghosts=ui.application.challengeSetup.ghosts;
  assert.equal(ui.application.challengeSetup.humanCount,3);assert.equal(ui.application.challengeSetup.paceCount,3);
  assert.deepEqual(ghosts.slice(0,3).map(ghost=>[ghost.entry.name,ghost.entry.timeMs]),[['Alice',48830],['Bob',48840],['Carol',49540]]);
  assert.deepEqual(ui.nodes.get('challenge-roster').children.slice(0,3).map(row=>row.children[0].children[0].textContent),['Alice','Bob','Carol']);
});

test('a close earlier history fills the third human place after a different driver is selected',async t=>{
  const fixture=challengeFixture();
  fixture.entries=[{...fixture.entries[0],name:'Emery',timeMs:48826},
    {...fixture.entries[1],name:'Emery',timeMs:48907},{...fixture.entries[2],name:'jy',timeMs:49543}];fixture.board=fixture.entries;
  fixture.replay=entry=>{const frames=[];for(let time=0;time<entry.timeMs;time+=100)frames.push([time,100+time/1000,200,0,0]);frames.push([entry.timeMs,100+entry.timeMs/1000,200,0,0]);return{version:1,durationMs:entry.timeMs,frames};};
  const ui=await loadCoastUI(t,{fetchImpl:challengeFetch(fixture)});
  ui.modeButtons.find(button=>button.dataset.mode==='ai').click();ui.click('start');await ui.flush();
  const setup=ui.application.challengeSetup;
  assert.equal(setup.humanCount,3);assert.equal(setup.paceCount,3);
  assert.deepEqual(setup.ghosts.slice(0,3).map(ghost=>[ghost.displayName,ghost.entry.timeMs]),[['Emery1',48826],['Emery2',48907],['jy',49543]]);
  assert.deepEqual(setup.ghosts.map(ghost=>ghost.slotId),[0,1,2,3,4,5]);
  assert.deepEqual(ui.nodes.get('challenge-roster').children.slice(0,3).map(row=>row.children[0].children[0].textContent),['Emery1','Emery2','jy']);
  assert.ok(setup.ghosts[3].targetMs>=49543+800,'machine clocks follow the slowest chosen human, not the last-loaded earlier record');
});

test('interleaved machines and repeated human runs keep correct bilingual names in setup, live roster and results',async t=>{
  const fixture=challengeFixture(1);
  fixture.entries=[fixture.entries[0],{...fixture.entries[0],id:'challenge-alice-second',timeMs:44000},
    {...fixture.entries[1],timeMs:46000}];fixture.board=fixture.entries;
  const ui=await loadCoastUI(t,{fetchImpl:challengeFetch(fixture)});
  ui.modeButtons.find(button=>button.dataset.mode==='ai').click();ui.click('start');await ui.flush();
  const setupNames=()=>ui.nodes.get('challenge-roster').children.map(row=>row.children[0].children[0].textContent);
  assert.deepEqual(setupNames(),['Alice1','配速幽灵 1','Alice2','配速幽灵 2','Bob','配速幽灵 3']);
  assert.equal(ui.application.challengeSetup.ghosts[2].entry.name,'Alice','display suffix never edits the original human identity');
  ui.click('language-en');
  const english=['Alice1','Pace Ghost 1','Alice2','Pace Ghost 2','Bob','Pace Ghost 3'];
  assert.deepEqual(setupNames(),english,'machine numbers do not depend on their interleaved color slot');
  ui.click('setup-launch');ui.advance(3.1);
  assert.deepEqual(ui.nodes.get('challenge-live-list').children.map(row=>row.children[0].textContent),english);
  const car=ui.engine.cars[0];
  Object.assign(car,{finished:true,_started:true,lap:1,finishTime:49,lastLap:48,bestLap:48,speed:0});
  ui.engine.time=49;ui.frame();await ui.flush();
  assert.deepEqual(ui.nodes.get('challenge-results-list').children.map(row=>row.children[1].textContent),[...english,'You']);
  assert.equal(ui.requests.filter(request=>request.method==='POST').length,0);
});

for(const laps of [1])test(`Ghost Challenge ${laps}-lap results use the correct clock and finish immediately with only the human save card`,async t=>{
  const fixture=challengeFixture(laps),ui=await loadCoastUI(t,{fetchImpl:challengeFetch(fixture)});
  ui.modeButtons.find(button=>button.dataset.mode==='ai').click();
  await ui.launchPrepared();ui.advance(3.1);
  assert.equal(ui.application.activeGhosts.length,6);
  const replayRequests=ui.requests.filter(request=>request.url.includes('/api/ghosts/'));
  assert.equal(replayRequests.length,3);
  for(const {url}of replayRequests)assert.equal(new URL(url).searchParams.get('version'),ghostVersionForCity('coast',laps));
  assert.equal(ui.renderer.ghostPoses[0].length,laps===3?6:0,'full-race ghosts begin at GO; lap ghosts wait for the timing line');
  const car=ui.engine.cars[0];
  const finishTime=laps===1?44.5:128.5,lastLap=laps===1?42.5:41.5;
  Object.assign(car,{finished:true,_started:true,lap:laps,finishTime,lastLap,bestLap:lastLap,speed:0});
  ui.engine.time=finishTime;ui.frame();await ui.flush();
  assert.equal(ui.engine.state,'finished','the only physical car ends the race even though slower ghosts still have target time remaining');
  assert.equal(ui.nodes.get('result-driver2-row').hidden,true);
  assert.equal(ui.nodes.get('challenge-results').hidden,false);
  assert.equal(ui.nodes.get('challenge-results-list').children.length,7);
  assert.deepEqual(ui.application.activeGhosts.filter(ghost=>ghost.replay.durationMs<lastLap*1000).map(ghost=>ghost.entry.name),['Alice']);
  assert.equal(ui.nodes.get('winner-name').textContent,'第 2 名 · 挑战完成');
  const own=ui.nodes.get('challenge-results-list').children.find(node=>node.className.includes('is-you'));
  assert.equal(own.children[0].textContent,'02');assert.equal(own.children[1].textContent,'你');
  assert.equal(own.children[2].textContent,laps===1?'00:42.50':'02:08.50');
  assert.match(ui.nodes.get('result-subtitle').textContent,laps===1?/起终点之间/:/GO/);
  assert.equal(ui.leaderboard.cards.length,1);
  assert.equal(ui.leaderboard.cards[0].playerId,1);assert.equal(ui.leaderboard.cards[0].mode,'ai','compatibility mode applies only to the human submission');
  assert.equal(ui.requests.filter(request=>request.method==='POST').length,0);
});

test('solo setup retains manual two-color ghost choice behind its in-flow switch',async t=>{
  const fixture=challengeFixture(1),ui=await loadCoastUI(t,{fetchImpl:challengeFetch(fixture)});
  ui.modeButtons.find(button=>button.dataset.mode==='ai').click();
  ui.click('start');await ui.flush();ui.click('setup-manual');await ui.flush();
  assert.equal(ui.nodes.get('challenge-setup').hidden,true);
  assert.equal(ui.nodes.get('manual-ghost-setup').hidden,false);
  assert.equal(ui.nodes.get('setup-auto').hidden,false);
  for(const [index,entry]of fixture.entries.slice(0,2).entries()){
    const button=ui.ghostClient.pickerButtons.find(choice=>choice.entry.id===entry.id&&choice.slotId===index).button;
    await Promise.all(button.click().pending);await ui.flush();
  }
  ui.click('setup-launch');ui.advance(3.1);
  assert.equal(ui.engine.cars.length,1);
  assert.deepEqual(ui.application.activeGhosts.map(ghost=>ghost.entry.name),['Alice','Bob']);
  assert.deepEqual(ui.application.activeGhosts.map(ghost=>ghost.slotId),[0,1]);
  ui.key('KeyW');ui.advance(1);assert.equal(ui.renderer.ghostPoses[0].length,2);
  ui.key('Escape');ui.click('pause-menu');ui.frame();
  ui.modeButtons.find(button=>button.dataset.mode==='local').click();
  ui.launch();ui.advance(3.1);
  assert.equal(ui.engine.cars.length,2);assert.equal(ui.renderer.singlePlayer,false);
  ui.key('KeyW');ui.key('ArrowUp');ui.advance(.3);assert.ok(ui.engine.cars.every(car=>car.speed>50));
});

test('late automatic match cannot restart a skipped free time trial or contaminate a different map',async t=>{
  let hold=false,release;
  const gate=new Promise(resolve=>{release=resolve;}),fixture=challengeFixture(1);
  const ui=await loadCoastUI(t,{fetchImpl:challengeFetch(fixture,{beforeBoard:()=>hold?gate:undefined})});
  ui.modeButtons.find(button=>button.dataset.mode==='ai').click();
  hold=true;ui.click('start');await ui.flush();ui.click('setup-skip');ui.advance(3.1);
  assert.equal(ui.engine.state,'racing');assert.equal(ui.application.activeGhosts.length,0);
  ui.key('Escape');ui.click('pause-menu');ui.frame();ui.trackCards.get('coast-bay').button.click();
  release();await ui.flush();
  assert.equal(TRACK.id,'coast-bay');assert.equal(ui.engine.state,'menu');
  assert.equal(ui.application.activeGhosts.length,0);assert.equal(ui.application.challengeSetup,null);
  assert.equal(ui.nodes.get('race-setup-dialog').open,false);
});

for(const action of ['setup-manual','setup-close'])test(`a pending automatic match cannot undo ${action==='setup-manual'?'manual ghost selection':'closing preparation'}`,async t=>{
  let hold=false,release;
  const gate=new Promise(resolve=>{release=resolve;}),fixture=challengeFixture(1);
  const ui=await loadCoastUI(t,{fetchImpl:challengeFetch(fixture,{beforeBoard:()=>hold?gate:undefined})});
  ui.modeButtons.find(button=>button.dataset.mode==='ai').click();
  hold=true;ui.click('start');await ui.flush();assert.equal(ui.application.challengeSetup.loading,true);
  ui.click(action);release();await ui.flush();
  assert.equal(ui.engine.state,'menu');assert.equal(ui.application.activeGhosts.length,0);
  assert.equal(ui.nodes.get('challenge-roster').children.length,0,'cancelled match never supplies an old roster');
  if(action==='setup-manual'){
    assert.equal(ui.nodes.get('race-setup-dialog').open,true);
    assert.equal(ui.nodes.get('challenge-setup').hidden,true);assert.equal(ui.nodes.get('manual-ghost-setup').hidden,false);
    assert.equal(ui.nodes.get('setup-launch').disabled,false,'manual launch is independent of the cancelled automatic request');
  }else assert.equal(ui.nodes.get('race-setup-dialog').open,false);
});

test('empty and partial matches stay concise while connection failures retain retry and free timing',async t=>{
  let fail=false;
  const fixture=challengeFixture(1);fixture.board=[];
  const fetchFixture=challengeFetch(fixture);
  const ui=await loadCoastUI(t,{fetchImpl:async url=>fail&&url.includes('/api/laps')?{ok:false,status:503}:fetchFixture(url)});
  ui.modeButtons.find(button=>button.dataset.mode==='ai').click();
  ui.click('start');await ui.flush();
  assert.equal(ui.nodes.get('setup-launch').disabled,false);assert.equal(ui.nodes.get('setup-launch').textContent,'确认发车');
  assert.equal(ui.nodes.get('challenge-status').textContent,'');assert.equal(ui.nodes.get('challenge-status').hidden,true);
  assert.equal(ui.nodes.get('challenge-retry').hidden,true);assert.equal(ui.nodes.get('challenge-shortfall').hidden,true);
  ui.click('setup-close');fail=true;ui.click('start');await ui.flush();
  assert.match(ui.nodes.get('challenge-status').textContent,/暂时无法连接/);
  assert.equal(ui.nodes.get('challenge-status').hidden,false);assert.equal(ui.nodes.get('challenge-retry').hidden,false);
  assert.equal(ui.nodes.get('setup-launch').disabled,false);
  fail=false;fixture.board=fixture.entries;ui.click('challenge-retry');await ui.flush();
  assert.equal(ui.application.challengeSetup.humanCount,3);assert.equal(ui.nodes.get('setup-launch').textContent,'开始挑战');
  assert.equal(ui.nodes.get('challenge-status').hidden,true);assert.equal(ui.nodes.get('challenge-retry').hidden,true);
  ui.click('setup-close');fixture.board=fixture.entries.slice(0,1);ui.click('start');await ui.flush();
  assert.equal(ui.application.challengeSetup.humanCount,1);
  assert.equal(ui.nodes.get('challenge-status').textContent,'');assert.equal(ui.nodes.get('challenge-status').hidden,true);
  assert.equal(ui.nodes.get('challenge-shortfall').hidden,true);assert.equal(ui.nodes.get('challenge-retry').hidden,true);
});

for (const player of [1, 2]) test(`player ${player} sees a cancellable final-three-second off-road warning and automatic recovery`, async t => {
  const ui = await loadCoastUI(t);
  ui.launch(); ui.advance(3.1);
  const car=ui.engine.cars[player-1],sign=Math.sign(car._lane);
  const accelerate = player === 1 ? 'KeyW' : 'ArrowUp';
  ui.key(accelerate); ui.advance(1); ui.keyup(accelerate);
  assert.equal(car._started, true, 'off-road recovery is exercised after a valid forward start');
  car.speed = 0;
  const station=projectTrack(car.x,car.y).s;
  const moveToLane=lane=>{
    const from=projectTrack(car.x,car.y).offset,steps=Math.ceil(Math.abs(lane-from)/5);
    for(let i=1;i<=steps;i++){
      const p=trackPoint(station,from+(lane-from)*i/steps);
      Object.assign(car,{x:p.x,y:p.y,angle:p.angle,speed:0});ui.frame(1/120);
    }
  };
  const warning=ui.nodes.get('offroad-warning'+player),label=ui.nodes.get('offroad-countdown'+player);
  moveToLane(sign*135);ui.advance(3.8-car.offroadTime);
  assert.equal(warning.classList.contains('hidden'),true);
  for(const [time,seconds]of [[4.05,3],[5.05,2],[6.05,1]]){
    ui.advance(time-car.offroadTime);
    assert.equal(warning.classList.contains('hidden'),false);
    assert.equal(label.textContent,`请返回赛道，${seconds} 秒后自动复位`);
  }
  ui.click('pause');ui.frame();const pausedTime=car.offroadTime;ui.advance(2);
  assert.equal(car.offroadTime,pausedTime);assert.equal(warning.classList.contains('hidden'),true);
  ui.click('resume');ui.frame();assert.equal(warning.classList.contains('hidden'),false);
  moveToLane(car._lane);
  assert.equal(car.offroadTime,0);assert.equal(car.rescueCount,0);
  assert.equal(warning.classList.contains('hidden'),true,'returning before seven seconds cancels the warning');
  moveToLane(sign*135);ui.advance(4.05-car.offroadTime);
  assert.equal(label.textContent,'请返回赛道，3 秒后自动复位','a second departure gets a fresh grace period');
  const resets=ui.renderer.resetCalls.length;
  ui.advance(7.02-car.offroadTime);
  assert.equal(car.rescueCount,1);assert.equal(car.rescueReason,'offroad');assert.equal(car.offroadTime,0);
  assert.ok(car.rescueCooldown>1.9);assert.equal(warning.classList.contains('hidden'),true);
  assert.equal(ui.renderer.resetCalls.length,resets+1);
  assert.equal(ui.renderer.resetCalls.at(-1).playerId,player,'only the recovered player camera snaps back');
  assert.equal(ui.nodes.get('offroad'+player).textContent,'返回赛道 · 罚停中');
});

test('a millisecond tie keeps the player in the same place in the live HUD and final results',async t=>{
  const fixture=challengeFixture(1),ui=await loadCoastUI(t,{fetchImpl:challengeFetch(fixture)});
  ui.modeButtons.find(button=>button.dataset.mode==='ai').click();
  await ui.launchPrepared();ui.advance(3.1);
  const car=ui.engine.cars[0];
  Object.assign(car,{finished:true,_started:true,lap:1,finishTime:42.6,lastLap:42,bestLap:42,speed:0,progress:1});
  ui.engine.time=42.6;ui.frame();await ui.flush();
  assert.ok(ui.application.activeGhosts.every(ghost=>ghost.replay.durationMs>=car.lastLap*1000));
  assert.equal(ui.nodes.get('position-place1').textContent,1);
  assert.equal(ui.nodes.get('winner-name').textContent,'第 1 名 · 挑战完成');
  const ranked=ui.nodes.get('challenge-results-list').children;
  assert.ok(ranked[0].className.includes('is-you'));
  assert.equal(ranked[1].children[1].textContent,'Alice','the player remains ahead of the equally timed human ghost');
});
