import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { TRACKS } from '../engine.js';
import { pointOnTrack } from '../tracks.js';
import { createTunnelLightField, TunnelLighting, TUNNEL_CLEAR_HEIGHT } from '../city-tunnel-lighting.js';

const track=TRACKS.london;
const field=createTunnelLightField(track);
const range=field.sections[0];
function lightingAt(s,lane=0,height=3){
  const point=pointOnTrack(track,s,lane);
  return field.sample(point.x,point.y,point.elevation+height);
}

test('underpass has local roof occlusion along both lanes, including bends and segment joins',()=>{
  assert.equal(range.clearance,TUNNEL_CLEAR_HEIGHT);
  for(let s=range.start+75;s<range.end-75;s+=6){
    for(const lane of [-30,0,30]){
      assert.ok(lightingAt(s,lane,.5).cover>.995,`road receives sky light at ${s},${lane}`);
      assert.ok(lightingAt(s,lane,11).cover>.995,`car receives sky light at ${s},${lane}`);
      assert.ok(lightingAt(s,lane,25.9).cover>.995,`roof underside receives sky light at ${s},${lane}`);
    }
  }
});

test('ramps, the roof exterior and the surface street above remain in daylight',()=>{
  const section=range.section;
  for(const s of [section.start,range.start-70,range.end+70,section.end])assert.equal(lightingAt(s).cover,0);
  for(let s=range.start;s<=range.end;s+=30){
    const p=pointOnTrack(track,s);
    assert.equal(field.sample(p.x,p.y,0).cover,0,'ground level above the roof must not dim');
    assert.equal(lightingAt(s,0,31).cover,0,'the top of the tunnel remains outside its light volume');
    assert.equal(lightingAt(s,90,3).cover,0,'adjacent streets are outside the tunnel');
  }
});

test('daylight transition is continuous at both portals and independent for two racers',()=>{
  for(const at of [offset=>range.start+offset,offset=>range.end-offset]){
    let previous=0;
    for(let offset=0;offset<=75;offset+=3){
      const cover=lightingAt(at(offset)).cover;
      assert.ok(cover+1e-8>=previous,`portal brightness jumps backwards at ${offset}`);
      assert.ok(cover-previous<.075,'no hard flash between daylight and interior lighting');
      previous=cover;
    }
    assert.ok(previous>.999);
  }
  const inside=pointOnTrack(track,(range.start+range.end)/2),outside=pointOnTrack(track,track.startDistance);
  for(let repeat=0;repeat<5;repeat++){
    assert.ok(field.sample(inside.x,inside.y,inside.elevation+5).cover>.999);
    assert.equal(field.sample(outside.x,outside.y,outside.elevation+5).cover,0);
  }
});

test('lighting uses a bounded baked field, including an opaque floor and emissive fixture shader',()=>{
  assert.ok(field.width<=1024&&field.height<=1024);
  assert.equal(field.data.length,field.width*field.height*4);
  assert.equal(createTunnelLightField(TRACKS.coast),null);
  const lighting=new TunnelLighting(track),material=new THREE.MeshPhysicalMaterial();
  lighting.patch(material);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
  material.onBeforeCompile(shader,null);
  assert.ok(shader.vertexShader.includes('vTunnelWorldPosition=(modelMatrix*tunnelWorldVertex).xyz'));
  assert.ok(shader.fragmentShader.includes('+totalEmissiveRadiance'));
  assert.equal(shader.uniforms.tunnelLightField.value,lighting.texture);
  assert.ok(!shader.fragmentShader.includes('uniform float tunnelCamera'),'a camera cannot darken the other viewport');
  lighting.dispose();material.dispose();
});


test('warm light pools sit under the modelled ceiling fixtures',()=>{
  for(let s=range.start+135;s<range.end-100;s+=90){
    assert.ok(lightingAt(s).pool>.998,`fixture is not above its light pool at ${s}`);
    assert.ok(lightingAt(s+45).pool<.25,`space between fixtures should be dimmer at ${s+45}`);
  }
});
