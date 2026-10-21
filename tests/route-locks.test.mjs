import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TRACKS, setTrack, trackPoint } from '../engine.js';
import { beijingReferencePoint } from '../beijing-reference.js';
import { routeDefinition, routeDrivingSamples, routeDigest } from './helpers/route-snapshot.mjs';

const manifestText=readFileSync(new URL('./fixtures/route-locks.json',import.meta.url),'utf8');
const locks=JSON.parse(manifestText);
// This separate anchor makes a silent fixture refresh fail too. There is no
// UPDATE_SNAPSHOTS bypass. See AGENTS.md before changing either baseline.
const MANIFEST_SHA256='715cbbd766a02a9d5eb02f154da32b2e3b01d0e1a132afed369d63448df7ee05';
const approvalMessage='Routes are frozen by the user. Restore an unintended change; do not refresh this baseline to make a test pass. A specific map requires new explicit route approval (AGENTS.md).';

test.afterEach(()=>setTrack('coast'));
test('the approved route-lock manifest itself has not been silently regenerated',()=>{
 assert.equal(createHash('sha256').update(manifestText).digest('hex'),MANIFEST_SHA256,approvalMessage);
 assert.equal(locks.schemaVersion,1);assert.equal(locks.frozenOn,'2026-10-12');
});
test('the frozen catalog contains exactly the twelve accepted courses',()=>{
 assert.deepEqual(Object.keys(TRACKS).sort(),Object.keys(locks.routes).sort(),approvalMessage);
 assert.equal(Object.keys(locks.routes).length,12);
 assert.ok(!Object.hasOwn(TRACKS,'coast-grand'),'Lighthouse Grand Prix was explicitly retired by the user');
});
for(const [id,expected]of Object.entries(locks.routes))test(`${id}: accepted route, elevation, grid and driving surface remain unchanged`,()=>{
 assert.ok(TRACKS[id],approvalMessage);setTrack(id);
 assert.equal(routeDigest(routeDefinition(TRACKS[id])),expected.geometrySha256,`${id}: ${approvalMessage}`);
 assert.equal(routeDigest(routeDrivingSamples(TRACKS[id],trackPoint)),expected.drivingSha256,`${id}: driving interpolation changed. ${approvalMessage}`);
});

// 2026-10-13: the user's explicit handicap removal authorizes only this P2
// grid field. Reconstructing the prior grid must still reproduce every prior
// route and driving hash, including the old spawn coordinate.
const gridAuthorization=locks.authorizationHistory.find(item=>item.date==='2026-10-13'&&item.change?.field==='startGrid[1].offset');
for(const [id,previous]of Object.entries(gridAuthorization.previousRouteLocks))test(`${id}: handicap removal changes only the authorized P2 start offset`,()=>{
 setTrack(id);
 // The later, separately authorized stadium detour retains its frozen source
 // so this historical handicap-only assertion still checks the original map.
 const track=id==='coast-beijing'?TRACKS[id].stadium.baseRoute:TRACKS[id],definition=routeDefinition(track);
 assert.deepEqual(track.startGrid,[{lane:-18,offset:-30},{lane:22,offset:-30}]);
 definition.startGrid[1].offset=gridAuthorization.change.from;
 assert.equal(routeDigest(definition),previous.geometrySha256,'Unrelated route field changed during handicap removal');
 const priorGrid={...track,startGrid:track.startGrid.map((slot,index)=>({...slot,offset:index===1?gridAuthorization.change.from:slot.offset}))};
 assert.equal(routeDigest(routeDrivingSamples(priorGrid,id==='coast-beijing'?beijingReferencePoint:trackPoint)),previous.drivingSha256,'Driving surface changed during handicap removal');
});
