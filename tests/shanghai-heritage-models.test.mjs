import test from 'node:test';
import assert from 'node:assert/strict';
import { SHANGHAI_HERITAGE_LANDMARKS, addShanghaiHeritage } from '../shanghai-downhill-heritage.js';
import { SHANGHAI_LANDMARKS } from '../shanghai-landmarks.js';
import { ObstacleWorld } from '../collisions.js';
// Inspect generated vertices and real body hulls independently of metadata, so
// a decorative overhang cannot silently intrude into the reserved roadside gap.
class ModelMesh {
 constructor(item){this.item=item;this.min=[Infinity,Infinity,Infinity];this.max=[-Infinity,-Infinity,-Infinity];this.radius=0;this.triangles=0;this.colors=new Set();this.colliders=[];}
 vertex(p,color){assert.ok(p.every(Number.isFinite),`${this.item.kind}: nonfinite vertex`);const dx=p[0]-this.item.x,dz=p[2]-this.item.z,c=Math.cos(this.item.angle),s=Math.sin(this.item.angle),local=[c*dx+s*dz,p[1]-this.item.elevation,-s*dx+c*dz];for(let i=0;i<3;i++){this.min[i]=Math.min(this.min[i],local[i]);this.max[i]=Math.max(this.max[i],local[i]);}this.radius=Math.max(this.radius,Math.hypot(dx,dz));this.colors.add(color);}
 triangle(a,b,c,color){for(const p of [a,b,c])this.vertex(p,color);this.triangles++;}
 quad(a,b,c,d,color){for(const p of [a,b,c,d])this.vertex(p,color);this.triangles+=2;}
 box(x,y,z,w,h,d,color,angle=0){assert.ok([w,h,d].every(n=>n>0&&Number.isFinite(n)),`${this.item.kind}: malformed solid`);for(const a of [-1,1])for(const b of [-1,1])for(const e of [-1,1])this.vertex([x+Math.cos(angle)*a*w/2-Math.sin(angle)*e*d/2,y+b*h/2,z+Math.sin(angle)*a*w/2+Math.cos(angle)*e*d/2],color);this.triangles+=12;if(this.colliders)this.colliders.push({type:'box',x,y:z,halfWidth:w/2,halfDepth:d/2,angle,minHeight:y-h/2,maxHeight:y+h/2});}
 cone(x,y,z,r,h,color,sides=8,top=0,phase=0){assert.ok(r>0&&h>0&&top>=0,`${this.item.kind}: malformed cylinder`);for(let i=0;i<sides;i++)for(const up of [false,true]){const a=i/sides*Math.PI*2+phase,rr=up?top:r;this.vertex([x+Math.cos(a)*rr,y+(up?h:0),z+Math.sin(a)*rr],color);}this.triangles+=sides*(top===0?1:2);if(this.colliders)this.colliders.push({type:'circle',x,y:z,radius:Math.max(r,top),minHeight:y,maxHeight:y+h});}
}


test('35 new Shanghai heritage sites have unique real identities and official architecture references',()=>{
 assert.equal(SHANGHAI_HERITAGE_LANDMARKS.length,35);
 const existing=new Set(SHANGHAI_LANDMARKS.map(x=>x.kind));
 const names=new Set(),ids=new Set();
 for(const meta of SHANGHAI_HERITAGE_LANDMARKS){
  assert.ok(!existing.has(meta.kind));assert.ok(!names.has(meta.label));assert.ok(!ids.has(meta.kind));names.add(meta.label);ids.add(meta.kind);
  assert.match(meta.source,/^https:\/\/(english\.shanghai\.gov\.cn|service\.shanghai\.gov\.cn|english\.jingan\.gov\.cn|www\.meet-in-shanghai\.net)\//);
  assert.ok(meta.zh.length>=3);assert.ok(meta.features.length>30);
 }
});
test('all heritage models have solid bodies, finite geometry and bounded rotated plots',t=>{
 let triangles=0;const signatures=new Set();
 for(const meta of SHANGHAI_HERITAGE_LANDMARKS)for(const angle of [0,.731,2.83]){
  const item={...meta,x:531,z:-731,angle,elevation:9},mesh=new ModelMesh(item),hulls=mesh.colliders;
  assert.equal(addShanghaiHeritage(mesh,item),true);assert.equal(mesh.colliders,hulls);
  assert.ok(hulls.length>0,meta.kind+' missing collision');assert.ok(mesh.triangles>=400,meta.kind+' missing detail '+mesh.triangles);
  assert.ok(mesh.colors.size>=6,meta.kind+' needs contrasting architectural materials');
  assert.ok(mesh.radius<=meta.radius+.01,`${meta.kind}: radius ${mesh.radius}/${meta.radius}`);
  assert.ok(mesh.max[0]-mesh.min[0]<=meta.width+.01,`${meta.kind}: width ${mesh.max[0]-mesh.min[0]}/${meta.width}`);
  assert.ok(mesh.max[2]-mesh.min[2]<=meta.depth+.01,`${meta.kind}: depth ${mesh.max[2]-mesh.min[2]}/${meta.depth}`);
  assert.ok(mesh.min[1]>=-.01&&mesh.max[1]<=meta.height+.01,`${meta.kind}: height ${mesh.min[1]}…${mesh.max[1]}/${meta.height}`);
  const body=hulls.find(h=>h.maxHeight-h.minHeight>15);assert.ok(body,meta.kind+' missing standing mass');
  const world=new ObstacleWorld(hulls);assert.ok(world.resolveCar({x:body.x,y:body.y,elevation:body.minHeight+1,height:25,angle,speed:0})>0,meta.kind+' body is passable');
  if(angle===0){triangles+=mesh.triangles;const signature=JSON.stringify([mesh.triangles,hulls.map(h=>[h.type,h.radius,h.halfWidth,h.halfDepth,h.minHeight,h.maxHeight]),[...mesh.colors].sort()]);assert.ok(!signatures.has(signature),meta.kind+' aliases another model');signatures.add(signature);t.diagnostic(`${meta.kind}: ${mesh.triangles} triangles, ${hulls.length} bodies`);}
 }
 assert.ok(triangles<=100_000,`heritage triangles ${triangles} exceed GPU budget`);t.diagnostic(`Heritage total: ${triangles} triangles`);
});
test('unrecognized heritage identities do not draw substitute generic buildings',()=>{
 const item={kind:'not-a-landmark',x:0,z:0,angle:0,elevation:0},mesh=new ModelMesh(item);
 assert.equal(addShanghaiHeritage(mesh,item),false);assert.equal(mesh.triangles,0);assert.equal(mesh.colliders.length,0);
});
