import { TRACK, trackPoint, projectTrack, mod } from './engine.js';

// The 46 accepted plots remain immutable. Alternate masonry, brick and glass
// additions through the lap: the ship gets an open Thames-side plot, while the
// two new office towers stay away from the existing Gherkin/Shard groups.
const PLOTS=Object.freeze({
 'harrods':[14500,-1],
 'british-library':[4970,1],
 'guildhall':[6250,1],
 'st-martin-in-the-fields':[3350,1],
 'royal-observatory':[7750,-1],
 'lloyds-building':[3950,-1],
 'one-canada-square':[10950,1],
 'cutty-sark':[12950,1],
 'admiralty-arch':[10080,1],
 'brompton-oratory':[2100,-1],
});
const SHIFTS=[0,25,-25,50,-50,100,-100,150,-150,200,-200,300,-300];

function segmentDistance(x,z,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
function blocksFrontage(obstacle,landmark){
 const road=trackPoint(landmark.s??projectTrack(landmark.x,landmark.z).s),angle=landmark.angle??road.angle;
 const width=landmark.width||0,depth=landmark.depth||0;
 const x=landmark.x+Math.sin(angle)*depth/2,z=landmark.z-Math.cos(angle)*depth/2;
 // Protect the central facade and both wings, not just the plot centres. Using
 // a full obstacle radius also protects low entrances and signs, irrespective
 // of how tall a later model variant is. Older circular landmarks use centre.
 return [-.42,0,.42].some(offset=>segmentDistance(obstacle.x,obstacle.z,[road.x,road.y],
  [x+Math.cos(angle)*width*offset,z+Math.sin(angle)*width*offset])<obstacle.radius+7);
}

export function londonThirdLandmarkPlacements(existing=[],metas=[]){
 if(TRACK.theme!=='london')return [];
 const additions=[];
 for(const meta of metas){
  const plan=PLOTS[meta.kind];
  if(!plan)throw new Error(`No curated London plot for ${meta.kind}`);
  const [target,preferredSide]=plan,occupied=[...existing,...additions];let found;
  // Search is bounded, and favours the first row before any deeper setback.
  // The accepted ten all fit their exact targets with the minimum setback.
  for(const setback of [96,116,140]){
   for(const shift of SHIFTS){
    for(const side of [preferredSide,-preferredSide]){
     const s=mod(target+shift,TRACK.length),p=trackPoint(s,side*(meta.radius+setback));
     if(p.elevation>0||projectTrack(p.x,p.y).distance<TRACK.roadWidth/2+meta.radius+27)continue;
     if(Math.abs(p.y-TRACK.river.centerZ)<TRACK.river.halfWidth+meta.radius+27)continue;
     const candidate={...meta,s,side,x:p.x,z:p.y,angle:p.angle+(side<0?Math.PI:0),elevation:0};
     if(occupied.some(other=>Math.hypot(other.x-p.x,other.z-p.y)<other.radius+meta.radius+30||
       blocksFrontage(candidate,other)||blocksFrontage(other,candidate)))continue;
     found=Object.freeze(candidate);break;
    }
    if(found)break;
   }
   if(found)break;
  }
  if(!found)throw new Error(`No clear London plot or facade sightline for ${meta.kind}`);
  additions.push(found);
 }
 return additions;
}
