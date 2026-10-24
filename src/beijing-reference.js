/** Stable city-planning reference: the stadium detour must not rotate or stretch
 * the rest of Beijing's accepted buildings, neighborhoods and Great Wall. */
import { TRACK } from './engine.js';
import { roadSurface } from './tracks.js';
const TAU=Math.PI*2,wrap=(n,length)=>((n%length)+length)%length;
export const beijingReferenceTrack=()=>TRACK.stadium?.baseRoute||TRACK;
function segmentPoint(segment,along,lane=0){
 let x,y,angle,curvature=0;
 if(segment.kind==='line'){
  const t=along/segment.length;x=segment.x1+(segment.x2-segment.x1)*t;y=segment.y1+(segment.y2-segment.y1)*t;angle=segment.angle;
 }else{
  const radial=segment.startAngle+segment.direction*along/segment.radius;
  x=segment.cx+Math.cos(radial)*segment.radius;y=segment.cy+Math.sin(radial)*segment.radius;angle=radial+segment.direction*Math.PI/2;curvature=segment.direction/segment.radius;
 }
 return {x:x-Math.sin(angle)*lane,y:y+Math.cos(angle)*lane,angle,curvature};
}
export function beijingReferencePoint(distance,lane=0){
 const track=beijingReferenceTrack(),s=wrap(distance,track.length);
 const segment=track.segments.find(p=>s<p.s+p.length)||track.segments.at(-1);
 return {...segmentPoint(segment,s-segment.s,lane),s,...roadSurface(track,s)};
}
export function beijingReferenceProjection(x,y){
 const track=beijingReferenceTrack();let nearest=Infinity,station=0;
 for(const segment of track.segments){
  let along;
  if(segment.kind==='line')along=Math.max(0,Math.min(segment.length,((x-segment.x1)*(segment.x2-segment.x1)+(y-segment.y1)*(segment.y2-segment.y1))/segment.length));
  else{
   const angle=Math.atan2(y-segment.cy,x-segment.cx),turn=wrap(segment.direction*(angle-segment.startAngle),TAU);
   if(turn<=Math.abs(segment.sweep))along=turn*segment.radius;
   else{const a=segmentPoint(segment,0),b=segmentPoint(segment,segment.length);along=Math.hypot(x-a.x,y-a.y)<=Math.hypot(x-b.x,y-b.y)?0:segment.length;}
  }
  const p=segmentPoint(segment,along),distance=Math.hypot(x-p.x,y-p.y);
  if(distance<nearest){nearest=distance;station=wrap(segment.s+along,track.length);}
 }
 return {...beijingReferencePoint(station),distance:nearest};
}
