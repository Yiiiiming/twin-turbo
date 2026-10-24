import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK,setTrack,trackPoint } from '../src/engine.js';
import { ObstacleWorld } from '../src/collisions.js';
import { RaceRenderer,updateChaseCamera } from '../src/renderer.js';

test.afterEach(()=>setTrack('coast'));
function fakeGL(){
 const gl={buffers:new Map()};let bound,id=0;
 for(const name of['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
 gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_,name)=>name;
 gl.bindBuffer=(_,buffer)=>{bound=buffer;};gl.bufferData=(_,array)=>gl.buffers.set(bound,array);
 for(const name of['uniformMatrix4fv','deleteBuffer','drawArrays','shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindTexture','texImage2D','texParameteri','enable','depthFunc','disable','clearColor','blendFunc','enableVertexAttribArray','vertexAttribPointer','depthMask','useProgram','disableVertexAttribArray','activeTexture','uniform1i','uniform1f','uniform3fv','viewport','scissor','clear','pixelStorei'])gl[name]=()=>{};
 return gl;
}
let cached;
function scene(){
 setTrack('coast-beijing');if(cached)return cached;
 const gl=fakeGL(),renderer=new RaceRenderer({width:1280,height:720,getContext:()=>gl,addEventListener(){}});assert.equal(renderer.available,true,renderer.error);
 cached={gl,renderer,world:new ObstacleWorld(renderer.obstacles)};return cached;
}
const eyeProbe=camera=>({x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:camera.angle,speed:0});
function describeContact(world,probe){
 const copy={...probe};world.resolveCar(copy);
 const nearby=world.obstacles.filter(o=>Math.hypot(o.x-probe.x,o.y-probe.y)<220&&o.minHeight<probe.elevation+probe.height&&o.maxHeight>probe.elevation).sort((a,b)=>Math.hypot(a.x-probe.x,a.y-probe.y)-Math.hypot(b.x-probe.x,b.y-probe.y)).slice(0,3);
 return JSON.stringify({probe,corrected:copy,nearby});
}

test('the complete Beijing production scene clears every driving lane and snapped camera across the new passage',()=>{
 const {world}=scene(),issues=[];
 for(let s=TRACK.stadium.start-300;s<TRACK.stadium.end+300;s+=9)for(const lane of[-48,-30,0,30,48]){
  const p=trackPoint(s,lane),car={...p,height:25,speed:0};
  if(world.resolveCar({...car}))issues.push(`car ${s}/${lane}: ${describeContact(world,car)}`);
  for(const speed of[0,363,517]){const camera=updateChaseCamera({...p,speed},null),eye=eyeProbe(camera);if(world.resolveCar({...eye}))issues.push(`camera ${s}/${lane}/${speed}: ${describeContact(world,eye)}`);}
 }
 assert.deepEqual(issues.slice(0,15),[],`${issues.length} complete-scene clearance failures`);
});

test('smoothed production chase cameras remain clear throughout the raised entrance, descent, inner loop and underpass',()=>{
 const {world}=scene(),stadium=TRACK.stadium,issues=[];
 for(const lane of[-48,0,48])for(const speed of[363,517]){
  let previous=null;
  for(let s=stadium.start-300;s<stadium.end+300;s+=speed/60){
   const car={...trackPoint(s,lane),speed},camera=updateChaseCamera(car,previous,1/60);previous=camera;
   const eye=eyeProbe(camera);if(world.resolveCar({...eye}))issues.push(`moving camera ${s.toFixed(2)}/${lane}/${speed}: ${describeContact(world,eye)}`);
  }
 }
 assert.deepEqual(issues.slice(0,15),[],`${issues.length} moving-camera clearance failures`);
});

// Read the exact uploaded static meshes, including bridge deck undersides and
// thin non-colliding ornament. An X/Z spatial index keeps ray tests independent
// of the production collision hull approximation without checking every face.
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

test('actual uploaded city and bridge triangles leave both forward-road and car views clear',()=>{
 const {gl,renderer}=scene(),triangles=new SceneTriangles(gl,renderer),issues=[];
 for(let s=TRACK.stadium.start-300;s<TRACK.stadium.end+300;s+=19)for(const lane of[-48,0,48])for(const speed of[363,517]){
  const p=trackPoint(s,lane),camera=updateChaseCamera({...p,speed},null),hood=[p.x+Math.cos(p.angle)*25,p.elevation+17+p.slope*25,p.y+Math.sin(p.angle)*25];
  for(const [label,target]of[['road',camera.target],['car',hood]]){const hit=triangles.hit(camera.eye,target);if(hit)issues.push({s,lane,speed,label,hit});}
 }
 assert.deepEqual(issues.slice(0,20),[],`${issues.length} blocked production-mesh sightlines`);
});
