import test from 'node:test';
import assert from 'node:assert/strict';
import {RaceEngine,setTrack} from '../src/engine.js';
import {RaceRenderer,nitroFlameState,nitroFlameModel} from '../src/renderer.js';

test.afterEach(()=>setTrack('coast'));
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const transform=(m,p)=>[0,1,2].map(row=>m[row]*p[0]+m[row+4]*p[1]+m[row+8]*p[2]+m[row+12]);
test('real nitro charge maps monotonically to exact plume length, with no boost-induced false fuel increase',()=>{
  for(const boosting of [false,true]){
    assert.equal(nitroFlameModel(identity(),{boost:0,boosting}),null);
    for(const [boost,length]of [[25,11],[100,44]]){
      const state=nitroFlameState({boost,boosting});assert.equal(state.length,length);assert.equal(state.active,boosting);
      const matrix=nitroFlameModel(identity(),{boost,boosting});
      assert.deepEqual(transform(matrix,[0,0,6]),[-23,7.199999809265137,6]);
      assert.deepEqual(transform(matrix,[-1,0,6]),[-23-length,7.199999809265137,6]);
    }
  }
  for(const boost of [NaN,undefined,-10])assert.equal(nitroFlameState({boost}).length,0);
  assert.equal(nitroFlameState({boost:200}).length,44);
});

function fakeGL(){
  const gl={buffers:new Map(),draws:[],BLEND:7};let id=0,bound,model,viewport,blend=false,depth=true;
  for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
  gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_,name)=>name;
  for(const name of ['bufferSubData','deleteBuffer','shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindTexture','texImage2D','texParameteri','depthFunc','clearColor','blendFunc','enableVertexAttribArray','vertexAttribPointer','useProgram','disableVertexAttribArray','activeTexture','uniform1i','uniform1f','uniform3fv','scissor','clear','pixelStorei'])gl[name]=()=>{};
  gl.bindBuffer=(_,buffer)=>{bound=buffer;};gl.bufferData=(_,data)=>gl.buffers.set(bound,data);
  gl.uniformMatrix4fv=(name,_,m)=>{if(name==='uModel')model=[...m];};gl.viewport=(...v)=>{viewport=v;};
  gl.enable=value=>{if(value===gl.BLEND)blend=true;};gl.disable=value=>{if(value===gl.BLEND)blend=false;};gl.depthMask=value=>{depth=value;};
  gl.drawArrays=()=>gl.draws.push({buffer:bound,model,viewport,blend,depth});return gl;
}
test('uploaded plumes are tapered 3D glow cones, follow both real cars and disappear empty in both viewports',()=>{
  setTrack('coast');const gl=fakeGL(),renderer=new RaceRenderer({width:1280,height:720,getContext:()=>gl,addEventListener(){}}),engine=new RaceEngine();
  assert.equal(renderer.available,true,renderer.error);
  const active=gl.buffers.get(renderer.meshes.flames.buffer),idle=gl.buffers.get(renderer.meshes.flameIdle.buffer);
  assert.equal(active.length,idle.length);assert.ok(active.length/33<400,'plumes remain small static meshes');
  const bounds=data=>{let lo=Infinity,hi=-Infinity,minAlpha=1,maxAlpha=0,maxRadius=0;for(let o=0;o<data.length;o+=11){lo=Math.min(lo,data[o]);hi=Math.max(hi,data[o]);minAlpha=Math.min(minAlpha,data[o+9]);maxAlpha=Math.max(maxAlpha,data[o+9]);maxRadius=Math.max(maxRadius,Math.hypot(data[o+1],Math.abs(data[o+2])-6));}return{lo,hi,minAlpha,maxAlpha,maxRadius};};
  const a=bounds(active),b=bounds(idle);assert.equal(a.lo,-1);assert.equal(Math.abs(a.hi),0);assert.equal(b.lo,-1);assert.equal(Math.abs(b.hi),0);
  assert.ok(a.maxRadius>b.maxRadius*1.5);assert.ok(a.maxAlpha>b.maxAlpha*1.5);assert.ok(b.maxAlpha>=.49,'coasting charge remains readable without the removed HUD bar');assert.ok(a.minAlpha>0&&a.maxAlpha<1);
  for(const data of [active,idle])for(let o=0;o<data.length;o+=11)if(data[o]===-1){assert.equal(data[o+1],0);assert.equal(Math.abs(data[o+2]),6,'each terminal tip has zero radius');}
  Object.assign(engine.cars[0],{boost:25,boosting:false,angle:.7,elevation:53,slope:.13});
  Object.assign(engine.cars[1],{boost:100,boosting:true,angle:-1.1,elevation:118,slope:-.09});
  const before=structuredClone(engine.cars);renderer.render(engine);
  for(const [index,mesh,length]of [[0,renderer.meshes.flameIdle,11],[1,renderer.meshes.flames,44]]){
    const flames=gl.draws.filter(d=>d.buffer===mesh.buffer);assert.equal(flames.length,2,'one flame pair in each player viewport');
    const carDraw=gl.draws.find(d=>d.buffer===renderer.meshes.cars[index].buffer);
    for(const flame of flames){
      assert.deepEqual(flame.model,[...nitroFlameModel(carDraw.model,engine.cars[index])]);
      assert.ok(flame.blend&&!flame.depth,'light is translucent and does not write a hard depth wall');
      const base=transform(flame.model,[0,0,6]),tip=transform(flame.model,[-1,0,6]);
      assert.ok(Math.abs(Math.hypot(...tip.map((n,i)=>n-base[i]))-length)<.001);
      assert.ok((tip[0]-base[0])*Math.cos(engine.cars[index].angle)+(tip[2]-base[2])*Math.sin(engine.cars[index].angle)<0,'the plume always points behind the actual car');
    }
  }
  assert.deepEqual(engine.cars,before,'fuel visualization cannot consume/regenerate charge');
  for(const car of engine.cars)car.boost=0;gl.draws.length=0;renderer.render(engine);
  assert.equal(gl.draws.filter(d=>d.buffer===renderer.meshes.flames.buffer||d.buffer===renderer.meshes.flameIdle.buffer).length,0);
});
