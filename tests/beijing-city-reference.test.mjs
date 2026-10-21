import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRACK,setTrack,projectTrack} from '../engine.js';
import {beijingReferenceTrack,beijingReferencePoint} from '../beijing-reference.js';
import {beijingStadiumClearance} from '../beijing-stadium.js';
import {beijingWallClearance} from '../beijing-great-wall.js';
import {cityLandmarkPlacements} from '../city-scenery.js';
import {routeDigest,routeDefinition,routeDrivingSamples} from './helpers/route-snapshot.mjs';
const before=JSON.parse(readFileSync(new URL('./fixtures/beijing-pre-stadium-plots.json',import.meta.url),'utf8'));
test.afterEach(()=>setTrack('coast'));

test('stadium planning retains the exact accepted Beijing reference rather than stretching the old city',()=>{
 setTrack('coast-beijing');const reference=beijingReferenceTrack();
 assert.equal(routeDigest(routeDefinition(reference)),'8bb4d411e74489c8fd3f3f7a417cc0f450921aa0b8f6b7cdcdbf57adf04ec020');
 assert.equal(routeDigest(routeDrivingSamples(reference,beijingReferencePoint)),'1c38909b0f02985dc7044edd5fade5ec52d87acfb43b6c3277d5336bc2433b84');
 const after=cityLandmarkPlacements();assert.equal(after.length,before.plots.length);
 for(const old of before.plots){
  const current=after.find(p=>p.kind===old.kind);assert.ok(current,old.kind);
  if(old.kind==='beijing-birds-nest')continue;
  const stillClear=projectTrack(old.x,old.z).distance>=TRACK.roadWidth/2+old.radius+30
   &&beijingWallClearance(old.x,old.z,old.radius+10)
   &&beijingStadiumClearance(TRACK.stadium,old.x,old.z,old.radius+35);
  if(stillClear)for(const field of ['x','z','angle','radius','side'])assert.equal(current[field],old[field],`${old.kind} ${field}: untouched city plots must stay put`);
  else assert.ok(Math.hypot(current.x-old.x,current.z-old.z)<=1400,`${old.kind}: relocation remains local to the new stadium`);
 }
});
