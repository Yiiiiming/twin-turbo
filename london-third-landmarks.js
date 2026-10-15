import { LONDON_THIRD_CIVIC, addLondonThirdCivic } from './london-third-civic.js';
import { LONDON_THIRD_RIVERSIDE, addLondonThirdRiverside } from './london-third-riverside.js';

/** A third set of ten: brick streets, civic stone, steel towers and a ship.
 * Each keeps its architectural material identity within London's muted palette.
 */
export const LONDON_THIRD_LANDMARKS=Object.freeze([...LONDON_THIRD_CIVIC,...LONDON_THIRD_RIVERSIDE]);
const civicKinds=new Set(LONDON_THIRD_CIVIC.map(item=>item.kind));
export function addLondonThirdLandmark(mesh,item){
 if(civicKinds.has(item.kind))addLondonThirdCivic(mesh,item);
 else addLondonThirdRiverside(mesh,item);
}
