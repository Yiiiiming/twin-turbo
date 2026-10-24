import { leaderboardVersionForCity, LEADERBOARD_CITIES, normalizeEntries, normalizeName, leaderboardNameKey } from './leaderboard.js';
import { validGhostReplay } from './ghost-client.js';
import { GHOST_VERSION, RACE_GHOST_VERSION, ghostVersionForCity, validateRaceReplay } from './ghost-replay.js';
import { setNicknameText, submissionNickname, limitNicknameInput } from './display-names.js';

const API_ORIGIN = 'https://twin-turbo-records-yiiiiming.heym0701.chatgpt.site';
const CITY = 'coast';
const browserFetch = (...args) => globalThis.fetch(...args);
const nameKey = leaderboardNameKey;
const human = result => result && [1, 2].includes(result.playerId) && ['local', 'ai'].includes(result.mode)
  && !(result.mode === 'ai' && result.playerId === 2) && result.isAI !== true && result.isHuman !== false;
const validGhostEntry = entry => human(entry) && typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 128
  && normalizeName(entry.name) && Number.isSafeInteger(entry.timeMs) && entry.timeMs >= 25000 && entry.timeMs <= 900000;
const validLapEntry = entry => validGhostEntry(entry) && (entry.kind === undefined || entry.kind === 'lap')
  && (entry.laps === undefined || entry.laps === 1);
const validRaceEntry = entry => validGhostEntry(entry) && entry.kind === 'race' && entry.laps === 3 && entry.timeMs >= 75000;
const lapCategory = (data, laps = 1, city = CITY) => data?.version === ghostVersionForCity(city, laps) && data?.city === city;
const totalCategory = (data, laps, city = CITY) => data?.version === leaderboardVersionForCity(city) && data?.city === city && data?.laps === laps;
const cleanLaps = (entries, laps = 1) => {
  const seen = new Set(), names = new Set();
  return (Array.isArray(entries) ? entries : []).filter(laps === 3 ? validRaceEntry : validLapEntry).map(entry => ({ ...entry, kind: laps === 3 ? 'race' : 'lap', laps })).sort((a, b) => a.timeMs - b.timeMs)
    .filter(entry => { const key = entry.id, name = nameKey(entry.name); if (seen.has(key)) return false; seen.add(key); if (names.has(name)) return false; names.add(name); return true; }).slice(0, 5);
};
const timeLabel = ms => {
  const cs = Math.round(ms / 10);
  return `${String(Math.floor(cs / 6000)).padStart(2, '0')}:${((cs % 6000) / 100).toFixed(2).padStart(5, '0')}`;
};
const uuid = () => globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16);
});
const copyReplay = replay => ({ version: 1, ...(replay.kind === 'race' ? { kind: 'race', laps: 3, lapEndsMs: [...replay.lapEndsMs] } : {}),
  durationMs: replay.durationMs, frames: replay.frames.map(frame => [...frame]) });
const terminal = state => ['none', 'saved', 'not-ranked', 'retained', 'archived', 'rejected'].includes(state);

/** One record area, one name per human, independently retryable online saves. */
export class UnifiedRecordsClient {
  constructor({ document, fetchImpl = browserFetch, storage, origin = API_ORIGIN, timeoutMs = 20000, onChallenge = () => {}, onSaved = () => {} } = {}) {
    this.document = document; this.fetchImpl = fetchImpl; this.storage = storage;
    if (storage === undefined) { try { this.storage = globalThis.localStorage; } catch { this.storage = null; } }
    this.origin = origin.replace(/\/$/, ''); this.timeoutMs = timeoutMs; this.onChallenge = onChallenge; this.onSaved = onSaved;
    this.city = CITY; this.raceCity = CITY; this.category = 'lap'; this.boardRequest = 0; this.raceToken = 0; this.locked = false;
    this.entries = []; this.cards = []; this.lapCache = new Map(); this.lapRequests = new Map(); this.raceCache = new Map(); this.raceRequests = new Map(); this.challengeButtons = [];
  }
  node(id) { return this.document.getElementById(id); }
  get busyDialog() { return false; }
  el(tag, className, text) {
    const node = this.document.createElement(tag); if (className) node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  }
  remembered(playerId) {
    try { return normalizeName(this.storage?.getItem(`twin-turbo-ghost-name-${playerId}`)); } catch { return ''; }
  }
  remember(playerId, name) { try { this.storage?.setItem(`twin-turbo-ghost-name-${playerId}`, name); } catch { /* Storage is optional. */ } }
  init(city = this.city) {
    for (const category of [1, 'lap']) this.node(`records-tab-${category}`).addEventListener('click', () => this.load(category));
    this.node('records-retry').addEventListener('click', () => this.load());
    this.node('records-results').hidden = true;
    return city === this.city ? this.load() : this.setTrack(city);
  }
  async request(path, body) {
    const controller = new AbortController(); let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('连接超时，请重试。')); }, this.timeoutMs); });
    try {
      return await Promise.race([Promise.resolve().then(() => this.fetchImpl(this.origin + path, {
        method: body ? 'POST' : 'GET', signal: controller.signal,
        headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}),
      })).then(async response => {
        const data = await response.json();
        if (!response.ok) { const error = new Error('暂时无法连接记录服务。'); error.status = response.status; error.payload = data; throw error; }
        return data;
      }), timeout]);
    } finally { clearTimeout(timer); }
  }
  setTrack(city, { preserveResults = false } = {}) {
    if (!LEADERBOARD_CITIES.includes(city) || city === 'london'
      || (city === this.city && (preserveResults || city === this.raceCity))) return;
    this.city = city;
    if (!preserveResults) { this.raceCity = city; this.newRace(); this.setRaceActive(false); }
    return this.load();
  }
  lapQuery(extra = '', laps = 1, city = this.city) { return `city=${encodeURIComponent(city)}&version=${encodeURIComponent(ghostVersionForCity(city, laps))}${extra}`; }
  async recordGhost(record, laps) {
    const city = this.city, key = record.id, cache = laps === 3 ? this.raceCache : this.lapCache, requests = laps === 3 ? this.raceRequests : this.lapRequests;
    if (cache.has(key)) return cache.get(key);
    if (requests.has(key)) return requests.get(key);
    const pending = this.request(`/api/ghosts/${encodeURIComponent(record.id)}?${this.lapQuery('', laps, city)}`).then(data => {
      if (!lapCategory(data, laps, city)) throw new Error('幽灵记录版本不匹配。');
      const entry = (laps === 3 ? validRaceEntry(data.entry) : validLapEntry(data.entry))
        && data.entry.id === record.id && data.entry.totalRecordId === record.id
        && nameKey(data.entry.name) === nameKey(record.name)
        && (laps !== 3 || data.entry.timeMs === record.timeMs) ? { ...data.entry, kind: laps === 3 ? 'race' : 'lap', laps } : null;
      if (requests.get(key) === pending) cache.set(key, entry);
      return cache.has(key) ? cache.get(key) : entry;
    }).catch(error => {
      if (error.status !== 404) throw error;
      if (requests.get(key) === pending) cache.set(key, null);
      return null;
    }).finally(() => { if (requests.get(key) === pending) requests.delete(key); });
    requests.set(key, pending); return pending;
  }
  tabs(category) {
    if (![1, 'lap'].includes(category)) return;
    this.category = category;
    for (const value of [1, 'lap']) {
      const selected = value === category;
      this.node(`records-tab-${value}`).classList.toggle('selected', selected);
      this.node(`records-tab-${value}`).setAttribute('aria-selected', String(selected));
    }
    this.node('records-time-heading').textContent = category === 'lap' ? '单圈用时' : '整场用时';
    this.node('records-list').setAttribute('aria-label', category === 'lap' ? '海港最快单圈前五' : `海港 ${category} 圈整场前五`);
  }
  render() {
    const list = this.node('records-list'); list.replaceChildren(); this.challengeButtons = [];
    for (const [index, entry] of this.entries.entries()) {
      const ghostCache = this.category === 3 ? this.raceCache : this.lapCache;
      const ghost = this.category === 'lap' ? entry : ghostCache.get(entry.id);
      const row = this.el('tr', 'record-row');
      row.appendChild(this.el('td', 'record-rank', String(index + 1).padStart(2, '0')));
      const identity = this.el('td', 'record-identity');
      const nickname = setNicknameText(this.el('strong'),normalizeName(entry.name)); identity.appendChild(nickname);
      identity.appendChild(this.el('small', '', entry.mode === 'ai' ? '单人' : '本地双人')); row.appendChild(identity);
      row.appendChild(this.el('td', 'record-time record-total-time', timeLabel(entry.timeMs)));
      const challenge = this.el('td', 'record-ghost-cell');
      if (ghost && validLapEntry(ghost)) {
        const ghostLabel = '单圈幽灵';
        const button = this.el('button', 'record-challenge', `挑战${ghostLabel}`); button.type = 'button'; button.disabled = this.locked;
        button.setAttribute('aria-label', `挑战「${normalizeName(ghost.name)}」的${ghostLabel}`);
        button.addEventListener('click', () => { if (!this.locked && validLapEntry(ghost)) return this.onChallenge({ ...ghost, city: this.city }); });
        this.challengeButtons.push(button); challenge.appendChild(button);
      } else challenge.appendChild(this.el('span', 'record-no-ghost', ghostCache.has(entry.id) ? '未录制' : '待查询'));
      row.appendChild(challenge); list.appendChild(row);
    }
  }
  async load(category = this.category) {
    if (![1, 'lap'].includes(category)) return;
    const request = ++this.boardRequest, city = this.city;
    // Records can be improved in another tab. Deduplicate lookups only within
    // this refresh; old in-flight lookups lose ownership of the new cache.
    this.lapCache.clear(); this.lapRequests.clear(); this.raceCache.clear(); this.raceRequests.clear();
    this.tabs(category); this.entries = []; this.render();
    this.node('records-status').textContent = '正在读取全站速度榜…'; this.node('records-retry').hidden = true;
    try {
      const data = await this.request(category === 'lap' ? `/api/laps?${this.lapQuery('', 1, city)}`
        : `/api/leaderboard?laps=${category}&city=${encodeURIComponent(city)}&version=${encodeURIComponent(leaderboardVersionForCity(city))}`);
      if (request !== this.boardRequest) return;
      if (category === 'lap' ? !lapCategory(data, 1, city) : !totalCategory(data, category, city)) throw new Error('榜单版本或类别不匹配。');
      this.entries = category === 'lap' ? cleanLaps(data.entries) : normalizeEntries(data.entries, category, city);
      if (category === 'lap') for (const entry of this.entries) this.lapCache.set(entry.id, entry);
      this.render();
      const details = category === 'lap' ? [] : await Promise.allSettled(this.entries.map(entry => this.recordGhost(entry, category)));
      if (request !== this.boardRequest) return;
      this.render(); const failed = details.some(result => result.status === 'rejected');
      this.node('records-status').textContent = !this.entries.length ? '还没有成绩，完成比赛或有效单圈后保存，留下第一条记录。'
        : category === 'lap' ? '最快单圈前五 · 每个昵称只展示最快成绩，其他成绩保留在历史记录中。'
          : `${category} 圈整场前五 · 每个昵称只展示最快成绩，其他成绩保留在历史记录中。${failed ? ' 部分幽灵暂未读取，可重试。' : ''}`;
      this.node('records-retry').hidden = !failed;
    } catch (error) {
      if (request !== this.boardRequest) return;
      this.node('records-status').textContent = /版本|类别/.test(error.message) ? error.message : '暂时无法读取全站速度榜，游戏可照常进行。';
      this.node('records-retry').hidden = false;
    }
  }
  setRaceActive(active) {
    this.locked = !!active;
    for (const button of this.challengeButtons) button.disabled = this.locked;
    for (const card of this.cards) { card.button.disabled = this.locked || card.submitting || card.done; card.input.disabled = this.locked || card.submissionName !== null; }
  }
  newRace() {
    this.raceToken++; this.cards = []; this.node('records-result-list').replaceChildren(); this.node('records-results').hidden = true;
    this.setRaceActive(true);
  }
  showResults(results) {
    const token = ++this.raceToken, seen = new Set(); this.cards = [];
    const list = this.node('records-result-list'); list.replaceChildren(); this.setRaceActive(false);
    for (const result of Array.isArray(results) ? results : []) {
      const city = result?.city ?? this.raceCity;
      if (!human(result) || seen.has(result.playerId) || city !== this.raceCity) continue;
      const total = result.finished === true && [1, 3].includes(result.laps) && Number.isSafeInteger(result.timeMs)
        && result.timeMs >= result.laps * 25000 && result.timeMs <= result.laps * 3600000;
      const replay = validGhostReplay(result.replay) && !result.replay.lapEndsMs && result.replay.kind !== 'race' ? copyReplay(result.replay) : null;
      const raceReplay = total && result.laps === 3 && validateRaceReplay(result.raceReplay)
        && result.raceReplay.durationMs === result.timeMs ? copyReplay(result.raceReplay) : null;
      if (!total && !replay) continue; seen.add(result.playerId);
      const card = { token, city, playerId: result.playerId, mode: result.mode, laps: result.laps, timeMs: result.timeMs, replay, raceReplay,
        total: { id: uuid(), state: total ? 'pending' : 'none' }, lap: { id: uuid(), state: replay ? 'pending' : 'none' }, race: { id: uuid(), state: raceReplay ? 'pending' : 'none' },
        submitting: false, done: false, composing: false, submissionName: null };
      // Each category has its own store, so one shared id links this exact finish to its matching ghost.
      if (total && result.laps === 1) card.lap.id = card.total.id;
      if (total && result.laps === 3) card.race.id = card.total.id;
      const form = this.el('form', 'records-save-card'); card.form = form;
      form.appendChild(this.el('h3', '', `${result.driverLabel || (result.playerId === 1 ? '青色车手' : '橙色车手')} · P${result.playerId}`));
      form.appendChild(this.el('p', 'records-save-summary', `${total ? `${result.laps} 圈 ${timeLabel(result.timeMs)}` : '本场未完赛'}${replay ? ` · 最快有效单圈 ${timeLabel(replay.durationMs)}` : ''}`));
      const label = this.el('label', 'records-save-label', '你的昵称');
      card.input = this.el('input', 'records-nickname'); card.input.type = 'text'; card.input.name = 'nickname'; card.input.autocomplete = 'nickname';
      card.rememberedName=this.remembered(result.playerId);
      card.input.required = true; card.input.value = card.rememberedName; card.input.setAttribute('aria-label', `P${result.playerId} 成绩昵称`);
      label.appendChild(card.input); form.appendChild(label);
      card.button = this.el('button', 'records-save-button', '保存我的成绩'); card.button.type = 'submit'; form.appendChild(card.button);
      card.message = this.el('p', 'records-save-status', '一个昵称，一次保存。符合条件的总成绩、最快单圈与幽灵将一起记录。');
      card.message.setAttribute('role', 'status'); form.appendChild(card.message);
      card.input.addEventListener('compositionstart', () => { card.composing = true; });
      card.input.addEventListener('compositionend', () => { card.composing = false; card.input.value = submissionNickname(card.input.value,card.rememberedName); });
      card.input.addEventListener('input',event=>{if(!event.isComposing&&!card.composing)limitNicknameInput(card.input,card.rememberedName);});
      form.addEventListener('submit', event => { event.preventDefault(); return this.save(card); });
      this.cards.push(card); list.appendChild(form);
    }
    this.node('records-results').hidden = this.cards.length === 0;
  }
  async savePart(card, part, name) {
    if (terminal(card[part].state)) return;
    card[part].state = 'saving';
    try {
      const replay = part === 'race' ? card.raceReplay : card.replay, ghostLaps = part === 'race' ? 3 : 1;
      const data = await this.request(part === 'total' ? '/api/records' : '/api/laps', part === 'total'
        ? { id: card.total.id, version: leaderboardVersionForCity(card.city), city: card.city, laps: card.laps, timeMs: card.timeMs,
          playerId: card.playerId, mode: card.mode, finished: true, name }
        : { id: card[part].id, version: ghostVersionForCity(card.city, ghostLaps), city: card.city, timeMs: replay.durationMs,
          playerId: card.playerId, mode: card.mode, name, replay, ...(card.total.state !== 'none' ? { totalRecordId: card.total.id } : {}) });
      if (card.token !== this.raceToken) return;
      if (part === 'total') {
        if (!totalCategory(data, card.laps, card.city) || data.saved !== true) throw new Error('未确认总成绩。');
        card.total.state = 'saved'; card.total.rank = data.rank;
      } else {
        if (!lapCategory(data, ghostLaps, card.city) || typeof data.saved !== 'boolean' || !(ghostLaps === 3 ? validRaceEntry(data.entry) : validLapEntry(data.entry))
          || nameKey(data.entry.name) !== nameKey(name) || data.entry.timeMs > replay.durationMs
          || (data.saved && (data.entry.id !== card[part].id || data.entry.timeMs !== replay.durationMs
            || data.entry.playerId !== card.playerId || data.entry.mode !== card.mode
            || (card.total.state !== 'none' && data.entry.totalRecordId !== card.total.id)))) throw new Error('未确认幽灵成绩。');
        card[part].state = data.retained === false ? 'archived' : data.saved ? 'saved' : 'retained'; card[part].entry = { ...data.entry, kind: ghostLaps === 3 ? 'race' : 'lap', laps: ghostLaps };
        if (card.city === this.city) {
          const cache = ghostLaps === 3 ? this.raceCache : this.lapCache, requests = ghostLaps === 3 ? this.raceRequests : this.lapRequests;
          requests.delete(card[part].id); cache.set(card[part].id, data.retained === false ? null : card[part].entry);
        }
      }
    } catch (error) {
      if (card.token !== this.raceToken) return;
      card[part].state = part === 'lap' && [400, 422].includes(error.status) && error.payload?.error === 'invalid_single_lap_start' ? 'rejected'
        : part === 'total' && error.status === 409 && error.payload?.error === 'rank_changed'
        && totalCategory(error.payload, card.laps, card.city) ? 'not-ranked' : 'error';
    }
  }
  async save(card) {
    if (this.locked || card.token !== this.raceToken || card.submitting || card.done || card.composing) return;
    const name = card.submissionName || submissionNickname(card.input.value,card.rememberedName);
    if (!name) { card.message.textContent = '请输入昵称，最多 12 个字符。'; card.input.focus(); return; }
    card.submissionName = name; card.input.value = name; this.remember(card.playerId, name);
    card.submitting = true; card.button.disabled = true; card.input.disabled = true; card.message.textContent = '正在保存成绩与幽灵…';
    // The linked total supplies the lap's start evidence. Wait for its write
    // before sending telemetry; an unavailable total must not lose a good ghost.
    await this.savePart(card, 'total', name);
    if (card.token !== this.raceToken) return;
    await Promise.all([this.savePart(card, 'lap', name), this.savePart(card, 'race', name)]);
    if (card.token !== this.raceToken) return;
    card.submitting = false; card.done = terminal(card.total.state) && terminal(card.lap.state) && terminal(card.race.state);
    const messages = [];
    if (card.total.state === 'saved') messages.push(card.total.rank === null ? '整场成绩已保存至历史记录，本次未进入排行榜' : '整场成绩已保存');
    if (card.total.state === 'not-ranked') messages.push('整场成绩未进前五');
    if (card.lap.state === 'saved') messages.push('最快单圈与幽灵已保存');
    if (card.lap.state === 'rejected') messages.push('这次单圈起步不符合规则，幽灵未保存；请从起跑位向前重新比赛');
    if (card.lap.state === 'archived' || card.race.state === 'archived') messages.push('幽灵未进入当前地图与圈数的个人前 20，成绩保存不受影响');
    if (card.lap.state === 'retained') messages.push(`已保留更快的单圈与幽灵 ${timeLabel(card.lap.entry.timeMs)}`);
    if (card.race.state === 'saved') messages.push('三圈整场幽灵已保存');
    if (card.race.state === 'retained') messages.push(`已保留更快的三圈幽灵 ${timeLabel(card.race.entry.timeMs)}`);
    const failed = [['total', '整场成绩'], ['lap', '单圈与幽灵'], ['race', '三圈幽灵']].filter(([part]) => card[part].state === 'error').map(([, label]) => label);
    if (!card.done) messages.push(`${failed.join('、')}暂未确认；重试只补存这一部分，昵称不用重填`);
    card.message.textContent = messages.join('；') + '。'; card.button.textContent = card.done ? card.lap.state === 'rejected' ? '需重新比赛' : '已完成' : '重试未保存部分';
    card.button.disabled = this.locked || card.done; card.input.disabled = true;
    // Keep a rejected attempt visible even if the other driver saves later.
    if (card.done && card.token === this.raceToken && this.cards.length > 0
      && this.cards.every(result => result.done && result.lap.state !== 'rejected')) this.onSaved();
    // Refresh the selected category, never switch tabs after a late save response.
    if (['total', 'lap', 'race'].some(part => ['saved', 'retained'].includes(card[part].state))) await this.load();
  }
}
