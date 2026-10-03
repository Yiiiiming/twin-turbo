/** Pure leaderboard rules shared by the game and the score service. */
export const LEADERBOARD_VERSION = 'twin-turbo-technical-v2-363-517';
export const LEADERBOARD_LIMIT = 5;
export const LEADERBOARD_CITIES = Object.freeze(['coast', 'london']);
const SUPPORTED_LAPS = [3, 5];
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}\p{Cs}]/gu;

/** Scores created before city selection belong to the original coast circuit. */
export function normalizeCity(value) {
  if (value === undefined) return 'coast';
  return LEADERBOARD_CITIES.includes(value) ? value : null;
}

/** Keep names as plain text; render them with textContent in any UI. */
export function normalizeName(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(CONTROL_CHARACTERS, '').trim()).slice(0, 16).join('').trim();
}

function humanCompetitor(value) {
  return (value.playerId === 1 || value.playerId === 2)
    && (value.mode === 'local' || value.mode === 'ai')
    && !(value.mode === 'ai' && value.playerId === 2)
    && value.isAI !== true && value.isHuman !== false;
}

function validScore(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && SUPPORTED_LAPS.includes(value.laps)
    && normalizeCity(value.city) !== null
    && Number.isSafeInteger(value.timeMs) && value.timeMs > 0
    && humanCompetitor(value);
}

function normalizeRecord(value) {
  if (!validScore(value)) return null;
  const name = normalizeName(value.name);
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!name || !id || id.length > 128 || id.replace(CONTROL_CHARACTERS, '') !== id
    || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0) return null;
  return { id, name, timeMs: value.timeMs, laps: value.laps, city: normalizeCity(value.city),
    playerId: value.playerId, mode: value.mode, createdAt: value.createdAt };
}

/**
 * Copy, validate and order records for exactly one city (legacy default: coast).
 * Without laps, return its 3-lap board then 5-lap board. Equal times retain their
 * existing order. IDs are deduplicated within each city/lap category.
 */
export function normalizeEntries(entries, laps, city = 'coast') {
  if (!Array.isArray(entries) || normalizeCity(city) === null
    || (laps !== undefined && !SUPPORTED_LAPS.includes(laps))) return [];
  const seen = new Set(), records = [];
  for (const value of entries) {
    const record = normalizeRecord(value);
    if (!record || record.city !== city || (laps !== undefined && record.laps !== laps)) continue;
    const identity = `${record.city}:${record.laps}:${record.id}`;
    if (seen.has(identity)) continue;
    seen.add(identity); records.push(record);
  }
  records.sort((a, b) => a.laps - b.laps || a.timeMs - b.timeMs);
  const count = new Map();
  return records.filter(record => {
    const rank = (count.get(record.laps) || 0) + 1;
    count.set(record.laps, rank);
    return rank <= LEADERBOARD_LIMIT;
  });
}

/** Return a one-based rank only for a finished human result that makes top 5. */
export function qualifyingRank(entries, result) {
  if (!validScore(result) || result.finished !== true) return null;
  const board = normalizeEntries(entries, result.laps, normalizeCity(result.city));
  // A new tie follows every existing tie; matching fifth place is not enough.
  const rank = board.filter(entry => entry.timeMs <= result.timeMs).length + 1;
  return rank <= LEADERBOARD_LIMIT ? rank : null;
}

/**
 * Insert an already verified finished score as a canonical stored record.
 * The service must verify the finish and qualification inside its transaction;
 * this data function cannot establish whether a submitted game really finished.
 * Existing same-ID records win, so retrying one submission never duplicates it.
 */
export function insertRecord(entries, record) {
  const existing = LEADERBOARD_CITIES.flatMap(city => normalizeEntries(entries, undefined, city));
  const normalized = normalizeRecord(record);
  if (!normalized || existing.some(entry => entry.city === normalized.city
    && entry.laps === normalized.laps && entry.id === normalized.id)) return existing;
  return LEADERBOARD_CITIES.flatMap(city => normalizeEntries([...existing, normalized], undefined, city));
}
