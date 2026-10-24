import { frame } from './london-west-end.js';

// Original, lightweight interpretations: no imported film artwork or textures.
export const HOUSE_BANNERS=Object.freeze([
 Object.freeze({id:'gryffindor',name:'Gryffindor',cloth:'#952d39',trim:'#e6bb55',ink:'#ffdb81',field:'#692331'}),
 Object.freeze({id:'slytherin',name:'Slytherin',cloth:'#24584c',trim:'#c8d4cc',ink:'#e4eee5',field:'#193e36'}),
 Object.freeze({id:'ravenclaw',name:'Ravenclaw',cloth:'#244d82',trim:'#c99c6b',ink:'#e0b787',field:'#193250'}),
 Object.freeze({id:'hufflepuff',name:'Hufflepuff',cloth:'#d6ac43',trim:'#302b29',ink:'#292b2b',field:'#ebc669'}),
]);

const TAU=Math.PI*2;
function face(f,x,y,z,w,h,color,glow=0){
 f.quad([x-w/2,y-h/2,z],[x-w/2,y+h/2,z],[x+w/2,y+h/2,z],[x+w/2,y-h/2,z],color,glow);
}
function ellipsoid(f,x,y,z,rx,ry,rz,color,rows=2,sides=6){
 for(let row=0;row<rows;row++)for(let side=0;side<sides;side++){
  const a=row/rows*Math.PI,b=(row+1)/rows*Math.PI,u=side/sides*TAU,v=(side+1)/sides*TAU;
  const p=(t,q)=>[x+Math.sin(t)*Math.cos(q)*rx,y+Math.cos(t)*ry,z+Math.sin(t)*Math.sin(q)*rz];
  f.quad(p(a,u),p(a,v),p(b,v),p(b,u),color);
 }
}

/** Same axes and shoulder pivot as the existing magic characters. The arm uses
 * magicArmMatrix, placing its wand tip at local [0,-1,-24]. */
export function addDumbledore(mesh,part='body'){
 const f=frame(mesh,{x:0,z:0}),robe='#635377',fold='#42445f',silver='#d2d8d9',hair='#e3e3da',skin='#d5b7a0';
 if(part==='arm'){
  f.box(0,-1,-5,7,8,12,robe);face(f,0,-1,-11.2,7.6,8.6,silver);
  f.box(0,-1,-14,3.6,3.6,5,skin);
  f.quad([-.43,-1,-16.8],[.43,-1,-16.8],[.43,-1,-24],[-.43,-1,-24],'#ab9064');
  f.quad([0,-1.43,-16.8],[0,-.57,-16.8],[0,-.57,-24],[0,-1.43,-24],'#ab9064');
  return;
 }
 f.box(0,2.6,-1,15,5.2,10,'#262735');
 for(const x of [-4.5,4.5])face(f,x,2.3,-6.2,5.5,2.4,'#38384b');
 f.cone(0,5,1,12.5,26,robe,6,7.5);f.cone(0,31,1,7.5,10,robe,6,9.4);
 f.box(-9,28,0,6,21,7,fold);f.box(-9,16,-.7,3.7,4.4,4.2,skin);
 // Long embroidered front panels follow the robe without a coplanar overlay.
 for(const side of [-1,1]){
  f.quad([side*1.2,7,-10.7],[side*3.4,7,-10.7],[side*2.1,38,-8.4],[side*.5,38,-8.4],silver,.22);
 }
 ellipsoid(f,0,49,0,7.4,9.4,6.8,skin);
 ellipsoid(f,0,53,2.1,7.9,6.9,6.8,hair,2);
 // A soft tasseled cap, not the pointed witch silhouette.
 f.cone(0,58,1,8.6,2.5,fold,6,8.6);f.cone(0,60.5,1,7.8,6,robe,6,4.4);
 f.cone(0,66.5,1,4.4,2,silver,6,0);
 for(const x of [-3,3])face(f,x,50.2,-6.2,1.3,1.2,'#2a333c');
 f.tri([-.8,48.3,-6.1],[0,46.4,-7.4],[.8,48.3,-6.1],skin);
 f.tri([-.8,48.3,-6.1],[-.7,46.5,-6.1],[0,46.4,-7.4],skin);
 f.tri([.8,48.3,-6.1],[0,46.4,-7.4],[.7,46.5,-6.1],skin);
 // Half-moon spectacles sit in front of the face; a narrow silver bridge joins them.
 for(const x of [-3.3,3.3]){
  for(let i=0;i<3;i++){
   const a=Math.PI+i/3*Math.PI,b=Math.PI+(i+1)/3*Math.PI;
   const p=(q,r)=>[x+Math.cos(q)*r,50.3+Math.sin(q)*r,-7.1];
   f.quad(p(a,2.7),p(b,2.7),p(b,2.2),p(a,2.2),silver,.18);
  }
  face(f,x,50.3,-7.15,5.4,.45,silver,.18);
 }
 face(f,0,50.1,-7.2,1.4,.5,silver,.18);
 // Three long faceted locks give the beard volume down to the waist.
 f.tri([-5.8,45,-5.8],[0,24,-10.6],[0,45.4,-10.1],'#c6cece');
 f.tri([0,45.4,-10.1],[0,24,-10.6],[5.8,45,-5.8],hair);
 f.tri([-3.5,45.4,-8.5],[-1,29,-12.1],[3.3,45.4,-8.5],'#f2eee0');
 face(f,0,44.6,-8.7,5.3,1.1,hair);
}

// Triangulate simple heraldic silhouettes once; the renderer deforms these UV
// triangles with their fabric and offsets each layer along the cloth normal.
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function triangles(points){
 const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
 const order=points.map((_,i)=>i);if(area<0)order.reverse();
 const result=[],inside=(p,a,b,c)=>cross(a,b,p)>=-1e-10&&cross(b,c,p)>=-1e-10&&cross(c,a,p)>=-1e-10;
 while(order.length>3){
  let found=false;
  for(let i=0;i<order.length;i++){
   const ai=order[(i+order.length-1)%order.length],bi=order[i],ci=order[(i+1)%order.length];
   if(cross(points[ai],points[bi],points[ci])<=1e-10)continue;
   if(order.some(index=>index!==ai&&index!==bi&&index!==ci&&inside(points[index],points[ai],points[bi],points[ci])))continue;
   result.push([points[ai],points[bi],points[ci]]);order.splice(i,1);found=true;break;
  }
  if(!found)throw new Error('Invalid house crest silhouette');
 }
 result.push(order.map(index=>points[index]));return result;
}
function crest(house){
 const result=[],polygon=(points,color,layer)=>{
  for(const tri of triangles(points))result.push(Object.freeze({points:Object.freeze(tri.map(([x,y])=>Object.freeze([.5+x*.58,.47+y*.52]))),color,layer}));
 };
 const shield=[[-.46,-.47],[.46,-.47],[.40,.19],[0,.49],[-.40,.19]];
 polygon(shield,house.trim,0);polygon(shield.map(([x,y])=>[x*.87,y*.87]),house.field,.8);
 const ink=house.ink,dark=house.field;
 if(house.id==='gryffindor'){
  // Upright lion: mane, raised forepaw, bent hind legs and a curled tail.
  polygon([[-.18,.03],[-.04,-.14],[.10,-.17],[.17,-.07],[.31,-.20],[.35,-.10],[.21,.06],[.11,.13],[.15,.31],[.01,.31],[-.04,.17],[-.15,.30],[-.29,.28],[-.14,.12]],ink,1.2);
  polygon([[-.19,-.26],[-.10,-.38],[.06,-.37],[.16,-.25],[.10,-.11],[-.04,-.06],[-.18,-.15]],house.trim,1.2);
  polygon([[-.08,-.28],[.06,-.28],[.13,-.21],[.06,-.15],[-.06,-.17]],'#f5df9d',1.8);
  polygon([[-.17,.10],[-.32,.08],[-.37,-.06],[-.29,-.18],[-.22,-.13],[-.30,-.05],[-.26,.01]],ink,1.2);
  polygon([[.03,-.26],[.075,-.25],[.055,-.215]],dark,2.4);
 }else if(house.id==='slytherin'){
  // A single S-shaped serpent with a lifted head and tapered lower curl.
  polygon([[.28,-.34],[.09,-.39],[-.11,-.34],[-.28,-.23],[-.28,-.10],[-.16,.02],[.10,.09],[.21,.18],[.12,.29],[-.06,.28],[-.18,.18],[-.22,.29],[-.07,.38],[.14,.38],[.32,.25],[.32,.09],[.19,-.04],[-.07,-.11],[-.15,-.18],[-.07,-.24],[.12,-.25],[.26,-.22]],ink,1.2);
  polygon([[.18,-.32],[.235,-.32],[.225,-.28]],dark,1.8);
  polygon([[.27,-.26],[.37,-.25],[.34,-.21]],'#c16c6e',1.8);
 }else if(house.id==='ravenclaw'){
  // Spread eagle wings with separate feather tips, hooked beak and a long tail.
  polygon([[-.07,-.14],[-.39,-.36],[-.34,-.12],[-.29,-.18],[-.25,.02],[-.20,-.04],[-.15,.13],[-.09,.08],[-.07,.24],[-.15,.35],[0,.31],[.14,.36],[.07,.23],[.09,.08],[.15,.13],[.20,-.04],[.25,.02],[.29,-.18],[.34,-.12],[.39,-.36],[.06,-.15],[.05,-.28],[-.07,-.28]],ink,1.2);
  polygon([[.04,-.28],[.18,-.24],[.08,-.19]],house.trim,1.8);
  polygon([[-.05,-.10],[.04,-.10],[.03,.18],[-.03,.19]],house.trim,1.8);
  polygon([[.005,-.26],[.045,-.245],[.01,-.22]],dark,2.4);
 }else{
  // Low badger body, stout legs, pale facial stripe and pointed black muzzle.
  polygon([[-.32,-.13],[-.18,-.26],[.07,-.23],[.21,-.11],[.23,.11],[.15,.19],[.14,.30],[.03,.30],[.01,.19],[-.16,.18],[-.18,.30],[-.29,.29],[-.28,.13],[-.36,.05]],ink,1.2);
  polygon([[.12,-.20],[.26,-.23],[.36,-.12],[.38,.02],[.24,.09],[.12,.02],[.07,-.10]],ink,1.8);
  polygon([[.19,-.21],[.25,-.20],[.32,-.02],[.25,.05],[.20,-.05]],'#f0e4be',2.4);
  polygon([[.29,-.13],[.34,-.11],[.31,-.08]],'#f2e5bf',2.4);
 }
 return Object.freeze(result);
}
const CRESTS=new Map(HOUSE_BANNERS.map(house=>[house.id,crest(house)]));
export function houseCrestTriangles(id){return CRESTS.get(id)||Object.freeze([]);}
