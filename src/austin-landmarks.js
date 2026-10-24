/** Austin architecture, compact game interpretations (not geographical survey).
 * Sources: austintheatre.org/about/history/ (Paramount blade sign);
 * frosttoweraustin.com (Frost Bank Tower); lakeflato.com/project/austin-central-library/;
 * gensler.com/projects/university-of-texas-moody-center; acllive.com/about.
 */
import { TRACK, trackPoint, projectTrack } from './engine.js';
import { frame, details, beam, word, arch, cornice, frontDisk } from './london-west-end.js';
export const AUSTIN_LANDMARKS=Object.freeze([
 {kind:'austin-paramount',label:'Paramount Theatre',radius:116,width:182,depth:116,height:178,s:4830,side:1},
 {kind:'austin-frost-tower',label:'Frost Bank Tower',radius:132,width:212,depth:148,height:408,s:7300,side:-1},
 {kind:'austin-moody-center',label:'Moody Center',radius:173,width:316,depth:232,height:109,s:10800,side:1},
 {kind:'austin-central-library',label:'Austin Central Library',radius:162,width:266,depth:150,height:163,s:13700,side:-1},
 {kind:'austin-acl-live',label:'ACL Live at The Moody Theater',radius:145,width:238,depth:138,height:175,s:15300,side:1},
].map(Object.freeze));
/** The base landmarks are passed in by city-scenery, avoiding a circular import.
 * Plots must clear every road branch and riverbank, not just their own station. */
export function austinLandmarkPlacements(existing=[]){
 if(TRACK.theme!=='austin')return [];
 const result=[];
 for(const meta of AUSTIN_LANDMARKS){let item;
  for(const shift of [0,100,-100,200,-200,350,-350]){for(const side of [meta.side,-meta.side]){
   const s=meta.s+shift,p=trackPoint(s,side*(TRACK.roadWidth/2+meta.radius+32));
   if(p.elevation>1||projectTrack(p.x,p.y).distance<TRACK.roadWidth/2+meta.radius+28)continue;
   if(TRACK.river&&Math.abs(p.y-TRACK.river.centerZ)<TRACK.river.halfWidth+meta.radius+25)continue;
   if([...existing,...result].some(other=>Math.hypot(other.x-p.x,other.z-p.y)<other.radius+meta.radius+28))continue;
   item=Object.freeze({...meta,s,side,x:p.x,z:p.y,angle:p.angle+(side<0?Math.PI:0),elevation:0});break;
  }if(item)break;}
  if(!item)throw new Error(`Austin: no clear plot for ${meta.kind}`);result.push(item);
 }
 return result;
}
const rect=(f,x,y,z,w,h,color,glow=0)=>f.quad([x-w/2,y-h/2,z],[x+w/2,y-h/2,z],[x+w/2,y+h/2,z],[x-w/2,y+h/2,z],color,glow);
function windows(f,x,y,z,w,h,trim='#b0c4be',glass='#3e6770'){
 rect(f,x,y,z,w+3,h+3,trim);rect(f,x,y,z-.5,w,h,glass);rect(f,x,y,z-.8,1,h,trim);rect(f,x,y+2,z-.8,w,1,trim);f.box(x,y-h/2-2,z,w+6,2,4,trim);
}
function railing(f,x,y,z,w,color='#6f7b76'){
 f.box(x,y+10,z,w,1.3,1.3,color);f.box(x,y+1,z,w,1,1,color);for(let q=-w/2;q<=w/2;q+=8)f.box(x+q,y+5,z,1,10,1,color);
}
function plaque(f,text,y,z,w,color='#ecdec2',back='#324a4b',height=13){f.box(0,y,z,w,height+8,2,back);word(f,text,0,y-height/2,z-1.2,height,w-10,color,.35);}
function tree(f,x,y,z,r=7){f.box(x,y+8,z,2,16,2,'#786a50');f.cone(x,y+14,z,r,13,'#6f8860',18,r*.25);}
function podium(f,w,d){f.box(0,3,0,w,6,d,'#a8ab98');f.box(0,7,0,w-4,2,d-4,'#d7d4bd');}
function paramount(mesh,item){const f=frame(mesh,item),cream='#dbcfb4',stone='#eee1c6',glass='#3c5356',w=170,d=102;
 podium(f,182,116);f.box(0,68,3,w,122,d,'#b5977c');
 details(mesh,()=>{
  cornice(f,0,129,3,174,106,stone);f.box(0,138,9,165,11,90,cream);
  for(let y=22;y<126;y+=8)rect(f,0,y,-49.2,169,.55,'#9f846c');
  for(const x of [-67,-34,0,34,67]){arch(f,x,70,-50,20,39,stone,glass);windows(f,x,119,-50,16,10,cream,glass);}
  for(const x of [-79,-48,-17,17,48,79]){f.box(x,82,-53,5,88,3,stone);f.box(x,126,-54,10,5,5,stone);for(const sign of [-1,1])frontDisk(f,x+sign*3,124,-57,2.6,'#bbab88',0,18);}
  for(const x of [-55,-18,18,55]){f.box(x,22,-50,27,28,2,glass);f.box(x,22,-51.5,1.4,28,1,stone);f.box(x,16,-52,23,1,1,stone);}
  // The real vertical blade, reinstated in 2015, is the defining street silhouette.
  f.box(0,112,-62,23,121,12,'#a03c31');f.box(0,113,-69,20,118,2,'#b45137');
  [...'PARAMOUNT'].forEach((letter,i)=>word(f,letter,0,162-i*12,-70.3,10,13,'#ffe5ac',.85));
  for(const side of [-1,1])for(let y=57;y<=171;y+=7)f.cone(side*10,y,-70.8,.75,1.3,'#ffe5a2',8,.75);
  f.box(0,46,-57,151,8,22,'#b34c3b');f.box(0,40,-67,151,8,3,stone);f.box(0,36,-68,156,2,4,'#e3c286');
  word(f,'PARAMOUNT',0,41,-69,6,88,'#80392e');word(f,'AUSTIN LIVE',0,30,-67,5,97,'#efc478',.75);
  for(let x=-69;x<=69;x+=8)f.box(x,36,-71,1.5,1.5,1,'#ffdda1',.8);
  for(const x of [-66,66]){f.box(x,23,-66,3,23,3,stone);f.box(x,31,-64,5,10,5,'#e8c87f',.55);}
 });}
function frost(mesh,item){const f=frame(mesh,item),steel='#a6bdc0',glass='#416c83';podium(f,208,142);f.box(0,28,0,193,39,125,'#949b99');f.box(0,64,0,152,34,107,glass);f.box(0,206,0,112,255,102,glass);
 details(mesh,()=>{
  for(const y of [48,80,91])f.box(0,y,0,y===48?198:156,3,y===48?130:111,steel);
  for(let y=95;y<332;y+=11){f.box(0,y,0,114,1.2,104,'#a5b5bd');for(const side of [-1,1])for(const x of [-45,-30,-15,0,15,30,45]){rect(f,x,y+5,side<0?-52.2:52.2,1,9,'#7197a4');}}
  for(const side of [-1,1])for(const x of [-56,56])f.box(x,212,side*50,2,238,2,'#bfd0ce');
  for(const x of [-82,-58,-34,-10,14,38,62,86])windows(f,x,30,-63,15,20,'#b5bcab','#315968');
  plaque(f,'FROST BANK',63,-56,124,'#e1e9e2','#3d586b',10);
  // Eight folded glass petals form the distinctive crystalline crown.
  const count=8;
  for(let i=0;i<count;i++){
   const a=i/count*Math.PI*2,b=(i+1)/count*Math.PI*2,m=(a+b)/2;
   const p=(t,r,y)=>[Math.cos(t)*r,y,Math.sin(t)*r];
   const left=p(a,71,329),right=p(b,71,329),top=p(m,i%2?49:61,i%2?388:407),inner=p(m,23,350);
   f.tri(left,right,top,i%2?'#92b8c6':'#7ca6bd');f.tri(right,inner,top,'#56869f');f.tri(inner,left,top,'#a7c7ce');
   beam(mesh,f.p(...left),f.p(...top),1.7,steel);beam(mesh,f.p(...right),f.p(...top),1.7,steel);
  }
  f.box(0,339,0,52,20,52,'#547b92');for(const x of [-78,78]){f.box(x,11,-60,20,6,15,'#c6beac');tree(f,x,14,-60,6);}
 });}
function library(mesh,item){const f=frame(mesh,item),stone='#c9c4ad',steel='#687d7d',glass='#4f7c85';podium(f,266,150);
 f.box(-45,60,8,166,106,125,stone);f.box(79,47,18,71,80,105,'#879797');f.box(14,106,23,205,43,100,glass);
 details(mesh,()=>{
  // Reading porches, exposed steel, limestone strata and photovoltaic shade roof.
  for(const y of [27,49,71,93,127])f.box(-38,y,-56,174,3,19,'#b8b9aa');
  for(const x of [-108,-74,-40,-6,28])for(const y of [37,60,83,110])windows(f,x,y,-56,25,15,'#879a99',glass);
  for(const x of [51,74,97]){f.box(x,44,-40,2.5,70,3,steel);windows(f,x,61,-38,17,49,steel,'#709795');}
  for(const y of [35,69,102]){f.box(75,y,-53,94,3,24,'#8c9e99');railing(f,75,y+3,-64,91);}
  f.box(4,133,16,244,5,131,'#b96d3e');f.box(4,135,16,248,2,134,stone);
  for(const x of [-103,-45,14,73,111])for(const z of [-44,63])f.box(x,146,z,3,20,3,steel);
  f.box(4,158,14,250,4,135,steel);
  for(let x=-115;x<124;x+=20)for(let z=-46;z<70;z+=23)f.box(x,161,z,18,1.6,21,'#334f60');
  for(const x of [-75,-25,25,75]){f.box(x,139,22,29,7,24,'#938b6d');tree(f,x,143,22,8);}
  plaque(f,'AUSTIN CENTRAL LIBRARY',20,-68,205,'#f0e6c8','#48686b',10);
  // Large rust-orange stair volumes break the neutral stone elevations.
  for(let i=0;i<8;i++)f.box(-112+i*9,12+i*5,-66,10,3,14,'#b67546');
 });}
function moody(mesh,item){const f=frame(mesh,item),rx=150,rz=105;const ring=(rX,rZ,y)=>Array.from({length:64},(_,i)=>[Math.cos(i/64*Math.PI*2)*rX,y,Math.sin(i/64*Math.PI*2)*rZ]);
 // A solid inset arena bowl supplies collision, the glass perimeter uses height-aware facets.
 f.box(0,39,0,215,70,136,'#9d9481');
 const bottom=ring(rx-12,rz-11,7),top=ring(rx-12,rz-11,69),roof=ring(rx+7,rz+9,89),rim=ring(rx+4,rz+7,94);
 for(let i=0;i<64;i++){const j=(i+1)%64;f.quad(bottom[i],bottom[j],top[j],top[i],i%4===0?'#55746c':'#60878b');}
 // The actual oval outline, not one oversized rectangular collider, stays solid.
 if(mesh.colliders)for(let i=0;i<64;i++){const j=(i+1)%64,a=bottom[i],b=bottom[j],c=f.p((a[0]+b[0])/2,38,(a[2]+b[2])/2);mesh.colliders.push({id:`prop-${mesh.colliders.length}`,type:'box',x:c[0],y:c[2],halfWidth:Math.hypot(a[0]-b[0],a[2]-b[2])/2,halfDepth:2,angle:item.angle+Math.atan2(b[2]-a[2],b[0]-a[0]),minHeight:7,maxHeight:70});}
 details(mesh,()=>{
  for(let i=0;i<64;i++){const j=(i+1)%64;f.quad(top[i],top[j],roof[j],roof[i],'#b2946e');f.quad(roof[i],roof[j],rim[j],rim[i],'#d6c3a0');f.tri([0,105,0],rim[j],rim[i],'#9b9988');
   beam(mesh,f.p(...bottom[i]),f.p(...top[i]),1.7,'#bcc1af');if(i%2===0)beam(mesh,f.p(top[i][0],71,top[i][2]),f.p(...roof[i]),2.2,'#766854');
  }
  for(const y of [23,45,67]){const r=ring(rx-11,rz-10,y);for(let i=0;i<64;i++)beam(mesh,f.p(...r[i]),f.p(...r[(i+1)%64]),1,'#b4b8a7');}
  plaque(f,'MOODY CENTER',59,-98,149,'#eee5cb','#455a56',11);
  for(const x of [-96,-64,-32,0,32,64,96]){f.box(x,12,-106,17,23,2,'#344e4b');f.box(x,13,-108,1.2,24,1,'#adb6a7');}
  for(const side of [-1,1]){f.box(side*134,18,-53,12,34,9,'#af7044');word(f,'UT',side*134,18,-58,7,8,'#f2dfb1');}
 });}
function acl(mesh,item){const f=frame(mesh,item),stone='#bda98c',dark='#354847',glass='#5c7e7c';podium(f,238,138);f.box(-46,63,12,130,110,108,stone);f.box(65,52,20,87,88,104,dark);f.box(0,136,34,172,59,62,'#81938e');
 details(mesh,()=>{
  for(let y=19;y<113;y+=9)rect(f,-46,y,-43,129,.6,'#978e79');
  for(const x of [-96,-64,-32,0])for(const y of [31,58,85])windows(f,x,y,-44,21,18,'#adb6a4',glass);
  f.box(1,108,-10,226,6,125,'#d2c7ac');f.box(2,98,-61,224,16,7,'#494f42');
  word(f,'ACL LIVE',-9,96,-65,10,138,'#f5d29a',.65);
  for(const x of [39,61,83,104])f.box(x,51,-33,1.6,75,2,'#afbaaf');for(const y of [24,48,72])f.box(73,y,-34,78,1.6,2,'#b3bcb0');
  f.box(63,34,-43,94,3,31,'#a29274');railing(f,62,37,-57,90);
  f.box(-69,144,-5,26,49,9,'#be7450');word(f,'ACL',-68,140,-10,13,23,'#f4dfaf',.6);
  for(const x of [-72,-36,0,36,72])windows(f,x,144,1,25,29,'#a6b5ad','#446866');
  plaque(f,'THE MOODY THEATER',17,-53,165,'#e6d5b1','#354d48',8);
  for(const x of [-99,99]){f.box(x,10,-57,23,9,17,'#9c8a6e');tree(f,x,15,-57,7);}
  // Abstract live-music panels on the entrance doors, inspired by sound bars.
  for(let i=0;i<15;i++)f.box(-45+i*6,40,-51,2.3,7+(i%5)*3,1,['#d29559','#8aafa5','#d0ad70'][i%3],.15);
 });}
export function addAustinLandmark(mesh,item){({'austin-paramount':paramount,'austin-frost-tower':frost,'austin-central-library':library,'austin-moody-center':moody,'austin-acl-live':acl}[item.kind])?.(mesh,item);}
