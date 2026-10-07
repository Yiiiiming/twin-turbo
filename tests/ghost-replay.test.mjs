import test from 'node:test';
import assert from 'node:assert/strict';
import { GhostRecorder, sampleReplay, validateReplay, validateRaceReplay, RACE_GHOST_VERSION, GHOST_VERSION, GHOST_LIMITS } from '../ghost-replay.js';

const start = 1.037;
const pose = time => ({ x: 200 + time * 2, y: -75 + time * 3, angle: .2 + time / 100, elevation: 4 + time / 10 });
function raceAt(time, durations = [30.241], overrides = {}) {
  const boundaries = durations.reduce((out, duration) => [...out, out.at(-1) + duration], [start]);
  const lap = boundaries.slice(1).filter(boundary => time >= boundary).length;
  const started = time >= start;
  const car = { id: 1, ...pose(time), lap, _started: started,
    _lapStartTime: started ? boundaries[lap] : 0, finished: lap === durations.length,
    finishTime: lap === durations.length ? boundaries.at(-1) : null, rescueCooldown: 0, ...overrides };
  return { time, state: 'racing', laps: durations.length, cars: [car, { ...car, id: 2, x: car.x + 12 }] };
}
function record(recorder, from, to, durations, override = () => ({}), step = .037) {
  const completions = [];
  for (let time = from; time < to; time += step) completions.push(...recorder.sample(raceAt(time, durations, override(time))));
  completions.push(...recorder.sample(raceAt(to, durations, override(to))));
  return completions;
}
const near = (a, b, epsilon = .001) => assert.ok(Math.abs(a - b) <= epsilon, `${a} differs from ${b}`);

test('records real world poses from exact first crossing through exact lap end at 10 Hz', () => {
  const recorder = new GhostRecorder();
  const result = record(recorder, 0, 31.29, [30.241]);
  const replay = recorder.bestReplay(1);
  assert.equal(GHOST_VERSION, 'coast-ghost-v1');
  assert.equal(result.length, 2);
  assert.equal(replay.durationMs, 30241);
  assert.equal(replay.frames.length, 304);
  assert.deepEqual(replay.frames[0].slice(0, 3), [0, 202.074, -71.889]);
  const last = replay.frames.at(-1);
  assert.equal(last[0], 30241);
  near(last[1], pose(start + 30.241).x);
  near(last[4], pose(start + 30.241).elevation);
  for (let i = 1; i < replay.frames.length - 1; i++) assert.equal(replay.frames[i][0], i * 100);
  assert.notEqual(recorder.bestReplay(2).frames[0][1], replay.frames[0][1]);
});

test('continuous laps restart at zero and retain only the fastest valid lap per player', () => {
  const recorder = new GhostRecorder();
  const durations = [30.241, 27.403, 33.009];
  const result = record(recorder, 0, 91.70, durations);
  assert.equal(result.length, 6);
  const playerLaps = result.filter(entry => entry.id === 1).map(entry => entry.replay);
  assert.deepEqual(playerLaps.map(replay => replay.durationMs), [30241, 27403, 33009]);
  assert.equal(recorder.bestReplay(1), playerLaps[1]);
  assert.deepEqual(playerLaps[1].frames[0].slice(1), playerLaps[0].frames.at(-1).slice(1));
  assert.equal(playerLaps[1].frames[0][0], 0);
});

test('pauses do not add frames or elapsed time; repeated timestamps do not duplicate samples', () => {
  const recorder = new GhostRecorder();
  record(recorder, 0, 12, [30.241]);
  const before = recorder.racers.get(1).active.frames.length;
  for (let i = 0; i < 50; i++) recorder.sample({ ...raceAt(12), state: 'paused' });
  assert.equal(recorder.racers.get(1).active.frames.length, before);
  recorder.sample(raceAt(12));
  assert.equal(recorder.racers.get(1).active.frames.length, before);
  record(recorder, 12.037, 31.29, [30.241]);
  assert.equal(recorder.bestReplay(1).durationMs, 30241);
  assert.equal(recorder.bestReplay(1).frames.length, 304);
});

test('rescue invalidates current lap, while the next completed lap remains eligible', () => {
  const recorder = new GhostRecorder();
  const durations = [27, 30];
  const events = record(recorder, 0, 58.05, durations, time => ({ rescueCooldown: time > 10 && time < 12 ? 2 : 0 }));
  assert.equal(events.filter(event => event.id === 1).length, 1);
  assert.equal(recorder.bestReplay(1).durationMs, 30000);
  const manual = new GhostRecorder();
  record(manual, 0, 10, [30.241]);
  manual.invalidate(1);
  record(manual, 10.037, 31.29, [30.241]);
  assert.equal(manual.bestReplay(1), null);
  assert.equal(manual.bestReplay(2).durationMs, 30241);
});

test('only selected human racers are recorded', () => {
  const recorder = new GhostRecorder();
  for (let time = 0; time < 32; time += .041) recorder.sample(raceAt(time), [1]);
  assert.ok(recorder.bestReplay(1));
  assert.equal(recorder.bestReplay(2), null);
});

test('missing initial frames cannot manufacture a valid lap', () => {
  const recorder = new GhostRecorder();
  const result = record(recorder, 10, 61.05, [30, 30]);
  assert.equal(result.filter(event => event.id === 1).length, 1);
  assert.equal(recorder.bestReplay(1).durationMs, 30000);
  near(recorder.bestReplay(1).frames[0][1], pose(start + 30).x);
});

test('memory is bounded and laps longer than 15 minutes are discarded', () => {
  const recorder = new GhostRecorder();
  record(recorder, 0, start + 901, [910], () => ({}), .1);
  const active = recorder.racers.get(1).active;
  assert.equal(active.valid, false);
  assert.ok(active.frames.length <= GHOST_LIMITS.maxFrames);
  assert.equal(active.frames.length, 0);
  assert.equal(recorder.bestReplay(1), null);
});

test('reset and engine time reset clear old records', () => {
  const recorder = new GhostRecorder();
  record(recorder, 0, 31.29, [30.241]);
  assert.ok(recorder.bestReplay(1));
  recorder.sample(raceAt(0));
  assert.equal(recorder.bestReplay(1), null);
  record(recorder, .037, 31.29, [30.241]);
  assert.ok(recorder.bestReplay(1));
  recorder.reset();
  assert.equal(recorder.racers.size, 0);
});

test('replay interpolation wraps angles through pi and hides outside the lap', () => {
  const replay = { version: 1, durationMs: 100, frames: [[0, 10, 20, Math.PI - .1, -20], [100, 20, 40, -Math.PI + .1, -10]] };
  const middle = sampleReplay(replay, 50);
  assert.equal(middle.x, 15);
  assert.equal(middle.y, 30);
  assert.equal(middle.elevation, -15);
  near(Math.abs(middle.angle), Math.PI, .000001);
  assert.ok(sampleReplay(replay, 0));
  assert.ok(sampleReplay(replay, 100));
  assert.equal(sampleReplay(replay, 100.001), null);
  assert.equal(sampleReplay(replay, -1), null);
  assert.equal(sampleReplay(replay, NaN), null);
  assert.equal(sampleReplay(null, 50), null);
});

test('finished racer stops recording while the other racer can continue', () => {
  const recorder = new GhostRecorder();
  record(recorder, 0, 31.29, [30.241]);
  const replay = recorder.bestReplay(1);
  recorder.sample(raceAt(90));
  assert.equal(recorder.bestReplay(1), replay);
  assert.equal(recorder.racers.get(1).active, null);
});

test('millisecond rounding deduplicates a finish immediately after a 100 ms sample', () => {
  const recorder = new GhostRecorder();
  record(recorder, 0, 31.05, [30.0004]);
  const replay = recorder.bestReplay(1);
  assert.equal(replay.durationMs, 30000);
  assert.equal(replay.frames.length, 301);
  assert.equal(replay.frames.at(-1)[0], 30000);
  assert.ok(validateReplay(replay));
});

test('validation rejects open laps, teleports, duplicate times and excessive gaps', () => {
  const recorder = new GhostRecorder();
  record(recorder, 0, 31.29, [30.241]);
  const replay = recorder.bestReplay(1);
  assert.ok(validateReplay(replay));
  for (const change of [
    copy => { copy.frames.at(-1)[1] += 1000; },
    copy => { copy.frames[1][1] += 10000; },
    copy => { copy.frames[1][0] = 0; },
    copy => { copy.frames.splice(1, 3); },
    copy => { copy.frames[1][4] = Infinity; },
  ]) {
    const copy = structuredClone(replay); change(copy);
    assert.equal(validateReplay(copy), false);
  }
});


test('complete three-lap replay starts at GO and ends at the interpolated finish, preserving every lap boundary', () => {
  const recorder = new GhostRecorder();
  const durations = [30.241, 27.403, 33.009];
  const ends = [31278, 58681, 91690];
  recorder.sample({ ...raceAt(0, durations), state: 'countdown' });
  for (let i = 0; i < 20; i++) recorder.sample({ ...raceAt(0, durations), state: 'countdown' });
  record(recorder, 0, 91.70, durations);
  const replay = recorder.fullRaceReplay(1);
  assert.equal(RACE_GHOST_VERSION, 'coast-race-ghost-v1');
  assert.ok(validateRaceReplay(replay)); assert.equal(validateReplay(replay), false);
  assert.equal(replay.durationMs, 91690); assert.deepEqual(replay.lapEndsMs, ends);
  assert.deepEqual(replay.frames[0].slice(0, 3), [0, 200, -75]);
  assert.equal(replay.frames.at(-1)[0], replay.durationMs);
  near(replay.frames.at(-1)[1], pose(91.69).x);
  assert.equal(recorder.bestReplay(1).durationMs, 27403);
  assert.ok(sampleReplay(replay, 60000)); assert.equal(sampleReplay(replay, 91691), null);
  recorder.sample(raceAt(110, durations));
  assert.equal(recorder.fullRaceReplay(1), replay, 'finisher holds its own full race while the other driver continues');
});

test('rescue, late attach and missing or invalid history disqualify a full race while later valid single laps survive', () => {
  const durations = [30, 30, 30];
  for (const mode of ['rescue', 'late', 'nan', 'teleport', 'gap', 'manual']) {
    const recorder = new GhostRecorder();
    if (mode === 'late') record(recorder, 10, 91.05, durations);
    else {
      record(recorder, 0, 10, durations);
      if (mode === 'manual') recorder.invalidate(1);
      if (mode !== 'gap') recorder.sample(raceAt(10.05, durations, mode === 'rescue' ? { rescueCooldown: 2 }
        : mode === 'nan' ? { x: NaN } : mode === 'teleport' ? { x: 50000 } : {}));
      record(recorder, mode === 'gap' ? 11 : 10.09, 91.05, durations);
    }
    assert.equal(recorder.fullRaceReplay(1), null, mode);
    assert.ok(recorder.bestReplay(1), `${mode}: later complete lap is still valid`);
  }
});

test('race replay validators reject wrong kinds, partial races, invalid boundaries and excessive frame gaps', () => {
  const recorder = new GhostRecorder(); record(recorder, 0, 91.05, [30, 30, 30]);
  const replay = recorder.fullRaceReplay(1);
  assert.ok(validateRaceReplay(replay));
  for (const change of [
    copy => { delete copy.kind; }, copy => { copy.kind = 'lap'; }, copy => { copy.laps = 1; },
    copy => { copy.lapEndsMs.pop(); }, copy => { copy.lapEndsMs[1] = copy.lapEndsMs[0]; },
    copy => { copy.lapEndsMs[0] = 20000; }, copy => { copy.lapEndsMs[2]--; },
    copy => { copy.frames[1][0] = 0; }, copy => { copy.frames.splice(1, 3); },
    copy => { copy.frames.at(-1)[4] = NaN; }, copy => { copy.durationMs = 900001; },
  ]) { const copy = structuredClone(replay); change(copy); assert.equal(validateRaceReplay(copy), false); }
  const sprint = new GhostRecorder(); record(sprint, 0, 31.05, [30]); assert.equal(sprint.fullRaceReplay(1), null);
  const incomplete = new GhostRecorder(); record(incomplete, 0, 61.05, [30, 30, 30]); assert.equal(incomplete.fullRaceReplay(1), null);
});
