import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TRACK,setTrack,trackPoint,projectTrack,RaceEngine } from '../engine.js';
import { RaceAI } from '../ai.js';
import { cityLandmarkPlacements,citySceneryPlacements,addCityLandmark } from '../city-scenery.js';
import { RIO_LANDMARKS,addRioLandmark } from '../rio-landmarks.js';
import { rioLandmarkPlacements,rioBlocksFrontage,rioShoreBoundary } from '../rio-layout.js';
import { RaceRenderer,updateChaseCamera,sceneObstacles,sceneEntryBoundary,roadsideLamps,sampleRoadRibbon } from '../renderer.js';
import { createEntryCameraPlan,entryCameraForProgress,entrySegmentBlocked,entryMeshOcclusion } from '../entry-cameras.js';
import { ObstacleWorld } from '../collisions.js';
import { ParisMesh as ModelMesh,parisFakeGL as fakeGL } from './helpers/paris-mesh.mjs';
const kinds=new Set(RIO_LANDMARKS.map(p=>p.kind)),oldPlots=()=>cityLandmarkPlacements().filter(p=>!kinds.has(p.kind)),newPlots=()=>cityLandmarkPlacements().filter(p=>kinds.has(p.kind));
const probe=item=>{const mesh=new ModelMesh(item);addRioLandmark(mesh,item);return mesh;};
test.afterEach(()=>setTrack('coast'));

test('Rio adds thirty curated plots without moving or replacing Christ, Sugarloaf or Lapa',t=>{
 setTrack('coast-rio');const old=oldPlots();assert.equal(old.length,3);assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'),'985edca92bc1f3cca9bd811dbfc455428a6cc3f672e632b38b57d3db816a201d');
 // Captured before adding Rio's new modules. Deliberate baselines: no update flag.
 const hashes={'christ-redeemer':'d56ceaea25750e60e672d14bf14d2e0c3f62c91e735e208a9700d654b40df4d3',sugarloaf:'51672bd9d4d0d4fabf71a3072d9cf7eb54a2ce2be763b673577cc9817b6fab93','lapa-aqueduct':'0bba0d981a394fc642b4b91a75b87c17ae370778f77c5a68f955d85ce67d4c48'};
 for(const [kind,hash]of Object.entries(hashes)){const item={kind,x:0,z:0,angle:0},mesh=new ModelMesh(item);addCityLandmark(mesh,item);assert.equal(createHash('sha256').update(JSON.stringify(mesh.faces)).digest('hex'),hash,kind+' accepted model changed');}
 assert.equal(cityLandmarkPlacements().length,33);assert.equal(newPlots().length,30);assert.equal(new Set(newPlots().map(p=>p.kind)).size,30);
 // Force a genuinely cold fixed placement by a harmless external metadata key.
 const before=performance.now(),result=rioLandmarkPlacements(old.map(p=>({...p,width:0,depth:0})));assert.ok(performance.now()-before<100,'fixed plots must not search or stall map selection');assert.equal(rioLandmarkPlacements(old.map(p=>({...p,width:0,depth:0}))),result);t.diagnostic(`Fixed Rio layout ${(performance.now()-before).toFixed(2)} ms`);
 assert.throws(()=>rioLandmarkPlacements(old,[{kind:'unknown'}]),/No curated Rio plot/);assert.throws(()=>rioLandmarkPlacements([{kind:'occupied',x:0,z:0,radius:1e6,s:0,angle:0}]),/Rio plot, shore or frontage/);
 setTrack('coast-paris');assert.deepEqual(rioLandmarkPlacements(),[]);
});
test('the entire Rio lap gets mixed architecture, ordinary streets and no long empty stretch',()=>{
 setTrack('coast-rio');const plots=newPlots(),bins=Array(12).fill(0),street=citySceneryPlacements();for(const p of plots)bins[Math.floor(p.s/TRACK.length*12)]++;
 for(const count of bins)assert.ok(count>=2&&count<=3,`district counts ${bins}`);
 for(const side of [-1,1])assert.ok(plots.filter(p=>p.side===side).length>=12);
 for(let q=0;q<4;q++){const segment=plots.filter(p=>Math.floor(p.s/TRACK.length*4)===q);assert.equal(new Set(segment.map(p=>p.family)).size,3,'architecture groups must be mixed, not segregated by module');assert.ok(street.filter(p=>Math.floor(projectTrack(p.x,p.z).s/TRACK.length*4)===q).length>=10,'ordinary street life remains in every quarter');}
 const named=cityLandmarkPlacements().slice().sort((a,b)=>a.s-b.s);for(let i=0;i<named.length;i++){const gap=(named[(i+1)%named.length].s-named[i].s+TRACK.length)%TRACK.length;assert.ok(gap<=750,`${named[i].kind}: ${gap} empty road units`);}
 assert.ok(street.length>90,`ordinary Rio scenery lost: ${street.length}`);
});
test('every full footprint is inland, separate from old mountains, and visibly faces the road',()=>{
 setTrack('coast-rio');const plots=newPlots(),all=cityLandmarkPlacements(),street=citySceneryPlacements(),shore=Math.max(...sampleRoadRibbon(50).map(p=>p.center.y))+TRACK.roadWidth/2+90;assert.equal(rioShoreBoundary(),shore);
 for(const p of plots){assert.equal(p.elevation,0);assert.ok(projectTrack(p.x,p.z).distance>=TRACK.roadWidth/2+p.radius+30);assert.ok(p.z+p.radius<=shore-22,p.kind+' footprint reaches the sea');const r=trackPoint(p.s),dx=r.x-p.x,dz=r.y-p.z;assert.ok((Math.sin(p.angle)*dx-Math.cos(p.angle)*dz)/Math.hypot(dx,dz)>.999999,p.kind+' faces away from road');
  for(const o of all)if(o!==p)assert.ok(Math.hypot(p.x-o.x,p.z-o.z)>=p.radius+o.radius+30,`${p.kind}/${o.kind} overlap`);
  const mesh=probe(p);for(const face of mesh.faces)for(const v of face.points)assert.ok(v[2]<shore-22,p.kind+' real protrusion over water');
 }
 for(const p of all)for(const o of [...plots,...street])if(o!==p)assert.equal(rioBlocksFrontage(o,p),false,`${o.kind} obscures ${p.kind} frontage`);
});
test('real new Rio hulls keep both racing lanes, all high-speed chase paths and their sight lines clear',()=>{
 setTrack('coast-rio');const hulls=newPlots().flatMap(p=>probe(p).colliders),world=new ObstacleWorld(hulls),actual=new ObstacleWorld(sceneObstacles());
 for(let s=0;s<TRACK.length;s+=17)for(const lane of [-48,0,48]){const p=trackPoint(s,lane);assert.equal(actual.resolveCar({...p,height:25,speed:0}),0,`production car collision ${s}/${lane}`);for(const speed of [0,363,517]){const camera=updateChaseCamera({...p,speed,boosting:speed===517},null);assert.equal(world.resolveCar({x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:p.angle,speed:0}),0,`new building blocks camera ${s}/${lane}/${speed}`);assert.equal(entrySegmentBlocked(camera.eye,camera.target,hulls,3),false,`new building conceals car ${s}/${lane}/${speed}`);}}
});
test('thirty new model peaks and all their hulls reach the production GPU scene below the Rio 35 MB target',t=>{
 setTrack('coast-rio');const gl=fakeGL(),renderer=new RaceRenderer({width:1200,height:700,getContext:()=>gl,addEventListener(){}});assert.equal(renderer.available,true,renderer.error);
 let bytes=0;for(const data of gl.buffers.values()){bytes+=data.byteLength;for(const n of data)assert.ok(Number.isFinite(n));}assert.ok(bytes<35_000_000,`${bytes/1e6} MB exceeds Rio scene target (global hard limit remains 40 MB)`);
 const peaks=new Map(),key=p=>p.map(Math.fround).join(',');for(const p of newPlots()){const model=probe(p);peaks.set(key(model.top),p.kind);for(const hull of model.colliders)assert.ok(renderer.obstacles.some(actual=>Object.entries(hull).filter(([k])=>k!=='id').every(([k,v])=>typeof v==='number'?Math.abs(actual[k]-v)<1e-7:actual[k]===v)),`${p.kind}: body missing from production`);}
 const uploaded=gl.buffers.get(renderer.meshes.props.buffer);for(let i=0;i<uploaded.length&&peaks.size;i+=11)peaks.delete([uploaded[i],uploaded[i+1],uploaded[i+2]].join(','));assert.deepEqual([...peaks.values()],[],'new geometry missing from production');t.diagnostic(`Rio GPU ${(bytes/1e6).toFixed(3)} MB; ${citySceneryPlacements().length} ordinary items`);
});
test('the three real entry shots retain Christ and Sugarloaf with unobstructed camera paths',()=>{
 setTrack('coast-rio');const engine=new RaceEngine(),car=engine.cars[0],before=structuredClone(engine),landmarks=cityLandmarkPlacements(),obstacles=sceneObstacles(),chase=updateChaseCamera(car,null),plan=createEntryCameraPlan(TRACK,car,{landmarks,obstacles,lamps:roadsideLamps(),boundary:sceneEntryBoundary(),chase});
 // Rio's production plan uses solid hulls; independently inspect every uploaded
 // prop triangle too, including decorative roofs omitted from those hulls.
 const gl=fakeGL(),renderer=new RaceRenderer({width:1200,height:700,getContext:()=>gl,addEventListener(){}}),boundary=entryMeshOcclusion(gl.buffers.get(renderer.meshes.props.buffer));
 assert.deepEqual(plan.shots.map(s=>s.kind),['christ-redeemer','sugarloaf','starting-grid']);
 for(let i=0;i<=100;i++){const view=entryCameraForProgress(TRACK,car,i/100,plan);assert.ok([...view.eye,...view.target,view.fov].every(Number.isFinite));assert.equal(entrySegmentBlocked(view.eye,view.eye,obstacles,3),false);const subject=plan.shots[view.shot].subject;if(!subject)continue;const distance=Math.hypot(view.eye[0]-subject.x,view.eye[2]-subject.z),stop=Math.max(0,Math.min(.96,1-(subject.radius+28)/distance)),front=view.eye.map((v,k)=>v+(view.target[k]-v)*stop);assert.equal(entrySegmentBlocked(view.eye,front,obstacles,7),false,`foreground blocks ${subject.kind} at ${i}%`);assert.equal(boundary.blocked(view.eye,front),false,`rendered face blocks ${subject.kind} at ${i}%`);}
 assert.deepEqual(entryCameraForProgress(TRACK,car,1,plan).eye,chase.eye);assert.deepEqual(structuredClone(engine),before);
});
test('both drivers complete one and three actual Rio laps without automatic or manual rescue',t=>{
 setTrack('coast-rio');const obstacles=sceneObstacles();for(const laps of [1,3]){const engine=new RaceEngine({laps,obstacles}).start(laps),drivers=[new RaceAI({carId:1}),new RaceAI({carId:2})];for(let frame=0;frame<60*230&&engine.state!=='finished';frame++)engine.step(1/60,new Set(drivers.flatMap(driver=>[...driver.update(engine,1/60)])));assert.equal(engine.state,'finished');assert.deepEqual(drivers.map(d=>d.rescues),[0,0]);assert.deepEqual(engine.cars.map(c=>c.rescueCount),[0,0]);for(const c of engine.cars){assert.equal(c.lap,laps);assert.ok(c.bestLap>40&&c.bestLap<65);}t.diagnostic(`${laps} lap: finish ${engine.cars.map(c=>c.finishTime.toFixed(3)).join(' / ')} s; best ${engine.cars.map(c=>c.bestLap.toFixed(3)).join(' / ')} s`);}
});
