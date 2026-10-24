import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK,setTrack,trackPoint,projectTrack } from '../src/engine.js';
import { AUSTIN_LANDMARKS,addAustinLandmark } from '../src/austin-landmarks.js';
import { SIXTH_STREET_VENUES } from '../src/austin-sixth-street.js';
import { cityLandmarkPlacements,citySceneryPlacements } from '../src/city-scenery.js';
test.afterEach(()=>setTrack('coast'));
class GeometryProbe {
  constructor(center) { this.center = center; this.radius = 0; this.minY = Infinity; this.maxY = -Infinity; this.vertices = 0; this.colors = new Set(); this.colliders = []; }
  vertex(p) {
    assert.ok(p.every(Number.isFinite), `non-finite vertex ${p}`);
    this.radius = Math.max(this.radius, Math.hypot(p[0] - this.center.x, p[2] - this.center.z));
    this.minY = Math.min(this.minY, p[1]); this.maxY = Math.max(this.maxY, p[1]); this.vertices++;
  }
  triangle(a, b, c, color) { [a, b, c].forEach(p => this.vertex(p)); this.colors.add(String(color)); }
  quad(a, b, c, d, color) { [a, b, c, d].forEach(p => this.vertex(p)); this.colors.add(String(color)); }
  box(x, y, z, w, h, d, color, angle = 0) {
    assert.ok(w > 0 && h > 0 && d > 0, 'nonpositive box dimensions');
    const c = Math.cos(angle), s = Math.sin(angle);
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const e of [-1, 1]) this.vertex([x + c * a * w / 2 - s * e * d / 2, y + b * h / 2, z + s * a * w / 2 + c * e * d / 2]);
    this.colors.add(String(color));
    if (this.colliders && y + h / 2 > 0) this.colliders.push({ type: 'box', x, y: z, halfWidth: w / 2, halfDepth: d / 2, angle, minHeight: y - h / 2, maxHeight: y + h / 2 });
  }
  cone(x, y, z, r, h, color, sides = 8, top = 0, phase = 0) {
    assert.ok(r > 0 && h > 0 && top >= 0, 'nonpositive curved dimensions');
    for (let i = 0; i < sides; i++) for (const upper of [false, true]) {
      const a = i / sides * Math.PI * 2 + phase, radius = upper ? top : r;
      this.vertex([x + Math.cos(a) * radius, y + (upper ? h : 0), z + Math.sin(a) * radius]);
    }
    this.colors.add(String(color));
    if (this.colliders && y + h > 0) this.colliders.push({ type: 'circle', x, y: z, radius: Math.max(r, top), minHeight: y, maxHeight: y + h });
  }
  disk(x, y, z, rx, rz, color, sides = 12, angle = 0) {
    for (let i = 0; i < sides; i++) { const a = i / sides * Math.PI * 2, dx = Math.cos(a) * rx, dz = Math.sin(a) * rz; this.vertex([x + dx * Math.cos(angle) - dz * Math.sin(angle), y, z + dx * Math.sin(angle) + dz * Math.cos(angle)]); }
    this.colors.add(String(color));
  }
}

test('Austin has twelve independently modeled real buildings, spread beyond Sixth Street',()=>{
 setTrack('coast-austin');const all=cityLandmarkPlacements(),required=['texas-capitol','ut-tower',...SIXTH_STREET_VENUES.map(x=>x.kind),...AUSTIN_LANDMARKS.map(x=>x.kind)];
 assert.equal(required.length,12);for(const kind of required)assert.ok(all.some(x=>x.kind===kind),kind);
 const added=all.filter(x=>AUSTIN_LANDMARKS.some(m=>m.kind===x.kind));assert.equal(added.length,5);assert.equal(new Set(added.map(x=>Math.floor(x.s/TRACK.length*4))).size,3);
});
test('Austin landmark actual geometry fits each rotated plot, with closed solid hulls',()=>{
 setTrack('coast-austin');for(const item of cityLandmarkPlacements().filter(x=>AUSTIN_LANDMARKS.some(m=>m.kind===x.kind)))for(const angle of [item.angle,.73,2.77]){
  const mesh=new GeometryProbe(item);addAustinLandmark(mesh,{...item,angle,elevation:13});assert.ok(mesh.vertices>1200,item.kind+' detail');assert.ok(mesh.colors.size>=5,item.kind+' materials');assert.ok(mesh.radius<=item.radius+.25,`${item.kind}: ${mesh.radius} exceeds ${item.radius}`);assert.ok(mesh.minY>=12.8);assert.ok(mesh.maxY>110);assert.ok(mesh.colliders.length>0,item.kind+' needs collision');
 }
});
test('Austin added buildings face the road and clear all road branches, river and neighbours',()=>{
 setTrack('coast-austin');const all=cityLandmarkPlacements(),street=citySceneryPlacements();for(const item of all.filter(x=>AUSTIN_LANDMARKS.some(m=>m.kind===x.kind))){
  assert.ok(projectTrack(item.x,item.z).distance>=TRACK.roadWidth/2+item.radius+27,item.kind+' road');assert.ok(Math.abs(item.z-TRACK.river.centerZ)>TRACK.river.halfWidth+item.radius+25,item.kind+' river');
  const p=trackPoint(item.s),dx=p.x-item.x,dz=p.y-item.z;assert.ok((Math.sin(item.angle)*dx-Math.cos(item.angle)*dz)/Math.hypot(dx,dz)>.999,item.kind+' orientation');
  for(const other of all)if(other.kind!==item.kind)assert.ok(Math.hypot(item.x-other.x,item.z-other.z)>item.radius+other.radius+27,item.kind+'/'+other.kind);
  for(const other of street)assert.ok(Math.hypot(item.x-other.x,item.z-other.z)>=item.radius+other.radius+25,item.kind+' streetscape');
 }
});
