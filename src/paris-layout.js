import { TRACK, trackPoint, projectTrack, mod } from './engine.js';
import { PARIS_LANDMARKS } from './paris-landmarks.js';

// Solved against the frozen Paris road, its two bridges, the three accepted
// monuments and their frontage views. Runtime performs no placement search.
// Alternate low/high silhouettes and materials rather than grouping modules.
const ORDER=Object.freeze([
 'notre-dame','palais-garnier','musee-carnavalet','sacre-coeur','musee-orsay','centre-pompidou',
 'pantheon','grand-palais','fondation-louis-vuitton','invalides','petit-palais','philharmonie-paris',
 'sainte-chapelle','hotel-de-ville','la-geode','madeleine','conciergerie','institut-monde-arabe',
 'saint-sulpice','palais-luxembourg','bnf-francois-mitterrand','saint-eustache','palais-bourbon','gare-du-nord',
 'tour-saint-jacques','palais-royal','gare-de-lyon','institut-de-france','hotel-biron','moulin-rouge',
]);
const cache=new WeakMap();
function segmentDistance(x,z,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],u=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(x-a[0]-u*dx,z-a[1]-u*dz);
}
/** The centre and both wings need an unobstructed view from the driving line.
 * Full footprints protect entrances even when an obstacle has a low roof. */
export function parisBlocksFrontage(obstacle,landmark){
 if(landmark.kind==='paris-bridge-pylon')return false;
 const road=trackPoint(landmark.s??projectTrack(landmark.x,landmark.z).s),angle=landmark.angle??road.angle;
 const width=landmark.width||0,depth=landmark.depth||0;
 return [-.42,0,.42].some(offset=>segmentDistance(obstacle.x,obstacle.z,[road.x,road.y],
  [landmark.x+Math.sin(angle)*depth/2+Math.cos(angle)*width*offset,
   landmark.z-Math.cos(angle)*depth/2+Math.sin(angle)*width*offset])<obstacle.radius+7);
}
export function parisLandmarkPlacements(existing=[],metas=PARIS_LANDMARKS){
 if(TRACK.theme!=='paris')return [];
 const key=JSON.stringify([existing.map(p=>[p.kind,p.x,p.z,p.radius,p.s,p.angle,p.width,p.depth]),metas.map(p=>[p.kind,p.radius,p.width,p.depth,p.height])]);
 if(cache.get(TRACK)?.key===key)return cache.get(TRACK).plots;
 const plots=[];
 for(const meta of metas){
  const index=ORDER.indexOf(meta.kind);
  if(index<0)throw new Error(`No curated Paris plot for ${meta.kind}`);
  // The two 350-unit offsets reserve clear dry banks beside the river. They
  // do not move either bridge or require floating landmark foundations.
  const shift=meta.kind==='petit-palais'||meta.kind==='palais-royal'?350:0;
  const side=meta.kind==='madeleine'||meta.kind==='gare-du-nord'?-1:meta.kind==='palais-bourbon'?1:index%2?1:-1,s=mod(166+index*1660/3+shift,TRACK.length);
  const p=trackPoint(s,side*(meta.radius+100));
  const candidate=Object.freeze({...meta,s,side,x:p.x,z:p.y,angle:p.angle+(side<0?Math.PI:0),elevation:0});
  if(projectTrack(p.x,p.y).distance<TRACK.roadWidth/2+meta.radius+30||
    Math.abs(p.y-TRACK.river.centerZ)<TRACK.river.halfWidth+meta.radius+30||
    [...existing,...plots].some(other=>Math.hypot(other.x-p.x,other.z-p.y)<other.radius+meta.radius+30||
      parisBlocksFrontage(candidate,other)||parisBlocksFrontage(other,candidate)))
   throw new Error(`Paris plot or frontage is no longer clear for ${meta.kind}`);
  plots.push(candidate);
 }
 const frozen=Object.freeze(plots);cache.set(TRACK,{key,plots:frozen});return frozen;
}
