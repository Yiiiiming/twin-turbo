import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACK,setTrack,RaceEngine} from '../src/engine.js';
import {RaceRenderer,harborLandmarkPlacements,sceneEntryBoundary,roadsideLamps} from '../src/renderer.js';
import {beijingWallLayout} from '../src/beijing-great-wall.js';
import {createEntryCameraPlan,entryCameraForProgress} from '../src/entry-cameras.js';

test.afterEach(()=>setTrack('coast'));
function fakeGL(){
 const gl={buffers:new Map()};let bound,id=0;
 for(const name of['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
 gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_,name)=>name;
 gl.bindBuffer=(_,buffer)=>{bound=buffer;};gl.bufferData=(_,array)=>gl.buffers.set(bound,array);
 for(const name of['uniformMatrix4fv','deleteBuffer','drawArrays','shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindTexture','texImage2D','texParameteri','enable','depthFunc','disable','clearColor','blendFunc','enableVertexAttribArray','vertexAttribPointer','depthMask','useProgram','disableVertexAttribArray','activeTexture','uniform1i','uniform1f','uniform3fv','viewport','scissor','clear','pixelStorei'])gl[name]=()=>{};
 return gl;
}

// Independent ray casting of the actual GPU upload, including non-colliding
// stone trim, roof faces and mountain skirts; not the camera planner's hulls.
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


function insideBoundary(eye){
 const nodes=beijingWallLayout().nodes;let inside=false;
 for(let i=0,j=nodes.length-1;i<nodes.length;j=i++){
  const a=nodes[i],b=nodes[j];
  if((a.z>eye[2])!==(b.z>eye[2])&&eye[0]<(b.x-a.x)*(eye[2]-a.z)/(b.z-a.z)+a.x)inside=!inside;
 }
 return inside;
}
function silhouette(subject,eye){
 const distance=Math.hypot(subject.x-eye[0],subject.z-eye[2]),side=[-(subject.z-eye[2])/distance,(subject.x-eye[0])/distance];
 return [.02,.22,.48,.82].flatMap(height=>[-.85,-.42,0,.42,.85].map(width=>[
  subject.x+side[0]*subject.radius*width,(subject.elevation||0)+subject.viewHeight*height,subject.z+side[1]*subject.radius*width]));
}

test('Beijing intro stays inside the Great Wall and shows Tiananmen from plinth to roof across the full uploaded scene',()=>{
 setTrack('coast-beijing');
 const gl=fakeGL(),renderer=new RaceRenderer({width:1280,height:720,getContext:()=>gl,addEventListener(){}});
 assert.equal(renderer.available,true,renderer.error);
 const car=new RaceEngine().cars[0],boundary=sceneEntryBoundary(),landmarks=harborLandmarkPlacements();
 const plan=createEntryCameraPlan(TRACK,car,{landmarks,obstacles:renderer.obstacles,lamps:roadsideLamps(),boundary});
 const triangles=new SceneTriangles(gl,renderer),subject=plan.shots[0].subject,issues=[];
 const modelAngle=subject.angle+(subject.side<0?Math.PI:0),front=modelAngle-Math.PI/2;
 const doorCenters=[-87,-43,0,43,87].map(x=>[subject.x+Math.cos(modelAngle)*x+Math.sin(modelAngle)*46.6,20,subject.z+Math.sin(modelAngle)*x-Math.cos(modelAngle)*46.6]);
 // This was a real production regression: the old high central aim ray passed
 // while the actual parapet concealed the broad lower half of the gatehouse.
 const oldEye=[3968.3647720710746,346.25,4458.253958565767];
 assert.equal(insideBoundary(oldEye),false);
 assert.ok(silhouette(subject,oldEye).some(target=>{
  const hit=triangles.hit(oldEye,target);return hit&&Math.hypot(hit.point[0]-subject.x,hit.point[2]-subject.z)>subject.radius+12;
 }),'the regression must detect the old exterior-wall framing');
 for(let i=0;i<=320;i++){
  const progress=i/1000,view=entryCameraForProgress(TRACK,car,progress,plan);
  if(view.shot!==0)continue;
  assert.equal(insideBoundary(view.eye),true,`camera remains inside the wall at ${progress}`);
  const angle=Math.atan2(view.eye[2]-subject.z,view.eye[0]-subject.x);
  assert.ok(Math.cos(angle-front)>.6,'show the actual front arches, not the blank rear wall of the rotated production model');
  for(const target of doorCenters)assert.equal(triangles.hit(view.eye,target),undefined,`the five real entrance arches remain visible at ${progress}`);
  for(const target of silhouette(subject,view.eye)){
   assert.equal(boundary.blocked(view.eye,target),false,`actual boundary occlusion at ${progress}`);
   const hit=triangles.hit(view.eye,target);
   if(hit&&Math.hypot(hit.point[0]-subject.x,hit.point[2]-subject.z)>subject.radius+12)issues.push({progress,target,hit});
  }
 }
 assert.deepEqual(issues.slice(0,8),[],`${issues.length} foreground faces obscure the complete Tiananmen silhouette`);
 // Both later shots still clear the real wall; the final shot's road/car views
 // are checked against the entire static upload too, not just the boundary.
 for(let i=32;i<=100;i++){
  const view=entryCameraForProgress(TRACK,car,i/100,plan),s=plan.shots[view.shot].subject;
  const targets=s?silhouette(s,view.eye):[view.target,[car.x,car.elevation+17,car.y]];
  for(const target of targets){
   assert.equal(boundary.blocked(view.eye,target),false,`later shot boundary at ${i}%`);
   if(!s)assert.equal(triangles.hit(view.eye,target),undefined,`final approach uploaded scenery at ${i}%`);
  }
 }
});
