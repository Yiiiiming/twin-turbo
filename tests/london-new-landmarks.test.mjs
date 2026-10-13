import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TRACK,setTrack,trackPoint,projectTrack,RaceEngine } from '../engine.js';
import { RaceAI } from '../ai.js';
import { RaceRenderer,londonLandmarkPlacements,sceneryPlacements,roadsideLamps,updateChaseCamera } from '../renderer.js';
import { ObstacleWorld } from '../collisions.js';
import { LONDON_NEW_LANDMARKS,londonNewLandmarkPlacements,addLondonNewLandmark } from '../london-new-landmarks.js';
const kinds=new Set(LONDON_NEW_LANDMARKS.map(item=>item.kind));
const basePlots=()=>londonLandmarkPlacements().filter(item=>!kinds.has(item.kind));
const additions=()=>londonNewLandmarkPlacements(basePlots());
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

function fakeGL() {
  const gl = { buffers: new Map() }; let bound, id = 0;
  for (const name of ['createShader', 'createProgram', 'createBuffer', 'createTexture']) gl[name] = () => ({ id: ++id });
  gl.getShaderParameter = gl.getProgramParameter = () => true;
  gl.getAttribLocation = () => 0; gl.getUniformLocation = (_, name) => name;
  gl.bindBuffer = (_, buffer) => { bound = buffer; }; gl.bufferData = (_, array) => gl.buffers.set(bound, array);
  for (const name of ['uniformMatrix4fv', 'deleteBuffer', 'drawArrays', 'shaderSource', 'compileShader', 'attachShader', 'linkProgram', 'deleteShader', 'bindTexture', 'texImage2D', 'texParameteri', 'enable', 'depthFunc', 'disable', 'clearColor', 'blendFunc', 'enableVertexAttribArray', 'vertexAttribPointer', 'depthMask', 'useProgram', 'disableVertexAttribArray', 'activeTexture', 'uniform1i', 'uniform1f', 'uniform3fv', 'viewport', 'scissor', 'clear', 'pixelStorei']) gl[name] = () => {};
  return gl;
}


test('ten London additions preserve the exact route and every pre-existing landmark',()=>{
 setTrack('coast-london');const hash=createHash('sha256').update(JSON.stringify({track:TRACK,samples:Array.from({length:1661},(_,i)=>trackPoint(i*10))})).digest('hex');assert.equal(hash,'757fc0db6fe66dd89f80d116da07f7eb284f5e3962c84564f039517b9c679096');assert.equal(kinds.size,10);assert.equal(additions().length,10);
 for(const item of additions())assert.ok(!basePlots().some(old=>old.kind===item.kind));
});
test('ten varied models have detailed finite geometry within their reserved rotated plots',()=>{
 setTrack('coast-london');for(const item of additions())for(const angle of [item.angle,.713,2.81]){const mesh=new GeometryProbe(item);addLondonNewLandmark(mesh,{...item,angle,elevation:11});assert.ok(mesh.vertices>=1000,`${item.kind} detail ${mesh.vertices}`);assert.ok(mesh.colors.size>=4,item.kind+' materials');assert.ok(mesh.radius<=item.radius+.25,`${item.kind} footprint ${mesh.radius}/${item.radius}`);assert.ok(mesh.minY>=10.5,`${item.kind} underground`);assert.ok(mesh.maxY>120,`${item.kind} height`);assert.ok(mesh.colliders.length>0,item.kind+' solid');}
});
test('all ten facades face the existing road, clear the river and do not overlap any existing landmark',()=>{
 setTrack('coast-london');const all=[...basePlots(),...additions()];for(const item of additions()){const nearest=projectTrack(item.x,item.z);assert.ok(nearest.distance>=TRACK.roadWidth/2+item.radius+27,item.kind+' road');assert.ok(Math.abs(item.z-TRACK.river.centerZ)>=TRACK.river.halfWidth+item.radius+27,item.kind+' river');const p=trackPoint(item.s),dx=p.x-item.x,dz=p.y-item.z;assert.ok((Math.sin(item.angle)*dx-Math.cos(item.angle)*dz)/Math.hypot(dx,dz)>.999,item.kind+' orientation');assert.equal(p.elevation,0);for(const other of all)if(item.kind!==other.kind)assert.ok(Math.hypot(item.x-other.x,item.z-other.z)>=item.radius+other.radius+30,item.kind+'/'+other.kind);}
});
test('additional solid hulls clear car lanes and the actual chase camera around the entire circuit',()=>{
 setTrack('coast-london');const hulls=[];for(const item of additions()){const probe=new GeometryProbe(item);addLondonNewLandmark(probe,item);hulls.push(...probe.colliders);}const world=new ObstacleWorld(hulls);
 for(let s=0;s<TRACK.length;s+=25)for(const lane of [-30,0,30]){const p=trackPoint(s,lane);assert.equal(world.resolveCar({...p,speed:0,height:25}),0,`car ${s}/${lane}`);const camera=updateChaseCamera({...p,speed:363},null);assert.equal(world.resolveCar({x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,speed:0,angle:0}),0,`camera ${s}/${lane}`);}
});


test('London additions are present in production GPU geometry and every solid hull is installed',t=>{
 setTrack('coast-london');const gl=fakeGL(),renderer=new RaceRenderer({width:1440,height:820,getContext:()=>gl,addEventListener(){}});assert.equal(renderer.available,true,renderer.error);
 let floats=0;for(const data of gl.buffers.values()){floats+=data.length;for(const value of data)assert.ok(Number.isFinite(value));}assert.ok(floats<10_000_000,'London geometry must remain below 40 MB');t.diagnostic(`Production London GPU geometry: ${(floats*4/1e6).toFixed(3)} MB; ${renderer.obstacles.length} collision hulls`);
 for(const item of additions()){const probe=new GeometryProbe(item);addLondonNewLandmark(probe,item);for(const hull of probe.colliders)assert.ok(renderer.obstacles.some(actual=>Object.entries(hull).filter(([key])=>key!=='id').every(([key,value])=>typeof value==='number'?Math.abs(actual[key]-value)<1e-7:actual[key]===value)),item.kind+' missing production hull');}
 const terraces=sceneryPlacements().filter(item=>item.kind==='terrace');for(let q=0;q<4;q++)assert.ok(terraces.filter(item=>Math.floor(projectTrack(item.x,item.z).s/TRACK.length*4)===q).length>=12,'Each quarter retains its surrounding streets');
});
test('the museum approach camera remains underneath the streetlight arms',()=>{
 setTrack('coast-london');const camera=updateChaseCamera({...trackPoint(14120),speed:363},null);for(const lamp of roadsideLamps()){if(Math.hypot(lamp.head.position[0]-camera.eye[0],lamp.head.position[2]-camera.eye[2])<60)assert.ok(lamp.lens.position[1]>camera.eye[1]+15,'lamp head must not cross the near camera frustum');}
});
