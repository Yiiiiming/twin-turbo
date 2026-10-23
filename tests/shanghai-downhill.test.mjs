import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TRACK, TRACKS, RaceEngine, setTrack, trackPoint, projectTrack } from '../engine.js';
import { RaceRenderer, updateChaseCamera, sceneObstacles } from '../renderer.js';
import { citySceneryPlacements, cityLandmarkPlacements } from '../city-scenery.js';
import { shanghaiLandmarkPlacements } from '../shanghai-landmarks.js';
import { shanghaiCityLandmarkPlacements, shanghaiLayoutDistricts } from '../shanghai-layout.js';
import { pudongSkylinePlacements, shanghaiRiverClearance } from '../shanghai-riverfront.js';
import { SHANGHAI_DOWNHILL_LANDMARKS, shanghaiDownhillPlacements, addShanghaiDownhillLandmark, addShanghaiDownhillCourts } from '../shanghai-downhill.js';
import { ObstacleWorld } from '../collisions.js';

class ArchitecturalAudit {
  constructor(item){this.item=item;this.colliders=[];this.radius=0;this.halfWidth=0;this.halfDepth=0;this.low=Infinity;this.high=-Infinity;this.triangles=0;this.colors=new Set();this.hash=createHash('sha256');}
  vertex(p){assert.ok(p.every(Number.isFinite));this.hash.update(p.map(v=>v.toFixed(3)).join(','));this.radius=Math.max(this.radius,Math.hypot(p[0]-this.item.x,p[2]-this.item.z));this.halfWidth=Math.max(this.halfWidth,Math.abs(p[0]-this.item.x));this.halfDepth=Math.max(this.halfDepth,Math.abs(p[2]-this.item.z));this.low=Math.min(this.low,p[1]);this.high=Math.max(this.high,p[1]);}
  triangle(a,b,c,color){[a,b,c].forEach(p=>this.vertex(p));this.triangles++;this.colors.add(color);}
  quad(a,b,c,d,color){this.triangle(a,b,c,color);this.triangle(a,c,d,color);}
  box(x,y,z,w,h,d,color,angle=0){
    assert.ok(w>0&&h>0&&d>0);if(this.colliders)this.colliders.push({type:'box',x,y:z,halfWidth:w/2,halfDepth:d/2,angle,minHeight:y-h/2,maxHeight:y+h/2});
    for(const a of[-1,1])for(const b of[-1,1])for(const c of[-1,1])this.vertex([x+Math.cos(angle)*a*w/2-Math.sin(angle)*c*d/2,y+b*h/2,z+Math.sin(angle)*a*w/2+Math.cos(angle)*c*d/2]);
    this.triangles+=12;this.colors.add(color);
  }
  cone(x,y,z,r,h,color,sides=8,top=0,phase=0){
    assert.ok(r>0&&h>0&&top>=0,`invalid cone ${[r,h,top]}`);if(this.colliders)this.colliders.push({type:'circle',x,y:z,radius:Math.max(r,top),minHeight:y,maxHeight:y+h});
    for(let i=0;i<sides;i++)for(const high of[false,true]){const a=i/sides*Math.PI*2+phase;this.vertex([x+Math.cos(a)*(high?top:r),y+(high?h:0),z+Math.sin(a)*(high?top:r)]);}
    this.triangles+=sides*(top?2:1);this.colors.add(color);
  }
  disk(x,y,z,rx,rz,color,sides=32,angle=0){for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2;this.vertex([x+Math.cos(a)*rx*Math.cos(angle)-Math.sin(a)*rz*Math.sin(angle),y,z+Math.cos(a)*rx*Math.sin(angle)+Math.sin(a)*rz*Math.cos(angle)]);}this.triangles+=sides;this.colors.add(color);}
}
test.beforeEach(()=>setTrack('coast-shanghai'));
test.afterEach(()=>setTrack('coast'));

test('Shanghai retains all additional named real landmarks with distinct architectural forms, not renamed boxes',()=>{
  const items=shanghaiDownhillPlacements(),old=shanghaiLandmarkPlacements();
  assert.equal(items.length,SHANGHAI_DOWNHILL_LANDMARKS.length);
  assert.ok(items.length>=50,'at least fifty new landmarks must actually be placed');
  assert.ok(items.filter(item=>item.family!=='skyline').length>=50,'commercial towers are extra: fifty historic, cultural or scenic landmarks are required');
  assert.equal(new Set(items.map(i=>i.kind)).size,items.length);assert.equal(new Set(items.map(i=>i.label)).size,items.length);
  const digests=new Set();let triangles=0;
  for(const item of items){
    assert.ok(!old.some(existing=>existing.kind===item.kind||existing.label===item.label),'existing landmarks do not count as new');
    assert.ok(item.features.join(' ').length>=25,`${item.kind} must describe its recognizable architectural features`);
    const local={...item,x:0,z:0,angle:0},audit=new ArchitecturalAudit(local);addShanghaiDownhillLandmark(audit,local);triangles+=audit.triangles;
    assert.ok(audit.triangles>=160,`${item.kind} has insufficient architectural geometry: ${audit.triangles}`);
    assert.ok(audit.colors.size>=4,`${item.kind} needs multiple real facade/roof materials`);
    assert.ok(audit.colliders.length>0,`${item.kind} must be solid`);
    assert.ok(audit.radius<=item.modelRadius+.5,`${item.kind} exceeds its original model footprint: ${audit.radius} > ${item.modelRadius}`);
    assert.ok(audit.halfWidth<=item.courtWidth/2+.5&&audit.halfDepth<=item.courtDepth/2+.5,`${item.kind} extends beyond its courtyard`);
    assert.ok(audit.low>=-.1&&audit.high<=item.height+.5,`${item.kind} exceeds its vertical envelope ${audit.low}..${audit.high}/${item.height}`);
    digests.add(audit.hash.digest('hex'));
  }
  assert.equal(digests.size,items.length,'every landmark must have its own shape');
  assert.ok(triangles*3*11*4<24*1024*1024,`new architecture GPU footprint ${(triangles*132/1024/1024).toFixed(1)} MiB`);
});

test('all additional landmarks are grounded in varied roadside districts and clear of existing city plots',()=>{
  const plots=shanghaiDownhillPlacements(),reserved=[...shanghaiLandmarkPlacements(),...citySceneryPlacements(),...pudongSkylinePlacements()];
  const districts=new Map(shanghaiLayoutDistricts().map(district=>[district.id,district]));
  for(const side of[-1,1])assert.ok(plots.filter(p=>p.side===side).length>=20,'both sides must receive a substantial landmark sequence');
  for(const item of plots){
    assert.equal(item.elevation,0,'museums and historic buildings cannot float beside the flyover');
    const district=districts.get(item.district);
    assert.ok(district&&item.s>=district.start&&item.s<=district.end&&district.sides.includes(item.side),`${item.kind} outside its roadside district`);
    assert.ok(projectTrack(item.x,item.z).distance<500,`${item.kind} is hidden too far behind the street`);
    if(item.family==='skyline'){assert.equal(item.district,'upper-descent');assert.ok(trackPoint(item.s).slope<-.002);}
    else assert.ok(trackPoint(item.s).elevation<=Math.min(150,item.height*.6),`${item.kind} sits below an excessively high road`);
    assert.ok(projectTrack(item.x,item.z).distance>=item.radius+125.9);
    assert.ok(shanghaiRiverClearance(item.x,item.z,item.radius));
    for(const other of [...reserved,...plots])if(other!==item)assert.ok(Math.hypot(item.x-other.x,item.z-other.z)>=item.radius+other.radius+23.9,`${item.kind} overlaps ${other.kind}`);
    const p=trackPoint(item.s),dx=p.x-item.x,dz=p.y-item.z;
    assert.ok((Math.sin(item.angle)*dx-Math.cos(item.angle)*dz)/Math.hypot(dx,dz)>.999,'entrance faces the track');
  }
  for(const id of Object.keys(TRACKS))if(id!=='coast-shanghai'){setTrack(id);assert.deepEqual(shanghaiDownhillPlacements(),[]);}
});

test('the 80-landmark plan preserves original anchors and distributes the 50 shorter sites across low roadside districts',()=>{
  const items=shanghaiCityLandmarkPlacements(),original=shanghaiLandmarkPlacements(),added=shanghaiDownhillPlacements();
  assert.equal(items.length,80);assert.equal(new Set(items.map(item=>item.kind)).size,80);
  assert.deepEqual(items.slice(0,15),original,'the Pearl, Bund and original civic landmarks must keep their approved positions');
  assert.equal(added.filter(item=>item.family==='skyline').length,15);
  const low=added.filter(item=>item.family!=='skyline');assert.equal(low.length,50);
  for(const district of shanghaiLayoutDistricts().filter(district=>district.id!=='upper-descent')){
    assert.ok(low.filter(item=>item.district===district.id).length>=6,`${district.id} lacks a visible cultural/historic sequence`);
  }
  const bins=new Map();for(const item of added){const bin=Math.floor(item.s/2000);bins.set(bin,(bins.get(bin)||0)+1);}
  assert.ok(Math.max(...bins.values())<=13,'avoid concentrating the named buildings in one short road section again');
  const spiral=TRACK.spirals[0];assert.ok(added.every(item=>item.s<spiral.start||item.s>spiral.end),'retain the two clear spiral views of the Oriental Pearl');
});

test('reserved courts remain within each named plot and leave every named frontage visible from its road station',()=>{
  const items=shanghaiCityLandmarkPlacements(),additional=shanghaiDownhillPlacements(),otherPlots=[...items,...pudongSkylinePlacements(),...citySceneryPlacements()];
  const quads=[];addShanghaiDownhillCourts({quad(...args){quads.push(args.slice(0,4));}});
  assert.equal(quads.length,additional.length*4,'every named additional landmark keeps its planted court');
  for(const [index,item]of additional.entries())for(const p of quads.slice(index*4,index*4+4).flat()){
    assert.ok(Math.hypot(p[0]-item.x,p[2]-item.z)<=item.radius+.001,`${item.kind} court exceeds its reserved plot`);
    assert.ok(projectTrack(p[0],p[2]).distance>TRACK.roadWidth/2+28,`${item.kind} court reaches the road shoulder`);
    assert.ok(shanghaiRiverClearance(p[0],p[2],0),`${item.kind} court reaches the river bank`);
  }
  for(const item of items){
    if(!Number.isFinite(item.s))continue;
    const road=trackPoint(item.s),dx=item.x-road.x,dz=item.z-road.y,length=Math.hypot(dx,dz);
    for(const other of otherPlots){
      if(other===item||other.kind===item.kind)continue;
      const along=((other.x-road.x)*dx+(other.z-road.y)*dz)/length;
      if(along<=0||along>=length)continue;
      const cross=Math.abs((other.x-road.x)*dz-(other.z-road.y)*dx)/length;
      assert.ok(cross>=(other.modelRadius??other.radius)+9.9,`${other.kind??'Pudong tower'} blocks ${item.kind}'s roadside frontage`);
    }
  }
});

test('new architecture leaves every road branch, shoulder and chase-camera sweep clear including the spiral',()=>{
  const obstacles=[];
  for(const item of shanghaiDownhillPlacements()){const audit=new ArchitecturalAudit(item);addShanghaiDownhillLandmark(audit,item);obstacles.push(...audit.colliders);}
  const world=new ObstacleWorld(obstacles);
  for(let s=0;s<TRACK.length;s+=11)for(const lane of[-42,0,42]){
    const p=trackPoint(s,lane);assert.equal(world.resolveCar({...p,height:25,speed:0}),0,`landmark contacts lane ${s}/${lane}`);
    for(const speed of[0,363,517]){const camera=updateChaseCamera({...p,speed},null),probe={x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:0,speed:0};assert.equal(world.resolveCar(probe),0,`landmark contacts camera ${s}/${lane}/${speed}`);}
  }
  const production=sceneObstacles();assert.ok(production.length>obstacles.length,'production renderer includes the new solid structures');
});

test('all 80 named landmarks and six challenge ghosts reach production geometry below 40 MB',t=>{
  const gl={buffers:new Map()};let bound,id=0;
  for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
  gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_,name)=>name;
  gl.bindBuffer=(_,buffer)=>{bound=buffer;};gl.bufferData=(_,array)=>gl.buffers.set(bound,array);
  for(const name of ['uniformMatrix4fv','deleteBuffer','drawArrays','shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindTexture','texImage2D','texParameteri','enable','depthFunc','disable','clearColor','blendFunc','enableVertexAttribArray','vertexAttribPointer','depthMask','useProgram','disableVertexAttribArray','activeTexture','uniform1i','uniform1f','uniform3fv','viewport','scissor','clear','pixelStorei'])gl[name]=()=>{};
  assert.deepEqual(cityLandmarkPlacements(),shanghaiCityLandmarkPlacements(),'production must reserve every named plot before street infill');
  assert.equal(cityLandmarkPlacements().length,80);
  const renderer=new RaceRenderer({width:1440,height:820,getContext:()=>gl,addEventListener(){}});
  assert.equal(renderer.available,true,renderer.error);
  renderer.setSinglePlayer(true).setGhostPoses([Array.from({length:6},(_,slotId)=>({...trackPoint(10000+slotId*20),slotId}))]);
  renderer.render(new RaceEngine({playerCount:1}));
  assert.equal(renderer.ghostMeshes.length,6,'the budget must include all lazily uploaded challenge colors');
  let bytes=0;for(const data of gl.buffers.values()){bytes+=data.byteLength;for(const value of data)assert.ok(Number.isFinite(value));}
  assert.ok(bytes<40_000_000,`Shanghai GPU geometry exceeds 40 MB: ${(bytes/1e6).toFixed(3)}`);
  const data=gl.buffers.get(renderer.meshes.props.buffer);
  const missing=new Map(shanghaiDownhillPlacements().map(item=>{
    const audit=new ArchitecturalAudit(item);addShanghaiDownhillLandmark(audit,item);return[item,audit.high*.9];
  }));
  for(let i=0;i<data.length&&missing.size;i+=11)for(const [item,peak] of missing){
    if(data[i+1]>=peak&&Math.hypot(data[i]-item.x,data[i+2]-item.z)<item.radius)missing.delete(item);
  }
  assert.deepEqual([...missing.keys()].map(item=>item.kind),[],'every new landmark must have its real silhouette in the production scene');
  t.diagnostic(`Complete Shanghai GPU geometry ${(bytes/1e6).toFixed(3)} MB; ${cityLandmarkPlacements().length} named landmarks`);
});
