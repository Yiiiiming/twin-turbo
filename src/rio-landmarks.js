/** Thirty Rio additions; the accepted Christ/Sugarloaf/Lapa models stay separate. */
import { RIO_HERITAGE_LANDMARKS, addRioHeritage } from './rio-heritage.js';
import { RIO_CIVIC_LANDMARKS, addRioCivic } from './rio-civic.js';
import { RIO_CULTURE_LANDMARKS, addRioCulture } from './rio-culture.js';
export const RIO_LANDMARKS=Object.freeze([...RIO_HERITAGE_LANDMARKS,...RIO_CIVIC_LANDMARKS,...RIO_CULTURE_LANDMARKS]);
export function addRioLandmark(mesh,item){return addRioHeritage(mesh,item)||addRioCivic(mesh,item)||addRioCulture(mesh,item);}
