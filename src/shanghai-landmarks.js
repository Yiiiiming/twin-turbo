/** Compact architectural interpretations, based on Shanghai's official tourism
 * architecture pages (Four Giants, Wukang Mansion, Grand Theatre), the Shanghai
 * Museum introduction and SWFC's official project overview. Native geometry;
 * the circuit deliberately does not claim real geographic placement. */
import { TRACK, trackPoint } from './engine.js';
import { frame, details, beam, word, frontDisk, arch, cornice, column, pediment } from './london-west-end.js';
import { SHANGHAI_RIVER } from './shanghai-riverfront.js';
const TAU=Math.PI*2;
export const SHANGHAI_LANDMARKS=Object.freeze([
 {kind:'oriental-pearl',label:'Oriental Pearl',radius:112,width:208,depth:208,height:586},
 {kind:'shanghai-tower',label:'Shanghai Tower',radius:113,width:192,depth:192,height:565},
 {kind:'shanghai-swfc',label:'Shanghai World Financial Center',radius:100,width:140,depth:114,height:444},
 {kind:'jin-mao',label:'Jin Mao Tower',radius:120,width:170,depth:170,height:368},
 {kind:'shanghai-customs',label:'Customs House',radius:137,width:236,depth:130,height:252},
 {kind:'bund-hsbc',label:'HSBC Building · The Bund',radius:146,width:252,depth:140,height:207},
 {kind:'peace-hotel',label:'Peace Hotel',radius:135,width:232,depth:126,height:228},
 {kind:'shanghai-exhibition',label:'Shanghai Exhibition Centre',radius:158,width:280,depth:132,height:240},
 {kind:'shanghai-grand-theatre',label:'Shanghai Grand Theatre',radius:155,width:248,depth:172,height:155},
 {kind:'shanghai-museum',label:'Shanghai Museum',radius:145,width:244,depth:148,height:151},
 {kind:'yu-garden',label:'Yu Garden Pavilion',radius:135,width:222,depth:152,height:143},
 {kind:'wukang-mansion',label:'Wukang Mansion',radius:154,width:284,depth:130,height:171},
 {kind:'shanghai-postal-museum',label:'Shanghai Postal Museum',radius:154,width:260,depth:156,height:253},
 {kind:'shanghai-concert-hall',label:'Shanghai Concert Hall',radius:144,width:244,depth:142,height:162},
 {kind:'xujiahui-cathedral',label:'Xujiahui Cathedral',radius:145,width:222,depth:174,height:278},
].map(Object.freeze));
/** Plot directions share the renderer's local −Z façade convention. Buildings
 * stay on the ground beside the descending skyway, with their upper floors at
 * the driver's eye level; the Pearl is exactly at the helix's centre. */
export function shanghaiLandmarkPlacements(){
 if(TRACK.theme!=='shanghai')return [];
 const plots={
  'shanghai-tower':[7550,1], 'shanghai-swfc':[8750,1], 'jin-mao':[10000,1],
  'shanghai-customs':[TRACK.bund.start+300,-1], 'bund-hsbc':[TRACK.bund.start+1100,-1], 'peace-hotel':[TRACK.bund.start+2150,-1],
  'shanghai-exhibition':[20470,1], 'shanghai-grand-theatre':[21270,1],
  'shanghai-museum':[22070,1], 'shanghai-postal-museum':[20470,-1], 'shanghai-concert-hall':[21270,-1], 'xujiahui-cathedral':[22070,-1], 'yu-garden':[650,-1], 'wukang-mansion':[1450,-1],
 };
 return SHANGHAI_LANDMARKS.map(meta=>{
  if(meta.kind==='oriental-pearl')return {...meta,x:2900,z:1660,angle:0,elevation:0,s:2565,side:1};
  const skyline={'shanghai-tower':[2900,690],'shanghai-swfc':[2150,710],'jin-mao':[1450,695]};
  if(skyline[meta.kind]){const [t,n]=skyline[meta.kind],a=SHANGHAI_RIVER.angle,r=SHANGHAI_RIVER;return {...meta,x:r.x+Math.cos(a)*t-Math.sin(a)*n,z:r.z+Math.sin(a)*t+Math.cos(a)*n,angle:a,elevation:0,s:TRACK.bund.start+t,side:1,skyline:true};}
  const [s,side]=plots[meta.kind],p=trackPoint(s,side*(meta.radius+100));
  return {...meta,s,side,x:p.x,z:p.y,angle:p.angle+(side<0?Math.PI:0),elevation:0};
 });
}
// Recessed window faces use layered planes; closed façade walls already supply
// their depth. This keeps hundreds of repeated small bays cheap to render.
function window(f,x,y,z,w,h,trim,glass){
 const rect=(x,y,z,w,h,color)=>f.quad([x-w/2,y-h/2,z],[x+w/2,y-h/2,z],[x+w/2,y+h/2,z],[x-w/2,y+h/2,z],color);
 rect(x,y,z,w+3,h+3,trim);rect(x,y,z-.8,w,h,glass);
 rect(x,y,z-1.5,.9,h,trim);rect(x,y+1,z-1.5,w,.8,trim);
 rect(x,y-h/2-2,z-1.8,w+6,2.2,trim);
}
function sphere(f,x,y,z,r,color,rings=18,sides=40){
 const p=(a,b)=>[x+Math.cos(a)*Math.sin(b)*r,y+Math.cos(b)*r,z+Math.sin(a)*Math.sin(b)*r];
 for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){
  const a=i/sides*TAU,b=(i+1)/sides*TAU,c=j/rings*Math.PI,d=(j+1)/rings*Math.PI;
  f.quad(p(a,c),p(b,c),p(b,d),p(a,d),color);
 }
}
function roundBand(f,x,y,z,r,h,color,sides=48){f.cone(x,y,z,r,h,color,sides,r);}
function roof(mesh,f,x,y,z,w,d,h,color,trim){
 // Swept four-sided tiled roof, with gently upturned eaves instead of a cone.
 const layers=8,rect=t=>[[-w/2*(1-t),-d/2*(1-t)],[w/2*(1-t),-d/2*(1-t)],[w/2*(1-t),d/2*(1-t)],[-w/2*(1-t),d/2*(1-t)]],height=t=>y+h*(t*.82+t*t*.18);
 for(let j=0;j<layers;j++){
  const a=j/layers*.83,b=(j+1)/layers*.83,ra=rect(a),rb=rect(b);
  for(let k=0;k<4;k++){const n=(k+1)%4;f.quad([x+ra[k][0],height(a),z+ra[k][1]],[x+ra[n][0],height(a),z+ra[n][1]],[x+rb[n][0],height(b),z+rb[n][1]],[x+rb[k][0],height(b),z+rb[k][1]],j%2?color:trim);}
 }
 f.box(x,y+h*.78,z,w*.21,3,d*.19,color);
 for(const sx of [-1,1])for(const sz of [-1,1])beam(mesh,f.p(x+sx*w*.31,y+h*.22,z+sz*d*.31),f.p(x+sx*(w*.5+3),y+8,z+sz*(d*.5+3)),2.2,trim);
}
function pearl(mesh,item){
 const f=frame(mesh,item),concrete='#d8cec6',rose='#a95265',silver='#b3cbd0',glass='#50778b';
 f.cone(0,0,0,102,8,'#b7ad9e',48,102);f.cone(0,8,0,80,15,concrete,48,65);
 for(let i=0;i<3;i++){
  const a=i/3*TAU,dx=Math.cos(a),dz=Math.sin(a);
  // Three inclined concrete legs support the first sphere.
  const p=f.p(dx*50,67,dz*50);mesh.cone(...p,12,130,concrete,24,12);
  details(mesh,()=>beam(mesh,f.p(dx*83,14,dz*83),f.p(dx*25,132,dz*25),16,concrete));
 }
 f.cone(0,20,0,22,507,concrete,32,15);
 // Collision hulls enclose the observation spheres while trim remains render-only.
 if(mesh.colliders)for(const [bottom,r,h] of [[91,76,152],[318,53,106]])mesh.colliders.push({type:'circle',x:item.x,y:item.z,radius:r,minHeight:bottom,maxHeight:bottom+h});
 details(mesh,()=>{
  sphere(f,0,167,0,76,rose,18,40);sphere(f,0,371,0,53,rose,16,40);sphere(f,0,483,0,20,silver,14,32);
  for(const [y,r] of [[150,73],[162,76],[175,75],[188,72],[358,52],[371,54],[383,52]])roundBand(f,0,y,0,r,4.5,glass);
  for(const [y,r] of [[144,72],[196,70],[350,50],[390,51]])roundBand(f,0,y,0,r,2.5,silver);
  for(let i=0;i<24;i++){
   const a=i/24*TAU;beam(mesh,f.p(Math.cos(a)*76,159,Math.sin(a)*76),f.p(Math.cos(a)*75,181,Math.sin(a)*75),1.3,silver);
  }
  for(const y of [242,271,300]){roundBand(f,0,y,0,25,3,silver,32);for(let i=0;i<3;i++){const a=i/3*TAU;roundBand(f,Math.cos(a)*23,y+5,Math.sin(a)*23,10,14,rose,20);}}
  f.cone(0,503,0,8,48,silver,24,5);f.cone(0,551,0,5,31,concrete,24,1);sphere(f,0,583,0,3,'#eace9d',8,12);
  word(f,'ORIENTAL PEARL',0,26,-62,5,98,'#ebd3bf');
 });
}
function shanghaiTower(mesh,item){
 const f=frame(mesh,item),glass='#759cae',edge='#b9d0d4';
 f.cone(0,0,0,101,8,'#9caead',48,101);f.cone(0,8,0,55,516,glass,32,25);
 details(mesh,()=>{
  const levels=35,sides=32,p=(i,j,extra=0)=>{const t=j/levels,a=i/sides*TAU+t*2.05,r=(77-36*t)*(1+.13*Math.cos(i/sides*TAU*3))+extra;return [Math.cos(a)*r,9+t*537,Math.sin(a)*r];};
  for(let j=0;j<levels;j++)for(let i=0;i<sides;i++){
   const color=i%8===0?'#d0dfe0':i%4===0?'#58859a':glass;
   f.quad(p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1),color,.03);
   if(j%3===0){const a=p(i,j,1),b=p(i+1,j,1);f.quad(a,b,[b[0],b[1]+1.1,b[2]],[a[0],a[1]+1.1,a[2]],edge);}
  }
  for(let i=0;i<sides;i++)f.tri([0,550,0],p(i,levels),p(i+1,levels),'#b6cdd1');
  f.cone(0,546,0,35,9,'#587888',32,33);f.cone(0,555,0,33,8,'#a3bcc4',32,29);
  // Ground-level podium and fine glass ribs make this more than a plain cone.
  for(let i=0;i<12;i++){const a=i/12*TAU;f.box(Math.cos(a)*82,14,Math.sin(a)*82,6,21,6,edge);}
 });
}
function swfc(mesh,item){
 const f=frame(mesh,item),glass='#5e87a0',light='#aec8d2',dark='#345973';
 f.box(0,4,0,136,8,104,'#a1adb0');
 for(let j=0;j<18;j++){const top=(j+1)/18;f.box(0,10+(j+.5)*19,0,126-48*top,19,88-30*top,glass);}
 details(mesh,()=>{
  // The blue slab tapers toward a real open trapezoidal sky aperture.
  for(const side of [-1,1]){
   f.quad([side*63,10,-44],[side*39,352,-29],[side*39,352,29],[side*63,10,44],light);
   f.quad([-63,10,side*44],[63,10,side*44],[39,352,side*29],[-39,352,side*29],glass);
  }
  for(let y=25;y<345;y+=14){const t=(y-10)/342,w=126-48*t,z=44-15*t;f.box(0,y,-z-.4,w,1.15,1,light);f.box(0,y,z+.4,w,1.15,1,light);}
  for(let i=-3;i<=3;i++){const x=i*14;beam(mesh,f.p(x,11,-44.6),f.p(x*.62,352,-29.6),.85,light);}
 });
 // Two sloping structural cheeks and a lintel leave the bottle-opener hole empty.
 for(const sign of [-1,1]){
  for(let j=0;j<12;j++){const t=j/12,w=14,z=28-j*.33,x=sign*(32-j*.58);f.box(x,355+j*6.7,0,w,7.2,z*2,glass);}
 }
 f.box(0,440,0,63,8,48,light);
 details(mesh,()=>{
  f.box(0,352,0,78,8,60,light);f.box(0,436,-24.8,60,3,1,dark);
  for(const sign of [-1,1])beam(mesh,f.p(sign*23,357,-28),f.p(sign*16,435,-24),2.2,light);
 });
}
function jinMao(mesh,item){
 const f=frame(mesh,item),silver='#b9c4c2',glass='#456d80',warm='#8fabae';
 f.box(0,5,0,166,10,166,'#9eaaa8');f.cone(0,10,0,66,242,glass,8,18,Math.PI/8);
 details(mesh,()=>{
  // Sixteen octagonal setbacks evoke the pagoda rhythm of the real tower.
  for(let i=0;i<16;i++){
   const y=10+i*18,r=77-i*3.2;
   f.cone(0,y,0,r,16,i%2?glass:warm,8,r,Math.PI/8);f.cone(0,y+16,0,r+2,2.5,silver,8,r+2,Math.PI/8);
   for(let k=0;k<8;k++){const a=k/8*TAU+Math.PI/8;f.box(Math.cos(a)*r,y+8,Math.sin(a)*r,2.2,16,2.2,silver);}
  }
  for(let i=0;i<5;i++)f.cone(0,299+i*7,0,26-i*4.1,7,silver,8,24-i*4.1,Math.PI/8);
  f.cone(0,334,0,5.5,34,silver,16,.7);
 });
}
function clock(f,x,y,z,r){
 frontDisk(f,x,y,z,r+2,'#ad966e',0,48);frontDisk(f,x,y,z-.5,r,'#ebe4ca',.12,48);
 for(let i=0;i<12;i++){const a=i/12*TAU;f.box(x+Math.sin(a)*r*.81,y+Math.cos(a)*r*.81,z-1,1.3,2.8,.7,'#31424a');}
 f.box(x,y+r*.23,z-1.6,1.6,r*.58,1,'#31424a');f.box(x+r*.24,y,z-1.6,r*.57,1.6,1,'#31424a');
}
function customs(mesh,item){
 const f=frame(mesh,item),stone='#c6bda8',trim='#e0d8c5',glass='#435e65';
 f.box(0,5,0,230,10,122,'#a59f91');f.box(0,71,5,218,132,104,stone);f.box(0,174,9,61,80,67,stone);
 details(mesh,()=>{
  for(const y of [31,62,93,120])for(let x=-91;x<=91;x+=26)window(f,x,y,-48,12,19,trim,glass);
  for(const x of [-37,-12,12,37])column(f,x,9,-57,58,5.5,trim,'#aaa48f');
  cornice(f,0,143,5,222,108,trim);cornice(f,0,218,9,67,73,trim);
  f.box(0,231,9,50,18,57,stone);f.box(0,244,9,61,8,68,trim);
  for(let i=0;i<4;i++){
   const sub=frame(mesh,{...item,angle:item.angle+i*Math.PI/2});clock(sub,0,194,-26.2,19);
  }
  for(const x of [-20,0,20])f.box(x,231,-20,7,10,1.5,glass);
  word(f,'CUSTOMS HOUSE',0,72,-62,5.2,107,'#615848');
  for(let x=-103;x<=103;x+=13)f.box(x,145,-49,4,7,5,trim);
 });
}
function hsbc(mesh,item){
 const f=frame(mesh,item),stone='#d0c4aa',trim='#e4d9bd',glass='#486268',dome='#668c84';
 f.box(0,5,0,246,10,134,'#a79e88');f.box(0,65,8,232,120,110,stone);f.cone(0,127,8,42,24,stone,32,42);
 details(mesh,()=>{
  for(const y of [31,66,101])for(let x=-103;x<=103;x+=23)window(f,x,y,-48,11,20,trim,glass);
  for(const x of [-83,-50,-17,17,50,83])column(f,x,10,-58,92,6.6,trim,'#b0a38c');
  cornice(f,0,121,8,239,116,trim);f.box(0,135,-56,194,18,26,stone);word(f,'THE BUND',0,132,-70,7.2,129,'#7c6c4f');
  // Copper dome over a circular columned drum.
  for(let i=0;i<24;i++){const a=i/24*TAU;f.cone(Math.cos(a)*39,132,8+Math.sin(a)*39,2.2,22,trim,12,2.2);}
  for(let j=0;j<16;j++){const a=j/16*Math.PI/2,b=(j+1)/16*Math.PI/2;f.cone(0,153+Math.sin(a)*40,8,Math.cos(a)*44,Math.max(.15,(Math.sin(b)-Math.sin(a))*40),dome,40,Math.max(.2,Math.cos(b)*44));}
  f.cone(0,193,8,6,12,trim,20,5);f.cone(0,205,8,2,2,'#ccad69',16,0);
 });
}
function peaceHotel(mesh,item){
 const f=frame(mesh,item),stone='#c9c3b2',trim='#e0d9c5',glass='#41606b',copper='#426f60';
 f.box(0,5,0,224,10,117,'#aba495');f.box(0,76,7,214,142,101,stone);f.box(0,159,7,84,44,85,stone);
 details(mesh,()=>{
  for(let y=26;y<145;y+=24)for(let x=-93;x<=93;x+=23)window(f,x,y,-45,11,17,trim,glass);
  for(const x of [-104,-57,57,104])f.box(x,80,-47,3,135,3,trim);
  for(const y of [37,85,135,151])cornice(f,0,y,7,215,103,trim);
  for(const x of [-30,-10,10,30])window(f,x,163,-37,10,25,trim,glass);
  f.cone(0,181,7,62,45,copper,4,0,Math.PI/4);
  f.cone(0,225,7,2,3,'#cab779',12,0);
  for(const x of [-50,0,50])arch(f,x,10,-47,28,26,trim,'#344b4a');
  f.box(0,41,-55,139,9,15,'#3a6457');word(f,'PEACE HOTEL',0,38,-63,5.8,112,'#e4d5aa',.13);
 });
}
function exhibition(mesh,item){
 const f=frame(mesh,item),stone='#e2c590',trim='#f0dfb7',glass='#587071',roofColor='#786b67';
 f.box(0,5,0,276,10,122,'#b2a58d');f.box(0,60,4,93,112,91,stone);
 for(const side of [-1,1])f.box(side*91,44,12,89,78,100,stone);
 f.box(0,146,9,49,63,56,stone);
 details(mesh,()=>{
  for(const side of [-1,1]){
   cornice(f,side*91,86,12,92,103,trim);
   for(const x of [side*62,side*89,side*116])arch(f,x,12,-40,18,47,trim,glass);
   for(const x of [side*58,side*78,side*98,side*118])column(f,x,10,-43,66,3.5,trim,'#bdac83');
  }
  for(const x of [-31,-10,10,31])column(f,x,11,-47,90,5,trim,'#bcaa80');
  pediment(f,0,105,-53,104,24,96,trim,stone);cornice(f,0,177,9,58,65,trim);
  for(const x of [-15,0,15])arch(f,x,137,-20,8,27,trim,glass);
  f.cone(0,181,9,28,21,roofColor,8,10);f.cone(0,202,9,9,28,'#cfaa65',16,1);
  frontDisk(f,0,235,-1,4,'#e9bb64',.2,10);f.cone(0,230,9,1.5,9,'#d5b276',12,.6);
  word(f,'EXHIBITION CENTRE',0,93,-51,5.1,85,'#8e7446');
 });
}
function grandTheatre(mesh,item){
 const f=frame(mesh,item),glass='#648c9a',white='#e3e8dc',slate='#566b75';
 f.box(0,6,0,238,12,162,'#b6bcb2');f.box(0,65,3,219,108,134,glass);
 details(mesh,()=>{
  // Lifted white wing roof, concave in section, with substantial perimeter depth.
  const width=244,depth=166;
  for(let i=0;i<32;i++){
   const a=-width/2+i/32*width,b=-width/2+(i+1)/32*width,ha=129+24*(a/(width/2))**2,hb=129+24*(b/(width/2))**2;
   f.quad([a,ha,-depth/2],[b,hb,-depth/2],[b,hb,depth/2],[a,ha,depth/2],white);
   f.quad([a,ha-6,-depth/2],[b,hb-6,-depth/2],[b,hb,-depth/2],[a,ha,-depth/2],white);
   f.quad([a,ha-6,depth/2],[b,hb-6,depth/2],[b,hb,depth/2],[a,ha,depth/2],white);
  }
  for(const x of [-93,-62,-31,0,31,62,93]){f.box(x,66,-65,3,108,3,white);f.box(x,119,0,4,6,151,slate);}
  for(const y of [18,52,85,114])f.box(0,y,-65,220,2,2,white);
  for(const side of [-1,1])for(const z of [-45,-15,15,45])f.box(side*110,68,z,2,110,2,white);
  f.box(0,25,-69,115,30,3,'#405e69');for(const x of [-45,-22,0,22,45])f.box(x,22,-71,15,22,1,'#a3b8b4');
  word(f,'SHANGHAI GRAND THEATRE',0,97,-67,5.9,198,'#e1e3ca');
 });
}
function museum(mesh,item){
 const f=frame(mesh,item),stone='#c0aa85',trim='#dccaab',glass='#556a65',bronze='#78694f';
 f.box(0,6,0,238,12,142,'#a39c86');f.box(0,48,0,220,84,130,stone);f.cone(0,90,0,75,20,stone,48,75);
 details(mesh,()=>{
  for(const y of [25,59,84])f.box(0,y,-66,221,2,2,trim);
  for(let x=-95;x<=95;x+=19){f.box(x,53,-66,9,42,2,glass);f.box(x,87,-67,12,4,3,trim);}
  for(let j=0;j<12;j++){const a=j/12*Math.PI/2,b=(j+1)/12*Math.PI/2;f.cone(0,110+Math.sin(a)*27,0,Math.cos(a)*77,Math.max(.15,(Math.sin(b)-Math.sin(a))*27),stone,40,Math.max(.2,Math.cos(b)*77));}
  roundBand(f,0,106,0,79,5,trim);roundBand(f,0,114,0,74,2,bronze);
  // Rectangular raised handles recall a bronze ding ritual vessel.
  for(const side of [-1,1]){
   f.box(side*87,115,0,12,62,17,stone);f.box(side*61,143,0,64,12,17,trim);
   f.box(side*40,129,0,12,29,17,stone);
  }
  for(const x of [-30,0,30])f.box(x,21,-68,22,25,3,'#485b52');word(f,'SHANGHAI MUSEUM',0,76,-67.6,5.4,176,'#e5d2af');
 });
}
function yuGarden(mesh,item){
 const f=frame(mesh,item),wood='#6a3c2f',wall='#dccaa8',tile='#535e58',edge='#898c76';
 f.box(0,5,0,214,10,145,'#9caa96');f.box(0,26,5,148,42,94,wall);f.box(0,81,5,110,30,76,wood);
 for(const x of [-66,-33,0,33,66])f.box(x,29,-47,5,45,5,wood);
 details(mesh,()=>{
  roof(mesh,f,0,48,5,206,141,38,tile,edge);roof(mesh,f,0,102,5,152,104,39,tile,edge);
  for(const y of [20,34,74,87])for(let x=-48;x<=48;x+=16){f.box(x,y,-44,10,10,1,'#414b43');f.box(x,y,-45,1,10,.5,'#b9a281');f.box(x,y,-45,10,1,.5,'#b9a281');}
  for(const x of [-54,-27,0,27,54]){f.box(x,82,-38,3,41,3,wood);f.box(x,102,-40,8,3,7,wood);}
  for(const x of [-84,84]){f.box(x,15,-25,7,21,7,wood);frontDisk(f,x,30,-28,7,'#ac5943',.15,20);}
  f.box(0,45,-50,53,10,3,'#474b36');word(f,'YU GARDEN',0,43,-52,4.8,45,'#d9bd7b');
  // Garden balustrade and two rock shapes frame, rather than obscure, the hall.
  for(const x of [-96,96]){f.cone(x,10,36,12,24,'#929c8c',7,5);f.cone(x-4,10,51,10,15,'#899686',7,3);}
  for(let x=-97;x<=97;x+=14)f.box(x,15,-62,3,10,3,'#b6b8a0');f.box(0,21,-62,197,3,3,'#c4c4a9');
 });
}
function wukang(mesh,item){
 const f=frame(mesh,item),brick='#b6785d',stone='#d7bda2',glass='#445d5b',dark='#755446';
 const poly=[[-136,-47],[136,-47],[107,68]],levels=[9,39,61,85,109,133,153];
 // Ship-like wedge: the long façade and tapering diagonal are actual geometry.
 for(let j=0;j<9;j++){
  const x=-117+j*28,depth=Math.max(3,(x-13+136)/243*115-8);f.box(x,79,-44+depth/2,26,142,Math.max(7,depth),brick);
 }
 details(mesh,()=>{
  for(let k=0;k<3;k++){const a=poly[k],b=poly[(k+1)%3];f.quad([a[0],9,a[1]],[b[0],9,b[1]],[b[0],158,b[1]],[a[0],158,a[1]],brick);}
  f.tri([-136,158,-47],[136,158,-47],[107,158,68],'#705f57');
  for(let j=0;j<levels.length;j++){
   const y=levels[j];beam(mesh,f.p(-136,y,-48),f.p(136,y,-48),j===1?5:2.4,stone);
   beam(mesh,f.p(-136,y,-48),f.p(107,y,69),j===1?5:2.4,stone);
  }
  for(let x=-119;x<=119;x+=26){arch(f,x,9,-48,17,24,stone,'#5b5850');for(const y of [52,76,100,124,146])window(f,x,y,-48.5,11,14,stone,glass);}
  // Continuous balcony and wrought-iron rails on the two elevations.
  for(let x=-120;x<=120;x+=13)f.box(x,43,-51,1,8,1,dark);f.box(0,47,-51,256,1.4,1.4,dark);
  for(const y of [78,102,126])for(let x=-112;x<122;x+=52){f.box(x,y-9,-52,19,2,8,stone);f.box(x,y-6,-56,19,1,1,dark);}
  const a=poly[0],b=poly[2],length=Math.hypot(b[0]-a[0],b[1]-a[1]),angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
  for(let i=1;i<10;i++){
   const t=i/10,p=f.p(a[0]+(b[0]-a[0])*t,0,a[1]+(b[1]-a[1])*t),sub=frame(mesh,{x:p[0],z:p[2],angle:item.angle+angle+Math.PI,elevation:0});
   for(const y of [53,77,101,125,146])window(sub,0,y,-.8,11,14,stone,glass);
  }
  for(let i=0;i<3;i++)beam(mesh,f.p(...[poly[i][0],159,poly[i][1]]),f.p(...[poly[(i+1)%3][0],159,poly[(i+1)%3][1]]),5,stone);
  word(f,'WUKANG MANSION',0,31,-49,5.4,114,'#edddbf');
  f.box(92,164,39,19,14,15,dark);
 });
}
// Postal clock-tower, neoclassical concert hall and red-brick Gothic nave give
// the late course an equally composed outer frontage, rather than a blank side.
function postalMuseum(mesh,item){
 const f=frame(mesh,item),stone='#c8c3ad',trim='#e4dfc9',glass='#41646e',copper='#547f70';
 f.box(0,5,0,248,10,146,'#a4a894');f.box(0,70,7,236,128,122,stone);f.box(60,160,-5,51,60,63,stone);
 details(mesh,()=>{
  for(const y of[33,66,103])for(let x=-99;x<=99;x+=22)window(f,x,y,-55,12,22,trim,glass);
  for(let x=-102;x<=102;x+=34)column(f,x,13,-62,99,5.1,trim,'#a5a58e');
  cornice(f,0,136,7,242,129,trim);f.box(0,143,10,224,8,114,'#75867c');
  cornice(f,60,190,-5,60,72,trim);clock(f,60,171,-37.2,14);
  for(const side of[-1,1]){f.box(60+side*26,168,-35,3,40,3,trim);f.box(60+side*29,198,-5,6,16,53,trim);}
  f.cone(60,201,-5,31,21,copper,8,18,Math.PI/8);f.cone(60,222,-5,18,17,copper,16,5);f.cone(60,239,-5,4,11,'#d4bb80',16,1);f.cone(60,250,-5,2,3,'#c8b27a',12,0);
  // Two rooftop sculptural groups frame the postal clock, with fine plinths.
  for(const x of[7,109]){f.box(x,150,-18,25,5,24,trim);f.cone(x,153,-18,3.5,15,'#76847a',16,2.5);sphere(f,x,170,-18,3,'#8c9c8c',8,12);beam(mesh,f.p(x,164,-18),f.p(x-9,174,-18),2,'#889b89');beam(mesh,f.p(x,164,-18),f.p(x+10,168,-18),2,'#889b89');}
  word(f,'SHANGHAI POST',-29,120,-65,6.2,138,'#6b735b');
 });
}
function concertHall(mesh,item){
 const f=frame(mesh,item),stone='#d8ceba',trim='#efe5cd',shade='#b4a990',glass='#456272';
 f.box(0,5,0,238,10,136,'#b4ad99');f.box(0,64,6,222,118,116,stone);
 details(mesh,()=>{
  for(const x of[-90,-60,-30,0,30,60,90])arch(f,x,51,-53,18,44,trim,glass);
  for(const x of[-94,-67,-40,40,67,94])column(f,x,10,-60,95,5.4,trim,shade);
  for(const x of[-36,0,36])arch(f,x,11,-55,23,30,trim,'#3a514f');
  cornice(f,0,121,6,230,123,trim);f.box(0,132,6,224,15,117,stone);
  word(f,'SHANGHAI CONCERT HALL',0,126,-56.2,6,203,'#84724e');
  pediment(f,0,142,-61,131,18,110,trim,stone);
  for(let x=-105;x<=105;x+=10)f.box(x,116,-56,3.2,4,4,shade);
  for(const x of[-93,93]){f.box(x,33,-57,24,25,3,'#334f5a');word(f,'MUSIC',x,29,-59,4.6,21,'#ead7a7');}
  f.box(0,46,-66,110,4,23,'#638186');f.box(0,43,-78,111,6,2,'#a9a18b');
 });
}
function pointed(f,x,bottom,z,w,h,trim,glass){
 const spring=bottom+h*.56,top=bottom+h;
 f.box(x,(bottom+spring)/2,z,w,spring-bottom,1.3,glass);
 f.tri([x-w/2,spring,z],[x+w/2,spring,z],[x,top,z],glass);
 for(const side of[-1,1]){f.box(x+side*(w/2+1),bottom+(spring-bottom)/2,z-1,2,spring-bottom,2,trim);}
 for(const side of[-1,1]){
  const a=[x+side*w/2,spring,z-1],b=[x,top,z-1],c=[x,top+3,z-1],d=[x+side*(w/2+2.5),spring,z-1];f.quad(a,b,c,d,trim);
 }
 f.box(x,bottom+h*.36,z-1.7,1,h*.7,1,trim);f.box(x,bottom+h*.30,z-1.7,w,1,1,trim);
}
function cathedral(mesh,item){
 const f=frame(mesh,item),brick='#9e5142',stone='#d9c3a1',roofSlate='#596d70',glass='#415d76';
 f.box(0,5,6,209,10,158,'#a99b84');f.box(0,68,17,113,126,133,brick);
 for(const x of[-78,78])f.box(x,100,-22,47,190,53,brick);
 details(mesh,()=>{
  for(const side of[-1,1]){
   const x=side*78;for(const y of[38,91,142,185])cornice(f,x,y,-22,49,56,stone);
   for(const y of[53,111,164])pointed(f,x,y-17,-50,24,39,stone,glass);
   for(const dx of[-22,22])f.box(x+dx,102,-50,3,172,3,stone);
   f.cone(x,195,-22,34,68,roofSlate,4,0,Math.PI/4);
   f.box(x,270,-22,2,15,2,stone);f.box(x,272,-22,10,2,2,stone);
   for(const z of[-44,0])for(const dx of[-22,22]){f.cone(x+dx,190,z,4,18,stone,8,1);}
  }
  // Nave roof and central red-brick gable have real slopes, not painted shapes.
  f.tri([-56,132,-51],[56,132,-51],[0,181,-51],brick);
  f.quad([-59,132,-51],[0,181,-51],[0,181,87],[-59,132,87],roofSlate);
  f.quad([0,181,-51],[59,132,-51],[59,132,87],[0,181,87],roofSlate);
  pointed(f,0,12,-53,35,53,stone,'#454b42');pointed(f,-39,13,-53,21,40,stone,'#434b43');pointed(f,39,13,-53,21,40,stone,'#434b43');
  frontDisk(f,0,116,-52.2,26,stone,0,48);frontDisk(f,0,116,-52.7,22,glass,.05,48);
  for(let i=0;i<12;i++){const a=i/12*TAU;beam(mesh,f.p(0,116,-53.4),f.p(Math.cos(a)*22,116+Math.sin(a)*22,-53.4),1.2,stone);frontDisk(f,Math.cos(a)*15,116+Math.sin(a)*15,-53.6,3.2,i%2?'#ab775e':'#73999e',.08,12);}
  for(const side of[-1,1])for(const z of[-25,12,49,77]){
   f.box(side*59,65,z,9,114,6,stone);f.box(side*61,28,z,12,42,8,stone);
   const pos=f.p(side*58,0,z),sf=frame(mesh,{x:pos[0],z:pos[2],angle:item.angle+side*Math.PI/2});pointed(sf,0,47,-1,18,62,stone,glass);
  }
  word(f,'XUJIAHUI',0,75,-54,6,86,'#dfc9a0');
 });
}
export function addShanghaiLandmark(mesh,item){
 const draw={'oriental-pearl':pearl,'shanghai-tower':shanghaiTower,'shanghai-swfc':swfc,'jin-mao':jinMao,
  'shanghai-customs':customs,'bund-hsbc':hsbc,'peace-hotel':peaceHotel,'shanghai-exhibition':exhibition,
  'shanghai-grand-theatre':grandTheatre,'shanghai-museum':museum,'yu-garden':yuGarden,'wukang-mansion':wukang,'shanghai-postal-museum':postalMuseum,'shanghai-concert-hall':concertHall,'xujiahui-cathedral':cathedral};
 if(!draw[item.kind])throw new RangeError(`Unknown Shanghai landmark: ${item.kind}`);
 draw[item.kind](mesh,item);
}
