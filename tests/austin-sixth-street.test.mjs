import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TRACK,setTrack,trackPoint,projectTrack } from '../src/engine.js';
import { cityLandmarkPlacements,citySceneryPlacements } from '../src/city-scenery.js';
import { SIXTH_STREET_VENUES,sixthStreetPlacements } from '../src/austin-sixth-street.js';
test.afterEach(()=>setTrack('coast'));
test('Sixth Street preserves the Austin route, elevation, start grid and ghost coordinates',()=>{
 setTrack('coast-austin');assert.equal(createHash('sha256').update(JSON.stringify({track:TRACK,samples:Array.from({length:1681},(_,i)=>trackPoint(i*10))})).digest('hex'),'b880108622e1b109edf5afcb45a85d8d0f2a3733e8d0d616fb2dab46e9ab12de');
});
test('five real venues line both sides of one compact straight, facing drivers with clear roadside plots',()=>{
 setTrack('coast-austin');const plots=sixthStreetPlacements(),all=cityLandmarkPlacements(),scenery=citySceneryPlacements();
 assert.equal(plots.length,5);assert.equal(new Set(plots.map(p=>p.kind)).size,5);assert.equal(new Set(plots.map(p=>p.side)).size,2);
 assert.ok(Math.max(...plots.map(p=>p.s))-Math.min(...plots.map(p=>p.s))<700);
 for(const item of plots){
  assert.ok(all.some(p=>p.kind===item.kind));assert.equal(trackPoint(item.s).elevation,0);
  assert.ok(projectTrack(item.x,item.z).distance>=TRACK.roadWidth/2+item.radius+29);
  const p=trackPoint(item.s),dx=p.x-item.x,dz=p.y-item.z;
  assert.ok((Math.sin(item.angle)*dx-Math.cos(item.angle)*dz)/Math.hypot(dx,dz)>.999);
  for(const other of all)if(item.kind!==other.kind)assert.ok(Math.hypot(item.x-other.x,item.z-other.z)>item.radius+other.radius+24,`${item.kind}/${other.kind}`);
  for(const other of scenery)assert.ok(Math.hypot(item.x-other.x,item.z-other.z)>=item.radius+other.radius+25,`${item.kind} overlaps streetscape`);
 }
 for(const kind of ['ut-tower','football-team','texas-capitol','music-guitar','austin-music-hall'])assert.ok(all.some(item=>item.kind===kind));
});
test('Sixth Street is exclusive to Austin',()=>{
 for(const id of ['coast-london','coast-beijing','coast-rio','coast-paris','coast-shanghai']){setTrack(id);assert.deepEqual(sixthStreetPlacements(),[]);assert.ok(cityLandmarkPlacements().every(item=>!SIXTH_STREET_VENUES.some(v=>v.kind===item.kind)));}
});
