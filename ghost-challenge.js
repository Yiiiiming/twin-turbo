import { normalizeName, leaderboardNameKey } from './leaderboard.js';
import { ghostVersionForCity, validateReplay, validateRaceReplay, sampleReplay, GHOST_LIMITS } from './ghost-replay.js';

export const CHALLENGE_COLORS = Object.freeze([
  { color: '#b8a2ed', colorLabel: '紫色', colorLabelEn: 'Violet' },
  { color: '#ffd166', colorLabel: '金色', colorLabelEn: 'Gold' },
  { color: '#ff76b8', colorLabel: '玫红', colorLabelEn: 'Pink' },
  { color: '#66e6aa', colorLabel: '薄荷', colorLabelEn: 'Mint' },
  { color: '#70a5ff', colorLabel: '蓝色', colorLabelEn: 'Blue' },
  { color: '#e6e8f2', colorLabel: '银色', colorLabelEn: 'Silver' },
].map((color, slotId) => Object.freeze({ slotId, ...color })));
// These clocks are fixed before the race. They never react to the live player.
// A single smooth cycle moves the strongest effort from early to middle to late.
export const PACE_PROFILES = Object.freeze([
  { durationRatio: .985, amplitude: .16, phase: Math.PI },
  { durationRatio: 1.005, amplitude: .16, phase: Math.PI / 3 },
  { durationRatio: 1.035, amplitude: .16, phase: -Math.PI / 3 },
].map(profile => Object.freeze(profile)));
const FALLBACK_DELAYS_MS = [980, 2020, 3070];
const API_ORIGIN = 'https://twin-turbo-records-yiiiiming.heym0701.chatgpt.site';
const validDistance = laps => laps === 1 || laps === 3;
const replayValid = (replay, laps) => laps === 3 ? validateRaceReplay(replay) : validateReplay(replay);
const copyReplay = replay => ({ ...replay, frames: replay.frames.map(frame => [...frame]),
  ...(replay.lapEndsMs ? { lapEndsMs: [...replay.lapEndsMs] } : {}) });
const validEntry = (entry, laps) => entry && typeof entry.id === 'string'
  && /^[a-zA-Z0-9_-]{8,128}$/.test(entry.id) && normalizeName(entry.name)
  && Number.isSafeInteger(entry.timeMs) && entry.timeMs >= (laps === 3 ? 75000 : 25000)
  && entry.timeMs <= GHOST_LIMITS.maxDurationMs && [1, 2].includes(entry.playerId)
  && ['local', 'ai'].includes(entry.mode) && !(entry.mode === 'ai' && entry.playerId === 2)
  && entry.isAI !== true && entry.isHuman !== false
  && (laps === 3 ? entry.kind === 'race' && entry.laps === 3
    : (entry.kind === undefined || entry.kind === 'lap') && (entry.laps === undefined || entry.laps === 1));

function resamplePace(replay, durationMs, profile, strength) {
  const amplitude = profile.amplitude * strength, tau = Math.PI * 2;
  // Source progress -> target clock. Its derivative lies in [0.84, 1.16],
  // so the car always advances continuously, with no step in pace or reversal.
  const clock = progress => progress + amplitude / tau
    * (Math.sin(tau * progress + profile.phase) - Math.sin(profile.phase));
  const sourceAt = time => {
    const target = time / durationMs;
    let low = 0, high = 1;
    for (let i = 0; i < 36; i++) {
      const middle = (low + high) / 2;
      if (clock(middle) < target) low = middle; else high = middle;
    }
    return (low + high) / 2 * replay.durationMs;
  };
  const lapEndsMs = replay.lapEndsMs?.map((time, index, ends) => index === ends.length - 1
    ? durationMs : Math.round(durationMs * clock(time / replay.durationMs)));
  // Frame sampling, checkpoint passages and lap ends all share this one clock.
  // Insert exact lap poses at rounded boundary milliseconds to avoid losing a
  // finish between two 100 ms render samples, including an uneven three-lap run.
  const times = new Set([0, durationMs, ...(lapEndsMs || [])]);
  for (let time = 100; time < durationMs; time += 100) times.add(time);
  const frames = [...times].sort((a, b) => a - b).map(time => {
    const boundary = lapEndsMs?.indexOf(time) ?? -1;
    const sourceTime = time === 0 ? 0 : time === durationMs ? replay.durationMs
      : boundary !== -1 ? replay.lapEndsMs[boundary] : sourceAt(time);
    const pose = sampleReplay(replay, sourceTime);
    return [time, pose.x, pose.y, pose.angle, pose.elevation];
  });
  return { version: 1, durationMs, frames,
    ...(replay.kind === 'race' ? { kind: 'race', laps: 3, lapEndsMs } : {}) };
}

/** Re-time only the recorded path; human records and live race physics are untouched. */
export function paceReplay(replay, durationMs, profileIndex = 0) {
  const laps = replay?.kind === 'race' ? 3 : 1, profile = PACE_PROFILES[profileIndex];
  if (!Number.isInteger(profileIndex) || !profile || !replayValid(replay, laps) || !Number.isSafeInteger(durationMs)
    || durationMs < GHOST_LIMITS.minDurationMs * laps || durationMs > GHOST_LIMITS.maxDurationMs) return null;
  // An archived trace can already sit at a validator limit. Reduce the rhythm
  // before trying the old uniform clock; never weaken replay validation.
  for (const strength of [1, .5, 0]) {
    const paced = resamplePace(replay, durationMs, profile, strength);
    if (replayValid(paced, laps)) return paced;
  }
  return null;
}

/** Build a fresh race roster. Synthetic entries are deliberately not valid score submissions. */
export function createGhostChallenge(candidates = [], laps = 1) {
  if (!validDistance(laps)) throw new RangeError('Ghost Challenge supports one or three laps.');
  const names = new Set();
  const humans = candidates.filter(value => validEntry(value?.entry, laps)
    && replayValid(value.replay, laps) && value.entry.timeMs === value.replay.durationMs)
    .sort((a, b) => a.entry.timeMs - b.entry.timeMs)
    .filter(value => {
      const name = leaderboardNameKey(value.entry.name);
      if (names.has(name)) return false;
      names.add(name); return true;
    }).slice(0, 3);
  const ghosts = humans.map((value, index) => ({ ...CHALLENGE_COLORS[index],
    entry: { ...value.entry, name: normalizeName(value.entry.name) }, replay: copyReplay(value.replay),
    synthetic: false, targetMs: value.entry.timeMs }));
  if (humans.length) for (const [index, profile] of PACE_PROFILES.entries()) {
    const source = humans[[0, Math.floor(humans.length / 2), humans.length - 1][index]];
    const target = Math.max(GHOST_LIMITS.minDurationMs * laps,
      Math.min(GHOST_LIMITS.maxDurationMs, Math.round(source.entry.timeMs * profile.durationRatio)));
    const replay = paceReplay(source.replay, target, index)
      || paceReplay(source.replay, Math.min(GHOST_LIMITS.maxDurationMs, source.entry.timeMs + FALLBACK_DELAYS_MS[index]), index);
    if (!replay) continue;
    const targetMs = replay.durationMs;
    ghosts.push({ ...CHALLENGE_COLORS[index + 3], synthetic: true, targetMs, replay,
      entry: { id: `pace-${index + 1}-${source.entry.id}`, name: `配速幽灵 ${index + 1}`,
        nameEn: `Pace Ghost ${index + 1}`, timeMs: targetMs, playerId: 0, mode: 'ghost',
        isAI: true, isHuman: false, ...(laps === 3 ? { kind: 'race', laps: 3 } : {}) } });
  }
  return { laps, ghosts, humanCount: humans.length, paceCount: ghosts.length - humans.length };
}

/** Read the matching public board and immutable replay IDs; never save synthetic opponents. */
export async function loadGhostChallenge({ city, laps = 1, fetchImpl = (...args) => globalThis.fetch(...args),
  origin = API_ORIGIN, signal, timeoutMs = 20000 } = {}) {
  if (!validDistance(laps) || typeof city !== 'string') throw new TypeError('Invalid ghost challenge category.');
  const version = ghostVersionForCity(city, laps), controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Ghost challenge request timed out.')), timeoutMs);
  const base = origin.replace(/\/$/, '');
  const params = new URLSearchParams({ city, version });
  const read = async path => {
    const response = await fetchImpl(`${base}${path}?${params}`, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Ghost challenge request failed.');
    const body = await response.json();
    if (body?.city !== city || body?.version !== version) throw new Error('Ghost challenge category mismatch.');
    return body;
  };
  try {
    const board = await read('/api/laps');
    if (!Array.isArray(board.entries)) throw new Error('Invalid ghost challenge board.');
    const entries = board.entries.filter(entry => validEntry(entry, laps)).sort((a, b) => a.timeMs - b.timeMs).slice(0, 20);
    const loaded = [], names = new Set();
    let failedCount = 0;
    for (const entry of entries) {
      const name = leaderboardNameKey(entry.name);
      if (names.has(name)) continue;
      try {
        const data = await read(`/api/ghosts/${encodeURIComponent(entry.id)}`);
        if (data.entry?.id !== entry.id || leaderboardNameKey(data.entry.name) !== name
          || data.entry.timeMs !== entry.timeMs || !validEntry(data.entry, laps)
          || !replayValid(data.replay, laps) || data.replay.durationMs !== entry.timeMs) throw new Error('Invalid challenge replay.');
        loaded.push({ entry: data.entry, replay: data.replay }); names.add(name);
        if (loaded.length === 3) break;
      } catch (error) {
        if (controller.signal.aborted) throw error;
        failedCount++;
      }
    }
    return { ...createGhostChallenge(loaded, laps), city, version, failedCount };
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}
