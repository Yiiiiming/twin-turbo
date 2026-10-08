import { normalizeName } from './leaderboard.js';
import { RACE_GHOST_VERSION, validateRaceReplay } from './ghost-replay.js';

export const GHOST_VERSION = 'coast-ghost-v1';
export const GHOST_SLOTS = Object.freeze([
  Object.freeze({ slotId: 0, color: '#b8a2ed', colorLabel: '紫色' }),
  Object.freeze({ slotId: 1, color: '#ffd166', colorLabel: '金色' }),
]);
const CITY = 'coast';
const API_ORIGIN = 'https://twin-turbo-records-yiiiiming.heym0701.chatgpt.site';
const browserFetch = (...args) => globalThis.fetch(...args);
const nameKey = name => normalizeName(name).normalize('NFKC').toLowerCase();
const category = (data, version, city) => data?.version === version && data?.city === city;
const timeLabel = ms => {
  const cs = Math.round(ms / 10);
  return `${String(Math.floor(cs / 6000)).padStart(2, '0')}:${((cs % 6000) / 100).toFixed(2).padStart(5, '0')}`;
};
const uuid = () => globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16);
});
const human = result => result && [1, 2].includes(result.playerId) && ['local', 'ai'].includes(result.mode)
  && !(result.mode === 'ai' && result.playerId === 2) && result.isAI !== true && result.isHuman !== false;
const validTime = ms => Number.isSafeInteger(ms) && ms >= 25000 && ms <= 900000;
const validEntry = entry => human(entry) && typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 128
  && normalizeName(entry.name) && (entry.kind === 'race' ? entry.laps === 3 && Number.isSafeInteger(entry.timeMs)
    && entry.timeMs >= 75000 && entry.timeMs <= 900000 : validTime(entry.timeMs));
export function validGhostReplay(replay) {
  if (!replay || replay.lapEndsMs !== undefined || (replay.kind !== undefined && replay.kind !== 'lap') || (replay.laps !== undefined && replay.laps !== 1)
    || replay.version !== 1 || !validTime(replay.durationMs) || !Array.isArray(replay.frames)
    || replay.frames.length < 2 || replay.frames.length > 12000) return false;
  let previous = -1;
  for (const frame of replay.frames) {
    if (!Array.isArray(frame) || frame.length !== 5 || !frame.every(Number.isFinite)
      || frame[0] <= previous || frame[0] < 0 || frame[0] > replay.durationMs) return false;
    previous = frame[0];
  }
  return replay.frames[0][0] === 0 && previous === replay.durationMs;
}
const copyReplay = replay => ({ version: 1, durationMs: replay.durationMs, frames: replay.frames.map(frame => [...frame]),
  ...(replay.kind ? { kind: replay.kind, laps: replay.laps } : {}), ...(replay.lapEndsMs ? { lapEndsMs: [...replay.lapEndsMs] } : {}) });
const copyEntry = entry => ({ id: entry.id, name: normalizeName(entry.name), timeMs: entry.timeMs,
  playerId: entry.playerId, mode: entry.mode, createdAt: entry.createdAt,
  ...(entry.kind ? { kind: entry.kind, laps: entry.laps } : {}) });

/** A replay is selected before a race, never replaced while the race is running. */
export class GhostClient {
  constructor({ document, fetchImpl = browserFetch, storage, origin = API_ORIGIN,
    timeoutMs = 20000, onSelection = () => {}, recordsManaged = false } = {}) {
    this.document = document; this.fetchImpl = fetchImpl; this.storage = storage;
    if (storage === undefined) { try { this.storage = globalThis.localStorage; } catch { this.storage = null; } }
    this.recordsManaged = recordsManaged;
    this.origin = origin.replace(/\/$/, ''); this.timeoutMs = timeoutMs; this.onSelection = onSelection;
    this.slots = [null, null]; this.activeSlot = 0; this.locked = false; this.laps = 1; this.city = CITY;
    this.slotStates = GHOST_SLOTS.map(() => ({ name: '', matches: [], choice: '', searching: false, loading: false, request: 0,
      message: '输入昵称查找幽灵，也可以找自己的最快单圈。' }));
    this.boardRequest = 0; this.pickerRequest = 0; this.pickerButtons = []; this.resultsToken = 0; this.cards = [];
  }
  node(id) { return this.document.getElementById(id); }
  el(tag, className, text) {
    const node = this.document.createElement(tag); if (className) node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  }
  remember(playerId, name) { try { this.storage?.setItem(`twin-turbo-ghost-name-${playerId}`, name); } catch { /* Private browsing can disallow storage. */ } }
  remembered(playerId) { try { return normalizeName(this.storage?.getItem(`twin-turbo-ghost-name-${playerId}`)); } catch { return ''; } }
  get selected() { return this.slots[this.activeSlot]; }
  get matches() { return this.slotStates[this.activeSlot].matches; }
  get searching() { return this.slotStates[this.activeSlot].searching; }
  get loading() { return this.slotStates[this.activeSlot].loading; }
  get version() { return this.laps === 3 ? RACE_GHOST_VERSION : GHOST_VERSION; }
  matchesMode(entry) {
    return validEntry(entry) && (this.laps === 3 ? entry.kind === 'race' && entry.laps === 3
      : (entry.kind === undefined || entry.kind === 'lap') && (entry.laps === undefined || entry.laps === 1));
  }
  selections() { return this.slots.filter(Boolean); }
  status(message, slotId = this.activeSlot) {
    this.slotStates[slotId].message = message;
    if (slotId === this.activeSlot) this.node('ghost-status').textContent = message;
  }
  select(value, slotId = this.activeSlot) {
    this.slots[slotId] = value ? { ...GHOST_SLOTS[slotId], ...value } : null;
    this.onSelection(this.selections()); this.controls();
  }
  renderChoices() {
    const state = this.slotStates[this.activeSlot], list = this.node('ghost-choice'); list.replaceChildren();
    for (const entry of state.matches) {
      const option = this.el('option', '', `${entry.name} · ${timeLabel(entry.timeMs)}`); option.value = entry.id; list.appendChild(option);
    }
    list.value = state.choice; this.node('ghost-name').value = state.name; this.status(state.message); this.controls();
  }
  controls() {
    const state = this.slotStates[this.activeSlot];
    const off = this.locked || !this.node('ghost-enabled').checked;
    this.node('ghost-enabled').disabled = this.locked;
    this.node('ghost-name').disabled = this.locked;
    this.node('ghost-search').disabled = this.locked || state.searching;
    this.node('ghost-choice').disabled = off || state.searching || state.loading || !state.matches.length;
    this.node('ghost-load').disabled = off || state.searching || state.loading || !state.choice;
    this.node('ghost-choice').hidden = !state.matches.length;
    this.node('ghost-load').hidden = !state.matches.length;
    this.node('ghost-load').textContent = `${this.slots[this.activeSlot] ? '替换' : '加入'}${GHOST_SLOTS[this.activeSlot].colorLabel}幽灵`;
    for (const slot of GHOST_SLOTS) {
      const button = this.node(`ghost-slot-${slot.slotId}`), label = this.node(`ghost-slot-label-${slot.slotId}`), remove = this.node(`ghost-remove-${slot.slotId}`);
      if (button) { button.disabled = this.locked; button.classList.toggle('selected', this.activeSlot === slot.slotId); button.setAttribute('aria-pressed', String(this.activeSlot === slot.slotId)); }
      if (label) label.textContent = this.slots[slot.slotId]
        ? `「${this.slots[slot.slotId].entry.name}」 · ${timeLabel(this.slots[slot.slotId].entry.timeMs)}`
        : this.slotStates[slot.slotId].loading ? '正在载入…' : '未加入';
      if (remove) remove.disabled = this.locked || (!this.slots[slot.slotId] && !this.slotStates[slot.slotId].loading);
    }
    for (const { button, entry, slotId } of this.pickerButtons) {
      const selected = this.slots[slotId]?.entry.id === entry.id;
      button.disabled = this.locked || this.slotStates[slotId].loading;
      button.textContent = `${selected ? '已选' : '选'}${GHOST_SLOTS[slotId].colorLabel}`;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', `${selected ? '移除' : '选择'}「${entry.name}」为${GHOST_SLOTS[slotId].colorLabel}幽灵`);
    }
    const retry = this.node('ghost-picker-retry'); if (retry) retry.disabled = this.locked;
  }
  clearSelection(message, clearMatches = false) {
    const state = this.slotStates[this.activeSlot]; state.request++; state.searching = false; state.loading = false;
    if (clearMatches) { state.matches = []; state.choice = ''; this.node('ghost-choice').replaceChildren(); this.node('ghost-choice').value = ''; }
    if (message) this.status(message); this.controls();
  }
  selectSlot(slotId) {
    if (this.locked || ![0, 1].includes(slotId)) return;
    this.slotStates[this.activeSlot].name = normalizeName(this.node('ghost-name').value);
    this.activeSlot = slotId; this.node('ghost-enabled').checked = true;
    if (this.pendingChallenge) this.prepareChallenge(this.pendingChallenge, slotId);
    this.renderChoices(); this.onSelection(this.selections());
  }
  removeSlot(slotId) {
    if (this.locked || ![0, 1].includes(slotId)) return;
    this.pendingChallenge = null;
    const state = this.slotStates[slotId]; state.request++; state.searching = false; state.loading = false;
    state.matches = []; state.choice = ''; this.select(null, slotId);
    this.status(`${GHOST_SLOTS[slotId].colorLabel}幽灵已移除。`, slotId);
    if (slotId === this.activeSlot) this.renderChoices();
  }
  init() {
    this.node('ghost-enabled').checked = false;
    this.slotStates[0].name = this.remembered(1); this.slotStates[1].name = this.remembered(2);
    this.node('ghost-enabled').addEventListener('change', () => {
      if (this.locked) return;
      for (const state of this.slotStates) { state.request++; state.searching = false; state.loading = false; }
      this.status(this.node('ghost-enabled').checked ? '选择紫色或金色，再查找想挑战的昵称。' : '本场不带幽灵，已选记录会保留供下次使用。');
      this.onSelection(this.node('ghost-enabled').checked ? this.selections() : []); this.controls();
    });
    this.node('ghost-name').addEventListener('input', () => {
      if (!this.locked) { this.pendingChallenge = null; this.slotStates[this.activeSlot].name = normalizeName(this.node('ghost-name').value); this.clearSelection('昵称已修改，请重新查找；已加入的幽灵会保留。', true); }
    });
    this.node('ghost-search-form').addEventListener('submit', event => { event.preventDefault(); return this.search(); });
    this.node('ghost-choice').addEventListener('change', () => {
      if (!this.locked) { this.slotStates[this.activeSlot].choice = this.node('ghost-choice').value; this.clearSelection(`点击「${this.node('ghost-load').textContent}」确认。`); }
    });
    this.node('ghost-load').addEventListener('click', () => this.loadSelected());
    for (const slot of GHOST_SLOTS) {
      this.node(`ghost-slot-${slot.slotId}`)?.addEventListener('click', () => this.selectSlot(slot.slotId));
      this.node(`ghost-remove-${slot.slotId}`)?.addEventListener('click', () => this.removeSlot(slot.slotId));
    }
    this.node('ghost-picker-retry')?.addEventListener('click', () => this.loadPickerBoard());
    if (!this.recordsManaged) this.node('lap-retry').addEventListener('click', () => this.loadBoard());
    this.renderChoices(); this.status('可以选择两个不同颜色的幽灵，也可以直接发车。');
    if (!this.recordsManaged) { this.node('ghost-results').hidden = true; return this.loadBoard(); }
    return Promise.resolve();
  }
  async request(path, body) {
    const controller = new AbortController(), version = this.version, city = this.city; let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('连接超时，请重试。')); }, this.timeoutMs);
    });
    try {
      return await Promise.race([Promise.resolve().then(() => this.fetchImpl(this.origin + path, {
        method: body ? 'POST' : 'GET', signal: controller.signal,
        headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}),
      })).then(async response => {
        const data = await response.json();
        if (!response.ok) {
          const error = new Error(response.status === 404 ? '这份幽灵已不存在，请重新查找。' : '暂时无法连接记录服务，请稍后重试。');
          error.status = response.status; throw error;
        }
        if (!category(data, version, city)) throw new Error('记录版本已变化，请刷新游戏后重试。');
        return data;
      }), timeout]);
    } catch (error) {
      if (error instanceof Error && /[\u3400-\u9fff]/.test(error.message)) throw error;
      throw new Error('暂时无法连接记录服务，请联网后重试。');
    } finally { clearTimeout(timer); }
  }
  query(extra = '') { return `city=${encodeURIComponent(this.city)}&version=${encodeURIComponent(this.version)}${extra}`; }
  async search() {
    if (this.locked) return;
    const slotId = this.activeSlot, state = this.slotStates[slotId];
    const name = normalizeName(this.node('ghost-name').value); this.pendingChallenge = null;
    this.clearSelection('', true); state.name = name;
    if (!name) { this.status('先输入昵称，最多 16 个字符。'); this.node('ghost-name').focus(); return; }
    this.node('ghost-enabled').checked = true;
    this.node('ghost-name').value = name;
    const request = ++state.request;
    state.searching = true; this.status(`正在为${GHOST_SLOTS[slotId].colorLabel}幽灵查找「${name}」…`, slotId); this.controls();
    try {
      const data = await this.request(`/api/ghosts?${this.query(`&name=${encodeURIComponent(name)}`)}`);
      if (request !== state.request || this.locked) return;
      state.matches = (Array.isArray(data.entries) ? data.entries : []).filter(entry => this.matchesMode(entry))
        .filter(entry => nameKey(entry.name) === nameKey(name)).slice(0, 8).map(copyEntry);
      state.choice = state.matches[0]?.id || '';
      this.status(state.matches.length ? `已找到记录。点击「${this.slots[slotId] ? '替换' : '加入'}${GHOST_SLOTS[slotId].colorLabel}幽灵」确认。`
        : `还没有「${name}」的${this.laps === 3 ? '完整 3 圈' : '单圈'}幽灵。完成对应比赛后，可以在成绩区保存。`, slotId);
      if (slotId === this.activeSlot) this.renderChoices();
    } catch (error) { if (request === state.request && !this.locked) this.status(error.message, slotId); }
    finally { if (request === state.request) { state.searching = false; this.controls(); } }
  }
  async loadSelected() {
    const slotId = this.activeSlot, state = this.slotStates[slotId];
    if (this.locked || !this.node('ghost-enabled').checked || state.loading) return;
    const id = this.node('ghost-choice').value, match = state.matches.find(entry => entry.id === id);
    if (!match) { this.status('请先查找并选择一份幽灵。'); return; }
    state.choice = id; this.pendingChallenge = null;
    const request = ++state.request; state.loading = true;
    this.status(`正在载入${GHOST_SLOTS[slotId].colorLabel}幽灵…`, slotId); this.controls();
    try {
      const data = await this.request(`/api/ghosts/${encodeURIComponent(id)}?${this.query()}`);
      if (request !== state.request || this.locked) return;
      if (!this.matchesMode(data.entry) || data.entry.id !== id || nameKey(data.entry.name) !== nameKey(match.name)
        || !(this.laps === 3 ? validateRaceReplay(data.replay) : validGhostReplay(data.replay)) || data.entry.timeMs !== data.replay.durationMs) {
        throw new Error('这份幽灵数据不完整，请重新查找。');
      }
      this.select({ entry: copyEntry(data.entry), replay: copyReplay(data.replay) }, slotId);
      this.status(`${GHOST_SLOTS[slotId].colorLabel}已就绪：「${data.entry.name}」 · ${timeLabel(data.entry.timeMs)}。可切换颜色挑选或更换幽灵，准备好后确认发车。`, slotId);
    } catch (error) { if (request === state.request && !this.locked) this.status(error.message, slotId); }
    finally { if (request === state.request) { state.loading = false; this.controls(); } }
    return this.slots[slotId];
  }
  prepareChallenge(entry, slotId) {
    const state = this.slotStates[slotId]; state.request++; state.searching = false; state.loading = false;
    state.name = normalizeName(entry.name); state.matches = [copyEntry(entry)]; state.choice = entry.id;
    state.message = `要把「${entry.name}」加入哪种颜色？选择紫色或金色后，点击加入按钮。${this.slots[slotId] ? ' 当前颜色已有幽灵，确认后会替换。' : ''}`;
  }
  challenge(entry) {
    if (this.locked || !this.matchesMode(entry)) return null;
    this.node('ghost-enabled').checked = true; this.pendingChallenge = copyEntry(entry);
    this.prepareChallenge(entry, this.activeSlot); this.renderChoices(); this.onSelection(this.selections());
    return copyEntry(entry);
  }
  setLaps(laps) {
    if (this.locked || ![1, 3].includes(Number(laps))) return;
    const next = Number(laps);
    if (next === this.laps) return;
    this.laps = next; this.resetPickerCategory();
  }
  setTrack(city) {
    if (this.locked || !['coast', 'coast-bay', 'coast-pines', 'coast-neon', 'coast-marina', 'coast-ridge', 'coast-grand', 'coast-london', 'coast-beijing', 'coast-austin', 'coast-rio', 'coast-paris'].includes(city)
      || city === this.city) return;
    this.city = city; this.resetPickerCategory();
  }
  resetPickerCategory() {
    this.pickerRequest++; this.boardRequest++; this.pendingChallenge = null;
    this.slots = [null, null]; this.pickerButtons = [];
    for (const state of this.slotStates) {
      state.request++; state.searching = false; state.loading = false; state.matches = []; state.choice = '';
      state.message = this.laps === 3 ? '本场只显示当前赛道完整 3 圈幽灵，计时从发车到完赛。' : '本场只显示当前赛道的单圈幽灵，挑战一圈极限。';
    }
    this.node('ghost-picker-list')?.replaceChildren();
    this.renderChoices(); this.onSelection([]);
  }
  openPicker(laps = 3) {
    if (this.locked) return Promise.resolve();
    this.setLaps(laps);
    this.controls();
    return this.loadPickerBoard();
  }
  async chooseRankedGhost(entry, slotId) {
    if (this.locked || !this.matchesMode(entry) || ![0, 1].includes(slotId) || this.slotStates[slotId].loading) return;
    if (this.slots[slotId]?.entry.id === entry.id) { this.removeSlot(slotId); return; }
    this.pendingChallenge = null;
    this.selectSlot(slotId); this.prepareChallenge(entry, slotId); this.renderChoices();
    return this.loadSelected();
  }
  renderPickerBoard(entries) {
    const list = this.node('ghost-picker-list'); if (!list) return;
    const seen = new Set();
    const clean = (Array.isArray(entries) ? entries : []).filter(entry => this.matchesMode(entry)).sort((a, b) => a.timeMs - b.timeMs)
      .filter(entry => { const key = entry.id; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 5);
    list.replaceChildren(); this.pickerButtons = [];
    for (const [index, entry] of clean.entries()) {
      const row = this.el('li', 'ghost-picker-row');
      row.appendChild(this.el('span', 'ghost-picker-rank', String(index + 1).padStart(2, '0')));
      const driver = this.el('div', 'ghost-picker-driver');
      const nickname=this.el('strong', '', normalizeName(entry.name));nickname.setAttribute('translate','no');driver.appendChild(nickname);
      driver.appendChild(this.el('span', '', timeLabel(entry.timeMs))); row.appendChild(driver);
      const actions = this.el('div', 'ghost-picker-choices');
      for (const slot of GHOST_SLOTS) {
        const button = this.el('button', `ghost-picker-choice ${slot.slotId === 0 ? 'purple' : 'gold'}`);
        button.type = 'button';
        button.addEventListener('click', () => this.chooseRankedGhost(entry, slot.slotId));
        this.pickerButtons.push({ button, entry, slotId: slot.slotId }); actions.appendChild(button);
      }
      row.appendChild(actions); list.appendChild(row);
    }
    this.node('ghost-picker-status').textContent = clean.length
      ? `${this.laps === 3 ? '完整 3 圈' : '最快单圈'}前五 · 点颜色加入，再点一次取消。已选颜色可替换。`
      : `还没有${this.laps === 3 ? '完整 3 圈' : '单圈'}幽灵上榜。可以直接出发，完赛后保存自己的幽灵。`;
    this.node('ghost-picker-retry').hidden = true;
    this.controls();
  }
  async loadPickerBoard() {
    if (this.locked || !this.node('ghost-picker-list')) return;
    const request = ++this.pickerRequest;
    const title = this.node('ghost-picker-title'); if (title) title.textContent = this.laps === 3 ? '完整 3 圈幽灵榜' : '最快单圈幽灵榜';
    this.node('ghost-picker-status').textContent = `正在读取可挑战的${this.laps === 3 ? '完整 3 圈' : '单圈'}记录…`;
    this.node('ghost-picker-retry').hidden = true;
    try {
      const data = await this.request(`/api/laps?${this.query()}`);
      if (request === this.pickerRequest && !this.locked) this.renderPickerBoard(data.entries);
    } catch (error) {
      if (request !== this.pickerRequest || this.locked) return;
      this.node('ghost-picker-status').textContent = `${error.message} 可以按昵称查找，或直接出发。`;
      this.node('ghost-picker-retry').hidden = false;
    }
  }
  startRace() {
    const chosen = this.node('ghost-enabled').checked ? this.selections() : [];
    this.locked = true; this.pendingChallenge = null; this.pickerRequest++;
    for (const state of this.slotStates) { state.request++; state.searching = false; state.loading = false; }
    this.resultsToken++; this.cards = [];
    if (!this.recordsManaged) { this.node('ghost-result-list').replaceChildren(); this.node('ghost-results').hidden = true; }
    this.status(chosen.length ? `本场幽灵：${chosen.map(ghost => `${ghost.colorLabel} · 「${ghost.entry.name}」`).join(' / ')}` : '本场未载入幽灵。回到发车准备后可以选择。');
    this.controls();
    return Object.freeze(chosen.map(ghost => {
      const replay = copyReplay(ghost.replay);
      replay.frames.forEach(Object.freeze); Object.freeze(replay.frames); if (replay.lapEndsMs) Object.freeze(replay.lapEndsMs); Object.freeze(replay);
      return Object.freeze({ ...GHOST_SLOTS[ghost.slotId], entry: Object.freeze(copyEntry(ghost.entry)), replay });
    }));
  }
  endRace() {
    this.locked = false; this.controls();
    this.status(this.selected ? `${GHOST_SLOTS[this.activeSlot].colorLabel}已就绪：「${this.selected.entry.name}」 · ${timeLabel(this.selected.entry.timeMs)}`
      : '选择一个颜色，查找想挑战的幽灵；也可以直接发车。');
  }
  menu() { this.endRace(); }
  renderBoard(entries) {
    const seen = new Set();
    const clean = (Array.isArray(entries) ? entries : []).filter(validEntry).sort((a, b) => a.timeMs - b.timeMs)
      .filter(entry => { if (seen.has(entry.id)) return false; seen.add(entry.id); return true; }).slice(0, 5);
    const list = this.node('lap-list'); list.replaceChildren();
    for (const [index, entry] of clean.entries()) {
      const row = this.el('li', 'leaderboard-row');
      row.appendChild(this.el('span', 'record-rank', String(index + 1).padStart(2, '0')));
      const identity = this.el('div', 'record-identity'); identity.appendChild(this.el('strong', '', normalizeName(entry.name)));
      identity.appendChild(this.el('small', '', entry.mode === 'ai' ? '单人挑战 AI' : '本地双人'));
      row.appendChild(identity); row.appendChild(this.el('strong', 'record-time', timeLabel(entry.timeMs))); list.appendChild(row);
    }
    this.node('lap-status').textContent = clean.length ? '海港 · 全站最快单圈前五，每个昵称保留最好成绩。' : '单圈榜还空着，完成一圈并保存，就能留下第一条记录。';
    this.node('lap-retry').hidden = true;
  }
  async loadBoard() {
    const request = ++this.boardRequest; this.node('lap-status').textContent = '正在读取最快单圈…'; this.node('lap-retry').hidden = true;
    try {
      const data = await this.request(`/api/laps?${this.query()}`);
      if (request === this.boardRequest) this.renderBoard(data.entries);
    } catch (error) {
      if (request !== this.boardRequest) return;
      this.node('lap-status').textContent = `${error.message} 游戏仍可正常进行。`; this.node('lap-retry').hidden = false;
    }
  }
  showResults(results) {
    const token = ++this.resultsToken, seen = new Set(); this.cards = [];
    const list = this.node('ghost-result-list'); list.replaceChildren();
    for (const result of Array.isArray(results) ? results : []) {
      if (!human(result) || seen.has(result.playerId) || !validGhostReplay(result.replay)) continue;
      seen.add(result.playerId);
      const card = { id: uuid(), playerId: result.playerId, mode: result.mode, replay: copyReplay(result.replay), token,
        submitting: false, done: false, submissionName: null, composing: false };
      const form = this.el('form', 'ghost-save-card');
      const title = this.el('h3', '', `${result.playerId === 1 ? '青色车手 · P1' : '橙色车手 · P2'} · ${timeLabel(result.replay.durationMs)}`);
      form.appendChild(title); form.appendChild(this.el('p', 'ghost-help', '本局最快有效单圈 · 保存后可按昵称找到幽灵'));
      const label = this.el('label', 'ghost-save-label', '你的昵称');
      card.input = this.el('input'); card.input.type = 'text'; card.input.name = 'ghost-nickname'; card.input.autocomplete = 'nickname';
      card.input.value = this.remembered(result.playerId); card.input.required = true; card.input.setAttribute('aria-label', `P${result.playerId} 幽灵昵称`);
      label.appendChild(card.input); form.appendChild(label);
      card.button = this.el('button', 'ghost-button', '保存单圈与幽灵'); card.button.type = 'submit'; form.appendChild(card.button);
      card.message = this.el('p', 'ghost-help', '昵称、单圈时间和驾驶轨迹会公开。每个昵称只保留最快的一圈。');
      card.message.setAttribute('role', 'status'); form.appendChild(card.message);
      card.input.addEventListener('compositionstart', () => { card.composing = true; });
      card.input.addEventListener('compositionend', () => { card.composing = false; card.input.value = normalizeName(card.input.value); });
      form.addEventListener('submit', event => { event.preventDefault(); return this.save(card); });
      this.cards.push(card); list.appendChild(form);
    }
    this.node('ghost-results').hidden = this.cards.length === 0;
  }
  async save(card) {
    if (this.locked || card.token !== this.resultsToken || card.submitting || card.done || card.composing) return;
    const name = card.submissionName || normalizeName(card.input.value);
    if (!name) { card.message.textContent = '请输入昵称，最多 16 个字符。'; card.input.focus(); return; }
    card.submissionName = name; card.input.value = name; this.remember(card.playerId, name);
    card.submitting = true; card.button.disabled = true; card.input.disabled = true; card.message.textContent = '正在保存单圈与幽灵…';
    try {
      const data = await this.request('/api/laps', { id: card.id, version: GHOST_VERSION, city: CITY,
        timeMs: card.replay.durationMs, name, playerId: card.playerId, mode: card.mode, replay: card.replay });
      if (card.token !== this.resultsToken) return;
      if (typeof data.saved !== 'boolean' || !validEntry(data.entry) || nameKey(data.entry.name) !== nameKey(name)) throw new Error('未确认保存结果。');
      card.done = true; card.button.textContent = data.saved ? '已保存' : '已保留更快纪录';
      card.message.textContent = data.saved ? `「${name}」的单圈与幽灵已保存，下次开赛前搜索这个昵称即可。`
        : `「${name}」已有更快纪录 ${timeLabel(data.entry.timeMs)}，继续保留原来的幽灵。`;
      this.renderBoard(data.entries); await this.loadBoard();
    } catch {
      if (card.token !== this.resultsToken) return;
      card.message.textContent = '未能确认保存。原昵称和成绩已保留，联网后重试；不会重复提交。'; card.button.textContent = '重试保存';
    } finally {
      if (card.token === this.resultsToken) { card.submitting = false; card.button.disabled = card.done; card.input.disabled = card.submissionName !== null; }
    }
  }
}
