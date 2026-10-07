import { TRACK, projectTrack, mod } from './engine.js';
import { validateReplay, validateRaceReplay, sampleReplay } from './ghost-replay.js';

export const SPLIT_FRACTIONS = Object.freeze([.25, .5, .75, 1]);
const signedDistance = (from, to) => mod(to - from + TRACK.length / 2, TRACK.length) - TRACK.length / 2;
const keyFor = (lap, index) => `${lap}:${index}`;
const milliseconds = seconds => Math.round(seconds * 1000);

/** Quarter passages use lap clocks for a single lap and the GO clock for a whole race. */
export function ghostSplitTimes(replay) {
  const wholeRace = replay?.kind === 'race', count = wholeRace ? 12 : 4;
  const times = Array(count).fill(null);
  if (!(wholeRace ? validateRaceReplay(replay) : validateReplay(replay))) return times;
  const ends = wholeRace ? replay.lapEndsMs : [replay.durationMs];
  const limit = TRACK.roadWidth / 2 + TRACK.checkpointMargin;
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
      const gate = mod(TRACK.startDistance + SPLIT_FRACTIONS[next] * TRACK.length, TRACK.length);
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
  const wholeRace = replay?.kind === 'race';
  const index = (wholeRace ? (record.lap - 1) * 4 : 0) + record.index - 1;
  const ghostTime = times[index];
  return Number.isFinite(ghostTime) ? (wholeRace ? record.timeMs : record.lapTimeMs) - ghostTime : null;
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
      const interval = TRACK.checkpoints / 4;
      if (!Number.isInteger(interval)) continue;
      for (let gate = Math.max(interval, Math.ceil((previous.earned + 1) / interval) * interval);
        gate <= current.earned; gate += interval) {
        const index = ((gate / interval - 1) % 4) + 1, lap = Math.floor((gate / interval - 1) / 4) + 1;
        const key = keyFor(lap, index);
        if (racer.records.has(key)) continue;
        const start = racer.starts.get(lap) ?? (previous.lap + 1 === lap ? previous.lapStart : null);
        if (!Number.isFinite(start)) continue;
        let time;
        if (index === 4 && current.lap === previous.lap + 1) time = current.lapStart;
        else {
          const delta = signedDistance(previous.s, current.s);
          const distance = mod(TRACK.startDistance + SPLIT_FRACTIONS[index - 1] * TRACK.length - previous.s, TRACK.length);
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
    return { ...record, opponentId, deltaMs: other ? record.timeMs - other.timeMs : null,
      ghostDeltaMs: ghostDelta(record, this.ghostReplay, this.ghostTimes),
      ghostDeltas: this.ghosts.map(ghost=>({slotId:ghost.slotId,color:ghost.color,colorLabel:ghost.colorLabel,deltaMs:ghostDelta(record,ghost.replay,ghost.times)})),
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
