import { LEADERBOARD_VERSION, normalizeEntries, normalizeName, normalizeCity } from './leaderboard.js';

const API_ORIGIN = 'https://twin-turbo-records-yiiiiming.heym0701.chatgpt.site';
// Native browser fetch requires its Window receiver, even when called by a client.
const browserFetch = (...args) => globalThis.fetch(...args);
const playerLabel = result => result.playerId === 1 ? '青色车手（P1）' : '橙色车手（P2）';
const cityLabel = city => city === 'london' ? '伦敦' : '海岸';
const sameCategory = (data, result) => data && normalizeCity(data.city) === result.city
  && (data.laps === undefined || data.laps === result.laps)
  && (data.version === undefined || data.version === LEADERBOARD_VERSION);
const scoreTime = milliseconds => {
  const centiseconds = Math.round(milliseconds / 10);
  return `${String(Math.floor(centiseconds / 6000)).padStart(2, '0')}:${((centiseconds % 6000) / 100).toFixed(2).padStart(5, '0')}`;
};
const uniqueId = () => globalThis.crypto?.randomUUID?.()
  || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, token => {
    const n = Math.floor(Math.random() * 16);
    return (token === 'x' ? n : (n & 3) | 8).toString(16);
  });

/** Online scores only. Local race results remain visible if the service fails. */
export class LeaderboardClient {
  constructor({ document, fetchImpl = browserFetch, origin = API_ORIGIN, timeoutMs = 8000, onOpen = () => {}, selectedCity = 'coast' } = {}) {
    this.document = document;
    this.fetchImpl = fetchImpl;
    this.origin = origin.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.onOpen = onOpen;
    this.laps = 3;
    this.selectedCity = normalizeCity(selectedCity) || 'coast';
    this.entries = [];
    this.boardRequest = 0;
    this.raceToken = 0;
    this.current = null;
    this.qualified = false;
    this.submitting = false;
    this.checking = false;
    this.done = false;
    this.composing = false;
    this.submissionName = null;
    this.pendingResults = [];
    this.completionMessages = [];
  }

  node(id) { return this.document.getElementById(id); }
  get busyDialog() { return this.node('record-dialog').open; }

  init() {
    for (const laps of [3, 5]) this.node('board-' + laps).addEventListener('click', () => { void this.load(laps); });
    this.node('leaderboard-retry').addEventListener('click', () => { void this.load(); });
    this.node('qualify-retry').addEventListener('click', () => { void this.qualify(); });
    this.node('record-form').addEventListener('submit', event => {
      event.preventDefault();
      if (!this.composing) void this.save();
    });
    this.node('record-skip').addEventListener('click', () => this.skip());
    this.node('record-dialog').addEventListener('cancel', event => {
      event.preventDefault();
      if (!this.submitting) this.skip();
    });
    const input = this.node('record-name');
    input.addEventListener('compositionstart', () => { this.composing = true; });
    input.addEventListener('compositionend', () => { this.composing = false; this.limitName(); });
    input.addEventListener('input', event => { if (!event.isComposing && !this.composing) this.limitName(); });
    return this.load();
  }

  limitName() {
    const input = this.node('record-name');
    input.value = Array.from(input.value).slice(0, 16).join('');
    this.node('record-name-count').textContent = `${Array.from(input.value).length} / 16`;
  }

  async request(path, body) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('连接超时，请重试。')); }, this.timeoutMs);
    });
    try {
      const task = Promise.resolve().then(() => this.fetchImpl(this.origin + path, {
        method: body ? 'POST' : 'GET', signal: controller.signal,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      })).then(async response => {
        const data = await response.json();
        if (!response.ok) {
          const error = new Error(response.status === 409 ? '排名已更新' : '暂时无法连接排行榜，请重试。');
          error.status = response.status; error.payload = data; throw error;
        }
        return data;
      });
      return await Promise.race([task, timeout]);
    } finally { clearTimeout(timer); }
  }

  tabs(laps) {
    this.laps = laps;
    for (const count of [3, 5]) {
      const selected = count === laps;
      this.node('board-' + count).classList.toggle('selected', selected);
      this.node('board-' + count).setAttribute('aria-selected', String(selected));
    }
    this.node('leaderboard-list').setAttribute('aria-label', `${cityLabel(this.selectedCity)} · ${laps} 圈全站最快五名`);
  }

  render(entries) {
    this.entries = normalizeEntries(entries, this.laps, this.selectedCity);
    const list = this.node('leaderboard-list');
    list.replaceChildren();
    for (const [index, record] of this.entries.entries()) {
      const row = this.document.createElement('li'); row.className = 'leaderboard-row';
      const rank = this.document.createElement('span'); rank.className = 'record-rank'; rank.textContent = String(index + 1).padStart(2, '0');
      const identity = this.document.createElement('div'); identity.className = 'record-identity';
      const name = this.document.createElement('strong'); name.textContent = record.name;
      const mode = this.document.createElement('small'); mode.textContent = record.mode === 'ai' ? '单人挑战 AI' : '本地双人';
      identity.appendChild(name); identity.appendChild(mode);
      const time = this.document.createElement('strong'); time.className = 'record-time'; time.textContent = scoreTime(record.timeMs);
      row.appendChild(rank); row.appendChild(identity); row.appendChild(time); list.appendChild(row);
    }
    this.node('leaderboard-status').textContent = this.entries.length
      ? `${cityLabel(this.selectedCity)} · ${this.laps} 圈 · 按整场完赛时间排名`
      : `${cityLabel(this.selectedCity)} · ${this.laps} 圈榜单还空着，来创造第一个纪录。`;
    this.node('leaderboard-retry').classList.add('hidden');
  }

  setCity(city) {
    if (normalizeCity(city) === null) return;
    return this.load(this.laps, normalizeCity(city));
  }

  async load(laps = this.laps, city = this.selectedCity) {
    if (![3, 5].includes(laps) || normalizeCity(city) === null) return;
    const request = ++this.boardRequest;
    this.selectedCity = normalizeCity(city);
    this.entries = [];
    this.tabs(laps);
    this.node('leaderboard-list').replaceChildren();
    this.node('leaderboard-status').textContent = `正在读取${cityLabel(city)}全站排行榜…`;
    this.node('leaderboard-retry').classList.add('hidden');
    try {
      const data = await this.request(`/api/leaderboard?laps=${laps}&city=${encodeURIComponent(city)}&version=${encodeURIComponent(LEADERBOARD_VERSION)}`);
      if (request !== this.boardRequest) return;
      if (data.version !== LEADERBOARD_VERSION || data.laps !== laps || normalizeCity(data.city) !== city) {
        throw new Error('榜单城市或版本不匹配，请刷新游戏后重试。');
      }
      this.render(data.entries);
    } catch (error) {
      if (request !== this.boardRequest) return;
      this.node('leaderboard-status').textContent = error.message.includes('版本') ? error.message : '暂时无法连接全站排行榜。游戏可照常进行，请联网后重试。';
      this.node('leaderboard-retry').classList.remove('hidden');
    }
  }

  newRace() {
    this.raceToken++;
    this.current = null; this.done = false; this.qualified = false; this.checking = false; this.submitting = false; this.composing = false;
    this.submissionName = null;
    this.pendingResults = [];
    this.completionMessages = [];
    if (this.busyDialog) this.node('record-dialog').close();
    this.node('record-result-status').textContent = '';
    this.node('qualify-retry').classList.add('hidden');
  }

  considerResult(result) { return this.considerResults([result]); }

  considerResults(results) {
    if (this.current || !Array.isArray(results)) return;
    const seen = new Set();
    this.pendingResults = results.filter(result => {
      if (result?.finished !== true || ![3, 5].includes(result.laps)
        || ![1, 2].includes(result.playerId) || !['local', 'ai'].includes(result.mode)
        || (result.mode === 'ai' && result.playerId === 2) || result.isAI === true || result.isHuman === false
        || normalizeCity(result.city) === null
        || !Number.isSafeInteger(result.timeMs) || result.timeMs <= 0 || seen.has(result.playerId)) return false;
      seen.add(result.playerId); return true;
    }).sort((a, b) => a.timeMs - b.timeMs).map(result => ({ finished: true,
      laps: result.laps, city: normalizeCity(result.city), timeMs: result.timeMs, playerId: result.playerId,
      mode: result.mode, version: LEADERBOARD_VERSION, id: uniqueId() }));
    return this.nextCandidate();
  }

  nextCandidate() {
    if (!this.pendingResults.length) return;
    this.current = this.pendingResults.shift();
    this.done = false; this.qualified = false; this.checking = false; this.submitting = false;
    this.composing = false; this.submissionName = null;
    this.node('record-name').value = ''; this.limitName();
    return this.qualify();
  }

  outcome(message) {
    this.completionMessages.push(message);
    this.node('record-result-status').textContent = this.completionMessages.join(' ');
  }

  async qualify() {
    if (!this.current || this.done || this.checking || this.qualified) return;
    const token = this.raceToken, result = this.current;
    let phase = 'request', advance = false;
    this.checking = true;
    this.node('record-result-status').textContent = `正在确认${playerLabel(result)}的全站前五资格…`;
    this.node('qualify-retry').classList.add('hidden');
    try {
      const { id, ...payload } = result;
      const data = await this.request('/api/qualify', payload);
      if (token !== this.raceToken || this.current !== result || this.done) return;
      if (!sameCategory(data, result)) throw new Error('榜单城市或版本不匹配。');
      phase = 'display';
      if (this.selectedCity === result.city && this.laps === result.laps && Array.isArray(data.entries)) this.render(data.entries);
      if (!Number.isInteger(data.rank) || data.rank < 1 || data.rank > 5) {
        this.done = true;
        this.outcome(`${playerLabel(result)}本次未进入全站前五。`);
        advance = true;
        return;
      }
      this.node('record-title').textContent = `进入${cityLabel(result.city)} ${result.laps} 圈榜第 ${data.rank} 名！`;
      this.node('record-message').textContent = `${playerLabel(result)} · ${scoreTime(result.timeMs)}，留下昵称记录这次成绩。`;
      this.node('record-submit').disabled = false; this.node('record-skip').disabled = false;
      this.node('record-name').disabled = false;
      this.node('record-submit').textContent = '记录我的成绩'; this.node('record-skip').textContent = '这次跳过';
      this.onOpen(); this.node('record-dialog').showModal();
      this.qualified = true;
      this.node('record-result-status').textContent = `${playerLabel(result)}已进入全站前五，填写昵称后提交。`;
      try { this.node('record-name').focus(); } catch { /* The open dialog remains usable. */ }
    } catch {
      if (token !== this.raceToken || this.current !== result) return;
      this.qualified = false;
      this.node('record-result-status').textContent = phase === 'request'
        ? `${playerLabel(result)}的成绩仍保留。暂时无法确认排行榜响应，请重试。`
        : '成绩已通过查询，但昵称窗口未能打开。请重试，当前成绩仍保留。';
      this.node('qualify-retry').classList.remove('hidden');
    } finally {
      if (token === this.raceToken && this.current === result) {
        this.checking = false;
        if (advance) void this.nextCandidate();
      }
    }
  }

  skip() {
    if (this.submitting) return;
    const alreadyDone = this.done;
    this.done = true; this.qualified = false;
    if (this.busyDialog) this.node('record-dialog').close();
    if (!alreadyDone && this.current) this.outcome(`${playerLabel(this.current)}已跳过记录，比赛成绩仍保留在上方。`);
    this.node('qualify-retry').classList.add('hidden');
    void this.nextCandidate();
  }

  async save() {
    if (!this.current || !this.qualified || this.done || this.submitting || this.composing) return;
    // A lost response may follow a successful insert. Every retry must keep
    // exactly the first submitted name and ID to remain strictly idempotent.
    const name = this.submissionName || normalizeName(this.node('record-name').value);
    if (!name) { this.node('record-message').textContent = '请输入一个昵称（最多 16 个字符）。'; this.node('record-name').focus(); return; }
    this.node('record-name').value = name; this.limitName();
    this.submissionName = name;
    const token = this.raceToken, result = this.current;
    let advance = false;
    this.submitting = true;
    this.node('record-submit').disabled = true; this.node('record-skip').disabled = true; this.node('record-name').disabled = true;
    this.node('record-message').textContent = '正在保存到全站榜单…';
    try {
      const data = await this.request('/api/records', { ...result, name });
      if (token !== this.raceToken || this.current !== result) return;
      if (data.saved !== true || !sameCategory(data, result)) throw new Error('未确认正确城市的保存结果');
      this.done = true; this.qualified = false;
      this.outcome(`「${name}」的成绩已记入${cityLabel(result.city)} ${result.laps} 圈全站榜。`);
      this.node('record-dialog').close();
      if (this.selectedCity === result.city && this.laps === result.laps) {
        this.render(data.entries);
        await this.load(result.laps, result.city);
      }
      advance = true;
    } catch (error) {
      if (token !== this.raceToken || this.current !== result) return;
      if (error.status === 409 && error.payload?.error === 'rank_changed' && sameCategory(error.payload, result)) {
        this.done = true; this.qualified = false;
        this.node('record-message').textContent = '刚刚有更快成绩进入前五，这次未保存。再来一局挑战吧。';
        this.outcome(`${playerLabel(result)}的成绩已跌出前五，未保存。`);
        this.node('record-skip').textContent = '返回比赛结果';
        if (this.selectedCity === result.city && this.laps === result.laps) this.render(error.payload.entries);
      } else {
        this.node('record-message').textContent = '未能确认保存。已保留并锁定原昵称与成绩，请联网后重试；不会重复记录。';
        this.node('record-submit').textContent = '重试保存';
      }
    } finally {
      if (token === this.raceToken && this.current === result) {
        this.submitting = false;
        this.node('record-submit').disabled = this.done;
        this.node('record-name').disabled = this.done || this.submissionName !== null;
        this.node('record-skip').disabled = false;
        if (advance) void this.nextCandidate();
      }
    }
  }
}
