import test from 'node:test';
import assert from 'node:assert/strict';
import { GhostClient, GHOST_VERSION, validGhostReplay } from '../src/ghost-client.js';
import { RACE_GHOST_VERSION, ghostVersionForCity } from '../src/ghost-replay.js';

class Classes {
  constructor() { this.names = new Set(); }
  add(...names) { names.forEach(name => this.names.add(name)); }
  remove(...names) { names.forEach(name => this.names.delete(name)); }
  contains(name) { return this.names.has(name); }
  toggle(name, force) {
    const on = force === undefined ? !this.names.has(name) : !!force;
    if (on) this.names.add(name); else this.names.delete(name);
    return on;
  }
}

class Node {
  constructor(tagName, document) {
    this.tagName = tagName.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.listeners = new Map(); this.attributes = new Map();
    this.classList = new Classes(); this.style = {}; this.dataset = {};
    this.value = ''; this._text = ''; this.disabled = false; this.hidden = false;
    this.open = false; this.showCount = 0;
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent || '').join(''); }
  set innerHTML(value) { this.ownerDocument.htmlWrites.push(String(value)); this._text = ''; this.children = []; }
  get innerHTML() { return ''; }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(typeof child === 'string' ? this.ownerDocument.createTextNode(child) : child)); }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(handler);
  }
  removeEventListener(name, handler) {
    this.listeners.set(name, (this.listeners.get(name) || []).filter(value => value !== handler));
  }
  async dispatch(name, values = {}) {
    const event = { target: this, currentTarget: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...values };
    await Promise.all((this.listeners.get(name) || []).map(handler => handler(event)));
    await flush();
    return event;
  }
  focus() { this.ownerDocument.activeElement = this; }
  showModal() { this.open = true; this.showCount++; }
  close() { this.open = false; }
  checkValidity() { return this.value.trim().length > 0; }
  reportValidity() { return this.checkValidity(); }
  reset() { this.ownerDocument.getElementById('record-name').value = ''; }
}

const IDS = ['ghost-enabled', 'ghost-search-form', 'ghost-name', 'ghost-search', 'ghost-choice', 'ghost-load', 'ghost-status',
  'lap-list', 'lap-status', 'lap-retry', 'ghost-results', 'ghost-result-list',
  'ghost-slot-0', 'ghost-slot-1', 'ghost-slot-label-0', 'ghost-slot-label-1', 'ghost-remove-0', 'ghost-remove-1',
  'ghost-picker-list', 'ghost-picker-status', 'ghost-picker-retry', 'ghost-picker-title'];
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const entry = (name = '月亮', id = 'record-one', timeMs = 42000) => ({ name, id, timeMs, playerId: 1, mode: 'local', createdAt: 1 });
const replay = (durationMs = 42000) => ({ version: 1, durationMs, frames: [[0, 1, 2, 0, 3], [durationMs, 1, 2, 0, 3]] });
const payload = extra => ({ city: 'coast', version: GHOST_VERSION, entries: [], ...extra });
const response = (extra, status = 200) => ({ ok: status < 400, status, json: async () => payload(extra) });
function setup(timeoutMs = 20000) {
  const nodes = new Map(), queue = [], requests = [], memory = new Map();
  const document = { htmlWrites: [], getElementById: id => nodes.get(id), createElement: tag => new Node(tag, document),
    createTextNode: text => ({ textContent: text }) };
  for (const id of IDS) { const node = new Node('div', document); node.id = id; nodes.set(id, node); }
  const pickerState = new Node('div', document);
  pickerState.append(nodes.get('ghost-picker-status'), nodes.get('ghost-picker-retry'));
  const client = new GhostClient({ document, origin: 'https://example.test', timeoutMs,
    storage: { getItem: id => memory.get(id), setItem: (id, value) => memory.set(id, value) },
    fetchImpl: async (url, options) => {
      requests.push({ url, ...options, body: options.body ? JSON.parse(options.body) : undefined });
      assert.ok(queue.length, `unexpected request ${url}`); const next = queue.shift();
      if (next instanceof Error) throw next; return typeof next === 'function' ? next() : next;
    } });
  return { client, get: id => nodes.get(id), queue, requests, document, memory };
}
async function ready(h) { h.queue.push(response({})); await h.client.init(); }
async function search(h, name = '月亮') {
  h.get('ghost-enabled').checked = true; h.get('ghost-name').value = name;
  h.queue.push(response({ entries: [entry(name)] })); await h.client.search();
}
async function select(h) {
  await search(h); h.queue.push(response({ entry: entry(), replay: replay() })); await h.client.loadSelected();
}
test('defaults to no ghost, renders empty board, only performs reads', async () => {
  const h = setup(); await ready(h);
  assert.equal(h.get('ghost-enabled').checked, false); assert.equal(h.get('ghost-name').disabled, false);
  assert.match(h.get('lap-status').textContent, /空/); assert.ok(h.requests.every(r => r.method === 'GET'));
  assert.deepEqual(h.client.startRace(), []); assert.equal(h.get('ghost-enabled').disabled, true);
});
test('nickname lookup escapes query; remote markup remains plain text', async () => {
  const h = setup(); await ready(h); await search(h, '<b>双人</b>');
  assert.ok(h.requests[1].url.includes(encodeURIComponent('<b>双人</b>')));
  assert.ok(h.get('ghost-choice').textContent.includes('<b>')); assert.equal(h.document.htmlWrites.length, 0);
});

test('legacy full names remain searchable and selected while picker labels use twelve-character displays',async()=>{
  const h=setup(),name='abcdefghijklmnop';await ready(h);await search(h,name);
  assert.equal(new URL(h.requests.at(-1).url).searchParams.get('name'),name);
  assert.equal(h.get('ghost-name').value,name);
  assert.match(h.get('ghost-choice').textContent,/abcdefghijk…/);
  assert.equal(h.get('ghost-choice').children[0].getAttribute('title'),name);
  h.queue.push(response({entry:entry(name),replay:replay()}));await h.client.loadSelected();
  assert.equal(h.client.selected.entry.name,name);
  assert.match(h.get('ghost-slot-label-0').textContent,/abcdefghijk…/);
  h.client.renderPickerBoard([entry(name)]);
  const nickname=h.get('ghost-picker-list').children[0].children[1].children[0];
  assert.equal(nickname.textContent,'abcdefghijk…');assert.equal(nickname.getAttribute('title'),name);
});

test('ghost-only new save names cap at twelve Unicode code points without changing old remembered prefill',async()=>{
  const h=setup(),legacy='abcdefghijklmnop';await ready(h);h.memory.set('twin-turbo-ghost-name-1',legacy);
  h.client.showResults([{playerId:1,mode:'local',replay:replay()}]);const card=h.client.cards[0];
  assert.equal(card.input.value,legacy);assert.equal(h.memory.get('twin-turbo-ghost-name-1'),legacy);
  await card.input.dispatch('compositionstart');card.input.value='🚗'.repeat(14);
  await card.input.dispatch('input',{isComposing:true});assert.equal(Array.from(card.input.value).length,14);
  await card.input.dispatch('compositionend');assert.equal(card.input.value,'🚗'.repeat(12));
  h.queue.push(new Error('offline'));await h.client.save(card);
  assert.equal(h.requests.at(-1).body.name,'🚗'.repeat(12));
});
test('late loads cannot inject a ghost after start; frozen race snapshot is isolated', async () => {
  const h = setup(); await ready(h); await search(h);
  const pending = deferred(); h.queue.push(() => pending.promise); const loading = h.client.loadSelected();
  assert.deepEqual(h.client.startRace(), []); pending.resolve(response({ entry: entry(), replay: replay() })); await loading;
  assert.equal(h.client.selected, null); h.client.endRace(); await select(h);
  const [frozen] = h.client.startRace(); assert.equal(frozen.entry.name, '月亮');
  h.client.selected.replay.frames[0][1] = 999; assert.equal(frozen.replay.frames[0][1], 1);
  assert.throws(() => { frozen.replay.frames[0][1] = 123; }, TypeError);
});
test('changing nickname discards a pending search before it can load a selection', async () => {
  const h = setup(); await ready(h); h.get('ghost-enabled').checked = true; h.get('ghost-name').value = '旧名';
  const waiting = deferred(); h.queue.push(() => waiting.promise); const searching = h.client.search();
  h.get('ghost-name').value = '新名'; await h.get('ghost-name').dispatch('input');
  waiting.resolve(response({ entries: [entry('旧名')] })); await searching;
  assert.equal(h.get('ghost-choice').children.length, 0); assert.equal(h.client.selected, null);
});
test('failed search and timeout give a retryable message; category mismatch is rejected', async () => {
  const h = setup(5); await ready(h); h.get('ghost-enabled').checked = true; h.get('ghost-name').value = '月亮';
  h.queue.push(() => new Promise(() => {})); await h.client.search(); assert.match(h.get('ghost-status').textContent, /超时/);
  h.queue.push(response({ version: 'old-version' })); await h.client.search(); assert.match(h.get('ghost-status').textContent, /版本/);
  assert.equal(h.get('ghost-search').disabled, false);
});
test('save is opt-in, excludes AI, remembers names and retries identical uncertain submission', async () => {
  const h = setup(); await ready(h);
  h.client.showResults([{ playerId: 1, mode: 'ai', replay: replay() }, { playerId: 2, mode: 'ai', replay: replay() }]);
  assert.equal(h.client.cards.length, 1); assert.equal(h.requests.length, 1);
  const card = h.client.cards[0]; card.input.value = '  月亮  '; h.queue.push(new Error('offline')); await h.client.save(card);
  assert.match(card.message.textContent, /重试/); assert.equal(card.input.disabled, true);
  const submitted = h.requests[1].body; card.input.value = '不得变更';
  h.queue.push(response({ saved: true, entry: entry(), entries: [entry()] }), response({ entries: [entry()] })); await h.client.save(card);
  assert.deepEqual(h.requests[2].body, submitted); assert.equal(h.memory.get('twin-turbo-ghost-name-1'), '月亮');
  assert.equal(card.done, true); assert.match(h.get('lap-list').textContent, /月亮/);
});
test('same-name slower lap reports retained best without treating it as failure', async () => {
  const h = setup(); await ready(h); h.client.showResults([{ playerId: 2, mode: 'local', replay: replay() }]);
  const card = h.client.cards[0]; card.input.value = '月亮';
  h.queue.push(response({ saved: false, entry: entry('月亮', 'best-id', 40000), entries: [] }), response({}));
  await h.client.save(card); assert.equal(card.done, true); assert.match(card.message.textContent, /更快纪录 00:40.00/);
});
test('malformed replay cannot be selected or offered for upload', async () => {
  const h = setup(); await ready(h); await search(h);
  const bad = replay(); bad.frames[1][1] = NaN;
  h.queue.push(response({ entry: entry(), replay: bad })); await h.client.loadSelected();
  assert.equal(h.client.selected, null); assert.match(h.get('ghost-status').textContent, /不完整/);
  h.client.showResults([{ playerId: 1, mode: 'local', replay: bad }]); assert.equal(h.client.cards.length, 0);
  assert.equal(validGhostReplay({ ...replay(), durationMs: 24999 }), false);
});
test('name matching follows shared case-fold and compatibility normalization while preserving display name', async () => {
  const h = setup(); await ready(h); h.get('ghost-enabled').checked = true; h.get('ghost-name').value = 'ｅｍｅｒｙ';
  h.queue.push(response({ entries: [entry('Emery')] })); await h.client.search();
  assert.equal(h.client.matches.length, 1); assert.match(h.get('ghost-choice').textContent, /Emery/);
  h.queue.push(response({ entry: entry('EMERY'), replay: replay() })); await h.client.loadSelected();
  assert.equal(h.client.selected.entry.name, 'EMERY');
  h.client.showResults([{ playerId: 1, mode: 'local', replay: replay() }]); const card = h.client.cards[0]; card.input.value = 'emery';
  h.queue.push(response({ saved: false, entry: entry('Emery', 'existing', 40000) }), response({}));
  await h.client.save(card); assert.equal(card.done, true);
});


test('managed records mode opens a colour choice without loading or overwriting a ghost', async () => {
  const h=setup(); h.client.recordsManaged=true;
  for (const id of ['lap-list','lap-status','lap-retry','ghost-results','ghost-result-list']) {
    const original=h.document.getElementById;
    h.document.getElementById=key=>{assert.notEqual(key,id,'unified mode does not access obsolete records UI');return original(key);};
  }
  await h.client.init(); assert.equal(h.requests.length,0);
  const chosen=await h.client.challenge(entry());
  assert.equal(chosen.name,'月亮'); assert.equal(h.client.selections().length,0);
  assert.equal(h.get('ghost-enabled').checked,true); assert.equal(h.get('ghost-name').value,'月亮');
  assert.equal(h.requests.length,0,'challenging a row only prepares the colour chooser');
  h.client.selectSlot(1); assert.equal(h.get('ghost-name').value,'月亮');
  assert.match(h.get('ghost-load').textContent,/金色/);
  h.queue.push(response({entry:entry(),replay:replay()})); await h.client.loadSelected();
  assert.equal(h.requests.length,1); assert.equal(h.client.slots[0],null);
  assert.equal(h.client.startRace()[0].slotId,1);
  assert.equal(await h.client.challenge(entry('另一个')),null);
  assert.equal(h.requests.length,1,'challenge stays locked during a race');
  h.client.menu(); assert.equal(h.client.locked,false);
});

async function addSlot(h, slotId, name, id, timeMs=42000) {
  h.client.selectSlot(slotId); h.client.challenge(entry(name,id,timeMs));
  h.queue.push(response({entry:entry(name,id,timeMs),replay:replay(timeMs)})); await h.client.loadSelected();
}

test('two named ghosts use different fixed colours and start as immutable independent snapshots', async () => {
  const h=setup(); await ready(h);
  await addSlot(h,0,'紫车手','purple-id',42000); await addSlot(h,1,'金车手','gold-id',44000);
  assert.equal(h.client.selections().length,2);
  assert.match(h.get('ghost-slot-label-0').textContent,/紫车手/); assert.match(h.get('ghost-slot-label-1').textContent,/金车手/);
  const ghosts=h.client.startRace(); assert.equal(ghosts.length,2);
  assert.deepEqual(ghosts.map(ghost=>ghost.color),['#b8a2ed','#ffd166']);
  assert.deepEqual(ghosts.map(ghost=>ghost.entry.id),['purple-id','gold-id']);
  h.client.slots[0].replay.frames[0][1]=123; assert.equal(ghosts[0].replay.frames[0][1],1);
  assert.throws(()=>{ghosts.push(null);},TypeError);
  assert.throws(()=>{ghosts[1].replay.frames[0][1]=123;},TypeError);
  h.client.selectSlot(0); h.client.removeSlot(1); assert.equal(h.client.activeSlot,1); assert.equal(h.client.selections().length,2);
});

test('parallel slot searches and replay loads stay with their original colour despite late responses', async () => {
  const h=setup(); await ready(h); const purpleSearch=deferred(), purpleLoad=deferred();
  h.client.selectSlot(0); h.get('ghost-name').value='紫车手'; h.queue.push(()=>purpleSearch.promise); const finding=h.client.search();
  h.client.selectSlot(1); h.get('ghost-name').value='金车手'; h.queue.push(response({entries:[entry('金车手','gold-id')]})); await h.client.search();
  purpleSearch.resolve(response({entries:[entry('紫车手','purple-id')]})); await finding;
  assert.equal(h.get('ghost-name').value,'金车手'); assert.equal(h.get('ghost-choice').value,'gold-id');
  h.client.selectSlot(0); h.queue.push(()=>purpleLoad.promise); const loading=h.client.loadSelected();
  h.client.selectSlot(1); h.queue.push(response({entry:entry('金车手','gold-id'),replay:replay()})); await h.client.loadSelected();
  purpleLoad.resolve(response({entry:entry('紫车手','purple-id'),replay:replay()})); await loading;
  assert.deepEqual(h.client.slots.map(ghost=>ghost.entry.id),['purple-id','gold-id']);
  assert.equal(h.get('ghost-name').value,'金车手'); assert.match(h.get('ghost-status').textContent,/金色已就绪/);
});

test('failed replacement preserves an existing ghost, and removing one slot leaves the other untouched', async () => {
  const h=setup(); await ready(h); await addSlot(h,0,'原紫','original'); await addSlot(h,1,'原金','other');
  h.client.selectSlot(0); h.client.challenge(entry('新紫','replacement')); assert.equal(h.client.slots[0].entry.id,'original');
  h.queue.push(new Error('offline')); await h.client.loadSelected(); assert.equal(h.client.slots[0].entry.id,'original');
  h.client.removeSlot(0); assert.equal(h.client.slots[0],null); assert.equal(h.client.slots[1].entry.id,'other');
  assert.equal(h.client.startRace()[0].slotId,1);
});

test('removal and starting a race invalidate every pending load without reviving a removed colour', async () => {
  const h=setup(); await ready(h); const wait0=deferred(),wait1=deferred();
  h.client.selectSlot(0); h.client.challenge(entry('紫','purple')); h.queue.push(()=>wait0.promise); const load0=h.client.loadSelected();
  h.client.selectSlot(1); h.client.challenge(entry('金','gold')); h.queue.push(()=>wait1.promise); const load1=h.client.loadSelected();
  h.client.removeSlot(0); assert.deepEqual(h.client.startRace(),[]);
  wait0.resolve(response({entry:entry('紫','purple'),replay:replay()})); wait1.resolve(response({entry:entry('金','gold'),replay:replay()}));
  await Promise.all([load0,load1]); assert.equal(h.client.selections().length,0);
  assert.equal(h.get('ghost-slot-0').disabled,true); assert.equal(h.get('ghost-slot-1').disabled,true);
});

test('turning ghosts off starts without them and preserves the chosen colours for a later race', async () => {
  const h=setup(); await ready(h); await addSlot(h,0,'紫','purple'); await addSlot(h,1,'金','gold');
  h.get('ghost-enabled').checked=false; await h.get('ghost-enabled').dispatch('change');
  assert.deepEqual(h.client.startRace(),[]); assert.equal(h.client.selections().length,2);
  h.client.menu(); h.get('ghost-enabled').checked=true; await h.get('ghost-enabled').dispatch('change');
  assert.equal(h.client.startRace().length,2);
});

const raceEntry = (name = '三圈车手', id = 'race-record', timeMs = 126000) => ({ ...entry(name, id, timeMs), kind: 'race', laps: 3 });
const raceReplay = () => ({ version: 1, kind: 'race', laps: 3, durationMs: 126000, lapEndsMs: [42000, 84000, 126000],
  frames: Array.from({ length: 1261 }, (_, i) => [i * 100, 1, 2, 0, 3]) });
const raceResponse = extra => response({ ...extra, version: RACE_GHOST_VERSION });

test('personal ghost search is immediately available and opting to search enables ghosts', async () => {
  const h = setup(); h.client.recordsManaged = true; await h.client.init();
  assert.equal(h.get('ghost-name').disabled, false); assert.equal(h.get('ghost-search').disabled, false);
  h.get('ghost-name').value = '自己的名字'; h.queue.push(response({ entries: [entry('自己的名字')] }));
  await h.get('ghost-search-form').dispatch('submit');
  assert.equal(h.get('ghost-enabled').checked, true); assert.equal(h.client.matches.length, 1);
  assert.equal(h.get('ghost-load').hidden, false);
});

test('pre-race board selects each nickname’s fastest replay while preserving both colored challenges', async () => {
  const h = setup(); h.client.recordsManaged = true; await h.client.init();
  h.queue.push(response({ entries: [entry('较慢', 'slow', 44000), entry('<b>最快</b>', 'fast', 40000),
    entry('较慢', 'duplicate', 45000), entry('较慢', 'slow', 44000), raceEntry(), { ...entry('AI'), mode: 'ai', playerId: 2 }] }));
  await h.client.openPicker(1);
  assert.match(h.requests[0].url, /coast-ghost-v1/);
  assert.equal(h.get('ghost-picker-list').children.length, 2); assert.equal(h.client.pickerButtons.length, 4);
  assert.equal(h.client.pickerButtons[0].entry.name, '<b>最快</b>'); assert.equal(h.document.htmlWrites.length, 0);
  assert.equal(h.get('ghost-picker-status').textContent, '');
  assert.equal(h.get('ghost-picker-status').parentElement.hidden, true);
  h.queue.push(response({ entry: entry('<b>最快</b>', 'fast', 40000), replay: replay(40000) }));
  await h.client.pickerButtons[0].button.dispatch('click');
  h.queue.push(response({ entry: entry('较慢', 'slow', 44000), replay: replay(44000) }));
  await h.client.pickerButtons[3].button.dispatch('click');
  assert.deepEqual(h.client.selections().map(value => value.entry.id), ['fast', 'slow']);
  assert.equal(h.client.pickerButtons[0].button.getAttribute('aria-pressed'), 'true');
  assert.equal(h.client.pickerButtons[3].button.getAttribute('aria-pressed'), 'true');
  await h.client.pickerButtons[0].button.dispatch('click');
  assert.equal(h.client.slots[0], null); assert.equal(h.client.slots[1].entry.id, 'slow');
});

test('ranked board failure can retry to an empty board without preventing a race', async () => {
  const h = setup(); h.client.recordsManaged = true; await h.client.init();
  h.client.renderPickerBoard([entry()]);
  assert.equal(h.get('ghost-picker-status').parentElement.hidden, true);
  h.queue.push(new Error('offline')); await h.client.openPicker(1);
  assert.equal(h.get('ghost-picker-status').parentElement.hidden, false);
  assert.equal(h.get('ghost-picker-retry').hidden, false); assert.match(h.get('ghost-picker-status').textContent, /直接出发/);
  h.queue.push(response({ entries: [] })); await h.get('ghost-picker-retry').dispatch('click');
  assert.equal(h.get('ghost-picker-retry').hidden, true); assert.match(h.get('ghost-picker-status').textContent, /还没有/);
  assert.equal(h.get('ghost-picker-status').parentElement.hidden, false);
  assert.deepEqual(h.client.startRace(), []);
});

test('picker always uses single-lap records and rejects retired three-lap challenges', async () => {
  const h = setup(); h.client.recordsManaged = true; await h.client.init();
  h.client.setLaps(3); assert.equal(h.client.laps, 1);
  h.queue.push(response({ entries: [entry(), raceEntry()] })); await h.client.openPicker(3);
  assert.match(h.requests[0].url, /version=coast-ghost-v1/);
  assert.doesNotMatch(h.requests[0].url, /race-ghost/);
  assert.match(h.get('ghost-picker-title').textContent, /最快单圈/);
  assert.equal(h.client.pickerButtons.length, 2); assert.equal(h.client.challenge(raceEntry()), null);
  h.client.select({ entry: raceEntry(), replay: raceReplay() }); assert.equal(h.client.selections().length, 0);
  h.queue.push(response({ entry: entry(), replay: replay() }));
  await h.client.pickerButtons[1].button.dispatch('click');
  const [ghost] = h.client.startRace(); assert.equal(ghost.replay.kind, undefined); assert.equal(ghost.replay.lapEndsMs, undefined);
  assert.equal(h.client.laps, 1);
});

test('changing map clears incompatible ghosts and invalidates late search and board responses', async () => {
  const h = setup(); h.client.recordsManaged = true; await h.client.init(); await addSlot(h, 0, '单圈', 'lap');
  const slowSearch = deferred(), slowBoard = deferred(); h.get('ghost-name').value = '旧查询';
  h.queue.push(() => slowSearch.promise, () => slowBoard.promise);
  const searchPromise = h.client.search(), boardPromise = h.client.openPicker(1); await flush();
  h.client.setTrack('coast-ridge');
  h.queue.push(response({ city:'coast-ridge', entries:[entry('山道','ridge-record')] })); await h.client.openPicker();
  assert.equal(h.client.selections().length, 0); assert.equal(h.client.matches.length, 0);
  slowSearch.resolve(response({ entries: [entry('旧查询')] })); slowBoard.resolve(response({ entries: [entry('旧榜')] }));
  await Promise.all([searchPromise, boardPromise]);
  assert.equal(h.client.matches.length, 0); assert.equal(h.client.pickerButtons.length, 2);
  assert.equal(h.client.pickerButtons[0].entry.id, 'ridge-record'); assert.doesNotMatch(h.get('ghost-picker-list').textContent, /旧榜/);
});

test('late replay cannot fill a slot on a changed map and race-shaped telemetry is rejected', async () => {
  const h = setup(); h.client.recordsManaged = true; await h.client.init(); await search(h);
  const pending = deferred(); h.queue.push(() => pending.promise); const oldLoad = h.client.loadSelected(); await flush();
  h.client.setTrack('coast-ridge'); pending.resolve(response({ entry: entry(), replay: replay() })); await oldLoad;
  assert.equal(h.client.selections().length, 0);
  h.client.setTrack('coast'); h.client.challenge(entry());
  h.queue.push(response({ entry: entry(), replay: raceReplay() })); await h.client.loadSelected();
  assert.equal(h.client.selections().length, 0); assert.match(h.get('ghost-status').textContent, /不完整/);
  assert.equal(validGhostReplay(raceReplay()), false);
  assert.equal(validGhostReplay({ ...replay(), lapEndsMs: [14000, 28000, 42000] }), false);
});

test('late board response cannot update an active race', async () => {
  const h = setup(); h.client.recordsManaged = true; await h.client.init();
  const pending = deferred(); h.queue.push(() => pending.promise); const load = h.client.openPicker(1);
  h.client.startRace(); pending.resolve(response({ entries: [entry()] })); await load;
  assert.equal(h.client.pickerButtons.length, 0); assert.equal(h.get('ghost-picker-list').children.length, 0);
});

test('changing track clears prior ghosts and rejects late search and ranked-board responses from the old map', async () => {
  const h = setup(); h.client.recordsManaged = true; await h.client.init(); await addSlot(h, 0, '海港车手', 'coast-ghost');
  const pending = deferred(); h.queue.push(() => pending.promise); const load = h.client.openPicker(1); await flush();
  h.client.setTrack('coast-ridge'); assert.equal(h.client.selections().length, 0);
  h.queue.push(response({ city: 'coast-ridge', entries: [entry('山道车手', 'ridge-ghost')] })); await h.client.openPicker(1);
  pending.resolve(response({ entries: [entry('旧海港车手', 'old-coast')] })); await load;
  assert.equal(h.client.pickerButtons[0].entry.id, 'ridge-ghost'); assert.match(h.requests.at(-1).url, /city=coast-ridge/);
  h.queue.push(response({ city: 'coast', entry: entry('山道车手', 'ridge-ghost'), replay: replay() }));
  await h.client.pickerButtons[0].button.dispatch('click');
  assert.equal(h.client.selections().length, 0); assert.match(h.get('ghost-status').textContent, /版本/);
  h.client.startRace(); h.client.setTrack('coast'); assert.equal(h.client.city, 'coast-ridge');
});

test('Beijing, Austin, Rio, Paris and Shanghai each load only their own single-lap challengers', async () => {
  const h = setup(); h.client.recordsManaged = true; await h.client.init();
  for(const city of ['coast-beijing','coast-austin','coast-rio','coast-paris','coast-shanghai'])for(const laps of [1]) {
    h.client.setTrack(city);assert.equal(h.client.city,city);
    const version=city==='coast-shanghai'?(laps===3?'coast-race-ghost-v3':'coast-ghost-v3'):['coast-austin','coast-beijing'].includes(city)?(laps===3?'coast-race-ghost-v2':'coast-ghost-v2'):(laps===3?RACE_GHOST_VERSION:GHOST_VERSION);
    const value=laps===1?entry('城市车手',`${city}-lap`):raceEntry('城市车手',`${city}-race`);
    h.queue.push(response({city,version,entries:[value]}));
    await h.client.openPicker(laps);assert.match(h.requests.at(-1).url,new RegExp(`city=${city}`));
    assert.equal(h.client.pickerButtons.length,2);assert.equal(h.client.pickerButtons[0].entry.id,value.id);
    h.queue.push(response({city,version,entry:value,replay:laps===1?replay():raceReplay()}));
    await h.client.pickerButtons[0].button.dispatch('click');assert.equal(h.client.selections()[0].entry.id,value.id);
    h.client.endRace();
  }
});


test('only revised Austin, Shanghai and Beijing use new lap/race versions',()=>{
  for(const city of ['coast','coast-london','coast-rio','coast-paris']) {
    assert.equal(ghostVersionForCity(city,1),GHOST_VERSION);assert.equal(ghostVersionForCity(city,3),RACE_GHOST_VERSION);
  }
  for(const city of ['coast-austin','coast-shanghai','coast-beijing']) {
    const v=city==='coast-shanghai'?3:2;assert.equal(ghostVersionForCity(city,1),`coast-ghost-v${v}`);assert.equal(ghostVersionForCity(city,3),`coast-race-ghost-v${v}`);
  }
});

for(const city of ['coast-austin','coast-shanghai','coast-beijing'])for(const laps of [1])test(`${city} ${laps}-lap picker rejects old paths and lets a normalized nickname select all twenty retained ghosts`,async()=>{
  const h=setup();h.client.recordsManaged=true;await h.client.init();h.client.setTrack(city);h.client.setLaps(laps);
  const v=city==='coast-shanghai'?3:2,version=laps===3?`coast-race-ghost-v${v}`:`coast-ghost-v${v}`,oldVersion=laps===3?RACE_GHOST_VERSION:GHOST_VERSION;
  const values=Array.from({length:21},(_,i)=>laps===3?raceEntry('Alice',`retained-${i}`,126000+i*1000):entry('Alice',`retained-${i}`,42000+i*1000));
  h.queue.push(response({city,version:oldVersion,entries:values}));await h.client.openPicker(laps);
  assert.equal(h.client.pickerButtons.length,0);assert.match(h.get('ghost-picker-status').textContent,/版本/);
  h.get('ghost-name').value='Ａlice';h.queue.push(response({city,version:oldVersion,entries:values}));await h.client.search();
  assert.equal(h.client.matches.length,0);assert.match(h.get('ghost-status').textContent,/版本/);
  h.queue.push(response({city,version,entries:values}));await h.client.search();
  assert.equal(new URL(h.requests.at(-1).url).searchParams.get('version'),version);
  assert.equal(h.client.matches.length,20);assert.equal(h.get('ghost-choice').children.length,20);
  h.get('ghost-choice').value=values[19].id;
  const duration=values[19].timeMs,lapReplay=replay(duration),fullReplay={...raceReplay(),durationMs:duration,lapEndsMs:[42000,84000,duration],frames:Array.from({length:Math.floor(duration/100)+1},(_,i)=>[i*100,1,2,0,3])};
  h.queue.push(response({city,version:oldVersion,entry:values[19],replay:laps===3?fullReplay:lapReplay}));await h.client.loadSelected();
  assert.equal(h.client.selections().length,0);assert.match(h.get('ghost-status').textContent,/版本/);
  h.queue.push(response({city,version,entry:values[19],replay:laps===3?fullReplay:lapReplay}));await h.client.loadSelected();
  assert.equal(h.client.selections()[0]?.entry.id,values[19].id,'twentieth result is actually loadable, not just displayed');
});


test('single-lap ghost leaderboards fill five unique normalized names without reducing personal search', async () => {
  for (const laps of [1]) {
    const h = setup(); h.client.recordsManaged = true; await h.client.init();
    const make = laps === 3 ? raceEntry : entry, baseTime = laps === 3 ? 126000 : 42000;
    const values = ['ＡＬＩＣＥ', 'Alice', 'Bob', 'Carol', 'Dora', 'Eve', 'Fred'].map((name, index) => make(name, `public-${index}`, baseTime + index * 1000));
    h.queue.push((laps === 3 ? raceResponse : response)({ entries: values })); await h.client.openPicker(laps);
    const chosen = h.client.pickerButtons.filter((_, i) => i % 2 === 0).map(item => item.entry);
    assert.deepEqual(chosen.map(item => item.name), ['ＡＬＩＣＥ', 'Bob', 'Carol', 'Dora', 'Eve']);
    assert.equal(h.get('ghost-picker-list').children.length, 5);
    assert.equal(chosen[0].id, 'public-0');
  }
});
