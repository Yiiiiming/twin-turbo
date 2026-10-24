import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, TRACKS, RaceEngine, setTrack, trackPoint, mod } from '../src/engine.js';
import { RaceAI } from '../src/ai.js';
import { GhostRecorder } from '../src/ghost-replay.js';
import { updateChaseCamera, perspective, lookAt, multiply } from '../src/renderer.js';
import { ghostProgressTimeline, progressAt, liveGhostPosition, carNitroAnchor } from '../src/race-hud.js';

const near = (actual, expected, tolerance = 1e-7, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected} (±${tolerance})`);
test.afterEach(() => setTrack('coast'));

// A full legal lap, with a changing racing line and rounded recorder precision.
// It intentionally wraps the course's absolute station while keeping lap time
// and distance continuous, including over the vertically stacked helices.
function courseReplay(durationMs = 60000) {
  const frames = [], expected = [];
  for (let time = 0; time <= durationMs; time += 100) {
    const fraction = time / durationMs;
    const lane = 34 * Math.sin(fraction * Math.PI * 12);
    const p = trackPoint(TRACK.startDistance + fraction * TRACK.length, lane);
    frames.push([time, ...[p.x, p.y, p.angle, p.elevation].map(n => Math.round(n * 1000) / 1000)]);
    expected.push(fraction);
  }
  return { replay: { version: 1, durationMs, frames }, expected };
}

test('all twelve maps project rounded ghost frames onto continuous progress through corners, elevation and the finish wrap', () => {
  assert.equal(Object.keys(TRACKS).length, 12);
  for (const track of Object.values(TRACKS)) {
    setTrack(track.id);
    const { replay, expected } = courseReplay();
    const source = structuredClone(replay), timeline = ghostProgressTimeline(replay);
    assert.equal(timeline.durationMs, replay.durationMs);
    assert.equal(timeline.frames.length, replay.frames.length);
    for (const [index, frame] of timeline.frames.entries()) {
      near(frame[0], replay.frames[index][0]);
      near(frame[1], expected[index], .000001, `${track.id} frame ${index}`);
      if (index) assert.ok(frame[1] > timeline.frames[index - 1][1], `${track.id}: progress cannot jump to another deck`);
    }
    for (let time = 35; time < replay.durationMs; time += 137)
      near(progressAt(timeline, time), time / replay.durationMs, .000001, track.id);
    assert.deepEqual(replay, source, 'preparation cannot mutate the saved replay');
  }
});

test('the same XY on each turn of both 1080-degree spirals receives its own lap position', () => {
  setTrack('coast-ridge');
  const { replay } = courseReplay(), timeline = ghostProgressTimeline(replay);
  for (const spiral of TRACK.spirals) {
    const fractions = [];
    for (let turn = 0; turn < 3; turn++) {
      const station = spiral.start + (.7 + turn * 2 * Math.PI) * spiral.radius;
      const p = trackPoint(station);
      const fraction = mod(station - TRACK.startDistance, TRACK.length) / TRACK.length;
      fractions.push({ p, fraction, actual: progressAt(timeline, fraction * replay.durationMs) });
      near(fractions.at(-1).actual, fraction, .000001);
    }
    for (let i = 1; i < fractions.length; i++) {
      near(fractions[i].p.x, fractions[0].p.x); near(fractions[i].p.y, fractions[0].p.y);
      assert.ok(Math.abs(fractions[i].p.elevation - fractions[i - 1].p.elevation) > 140);
      near(fractions[i].actual - fractions[i - 1].actual, 2 * Math.PI * spiral.radius / TRACK.length, .000002);
    }
  }
});

test('a real recorded ridge lap keeps the same progress and finish clock as the driver', () => {
  setTrack('coast-ridge');
  const engine = new RaceEngine({ laps: 1, playerCount: 1 }).start(), ai = new RaceAI({ carId: 1 });
  const recorder = new GhostRecorder(), driven = [];
  recorder.sample(engine, [1]);
  for (let frame = 0; frame < 120 * 120 && engine.state !== 'finished'; frame++) {
    engine.step(1 / 120, ai.update(engine, 1 / 120)); recorder.sample(engine, [1]);
    const car = engine.cars[0];
    if (car._started && frame % 19 === 0) driven.push({ time: car.lapTime * 1000, progress: car.progress });
  }
  assert.equal(engine.state, 'finished'); assert.equal(ai.rescues, 0);
  const replay = recorder.bestReplay(1); assert.ok(replay);
  const timeline = ghostProgressTimeline(replay);
  for (const sample of driven)
    near(progressAt(timeline, sample.time), sample.progress, .00006, `recorded lap at ${sample.time} ms`);
  near(replay.durationMs, engine.cars[0].lastLap * 1000, .5);
  assert.deepEqual(liveGhostPosition(engine.cars[0], [timeline]), { place: 1, total: 2 },
    'rounded replay milliseconds must tie the original finish');
});

test('interpolation follows elapsed simulation time and reverse motion instead of snapping to sampled frames', () => {
  const timeline = { durationMs: 1000, frames: [[0, 0], [100, .08], [200, .06], [700, .16], [1000, 1]] };
  near(progressAt(timeline, -100), 0); near(progressAt(timeline, 0), 0);
  near(progressAt(timeline, 50), .04); near(progressAt(timeline, 150), .07);
  near(progressAt(timeline, 450), .11); near(progressAt(timeline, 700), .16);
  near(progressAt(timeline, 850), .58);
  near(progressAt(timeline, 1000), 1); near(progressAt(timeline, 7000), 1);
  assert.equal(progressAt(null, 1), 0);
  assert.equal(progressAt({ durationMs: 0, frames: [] }, 1), 0);
});

test('prepared progress is independent of later map changes and uses logarithmic frame lookup', () => {
  setTrack('coast-ridge');
  const { replay } = courseReplay(120000);
  const { proxy, revoke } = Proxy.revocable(replay, {}), timeline = ghostProgressTimeline(proxy);
  revoke(); // Per-frame HUD calculations must not touch or reproject source frames.
  setTrack('coast-london');
  const frames = timeline.frames; let reads = 0;
  timeline.frames = new Proxy(frames, { get(target, key) {
    if (/^\d+$/.test(String(key))) reads++;
    return Reflect.get(target, key);
  } });
  for (let time = 17; time < 120000; time += 613) {
    const before = reads;
    near(progressAt(timeline, time), time / 120000, .000001);
    assert.ok(reads - before <= Math.ceil(Math.log2(frames.length)) + 2, 'lookup cannot scan the replay every rendered frame');
  }
});

test('live rank counts cars ahead by lap progress, retains finished ghosts and gives ties to the player', () => {
  const timeline = (durationMs, progress) => ({ durationMs, frames: [[0, 0], [5000, progress], [durationMs, 1]] });
  const opponents = [timeline(30000, .4), timeline(40000, .3), timeline(45000, .2),
    timeline(50000, .1), timeline(55000, .08), timeline(60000, .05)];
  const car = { _started: false, lapTime: 5, progress: 0, finished: false, lastLap: null, finishTime: null };
  assert.deepEqual(liveGhostPosition(car, opponents), { place: 1, total: 7 });
  Object.assign(car, { _started: true, progress: .3 });
  assert.deepEqual(liveGhostPosition(car, opponents), { place: 2, total: 7 });
  car.progress = .099;
  assert.equal(liveGhostPosition(car, opponents).place, 5);
  Object.assign(car, { lapTime: 40, progress: .999 });
  assert.equal(liveGhostPosition(car, opponents).place, 3, 'two finished ghosts remain ahead even after disappearing');
  Object.assign(car, { finished: true, lastLap: 40, lapTime: 0, finishTime: 47.5, progress: 1 });
  assert.equal(liveGhostPosition(car, opponents).place, 2, 'rank compares the lap clock rather than GO time or the reset live lap timer');
  assert.equal(liveGhostPosition(car, [{ durationMs: 39999.5, frames: [] }]).place, 1);
  assert.equal(liveGhostPosition(car, [{ durationMs: 39999, frames: [] }]).place, 2);
  assert.deepEqual(liveGhostPosition(car, []), { place: 1, total: 1 });
});

test('pausing an actual race freezes ghost rank and elapsed replay progress', () => {
  setTrack('coast');
  const engine = new RaceEngine({ laps: 1, playerCount: 1 }).start();
  for (let tick = 0; tick < 30; tick++) engine.step(.1);
  for (let tick = 0; tick < 180; tick++) engine.step(1 / 120, new Set(['KeyW']));
  const car = engine.cars[0]; assert.equal(car._started, true);
  const timelines = [ghostProgressTimeline(courseReplay().replay)];
  const before = { position: liveGhostPosition(car, timelines), elapsed: car.lapTime, progress: progressAt(timelines[0], car.lapTime * 1000) };
  engine.pause();
  for (let tick = 0; tick < 600; tick++) engine.step(.1, new Set(['KeyW', 'ShiftLeft']));
  assert.deepEqual({ position: liveGhostPosition(car, timelines), elapsed: car.lapTime, progress: progressAt(timelines[0], car.lapTime * 1000) }, before);
  engine.resume(); engine.step(.1, new Set(['KeyW']));
  assert.ok(car.lapTime > before.elapsed);
});

function matrixScreenPoint(camera, point, width, height) {
  const matrix = multiply(perspective(camera.fov, width / height), lookAt(camera.eye, camera.target));
  const vector = [...point, 1];
  const clip = Array.from({ length: 4 }, (_, row) => vector.reduce((sum, value, col) => sum + value * matrix[col * 4 + row], 0));
  return { x: (clip[0] / clip[3] + 1) * width / 2, y: (1 - clip[1] / clip[3]) * height / 2 };
}

test('nitro anchor matches production WebGL perspective on every map in full and split views, including raised roads', () => {
  for (const track of Object.values(TRACKS)) {
    setTrack(track.id);
    for (let station = 0; station < track.length; station += 397) {
      const p = trackPoint(station), car = { ...p, speed: 363, boosting: station % 2 < 1 };
      const camera = updateChaseCamera(car, null);
      for (const [width, height] of [[1920, 1080], [960, 1080], [683, 768], [1366, 768]]) {
        const anchor = carNitroAnchor(camera, car, width, height);
        assert.ok(anchor, `${track.id} at ${station}: above-car anchor must remain visible`);
        const expected = matrixScreenPoint(camera, [car.x, car.elevation + 42, car.y], width, height);
        near(anchor.x, expected.x, .04); near(anchor.y, expected.y, .04);
        assert.ok(Number.isFinite(anchor.x) && Number.isFinite(anchor.y));
      }
    }
  }
});

test('nitro anchor follows smoothed turning and boosting cameras and hides behind or outside the viewport', () => {
  setTrack('coast-shanghai');
  let camera;
  for (let station = 2300; station < 4700; station += 4) {
    const car = { ...trackPoint(station), speed: 517, boosting: true };
    camera = updateChaseCamera(car, camera, 1 / 60);
    const anchor = carNitroAnchor(camera, car, 1280, 720);
    assert.ok(anchor);
    const expected = matrixScreenPoint(camera, [car.x, car.elevation + 42, car.y], 1280, 720);
    near(anchor.x, expected.x, .04); near(anchor.y, expected.y, .04);
  }
  const straight = { eye: [0, 42, 0], target: [0, 42, 100], fov: Math.PI / 2 };
  near(carNitroAnchor(straight, { x: 0, y: 100, elevation: 0 }, 1000, 500).x, 500);
  assert.equal(carNitroAnchor(straight, { x: 0, y: -100 }, 1000, 500), null);
  assert.equal(carNitroAnchor(straight, { x: 10000, y: 100 }, 1000, 500), null);
  assert.equal(carNitroAnchor(straight, { x: 0, y: 100 }, 0, 500), null);
  assert.equal(carNitroAnchor(null, { x: 0, y: 100 }, 1000, 500), null);
});
