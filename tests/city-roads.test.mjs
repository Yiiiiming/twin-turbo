import test from 'node:test';
import assert from 'node:assert/strict';
import polygonClipping from 'polygon-clipping';
import { bufferRoadPolyline, createRoadStudy, createCourseRoadStudy } from '../city-roads.js';
import { createClosedTrack, distanceAlongTrack, pointOnTrack } from '../tracks.js';
import { TRACKS } from '../engine.js';
import londonMap from '../assets/london-map.json' with { type: 'json' };

const projection = { longitude: 0, latitude: 0, longitudeMeters: 1, latitudeMeters: 1, unitsPerMeter: 1, offsetX: 0, offsetY: 0 };
const track = createClosedTrack({ id: 'roads-test', name: 'Roads test', city: 'Test', projection,
  unitsPerMeter: 1, width: 2200, height: 1800, points: [{ x: 200, y: 200 }, { x: 1600, y: 200 }, { x: 1600, y: 1400 }, { x: 200, y: 1400 }] });
const road = (id, points, tags = {}) => ({ id, coordinates: points.map(([x, y]) => [x, -y]), tags: { highway: 'residential', width: '18', ...tags } });
const rings = surface => [surface.outer, ...surface.holes].map(ring => ring.map(p => [p.x, p.y]));
const ringArea = ring => Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const area = polygons => polygons.reduce((sum, polygon) => sum + ringArea(polygon[0]) - polygon.slice(1).reduce((holes, ring) => holes + ringArea(ring), 0), 0);
const exactDistance = (track, p) => { const near = pointOnTrack(track, distanceAlongTrack(track, p)); return Math.hypot(p.x - near.x, p.y - near.y); };
const along = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

test('rounded road joins stay bounded at sharp reversals, duplicates and intersections', () => {
  for (const points of [
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 1, y: 1 }],
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
    [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }],
  ]) {
    const result = bufferRoadPolyline(points, 20); assert.ok(result.length);
    for (const [x, y] of result.flat(2)) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      assert.ok(x >= -10.001 && x <= 110.001 && y >= -10.001 && y <= 110.001);
    }
    assert.ok(area(result) > 1000);
  }
  assert.deepEqual(bufferRoadPolyline([{ x: 1, y: 1 }, { x: 1, y: 1 }], 10), []);
  assert.throws(() => bufferRoadPolyline([{ x: 0, y: 0 }, { x: Infinity, y: 0 }], 10), /finite/);
});

test('background tarmac and crossing pavements leave the race corridor clear', () => {
  const map = { roads: [road('cross', [[900, 0], [900, 600]]), road('joining', [[700, 400], [1200, 400]])] };
  const result = createRoadStudy(map, track, { renderDistanceMeters: 1200 });
  assert.equal(result.stats.visibleRoads, 2);
  const protectedArea = [[[300, 144], [1500, 144], [1500, 256], [300, 256], [300, 144]]];
  for (const surface of [...result.backgroundRoadSurfaces, ...result.sidewalkSurfaces]) assert.ok(area(polygonClipping.intersection(rings(surface), protectedArea)) < .001);
  for (const pavement of result.sidewalkSurfaces) for (const asphalt of result.backgroundRoadSurfaces)
    assert.ok(area(polygonClipping.intersection(rings(pavement), rings(asphalt))) < .001, 'pavement must not stripe across a side-street junction');
  assert.equal(result.branchClosures.length, 2);
  for (const barrier of result.branchClosures) for (let i = 0; i <= 20; i++) assert.ok(exactDistance(track, along(barrier.a, barrier.b, i / 20)) >= track.roadWidth / 2 + 7.8);
});

test('nearby disconnected streets and grade-separated crossings do not get branch barriers', () => {
  const result = createRoadStudy({ roads: [
    road('nearby', [[750, 270], [1000, 310]]), road('bridge', [[800, 0], [800, 600]], { bridge: 'yes', layer: '1' }),
    road('tunnel', [[700, 0], [700, 600]], { tunnel: 'yes', layer: '-1' }),
  ] }, track, { renderDistanceMeters: 1200 });
  assert.equal(result.stats.skippedLayers, 2); assert.equal(result.branchClosures.length, 0);
  assert.ok(result.backgroundRoadSurfaces.every(surface => !/bridge|tunnel/.test(surface.id)));
});

test('actual London branches stay outside both racing lanes and respect tunnel and bridge decks', () => {
  const result = createRoadStudy(londonMap, TRACKS.london), london = TRACKS.london;
  assert.ok(result.stats.visibleRoads > 800 && result.stats.visibleRoads < londonMap.roads.length);
  assert.ok(result.stats.skippedLayers > 50); assert.ok(result.branchClosures.length > 50);
  for (const surface of [...result.backgroundRoadSurfaces, ...result.sidewalkSurfaces]) {
    assert.ok(surface.outer.length >= 4);
    for (const p of [surface.outer, ...surface.holes].flat()) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
  for (const barrier of result.branchClosures) {
    const near = pointOnTrack(london, barrier.s);
    assert.ok(!near.tunnel && !near.bridge && Math.abs(near.elevation) < .5);
    assert.equal(barrier.elevation, 0);
    for (let i = 0; i <= 20; i++) {
      const p = along(barrier.a, barrier.b, i / 20), distance = exactDistance(london, p);
      assert.ok(distance > 52.5, `${barrier.id}: closure intrudes into racing space (${distance})`);
      assert.ok(distance - london.carRadius > 30, 'left and right normal racing lanes remain open to a complete car');
    }
  }
});


const containsPoint = (surface, point) => {
  const inside = ring => {
    let found = false;
    for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=ring[i],b=ring[j];
      if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)found=!found;
    }
    return found;
  };
  return inside(surface.outer) && !surface.holes.some(inside);
};

test('the real Shaftesbury and Wardour corners have continuous asphalt with no kerb or guide folded over the racing lanes', () => {
  const london=TRACKS.london, study=createCourseRoadStudy(london);
  assert.equal(study.elevatedPaths.length,3);
  assert.ok(study.flatAsphaltSurfaces.length>=3);
  let samples=0;
  // Includes all the original 88 inverted-triangle locations and the s=11490
  // screenshot corner. The unchanged centerline and its full racing width must
  // lie inside asphalt; edge paint and kerbs must never stripe across it.
  for(let s=0;s<london.length;s+=12) {
    const center=pointOnTrack(london,s);
    if(center.bridge||center.tunnel)continue;
    for(const lane of [-30,0,30]) {
      const point=pointOnTrack(london,s,lane);
      assert.ok(study.flatAsphaltSurfaces.some(surface=>containsPoint(surface,point)),`missing asphalt at s=${s}, lane=${lane}`);
      assert.ok(!study.flatKerbSurfaces.some(surface=>containsPoint(surface,point)),`kerb folds over lane at s=${s}, lane=${lane}`);
      if(s<5450||s>5890)assert.ok(!study.flatGuideSurfaces.some(surface=>containsPoint(surface,point)),`guide folds over lane at s=${s}, lane=${lane}`);
      samples++;
    }
  }
  assert.ok(samples>7000);
  for(const surface of [...study.flatAsphaltSurfaces,...study.flatPavementSurfaces,...study.flatKerbSurfaces,...study.flatGuideSurfaces])
    for(const p of [surface.outer,...surface.holes].flat())assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  for(const path of study.elevatedPaths) for(const p of path.points) {
    const original=pointOnTrack(london,p.s);
    assert.equal(p.elevation,original.elevation);assert.equal(p.slope,original.slope);
  }
});
