import test from 'node:test';
import assert from 'node:assert/strict';
import { setTrack } from '../engine.js';
import { addCityLandmark, cityLandmarkPlacements } from '../city-scenery.js';

const WATER_COLOR = '#527f82';

class BridgeProbe {
  constructor() { this.boxes = []; this.colliders = []; }
  box(x, y, z, width, height, depth, color, angle = 0) {
    const box = { x, y, z, width, height, depth, color, angle, top: y + height / 2, bottom: y - height / 2 };
    this.boxes.push(box);
    // Match the production detail convention: null disables collision only
    // for the decorative draw, then details() restores the original array.
    if (this.colliders) this.colliders.push(box);
  }
  cone() {}
  quad() {}
  triangle() {}
}

function coversFootprint(outer, inner) {
  const ci = Math.cos(inner.angle), si = Math.sin(inner.angle);
  const co = Math.cos(outer.angle), so = Math.sin(outer.angle);
  for (const x of [-inner.width / 2, inner.width / 2]) {
    for (const z of [-inner.depth / 2, inner.depth / 2]) {
      const dx = inner.x + ci * x - si * z - outer.x;
      const dz = inner.z + si * x + ci * z - outer.z;
      const localX = co * dx + so * dz, localZ = -so * dx + co * dz;
      if (Math.abs(localX) > outer.width / 2 + 1e-7 || Math.abs(localZ) > outer.depth / 2 + 1e-7) return false;
    }
  }
  return true;
}

test.afterEach(() => setTrack('coast'));

for (const placement of ['origin', 'actual roadside plot']) {
  test(`Seventeen-Arch Bridge water clears its stone platform at ${placement}`, () => {
    setTrack('coast-beijing');
    const item = placement === 'origin'
      ? { kind: 'beijing-seventeen-arch', x: 0, z: 0, angle: 0, side: 1, elevation: 0 }
      : cityLandmarkPlacements().find(item => item.kind === 'beijing-seventeen-arch');
    assert.ok(item, 'the bridge must remain in the production scene');
    const mesh = new BridgeProbe();
    addCityLandmark(mesh, item);
    const waterBoxes = mesh.boxes.filter(box => box.color === WATER_COLOR);
    assert.equal(waterBoxes.length, 1, 'the bridge has one lake surface');
    const water = waterBoxes[0];
    const underlyingStone = mesh.boxes.filter(box => box !== water
      && box.bottom <= water.bottom + 1e-7 && coversFootprint(box, water));
    assert.ok(underlyingStone.length > 0, 'find the actual platform beneath the rotated water footprint');
    const stoneTop = Math.max(...underlyingStone.map(box => box.top));
    assert.ok(water.top - stoneTop >= 1 - 1e-7,
      `water top ${water.top} must clear the underlying stone top ${stoneTop} by at least one unit`);
    assert.ok(Array.isArray(mesh.colliders), 'detail drawing restores collision collection');
    assert.equal(mesh.colliders.includes(water), false, 'the lake is decorative, not an invisible collision box');
    assert.ok(underlyingStone.every(box => mesh.colliders.includes(box)), 'the stone platform stays solid');
  });
}
