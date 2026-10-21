/** Drive-through interpretation of the National Stadium. The racing surface is
 * supplied by the renderer; this module owns the open bowl, real stand masses,
 * steel lattice and solid infield rail. No slab ever covers the racing road.
 * Reference: https://english.beijing.gov.cn/specials/beijinglifeonthesubway/landmarksalongthesubwaylines/line8/202206/t20220624_2750396.html
 */
import { TRACK } from './engine.js';
import { frame, details, word } from './london-west-end.js';

const TAU=Math.PI*2,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const BEIJING_STADIUM_DEFAULTS=Object.freeze({radius:320,straightLength:800,halfStraight:400,seatOffset:150,seatDepth:78,shellOffset:245,railInset:95,height:238,maxRadius:980});
const C={seat:['#a34c40','#b65445','#984337','#c0614d'],riser:'#78392f',aisle:'#62655d',steel:'#77837f',steelDark:'#4e5b59',steelLight:'#a5aaa0',shell:'#3f4c4d',glass:'#40585b',roof:'#626e69',concrete:'#555c56',grass:'#50714b',paint:'#cac8af',rail:'#727d74'};

/** The footprint is a capsule, not the much larger enclosing landmark circle. */
export function beijingStadiumClearance(stadium,x,z,radius=0){
 const cfg={...BEIJING_STADIUM_DEFAULTS,...stadium},center=stadium?.center||{x:0,z:0},angle=stadium?.angle||0,c=Math.cos(angle),s=Math.sin(angle),dx=x-center.x,dz=z-center.z,localX=dx*c+dz*s,localZ=-dx*s+dz*c,half=stadium?.halfStraight??(stadium?.straightLength??BEIJING_STADIUM_DEFAULTS.straightLength)/2;
 return Math.hypot(localX-clamp(localX,-half,half),localZ)>=cfg.radius+cfg.shellOffset+6+radius;
}

function capsule(cfg,t,offset=0,y=0){
 const r=cfg.radius+offset,h=cfg.halfStraight,L=h*2,arc=Math.PI*cfg.radius,perimeter=L*2+arc*2;
 let s=((t%1)+1)%1*perimeter;
 if(s<L)return[-h+s,y,-r];
 s-=L;if(s<arc){const a=-Math.PI/2+s/cfg.radius;return[h+Math.cos(a)*r,y,Math.sin(a)*r];}
 s-=arc;if(s<L)return[h-s,y,r];
 s-=L;const a=Math.PI/2+s/cfg.radius;return[-h+Math.cos(a)*r,y,Math.sin(a)*r];
}
function normal(cfg,p){const x=p[0]-clamp(p[0],-cfg.halfStraight,cfg.halfStraight),z=p[2],n=Math.hypot(x,z)||1;return[x/n,0,z/n];}
function toLocal(cfg,x,z){const c=Math.cos(cfg.angle||0),s=Math.sin(cfg.angle||0),dx=x-(cfg.center?.x||0),dz=z-(cfg.center?.z||0);return[dx*c+dz*s,0,-dx*s+dz*c];}
function segmentPose(segment,t){
 if(segment.kind==='line')return{x:segment.x1+(segment.x2-segment.x1)*t,z:segment.y1+(segment.y2-segment.y1)*t,angle:segment.angle};
 const a=segment.startAngle+t*segment.sweep;
 return{x:segment.cx+Math.cos(a)*segment.radius,z:segment.cy+Math.sin(a)*segment.radius,angle:a+segment.direction*Math.PI/2};
}

export function beijingStadiumModelLayout(stadium={}){
 const cfg={...BEIJING_STADIUM_DEFAULTS,...stadium};
 cfg.halfStraight=stadium.halfStraight??(stadium.straightLength??BEIJING_STADIUM_DEFAULTS.straightLength)/2;cfg.straightLength=cfg.halfStraight*2;
 cfg.portals=stadium.portals?.length?stadium.portals:[{x:cfg.halfStraight*.625,z:cfg.radius,angle:Math.PI/2,width:220,side:1},{x:-cfg.halfStraight*.625,z:cfg.radius,angle:Math.PI/2,width:220,side:1}];
 cfg.cuts=[];
 // Sample both real access roads and the furthest outside chase-camera poses.
 // Using the source stadium transform keeps model-at-origin fingerprints valid.
 for(const segment of stadium.accessSegments||[]){
  const steps=Math.max(1,Math.ceil(segment.length/14));
  for(let i=0;i<=steps;i++){
   const p=segmentPose(segment,i/steps),local=toLocal(cfg,p.x,p.z);cfg.cuts.push({p:local,r:112});
   for(const lane of[-48,48]){const x=p.x-Math.sin(p.angle)*lane-Math.cos(p.angle)*187-Math.sin(p.angle)*13,z=p.z+Math.cos(p.angle)*lane-Math.sin(p.angle)*187+Math.cos(p.angle)*13;cfg.cuts.push({p:toLocal(cfg,x,z),r:44});}
  }
 }
 if(!cfg.cuts.length)for(const portal of cfg.portals){
  for(let along=-700;along<=700;along+=18){const x=portal.x+Math.cos(portal.angle)*along,z=portal.z+Math.sin(portal.angle)*along;if(z>cfg.radius-45)cfg.cuts.push({p:[x,0,z],r:(portal.width||260)/2});}
 }
 cfg.maxRadius=cfg.halfStraight+cfg.radius+cfg.shellOffset+15;cfg.height=238;
 cfg.openSectors=Array.from({length:96},(_,i)=>sectorOpen(cfg,i/96,(i+1)/96));
 return cfg;
}

function pointSegmentDistance(p,a,b){const dx=b[0]-a[0],dz=b[2]-a[2],u=clamp(((p[0]-a[0])*dx+(p[2]-a[2])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(p[0]-a[0]-u*dx,p[2]-a[2]-u*dz);}
function inPolygon(p,poly){let positive=false,negative=false;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],cross=(b[0]-a[0])*(p[2]-a[2])-(b[2]-a[2])*(p[0]-a[0]);positive ||=cross>1e-7;negative ||=cross< -1e-7;}return!(positive&&negative);}
function intersectsCut(cfg,poly,extra=0){
 const xs=poly.map(p=>p[0]),zs=poly.map(p=>p[2]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
 return cfg.cuts.some(({p,r})=>{r+=extra;if(p[0]<minX-r||p[0]>maxX+r||p[2]<minZ-r||p[2]>maxZ+r)return false;return(poly.length>2&&inPolygon(p,poly))||poly.some((a,i)=>pointSegmentDistance(p,a,poly[(i+1)%poly.length])<r);});
}
function sectorOpen(cfg,a,b,inner=cfg.seatOffset,outer=cfg.shellOffset+6){return !intersectsCut(cfg,[capsule(cfg,a,inner),capsule(cfg,b,inner),capsule(cfg,b,outer),capsule(cfg,a,outer)]);}
function ribbon(mesh,f,a,b,width,color){
 const aa=f.p(...a),bb=f.p(...b),axis=bb.map((n,i)=>n-aa[i]),length=Math.hypot(...axis);if(length<.01)return;for(let i=0;i<3;i++)axis[i]/=length;
 const cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],raw=cross(axis,Math.abs(axis[1])>.95?[1,0,0]:[0,1,0]),n=Math.hypot(...raw),u=raw.map(v=>v/n),v=cross(axis,u);
 for(const d of[u,v]){const p=(q,k)=>q.map((x,i)=>x+d[i]*width*.5*k);mesh.quad(p(aa,-1),p(aa,1),p(bb,1),p(bb,-1),color);}
}
function chordBox(mesh,f,item,a,b,width,bottom,top,color,visible=true){
 const center=f.p((a[0]+b[0])/2,(bottom+top)/2,(a[2]+b[2])/2),angle=(item.angle||0)+Math.atan2(b[2]-a[2],b[0]-a[0]),length=Math.hypot(b[0]-a[0],b[2]-a[2]);
 if(visible)mesh.box(...center,length+.5,top-bottom,width,color,angle);
 else if(mesh.colliders)mesh.colliders.push({type:'box',x:center[0],y:center[2],halfWidth:Math.max(.1,length*.49),halfDepth:width/2,angle,minHeight:(item.elevation||0)+bottom,maxHeight:(item.elevation||0)+top});
}

export function addBeijingStadium(mesh,item){
 const cfg=beijingStadiumModelLayout(item.stadium||TRACK.stadium||{}),f=frame(mesh,item),n=96,rows=12,step=cfg.seatDepth/rows;
 const topAt=t=>{const p=capsule(cfg,t),v=normal(cfg,p);return 198+32*v[0]*v[0];};
 const open=cfg.openSectors;
 // Stair bodies have conservative height-bounded solids, wholly under the
 // visible steps. Outside walls are separate: the interior remains hollow.
 for(let i=0;i<48;i++){
  const a=i/48,b=(i+1)/48;if(!sectorOpen(cfg,a,b))continue;
  for(let band=0;band<2;band++){const offset=cfg.seatOffset+cfg.seatDepth*(band+.5)/2;chordBox(mesh,f,item,capsule(cfg,a,offset),capsule(cfg,b,offset),cfg.seatDepth/2-5,0,22+band*36,C.concrete,false);}
  chordBox(mesh,f,item,capsule(cfg,a,cfg.shellOffset-4),capsule(cfg,b,cfg.shellOffset-4),7,0,145,C.shell,false);
 }
 // The low inner rail is deliberately continuous, including below the two
 // access roads. It prevents a grass shortcut without blocking their pavement.
 for(let i=0;i<n;i++){
  const a=capsule(cfg,i/n,-cfg.railInset),b=capsule(cfg,(i+1)/n,-cfg.railInset);
  chordBox(mesh,f,item,a,b,8,0,18,C.rail);
 }
 details(mesh,()=>{
  // Grass and pitch markings are flat surfaces, never hidden solid slabs.
  const field=cfg.radius-cfg.railInset-7,h=cfg.halfStraight;
  f.quad([-h,.08,-field],[-h,.08,field],[h,.08,field],[h,.08,-field],C.grass);
  for(const side of[-1,1])for(let i=0;i<32;i++){const a=-Math.PI/2+i/32*Math.PI,b=-Math.PI/2+(i+1)/32*Math.PI,p=t=>[side*(h+Math.cos(t)*field),.08,Math.sin(t)*field];f.tri([side*h,.08,0],p(side>0?b:a),p(side>0?a:b),C.grass);}
  for(const z of[-145,145])f.quad([-285,.16,z-1],[-285,.16,z+1],[285,.16,z+1],[285,.16,z-1],C.paint);
  for(const x of[-285,0,285])f.quad([x-1,.16,-145],[x-1,.16,145],[x+1,.16,145],[x+1,.16,-145],C.paint);
  for(let i=0;i<40;i++){const a=i/40*TAU,b=(i+1)/40*TAU,p=(t,r)=>[Math.cos(t)*r,.16,Math.sin(t)*r];f.quad(p(a,54),p(b,54),p(b,56),p(a,56),C.paint);}
  for(let i=0;i<n;i++){
   const a=i/n,b=(i+1)/n;
   const railA=capsule(cfg,a,-cfg.railInset,18.1),railB=capsule(cfg,b,-cfg.railInset,18.1),na=normal(cfg,railA),nb=normal(cfg,railB);
   f.quad(railA.map((v,k)=>v-na[k]*2),railA.map((v,k)=>v+na[k]*2),railB.map((v,k)=>v+nb[k]*2),railB.map((v,k)=>v-nb[k]*2),i%3===0?'#a64b3e':C.paint);
   if(!open[i])continue;
   const aisle=i%12===0;
   f.quad(capsule(cfg,a,cfg.seatOffset,0),capsule(cfg,b,cfg.seatOffset,0),capsule(cfg,b,cfg.seatOffset,22),capsule(cfg,a,cfg.seatOffset,22),C.concrete);
   for(let row=0;row<rows;row++){
    const inner=cfg.seatOffset+row*step,outer=inner+step,y=22+row*6;
    f.quad(capsule(cfg,a,inner,y),capsule(cfg,b,inner,y),capsule(cfg,b,outer,y),capsule(cfg,a,outer,y),aisle?C.aisle:C.seat[(row+Math.floor(i/6))%C.seat.length]);
    f.quad(capsule(cfg,a,outer,y),capsule(cfg,b,outer,y),capsule(cfg,b,outer,y+6),capsule(cfg,a,outer,y+6),aisle?C.aisle:C.riser);
    for(const [t,edge]of[[a,!open[(i+n-1)%n]],[b,!open[(i+1)%n]]])if(edge)f.quad(capsule(cfg,t,inner,0),capsule(cfg,t,outer,0),capsule(cfg,t,outer,y+6),capsule(cfg,t,inner,y),C.concrete);
   }
   f.quad(capsule(cfg,a,cfg.seatOffset+cfg.seatDepth,0),capsule(cfg,b,cfg.seatOffset+cfg.seatDepth,0),capsule(cfg,b,cfg.seatOffset+cfg.seatDepth,94),capsule(cfg,a,cfg.seatOffset+cfg.seatDepth,94),C.concrete);
   f.quad(capsule(cfg,a,cfg.shellOffset,0),capsule(cfg,b,cfg.shellOffset,0),capsule(cfg,b,cfg.shellOffset,145),capsule(cfg,a,cfg.shellOffset,145),i%5===0?C.glass:C.shell);
   f.quad(capsule(cfg,a,cfg.shellOffset,topAt(a)),capsule(cfg,b,cfg.shellOffset,topAt(b)),capsule(cfg,b,cfg.seatOffset,topAt(b)-28),capsule(cfg,a,cfg.seatOffset,topAt(a)-28),C.roof);
   f.quad(capsule(cfg,a,cfg.seatOffset,topAt(a)-28),capsule(cfg,b,cfg.seatOffset,topAt(b)-28),capsule(cfg,b,cfg.seatOffset,topAt(b)-34),capsule(cfg,a,cfg.seatOffset,topAt(a)-34),C.steelDark);
   if(i%3===0)ribbon(mesh,f,capsule(cfg,a,cfg.seatOffset,topAt(a)-30),capsule(cfg,b,cfg.shellOffset,topAt(b)+2),5,C.steelLight);
  }
  // Woven ribbons follow the curved shell in three short spans, so the steel
  // wraps around the bowl instead of cutting chords through its open interior.
  for(let i=0;i<72;i++)for(const direction of[-1,1])for(let j=0;j<3;j++){
   const t=(i+direction*j*.9)/72,u=(i+direction*(j+1)*.9)/72,a=capsule(cfg,t,cfg.shellOffset+3,12+(topAt(t)-10)*j/3),b=capsule(cfg,u,cfg.shellOffset+3,12+(topAt(u)-10)*(j+1)/3);
   if(!intersectsCut(cfg,[a,b],6))ribbon(mesh,f,a,b,5.2,direction<0?C.steel:C.steelLight);
  }
  for(const y of[36,86,143])for(let i=0;i<72;i++){
   const a=capsule(cfg,i/72,cfg.shellOffset+3,y+8*Math.sin(i*.51)),b=capsule(cfg,(i+1)/72,cfg.shellOffset+3,y+8*Math.sin((i+1)*.51));
   if(!intersectsCut(cfg,[a,b],5))ribbon(mesh,f,a,b,4.5,C.steel);
  }
  // A single inward-facing stadium board anchors the otherwise repeated bowl.
  const board=f.p(0,0,-cfg.radius-cfg.seatOffset-cfg.seatDepth*.65),boardFrame=frame(mesh,{x:board[0],z:board[2],angle:(item.angle||0)+Math.PI,elevation:item.elevation||0});
  boardFrame.box(0,119,0,198,44,6,'#354b4b');boardFrame.box(0,119,-3.2,187,34,.4,'#172c31');
  word(boardFrame,'NATIONAL STADIUM',0,113,-3.6,10.5,174,'#bfbda4',.1);
 });
}
