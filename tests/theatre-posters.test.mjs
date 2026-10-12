import test from 'node:test';
import assert from 'node:assert/strict';
import { setTrack, RaceEngine } from '../engine.js';
import { THEATRE_POSTERS, theatrePosterSurfaces } from '../london-theatres.js';
import { RaceRenderer, londonLandmarkPlacements, lookAt, multiply, perspective } from '../renderer.js';

function mockGL(){
 const calls=[],gl={calls};let id=0,activeProgram,boundBuffer;
 for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
 gl.getShaderParameter=gl.getProgramParameter=()=>true;
 gl.getAttribLocation=(_,name)=>({aPosition:0,aUV:1,aNormal:1,aColor:2,aEmission:3})[name];
 gl.getUniformLocation=(_,name)=>name;
 for(const name of ['uniformMatrix4fv','deleteBuffer','drawArrays','shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindTexture','texImage2D','texParameteri','enable','depthFunc','disable','clearColor','blendFunc','enableVertexAttribArray','vertexAttribPointer','depthMask','useProgram','disableVertexAttribArray','activeTexture','uniform1i','uniform1f','uniform3fv','viewport','scissor','clear','pixelStorei','bufferData'])gl[name]=(...args)=>calls.push([name,...args]);
 gl.bindBuffer=(_,buffer)=>{boundBuffer=buffer;};gl.useProgram=value=>{activeProgram=value;};
 gl.drawArrays=(...args)=>calls.push(['draw',activeProgram,boundBuffer,...args]);
 return gl;
}
const project=(matrix,point)=>{
 const v=[...point,1],q=[0,0,0,0];for(let r=0;r<4;r++)for(let c=0;c<4;c++)q[r]+=matrix[c*4+r]*v[c];return [q[0]/q[3],q[1]/q[3]];
};

test('poster UVs read left-to-right and upright on rotated street façades, ahead of fallback artwork',()=>{
 for(const angle of [0,.7,Math.PI,-1.2])for(const source of THEATRE_POSTERS){
  const item={kind:source.kind,x:100,z:200,elevation:12,angle};
  const [surface]=theatrePosterSurfaces([item]),cs=Math.cos(angle),sn=Math.sin(angle);
  const center=[item.x+cs*source.x-sn*(source.z-1.1),source.y+12,item.z+sn*source.x+cs*(source.z-1.1)];
  const vp=multiply(perspective(Math.PI/3,1),lookAt([center[0]+sn*150,center[1],center[2]-cs*150],center));
  const vertices=Array.from({length:6},(_,i)=>Array.from(surface.vertices.slice(i*5,i*5+5)));
  const [bottomLeft,topLeft,topRight]=vertices;
  assert.deepEqual(bottomLeft.slice(3),[0,0]);assert.deepEqual(topRight.slice(3),[1,1]);
  assert.ok(project(vp,bottomLeft.slice(0,3))[0]<project(vp,topRight.slice(0,3))[0]);
  assert.ok(project(vp,topLeft.slice(0,3))[1]>project(vp,bottomLeft.slice(0,3))[1]);
  for(const v of vertices){
   const localZ=-(v[0]-item.x)*sn+(v[2]-item.z)*cs;
   assert.ok(Math.abs(localZ-(source.z-1.1))<.0001);
  }
 }
 assert.deepEqual(theatrePosterSurfaces([]),[]);
});

test('real posters load locally, preserve original aspect, draw in both views and cache across city rebuilds',t=>{
 const oldImage=globalThis.Image,oldInline=globalThis.__TWIN_TURBO_POSTERS__,images=[];
 globalThis.Image=class{constructor(){images.push(this);}naturalWidth=700;naturalHeight=1000;};
 globalThis.__TWIN_TURBO_POSTERS__={mormon:'data:image/jpeg;base64,offline'};
 t.after(()=>{globalThis.Image=oldImage;globalThis.__TWIN_TURBO_POSTERS__=oldInline;setTrack('coast');});
 setTrack('coast-london');const gl=mockGL(),renderer=new RaceRenderer({width:1200,height:700,getContext:()=>gl,addEventListener(){}}),engine=new RaceEngine();
 assert.equal(renderer.available,true,renderer.error);assert.equal(renderer.posterMeshes.length,3);
 assert.equal(images.filter(image=>image.src.includes('/posters/')).length,2);
 assert.ok(images.some(image=>image.src==='data:image/jpeg;base64,offline'));
 renderer.render(engine);assert.equal(gl.calls.filter(call=>call[0]==='draw'&&call[1]===renderer.posterProgram).length,0,'pending images retain original illustration');
 for(const image of images)image.onload();
 assert.equal(renderer.textures['poster:lion'].aspect,.7);
 gl.calls.length=0;renderer.render(engine);
 assert.equal(gl.calls.filter(call=>call[0]==='draw'&&call[1]===renderer.posterProgram).length,6);
 assert.equal(gl.calls.filter(call=>call[0]==='uniform1f'&&call[1]==='uImageAspect'&&call[2]===.7).length,6,'actual image aspect reaches contain shader in both views');
 renderer.setSinglePlayer(true);gl.calls.length=0;renderer.render(engine);
 assert.equal(gl.calls.filter(call=>call[0]==='draw'&&call[1]===renderer.posterProgram).length,3);
 const before=images.length;setTrack('coast-beijing');renderer.rebuild();assert.equal(renderer.posterMeshes.length,0);
 setTrack('coast-london');renderer.rebuild();assert.equal(renderer.posterMeshes.length,3);assert.equal(images.length,before,'map switching reuses loaded textures');
 renderer.textures['poster:wrong'].ready=0;gl.calls.length=0;renderer.render(engine);
 assert.equal(gl.calls.filter(call=>call[0]==='draw'&&call[1]===renderer.posterProgram).length,2,'one failed texture does not break remaining ads');
});

test('stale image callbacks cannot upload into a restored WebGL texture state',t=>{
 const old=globalThis.Image,images=[];globalThis.Image=class{constructor(){images.push(this);}naturalWidth=600;naturalHeight=900;};t.after(()=>{globalThis.Image=old;});
 const gl=mockGL(),renderer=Object.assign(Object.create(RaceRenderer.prototype),{gl,textures:{}});
 renderer._loadTexture('poster:lion','./first.jpg');const first=renderer.textures['poster:lion'];
 renderer._loadTexture('poster:lion','./second.jpg');const second=renderer.textures['poster:lion'];
 images[0].onload();assert.equal(first.ready,0);assert.equal(second.ready,0);
 images[1].onload();assert.equal(second.ready,1);assert.equal(second.aspect,2/3);
});
