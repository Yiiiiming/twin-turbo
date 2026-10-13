import test from 'node:test';
import assert from 'node:assert/strict';
import { LONDON_SECOND_LANDMARKS, addLondonSecondLandmark } from '../london-second-landmarks.js';
import { LONDON_NEW_LANDMARKS } from '../london-new-landmarks.js';
import { LONDON_THEATRES } from '../london-theatres.js';
import { WEST_END_LANDMARKS } from '../london-west-end.js';
import { ROYAL_LANDMARKS } from '../london-royal-landmarks.js';
import { RIVERSIDE_LANDMARKS } from '../london-riverside-landmarks.js';
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

test('ten further London landmarks have unique identities and primary references',()=>{
 assert.equal(LONDON_SECOND_LANDMARKS.length,10);assert.equal(new Set(LONDON_SECOND_LANDMARKS.map(x=>x.kind)).size,10);
 const existing=new Set([...LONDON_NEW_LANDMARKS,...LONDON_THEATRES,...WEST_END_LANDMARKS,...ROYAL_LANDMARKS,...RIVERSIDE_LANDMARKS].map(x=>x.kind));
 for(const item of LONDON_SECOND_LANDMARKS){assert.ok(!existing.has(item.kind),`${item.kind}: duplicate landmark`);assert.match(item.source,/^https:\/\/(www\.)?(historicengland.org.uk|libertylondon.com|rct.uk|vam.ac.uk|westminstercathedral.org.uk|cityoflondon.gov.uk|somersethouse.org.uk|networkrail.co.uk)\//);}
});

test('all ten detailed solid models fit their plots at every rotation and stay within the GPU allowance',t=>{
 let triangles=0;
 for(const meta of LONDON_SECOND_LANDMARKS)for(const angle of [0,.731,2.83]){
  const item={...meta,x:531,z:-731,angle,elevation:9},mesh=new ModelMesh(item),hulls=mesh.colliders;addLondonSecondLandmark(mesh,item);
  assert.equal(mesh.colliders,hulls,`${meta.kind}: ornament changed hull collector`);assert.ok(hulls.length>=3,`${meta.kind}: missing solid mass`);assert.ok(mesh.triangles>=600,`${meta.kind}: insufficient details ${mesh.triangles}`);assert.ok(mesh.colors.size>=6,`${meta.kind}: missing material variation`);
  assert.ok(mesh.radius<=meta.radius+.01,`${meta.kind}: radius ${mesh.radius}/${meta.radius}`);assert.ok(mesh.max[0]-mesh.min[0]<=meta.width+.01,`${meta.kind}: width ${mesh.max[0]-mesh.min[0]}/${meta.width}`);assert.ok(mesh.max[2]-mesh.min[2]<=meta.depth+.01,`${meta.kind}: depth ${mesh.max[2]-mesh.min[2]}/${meta.depth}`);assert.ok(mesh.min[1]>=-.01&&mesh.max[1]<=meta.height+.01,`${meta.kind}: height ${mesh.min[1]}…${mesh.max[1]}/${meta.height}`);
  // Architectural trim remains warm; the palette avoids pure white masses.
  assert.ok(!mesh.colors.has('#ffffff')&&!mesh.colors.has('#fff'));
  const world=new ObstacleWorld(hulls);assert.ok(world.resolveCar({x:item.x,y:item.z,elevation:9,height:25,angle,speed:0})>0,`${meta.kind}: whole building is drive-through`);
  if(angle===0){triangles+=mesh.triangles;t.diagnostic(`${meta.kind}: ${mesh.triangles} triangles, ${hulls.length} solid hulls`);}
 }
 assert.ok(triangles<=20_000,`${triangles} triangles exceed the ten-model budget`);t.diagnostic(`Ten-model total: ${triangles} triangles`);
});
