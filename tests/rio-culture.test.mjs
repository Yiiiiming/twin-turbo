import test from 'node:test';
import assert from 'node:assert/strict';
import {RIO_CULTURE_LANDMARKS,addRioCulture} from '../src/rio-culture.js';
import {ObstacleWorld} from '../src/collisions.js';

// Independent model collector follows production box/cone vertex semantics.
class ModelMesh {
 constructor(item){this.item=item;this.min=[Infinity,Infinity,Infinity];this.max=[-Infinity,-Infinity,-Infinity];this.radius=0;this.triangles=0;this.colors=new Set();this.colliders=[];this.faces=[];}
 vertex(p,color){assert.ok(p.every(Number.isFinite),`${this.item.kind}: nonfinite vertex`);const dx=p[0]-this.item.x,dz=p[2]-this.item.z,c=Math.cos(this.item.angle),s=Math.sin(this.item.angle),local=[c*dx+s*dz,p[1]-this.item.elevation,-s*dx+c*dz];for(let i=0;i<3;i++){this.min[i]=Math.min(this.min[i],local[i]);this.max[i]=Math.max(this.max[i],local[i]);}this.radius=Math.max(this.radius,Math.hypot(dx,dz));this.colors.add(color);}
 triangle(a,b,c,color){for(const p of [a,b,c])this.vertex(p,color);this.triangles++;this.faces.push({points:[a,b,c],color});}
 quad(a,b,c,d,color){for(const p of [a,b,c,d])this.vertex(p,color);this.triangles+=2;this.faces.push({points:[a,b,c],color},{points:[a,c,d],color});}
 box(x,y,z,w,h,d,color,angle=0){assert.ok([w,h,d].every(n=>n>0&&Number.isFinite(n)),`${this.item.kind}: malformed solid`);for(const a of [-1,1])for(const b of [-1,1])for(const e of [-1,1])this.vertex([x+Math.cos(angle)*a*w/2-Math.sin(angle)*e*d/2,y+b*h/2,z+Math.sin(angle)*a*w/2+Math.cos(angle)*e*d/2],color);this.triangles+=12;if(this.colliders)this.colliders.push({type:'box',x,y:z,halfWidth:w/2,halfDepth:d/2,angle,minHeight:y-h/2,maxHeight:y+h/2});}
 cone(x,y,z,r,h,color,sides=8,top=0,phase=0){assert.ok(r>0&&h>0&&top>=0,`${this.item.kind}: malformed cylinder`);for(let i=0;i<sides;i++)for(const up of [false,true]){const a=i/sides*Math.PI*2+phase,rr=up?top:r;this.vertex([x+Math.cos(a)*rr,y+(up?h:0),z+Math.sin(a)*rr],color);}this.triangles+=sides*(top===0?1:2);if(this.colliders)this.colliders.push({type:'circle',x,y:z,radius:Math.max(r,top),minHeight:y,maxHeight:y+h});}
}


const create=(meta,angle=0)=>{const item={...meta,x:531,z:-731,angle,elevation:9},mesh=new ModelMesh(item);assert.equal(addRioCulture(mesh,item),true);return mesh;};
const local=(mesh,p)=>{const dx=p[0]-mesh.item.x,dz=p[2]-mesh.item.z,c=Math.cos(mesh.item.angle),s=Math.sin(mesh.item.angle);return[c*dx+s*dz,p[1]-mesh.item.elevation,-s*dx+c*dz];};

test('Rio cultural set has ten unique immutable identities, distinctive features and institution references',()=>{
 assert.equal(RIO_CULTURE_LANDMARKS.length,10);assert.equal(new Set(RIO_CULTURE_LANDMARKS.map(p=>p.kind)).size,10);assert.ok(Object.isFrozen(RIO_CULTURE_LANDMARKS));
 for(const p of RIO_CULTURE_LANDMARKS){assert.ok(Object.isFrozen(p));assert.equal(p.family,'culture');assert.ok(p.features.length>=3&&Object.isFrozen(p.features));assert.match(p.source,/^https:\/\//);assert.ok(p.nameZh&&p.label);assert.equal(p.radius,Math.hypot(p.width,p.depth)/2+8);}
 const empty={};assert.equal(addRioCulture(empty,{kind:'unknown'}),false);assert.deepEqual(empty,{});
});

test('all culture geometry fits reserved bounds at every rotation with real solids and a limited GPU budget',t=>{
 let total=0;
 for(const meta of RIO_CULTURE_LANDMARKS)for(const angle of [0,.731,2.83]){
  const mesh=create(meta,angle),hulls=mesh.colliders;
  assert.ok(mesh.triangles>=600,`${meta.kind}: missing architectural detail (${mesh.triangles})`);
  assert.ok(mesh.triangles<=3500,`${meta.kind}: excessive triangles (${mesh.triangles})`);
  assert.ok(mesh.colors.size>=6,`${meta.kind}: material layers absent`);
  assert.ok(!mesh.colors.has('#ffffff')&&!mesh.colors.has('#fff'));
  assert.ok(mesh.radius<=meta.radius+.01,`${meta.kind}: radius ${mesh.radius}/${meta.radius}`);
  for(const [axis,dimension]of [[0,'width'],[2,'depth']]){
   assert.ok(mesh.min[axis]>=-meta[dimension]/2-.01&&mesh.max[axis]<=meta[dimension]/2+.01,`${meta.kind}: ${dimension} ${mesh.min[axis]}..${mesh.max[axis]} outside ±${meta[dimension]/2}`);
  }
  assert.ok(mesh.min[1]>=-.01&&mesh.max[1]<=meta.height+.01,`${meta.kind}: height ${mesh.min[1]}..${mesh.max[1]} exceeds ${meta.height}`);
  assert.ok(mesh.max[1]>meta.height*.85,`${meta.kind}: silhouette too short`);
  const body=hulls.find(h=>h.maxHeight-h.minHeight>5);assert.ok(body,`${meta.kind}: no primary body collider`);
  const world=new ObstacleWorld(hulls);assert.ok(world.resolveCar({x:body.x,y:body.y,elevation:body.minHeight+1,height:25,angle,speed:0})>0,`${meta.kind}: body has no collision`);
  if(angle===0){total+=mesh.triangles;t.diagnostic(`${meta.kind}: ${mesh.triangles} triangles; ${hulls.length} solids; ${mesh.colors.size} materials`);}
 }
 assert.ok(total<=22500,`${total} triangles exceed the culture-group budget`);t.diagnostic(`Total: ${total} triangles / ${(total*3*11*4/1e6).toFixed(3)} MB raw production vertices`);
});


const at=(m,x,y,z)=>{const p=m.item,c=Math.cos(p.angle),s=Math.sin(p.angle);return[p.x+c*x-s*z,p.elevation+y,p.z+s*x+c*z];};
function occupied(m,x,y,z){const p=at(m,x,y,z);return m.colliders.some(h=>{if(p[1]<h.minHeight||p[1]>h.maxHeight)return false;const dx=p[0]-h.x,dz=p[2]-h.y;if(h.type==='circle')return Math.hypot(dx,dz)<h.radius;const a=h.angle||0;return Math.abs(Math.cos(a)*dx+Math.sin(a)*dz)<h.halfWidth&&Math.abs(-Math.sin(a)*dx+Math.cos(a)*dz)<h.halfDepth;});}
const normal=points=>{const [a,b,c]=points,u=b.map((n,i)=>n-a[i]),v=c.map((n,i)=>n-a[i]);return[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];};

test('open sporting, museum and courtyard spaces retain real empty volumes rather than filled landmark boxes',()=>{
 for(const angle of [0,.71,2.4]){
  const models=new Map(RIO_CULTURE_LANDMARKS.map(meta=>[meta.kind,create(meta,angle)]));
  for(const [kind,points] of [
   ['mam-rio',[[0,14,0],[35,14,0]]],
   ['maracana-stadium',[[0,12,0],[40,12,25],[-40,12,-25]]],
   ['sambadrome',[[0,35,-40],[0,70,65],[20,70,65]]],
   ['parque-lage',[[0,20,0],[0,20,-59]]],
   ['rio-botanical-garden',[[0,25,-78],[0,15,-30]]],
  ])for(const p of points)assert.equal(occupied(models.get(kind),...p),false,`${kind} should retain open space ${p} at angle ${angle}`);
  assert.equal(occupied(models.get('sambadrome'),58,30,65),true,'Apotheosis has a real colliding leg');
  assert.equal(occupied(models.get('parque-lage'),80,30,-6),true,'mansion wing remains solid beside the pool');
 }
});

test('distinctive structures include a waving canopy, ceramic stair, four clock faces and a palm avenue',()=>{
 const models=new Map(RIO_CULTURE_LANDMARKS.map(meta=>[meta.kind,create(meta)]));
 const mar=models.get('mar-rio'),roof=mar.faces.filter(f=>f.color==='#deded0'&&f.points.every(p=>local(mar,p)[1]>130));
 assert.ok(roof.length>=400,'shared canopy has a genuinely sampled curved surface');
 const heights=roof.flatMap(f=>f.points.map(p=>local(mar,p)[1]));assert.ok(Math.max(...heights)-Math.min(...heights)>10,'MAR canopy must visibly undulate');
 const stair=models.get('selaron-steps'),steps=stair.colliders.filter(h=>Math.abs(h.halfWidth-40.5)<1e-6);
 assert.equal(steps.length,25,'the stair is made of solid ascending treads');
 const sorted=steps.sort((a,b)=>a.y-b.y);for(let i=1;i<sorted.length;i++){assert.ok(sorted[i].y>sorted[i-1].y);assert.equal(sorted[i].maxHeight-sorted[i-1].maxHeight,3);}
 const tileColors=['#d6b252','#4c8c96','#e1c5a0','#467c55','#aa4a35','#4265a0'];
 const tiles=stair.faces.filter(f=>tileColors.includes(f.color));assert.ok(tiles.length>=800,'individually coloured fine ceramic tiles remain separate');
 const central=models.get('central-do-brasil'),dials=central.faces.filter(f=>f.color==='#d7d6b9');assert.equal(dials.length,8,'four actual square clock infill planes');
 const planes=new Set(dials.map(f=>{const ps=f.points.map(p=>local(central,p));return Math.abs(ps[0][0]-ps[1][0])<1e-7&&Math.abs(ps[1][0]-ps[2][0])<1e-7?`x:${ps[0][0].toFixed(1)}`:`z:${ps[0][2].toFixed(1)}`;}));assert.equal(planes.size,4,'the Central clock reads on four sides');
 const garden=models.get('rio-botanical-garden'),trunks=garden.colliders.filter(h=>h.type==='circle'&&h.maxHeight-h.minHeight>100);assert.equal(trunks.length,6,'three pairs of royal palms flank the garden avenue');
 const wings=models.get('museum-of-tomorrow'),high=wings.faces.filter(f=>f.points.every(p=>local(wings,p)[1]>48));
 assert.ok(high.length>150,'museum roof retains repeated solar wings and longitudinal ribs');
 const xs=high.flatMap(f=>f.points.map(p=>local(wings,p)[0]));assert.ok(Math.max(...xs)-Math.min(...xs)>240,'the long cantilever extends beyond the glass body');
});

test('reflecting pools, playing field and stadium roof face upward under production lighting',()=>{
 for(const meta of RIO_CULTURE_LANDMARKS){const m=create(meta);for(const f of m.faces){if(['#3b9499','#3e8050','#488958','#c4cfbd','#aebdac'].includes(f.color))assert.ok(normal(f.points)[1]>0,`${meta.kind}: an upward-facing surface has an inverted normal`);}}
});
