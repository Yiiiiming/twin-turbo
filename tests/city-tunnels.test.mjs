import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createTunnelStudy, createRoadStudy, subtractGroundFootprints } from '../city-roads.js';
import { TRACKS, setTrack, trackPoint, projectTrack } from '../engine.js';
import { ObstacleWorld } from '../collisions.js';
import { CityRenderer } from '../city-renderer.js';
import londonMap from '../assets/london-map.json' with { type: 'json' };
afterEach(()=>setTrack('coast'));
const track=TRACKS.london,study=createTunnelStudy(track),tunnel=study.sections[0];
function insideSurface(surface,point){
  const inside=ring=>{let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)result=!result;
  }return result;};return inside(surface.outer)&&!surface.holes.some(inside);
}

test('both open ramps remove the terrain and background streets, while covered ground stays above the roof',()=>{
  setTrack('london');const roads=createRoadStudy(londonMap,track);
  const terrain=subtractGroundFootprints([{x:-5000,y:-5000},{x:25000,y:-5000},{x:25000,y:25000},{x:-5000,y:25000}],study.openings);
  const {section,covered}=tunnel;
  for(let s=section.start+2;s<section.end-2;s+=5){
    const isOpen=s<covered.start-2||s>covered.end+2;
    for(const lane of [-30,0,30]){
      const point=trackPoint(s,lane);
      if(isOpen){
        assert.ok(!terrain.some(surface=>insideSurface(surface,point)),`terrain blocks the ramp at ${s}`);
        assert.ok(![...roads.backgroundRoadSurfaces,...roads.sidewalkSurfaces].some(surface=>insideSurface(surface,point)),`background street blocks ramp at ${s}`);
      }else if(s>covered.start+5&&s<covered.end-5){assert.ok(terrain.some(surface=>insideSurface(surface,point)),'ground remains over the covered tunnel');}
    }
  }
});

test('continuous tunnel walls and roof are closed solids, and the whole roof is underground',()=>{
  for(const mesh of tunnel.meshes){
    assert.ok(mesh.positions.every(Number.isFinite));const edges=new Map();
    for(let i=0;i<mesh.indices.length;i+=3)for(const [a,b] of [[mesh.indices[i],mesh.indices[i+1]],[mesh.indices[i+1],mesh.indices[i+2]],[mesh.indices[i+2],mesh.indices[i]]]){
      const key=a<b?`${a}/${b}`:`${b}/${a}`;edges.set(key,(edges.get(key)||0)+1);
    }
    assert.ok([...edges.values()].every(count=>count===2),`${mesh.id} has an unsealed geometry seam`);
    if(mesh.kind==='roof')for(let i=1;i<mesh.positions.length;i+=3)assert.ok(mesh.positions[i]<-.5,'roof must remain beneath surface level');
  }
  assert.ok(tunnel.meshes.some(mesh=>mesh.kind==='portal'));
});

test('the complete car can enter, leave, and use both lanes without hitting a portal or hidden wall',()=>{
  setTrack('london');const world=new ObstacleWorld(tunnel.obstacles,{carRadius:track.carRadius});
  for(let s=tunnel.section.start-30;s<tunnel.section.end+30;s+=2)for(const lane of [-30,0,30]){
    const p=trackPoint(s,lane),previous=trackPoint(s-2,lane),car={...p,height:track.carHeight,speed:200};
    assert.equal(world.resolveCar(car,previous),0,`tunnel obstruction at ${s}/${lane}`);
  }
});

test('the chase camera stays below the roof at its own position as the car leaves the tunnel',()=>{
  setTrack('london');const camera=new THREE.PerspectiveCamera(64,1,1,10000);
  const context={follow:[],cameras:[camera],tunnelStudy:study};
  for(let s=tunnel.section.start-100;s<tunnel.section.end+150;s+=6){
    const p=trackPoint(s,22),car={...p,speed:363,boosting:false};
    CityRenderer.prototype.updateCamera.call(context,car,0,1/60);
    const cameraRoad=projectTrack(camera.position.x,camera.position.z);
    if(cameraRoad.s>=tunnel.covered.start&&cameraRoad.s<=tunnel.covered.end){
      assert.ok(camera.position.y<=cameraRoad.elevation+22.001,'camera crosses the roof while its car is already on the uphill ramp');
      assert.ok(Math.abs(cameraRoad.offset)<=track.roadWidth/2-1.99,'camera crosses a sidewall');
    }
  }
});
