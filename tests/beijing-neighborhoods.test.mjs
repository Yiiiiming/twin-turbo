import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, setTrack, trackPoint, projectTrack } from '../engine.js';
import { ObstacleWorld } from '../collisions.js';
import { updateChaseCamera } from '../renderer.js';
import { cityLandmarkPlacements } from '../city-scenery.js';
import { beijingReferencePoint } from '../beijing-reference.js';
import { beijingStadiumClearance } from '../beijing-stadium.js';
import { beijingWallClearance } from '../beijing-great-wall.js';
import { beijingNeighborhoodPlacements, addBeijingNeighborhood } from '../beijing-neighborhoods.js';

test.afterEach(()=>setTrack('coast'));
class Probe{
 constructor(item){this.item=item;this.colliders=[];this.radius=0;this.triangles=0;this.colors=new Set();}
 vertex(p){assert.ok(p.every(Number.isFinite));this.radius=Math.max(this.radius,Math.hypot(p[0]-this.item.x,p[2]-this.item.z));}
 triangle(a,b,c,color){[a,b,c].forEach(p=>this.vertex(p));this.triangles++;this.colors.add(color);}
 quad(a,b,c,d,color){this.triangle(a,b,c,color);this.triangle(a,c,d,color);}
 box(x,y,z,w,h,d,color,angle=0){
  assert.ok(w>0&&h>0&&d>0);
  for(const a of [-1,1])for(const b of [-1,1])for(const c of [-1,1])this.vertex([x+Math.cos(angle)*a*w/2-Math.sin(angle)*c*d/2,y+b*h/2,z+Math.sin(angle)*a*w/2+Math.cos(angle)*c*d/2]);
  this.triangles+=12;this.colors.add(color);
  if(this.colliders)this.colliders.push({type:'box',x,y:z,halfWidth:w/2,halfDepth:d/2,angle,minHeight:y-h/2,maxHeight:y+h/2});
 }
 cone(x,y,z,r,h,color,sides=8,top=0,phase=0){
  assert.ok(r>0&&h>0&&top>=0);
  for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2+phase;this.vertex([x+Math.cos(a)*r,y,z+Math.sin(a)*r]);this.vertex([x+Math.cos(a)*top,y+h,z+Math.sin(a)*top]);}
  this.triangles+=sides*(top?2:1);this.colors.add(color);
  if(this.colliders)this.colliders.push({type:'circle',x,y:z,radius:Math.max(r,top),minHeight:y,maxHeight:y+h});
 }
}

test('Beijing frontages are deterministic, road-facing, and clear of every reserved plot',()=>{
 setTrack('coast-beijing');const landmarks=cityLandmarkPlacements(),items=beijingNeighborhoodPlacements(landmarks);
 assert.deepEqual(items,beijingNeighborhoodPlacements(landmarks));
 assert.ok(items.length>=180&&items.length<=230,`${items.length} neighborhood plots`);
 for(const item of items){
  assert.ok(projectTrack(item.x,item.z).distance>=TRACK.roadWidth/2+item.radius+18);
  assert.ok(beijingWallClearance(item.x,item.z,item.radius));
  assert.equal(item.elevation,0,'the roadside buildings stay on the ground beside the raised road');
  for(const other of landmarks)assert.ok(other.kind==='beijing-birds-nest'?beijingStadiumClearance(other.stadium,item.x,item.z,item.radius+25):Math.hypot(item.x-other.x,item.z-other.z)>=item.radius+other.radius+25);
  if(item.kind!=='beijing-garden-tree'){
   const p=beijingReferencePoint(item.legacyS??item.s),toward=[p.x-item.x,p.y-item.z],front=[Math.sin(item.angle),-Math.cos(item.angle)];
   assert.ok(toward[0]*front[0]+toward[1]*front[1]>0,'front door faces the road');
  }
 }
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)assert.ok(Math.hypot(items[i].x-items[j].x,items[i].z-items[j].z)>=items[i].radius+items[j].radius+7);
});

test('neighborhood geometry fits its footprints and uses compact real solid volumes',()=>{
 setTrack('coast-beijing');const items=beijingNeighborhoodPlacements(cityLandmarkPlacements());let triangles=0;
 for(const item of items){
  const probe=new Probe(item);addBeijingNeighborhood(probe,item);triangles+=probe.triangles;
  assert.ok(probe.radius<=item.radius+.01,`${item.kind} ${probe.radius}/${item.radius}`);
  assert.ok(probe.triangles>=50&&probe.triangles<=200,`${item.kind}: ${probe.triangles} triangles`);
  assert.ok(probe.colors.size>=4);
  const body=probe.colliders.find(c=>c.minHeight<5&&c.maxHeight>=20);
  assert.ok(body,`${item.kind} needs a solid building body or tree trunk`);
  const car={x:body.x,y:body.y,elevation:3,height:25,angle:0,speed:0};
  assert.ok(new ObstacleWorld(probe.colliders).resolveCar(car)>0,`${item.kind} body has real collision`);
 }
 assert.ok(triangles<35000,`${triangles} neighborhood triangles`);
});

test('ordinary streets leave normal driving lanes and chase camera views clear',()=>{
 setTrack('coast-beijing');const probe=new Probe({x:0,z:0});
 for(const item of beijingNeighborhoodPlacements(cityLandmarkPlacements()))addBeijingNeighborhood(probe,item);
 const world=new ObstacleWorld(probe.colliders);
 for(let s=0;s<TRACK.length;s+=23)for(const lane of [-48,0,48]){
  const car={...trackPoint(s,lane),height:25,speed:363};assert.equal(world.resolveCar(car),0,`car ${s}/${lane}`);
  const camera=updateChaseCamera(car,null),eye={x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:car.angle,speed:0};
  assert.equal(world.resolveCar(eye),0,`camera ${s}/${lane}`);
 }
});

test('other maps receive no Beijing neighborhood plots',()=>{
 for(const id of ['coast','coast-austin','coast-london','coast-shanghai']){setTrack(id);assert.deepEqual(beijingNeighborhoodPlacements(),[]);}
});
