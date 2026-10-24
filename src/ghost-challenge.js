import { normalizeName, leaderboardNameKey } from './leaderboard.js';
import { ghostVersionForCity, validateReplay, validateRaceReplay, sampleReplay, GHOST_LIMITS } from './ghost-replay.js';
import { displayNickname } from './display-names.js';

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
// Three human places may be close together, including equal millisecond clocks.
const HUMAN_LIMIT = 3;
const HUMAN_GAP_MAX_MS = 1500;
const PACE_GAP_MS = Object.freeze({ minimum: 800, maximum: 1200 });
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
    segments.push({start:times[i-1],end:times[i],a,b,minimum:Math.ceil(Math.max(dt,Math.hypot(b.x-a.x,b.y-a.y)*1000/PACE_SPEED_LIMIT))});
  }
  const minimum=segments.reduce((sum,segment)=>sum+segment.minimum,0);
  // The positive floor maintains distinct rhythms even when the speed cap
  // already requires more time than the requested target. Nothing is squeezed.
  const delay=Math.max(300,durationMs-minimum),tau=Math.PI*2;
  const integral=u=>u+profile.amplitude/tau*(Math.sin(tau*u+profile.phase)-Math.sin(profile.phase));
  // Assign the integer delay as a whole, avoiding both accumulated +1ms
  // segment drift and alternating cumulative-rounding speed jitter.
  const extras=segments.map(segment=>(delay-1)*(integral(segment.end/replay.durationMs)-integral(segment.start/replay.durationMs)));
  const extraMs=extras.map(value=>Math.floor(Math.max(0,value)));
  const remainder=delay-1-extraMs.reduce((sum,value)=>sum+value,0);
  const remainderOrder=extras.map((value,index)=>({index,fraction:value-extraMs[index]}))
    .sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
  for(let i=0;i<remainder;i++)extraMs[remainderOrder[i].index]++;
  extraMs[0]++; // Keep the first moving pose strictly behind the human clock.
  const first=poses[0],frames=[[0,first.x,first.y,first.angle,first.elevation]],lapEndsMs=[];
  let elapsed=0;
  for(const [index,segment]of segments.entries()){
    const dt=segment.minimum+extraMs[index],parts=Math.ceil(dt/100);
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

const compareEntries=(a,b)=>a.timeMs-b.timeMs||a.id.localeCompare(b.id);
function ladderCandidates(entries,previous,usedNames,usedIds,firstTime){
  const available=entries.filter(entry=>!usedIds.has(entry.id));
  if(previous===undefined)return available.sort(compareEntries);
  // Choosing a different driver must not discard a close earlier run that can
  // fill the third human place. The finished roster is sorted by actual time.
  return available.filter(entry=>entry.timeMs>=firstTime&&entry.timeMs<=previous+HUMAN_GAP_MAX_MS)
    .sort((a,b)=>Number(usedNames.has(leaderboardNameKey(a.name)))-Number(usedNames.has(leaderboardNameKey(b.name)))
      ||compareEntries(a,b));
}
function challengeRoster(laps,random){
  const ghosts=[],usedNames=new Set(),usedIds=new Set();let humanCount=0,paceCount=0,lastPaceGap=null;
  return {ghosts,usedNames,usedIds,get hasHumanPlace(){return humanCount<HUMAN_LIMIT;},
    get latestTarget(){return ghosts.length?Math.max(...ghosts.map(ghost=>ghost.targetMs)):undefined;},
    human(value){
      ghosts.push({...CHALLENGE_COLORS[ghosts.length],entry:{...value.entry,name:normalizeName(value.entry.name)},
        replay:copyReplay(value.replay),synthetic:false,targetMs:value.entry.timeMs});
      usedNames.add(leaderboardNameKey(value.entry.name));usedIds.add(value.entry.id);humanCount++;
    },
    pace(){
      if(!ghosts.length)return false;
      const roll=random(),range=PACE_GAP_MS.maximum-PACE_GAP_MS.minimum+1;
      let gap=PACE_GAP_MS.minimum+Math.min(range-1,Math.floor(Math.max(0,Number.isFinite(roll)?roll:.5)*range));
      // Fresh matching chooses new clocks. Avoid visually identical neighboring
      // gaps even when random draws land close together; never alter live pace.
      if(lastPaceGap!==null&&Math.abs(gap-lastPaceGap)<60)gap=PACE_GAP_MS.minimum+(gap-PACE_GAP_MS.minimum+173)%range;
      lastPaceGap=gap;
      const source=ghosts[0],target=Math.max(...ghosts.map(ghost=>ghost.targetMs))+gap;
      const replay=paceReplay(source.replay,target,paceCount%PACE_PROFILES.length);
      if(!replay)return false;
      paceCount++;const targetMs=replay.durationMs;
      ghosts.push({...CHALLENGE_COLORS[ghosts.length],synthetic:true,targetMs,replay,
        entry:{id:`pace-${paceCount}-${source.entry.id}`,name:`配速幽灵 ${paceCount}`,nameEn:`Pace Ghost ${paceCount}`,
          timeMs:targetMs,playerId:0,mode:'ghost',isAI:true,isHuman:false,...(laps===3?{kind:'race',laps:3}:{})}});
      return true;
    },
    result(){
      ghosts.sort((a,b)=>a.targetMs-b.targetMs||a.slotId-b.slotId);
      ghosts.forEach((ghost,index)=>Object.assign(ghost,CHALLENGE_COLORS[index]));
      const families=new Map();
      for(const ghost of ghosts)if(!ghost.synthetic){
        const key=leaderboardNameKey(ghost.entry.name);
        if(!families.has(key))families.set(key,[]);
        families.get(key).push(ghost);
      }
      for(const family of families.values())family.forEach((ghost,index)=>{
        const name=family.length>1?family[0].entry.name:ghost.entry.name,suffix=family.length>1?String(index+1):'';
        ghost.displayName=displayNickname(name,suffix);
        ghost.displayFullName=name+suffix;
      });
      return {laps,ghosts,humanCount,paceCount};
    }};
}

/** Human-first ladder with varied 0.8–1.2 second machine steps. */
export function createGhostChallenge(candidates = [], laps = 1, {random=Math.random} = {}) {
  if (!validDistance(laps)) throw new RangeError('Ghost Challenge supports one or three laps.');
  const humans=new Map();
  for(const value of candidates)if(validEntry(value?.entry,laps)&&replayValid(value.replay,laps)
    &&value.entry.timeMs===value.replay.durationMs&&!humans.has(value.entry.id))humans.set(value.entry.id,value);
  const roster=challengeRoster(laps,random),entries=[...humans.values()].map(value=>value.entry);
  while(roster.ghosts.length<CHALLENGE_COLORS.length){
    const [human]=roster.hasHumanPlace?ladderCandidates(entries,roster.latestTarget,roster.usedNames,roster.usedIds,roster.ghosts[0]?.targetMs):[];
    if(human)roster.human(humans.get(human.id));
    else if(!roster.pace())break;
  }
  return roster.result();
}

/** Read public metadata, then load only the replay candidates needed by the ladder. */
export async function loadGhostChallenge({ city, laps = 1, fetchImpl = (...args) => globalThis.fetch(...args),
  origin = API_ORIGIN, signal, timeoutMs = 20000, random = Math.random } = {}) {
  if (!validDistance(laps) || typeof city !== 'string') throw new TypeError('Invalid ghost challenge category.');
  const version = ghostVersionForCity(city, laps), controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Ghost challenge request timed out.')), timeoutMs);
  const base = origin.replace(/\/$/, '');
  const checkAbort=()=>{if(controller.signal.aborted)throw controller.signal.reason||new Error('Ghost challenge cancelled.');};
  const read = async (path,extra={}) => {
    checkAbort();
    const params=new URLSearchParams({city,version,...extra});
    const response = await fetchImpl(`${base}${path}?${params}`, { signal: controller.signal, cache: 'no-store' });
    checkAbort();
    if (!response.ok) throw new Error('Ghost challenge request failed.');
    const body = await response.json();
    checkAbort();
    if (body?.city !== city || body?.version !== version) throw new Error('Ghost challenge category mismatch.');
    return body;
  };
  try {
    const board = await read('/api/laps');
    if (!Array.isArray(board.entries)) throw new Error('Invalid ghost challenge board.');
    const entries=new Map(),names=new Map();
    for(const entry of board.entries.filter(entry=>validEntry(entry,laps)).sort(compareEntries).slice(0,20)){
      if(!entries.has(entry.id))entries.set(entry.id,entry);
      const key=leaderboardNameKey(entry.name);if(!names.has(key))names.set(key,normalizeName(entry.name));
    }
    let failedCount=0,nextName=0;
    const historyNames=[...names.entries()];
    const loadHistory=async()=>{
      while(nextName<historyNames.length){
        const [key,name]=historyNames[nextName++];
        try{
          const history=await read('/api/ghosts',{name});
          if(!Array.isArray(history.entries))throw new Error('Invalid ghost challenge history.');
          for(const entry of history.entries.filter(entry=>validEntry(entry,laps)&&leaderboardNameKey(entry.name)===key)
            .sort(compareEntries).slice(0,20))if(!entries.has(entry.id))entries.set(entry.id,entry);
        }catch(error){if(controller.signal.aborted)throw error;failedCount++;}
      }
    };
    await Promise.all(Array.from({length:Math.min(4,historyNames.length)},loadHistory));
    const roster=challengeRoster(laps,random),failedIds=new Set();let detailReads=0;
    while(roster.ghosts.length<CHALLENGE_COLORS.length){
      const candidates=roster.hasHumanPlace?ladderCandidates([...entries.values()].filter(entry=>!failedIds.has(entry.id)),
        roster.latestTarget,roster.usedNames,roster.usedIds,roster.ghosts[0]?.targetMs):[];
      let loaded=false;
      for(const entry of candidates.slice(0,Math.max(0,32-detailReads)))try{
        detailReads++;
        const data=await read(`/api/ghosts/${encodeURIComponent(entry.id)}`);
        if(data.entry?.id!==entry.id||leaderboardNameKey(data.entry.name)!==leaderboardNameKey(entry.name)
          ||data.entry.timeMs!==entry.timeMs||!validEntry(data.entry,laps)||!replayValid(data.replay,laps)
          ||data.replay.durationMs!==entry.timeMs)throw new Error('Invalid challenge replay.');
        roster.human({entry:data.entry,replay:data.replay});loaded=true;break;
      }catch(error){if(controller.signal.aborted)throw error;failedCount++;failedIds.add(entry.id);}
      if(!loaded&&!roster.pace())break;
    }
    return {...roster.result(),city,version,failedCount};
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}
