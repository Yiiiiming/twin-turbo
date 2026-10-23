import test from 'node:test';
import assert from 'node:assert/strict';
import { RIO_LANDMARKS,addRioLandmark } from '../rio-landmarks.js';
import { RIO_HERITAGE_LANDMARKS } from '../rio-heritage.js';
import { RIO_CIVIC_LANDMARKS } from '../rio-civic.js';
import { RIO_CULTURE_LANDMARKS } from '../rio-culture.js';
import { ObstacleWorld } from '../collisions.js';
import { ParisMesh as ModelMesh } from './helpers/paris-mesh.mjs';
const make=(meta,angle=0,elevation=0)=>{const item={...meta,x:0,z:0,angle,elevation},mesh=new ModelMesh(item);assert.equal(addRioLandmark(mesh,item),true);return mesh;};

test('Rio adds thirty immutable distinct identities without replacing its three accepted icons',()=>{
 assert.equal(RIO_LANDMARKS.length,30);assert.equal(new Set(RIO_LANDMARKS.map(m=>m.kind)).size,30);assert.ok(Object.isFrozen(RIO_LANDMARKS));
 for(const group of [RIO_HERITAGE_LANDMARKS,RIO_CIVIC_LANDMARKS,RIO_CULTURE_LANDMARKS])assert.equal(group.length,10);
 for(const m of RIO_LANDMARKS){assert.ok(Object.isFrozen(m)&&Object.isFrozen(m.features));assert.ok(m.label&&m.nameZh&&m.features.length>=3);assert.equal(m.radius,Math.hypot(m.width,m.depth)/2+8);assert.ok(!['christ-redeemer','sugarloaf','lapa-aqueduct'].includes(m.kind));}
 assert.equal(addRioLandmark({}, {kind:'unlisted'}),false);
});
test('ten heritage models have detailed real solids inside their complete rotated envelopes',t=>{
 let total=0;
 for(const meta of RIO_HERITAGE_LANDMARKS)for(const angle of [0,.713,2.83]){
  const p=make(meta,angle,11);assert.ok(p.faces.length>=500,meta.kind+' missing structural detail');assert.ok(p.faces.length<=3500,meta.kind+' exceeds its triangle budget');assert.ok(p.colors.size>=5,meta.kind+' needs layered materials');assert.ok(!p.colors.has('#ffffff'));
  for(const [axis,key]of [[0,'width'],[2,'depth']])assert.ok(p.min[axis]>=-meta[key]/2-.01&&p.max[axis]<=meta[key]/2+.01,`${meta.kind} ${key}: ${p.min[axis]}..${p.max[axis]}`);
  assert.ok(p.min[1]>=-.01&&p.max[1]<=meta.height+.01,`${meta.kind} height: ${p.min[1]}..${p.max[1]}`);assert.ok(p.max[1]>.9*meta.height);assert.ok(p.radius<=meta.radius+.01);
  const hull=p.colliders.find(h=>h.maxHeight-h.minHeight>20);assert.ok(hull,meta.kind+' has no solid body');assert.ok(new ObstacleWorld(p.colliders).resolveCar({x:hull.x,y:hull.y,elevation:hull.minHeight+2,height:25,angle,speed:0})>0,meta.kind+' is passable');
  if(angle===0){total+=p.faces.length;t.diagnostic(`${meta.kind}: ${p.faces.length} triangles`);}
 }
 assert.ok(total<=20000,`${total} heritage triangles exceed the scene allowance`);t.diagnostic(`Heritage total: ${total} triangles / ${(total*132/1e6).toFixed(3)} MB`);
});
test('cathedral, hill church, fortress and pavilion retain their identifying three-dimensional structures',()=>{
 const byKind=kind=>make(RIO_HERITAGE_LANDMARKS.find(m=>m.kind===kind));
 const cathedral=byKind('rio-metropolitan-cathedral');assert.ok(cathedral.colliders.some(h=>h.type==='circle'&&h.radius===82&&h.maxHeight-h.minHeight===181));
 for(const color of ['#3e7590','#ad7a4e','#608968','#8f5d76'])assert.equal(cathedral.faces.filter(f=>f.color===color).length,36,'each of four distinct stained-glass ribbons follows the tapered wall');
 assert.ok(cathedral.faces.some(f=>f.points.every(p=>p[1]>180)&&f.points.some(p=>p[0]<0)),'truncated cone has a real high roof');
 const penha=byKind('rio-penha-church'),steps=penha.colliders.filter(h=>h.type==='box'&&h.halfWidth===12&&h.halfDepth===1.65).sort((a,b)=>a.y-b.y);
 assert.equal(steps.length,24);for(let i=1;i<steps.length;i++){assert.ok(steps[i].maxHeight>steps[i-1].maxHeight);assert.ok(steps[i].y>steps[i-1].y);}assert.ok(steps.at(-1).maxHeight>=125,'steps physically reach the hilltop');
 assert.equal(penha.colliders.filter(h=>h.type==='box'&&h.halfWidth===10&&h.maxHeight-h.minHeight===96).length,2,'two slender church towers above the rock');
 const fort=byKind('rio-copacabana-fort'),barrels=fort.colliders.filter(h=>h.type==='box'&&h.halfWidth===3&&h.halfDepth===39);
 assert.equal(barrels.length,4,'both paired armored turrets have two real barrels');for(const h of barrels)assert.ok(new ObstacleWorld(fort.colliders).resolveCar({x:h.x,y:h.y-27,elevation:48,height:6,angle:0,speed:0})>0,'protruding barrel cannot be driven through');
 const pavilion=byKind('rio-vista-chinesa'),world=new ObstacleWorld(pavilion.colliders);
 assert.equal(pavilion.colliders.filter(h=>h.type==='circle'&&h.radius===3.5).length,6,'six separate roof columns');
 assert.equal(world.resolveCar({x:0,y:0,elevation:25,height:25,angle:0,speed:0}),0,'pavilion centre stays genuinely open');
 assert.equal(new ObstacleWorld(pavilion.colliders,{carRadius:6}).resolveCar({x:0,y:-37,elevation:20,height:25,angle:Math.PI/2,speed:0}),0,'pedestrian stair reaches the gap between two columns instead of a centre post');
 assert.ok(world.resolveCar({x:0,y:0,elevation:75,height:8,angle:0,speed:0})>0,'overhead roof remains solid');
 const museum=byKind('rio-national-history-museum');assert.equal(new ObstacleWorld(museum.colliders).resolveCar({x:0,y:10,elevation:20,height:25,angle:0,speed:0}),0,'colonial wings retain their open cannon courtyard');
 // Front portals must be outside the projecting central solids, not painted
 // onto a recessed facade hidden by a tower or octagonal entrance volume.
 const gloria=byKind('rio-gloria-church');assert.ok(gloria.faces.filter(f=>f.color==='#976c43'&&f.points.every(p=>p[2]<-55.5)).length>=12,'Glória bronze portal is visible ahead of its octagonal volume');
 assert.ok(museum.faces.filter(f=>f.color==='#334d45'&&f.points.every(p=>Math.abs(p[0])<=7&&p[1]<35&&p[2]<-67)).length>=12,'museum central arch sits in front of the projecting pavilion');
});
