import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, setTrack, trackPoint, projectTrack, RaceEngine } from '../engine.js';
import { RaceRenderer, londonLandmarkPlacements, sceneryPlacements, updateChaseCamera } from '../renderer.js';
import { LONDON_MAGIC_ZONE, londonMagicPlacements, londonMagicBlend, magicLocal } from '../london-magic-layout.js';
import { addLondonMagicScenery, addMagicCharacter } from '../london-magic-models.js';
import { londonMagicState, magicArmMatrix, magicWandPoint, MagicEffects, MAGIC_EFFECT_VERTICES } from '../london-magic-effects.js';
import { ObstacleWorld } from '../collisions.js';

test.afterEach(()=>setTrack('coast'));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
class Probe {
 constructor(){this.vertices=[];this.faces=[];this.colliders=[];}
 triangle(a,b,c,color){for(const p of [a,b,c]){assert.ok(p.every(Number.isFinite));this.vertices.push(p);}this.faces.push({points:[a,b,c],color});}
 quad(a,b,c,d,color){this.triangle(a,b,c,color);this.triangle(a,c,d,color);}
 box(x,y,z,w,h,d,color,angle=0){
  const c=Math.cos(angle),s=Math.sin(angle);
  for(const a of [-1,1])for(const b of [-1,1])for(const e of [-1,1])this.vertices.push([x+c*a*w/2-s*e*d/2,y+b*h/2,z+s*a*w/2+c*e*d/2]);
  this.colliders?.push({type:'box',x,y:z,halfWidth:w/2,halfDepth:d/2,angle,minHeight:y-h/2,maxHeight:y+h/2});
 }
 cone(x,y,z,r,h,color,sides=8,top=0,phase=0){
  for(let i=0;i<sides;i++)for(const up of [false,true]){const a=i/sides*Math.PI*2+phase,rr=up?top:r;this.vertices.push([x+Math.cos(a)*rr,y+(up?h:0),z+Math.sin(a)*rr]);}
  this.colliders?.push({type:'circle',x,y:z,radius:Math.max(r,top),minHeight:y,maxHeight:y+h});
 }
}
function fakeGL(){
 const gl={buffers:new Map(),uniforms:[],draws:[],uploads:[],subloads:[],deletes:[],sources:[],depthWrite:true,blend:false};let bound,program,viewport=0,id=0;
 for(const name of ['ARRAY_BUFFER','STATIC_DRAW','DYNAMIC_DRAW','TRIANGLES','BLEND','SRC_ALPHA','ONE','ONE_MINUS_SRC_ALPHA'])gl[name]=name;
 for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
 gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(program,name)=>({program,name});
 gl.shaderSource=(_,source)=>gl.sources.push(source);gl.useProgram=value=>{program=value;};
 gl.bindBuffer=(_,buffer)=>{bound=buffer;};gl.bufferData=(_,data,usage)=>{gl.buffers.set(bound,data);gl.uploads.push({buffer:bound,usage});};
 gl.bufferSubData=(_,offset,data)=>gl.subloads.push({buffer:bound,offset,count:data.length,viewport});
 gl.deleteBuffer=buffer=>{gl.deletes.push(buffer);gl.buffers.delete(buffer);};
 for(const name of ['uniform1f','uniform1i','uniform3fv'])gl[name]=(location,value)=>gl.uniforms.push({...location,value:Array.isArray(value)?value.slice():value,viewport});
 gl.uniformMatrix4fv=(location,_,value)=>gl.uniforms.push({...location,value:Array.from(value),viewport});
 gl.viewport=x=>{viewport=x;};gl.drawArrays=(_,first,count)=>gl.draws.push({buffer:bound,program,viewport,count,depthWrite:gl.depthWrite,blend:gl.blend,blendMode:gl.blendMode});
 gl.depthMask=value=>{gl.depthWrite=value;};gl.blendFunc=(a,b)=>{gl.blendMode=[a,b];};
 gl.enable=value=>{if(value===gl.BLEND)gl.blend=true;};gl.disable=value=>{if(value===gl.BLEND)gl.blend=false;};
 for(const name of ['compileShader','attachShader','linkProgram','deleteShader','bindTexture','texImage2D','texParameteri','depthFunc','clearColor','enableVertexAttribArray','vertexAttribPointer','disableVertexAttribArray','activeTexture','scissor','clear','pixelStorei'])gl[name]=()=>{};
 return gl;
}
const makeRenderer=()=>{const gl=fakeGL(),renderer=new RaceRenderer({width:1440,height:820,getContext:()=>gl,addEventListener(){}});assert.equal(renderer.available,true,renderer.error);return {renderer,gl};};

test('the London scenery district follows each car position, fades continuously and cannot latch after rescue or reverse driving',()=>{
 setTrack('coast-london');const {start,end,fade}=LONDON_MAGIC_ZONE;
 const at=(s,lane=0)=>({...trackPoint(s,lane),_lastTrackS:s});
 assert.equal(londonMagicBlend(at(start-1)),0);assert.equal(londonMagicBlend(at(end+1)),0);
 assert.equal(londonMagicBlend(at(start)),0);assert.equal(londonMagicBlend(at(end)),0);
 assert.ok(Math.abs(londonMagicBlend(at(start+fade/2))-.5)<1e-7);
 assert.equal(londonMagicBlend(at(start+fade)),1);assert.equal(londonMagicBlend(at(end-fade)),1);
 const car=at(6810);assert.equal(londonMagicBlend(car),1);car.angle+=Math.PI;assert.equal(londonMagicBlend(car),1);
 Object.assign(car,at(4300));assert.equal(londonMagicBlend(car),0,'checkpoint rescue restores daylight immediately');
 assert.equal(londonMagicBlend(at(6810,550)),0,'night cannot follow a car into remote plots');
 assert.equal(londonMagicBlend({...at(6810),elevation:200}),0);
 for(let s=start-.1;s<=end+.1;s+=4)assert.ok(Math.abs(londonMagicBlend(at(s+.1))-londonMagicBlend(at(s)))<.001);
 setTrack('coast-beijing');assert.deepEqual(londonMagicPlacements(),[]);assert.equal(londonMagicBlend(car),0);
});

test('castle, open gates and raised duel platforms fit their real plots and preserve all 56 landmarks and ordinary streets',()=>{
 setTrack('coast-london');const old=londonLandmarkPlacements(),streets=sceneryPlacements(),items=londonMagicPlacements();
 assert.equal(old.length,56);assert.equal(items.length,5);
 for(const item of items){
  const probe=new Probe();addLondonMagicScenery(probe,[item]);assert.ok(probe.colliders.length>=2);
  for(const p of probe.vertices){assert.ok(Math.hypot(p[0]-item.x,p[2]-item.z)<=item.radius+.01,`${item.kind}: protruding detail`);assert.ok(p[1]>=item.elevation-.01&&p[1]<=item.elevation+item.height,`${item.kind}: wrong height`);}
  const plots=item.kind==='magic-gate'?[-107,107].map(x=>{const p=magicLocal(item,x,0,0);return {x:p[0],z:p[2],radius:20};}):[item];
  if(item.kind==='magic-gate'){const heading=trackPoint(item.s).angle;assert.ok(Math.sin(item.angle)*Math.cos(heading)-Math.cos(item.angle)*Math.sin(heading)<-.999,'gate lettering faces the approaching driver');}
  for(const plot of plots){
   assert.ok(projectTrack(plot.x,plot.z).distance>TRACK.roadWidth/2+plot.radius+10,`${item.kind}: intersects racing road`);
   assert.ok(Math.abs(plot.z-TRACK.river.centerZ)>TRACK.river.halfWidth+plot.radius+10,`${item.kind}: in river`);
   for(const other of [...old,...streets])assert.ok(Math.hypot(plot.x-other.x,plot.z-other.z)>plot.radius+other.radius+5,`${item.kind} overlaps ${other.kind}`);
  }
 }
 const all=new Probe();addLondonMagicScenery(all,items);const world=new ObstacleWorld(all.colliders),edge=TRACK.roadWidth/2-world.carRadius;
 for(let s=0;s<TRACK.length;s+=17)for(const lane of [-edge,0,edge]){
  const pose=trackPoint(s,lane);assert.equal(world.resolveCar({...pose,height:25,speed:0}),0,`road obstacle ${s}/${lane}`);
  for(const speed of [0,363,517]){const camera=updateChaseCamera({...pose,speed,boosting:speed===517},null);assert.equal(world.resolveCar({x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:pose.angle,speed:0}),0,`camera obstacle ${s}/${lane}`);}
 }
 for(const item of items){const p=magicLocal(item,item.kind==='magic-gate'?107:item.kind.startsWith('magic-duel')?80:0,1,0);assert.ok(world.resolveCar({x:p[0],y:p[2],elevation:p[1],height:25,angle:0,speed:0})>0,`${item.kind}: actual body is drive-through`);}
 for(let quarter=0;quarter<4;quarter++)assert.ok(streets.filter(item=>item.kind==='terrace'&&Math.floor(projectTrack(item.x,item.z).s/TRACK.length*4)===quarter).length>=12,'wider duels must preserve the surrounding street density');
 assert.deepEqual(londonLandmarkPlacements(),old);assert.deepEqual(sceneryPlacements(),streets);
});

test('native castle roofs and character heads have outward-facing normals',()=>{
 const castle={kind:'hogwarts-castle',x:0,z:0,angle:0,elevation:0},mesh=new Probe();addLondonMagicScenery(mesh,[castle]);
 const normal=points=>cross(points[1].map((n,i)=>n-points[0][i]),points[2].map((n,i)=>n-points[0][i]));
 for(const face of mesh.faces.filter(f=>f.color==='#283449')){const n=normal(face.points);assert.ok(n[1]>=-1e-7,'roof must face the sky');}
 const head=new Probe();addMagicCharacter(head,'voldemort');
 for(const face of head.faces.filter(f=>f.color==='#c2c9bc')){const n=normal(face.points),middle=face.points[0].map((_,i)=>face.points.reduce((sum,p)=>sum+p[i],0)/3),radial=[middle[0],middle[1]-49,middle[2]];assert.ok(n.reduce((sum,v,i)=>sum+v*radial[i],0)>=-1e-7,'head surface points inward');}
});

test('shared-clock duels have distinct phases, visible flight spans, animated arms and a bounded reusable effect payload',()=>{
 setTrack('coast-london');const items=londonMagicPlacements(),effects=new MagicEffects(),data=effects.data,phases=new Set(),counts=new Set(),wandPositions=new Set();let maxCount=0;
 for(let time=0;time<15.2;time+=.023){
  const state=londonMagicState(items,time);assert.equal(state.actors.length,4);assert.equal(state.lights.length,2);phases.add(state.duels[0].phase);
  assert.deepEqual(state,londonMagicState(items,time),'paused or split view observes identical poses');
  for(const actor of state.actors){const m=magicArmMatrix(actor),tip=[0,-1,-24];assert.deepEqual(magicWandPoint(actor),[0,1,2].map(row=>m[row]*tip[0]+m[4+row]*tip[1]+m[8+row]*tip[2]+m[12+row]));}
  wandPositions.add(state.actors[0].wand.map(n=>n.toFixed(2)).join(','));
  for(const duel of state.duels){assert.ok(Math.abs(Math.hypot(duel.actors[0].x-duel.actors[1].x,duel.actors[0].z-duel.actors[1].z)-160)<1e-7);if(duel.phase==='clash')for(const actor of duel.actors)assert.ok(Math.hypot(...actor.wand.map((n,i)=>n-duel.clash[i]))>55,'spell beam must travel visibly between separated stands');}
  effects.update(state);assert.equal(effects.data,data);assert.ok(effects.count<=MAGIC_EFFECT_VERTICES);maxCount=Math.max(maxCount,effects.count);counts.add(effects.count);
  for(let i=0;i<effects.count*11;i++)assert.ok(Number.isFinite(data[i]));
 }
 assert.deepEqual(phases,new Set(['raise','cast','clash','shield','recover']));assert.ok(counts.size>8&&wandPositions.size>30);assert.ok(maxCount>600);
 const a=londonMagicState(items,0).car,b=londonMagicState(items,8).car;assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)>300);assert.notEqual(a.roll,b.roll);
});

test('production split-screen isolates lighting, uploads only one dynamic spell payload, and preserves the complete geometry budget',t=>{
 setTrack('coast-london');const {renderer,gl}=makeRenderer(),engine=new RaceEngine();
 const byteCount=[...gl.buffers.values()].reduce((sum,v)=>sum+v.byteLength,0),magicBuffers=[renderer.meshes.magic,...Object.values(renderer.magicMeshes)],magicBytes=magicBuffers.reduce((sum,m)=>sum+gl.buffers.get(m.buffer).byteLength,0);
 assert.ok(byteCount<40_000_000);assert.ok(magicBytes<1_500_000);assert.equal(gl.uploads.filter(e=>e.usage===gl.DYNAMIC_DRAW).length,1);
 assert.ok(gl.sources.some(source=>source.includes('vec3 moonlight')&&source.includes('uSpellColorA')),'ambient and local lights reach the compiled main shader');
 assert.ok(gl.sources.some(source=>source.includes('image=mix(image,night,uMagic)')),'sky receives its own continuous night mix');
 const production=renderer.obstacles,probe=new Probe();addLondonMagicScenery(probe,londonMagicPlacements());
 for(const hull of probe.colliders)assert.ok(production.some(actual=>Object.entries(hull).every(([key,value])=>typeof value==='number'?Math.abs(actual[key]-value)<1e-7:actual[key]===value)),'scenery body omitted from actual collision world');
 Object.assign(engine.cars[0],trackPoint(6810));Object.assign(engine.cars[1],trackPoint(4300));engine.time=2.2;
 for(const poster of renderer.posterMeshes)renderer.textures[poster.textureKey].ready=1;
 const staticUploads=gl.uploads.length;renderer.resetCameras(engine);renderer.render(engine,0,99999);
 const values=(program,name)=>gl.uniforms.filter(u=>u.program===program&&u.name===name);
 for(const program of [renderer.mainProgram,renderer.skyProgram,renderer.posterProgram])assert.deepEqual(values(program,'uMagic').map(u=>[u.viewport,u.value]),[[0,1],[720,0]],'each viewport uploads its own lighting uniforms');
 const fog=values(renderer.mainProgram,'uFog');assert.notDeepEqual(fog[0].value,fog[1].value);
 for(const suffix of ['A','B']){const light=values(renderer.mainProgram,`uSpellPosition${suffix}`);assert.equal(light.length,2);assert.deepEqual(light[0].value,light[1].value,'shared time must not shift the stage per player');}
 assert.equal(gl.subloads.length,1);assert.equal(gl.subloads[0].buffer,renderer.magicMeshes.effects.buffer);assert.equal(gl.uploads.length,staticUploads,'no static world or actor rebuild per frame');
 const spells=gl.draws.filter(d=>d.buffer===renderer.magicMeshes.effects.buffer);assert.equal(spells.length,2);for(const draw of spells){assert.equal(draw.depthWrite,false);assert.equal(draw.blend,true);assert.deepEqual(draw.blendMode,[gl.SRC_ALPHA,gl.ONE]);}
 assert.equal(gl.depthWrite,true);assert.equal(gl.blend,false);assert.deepEqual(gl.blendMode,[gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA]);
 const oldState=structuredClone(renderer.magicState);renderer.render(engine,0,0);assert.deepEqual(renderer.magicState,oldState,'wall clock cannot advance a paused performance');
 const oldBuffers=magicBuffers.map(m=>m.buffer);engine.selectTrack('coast');renderer.rebuild(engine);assert.equal(renderer.magicState,null);assert.deepEqual(renderer.magicMeshes,{});assert.equal(renderer.meshes.magic.count,0);
 for(const buffer of oldBuffers)assert.ok(gl.deletes.includes(buffer)&&!gl.buffers.has(buffer),'map switch must release all London-only geometry');
 t.diagnostic(`Complete London geometry ${(byteCount/1e6).toFixed(3)} MB; magic static + actors + dynamic ${(magicBytes/1e6).toFixed(3)} MB`);
});
