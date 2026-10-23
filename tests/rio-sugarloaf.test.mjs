import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTrack } from '../engine.js';
import { cityLandmarkPlacements,addCityLandmark } from '../city-scenery.js';
import { ParisMesh } from './helpers/paris-mesh.mjs';

class SugarloafMesh extends ParisMesh {
 constructor(item){super(item);this.solids=[];this.solidDepth=0;this.unattached=[];}
 box(...args){this.solids.push({kind:'box',args});this.solidDepth++;try{super.box(...args);}finally{this.solidDepth--;}}
 cone(...args){this.solids.push({kind:'cone',args});this.solidDepth++;try{super.cone(...args);}finally{this.solidDepth--;}}
 triangle(...args){if(!this.solidDepth)this.unattached.push(args);super.triangle(...args);}
}
const draw=item=>{const mesh=new SugarloafMesh(item);addCityLandmark(mesh,item);return mesh;};
test.afterEach(()=>setTrack('coast'));

test('Sugarloaf keeps the accepted rounded mountain and summit station with no disconnected cable or buried cabin',()=>{
 const mesh=draw({kind:'sugarloaf',x:0,z:0,angle:0}),cones=mesh.solids.filter(p=>p.kind==='cone'),boxes=mesh.solids.filter(p=>p.kind==='box');
 assert.deepEqual(cones.map(({args:[x,y,z,r,h,color,sides,top,phase]})=>[x,y,z,r,h,color,sides,top,phase]),[
  [0,0,0,232,49,'#788776',64,212,.12],[0,49,0,212,61,'#788776',64,180,.12],
  [0,110,0,180,77,'#a9ac98',64,145,.12],[0,187,0,145,63,'#a9ac98',64,103,.12],
  [0,250,0,103,43,'#a9ac98',64,59,.12],[0,293,0,59,17,'#a9ac98',64,.2,.12],
 ],'removing the malformed cable must not change the mountain itself');
 assert.deepEqual(boxes.map(p=>p.args.slice(0,7)),[[0,317,0,28,13,23,'#d5c9ab'],[0,326,0,34,5,28,'#5d7477']],'summit station remains; the cabin buried inside granite is removed');
 assert.equal(mesh.unattached.length,0,'no unattached beam triangles may emerge from the rock');
 assert.equal(mesh.faces.length,792,'only the complete mountain and station are painted');
 assert.equal(boxes[0].args[1]+boxes[0].args[4]/2,boxes[1].args[1]-boxes[1].args[4]/2,'station canopy meets its body');
});
test('Sugarloaf correction preserves its reserved world plot, complete footprint and collision mountain',()=>{
 setTrack('coast-rio');const placement=cityLandmarkPlacements().find(p=>p.kind==='sugarloaf');
 assert.equal(createHash('sha256').update(JSON.stringify(placement)).digest('hex'),'560231ab74074f3df70090d3f160d0e7de075285d434f02b548630dc3a99689e');
 for(const angle of [placement.angle,placement.angle+Math.PI/2,placement.angle+Math.PI]){
  const mesh=draw({...placement,angle});assert.ok(mesh.radius<=placement.radius);assert.equal(mesh.max[1],328.5);assert.equal(mesh.min[1],0);
  assert.equal(mesh.colliders.length,8,'all six mountain bands and the station remain solid');
  assert.equal(mesh.colliders.filter(h=>h.type==='circle').length,6);
  assert.equal(mesh.unattached.length,0,'rotation cannot expose a hidden cable fragment');
  for(const face of mesh.faces)assert.ok(face.points.flat().every(Number.isFinite));
 }
});
