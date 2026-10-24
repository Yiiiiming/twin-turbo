import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK,setTrack,trackPoint } from '../src/engine.js';
import { ObstacleWorld } from '../src/collisions.js';
import { updateChaseCamera } from '../src/renderer.js';
import { addBeijingStadium,beijingStadiumClearance,beijingStadiumModelLayout } from '../src/beijing-stadium.js';

test.afterEach(()=>setTrack('coast'));
class Mesh {
 constructor(){this.colliders=[];this.triangles=[];this.faces=[];this.colors=new Set();this.points=[];}
 triangle(a,b,c,color){for(const p of[a,b,c])assert.ok(p.every(Number.isFinite));this.triangles.push([a,b,c]);this.faces.push({vertices:[a,b,c],color});this.points.push(a,b,c);this.colors.add(color);}
 quad(a,b,c,d,color){this.triangle(a,b,c,color);this.triangle(a,c,d,color);}
 box(x,y,z,w,h,d,color,angle=0){assert.ok([w,h,d].every(v=>v>0&&Number.isFinite(v)));const c=Math.cos(angle),s=Math.sin(angle),v=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(([a,b,e])=>[x+c*a*w/2-s*e*d/2,y+b*h/2,z+s*a*w/2+c*e*d/2]);for(const ids of[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]])this.quad(...ids.map(i=>v[i]),color);if(this.colliders)this.colliders.push({type:'box',x,y:z,halfWidth:w/2,halfDepth:d/2,angle,minHeight:y-h/2,maxHeight:y+h/2});}
}
const make=item=>{const mesh=new Mesh();addBeijingStadium(mesh,item);return mesh;};
const transform=(item,x,z)=>({x:item.x+Math.cos(item.angle)*x-Math.sin(item.angle)*z,y:item.z+Math.sin(item.angle)*x+Math.cos(item.angle)*z});
const carAt=(item,x,z,elevation=0)=>({...transform(item,x,z),elevation:(item.elevation||0)+elevation,height:25,angle:item.angle,speed:0});
function ovalPose(s,lane=0){
 const radius=320,h=400,L=800,arc=Math.PI*radius,length=2*L+2*arc;
 s=((s%length)+length)%length;let x,z,angle;
 if(s<L){x=-h+s;z=-radius;angle=0;}
 else if((s-=L)<arc){const a=-Math.PI/2+s/radius;x=h+Math.cos(a)*radius;z=Math.sin(a)*radius;angle=a+Math.PI/2;}
 else if((s-=arc)<L){x=h-s;z=radius;angle=Math.PI;}
 else{const a=Math.PI/2+(s-L)/radius;x=-h+Math.cos(a)*radius;z=Math.sin(a)*radius;angle=a+Math.PI/2;}
 return{x:x-Math.sin(angle)*lane,y:z+Math.cos(angle)*lane,angle,elevation:0,slope:0};
}
const eyeProbe=camera=>({x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,angle:camera.angle,speed:0});

test('the hollow Bird’s Nest has detailed red seating and woven steel within its physical and geometry budget',t=>{
 for(const angle of[0,.731,2.83]){
  const item={x:531,z:-731,angle,elevation:9,stadium:{}},mesh=make(item),cfg=beijingStadiumModelLayout({});
  assert.ok(mesh.triangles.length>=6000&&mesh.triangles.length<=12000,`${mesh.triangles.length} raw triangles`);
  assert.ok(mesh.colors.size>=12,'stepped seats, aisles, shell, steel and field remain distinct');
  assert.ok(mesh.colliders.length>=120&&mesh.colliders.length<300,`${mesh.colliders.length} local solid pieces`);
  assert.equal(cfg.openSectors.filter((v,i,a)=>!v&&a[(i+a.length-1)%a.length]).length,2,'the bowl has two distinct full-height passages');
  let radius=0,top=0;
  for(const p of mesh.points){radius=Math.max(radius,Math.hypot(p[0]-item.x,p[2]-item.z));top=Math.max(top,p[1]-item.elevation);assert.ok(p[1]>=item.elevation-.01);const dx=p[0]-item.x,dz=p[2]-item.z,x=dx*Math.cos(angle)+dz*Math.sin(angle),z=-dx*Math.sin(angle)+dz*Math.cos(angle);assert.ok(Math.hypot(x-Math.max(-400,Math.min(400,x)),z)<=571+.0001,'every visible ribbon stays inside the capsule reserved by scenery clearance');}
  assert.ok(radius<=cfg.maxRadius,`${radius}/${cfg.maxRadius}`);assert.ok(top<=cfg.height,`${top}/${cfg.height}`);
  assert.ok(mesh.colliders.every(h=>h.minHeight>=item.elevation&&h.maxHeight>h.minHeight));
  assert.ok(mesh.colliders.every(h=>h.halfWidth<100&&h.halfDepth<25),'no invisible full-bowl slab or coarse enclosing hull');
  if(angle===0)t.diagnostic(`${mesh.triangles.length} triangles, ${mesh.colliders.length} hulls; radius ${radius.toFixed(2)}, height ${top.toFixed(2)}`);
 }
});

test('a continuous visible infield rail stops grass shortcuts while the center remains a hollow open field',()=>{
 const item={x:50,z:70,angle:.4,elevation:11,stadium:{}},mesh=make(item),world=new ObstacleWorld(mesh.colliders),length=1600+Math.PI*640;
 assert.equal(world.resolveCar(carAt(item,0,0)),0,'the field has no full-area collision slab');
 for(let s=0;s<length;s+=19){const p=ovalPose(s,95);assert.ok(world.resolveCar(carAt(item,p.x,p.y))>0,`rail gap at ${s}`);}
 const stand=mesh.colliders.find(h=>h.maxHeight-item.elevation>=58);assert.ok(stand);
 assert.ok(world.resolveCar({x:stand.x,y:stand.y,elevation:stand.minHeight+1,height:25,angle:stand.angle,speed:0})>0,'visible grandstand is not ghost scenery');
});

test('every capsule racing lane and production chase-camera pose clears the stands and roof',()=>{
 const world=new ObstacleWorld(make({x:0,z:0,angle:0,elevation:0,stadium:{}}).colliders),length=1600+Math.PI*640;
 for(const lane of[-48,0,48])for(const speed of[0,363,517]){
  let previous=null;
  for(let s=0;s<length;s+=9){const car={...ovalPose(s,lane),speed,height:25};assert.equal(world.resolveCar({...car}),0,`car ${s}/${lane}/${speed}`);const snap=updateChaseCamera(car,null);assert.equal(world.resolveCar(eyeProbe(snap)),0,`snap camera ${s}/${lane}/${speed}`);previous=updateChaseCamera(car,previous,1/60);assert.equal(world.resolveCar(eyeProbe(previous)),0,`moving camera ${s}/${lane}/${speed}`);}
 }
});

test('stadium clearance uses the real rotated capsule instead of clearing its empty enclosing-circle corners',()=>{
 const stadium={center:{x:100,z:200},angle:.7,radius:320,halfStraight:400},item={x:100,z:200,angle:.7};
 const p=transform(item,0,600);assert.equal(beijingStadiumClearance(stadium,p.x,p.y,20),true,'a safe straight-side garden remains available');
 const q=transform(item,950,0);assert.equal(beijingStadiumClearance(stadium,q.x,q.y,0),false,'end-cap shell remains solid reserved land');
 const r=transform(item,1000,0);assert.equal(beijingStadiumClearance(stadium,r.x,r.y,20),true);
});

test('actual Beijing entry, exit, complete inner course and old road leave cars and chase cameras clear',t=>{
 setTrack('coast-beijing');assert.ok(TRACK.stadium?.accessSegments?.length,'production route publishes both access paths');
 const stadium=TRACK.stadium,item={x:stadium.center.x,z:stadium.center.z,angle:stadium.angle,elevation:stadium.elevation||0,stadium},mesh=make(item),world=new ObstacleWorld(mesh.colliders),cfg=beijingStadiumModelLayout(stadium);
 assert.ok(mesh.triangles.length<=12000,'the complete production route model keeps the original 12,000-triangle budget, including interior furniture');
 assert.ok(cfg.cuts.length>100,'real access paths cut the entire stand and shell, not just an exterior door');
 assert.equal(cfg.openSectors.filter((v,i,a)=>!v&&a[(i+a.length-1)%a.length]).length,2,'entry and exit create two true openings through the complete seating bowl');
 assert.ok(cfg.openSectors.filter(Boolean).length>=70,'the bowl remains recognisable around the two passages');
 for(let s=0;s<TRACK.length;s+=13)for(const lane of[-48,0,48]){
  const p=trackPoint(s,lane);assert.equal(world.resolveCar({...p,height:25,speed:0}),0,`production road ${s}/${lane}`);
  for(const speed of[0,363,517]){const camera=updateChaseCamera({...p,speed,boosting:speed===517},null);assert.equal(world.resolveCar(eyeProbe(camera)),0,`production camera ${s}/${lane}/${speed}`);}
 }
 t.diagnostic(`Actual route model: ${mesh.triangles.length} triangles, ${mesh.colliders.length} solid hulls`);
});

test('both football goals have solid separate posts, a genuinely open mouth and sparse three-dimensional nets',()=>{
 const mesh=make({x:0,z:0,angle:0,elevation:0,stadium:{}}),world=new ObstacleWorld(mesh.colliders),net=mesh.faces.filter(face=>face.color==='#a9b2a1');
 assert.ok(net.length>=200&&net.length<320,'both goals carry individual cords, not a filled opaque back panel');
 for(const side of[-1,1]){
  const x=side*286,probe=(xx,z,elevation=0,height=25)=>({x:xx,y:z,angle:0,elevation,height,speed:0});
  for(const z of[-33,33])assert.ok(world.resolveCar(probe(x,z))>0,'the front goalposts are actual visible solids');
  assert.equal(world.resolveCar(probe(x,0)),0,'the 66-wide, 28.5-high opening has no invisible infill');
  assert.ok(world.resolveCar(probe(x,0,29,2))>0,'the crossbar has a height-bounded physical solid');
  const faces=net.filter(face=>face.vertices.every(p=>Math.sign(p[0])===side)),points=faces.flatMap(face=>face.vertices);
  assert.ok(Math.max(...points.map(p=>Math.abs(p[0])))-Math.min(...points.map(p=>Math.abs(p[0])))>27,'the net has side and roof depth');
  assert.ok(Math.max(...points.map(p=>p[1]))>28&&Math.min(...points.map(p=>p[1]))<2,'nets extend from ground to the goal top');
  for(const {vertices:[a,b,c]}of faces){const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]),area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;assert.ok(area<17,'a net face remains a thin cord, never a screen');}
 }
});

test('raised red chair backs, recessed stair entrances and match equipment give the interior depth without filling the pitch',()=>{
 const mesh=make({x:0,z:0,angle:0,elevation:0,stadium:{}}),seatColors=new Set(['#cd6550','#ae493d','#d8795d']),backs=mesh.faces.filter(face=>seatColors.has(face.color)&&face.vertices.some(p=>Math.abs(p[2])>450||Math.abs(p[0])>800));
 assert.ok(backs.length>1200,'separate red backs reach many rows around the bowl');
 const tiers=new Set(backs.flatMap(face=>face.vertices.map(p=>Math.round(p[1]))));assert.ok(tiers.size>=10,'backs rise above multiple seat treads rather than painting a flat texture');
 const entrances=mesh.faces.filter(face=>face.color==='#202f32');assert.ok(entrances.length>=10,'multiple dark entrances are recessed behind the lower-tier frontage');
 assert.ok(mesh.faces.some(face=>face.color==='#102b32'),'the match display has a distinct dark screen');
 const world=new ObstacleWorld(mesh.colliders);
 for(const x of[-94,94])assert.ok(world.resolveCar({x,y:184,elevation:0,height:25,angle:0,speed:0})>0,'team benches are actual solids within the protected infield');
 assert.equal(world.resolveCar({x:0,y:0,elevation:0,height:25,angle:0,speed:0}),0,'the grass center remains open');
});

// Independent finite-segment/triangle intersections inspect visible roof and
// lattice faces too: collision-only tests cannot detect a non-solid screen.
const sub=(a,b)=>a.map((n,i)=>n-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
function viewBlocked(a,b,triangles){
 const direction=sub(b,a),lo=a.map((n,i)=>Math.min(n,b[i])),hi=a.map((n,i)=>Math.max(n,b[i]));
 for(const {vertices:[v0,v1,v2],min,max}of triangles){
  if(min.some((n,i)=>n>hi[i])||max.some((n,i)=>n<lo[i]))continue;
  const e1=sub(v1,v0),e2=sub(v2,v0),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)continue;
  const s=sub(a,v0),u=dot(s,h)/det;if(u<0||u>1)continue;const q=cross(s,e1),v=dot(direction,q)/det;if(v<0||u+v>1)continue;
  const t=dot(e2,q)/det;if(t>.005&&t<.995)return true;
 }
 return false;
}
test('visible roofs and woven beams do not obscure the actual approach, portal or racing view',()=>{
 setTrack('coast-beijing');const stadium=TRACK.stadium,item={x:stadium.center.x,z:stadium.center.z,angle:stadium.angle,elevation:stadium.elevation||0,stadium},mesh=make(item),triangles=mesh.triangles.map(vertices=>({vertices,min:[0,1,2].map(i=>Math.min(...vertices.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...vertices.map(p=>p[i])))}));
 for(let s=0;s<TRACK.length;s+=31){
  const center=trackPoint(s);if(Math.hypot(center.x-item.x,center.y-item.z)>1300)continue;
  for(const lane of[-48,0,48])for(const speed of[363,517]){
   const p=trackPoint(s,lane),camera=updateChaseCamera({...p,speed},null),hood=[p.x+Math.cos(p.angle)*25,p.elevation+17,p.y+Math.sin(p.angle)*25];
   for(const target of[camera.target,hood])assert.equal(viewBlocked(camera.eye,target,triangles),false,`visible stadium blocks driving view at ${s}/${lane}/${speed}`);
  }
 }
});

test('a 150-high entrance can descend along the first straight and bend without touching or looking through the roof',()=>{
 const mesh=make({x:0,z:0,angle:0,elevation:0,stadium:{}}),world=new ObstacleWorld(mesh.colliders),triangles=mesh.triangles.map(vertices=>({vertices,min:[0,1,2].map(i=>Math.min(...vertices.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...vertices.map(p=>p[i])))}));
 const start=1600+Math.PI*320,length=1600+Math.PI*640-250;let highestEye=0;
 for(const lane of[-48,0,48])for(let s=0;s<length;s+=17){
  const t=Math.min(1,s/1000),p=ovalPose(start-s,-lane),car={...p,angle:p.angle+Math.PI,elevation:150*(1-t*t*(3-2*t)),slope:-.9*t*(1-t),speed:517,height:25},camera=updateChaseCamera(car,null);
  highestEye=Math.max(highestEye,camera.eye[1]);assert.equal(world.resolveCar({...car}),0,`raised car ${s}/${lane}`);assert.equal(world.resolveCar(eyeProbe(camera)),0,`raised camera ${s}/${lane}`);
  assert.equal(viewBlocked(camera.eye,camera.target,triangles),false,`raised sightline ${s}/${lane}`);
 }
 assert.ok(highestEye>239&&highestEye<240,'the test exercises the high descending chase camera, above the 238-unit landmark height');
});
