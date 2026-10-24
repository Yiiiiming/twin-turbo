/** The thirty additions are separate from the accepted Eiffel/Arc/Louvre set. */
import { PARIS_MONUMENTS, addParisMonument } from './paris-monuments.js';
import { PARIS_PALACES, addParisPalace } from './paris-palaces.js';
import { PARIS_CULTURE, addParisCulture } from './paris-culture.js';
export const PARIS_LANDMARKS=Object.freeze([...PARIS_MONUMENTS,...PARIS_PALACES,...PARIS_CULTURE]);
export function addParisLandmark(mesh,item){
 return addParisMonument(mesh,item)||addParisPalace(mesh,item)||addParisCulture(mesh,item);
}
