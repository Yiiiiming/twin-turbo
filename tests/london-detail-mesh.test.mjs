import test from 'node:test';
import assert from 'node:assert/strict';
import { londonDetailMesh } from '../src/london-detail-mesh.js';

test('London surface optimization never removes a solid collision body',()=>{
 const calls=[],hulls=[],mesh={colliders:hulls,box(...args){calls.push(args);this.colliders?.push(args);}};
 const detail=londonDetailMesh(mesh),args=[13,42,-7,22,15,.8,'#c3b08b',.73,.1];
 detail.box(...args);assert.deepEqual(calls,[args]);assert.equal(detail.colliders,hulls);
 detail.colliders=null;assert.equal(mesh.colliders,null);
 detail.box(0,10,0,6,20,6,'#273638');assert.equal(calls.length,2,'thick decorative geometry keeps all faces');
 detail.colliders=hulls;detail.box(...args);assert.equal(hulls.length,2,'solid collection resumes after decoration');
});

test('thin London ornament keeps both visible faces, outward normals and its full rotated bounds',()=>{
 for(const sizes of [[.8,24,10],[24,.8,10],[24,10,.8]])for(const angle of [0,.713,2.81]){
  const faces=[],center=[13,42,-7],mesh={colliders:null,quad(...args){faces.push(args);},box(){assert.fail('thin decoration was not reduced');}};
  londonDetailMesh(mesh).box(...center,...sizes,'#c3b08b',angle,.2);
  assert.equal(faces.length,2);const c=Math.cos(angle),s=Math.sin(angle);
  const local=p=>{const x=p[0]-center[0],z=p[2]-center[2];return [c*x+s*z,p[1]-center[1],-s*x+c*z];};
  const verts=faces.flatMap(face=>face.slice(0,4).map(local));
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1])assert.ok(verts.some(p=>Math.abs(p[axis]-sign*sizes[axis]/2)<1e-9),'ornament bounds preserved');
  for(const face of faces){
   assert.equal(face[4],'#c3b08b');assert.equal(face[5],.2);
   const [a,b,d]=face.slice(0,3).map(local),u=b.map((n,i)=>n-a[i]),v=d.map((n,i)=>n-a[i]);
   const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
   assert.ok(normal.reduce((sum,n,i)=>sum+n*a[i],0)>0,'surface normal faces outside');
  }
 }
});

test('slender mullions and balcony bars remain visible from all four sides',()=>{
 for(const sizes of [[.8,13.5,.8],[16,.6,.7],[.6,.7,16]]){
  const faces=[],mesh={colliders:null,quad(...args){faces.push(args);},box(){assert.fail('slender rod');}};
  londonDetailMesh(mesh).box(0,0,0,...sizes,'#273638');
  assert.equal(faces.length,4);const longAxis=sizes.indexOf(Math.max(...sizes));
  for(let axis=0;axis<3;axis++)if(axis!==longAxis)for(const sign of [-1,1]){
   assert.ok(faces.some(face=>face.slice(0,4).every(p=>Math.abs(p[axis]-sign*sizes[axis]/2)<1e-9)),'each broad rod side must face its viewer');
  }
 }
});
