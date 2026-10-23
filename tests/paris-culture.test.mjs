import test from 'node:test';
import assert from 'node:assert/strict';
import {PARIS_CULTURE,addParisCulture} from '../paris-culture.js';
import {ObstacleWorld} from '../collisions.js';

// Independent model collector follows production box/cone vertex semantics.
class ModelMesh {
 constructor(item){this.item=item;this.min=[Infinity,Infinity,Infinity];this.max=[-Infinity,-Infinity,-Infinity];this.radius=0;this.triangles=0;this.colors=new Set();this.colliders=[];this.faces=[];}
 vertex(p,color){assert.ok(p.every(Number.isFinite),`${this.item.kind}: nonfinite vertex`);const dx=p[0]-this.item.x,dz=p[2]-this.item.z,c=Math.cos(this.item.angle),s=Math.sin(this.item.angle),local=[c*dx+s*dz,p[1]-this.item.elevation,-s*dx+c*dz];for(let i=0;i<3;i++){this.min[i]=Math.min(this.min[i],local[i]);this.max[i]=Math.max(this.max[i],local[i]);}this.radius=Math.max(this.radius,Math.hypot(dx,dz));this.colors.add(color);}
 triangle(a,b,c,color){for(const p of [a,b,c])this.vertex(p,color);this.triangles++;this.faces.push({points:[a,b,c],color});}
 quad(a,b,c,d,color){for(const p of [a,b,c,d])this.vertex(p,color);this.triangles+=2;this.faces.push({points:[a,b,c],color},{points:[a,c,d],color});}
 box(x,y,z,w,h,d,color,angle=0){assert.ok([w,h,d].every(n=>n>0&&Number.isFinite(n)),`${this.item.kind}: malformed solid`);for(const a of [-1,1])for(const b of [-1,1])for(const e of [-1,1])this.vertex([x+Math.cos(angle)*a*w/2-Math.sin(angle)*e*d/2,y+b*h/2,z+Math.sin(angle)*a*w/2+Math.cos(angle)*e*d/2],color);this.triangles+=12;if(this.colliders)this.colliders.push({type:'box',x,y:z,halfWidth:w/2,halfDepth:d/2,angle,minHeight:y-h/2,maxHeight:y+h/2});}
 cone(x,y,z,r,h,color,sides=8,top=0,phase=0){assert.ok(r>0&&h>0&&top>=0,`${this.item.kind}: malformed cylinder`);for(let i=0;i<sides;i++)for(const up of [false,true]){const a=i/sides*Math.PI*2+phase,rr=up?top:r;this.vertex([x+Math.cos(a)*rr,y+(up?h:0),z+Math.sin(a)*rr],color);}this.triangles+=sides*(top===0?1:2);if(this.colliders)this.colliders.push({type:'circle',x,y:z,radius:Math.max(r,top),minHeight:y,maxHeight:y+h});}
}


const create=(meta,angle=0)=>{const item={...meta,x:531,z:-731,angle,elevation:9},mesh=new ModelMesh(item);assert.equal(addParisCulture(mesh,item),true);return mesh;};
const local=(mesh,p)=>{const dx=p[0]-mesh.item.x,dz=p[2]-mesh.item.z,c=Math.cos(mesh.item.angle),s=Math.sin(mesh.item.angle);return[c*dx+s*dz,p[1]-mesh.item.elevation,-s*dx+c*dz];};

test('Paris cultural set has ten unique immutable identities, distinctive features and institution references',()=>{
 assert.equal(PARIS_CULTURE.length,10);assert.equal(new Set(PARIS_CULTURE.map(p=>p.kind)).size,10);assert.ok(Object.isFrozen(PARIS_CULTURE));
 for(const p of PARIS_CULTURE){assert.ok(Object.isFrozen(p));assert.equal(p.family,'culture');assert.ok(p.features.length>=3&&Object.isFrozen(p.features));assert.match(p.source,/^https:\/\//);assert.ok(p.nameZh&&p.label);assert.equal(p.radius,Math.hypot(p.width,p.depth)/2+8);}
 const empty={};assert.equal(addParisCulture(empty,{kind:'unknown'}),false);assert.deepEqual(empty,{});
});

test('all culture geometry fits reserved bounds at every rotation with real solids and a limited GPU budget',t=>{
 let total=0;
 for(const meta of PARIS_CULTURE)for(const angle of [0,.731,2.83]){
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
 assert.ok(total<=20000,`${total} triangles exceed the culture-group budget`);t.diagnostic(`Total: ${total} triangles / ${(total*3*11*4/1e6).toFixed(3)} MB raw production vertices`);
});

test('glass sails, mirrored sphere, open-book towers and four-sided clock use real distinct geometry',()=>{
 const models=new Map(PARIS_CULTURE.map(meta=>[meta.kind,create(meta)]));
 const sails=models.get('fondation-louis-vuitton'),glass=sails.faces.filter(f=>['#839fa4','#729297','#a7b8b5'].includes(f.color));
 assert.equal(glass.length,1152,'twelve curved sails, each with a 6 × 8 panel surface');
 const slopes=new Set(glass.map(f=>{const [a,b,c]=f.points.map(p=>local(sails,p)),u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n);return n.map(p=>Math.round(p/len*8)).join(',');}));
 assert.ok(slopes.size>40,'sails must be curved and individually oriented, not billboard rectangles');
 const globe=models.get('la-geode'),mirrors=globe.faces.filter(f=>['#657f79','#9fae9d','#748c85','#b4c6c3','#87a4af','#9ab7bc'].includes(f.color));
 assert.equal(mirrors.length,728);
 for(const face of mirrors)for(const point of face.points){const p=local(globe,point);assert.ok(Math.abs(Math.hypot(p[0],p[1]-65,p[2])-60)<1e-7,'mirrored triangular panels lie on the real sphere');}
 const books=models.get('bnf-francois-mitterrand'),towers=books.colliders.filter(h=>h.maxHeight-h.minHeight>180);
 assert.equal(towers.length,8,'four towers each consist of two real perpendicular book leaves');
 assert.equal(new Set(towers.map(h=>`${Math.sign(h.x-books.item.x)},${Math.sign(h.y-books.item.z)}`)).size,4);
 const station=models.get('gare-de-lyon'),dials=station.faces.filter(f=>f.color==='#e0d3b7');
 assert.equal(dials.length,96,'four circular clock faces use 24 real triangles each');
 const clockPlanes=new Set(dials.map(f=>{const p=f.points.map(p=>local(station,p));return Math.abs(p[0][0]-p[1][0])<1e-7&&Math.abs(p[1][0]-p[2][0])<1e-7?`x:${p[0][0].toFixed(1)}`:`z:${p[0][2].toFixed(1)}`;}));
 assert.equal(clockPlanes.size,4,'clock dials face all four directions');
 const mill=models.get('moulin-rouge'),sailsRed=mill.faces.filter(f=>f.color==='#d16c55');assert.ok(sailsRed.length>=100,'four windmill wings retain open lattice rods');
 const screen=models.get('institut-monde-arabe'),diaphragms=screen.faces.filter(f=>f.color==='#b0b9b1');assert.equal(diaphragms.length,240,'sixty distinct octagonal mashrabiya diaphragm motifs');
});
