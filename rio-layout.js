import { TRACK,trackPoint,projectTrack } from './engine.js';
import { RIO_LANDMARKS } from './rio-landmarks.js';

// Offline-solved plots around the unchanged 16.4 km Rio circuit. Low courtyards,
// warm historic facades and green/modern roofs alternate throughout the lap.
// [kind, station shift, side, setback beyond the complete footprint radius]
// The last coastal sequence keeps its whole envelope inland, while the compact
// hill churches/pavilion face the high road without occupying either old hill.
const PRESETS=Object.freeze([
 ['rio-candelaria',110,-1,175],['rio-biblioteca-nacional',-110,1,175],['central-do-brasil',0,-1,200],
 ['rio-sao-bento',0,1,225],['rio-theatro-municipal',-110,-1,175],['mar-rio',-55,-1,200],
 ['rio-gloria-church',110,1,175],['rio-real-gabinete',0,1,175],['parque-lage',0,-1,175],
 ['rio-penha-church',0,1,175],['rio-palacio-laranjeiras',0,-1,175],['rio-botanical-garden',0,1,175],
 ['rio-vista-chinesa',0,-1,175],['rio-museu-nacional',-55,-1,175],['maracana-stadium',-55,-1,200],
 ['rio-ilha-fiscal',0,-1,175],['rio-paco-imperial',-55,-1,200],['sambadrome',-55,1,175],
 ['rio-metropolitan-cathedral',55,-1,175],['rio-ccbb',0,1,175],['museum-of-tomorrow',0,-1,175],
 ['rio-copacabana-fort',0,1,175],['mam-rio',165,1,175],['copacabana-palace',-55,1,175],
 ['rio-belas-artes',0,1,175],['rio-national-history-museum',0,1,200],['rio-palacio-tiradentes',-55,1,175],
 ['selaron-steps',55,1,200],['rio-old-cathedral',0,-1,225],['rio-palacio-catete',-55,1,175],
]);
const cache=new WeakMap();
function segmentDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],u=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-u*dx,z-a[1]-u*dz);}
/** Three road-to-frontage sight lines protect both wings, not just the doorway. */
export function rioBlocksFrontage(obstacle,landmark){
 const road=trackPoint(landmark.s??projectTrack(landmark.x,landmark.z).s),angle=landmark.angle??road.angle;
 return [-.42,0,.42].some(wing=>segmentDistance(obstacle.x,obstacle.z,[road.x,road.y],
  [landmark.x+Math.sin(angle)*(landmark.depth||0)/2+Math.cos(angle)*(landmark.width||0)*wing,
   landmark.z-Math.cos(angle)*(landmark.depth||0)/2+Math.sin(angle)*(landmark.width||0)*wing])<obstacle.radius+7);
}
export function rioShoreBoundary(){
 let far=-Infinity;const count=Math.ceil(TRACK.length/50);
 for(let i=0;i<=count;i++)far=Math.max(far,trackPoint(i/count*TRACK.length).y);
 return far+TRACK.roadWidth/2+90;
}
export function rioLandmarkPlacements(existing=[],metas=RIO_LANDMARKS){
 if(TRACK.theme!=='rio')return [];
 const key=JSON.stringify([existing.map(p=>[p.kind,p.x,p.z,p.radius,p.s,p.angle,p.width,p.depth]),metas.map(p=>[p.kind,p.radius,p.width,p.depth,p.height])]);
 if(cache.get(TRACK)?.key===key)return cache.get(TRACK).plots;
 const shore=rioShoreBoundary(),plots=[];
 for(const meta of metas){
  const index=PRESETS.findIndex(p=>p[0]===meta.kind);if(index<0)throw new Error(`No curated Rio plot for ${meta.kind}`);
  const [,shift,side,setback]=PRESETS[index],s=100+index*TRACK.length/30+shift,p=trackPoint(s,side*(meta.radius+setback));
  const q=Object.freeze({...meta,s,side,x:p.x,z:p.y,angle:p.angle+(side<0?Math.PI:0),elevation:0});
  if(projectTrack(q.x,q.z).distance<TRACK.roadWidth/2+meta.radius+30||q.z+meta.radius>shore-22||
   [...existing,...plots].some(o=>Math.hypot(o.x-q.x,o.z-q.z)<o.radius+meta.radius+30||rioBlocksFrontage(q,o)||rioBlocksFrontage(o,q)))
   throw new Error(`Rio plot, shore or frontage is no longer clear for ${meta.kind}`);
  plots.push(q);
 }
 const result=Object.freeze(plots);cache.set(TRACK,{key,plots:result});return result;
}
