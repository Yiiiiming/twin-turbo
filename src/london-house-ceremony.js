import { TRACK, trackPoint, projectTrack } from './engine.js';
import { magicWandPoint } from './london-magic-effects.js';
import { HOUSE_BANNERS, houseCrestTriangles } from './london-house-banner-models.js';

export const HOUSE_CEREMONY_LOCATION=Object.freeze({casterS:5750,casterLane:-105,bannerS:6500,width:64,height:100,top:290});
const LANES=[-126,-42,42,126],clamp=n=>Math.max(0,Math.min(1,n)),mix=(a,b,t)=>a+(b-a)*t;
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
const colors=new Map();
const rgb=value=>{if(!colors.has(value))colors.set(value,[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255));return colors.get(value);};

/** A shared, race-time ceremony. The first approaching player summons the four
 * houses; both views then see the same suspended banners. No physics is changed. */
export class HouseCeremony {
 constructor(){this.reset();}
 reset(){this.startedAt=null;this.lastTime=null;this.laps=new Set();this.state=null;}
 update(engine){
  if(TRACK.id!=='coast-london'){this.reset();return null;}
  const time=Number.isFinite(engine.time)?Math.max(0,engine.time):0;
  if(this.lastTime!==null&&time<this.lastTime||['menu','countdown'].includes(engine.state))this.reset();
  this.lastTime=time;
  if(engine.state==='racing')for(const car of engine.cars||[]){
   const road=projectTrack(car.x,car.y,car._lastTrackS,car.elevation),lap=car.lap||0;
   if(road.s>=5100&&road.s<=6500&&road.distance<150&&Math.abs((car.elevation||0)-road.elevation)<80&&!this.laps.has(lap)){
    this.startedAt=time;this.laps.add(lap);break;
   }
  }
  const elapsed=this.startedAt===null?null:Math.max(0,time-this.startedAt),
   location=HOUSE_CEREMONY_LOCATION,p=trackPoint(location.casterS,location.casterLane),
   raise=elapsed===null?0:smooth(elapsed/.28)*(1-smooth((elapsed-1.15)/.65)),
   caster={kind:'dumbledore',x:p.x,y:p.elevation+3,z:p.y,angle:p.angle-Math.PI/2+.2,
    bodyRoll:-.04*raise,armPitch:.12+raise*(1+.08*Math.sin((elapsed||0)*9))};
  caster.wand=magicWandPoint(caster);
  const origin=trackPoint(location.casterS,location.casterLane),banners=[];
  if(elapsed!==null)for(let index=0;index<4;index++){
   const progress=clamp((elapsed-.14-index*.1)/1.15);if(progress<=0)continue;
   const travel=smooth(progress),unfold=smooth((progress-.2)/.72),target=trackPoint(location.bannerS,LANES[index]);
   banners.push({index,house:HOUSE_BANNERS[index],progress,unfold,time,
    x:mix(origin.x,target.x,travel),z:mix(origin.y,target.y,travel),angle:target.angle,
    y:mix(origin.elevation+70,target.elevation+location.top,travel)+100*Math.sin(Math.PI*travel),
    flutter:time*2.5+index*1.7});
  }
  return this.state={caster,banners,elapsed,time};
 }
}

/** Every cloth, trim and crest vertex shares this deformation. Layer offsets
 * keep the heraldry ahead of the cloth, rather than flickering in its surface. */
export function bannerPoint(banner,u,v,layer=0){
 const {width,height}=HOUSE_CEREMONY_LOCATION,unfold=banner.unfold,
  x=(u-.5)*width*(.08+.92*unfold),drop=height*(.05+.95*unfold)*(v-.10*Math.abs(u*2-1)*v**6),
  // The embroidered center moves as one gently tilting patch. Curl is confined
  // to the loose edges/tail, so differently triangulated crest layers cannot
  // cut through each other when the surrounding fabric ripples.
  edge=Math.max(0,(Math.abs(u-.5)-.28)/.22),tail=Math.max(0,(v-.76)/.24),
  wave=unfold*((1-v)*Math.sin(banner.flutter)*2+(u-.5)*Math.cos(banner.flutter*.8)*3
   +edge*edge*Math.sin(banner.flutter+v*4)*4+tail*tail*Math.sin(banner.flutter+u*4)*5),
  depth=wave-layer*.65,c=Math.cos(banner.angle),s=Math.sin(banner.angle);
 return [banner.x-s*x+c*depth,banner.y-drop,banner.z+c*x+s*depth];
}

/** Append opaque flags to unused capacity in the existing spell VBO. The
 * additive spell prefix is left byte-for-byte intact; there is no extra GPU pool. */
export function appendHouseBanners(pool,state){
 const first=pool.count;if(!state)return {first,count:0};
 const tri=(points,color,normal,emission=.62)=>{
  if(pool.count+3>pool.data.length/11)throw new RangeError('House banners exceed the shared magic buffer');
  const paint=rgb(color);
  for(const point of points)pool.data.set([...point,...normal,...paint,1,emission],pool.count++*11);
 };
 for(const banner of state.banners){
  const house=banner.house,normal=[-Math.cos(banner.angle),0,-Math.sin(banner.angle)],
   point=(u,v,layer=0)=>bannerPoint(banner,u,v,layer),us=[0,.045,.25,.5,.75,.955,1];
  for(let col=0;col<6;col++)for(let row=0;row<8;row++){
   const u=us[col],u1=us[col+1],v=row/8,v1=(row+1)/8,
    color=col===0||col===5||row===0?house.trim:house.cloth;
   tri([point(u,v),point(u1,v),point(u1,v1)],color,normal);
   tri([point(u,v),point(u1,v1),point(u,v1)],color,normal);
  }
  // The slim top bar appears with the fabric, with no pole through the road.
  tri([point(-.045,-.025,1),point(1.045,-.025,1),point(1.045,0,1)],house.trim,normal,.8);
  tri([point(-.045,-.025,1),point(1.045,0,1),point(-.045,0,1)],house.trim,normal,.8);
  for(const crest of houseCrestTriangles(house.id))
   tri(crest.points.map(([u,v])=>point(u,v,1+crest.layer)),crest.color,normal,.72);
  if(banner.progress<1){
   // A few short warm sparks connect the wand gesture to the unfolding cloth.
   const strength=Math.sin(banner.progress*Math.PI),center=point(.5,.1,2);
   for(let j=0;j<4;j++){
    const a=state.time*3+j*Math.PI/2+banner.index,r=12+20*strength,
     at=[center[0]+Math.cos(a)*r,center[1]+Math.sin(a)*r,center[2]-5],size=1.2+strength;
    tri([[at[0]-size,at[1],at[2]],[at[0],at[1]+size*2,at[2]],[at[0]+size,at[1],at[2]]],house.trim,normal,1);
   }
  }
 }
 return {first,count:pool.count-first};
}
