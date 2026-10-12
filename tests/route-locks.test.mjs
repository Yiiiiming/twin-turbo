import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TRACKS, setTrack, trackPoint } from '../engine.js';
import { routeDefinition, routeDrivingSamples, routeDigest } from './helpers/route-snapshot.mjs';

const manifestText=readFileSync(new URL('./fixtures/route-locks.json',import.meta.url),'utf8');
const locks=JSON.parse(manifestText);
// This separate anchor makes a silent fixture refresh fail too. There is no
// UPDATE_SNAPSHOTS bypass. See AGENTS.md before changing either baseline.
const MANIFEST_SHA256='9d0b45504cc0d97d50343af33aa39190e616f369136c546b1ea7e9efb3cd65de';
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
