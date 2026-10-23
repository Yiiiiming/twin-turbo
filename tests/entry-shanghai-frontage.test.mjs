import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACK,setTrack,RaceEngine} from '../engine.js';
import {RaceRenderer,harborLandmarkPlacements,roadsideLamps,updateChaseCamera} from '../renderer.js';
import {createEntryCameraPlan,entryCameraForProgress,entrySegmentBlocked} from '../entry-cameras.js';
import {parisFakeGL,ParisMesh} from './helpers/paris-mesh.mjs';
import {addCityLandmark} from '../city-scenery.js';

test.afterEach(()=>setTrack('coast'));
// Independent ray casts of the uploaded production triangles include street
// lamp arms, which have no collision hull and caused the real HSBC regression.
class SceneTriangles {
 constructor(gl,renderer){
  this.cells=new Map();this.faces=[];this.size=160;
  for(const name of['props','road','terrain','water']){
   const data=gl.buffers.get(renderer.meshes[name].buffer);if(!data)continue;
   for(let offset=0;offset<data.length;offset+=33){
    const xs=[data[offset],data[offset+11],data[offset+22]],ys=[data[offset+1],data[offset+12],data[offset+23]],zs=[data[offset+2],data[offset+13],data[offset+24]],face={name,data,offset,minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys),minZ:Math.min(...zs),maxZ:Math.max(...zs)},id=this.faces.length;this.faces.push(face);
    for(let x=Math.floor(face.minX/this.size);x<=Math.floor(face.maxX/this.size);x++)for(let z=Math.floor(face.minZ/this.size);z<=Math.floor(face.maxZ/this.size);z++){const key=`${x},${z}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(id);}
   }
  }
 }
 hit(a,b){
  const lo=a.map((v,i)=>Math.min(v,b[i])),hi=a.map((v,i)=>Math.max(v,b[i])),ids=new Set();
  for(let x=Math.floor(lo[0]/this.size);x<=Math.floor(hi[0]/this.size);x++)for(let z=Math.floor(lo[2]/this.size);z<=Math.floor(hi[2]/this.size);z++)for(const id of this.cells.get(`${x},${z}`)||[])ids.add(id);
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];let closest;
  for(const id of ids){
   const f=this.faces[id];if(f.minX>hi[0]||f.maxX<lo[0]||f.minY>hi[1]||f.maxY<lo[1]||f.minZ>hi[2]||f.maxZ<lo[2])continue;
   const d=f.data,o=f.offset,vx=d[o],vy=d[o+1],vz=d[o+2],e1x=d[o+11]-vx,e1y=d[o+12]-vy,e1z=d[o+13]-vz,e2x=d[o+22]-vx,e2y=d[o+23]-vy,e2z=d[o+24]-vz;
   const hx=dy*e2z-dz*e2y,hy=dz*e2x-dx*e2z,hz=dx*e2y-dy*e2x,det=e1x*hx+e1y*hy+e1z*hz;if(Math.abs(det)<1e-8)continue;
   const sx=a[0]-vx,sy=a[1]-vy,sz=a[2]-vz,u=(sx*hx+sy*hy+sz*hz)/det;if(u<0||u>1)continue;
   const qx=sy*e1z-sz*e1y,qy=sz*e1x-sx*e1z,qz=sx*e1y-sy*e1x,v=(dx*qx+dy*qy+dz*qz)/det;if(v<0||u+v>1)continue;
   const t=(e2x*qx+e2y*qy+e2z*qz)/det;if(t<=.005||t>=.995||closest?.t<=t)continue;
   closest={mesh:f.name,t,point:[a[0]+dx*t,a[1]+dy*t,a[2]+dz*t],color:Array.from(d.slice(o+6,o+9)),triangle:id};
  }
  return closest;
 }
}

const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),unit=v=>v.map(n=>n/Math.hypot(...v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function project(view,p,aspect){const f=unit(view.target.map((v,i)=>v-view.eye[i])),r=unit(cross(f,[0,1,0])),u=cross(r,f),d=p.map((v,i)=>v-view.eye[i]),depth=dot(d,f),half=depth*Math.tan(view.fov/2);return [dot(d,r)/(half*aspect),dot(d,u)/half,depth];}

test('Shanghai HSBC keeps a low real-front orbit with its sign, central portico and complete silhouette visible',()=>{
 setTrack('coast-shanghai');const gl=parisFakeGL(),renderer=new RaceRenderer({width:1280,height:720,getContext:()=>gl,addEventListener(){}});assert.equal(renderer.available,true,renderer.error);
 const engine=new RaceEngine(),before=structuredClone(engine),route=JSON.stringify(TRACK),car=engine.cars[0],landmarks=harborLandmarkPlacements(),item=landmarks.find(p=>p.kind==='bund-hsbc'),c=Math.cos(item.angle),s=Math.sin(item.angle),world=(x,y,z)=>[item.x+c*x-s*z,y,item.z+s*x+c*z],front=[s,0,-c];
 const plan=createEntryCameraPlan(TRACK,car,{landmarks,obstacles:renderer.obstacles,lamps:roadsideLamps(),chase:updateChaseCamera(car,null),aspect:16/9}),shot=plan.shots[1],scene=new SceneTriangles(gl,renderer);
 assert.equal(shot.kind,'bund-hsbc');assert.equal(shot.movement,'orbit');assert.ok(Math.abs(shot.orbit.sweep)>25*Math.PI/180&&Math.abs(shot.orbit.sweep)<40*Math.PI/180,'retain a readable moving orbit');
 // These are actual model coordinates: THE BUND is at local z=-70, the main
 // columns at x=-50,-17,17,50, and the dome summit at (0,207,8).
 // Only the central portico/sign must be lamp-free. The two actual street
 // lamps intentionally frame the outer wings in the user-accepted shot.
 const model=new ParisMesh(item);addCityLandmark(model,item);const sign=model.faces.filter(face=>face.color==='#7c6c4f').flatMap(face=>[...face.points,face.points[0].map((v,k)=>(v+face.points[1][k]+face.points[2][k])/3)].map(point=>point.map((v,k)=>v+front[k]*.05)));assert.ok(sign.length>200,'sample the actual painted inscription');
 const portico=[-50,-17,0,17,50].flatMap(x=>[15,45,80,110].map(y=>world(x,y,-70.05)));
 const silhouette=[world(-123,5,-67),world(123,5,-67),world(-123,121,-50),world(123,121,-50),world(0,207,8),world(-64.5,135.6,-70),world(64.5,135.6,-70)];
 const oldRear=[item.x-s*511,63.19,item.z+c*511];assert.ok(dot(unit(oldRear.map((v,i)=>v-[item.x,63.19,item.z][i])),front)<0,'the independent normal rejects the old blank rear');
 let previous;
 for(let i=0;i<=96;i++){
  const view=entryCameraForProgress(TRACK,car,.32+.32*Math.min(i/96,1-1e-9),plan),eyeOffset=[view.eye[0]-item.x,0,view.eye[2]-item.z];
  assert.equal(view.shot,1);assert.ok(view.eye[1]>=35&&view.eye[1]<120,'HSBC must never fall back to the 283-high aerial shot');assert.ok(dot(unit(eyeOffset),front)>.85,'the real entrance, not the back or side wall, must face the camera');
  assert.equal(entrySegmentBlocked(previous||view.eye,view.eye,renderer.obstacles,22),false,'camera path clears every real body');assert.equal(scene.hit(previous||view.eye,view.eye),undefined,'camera path clears decorative uploaded surfaces');previous=view.eye;
  for(const point of [...sign,...portico])assert.equal(scene.hit(view.eye,point),undefined,'a rendered lamp/building conceals the central sign or portico at frame '+i+' target='+JSON.stringify(point));
  for(const point of silhouette){const [x,y,depth]=project(view,point,16/9);assert.ok(depth>0&&Math.abs(x)<.98&&Math.abs(y)<.98,'the complete wings/sign/dome must stay in frame '+i+' ('+x.toFixed(3)+','+y.toFixed(3)+')');}
 }
 // Check that the test observes real lamp faces instead of an empty mesh or
 // a hull-only view: one side lamp remains as the intentional wing framing.
 const opening=entryCameraForProgress(TRACK,car,.32,plan);assert.ok(scene.hit(opening.eye,world(-80,44,-70.05)),'the real outside lamp is present in the GPU scene');
 assert.deepEqual(structuredClone(engine),before);assert.equal(JSON.stringify(TRACK),route);
});
