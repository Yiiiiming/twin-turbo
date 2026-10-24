import test from 'node:test';
import assert from 'node:assert/strict';
import { PARIS_LANDMARKS,addParisLandmark } from '../src/paris-landmarks.js';
import { PARIS_MONUMENTS,parisKit } from '../src/paris-monuments.js';
import { PARIS_PALACES } from '../src/paris-palaces.js';
import { ObstacleWorld } from '../src/collisions.js';
import { ParisMesh } from './helpers/paris-mesh.mjs';
const make=(meta,angle=0)=>{const item={...meta,x:321,z:-789,angle,elevation:11},mesh=new ParisMesh(item);assert.equal(addParisLandmark(mesh,item),true);return mesh;};
test('thirty distinct Paris additions keep complete immutable identities separate from the accepted three',()=>{
 assert.equal(PARIS_LANDMARKS.length,30);assert.equal(new Set(PARIS_LANDMARKS.map(m=>m.kind)).size,30);assert.ok(Object.isFrozen(PARIS_LANDMARKS));
 for(const m of PARIS_LANDMARKS){assert.ok(Object.isFrozen(m)&&Object.isFrozen(m.features));assert.ok(m.features.length>=3&&m.label&&m.nameZh);assert.equal(m.radius,Math.hypot(m.width,m.depth)/2+8);assert.ok(!['eiffel-tower','arc-de-triomphe','louvre-pyramid'].includes(m.kind));}
 assert.equal(PARIS_MONUMENTS.length,10);assert.equal(PARIS_PALACES.length,10);assert.equal(addParisLandmark({}, {kind:'unlisted'}),false);
});
test('twenty traditional monuments use bounded real solids and layered material detail at arbitrary rotations',t=>{
 let triangles=0;
 for(const meta of [...PARIS_MONUMENTS,...PARIS_PALACES])for(const angle of [0,.713,2.83]){
  const p=make(meta,angle);assert.ok(p.faces.length>=450,meta.kind+' missing detail');assert.ok(p.faces.length<=3500,meta.kind+' excessive detail');assert.ok(p.colors.size>=5,meta.kind+' missing material layers');assert.ok(!p.colors.has('#ffffff'));
  for(const [axis,key]of [[0,'width'],[2,'depth']])assert.ok(p.min[axis]>=-meta[key]/2-.01&&p.max[axis]<=meta[key]/2+.01,`${meta.kind} ${key}: ${p.min[axis]}..${p.max[axis]}`);
  assert.ok(p.min[1]>=-.01&&p.max[1]<=meta.height+.01,`${meta.kind} height: ${p.min[1]}..${p.max[1]}`);assert.ok(p.max[1]>.9*meta.height);assert.ok(p.radius<=meta.radius+.01);
  const hull=p.colliders.find(h=>h.maxHeight-h.minHeight>20);assert.ok(hull,meta.kind+' lacks a body');assert.ok(new ObstacleWorld(p.colliders).resolveCar({x:hull.x,y:hull.y,elevation:hull.minHeight+2,height:25,angle,speed:0})>0,meta.kind+' body is passable');
  if(angle===0){triangles+=p.faces.length;t.diagnostic(`${meta.kind}: ${p.faces.length} triangles; ${p.colliders.length} solids`);}
 }
 assert.ok(triangles<=40000,`${triangles} traditional triangles exceed budget`);t.diagnostic(`Traditional total ${triangles} triangles / ${(triangles*132/1e6).toFixed(3)} MB`);
});
test('Notre-Dame towers, the gilded dome, Orsay clock and open Royal court remain architectural geometry',()=>{
 const models=new Map(PARIS_LANDMARKS.map(m=>[m.kind,make(m)]));
 const cathedral=models.get('notre-dame'),towers=cathedral.colliders.filter(h=>h.type==='box'&&h.maxHeight-h.minHeight>130);
 assert.equal(towers.length,2);assert.ok(towers[0].x<cathedral.item.x&&towers[1].x>cathedral.item.x,'two distinct front towers');
 const gold=models.get('invalides').faces.filter(f=>f.color==='#b39352'&&f.points.some(p=>p[1]>138));assert.ok(gold.length>350,'the golden dome is a curved mesh, not a flat colour panel');
 const clock=models.get('musee-orsay').faces.filter(f=>f.color==='#2d363e'&&f.points.every(p=>p[2]<-840));assert.ok(clock.length>=24,'the station clock has a real circular face');
 const royal=models.get('palais-royal'),court=royal.colliders.filter(h=>h.maxHeight-h.minHeight>20);
 assert.ok(!court.some(h=>h.type==='box'&&Math.abs(h.x-royal.item.x)<h.halfWidth&&Math.abs(h.y-(royal.item.z-10))<h.halfDepth),'the palace wings leave an actual open court');
 const arches=models.get('sainte-chapelle').faces.filter(f=>['#4b547c','#536e80'].includes(f.color));assert.ok(arches.length>=100,'tall stained-glass panels are separated from the stone buttresses');
});
test('Paris roof slopes and dome panels have outward normals instead of inverted dark undersides',()=>{
 const item={kind:'roof-probe',x:0,z:0,angle:0,elevation:0},p=new ParisMesh(item),k=parisKit(p,item);
 k.roof(0,0,0,100,80,35);k.mansard(200,0,0,100,80,35);k.dome(400,0,0,45,60);
 let slopes=0;for(const f of p.faces){const [a,b,c]=f.points,u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];assert.ok(normal[1]>=-1e-7,'roof panel faces inward');if(normal[1]>1e-7)slopes++;}
 assert.ok(slopes>350);
});
