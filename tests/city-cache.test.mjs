import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { CITY_CACHE_PATH, buildCityCache, createCityCachePayload, cityCacheSourceHash } from '../scripts/build-city-cache.mjs';
import { TRACKS } from '../engine.js';
import { pointOnTrack } from '../tracks.js';
import { ObstacleWorld } from '../collisions.js';

test('the generated London cache preserves every coordinate, cutout, tunnel solid and collision record', async () => {
  // JSON normalization changes -0 to 0 only; all finite coordinates retain their
  // exact representable value. This compares the complete output, not a sample.
  const fresh = JSON.parse(JSON.stringify(await createCityCachePayload()));
  const cache = JSON.parse(await readFile(CITY_CACHE_PATH, 'utf8'));
  assert.equal(cache.sourceHash, await cityCacheSourceHash());
  assert.deepEqual(cache, fresh);
});

test('an unchanged build reuses the generated asset without rewriting it', async () => {
  const before = await stat(CITY_CACHE_PATH);
  const result = await buildCityCache({ quiet: true });
  const after = await stat(CITY_CACHE_PATH);
  assert.equal(result.generated, false);
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.equal(after.size, result.bytes);
});

test('cached tunnel solids and branch closures preserve complete-car clearance', async () => {
  const cache = JSON.parse(await readFile(CITY_CACHE_PATH, 'utf8')); 
  const track = TRACKS.london;
  const closures = cache.roadStudy.branchClosures.map(item => ({ id: item.id, type: 'box',
    x: item.x, y: item.y, halfWidth: item.length / 2, halfDepth: 2.4, angle: item.angle,
    minHeight: item.elevation, maxHeight: item.elevation + 5.7 }));
  const obstacles = [...closures, ...cache.tunnelStudy.sections.flatMap(section => section.obstacles)];
  const world = new ObstacleWorld(obstacles, { carRadius: track.carRadius });
  for (let s = 0; s < track.length; s += 10) for (const lane of [-30, 0, 30]) {
    const point = pointOnTrack(track, s, lane), car = { ...point, speed: 200, height: track.carHeight };
    assert.equal(world.resolveCar(car), 0, `cached geometry blocks lane ${lane} at ${s}`);
  }
});
