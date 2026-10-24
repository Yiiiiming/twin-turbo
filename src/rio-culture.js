/** Rio cultural landmarks. Compact architectural interpretations, local -Z
 * frontage, ground 0. Structural volumes collide; fine relief stays lightweight.
 * Institution/architect references document each landmark's distinctive forms.
 */
import {frame,details,beam,word,frontDisk,pediment} from './london-west-end.js';
const TAU=Math.PI*2;
const definitions=[
 ['museum-of-tomorrow','Museum of Tomorrow','未来博物馆',260,150,104,['long cantilevered spine','wing-like solar brises','reflecting pools'],'https://calatrava.com/projects/museu-do-amanha-rio-de-janeiro.html'],
 ['mam-rio','MAM Rio','里约现代艺术博物馆',230,130,103,['fourteen exposed structural frames','raised glass gallery','landscaped reflecting pool'],'https://mam.rio/educacao/audioguia-arquitetura/'],
 ['mar-rio','Museu de Arte do Rio','里约艺术博物馆',210,130,150,['undulating shared canopy','historic Dom Joao VI palace','modern glass school'],'https://museudeartedorio.org.br/o-mar/o-museu/'],
 ['maracana-stadium','Maracanã','马拉卡纳体育场',270,220,100,['oval open stadium','radial suspended roof','blue and yellow seating bowl'],'https://riotur.rio/que_fazer/maracana/'],
 ['sambadrome','Sambódromo','桑巴大道',220,200,162,['Apotheosis sculptural arch','open parade avenue','tiered grandstands'],'https://riotur.rio/que_fazer/passarela-professor-darcy-ribeiro-sambodromo/'],
 ['selaron-steps','Selarón Steps','塞拉隆阶梯',150,190,122,['rising ceramic mosaic stair','red tiled retaining walls','colourful Santa Teresa houses'],'https://riotur.rio/que_fazer/escadariaselaron/'],
 ['parque-lage','Parque Lage','拉热公园',210,160,122,['open mansion courtyard','central turquoise pool','Italianate arcades'],'https://riotur.rio/que_fazer/parque-lage-corcovado/'],
 ['rio-botanical-garden','Jardim Botânico','里约植物园',210,190,142,['royal palm avenue','glass conservatory','Academy of Fine Arts portal'],'https://riotur.rio/que_fazer/jardimbotanico/'],
 ['central-do-brasil','Central do Brasil','巴西中央车站',220,135,244,['four-faced monumental clock','stepped Art Deco tower','long station concourse'],'https://brasilianafotografica.bn.gov.br/?tag=estacao-de-trem'],
 ['copacabana-palace','Copacabana Palace','科帕卡巴纳宫酒店',240,130,160,['rhythmic seafront balconies','curved upper pediment','green awnings and stone balustrades'],'https://www.belmond.com/en/stories/copacabana-palace-hall-of-fame'],
];
export const RIO_CULTURE_LANDMARKS=Object.freeze(definitions.map(([kind,label,nameZh,width,depth,height,features,source])=>Object.freeze({kind,label,nameZh,width,depth,height,radius:Math.hypot(width,depth)/2+8,family:'culture',features:Object.freeze(features),source})));
const C={stone:'#b5a78a',cream:'#d6c9ac',shade:'#807865',concrete:'#8c9189',ivory:'#deded0',blue:'#3e6b86',glass:'#3b7783',iron:'#31484d',teal:'#387568',green:'#346c47',leaf:'#508357',red:'#a94735',ochre:'#d6a64b',water:'#3b9499'};
function panel(f,x,y,z,w,h,c,em=0){f.quad([x-w/2,y-h/2,z],[x-w/2,y+h/2,z],[x+w/2,y+h/2,z],[x+w/2,y-h/2,z],c,em);}
function rod(f,a,b,w,c){const d=b.map((n,i)=>n-a[i]),l=Math.hypot(...d);if(l<1e-8)return;const v=d.map(n=>n/l),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],r=cross(v,Math.abs(v[1])>.9?[1,0,0]:[0,1,0]),u=r.map(n=>n/Math.hypot(...r));for(const n of [u,cross(v,u)])f.quad(a.map((x,i)=>x-n[i]*w/2),b.map((x,i)=>x-n[i]*w/2),b.map((x,i)=>x+n[i]*w/2),a.map((x,i)=>x+n[i]*w/2),c);}
function surface(f,x0,z0,x1,z1,y,c,em=0){f.quad([x0,y,z0],[x0,y,z1],[x1,y,z1],[x1,y,z0],c,em);}
function base(f,w,d,c=C.shade){f.box(0,2,0,w,4,d,c);}
function sign(f,s,x,y,z,w,h=4,c=C.cream){panel(f,x,y,z,w+5,h+5,C.iron);word(f,s,x,y-h/2,z-.35,h,w,c,.06);}
function win(f,x,y,z,w,h,trim=C.cream,glass=C.glass){panel(f,x,y,z,w+2,h+3,trim);panel(f,x,y,z-.3,w,h,glass);panel(f,x,y,z-.5,.75,h,C.iron);panel(f,x,y+1,z-.5,w,.65,trim);}
function archWindow(f,x,b,z,w,h,trim=C.cream,glass=C.glass){const r=w/2,sy=b+h-r;panel(f,x,(b+sy)/2,z,w,sy-b,glass);for(let i=0;i<10;i++){const a=i/10*Math.PI,t=(i+1)/10*Math.PI;f.tri([x,sy,z],[x+Math.cos(a)*r,sy+Math.sin(a)*r,z],[x+Math.cos(t)*r,sy+Math.sin(t)*r,z],glass);f.quad([x+Math.cos(a)*r,sy+Math.sin(a)*r,z-.25],[x+Math.cos(t)*r,sy+Math.sin(t)*r,z-.25],[x+Math.cos(t)*(r+2),sy+Math.sin(t)*(r+2),z-.25],[x+Math.cos(a)*(r+2),sy+Math.sin(a)*(r+2),z-.25],trim);}for(const s of [-1,1])panel(f,x+s*(r+1),(b+sy)/2,z-.25,2,sy-b,trim);panel(f,x,b+h*.4,z-.5,.8,h*.8,trim);}
function hip(f,x,y,z,w,d,h,c=C.red){f.quad([x-w/2,y,z-d/2],[x-w*.32,y+h,z],[x+w*.32,y+h,z],[x+w/2,y,z-d/2],c);f.quad([x+w/2,y,z+d/2],[x+w*.32,y+h,z],[x-w*.32,y+h,z],[x-w/2,y,z+d/2],c);f.tri([x-w/2,y,z-d/2],[x-w/2,y,z+d/2],[x-w*.32,y+h,z],C.shade);f.tri([x+w/2,y,z-d/2],[x+w*.32,y+h,z],[x+w/2,y,z+d/2],C.shade);}
function subframe(mesh,item,f,x,z,angle=0){const p=f.p(x,0,z);return frame(mesh,{...item,x:p[0],z:p[2],angle:(item.angle||0)+angle});}
function palm(mesh,f,x,z,h=80){f.cone(x,4,z,2.7,h-12,'#8d8260',8,1.7);details(mesh,()=>{for(let n=0;n<8;n++){const a=n/8*TAU,p=t=>[x+Math.cos(a)*22*t,4+h-12+Math.sin(t*Math.PI)*8-7*t,z+Math.sin(a)*22*t],u=[-Math.sin(a)*3,0,Math.cos(a)*3];for(let j=0;j<3;j++){const aa=p(j/3),b=p((j+1)/3),w=1-j/4;f.quad(aa.map((v,i)=>v-u[i]*w),b.map((v,i)=>v-u[i]*(w-.25)),b.map((v,i)=>v+u[i]*(w-.25)),aa.map((v,i)=>v+u[i]*w),n%2?C.green:C.leaf);rod(f,aa,b,.5,C.teal);}}});}
function hedge(f,x,z,w,d){f.box(x,6,z,w,4,d,C.green);f.box(x,8.3,z,w-3,1,d-3,C.leaf);}
function solidBeam(mesh,f,a,b,width,color){beam(mesh,f.p(...a),f.p(...b),width,color);if(mesh.colliders){const p=f.p(...a),q=f.p(...b),h=Math.hypot(q[0]-p[0],q[2]-p[2]);mesh.colliders.push({type:'box',x:(p[0]+q[0])/2,y:(p[2]+q[2])/2,halfWidth:h/2+width/2,halfDepth:width/2,angle:Math.atan2(q[2]-p[2],q[0]-p[0]),minHeight:Math.min(p[1],q[1])-width/2,maxHeight:Math.max(p[1],q[1])+width/2});}}
// Ring walls are composed of real short solids: the empty central field remains empty.
function ringSolid(mesh,item,f,rx,rz,y,h,width,n,color){for(let i=0;i<n;i++){const a=i/n*TAU,b=(i+1)/n*TAU,p=[Math.cos(a)*rx,Math.sin(a)*rz],q=[Math.cos(b)*rx,Math.sin(b)*rz],m=f.p((p[0]+q[0])/2,y,(p[1]+q[1])/2);mesh.box(...m,Math.hypot(q[0]-p[0],q[1]-p[1])+1,h,width,color,(item.angle||0)+Math.atan2(q[1]-p[1],q[0]-p[0]));}}

function tomorrow(mesh,item){const f=frame(mesh,item);base(f,260,150,'#688d89');
 f.box(0,24,0,178,40,57,'#517b80');f.box(0,44,0,194,5,65,C.ivory);
 details(mesh,()=>{
  for(const z of [-59,59])surface(f,-124,z-11,124,z+11,4.2,C.water,.12);
  // The longitudinal skeleton tapers into both overhangs; paired brises fan out.
  for(let i=0;i<26;i++){const x=-122+i*9.76,t=x/123,y=59+14*(1-t*t),span=20+37*Math.sin((i+.5)/26*Math.PI);
   for(const s of [-1,1]){const a=[x,y,0],b=[x+2,48+17*(1-t*t),s*span],c=[x+4,y+27*(1-t*t),s*span*.77];
    f.tri(a,b,c,i%3?C.ivory:'#b5c9c4');f.tri([x-2,y+1,0],a,c,'#a9c2bf');rod(f,a,b,1.4,'#86aaa9');rod(f,b,c,1.1,C.ivory);rod(f,a,c,1.2,C.ivory);
    if(i>4&&i<21)rod(f,[x,7,s*28],[x,y-6,s*32],1.2,C.ivory);
   }
   if(i<25)rod(f,[x,y,0],[x+9.76,59+14*(1-((x+9.76)/123)**2),0],3.3,C.ivory);
  }
  for(const z of [-29.1,29.1]){for(let x=-84;x<=84;x+=12)panel(f,x,24,z,1.1,35,C.ivory);for(const y of [10,38])panel(f,0,y,z,176,.8,'#a2c4c1');}
  for(const s of [-1,1]){const g=subframe(mesh,item,f,s*89,0,s*Math.PI/2);for(let x=-21;x<=21;x+=7)win(g,x,23,-.4,5,30,C.ivory);}
  for(const x of [-103,103]){f.box(x,5,0,20,2,62,C.cream);for(let j=-2;j<=2;j++)rod(f,[x,7,j*9],[x,39,j*9],1.2,C.ivory);}
  sign(f,'MUSEU DO AMANHA',0,13,-33,97,4);
 });}

function mam(mesh,item){const f=frame(mesh,item);base(f,230,130,'#637c66');
 f.box(0,47,4,204,42,62,'#4f7379');f.box(0,71,4,215,6,78,C.concrete);
 // Fourteen exposed concrete supports articulate the raised transparent hall.
 for(let i=0;i<14;i++){const x=-100+i*200/13;for(const s of [-1,1]){solidBeam(mesh,f,[x,7,s*48],[x,91,s*35],5.2,C.concrete);solidBeam(mesh,f,[x,7,s*48],[x,39,s*23],4.7,C.concrete);}solidBeam(mesh,f,[x,91,-35],[x,91,35],4.8,C.concrete);}
 details(mesh,()=>{
  for(const z of [-27.2,35.2]){for(let x=-98;x<=98;x+=9.8)panel(f,x,47,z,.8,39,C.iron);for(const y of [29,48,66])panel(f,0,y,z,204,.9,'#9cb6b1');}
  for(let x=-91;x<=91;x+=14)for(const z of [-30,38])rod(f,[x,75,z],[x,97,z],.9,C.iron);
  for(const s of [-1,1]){const g=subframe(mesh,item,f,s*102,4,s*Math.PI/2);panel(g,0,46,-.3,60,37,C.glass);for(let x=-24;x<=24;x+=8)panel(g,x,46,-.6,.7,37,C.cream);}
  surface(f,-107,-62,107,-52,4.2,C.water,.1);
  for(const x of [-74,74]){hedge(f,x,55,51,12);f.box(x,7,-43,30,3,5,C.stone);}
  // Broad helicoidal stair by the lifted gallery, read as a sequence of wedges.
  for(let i=0;i<19;i++){const a=i/19*TAU*1.4,b=(i+1)/19*TAU*1.4,p=(t,r,y)=>[-71+Math.cos(t)*r,y,Math.sin(t)*r];f.quad(p(a,3,5+i*1.15),p(b,3,5+i*1.15),p(b,13,5+i*1.15),p(a,13,5+i*1.15),C.cream);rod(f,p(a,13,16+i*1.15),p(b,13,16+i*1.15),.75,C.iron);}
  sign(f,'MAM RIO',44,20,-28,48,5);panel(f,51,44,-27.6,27,21,'#ac663f');panel(f,-38,44,-27.6,34,21,'#3b8078');
 });}

function mar(mesh,item){const f=frame(mesh,item);base(f,210,130);
 f.box(-50,58,0,88,108,92,'#b0a67f');f.box(51,59,0,85,110,94,'#507c88');
 details(mesh,()=>{
  for(const y of [13,48,80,108])panel(f,-50,y,-46.4,92,3,C.cream);
  for(const x of [-82,-61,-40,-19]){archWindow(f,x,9,-46.6,12,25);for(const y of [58,87])win(f,x,y,-46.8,12,18);panel(f,x+8,60,-47.3,2,91,C.cream);}
  for(const s of [-1,1]){const g=subframe(mesh,item,f,-50+s*44,0,s*Math.PI/2);for(const x of [-30,-10,10,30])for(const y of [25,59,89])win(g,x,y,-.4,10,16);}
  pediment(f,-50,114,-49,73,16,6,C.cream,C.shade);for(const x of [-84,-16]){f.cone(x,111,0,6,14,C.cream,8,3);f.cone(x,125,0,3,6,C.cream,8,0);}
  for(let x=13;x<=90;x+=7)panel(f,x,61,-47.4,1.3,109,'#abc0b8');for(const y of [14,35,56,77,98,112])panel(f,51,y,-47.7,83,.85,'#9eb9b3');
  for(const s of [-1,1]){const g=subframe(mesh,item,f,51+s*42.5,0,s*Math.PI/2);for(let x=-40;x<=40;x+=10)panel(g,x,60,-.3,1,109,'#9eb9b3');}
  // A continuous floating wave spans the old palace and modern school.
  const p=(x,z)=>[x,139+Math.sin(x/25)*4+Math.cos(z/24)*3,z];
  for(let i=0;i<28;i++)for(let j=0;j<8;j++){const x=-103+i*206/28,z=-60+j*15,a=p(x,z),b=p(x+206/28,z),c=p(x+206/28,z+15),d=p(x,z+15);f.quad(a,d,c,b,C.ivory);f.quad(a.map((n,k)=>k===1?n-3:n),b.map((n,k)=>k===1?n-3:n),c.map((n,k)=>k===1?n-3:n),d.map((n,k)=>k===1?n-3:n),'#a4b5aa');}
  for(const x of [-94,-5,5,94])for(const z of [-38,38])f.cone(x,113,z,1.6,24,C.cream,8,1.6);
  f.box(0,112,8,18,4,25,C.cream);sign(f,'MAR',51,127,-48,33,8);
 });}

function maracana(mesh,item){const f=frame(mesh,item);base(f,270,220,'#728e76');
 ringSolid(mesh,item,f,118,94,18,28,15,40,C.concrete);
 for(let i=0;i<40;i++){const a=i/40*TAU;f.box(Math.cos(a)*124,49,Math.sin(a)*99,3,35,3,C.cream);}
 details(mesh,()=>{
  surface(f,-67,-40,67,40,4.2,'#3e8050');
  for(let k=0;k<9;k++)surface(f,-65+k*14.5,-39,-58+k*14.5,39,4.3,'#488958');
  for(const z of [-37,37])rod(f,[-63,4.6,z],[63,4.6,z],.7,C.cream);for(const x of [-63,0,63])rod(f,[x,4.6,-37],[x,4.6,37],.7,C.cream);
  for(let i=0;i<20;i++){const a=i/20*TAU,b=(i+1)/20*TAU;rod(f,[Math.cos(a)*12,4.6,Math.sin(a)*12],[Math.cos(b)*12,4.6,Math.sin(b)*12],.7,C.cream);}
  for(const s of [-1,1]){rod(f,[s*64,5,-10],[s*64,15,-10],1.2,C.cream);rod(f,[s*64,15,-10],[s*64,15,10],1.2,C.cream);rod(f,[s*64,15,10],[s*64,5,10],1.2,C.cream);for(let z=-10;z<=10;z+=5)rod(f,[s*64,15,z],[s*71,5,z],.35,'#afc5b2');}
  for(let i=0;i<48;i++){const a=i/48*TAU,b=(i+1)/48*TAU,p=(t,rx,rz,y)=>[Math.cos(t)*rx,y,Math.sin(t)*rz];
   for(let row=0;row<7;row++){const rx=77+row*5.5,rz=51+row*5.3,y=9+row*5.7;f.quad(p(a,rx,rz,y),p(b,rx,rz,y),p(b,rx+5.5,rz+5.3,y+5.7),p(a,rx+5.5,rz+5.3,y+5.7),i%12<4?C.ochre:i%12<9?'#4c90ab':'#aebda6');if(row%2===0)f.quad(p(a,rx,rz,y+.2),p(b,rx,rz,y+.2),p(b,rx+.7,rz+.7,y+.9),p(a,rx+.7,rz+.7,y+.9),'#305f71');if(i%6===0)rod(f,p(a,77,51,10),p(a,115,88,50),1.6,C.cream);}
   if(i%2===0){const g=subframe(mesh,item,f,Math.cos(a)*125,Math.sin(a)*101,a+Math.PI/2);panel(g,0,18,-.8,11,19,C.iron);panel(g,0,28,-1.1,12,2,C.cream);}
   f.quad(p(a,130,105,69),p(a,86,62,75),p(b,86,62,75),p(b,130,105,69),i%3?'#c4cfbd':'#aebdac');
   rod(f,p(a,129,104,69.5),p(a,86,62,75.5),.8,C.iron);rod(f,p(a,126,100,53),p(a,130,105,69),1.2,C.cream);
   if(i%2===0){rod(f,p(a,124,98,7),p(a,124,98,67),2.1,C.cream);rod(f,p(a,124,98,30),p(b,124,98,30),1.2,C.cream);}
  }
  for(const x of [-82,82]){f.box(x,86,0,25,16,4,C.iron);panel(f,x,86,-2.3,21,12,C.blue);word(f,'RIO',x,83,-2.6,5,15,C.cream);}
  sign(f,'MARACANA',0,20,-105,74,6);
 });}

function sambadrome(mesh,item){const f=frame(mesh,item);base(f,220,200,'#79857b');
 for(const s of [-1,1])for(let row=0;row<5;row++)f.box(s*(58+row*9),9+row*5.5,-17,9,10+row*11,150,row%2?C.concrete:C.shade);
 // Niemeyer's rising U form has a genuine opening and two separate legs.
 const archPoint=(a,r,y=0)=>[Math.cos(a)*r,78+Math.sin(a)*r+y,65];
 for(const s of [-1,1])solidBeam(mesh,f,[s*58,5,65],[s*58,78,65],10,C.ivory);
 for(let i=0;i<24;i++)solidBeam(mesh,f,archPoint(i/24*Math.PI,58),archPoint((i+1)/24*Math.PI,58),10,C.ivory);
 f.box(0,8,65,27,8,20,C.cream);f.cone(0,12,65,5,11,C.ivory,24,24);
 details(mesh,()=>{
  surface(f,-45,-95,45,90,4.2,'#7891a0');
  for(const s of [-1,1])for(let row=0;row<5;row++){const x=s*(58+row*9),y=15+row*11;for(let z=-86;z<55;z+=9)f.box(x,y,z,7,2,5,['#3f806f','#54859a','#c7ab5e'][row%3]);rod(f,[x,y+5,-91],[x,y+5,58],.7,C.iron);}
  for(const s of [-1,1])for(const z of [-82,-38,6,50]){rod(f,[s*48,6,z],[s*99,65,z],2,C.cream);f.box(s*102,72,z,5,6,13,C.ochre);rod(f,[s*102,5,z],[s*102,69,z],1.4,C.iron);}
  for(const z of [-76,-30,16])for(const s of [-1,1]){f.box(s*47,8,z,3,7,29,C.teal);rod(f,[s*46,12,z-14],[s*46,12,z+14],.8,C.cream);}
  // Shallow bowl sculpture beneath the arch, with a visible inner basin.
  for(let i=0;i<24;i++){const a=i/24*TAU,b=(i+1)/24*TAU;f.quad([Math.cos(a)*24,23,65+Math.sin(a)*24],[Math.cos(b)*24,23,65+Math.sin(b)*24],[Math.cos(b)*20,22.7,65+Math.sin(b)*20],[Math.cos(a)*20,22.7,65+Math.sin(a)*20],C.cream);f.tri([0,16,65],[Math.cos(a)*20,22.7,65+Math.sin(a)*20],[Math.cos(b)*20,22.7,65+Math.sin(b)*20],C.shade);}
  sign(f,'SAMBA RIO',0,12,-95,66,5);
 });}

function selaron(mesh,item){const f=frame(mesh,item);base(f,150,190,'#817361');
 for(let i=0;i<25;i++){const y=4+(i+1)*3,z=-88+i*6.9;f.box(0,y/2,z,81,y,6.9,C.red);for(const s of [-1,1])f.box(s*46,y/2+9,z,10,y+18,6.9,'#ab3e32');}
 for(const s of [-1,1]){f.box(s*61,45,22,23,82,94,s<0?'#bd874e':'#467e85');f.box(s*58,84,53,29,53,57,s<0?'#a8654b':'#6f8d63');}
 details(mesh,()=>{
  const tiles=['#d6b252','#4c8c96','#e1c5a0','#467c55','#aa4a35','#4265a0'];
  for(let i=0;i<25;i++){const y=4+(i+1)*3,z=-91.46+i*6.9;for(let j=0;j<13;j++){const x=-37+j*6.1;panel(f,x,y-1.6,z,5.6,2.4,tiles[(i*7+j*3+(i*j)%5)%tiles.length]);if((i+j)%5===0)panel(f,x,y-1.6,z-.2,1.5,1.2,C.iron);}for(const s of [-1,1])for(let k=0;k<3;k++){panel(f,s*46,y+5+k*4,z-.1,8,3,tiles[(i+k)%6]);}}
  for(const s of [-1,1]){hip(f,s*58,111,53,31,61,9,C.red);for(const z of [-13,13,39]){const g=subframe(mesh,item,f,s*48.9,z,-s*Math.PI/2);for(const y of [35,61,90])win(g,0,y,-.2,10,14);}for(const y of [35,61])win(f,s*61,y,-25.4,12,16);}
  for(let i=0;i<5;i++){const z=-83+i*34,y=10+i*15;for(const s of [-1,1]){f.cone(s*46,y+9,z,5,7,C.ochre,8,6);f.cone(s*46,y+16,z,8,11,C.green,7,0);}}
  word(f,'SELARON',0,18,-58.5,5,64,C.cream);word(f,'RIO DE JANEIRO',0,36,-17.1,3.7,70,C.ochre);
 });}

function lage(mesh,item){const f=frame(mesh,item);base(f,210,160,'#7d8067');
 f.box(0,45,53,190,82,34,C.stone);for(const s of [-1,1]){f.box(s*80,38,-6,31,68,100,C.stone);f.box(s*67,29,-59,55,50,26,C.stone);}f.box(0,63,-59,80,18,26,C.stone);
 details(mesh,()=>{
  f.box(0,5,-3,100,2,65,C.cream);surface(f,-45,-31,45,24,6.2,C.water,.1);
  for(let x=-78;x<=78;x+=26){archWindow(f,x,12,35.7,18,28);win(f,x,64,35.5,15,19);panel(f,x+11,47,35.2,2,74,C.cream);}
  for(const s of [-1,1]){const g=subframe(mesh,item,f,s*64.4,-6,-s*Math.PI/2);for(const x of [-34,-11,12,35])archWindow(g,x,10,-.3,16,29);for(const y of [43,67])panel(g,0,y,-.4,97,2.4,C.cream);hip(f,s*80,72,-6,35,104,15);for(const x of [s*54,s*80])archWindow(f,x,9,-72.3,17,30);}
  hip(f,0,87,53,195,40,19);hip(f,0,73,-59,88,30,14);
  pediment(f,0,88,-74,77,19,5,C.cream,C.shade);frontDisk(f,0,96,-74.5,4.5,C.iron,0,16);
  for(const s of [-1,1]){for(const z of [-51,40]){f.box(s*80,80,z,18,15,18,C.stone);f.cone(s*80,88,z,12,18,C.red,4,0);}f.box(s*80,110,40,4,8,4,C.cream);}
  for(const z of [-39,32]){rod(f,[-49,8,z],[49,8,z],1.2,C.shade);for(let x=-48;x<=48;x+=8)f.cone(x,9,z,1,7,C.cream,6,1);}
  sign(f,'PARQUE LAGE',0,66,-73,60,4.5);
 });}

function botanical(mesh,item){const f=frame(mesh,item);base(f,210,190,'#668061');
 // Glasshouse and a legible palm avenue form a single composed garden plot.
 f.box(0,24,48,98,40,67,'#477b78');
 for(const s of [-1,1])for(const z of [-65,-24,17])palm(mesh,f,s*66,z,128-(z+65)*.08);
 for(const s of [-1,1]){f.box(s*23,28,-78,11,48,14,C.stone);f.box(s*23,54,-78,15,5,18,C.cream);}f.box(0,59,-78,58,7,18,C.cream);
 details(mesh,()=>{
  const p=(a,z)=>[Math.cos(a)*49,44+Math.sin(a)*34,z];
  for(let j=0;j<12;j++)for(let i=0;i<7;i++){const a=j/12*Math.PI,b=(j+1)/12*Math.PI,z=14.5+i*9.5;f.quad(p(a,z),p(b,z),p(b,z+9.5),p(a,z+9.5),j%3?'#6caaa5':'#8fbcb0');}
  for(let i=0;i<=7;i++)for(let j=0;j<12;j++)rod(f,p(j/12*Math.PI,14.5+i*9.5),p((j+1)/12*Math.PI,14.5+i*9.5),.75,C.cream);
  for(let j=0;j<=12;j++)rod(f,p(j/12*Math.PI,14.5),p(j/12*Math.PI,81),.75,C.teal);
  for(const z of [14.2,81.8]){panel(f,0,24,z,94,36,C.glass);for(let x=-42;x<=42;x+=12){panel(f,x,25,z-.3,.8,39,C.cream);rod(f,[x,44,z],[x,44+Math.sqrt(1-(x/49)**2)*34,z],.8,C.cream);}for(const y of [14,31,44])panel(f,0,y,z-.4,96,.8,C.cream);}
  for(const s of [-1,1]){const g=subframe(mesh,item,f,s*49,48,s*Math.PI/2);for(let x=-28;x<=28;x+=9.3)win(g,x,24,-.3,7,31,C.teal);}
  pediment(f,0,63,-87.3,62,16,6,C.cream,C.shade);for(const s of [-1,1]){f.cone(s*23,7,-86,2,43,C.cream,10,2);f.cone(s*23,52,-86,3.5,3,C.cream,10,3.5);}
  surface(f,-16,-68,16,10,4.2,'#bba982');
  for(const x of [-31,31])for(const z of [-47,-8]){hedge(f,x,z,16,25);f.cone(x,8,z,5,15,C.leaf,7,0);}
  sign(f,'JARDIM BOTANICO',0,59,-87.7,54,3.4);
 });}

function squareClock(f,x,y,z,r){panel(f,x,y,z,r*2+4,r*2+4,C.cream);panel(f,x,y,z-.25,r*2,r*2,'#d7d6b9');for(let i=0;i<12;i++){const a=i/12*TAU;rod(f,[x+Math.sin(a)*r*.72,y+Math.cos(a)*r*.72,z-.5],[x+Math.sin(a)*r*.88,y+Math.cos(a)*r*.88,z-.5],.9,C.iron);}rod(f,[x,y,z-.7],[x-r*.52,y+r*.19,z-.7],1.6,C.iron);rod(f,[x,y,z-.75],[x+r*.12,y+r*.66,z-.75],1.1,C.iron);}
function central(mesh,item){const f=frame(mesh,item);base(f,220,135);
 f.box(0,32,3,208,56,100,'#b2ab88');f.box(0,110,8,60,156,62,'#a3a58a');f.box(0,198,8,48,38,50,C.stone);f.box(0,226,8,38,18,39,C.cream);
 details(mesh,()=>{
  for(const y of [11,57,67])f.box(0,y,3,212,3,104,C.cream);
  for(let x=-94;x<=94;x+=15.65){win(f,x,34,-47.4,10,26,C.shade);panel(f,x+6,35,-48,1.8,40,C.cream);}
  for(const s of [-1,1]){const g=subframe(mesh,item,f,s*104,3,s*Math.PI/2);for(const x of [-38,-19,0,19,38])win(g,x,33,-.3,11,25,C.shade);}
  for(let k=0;k<4;k++){const g=subframe(mesh,item,f,0,8,k*Math.PI/2);for(const x of [-19,-6,6,19]){panel(g,x,120,-31.4,5,113,C.blue);panel(g,x+3.3,120,-31.6,.7,113,C.cream);for(let y=67;y<=174;y+=9)panel(g,x,y,-31.9,5,.8,C.cream);}squareClock(g,0,198,-26,17);for(const x of [-15,-5,5,15])panel(g,x,226,-20.2,3,13,C.iron);}
  f.box(0,238,8,28,4,29,C.cream);f.box(0,242,8,17,4,18,C.shade);
  f.box(0,12,-53,48,15,13,C.iron);for(const x of [-17,-6,6,17])panel(f,x,12,-59.7,7,12,C.glass);
  sign(f,'CENTRAL DO BRASIL',0,61,-49.2,130,5.5);
 });}

function copa(mesh,item){const f=frame(mesh,item);base(f,240,130);
 f.box(0,68,3,220,128,98,'#c3baa0');for(const s of [-1,1])f.box(s*87,74,-5,39,140,99,'#c7bea3');f.box(0,136,4,74,13,97,C.stone);
 details(mesh,()=>{
  for(const y of [13,40,65,90,115,134])panel(f,0,y,-46.4,221,2.4,C.cream);
  for(let x=-99;x<=99;x+=18)for(const y of [25,51,76,101,125]){
   const z=Math.abs(x)>65?-55:-46.8;win(f,x,y,z,10,17,C.cream);if(y>35){f.box(x,y-9,z-2.5,15,2,5,C.cream);rod(f,[x-7,y-4,z-5],[x+7,y-4,z-5],.7,C.cream);for(const dx of [-6,-2,2,6])rod(f,[x+dx,y-8,z-5],[x+dx,y-4,z-5],.65,C.cream);}
  }
  for(const s of [-1,1]){const g=subframe(mesh,item,f,s*110,3,s*Math.PI/2);for(let x=-39;x<=39;x+=19.5)for(const y of [25,51,76,101,125])win(g,x,y,-.3,10,17,C.cream);}
  for(const x of [-98,-80,-44,-26,26,44,80,98]){const z=Math.abs(x)>65?-58:-49;f.quad([x-7,37,z],[x+7,37,z],[x+7,31,z-5],[x-7,31,z-5],C.teal);panel(f,x,30,z-5,14,3,'#366457');}
  for(const s of [-1,1]){f.box(s*87,146,-7,43,4,111,C.cream);for(let x=-17;x<=17;x+=6){f.cone(s*87+x,148,-59,1.1,6,C.cream,6,1.1);rod(f,[s*87-18,155,-59],[s*87+18,155,-59],1,C.cream);}}
  // The central curved crown is an actual shallow arch, distinct from side wings.
  for(let i=0;i<20;i++){const a=i/20*Math.PI,b=(i+1)/20*Math.PI;f.quad([Math.cos(a)*36,135+Math.sin(a)*20,-46.9],[Math.cos(b)*36,135+Math.sin(b)*20,-46.9],[Math.cos(b)*39,135+Math.sin(b)*23,-46.9],[Math.cos(a)*39,135+Math.sin(a)*23,-46.9],C.cream);}
  word(f,'COPACABANA PALACE',0,140,-47.4,4.4,65,C.iron);f.box(0,20,-56,34,3,16,C.teal);for(const x of [-14,14])f.cone(x,5,-62,1.2,14,C.cream,8,1.2);
  sign(f,'COPACABANA PALACE',0,32,-48,130,5.5,C.ochre);
 });}
const builders={'museum-of-tomorrow':tomorrow,'mam-rio':mam,'mar-rio':mar,'maracana-stadium':maracana,'sambadrome':sambadrome,'selaron-steps':selaron,'parque-lage':lage,'rio-botanical-garden':botanical,'central-do-brasil':central,'copacabana-palace':copa};
export function addRioCulture(mesh,item){const draw=builders[item.kind];if(!draw)return false;draw(mesh,item);return true;}
