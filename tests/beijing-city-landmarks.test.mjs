import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, setTrack, trackPoint, projectTrack } from '../src/engine.js';
import { ObstacleWorld } from '../src/collisions.js';
import { updateChaseCamera } from '../src/renderer.js';
import { cityLandmarkPlacements } from '../src/city-scenery.js';
import { beijingStadiumClearance } from '../src/beijing-stadium.js';
import { beijingWallClearance } from '../src/beijing-great-wall.js';
import { BEIJING_LANDMARKS, BEIJING_REFINEMENTS, addBeijingCityLandmark, beijingLandmarkPlacements } from '../src/beijing-city-landmarks.js';
test.afterEach(()=>setTrack('coast'));
class Probe {
 constructor(){this.colliders=[];this.radius=0;this.height=0;this.triangles=0;this.colors=new Set();}
 vertex(p){assert.ok(p.every(Number.isFinite));this.radius=Math.max(this.radius,Math.hypot(p[0],p[2]));this.height=Math.max(this.height,p[1]);}
 triangle(a,b,c,color){[a,b,c].forEach(p=>this.vertex(p));this.triangles++;this.colors.add(color);}
 quad(a,b,c,d,color){this.triangle(a,b,c,color);this.triangle(a,c,d,color);}
 box(x,y,z,w,h,d,color,angle=0){assert.ok(w>0&&h>0&&d>0);const co=Math.cos(angle),si=Math.sin(angle);for(const a of [-1,1])for(const b of [-1,1])for(const e of [-1,1])this.vertex([x+co*a*w/2-si*e*d/2,y+b*h/2,z+si*a*w/2+co*e*d/2]);this.triangles+=12;this.colors.add(color);if(this.colliders)this.colliders.push({type:'box',x,y:z,halfWidth:w/2,halfDepth:d/2,angle,minHeight:y-h/2,maxHeight:y+h/2});}
 cone(x,y,z,r,h,color,n=32,top=0,phase=0){assert.ok(r>0&&h>0&&top>=0);for(let i=0;i<n;i++){const a=i/n*Math.PI*2+phase;this.vertex([x+Math.cos(a)*r,y,z+Math.sin(a)*r]);this.vertex([x+Math.cos(a)*top,y+h,z+Math.sin(a)*top]);}this.triangles+=n*(top?2:1);this.colors.add(color);if(this.colliders)this.colliders.push({type:'circle',x,y:z,radius:Math.max(r,top),minHeight:y,maxHeight:y+h});}
}
test('twenty distinct new Beijing landmarks complement three existing refined landmarks',()=>{
 assert.equal(BEIJING_LANDMARKS.length,20);assert.equal(new Set(BEIJING_LANDMARKS.map(m=>m.kind)).size,20);assert.equal(BEIJING_REFINEMENTS.length,3);
 for(const model of [...BEIJING_LANDMARKS,...BEIJING_REFINEMENTS])assert.ok(model.source.startsWith('https://'));
 setTrack('coast-beijing');const plots=cityLandmarkPlacements();assert.equal(plots.length,23);assert.equal(new Set(plots.map(p=>p.kind)).size,23);
 assert.ok(plots.filter(p=>p.side<0).length>=6);assert.ok(plots.filter(p=>p.side>0).length>=6);
 const quarters=new Set(plots.map(p=>Math.floor(((p.s%TRACK.length)+TRACK.length)%TRACK.length/TRACK.length*4)));assert.equal(quarters.size,4);
 for(const p of plots){if(p.kind==='beijing-birds-nest'){assert.ok(p.stadium&&p.stadium.loopEnd>p.stadium.loopStart,'stadium contains its required road');continue;}assert.ok(projectTrack(p.x,p.z).distance>=TRACK.roadWidth/2+p.radius+24,p.kind);assert.ok(beijingWallClearance(p.x,p.z,p.radius),p.kind);}
 for(let i=0;i<plots.length;i++)for(let j=i+1;j<plots.length;j++){
  const a=plots[i],b=plots[j],bird=[a,b].find(p=>p.kind==='beijing-birds-nest'),other=bird===a?b:a;
  assert.ok(bird?beijingStadiumClearance(bird.stadium,other.x,other.z,other.radius+25):Math.hypot(a.x-b.x,a.z-b.z)>=a.radius+b.radius+25,`${a.kind}/${b.kind}`);
 }
});
test('all 23 models have finite detailed geometry within their declared footprints and compact geometry budget',()=>{
 let triangles=0;const shapes=new Set();
 for(const meta of [...BEIJING_LANDMARKS,...BEIJING_REFINEMENTS]){const mesh=new Probe();addBeijingCityLandmark(mesh,{...meta,x:0,z:0,angle:0,side:1});
  assert.ok(mesh.radius<=meta.radius+.25,`${meta.kind}: radius ${mesh.radius}/${meta.radius}`);assert.ok(mesh.height<=meta.height+8,`${meta.kind}: height ${mesh.height}/${meta.height}`);
  assert.ok(mesh.triangles>500,`${meta.kind}: too little detail`);assert.ok(mesh.colors.size>=4,`${meta.kind}: materials`);assert.ok(mesh.colliders.length>0,`${meta.kind}: no collision`);assert.ok(mesh.colliders.length<(meta.kind==='beijing-birds-nest'?300:150),`${meta.kind}: detail generates too many colliders`);
  shapes.add(`${Math.round(mesh.radius)}:${Math.round(mesh.height)}:${mesh.triangles}`);triangles+=mesh.triangles;
 }assert.equal(shapes.size,23);assert.ok(triangles<145000,`${triangles} landmark triangles`);
});
test('Beijing architecture remains solid while normal, outer lane and chase camera paths are clear',()=>{
 setTrack('coast-beijing');const mesh=new Probe();for(const p of cityLandmarkPlacements())addBeijingCityLandmark(mesh,p);const world=new ObstacleWorld(mesh.colliders);
 for(let s=0;s<TRACK.length;s+=23)for(const lane of [-48,0,48]){const car={...trackPoint(s,lane),height:25,speed:363};assert.equal(world.resolveCar(car),0,`car ${s}/${lane}`);const camera=updateChaseCamera(car,null),probe={x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:car.angle,speed:0};assert.equal(world.resolveCar(probe),0,`camera ${s}/${lane}`);}
 for(const p of cityLandmarkPlacements()){const m=new Probe();addBeijingCityLandmark(m,{...p,x:0,z:0,angle:0,side:1});const solid=m.colliders.find(c=>c.maxHeight>18);assert.ok(solid,p.kind);const probe={x:solid.x,y:solid.y,elevation:Math.max(0,solid.minHeight),height:25,angle:0,speed:0};assert.ok(new ObstacleWorld(m.colliders).resolveCar(probe)>0,`${p.kind} is not ghost scenery`);}
});
test('other maps do not receive Beijing architecture or placement exclusions',()=>{for(const id of ['coast','coast-austin','coast-london','coast-shanghai','coast-rio']){setTrack(id);assert.deepEqual(beijingLandmarkPlacements(),[]);}});
