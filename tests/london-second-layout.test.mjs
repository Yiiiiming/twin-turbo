import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, setTrack, trackPoint, projectTrack } from '../engine.js';
import { RaceRenderer, londonLandmarkPlacements, sceneryPlacements, updateChaseCamera } from '../renderer.js';
import { LONDON_SECOND_LANDMARKS, addLondonSecondLandmark } from '../london-second-landmarks.js';
import { londonSecondLandmarkPlacements } from '../london-second-layout.js';
import { ObstacleWorld } from '../collisions.js';
const kinds=new Set(LONDON_SECOND_LANDMARKS.map(item=>item.kind));
const additions=()=>londonLandmarkPlacements().filter(item=>kinds.has(item.kind));
test.afterEach(()=>setTrack('coast'));

class Probe {
 constructor(item){this.item=item;this.radius=0;this.top=[0,-Infinity,0];this.colliders=[];}
 vertex(p){assert.ok(p.every(Number.isFinite),`${this.item.kind}: nonfinite geometry`);this.radius=Math.max(this.radius,Math.hypot(p[0]-this.item.x,p[2]-this.item.z));if(p[1]>this.top[1])this.top=p;}
 triangle(a,b,c){for(const p of [a,b,c])this.vertex(p);}
 quad(a,b,c,d){for(const p of [a,b,c,d])this.vertex(p);}
 box(x,y,z,w,h,d,color,angle=0){const c=Math.cos(angle),s=Math.sin(angle);for(const a of [-1,1])for(const b of [-1,1])for(const e of [-1,1])this.vertex([x+c*a*w/2-s*e*d/2,y+b*h/2,z+s*a*w/2+c*e*d/2]);if(this.colliders)this.colliders.push({type:'box',x,y:z,halfWidth:w/2,halfDepth:d/2,angle,minHeight:y-h/2,maxHeight:y+h/2});}
 cone(x,y,z,r,h,color,sides=8,top=0,phase=0){for(let i=0;i<sides;i++)for(const up of [false,true]){const a=i/sides*Math.PI*2+phase,rr=up?top:r;this.vertex([x+Math.cos(a)*rr,y+(up?h:0),z+Math.sin(a)*rr]);}if(this.colliders)this.colliders.push({type:'circle',x,y:z,radius:Math.max(r,top),minHeight:y,maxHeight:y+h});}
}
function probe(item){const mesh=new Probe(item);addLondonSecondLandmark(mesh,item);return mesh;}
function fakeGL(){const gl={buffers:new Map()};let bound,id=0;for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_,name)=>name;gl.bindBuffer=(_,buffer)=>{bound=buffer;};gl.bufferData=(_,array)=>gl.buffers.set(bound,array);for(const name of ['uniformMatrix4fv','deleteBuffer','drawArrays','shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindTexture','texImage2D','texParameteri','enable','depthFunc','disable','clearColor','blendFunc','enableVertexAttribArray','vertexAttribPointer','depthMask','useProgram','disableVertexAttribArray','activeTexture','uniform1i','uniform1f','uniform3fv','viewport','scissor','clear','pixelStorei'])gl[name]=()=>{};return gl;}

test('ten additional London plots face the track and clear the entire road, river, existing landmarks and street scenery',()=>{
 setTrack('coast-london');const all=londonLandmarkPlacements(),plots=additions(),street=sceneryPlacements();
 assert.equal(plots.length,10);assert.deepEqual(new Set(plots.map(item=>item.kind)),kinds);
 assert.deepEqual(londonSecondLandmarkPlacements(all.filter(item=>!kinds.has(item.kind))),plots,'production uses the validated layout');
 for(const item of plots){const mesh=probe(item),near=projectTrack(item.x,item.z),road=trackPoint(item.s),dx=road.x-item.x,dz=road.y-item.z;
  assert.ok(mesh.radius<=item.radius+.01,`${item.kind}: ornament leaves its reserved plot`);
  assert.ok(near.distance>=TRACK.roadWidth/2+item.radius+27,`${item.kind}: footprint overlaps a road branch`);
  assert.ok(near.distance<350,`${item.kind}: detached from the driving view`);
  assert.ok(Math.abs(item.z-TRACK.river.centerZ)>=TRACK.river.halfWidth+item.radius+27,`${item.kind}: footprint overlaps the Thames`);
  assert.ok((Math.sin(item.angle)*dx-Math.cos(item.angle)*dz)/Math.hypot(dx,dz)>.999,`${item.kind}: facade faces away from the road`);
  assert.equal(road.elevation,0,`${item.kind}: placed beside a bridge slope`);
  for(const other of all)if(other!==item&&other.kind!==item.kind)assert.ok(Math.hypot(item.x-other.x,item.z-other.z)>=item.radius+other.radius+30,`${item.kind}/${other.kind}: landmark plots overlap`);
  for(const other of street)assert.ok(Math.hypot(item.x-other.x,item.z-other.z)>=item.radius+other.radius+30,`${item.kind}/${other.kind}: street scenery overlaps`);
 }
});

test('each new landmark reaches the actual production GPU buffer with its solid body hulls inside the 40 MB budget',t=>{
 setTrack('coast-london');const gl=fakeGL(),renderer=new RaceRenderer({width:1440,height:820,getContext:()=>gl,addEventListener(){}});assert.equal(renderer.available,true,renderer.error);
 let bytes=0;for(const data of gl.buffers.values()){bytes+=data.byteLength;for(const n of data)assert.ok(Number.isFinite(n));}assert.ok(bytes<40_000_000,`${bytes/1e6} MB exceeds the London GPU allowance`);
 const key=p=>p.map(Math.fround).join(','),peaks=new Map();
 for(const item of additions()){const mesh=probe(item);peaks.set(key(mesh.top),item.kind);assert.ok(mesh.colliders.length>=3);
  for(const hull of mesh.colliders)assert.ok(renderer.obstacles.some(actual=>Object.entries(hull).every(([name,value])=>typeof value==='number'?Math.abs(actual[name]-value)<1e-7:actual[name]===value)),`${item.kind}: solid body missing from the production world`);
 }
 const data=gl.buffers.get(renderer.meshes.props.buffer);assert.ok(data?.length>0,'missing production props buffer');
 for(let i=0;i<data.length&&peaks.size;i+=11)peaks.delete([data[i],data[i+1],data[i+2]].join(','));
 assert.deepEqual([...peaks.values()],[],'a landmark silhouette is absent from the actual GPU geometry');
 t.diagnostic(`Complete London GPU geometry: ${(bytes/1e6).toFixed(3)} MB`);
});

test('new physical bodies leave all car lanes and the moving chase camera clear throughout London',()=>{
 setTrack('coast-london');const hulls=additions().flatMap(item=>probe(item).colliders),world=new ObstacleWorld(hulls),edge=TRACK.roadWidth/2-world.carRadius;
 for(let s=0;s<TRACK.length;s+=17)for(const lane of [-edge,0,edge]){const pose=trackPoint(s,lane);assert.equal(world.resolveCar({...pose,height:25,speed:0}),0,`car ${s}/${lane}`);
  for(const speed of [0,363,517]){const camera=updateChaseCamera({...pose,speed,boosting:speed===517},null);assert.equal(world.resolveCar({x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:pose.angle,speed:0}),0,`chase camera ${s}/${lane}/${speed}`);}
 }
});
