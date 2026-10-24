import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {RIO_CIVIC_LANDMARKS,addRioCivic} from '../src/rio-civic.js';
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


const create=(meta,angle=0)=>{const item={...meta,x:531,z:-731,angle,elevation:9},mesh=new ModelMesh(item);assert.equal(addRioCivic(mesh,item),true);return mesh;};
const local=(mesh,p)=>{const dx=p[0]-mesh.item.x,dz=p[2]-mesh.item.z,c=Math.cos(mesh.item.angle),s=Math.sin(mesh.item.angle);return[c*dx+s*dz,p[1]-mesh.item.elevation,-s*dx+c*dz];};

test('Rio civic set has ten unique immutable identities, distinctive features and institution references',()=>{
 assert.equal(RIO_CIVIC_LANDMARKS.length,10);assert.equal(new Set(RIO_CIVIC_LANDMARKS.map(p=>p.kind)).size,10);assert.ok(Object.isFrozen(RIO_CIVIC_LANDMARKS));
 for(const p of RIO_CIVIC_LANDMARKS){assert.ok(Object.isFrozen(p));assert.equal(p.family,'civic');assert.ok(p.features.length>=3&&Object.isFrozen(p.features));assert.match(p.source,/^https:\/\//);assert.ok(p.nameZh&&p.label);assert.equal(p.radius,Math.hypot(p.width,p.depth)/2+8);}
 const empty={};assert.equal(addRioCivic(empty,{kind:'unknown'}),false);assert.deepEqual(empty,{});
});

test('all civic geometry fits reserved bounds at every rotation with real solids and a limited GPU budget',t=>{
 let total=0;
 for(const meta of RIO_CIVIC_LANDMARKS)for(const angle of [0,.731,2.83]){
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
 assert.ok(total<=20000,`${total} triangles exceed the civic-group budget`);t.diagnostic(`Total: ${total} triangles / ${(total*3*11*4/1e6).toFixed(3)} MB raw production vertices`);
});



test('the actual civic forms retain the six-column portico, paired cupolas, open court and nautical frontage',()=>{
 const models=new Map(RIO_CIVIC_LANDMARKS.map(meta=>[meta.kind,create(meta)]));
 const theatre=models.get('rio-theatro-municipal');
 const cupolas=theatre.colliders.filter(h=>h.type==='circle'&&h.minHeight-theatre.item.elevation>=117&&h.minHeight-theatre.item.elevation<148);
 assert.equal(cupolas.length,10,'two rounded copper cupolas retain five curved solid rings each');
 assert.equal(new Set(cupolas.map(h=>Math.sign(h.x-theatre.item.x))).size,2);
 const palace=models.get('rio-palacio-tiradentes');
 const columns=palace.colliders.filter(h=>h.type==='circle'&&Math.abs(h.minHeight-palace.item.elevation-34)<.01&&h.maxHeight-h.minHeight===58);
 assert.equal(columns.length,6,'six physically separate tall columns support the entrance portico');
 assert.ok(columns.every(h=>Math.abs(h.y-palace.item.z+47)<.01));
 const dome=palace.colliders.filter(h=>h.type==='circle'&&h.minHeight-palace.item.elevation>=122);
 assert.equal(dome.length,5,'the octagonal glazed dome remains rounded through five height bands');
 const imperial=models.get('rio-paco-imperial'),court={x:imperial.item.x,y:imperial.item.z+12,elevation:imperial.item.elevation+15,height:20,angle:0,speed:0};
 assert.equal(new ObstacleWorld(imperial.colliders).resolveCar(court),0,'the central courtyard is open above its paving, not filled by a palace-sized block');
 const catete=models.get('rio-palacio-catete');
 const wings=catete.faces.filter(face=>face.color==='#303d40'&&face.points.every(p=>local(catete,p)[1]>124));
 assert.equal(wings.length,8,'four rooftop bronze eagles each have two spread wing silhouettes');
 const gabinete=models.get('rio-real-gabinete');
 const peaks=gabinete.faces.filter(face=>face.color==='#385c64'&&face.points.some(p=>Math.abs(local(gabinete,p)[1]-108)<.01));
 assert.equal(peaks.length,3,'three carved pointed reading-room windows remain distinct');
 const coins=gabinete.faces.filter(face=>face.color==='#bc9652');assert.equal(coins.length,48,'three nautical medallions each have sixteen real faces');
 const ccbb=models.get('rio-ccbb'),bay=ccbb.colliders.find(h=>h.type==='circle'&&h.radius===37);
 assert.ok(bay&&Math.abs(bay.y-ccbb.item.z+34)<.01,'the CCBB entrance uses a real convex bay, not a flat facade');
 const signatures=new Set([...models.values()].map(mesh=>createHash('sha256').update(JSON.stringify([mesh.colliders,mesh.faces])).digest('hex')));
 assert.equal(signatures.size,10,'all ten civic buildings retain distinct geometry');
});

test('window glass stays outside the actual structural walls rather than being painted inside solids',()=>{
 const errors=[];
 for(const meta of RIO_CIVIC_LANDMARKS){
  const mesh=create(meta);
  const glass=mesh.faces.filter(face=>face.color==='#385c64');assert.ok(glass.length>=10);
  const inside=(p,h)=>{if(p[1]<=h.minHeight+.01||p[1]>=h.maxHeight-.01)return false;const dx=p[0]-h.x,dz=p[2]-h.y;if(h.type==='circle')return Math.hypot(dx,dz)<h.radius-.02;const c=Math.cos(h.angle),s=Math.sin(h.angle);return Math.abs(c*dx+s*dz)<h.halfWidth-.02&&Math.abs(-s*dx+c*dz)<h.halfDepth-.02;};
  const covered=glass.filter(face=>{const p=[0,1,2].map(axis=>face.points.reduce((sum,v)=>sum+v[axis],0)/3);return mesh.colliders.some(h=>inside(p,h));});
  if(covered.length)errors.push({kind:meta.kind,points:covered.map(face=>local(mesh,[0,1,2].map(axis=>face.points.reduce((sum,v)=>sum+v[axis],0)/3)).map(v=>Math.round(v*10)/10))});
 } assert.deepEqual(errors,[]);
});
