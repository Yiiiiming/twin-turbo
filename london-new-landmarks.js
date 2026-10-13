/** Ten distinct London landmarks, scaled architectural interpretations for the
 * existing compact race. These additions never modify a road or old landmark.
 * All façades use local -Z. Ornamental planes have explicit depth separation.
 */
import { TRACK, trackPoint, projectTrack } from './engine.js';
import { frame, details, beam, word, frontDisk, cornice, pediment } from './london-west-end.js';
const TAU=Math.PI*2;
export const LONDON_NEW_LANDMARKS=Object.freeze([
 {kind:'tower-of-london',label:'Tower of London · White Tower',radius:143,width:240,depth:150,height:212,s:1300,side:-1},
 {kind:'national-gallery',label:'National Gallery',radius:147,width:256,depth:136,height:154,s:3000,side:1},
 {kind:'trafalgar-square',label:'Trafalgar Square · Nelson’s Column',radius:143,width:246,depth:144,height:242,s:3700,side:1},
 {kind:'st-pancras',label:'St Pancras International',radius:146,width:247,depth:150,height:265,s:4200,side:1},
 {kind:'tate-modern',label:'Tate Modern',radius:149,width:248,depth:160,height:263,s:6000,side:-1},
 {kind:'the-gherkin',label:'The Gherkin',radius:121,width:190,depth:146,height:344,s:7100,side:1},
 {kind:'the-shard',label:'The Shard',radius:119,width:200,depth:126,height:443,s:16200,side:-1},
 {kind:'battersea-power-station',label:'Battersea Power Station',radius:146,width:244,depth:153,height:248,s:10600,side:1},
 {kind:'royal-albert-hall',label:'Royal Albert Hall',radius:132,width:252,depth:202,height:187,s:13300,side:-1},
 {kind:'natural-history-museum',label:'Natural History Museum',radius:151,width:260,depth:143,height:216,s:14400,side:1},
].map(Object.freeze));
export const LONDON_NEW_REFERENCES=Object.freeze([
 'https://www.hrp.org.uk/tower-of-london/whats-on/white-tower/',
 'https://www.nationalgallery.org.uk/about-us/history/about-the-building',
 'https://www.london.gov.uk/about-us/our-building-and-squares/trafalgar-square',
 'https://stpancras-highspeed.com/st-pancras-international/heritage/',
 'https://www.tate.org.uk/visit/tate-modern',
 'https://thegherkin.com/building/',
 'https://www.the-shard.com/about/vision/',
 'https://batterseapowerstation.co.uk/about/heritage-safeguarding-our-heritage/',
 'https://www.vam.ac.uk/blog/news/designing-the-dome-of-the-royal-albert-hall',
 'https://www.nhm.ac.uk/discover/alfred-waterhouse-museum-building-cathedral-to-nature.html',
]);
export function londonNewLandmarkPlacements(existing=[]){
 if(TRACK.theme!=='london')return [];
 const additions=[];
 for(const meta of LONDON_NEW_LANDMARKS){let found;
  for(const shift of [0,150,-150,300,-300,450,-450,600,-600,800,-800,1000,-1000]){for(const side of [meta.side,-meta.side]){
   const s=meta.s+shift,p=trackPoint(s,side*(meta.radius+96));
   if(p.elevation>1||projectTrack(p.x,p.y).distance<TRACK.roadWidth/2+meta.radius+27)continue;
   if(TRACK.river&&Math.abs(p.y-TRACK.river.centerZ)<TRACK.river.halfWidth+meta.radius+27)continue;
   if([...existing,...additions].some(other=>Math.hypot(other.x-p.x,other.z-p.y)<other.radius+meta.radius+30))continue;
   found=Object.freeze({...meta,s,side,x:p.x,z:p.y,angle:p.angle+(side<0?Math.PI:0),elevation:0});break;
  }if(found)break;}
  if(!found)throw new Error(`No clear London plot for ${meta.kind}`);additions.push(found);
 }
 return additions;
}
const C={stone:'#a29882',ivory:'#c3b08b',shade:'#706751',glass:'#334f57',brick:'#793f35',lead:'#36584f',iron:'#273638',gold:'#b48d4d'};
function panel(f,x,y,z,w,h,color,glow=0){f.quad([x-w/2,y-h/2,z],[x-w/2,y+h/2,z],[x+w/2,y+h/2,z],[x+w/2,y-h/2,z],color,glow);}
function window(f,x,y,z,w,h,trim=C.ivory,glass=C.glass){panel(f,x,y,z,w+3,h+3,trim);panel(f,x,y,z-.6,w,h,glass);panel(f,x,y,z-1.2,.8,h,trim);panel(f,x,y+1,z-1.2,w,.8,trim);f.box(x,y-h/2-2,z-1,w+5,2,3,trim);}
function arch(f,x,b,z,w,h,trim=C.ivory,color=C.glass){const r=w/2,sy=b+h-r;panel(f,x,(b+sy)/2,z,w,sy-b,color);for(let i=0;i<16;i++){const a=i/16*Math.PI,c=(i+1)/16*Math.PI;f.tri([x,sy,z],[x+Math.cos(c)*r,sy+Math.sin(c)*r,z],[x+Math.cos(a)*r,sy+Math.sin(a)*r,z],color);f.quad([x+Math.cos(a)*r,sy+Math.sin(a)*r,z-.8],[x+Math.cos(c)*r,sy+Math.sin(c)*r,z-.8],[x+Math.cos(c)*(r+2),sy+Math.sin(c)*(r+2),z-.8],[x+Math.cos(a)*(r+2),sy+Math.sin(a)*(r+2),z-.8],trim);}for(const side of [-1,1])panel(f,x+side*(r+1),(b+sy)/2,z-.8,2,sy-b,trim);f.box(x,b-1,z-1,w+5,2,3,trim);}
function shaft(f,x,b,z,h,r=3,color=C.ivory){f.box(x,b+2,z,r*2.8,4,r*2.8,color);f.cone(x,b+4,z,r,h-10,color,16,r*.85);f.box(x,b+h-3,z,r*3,6,r*3,color);}
function dome(f,x,y,z,rx,rz,h,color,sides=40){for(let ring=0;ring<8;ring++)for(let i=0;i<sides;i++){const a=i/sides*TAU,b=(i+1)/sides*TAU,c=ring/8*Math.PI/2,d=(ring+1)/8*Math.PI/2,p=(t,u)=>[x+Math.cos(t)*Math.cos(u)*rx,y+Math.sin(u)*h,z+Math.sin(t)*Math.cos(u)*rz];f.quad(p(a,c),p(a,d),p(b,d),p(b,c),i%9?color:C.lead);}}
function roof(f,x,y,z,w,d,h,color=C.lead){const p=[[-w/2,y,-d/2],[w/2,y,-d/2],[w/2,y,d/2],[-w/2,y,d/2]].map(v=>[v[0]+x,v[1],v[2]+z]),top=[x,y+h,z];for(let i=0;i<4;i++)f.tri(p[i],top,p[(i+1)%4],color);}
function sign(f,text,y,z,w=130,h=7){f.box(0,y,z,w+8,h+6,1.5,C.iron);word(f,text,0,y-h/2,z-1,h,w,'#e9d6a7',.15);}
function base(f,w,d){f.box(0,3,0,w,6,d,'#7e8777');f.box(0,7,0,w-5,2,d-5,'#a49b80');}
function clock(mesh,f,x,y,z,r=12){frontDisk(f,x,y,z,r,C.ivory,0,32);frontDisk(f,x,y,z-.7,r-1.7,'#334e50',0,32);for(let i=0;i<12;i++){const a=i/12*TAU;panel(f,x+Math.sin(a)*(r-3),y+Math.cos(a)*(r-3),z-1.2,.9,1.6,C.gold);}beam(mesh,f.p(x,y,z-1.7),f.p(x-3,y+5,z-1.7),.8,C.gold);beam(mesh,f.p(x,y,z-1.7),f.p(x+7,y+1,z-1.7),.7,C.gold);}
function whiteTower(mesh,item){const f=frame(mesh,item);base(f,240,150);f.box(0,73,7,169,131,104,'#a09b82');f.box(-95,31,-12,35,46,110,'#838774');f.box(95,31,-12,35,46,110,'#838774');
 details(mesh,()=>{
  for(let y=18;y<137;y+=9)panel(f,0,y,-45.5,168,.55,'#76765f');cornice(f,0,139,7,175,110,C.ivory);
  for(const x of [-55,-19,19,55])for(const y of [47,85,120])arch(f,x,y-9,-47,11,23,C.ivory,'#4b5650');
  for(const x of [-78,78])for(const z of [-40,51]){f.box(x,156,z,27,43,27,C.stone);cornice(f,x,177,z,29,29,C.ivory);f.cone(x,180,z,19,23,C.lead,32,7);f.cone(x,203,z,4,9,C.gold,16,0);}
  // Alternating stone quoins and barred arrow slits emphasise the Norman keep.
  for(const x of [-80,80])for(let y=21;y<137;y+=13)panel(f,x,y,-46.2,y%2?6:9,9,'#b3a889');
  for(const x of [-78,78])for(const y of [147,162]){panel(f,x,y,-54.2,3,11,C.iron);panel(f,x,y,-54.6,.6,11,C.ivory);}
  // One round Norman turret distinguishes the four-corner silhouette.
  f.cone(78,122,51,17,55,C.stone,32,17);f.cone(78,178,51,20,26,C.lead,32,1);
  for(const side of [-1,1]){for(let z=-59;z<=37;z+=15)f.box(side*95,58,z,9,8,13,C.stone);for(const z of [-28,9])panel(f,side*95,34,z,4,19,C.glass);}
  for(let i=0;i<8;i++)f.box(28,9+i*3,-54-i*2,33,3,24-i*2,C.stone);arch(f,28,30,-48,15,30,C.ivory,C.glass);sign(f,'WHITE TOWER',18,-61,105,6);
 });}
function gallery(mesh,item){const f=frame(mesh,item);base(f,256,136);f.box(0,48,13,246,80,102,C.stone);f.box(0,67,5,87,106,84,C.stone);
 details(mesh,()=>{
  for(const x of [-102,-75,-48,48,75,102]){arch(f,x,27,-40,17,34,C.ivory,C.glass);window(f,x,77,-40,16,13);}
  cornice(f,0,91,13,248,104,C.ivory);for(const x of [-116,-88,-60,60,88,116])f.box(x,53,-42,4,66,4,C.ivory);
  for(const x of [-25,0,25])arch(f,x,25,-39,14,42,C.ivory,C.glass);for(const x of [-36,-22,-7,7,22,36])shaft(f,x,18,-67,80,3.6);cornice(f,0,100,-55,99,33,C.ivory);pediment(f,0,106,-74,106,24,26,C.ivory,C.shade);
  f.cone(0,120,13,30,10,C.stone,32,30);dome(f,0,130,13,31,28,24,C.lead);for(let i=0;i<5;i++)f.box(0,2+i*2,-62-i*4,117+i*5,2,18,C.stone);
  for(const side of [-1,1]){f.box(side*104,104,15,41,18,54,C.stone);dome(f,side*104,113,15,23,26,18,C.lead);}
  // Central pediment relief and a fine dome seam rhythm keep the classical
  // gallery legible once the broad elevations lose their previous white glare.
  frontDisk(f,0,116,-74.8,5.5,C.gold,0,16);
  for(const x of [-23,-12,12,23]){f.tri([x-3,111,-75],[x,120-Math.abs(x)*.15,-75],[x+3,111,-75],C.ivory);panel(f,x,110,-75,8,1.4,C.shade);}
  for(const x of [-104,104])for(const y of [99,105])panel(f,x,y,-12.8,31,1,C.shade);
  sign(f,'NATIONAL GALLERY',20,-72,126,5);
 });}
function ellipsoid(f,c,r,color){for(let row=0;row<6;row++)for(let j=0;j<12;j++){const a=-Math.PI/2+row/6*Math.PI,b=-Math.PI/2+(row+1)/6*Math.PI,t=j/12*TAU,u=(j+1)/12*TAU,p=(q,k)=>[c[0]+Math.cos(q)*Math.cos(k)*r[0],c[1]+Math.sin(q)*r[1],c[2]+Math.cos(q)*Math.sin(k)*r[2]];f.quad(p(a,t),p(b,t),p(b,u),p(a,u),color);}}
function trafalgar(mesh,item){const f=frame(mesh,item);base(f,244,142);f.box(0,12,12,46,14,46,C.shade);f.box(0,29,12,33,21,33,C.stone);f.cone(0,40,12,8,170,C.stone,40,6.5);f.box(0,214,12,23,8,23,C.ivory);
 for(const x of [-77,77]){f.cone(x,8,-5,30,7,'#6d8579',40,30);f.cone(x,15,-5,27,1,'#547e85',40,27);f.cone(x,16,-5,3,18,C.stone,20,3);f.cone(x,34,-5,17,4,C.shade,32,17);}
 details(mesh,()=>{
  f.cone(0,218,12,3.8,14,'#365448',20,2.8);f.cone(0,232,12,2.5,6,'#365448',16,1);beam(mesh,f.p(-2,228,12),f.p(-7,222,12),1.5,'#365448');beam(mesh,f.p(2,228,12),f.p(6,225,12),1.5,'#365448');
  for(const x of [-30,30])for(const z of [-18,40]){f.box(x,11,z,22,7,28,C.stone);ellipsoid(f,[x,18,z],[8,6,13],'#345445');ellipsoid(f,[x,23,z-8],[6,6,6],'#294437');for(const side of [-1,1])f.box(x+side*6,13,z-10,5,4,12,'#365447');}
  for(const x of [-77,77])for(let i=0;i<10;i++){const a=i/10*TAU;beam(mesh,f.p(x,38,-5),f.p(x+Math.cos(a)*22,18,-5+Math.sin(a)*22),.5,'#c4e0d9');}
  // Bronze naval relief on the column pedestal: low waves, mast and sails.
  panel(f,0,28,-5.1,24,14,'#294c42');for(const y of [23,25])panel(f,0,y,-5.5,21,.7,'#84977a');
  panel(f,0,29,-5.7,.7,12,C.gold);f.tri([-1,34,-5.8],[-1,27,-5.8],[-9,27,-5.8],'#879a7b');f.tri([1,34,-5.8],[1,27,-5.8],[8,29,-5.8],'#637f65');
  sign(f,'TRAFALGAR SQUARE',12,-67,130,6);
 });}
function stPancras(mesh,item){const f=frame(mesh,item),brick='#793f35',trim='#b29465';base(f,246,150);f.box(-20,61,0,197,106,126,brick);f.box(81,111,-15,48,205,54,brick);
 details(mesh,()=>{
  for(const y of [29,61,94])for(let x=-97;x<=48;x+=29)arch(f,x,y-10,-64,16,26,trim,C.glass);
  for(const y of [45,78,112])f.box(-20,y,-65,200,3,3,trim);for(const x of [-112,-68,-24,20,57]){f.box(x,66,-67,3,109,4,trim);roof(f,x,117,-51,24,32,28,C.lead);}
  roof(f,-23,116,11,195,122,36,C.lead);for(const x of [-81,-36,9]){f.box(x,131,-33,16,23,21,brick);roof(f,x,142,-33,21,25,16,C.lead);window(f,x,132,-45,9,13,trim);}
  for(const y of [70,105,140,174])for(const x of [68,94])arch(f,x,y-8,-43,11,24,trim,C.glass);cornice(f,81,208,-15,56,60,trim);clock(mesh,f,81,193,-45,12);
  roof(f,81,211,-15,62,65,49,'#35564e');for(const x of [56,106])for(const z of [-40,10]){f.box(x,218,z,5,16,5,trim);roof(f,x,226,z,9,9,23,C.lead);}
  for(const side of [-1,1]){const q=f.p(-20+side*99,0,0),sf=frame(mesh,{...item,x:q[0],z:q[2],angle:item.angle+side*Math.PI/2});for(const y of [29,61,94])for(const x of [-42,-14,14,42])arch(sf,x,y-10,-1,15,26,trim,C.glass);}
  const rear=f.p(-20,0,64),rf=frame(mesh,{...item,x:rear[0],z:rear[2],angle:item.angle+Math.PI});for(const y of [29,61,94])for(let x=-78;x<=78;x+=26)arch(rf,x,y-10,-1,15,26,trim,C.glass);
  // Polychrome Gothic spandrels and deep belfry louvres separate the clock
  // tower from the red-brick hotel wings without adding heavy solid ornaments.
  for(const x of [-97,-68,-39,-10,19,48])for(const y of [46,79,110])f.quad([x-3,y,-67.4],[x,y+3,-67.4],[x+3,y,-67.4],[x,y-3,-67.4],'#42605b');
  for(const x of [68,94])for(const y of [165,169,173,177])panel(f,x,y,-45,8,1.3,'#684634');
  sign(f,'ST PANCRAS',18,-72,113,6);
 });}
function tate(mesh,item){const f=frame(mesh,item),brick='#78543e';base(f,248,160);f.box(-17,52,1,205,88,112,brick);f.box(-12,139,-27,26,247,29,brick);f.box(89,57,21,56,98,96,'#694a37');
 details(mesh,()=>{
  for(const y of [23,49,76])for(let x=-109;x<=62;x+=19)window(f,x,y,-56.8,9,19,'#97784f','#3c5556');for(let y=101;y<259;y+=10)panel(f,-12,y,-42.3,25,.6,'#876b48');
  f.box(-17,98,0,212,7,116,C.shade);f.box(-17,106,0,207,9,110,'#4d706b');f.box(-12,262,-27,29,3,32,C.shade);
  for(const x of [-21,-12,-3])panel(f,x,174,-42.8,1,159,'#a98c60');
  const low=[[57,108,-13],[117,108,-13],[117,108,68],[57,108,68]],high=[[83,189,11],[108,189,11],[108,189,50],[83,189,50]];
  for(let i=0;i<4;i++)f.quad(low[i],high[i],high[(i+1)%4],low[(i+1)%4],'#79543c');f.quad(...high,'#8d6d47');for(let y=117;y<184;y+=7){const t=(y-108)/81,x=57+26*t,w=60-35*t;panel(f,x+w/2,y,-13+24*t-.3,w,.8,'#a18962');}
  // Deep turbine-hall doors and chimney vents make the former power station
  // read as an industrial building, not another pale civic block.
  for(const x of [-82,-44,13,51]){panel(f,x,18,-57.7,12,19,'#263d3a');for(const dx of [-3,3])panel(f,x+dx,18,-58,1,17,'#75867a');}
  for(const y of [243,247,251])panel(f,-12,y,-42.8,22,1.7,'#3a4237');
  sign(f,'TATE MODERN',17,-64,112,8);
 });}
function gherkin(mesh,item){const f=frame(mesh,item);base(f,190,146);const profile=[[10,55],[45,68],[88,76],[136,79],[190,73],[239,61],[278,45],[307,29],[329,12],[341,.5]];
 if(mesh.colliders)for(let i=0;i<profile.length-1;i++){const [bottom,r]=profile[i],[top,rr]=profile[i+1];mesh.colliders.push({id:`prop-${mesh.colliders.length}`,type:'circle',x:item.x,y:item.z,radius:Math.max(r,rr),minHeight:(item.elevation||0)+bottom,maxHeight:(item.elevation||0)+top});}
 details(mesh,()=>{for(let ring=0;ring<profile.length-1;ring++)for(let i=0;i<40;i++){const a=i/40*TAU,b=(i+1)/40*TAU,[y,r]=profile[ring],[yy,rr]=profile[ring+1],tw=ring*.035,p=(t,rad,h)=>[Math.cos(t)*rad,h,Math.sin(t)*rad];f.quad(p(a+tw,r,y),p(a+tw+.035,rr,yy),p(b+tw+.035,rr,yy),p(b+tw,r,y),(i+ring*3)%10<2?'#294958':i%3?'#4e7480':'#799da2');if(i%2===0){beam(mesh,f.p(...p(a+tw,r+.4,y)),f.p(...p(b+tw+.035,rr+.4,yy)),.65,'#8fa7a0');beam(mesh,f.p(...p(b+tw,r+.4,y)),f.p(...p(a+tw+.035,rr+.4,yy)),.65,'#8fa7a0');}}
  // A radial glazed entrance canopy and dark circular floor bands reinforce
  // the tower's curved shell, contrasting with the neighbouring Shard's blades.
  for(const x of [-42,-14,14,42])f.tri([x-13,28,-60],[x+13,28,-60],[x,38,-72],'#4c777a');
  for(let ring=2;ring<profile.length-2;ring++){const [y,r]=profile[ring],[yy,rr]=profile[ring+1],t=1.1/(yy-y),phase=ring*.035;for(let i=0;i<40;i++){const a=i/40*TAU+phase,b=(i+1)/40*TAU+phase,p=(angle,upper)=>[Math.cos(angle+(upper?.035*t:0))*(r+(upper?(rr-r)*t:0)+.35),y+(upper?1.1:0),Math.sin(angle+(upper?.035*t:0))*(r+(upper?(rr-r)*t:0)+.35)];f.quad(p(a,false),p(a,true),p(b,true),p(b,false),'#385b62');}}
  sign(f,'THE GHERKIN',18,-73,105,7);for(const x of [-42,-14,14,42])f.box(x,20,-57,16,24,2,'#244653');
 });}
function shard(mesh,item){const f=frame(mesh,item);base(f,200,126);f.box(0,27,1,169,44,102,'#516c6c');
 const sectors=8;for(let i=0;i<sectors;i++){const a=i/sectors*TAU,b=(i+1)/sectors*TAU,baseR=72,top=404+(i%3)*18,p=(t,r,y)=>[Math.cos(t)*r,y,Math.sin(t)*r*.64];const aa=p(a,baseR,49),bb=p(b,baseR,49),tip=p((a+b)/2,4,top);f.tri(aa,tip,bb,i%3===0?'#809fa3':i%2?'#4e7584':'#345463');details(mesh,()=>{beam(mesh,f.p(...aa),f.p(...tip),1.1,'#9cb5ae');for(let y=65;y<top-22;y+=11){const t=(y-49)/(top-49),q=aa.map((v,k)=>v+(tip[k]-v)*t),r=bb.map((v,k)=>v+(tip[k]-v)*t);beam(mesh,f.p(...q),f.p(...r),.5,'#7b9c9e');}});}
  // Paired sky-lobby bands are attached to the tapered glass faces; the
  // broken crown remains transparent between its separate pointed blades.
  details(mesh,()=>{for(let i=0;i<sectors;i++){const a=i/sectors*TAU,b=(i+1)/sectors*TAU,top=404+(i%3)*18,aa=[Math.cos(a)*72,49,Math.sin(a)*72*.64],bb=[Math.cos(b)*72,49,Math.sin(b)*72*.64],tip=[Math.cos((a+b)/2)*4,top,Math.sin((a+b)/2)*4];for(const y of [257,264]){const p=(v,h)=>v.map((n,k)=>{const q=n+(tip[k]-n)*(h-49)/(top-49);return k===1?q:q*1.006;});f.quad(p(aa,y),p(bb,y),p(bb,y+1.3),p(aa,y+1.3),'#34515b');}}});
 // Closed base hull is the drivable-height collision footprint; taper above is decorative.
 details(mesh,()=>{for(const x of [-63,-42,-21,0,21,42,63])window(f,x,28,-51,14,20,'#879f92','#466b77');sign(f,'THE SHARD',15,-60,91,7);});}
function battersea(mesh,item){const f=frame(mesh,item),brick='#84543f';base(f,244,153);f.box(0,64,3,229,113,131,brick);f.box(0,135,7,143,41,112,brick);
 for(const x of [-93,93])for(const z of [-50,54]){f.box(x,124,z,32,50,32,brick);f.cone(x,149,z,12,89,'#ada78c',32,9.2);f.cone(x,238,z,11,9,C.ivory,32,11);}
 details(mesh,()=>{
  for(let x=-101;x<=101;x+=18)for(const y of [29,65,101])window(f,x,y,-63,9,25,'#a2835a','#374d50');for(const x of [-114,-78,-42,42,78,114])f.box(x,64,-65,3,113,4,'#957044');
  for(const y of [119,155])cornice(f,0,y,4,y===119?231:147,y===119?134:114,'#937548');
  for(const x of [-93,93])for(const z of [-50,54])for(let y=157;y<238;y+=13)f.cone(x,y,z,12-(y-149)/89*2.8,1,'#837c60',32,12-(y-149)/89*2.8);
  // Four soot-darkened, vertically fluted chimney shafts retain their warm
  // concrete identity rather than reading as four bright white tubes.
  for(const x of [-93,93])for(const z of [-50,54])for(const a of [-2.05,-1.57,-1.09]){
   const p=(angle,y)=>[x+Math.cos(angle)*(12-(y-149)/89*2.8+.12),y,z+Math.sin(angle)*(12-(y-149)/89*2.8+.12)];
   f.quad(p(a,157),p(a+.035,157),p(a+.035,236),p(a,236),'#766b52');
  }
  for(const x of [-93,93])panel(f,x,29,-64.9,17,30,'#384b45');
  f.box(0,137,-54,100,26,2,C.glass);for(let x=-45;x<=45;x+=10)f.box(x,137,-56,1.2,27,1,C.shade);sign(f,'BATTERSEA POWER STATION',19,-70,179,6);
 });}
function royalAlbert(mesh,item){const f=frame(mesh,item),brick='#824535',rx=120,rz=91;f.cone(0,8,0,91,111,brick,64,91);const p=(a,y,r=1)=>[Math.cos(a)*rx*r,y,Math.sin(a)*rz*r];
 for(let i=0;i<64;i++){const a=i/64*TAU,b=(i+1)/64*TAU;f.quad(p(a,8),p(a,126),p(b,126),p(b,8),brick);if(mesh.colliders){const q=p(a,0),r=p(b,0),center=f.p((q[0]+r[0])/2,0,(q[2]+r[2])/2);mesh.colliders.push({id:`prop-${mesh.colliders.length}`,type:'box',x:center[0],y:center[2],halfWidth:Math.hypot(r[0]-q[0],r[2]-q[2])/2,halfDepth:2,angle:item.angle+Math.atan2(r[2]-q[2],r[0]-q[0]),minHeight:8,maxHeight:126});}}
 details(mesh,()=>{
  for(const y of [17,57,102,125])for(let i=0;i<64;i++)beam(mesh,f.p(...p(i/64*TAU,y,1.015)),f.p(...p((i+1)/64*TAU,y,1.015)),3,C.stone);
  for(let i=0;i<32;i++){const a=i/32*TAU,q=p(a,0,1.012),local=frame(mesh,{...item,x:f.p(...q)[0],z:f.p(...q)[2],angle:item.angle+a+Math.PI/2});arch(local,0,28,-.5,13,24,C.ivory,C.glass);arch(local,0,68,-.5,13,27,C.ivory,C.glass);panel(local,0,115,-1,16,10,'#ad915a');for(const x of [-4,4])frontDisk(local,x,115,-2,2,'#785236',0,10);
   // Small alternating robed figures suggest the continuous arts mosaic.
   local.tri([-3,112,-2.2],[0,119,-2.2],[3,112,-2.2],i%2?'#566e54':'#7f4838');panel(local,0,112,-2.3,7,1,C.ivory);}
  dome(f,0,128,0,122,93,57,'#3f6258',48);for(let i=0;i<24;i++){const a=i/24*TAU;for(let j=0;j<6;j++){const b=j/6*Math.PI/2,c=(j+1)/6*Math.PI/2,p=q=>[Math.cos(a)*Math.cos(q)*122,128+Math.sin(q)*58,Math.sin(a)*Math.cos(q)*93];beam(mesh,f.p(...p(b)),f.p(...p(c)),.8,'#799286');}}
  sign(f,'ROYAL ALBERT HALL',21,-97,129,6);
 });}
function naturalHistory(mesh,item){const f=frame(mesh,item),sand='#a48759',blue='#47616a';base(f,260,143);f.box(0,49,11,249,82,104,sand);f.box(0,78,-5,65,133,117,sand);
 for(const x of [-50,50])f.box(x,99,-9,38,182,55,sand);
 details(mesh,()=>{
  for(let y=19;y<182;y+=13){for(const x of [-50,50])f.box(x,y,-9,40,3,57,blue);if(y<88)f.box(0,y,11,250,3,106,blue);}
  for(const x of [-111,-84,84,111])for(const y of [30,66])arch(f,x,y-9,-43,15,25,C.ivory,C.glass);
  for(const x of [-50,50]){for(const y of [49,85,124,164])arch(f,x,y-9,-38,16,29,C.ivory,C.glass);cornice(f,x,187,-9,44,61,C.stone);roof(f,x,191,-9,49,65,24,blue);}
  // Deep concentric Romanesque entrance and the central rose window.
  arch(f,0,11,-65,42,57,blue,'#293f40');for(const x of [-29,-24,24,29])shaft(f,x,11,-67,45,2.2,C.ivory);
  for(let ring=0;ring<3;ring++)for(let i=0;i<20;i++){const a=i/20*Math.PI,b=(i+1)/20*Math.PI,r=23+ring*4;f.quad([Math.cos(a)*r,43+Math.sin(a)*r,-67-ring*.7],[Math.cos(b)*r,43+Math.sin(b)*r,-67-ring*.7],[Math.cos(b)*(r+2),43+Math.sin(b)*(r+2),-67-ring*.7],[Math.cos(a)*(r+2),43+Math.sin(a)*(r+2),-67-ring*.7],ring%2?blue:C.ivory);}
  frontDisk(f,0,102,-66,22,C.ivory);frontDisk(f,0,102,-66.7,18,C.glass);for(let i=0;i<12;i++){const a=i/12*TAU;beam(mesh,f.p(0,102,-68),f.p(Math.sin(a)*18,102+Math.cos(a)*18,-68),1.1,C.ivory);}frontDisk(f,0,102,-68.7,5,C.ivory,0,20);
  for(const x of [-112,-82,82,112]){roof(f,x,96,14,39,98,23,blue);f.box(x,86,-44,5,18,5,C.ivory);}
  // Terracotta creature reliefs belong to the museum's Romanesque frieze.
  // Broad wing/body silhouettes stay readable instead of tiny extra boxes.
  for(const x of [-110,-82,82,110]){panel(f,x,82,-47,17,10,'#8b6b42');f.tri([x-7,81,-47.4],[x,85,-47.4],[x+7,81,-47.4],'#c0a06d');f.tri([x-2,79,-47.6],[x,86,-47.6],[x+2,79,-47.6],'#47605d');}
  for(const x of [-50,50])for(const y of [68,105,143,180])panel(f,x,y,-38.7,25,1.2,'#bf9c60');
  sign(f,'NATURAL HISTORY MUSEUM',14,-72,168,6);
 });}
export function addLondonNewLandmark(mesh,item){({'tower-of-london':whiteTower,'national-gallery':gallery,'trafalgar-square':trafalgar,'st-pancras':stPancras,'tate-modern':tate,'the-gherkin':gherkin,'the-shard':shard,'battersea-power-station':battersea,'royal-albert-hall':royalAlbert,'natural-history-museum':naturalHistory}[item.kind])?.(mesh,item);}
