import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, TRACKS, RaceEngine, setTrack, trackPoint, projectTrack, mod } from '../engine.js';
import { RaceAI } from '../ai.js';
import { SplitTiming } from '../split-timing.js';
import { sceneObstacles, sampleRoadRibbon, updateChaseCamera, RaceRenderer, harborLandmarkPlacements, TERRAIN_PALETTES, sceneryPlacements } from '../renderer.js';
const tracks=Object.values(TRACKS).filter(track=>track.id.startsWith('coast-'));
const angleDifference=(a,b)=>Math.abs(mod(a-b+Math.PI,Math.PI*2)-Math.PI);

test.afterEach(()=>setTrack('coast'));

test('ten distinct compact courses close with continuous headings and enough racing width',()=>{
 assert.equal(tracks.length,10);const shapes=new Set();
 for(const track of tracks){
  setTrack(track.id);assert.ok(track.length>=15000&&track.length<=20000);assert.equal(track.roadWidth,120);
  assert.ok(track.startDistance>100);assert.ok(track.nameEn&&track.descriptionEn);
  shapes.add(JSON.stringify(track.segments.map(s=>[s.kind,Math.round(s.length),s.sweep])));
  for(const seg of track.segments){
   if(seg.kind==='arc')assert.ok(seg.radius>=250);
   const before=trackPoint(seg.s+seg.length-.0001),after=trackPoint(seg.s+seg.length+.0001);
   assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<.001,`${track.id} has a road gap`);
   assert.ok(Math.abs(before.elevation-after.elevation)<.001);assert.ok(angleDifference(before.angle,after.angle)<.001);
  }
  for(const row of sampleRoadRibbon(31)){
   assert.ok(row.center.x>120&&row.center.y>120&&row.center.x<track.width-120&&row.center.y<track.height-120);
   assert.ok(Math.abs(row.center.slope)<.25);
   assert.ok(Math.abs(Math.hypot(row.left.x-row.right.x,row.left.y-row.right.y)-120)<1e-7);
   const projected=projectTrack(row.center.x,row.center.y,row.distance,row.center.elevation);
   assert.ok(Math.abs(mod(projected.s-row.distance+track.length/2,track.length)-track.length/2)<.001,`${track.id} projection skipped a layer`);
  }
 }
 assert.equal(shapes.size,10,'courses cannot be cosmetic mirrors of one layout');
});

test('the ridge has two genuine 1080-degree helices with safe floor separation and correct route projection',()=>{
 setTrack('coast-ridge');assert.equal(TRACK.spirals.length,2);
 for(const spiral of TRACK.spirals){
  const span=spiral.end-spiral.start;assert.ok(Math.abs(span/spiral.radius-6*Math.PI)<1e-8);
  assert.equal(spiral.degrees,1080);
  const start=trackPoint(spiral.start),end=trackPoint(spiral.end);
  assert.ok(Math.hypot(start.x-end.x,start.y-end.y)<1e-7);
  assert.equal(Math.round(Math.abs(end.elevation-start.elevation)),570);
  for(let phase=0;phase<Math.PI*2;phase+=.13)for(let turn=0;turn<2;turn++){
   const s=spiral.start+(turn*2*Math.PI+phase)*spiral.radius,a=trackPoint(s),b=trackPoint(s+2*Math.PI*spiral.radius);
   assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-7);assert.ok(Math.abs(a.elevation-b.elevation)>140,'next road floor clears cameras and gantries');
   assert.ok(Math.abs(projectTrack(b.x,b.y,s+2*Math.PI*spiral.radius,b.elevation).s-(s+2*Math.PI*spiral.radius))<1e-7);
  }
 }
 const s=TRACK.spirals[0].start+400,a=trackPoint(s),b=trackPoint(s+2*Math.PI*275),engine=new RaceEngine();
 Object.assign(engine.cars[0],a);Object.assign(engine.cars[1],b);const positions=engine.cars.map(car=>[car.x,car.y]);
 engine._collide();assert.deepEqual(engine.cars.map(car=>[car.x,car.y]),positions,'separate decks do not collide');
});

test('chase camera and landmark footprints respect the road deck and clear racing space',()=>{
 for(const track of tracks){
  setTrack(track.id);
  for(let s=0;s<track.length;s+=113){
   const car={...trackPoint(s),speed:350},camera=updateChaseCamera(car,null);
   assert.ok(camera.eye[1]>car.elevation+45&&camera.eye[1]<car.elevation+110);
   assert.ok(Math.abs(camera.target[1]-car.elevation)<40);
  }
  for(const item of harborLandmarkPlacements())assert.ok(projectTrack(item.x,item.z).distance>item.radius+40,'landmarks must not block the course');
 }
});

function fakeGL(){
 const gl={buffers:new Map(),uniforms:new Map(),draws:[],deletes:[]};let bound,id=0;
 for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
 gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_,name)=>name;
 gl.bindBuffer=(_,buffer)=>{bound=buffer;};gl.bufferData=(_,array)=>gl.buffers.set(bound,array);
 gl.uniformMatrix4fv=(name,_,value)=>gl.uniforms.set(name,value);gl.deleteBuffer=buffer=>gl.deletes.push(buffer);
 gl.drawArrays=()=>gl.draws.push({buffer:bound,model:gl.uniforms.get('uModel')?.slice()});
 for(const name of ['shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindTexture','texImage2D','texParameteri','enable','depthFunc','disable','clearColor','blendFunc','enableVertexAttribArray','vertexAttribPointer','depthMask','useProgram','disableVertexAttribArray','activeTexture','uniform1i','uniform1f','uniform3fv','viewport','scissor','clear','pixelStorei'])gl[name]=()=>{};
 return gl;
}

test('uploaded road, car and shadow meshes follow elevation; rebuilding reuses vehicles and releases old road buffers',()=>{
 setTrack('coast');const gl=fakeGL(),renderer=new RaceRenderer({width:1280,height:720,getContext:()=>gl,addEventListener(){}});
 assert.equal(renderer.available,true,renderer.error);const carBuffer=renderer.meshes.cars[0].buffer;
 const engine=new RaceEngine();engine.selectTrack('coast-ridge');renderer.rebuild(engine);
 assert.equal(renderer.trackId,'coast-ridge');assert.equal(renderer.meshes.cars[0].buffer,carBuffer);assert.equal(gl.deletes.length,4);
 const road=gl.buffers.get(renderer.meshes.road.buffer);let high=0,low=Infinity;
 for(let i=0;i<road.length;i+=11){high=Math.max(high,road[i+1]);low=Math.min(low,road[i+1]);}
 assert.ok(high>=570.7&&low<1);assert.ok(renderer.obstacles.some(o=>o.minHeight>400&&o.maxHeight>o.minHeight));
 assert.ok(renderer.obstacles.every(o=>Number.isFinite(o.minHeight)&&Number.isFinite(o.maxHeight)));
 const p=trackPoint(TRACK.spirals[0].end-150);Object.assign(engine.cars[0],p,{speed:230});renderer.resetCameras(engine);renderer.render(engine,1000,1/60);
 const cars=gl.draws.filter(d=>d.buffer===carBuffer);assert.ok(cars.some(d=>Math.abs(d.model[13]-p.elevation-1.5)<.001));
 const shadows=gl.draws.filter(d=>d.buffer===renderer.meshes.shadow.buffer);assert.ok(shadows.some(d=>Math.abs(d.model[13]-p.elevation-1.3)<.001));
});

for(const track of Object.values(TRACKS))test(`${track.id}: both drivers finish 1-lap and 3-lap races with production scenery, without rescue`,()=>{
 setTrack(track.id);const obstacles=sceneObstacles();
 for(const laps of [1,3]){
  const engine=new RaceEngine({laps,obstacles}).start(laps),drivers=[new RaceAI({carId:1}),new RaceAI({carId:2})],splits=new SplitTiming(),passages=[];
  for(let frame=0;frame<60*225&&engine.state!=='finished';frame++){
   const keys=new Set(drivers.flatMap(driver=>[...driver.update(engine,1/60)]));engine.step(1/60,keys);passages.push(...splits.sample(engine));
  }
  assert.equal(engine.state,'finished',`${track.id}/${laps} laps did not finish`);
  assert.deepEqual(drivers.map(driver=>driver.rescues),[0,0]);
  for(const playerId of [1,2])assert.equal(passages.filter(p=>p.playerId===playerId).length,laps*4,`${track.id}: every quarter must report a checkpoint split`);
  for(const car of engine.cars){assert.equal(car.lap,laps);assert.ok(car.bestLap>=40&&car.bestLap<=70,`lap ${car.bestLap} outside intended pace`);}
 }
});

test('all eleven maps share the same 240 km/h cruising and 341 km/h boost speedometer scale',()=>{
 assert.equal(Object.keys(TRACKS).length,11);
 for(const track of Object.values(TRACKS)){
  const scale=track.unitsPerMeter?3.6/track.unitsPerMeter:.66;
  assert.equal(Math.round(363*scale),240,track.id);assert.equal(Math.round(517*scale),341,track.id);
 }
});

test('London has two real river bridges, solid nearby landmarks, and clear car/camera passages',()=>{
 setTrack('coast-london');assert.ok(TRACK.length>=15500&&TRACK.length<=18000);assert.equal(TRACK.bridges.length,2);
 for(const bridge of TRACK.bridges){
  for(let s=bridge.s-bridge.halfSpan;s<=bridge.s+bridge.halfSpan;s+=17){
   const p=trackPoint(s);assert.ok(Math.abs(p.elevation-bridge.deckHeight)<1e-6,'bridge deck remains level over water');
  }
  for(let s=bridge.s-bridge.halfSpan-600;s<bridge.s+bridge.halfSpan+600;s+=9)assert.ok(Math.abs(trackPoint(s).slope)<=.226);
 }
 const scenery=sceneryPlacements();assert.ok(scenery.filter(item=>item.kind==='terrace').length>110);
 for(let i=0;i<scenery.length;i++)for(let j=i+1;j<scenery.length;j++)assert.ok(
  Math.hypot(scenery[i].x-scenery[j].x,scenery[i].z-scenery[j].z)>=scenery[i].radius+scenery[j].radius+8,
  'street-side roofs and tree crowns do not intersect on inside bends');
 const engine=new RaceEngine({obstacles:sceneObstacles()}),landmarks=harborLandmarkPlacements();
 assert.equal(landmarks.filter(item=>item.kind==='tower-bridge-tower').length,4);
 assert.equal(landmarks.filter(item=>item.kind==='london-bus').length,3);
 for(const kind of ['big-ben','london-eye'])assert.ok(landmarks.some(item=>item.kind===kind));
 for(const item of landmarks){
  const nearest=projectTrack(item.x,item.z);assert.ok(nearest.distance<350,'landmarks must be close enough to see from the chase camera');
  if(item.kind==='london-eye')continue; // Open wheel interior is intentionally not a solid cylinder.
  const car={x:item.x,y:item.z,elevation:0,angle:item.angle,speed:0,height:25};
  assert.ok(engine.obstacleWorld.resolveCar(car)>0,`${item.kind} needs physical collision`);
 }
 for(const bridge of TRACK.bridges)for(let s=bridge.s-bridge.halfSpan-100;s<bridge.s+bridge.halfSpan+100;s+=13){
  for(const lane of [-30,0,30]){
   const car={...trackPoint(s,lane),height:25,speed:0};assert.equal(engine.obstacleWorld.resolveCar(car),0,'both race lanes clear every tower and rail');
  }
  const camera=updateChaseCamera({...trackPoint(s),speed:350},null);
  const probe={x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:0,speed:0};
  assert.equal(engine.obstacleWorld.resolveCar(probe),0,'chase camera clears bridge arches and crossbeams');
 }
});

test('London uploads finite detailed geometry and distinct gentle ground palettes for the original seven maps',()=>{
 assert.equal(new Set(Object.values(TERRAIN_PALETTES)).size,11);
 setTrack('coast-london');const gl=fakeGL(),renderer=new RaceRenderer({width:1440,height:820,getContext:()=>gl,addEventListener(){}});
 assert.equal(renderer.available,true,renderer.error);let floats=0;
 for(const buffer of gl.buffers.values()) {floats+=buffer.length;for(const value of buffer)assert.ok(Number.isFinite(value));}
 assert.ok(floats<10_000_000,'batched meshes stay under a 40 MB GPU geometry budget');
 const props=gl.buffers.get(renderer.meshes.props.buffer);let maxHeight=0;
 for(let i=0;i<props.length;i+=11)maxHeight=Math.max(maxHeight,props[i+1]);
 assert.ok(maxHeight>410,'the complete London Eye wheel is included in real world geometry');
});
