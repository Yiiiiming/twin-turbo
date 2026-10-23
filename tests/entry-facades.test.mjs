import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACK,setTrack,RaceEngine} from '../engine.js';
import {harborLandmarkPlacements,sceneObstacles,sceneEntryBoundary,roadsideLamps,updateChaseCamera,londonEye} from '../renderer.js';
import {addCityLandmark} from '../city-scenery.js';
import {createEntryCameraPlan,entryCameraForProgress} from '../entry-cameras.js';

test.afterEach(()=>setTrack('coast'));
const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0);
const unit=v=>v.map(n=>n/Math.hypot(...v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function world(item,[x,y,z],angle=item.angle||0){return [item.x+Math.cos(angle)*x-Math.sin(angle)*z,(item.elevation||0)+y,item.z+Math.sin(angle)*x+Math.cos(angle)*z];}
function normal(angle){return [Math.sin(angle),0,-Math.cos(angle)];}
function cosine(eye,anchor,n){const delta=[eye[0]-anchor[0],0,eye[2]-anchor[2]];return dot(unit(delta),n);}
function projection(view,point,aspect){
  const forward=unit(view.target.map((v,k)=>v-view.eye[k])),right=unit(cross(forward,[0,1,0])),up=cross(right,forward),d=point.map((v,k)=>v-view.eye[k]);
  const depth=dot(d,forward),half=depth*Math.tan(view.fov/2);
  return [dot(d,right)/(half*aspect),dot(d,up)/half,depth];
}
function scene(id,aspect=16/9){
  setTrack(id);const car=new RaceEngine().cars[0],landmarks=harborLandmarkPlacements();
  return {car,landmarks,plan:createEntryCameraPlan(TRACK,car,{landmarks,obstacles:sceneObstacles(),lamps:roadsideLamps(),boundary:sceneEntryBoundary(),chase:updateChaseCamera(car,null),aspect})};
}
function samples(state,index){return Array.from({length:97},(_,i)=>entryCameraForProgress(TRACK,state.car,index*.32+.32*Math.min(i/96,1-1e-9),state.plan));}
function visible(view,point,aspect,label){const [x,y,depth]=projection(view,point,aspect);assert.ok(depth>0&&Math.abs(x)<.98&&Math.abs(y)<.98,`${label}: feature clipped (${x.toFixed(3)}, ${y.toFixed(3)})`);}

// These anchors come from the actual model calls, independently of the camera
// planner. A collection probe also checks the production dispatch rotation so
// a wrong assumption cannot be made to pass merely by changing a camera table.
class PaintProbe {
  constructor(){this.paint=[];this.boxes=[];this.colliders=null;}
  quad(a,b,c,d,color){this.paint.push({points:[a,b,c,d],color});}
  triangle(a,b,c,color){this.paint.push({points:[a,b,c],color});}
  box(x,y,z,w,h,d,color,angle){this.boxes.push({x,y,z,w,h,d,color,angle});}
  cone(){}
}
const signs=[
  {track:'coast-shanghai',kind:'oriental-pearl',color:'#ebd3bf',anchor:[0,28.5,-62],halfWidth:49,halfHeight:3},
  {track:'coast-shanghai',kind:'bund-hsbc',color:'#7c6c4f',anchor:[0,135.6,-70],halfWidth:64.5,halfHeight:4},
  {track:'coast-beijing',kind:'palace-gate',color:'#e5c985',anchor:[0,103.25,-46.2],halfWidth:43.5,halfHeight:3.6},
];
test('Shanghai inscriptions and Beijing palace sign have the independently audited real frontage',()=>{
  for(const spec of signs){
    setTrack(spec.track);const item=harborLandmarkPlacements().find(p=>p.kind===spec.kind),mesh=new PaintProbe();addCityLandmark(mesh,item);
    const a=item.angle+(spec.kind==='palace-gate'&&item.side<0?Math.PI:0),anchor=world(item,spec.anchor,a),n=normal(a);
    const painted=mesh.paint.filter(p=>p.color===spec.color).flatMap(p=>p.points);
    assert.ok(painted.length>80,`${spec.kind}: real lettering exists`);
    for(const point of painted){
      assert.ok(Math.abs(dot(point.map((v,k)=>v-anchor[k]),n))<1e-6,`${spec.kind}: actual inscription plane`);
      assert.ok(Math.abs(point[1]-anchor[1])<=spec.halfHeight,`${spec.kind}: actual inscription height`);
    }
  }
});

for(const id of ['coast-shanghai','coast-beijing'])test(`${id}: every intro frame stays in the real entrance/sign hemisphere and retains architectural features`,()=>{
  const aspect=16/9,state=scene(id,aspect);
  for(const [index,shot] of state.plan.shots.slice(0,2).entries()){
    const item=state.landmarks.find(p=>p.kind===shot.kind),views=samples(state,index);
    const a=item.angle+(id==='coast-beijing'&&item.side<0?Math.PI:0),n=normal(a);
    const spec=signs.find(s=>s.kind===item.kind);
    // The Temple is 24-fold radial, with equivalent stairs on local +/-Z.
    // Choose one real stair facade once; an orbit may not change to the back.
    const side=spec?1:(cosine(views[0].eye,world(item,[0,20,0],a),n)>=0?1:-1);
    const front=n.map(v=>v*side),anchor=world(item,spec?.anchor||[0,18,-108*side],a);
    const features=spec?[-1,1].map(sign=>world(item,[sign*spec.halfWidth,spec.anchor[1],spec.anchor[2]],a)):[anchor];
    const peak=item.kind==='oriental-pearl'?[0,586,0]:item.kind==='bund-hsbc'?[0,207,8]:item.kind==='palace-gate'?[0,157,0]:[0,246,0];
    features.push(world(item,peak,a));
    if(item.kind==='bund-hsbc')for(const x of [-123,123])features.push(world(item,[x,5,-67],a));
    if(item.kind==='palace-gate')for(const x of [-143,143])features.push(world(item,[x,8,-23],a));
    for(const [i,view]of views.entries()){
      assert.ok(cosine(view.eye,anchor,front)>.2,`${item.kind}: actual facade at frame ${i}; camera must never escape around its back`);
      for(const p of features)visible(view,p,aspect,`${item.kind} frame ${i}`);
    }
  }
});

test('London shows the wheel plane broadly and one real Big Ben clock face throughout the entire orbit',()=>{
  const aspect=16/9,state=scene('coast-london',aspect),eye=state.landmarks.find(p=>p.kind==='london-eye'),ben=state.landmarks.find(p=>p.kind==='big-ben');
  const probe=new PaintProbe();londonEye(probe,eye);
  const wheelNormal=[-Math.cos(eye.angle),0,-Math.sin(eye.angle)],hub=[eye.x,222,eye.z],cabins=probe.boxes.filter(b=>b.color==='#66858c');
  assert.equal(cabins.length,32);
  for(const cabin of cabins)assert.ok(Math.abs(dot([cabin.x-eye.x,0,cabin.z-eye.z],wheelNormal))<1e-6,'actual cabins share the audited wheel plane');
  const wheelViews=samples(state,0),wheelSide=Math.sign(cosine(wheelViews[0].eye,hub,wheelNormal));
  for(const view of wheelViews){
    assert.ok(cosine(view.eye,hub,wheelNormal)*wheelSide>.7,'wheel cannot become edge-on during its shot');
    for(const cabin of cabins)visible(view,[cabin.x,cabin.y+5.5,cabin.z],aspect,'London Eye cabin rim');
  }
  // bigBen draws four clock disks at angle + k*pi/2, each at radius 36.35,
  // height 233, radius 15. Their symmetry is explicit, unlike HSBC's rear wall.
  const views=samples(state,1),faces=Array.from({length:4},(_,k)=>[Math.cos(ben.angle+k*Math.PI/2),0,Math.sin(ben.angle+k*Math.PI/2)]);
  const face=faces.reduce((best,n)=>cosine(views[0].eye,[ben.x,233,ben.z],n)>cosine(views[0].eye,[ben.x,233,ben.z],best)?n:best);
  const clock=[ben.x+face[0]*36.35,233,ben.z+face[2]*36.35],right=[-face[2],0,face[0]];
  for(const view of views){
    assert.ok(cosine(view.eye,clock,face)>.4,'the same real clock face stays visible through the orbit');
    for(const sign of [-1,1]){
      visible(view,[clock[0],clock[1]+sign*15,clock[2]],aspect,'Big Ben clock vertical rim');
      visible(view,[clock[0]+right[0]*sign*15,clock[1],clock[2]+right[2]*sign*15],aspect,'Big Ben clock horizontal rim');
    }
    visible(view,[ben.x,380,ben.z],aspect,'Big Ben spire');
  }
});

class VertexProbe extends PaintProbe {
  constructor(){super();this.vertices=[];}
  quad(a,b,c,d){this.vertices.push(a,b,c,d);}
  triangle(a,b,c){this.vertices.push(a,b,c);}
  box(x,y,z,w,h,d,color,angle=0){
    for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1])this.vertices.push(world({x,z,angle,elevation:y},[sx*w/2,sy*h/2,sz*d/2]));
  }
  cone(x,y,z,r,h,color,sides=8,top=0,phase=0){
    for(let i=0;i<sides;i++)for(const upper of [false,true]){const a=i/sides*Math.PI*2+phase,rr=upper?top:r;this.vertices.push([x+Math.cos(a)*rr,y+(upper?h:0),z+Math.sin(a)*rr]);}
  }
}
for(const aspect of [1,390/844])test(`Shanghai intro retains every actual model vertex and front facade at aspect ${aspect}`,()=>{
  const state=scene('coast-shanghai',aspect);
  for(const [index,kind]of ['oriental-pearl','bund-hsbc'].entries()){
    assert.equal(state.plan.shots[index].kind,kind,'responsive framing retains the selected landmark');
    const item=state.landmarks.find(p=>p.kind===kind),mesh=new VertexProbe();addCityLandmark(mesh,item);
    assert.ok(mesh.vertices.length>1000,'audit the complete drawn model, not only an approximate box');
    const spec=signs.find(s=>s.kind===kind),anchor=world(item,spec.anchor),n=normal(item.angle);
    for(const [i,view]of samples(state,index).entries()){
      assert.ok(cosine(view.eye,anchor,n)>.2,`${kind}: front inscription remains visible at frame ${i}`);
      const forward=unit(view.target.map((v,k)=>v-view.eye[k])),right=unit(cross(forward,[0,1,0])),up=cross(right,forward),tan=Math.tan(view.fov/2);
      let extent=0,near=Infinity;
      for(const point of mesh.vertices){const d=point.map((v,k)=>v-view.eye[k]),depth=dot(d,forward);near=Math.min(near,depth);extent=Math.max(extent,Math.abs(dot(d,right)/(depth*tan*aspect)),Math.abs(dot(d,up)/(depth*tan)));}
      assert.ok(near>0&&extent<.98,`${kind}: actual model clipped at frame ${i}, viewport extent ${extent.toFixed(4)}`);
    }
  }
});
