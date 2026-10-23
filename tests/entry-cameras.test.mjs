import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACK,TRACKS,setTrack,RaceEngine} from '../engine.js';
import {RaceRenderer,harborLandmarkPlacements,sceneObstacles,sceneEntryBoundary,updateChaseCamera,roadsideLamps} from '../renderer.js';
import {createEntryCameraPlan,entryCameraForProgress,entrySegmentBlocked,ENTRY_CAMERA_CUTS} from '../entry-cameras.js';

test.afterEach(()=>setTrack('coast'));
const mainKinds=['london-eye','palace-gate','oriental-pearl','christ-redeemer','texas-capitol','eiffel-tower'];

test('all twelve production maps have three finite clear intro shots ending at the exact snapped chase camera',()=>{
  for(const [index,id]of Object.keys(TRACKS).entries()){
    setTrack(id);const engine=new RaceEngine(),car=engine.cars[0],before=structuredClone(engine),trackBefore=JSON.stringify(TRACK);
    const obstacles=sceneObstacles(),landmarks=harborLandmarkPlacements(),lamps=roadsideLamps(),chase=updateChaseCamera(car,null);
    const plan=createEntryCameraPlan(TRACK,car,{landmarks,obstacles,lamps,boundary:sceneEntryBoundary(),chase});
    const lampBodies=lamps.flatMap(lamp=>['mast','arm','head'].map(key=>{
      const {position:p,size:s}=lamp[key];return {type:'box',x:p[0],y:p[2],halfWidth:s[0]/2,halfDepth:s[2]/2,angle:lamp.angle,minHeight:p[1]-s[1]/2,maxHeight:p[1]+s[1]/2};
    }));
    assert.equal(plan.shots.length,3);
    if(index<6)assert.equal(plan.shots[0].kind,mainKinds[index]);
    if(index<6){
      const [wide,orbit,landing]=plan.shots;
      assert.deepEqual(plan.shots.map(s=>s.movement),['push','orbit','descend']);
      assert.ok(wide.from.eye[1]>orbit.from.eye[1]+160,'high context and street-level orbit must look different');
      assert.ok(orbit.from.eye[1]<120,'second city shot remains near street level');
      assert.ok(Math.hypot(...wide.from.eye.map((v,i)=>v-wide.to.eye[i]))>300,'wide shot must translate forward substantially, not only change FOV');
      assert.ok(Math.abs(orbit.orbit.sweep)>25*Math.PI/180&&Math.abs(orbit.orbit.sweep)<40*Math.PI/180);
      assert.ok(orbit.orbit.toRadius<orbit.orbit.fromRadius*.8,'orbit gradually closes distance too');
      const middle=entryCameraForProgress(TRACK,car,.48,plan),chord=orbit.from.eye.map((v,i)=>(v+orbit.to.eye[i])/2);
      assert.ok(Math.hypot(middle.eye[0]-chord[0],middle.eye[2]-chord[2])>10,'middle of the orbit follows a real curve rather than a straight chord');
      assert.ok(landing.from.eye[1]>landing.to.eye[1]+100,'final shot descends onto the car');
      const settle=entryCameraForProgress(TRACK,car,.01,plan);assert.deepEqual(settle.eye,wide.from.eye,'initial framing briefly settles before the push');
    }
    for(let i=0;i<=100;i++){
      const view=entryCameraForProgress(TRACK,car,i/100,plan);
      assert.ok([...view.eye,...view.target,view.fov,view.angle].every(Number.isFinite),id);
      assert.ok(Math.hypot(...view.eye.map((v,i)=>v-view.target[i]))>50,id);
      assert.ok(view.fov>.5&&view.fov<1.3,id);
      assert.equal(entrySegmentBlocked(view.eye,view.eye,obstacles,3),false,`${id}: camera body ${i}% ${view.kind} ${JSON.stringify(view.eye)}`);
      const subject=plan.shots[view.shot].subject;
      if(subject){
        const distance=Math.hypot(view.eye[0]-subject.x,view.eye[2]-subject.z),stop=Math.max(0,Math.min(.96,1-(subject.radius+28)/distance));
        const foreground=view.eye.map((v,k)=>v+(view.target[k]-v)*stop);
        assert.equal(entrySegmentBlocked(view.eye,foreground,obstacles,7),false,`${id}: unobstructed approach to ${view.kind} at ${i}%`);
        if(index<6){
          const side=[-(subject.z-view.eye[2])/distance,(subject.x-view.eye[0])/distance],base=subject.elevation||0,h=subject.viewHeight;
          const targets=[[subject.x,base+h*.22,subject.z],view.target,[subject.x,base+h*.82,subject.z],
            ...[-1,1].map(sign=>[subject.x+side[0]*subject.radius*.35*sign,base+h*.5,subject.z+side[1]*subject.radius*.35*sign])];
          for(const target of targets)assert.equal(entrySegmentBlocked(view.eye,target,lampBodies,10),false,`${id}: lamp-free central/roof silhouette at ${i}%`);
        }
      }
    }
    for(const cut of ENTRY_CAMERA_CUTS){assert.notEqual(entryCameraForProgress(TRACK,car,cut-1e-6,plan).shot,entryCameraForProgress(TRACK,car,cut,plan).shot);}
    const final=entryCameraForProgress(TRACK,car,1,plan);
    for(const field of ['eye','target','angle','fov'])assert.deepEqual(final[field],chase[field],`${id}: exact ${field}`);
    const almost=entryCameraForProgress(TRACK,car,1-1e-6,plan);
    assert.ok(Math.hypot(...almost.eye.map((v,i)=>v-final.eye[i]))<1e-5,'third shot eases smoothly to the final chase position');
    assert.ok(Math.abs(almost.angle-final.angle)<1e-8,'sky heading also settles without a final side-offset jump');
    for(let k=0;k<3;k++)assert.ok(plan.shots[k].from.eye.some((v,i)=>Math.abs(v-plan.shots[k].to.eye[i])>1),`${id}: shot ${k} pushes in`);
    assert.deepEqual(structuredClone(engine),before,'sampling presentation cannot advance countdown/cars/clock');
    assert.equal(JSON.stringify(TRACK),trackBefore,'sampling presentation cannot alter a route');
  }
});

test('intro sampling is deterministic, accepts finite clamped progress, and never switches the global track',()=>{
  setTrack('coast');const car=new RaceEngine().cars[0],track=TRACKS['coast-beijing'],before=TRACK;
  for(const p of [-1,0,.2,.5,.9,1,2,NaN]){
    assert.deepEqual(entryCameraForProgress(track,car,p),entryCameraForProgress(track,car,p));
    assert.equal(TRACK,before);
  }
  const landscape=createEntryCameraPlan(track,car),portrait=createEntryCameraPlan(track,car,{aspect:390/844});
  assert.ok(portrait.shots[0].from.fov>landscape.shots[0].from.fov,'portrait framing preserves the wide subject');
  assert.deepEqual(portrait.shots[2].to,landscape.shots[2].to,'responsive intro framing never changes normal chase');
});

function fakeGL(){
  const gl={viewports:[],eyes:[]};let id=0;
  for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
  gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_,name)=>name;
  for(const name of ['uniformMatrix4fv','bufferData','bufferSubData','deleteBuffer','drawArrays','shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindBuffer','bindTexture','texImage2D','texParameteri','enable','depthFunc','disable','clearColor','blendFunc','enableVertexAttribArray','vertexAttribPointer','depthMask','useProgram','disableVertexAttribArray','activeTexture','uniform1i','uniform1f','scissor','clear','pixelStorei'])gl[name]=()=>{};
  gl.viewport=(...v)=>gl.viewports.push(v);gl.uniform3fv=(name,v)=>{if(name==='uEye')gl.eyes.push([...v]);};
  return gl;
}
test('renderer entry override uses one full viewport in local mode then restores two chase views without touching race state',()=>{
  setTrack('coast-london');const gl=fakeGL(),renderer=new RaceRenderer({width:1281,height:720,getContext:()=>gl,addEventListener(){}}),engine=new RaceEngine();
  assert.equal(renderer.available,true,renderer.error);engine.start();const before=structuredClone(engine);
  for(const progress of [0,.2,.4,.7,1]){
    gl.viewports.length=0;renderer.setEntryProgress(progress).render(engine,1/60,1234);
    assert.deepEqual(gl.viewports,[[0,0,1281,720]]);assert.ok(renderer.entryCamera);
    assert.deepEqual(gl.eyes.at(-1),renderer.entryCamera.eye);
    assert.deepEqual(structuredClone(engine),before);
  }
  assert.deepEqual(renderer.entryCamera.eye,updateChaseCamera(engine.cars[0],null).eye);
  gl.viewports.length=0;renderer.setEntryProgress(null).render(engine);
  assert.deepEqual(gl.viewports,[[0,0,640,720],[640,0,641,720]]);assert.equal(renderer.entryCamera,null);assert.equal(renderer.entryPlan,null);
  assert.deepEqual(structuredClone(engine),before);
});
