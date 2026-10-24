import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, setTrack, trackPoint } from '../src/engine.js';
import { beijingReferenceTrack } from '../src/beijing-reference.js';
import { cityLandmarkPlacements, citySceneryPlacements } from '../src/city-scenery.js';

test.afterEach(() => setTrack('coast'));

// The new stadium has its own seats, steel shell and infield; it must not cause
// the original promenade to redistribute every landmark or street frontage.
// Its actual interior driving/camera geometry is covered by the stadium tests.

const wrap = s => {const route=beijingReferenceTrack();return ((s-route.startDistance)%route.length+route.length)%route.length;};
function circularGaps(items) {
  const stations = items.map(item => wrap(item.legacyS??item.s)).sort((a, b) => a - b);
  return stations.map((s, i) => (stations[(i + 1) % stations.length] - s + beijingReferenceTrack().length) % beijingReferenceTrack().length);
}

test('Beijing retains its steady landmark rhythm along the original city promenade', () => {
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

test('Beijing ordinary streetscape remains populated in every original city district', () => {
  setTrack('coast-beijing');
  const scenery = citySceneryPlacements();
  const bins = Array(12).fill(0);
  for (const item of scenery) {
    assert.ok(Number.isFinite(item.s), `${item.kind} must identify its roadside station`);
    bins[Math.floor(wrap(item.legacyS??item.s) / beijingReferenceTrack().length * bins.length)]++;
  }
  for (let i = 0; i < bins.length; i++) {
    const midpoint=beijingReferenceTrack().startDistance+(i+.5)*beijingReferenceTrack().length/bins.length;
    const stadiumDistrict=midpoint>=TRACK.stadium.legacyStart&&midpoint<=TRACK.stadium.legacyEnd;
    if(stadiumDistrict)assert.ok(bins[i]>0&&TRACK.stadium.loopCoverage>.93,'the stadium district retains ordinary frontage around its occupied arena');
    else assert.ok(bins[i] >= 8, `lap sector ${i + 1}/12 has only ${bins[i]} ordinary scenery objects`);
  }
  // The stadium replaces the old bend with populated stands and a field.
  // Every ordinary district outside that explicitly replaced plot stays dense.
  const stations=scenery.map(item=>wrap(item.legacyS??item.s)).sort((a,b)=>a-b);
  const gaps=circularGaps(scenery).filter((gap,i)=>{
    const midpoint=(stations[i]+gap/2)%beijingReferenceTrack().length+beijingReferenceTrack().startDistance;
    return midpoint<TRACK.stadium.legacyStart||midpoint>TRACK.stadium.legacyEnd;
  });
  const longestGap = Math.max(...gaps);
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
