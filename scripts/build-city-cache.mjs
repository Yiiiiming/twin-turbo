/** Fixed London geometry is calculated at build time. This generated source
 * asset is bundled into both the game and its visual QA page; it is never fetched
 * asynchronously and it never replaces the racing/physics track definition. */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const CITY_CACHE_PATH = resolve(ROOT, 'assets/london-road-cache.json');
export const CITY_CACHE_SCHEMA = 1;
const INPUTS = [
  'assets/london-map.json', 'tracks.js', 'city-roads.js', 'city-geometry.js',
  'scripts/build-city-cache.mjs', 'pnpm-lock.yaml',
];

export async function cityCacheSourceHash() {
  const hash = createHash('sha256');
  for (const name of INPUTS) {
    hash.update(name); hash.update('\0'); hash.update(await readFile(resolve(ROOT, name))); hash.update('\0');
  }
  return hash.digest('hex');
}

export async function createCityCachePayload(sourceHash = null) {
  sourceHash ??= await cityCacheSourceHash();
  const [{ createLondonTrack, geographicToWorld }, roads, mapText] = await Promise.all([
    import('../tracks.js'), import('../city-roads.js'), readFile(resolve(ROOT, 'assets/london-map.json'), 'utf8'),
  ]);
  const map = JSON.parse(mapText), track = createLondonTrack(map);
  const tunnelStudy = roads.createTunnelStudy(track);
  const roadStudy = roads.createRoadStudy(map, track);
  const courseRoadStudy = roads.createCourseRoadStudy(track);
  const coordinates = item => (item.coordinates || item.footprint || []).map(coordinate => geographicToWorld(track.projection, ...coordinate));
  const waterSurfaces = (map.water || []).map(coordinates).filter(points => points.length >= 3).map(outer => ({ outer, holes: [] }));
  const cuts = [...tunnelStudy.openings, ...waterSurfaces];
  const margin = 4500, outer = [{ x: -margin, y: -margin }, { x: track.width + margin, y: -margin },
    { x: track.width + margin, y: track.height + margin }, { x: -margin, y: track.height + margin }];
  const groundSurfaces = roads.subtractGroundFootprints(outer, cuts);
  const parkSurfaces = (map.parks || []).map(coordinates).filter(points => points.length >= 3)
    .flatMap(points => roads.subtractGroundFootprints(points, cuts));
  return {
    schemaVersion: CITY_CACHE_SCHEMA, sourceHash,
    track: { id: track.id, length: track.length, roadWidth: track.roadWidth, unitsPerMeter: track.unitsPerMeter, sections: track.sections },
    roadStudy, courseRoadStudy, tunnelStudy, landscape: { waterSurfaces, groundSurfaces, parkSurfaces },
  };
}

export async function buildCityCache({ force = false, quiet = false } = {}) {
  const started = performance.now(), sourceHash = await cityCacheSourceHash();
  if (!force) {
    try {
      const text = await readFile(CITY_CACHE_PATH, 'utf8'), existing = JSON.parse(text);
      if (existing.schemaVersion === CITY_CACHE_SCHEMA && existing.sourceHash === sourceHash && existing.track?.id === 'london'
        && existing.roadStudy && existing.courseRoadStudy && existing.tunnelStudy && existing.landscape) {
        const result = { generated: false, bytes: Buffer.byteLength(text), durationMs: performance.now() - started, sourceHash };
        if (!quiet) console.log(`London geometry cache reused (${result.bytes.toLocaleString()} bytes).`);
        return result;
      }
    } catch (error) {
      // Missing or malformed generated data is rebuilt. A real filesystem
      // permission/read failure must remain visible instead of being ignored.
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
  }
  const payload = await createCityCachePayload(sourceHash), text = JSON.stringify(payload) + '\n';
  await mkdir(dirname(CITY_CACHE_PATH), { recursive: true });
  const temporaryPath = `${CITY_CACHE_PATH}.${process.pid}-${randomUUID()}.tmp`;
  await writeFile(temporaryPath, text);
  // Game and visual-QA builds may run together. Each reader sees a complete
  // identical cache, never a half-written JSON document.
  await rename(temporaryPath, CITY_CACHE_PATH);
  const result = { generated: true, bytes: Buffer.byteLength(text), durationMs: performance.now() - started, sourceHash };
  if (!quiet) console.log(`London geometry cache built in ${(result.durationMs / 1000).toFixed(2)} s (${result.bytes.toLocaleString()} bytes).`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildCityCache({ force: process.argv.includes('--force') });
