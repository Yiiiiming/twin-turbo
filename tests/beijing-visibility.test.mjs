import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, setTrack, trackPoint } from '../src/engine.js';
import { updateChaseCamera, lookAt, multiply, perspective } from '../src/renderer.js';
import { cityLandmarkPlacements } from '../src/city-scenery.js';
import { addBeijingCityLandmark } from '../src/beijing-city-landmarks.js';

test.afterEach(()=>setTrack('coast'));

// Probe every real model vertex, including roof ornaments and plinths, rather
// than assuming a cylinder or checking only the tower's center point.
class VertexProbe {
 constructor(){this.points=[];}
 triangle(...points){this.points.push(...points.slice(0,3));}
 quad(...points){this.points.push(...points.slice(0,4));}
 box(x,y,z,w,h,d,color,angle=0){
  for(const a of [-1,1])for(const b of [-1,1])for(const c of [-1,1])this.points.push([
   x+Math.cos(angle)*a*w/2-Math.sin(angle)*c*d/2,y+b*h/2,z+Math.sin(angle)*a*w/2+Math.cos(angle)*c*d/2,
  ]);
 }
 cone(x,y,z,r,h,color,sides=8,top=0,phase=0){
  for(let i=0;i<sides;i++){
   const a=phase+i/sides*Math.PI*2;
   this.points.push([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(a)*top,y+h,z+Math.sin(a)*top]);
  }
 }
}
function modelVertices(item){
 const probe=new VertexProbe();addBeijingCityLandmark(probe,item);
 return [...new Map(probe.points.map(p=>[p.map(n=>n.toFixed(4)).join(','),p])).values()];
}
function completeApproach(item,aspect){
 const points=modelVertices(item);assert.ok(points.length>1000);
 let camera,run=0,longest=0;
 const step=6,speed=363;
 for(let ahead=2200;ahead>=100;ahead-=step){
  camera=updateChaseCamera({...trackPoint(item.s-ahead),speed},camera,step/speed);
  // Do not count a previous-lap view or a silhouette buried in distant fog.
  let visible=item.s-ahead>=TRACK.startDistance&&Math.hypot(item.x-camera.eye[0],item.z-camera.eye[2])<=1800;
  const m=multiply(perspective(camera.fov,aspect),lookAt(camera.eye,camera.target));
  if(visible)for(const p of points){
   const clip=row=>m[row]*p[0]+m[4+row]*p[1]+m[8+row]*p[2]+m[12+row],w=clip(3);
   if(w<=0||Math.abs(clip(0))>w||Math.abs(clip(1))>w){visible=false;break;}
  }
  run=visible?run+step:0;longest=Math.max(longest,run);
 }
 return longest;
}

for(const [mode,aspect]of [['full view',1280/720],['split view',640/720]]){
 test(`China Zun has a continuous, complete early approach in the actual ${mode} camera`,()=>{
  setTrack('coast-beijing');
  const tower=cityLandmarkPlacements().find(p=>p.kind==='beijing-china-zun');
  assert.ok((tower.s-TRACK.startDistance)/TRACK.length<.2,'the skyline landmark appears in the opening fifth');
  assert.ok(completeApproach(tower,aspect)>=300,'whole tower must remain inside the frame across at least 300 route units');
  // Keep the failed late placement as a negative control: its preceding bend
  // hides the full tower at distance, then its crown clips above the camera.
  const oldS=TRACK.startDistance+18.5/23*TRACK.length,p=trackPoint(oldS,-(TRACK.roadWidth/2+tower.radius+76));
  const old={...tower,x:p.x,z:p.y,s:oldS,side:-1,angle:p.angle+Math.PI};
  assert.ok(completeApproach(old,aspect)<300,'the old 80% slot must fail this visibility regression');
 });
 test(`Temple of Heaven retains a complete recognizable approach in the actual ${mode} camera`,()=>{
  setTrack('coast-beijing');
  const temple=cityLandmarkPlacements().find(p=>p.kind==='temple-of-heaven');
  assert.ok(completeApproach(temple,aspect)>=300,'all three roofs and the terrace fit in a sustained approach window');
 });
}
