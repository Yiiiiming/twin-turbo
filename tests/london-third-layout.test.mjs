import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TRACK, setTrack, trackPoint, projectTrack } from '../engine.js';
import { RaceRenderer, londonLandmarkPlacements, sceneryPlacements, updateChaseCamera } from '../renderer.js';
import { LONDON_THIRD_LANDMARKS, addLondonThirdLandmark } from '../london-third-landmarks.js';
import { londonThirdLandmarkPlacements } from '../london-third-layout.js';
import { ObstacleWorld } from '../collisions.js';

const kinds=new Set(LONDON_THIRD_LANDMARKS.map(item=>item.kind));
const additions=()=>londonLandmarkPlacements().filter(item=>kinds.has(item.kind));
test.afterEach(()=>setTrack('coast'));

// Accepted 2026-10-13 complete array, before this third addition. This is a
// one-way preservation check, not a snapshot to refresh when a plot moves.
const EXISTING_PLOTS_SHA256='39bfc3b27d693cdaad8647bea50222a311a7b7acfbe43c724b8c458d5cc69138';

class Probe {
 constructor(item){this.item=item;this.radius=0;this.top=[0,-Infinity,0];this.colliders=[];}
 vertex(p){assert.ok(p.every(Number.isFinite),`${this.item.kind}: nonfinite vertex`);this.radius=Math.max(this.radius,Math.hypot(p[0]-this.item.x,p[2]-this.item.z));if(p[1]>this.top[1])this.top=p;}
 triangle(a,b,c){for(const p of [a,b,c])this.vertex(p);}
 quad(a,b,c,d){for(const p of [a,b,c,d])this.vertex(p);}
 box(x,y,z,w,h,d,color,angle=0){
  const c=Math.cos(angle),s=Math.sin(angle);
  for(const a of [-1,1])for(const b of [-1,1])for(const e of [-1,1])this.vertex([x+c*a*w/2-s*e*d/2,y+b*h/2,z+s*a*w/2+c*e*d/2]);
  if(this.colliders)this.colliders.push({type:'box',x,y:z,halfWidth:w/2,halfDepth:d/2,angle,minHeight:y-h/2,maxHeight:y+h/2});
 }
 cone(x,y,z,r,h,color,sides=8,top=0,phase=0){
  for(let i=0;i<sides;i++)for(const up of [false,true]){const a=i/sides*Math.PI*2+phase,rr=up?top:r;this.vertex([x+Math.cos(a)*rr,y+(up?h:0),z+Math.sin(a)*rr]);}
  if(this.colliders)this.colliders.push({type:'circle',x,y:z,radius:Math.max(r,top),minHeight:y,maxHeight:y+h});
 }
 disk(x,y,z,rx,rz,color,sides=12,angle=0){
  const c=Math.cos(angle),s=Math.sin(angle);for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2;this.vertex([x+Math.cos(a)*rx*c-Math.sin(a)*rz*s,y,z+Math.cos(a)*rx*s+Math.sin(a)*rz*c]);}
 }
}
function probe(item){const mesh=new Probe(item);addLondonThirdLandmark(mesh,item);return mesh;}
function fakeGL(){
 const gl={buffers:new Map()};let bound,id=0;
 for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
 gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_,name)=>name;
 gl.bindBuffer=(_,buffer)=>{bound=buffer;};gl.bufferData=(_,array)=>gl.buffers.set(bound,array);
 for(const name of ['uniformMatrix4fv','deleteBuffer','drawArrays','shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindTexture','texImage2D','texParameteri','enable','depthFunc','disable','clearColor','blendFunc','enableVertexAttribArray','vertexAttribPointer','depthMask','useProgram','disableVertexAttribArray','activeTexture','uniform1i','uniform1f','uniform3fv','viewport','scissor','clear','pixelStorei'])gl[name]=()=>{};
 return gl;
}

test('the third London set adds exactly ten plots without changing any of the 46 accepted landmarks',()=>{
 setTrack('coast-london');const all=londonLandmarkPlacements(),old=all.filter(item=>!kinds.has(item.kind)),plots=additions();
 assert.equal(old.length,46);assert.equal(all.length,56);assert.equal(plots.length,10);
 assert.deepEqual(new Set(plots.map(item=>item.kind)),kinds);
 assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'),EXISTING_PLOTS_SHA256);
 assert.deepEqual(londonThirdLandmarkPlacements(old,LONDON_THIRD_LANDMARKS),plots,'production must use the validated layout');
 const before=JSON.stringify(old);londonThirdLandmarkPlacements(old,LONDON_THIRD_LANDMARKS);assert.equal(JSON.stringify(old),before,'layout may not mutate occupied plots');
});

test('third-set plots clear every road branch, the river, other landmarks and the remaining ordinary streets',()=>{
 setTrack('coast-london');const all=londonLandmarkPlacements(),street=sceneryPlacements();
 for(const item of additions()){
  const mesh=probe(item),near=projectTrack(item.x,item.z),road=trackPoint(item.s),dx=road.x-item.x,dz=road.y-item.z;
  assert.ok(mesh.radius<=item.radius+.01,`${item.kind}: generated ornament leaves its reserved plot`);
  assert.ok(near.distance>=TRACK.roadWidth/2+item.radius+27,`${item.kind}: intrudes into a road branch`);
  assert.ok(near.distance<350,`${item.kind}: detached from the driving view`);
  assert.ok(Math.abs(item.z-TRACK.river.centerZ)>=TRACK.river.halfWidth+item.radius+27,`${item.kind}: overlaps the Thames`);
  assert.equal(road.elevation,0,`${item.kind}: placed along a bridge slope`);
  assert.ok((Math.sin(item.angle)*dx-Math.cos(item.angle)*dz)/Math.hypot(dx,dz)>.999,`${item.kind}: facade faces away from its road`);
  for(const other of all)if(other.kind!==item.kind)assert.ok(Math.hypot(item.x-other.x,item.z-other.z)>=item.radius+other.radius+30,`${item.kind}/${other.kind}: occupied plots overlap`);
  for(const other of street)assert.ok(Math.hypot(item.x-other.x,item.z-other.z)>=item.radius+other.radius+30,`${item.kind}/${other.kind}: street scenery overlaps`);
 }
 for(let q=0;q<4;q++)assert.ok(street.filter(item=>item.kind==='terrace'&&Math.floor(projectTrack(item.x,item.z).s/TRACK.length*4)===q).length>=12,`quarter ${q+1}: ordinary streets have been emptied`);
});

// Independent perpendicular-projection check against the complete obstacle
// footprint. Evaluate the centre plus both facade wings, so a second-row plot
// cannot pass merely because two building centres have a clear joining line.
function assertFrontageClear(view,obstacles){
 const road=trackPoint(view.s??projectTrack(view.x,view.z).s),angle=view.angle??road.angle,depth=view.depth||0,width=view.width||0;
 for(const fraction of [-.42,0,.42]){
  const x=view.x+Math.sin(angle)*depth/2+Math.cos(angle)*width*fraction;
  const z=view.z-Math.cos(angle)*depth/2+Math.sin(angle)*width*fraction;
  const vx=x-road.x,vz=z-road.y,length=Math.hypot(vx,vz),ux=vx/length,uz=vz/length;
  for(const obstacle of obstacles){
   const dx=obstacle.x-road.x,dz=obstacle.z-road.y,along=Math.max(0,Math.min(length,dx*ux+dz*uz));
   const distance=Math.hypot(dx-ux*along,dz-uz*along);
   assert.ok(distance>=obstacle.radius+7,`${obstacle.kind} blocks ${view.kind} facade at ${fraction}`);
  }
 }
}

test('the new landmarks preserve old frontage views, and their own entrances and wings remain visible',()=>{
 setTrack('coast-london');const all=londonLandmarkPlacements(),plots=additions(),street=sceneryPlacements();
 for(const old of all.filter(item=>!kinds.has(item.kind)))assertFrontageClear(old,plots);
 for(const item of plots)assertFrontageClear(item,[...all.filter(other=>other.kind!==item.kind),...street]);
 // Refilled streets must not create a new screen in front of an older facade.
 for(const item of all)assertFrontageClear(item,street);
});

test('the ten additions mix materials through the lap and retain a clear Thames setting for Cutty Sark',()=>{
 setTrack('coast-london');const plots=additions(),all=londonLandmarkPlacements(),byKind=new Map(all.map(item=>[item.kind,item]));
 for(let q=0;q<4;q++)assert.ok(plots.filter(item=>Math.floor(item.s/TRACK.length*4)===q).length>=2,`quarter ${q+1}: additions are bunched elsewhere`);
 for(const side of [-1,1])assert.ok(plots.filter(item=>item.side===side).length>=3,'both road sides need architectural variety');
 const lapGap=(a,b)=>{const d=Math.abs(a.s-b.s);return Math.min(d,TRACK.length-d);};
 assert.ok(lapGap(byKind.get('harrods'),byKind.get('british-library'))>3000,'the two large brick buildings should not form one repeated block');
 for(const kind of ['lloyds-building','one-canada-square'])for(const existing of ['the-gherkin','the-shard'])assert.ok(lapGap(byKind.get(kind),byKind.get(existing))>1500,`${kind}/${existing}: office towers are clustered`);
 const ship=byKind.get('cutty-sark'),bankGap=Math.abs(ship.z-TRACK.river.centerZ)-TRACK.river.halfWidth-ship.radius;
 assert.ok(bankGap>=27&&bankGap<180,'the ship should occupy a clear riverside plot');
});

test('all ten new silhouettes and solid hulls reach the actual London GPU scene within 40 MB',t=>{
 setTrack('coast-london');const gl=fakeGL(),renderer=new RaceRenderer({width:1440,height:820,getContext:()=>gl,addEventListener(){}});
 assert.equal(renderer.available,true,renderer.error);let bytes=0;
 for(const data of gl.buffers.values()){bytes+=data.byteLength;for(const n of data)assert.ok(Number.isFinite(n));}
 assert.ok(bytes<40_000_000,`${bytes/1e6} MB exceeds the fixed London GPU budget`);
 const key=p=>p.map(Math.fround).join(','),peaks=new Map();
 for(const item of additions()){
  const mesh=probe(item);peaks.set(key(mesh.top),item.kind);assert.ok(mesh.colliders.length>0,`${item.kind}: no solid body`);
  // Hand-built curved hulls carry scene-order IDs; identity depends on all of
  // their geometric fields, not the unrelated preceding world's collider count.
  for(const hull of mesh.colliders)assert.ok(renderer.obstacles.some(actual=>Object.entries(hull).filter(([name])=>name!=='id').every(([name,value])=>typeof value==='number'?Math.abs(actual[name]-value)<1e-7:actual[name]===value)),`${item.kind}: missing production body hull`);
 }
 const data=gl.buffers.get(renderer.meshes.props.buffer);assert.ok(data?.length>0,'missing production props buffer');
 for(let i=0;i<data.length&&peaks.size;i+=11)peaks.delete([data[i],data[i+1],data[i+2]].join(','));
 assert.deepEqual([...peaks.values()],[],'a new model is missing from the production scene');
 t.diagnostic(`Complete London GPU geometry: ${(bytes/1e6).toFixed(3)} MB`);
});

test('third-set body hulls leave every car lane and the chase camera clear for the full lap',()=>{
 setTrack('coast-london');const world=new ObstacleWorld(additions().flatMap(item=>probe(item).colliders)),edge=TRACK.roadWidth/2-world.carRadius;
 for(let s=0;s<TRACK.length;s+=17)for(const lane of [-edge,0,edge]){
  const pose=trackPoint(s,lane);assert.equal(world.resolveCar({...pose,height:25,speed:0}),0,`car obstructed at ${s}/${lane}`);
  for(const speed of [0,363,517]){
   const camera=updateChaseCamera({...pose,speed,boosting:speed===517},null);
   assert.equal(world.resolveCar({x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:pose.angle,speed:0}),0,`chase camera obstructed at ${s}/${lane}/${speed}`);
  }
 }
});

test('London plot search terminates with a clear failure when no safe site exists', {timeout:1000},()=>{
 setTrack('coast');assert.deepEqual(londonThirdLandmarkPlacements([],LONDON_THIRD_LANDMARKS),[]);
 setTrack('coast-london');
 assert.throws(()=>londonThirdLandmarkPlacements([],[{kind:'unknown'}]),/No curated London plot/);
 assert.throws(()=>londonThirdLandmarkPlacements([{kind:'occupied',x:0,z:0,radius:1e6,s:0,angle:0}],[LONDON_THIRD_LANDMARKS[0]]),/No clear London plot or facade sightline/);
});
