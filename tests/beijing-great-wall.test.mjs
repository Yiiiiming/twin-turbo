import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TRACK,setTrack,trackPoint,projectTrack } from '../engine.js';
import { ObstacleWorld } from '../collisions.js';
import { updateChaseCamera } from '../renderer.js';
import { cityLandmarkPlacements,citySceneryPlacements } from '../city-scenery.js';
import { beijingWallLayout,beijingWallClearance,addBeijingGreatWall } from '../beijing-great-wall.js';
test.afterEach(()=>setTrack('coast'));
class Mesh {
  constructor(){this.colliders=[];this.triangles=0;this.vertices=[];this.colors=new Set();}
  triangle(a,b,c,color){for(const p of[a,b,c]){assert.ok(p.every(Number.isFinite));this.vertices.push(p);}this.colors.add(color);this.triangles++;}
  quad(a,b,c,d,color){this.triangle(a,b,c,color);this.triangle(a,c,d,color);}
  box(x,y,z,w,h,d,color,angle=0){
    assert.ok(w>0&&h>0&&d>0);const c=Math.cos(angle),s=Math.sin(angle);
    const v=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(([a,b,e])=>[x+c*a*w/2-s*e*d/2,y+b*h/2,z+s*a*w/2+c*e*d/2]);
    for(const ids of[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]])this.quad(...ids.map(i=>v[i]),color);
    if(this.colliders)this.colliders.push({type:'box',x,y:z,halfWidth:w/2,halfDepth:d/2,angle,minHeight:y-h/2,maxHeight:y+h/2});
  }
}
const makeMesh=()=>{const mesh=new Mesh();addBeijingGreatWall(mesh);return mesh;};

test('the Great Wall leaves Beijing road geometry, elevation, grid and checkpoints exactly unchanged',()=>{
  setTrack('coast-beijing');
  const fingerprint=JSON.stringify({length:TRACK.length,roadWidth:TRACK.roadWidth,startDistance:TRACK.startDistance,startGrid:TRACK.startGrid,checkpoints:TRACK.checkpoints,sections:TRACK.sections,segments:TRACK.segments,samples:Array.from({length:1621},(_,i)=>trackPoint(i*10))});
  assert.equal(createHash('sha256').update(fingerprint).digest('hex'),'7d29661d641e7e8e16fc9f8495c6cf1a3babbcb8d27ec4a7fe21b95e2f1da25c');
});

test('one continuous winding ridge spans every quarter of the complete Beijing circuit',()=>{
  setTrack('coast-beijing');const wall=beijingWallLayout();
  assert.equal(wall.nodes.length,wall.segments.length);assert.ok(wall.length>TRACK.length);assert.equal(wall.towers.length,18);
  assert.ok(new Set(wall.towers.map(t=>t.kind)).size>=3);
  assert.ok(Math.max(...wall.nodes.map(n=>n.base))-Math.min(...wall.nodes.map(n=>n.base))>100);
  for(let i=0;i<wall.segments.length;i++){
    const span=wall.segments[i],next=wall.segments[(i+1)%wall.segments.length];
    assert.equal(span.b,next.a,'adjacent ridge spans must use exactly the same join');
    assert.ok(span.length>25&&span.length<=91);
    assert.ok(projectTrack(span.x,span.z).distance>320,'ridge centerline must stay beyond all road branches');
    assert.ok(Math.cos(next.angle-span.angle)>.5,'no kink or folded offset loop');
  }
  for(let s=0;s<TRACK.length;s+=90){
    const car=trackPoint(s),nearest=Math.min(...wall.nodes.map(n=>Math.hypot(n.x-car.x,n.z-car.y)));
    assert.ok(nearest<650,`Great Wall missing near racing distance ${s}`);
  }
  for(const landmark of cityLandmarkPlacements())assert.ok(beijingWallClearance(landmark.x,landmark.z,landmark.radius),`${landmark.kind} touches the ridge`);
  assert.ok(citySceneryPlacements().filter(item=>beijingWallClearance(item.x,item.z,item.radius)).length>100,'ordinary Beijing streets remain populated');
});

test('actual geometry is finite, richly articulated and below the 30,000 triangle scenery budget',()=>{
  setTrack('coast-beijing');const mesh=makeMesh();
  assert.ok(mesh.triangles>15000&&mesh.triangles<30000,`${mesh.triangles} wall triangles`);
  assert.ok(mesh.colors.size>=15);assert.ok(mesh.colliders.length>1000);
  for(const vertex of mesh.vertices)assert.ok(vertex[1]>=-.01,'nothing extends below the ground');
  // Every declared collider is a local, height-bounded piece: no giant circles
  // around the complete hill or infinite-height barriers around the city.
  for(const collider of mesh.colliders){
    assert.equal(collider.type,'box');assert.ok(collider.halfWidth<80&&collider.halfDepth<=70);
    assert.ok(Number.isFinite(collider.minHeight)&&Number.isFinite(collider.maxHeight));
    assert.ok(collider.minHeight>=0&&collider.maxHeight>collider.minHeight);
  }
});

test('the rendered wall and watchtowers are solid, while every lane and chase-camera pose remains clear',()=>{
  setTrack('coast-beijing');const mesh=makeMesh(),world=new ObstacleWorld(mesh.colliders),wall=beijingWallLayout();
  for(const node of wall.nodes){
    const probe={x:node.x,y:node.z,elevation:node.base+32,height:25,angle:node.angle,speed:0};
    assert.ok(world.resolveCar(probe)>0,`unphysical hole at ${node.s}`);
  }
  for(const tower of wall.towers){
    const probe={x:tower.x,y:tower.z,elevation:tower.base+tower.height-20,height:12,angle:tower.angle,speed:0};
    assert.ok(world.resolveCar(probe)>0,`watchtower ${tower.index} has no solid walls`);
  }
  for(let s=0;s<TRACK.length;s+=17)for(const lane of[-48,-24,0,24,48]){
    const pose=trackPoint(s,lane),car={...pose,height:25,speed:0};
    assert.equal(world.resolveCar(car),0,`Great Wall obstructs lane ${s}/${lane}`);
    for(const speed of[0,363,517]){
      const camera=updateChaseCamera({...pose,speed,boosting:speed===517},null);
      const probe={x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:pose.angle,speed:0};
      assert.equal(world.resolveCar(probe),0,`Great Wall obstructs chase camera ${s}/${lane}/${speed}`);
    }
  }
});

test('the Great Wall contributes no geometry or clearance exclusions to other maps',()=>{
  for(const id of['coast','coast-london','coast-austin','coast-rio','coast-paris']){
    setTrack(id);assert.equal(beijingWallLayout().nodes.length,0);assert.equal(makeMesh().triangles,0);assert.equal(beijingWallClearance(0,0,99999),true);
  }
});
