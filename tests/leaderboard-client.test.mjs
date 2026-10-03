import test from 'node:test';
import assert from 'node:assert/strict';
import { LeaderboardClient } from '../leaderboard-client.js';
import { LEADERBOARD_VERSION } from '../leaderboard.js';

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

const IDS = ['leaderboard-list', 'leaderboard-status', 'leaderboard-retry', 'board-3', 'board-5',
  'record-dialog', 'record-form', 'record-name', 'record-name-count', 'record-submit', 'record-skip',
  'record-message', 'record-title', 'record-result-status', 'qualify-retry'];
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const entry = (id = 'first', name = '第一位', laps = 3, timeMs = 125000) =>
  ({ id, name, laps, timeMs, mode: 'local', playerId: 1, createdAt: 1770000000000 });
const finish = (options = {}) => ({ finished: true, laps: 3, timeMs: 123456, playerId: 1, mode: 'local', ...options });
const board = (entries = [], laps = 3) => ({ entries, laps, version: LEADERBOARD_VERSION });
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status,
  json: async () => body, text: async () => JSON.stringify(body) });

function setup({ timeoutMs = 8000 } = {}) {
  const nodes = new Map();
  const document = { htmlWrites: [], activeElement: null,
    getElementById: id => { assert.ok(nodes.has(id), `existing DOM ID: ${id}`); return nodes.get(id); },
    createElement: tag => new Node(tag, document),
    createTextNode: text => ({ textContent: text }),
  };
  for (const id of IDS) {
    const node = new Node(id === 'record-dialog' ? 'dialog' : id === 'record-name' ? 'input' : 'div', document);
    node.id = id; nodes.set(id, node);
  }
  document.body = new Node('body', document);
  const requests = [], queue = [];
  const fetchImpl = async (url, options = {}) => {
    const request = { url: String(url), ...options, body: options.body ? JSON.parse(options.body) : undefined };
    requests.push(request);
    assert.ok(queue.length, `Unexpected fetch: ${request.method || 'GET'} ${request.url}`);
    const next = queue.shift();
    if (typeof next === 'function') return next(request);
    if (next instanceof Error) throw next;
    return next;
  };
  const client = new LeaderboardClient({ document, fetchImpl, origin: 'https://scores.example.test', timeoutMs });
  const get = id => nodes.get(id);
  const text = () => [...nodes.values()].map(node => node.textContent).join('\n');
  const records = () => requests.filter(request => request.method === 'POST' && /records/.test(request.url));
  const qualifies = () => requests.filter(request => /qualify/.test(request.url));
  return { client, document, get, text, requests, queue, records, qualifies };
}

async function ready(harness, entries = []) {
  harness.queue.push(response(board(entries)));
  await harness.client.init();
}

async function qualifying(harness, result = finish()) {
  harness.queue.push(response({ qualifies: true, rank: 1, entries: [] }));
  await harness.client.considerResult(result);
  assert.equal(harness.get('record-dialog').open, true);
}

test('initial load exposes loading and then an understandable empty shared board', async () => {
  const h = setup(), waiting = deferred();
  h.queue.push(() => waiting.promise);
  const initialization = h.client.init();
  assert.match(h.text(), /加载|读取|连接/);
  waiting.resolve(response(board()));
  await initialization;
  assert.match(h.text(), /暂无|还没有|没有成绩|第一|空/);
  assert.equal(h.get('record-dialog').open, false);
});

test('a failed board load offers a retry and can recover without restarting the game', async () => {
  const h = setup(); h.queue.push(new Error('offline'));
  await h.client.init();
  assert.match(h.text(), /失败|网络|连接|重试/);
  h.queue.push(response(board([entry()])));
  await h.get('leaderboard-retry').dispatch('click');
  assert.equal(h.requests.length, 2);
  assert.match(h.get('leaderboard-list').textContent, /第一位/);
});

test('remote nicknames render as text and cannot become HTML', async () => {
  const h = setup(), nickname = '<img src=x onerror=alert(1)>';
  await ready(h, [entry('markup', nickname)]);
  assert.ok(h.get('leaderboard-list').textContent.includes('<img'));
  assert.ok(h.document.htmlWrites.every(value => !value.includes('<img')));
});

test('qualification is checked online with the current rules version before prompting', async () => {
  const h = setup(); await ready(h);
  await qualifying(h);
  assert.equal(h.qualifies().length, 1);
  assert.equal(h.qualifies()[0].body.version, LEADERBOARD_VERSION);
  assert.equal(h.records().length, 0);
  assert.equal(h.client.busyDialog, true);
});

test('failed qualification preserves the finish and retries only when requested', async () => {
  const h = setup(); await ready(h);
  h.queue.push(new Error('offline'));
  await h.client.considerResult(finish());
  assert.equal(h.get('record-dialog').open, false);
  assert.equal(h.get('qualify-retry').classList.contains('hidden'), false);
  assert.equal(h.records().length, 0);
  h.queue.push(response({ rank: 2, entries: [] }));
  await h.get('qualify-retry').dispatch('click');
  assert.equal(h.qualifies().length, 2);
  assert.deepEqual(h.qualifies()[1].body, h.qualifies()[0].body);
  assert.equal(h.get('record-dialog').open, true);
});

test('unqualified finishes and AI opponents never open the record dialog', async () => {
  const h = setup(); await ready(h);
  await h.client.considerResult(finish({ mode: 'ai', playerId: 2 }));
  await h.client.considerResult(finish({ finished: false }));
  assert.equal(h.qualifies().length, 0);
  h.queue.push(response({ qualifies: false, rank: null, entries: [] }));
  await h.client.considerResult(finish());
  assert.equal(h.get('record-dialog').open, false);
  assert.equal(h.records().length, 0);
});

test('the name field enforces sixteen Unicode code points and empty names are not posted', async () => {
  const h = setup(); await ready(h); await qualifying(h);
  const field = h.get('record-name');
  field.value = '😀'.repeat(20);
  await field.dispatch('input');
  assert.equal(Array.from(field.value).length, 16);
  assert.match(h.get('record-name-count').textContent, /16/);
  field.value = ' \u0000 ';
  await h.client.save();
  assert.equal(h.records().length, 0);
  assert.equal(h.get('record-dialog').open, true);
});

test('IME composition is not truncated or submitted before confirmation, and the form submits afterward', async () => {
  const h = setup(); await ready(h); await qualifying(h);
  const field = h.get('record-name');
  await field.dispatch('compositionstart');
  field.value = '赛车'.repeat(10);
  await field.dispatch('input', { isComposing: true });
  assert.equal(Array.from(field.value).length, 20);
  const composingSubmit = await h.get('record-form').dispatch('submit');
  assert.equal(composingSubmit.defaultPrevented, true);
  assert.equal(h.records().length, 0);
  await field.dispatch('compositionend');
  assert.equal(Array.from(field.value).length, 16);
  h.queue.push(request => response({ saved: true, rank: 1, entries: [entry(request.body.id, request.body.name)] }),
    response(board([entry('saved-ime', field.value)])));
  await h.get('record-form').dispatch('submit');
  assert.equal(h.records().length, 1);
  assert.equal(h.records()[0].body.name, '赛车'.repeat(8));
  assert.equal(h.get('record-dialog').open, false);
});

test('skip and native dialog cancellation never submit a score', async () => {
  const h = setup(); await ready(h); await qualifying(h);
  h.client.skip();
  assert.equal(h.get('record-dialog').open, false);
  assert.equal(h.records().length, 0);
  h.client.newRace(); await qualifying(h);
  await h.get('record-dialog').dispatch('cancel');
  assert.equal(h.get('record-dialog').open, false);
  assert.equal(h.records().length, 0);
});

test('a failed submission keeps its name and ID for retry and never claims success', async () => {
  const h = setup(); await ready(h); await qualifying(h);
  h.get('record-name').value = '小赛车手';
  h.queue.push(new Error('offline'));
  await h.client.save();
  assert.equal(h.records().length, 1);
  const first = h.records()[0].body;
  assert.ok(typeof first.id === 'string' && first.id.length > 0);
  assert.equal(h.get('record-name').value, '小赛车手');
  assert.equal(h.get('record-dialog').open, true);
  assert.match(h.text(), /失败|重试|未保存|网络/);
  h.queue.push(response({ saved: true, rank: 1, entries: [entry(first.id, '小赛车手', 3, 123456)] }),
    response(board([entry(first.id, '小赛车手', 3, 123456)])));
  await h.client.save();
  assert.equal(h.records().length, 2);
  assert.equal(h.records()[1].body.id, first.id);
  assert.equal(h.records()[1].body.name, first.name);
  assert.equal(h.get('record-dialog').open, false);
  assert.match(h.get('leaderboard-list').textContent, /小赛车手/);
});

test('an unacknowledged submission locks its original name and ID until a new race', async () => {
  const h = setup(); await ready(h); await qualifying(h);
  h.get('record-name').value = '第一次的昵称';
  // The service may have committed before this response was lost.
  h.queue.push(new Error('response lost after commit'));
  await h.client.save();
  const original = h.records()[0].body;
  assert.equal(h.get('record-name').disabled, true);
  h.get('record-name').value = '不能变更重试内容';
  const saved = entry(original.id, original.name, 3, 123456);
  h.queue.push(response({ saved: true, rank: 1, entries: [saved] }), response(board([saved])));
  await h.client.save();
  assert.equal(h.records()[1].body.id, original.id);
  assert.equal(h.records()[1].body.name, original.name);
  assert.match(h.get('record-result-status').textContent, /第一次的昵称/);
  assert.doesNotMatch(h.get('record-result-status').textContent, /不能变更重试内容/);

  h.client.newRace(); await qualifying(h);
  assert.equal(h.get('record-name').disabled, false);
  h.get('record-name').value = '下一局的昵称';
  h.queue.push(request => response({ saved: true, rank: 1,
    entries: [entry(request.body.id, request.body.name, 3, 123456)] }),
    response(board([entry('next-race', '下一局的昵称', 3, 123456)])));
  await h.client.save();
  assert.notEqual(h.records()[2].body.id, original.id);
  assert.equal(h.records()[2].body.name, '下一局的昵称');
});

test('one finish cannot cause duplicate score submissions while pending or after success', async () => {
  const h = setup(); await ready(h); await qualifying(h);
  h.get('record-name').value = '第一名';
  const waiting = deferred(); h.queue.push(() => waiting.promise);
  const saving = h.client.save();
  await h.client.save();
  assert.equal(h.records().length, 1);
  const id = h.records()[0].body.id;
  h.queue.push(response(board([entry(id, '第一名', 3, 123456)])));
  waiting.resolve(response({ saved: true, rank: 1, entries: [entry(id, '第一名', 3, 123456)] }));
  await saving;
  await h.client.save();
  await h.client.considerResult(finish());
  assert.equal(h.records().length, 1);
  assert.equal(h.qualifies().length, 1);
});

test('a qualification response from the previous race cannot reopen an old dialog', async () => {
  const h = setup(); await ready(h);
  const waiting = deferred(); h.queue.push(() => waiting.promise);
  const qualifyingResult = h.client.considerResult(finish());
  h.client.newRace();
  waiting.resolve(response({ qualifies: true, rank: 1, entries: [] }));
  await qualifyingResult;
  assert.equal(h.get('record-dialog').open, false);
  assert.equal(h.get('record-dialog').showCount, 0);
  assert.equal(h.records().length, 0);
});

test('a stale board request cannot replace the selected lap category', async () => {
  const h = setup(); await ready(h);
  const slowThree = deferred(), fastFive = deferred();
  h.queue.push(() => slowThree.promise, () => fastFive.promise);
  const loadingThree = h.client.load(3), loadingFive = h.client.load(5);
  fastFive.resolve(response(board([entry('five', '五圈冠军', 5, 200000)], 5)));
  await loadingFive;
  slowThree.resolve(response(board([entry('three', '过时的三圈', 3, 120000)])));
  await loadingThree;
  assert.match(h.get('leaderboard-list').textContent, /五圈冠军/);
  assert.doesNotMatch(h.get('leaderboard-list').textContent, /过时的三圈/);
});

test('a concurrent 409 drop from top five refreshes the board without claiming a save', async () => {
  const h = setup(); await ready(h); await qualifying(h);
  h.get('record-name').value = '后来者';
  const newer = [100000, 101000, 102000, 103000, 104000].map((time, i) => entry(`new-${i}`, `领先${i}`, 3, time));
  h.queue.push(response({ error: 'rank_changed', entries: newer }, 409));
  await h.client.save();
  assert.equal(h.records().length, 1);
  assert.match(h.text(), /前五|前 5|前5|入榜|未保存|没能|更新/);
  assert.doesNotMatch(h.get('record-result-status').textContent, /已保存|保存成功|提交成功/);
  assert.match(h.get('leaderboard-list').textContent, /领先0/);
  assert.doesNotMatch(h.get('leaderboard-list').textContent, /后来者/);
  await h.client.save();
  assert.equal(h.records().length, 1, 'a rejected ranking cannot be repeatedly resubmitted');
});

test('HTTP success without an explicit saved acknowledgment never becomes a success message', async () => {
  const h = setup(); await ready(h); await qualifying(h);
  h.get('record-name').value = '等待确认';
  h.queue.push(response({ saved: false, entries: [] }));
  await h.client.save();
  assert.equal(h.get('record-dialog').open, true);
  assert.match(h.get('record-message').textContent, /未能确认|重试/);
  assert.doesNotMatch(h.get('record-result-status').textContent, /已记入|已保存|保存成功/);
});

test('a mismatched rules version is not mixed into the current leaderboard', async () => {
  const h = setup();
  h.queue.push(response({ ...board([entry('legacy', '旧赛道冠军')]), version: 'another-track-version' }));
  await h.client.init();
  assert.match(h.get('leaderboard-status').textContent, /版本/);
  assert.doesNotMatch(h.get('leaderboard-list').textContent, /旧赛道冠军/);
  assert.equal(h.get('leaderboard-retry').classList.contains('hidden'), false);
});

test('malformed server JSON leaves a visible retry instead of rejecting initialization', async () => {
  const h = setup();
  h.queue.push({ ok: true, status: 200, json: async () => { throw new SyntaxError('broken JSON'); } });
  await h.client.init();
  assert.match(h.get('leaderboard-status').textContent, /连接|重试/);
  assert.equal(h.get('leaderboard-retry').classList.contains('hidden'), false);
});

test('server timeouts leave the game usable and expose a retry', async () => {
  const h = setup({ timeoutMs: 15 });
  h.queue.push(request => new Promise((resolve, reject) => {
    request.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  await h.client.init();
  assert.match(h.text(), /超时|失败|网络|重试|连接/);
  assert.equal(h.get('record-dialog').open, false);
});
