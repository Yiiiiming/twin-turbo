/** Ground-rooted Shanghai architecture, now distributed through roadside
 * districts while preserving the original models and the frozen racing course. */
import { TRACK, projectTrack } from './engine.js';
import { shanghaiRiverClearance } from './shanghai-riverfront.js';
import { addShanghaiDownhillModern } from './shanghai-downhill-modern.js';
import { addShanghaiHeritage } from './shanghai-downhill-heritage.js';
import { SHANGHAI_ADDITIONAL_LANDMARKS, shanghaiAdditionalPlacements } from './shanghai-layout.js';
import { frame } from './london-west-end.js';

// Keep the established model/preview API while reserving named plots before
// ordinary street infill. The layout module has no city-scenery dependency.
export const SHANGHAI_DOWNHILL_LANDMARKS = SHANGHAI_ADDITIONAL_LANDMARKS;
export const shanghaiDownhillPlacements = shanghaiAdditionalPlacements;

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
    let width = item.courtWidth, depth = item.courtDepth;
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
