/** London at a consistent metre scale. Real OSM footprints, closed-road racing. */
import * as THREE from './vendor/three.module.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { TRACK, trackPoint, projectTrack, mod } from './engine.js';
import { geographicToWorld } from './tracks.js';
import { buildCityGeometry } from './city-geometry.js';
import { createLandmark, LANDMARK_IDS } from './city-landmarks.js';
import { placeLandmark, landmarkSolidObstacles } from './city-placement.js';
import { CityFrontages } from './city-frontages.js';
import { TunnelLighting } from './city-tunnel-lighting.js';
import buildingProfiles from './assets/london-building-profiles.json' with { type: 'json' };
import { courseGuideHalfWidth } from './city-roads.js';
import londonRoadCache from './assets/london-road-cache.json' with { type: 'json' };
import map from './assets/london-map.json' with { type: 'json' };

const M = 6, TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const color = value => new THREE.Color(value);
const geo = coordinate => geographicToWorld(TRACK.projection, ...coordinate);
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); };
const standard = (value, extra = {}) => new THREE.MeshStandardMaterial({color:value, roughness:.85, ...extra});
function canvasTexture(width, height, paint, repeat = true) {
  const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  if (repeat) texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.anisotropy=8; return texture;
}
function grain(base, amount=14) {
  return canvasTexture(256,256,(ctx,w,h)=>{
    ctx.fillStyle=base;ctx.fillRect(0,0,w,h);const pixels=ctx.getImageData(0,0,w,h);
    for(let i=0;i<pixels.data.length;i+=4){const d=(hash(i)-.5)*amount;for(let k=0;k<3;k++)pixels.data[i+k]+=d;}
    ctx.putImageData(pixels,0,0);
  });
}
function pavingTexture(){
  const texture=canvasTexture(768,768,(ctx,w,h)=>{
    ctx.fillStyle='#9d9c92';ctx.fillRect(0,0,w,h);
    for(let row=0;row<6;row++)for(let column=-1;column<4;column++){
      const x=column*256+(row%2)*128,y=row*128;
      const shade=Math.round(185+hash(row*13+column)*16);ctx.fillStyle=`rgb(${shade+7},${shade+5},${shade-4})`;
      ctx.fillRect(x+2,y+2,252,124);ctx.fillStyle='#e6e3d322';ctx.fillRect(x+4,y+4,248,2);
    }
  });texture.repeat.set(1/16.2,1/21.6);return texture;
}
function pathShape(points) {
  const shape=new THREE.Shape(); points.forEach((p,i)=>i?shape.lineTo(p.x,-p.y):shape.moveTo(p.x,-p.y));shape.closePath();return shape;
}
function flatPolygon(points, material, height=0, holes=[]) {
  if(points.length<3)return null; const shape=pathShape(points);
  for(const points of holes) if(points.length>=3) shape.holes.push(pathShape(points));
  const geometry=new THREE.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);geometry.translate(0,height,0);
  const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;return mesh;
}
function ribbon(points, width, material, height=.1) {
  const vertices=[],uv=[],indices=[];let distance=0;
  for(let i=0;i<points.length;i++){
    const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
    const angle=p.angle??Math.atan2(b.y-a.y,b.x-a.x),nx=-Math.sin(angle),ny=Math.cos(angle);
    if(i)distance+=Math.hypot(p.x-a.x,p.y-a.y);
    for(const side of [-1,1]) {vertices.push(p.x+nx*width/2*side,(p.elevation||0)+height,p.y+ny*width/2*side);uv.push((side+1)/2*width/12,distance/12);}
    if(i){const k=i*2;indices.push(k-2,k-1,k,k-1,k+1,k);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;return mesh;
}
function box(parent, material, x,y,z,w,h,d,rounded=0) {
  const geometry=rounded?new RoundedBoxGeometry(w,h,d,3,rounded):new THREE.BoxGeometry(w,h,d);
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function cylinder(parent,material,x,y,z,r,h,top=r){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(top,r,h,24),material);mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;
}
function lineTube(parent,points,radius,material,segments=points.length*3){
  const curve=new THREE.CatmullRomCurve3(points);const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,segments,radius,8,false),material);parent.add(mesh);return mesh;
}
function labelTexture(title,subtitle='',dark=true){
  return canvasTexture(1024,256,(ctx,w,h)=>{
    ctx.fillStyle=dark?'#16212b':'#efeddf';ctx.fillRect(0,0,w,h);ctx.strokeStyle=dark?'#c9b486':'#343b3c';ctx.lineWidth=8;ctx.strokeRect(12,12,w-24,h-24);
    ctx.fillStyle=dark?'#f7edce':'#242e31';ctx.textAlign='center';ctx.font='600 68px Georgia, serif';ctx.fillText(title,w/2,subtitle?112:150,940);
    if(subtitle){ctx.font='30px Arial, sans-serif';ctx.fillText(subtitle,w/2,190,920);}
  },false);
}

/** Merge by material in spatial tiles, retaining useful frustum culling. */
function batchStatic(group,tileSize=1600) {
  group.updateMatrixWorld(true);const batches=new Map();const remove=[];
  group.traverse(mesh=>{
    if(!mesh.isMesh||Array.isArray(mesh.material)||mesh.userData.dynamic||mesh.material.transparent)return;
    mesh.geometry.computeBoundingSphere();
    const position=mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld);
    const key=`${mesh.material.uuid}/${Math.floor(position.x/tileSize)}/${Math.floor(position.z/tileSize)}/${mesh.castShadow}`;
    let geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();geometry.applyMatrix4(mesh.matrixWorld);
    // Every batch uses the same attributes; landmarks may not carry UVs.
    for(const attribute of Object.keys(geometry.attributes))if(!['position','normal','uv','color'].includes(attribute))geometry.deleteAttribute(attribute);
    if(!geometry.attributes.normal)geometry.computeVertexNormals();
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    if(!geometry.attributes.color)geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*3).fill(1),3));
    if(!batches.has(key))batches.set(key,{material:mesh.material,castShadow:mesh.castShadow,geometries:[]});
    batches.get(key).geometries.push(geometry);remove.push(mesh);
  });
  for(const mesh of remove)mesh.removeFromParent();
  for(const {material,castShadow,geometries}of batches.values()){
    const geometry=mergeGeometries(geometries);for(const item of geometries)item.dispose();
    if(!geometry)continue;geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=castShadow;mesh.receiveShadow=true;group.add(mesh);
  }
}

export class CityRenderer {
  constructor(canvas) {
    this.canvas=canvas;this.available=false;this.error=null;this.obstacles=[];this.cameras=[];this.follow=[];this.busMeshes=new Map();
    try {
      const cachedTrack=londonRoadCache.track;
      const sectionsMatch=TRACK.sections.length===cachedTrack.sections.length&&TRACK.sections.every((section,i)=>{
        const cached=cachedTrack.sections[i];return section.id===cached.id&&['start','end','peak','ramp'].every(key=>Math.abs((section[key]||0)-(cached[key]||0))<1e-5);
      });
      // Tiny Math-library differences between browser engines must not make an
      // otherwise identical surveyed route fail its generated-cache guard.
      if(londonRoadCache.schemaVersion!==1||TRACK.id!==cachedTrack.id||Math.abs(TRACK.length-cachedTrack.length)>1e-5||TRACK.roadWidth!==cachedTrack.roadWidth||!sectionsMatch)throw new Error('London geometry cache is out of date; rebuild the game.');
      this.roadStudy=londonRoadCache.roadStudy;this.courseRoadStudy=londonRoadCache.courseRoadStudy;this.tunnelStudy=londonRoadCache.tunnelStudy;
      this.gl=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
      this.gl.setPixelRatio(1);this.gl.outputColorSpace=THREE.SRGBColorSpace;this.gl.toneMapping=THREE.ACESFilmicToneMapping;this.gl.toneMappingExposure=.98;
      this.gl.shadowMap.enabled=true;this.gl.shadowMap.type=THREE.PCFShadowMap;
      this.gl.autoClear=false;this.scene=new THREE.Scene();this.scene.background=color('#a9c2d0');this.scene.fog=new THREE.Fog('#b8c9ca',1800,10000);
      const pmrem=new THREE.PMREMGenerator(this.gl);const environment=new RoomEnvironment();this.environment=pmrem.fromScene(environment,.06);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.32;environment.dispose();pmrem.dispose();
      this.scene.add(new THREE.HemisphereLight('#dbe5ec','#797166',1.65));
      this.sun=new THREE.DirectionalLight('#fff0d9',2.7);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.camera.left=-520;this.sun.shadow.camera.right=520;this.sun.shadow.camera.top=580;this.sun.shadow.camera.bottom=-580;this.sun.shadow.camera.near=10;this.sun.shadow.camera.far=2400;this.sun.shadow.bias=-.00012;this.sun.shadow.normalBias=.24;this.sun.shadow.radius=3;this.scene.add(this.sun,this.sun.target);
      this.static=new THREE.Group();this.scene.add(this.static);this.makeMaterials();this.makeLandscape();this.makeRoads();this.makeBuildings();this.makeLandmarks();this.makeStreetFurniture();this.makeChinatown();batchStatic(this.static);
      this.cars=[this.makeCar('#39cad7'),this.makeCar('#e7794c')];this.cars.forEach(car=>this.scene.add(car));
      this.tunnelLighting=new TunnelLighting(TRACK);this.tunnelLighting.register(this.scene);
      this.cameras=[new THREE.PerspectiveCamera(64,1,.6,15000),new THREE.PerspectiveCamera(64,1,.6,15000)];
      this.available=true;
    }catch(error){this.error=error;console.error('London renderer:',error);}
  }
  makeMaterials(){
    this.material={
      asphalt:standard('#ffffff',{map:grain('#53565a',17),roughness:.91}),street:standard('#ffffff',{map:grain('#66686a',15)}),
      pavement:standard('#ffffff',{map:pavingTexture()}),grass:standard('#93a085',{map:grain('#a6b291',10)}),
      stone:standard('#cec6b5'),roof:standard('#686b69'),metal:standard('#303c39',{metalness:.65,roughness:.36}),
      white:standard('#edead9'),yellow:standard('#c2b167'),red:standard('#a51e29'),
      course:standard('#69c9bf',{roughness:.8}),
      glass:standard('#566a71',{metalness:.38,roughness:.23}),water:standard('#6a8b8e',{metalness:.36,roughness:.25}),
      tunnel:standard('#b7b4a9',{map:grain('#dad8cb',16)}),light:standard('#fff7db',{emissive:'#ffefc7',emissiveIntensity:2}),
      trunk:standard('#675d47'),leaves:[standard('#4e6545'),standard('#61744f'),standard('#778663')],
    };
  }
  coordinates(item){return (item.coordinates||item.footprint||[]).map(geo);}
  makeLandscape(){
    const landscape=londonRoadCache.landscape;
    for(const surface of landscape.waterSurfaces)this.static.add(flatPolygon(surface.outer,this.material.water,-15,surface.holes));
    for(const surface of landscape.groundSurfaces)this.static.add(flatPolygon(surface.outer,this.material.pavement,-.5,surface.holes));
    for(const surface of landscape.parkSurfaces)this.static.add(flatPolygon(surface.outer,this.material.grass,.03,surface.holes));
    // Soft high clouds, without painting landmarks into the sky.
    const skyTexture=canvasTexture(1024,512,(ctx,w,h)=>{
      const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#587f9e');gradient.addColorStop(.55,'#adc9d5');gradient.addColorStop(.9,'#e8e3d1');gradient.addColorStop(1,'#c9ceca');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
      for(let i=0;i<80;i++){const x=hash(i)*w,y=70+hash(i+100)*160,r=40+hash(i+200)*110;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#ffffff20');g.addColorStop(1,'#ffffff00');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
    },false);skyTexture.mapping=THREE.EquirectangularReflectionMapping;this.scene.background=skyTexture;
  }
  makeRoads(){
    for(const surface of this.roadStudy.sidewalkSurfaces)this.static.add(flatPolygon(surface.outer,this.material.pavement,surface.height,surface.holes));
    for(const surface of this.roadStudy.backgroundRoadSurfaces)this.static.add(flatPolygon(surface.outer,this.material.street,surface.height,surface.holes));
    const addSurfaces=(surfaces,material)=>{for(const surface of surfaces)this.static.add(flatPolygon(surface.outer,material,surface.height,surface.holes));};
    addSurfaces(this.courseRoadStudy.flatPavementSurfaces,this.material.pavement);
    addSurfaces(this.courseRoadStudy.flatAsphaltSurfaces,this.material.asphalt);
    addSurfaces(this.courseRoadStudy.flatKerbSurfaces,this.material.stone);
    addSurfaces(this.courseRoadStudy.flatGuideSurfaces,this.material.course);
    const pedestrian=TRACK.streets.filter(street=>street.highway==='pedestrian');
    const isPedestrian=s=>pedestrian.some(street=>s>=street.start&&s<=street.end);
    const pedestrianMaterial=standard('#c1b5a0',{map:pavingTexture()});
    addSurfaces(this.courseRoadStudy.pedestrianSurfaces,pedestrianMaterial);
    // Only the bridge and tunnel decks need height-varying strips; every tight
    // ground-level turn uses a unioned footprint and non-overlapping edge bands.
    for(const {points} of this.courseRoadStudy.elevatedPaths){
      this.static.add(ribbon(points,TRACK.roadWidth+18,this.material.pavement,.25));
      this.static.add(ribbon(points,TRACK.roadWidth,this.material.asphalt,.4));
      for(const side of [-1,1]){
        const guide=points.map(p=>trackPoint(p.s,side*courseGuideHalfWidth(TRACK,p.s)));
        this.static.add(ribbon(guide,1.25,this.material.course,.78));
        const kerb=points.map(p=>trackPoint(p.s,side*(TRACK.roadWidth/2+1)));
        this.static.add(ribbon(kerb,2,this.material.stone,.84));
      }
    }
    for(let s=0;s<TRACK.length;s+=75){if(isPedestrian(s))continue;const points=[];for(let d=0;d<=25;d+=5)points.push(trackPoint(s+d));this.static.add(ribbon(points,.8,this.material.white,.76));}
    for(const tunnel of this.tunnelStudy.sections){
      for(const solid of tunnel.meshes){
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(solid.positions,3));geometry.setIndex(solid.indices);geometry.computeVertexNormals();
        const mesh=new THREE.Mesh(geometry,this.material.tunnel);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.tunnel=solid.kind;this.static.add(mesh);
      }
      this.obstacles.push(...tunnel.obstacles);
      for(const lamp of tunnel.lamps){const fixture=box(this.static,this.material.light,lamp.x,lamp.height,lamp.y,5,.7,2);fixture.rotation.y=-lamp.angle;}
    }
    for(const section of TRACK.sections){
      if(section.passage||section.type==='tunnel')continue;
      for(let s=section.start;s<section.end;s+=18){
        const e=Math.min(s+18,section.end),a=trackPoint(s),b=trackPoint(e),angle=Math.atan2(b.y-a.y,b.x-a.x),len=Math.hypot(b.x-a.x,b.y-a.y)+.3;
        for(const side of [-1,1]){
          const p=trackPoint((s+e)/2,side*(TRACK.roadWidth/2+2));
          const wall=box(this.static,this.material.stone,p.x,p.elevation+4.5,p.y,len,9,3);wall.rotation.y=-angle;
          this.obstacles.push({id:`wall-${section.id}-${s}-${side}`,type:'box',x:p.x,y:p.y,halfWidth:len/2,halfDepth:1.5,angle,minHeight:p.elevation,maxHeight:p.elevation+9});
        }
        if(Math.floor(s/18)%9===0){
          const deck=(a.elevation+b.elevation)/2;const pillar=box(this.static,this.material.stone,(a.x+b.x)/2,(deck-26)/2,(a.y+b.y)/2,26,Math.max(4,deck+26),TRACK.roadWidth+12);pillar.rotation.y=-angle;
        }
      }
    }
    const start=trackPoint(TRACK.startDistance),startGroup=new THREE.Group();startGroup.position.set(start.x,.55,start.y);startGroup.rotation.y=-start.angle;
    for(let row=0;row<2;row++)for(let i=0;i<12;i++)box(startGroup,(i+row)%2?this.material.white:this.material.metal,row*5-2.5,0,(i-5.5)*TRACK.roadWidth/12,5,.08,TRACK.roadWidth/12);
    this.static.add(startGroup);
    for(const closure of this.roadStudy.branchClosures){
      const group=new THREE.Group();group.position.set(closure.x,closure.elevation,closure.y);group.rotation.y=-closure.angle;
      const count=Math.max(1,Math.ceil(closure.length/15)),width=closure.length/count;
      for(let i=0;i<count;i++){
        const x=(i-(count-1)/2)*width;
        box(group,this.material.metal,x,.45,0,width-.25,.9,4.8,.25);
        box(group,i%2?this.material.red:this.material.white,x,3,0,width-.6,5.1,2.4,.45);
        box(group,this.material.white,x,3.3,1.25,width*.58,1.05,.08);
        box(group,this.material.white,x,3.3,-1.25,width*.58,1.05,.08);
      }
      this.static.add(group);
      this.obstacles.push({id:`course-closure-${closure.id}`,type:'box',x:closure.x,y:closure.y,
        halfWidth:closure.length/2,halfDepth:2.4,angle:closure.angle,minHeight:closure.elevation,maxHeight:closure.elevation+5.7});
    }
  }
  makeBuildings(){
    this.cityGeometry=buildCityGeometry(map,TRACK);this.obstacles.push(...this.cityGeometry.obstacles);
    this.frontages=new CityFrontages({unitsPerMeter:M,sourceBuildings:map.buildings,projectPoint:geo,
      projectToRoute:(x,y)=>projectTrack(x,y),profileForBuilding:(building,source)=>{
        const points=source.coordinates||[];if(!points.length)return {};
        const lon=points.reduce((n,p)=>n+p[0],0)/points.length,lat=points.reduce((n,p)=>n+p[1],0)/points.length;
        const street=buildingProfiles.streetProfiles.find(profile=>{const[a,b,c,d]=profile.bbox;return lon>=a&&lon<=c&&lat>=b&&lat<=d;});
        if(!street)return {};
        const facade={...street.facade};
        if(street.palette?.length)facade.wallColor=street.palette[Math.floor(hash(building.index)*street.palette.length)];
        if(/glass|concrete/i.test(source.tags?.['building:material']||'')){facade.style='modern-stone';facade.roof='flat';facade.groundFloor='residential';}
        return {facade,confidence:'inferred',sourceUrls:street.sourceUrls,streetStudy:street.id};
      }});
    for(const building of this.cityGeometry.buildings){
      this.frontages.renderBuilding(building,this.static,buildingProfiles.byBuildingId[building.id]||{});
    }
  }

  makeLandmarks(){
    this.landmarkPositions=[];
    for(const landmark of map.landmarks||[]){
      if(!LANDMARK_IDS.includes(landmark.id))continue;const model=createLandmark(landmark.id);
      const p=geo(landmark.coordinates);placeLandmark(model,landmark,TRACK,projectTrack);
      model.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
      this.static.add(model);this.landmarkPositions.push({...landmark,...p});
      const solids=landmarkSolidObstacles(model,landmark.id);
      if(solids.length){this.obstacles.push(...solids);continue;}
      const footprint=landmark.footprint?.map(geo);
      if(footprint?.length)for(let i=0;i<footprint.length-1;i++){
        const a=footprint[i],b=footprint[i+1],len=Math.hypot(b.x-a.x,b.y-a.y);if(len<.2)continue;
        if(landmark.id==='chinatown-gate'||landmark.id==='admiralty-arch')continue;
        this.obstacles.push({id:`landmark-${landmark.id}-${i}`,type:'box',x:(a.x+b.x)/2,y:(a.y+b.y)/2,halfWidth:len/2,halfDepth:1.2,angle:Math.atan2(b.y-a.y,b.x-a.x),minHeight:0,maxHeight:500});
      }
    }
  }
  makeStreetFurniture(){
    // Trees are placed within mapped parks or wide boulevard verges, never in roads.
    let index=0;for(const park of map.parks||[]){const polygon=this.coordinates(park);if(polygon.length<3)continue;
      const minX=Math.min(...polygon.map(p=>p.x)),maxX=Math.max(...polygon.map(p=>p.x)),minY=Math.min(...polygon.map(p=>p.y)),maxY=Math.max(...polygon.map(p=>p.y));
      for(let x=minX+50;x<maxX;x+=160)for(let y=minY+50;y<maxY;y+=160){
        const p={x:x+hash(index)*90,y:y+hash(index+100)*90};index++;if(!insidePolygon(p,polygon)||projectTrack(p.x,p.y).distance<75)continue;
        if(projectTrack(p.x,p.y).distance>1400||(map.water||[]).some(w=>insidePolygon(p,this.coordinates(w))))continue;this.tree(p.x,p.y,index);
      }
    }
    // The Mall's formal avenue is aligned with the road, unlike woodland planting.
    let avenueIndex=10000;
    for(const street of TRACK.streets.filter(street=>street.name==='The Mall')){
      for(let s=street.start+100;s<street.end-100;s+=102)for(const side of [-1,1]){
        const p=trackPoint(s,side*84);if(p.tunnel||projectTrack(p.x,p.y).distance<75)continue;
        if(this.obstacles.some(o=>o.id.startsWith('building-')&&Math.hypot(o.x-p.x,o.y-p.y)<28))continue;
        if(this.obstacles.some(o=>o.id.startsWith('tree-')&&Math.hypot(o.x-p.x,o.y-p.y)<65))continue;
        this.tree(p.x,p.y,avenueIndex++);
      }
    }
    for(let s=130;s<TRACK.length;s+=230){const center=trackPoint(s);if(center.tunnel)continue;
      for(const side of [-1,1]){
        const p=trackPoint(s,side*(TRACK.roadWidth/2+20)),nearestBuilding=this.obstacles.some(o=>o.id.startsWith('building-')&&Math.hypot(o.x-p.x,o.y-p.y)<18);if(nearestBuilding||projectTrack(p.x,p.y).distance<TRACK.roadWidth/2+TRACK.carRadius+1)continue;
        const group=new THREE.Group();group.position.set(p.x,p.elevation,p.y);group.rotation.y=-p.angle;
        cylinder(group,this.material.metal,0,18,0,.42,36,.28);cylinder(group,this.material.metal,0,2.1,0,.84,4.2);
        const royal=TRACK.streets.some(street=>['The Mall','Birdcage Walk','Spur Road'].includes(street.name)&&s>=street.start&&s<street.end);
        if(royal){
          for(const y of [3,4,27,30])cylinder(group,this.material.metal,0,y,0,.7,.5);
          for(const arm of [-1,1]){
            lineTube(group,[new THREE.Vector3(0,29,0),new THREE.Vector3(0,33,arm*2),new THREE.Vector3(0,33,arm*4.5)],.24,this.material.metal,14);
            box(group,this.material.metal,0,34.3,arm*4.5,2.6,.45,2.6,.1);
            box(group,this.material.light,0,32.2,arm*4.5,1.5,3.5,1.5,.15);
            for(const dx of [-1,1])for(const dz of [-1,1])box(group,this.material.metal,dx,32.2,arm*4.5+dz,.16,4,.16);
            cylinder(group,this.material.metal,0,35,arm*4.5,1.4,1.2,.05);
          }
        }else{
          lineTube(group,[new THREE.Vector3(0,32,0),new THREE.Vector3(0,38,-side*2),new THREE.Vector3(0,38,-side*7)],.38,this.material.metal,14);
          box(group,this.material.metal,0,37,-side*7,3.8,.7,2.4,.3);box(group,this.material.light,0,36.5,-side*7,3,.16,1.8);
        }
        this.static.add(group);this.obstacles.push({id:`lamp-${s}-${side}`,type:'circle',x:p.x,y:p.y,radius:.8,minHeight:p.elevation,maxHeight:p.elevation+38});
      }
    }
    // Direction boards use the route's verified street names, facing arrivals.
    let lastName='';for(const street of TRACK.streets||[]){if(!street.name||street.name===lastName)continue;lastName=street.name;
      // At tight bends, a local side offset may fall onto another part of
      // the course. Place both the model and collider only after global clearance.
      let p=null;
      for(const forward of [35,75,120,180]){
        const candidate=trackPoint(street.start+forward,-TRACK.roadWidth/2-20);
        if(candidate.tunnel||projectTrack(candidate.x,candidate.y).distance<TRACK.roadWidth/2+TRACK.carRadius+2)continue;
        if(this.obstacles.some(o=>o.id.startsWith('building-')&&Math.hypot(o.x-candidate.x,o.y-candidate.y)<15))continue;
        p=candidate;break;
      }
      if(!p)continue;
      const group=new THREE.Group();group.position.set(p.x,p.elevation,p.y);group.rotation.y=-Math.PI/2-p.angle;
      cylinder(group,this.material.metal,0,10,0,.45,20);box(group,this.material.metal,0,20,0,24.3,6.3,.35);
      const signMaterial=new THREE.MeshStandardMaterial({map:labelTexture(street.name.toUpperCase(),'',false),roughness:.7});
      for(const side of [-1,1]){const sign=new THREE.Mesh(new THREE.PlaneGeometry(24,6),signMaterial);sign.position.set(0,20,side*.2);sign.rotation.y=side===1?0:Math.PI;group.add(sign);}
      this.static.add(group);this.obstacles.push({id:`sign-${street.start}`,type:'circle',x:p.x,y:p.y,radius:.6,minHeight:p.elevation,maxHeight:p.elevation+20});
    }
  }
  tree(x,z,index){
    if(!this.treeMaterial){
      const texture=new THREE.TextureLoader().load(globalThis.TWIN_SCENE_ART?.['london-plane-tree']||'./assets/london-plane-tree.png');texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
      this.treeMaterial=new THREE.MeshStandardMaterial({map:texture,alphaTest:.55,alphaToCoverage:true,side:THREE.DoubleSide,roughness:1,emissive:'#5a6546',emissiveIntensity:.12});
    }
    const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=hash(index)*Math.PI;const h=90+hash(index)*45;
    cylinder(group,this.material.trunk,0,h*.2,0,1.3,h*.4,.9);
    for(let i=0;i<2;i++){
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(h*.667,h),this.treeMaterial);mesh.position.y=h/2;mesh.rotation.y=i*Math.PI/2;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    }
    this.static.add(group);this.obstacles.push({id:`tree-${index}`,type:'circle',x,y:z,radius:1.4,minHeight:0,maxHeight:h});
  }
  makeChinatown(){
    // The district's own published history confirms lantern strands on Gerrard
    // Street. Their exact spacing is an artistic reconstruction, not a survey.
    const silk=standard('#b82820',{roughness:.7,emissive:'#762119',emissiveIntensity:.1});
    const seam=standard('#902419'),gold=standard('#c59c47',{metalness:.3,roughness:.5});
    const lanternGeometry=new THREE.SphereGeometry(1,24,14);
    for(const street of TRACK.streets.filter(street=>street.name==='Gerrard Street')){
      for(let s=street.start+48;s<street.end-25;s+=114){
        const p=trackPoint(s),group=new THREE.Group();group.position.set(p.x,p.elevation,p.y);group.rotation.y=-p.angle;
        const span=TRACK.roadWidth/2+18,at=z=>40-5*(1-(z/span)**2);
        const cable=[];for(let i=0;i<=16;i++){const z=-span+i/16*span*2;cable.push(new THREE.Vector3(0,at(z),z));}
        lineTube(group,cable,.07,this.material.metal,32);
        for(let i=0;i<5;i++){
          const z=-span*.72+i*span*.36,y=at(z)-3.5;
          cylinder(group,gold,0,y+2.4,z,.75,.4);cylinder(group,gold,0,y-2.4,z,.65,.3);
          const body=new THREE.Mesh(lanternGeometry,silk);body.position.set(0,y,z);body.scale.set(2.35,2.5,2.35);body.castShadow=true;group.add(body);
          for(let rib=0;rib<10;rib++){
            const a=rib*Math.PI/5,points=[];for(let j=1;j<12;j++){const t=j/12*Math.PI;points.push(new THREE.Vector3(Math.cos(a)*Math.sin(t)*2.36,y+Math.cos(t)*2.5,z+Math.sin(a)*Math.sin(t)*2.36));}
            lineTube(group,points,.026,seam,16);
          }
          cylinder(group,gold,0,y-3.1,z,.10,1.2,.18);cylinder(group,this.material.metal,0,y+3,z,.045,1.1);
        }
        this.static.add(group);
      }
    }
  }
  makeCar(paint){
    const car=new THREE.Group(),body=new THREE.MeshPhysicalMaterial({color:paint,metalness:.55,roughness:.24,clearcoat:1,clearcoatRoughness:.18});
    const rubber=standard('#161a1b',{roughness:.91}),chrome=standard('#b1bcc0',{metalness:.9,roughness:.2}),glass=standard('#233d4a',{metalness:.58,roughness:.09});
    box(car,body,0,4.5,0,27,5.2,11.4,1.6);
    box(car,glass,-1.3,7.9,0,14.2,4.4,9.7,1.5);box(car,body,-1.6,10,0,8.6,.5,8.5,.2);
    for(const side of [-1,1]){box(car,body,-1.1,8.2,side*4.82,.6,3.3,.25);box(car,body,-7.2,7.5,side*4.35,1.3,3.6,.6,.2);}
    const windshield=box(car,glass,6.2,7.8,0,1.7,3.2,9.1,.4);windshield.rotation.z=.3;
    box(car,body,8.7,6.2,0,8.4,1.2,10.8,.5);box(car,rubber,12.6,2.7,0,1.5,1.2,10.2,.3);
    box(car,rubber,-13.1,3.1,0,1.1,1.5,10.8,.2);box(car,body,-11.5,7.5,0,1.4,.55,12.1,.2);
    const head=standard('#f1f7e9',{emissive:'#d5e3ef',emissiveIntensity:.7}),tail=standard('#e12b22',{emissive:'#ae130e',emissiveIntensity:.7});
    for(const side of [-1,1]){box(car,head,13.25,4.9,side*3.7,.35,1.15,2.5,.2);box(car,tail,-13.5,5,side*3.6,.25,.75,3,.2);box(car,body,2.5,7.5,side*6.1,2,1.1,1.3,.4);
      for(const x of [-8.3,8.3]){
        const tire=new THREE.Mesh(new THREE.CylinderGeometry(2.65,2.65,1.4,32),rubber);tire.rotation.x=Math.PI/2;tire.position.set(x,2.7,side*5.5);tire.castShadow=true;car.add(tire);
        const wheel=new THREE.Mesh(new THREE.CylinderGeometry(1.75,1.75,.15,24),chrome);wheel.rotation.x=Math.PI/2;wheel.position.set(x,2.7,side*6.25);car.add(wheel);
        const center=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.2,16),rubber);center.rotation.x=Math.PI/2;center.position.set(x,2.7,side*6.4);car.add(center);
      }
    }
    box(car,chrome,-13.65,3.4,-3.7,.4,.6,1.1,.2);box(car,chrome,-13.65,3.4,3.7,.4,.6,1.1,.2);
    const plate=new THREE.Mesh(new THREE.PlaneGeometry(3.6,1.1),new THREE.MeshBasicMaterial({map:labelTexture('TWIN', '',false)}));plate.rotation.y=-Math.PI/2;plate.position.set(-13.72,4.5,0);car.add(plate);
    return car;
  }
  makeBus(){
    const bus=new THREE.Group(),red=standard('#b31b2a',{metalness:.25,roughness:.32}),black=standard('#18272c',{metalness:.45,roughness:.2}),rubber=standard('#151b1c');
    box(bus,red,0,12.9,0,66,23.5,15,2.6);box(bus,black,1,19,0,60,7.1,15.15,1.4);box(bus,black,1,8.8,0,59,7.4,15.12,1.1);
    box(bus,red,0,13.5,0,64,2.5,15.3,.5);box(bus,red,-.4,24.4,0,61,1.8,14.5,.8);
    for(const side of [-1,1])for(let x=-27;x<=30;x+=8)box(bus,red,x,16.8,side*7.66,.8,15,.15);
    for(const side of [-1,1])for(const x of [-20,21]){const tire=new THREE.Mesh(new THREE.CylinderGeometry(3.6,3.6,1.1,32),rubber);tire.rotation.x=Math.PI/2;tire.position.set(x,3.6,side*7.3);bus.add(tire);}
    box(bus,red,32.5,12.7,0,1.1,1.1,14.2,.3);box(bus,this.material.light,33,4.2,-5,.2,1.1,1.5);box(bus,this.material.light,33,4.2,5,.2,1.1,1.5);
    const destination=new THREE.Mesh(new THREE.PlaneGeometry(12,2.6),new THREE.MeshBasicMaterial({map:labelTexture('24  WESTMINSTER')}));destination.rotation.y=Math.PI/2;destination.position.set(33.2,14.8,0);bus.add(destination);
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(38,6),new THREE.MeshStandardMaterial({map:labelTexture('WEST END','AN EVENING AT THE THEATRE')}));panel.position.set(-3,13.7,7.8);bus.add(panel);
    bus.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});this.tunnelLighting?.register(bus);return bus;
  }
  resetCameras(engine,playerId){for(const car of engine.cars)if(!playerId||car.id===playerId)this.follow[car.id-1]=null;}
  updateCamera(car,index,dt){
    const previous=this.follow[index],snap=!previous||Math.hypot(car.x-previous.x,car.y-previous.y)>200;
    const amount=snap?1:1-Math.exp(-Math.min(dt,.1)*8),turnAmount=snap?1:1-Math.exp(-Math.min(dt,.1)*10);
    const angle=snap?car.angle:previous.angle+(mod(car.angle-previous.angle+Math.PI,TAU)-Math.PI)*turnAmount;
    const p=projectTrack(car.x,car.y),speed=clamp(Math.abs(car.speed)/517,0,1),distance=57+speed*9,lateral=5;
    const behind=trackPoint(p.s-distance),elevation=car.elevation||0;
    const desired=new THREE.Vector3(car.x-Math.cos(angle)*distance-Math.sin(angle)*lateral,Math.max(elevation+22,behind.elevation+18),car.y-Math.sin(angle)*distance+Math.cos(angle)*lateral);
    // Camera constraints use its own ground position, including after lerp:
    // at an exit the car may already be above ground while its camera is still
    // under the roof. Lower smoothly before the portal, never through its cap.
    const constrainCamera=(position,final=false)=>{
      const surface=projectTrack(position.x,position.z);
      const tunnel=this.tunnelStudy.sections.find(item=>surface.s>=item.section.start&&surface.s<=item.section.end);
      if(!tunnel)return;
      const lane=clamp(surface.offset,-TRACK.roadWidth/2+2,TRACK.roadWidth/2-2);
      if(lane!==surface.offset){position.x=surface.x-Math.sin(surface.angle)*lane;position.z=surface.y+Math.cos(surface.angle)*lane;}
      const {start,end}=tunnel.covered;
      const raw=Math.min(clamp((surface.s-start+120)/120,0,1),clamp((end+120-surface.s)/120,0,1));
      const blend=raw*raw*(3-2*raw),ceiling=surface.elevation+20.5;
      position.y+=(Math.min(position.y,ceiling)-position.y)*blend;
      if(final&&surface.s>=start&&surface.s<=end)position.y=Math.min(position.y,surface.elevation+22);
    };
    constrainCamera(desired);
    const camera=this.cameras[index];if(snap)camera.position.copy(desired);else camera.position.lerp(desired,amount);
    constrainCamera(camera.position,true);
    camera.lookAt(car.x+Math.cos(angle)*65,elevation+8+Math.sin(Math.atan(car.slope||0))*65,car.y+Math.sin(angle)*65);
    const targetFov=car.boosting?70:64+speed*2;camera.fov+=(targetFov-camera.fov)*amount;camera.updateProjectionMatrix();
    this.follow[index]={x:car.x,y:car.y,angle};
  }
  render(engine,dt=1/60){
    if(!this.available)return;
    const w=Math.max(1,Math.round(this.canvas.clientWidth*Math.min(devicePixelRatio||1,2))),h=Math.max(1,Math.round(this.canvas.clientHeight*Math.min(devicePixelRatio||1,2)));
    if(this.canvas.width!==w||this.canvas.height!==h)this.gl.setSize(w,h,false);
    engine.cars.forEach((car,i)=>{const mesh=this.cars[i];mesh.position.set(car.x,(car.elevation||0)+.55,car.y);mesh.rotation.set(0,-car.angle,Math.atan(car.slope||0));this.updateCamera(car,i,dt);});
    for(const traffic of engine.traffic||[]){let mesh=this.busMeshes.get(traffic.id);if(!mesh){mesh=this.makeBus();this.busMeshes.set(traffic.id,mesh);this.scene.add(mesh);}mesh.visible=traffic.active;if(mesh.visible){mesh.position.set(traffic.x,traffic.elevation+.5,traffic.y);mesh.rotation.set(0,-traffic.angle,-Math.atan(traffic.slope||0));}}
    this.gl.setScissorTest(true);
    for(let i=0;i<2;i++){
      const camera=this.cameras[i],car=engine.cars[i],half=Math.floor(w/2);camera.aspect=half/h;camera.updateProjectionMatrix();
      this.sun.position.set(car.x-600,car.elevation+1200,car.y-350);this.sun.target.position.set(car.x,car.elevation,car.y);this.sun.target.updateMatrixWorld();
      this.gl.setViewport(i*half,0,i? w-half:half,h);this.gl.setScissor(i*half,0,i?w-half:half,h);this.gl.clear();this.gl.render(this.scene,camera);
    }
    this.gl.setScissorTest(false);
  }
  dispose(){
    this.scene?.traverse(object=>{if(object.geometry)object.geometry.dispose();});this.tunnelLighting?.dispose();this.environment?.dispose();this.gl?.dispose();
  }
}

export function insidePolygon(p,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if(((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x))inside=!inside;
}return inside;}
