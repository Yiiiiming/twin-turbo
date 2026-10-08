import test from 'node:test';
import assert from 'node:assert/strict';
import { UnifiedRecordsClient } from '../unified-records.js';
import { LEADERBOARD_VERSION } from '../leaderboard.js';
import { GHOST_VERSION, RACE_GHOST_VERSION } from '../ghost-replay.js';

class Node {
  constructor(tag, document) {
    this.tagName = tag; this.document = document; this.children = []; this.listeners = new Map(); this.attributes = new Map();
    this.value = ''; this._text = ''; this.hidden = false; this.disabled = false;
    this.classList = { toggle() {} };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(value) { throw new Error(`Unsafe HTML write: ${value}`); }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  replaceChildren(...children) { this._text = ''; this.children = []; children.forEach(child => this.appendChild(child)); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(name, handler) { this.listeners.set(name, [...(this.listeners.get(name) || []), handler]); }
  async dispatch(name, values = {}) { await Promise.all((this.listeners.get(name) || []).map(handler => handler({ preventDefault() {}, ...values }))); }
  focus() { this.document.activeElement = this; }
}
const ids = ['records-tab-3', 'records-tab-1', 'records-tab-lap', 'records-list', 'records-status', 'records-retry', 'records-results', 'records-result-list', 'records-time-heading'];
const lap = (name = '月亮', id = 'lap-one', timeMs = 42000) => ({ id, name, timeMs, playerId: 1, mode: 'local', createdAt: 1 });
const total = (name = '月亮', id = 'total-one', laps = 3) => ({ ...lap(name, id, 140000), city: 'coast', laps });
const replay = (durationMs = 42000) => ({ version: 1, durationMs, frames: [[0, 1, 2, 0, 3], [durationMs, 1, 2, 0, 3]] });
const result = extra => ({ playerId: 1, mode: 'local', laps: 3, timeMs: 140000, finished: true, replay: replay(), ...extra });
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const lp = extra => ({ city: 'coast', version: GHOST_VERSION, entries: [], ...extra });
const rp = extra => ({ city: 'coast', version: RACE_GHOST_VERSION, entries: [], ...extra });
const raceEntry = (name = '月亮', id = 'race-one', timeMs = 140000) => ({ ...lap(name, id, timeMs), kind: 'race', laps: 3 });
const fullRace = (durationMs = 140000) => ({ version: 1, kind: 'race', laps: 3, durationMs, lapEndsMs: [45000, 90000, durationMs],
  frames: Array.from({ length: durationMs / 100 + 1 }, (_, i) => [i * 100, 1, 2, 0, 3]) });
const tp = (extra, laps = 3) => ({ city: 'coast', version: LEADERBOARD_VERSION, laps, entries: [], ...extra });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const nodes = new Map(), requests = [], memory = new Map(), challenges = [];
  const document = { getElementById: id => nodes.get(id), createElement: tag => new Node(tag, document) };
  ids.forEach(id => nodes.set(id, new Node('div', document)));
  const h = { document, get: id => nodes.get(id), requests, memory, challenges, savedCalls: 0, handler: null };
  h.client = new UnifiedRecordsClient({ document, origin: 'https://example.test', timeoutMs: 1000,
    storage: { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) }, onChallenge: entry => challenges.push(entry), onSaved: () => { h.savedCalls++; },
    fetchImpl: async (url, options) => {
      const request = { url: new URL(url), ...options, body: options.body ? JSON.parse(options.body) : undefined }; requests.push(request);
      if (h.handler) { const reply = await h.handler(request); if (reply !== undefined) return reply; }
      return response(request.url.pathname === '/api/leaderboard' ? tp({}, Number(request.url.searchParams.get('laps'))) : request.url.searchParams.get('version') === RACE_GHOST_VERSION ? rp({}) : lp({}));
    } });
  return h;
}
const posted = h => h.requests.filter(request => request.method === 'POST');
const savedLap = body => response(lp({ saved: true, entry: { ...lap(body.name, body.id, body.timeMs), playerId: body.playerId, mode: body.mode, totalRecordId: body.totalRecordId } }));

test('one table switches sprint, three-lap and fastest lap rankings with exactly matching ghosts', async () => {
  const h = setup();
  h.handler = req => {
    const laps = Number(req.url.searchParams.get('laps'));
    if (req.url.pathname === '/api/leaderboard') return response(tp({ entries: [total('月亮', `total-${laps}`, laps)] }, laps));
    if (req.url.pathname === '/api/laps') return response(lp({ entries: [lap()] }));
    const isRace = req.url.searchParams.get('version') === RACE_GHOST_VERSION;
    const id = isRace ? 'total-3' : 'total-1';
    return response((isRace ? rp : lp)({ entry: { ...(isRace ? raceEntry('月亮', id) : lap('月亮', id)), totalRecordId: id } }));
  };
  await h.client.init(); await h.client.load(3);
  assert.equal(h.get('records-list').children.length, 1); assert.equal(h.get('records-list').children[0].children.length, 4);
  assert.match(h.get('records-list').textContent, /02:20.00/); assert.doesNotMatch(h.get('records-list').textContent, /00:42.00/);
  await h.client.challengeButtons[0].dispatch('click'); assert.equal(h.challenges[0].id, 'total-3');
  assert.equal(h.challenges[0].kind, 'race'); assert.equal(h.challenges[0].laps, 3);
  await h.client.load(1); await h.client.challengeButtons[0].dispatch('click');
  assert.equal(h.challenges[1].id, 'total-1'); assert.equal(h.challenges[1].laps, 1);
  await h.client.load('lap'); assert.equal(h.get('records-list').children[0].children[2].textContent, '00:42.00');
  assert.match(h.get('records-status').textContent, /最快单圈/);
  await h.client.load(5); assert.equal(h.client.category, 'lap');
});

test('one nickname can occupy multiple single-lap ranks; only duplicated record ids are deduplicated', async () => {
  const h = setup();
  h.handler = () => response(lp({ entries: [lap('<b>Emery</b>', 'one'), lap('<b>Emery</b>', 'two', 43000), lap('<b>Emery</b>', 'one')] }));
  await h.client.load('lap');
  assert.equal(h.client.entries.length, 2); assert.equal(h.client.challengeButtons.length, 2);
  assert.match(h.get('records-list').textContent, /<b>Emery<\/b>/);
  assert.deepEqual(h.client.entries.map(entry => entry.id), ['one', 'two']);
  await h.client.challengeButtons[1].dispatch('click'); assert.equal(h.challenges[0].id, 'two');
});

test('all categories cap at five independent attempts and the time heading follows the selected ranking', async () => {
  const h = setup();
  h.handler = req => {
    if (req.url.pathname === '/api/leaderboard') {
      const laps = Number(req.url.searchParams.get('laps'));
      return response(tp({ entries: Array.from({ length: 8 }, (_, index) => ({ ...total('同一车手', `total-${index}`, laps), timeMs: 150000 - index * 1000 })) }, laps));
    }
    if (req.url.pathname === '/api/laps') return response(lp({ entries: Array.from({ length: 8 }, (_, index) => lap('同一车手', `lap-${index}`, 50000 - index * 1000)) }));
    return response({ error: 'not_found' }, 404);
  };
  for (const category of [3, 'lap', 1]) {
    await h.client.load(category);
    assert.equal(h.client.entries.length, 5);
    assert.equal(h.get('records-list').children.length, 5);
    assert.ok(h.client.entries.every(entry => entry.name === '同一车手'));
    assert.deepEqual(h.client.entries.map(entry => entry.id), [7, 6, 5, 4, 3].map(index => `${category === 'lap' ? 'lap' : 'total'}-${index}`));
    assert.equal(h.get('records-time-heading').textContent, category === 'lap' ? '单圈用时' : '整场用时');
  }
});

test('historical total records without telemetry show no ghost and cannot be challenged', async () => {
  const h = setup(); h.handler = req => req.url.pathname === '/api/leaderboard' ? response(tp({ entries: [total()] })) : response(req.url.searchParams.get('version') === RACE_GHOST_VERSION ? rp({}) : lp({}));
  await h.client.init(); await h.client.load(3); assert.match(h.get('records-list').textContent, /未录制/); assert.equal(h.client.challengeButtons.length, 0);
});

test('late board and personal-best responses cannot overwrite another selected category', async () => {
  const h = setup(), oldBoard = deferred(), oldLap = deferred();
  h.handler = req => req.url.pathname === '/api/leaderboard' ? oldBoard.promise : req.url.pathname.startsWith('/api/ghosts/') ? oldLap.promise : response(lp({ entries: [lap('单圈新榜')] }));
  const first = h.client.load(3); await tick(); await h.client.load('lap');
  oldBoard.resolve(response(tp({ entries: [total('过时总榜')] }))); await first;
  assert.equal(h.client.category, 'lap'); assert.match(h.get('records-list').textContent, /单圈新榜/);
  h.handler = req => req.url.pathname === '/api/leaderboard' ? response(tp({ entries: [total('过时补录')] })) : req.url.pathname.startsWith('/api/ghosts/') ? oldLap.promise : response(lp({ entries: [lap('单圈新榜')] }));
  const lookup = h.client.load(3); await tick(); await h.client.load('lap');
  oldLap.resolve(response(lp({ entries: [lap('过时补录')] }))); await lookup;
  assert.match(h.get('records-list').textContent, /单圈新榜/); assert.doesNotMatch(h.get('records-list').textContent, /过时/);
});

test('mismatched categories are rejected and never merged into the table', async () => {
  const h = setup(); h.handler = () => response(tp({ entries: [total('错误类别', 'five', 5)] }, 5));
  await h.client.load(3); assert.equal(h.client.entries.length, 0); assert.match(h.get('records-status').textContent, /类别/);
  h.handler = () => response(lp({ city: 'london', entries: [lap('错误城市')] }));
  await h.client.load('lap'); assert.equal(h.client.entries.length, 0); assert.equal(h.get('records-retry').hidden, false);
});

test('one nickname saves both records; two human players get one independent card each', async () => {
  const h = setup(); await h.client.init();
  h.client.showResults([result(), result({ playerId: 2, timeMs: 144000 }), result({ playerId: 1 })]);
  assert.equal(h.client.cards.length, 2);
  h.handler = req => req.method === 'POST' ? req.url.pathname === '/api/records' ? response(tp({ saved: true })) : savedLap(req.body) : undefined;
  const [first, second] = h.client.cards; first.input.value = '  双人一号  '; await first.form.dispatch('submit');
  assert.deepEqual(posted(h).map(req => req.body.name), ['双人一号', '双人一号']);
  assert.equal(first.done, true); assert.equal(second.done, false); assert.equal(second.input.disabled, false);
  second.input.value = '双人二号'; await second.form.dispatch('submit');
  assert.deepEqual(posted(h).slice(2).map(req => req.body.name), ['双人二号', '双人二号']);
  assert.equal(h.memory.get('twin-turbo-ghost-name-1'), '双人一号');
  assert.equal(h.memory.get('twin-turbo-ghost-name-2'), '双人二号');
  h.client.newRace(); h.client.showResults([result(), result({ playerId: 2 })]);
  assert.deepEqual(h.client.cards.map(card => card.input.value), ['双人一号', '双人二号']);
});

test('when the total saves but the ghost response is lost, retry sends only the same ghost payload', async () => {
  const h = setup(); await h.client.init(); let lapAttempts = 0;
  h.handler = req => {
    if (req.method !== 'POST') return;
    if (req.url.pathname === '/api/records') return response(tp({ saved: true }));
    if (++lapAttempts === 1) throw new Error('lost response'); return savedLap(req.body);
  };
  h.client.showResults([result()]); const card = h.client.cards[0]; card.input.value = '月亮';
  await h.client.save(card); assert.equal(card.total.state, 'saved'); assert.equal(card.lap.state, 'error'); assert.equal(card.done, false);
  assert.match(card.message.textContent, /整场成绩已保存/); assert.match(card.message.textContent, /昵称不用重填/);
  const before = posted(h)[1].body; card.input.value = '不能更换'; await h.client.save(card);
  assert.equal(posted(h).filter(req => req.url.pathname === '/api/records').length, 1);
  assert.deepEqual(posted(h)[2].body, before); assert.equal(card.done, true);
});

test('when the ghost saves first, total retry keeps its id and does not reupload the replay', async () => {
  const h = setup(); await h.client.init(); let attempts = 0;
  h.handler = req => {
    if (req.method !== 'POST') return;
    if (req.url.pathname === '/api/laps') return savedLap(req.body);
    return ++attempts === 1 ? response({ error: 'temporarily_unavailable' }, 503) : response(tp({ saved: true }));
  };
  h.client.showResults([result()]); const card = h.client.cards[0]; card.input.value = '晨风'; await h.client.save(card);
  assert.equal(card.total.state, 'error'); assert.equal(card.lap.state, 'saved');
  const before = posted(h)[0].body; await h.client.save(card);
  assert.deepEqual(posted(h)[2].body, before); assert.equal(posted(h).filter(req => req.url.pathname === '/api/laps').length, 1);
});

test('outside top five is a terminal total outcome while the personal ghost is still saved', async () => {
  const h = setup(); await h.client.init();
  h.handler = req => req.method === 'POST' ? req.url.pathname === '/api/records'
    ? response(tp({ error: 'rank_changed' }), 409) : savedLap(req.body) : undefined;
  h.client.showResults([result()]); const card = h.client.cards[0]; card.input.value = '海风'; await h.client.save(card);
  assert.equal(card.total.state, 'not-ranked'); assert.equal(card.lap.state, 'saved'); assert.equal(card.done, true);
  assert.match(card.message.textContent, /未进前五/); assert.match(card.message.textContent, /幽灵已保存/);
  await h.client.save(card); assert.equal(posted(h).length, 2);
});

test('a slower lap keeps the same-name faster ghost without asking for another nickname', async () => {
  const h = setup(); await h.client.init();
  h.handler = req => req.method === 'POST' ? response(lp({ saved: false, entry: lap('Emery', 'existing', 40000) })) : undefined;
  h.client.showResults([result({ finished: false })]); const card = h.client.cards[0]; card.input.value = 'ｅｍｅｒｙ'; await h.client.save(card);
  assert.equal(posted(h).length, 1); assert.equal(card.lap.state, 'retained'); assert.equal(card.done, true);
  assert.match(card.message.textContent, /更快/);
});

test('AI and London results are excluded; menu return can save a valid lap without finishing', async () => {
  const h = setup(); await h.client.init();
  h.client.showResults([result({ mode: 'ai', finished: false }), result({ playerId: 2, mode: 'ai' }), result({ playerId: 2, city: 'london' })]);
  assert.equal(h.client.cards.length, 1); assert.equal(h.client.cards[0].total.state, 'none');
  h.handler = req => req.method === 'POST' ? savedLap(req.body) : undefined;
  const card = h.client.cards[0]; card.input.value = '练习'; await h.client.save(card);
  assert.equal(posted(h).length, 1); assert.equal(posted(h)[0].url.pathname, '/api/laps');
});

test('total-only records remain saveable if no valid ghost replay was captured', async () => {
  const h = setup(); await h.client.init();
  h.handler = req => req.method === 'POST' ? response(tp({ saved: true })) : undefined;
  h.client.showResults([result({ replay: null })]); const card = h.client.cards[0]; card.input.value = '无回放'; await h.client.save(card);
  assert.equal(posted(h).length, 1); assert.equal(posted(h)[0].url.pathname, '/api/records'); assert.equal(card.done, true);
});

test('race lock disables challenges even after a delayed board load and rejects result submissions', async () => {
  const h = setup(), pending = deferred(); h.handler = () => pending.promise;
  const loading = h.client.load('lap'); h.client.newRace();
  pending.resolve(response(lp({ entries: [lap()] }))); await loading;
  assert.equal(h.client.challengeButtons[0].disabled, true); await h.client.challengeButtons[0].dispatch('click'); assert.equal(h.challenges.length, 0);
  h.client.showResults([result()]); const card = h.client.cards[0]; card.input.value = '锁定'; h.client.setRaceActive(true); await h.client.save(card);
  assert.equal(posted(h).length, 0); h.client.setRaceActive(false);
  await h.client.challengeButtons[0].dispatch('click'); assert.equal(h.challenges.length, 1);
});

test('old save responses after a new race cannot restore old cards, messages, or table requests', async () => {
  const h = setup(), waiting = deferred(); await h.client.init();
  h.handler = req => req.method === 'POST' ? waiting.promise : undefined;
  h.client.showResults([result({ replay: null })]); const card = h.client.cards[0]; card.input.value = '上一场';
  const saving = h.client.save(card); await tick(); h.client.newRace();
  waiting.resolve(response(tp({ saved: true }))); await saving;
  assert.equal(h.client.cards.length, 0); assert.equal(h.get('records-results').hidden, true);
  assert.equal(h.get('records-result-list').children.length, 0); assert.equal(h.requests.length, 2);
});

test('IME composition and empty names cannot submit, while wrong save categories stay retryable', async () => {
  const h = setup(); await h.client.init(); h.client.showResults([result({ replay: null })]); const card = h.client.cards[0];
  await h.client.save(card); assert.equal(posted(h).length, 0);
  card.input.value = '测试'; await card.input.dispatch('compositionstart'); await h.client.save(card); assert.equal(posted(h).length, 0);
  await card.input.dispatch('compositionend'); h.handler = req => req.method === 'POST' ? response(tp({ saved: true, city: 'london' })) : undefined;
  await h.client.save(card); assert.equal(card.total.state, 'error'); assert.equal(card.done, false);
});

test('refresh verifies exact total-to-ghost association and rejects stale responses', async () => {
  const h = setup(), delayed = deferred(); let lookups = 0;
  const entry = { ...lap('月亮', 'sprint', 40000), totalRecordId: 'sprint' };
  h.handler = req => req.url.pathname === '/api/leaderboard' ? response(tp({ entries: [total('月亮', 'sprint', 1)] }, 1))
    : ++lookups === 1 ? delayed.promise : response(lp({ entry }));
  const first = h.client.load(1); await tick(); await h.client.load(1);
  assert.equal(h.client.lapCache.get('sprint').timeMs, 40000);
  delayed.resolve(response(lp({ entry: { ...entry, totalRecordId: 'different-total' } }))); await first;
  assert.equal(h.client.lapCache.get('sprint').timeMs, 40000);
  await h.client.challengeButtons[0].dispatch('click'); assert.equal(h.challenges[0].id, 'sprint');
  assert.equal(lookups, 2); assert.ok(h.requests.some(req => req.url.pathname === '/api/ghosts/sprint'));
});

test('one nickname saves total, fastest lap and three-lap replay, retrying only the unconfirmed race part', async () => {
  const h = setup(); await h.client.init(); let raceAttempts = 0;
  h.handler = req => {
    if (req.method !== 'POST') return;
    if (req.url.pathname === '/api/records') return response(tp({ saved: true }));
    if (req.body.version === GHOST_VERSION) return savedLap(req.body);
    if (++raceAttempts === 1) throw new Error('race response lost');
    return response(rp({ saved: true, entry: { ...raceEntry(req.body.name, req.body.id, req.body.timeMs), totalRecordId: req.body.totalRecordId } }));
  };
  const source = fullRace(); h.client.showResults([result({ raceReplay: source })]);
  const card = h.client.cards[0]; card.input.value = '同一车手'; await h.client.save(card);
  assert.deepEqual(posted(h).map(req => req.body.name), ['同一车手', '同一车手', '同一车手']);
  assert.equal(card.total.state, 'saved'); assert.equal(card.lap.state, 'saved'); assert.equal(card.race.state, 'error');
  assert.equal(card.race.id, card.total.id); assert.equal(posted(h)[2].body.totalRecordId, card.total.id);
  assert.match(card.message.textContent, /三圈幽灵暂未确认/);
  assert.notEqual(card.raceReplay, source); assert.notEqual(card.raceReplay.frames[0], source.frames[0]);
  const first = posted(h)[2].body; card.input.value = '错误改名'; await h.client.save(card);
  assert.equal(posted(h).length, 4); assert.deepEqual(posted(h)[3].body, first); assert.equal(card.done, true);
  assert.equal(card.race.state, 'saved'); assert.match(card.message.textContent, /三圈整场幽灵已保存/);
});

test('single-lap sprint saves its total and lap, never a mismatched race replay', async () => {
  const h = setup(); await h.client.init();
  h.handler = req => req.method !== 'POST' ? undefined : req.url.pathname === '/api/records'
    ? response(tp({ saved: true }, 1)) : savedLap(req.body);
  h.client.showResults([result({ laps: 1, timeMs: 45000, raceReplay: fullRace() })]);
  const card = h.client.cards[0]; card.input.value = '冲刺'; await h.client.save(card);
  assert.equal(card.done, true); assert.equal(card.race.state, 'none');
  assert.equal(posted(h).length, 2); assert.equal(posted(h)[0].body.laps, 1);
  assert.equal(posted(h)[1].body.version, GHOST_VERSION);
  assert.equal(posted(h)[1].body.id, posted(h)[0].body.id); assert.equal(posted(h)[1].body.totalRecordId, posted(h)[0].body.id);
});

test('partial or mismatched three-lap replays do not masquerade as completed three-lap ghosts', async () => {
  const h = setup(); await h.client.init();
  for (const changes of [{ finished: false }, { timeMs: 140001 }, { raceReplay: { ...fullRace(), lapEndsMs: [45000, 90000] } }]) {
    h.client.showResults([result({ raceReplay: fullRace(), ...changes })]);
    assert.equal(h.client.cards[0].race.state, 'none');
  }
  h.handler = req => req.url.pathname === '/api/leaderboard' ? response(tp({ entries: [total()] }))
    : req.url.searchParams.get('version') === RACE_GHOST_VERSION ? response(rp({ entries: [lap()] })) : response(lp({ entries: [lap()] }));
  await h.client.load(3); assert.equal(h.client.challengeButtons.length, 0);
  assert.doesNotMatch(h.get('records-list').textContent, /00:42.00/); assert.match(h.get('records-list').textContent, /未录制/);
});

test('switching harbor courses separates board queries, saves and late responses', async () => {
  const h = setup(), waiting = deferred(); await h.client.init();
  h.handler = req => req.url.pathname === '/api/leaderboard' && req.url.searchParams.get('city') === 'coast' ? waiting.promise
    : req.url.pathname === '/api/leaderboard' ? response(tp({ city: 'coast-neon', entries: [{ ...total('霓虹车手'), city: 'coast-neon' }] }))
      : response(req.url.searchParams.get('version') === RACE_GHOST_VERSION ? rp({ city: 'coast-neon' }) : lp({ city: 'coast-neon' }));
  const old = h.client.load(3); await tick();
  await h.client.setTrack('coast-neon'); waiting.resolve(response(tp({ entries: [total('旧海港车手')] }))); await old;
  assert.match(h.get('records-list').textContent, /霓虹车手/); assert.doesNotMatch(h.get('records-list').textContent, /旧海港/);
  h.client.showResults([result({ city: 'coast' }), result({ playerId: 2, city: 'coast-neon', replay: null })]);
  assert.equal(h.client.cards.length, 1); const card = h.client.cards[0]; card.input.value = '新赛道';
  h.handler = req => req.method === 'POST' ? response(tp({ saved: true, city: 'coast-neon' })) : undefined;
  await h.client.save(card); assert.equal(posted(h)[0].body.city, 'coast-neon'); assert.equal(card.done, true);
  h.client.setTrack('london'); assert.equal(h.client.city, 'coast-neon', 'the harbor selector cannot accidentally switch to London');
});

test('browsing a different course preserves unfinished saves, their race city, and the selected board after saving', async () => {
  const h = setup(), waiting = deferred(); await h.client.init();
  h.client.showResults([result({ city: 'coast' })]); const card = h.client.cards[0]; card.input.value = '海港车手';
  h.handler = req => {
    if (req.method === 'POST') return req.url.pathname === '/api/records' ? waiting.promise : savedLap(req.body);
    const city = req.url.searchParams.get('city');
    return response(req.url.pathname === '/api/leaderboard' ? tp({ city }, Number(req.url.searchParams.get('laps'))) : lp({ city }));
  };
  const saving = h.client.save(card); await tick();
  await h.client.setTrack('coast-neon', { preserveResults: true });
  assert.equal(h.client.cards[0], card); assert.equal(card.city, 'coast'); assert.equal(card.input.value, '海港车手');
  assert.equal(card.submitting, true); assert.equal(h.get('records-results').hidden, false);
  waiting.resolve(response(tp({ saved: true }))); await saving;
  assert.equal(card.done, true); assert.equal(h.client.city, 'coast-neon'); assert.equal(h.client.raceCity, 'coast');
  assert.ok(posted(h).every(req => req.body.city === 'coast'));
  assert.equal(h.requests.at(-1).url.searchParams.get('city'), 'coast-neon');
  assert.equal(h.client.lapCache.size, 0, 'saving another track cannot inject a ghost into the viewed board cache');
  h.client.showResults([result({ city: 'coast', replay: null })]);
  assert.equal(h.client.cards[0].city, 'coast', 'finishing the active race is independent of the browsed ranking');
  await h.client.setTrack('coast-neon');
  assert.equal(h.client.cards.length, 0, 'selecting the viewed map for the next actual race clears previous results');
  assert.equal(h.client.raceCity, 'coast-neon');
});

test('independent board map selection never unlocks an active race and challenges preserve their displayed course', async () => {
  const h = setup(); await h.client.init(); h.client.newRace(); const token = h.client.raceToken;
  h.handler = req => response(req.url.pathname === '/api/leaderboard'
    ? tp({ city: 'coast-bay' }) : lp({ city: 'coast-bay', entries: [lap()] }));
  await h.client.setTrack('coast-bay', { preserveResults: true });
  assert.equal(h.client.locked, true); assert.equal(h.client.raceToken, token); assert.equal(h.client.raceCity, 'coast');
  await h.client.load('lap'); assert.equal(h.client.challengeButtons[0].disabled, true);
  h.client.setRaceActive(false); await h.client.challengeButtons[0].dispatch('click');
  assert.equal(h.challenges[0].city, 'coast-bay');
});


test('initial ranking defaults to fastest single laps', async () => {
  const h = setup(); await h.client.init();
  assert.equal(h.client.category, 'lap'); assert.equal(h.requests[0].url.pathname, '/api/laps');
  assert.equal(h.get('records-time-heading').textContent, '单圈用时'); assert.equal(h.savedCalls, 0);
});

test('saved callback waits for both human cards, never runs on failure, and does not wait for a board refresh', async () => {
  const h = setup(); await h.client.init(); let failSecond = true;
  h.client.showResults([result({ replay: null }), result({ playerId: 2, replay: null })]);
  h.handler = req => req.method === 'POST' ? req.body.playerId === 2 && failSecond
    ? response({ error: 'temporary_failure' }, 503) : response(tp({ saved: true })) : undefined;
  const [first, second] = h.client.cards; first.input.value = '一号'; second.input.value = '二号';
  await h.client.save(first); assert.equal(h.savedCalls, 0, 'the other driver still has an unsaved record');
  await h.client.save(second); assert.equal(h.savedCalls, 0); assert.equal(second.done, false);
  failSecond = false; const refresh = deferred();
  h.handler = req => req.method === 'POST' ? response(tp({ saved: true })) : refresh.promise;
  const saving = h.client.save(second); await tick();
  assert.equal(h.savedCalls, 1, 'all saved notification happens before waiting on the leaderboard');
  assert.equal(second.done, true); refresh.resolve(response(lp({}))); await saving;
  await h.client.save(first); await h.client.save(second); assert.equal(h.savedCalls, 1, 'already completed cards cannot fire again');
});

test('old saves cannot notify after a new race clears all result cards', async () => {
  const h = setup(), pending = deferred(); await h.client.init();
  h.client.showResults([result({ replay: null })]); const card = h.client.cards[0]; card.input.value = '上一场';
  h.handler = req => req.method === 'POST' ? pending.promise : undefined;
  const saving = h.client.save(card); await tick(); h.client.newRace();
  pending.resolve(response(tp({ saved: true }))); await saving;
  assert.equal(h.client.cards.length, 0); assert.equal(h.savedCalls, 0);
});

for (const trackId of ['coast-london', 'coast-beijing', 'coast-austin', 'coast-rio', 'coast-paris']) for (const laps of [1, 3]) test(`${trackId} ${laps}-lap result preserves its own map while another board is viewed, then returns an exact ghost challenge`, async () => {
  const h = setup(), saved = [];
  h.handler = req => {
    const city = req.body?.city || req.url.searchParams.get('city');
    const version = req.body?.version || req.url.searchParams.get('version');
    const race = version === RACE_GHOST_VERSION;
    if (req.method === 'POST') {
      const entry = { ...req.body, ...(race ? { kind: 'race', laps: 3 } : {}), createdAt: 1 }; delete entry.replay;
      saved.push({ entry, version, total: req.url.pathname === '/api/records' });
      return response({ city, version, laps: req.body.laps, saved: true, entry });
    }
    const matches = saved.filter(item => item.entry.city === city && item.version === version);
    if (req.url.pathname === '/api/leaderboard') return response(tp({ city, entries: matches.filter(item => item.total).map(item => item.entry) }, Number(req.url.searchParams.get('laps'))));
    if (req.url.pathname.startsWith('/api/ghosts/')) {
      const match = matches.find(item => item.entry.id === decodeURIComponent(req.url.pathname.split('/').at(-1)));
      return match ? response({ city, version, entry: match.entry }) : response({ error: 'not_found' }, 404);
    }
    return response({ city, version, entries: matches.filter(item => !item.total).map(item => item.entry) });
  };
  await h.client.init(); await h.client.setTrack(trackId);
  assert.equal(h.client.raceCity, trackId);
  h.client.showResults([result({ city: trackId, laps, timeMs: laps === 1 ? 45000 : 140000,
    raceReplay: laps === 3 ? fullRace() : undefined })]);
  const card = h.client.cards[0]; assert.ok(card); card.input.value = '同一城市车手';
  await h.client.setTrack('coast', { preserveResults: true });
  await h.client.save(card);
  assert.equal(card.done, true); assert.equal(h.savedCalls, 1); assert.equal(h.client.city, 'coast');
  assert.equal(h.client.entries.length, 0, 'another course board must not display this city result');
  assert.ok(posted(h).every(req => req.body.city === trackId));
  assert.equal(posted(h).length, laps === 3 ? 3 : 2);
  await h.client.setTrack(trackId, { preserveResults: true }); await h.client.load(laps);
  assert.equal(h.client.challengeButtons.length, 1); await h.client.challengeButtons[0].dispatch('click');
  assert.equal(h.challenges[0].city, trackId); assert.equal(h.challenges[0].laps, laps);
  assert.equal(h.challenges[0].kind, laps === 3 ? 'race' : 'lap');
  h.client.setTrack('london'); assert.equal(h.client.city, trackId, 'parked real London is a distinct unsupported harbor selection');
  await h.client.setTrack('coast'); assert.equal(h.client.cards.length, 0); assert.equal(h.client.raceCity, 'coast');
});

test('compact London rejects parked London leaderboard payloads and results', async () => {
  const h = setup(); await h.client.init(); await h.client.setTrack('coast-london');
  h.handler = () => response(lp({ city: 'london', entries: [lap('旧伦敦记录')] }));
  await h.client.load('lap');
  assert.equal(h.client.entries.length, 0); assert.equal(h.get('records-retry').hidden, false);
  h.client.showResults([result({ city: 'london' })]); assert.equal(h.client.cards.length, 0);
});
