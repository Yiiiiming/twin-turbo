import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACK,RaceEngine,setTrack} from '../src/engine.js';
import {RaceRenderer,harborLandmarkPlacements,roadsideLamps,sceneEntryBoundary,updateChaseCamera} from '../src/renderer.js';
import {createEntryCameraPlan,entryCameraForProgress,entryMeshOcclusion,entrySegmentBlocked,ENTRY_CAMERA_CUTS} from '../src/entry-cameras.js';
import {parisFakeGL} from './helpers/paris-mesh.mjs';

test.afterEach(()=>setTrack('coast'));
const add=(a,b)=>a.map((n,i)=>n+b[i]);
const subtract=(a,b)=>a.map((n,i)=>n-b[i]);
const multiply=(v,s)=>v.map(n=>n*s);
const unit=v=>multiply(v,1/Math.hypot(...v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

function productionScene(id){
  setTrack(id);
  const engine=new RaceEngine(),car=engine.cars[0],gl=parisFakeGL();
  const renderer=new RaceRenderer({width:960,height:540,getContext:()=>gl,addEventListener(){}});
  assert.equal(renderer.available,true,renderer.error);
  // Use the exact visual mesh uploaded by buildWorld. Collision hulls alone
  // miss palm leaves, and stopping at the landmark radius misses its own trees.
  const vertices=gl.buffers.get(renderer.meshes.props.buffer);
  assert.ok(vertices instanceof Float32Array&&vertices.length>33*1000,'full production scenery must be present');
  const geometry=entryMeshOcclusion(vertices);
  const plan=createEntryCameraPlan(TRACK,car,{
    landmarks:harborLandmarkPlacements(),obstacles:renderer.obstacles,
    lamps:roadsideLamps(),boundary:sceneEntryBoundary(),chase:updateChaseCamera(car,null),aspect:16/9,
  });
  return {car,renderer,geometry,plan};
}

function facadeTargets(subject,view){
  // These points describe visible architectural surfaces, not desired camera
  // coordinates. Place them just outside the mesh to avoid self-intersections.
  const {x,z,kind}=subject;
  if(kind==='forest-lodge')return [17,25,33,41].flatMap(y=>[-46,-23,0,23,46].map(dx=>[x+dx,y,z+44]));
  if(kind==='neon-plaza')return [25,60,130,220,290].flatMap(y=>[-43,-22,0,22,43].map(dx=>[x+dx,y,z-50]));
  const normal=unit([view.eye[0]-x,0,view.eye[2]-z]),side=[-normal[2],0,normal[0]];
  return [16,55,105,155,185].flatMap(y=>[-12,0,12].map(dx=>[x+normal[0]*28+side[0]*dx,y,z+normal[2]*28+side[2]*dx]));
}

function checkShot(scene,slot,kind){
  const {car,renderer,geometry,plan}=scene,shot=plan.shots[slot];
  assert.equal(shot.kind,kind,'a road fallback must not hide a failed landmark framing');
  const start=slot===0?0:ENTRY_CAMERA_CUTS[slot-1],end=ENTRY_CAMERA_CUTS[slot];
  let previous=null;
  for(let frame=0;frame<=16;frame++){
    const progress=start+(end-start)*frame/16-(frame===16?1e-8:0);
    const view=entryCameraForProgress(TRACK,car,progress,plan),label=`${TRACK.id} shot ${slot+1}, frame ${frame}/16`;
    assert.equal(view.shot,slot,label);
    assert.equal(entrySegmentBlocked(previous||view.eye,view.eye,renderer.obstacles,22),false,`${label}: camera body intersects scenery`);
    if(previous)assert.equal(geometry.blocked(previous,view.eye),false,`${label}: camera path passes through a visible face`);
    previous=view.eye;
    for(const target of facadeTargets(shot.subject,view)){
      assert.equal(geometry.blocked(view.eye,target),false,`${label}: obscured facade at ${JSON.stringify(target)}`);
    }
    // Inspect a 3x3 patch of the actual viewing frustum 120 units from the
    // lens, including its edges. The old lighthouse shot passed the central
    // subject ray while a nearby palm leaf filled the right side of the screen.
    const forward=unit(subtract(view.target,view.eye)),right=unit(cross(forward,[0,1,0])),up=cross(right,forward);
    const height=Math.tan(view.fov/2)*120*.9,width=height*16/9;
    for(const horizontal of [-1,0,1])for(const vertical of [-1,0,1]){
      const target=add(add(add(view.eye,multiply(forward,120)),multiply(right,horizontal*width)),multiply(up,vertical*height));
      assert.equal(geometry.blocked(view.eye,target),false,`${label}: foreground intrudes near lens at ${horizontal},${vertical}`);
    }
  }
}

test('both forest lodge intro shots keep the front windows and porch clear of actual pine triangles',()=>{
  const scene=productionScene('coast-pines');
  checkShot(scene,0,'forest-lodge');
  checkShot(scene,1,'forest-lodge');
});

test('neon orbit keeps the tower facade and near-lens frame clear of the surrounding buildings',()=>{
  checkShot(productionScene('coast-neon'),1,'neon-plaza');
});

test('marina lighthouse orbit never passes through palm leaves or hides the tower behind them',()=>{
  checkShot(productionScene('coast-marina'),1,'lighthouse');
});
