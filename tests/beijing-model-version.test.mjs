import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTrack } from '../engine.js';
import { addCityLandmark, cityLandmarkPlacements } from '../city-scenery.js';

// Accepted source: twin-turbo-beijing-plus20-release-20261012, published as
// commit 81ed7d6fb06b5285d651480b45d0975ecbfbaf01. Its release manifest pins
// beijing-city-landmarks.js to Git blob f38b39fe91d25b98dd9cabb0f00a0c913cfa3526.
// These fingerprints were measured from that snapshot's production
// addCityLandmark entry point, NOT generated from the current model factory.
// Preserve command order and round numeric arguments to six decimal places.
// There is deliberately no automatic baseline-update mode. An intentional
// model revision needs explicit review of the new geometry and its baseline.
const ACCEPTED_MODELS = [
  ['temple-of-heaven', 4084, 'fa8e963aab3c3ff7c6322b29dd16dc1b203f81d189def265c12e30fdafba8df5'],
  ['palace-gate', 1736, 'e9acac5a060e5f544a0bd49406edddbab291d0256999b9d50dbb0ff4be54d0a2'],
  ['beijing-paifang', 2982, '7aae97e36c3817b321d97a5b04b34b584f5adba15a7ec21fcd4432a724babdcc'],
  // 2026-10-20: explicitly requested mandatory drive-through stadium; reviewed
  // hollow bowl, red seats, steel shell, two open portals and solid infield rail.
  ['beijing-birds-nest', 4162, 'b317db1f531ca0afca217b98a8ad12e73d4b9c71156591f5c5d38e042f849be7'],
  ['beijing-water-cube', 1768, '2a2fd631d00aa1fc2ef430cf1ea03b6d36f3e391da442a20269b9844d483640e'],
  ['beijing-ncpa', 1535, '85a295ecef9bb4463aee10883f1108899d1c79beaaa206532ff5c3c9dc67ba46'],
  ['beijing-cctv', 406, '90c82e8208576867bbc89eb1252de82a6296cb3ea38cee487ef08a0cc6a192ab'],
  ['beijing-china-zun', 4012, '52e8206d61e18854b5e11175dd2274a23133e991e7182dd6dc9a1a1ae6d7b6db'],
  ['beijing-beihai-dagoba', 1414, '36c3fd770d8e85eb04975dec60974d8095588d7ce9061046a52bf0c44b5573f9'],
  ['beijing-fragrant-tower', 610, '0aef5c543d465c70429a8cce7f6ae62d0660244cfef3598123757455f53f87c9'],
  // 2026-10-12 user-requested water-flicker fix: only the water box center
  // moves from y=7.5 to y=8.5; all other 572 accepted draw calls are unchanged.
  ['beijing-seventeen-arch', 573, 'f534ad1dc4fe47d5edc38adbc847316febfc38738819b7958ee5974756ddc548'],
  ['beijing-drum-tower', 2122, '2dbdc794bad1395e3d02cc1d509a81ee5a868669ad3ec4b2da03b08210eaf383'],
  ['beijing-bell-tower', 1420, '64d6d74a723e2c8039e3c61cfbeb826ffeaca2913b4974ab7b3486c315a7fd8f'],
  ['beijing-zhengyangmen', 1456, 'a9ad8b835b298a167de0a20b6347a819dcfc390a278b7fea3608a2b940036d67'],
  ['beijing-jingshan', 1264, '00738b9cd67258975d46a76864aed4198cccfcca58a3fca21c21c01a80def950'],
  ['beijing-yonghe', 4088, '1c60b6f763b4a14b86e971db54d3e0f212bc59bff66c1804d4dbedc66597299c'],
  ['beijing-confucius', 921, 'aa7d3fc4d8a76fc049c79baa5f3a415609389496f7f22f844fba1e7f1d2abc20'],
  ['beijing-national-museum', 234, '9e070c914c69372702a322baf3bbdbfcdf13d4e7216eb0abc2a8015ec1f7a0af'],
  ['beijing-railway-station', 2259, 'a65b99052a1880364909579b7237b68de44becacbc06fd789d58991e42605c61'],
  ['beijing-exhibition-center', 831, '90a001f93366af363a3c028da1773e1014532041608e3a7a68aee1d78943d0bf'],
  ['beijing-miaoying', 1396, 'a0dda2f200a0bb0157f88efd17cbc51e030a9a4c1fc32fd276388be2560c4889'],
  ['beijing-capital-museum', 886, 'bd67b3c38ce4e572af959d7708ec6b5db2b86707ffa0a8bcaa7896fb1c4fd82b'],
  ['beijing-planetarium', 1208, 'bfdab398ec810cf3b689f8cd4d9e22088d2138fad8cc70dd62cd59f0c2b7f6e7'],
];

function normalize(value) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), 'model commands must contain finite geometry');
    return Number(value.toFixed(6));
  }
  return Array.isArray(value) ? value.map(normalize) : value;
}

function productionFingerprint(kind) {
  const commands = [], mesh = { colliders: [] };
  for (const method of ['triangle', 'quad', 'box', 'cone']) {
    mesh[method] = (...args) => commands.push([method, ...args.map(normalize)]);
  }
  addCityLandmark(mesh, { kind, x: 0, z: 0, angle: 0, side: 1, elevation: 0 });
  assert.ok(Array.isArray(mesh.colliders), 'decorative detail must restore the collider context');
  return { count: commands.length, sha256: createHash('sha256').update(JSON.stringify(commands)).digest('hex') };
}

test.afterEach(() => setTrack('coast'));

test('Beijing production placements retain every accepted named model', () => {
  setTrack('coast-beijing');
  assert.deepEqual(cityLandmarkPlacements().map(item => item.kind).sort(), ACCEPTED_MODELS.map(([kind]) => kind).sort());
});

for (const [kind, count, sha256] of ACCEPTED_MODELS) {
  test(`Beijing production rendering preserves the accepted ${kind} model`, () => {
    setTrack('coast-beijing');
    assert.deepEqual(productionFingerprint(kind), { count, sha256 }, `${kind}: accepted model changed or production dispatch missed it`);
  });
}
