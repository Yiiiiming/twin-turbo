import { TRACK, projectTrack, mod } from './engine.js';
import { validateReplay, validateRaceReplay, sampleReplay } from './ghost-replay.js';

export const SPLIT_FRACTIONS = Object.freeze([.25, .5, .75, 1]);
// Austin's first result panel appears after the football scoreboard has passed.
// This reuses physical gate 30 of 68; the road and its progression gates do not move.
const AUSTIN_SPLIT_FRACTIONS = Object.freeze([30 / 68, .5, .75, 1]);
export function splitFractionsForTrack(track = TRACK) {
  return track.id === 'coast-austin' ? AUSTIN_SPLIT_FRACTIONS : SPLIT_FRACTIONS;
}
const signedDistance = (from, to) => mod(to - from + TRACK.length / 2, TRACK.length) - TRACK.length / 2;
const keyFor = (lap, index) => `${lap}:${index}`;
const milliseconds = seconds => Math.round(seconds * 1000);

/** Same-position passages use lap clocks for a single lap and GO for a whole race. */
export function ghostSplitTimes(replay) {
  const wholeRace = replay?.kind === 'race', count = wholeRace ? 12 : 4;
  const times = Array(count).fill(null);
  if (!(wholeRace ? validateRaceReplay(replay) : validateReplay(replay))) return times;
  const ends = wholeRace ? replay.lapEndsMs : [replay.durationMs];
  const limit = TRACK.roadWidth / 2 + TRACK.checkpointMargin;
  const fractions = splitFractionsForTrack();
  // Exact finish samples may fall between the recorder's 100 ms samples.
  // Inject them so each lap is evaluated only inside its actual boundaries.
  const byTime = new Map(replay.frames.map(frame => [frame[0], frame]));
  for (const end of ends) {
    if (byTime.has(end)) continue;
    const pose = sampleReplay(replay, end);
    byTime.set(end, [end, pose.x, pose.y, pose.angle, pose.elevation]);
  }
  const frames = [...byTime.values()].sort((a, b) => a[0] - b[0]);
  let lap = 0, next = 0, previous = null;
  for (const frame of frames) {
    if (lap >= ends.length) break;
    // Height disambiguates overpasses with matching x/y coordinates.
    const projection = projectTrack(frame[1], frame[2], previous?.projection.s ?? TRACK.startDistance, frame[4]);
    if (previous && next < 3) {
      const delta = signedDistance(previous.projection.s, projection.s);
      const gate = mod(TRACK.startDistance + fractions[next] * TRACK.length, TRACK.length);
      const until = mod(gate - previous.projection.s, TRACK.length);
      const elapsed = frame[0] - previous.frame[0];
      if (delta > 0 && delta < Math.min(TRACK.length / 8, elapsed * .7 + 2)
        && previous.projection.distance <= limit && projection.distance <= limit && until <= delta + 1e-6) {
        times[lap * 4 + next++] = Math.round(previous.frame[0] + elapsed * Math.max(0, Math.min(1, until / delta)));
      }
    }
    previous = { frame, projection };
    if (frame[0] === ends[lap]) {
      // Duration alone is not proof of crossing the circuit's finish line.
      if (next === 3 && projection.distance <= limit
        && Math.abs(signedDistance(TRACK.startDistance, projection.s)) < 5) times[lap * 4 + 3] = ends[lap];
      lap++; next = 0;
    }
  }
  return times;
}

function ghostDelta(record, replay, times) {
  if (!record) return null;
  const wholeRace = replay?.kind === 'race';
  const index = (wholeRace ? (record.lap - 1) * 4 : 0) + record.index - 1;
  const ghostTime = times[index];
  return Number.isFinite(ghostTime) ? (wholeRace ? record.timeMs : record.lapTimeMs) - ghostTime : null;
}

// Equal crossing milliseconds share a place. Display slot order never breaks a tie.
const crossingRank = (times, time) => 1 + times.filter(value => value < time).length;
function previousPoint(record) {
  return record.index > 1 ? keyFor(record.lap, record.index - 1)
    : record.lap > 1 ? keyFor(record.lap - 1, 4) : null;
}
function ghostRankChanges(record, previous, ghosts, comparisons) {
  const changes = comparisons.map(() => null);
  if (!previous) return changes;
  const before = ghosts.map(ghost => ghostDelta(previous, ghost.replay, ghost.times));
  // A newly available/missing passage must not look like an overtake.
  if (comparisons.some((value, index) => Number.isFinite(value.deltaMs) !== Number.isFinite(before[index]))) return changes;
  const included = comparisons.map((value, index) => Number.isFinite(value.deltaMs) ? index : -1).filter(index => index >= 0);
  // A repeated single-lap ghost starts a new lap clock; it has no cross-lap rank.
  if (record.index === 1 && included.some(index => ghosts[index].replay?.kind !== 'race')) return changes;
  const currentTimes = [0, ...included.map(index => -comparisons[index].deltaMs)];
  const previousTimes = [0, ...included.map(index => -before[index])];
  for (const index of included) changes[index] = crossingRank(previousTimes, -before[index]) - crossingRank(currentTimes, -comparisons[index].deltaMs);
  return changes;
}

function snapshot(car, time) {
  return { id: car.id, time, x: car.x, y: car.y, s: car._lastTrackS,
    earned: car._started ? car.lap * TRACK.checkpoints + car._nextCheckpoint - 1 : -1,
    lap: car.lap, lapStart: car._lapStartTime, started: Boolean(car._started),
    finished: Boolean(car.finished), rescue: car.rescueCooldown > 0 };
}

/** Same-position splits. Records are independent of relative car positions. */
export class SplitTiming {
  constructor() { this.reset(); }

  reset(value = null) {
    this.ghosts = Array.isArray(value) ? value.map(ghost=>({...ghost,times:ghostSplitTimes(ghost.replay)})) : [];
    this.ghostReplay = value?.ghostReplay ?? (value?.frames ? value : this.ghosts[0]?.replay ?? null);
    this.ghostTimes = ghostSplitTimes(this.ghostReplay);
    this.racers = new Map(); this.lastEngineTime = null;
    return this;
  }

  sample(engine) {
    if (!engine || !Number.isFinite(engine.time) || engine.state === 'paused') return [];
    if (this.lastEngineTime !== null && engine.time < this.lastEngineTime - 1e-6) this.reset(this.ghosts.length ? this.ghosts : this.ghostReplay);
    this.lastEngineTime = engine.time;
    if (!['countdown', 'racing', 'finished'].includes(engine.state)) return [];
    const passed = [];
    for (const car of engine.cars) {
      const current = snapshot(car, engine.time);
      if (![current.time, current.x, current.y, current.s, current.earned, current.lapStart].every(Number.isFinite)) continue;
      let racer = this.racers.get(car.id);
      if (!racer) {
        racer = { previous: null, records: new Map(), starts: new Map(), latest: null, opponentId: engine.cars.find(other => other.id !== car.id)?.id ?? null };
        this.racers.set(car.id, racer);
      }
      if (current.started && !current.finished) racer.starts.set(current.lap + 1, current.lapStart);
      const previous = racer.previous;
      racer.previous = current;
      if (!previous || previous.finished || current.rescue || current.time <= previous.time
        || current.time - previous.time > .25 || current.earned <= previous.earned) continue;
      const fractions = splitFractionsForTrack(), gates = fractions.map(fraction => fraction * TRACK.checkpoints);
      if (!gates.every(gate => Math.abs(gate - Math.round(gate)) < 1e-7)) continue;
      const firstLap = Math.floor(Math.max(0, previous.earned) / TRACK.checkpoints) + 1;
      const lastLap = Math.floor(current.earned / TRACK.checkpoints) + 1;
      for (let lap = firstLap; lap <= lastLap; lap++) for (let offset = 0; offset < gates.length; offset++) {
        const gate = (lap - 1) * TRACK.checkpoints + Math.round(gates[offset]);
        if (gate <= previous.earned || gate > current.earned) continue;
        const index = offset + 1;
        const key = keyFor(lap, index);
        if (racer.records.has(key)) continue;
        const start = racer.starts.get(lap) ?? (previous.lap + 1 === lap ? previous.lapStart : null);
        if (!Number.isFinite(start)) continue;
        let time;
        if (index === 4 && current.lap === previous.lap + 1) time = current.lapStart;
        else {
          const delta = signedDistance(previous.s, current.s);
          const distance = mod(TRACK.startDistance + fractions[index - 1] * TRACK.length - previous.s, TRACK.length);
          if (!(delta > 0 && delta < Math.min(TRACK.length / 8, (current.time - previous.time) * 700 + 2))
            || distance > delta + 1e-6) continue;
          time = previous.time + (current.time - previous.time) * Math.max(0, Math.min(1, distance / delta));
        }
        if (time < previous.time - 1e-6 || time > current.time + 1e-6 || time < start) continue;
        const record = { playerId: car.id, lap, index, timeMs: milliseconds(time), lapTimeMs: milliseconds(time - start) };
        racer.records.set(key, record); racer.latest = record; passed.push(record);
      }
    }
    return passed.map(record => this._comparison(record));
  }

  _comparison(record) {
    const racer = this.racers.get(record.playerId), opponentId = racer.opponentId;
    const other = this.racers.get(opponentId)?.records.get(keyFor(record.lap, record.index));
    const previousKey = previousPoint(record), previous = racer.records.get(previousKey);
    const otherPrevious = this.racers.get(opponentId)?.records.get(previousKey);
    const opponentRankChange = other && previous && otherPrevious
      ? crossingRank([previous.timeMs, otherPrevious.timeMs], otherPrevious.timeMs)
        - crossingRank([record.timeMs, other.timeMs], other.timeMs) : null;
    const ghostDeltas = this.ghosts.map(ghost => ({slotId:ghost.slotId,color:ghost.color,colorLabel:ghost.colorLabel,deltaMs:ghostDelta(record,ghost.replay,ghost.times)}));
    const changes = ghostRankChanges(record, previous, this.ghosts, ghostDeltas);
    ghostDeltas.forEach((value,index) => { value.rankChange = changes[index]; });
    return { ...record, opponentId, opponentRankChange, deltaMs: other ? record.timeMs - other.timeMs : null,
      ghostDeltaMs: ghostDelta(record, this.ghostReplay, this.ghostTimes),
      ghostDeltas,
      waiting: !other, label: record.index === 4 ? '终点' : `CP ${record.index}` };
  }

  latest(id) {
    const record = this.racers.get(id)?.latest;
    return record ? this._comparison(record) : null;
  }

  // Seconds-based alias for consumers that format time directly.
  forPlayer(id) {
    const split = this.latest(id);
    return split && { ...split, checkpoint: split.index, timeSeconds: split.timeMs / 1000,
      lapTimeSeconds: split.lapTimeMs / 1000, deltaSeconds: split.deltaMs === null ? null : split.deltaMs / 1000,
      ghostDeltaSeconds: split.ghostDeltaMs === null ? null : split.ghostDeltaMs / 1000 };
  }
}
