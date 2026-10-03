/** Local, world-space tunnel lighting. No camera-dependent scene brightness:
 * the other player's daylight view, and daylight visible through a portal, stay
 * unchanged. The small baked field blocks sky/reflection light below the roof
 * and approximates the warm pools cast by the fixed overhead fixtures. */
import * as THREE from './vendor/three.module.js';
import { pointOnTrack } from './tracks.js';
import { tunnelCoveredRange } from './city-roads.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (a, b, x) => { const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
export const TUNNEL_CLEAR_HEIGHT = 26;
export const TUNNEL_LAMP_SPACING = 90;
const FLOOR_MIN = -128, FLOOR_RANGE = 256;

export function createTunnelLightField(track, { resolution=2, maxDimension=1024 }={}) {
  const sections=(track.sections||[]).filter(section=>section.type==='tunnel'&&!section.passage)
    .map(section=>({section,...tunnelCoveredRange(section)}));
  const segments=[];
  for(const range of sections){
    for(let s=range.start;s<range.end;s+=24){
      const end=Math.min(s+24,range.end),a=pointOnTrack(track,s),b=pointOnTrack(track,end);
      segments.push({a,b,start:s,end,range});
    }
  }
  if(!segments.length)return null;
  const margin=track.roadWidth/2+12;
  const points=segments.flatMap(segment=>[segment.a,segment.b]);
  const minX=Math.min(...points.map(p=>p.x))-margin,minZ=Math.min(...points.map(p=>p.y))-margin;
  const maxX=Math.max(...points.map(p=>p.x))+margin,maxZ=Math.max(...points.map(p=>p.y))+margin;
  const worldWidth=maxX-minX,worldDepth=maxZ-minZ;
  const texelSize=Math.max(resolution,worldWidth/maxDimension,worldDepth/maxDimension);
  const width=Math.max(2,Math.ceil(worldWidth/texelSize)),height=Math.max(2,Math.ceil(worldDepth/texelSize));
  function sample(x,z,y){
    let nearest=null,distanceSquared=Infinity,t=0;
    for(const segment of segments){
      const dx=segment.b.x-segment.a.x,dz=segment.b.y-segment.a.y;
      const u=clamp(((x-segment.a.x)*dx+(z-segment.a.y)*dz)/(dx*dx+dz*dz||1),0,1);
      const px=segment.a.x+dx*u,pz=segment.a.y+dz*u;
      const d=(x-px)**2+(z-pz)**2;
      if(d<distanceSquared){distanceSquared=d;nearest=segment;t=u;}
    }
    const floor=nearest.a.elevation+(nearest.b.elevation-nearest.a.elevation)*t;
    const s=nearest.start+(nearest.end-nearest.start)*t;
    const portalDistance=Math.min(s-nearest.range.start,nearest.range.end-s);
    const lateral=1-smoothstep(track.roadWidth/2+5,track.roadWidth/2+10,Math.sqrt(distanceSquared));
    const cover=smoothstep(0,72,portalDistance)*lateral;
    const along=s-nearest.range.start-TUNNEL_LAMP_SPACING/2;
    const lampDistance=Math.abs(((along+TUNNEL_LAMP_SPACING/2)%TUNNEL_LAMP_SPACING)-TUNNEL_LAMP_SPACING/2);
    const pool=.2+.8*Math.exp(-((lampDistance/26)**2));
    const vertical=y===undefined?1:(1-smoothstep(floor+TUNNEL_CLEAR_HEIGHT+.2,floor+TUNNEL_CLEAR_HEIGHT+1.1,y))*smoothstep(floor-5,floor-2,y);
    return {cover:cover*vertical,floor,pool};
  }
  const data=new Uint8Array(width*height*4);
  for(let z=0;z<height;z++)for(let x=0;x<width;x++){
    const value=sample(minX+(x+.5)/width*worldWidth,minZ+(z+.5)/height*worldDepth);
    const i=(z*width+x)*4;
    // Floor uses two channels so interpolation cannot move the ceiling by an
    // entire world-unit. 0.004 unit precision is under one millimetre in-world.
    const encoded=Math.round(clamp((value.floor-FLOOR_MIN)/FLOOR_RANGE,0,1)*65535);
    data[i]=Math.round(value.cover*255);data[i+1]=encoded>>8;data[i+2]=encoded&255;data[i+3]=Math.round(value.pool*255);
  }
  return {data,width,height,minX,minZ,worldWidth,worldDepth,sections,sample};
}

export class TunnelLighting {
  constructor(track){
    this.field=createTunnelLightField(track);this.materials=new WeakSet();
    if(!this.field)return;
    const field=this.field;
    this.texture=new THREE.DataTexture(field.data,field.width,field.height,THREE.RGBAFormat);
    this.texture.minFilter=THREE.LinearFilter;this.texture.magFilter=THREE.LinearFilter;
    this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
    this.uniforms={
      tunnelLightField:{value:this.texture},
      tunnelLightBounds:{value:new THREE.Vector4(field.minX,field.minZ,1/field.worldWidth,1/field.worldDepth)},
    };
  }
  register(object){
    if(!this.field)return;
    object.traverse(mesh=>{if(mesh.isMesh)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])this.patch(material);});
  }
  patch(material){
    if(this.materials.has(material)||!(material.isMeshStandardMaterial||material.isMeshBasicMaterial))return;
    this.materials.add(material);
    const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey?.bind(material);
    const isLit=material.isMeshStandardMaterial;
    material.onBeforeCompile=(shader,renderer)=>{
      previous?.call(material,shader,renderer);
      Object.assign(shader.uniforms,this.uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTunnelWorldPosition;');
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        vec4 tunnelWorldVertex=vec4(transformed,1.0);
        #ifdef USE_BATCHING
          tunnelWorldVertex=batchingMatrix*tunnelWorldVertex;
        #endif
        #ifdef USE_INSTANCING
          tunnelWorldVertex=instanceMatrix*tunnelWorldVertex;
        #endif
        vTunnelWorldPosition=(modelMatrix*tunnelWorldVertex).xyz;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 vTunnelWorldPosition;
        uniform sampler2D tunnelLightField;
        uniform vec4 tunnelLightBounds;
        vec2 tunnelLightingAt(vec3 position){
          vec2 uv=(position.xz-tunnelLightBounds.xy)*tunnelLightBounds.zw;
          if(uv.x<=0.0||uv.y<=0.0||uv.x>=1.0||uv.y>=1.0)return vec2(0.0);
          vec4 field=texture2D(tunnelLightField,uv);
          float floorHeight=((field.g*65280.0+field.b*255.0)/65535.0)*256.0-128.0;
          float insideRoof=1.0-smoothstep(floorHeight+26.2,floorHeight+27.1,position.y);
          float aboveFloor=smoothstep(floorHeight-5.0,floorHeight-2.0,position.y);
          return vec2(field.r*insideRoof*aboveFloor,field.a);
        }`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        vec2 tunnelLighting=tunnelLightingAt(vTunnelWorldPosition);
        if(tunnelLighting.x>0.0){
          ${isLit ? `// Suppress the unoccluded sky and reflection contribution locally;
          // keep emissive lamps/tail-lights, and a little material specularity.
          vec3 warmFixture=vec3(1.0,.82,.60)*(.09+.32*tunnelLighting.y);
          vec3 worldTunnelNormal=transformNormalByInverseViewMatrix(normal,viewMatrix);
          float fixtureFacing=.48+.52*max(0.0,worldTunnelNormal.y);
          vec3 interiorLight=(outgoingLight-totalEmissiveRadiance)*.035
            +diffuseColor.rgb*warmFixture*fixtureFacing+totalEmissiveRadiance;
          outgoingLight=mix(outgoingLight,interiorLight,tunnelLighting.x);`
          : 'outgoingLight*=mix(1.0,.16+.20*tunnelLighting.y,tunnelLighting.x);'}
        }
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>`${previousKey?.()||''}/local-tunnel-field-v1/${isLit?'lit':'unlit'}`;
    material.needsUpdate=true;
  }
  dispose(){this.texture?.dispose();}
}
