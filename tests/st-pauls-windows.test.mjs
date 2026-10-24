import test from 'node:test';
import assert from 'node:assert/strict';
import { addRiversideLandmark } from '../src/london-riverside-landmarks.js';
class Faces {
 constructor(){this.faces=[];this.boxes=[];this.colliders=[];}
 triangle(a,b,c,color){this.faces.push({points:[a,b,c],color});}
 quad(a,b,c,d,color){this.faces.push({points:[a,b,c,d],color});}
 box(x,y,z,w,h,d,color,angle=0){this.boxes.push({x,y,z,w,h,d,color,angle});}
 cone(){}
}
// Depth separation is measured in the model's local frame, including rotated
// placements. This catches the old nearly-coplanar backing-box face at -83.45.
test('both St Paul bell openings use one clear infill plane with separated louvres',()=>{
 for(const angle of [0,.713,2.8]){
  const mesh=new Faces(),origin={x:1840,z:710,angle,elevation:17};addRiversideLandmark(mesh,{...origin,kind:'st-pauls-cathedral'});
  const local=p=>{const x=p[0]-origin.x,z=p[2]-origin.z;return [Math.cos(angle)*x+Math.sin(angle)*z,p[1]-17,-Math.sin(angle)*x+Math.cos(angle)*z];};
  const openings=mesh.faces.filter(f=>f.color==='#3b4846');assert.equal(openings.length,50,'two rectangle-and-24-facet arched infills');
  for(const side of [-1,1]){
   const faces=openings.filter(f=>local(f.points[0])[0]*side>60);assert.equal(faces.length,25);
   for(const face of faces)for(const point of face.points){const p=local(point);assert.ok(Math.abs(p[2]+86)<1e-8);assert.ok(p[1]>=149&&p[1]<=176.000001);assert.ok(p[2]<-83.5-2,'opening must clear the solid tower face');}
  }
  assert.equal(mesh.boxes.filter(b=>b.color==='#3b4846').length,0,'no hidden glass back or side faces to fight the wall');
  const slats=mesh.boxes.filter(b=>b.color==='#716f5b'&&b.w===12&&b.h===1.5);assert.equal(slats.length,10);
  for(const slat of slats){const p=local([slat.x,slat.y,slat.z]);assert.ok(Math.abs(p[2]+88)<1e-8);assert.ok(p[2]+slat.d/2<=-87+1e-8,'slat rear clears the dark infill');}
 }
});
