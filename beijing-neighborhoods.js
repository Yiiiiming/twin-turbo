/** Beijing's ordinary streets connect the landmark stops into a continuous city.
 * Scenery remains at ground level beside the unchanged elevated road section.
 * Local -Z is the frontage, so opposite sides face back toward the racecourse.
 */
import { TRACK, trackPoint, projectTrack } from './engine.js';
import { beijingWallClearance } from './beijing-great-wall.js';

const EMPTY=Object.freeze([]);
const wrap=s=>((s%TRACK.length)+TRACK.length)%TRACK.length;

// Keep a clear fan between the road and each landmark, even when its setback
// leaves enough geometric space for a house directly in front of the facade.
function blocksLandmarkView(x,z,radius,landmarks){
 for(const landmark of landmarks){
  const road=trackPoint(projectTrack(landmark.x,landmark.z).s);
  const dx=landmark.x-road.x,dz=landmark.z-road.y,length=Math.hypot(dx,dz);
  if(length<1)continue;
  const along=((x-road.x)*dx+(z-road.y)*dz)/length;
  const across=Math.abs((x-road.x)*dz-(z-road.y)*dx)/length;
  if(along>0&&along<length&&across<radius+landmark.radius*.55)return true;
 }
 return false;
}

export function beijingNeighborhoodPlacements(landmarks=[]){
 if(TRACK.theme!=='beijing')return EMPTY;
 const result=[],count=Math.ceil(TRACK.length/116),step=TRACK.length/count;
 const accepts=(p,radius)=>projectTrack(p.x,p.y).distance>=TRACK.roadWidth/2+radius+18
  &&beijingWallClearance(p.x,p.y,radius)
  // Leave a small forecourt at China Zun: a house immediately before the tower
  // hid its flared base along the opening-straight approach.
  &&landmarks.every(other=>Math.hypot(other.x-p.x,other.z-p.y)>=other.radius+radius+(other.kind==='beijing-china-zun'?95:25))
  &&result.every(other=>Math.hypot(other.x-p.x,other.z-p.y)>=other.radius+radius+7)
  &&!blocksLandmarkView(p.x,p.y,radius,landmarks);
 for(let index=0;index<count;index++)for(const side of [-1,1]){
  const s=wrap(36+index*step+(side>0?step*.5:0)),road=trackPoint(s);
  const variant=(index+(side>0?3:0))%9;
  const garden=road.elevation>8;
  const tree=garden?variant%2===0:variant===0;
  const block=garden?variant===3||variant===7:variant%3===2;
  const kind=tree?'beijing-garden-tree':block?'beijing-street-block':'beijing-courtyard';
  const width=tree?36:kind==='beijing-street-block'?62+(variant%2)*8:70+(variant%2)*6;
  const depth=tree?36:kind==='beijing-street-block'?42:52;
  const radius=tree?19:Math.hypot(width+8,depth+8)/2;
  const height=tree?(garden?84:48):kind==='beijing-street-block'?(garden?68:48+(variant%2)*12):37;
  let chosen;
  // Small shifts fix corner crowding without producing large empty districts.
  for(const shift of [0,18,-18]){
   const at=wrap(s+shift),p=trackPoint(at,side*(TRACK.roadWidth/2+radius+32+(variant%3)*8));
   if(!accepts(p,radius))continue;
   chosen={kind,x:p.x,z:p.y,s:at,angle:p.angle+(side<0?Math.PI:0),side,radius,width,depth,height,variant,elevation:0,garden};
   break;
  }
  // A slim tree can occupy small leftover plots near squares without covering
  // the landmark. It is still subject to the same facade-view exclusion.
  if(!chosen&&!tree&&index%2===0){
   const smallRadius=19,p=trackPoint(s,side*(TRACK.roadWidth/2+smallRadius+34));
   if(accepts(p,smallRadius))chosen={kind:'beijing-garden-tree',x:p.x,z:p.y,s,angle:p.angle,side,radius:smallRadius,width:36,depth:36,height:garden?84:48,variant,elevation:0,garden};
  }
  if(chosen)result.push(Object.freeze(chosen));
 }
 return Object.freeze(result);
}

function frame(mesh,item){
 const co=Math.cos(item.angle),si=Math.sin(item.angle);
 const p=(x,y,z)=>[item.x+co*x-si*z,y,item.z+si*x+co*z];
 return {p,box:(x,y,z,w,h,d,color)=>mesh.box(...p(x,y,z),w,h,d,color,item.angle),
  quad:(a,b,c,d,color)=>mesh.quad(p(...a),p(...b),p(...c),p(...d),color),
  tri:(a,b,c,color)=>mesh.triangle(p(...a),p(...b),p(...c),color)};
}
function details(mesh,draw){const colliders=mesh.colliders;mesh.colliders=null;try{draw();}finally{mesh.colliders=colliders;}}
const panel=(f,x,y,z,w,h,color)=>f.quad([x-w/2,y-h/2,z],[x+w/2,y-h/2,z],[x+w/2,y+h/2,z],[x-w/2,y+h/2,z],color);

// Two shallow roof slopes and hipped ends preserve the gray-tile silhouette
// with fourteen triangles, instead of hundreds of individual tile solids.
function roof(f,x,y,z,w,d,h,color='#596461'){
 for(const side of [-1,1]){
  const a=[x-w/2,y+2,z+side*d/2],b=[x+w/2,y+2,z+side*d/2];
  const c=[x+w*.43,y+h*.36,z+side*d*.29],e=[x-w*.43,y+h*.36,z+side*d*.29];
  const topA=[x-w*.37,y+h,z],topB=[x+w*.37,y+h,z];
  const quad=(a,b,c,d)=>side>0?f.quad(a,b,c,d,color):f.quad(d,c,b,a,color);
  quad(a,b,c,e);quad(e,c,topB,topA);
 }
 for(const side of [-1,1])f.tri([x+side*w/2,y+2,z-d/2],[x+side*w/2,y+2,z+d/2],[x+side*w*.37,y+h,z],color);
 f.quad([x-w*.38,y+h+.5,z-1.5],[x+w*.38,y+h+.5,z-1.5],[x+w*.38,y+h+.5,z+1.5],[x-w*.38,y+h+.5,z+1.5],'#92998d');
}

function courtyard(mesh,item){
 const f=frame(mesh,item),w=item.width,d=item.depth,brick=['#96988b','#888f84','#a6a594'][item.variant%3];
 const shop=item.variant%3===1;
 // A raised stone plinth and the occupied building volumes have real collision.
 f.box(0,1.4,0,w,2.8,d,'#b3b2a0');
 if(shop){
  f.box(0,13,2,w-6,23,d-10,brick);
  details(mesh,()=>{
   roof(f,0,24.5,2,w+6,d,10);
   panel(f,0,20,-d/2+6-.2,w-12,5,'#72483b');
   for(const x of [-w*.28,0,w*.28]){panel(f,x,11,-d/2+6-.3,w*.2,14,'#3b4d49');panel(f,x,12,-d/2+6-.5,1,14,'#c5ae83');}
   for(const x of [-w*.43,w*.43]){panel(f,x,17,-d/2+5.5,3,10,'#b45d44');panel(f,x,23,-d/2+5.5,5,2,'#d7b76c');}
   // Slate lintel and warm cloth awning identify a local shop without lettering.
   f.quad([-w*.44,18,-d/2+3],[w*.44,18,-d/2+3],[w*.44,20,-d/2+8],[-w*.44,20,-d/2+8],item.variant%2?'#678475':'#996857');
  });
  return;
 }
 const wing=w*.21,backZ=d*.30,front=-d/2+2;
 f.box(0,14,backZ,w-4,25,17,brick);
 for(const side of [-1,1]){
  f.box(side*(w-wing)/2,11.5,-4,wing,20,31,brick);
  f.box(side*(w/4+4),6.5,front,w/2-10,11,3,'#8d9589');
 }
 f.box(0,10.5,front,13,19,4,'#854738');
 details(mesh,()=>{
  roof(f,0,26.5,backZ,w+4,23,10);
  for(const side of [-1,1])roof(f,side*(w-wing)/2,21.5,-4,wing+6,35,7);
  roof(f,0,20,front,24,12,7,'#5b6560');
  for(const x of [-w*.29,0,w*.29])panel(f,x,14,backZ-8.7,11,14,'#505e55');
  panel(f,0,10,front-2.2,1.1,16,'#d1ad71');
  for(const x of [-4,4])panel(f,x,10,front-2.3,1.5,1.5,'#d1ad71');
  // Low coping remains visible while the open courtyard gives breathing room.
  for(const side of [-1,1])f.quad([side*8,12.2,front-2],[side*(w/2),12.2,front-2],[side*(w/2),12.2,front+2],[side*8,12.2,front+2],'#bac0ad');
 });
}

function streetBlock(mesh,item){
 const f=frame(mesh,item),w=item.width,d=item.depth,h=item.height;
 const brick=item.variant%2?'#b0a58f':'#a19e89';
 f.box(0,1.5,0,w+2,3,d+2,'#bcb9a3');
 f.box(0,h/2+3,0,w,h,d,brick);
 details(mesh,()=>{
  roof(f,0,h+3,0,w+6,d+6,8,'#606e65');
  for(const side of [-1,1]){
   for(let row=0;row<2+(h>50?1:0);row++)for(const col of [-2,-1,0,1,2]){
    panel(f,col*w*.17,13+row*17,side*(d/2+.2),6.5,10,'#48645f');
    panel(f,col*w*.17,13+row*17,side*(d/2+.3),.7,10,'#c4c3a9');
   }
   panel(f,0,h+1,side*(d/2+.3),w+2,2.5,'#cfceb6');
   panel(f,0,5.5,side*(d/2+.3),w,4,'#868f7d');
  }
  panel(f,0,10,-d/2-.5,11,15,'#6e4c3b');
  f.quad([-8,18,-d/2-3],[8,18,-d/2-3],[8,18,-d/2+1],[-8,18,-d/2+1],'#7f8e7b');
 });
}

function gardenTree(mesh,item){
 const f=frame(mesh,item),height=item.height;
 f.box(0,1,0,20,2,20,'#9ba88a');
 mesh.cone(item.x,1,item.z,2.1,height*.7,'#857968',8,1.5,item.angle);
 // Taller garden canopies remain visible above the raised road while their
 // trunks stay on the ground. The crown uses actual stacked solid volumes.
 mesh.cone(item.x,height*.43,item.z,11,height*.23,'#6d8c65',8,18,item.angle);
 mesh.cone(item.x,height*.66,item.z,18,height*.24,'#809b6e',8,11,item.angle);
 mesh.cone(item.x,height*.90,item.z,11,height*.10,'#99ad7b',8,0,item.angle);
}

export function addBeijingNeighborhood(mesh,item){
 if(item.kind==='beijing-courtyard')courtyard(mesh,item);
 else if(item.kind==='beijing-street-block')streetBlock(mesh,item);
 else if(item.kind==='beijing-garden-tree')gardenTree(mesh,item);
}
