import test from 'node:test';
import assert from 'node:assert/strict';
import {setTrack} from '../engine.js';
import {addCityLandmark,cityLandmarkPlacements} from '../city-scenery.js';

// Independent triangle collector includes all six solid faces, so the depth
// checks also cover strings, neck, tuners and the support behind the body.
class Mesh {
 constructor(){this.faces=[];this.colliders=[];}
 triangle(a,b,c,color){this.faces.push({p:[a,b,c],color});}
 quad(a,b,c,d,color){this.triangle(a,b,c,color);this.triangle(a,c,d,color);}
 box(x,y,z,w,h,d,color,angle=0){const p=(a,b,c)=>[x+Math.cos(angle)*a-Math.sin(angle)*c,y+b,z+Math.sin(angle)*a+Math.cos(angle)*c],v=[p(-w/2,-h/2,-d/2),p(w/2,-h/2,-d/2),p(w/2,h/2,-d/2),p(-w/2,h/2,-d/2),p(-w/2,-h/2,d/2),p(w/2,-h/2,d/2),p(w/2,h/2,d/2),p(-w/2,h/2,d/2)];for(const[a,b,c,d]of[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]])this.quad(v[a],v[b],v[c],v[d],color);}
}
function model(angle=0){const item={kind:'music-guitar',x:315,z:-629,angle},mesh=new Mesh();addCityLandmark(mesh,item);for(const f of mesh.faces)f.p=f.p.map(p=>{const dx=p[0]-item.x,dz=p[2]-item.z;return[dx*Math.cos(angle)+dz*Math.sin(angle),p[1],-dx*Math.sin(angle)+dz*Math.cos(angle)];});return mesh;}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],sub=(a,b)=>a.map((n,i)=>n-b[i]),dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
function overlapArea(a,b){let polygon=a.map(p=>p.slice(0,2)),clip=b.map(p=>p.slice(0,2));const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(orient(...clip)<0)clip.reverse();for(let k=0;k<3;k++){const u=clip[k],v=clip[(k+1)%3],out=[];for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],a=orient(u,v,p),b=orient(u,v,q);if(a>=-1e-9)out.push(p);if((a>0&&b<0)||(a<0&&b>0)){const t=a/(a-b);out.push(p.map((n,j)=>n+(q[j]-n)*t));}}polygon=out;}return Math.abs(polygon.reduce((s,p,i)=>{const q=polygon[(i+1)%polygon.length];return s+p[0]*q[1]-p[1]*q[0];},0))/2;}
const bodyColor=c=>c==='#e6a778'||c==='#df8986';
const bodyFaces=m=>m.faces.filter(f=>bodyColor(f.color)||(f.color==='#a86b58'&&f.p.every(p=>Math.abs(p[2]+5)<1e-7||Math.abs(p[2]-5.5)<1e-7)));
function rayHit(mesh,eye,target){const d=sub(target,eye);let best=Infinity,color;for(const f of mesh.faces){const[a,b,c]=f.p,e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)continue;const tvec=sub(eye,a),u=dot(tvec,h)/det,q=cross(tvec,e1),v=dot(d,q)/det,t=dot(e2,q)/det;if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8&&t>0&&t<best){best=t;color=f.color;}}return color;}

test('Austin guitar colour regions have no positive-area coplanar overlap at arbitrary rotations',()=>{
 for(const angle of [0,.713,2.81]){const m=model(angle),faces=m.faces.filter(f=>bodyColor(f.color));assert.equal(faces.length,164);for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++)if(Math.abs(faces[i].p[0][2]-faces[j].p[0][2])<1e-7)assert.ok(overlapArea(faces[i].p,faces[j].p)<1e-7,'body fans must share edges only, including the two-tone seam');}
});

test('body is closed front-to-back and hole/string depths clear all front surfaces',()=>{
 const m=model(),body=bodyFaces(m),edges=new Map();assert.equal(body.length,324);
 const key=p=>p.map(n=>Math.round(n*1e7)).join(',');for(const f of body){assert.ok(Math.hypot(...cross(sub(f.p[1],f.p[0]),sub(f.p[2],f.p[0])))>1e-5);for(let i=0;i<3;i++){const e=[key(f.p[i]),key(f.p[(i+1)%3])].sort().join('|');edges.set(e,(edges.get(e)||0)+1);}}assert.ok([...edges.values()].every(n=>n===2),'all body skin edges have exactly two incident faces, including the colour seam');
 const hole=m.faces.filter(f=>f.color==='#314954'),strings=m.faces.filter(f=>f.color==='#f1edc1');assert.equal(hole.length,40);assert.equal(strings.length,48);
 const bodyFront=Math.min(...body.flatMap(f=>f.p.map(p=>p[2]))),holeDepth=hole[0].p[0][2],stringBack=Math.max(...strings.flatMap(f=>f.p.map(p=>p[2])));
 assert.ok(bodyFront-holeDepth>=1.2);assert.ok(holeDepth-stringBack>=1.2);assert.ok(hole.every(f=>f.p.every(p=>Math.abs(p[2]-holeDepth)<1e-8)));
 for(const f of m.faces.filter(f=>f.color==='#e1b383'))assert.ok(Math.min(...f.p.map(p=>p[2]))-stringBack>2,'strings also clear the headstock');
});

test('front and back oblique views consistently reveal the intended guitar layers',()=>{
 const m=model();for(const x of [-180,-80,0,80,180])for(const y of [100,150,190]){
  assert.equal(rayHit(m,[x,y,-360],[5,104,-6.3]),'#314954','sound hole stays visible on the front');
  assert.ok(bodyColor(rayHit(m,[x,y,360],[0,104,0])),'rear body hides the front hole and strings');
 }
 assert.equal(rayHit(m,[15,90,-400],[15,90,0]),'#e6a778');assert.equal(rayHit(m,[12,118,-400],[12,118,0]),'#df8986');
});

test('guitar silhouette, reserved plot and lightweight geometry budget remain intact',()=>{
 setTrack('coast-austin');try{const item=cityLandmarkPlacements().find(p=>p.kind==='music-guitar');assert.equal(item.radius,106);const m=model(),vertices=m.faces.flatMap(f=>f.p);assert.ok(vertices.every(p=>p.every(Number.isFinite)));assert.ok(Math.max(...vertices.map(p=>Math.hypot(p[0],p[2])))<item.radius);assert.equal(Math.min(...vertices.map(p=>p[1])),0);assert.equal(Math.max(...vertices.map(p=>p[1])),178.5);assert.ok(m.faces.length<=750);assert.ok(m.faces.length*132<100000);}finally{setTrack('coast');}
});
