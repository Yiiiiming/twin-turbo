import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TRACK, RaceEngine, setTrack, trackPoint, projectTrack } from '../engine.js';
import { ObstacleWorld } from '../collisions.js';
import { RaceRenderer, londonLandmarkPlacements, sceneryPlacements, updateChaseCamera } from '../renderer.js';
import { LONDON_THEATRES, addLondonTheatre } from '../london-theatres.js';
test.afterEach(()=>setTrack('coast'));

// Inspect actual primitive extents, not just declared model envelopes. Catch
// malformed dimensions and overhanging signs before plots/collisions are built.
class ModelMesh {
 constructor(item){this.item=item;this.min=[Infinity,Infinity,Infinity];this.max=[-Infinity,-Infinity,-Infinity];this.triangles=0;this.radius=0;this.colliders=[];this.colors=new Set();}
 vertex(p,color){
  assert.ok(p.every(Number.isFinite),`${this.item.kind}: invalid vertex ${p}`);
  const angle=-this.item.angle,dx=p[0]-this.item.x,dz=p[2]-this.item.z;
  const local=[dx*Math.cos(angle)-dz*Math.sin(angle),p[1]-(this.item.elevation||0),dx*Math.sin(angle)+dz*Math.cos(angle)];
  local.forEach((v,i)=>{this.min[i]=Math.min(this.min[i],v);this.max[i]=Math.max(this.max[i],v);});
  this.radius=Math.max(this.radius,Math.hypot(dx,dz));this.colors.add(color);
 }
 triangle(a,b,c,color){[a,b,c].forEach(p=>this.vertex(p,color));this.triangles++;}
 quad(a,b,c,d,color){[a,b,c,d].forEach(p=>this.vertex(p,color));this.triangles+=2;}
 box(x,y,z,w,h,d,color,angle=0){
  assert.ok([w,h,d].every(n=>Number.isFinite(n)&&n>0),`${this.item.kind}: invalid box ${w}, ${h}, ${d}`);
  for(const i of [-1,1])for(const j of [-1,1])for(const k of [-1,1])this.vertex([x+Math.cos(angle)*i*w/2-Math.sin(angle)*k*d/2,y+j*h/2,z+Math.sin(angle)*i*w/2+Math.cos(angle)*k*d/2],color);
  this.triangles+=12;if(this.colliders)this.colliders.push({type:'box',x,y:z,halfWidth:w/2,halfDepth:d/2,angle,minHeight:y-h/2,maxHeight:y+h/2});
 }
 cone(x,y,z,r,h,color,sides=8,top=0,phase=0){
  assert.ok(r>0&&h>0&&top>=0,`${this.item.kind}: invalid cone`);
  for(let i=0;i<sides;i++)for(const up of [false,true]){const a=i/sides*Math.PI*2+phase;this.vertex([x+Math.cos(a)*(up?top:r),y+(up?h:0),z+Math.sin(a)*(up?top:r)],color);}
  this.triangles+=sides*(top===0?1:2);if(this.colliders)this.colliders.push({type:'circle',x,y:z,radius:Math.max(r,top),minHeight:y,maxHeight:y+h});
 }
}

test('eight additional theatres stay inside their declared plots with finite detailed geometry',()=>{
 assert.equal(LONDON_THEATRES.length,8);assert.equal(new Set(LONDON_THEATRES.map(x=>x.kind)).size,8);
 let triangles=0;
 for(const metadata of LONDON_THEATRES){
  for(const angle of [0,.713,2.8]){
   const item={...metadata,x:321,z:-127,angle,elevation:7},mesh=new ModelMesh(item),collector=mesh.colliders;
   addLondonTheatre(mesh,item);
   assert.equal(mesh.colliders,collector,'detail drawing must restore the collider collector');assert.ok(collector.length>=2,'buildings must have solid volumes');
   assert.ok(mesh.triangles>=500,`${item.kind}: missing architectural details`);assert.ok(mesh.colors.size>=6);
   assert.ok(mesh.radius<=item.radius+.01,`${item.kind}: radius ${mesh.radius} > ${item.radius}`);
   assert.ok(mesh.max[0]-mesh.min[0]<=item.width+.01,`${item.kind}: width ${mesh.max[0]-mesh.min[0]} > ${item.width}`);
   assert.ok(mesh.max[2]-mesh.min[2]<=item.depth+.01,`${item.kind}: depth ${mesh.max[2]-mesh.min[2]} > ${item.depth}`);
   assert.ok(mesh.min[1]>=-.01&&mesh.max[1]<=item.height+.01,`${item.kind}: vertical ${mesh.min[1]}…${mesh.max[1]} > ${item.height}`);
   if(angle===0)triangles+=mesh.triangles;
  }
 }
 assert.ok(triangles<=24_000,`eight theatres use ${triangles} triangles, above their allocated GPU budget`);
});

export { ModelMesh };

const kinds=new Set(LONDON_THEATRES.map(item=>item.kind));
const plots=()=>londonLandmarkPlacements().filter(item=>kinds.has(item.kind));
function fakeGL(){
 const gl={buffers:new Map()};let bound,id=0;
 for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
 gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_,name)=>name;
 gl.bindBuffer=(_,buffer)=>{bound=buffer;};gl.bufferData=(_,array)=>gl.buffers.set(bound,array);
 for(const name of ['uniformMatrix4fv','deleteBuffer','drawArrays','shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindTexture','texImage2D','texParameteri','enable','depthFunc','disable','clearColor','blendFunc','enableVertexAttribArray','vertexAttribPointer','depthMask','useProgram','disableVertexAttribArray','activeTexture','uniform1i','uniform1f','uniform3fv','viewport','scissor','clear','pixelStorei'])gl[name]=()=>{};
 return gl;
}

test('eight theatre plots preserve the London route and clear every road branch, river and neighboring building',()=>{
 setTrack('coast-london');
 const snapshot=JSON.stringify({track:TRACK,samples:Array.from({length:1661},(_,i)=>trackPoint(i*10))});
 assert.equal(createHash('sha256').update(snapshot).digest('hex'),'17bacb9b4fbcd7c8d603caf6d3a751ddf2bef00139593151c5114650c86f52be');
 assert.deepEqual(new Set(plots().map(item=>item.kind)),kinds);
 const all=londonLandmarkPlacements(),street=sceneryPlacements();
 for(const item of plots()){
  const mesh=new ModelMesh(item);addLondonTheatre(mesh,item);
  assert.ok(mesh.radius<=item.radius+.01,`${item.kind}: generated facade leaves its plot`);
  const nearest=projectTrack(item.x,item.z),road=trackPoint(item.s),dx=road.x-item.x,dz=road.y-item.z;
  assert.ok(nearest.distance>=TRACK.roadWidth/2+mesh.radius+25,`${item.kind}: facade obstructs a road branch`);
  assert.ok(nearest.distance<350,`${item.kind}: too far from the driving view`);
  assert.ok(Math.abs(item.z-TRACK.river.centerZ)>=TRACK.river.halfWidth+mesh.radius+25,`${item.kind}: extends into river`);
  assert.ok((Math.sin(item.angle)*dx-Math.cos(item.angle)*dz)/Math.hypot(dx,dz)>.999,`${item.kind}: facade and advertising face away from road`);
  assert.ok(Math.abs(road.elevation)<.01,`${item.kind}: placed on a bridge slope`);
  for(const other of all)if(other.kind!==item.kind)assert.ok(Math.hypot(other.x-item.x,other.z-item.z)>=other.radius+mesh.radius+25,`${item.kind}/${other.kind}: overlap`);
  for(const other of street)assert.ok(Math.hypot(other.x-item.x,other.z-item.z)>=other.radius+mesh.radius+30,`${item.kind}/${other.kind}: street scenery overlap`);
 }
});

test('all seventeen additions fit the 40 MB London GPU budget and theatre hulls leave cars and chase cameras clear',()=>{
 setTrack('coast-london');const gl=fakeGL();
 const renderer=new RaceRenderer({width:1440,height:820,getContext:()=>gl,addEventListener(){}});
 assert.equal(renderer.available,true,renderer.error);
 let floats=0;for(const data of gl.buffers.values()){floats+=data.length;for(const v of data)assert.ok(Number.isFinite(v));}
 assert.ok(floats<10_000_000,`${floats*4/1e6} MB exceeds London geometry budget`);
 const addedHulls=[];
 for(const item of plots()){
  const mesh=new ModelMesh(item);addLondonTheatre(mesh,item);addedHulls.push(...mesh.colliders);
  for(const hull of mesh.colliders)assert.ok(renderer.obstacles.some(actual=>Object.entries(hull).every(([key,value])=>typeof value==='number'?Math.abs(actual[key]-value)<1e-7:actual[key]===value)),`${item.kind}: a solid hull is missing from the world`);
  const world=new ObstacleWorld(mesh.colliders);
  assert.ok(world.resolveCar({x:item.x,y:item.z,elevation:0,height:25,angle:item.angle,speed:0})>0,`${item.kind}: building can be driven through`);
 }
 const engine=new RaceEngine({obstacles:renderer.obstacles}),newWorld=new ObstacleWorld(addedHulls);
 for(let s=0;s<TRACK.length;s+=17)for(const lane of [-30,0,30]){
  const pose=trackPoint(s,lane);assert.equal(engine.obstacleWorld.resolveCar({...pose,height:25,speed:0}),0,`car obstructed at ${s}/${lane}`);
  // Only newly added hulls: existing bridge lamps are outside this scenery task.
  for(const speed of [0,363,517]){
   const camera=updateChaseCamera({...pose,speed,boosting:speed===517},null);
   assert.equal(newWorld.resolveCar({x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:pose.angle,speed:0}),0,`theatre intersects chase camera at ${s}/${lane}/${speed}`);
  }
 }
});
