import { pointOnTrack } from './tracks.js';

// Presentation only. All positions come from the accepted track and current
// production landmark placements supplied by the renderer, never a second map.
export const ENTRY_CAMERA_CUTS = Object.freeze([.32,.64]);
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const mix=(a,b,t)=>a+(b-a)*t;
// A short settle at either end, with zero velocity and acceleration at the
// start/finish of the move. The UI owns the six-second three-shot duration.
const smooth=value=>{const t=clamp((value-.055)/.89);return t*t*t*(t*(t*6-15)+10);};
const MODELS={
  london:['london-eye','big-ben'],beijing:['palace-gate','temple-of-heaven'],
  shanghai:['oriental-pearl','bund-hsbc'],rio:['christ-redeemer','sugarloaf'],
  austin:['texas-capitol','music-guitar'],paris:['eiffel-tower','arc-de-triomphe'],
  bay:['lighthouse','sailing-club'],marina:['sailing-club','lighthouse'],
  pines:['forest-lodge'],neon:['neon-plaza'],ridge:['spiral-core'],
};
const HEIGHTS={'london-eye':424,'big-ben':380,'palace-gate':157,'temple-of-heaven':246,
  'oriental-pearl':586,'bund-hsbc':207,'christ-redeemer':242,sugarloaf:337,
  'texas-capitol':267,'music-guitar':179,'eiffel-tower':421,'arc-de-triomphe':150,
  lighthouse:211,'sailing-club':110,'forest-lodge':116,'neon-plaza':431,'spiral-core':625};

function camera(eye,target,fov=52*Math.PI/180){
  return {eye,target,fov,angle:Math.atan2(target[2]-eye[2],target[0]-eye[0])};
}

/** Conservative segment / production solid test, including height and rotation.
 * Old coastal hulls predate height fields; their visual props fit below 190. */
export function entrySegmentBlocked(a,b,obstacles,padding=0){
  for(const o of obstacles){
    const bottom=(o.minHeight??0)-padding,top=(o.maxHeight??190)+padding;
    if(Math.max(a[1],b[1])<bottom||Math.min(a[1],b[1])>top)continue;
    const c=Math.cos(o.angle||0),s=Math.sin(o.angle||0);
    const local=p=>[(p[0]-o.x)*c+(p[2]-o.y)*s,p[1],-(p[0]-o.x)*s+(p[2]-o.y)*c];
    const p=local(a),q=local(b),w=(o.type==='circle'?o.radius:o.halfWidth)+padding,d=(o.type==='circle'?o.radius:o.halfDepth)+padding;
    const lows=[-w,bottom,-d],highs=[w,top,d];let near=0,far=1;
    for(let k=0;k<3;k++){
      const delta=q[k]-p[k];
      if(Math.abs(delta)<1e-9){if(p[k]<lows[k]||p[k]>highs[k]){far=-1;break;}}
      else{let u=(lows[k]-p[k])/delta,v=(highs[k]-p[k])/delta;if(u>v)[u,v]=[v,u];near=Math.max(near,u);far=Math.min(far,v);if(near>far)break;}
    }
    if(near<=far&&far>=0&&near<=1)return true;
  }
  return false;
}

/** A small CPU-only visibility index of the rendered boundary. Collision hulls
 * deliberately omit thin parapets and parts of the sloped mountain skirt. */
export function entryMeshOcclusion(data){
  const size=160,cells=new Map(),faces=[];
  for(let o=0;o<data.length;o+=33){
    const a=data.slice(o,o+3),b=data.slice(o+11,o+14),c=data.slice(o+22,o+25);
    const lo=a.map((v,k)=>Math.min(v,b[k],c[k])),hi=a.map((v,k)=>Math.max(v,b[k],c[k])),id=faces.length;
    faces.push({a,u:b.map((v,k)=>v-a[k]),v:c.map((v,k)=>v-a[k]),lo,hi});
    for(let x=Math.floor(lo[0]/size);x<=Math.floor(hi[0]/size);x++)for(let z=Math.floor(lo[2]/size);z<=Math.floor(hi[2]/size);z++){
      const key=`${x},${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(id);
    }
  }
  return {blocked(a,b){
    const lo=a.map((v,k)=>Math.min(v,b[k])),hi=a.map((v,k)=>Math.max(v,b[k])),d=b.map((v,k)=>v-a[k]),ids=new Set();
    for(let x=Math.floor(lo[0]/size);x<=Math.floor(hi[0]/size);x++)for(let z=Math.floor(lo[2]/size);z<=Math.floor(hi[2]/size);z++)for(const id of cells.get(`${x},${z}`)||[])ids.add(id);
    for(const id of ids){
      const f=faces[id];if(f.lo.some((v,k)=>v>hi[k])||f.hi.some((v,k)=>v<lo[k]))continue;
      const h=[d[1]*f.v[2]-d[2]*f.v[1],d[2]*f.v[0]-d[0]*f.v[2],d[0]*f.v[1]-d[1]*f.v[0]],det=f.u.reduce((n,v,k)=>n+v*h[k],0);
      if(Math.abs(det)<1e-9)continue;
      const s=a.map((v,k)=>v-f.a[k]),u=s.reduce((n,v,k)=>n+v*h[k],0)/det;if(u<0||u>1)continue;
      const q=[s[1]*f.u[2]-s[2]*f.u[1],s[2]*f.u[0]-s[0]*f.u[2],s[0]*f.u[1]-s[1]*f.u[0]],v=d.reduce((n,v,k)=>n+v*q[k],0)/det;
      if(v<0||u+v>1)continue;
      const t=f.v.reduce((n,v,k)=>n+v*q[k],0)/det;if(t>1e-6&&t<1-1e-6)return true;
    }
    return false;
  }};
}

function interpolateShot(shot,t){
  let eye=shot.from.eye.map((n,i)=>mix(n,shot.to.eye[i],t));
  if(shot.orbit){
    const {center,angle,sweep,fromRadius,toRadius}=shot.orbit,a=angle+sweep*t,r=mix(fromRadius,toRadius,t);
    eye=[center[0]+Math.cos(a)*r,eye[1],center[1]+Math.sin(a)*r];
  }
  const view=camera(eye,
    shot.from.target.map((n,i)=>mix(n,shot.to.target[i],t)),mix(shot.from.fov,shot.to.fov,t));
  if(shot.kind==='starting-grid'){
    const difference=Math.atan2(Math.sin(shot.from.angle-shot.to.angle),Math.cos(shot.from.angle-shot.to.angle));
    view.angle=shot.to.angle+difference*(1-t);
  }
  return view;
}
function clearShot(shot,obstacles,subject,lamps=[],boundary=null){
  let previous=null;
  for(let i=0;i<=96;i++){
    const view=interpolateShot(shot,i/96),distance=Math.hypot(view.eye[0]-subject.x,view.eye[2]-subject.z);
    // Check the actual curved path, not the straight chord between orbit ends.
    if(entrySegmentBlocked(previous||view.eye,view.eye,obstacles,22))return false;
    if(boundary?.blocked(previous||view.eye,view.eye))return false;
    previous=view.eye;
    // Stop at the subject's front envelope: looking at its own solid facade is
    // intended, but an unrelated foreground block must not conceal it.
    const stop=clamp(1-(subject.radius+28)/distance,0,.96);
    const front=view.eye.map((n,k)=>mix(n,view.target[k],stop));
    if(entrySegmentBlocked(view.eye,front,obstacles,7))return false;
    if(boundary){
      // Protect the entire subject, especially its low plinth and outer wings.
      // A high central aim ray alone can look over a wall hiding half the facade.
      const side=[-(subject.z-view.eye[2])/distance,(subject.x-view.eye[0])/distance];
      for(const height of [.02,.22,.48,.82])for(const width of [-.85,-.42,0,.42,.85]){
        const target=[subject.x+side[0]*subject.radius*width,(subject.elevation||0)+subject.viewHeight*height,subject.z+side[1]*subject.radius*width];
        if(boundary.blocked(view.eye,target))return false;
        if(subject.kind==='palace-gate'&&entrySegmentBlocked(view.eye,target,lamps,10))return false;
      }
    }
    if(lamps.length){
      const side=[-(subject.z-view.eye[2])/distance,(subject.x-view.eye[0])/distance],base=subject.elevation||0,h=subject.viewHeight;
      const targets=[[subject.x,base+h*.22,subject.z],view.target,[subject.x,base+h*.82,subject.z],
        ...[-1,1].map(sign=>[subject.x+side[0]*subject.radius*.35*sign,base+h*.5,subject.z+side[1]*subject.radius*.35*sign])];
      if(targets.some(target=>entrySegmentBlocked(view.eye,target,lamps,10)))return false;
    }
  }
  return true;
}
function landmarkShot(item,obstacles,index,lamps,boundary){
  const h=HEIGHTS[item.kind]||item.height||180,r=item.radius||110,base=item.elevation||0;
  const target=[item.x,base+h*.48,item.z];
  // The wheel's plane is local +Z; the other facades face local -Z. Beijing's
  // refined Tiananmen model applies its road-side rotation during dispatch,
  // after placement. Match that actual facade, which faces inside the wall.
  const modelAngle=(item.angle||0)+(item.kind==='palace-gate'&&item.side<0?Math.PI:0);
  const front=modelAngle+(item.kind==='london-eye'?Math.PI:-Math.PI/2);
  const distance=index?Math.max(430,h*1.85,r*3.5):Math.max(780,h*2.8,r*5.7),subject={...item,radius:r,viewHeight:h};
  const nearby=obstacles.filter(o=>Math.hypot(o.x-item.x,o.y-item.z)<distance+(o.radius||Math.hypot(o.halfWidth,o.halfDepth))+30);
  const lifts=index?[0,24,50,90,140,220,340]:[0,120,260,440,680];
  const offsets=index?[-.30,0,.45,-.70,.85,-1.05,1.3,-1.5,1.8,-2.0,2.35,-2.65,Math.PI]:[.18,0,.48,-.48,.86,-.86,Math.PI];
  let last;
  for(const lift of lifts)for(const offset of offsets)for(const sweep of index?[.56,-.56]:[0]){
    const a=front+offset,b=a+sweep,ratio=index?.73:.56;
    const fromHeight=index?clamp(h*.17+28,48,105):h*1.25+150;
    const toHeight=index?clamp(h*.13+22,42,82):h*.82+90;
    const from=camera([item.x+Math.cos(a)*distance,base+fromHeight+lift,item.z+Math.sin(a)*distance],target,(index?54:60)*Math.PI/180);
    const to=camera([item.x+Math.cos(b)*distance*ratio,base+toHeight+lift,item.z+Math.sin(b)*distance*ratio],target,(index?50:48)*Math.PI/180);
    const shot={kind:item.kind,movement:index?'orbit':'push',subject,from,to,
      ...(index?{orbit:{center:[item.x,item.z],angle:a,sweep,fromRadius:distance,toRadius:distance*ratio}}:{})};last=shot;
    if(clearShot(shot,nearby,subject,lamps,boundary))return shot;
  }
  // The tall final candidate is preferable to placing a camera inside scenery.
  return last;
}
function roadShot(track,station,obstacles,low=false){
  const fromRoad=pointOnTrack(track,station-440),toRoad=pointOnTrack(track,station-160),ahead=pointOnTrack(track,station+320);
  let height=low?105:620,shot;
  for(let tries=0;tries<8;tries++,height+=low?55:140){
    shot={kind:'road',movement:'push',from:camera([fromRoad.x,fromRoad.elevation+height,fromRoad.y],[ahead.x,ahead.elevation+18,ahead.y],60*Math.PI/180),
      to:camera([toRoad.x,toRoad.elevation+height*.62,toRoad.y],[ahead.x,ahead.elevation+18,ahead.y],48*Math.PI/180)};
    if(!entrySegmentBlocked(shot.from.eye,shot.to.eye,obstacles,22)&&
      !entrySegmentBlocked(shot.from.eye,shot.from.target,obstacles,4)&&!entrySegmentBlocked(shot.to.eye,shot.to.target,obstacles,4))break;
  }
  return shot;
}
// Same snapped chase pose as the production renderer. Supplying the production
// pose below makes the final endpoint exact, without a circular renderer import.
function restingChase(car){
  const a=car.angle,c=Math.cos(a),s=Math.sin(a),speed=clamp(Math.abs(car.speed||0)/517),distance=169+speed*18;
  const elevation=car.elevation||0,slope=car.slope||0;
  return {angle:a,eye:[car.x-c*distance-s*13,elevation+76+speed*8-slope*distance*.65,car.y-s*distance+c*13],
    target:[car.x+c*(72+speed*22),elevation+13+slope*(72+speed*22),car.y+s*(72+speed*22)],fov:(car.boosting?68:59+speed*3)*Math.PI/180};
}

/** Pure plan creation, once per intro. No renderer/engine globals are changed. */
export function createEntryCameraPlan(track,car,{landmarks=[],obstacles=[],lamps=[],boundary=null,chase=restingChase(car),aspect=16/9}={}){
  const kinds=MODELS[track.theme]||[],primary=landmarks.find(p=>p.kind===kinds[0]),secondary=landmarks.find(p=>p.kind===kinds[1]);
  const lampBodies=lamps.flatMap(lamp=>['mast','arm','head'].map(key=>{
    const {position:p,size:s}=lamp[key];return {type:'box',x:p[0],y:p[2],halfWidth:s[0]/2,halfDepth:s[2]/2,angle:lamp.angle,minHeight:p[1]-s[1]/2,maxHeight:p[1]+s[1]/2};
  }));
  // A spiral's subject includes the real road wrapped around its core. Its
  // helix is part of the intended silhouette, rather than a foreground wall.
  const subject=item=>item?.kind==='spiral-core'?{...item,radius:Math.max(item.radius,(track.spirals?.[item.index]?.radius||275)+track.roadWidth/2+20)}:item;
  const first=primary?landmarkShot(subject(primary),obstacles,0,lampBodies,boundary):roadShot(track,track.startDistance+track.length*.18,obstacles);
  const orbitSubject=secondary||landmarks.find(item=>item!==primary&&item.kind===primary?.kind)||primary;
  const second=orbitSubject?landmarkShot(subject(orbitSubject),obstacles,1,lampBodies,boundary):roadShot(track,track.startDistance+track.length*.38,obstacles,true);
  // Keep wide facades readable in portrait without moving a checked camera
  // through additional city blocks. The racing chase FOV remains untouched.
  const framing=Math.max(1,.95/Math.max(.3,aspect));
  for(const shot of [first,second])for(const end of [shot.from,shot.to])end.fov=Math.min(105*Math.PI/180,2*Math.atan(Math.tan(end.fov/2)*framing));
  // A brief rear approach over the actual starting straight. Keep the final
  // segment on the same line of sight as normal chase, not a sideways orbit.
  const forward=[Math.cos(car.angle),Math.sin(car.angle)],height=car.elevation||0;
  let from=camera([car.x-forward[0]*540-forward[1]*13,height+242,car.y-forward[1]*540+forward[0]*13],
    [car.x+forward[0]*100,height+14,car.y+forward[1]*100],54*Math.PI/180);
  if(entrySegmentBlocked(from.eye,chase.eye,obstacles,12)){
    // Start closer on a blocked start straight; the final chase pose is already
    // a production-tested driving camera, so the approach can remain local.
    for(const distance of [180,110,55,0]){
      from=camera([chase.eye[0]-forward[0]*distance,chase.eye[1]+distance*.55,chase.eye[2]-forward[1]*distance],chase.target.slice(),54*Math.PI/180);
      if(!entrySegmentBlocked(from.eye,chase.eye,obstacles,10))break;
    }
  }
  return {trackId:track.id,aspect,shots:[first,second,{kind:'starting-grid',movement:'descend',from,to:{...chase,eye:chase.eye.slice(),target:chase.target.slice()}}]};
}

/** Deterministic normalized camera sampling. The optional plan contains only
 * immutable presentation data, so seeking/replaying never advances simulation. */
export function entryCameraForProgress(track,car,progress,plan=createEntryCameraPlan(track,car)){
  const p=clamp(Number.isFinite(progress)?progress:0),index=p<ENTRY_CAMERA_CUTS[0]?0:p<ENTRY_CAMERA_CUTS[1]?1:2;
  const start=index?ENTRY_CAMERA_CUTS[index-1]:0,end=index<2?ENTRY_CAMERA_CUTS[index]:1,t=smooth(clamp((p-start)/(end-start)));
  if(p===1){const end=plan.shots[2].to;return {...end,eye:end.eye.slice(),target:end.target.slice(),shot:2,kind:'starting-grid',progress:p};}
  return {...interpolateShot(plan.shots[index],t),shot:index,kind:plan.shots[index].kind,progress:p};
}
