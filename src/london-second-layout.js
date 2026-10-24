import { TRACK, trackPoint, projectTrack, mod } from './engine.js';
import { LONDON_SECOND_LANDMARKS } from './london-second-landmarks.js';

// Roadside infill only: every existing landmark is an immutable occupied plot.
// Each façade faces the road and its complete footprint clears both the road
// and Thames. Searching around a target distributes additions through the lap.
const plots = [
 [650,1],[2350,1],[4750,1],[5700,-1],[7950,-1],
 [8850,1],[10900,-1],[12150,1],[13800,1],[15750,1],
];
export function londonSecondLandmarkPlacements(existing=[]) {
 if(TRACK.theme!=='london')return [];
 const additions=[];
 for(const [index,meta] of LONDON_SECOND_LANDMARKS.entries()) {
  const [target,preferredSide]=plots[index];let found;
  for(const shift of [0,100,-100,200,-200,300,-300,450,-450,600,-600,800,-800,1000,-1000,1250,-1250,1500,-1500,2000,-2000]) {
   for(const setback of [96,116,140]){for(const side of [preferredSide,-preferredSide]) {
    const s=mod(target+shift,TRACK.length),p=trackPoint(s,side*(meta.radius+setback));
    if(p.elevation>1||projectTrack(p.x,p.y).distance<TRACK.roadWidth/2+meta.radius+27)continue;
    if(Math.abs(p.y-TRACK.river.centerZ)<TRACK.river.halfWidth+meta.radius+27)continue;
    if([...existing,...additions].some(other=>Math.hypot(other.x-p.x,other.z-p.y)<other.radius+meta.radius+30))continue;
    found=Object.freeze({...meta,s,side,x:p.x,z:p.y,angle:p.angle+(side<0?Math.PI:0),elevation:0});break;
   }if(found)break;}
   if(found)break;
  }
  if(!found)throw new Error(`No clear London infill plot for ${meta.kind}`);
  additions.push(found);
 }
 return additions;
}
