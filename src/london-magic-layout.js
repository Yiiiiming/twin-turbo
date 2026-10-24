import { TRACK, trackPoint, projectTrack, mod } from './engine.js';

// A scenery district on the accepted road. These distances never enter track
// construction, checkpoints or score compatibility. All 56 older plots remain.
export const LONDON_MAGIC_ZONE = Object.freeze({ start:5350, end:8050, fade:240 });
const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
export function londonMagicPlacements(){
 if(TRACK.id!=='coast-london')return [];
 const plot=(kind,s,lane,radius,extra={})=>{
  const p=trackPoint(s,lane);
  return Object.freeze({kind,s,lane,radius,x:p.x,z:p.y,elevation:p.elevation,
   angle:p.angle+(lane<0?Math.PI:0),...extra});
 };
 return [plot('hogwarts-castle',6350,-720,275,{height:510}),
  plot('magic-duel-main',6940,-210,105,{height:83}),
  plot('magic-duel-second',5990,210,105,{height:83}),
  ...[LONDON_MAGIC_ZONE.start,LONDON_MAGIC_ZONE.end].map((s,index)=>{
   const p=trackPoint(s);return Object.freeze({kind:'magic-gate',s,x:p.x,z:p.y,
    angle:p.angle-Math.PI/2,elevation:p.elevation,radius:124,height:198,index});
  })];
}

/** An absolute location, not a latched crossing event: reverse driving,
 * off-road excursions, pause and checkpoint recovery cannot leave night stuck.
 * Each camera obtains its own result; no global theme or physics is changed. */
export function londonMagicBlend(car){
 if(TRACK.id!=='coast-london'||!car||!Number.isFinite(car.x)||!Number.isFinite(car.y))return 0;
 const p=projectTrack(car.x,car.y,car._lastTrackS,car.elevation);
 const {start,end,fade}=LONDON_MAGIC_ZONE,t=mod(p.s-start,TRACK.length),span=end-start;
 if(t>span||p.distance>450||Math.abs((car.elevation||0)-p.elevation)>180)return 0;
 return smooth(t/fade)*smooth((span-t)/fade)*smooth((450-p.distance)/140);
}

export function magicLocal(item,x,y,z){
 const c=Math.cos(item.angle),s=Math.sin(item.angle);
 return [item.x+c*x-s*z,(item.elevation||0)+y,item.z+s*x+c*z];
}
