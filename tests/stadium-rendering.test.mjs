import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, setTrack, trackPoint, projectTrack } from '../src/engine.js';
import { RaceRenderer, stadiumLoopAt, stadiumBridgeSupports, roadsideLamps, cornerMarkers, updateChaseCamera } from '../src/renderer.js';
import { ObstacleWorld } from '../src/collisions.js';
test.afterEach(()=>setTrack('coast'));
function fakeGL(){
 const gl={buffers:new Map()};let bound,id=0;
 for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
 gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_,name)=>name;
 gl.bindBuffer=(_,buffer)=>{bound=buffer;};gl.bufferData=(_,array)=>gl.buffers.set(bound,array);
 for(const name of ['uniformMatrix4fv','deleteBuffer','drawArrays','shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindTexture','texImage2D','texParameteri','enable','depthFunc','disable','clearColor','blendFunc','enableVertexAttribArray','vertexAttribPointer','depthMask','useProgram','disableVertexAttribArray','activeTexture','uniform1i','uniform1f','uniform3fv','viewport','scissor','clear','pixelStorei'])gl[name]=()=>{};
 return gl;
}
test('the stadium running surface and lighting use the actual loop metadata and keep directional safety signs',()=>{
 setTrack('coast-beijing');const stadium=TRACK.stadium;assert.ok(stadium);
 assert.equal(stadiumLoopAt(stadium.loopStart-1),false);assert.equal(stadiumLoopAt(stadium.loopStart+1),true);
 assert.equal(stadiumLoopAt(stadium.loopEnd-1),true);assert.equal(stadiumLoopAt(stadium.loopEnd+1),false);
 assert.equal(stadiumLoopAt(stadium.loopStart+TRACK.length+1),true);
 assert.ok(roadsideLamps().length>30);assert.ok(roadsideLamps().every(lamp=>!stadiumLoopAt(lamp.s)),'ordinary city lamps must not cross the stadium view');
 assert.ok(roadsideLamps().every(lamp=>lamp.s<stadium.start-250||lamp.s>stadium.end+250),'city lamps must also leave the layered portal approaches and their chase cameras clear');
 assert.ok(cornerMarkers().filter(marker=>stadiumLoopAt(marker.s)).length>8,'technical inner turns still need visible warning signs');
 const gl=fakeGL(),renderer=new RaceRenderer({width:1440,height:820,getContext:()=>gl,addEventListener(){}});assert.equal(renderer.available,true,renderer.error);
 const data=gl.buffers.get(renderer.meshes.road.buffer);const colors={red:[143/255,64/255,57/255],alternate:[151/255,72/255,62/255],white:[238/255,226/255,204/255]};let red=0,white=0;
 for(let i=0;i<data.length;i+=11){
  const has=expected=>expected.every((v,j)=>Math.abs(data[i+6+j]-v)<1e-6),isRed=has(colors.red)||has(colors.alternate),isWhite=has(colors.white);
  if(!isRed&&!isWhite)continue;
  const p=projectTrack(data[i],data[i+2],(stadium.loopStart+stadium.loopEnd)/2,data[i+1]);
  assert.ok(p.s>=stadium.loopStart-11&&p.s<=stadium.loopEnd+11,'running-track paint leaked onto another road branch');
  assert.ok(Math.abs(data[i+1]-p.elevation-(isRed?.7:.94))<.01,'paint follows real road elevation and remains above the field');
  if(isRed)red++;else white++;
 }
 assert.ok(red>1000&&white>5000,'actual GPU road must contain red rubber and all white running lanes');
 setTrack('coast-london');assert.equal(stadiumLoopAt(stadium.loopStart),false,'stadium styling must not affect another map');
});

test('the elevated inner straight retains real ramp-following rails while bridge supports clear every lower-road and camera layer',()=>{
 setTrack('coast-beijing');const stadium=TRACK.stadium,gl=fakeGL(),renderer=new RaceRenderer({width:1440,height:820,getContext:()=>gl,addEventListener(){}});
 assert.equal(renderer.available,true,renderer.error);assert.ok(stadium.bridge);
 const world=new ObstacleWorld(renderer.obstacles),supports=[];let elevatedInnerSamples=0,blockedSupports=0,acceptedSupports=0;
 for(let s=stadium.loopStart+12;s<Math.min(stadium.loopEnd,stadium.bridge.end)-12;s+=17){
  const center=trackPoint(s);if(center.elevation<=8)continue;elevatedInnerSamples++;
  for(const side of [-1,1]){const p=trackPoint(s,side*(TRACK.roadWidth/2+15));assert.ok(world.resolveCar({...p,elevation:p.elevation+9,height:5,speed:0})>0,'elevated inner-loop rail is missing');}
 }
 assert.ok(elevatedInnerSamples>30,'the test must cover the real elevated first straight and descending ramp');
 for(let s=0,i=0;s<TRACK.length;s+=47,i++)if(i%5===0&&trackPoint(s).elevation>70)for(const side of[-1,1]){
  const boxes=stadiumBridgeSupports(s,side);if(!boxes.length)blockedSupports++;else acceptedSupports++;
  for(const b of boxes){const hull={type:'box',x:b.x,y:b.z,halfWidth:b.w/2,halfDepth:b.d/2,angle:b.angle,minHeight:b.y-b.h/2,maxHeight:b.y+b.h/2};supports.push(hull);assert.ok(renderer.obstacles.some(actual=>Object.entries(hull).every(([k,v])=>typeof v==='number'?Math.abs(actual[k]-v)<1e-7:actual[k]===v)),'approved cantilever is absent from production');}
 }
 assert.ok(blockedSupports>0,'crossing supports must be omitted');assert.ok(acceptedSupports>0,'safe cantilever supports remain visible');
 const supportWorld=new ObstacleWorld(supports),edge=TRACK.roadWidth/2-world.carRadius;
 for(let s=0;s<TRACK.length;s+=6)for(const lane of[-edge,0,edge]){
  const p=trackPoint(s,lane);assert.equal(supportWorld.resolveCar({...p,height:25,speed:0}),0,`bridge support blocks lower car at ${s}`);
  for(const speed of [0,363,517]){const camera=updateChaseCamera({...p,speed,boosting:speed===517},null);assert.equal(supportWorld.resolveCar({x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:p.angle,speed:0}),0,`bridge support blocks camera at ${s}/${lane}`);}
 }
});
