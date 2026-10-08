import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, TRACKS, RaceEngine, setTrack, trackPoint, projectTrack } from '../engine.js';
import { RaceAI } from '../ai.js';
import { RaceRenderer, sceneObstacles, updateChaseCamera, TERRAIN_PALETTES } from '../renderer.js';
import { cityLandmarkPlacements, citySceneryPlacements, addCityLandmark, addCityStreetScenery } from '../city-scenery.js';
const cities=['coast-beijing','coast-austin','coast-rio','coast-paris'];
test.afterEach(()=>setTrack('coast'));

class BoundsMesh {
 constructor(center){this.center=center;this.radius=0;this.height=0;this.vertices=0;}
 vertex(p){assert.ok(p.every(Number.isFinite));this.radius=Math.max(this.radius,Math.hypot(p[0]-this.center.x,p[2]-this.center.z));this.height=Math.max(this.height,p[1]);this.vertices++;}
 triangle(...points){points.slice(0,3).forEach(p=>this.vertex(p));}
 quad(...points){points.slice(0,4).forEach(p=>this.vertex(p));}
 box(x,y,z,w,h,d,color,angle=0){assert.ok(w>0&&h>0&&d>0);for(const a of [-1,1])for(const b of [-1,1])for(const c of [-1,1])this.vertex([x+Math.cos(angle)*a*w/2-Math.sin(angle)*c*d/2,y+b*h/2,z+Math.sin(angle)*a*w/2+Math.cos(angle)*c*d/2]);}
 cone(x,y,z,r,h,color,sides=8,top=0,phase=0){assert.ok(h>0&&r>0&&top>=0);for(let i=0;i<sides;i++)for(const up of [false,true]){const a=i/sides*Math.PI*2+phase;this.vertex([x+Math.cos(a)*(up?top:r),y+(up?h:0),z+Math.sin(a)*(up?top:r)]);}}
}
function fakeGL(){
 const gl={buffers:new Map()};let bound,id=0;
 for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
 gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_,name)=>name;
 gl.bindBuffer=(_,buffer)=>{bound=buffer;};gl.bufferData=(_,array)=>gl.buffers.set(bound,array);
 for(const name of ['uniformMatrix4fv','deleteBuffer','drawArrays','shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindTexture','texImage2D','texParameteri','enable','depthFunc','disable','clearColor','blendFunc','enableVertexAttribArray','vertexAttribPointer','depthMask','useProgram','disableVertexAttribArray','activeTexture','uniform1i','uniform1f','uniform3fv','viewport','scissor','clear','pixelStorei'])gl[name]=()=>{};
 return gl;
}
for(const id of cities)test(`${id}: authentic landmark silhouettes fit reserved plots and detailed street buildings never overlap`,()=>{
 setTrack(id);const landmarks=cityLandmarkPlacements(),scenery=citySceneryPlacements();assert.ok(landmarks.length>=3);assert.ok(scenery.length>90);
 const kinds=new Set(landmarks.map(item=>item.kind));
 const required={'coast-beijing':['temple-of-heaven','palace-gate','beijing-paifang'],'coast-austin':['texas-capitol','music-guitar','austin-music-hall','ut-tower','football-team','austin-bridge-foot'],
  'coast-rio':['christ-redeemer','sugarloaf','lapa-aqueduct'],'coast-paris':['eiffel-tower','arc-de-triomphe','louvre-pyramid','paris-bridge-pylon']}[id];
 for(const kind of required)assert.ok(kinds.has(kind),kind);
 for(const item of landmarks){
  assert.ok(projectTrack(item.x,item.z).distance>TRACK.roadWidth/2+item.radius+4,`${item.kind} road clearance`);
  if(item.kind==='austin-bridge-foot')continue;
  const mesh=new BoundsMesh(item);addCityLandmark(mesh,item);assert.ok(mesh.vertices>150,`${item.kind} has model detail`);
  assert.ok(mesh.radius<=item.radius+.25,`${item.kind} visible footprint ${mesh.radius} exceeds reserved ${item.radius}`);
 }
 for(let i=0;i<scenery.length;i++){
  const item=scenery[i],mesh=new BoundsMesh(item);addCityStreetScenery(mesh,item);
  assert.ok(mesh.radius<=item.radius+.25,`${item.kind} footprint ${mesh.radius}/${item.radius}`);
  assert.ok(projectTrack(item.x,item.z).distance>=TRACK.roadWidth/2+item.radius+18);
  for(let j=i+1;j<scenery.length;j++)assert.ok(Math.hypot(item.x-scenery[j].x,item.z-scenery[j].z)>=item.radius+scenery[j].radius+7);
  for(const landmark of landmarks)assert.ok(Math.hypot(item.x-landmark.x,item.z-landmark.z)>=item.radius+landmark.radius+25);
 }
});
for(const id of cities)test(`${id}: complete GPU meshes are finite, under 40 MB, and car lanes stay clear`,()=>{
 setTrack(id);assert.ok(TERRAIN_PALETTES[id]);const gl=fakeGL(),renderer=new RaceRenderer({width:1440,height:820,getContext:()=>gl,addEventListener(){}});
 assert.equal(renderer.available,true,renderer.error);let floats=0;
 for(const array of gl.buffers.values()){floats+=array.length;for(const value of array)assert.ok(Number.isFinite(value));}
 assert.ok(floats<10_000_000,`${floats*4/1e6} MB geometry`);
 const engine=new RaceEngine({obstacles:renderer.obstacles});
 for(let s=0;s<TRACK.length;s+=31)for(const lane of [-30,0,30]){
  const car={...trackPoint(s,lane),height:25,speed:0};assert.equal(engine.obstacleWorld.resolveCar(car),0,`${id} ${s}/${lane} car obstruction`);
 }
 for(let offset=100;offset<240;offset+=7){
  const camera=updateChaseCamera({...trackPoint(TRACK.startDistance+offset),speed:363},null);
  const probe={x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:0,speed:0};
  assert.equal(engine.obstacleWorld.resolveCar(probe),0,`${id} finish gantry intersects chase camera`);
 }
 for(const bridge of TRACK.bridges||[])for(let s=bridge.s-bridge.halfSpan-200;s<bridge.s+bridge.halfSpan+200;s+=17){
  const camera=updateChaseCamera({...trackPoint(s),speed:363},null);
  const probe={x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:0,speed:0};
  assert.equal(engine.obstacleWorld.resolveCar(probe),0,`${id} camera blocked at ${s}`);
 }
});
for(const id of cities)test(`${id}: both drivers finish real 1-lap and 3-lap races with no rescue`,()=>{
 setTrack(id);const obstacles=sceneObstacles();
 for(const laps of [1,3]){
  const engine=new RaceEngine({laps,obstacles}).start(laps),drivers=[new RaceAI({carId:1}),new RaceAI({carId:2})];
  for(let frame=0;frame<60*230&&engine.state!=='finished';frame++)engine.step(1/60,new Set(drivers.flatMap(driver=>[...driver.update(engine,1/60)])));
  assert.equal(engine.state,'finished');assert.deepEqual(drivers.map(driver=>driver.rescues),[0,0]);
  for(const car of engine.cars){assert.equal(car.lap,laps);assert.ok(car.bestLap>40&&car.bestLap<65,`${id}: ${car.bestLap}`);}
 }
});

test('all five city skies bind only the clouds image and use a plain gradient while it loads',()=>{
 for(const id of ['coast-london',...cities]){
  setTrack(id);const gl=fakeGL(),bound=[],uniforms=new Map();gl.bindTexture=(_,texture)=>bound.push(texture);gl.uniform1f=(key,value)=>uniforms.set(key,value);
  const renderer=new RaceRenderer({width:1000,height:600,getContext:()=>gl,addEventListener(){}});
  assert.ok(renderer.sceneUrls.clouds.endsWith('/assets/cloud-sky.jpg'));
  const camera=updateChaseCamera({...trackPoint(TRACK.startDistance),speed:0},null);bound.length=0;
  renderer._sky(camera,{coast:.2,alpine:.3,city:.5},.8);
  assert.deepEqual(bound,[renderer.textures.clouds.texture,renderer.textures.clouds.texture,renderer.textures.clouds.texture]);
  for(const key of ['uReadyA','uReadyB','uReadyC'])assert.equal(uniforms.get(key),0);
  renderer.textures.clouds.ready=1;renderer._sky(camera,{coast:.2,alpine:.3,city:.5},.8);
  for(const key of ['uReadyA','uReadyB','uReadyC'])assert.equal(uniforms.get(key),1);
 }
 setTrack('coast');const gl=fakeGL(),bound=[];gl.bindTexture=(_,texture)=>bound.push(texture);
 const renderer=new RaceRenderer({width:1000,height:600,getContext:()=>gl,addEventListener(){}});bound.length=0;
 renderer._sky(updateChaseCamera({...trackPoint(TRACK.startDistance),speed:0},null),{coast:1,alpine:0,city:0},.8);
 assert.deepEqual(bound,[renderer.textures.coast.texture,renderer.textures.alpine.texture,renderer.textures.city.texture]);
});

test('Paris crosses the Seine on two level bridges built on straights, from a flat start boulevard',()=>{
 setTrack('coast-paris');assert.deepEqual(TRACK.bridges.map(bridge=>bridge.kind),['paris-alexandre','paris-pont-neuf']);
 for(const section of TRACK.sections)assert.ok(TRACK.segments.some(segment=>segment.kind==='line'&&section.start>=segment.s&&section.end<=segment.s+segment.length),`${section.name} ramps stay off the corners`);
 for(const bridge of TRACK.bridges){
  for(let s=bridge.s-bridge.halfSpan;s<=bridge.s+bridge.halfSpan;s+=17)assert.ok(Math.abs(trackPoint(s).elevation-bridge.deckHeight)<1e-6,'deck is level over the river');
  for(let s=bridge.s-bridge.halfSpan-600;s<bridge.s+bridge.halfSpan+600;s+=9)assert.ok(Math.abs(trackPoint(s).slope)<=.226);
 }
 for(const grid of TRACK.startGrid)for(const lane of [-30,0,30])assert.equal(trackPoint(TRACK.startDistance+grid.offset,lane).elevation,0);
 const landmarks=cityLandmarkPlacements();assert.equal(landmarks.filter(item=>item.kind==='paris-bridge-pylon').length,4);
 const heights=Object.fromEntries(landmarks.map(item=>{const mesh=new BoundsMesh(item);addCityLandmark(mesh,item);return [item.kind,mesh.height];}));
 assert.ok(heights['eiffel-tower']>400&&heights['eiffel-tower']>2*heights['arc-de-triomphe'],'the Eiffel Tower rises above the skyline');
});
