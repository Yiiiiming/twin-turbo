import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TRACK,setTrack,trackPoint,projectTrack } from '../src/engine.js';
import { cityLandmarkPlacements,citySceneryPlacements } from '../src/city-scenery.js';
import { PARIS_LANDMARKS,addParisLandmark } from '../src/paris-landmarks.js';
import { parisLandmarkPlacements } from '../src/paris-layout.js';
import { RaceRenderer,updateChaseCamera } from '../src/renderer.js';
import { ObstacleWorld } from '../src/collisions.js';
import { ParisMesh,parisFakeGL } from './helpers/paris-mesh.mjs';
const kinds=new Set(PARIS_LANDMARKS.map(p=>p.kind)),oldPlots=()=>cityLandmarkPlacements().filter(p=>!kinds.has(p.kind)),newPlots=()=>cityLandmarkPlacements().filter(p=>kinds.has(p.kind));
const probe=item=>{const mesh=new ParisMesh(item);addParisLandmark(mesh,item);return mesh;};
test.afterEach(()=>setTrack('coast'));

test('Paris adds thirty unique plots while retaining all seven accepted objects at their exact positions',t=>{
 setTrack('coast-paris');const before=oldPlots();assert.equal(createHash('sha256').update(JSON.stringify(before)).digest('hex'),'866de0d2f2d5c50989d4d75baeb38ef86dc1253003632d4f4cb23f3afb877c55');
 assert.equal(before.length,7);assert.equal(newPlots().length,30);assert.equal(cityLandmarkPlacements().length,37);assert.equal(new Set(newPlots().map(p=>p.kind)).size,30);
 const start=performance.now(),plots=parisLandmarkPlacements(before);assert.deepEqual(new Set(plots.map(p=>p.kind)),kinds);assert.equal(parisLandmarkPlacements(before),plots,'repeated placement does not search again');t.diagnostic(`Cached Paris placement ${(performance.now()-start).toFixed(2)} ms`);
 assert.throws(()=>parisLandmarkPlacements(before,[{kind:'unknown'}]),/No curated Paris plot/);
 assert.throws(()=>parisLandmarkPlacements([{kind:'occupied',x:0,z:0,radius:1e6,s:0,angle:0}],PARIS_LANDMARKS),/Paris plot or frontage/);
 setTrack('coast-london');assert.deepEqual(parisLandmarkPlacements(before),[]);
});
test('the complete lap alternates new landmarks with no long empty district and preserves ordinary Paris streets',()=>{
 setTrack('coast-paris');const plots=newPlots(),bins=Array(12).fill(0),street=citySceneryPlacements();for(const p of plots)bins[Math.floor(p.s/TRACK.length*12)]++;
 for(const count of bins)assert.ok(count>=2&&count<=3,`uneven district counts: ${bins}`);
 for(const side of [-1,1])assert.ok(plots.filter(p=>p.side===side).length>=13);
 const named=cityLandmarkPlacements().filter(p=>p.kind!=='paris-bridge-pylon').sort((a,b)=>a.s-b.s);
 for(let i=0;i<named.length;i++){const gap=(named[(i+1)%named.length].s-named[i].s+TRACK.length)%TRACK.length;assert.ok(gap<=925,`${named[i].kind}: ${gap} unit empty interval`);}
 assert.ok(street.length>90,`ordinary streets lost: ${street.length}`);
 for(let q=0;q<4;q++)assert.ok(street.filter(p=>Math.floor(projectTrack(p.x,p.z).s/TRACK.length*4)===q).length>=20,`quarter ${q+1} has too few ordinary streets`);
});
test('all reserved footprints face the road, avoid both banks and leave each facade visible from the driving line',()=>{
 setTrack('coast-paris');const all=cityLandmarkPlacements(),plots=newPlots(),street=citySceneryPlacements();
 for(const p of plots){assert.equal(p.elevation,0);assert.ok(projectTrack(p.x,p.z).distance>=TRACK.roadWidth/2+p.radius+30);assert.ok(Math.abs(p.z-TRACK.river.centerZ)>=TRACK.river.halfWidth+p.radius+30);const r=trackPoint(p.s),dx=r.x-p.x,dz=r.y-p.z;assert.ok((Math.sin(p.angle)*dx-Math.cos(p.angle)*dz)/Math.hypot(dx,dz)>.999999);
  for(const o of all)if(o!==p)assert.ok(Math.hypot(p.x-o.x,p.z-o.z)>=p.radius+o.radius+30,`${p.kind}/${o.kind} footprints overlap`);
 }
 for(const p of all.filter(p=>p.kind!=='paris-bridge-pylon')){
  const r=trackPoint(p.s),a=p.angle??r.angle;
  for(const wing of [-.42,0,.42]){
   const endpoint=[p.x+Math.sin(a)*(p.depth||0)/2+Math.cos(a)*(p.width||0)*wing,p.z-Math.cos(a)*(p.depth||0)/2+Math.sin(a)*(p.width||0)*wing],vx=endpoint[0]-r.x,vz=endpoint[1]-r.y,len=Math.hypot(vx,vz),ux=vx/len,uz=vz/len;
   for(const o of [...plots,...street])if(o!==p){const dx=o.x-r.x,dz=o.z-r.y,t=Math.max(0,Math.min(len,dx*ux+dz*uz));assert.ok(Math.hypot(dx-ux*t,dz-uz*t)>=o.radius+7,`${o.kind} blocks ${p.kind} wing ${wing}`);}
  }
 }
});
test('every new Paris body and the chase camera are clear throughout the frozen lap',()=>{
 setTrack('coast-paris');const world=new ObstacleWorld(newPlots().flatMap(p=>probe(p).colliders));
 for(let s=0;s<TRACK.length;s+=17)for(const lane of [-48,0,48]){const p=trackPoint(s,lane);assert.equal(world.resolveCar({...p,height:25,speed:0}),0,`car collision ${s}/${lane}`);for(const speed of [0,363,517]){const camera=updateChaseCamera({...p,speed,boosting:speed===517},null);assert.equal(world.resolveCar({x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:p.angle,speed:0}),0,`camera collision ${s}/${lane}/${speed}`);}}
});
test('all thirty models and their body hulls reach the real Paris GPU scene under 40 MB',t=>{
 setTrack('coast-paris');const gl=parisFakeGL(),renderer=new RaceRenderer({width:1200,height:700,getContext:()=>gl,addEventListener(){}});assert.equal(renderer.available,true,renderer.error);
 let bytes=0;for(const data of gl.buffers.values()){bytes+=data.byteLength;for(const n of data)assert.ok(Number.isFinite(n));}assert.ok(bytes<40_000_000,`${bytes/1e6} MB exceeds the unchanged limit`);
 // Hand-built curved hulls receive scene-order IDs. Their geometry and height
 // band must match exactly; the preceding world's collider count need not.
 const peaks=new Map(),key=p=>p.map(Math.fround).join(',');for(const p of newPlots()){const model=probe(p);peaks.set(key(model.top),p.kind);for(const hull of model.colliders)assert.ok(renderer.obstacles.some(actual=>Object.entries(hull).filter(([k])=>k!=='id').every(([k,v])=>typeof v==='number'?Math.abs(actual[k]-v)<1e-7:actual[k]===v)),`${p.kind}: body missing from production`);}
 const uploaded=gl.buffers.get(renderer.meshes.props.buffer);for(let i=0;i<uploaded.length&&peaks.size;i+=11)peaks.delete([uploaded[i],uploaded[i+1],uploaded[i+2]].join(','));assert.deepEqual([...peaks.values()],[],'new geometry missing from production');
 t.diagnostic(`Paris GPU ${(bytes/1e6).toFixed(3)} MB; ${citySceneryPlacements().length} ordinary street items`);
});
