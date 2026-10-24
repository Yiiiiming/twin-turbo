import test from 'node:test';
import assert from 'node:assert/strict';
import { SplitTiming } from '../src/split-timing.js';

// Split passage interpolation and replay validation are exercised by the real
// races in split-timing.test.mjs. Seed their measured clock output here so rank
// movement can be checked independently of driving and rendering.
function timingWithGhosts(clocks, kinds = []) {
  const timing = new SplitTiming();
  timing.ghosts = clocks.map((times, slotId) => ({
    slotId, color: ['#b8a2ed', '#ffd166', '#66e6aa'][slotId % 3],
    entry: { id: `rank-record-${slotId}`, name: `Rival ${slotId}` },
    replay: kinds[slotId] === 'race' ? { kind: 'race', laps: 3 } : { kind: 'lap', laps: 1 },
    times: [...times],
  }));
  return timing;
}
const record = (playerId, lap, index, timeMs, lapTimeMs = timeMs) => ({ playerId, lap, index, timeMs, lapTimeMs });
function seed(timing, playerId, records, opponentId = null) {
  const racer = { opponentId, records: new Map(records.map(value => [`${value.lap}:${value.index}`, value])),
    latest: records.at(-1) ?? null, previous: null, starts: new Map() };
  timing.racers.set(playerId, racer);
  return racer;
}
function append(racer, value) {
  racer.records.set(`${value.lap}:${value.index}`, value); racer.latest = value;
}
const changes = (timing, id = 1) => timing.latest(id).ghostDeltas.map(value => value.rankChange);

test('the opening checkpoint has no movement baseline, even when every crossing time is known', () => {
  const timing = timingWithGhosts([[9000, 19000, 29000, 39000], [11000, 21000, 31000, 41000]]);
  assert.equal(timing.latest(1), null);
  seed(timing, 1, [record(1, 1, 1, 10000)], 2);
  seed(timing, 2, [record(2, 1, 1, 10500)], 1);
  assert.deepEqual(changes(timing), [null, null]);
  assert.equal(timing.latest(1).opponentRankChange, null);
  assert.equal(timing.latest(2).opponentRankChange, null);
});

test('a rival swapping only with the player still changes rank while the rivals keep their relative order', () => {
  const timing = timingWithGhosts([[9000, 21000, 29000, 39000], [11000, 23000, 31000, 41000]]);
  const racer = seed(timing, 1, [record(1, 1, 1, 10000), record(1, 1, 2, 20000)]);
  assert.deepEqual(changes(timing), [-1, 0], 'the player belongs to the ranked field');
  append(racer, record(1, 1, 3, 30000));
  assert.deepEqual(changes(timing), [1, 0], 'positive means improvement, negative means a lost place');
});

test('movement counts every place passed, not merely whether the time gap improved', () => {
  const timing = timingWithGhosts([[9000, 23000, 33000, 43000], [11000, 19000, 29000, 39000]]);
  seed(timing, 1, [record(1, 1, 1, 10000), record(1, 1, 2, 21000)]);
  assert.deepEqual(changes(timing), [-2, 2]);
  const unchanged = timingWithGhosts([[9000, 18900, 29000, 39000], [11000, 25000, 35000, 45000]]);
  seed(unchanged, 1, [record(1, 1, 1, 10000), record(1, 1, 2, 20000)]);
  assert.deepEqual(changes(unchanged), [0, 0], 'changing gap size without crossing anyone creates no arrow');
});

test('identical millisecond passages share competition rank regardless of slot or array order', () => {
  const timing = timingWithGhosts([[10000, 19000, 29000, 39000], [10000, 20000, 30000, 40000]]);
  timing.ghosts[0].slotId = 5; timing.ghosts[1].slotId = 0;
  seed(timing, 1, [record(1, 1, 1, 10000), record(1, 1, 2, 20000)]);
  assert.deepEqual(changes(timing), [0, -1], 'three tied leaders begin at rank 1; two later ties share rank 2');
  timing.ghosts.reverse();
  assert.deepEqual(changes(timing), [-1, 0], 'slot tie-breakers may order rows but cannot assign different ranks');
  timing.ghosts.forEach(ghost => { ghost.times[1] = 20000; });
  assert.deepEqual(changes(timing), [0, 0]);
});

test('a changed set of valid ghost passages suppresses movement instead of inventing an overtake', () => {
  for (const missing of [[null, 19000, 29000, 39000], [11000, null, 31000, 41000]]) {
    const timing = timingWithGhosts([[9000, 21000, 29000, 39000], missing]);
    seed(timing, 1, [record(1, 1, 1, 10000), record(1, 1, 2, 20000)]);
    assert.deepEqual(changes(timing), [null, null]);
  }
  const timing = timingWithGhosts([[9000, 21000, 29000, 39000], [null, null, 31000, 41000]]);
  seed(timing, 1, [record(1, 1, 1, 10000), record(1, 1, 2, 20000)]);
  assert.deepEqual(changes(timing), [-1, null], 'a rival missing at both points does not change the comparable field');
});

test('a missing preceding player checkpoint never falls back to an older point or another lap', () => {
  const timing = timingWithGhosts([[9000, 19000, 31000, 41000]]);
  seed(timing, 1, [record(1, 1, 1, 10000), record(1, 2, 2, 70000, 20000), record(1, 1, 3, 30000)]);
  assert.deepEqual(changes(timing), [null]);
});

test('whole-race ghosts carry movement across the finish using GO time, while lap replays reset their baseline', () => {
  const race = timingWithGhosts([
    [10000, 20000, 30000, 49000, 66000, 80000, 90000, 100000, 115000, 130000, 145000, 160000],
    [11000, 22000, 33000, 51000, 64000, 79000, 89000, 99000, 114000, 129000, 144000, 159000],
  ], ['race', 'race']);
  const records = [record(1, 1, 4, 50000), record(1, 2, 1, 65000, 15000)];
  seed(race, 1, records);
  assert.deepEqual(changes(race), [-2, 2]);
  const lap = timingWithGhosts([[16000, 26000, 36000, 49000], [14000, 25000, 37000, 51000]]);
  seed(lap, 1, records);
  assert.deepEqual(changes(lap), [null, null]);
  const mixed = timingWithGhosts([race.ghosts[0].times, lap.ghosts[1].times], ['race', 'lap']);
  seed(mixed, 1, records);
  assert.deepEqual(changes(mixed), [null, null], 'mixed clock families cannot establish a cross-lap ghost baseline');
});

test('local rivals update only after both drivers have passed both points and then report opposite changes', () => {
  const timing = new SplitTiming();
  seed(timing, 1, [record(1, 1, 1, 10000), record(1, 1, 2, 21000)], 2);
  const second = seed(timing, 2, [record(2, 1, 1, 11000)], 1);
  assert.equal(timing.latest(1).opponentRankChange, null);
  assert.equal(timing.latest(1).deltaMs, null);
  append(second, record(2, 1, 2, 20000));
  assert.equal(timing.latest(1).opponentRankChange, 1, 'the orange opponent moved from second to first');
  assert.equal(timing.latest(2).opponentRankChange, -1, 'the cyan opponent lost one place');
  assert.equal(timing.latest(1).deltaMs, 1000); assert.equal(timing.latest(2).deltaMs, -1000);
});

test('local movement cannot borrow an opponent passage from another lap or skip a missing previous gate', () => {
  const timing = new SplitTiming();
  seed(timing, 1, [record(1, 1, 1, 10000), record(1, 1, 2, 21000)], 2);
  const second = seed(timing, 2, [record(2, 1, 1, 11000), record(2, 2, 2, 70000, 20000)], 1);
  assert.equal(timing.latest(1).opponentRankChange, null);
  second.records.delete('1:1'); append(second, record(2, 1, 2, 20000));
  assert.equal(timing.latest(1).opponentRankChange, null);
  assert.equal(timing.latest(2).opponentRankChange, null);
});

test('local cross-lap comparisons keep GO ordering instead of mistaking a faster lap split for an overtake', () => {
  const timing = new SplitTiming();
  seed(timing, 1, [record(1, 1, 4, 45000), record(1, 2, 1, 60000, 15000)], 2);
  seed(timing, 2, [record(2, 1, 4, 50000), record(2, 2, 1, 61000, 11000)], 1);
  assert.equal(timing.latest(1).opponentRankChange, 0);
  assert.equal(timing.latest(2).opponentRankChange, 0);
  const second = timing.racers.get(2);
  append(second, record(2, 2, 1, 59000, 9000));
  assert.equal(timing.latest(1).opponentRankChange, 1);
  assert.equal(timing.latest(2).opponentRankChange, -1);
});

test('reading and pausing do not consume or mutate movement, and reset clears its baseline', () => {
  const timing = timingWithGhosts([[9000, 21000, 29000, 39000], [11000, 23000, 31000, 41000]]);
  seed(timing, 1, [record(1, 1, 1, 10000), record(1, 1, 2, 20000)]);
  const before = structuredClone([...timing.racers]), ghosts = structuredClone(timing.ghosts), output = timing.latest(1);
  assert.deepEqual(timing.latest(1), output);
  assert.deepEqual(timing.sample({ state: 'paused', time: 900, cars: [] }), []);
  assert.deepEqual(timing.latest(1), output);
  assert.deepEqual([...timing.racers], before); assert.deepEqual(timing.ghosts, ghosts);
  timing.reset(); assert.equal(timing.latest(1), null);
  timing.ghosts = ghosts;
  seed(timing, 1, [record(1, 1, 2, 20000)]);
  assert.deepEqual(changes(timing), [null, null], 'a new race cannot reuse the old first-checkpoint ranks');
});
