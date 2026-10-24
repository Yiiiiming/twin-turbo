/** Huangpu reach beside the compact Bund driving avenue. The Puxi bank and
 * Pudong bank are both modelled; this is a racing interpretation, not survey data. */
import { TRACK, projectTrack } from './engine.js';
import { frame, word, details } from './london-west-end.js';
const ANGLE=Math.PI*4/3,CS=Math.cos(ANGLE),SN=Math.sin(ANGLE);
// The racing avenue has the same heading, at lateral=0. Its river-facing side
// is +lateral. At the start the incoming boulevard crosses the river once.
export const SHANGHAI_RIVER=Object.freeze({x:4925-350*Math.sin(Math.PI/3),z:3650+1850*Math.sin(Math.PI/3)+350*Math.cos(Math.PI/3),angle:ANGLE,start:-600,end:3650,near:150,far:440});
const point=(along,lateral,y=0)=>[SHANGHAI_RIVER.x+CS*along-SN*lateral,y,SHANGHAI_RIVER.z+SN*along+CS*lateral];
export function shanghaiRiverCoordinates(x,z){const dx=x-SHANGHAI_RIVER.x,dz=z-SHANGHAI_RIVER.z;return{along:dx*CS+dz*SN,lateral:-dx*SN+dz*CS};}
export function shanghaiRiverContains(x,z,padding=0){const p=shanghaiRiverCoordinates(x,z),r=SHANGHAI_RIVER;return p.along>=r.start-padding&&p.along<=r.end+padding&&p.lateral>=r.near-padding&&p.lateral<=r.far+padding;}
export const shanghaiRiverClearance=(x,z,radius=0)=>!shanghaiRiverContains(x,z,radius+35);
export const PUDONG_SKYLINE=Object.freeze([
 {t:520,n:750,h:248,w:120,d:112,style:0},{t:1020,n:1060,h:350,w:114,d:105,style:1},
 {t:1720,n:1130,h:290,w:144,d:112,style:2},{t:2390,n:1120,h:390,w:122,d:110,style:0},
 {t:3250,n:1090,h:330,w:124,d:105,style:1},{t:3550,n:680,h:242,w:118,d:108,style:2},
].map(Object.freeze));
export function pudongSkylinePlacements(){return TRACK.theme==='shanghai'?PUDONG_SKYLINE.map(item=>{const p=point(item.t,item.n);return {...item,x:p[0],z:p[2],radius:Math.hypot(item.w,item.d)/2+10};}):[];}
function addPudongSkyline(mesh){
 for(const item of pudongSkylinePlacements()){
  const f=frame(mesh,{...item,angle:ANGLE}),{h,w,d,style}=item,glass=['#5b8fa3','#648f8e','#6e879f'][style],trim=['#c1d8d5','#d2d7ba','#a7c9d7'][style];
  f.box(0,7,0,w+12,14,d+12,'#9cacaa');
  if(style===0){
   for(let tier=0;tier<4;tier++){const bottom=14+tier*h*.22,sw=w*(1-tier*.13),sd=d*(1-tier*.13);f.box(0,bottom+h*.115,0,sw,h*.23,sd,glass);f.box(0,bottom+h*.23,0,sw+3,3,sd+3,trim);}
   f.cone(0,h*.93,0,w*.23,h*.12,'#719394',4,0,Math.PI/4);
  }else if(style===1){
   f.cone(0,14,0,w*.46,h*.87,glass,32,w*.34);f.cone(0,14+h*.87,0,w*.34,h*.12,trim,32,w*.1);
  }else{
   f.box(-w*.22,h*.43,0,w*.43,h*.86,d,glass);f.box(w*.23,h*.5,0,w*.43,h,d*.9,glass);f.box(0,h*.69,0,w,8,d*.72,trim);
   f.box(w*.23,h+4,0,w*.48,8,d*.96,trim);
  }
  details(mesh,()=>{
   for(let y=28;y<h*.87;y+=16){
    if(style===1)f.cone(0,y,0,w*.46-(y-14)/(h*.87)*w*.12+.4,1.2,trim,32,w*.46-(y-14)/(h*.87)*w*.12+.4);
    else{const tier=style===0?Math.min(3,Math.floor((y-14)/(h*.22))):0,sw=w*(1-tier*.13),sd=d*(1-tier*.13);f.box(0,y,-sd/2-.4,sw,1.1,1,trim);f.box(0,y,sd/2+.4,sw,1.1,1,trim);}
   }
   if(style!==1)for(const x of[-.33,-.12,.12,.33])f.box(x*w,h*.37,-d/2-.8,.8,h*.68,1,'#aacbd1');
   for(let x=-w*.36;x<=w*.36;x+=18)f.box(x,18,-d/2-2,11,19,1,'#345d6a');
  });
 }
}
export function addShanghaiRiverfront(terrain,water,props){
 if(TRACK.theme!=='shanghai')return;
 const r=SHANGHAI_RIVER;
 addPudongSkyline(props);
 water.quad(point(r.start,r.near,.13),point(r.end,r.near,.13),point(r.end,r.far,.13),point(r.start,r.far,.13),'#527d85',.13,[0,1,0]);
 for(let i=0;i<145;i++){
  const t=r.start+20+(i*419)%(r.end-r.start-80),n=r.near+12+(i*71)%260,len=35+(i*23)%90;
  water.quad(point(t,n,.17),point(Math.min(t+len,r.end-8),n,.17),point(Math.min(t+len,r.end-8),n+1,.17),point(t,n+1,.17),'#95b7b5',.12,[0,1,0]);
 }
 for(const [bank,outward]of[[r.near,-1],[r.far,1]]){
  const midpoint=point((r.start+r.end)/2,bank+outward*31,2);
  terrain.box(...midpoint,r.end-r.start,4,62,'#c5c5b5',ANGLE);
  const quay=point((r.start+r.end)/2,bank,4);props.box(...quay,r.end-r.start,8,5,'#a7ada2',ANGLE);
  for(let t=r.start+15;t<r.end;t+=85){
   terrain.box(...point(t,bank+outward*31,4.06),1,.12,58,'#a9ae9f',ANGLE);
   props.box(...point(t,bank+outward*5,10),5,16,5,'#c7cbbb',ANGLE);
   props.box(...point(t+39,bank+outward*5,16),79,3,3,'#cdd1c3',ANGLE);
  }
  for(let t=r.start+100;t<r.end-90;t+=190){
   const p=point(t,bank+outward*37),x=p[0],z=p[2];if(projectTrack(x,z).distance<112)continue;
   const f=frame(props,{x,z,angle:ANGLE+(outward>0?Math.PI:0)});
   for(const side of[-1,1]){f.box(side*13,5,0,3,10,11,'#445b58');f.box(side*13,11,4,3,16,2,'#445b58');}
   for(const dz of[-4,0,4])f.box(0,10,dz,34,1.6,2.5,'#9b7857');for(const y of[13,17])f.box(0,y,5,34,2.4,1.7,'#a98662');
   f.box(54,4,0,24,8,17,'#b2b5a4');f.box(54,10,0,21,7,14,'#587766');
   f.box(-54,26,0,2,52,2,'#3e5857');f.box(-54,2,0,7,4,7,'#8f9c90');f.box(-54,49,0,8,11,8,'#c7c6a6',.2);f.cone(-54,54.5,0,6.5,5,'#3e5857',4,0,Math.PI/4);
  }
 }
 // Finite masonry end-quays close the visible reach behind surrounding blocks.
 for(const t of[r.start,r.end])terrain.box(...point(t,(r.near+r.far)/2,1),10,2,r.far-r.near+125,'#b2b6a9',ANGLE);
 details(props,()=>{
  for(const[t,n,angle,label]of[[820,95,ANGLE+Math.PI,'THE BUND'],[1150,495,ANGLE,'PUDONG']]){
   const p=point(t,n),f=frame(props,{x:p[0],z:p[2],angle});f.box(0,19,0,130,24,5,'#314950');word(f,label,0,15,-3,7,116,'#e0dbc3');f.box(-54,9,0,3,18,3,'#61797b');f.box(54,9,0,3,18,3,'#61797b');
  }
  const p=point(850,310),boat=frame(props,{x:p[0],z:p[2],angle:ANGLE+.1});
  boat.box(0,4,0,120,7,27,'#31576a');boat.box(0,11,0,92,10,24,'#e0d8c1');boat.box(0,17,0,98,3,29,'#a45445');
  for(let x=-36;x<=36;x+=12)for(const z of[-12.4,12.4])boat.box(x,11,z,8,5,.7,'#567f8b');
 });
}
