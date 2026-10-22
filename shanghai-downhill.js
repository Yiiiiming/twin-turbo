/** A ground-rooted architectural journey beside the existing Shanghai descent.
 * Every footprint reserves all branches of the frozen course and chase view. */
import { TRACK, trackPoint, projectTrack } from './engine.js';
import { cityLandmarkPlacements, citySceneryPlacements } from './city-scenery.js';
import { pudongSkylinePlacements, shanghaiRiverClearance } from './shanghai-riverfront.js';
import { SHANGHAI_DOWNHILL_MODERN, addShanghaiDownhillModern } from './shanghai-downhill-modern.js';
import { SHANGHAI_HERITAGE_LANDMARKS, addShanghaiHeritage } from './shanghai-downhill-heritage.js';
import { frame } from './london-west-end.js';

export const SHANGHAI_DOWNHILL_LANDMARKS = Object.freeze([
  ...SHANGHAI_DOWNHILL_MODERN,
  ...SHANGHAI_HERITAGE_LANDMARKS.map(meta => Object.freeze({ ...meta, family: 'heritage',
    features: Object.freeze(Array.isArray(meta.features) ? [...meta.features] : meta.features.split(/,\s*/)) })),
]);
const cache = new WeakMap();
export function shanghaiDownhillPlacements() {
  if (TRACK.theme !== 'shanghai') return [];
  if (cache.has(TRACK)) return cache.get(TRACK);
  const descent = TRACK.elevationProfile.find(profile => profile.from > profile.to);
  if (!descent) return [];
  const reserved = [...cityLandmarkPlacements(), ...citySceneryPlacements(), ...pudongSkylinePlacements()];
  const plots = [], counts = { skyline: 0, culture: 0, heritage: 0 };
  for (const meta of SHANGHAI_DOWNHILL_LANDMARKS) {
    const family = meta.family || 'heritage', index = counts[family]++;
    const side = index % 2 ? 1 : -1, row = family === 'heritage' ? 1 + Math.floor(index / 2) % 2 : 0;
    // Tall skyline anchors follow the high flyover; lower galleries and historic
    // courtyards become visible as the road descends towards ground level.
    const target = descent.start + (family === 'skyline' ? 500 + Math.floor(index / 2) * 430
      : family === 'culture' ? 3700 + Math.floor(index / 2) * 290 : 3680 + Math.floor(index / 4) * 335 + (row - 1) * 120);
    let selected;
    for (const lateralExtra of [...new Set([row * 330, row * 330 + 85, row * 330 + 170, 0, 330, 660, 990, 1150])]) {
      for (const shift of [0, 55, -55, 110, -110, 165, -165, 240, -240, 330, -330, 440, -440, 550, -550, 700, -700, 900, -900, 1100, -1100, -1400, -1700, -2000, -2300, -2600]) {
        const s = Math.min(descent.end - 100, Math.max(descent.start + 220, target + shift));
        const p = trackPoint(s, side * (meta.radius + 132 + lateralExtra));
        if (p.slope >= -.002) continue;
        if (p.x < -650 || p.y < -400 || p.x > TRACK.width + 850 || p.y > TRACK.height + 700) continue;
        if (projectTrack(p.x, p.y).distance < meta.radius + 126) continue;
        if (!shanghaiRiverClearance(p.x, p.y, meta.radius)) continue;
        if ([...reserved, ...plots].some(other => Math.hypot(other.x - p.x, other.z - p.y) < other.radius + meta.radius + 24)) continue;
        selected = Object.freeze({ ...meta, family, nameZh: meta.nameZh || meta.zh, x: p.x, z: p.y,
          elevation: 0, angle: p.angle + (side < 0 ? Math.PI : 0), s, side, row,
          roadElevation: p.elevation, distanceFromRoad: projectTrack(p.x, p.y).distance });
        break;
      }
      if (selected) break;
    }
    if (!selected) throw new Error(`No clear Shanghai descent plot for ${meta.kind}`);
    plots.push(selected);
  }
  const result = Object.freeze(plots); cache.set(TRACK, result); return result;
}

export function addShanghaiDownhillLandmark(mesh, item) {
  if (item.family === 'heritage') addShanghaiHeritage(mesh, item);
  else addShanghaiDownhillModern(mesh, item);
}

export function addShanghaiDownhillLandmarks(mesh) {
  for (const item of shanghaiDownhillPlacements()) addShanghaiDownhillLandmark(mesh, item);
}

/** Low planted courts connect each monument to the ground. These are scenery,
 * never extra landmarks, road surfaces, or floating foundations. */
export function addShanghaiDownhillCourts(mesh) {
  for (const item of shanghaiDownhillPlacements()) {
    let width = item.width + 80, depth = item.depth + 80;
    const maximum = projectTrack(item.x, item.z).distance - TRACK.roadWidth / 2 - 28;
    let radius = Math.hypot(width, depth) / 2;
    const scale = Math.min(1, maximum / radius);
    width *= scale; depth *= scale; radius *= scale;
    if (!shanghaiRiverClearance(item.x, item.z, radius)) continue;
    const f = frame(mesh, item), paving = item.family === 'heritage' ? '#a4a48b' : '#a5a89c';
    f.quad([-width/2,.035,-depth/2],[-width/2,.035,depth/2],[width/2,.035,depth/2],[width/2,.035,-depth/2], '#718a68');
    const walk = Math.min(width * .86, item.width + 30);
    f.quad([-walk/2,.06,-depth*.42],[-walk/2,.06,depth*.42],[walk/2,.06,depth*.42],[walk/2,.06,-depth*.42], paving);
    for (const side of [-1, 1]) {
      const x = side * (width/2 - 12);
      f.quad([x-6,.08,-depth*.38],[x-6,.08,depth*.38],[x+6,.08,depth*.38],[x+6,.08,-depth*.38], '#4e714b');
    }
  }
}
