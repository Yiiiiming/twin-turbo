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
// Each slot distributes only added delay across a different part of the run.
export const PACE_PROFILES = Object.freeze([
  { delayMs: 1000, amplitude: .98, phase: Math.PI * 4 / 3 },
  { delayMs: 2000, amplitude: .98, phase: 0 },
  { delayMs: 3000, amplitude: .98, phase: Math.PI * 2 / 3 },
].map(profile => Object.freeze(profile)));
export const PACE_SPEED_LIMIT = 517;
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

/** durationMs is a minimum target, never a deadline that permits acceleration.
 * Keep every original path vertex: resampling across a corner could cut its
 * chord and invalidate the corresponding-segment speed bound. This is a speed
 * bound, not a claim that the replay proves acceleration or nitro feasibility.
 */
export function paceReplay(replay, durationMs, profileIndex = 0) {
  const laps = replay?.kind === 'race' ? 3 : 1, profile = PACE_PROFILES[profileIndex];
  if (!Number.isInteger(profileIndex) || !profile || !replayValid(replay, laps) || !Number.isSafeInteger(durationMs)
    || durationMs <= replay.durationMs || durationMs > GHOST_LIMITS.maxDurationMs) return null;
  const times = [...new Set([...replay.frames.map(frame => frame[0]), ...(replay.lapEndsMs || [])])].sort((a,b)=>a-b);
  const poses = times.map(time=>sampleReplay(replay,time)),segments=[];
  for(let i=1;i<times.length;i++){
    const dt=times[i]-times[i-1],a=poses[i-1],b=poses[i];
    segments.push({start:times[i-1],end:times[i],a,b,minimum:Math.max(dt,Math.hypot(b.x-a.x,b.y-a.y)*1000/PACE_SPEED_LIMIT)});
  }
  const minimum=segments.reduce((sum,segment)=>sum+segment.minimum,0);
  // The positive floor maintains distinct rhythms even when the speed cap
  // already requires more time than the requested target. Nothing is squeezed.
  const delay=Math.max(300,durationMs-minimum),tau=Math.PI*2;
  const integral=u=>u+profile.amplitude/tau*(Math.sin(tau*u+profile.phase)-Math.sin(profile.phase));
  const first=poses[0],frames=[[0,first.x,first.y,first.angle,first.elevation]],lapEndsMs=[];
  let elapsed=0;
  for(const segment of segments){
    const extra=delay*(integral(segment.end/replay.durationMs)-integral(segment.start/replay.durationMs));
    // Strictly positive delay plus upward integer rounding guarantees dt >=
    // source dt and dt >= distance/517, including one-millisecond source gaps.
    const dt=Math.ceil(segment.minimum+Math.max(Number.EPSILON,extra)),parts=Math.ceil(dt/100);
    if(elapsed+dt>GHOST_LIMITS.maxDurationMs||frames.length+parts>GHOST_LIMITS.maxFrames)return null;
    for(let part=1;part<=parts;part++){
      const offset=Math.round(part*dt/parts),u=offset/dt;
      const pose=part===parts?segment.b:sampleReplay(replay,segment.start+(segment.end-segment.start)*u);
      frames.push([elapsed+offset,pose.x,pose.y,pose.angle,pose.elevation]);
    }
    elapsed+=dt;
    if(replay.lapEndsMs?.includes(segment.end))lapEndsMs.push(elapsed);
  }
  const paced={version:1,durationMs:elapsed,frames,...(laps===3?{kind:'race',laps:3,lapEndsMs}:{})};
  return elapsed>=durationMs&&replayValid(paced,laps)?paced:null;
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
    const source = humans[0],target=humans.at(-1).entry.timeMs+profile.delayMs;
    const replay = paceReplay(source.replay, target, index);
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
