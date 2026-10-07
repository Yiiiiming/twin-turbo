// Replays follow the real car's world transform. They never participate in physics.
export const GHOST_VERSION = 'coast-ghost-v1';
export const RACE_GHOST_VERSION = 'coast-race-ghost-v1';
export const GHOST_LIMITS = Object.freeze({ minDurationMs: 25000, maxDurationMs: 900000, maxFrames: 12000, intervalMs: 100 });
const TAU = Math.PI * 2;
const round = (n, digits = 3) => Number(n.toFixed(digits));
const shortestAngle = (a, b, t) => a + (Math.atan2(Math.sin(b - a), Math.cos(b - a))) * t;

function poseBetween(a, b, time) {
  const fraction = b.time > a.time ? Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time))) : 1;
  return {
    x: a.x + (b.x - a.x) * fraction,
    y: a.y + (b.y - a.y) * fraction,
    angle: shortestAngle(a.angle, b.angle, fraction),
    elevation: a.elevation + (b.elevation - a.elevation) * fraction,
  };
}

function frameAt(timeMs, pose) {
  return [Math.round(timeMs), round(pose.x), round(pose.y), round(Math.atan2(Math.sin(pose.angle), Math.cos(pose.angle)), 6), round(pose.elevation)];
}

function snapshot(car, time) {
  return {
    time, x: car.x, y: car.y, angle: car.angle, elevation: car.elevation ?? 0,
    started: Boolean(car._started), lap: car.lap, lapStart: car._lapStartTime,
    finished: Boolean(car.finished), finishTime: car.finishTime, rescue: car.rescueCooldown > 0,
  };
}

function finitePose(pose) {
  return ['time', 'x', 'y', 'angle', 'elevation', 'lap', 'lapStart'].every(key => Number.isFinite(pose[key]));
}

/** Same bounded, closed-lap shape used by the shared leaderboard service. */
function validateFrames(replay) {
  if (!replay || replay.version !== 1 || !Number.isInteger(replay.durationMs)
    || replay.durationMs < GHOST_LIMITS.minDurationMs || replay.durationMs > GHOST_LIMITS.maxDurationMs
    || !Array.isArray(replay.frames) || replay.frames.length < 2 || replay.frames.length > GHOST_LIMITS.maxFrames) return false;
  const frames = replay.frames;
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (!Array.isArray(frame) || frame.length !== 5 || !frame.every(Number.isFinite)
      || !Number.isInteger(frame[0]) || Math.abs(frame[1]) > 100000 || Math.abs(frame[2]) > 100000
      || Math.abs(frame[3]) > 100 * Math.PI || Math.abs(frame[4]) > 2000) return false;
    if (i) {
      const previous = frames[i - 1], elapsed = frame[0] - previous[0];
      if (elapsed <= 0 || elapsed > 250 || Math.hypot(frame[1] - previous[1], frame[2] - previous[2]) > 50 + 1.5 * elapsed) return false;
    }
  }
  return frames[0][0] === 0 && frames.at(-1)[0] === replay.durationMs;
}

export function validateReplay(replay) {
  return validateFrames(replay) && (replay.kind === undefined || replay.kind === 'lap')
    && (replay.laps === undefined || replay.laps === 1) && replay.lapEndsMs === undefined
    && Math.hypot(replay.frames[0][1] - replay.frames.at(-1)[1], replay.frames[0][2] - replay.frames.at(-1)[2]) <= 360;
}

/** A whole race starts at GO, including the run from the grid to the timing line. */
export function validateRaceReplay(replay) {
  if (!validateFrames(replay) || replay.kind !== 'race' || replay.laps !== 3
    || !Array.isArray(replay.lapEndsMs) || replay.lapEndsMs.length !== 3) return false;
  let previous = 0;
  for (const end of replay.lapEndsMs) {
    if (!Number.isInteger(end) || end - previous < GHOST_LIMITS.minDurationMs || end > replay.durationMs) return false;
    previous = end;
  }
  return previous === replay.durationMs;
}

export class GhostRecorder {
  constructor() { this.reset(); }

  reset() {
    this.racers = new Map();
    this.lastEngineTime = null;
    return this;
  }

  invalidate(id) {
    const racer = this.racers.get(id);
    if (racer?.active) { racer.active.valid = false; racer.active.frames = []; }
    if (racer?.race && !racer.fullRace) { racer.race.valid = false; racer.race.frames = []; racer.race.lapEndsMs = []; }
  }

  bestReplay(id) { return this.racers.get(id)?.best ?? null; }
  fullRaceReplay(id) { return this.racers.get(id)?.fullRace ?? null; }

  _begin(racer, startTime, pose, valid = true) {
    racer.active = { startTime, nextMs: GHOST_LIMITS.intervalMs, valid, frames: valid ? [frameAt(0, pose)] : [] };
  }

  _appendUntil(racer, previous, current, endTime) {
    this._appendRecording(racer.active, previous, current, endTime);
  }

  _appendRecording(lap, previous, current, endTime) {
    if (!lap?.valid) return;
    const elapsedMs = (endTime - lap.startTime) * 1000;
    if (elapsedMs > GHOST_LIMITS.maxDurationMs + 0.001) {
      lap.valid = false; lap.frames = []; return;
    }
    while (lap.nextMs <= elapsedMs + 0.0001) {
      if (lap.frames.length >= GHOST_LIMITS.maxFrames - 1) {
        lap.valid = false; lap.frames = []; return;
      }
      lap.frames.push(frameAt(lap.nextMs, poseBetween(previous, current, lap.startTime + lap.nextMs / 1000)));
      lap.nextMs += GHOST_LIMITS.intervalMs;
    }
  }

  _sampleRace(racer, previous, current, laps) {
    const race = racer.race;
    if (!race?.valid || racer.fullRace || current.time <= previous.time) return;
    const gap = current.time - previous.time;
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
    const lapDelta = current.lap - previous.lap;
    // Never interpolate away missing history, a teleport or a skipped lap.
    if (laps !== 3 || gap > .250001 || distance > 50 + 1500 * gap || lapDelta < 0 || lapDelta > 1
      || Math.abs(current.x) > 100000 || Math.abs(current.y) > 100000
      || Math.abs(current.angle) > 100 * Math.PI || Math.abs(current.elevation) > 2000
      || (previous.started && !current.started)) {
      race.valid = false; race.frames = []; return;
    }
    const endTime = current.finished ? current.finishTime : current.time;
    if (!Number.isFinite(endTime) || endTime < previous.time - .000001 || endTime > current.time + .000001) {
      race.valid = false; race.frames = []; return;
    }
    this._appendRecording(race, previous, current, endTime);
    if (!race.valid) return;
    if (lapDelta === 1) {
      const crossing = current.lapStart;
      if (crossing < previous.time - .000001 || crossing > endTime + .000001
        || current.lap !== race.lapEndsMs.length + 1) { race.valid = false; race.frames = []; return; }
      race.lapEndsMs.push(Math.round(crossing * 1000));
    }
    if (!current.finished) return;
    const durationMs = Math.round(endTime * 1000);
    const final = frameAt(durationMs, poseBetween(previous, current, endTime));
    if (race.frames.at(-1)?.[0] === durationMs) race.frames[race.frames.length - 1] = final;
    else race.frames.push(final);
    const replay = { version: 1, kind: 'race', laps: 3, durationMs, lapEndsMs: [...race.lapEndsMs], frames: race.frames };
    if (current.lap === 3 && validateRaceReplay(replay)) racer.fullRace = replay;
    else { race.valid = false; race.frames = []; }
  }

  _finish(racer, previous, current, endTime) {
    const lap = racer.active;
    if (!lap?.valid) return null;
    this._appendUntil(racer, previous, current, endTime);
    const durationMs = Math.round((endTime - lap.startTime) * 1000);
    if (!lap.valid || durationMs < GHOST_LIMITS.minDurationMs || durationMs > GHOST_LIMITS.maxDurationMs) return null;
    const endFrame = frameAt(durationMs, poseBetween(previous, current, endTime));
    if (lap.frames.at(-1)?.[0] === durationMs) lap.frames[lap.frames.length - 1] = endFrame;
    else lap.frames.push(endFrame);
    const replay = { version: 1, durationMs, frames: lap.frames };
    if (!validateReplay(replay)) return null;
    if (!racer.best || durationMs < racer.best.durationMs) racer.best = replay;
    return replay;
  }

  // Call immediately after each engine.step; paused frames produce no samples.
  // Returned entries describe newly completed, valid human laps only.
  sample(engine, humanIds = [1, 2]) {
    const completed = [];
    if (!engine || !Number.isFinite(engine.time) || engine.state === 'paused') return completed;
    if (this.lastEngineTime !== null && engine.time < this.lastEngineTime - 0.000001) this.reset();
    this.lastEngineTime = engine.time;
    if (!['countdown', 'racing', 'finished'].includes(engine.state)) return completed;
    for (const id of humanIds) {
      const car = engine.cars.find(candidate => candidate.id === id);
      if (!car) continue;
      const current = snapshot(car, engine.time);
      let racer = this.racers.get(id);
      if (!racer) {
        const valid = engine.laps === 3 && current.time === 0 && current.lap === 0 && !current.finished && !current.rescue && finitePose(current);
        racer = { previous: null, active: null, best: null, fullRace: null,
          race: { startTime: 0, nextMs: GHOST_LIMITS.intervalMs, valid, frames: valid ? [frameAt(0, current)] : [], lapEndsMs: [] } };
        this.racers.set(id, racer);
      }
      const previous = racer.previous;
      if (!finitePose(current)) { this.invalidate(id); racer.previous = null; continue; }
      if (!previous) {
        // A late-attached recorder must not invent a missing portion of a lap.
        if (current.started && !current.finished) this._begin(racer, current.lapStart, current, Math.abs(current.time - current.lapStart) < 0.000001);
        racer.previous = current; continue;
      }
      if (current.rescue) this.invalidate(id);
      if (previous.finished || current.time <= previous.time) { racer.previous = current; continue; }
      this._sampleRace(racer, previous, current, engine.laps);
      const crossing = current.lapStart;
      const crossedInFrame = crossing >= previous.time - 0.000001 && crossing <= current.time + 0.000001;
      if (!previous.started && current.started && crossedInFrame) {
        this._begin(racer, crossing, poseBetween(previous, current, crossing), !current.rescue);
        this._appendUntil(racer, previous, current, current.time);
      } else if (current.lap > previous.lap) {
        if (current.lap === previous.lap + 1 && crossedInFrame) {
          const replay = this._finish(racer, previous, current, crossing);
          if (replay) completed.push({ id, replay });
          if (!current.finished) {
            this._begin(racer, crossing, poseBetween(previous, current, crossing), !current.rescue);
            this._appendUntil(racer, previous, current, current.time);
          } else racer.active = null;
        } else racer.active = null;
      } else if (current.started && !current.finished) {
        this._appendUntil(racer, previous, current, current.time);
      }
      racer.previous = current;
    }
    return completed;
  }
}

/** Lookup is pure and returns null outside the recorded lap or whole-race interval. */
export function sampleReplay(replay, timeMs) {
  if (!replay || replay.version !== 1 || !Number.isFinite(timeMs) || timeMs < 0 || timeMs > replay.durationMs
    || !Array.isArray(replay.frames) || replay.frames.length < 2) return null;
  const frames = replay.frames;
  if (timeMs < frames[0][0] || timeMs > frames.at(-1)[0]) return null;
  let low = 0, high = frames.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (frames[middle][0] <= timeMs) low = middle;
    else high = middle;
  }
  const a = frames[low], b = frames[high];
  const fraction = b[0] > a[0] ? (timeMs - a[0]) / (b[0] - a[0]) : 0;
  const angle = shortestAngle(a[3], b[3], fraction);
  return {
    x: a[1] + (b[1] - a[1]) * fraction,
    y: a[2] + (b[2] - a[2]) * fraction,
    angle: ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI,
    elevation: a[4] + (b[4] - a[4]) * fraction,
  };
}
