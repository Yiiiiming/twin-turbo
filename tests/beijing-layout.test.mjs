import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, setTrack, trackPoint } from '../engine.js';
import { cityLandmarkPlacements, citySceneryPlacements } from '../city-scenery.js';

test.afterEach(() => setTrack('coast'));

const wrap = s => ((s - TRACK.startDistance) % TRACK.length + TRACK.length) % TRACK.length;
function circularGaps(items) {
  const stations = items.map(item => wrap(item.s)).sort((a, b) => a - b);
  return stations.map((s, i) => (stations[(i + 1) % stations.length] - s + TRACK.length) % TRACK.length);
}

test('Beijing landmarks have a steady viewing rhythm across the entire lap', () => {
  setTrack('coast-beijing');
  const landmarks = cityLandmarkPlacements();
  assert.equal(landmarks.length, 23);
  const gaps = circularGaps(landmarks);
  assert.ok(Math.min(...gaps) >= 450, `landmarks bunch up within ${Math.min(...gaps).toFixed(1)} units`);
  assert.ok(Math.max(...gaps) <= 1000, `landmark-free stretch is ${Math.max(...gaps).toFixed(1)} units`);
  for (const side of [-1, 1]) {
    assert.ok(landmarks.filter(item => item.side === side).length >= 6, `too few landmarks on side ${side}`);
  }
});

test('Beijing ordinary streetscape continues through every twelfth of the lap', () => {
  setTrack('coast-beijing');
  const scenery = citySceneryPlacements();
  const bins = Array(12).fill(0);
  for (const item of scenery) {
    assert.ok(Number.isFinite(item.s), `${item.kind} must identify its roadside station`);
    bins[Math.floor(wrap(item.s) / TRACK.length * bins.length)]++;
  }
  for (let i = 0; i < bins.length; i++) {
    assert.ok(bins[i] >= 8, `lap sector ${i + 1}/12 has only ${bins[i]} ordinary scenery objects`);
  }
  const longestGap = Math.max(...circularGaps(scenery));
  assert.ok(longestGap < 350, `ordinary scenery disappears for ${longestGap.toFixed(1)} units`);
  for (const side of [-1, 1]) {
    assert.ok(scenery.filter(item => item.side === side).length >= 30, `ordinary streetscape is missing on side ${side}`);
  }
});

test('Beijing hill section has landmarks and ordinary scenery on both sides', () => {
  setTrack('coast-beijing');
  // This section used to lose all scenery because road elevation was treated
  // as a reason to reject plots on the surrounding ground.
  const isHillStation = item => trackPoint(item.s).elevation > 5;
  const landmarks = cityLandmarkPlacements().filter(isHillStation);
  const scenery = citySceneryPlacements().filter(isHillStation);
  assert.ok(landmarks.length >= 3, `only ${landmarks.length} landmarks remain along the hill`);
  for (const side of [-1, 1]) {
    const count = scenery.filter(item => item.side === side).length;
    assert.ok(count >= 8, `hill side ${side} has only ${count} ordinary scenery objects`);
  }
});
