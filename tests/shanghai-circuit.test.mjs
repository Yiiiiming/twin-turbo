import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, setTrack, trackPoint, projectTrack, RaceEngine, mod } from '../engine.js';
import { RaceAI } from '../ai.js';
import { ObstacleWorld } from '../collisions.js';
import { SHANGHAI_LANDMARKS, shanghaiLandmarkPlacements, addShanghaiLandmark } from '../shanghai-landmarks.js';
import { updateChaseCamera, sceneObstacles } from '../renderer.js';

class AuditMesh {
 constructor(item){this.item=item;this.colliders=[];this.radius=0;this.low=Infinity;this.high=-Infinity;this.triangles=0;this.colors=new Set();}
 vertex(p){assert.ok(p.every(Number.isFinite));this.radius=Math.max(this.radius,Math.hypot(p[0]-this.item.x,p[2]-this.item.z));this.low=Math.min(this.low,p[1]);this.high=Math.max(this.high,p[1]);}
 triangle(a,b,c,color){[a,b,c].forEach(p=>this.vertex(p));this.triangles++;this.colors.add(color);}
 quad(a,b,c,d,color){this.triangle(a,b,c,color);this.triangle(a,c,d,color);}
 box(x,y,z,w,h,d,color,angle=0){
  assert.ok(w>0&&h>0&&d>0);if(this.colliders)this.colliders.push({type:'box',x,y:z,halfWidth:w/2,halfDepth:d/2,angle,minHeight:y-h/2,maxHeight:y+h/2});
  for(const a of [-1,1])for(const b of [-1,1])for(const c of [-1,1])this.vertex([x+Math.cos(angle)*a*w/2-Math.sin(angle)*c*d/2,y+b*h/2,z+Math.sin(angle)*a*w/2+Math.cos(angle)*c*d/2]);
  this.triangles+=12;this.colors.add(color);
 }
 cone(x,y,z,r,h,color,sides=8,top=0,phase=0){
  assert.ok(r>0&&h>0&&top>=0,`invalid cone: ${[r,h,top]}`);if(this.colliders)this.colliders.push({type:'circle',x,y:z,radius:Math.max(r,top),minHeight:y,maxHeight:y+h});
  for(let i=0;i<sides;i++)for(const high of [false,true]){const a=i/sides*Math.PI*2+phase;this.vertex([x+Math.cos(a)*(high?top:r),y+(high?h:0),z+Math.sin(a)*(high?top:r)]);}
  this.triangles+=sides*(top?2:1);this.colors.add(color);
 }
 disk(x,y,z,rx,rz,color,sides=32,angle=0){for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2;this.vertex([x+Math.cos(a)*rx*Math.cos(angle)-Math.sin(a)*rz*Math.sin(angle),y,z+Math.cos(a)*rx*Math.sin(angle)+Math.sin(a)*rz*Math.cos(angle)]);}this.triangles+=sides;this.colors.add(color);}
}
const plots=()=>{setTrack('coast-shanghai');return shanghaiLandmarkPlacements();};
test.afterEach(()=>setTrack('coast'));

test('Shanghai closes exactly, has a flat staggered grid, and keeps the compact 240 km/h scale',()=>{
 setTrack('coast-shanghai');assert.ok(TRACK.length>19000&&TRACK.length<20000);assert.equal(Math.round(363*3.6/TRACK.unitsPerMeter),240);
 assert.equal(TRACK.checkpoints%4,0);assert.equal(TRACK.roadWidth,120);
 for(const grid of TRACK.startGrid){assert.equal(trackPoint(TRACK.startDistance+grid.offset).elevation,0);}
 for(const segment of TRACK.segments){
  const a=trackPoint(segment.s+segment.length-.00001),b=trackPoint(segment.s+segment.length+.00001);
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<.001);assert.ok(Math.abs(a.elevation-b.elevation)<.001);
  assert.ok(Math.abs(mod(a.angle-b.angle+Math.PI,Math.PI*2)-Math.PI)<.001);
 }
 for(let s=0;s<TRACK.length;s+=19){const p=trackPoint(s);assert.ok(Math.abs(p.slope)<.24);assert.ok(p.x>120&&p.y>120&&p.x<TRACK.width-120&&p.y<TRACK.height-120);}
});

test('the Pearl ascent makes two complete turns with safe vertical separation and no projection shortcuts',()=>{
 setTrack('coast-shanghai');const spiral=TRACK.spirals[0];assert.equal(spiral.degrees,720);assert.equal(spiral.radius,360);
 assert.ok(Math.abs(spiral.end-spiral.start-4*Math.PI*360)<1e-7);
 const pearl=shanghaiLandmarkPlacements().find(item=>item.kind==='oriental-pearl');assert.equal(pearl.x,spiral.cx);assert.equal(pearl.z,spiral.cy);
 const lap=Math.PI*2*360;
 for(let phase=0;phase<=lap;phase+=19){
  const s=spiral.start+phase,a=trackPoint(s),b=trackPoint(s+lap);
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-7);assert.ok(b.elevation-a.elevation>=209.999);
  assert.ok(Math.abs(projectTrack(a.x,a.y,s,a.elevation).s-s)<.001);assert.ok(Math.abs(projectTrack(b.x,b.y,s+lap,b.elevation).s-s-lap)<.001);
 }
});

test('all twelve named landmarks have bounded, distinct, solid detailed geometry within a 35k triangle budget',()=>{
 const items=plots();assert.equal(items.length,12);assert.equal(new Set(items.map(i=>i.kind)).size,12);assert.equal(SHANGHAI_LANDMARKS.length,12);
 let triangles=0;
 for(const item of items){
  const mesh=new AuditMesh(item);addShanghaiLandmark(mesh,item);triangles+=mesh.triangles;
  assert.ok(mesh.radius<=item.radius+.3,`${item.kind} radius ${mesh.radius} > ${item.radius}`);
  assert.ok(mesh.low>=-.1&&mesh.high<=item.height+.5,`${item.kind} height ${mesh.low}…${mesh.high}`);
  assert.ok(mesh.triangles>500,`${item.kind} should have architectural detail`);assert.ok(mesh.colors.size>=4,`${item.kind} needs material detail`);
  assert.ok(mesh.colliders.length>0,`${item.kind} needs solid structures`);
 }
 assert.ok(triangles<35000,`${triangles} landmark triangles exceed budget`);
});

test('all plots stay beside the circuit, avoid each other and leave every lane and chase camera clear',()=>{
 const items=plots(),obstacles=[];
 for(const item of items){
  const mesh=new AuditMesh(item);addShanghaiLandmark(mesh,item);obstacles.push(...mesh.colliders);
  assert.ok(projectTrack(item.x,item.z).distance>=item.radius+85,`${item.kind} is too close to another road branch`);
  for(const other of items)if(other!==item)assert.ok(Math.hypot(item.x-other.x,item.z-other.z)>=item.radius+other.radius+30,`${item.kind}/${other.kind} overlap`);
  if(item.kind!=='oriental-pearl'){
   const p=trackPoint(item.s),dx=p.x-item.x,dz=p.y-item.z;
   assert.ok((Math.sin(item.angle)*dx-Math.cos(item.angle)*dz)/Math.hypot(dx,dz)>.999);
  }
 }
 const world=new ObstacleWorld(obstacles);
 for(let s=0;s<TRACK.length;s+=17)for(const lane of [-32,0,32]){
  const car={...trackPoint(s,lane),height:25,speed:0};assert.equal(world.resolveCar(car),0,`driving lane blocked at ${s}`);
  for(const speed of [0,363,517]){
   const camera=updateChaseCamera({...car,speed},null),probe={x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:0,speed:0};
   assert.equal(world.resolveCar(probe),0,`new landmark intersects camera at ${s}`);
  }
 }
});

test('Shanghai production AI finishes both 1- and 3-lap races without rescue or skipped checkpoints',()=>{
 setTrack('coast-shanghai');const obstacles=sceneObstacles();
 for(const laps of [1,3]){
  const engine=new RaceEngine({laps,obstacles}).start(laps),drivers=[new RaceAI({carId:1}),new RaceAI({carId:2})];
  for(let frame=0;frame<60*220&&engine.state!=='finished';frame++)engine.step(1/60,new Set(drivers.flatMap(d=>[...d.update(engine,1/60)])));
  assert.equal(engine.state,'finished');assert.deepEqual(drivers.map(d=>d.rescues),[0,0]);
  for(const car of engine.cars){assert.equal(car.lap,laps);assert.ok(car.bestLap>=45&&car.bestLap<=65,`Shanghai lap ${car.bestLap}`);}
 }
});

test('Shanghai production supports, lifted timing gates and lamps clear all chase-camera samples',()=>{
 setTrack('coast-shanghai');const world=new ObstacleWorld(sceneObstacles());
 for(let s=0;s<TRACK.length;s+=11)for(const lane of [-32,0,32]){
  assert.equal(world.resolveCar({...trackPoint(s,lane),height:25,speed:0}),0,`production lane contact at ${s}/${lane}`);
  for(const speed of [0,363,517]){
   const camera=updateChaseCamera({...trackPoint(s,lane),speed},null);
   const probe={x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:0,speed:0};
   assert.equal(world.resolveCar(probe),0,`production camera contact at ${s}/${lane}/${speed}`);
  }
 }
});

test('Huangpu has two finite banks, a raised crossing and a sustained Bund-to-Pearl driving view',async()=>{
 const {shanghaiRiverContains,shanghaiRiverClearance}=await import('../shanghai-riverfront.js');setTrack('coast-shanghai');
 let entries=0,insideBefore=false;
 for(let s=0;s<TRACK.length;s+=9){const p=trackPoint(s),inside=shanghaiRiverContains(p.x,p.y);
  if(inside&&!insideBefore)entries++;if(inside)assert.ok(p.elevation>=85.9,'crossing must stay on a raised bridge deck');insideBefore=inside;}
 assert.equal(entries,1);for(const item of shanghaiLandmarkPlacements())assert.ok(shanghaiRiverClearance(item.x,item.z,item.radius),`${item.kind} overlaps Huangpu`);
 const pearl=shanghaiLandmarkPlacements()[0];
 for(let s=12400;s<=13500;s+=50){
  const p=trackPoint(s),bearing=Math.atan2(pearl.z-p.y,pearl.x-p.x);
  assert.ok(Math.abs(mod(bearing-p.angle+Math.PI,Math.PI*2)-Math.PI)<Math.PI/6,'Pearl fits forward driving FOV throughout the Bund straight');
  let crossesWater=false;for(let t=.02;t<1;t+=.02)crossesWater ||= shanghaiRiverContains(p.x+(pearl.x-p.x)*t,p.y+(pearl.z-p.y)*t);
  assert.ok(crossesWater,'the visible Pearl must be across actual water, not merely beside a decorative lake');
 }
});
