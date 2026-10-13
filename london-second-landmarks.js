/** Ten further London landmarks, deliberately varied in material and silhouette.
 * Architectural interpretations, not measured replicas. Local -Z is the street
 * front. Primary references are carried by each model below. All recessed
 * glazing and applied ornament have separated depths; only solid masses collide.
 */
import { frame, details, beam, word, frontDisk, pediment } from './london-west-end.js';
const TAU=Math.PI*2;
export const LONDON_SECOND_LANDMARKS=Object.freeze([
 {kind:'leadenhall-market',label:'Leadenhall Market',radius:145,width:248,depth:142,height:164,source:'https://historicengland.org.uk/listing/the-list/list-entry/1286182'},
 {kind:'liberty-london',label:'Liberty London',radius:144,width:248,depth:142,height:178,source:'https://www.libertylondon.com/us/features/culture/the-ship-that-docked.html'},
 {kind:'st-jamess-palace',label:"St James’s Palace",radius:140,width:238,depth:132,height:188,source:'https://www.rct.uk/visit/st-jamess-palace/highlights-of-st-jamess-palace'},
 {kind:'royal-courts-of-justice',label:'Royal Courts of Justice',radius:146,width:250,depth:144,height:230,source:'https://historicengland.org.uk/listing/the-list/list-entry/1264258'},
 {kind:'royal-exchange',label:'Royal Exchange',radius:143,width:242,depth:145,height:162,source:'https://historicengland.org.uk/local/locations/the-city-of-london/'},
 {kind:'victoria-and-albert-museum',label:'Victoria and Albert Museum',radius:148,width:255,depth:142,height:204,source:'https://www.vam.ac.uk/blog/futureplan/from-garden-to-____-a-brief-history-of-the-exhibition-road-site'},
 {kind:'westminster-cathedral',label:'Westminster Cathedral',radius:145,width:244,depth:142,height:250,source:'https://westminstercathedral.org.uk/the-cathedral/an-architectural-gem/'},
 {kind:'old-bailey',label:'Old Bailey',radius:142,width:242,depth:138,height:236,source:'https://www.cityoflondon.gov.uk/about-us/law-historic-governance/central-criminal-court'},
 {kind:'somerset-house',label:'Somerset House',radius:147,width:252,depth:144,height:169,source:'https://www.somersethouse.org.uk/about-us/history'},
 {kind:'kings-cross-station',label:'King’s Cross Station',radius:145,width:248,depth:142,height:189,source:'https://www.networkrail.co.uk/who-we-are/our-history/iconic-infrastructure/the-history-of-london-kings-cross-station/'},
].map(Object.freeze));
const C=Object.freeze({stone:'#a29882',trim:'#c3b08b',shade:'#61594e',slate:'#303e47',patina:'#36584f',brick:'#793f35',ochre:'#84543f',iron:'#273638',gold:'#b48d4d',glass:'#29464b'});
function panel(f,x,y,z,w,h,color,glow=0){f.quad([x-w/2,y-h/2,z],[x-w/2,y+h/2,z],[x+w/2,y+h/2,z],[x+w/2,y-h/2,z],color,glow);}
function stroke(f,a,b,z,width,color){const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),ox=-dy/length*width/2,oy=dx/length*width/2;f.quad([a[0]-ox,a[1]-oy,z],[a[0]+ox,a[1]+oy,z],[b[0]+ox,b[1]+oy,z],[b[0]-ox,b[1]-oy,z],color);}
function window(f,x,y,z,w,h,trim=C.trim,glass=C.glass){panel(f,x,y,z,w+3,h+3,trim);panel(f,x,y,z-.5,w,h,glass);panel(f,x,y,z-1,.8,h,trim);panel(f,x,y+1,z-1,w,.8,trim);f.box(x,y-h/2-1.7,z-.5,w+5,2,3,trim);}
function arch(f,x,b,z,w,h,trim=C.trim,glass=C.glass,segments=12){const r=w/2,sy=b+h-r;panel(f,x,(b+sy)/2,z,w,sy-b,glass);for(let i=0;i<segments;i++){const a=i/segments*Math.PI,t=(i+1)/segments*Math.PI;f.tri([x,sy,z],[x+Math.cos(t)*r,sy+Math.sin(t)*r,z],[x+Math.cos(a)*r,sy+Math.sin(a)*r,z],glass);f.quad([x+Math.cos(a)*r,sy+Math.sin(a)*r,z-.5],[x+Math.cos(t)*r,sy+Math.sin(t)*r,z-.5],[x+Math.cos(t)*(r+2.4),sy+Math.sin(t)*(r+2.4),z-.5],[x+Math.cos(a)*(r+2.4),sy+Math.sin(a)*(r+2.4),z-.5],trim);}for(const side of [-1,1])panel(f,x+side*(r+1.2),(b+sy)/2,z-.5,2.4,sy-b,trim);panel(f,x,b+h*.4,z-1,1,h*.75,trim);panel(f,x,sy,z-1,w,1,trim);}
function pointed(f,x,b,z,w,h,trim=C.trim,glass=C.glass){const spring=b+h*.64;panel(f,x,(b+spring)/2,z,w,spring-b,glass);f.tri([x-w/2,spring,z],[x,b+h,z],[x+w/2,spring,z],glass);for(const side of [-1,1]){stroke(f,[x+side*(w/2+1),b],[x+side*(w/2+1),spring],z-.6,2,trim);stroke(f,[x+side*(w/2+1),spring],[x,b+h+2],z-.6,2,trim);}panel(f,x,b+h*.35,z-1,1,h*.66,trim);stroke(f,[x,b+h*.58],[x-w*.22,b+h*.8],z-1,.9,trim);stroke(f,[x,b+h*.58],[x+w*.22,b+h*.8],z-1,.9,trim);}
function cornice(f,x,y,z,w,d,trim=C.trim){f.box(x,y,z,w,3,d,trim);f.box(x,y+2.5,z,w+4,2,d+4,trim);}
function base(f,w,d){f.box(0,2,0,w,4,d,C.shade);f.box(0,4.6,0,w-4,1.2,d-4,C.stone);}
function roof(f,x,y,z,w,d,h,color=C.slate,frontColor=color){const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],q=[x-w/2,y,z+d/2],u=[x,y+h,z-d/2],v=[x,y+h,z+d/2];f.tri(a,u,b,frontColor);f.tri(q,c,v,color);f.quad(a,q,v,u,color);f.quad(u,v,c,b,color);}
function hip(f,x,y,z,w,d,h,color=C.slate){const p=[[-w/2,y,-d/2],[w/2,y,-d/2],[w/2,y,d/2],[-w/2,y,d/2]].map(a=>[a[0]+x,a[1],a[2]+z]);for(let i=0;i<4;i++)f.tri(p[i],[x,y+h,z],p[(i+1)%4],color);}
function dome(f,x,y,z,r,h,color=C.patina){for(let j=0;j<6;j++)for(let i=0;i<24;i++){const a=i/24*TAU,b=(i+1)/24*TAU,c=j/6*Math.PI/2,d=(j+1)/6*Math.PI/2,p=(t,u)=>[x+Math.cos(t)*Math.cos(u)*r,y+Math.sin(u)*h,z+Math.sin(t)*Math.cos(u)*r];f.quad(p(a,c),p(a,d),p(b,d),p(b,c),i%6===0?'#496c5d':color);}}
function clock(f,x,y,z,r){frontDisk(f,x,y,z,r,C.gold,0,24);frontDisk(f,x,y,z-.5,r-1.3,C.iron,0,24);for(let i=0;i<12;i++){const a=i/12*TAU;stroke(f,[x+Math.sin(a)*(r-2),y+Math.cos(a)*(r-2)],[x+Math.sin(a)*(r-3.5),y+Math.cos(a)*(r-3.5)],z-1,.7,C.trim);}stroke(f,[x,y],[x-2,y+r*.49],z-1.5,.9,C.trim);stroke(f,[x,y],[x+r*.55,y+1],z-1.5,.8,C.trim);}
function sign(f,text,x,y,z,w,h=6){panel(f,x,y,z,w+8,h+6,C.iron);word(f,text,x,y-h/2,z-.6,h,w,C.trim,.08);}
function bands(f,x,z,w,low,high,step=9,color=C.shade){for(let y=low;y<high;y+=step)panel(f,x,y,z,w,.6,color);}
function sideWindows(mesh,item,x,z,width,ys,color=C.trim){const p=frame(mesh,item).p(x,0,z),f=frame(mesh,{...item,x:p[0],z:p[2],angle:(item.angle||0)+(x>0?Math.PI/2:-Math.PI/2)});for(const y of ys)for(const u of [-width*.32,0,width*.32])window(f,u,y,-.7,12,19,color);}
function shaft(f,x,b,z,h,r=3,color=C.trim){f.box(x,b+1.5,z,r*2.8,3,r*2.8,color);f.cone(x,b+3,z,r,h-8,color,12,r*.8);f.box(x,b+h-2,z,r*3.2,4,r*3.2,color);}
function statue(f,x,b,z,h,color=C.trim){f.cone(x,b,z,h*.14,h*.7,color,8,h*.075);f.cone(x,b+h*.72,z,h*.1,h*.21,color,8,h*.08);}

function leadenhall(mesh,item){const f=frame(mesh,item),red='#683831',green='#304e48',ochre='#a9834b';base(f,248,142);
 for(const side of [-1,1]){f.box(side*85,54,5,68,98,122,red);f.box(side*39,47,-32,9,84,45,green);}f.box(0,99,29,165,19,62,red);
 details(mesh,()=>{
  for(const side of [-1,1]){const x=side*85;cornice(f,x,105,5,72,122,ochre);roof(f,x,108,6,74,123,22);for(const u of [-19,19]){arch(f,x+u,9,-57,24,38,ochre);window(f,x+u,74,-57,22,29,ochre);}panel(f,x,49,-58,67,5,ochre);for(const u of [-30,0,30])panel(f,x+u,59,-59,2,88,ochre);}
  // The vaulted glass arcade stays open below the roof, framed in green iron.
  const spring=91,r=41,front=-57,back=66;
  for(let i=0;i<20;i++){const a=i/20*Math.PI,b=(i+1)/20*Math.PI;f.quad([Math.cos(a)*r,spring+Math.sin(a)*r,front],[Math.cos(b)*r,spring+Math.sin(b)*r,front],[Math.cos(b)*r,spring+Math.sin(b)*r,back],[Math.cos(a)*r,spring+Math.sin(a)*r,back],i%4?'#536e70':green);}
  for(const z of [front,-17,23,back])for(let i=0;i<12;i++){const a=i/12*Math.PI,b=(i+1)/12*Math.PI;beam(mesh,f.p(Math.cos(a)*(r+.8),spring+Math.sin(a)*(r+.8),z),f.p(Math.cos(b)*(r+.8),spring+Math.sin(b)*(r+.8),z),1.3,green);}
  for(const x of [-40,40]){f.box(x,49,-59,4,88,4,green);f.box(x,51,-61,2,80,2,ochre);for(const z of [-20,20,60])f.box(x,47,z,3,84,3,green);}
  arch(f,0,72,-59,78,59,ochre,green);arch(f,0,76,-60,69,49,green,'#506768');clock(f,0,119,-61,9);sign(f,'LEADENHALL MARKET',0,66,-60,108,5.7);
  pediment(f,0,133,-62,100,22,16,red,ochre);f.cone(0,155,-53,3,8,C.gold,8,0);
  for(const x of [-20,20]){panel(f,x,21,62,26,31,'#263e3e');panel(f,x,39,61.5,30,5,ochre);}bands(f,85,-56.5,64,16,96,9,'#855249');bands(f,-85,-56.5,64,16,96,9,'#855249');
 });}

function liberty(mesh,item){const f=frame(mesh,item),timber='#332c28',plaster='#b6aa8f',roofColor='#343c40';base(f,248,142);f.box(0,65,4,238,120,118,plaster);
 details(mesh,()=>{
  roof(f,0,125,3,242,122,29,roofColor);for(const x of [-96,-48,0,48,96]){const peak=x===0?174:157;roof(f,x,123,-29,47,62,peak-123,roofColor,plaster);stroke(f,[x-24,121],[x,peak],-60.7,3,timber);stroke(f,[x,peak],[x+24,121],-60.7,3,timber);panel(f,x,(peak+123)/2,-60.7,2.6,peak-123,timber);for(const u of [-10,10])stroke(f,[x+u,123],[x,peak-9],-60.7,2,timber);}
  for(const y of [12,41,80,119])panel(f,0,y,-56.3,238,4,timber);
  for(let x=-116;x<=116;x+=29)panel(f,x,64,-57,3.7,112,timber);
  for(const x of [-101.5,-72.5,-43.5,-14.5,14.5,43.5,72.5,101.5]){for(const y of [59,99]){window(f,x,y,-57.5,20,25,timber,'#3e5251');stroke(f,[x-10,y-12],[x+10,y+12],-59,1.3,timber);}arch(f,x,9,-57.5,21,26,timber,'#3c4846');}
  for(const x of [-86,-29,29,86]){f.box(x,151,32,8,35,9,C.brick);f.box(x,170,32,11,3,12,C.shade);}
  for(const side of [-1,1]){const p=f.p(side*119,0,0),sf=frame(mesh,{...item,x:p[0],z:p[2],angle:(item.angle||0)+side*Math.PI/2});for(const y of [41,80,119])panel(sf,0,y,-.7,117,3,timber);for(const x of [-47,-23,0,23,47]){panel(sf,x,66,-1,3,112,timber);for(const y of [59,99])window(sf,x,y,-1.5,15,25,timber,'#405351');}}
  sign(f,'LIBERTY',0,30,-61,76,9);f.box(0,18,-62,86,2,12,C.patina);for(const x of [-37,37])f.box(x,12,-67,2,12,2,C.gold);
 });}

function stJames(mesh,item){const f=frame(mesh,item),brick='#743d34',trim='#ad9570';base(f,238,132);f.box(0,59,12,230,108,98,brick);f.box(0,94,-22,77,177,57,brick);for(const x of [-45,45])f.box(x,90,-24,20,170,65,brick);
 details(mesh,()=>{
  for(const x of [-90,90])roof(f,x,113,13,53,101,25);for(const x of [-45,45]){cornice(f,x,174,-24,24,67,trim);for(const u of [-7,7])for(const z of [-49,1])f.box(x+u,183,z,7,10,9,brick);for(const y of [46,87,133])window(f,x,y,-57,8,19,trim);}
  for(const y of [34,73,103])for(const x of [-99,-73,73,99])window(f,x,y,-38,14,23,trim);for(const x of [-112,-60,60,112])panel(f,x,64,-39,3,100,trim);
  arch(f,0,6,-51,40,58,trim,'#2d3435');for(const x of [-10,10])panel(f,x,30,-52,1,35,trim);panel(f,0,76,-51,49,6,trim);window(f,0,103,-51,23,31,trim);clock(f,0,153,-51.5,16);cornice(f,0,179,-22,79,58,trim);
  for(const x of [-31,-15,0,15,31])f.box(x,184,-48,8,8,9,brick);for(const side of [-1,1]){sideWindows(mesh,item,side*116,10,86,[37,75],trim);f.box(side*100,133,33,8,37,8,brick);f.box(side*100,154,33,12,5,12,trim);}
  for(let y=18;y<174;y+=9)panel(f,0,y,-50.6,72,.7,'#935644');bands(f,-90,-37.6,51,13,108,9,'#935644');bands(f,90,-37.6,51,13,108,9,'#935644');sign(f,'ST JAMES PALACE',0,66,-53,102,5.8);
 });}

function courts(mesh,item){const f=frame(mesh,item),stone='#968b75',trim='#b6a88a';base(f,250,144);f.box(7,65,9,215,120,111,stone);f.box(-95,92,-8,40,174,66,stone);f.box(24,88,-22,77,166,70,stone);
 details(mesh,()=>{
  roof(f,9,126,10,211,110,45);roof(f,24,172,-22,85,72,38);f.box(-95,188,-8,43,14,69,trim);hip(f,-95,195,-8,48,75,32);f.cone(-95,227,-8,1.5,3,C.gold,8,0);
  for(const x of [-110,-80])for(const z of [-36,20]){f.box(x,175,z,5,26,5,trim);hip(f,x,188,z,9,9,26);}
  for(const x of [-48,-17,67,99]){pointed(f,x,22,-48,18,43,trim);pointed(f,x,79,-48,16,35,trim);f.box(x,125,-44,5,18,5,trim);hip(f,x,134,-44,8,9,24);}
  for(const x of [-105,-85])for(const y of [50,89,131,166])pointed(f,x,y-14,-42,10,29,trim);
  pointed(f,24,9,-58,54,96,trim,'#243b40');pointed(f,24,119,-58,36,44,trim);frontDisk(f,24,145,-59.4,9,trim,0,24);frontDisk(f,24,145,-60,6.5,C.glass,0,24);
  for(const x of [-14,62]){f.box(x,91,-58,6,169,8,trim);hip(f,x,176,-58,12,13,36);for(const y of [55,109,151])f.box(x,y,-59,11,3,12,trim);}
  for(const x of [-6,54]){pointed(f,x,38,-62,8,29,trim);statue(f,x,43,-63,13,C.stone);}for(let x=-66;x<120;x+=17)f.box(x,128,64,6,9,8,trim);
  bands(f,16,-47.4,211,19,122,11,'#746e61');sign(f,'ROYAL COURTS OF JUSTICE',24,108,-60,166,5.4);sideWindows(mesh,item,116,10,91,[43,87],trim);
 });}

function exchange(mesh,item){const f=frame(mesh,item);base(f,242,145);f.box(0,54,20,232,98,96,C.stone);f.box(0,102,42,43,97,41,C.stone);
 details(mesh,()=>{
  for(const x of [-98,-70,-42,-14,14,42,70,98])shaft(f,x,15,-54,85,4.4);cornice(f,0,102,-45,231,44);pediment(f,0,111,-69,234,40,38,C.trim,C.shade);
  // Raised pediment figures and fluted shafts distinguish the grand portico.
  for(const x of [-60,-40,-20,0,20,40,60]){const h=20-Math.abs(x)*.15;statue(f,x,115,-69.5,h,C.stone);}for(const x of [-98,-70,-42,-14,14,42,70,98])for(const u of [-1.8,0,1.8])panel(f,x+u,57,-58.2,.45,63,C.shade);
  for(const x of [-78,-39,0,39,78])arch(f,x,13,-29,25,53);cornice(f,0,104,20,235,98);roof(f,0,108,23,236,94,30);for(const side of [-1,1])sideWindows(mesh,item,side*116,20,79,[39,78]);
  f.box(0,146,42,47,5,46,C.trim);clock(f,0,135,20,10);hip(f,0,149,42,51,49,13,C.patina);
  for(let i=0;i<4;i++)f.box(0,6+i*2,-65+i*3,237-i*2,2,10,C.stone);word(f,'ROYAL EXCHANGE',0,101,-68,6.2,156,C.shade);
 });}

function victoriaAlbert(mesh,item){const f=frame(mesh,item),brick='#814a3b',trim='#b6a185';base(f,255,142);f.box(0,64,9,247,118,110,brick);f.box(0,88,-14,79,166,84,trim);
 details(mesh,()=>{
  for(const x of [-91,-55,55,91]){arch(f,x,14,-47,22,34,trim);window(f,x,75,-47,23,36,trim);window(f,x,110,-47,20,15,trim);}cornice(f,0,126,10,249,112,trim);for(const side of [-1,1])roof(f,side*80,130,10,88,110,31,C.slate);
  for(const x of [-113,-73,-35,35,73,113]){panel(f,x,73,-49,4,91,trim);arch(f,x,54,-49.5,10,28,trim,C.shade);statue(f,x,58,-51,19,C.stone);}
  arch(f,0,7,-57,43,77,trim,'#253a3b');arch(f,0,100,-57,33,48,trim,C.patina);for(const x of [-30,30])shaft(f,x,13,-59,81,3.6,trim);cornice(f,0,91,-19,86,84,trim);cornice(f,0,169,-14,85,86,trim);
  for(const x of [-32,32]){f.box(x,156,-57,5,28,7,trim);statue(f,x,152,-61,17,C.stone);}f.cone(0,173,-14,23,14,C.shade,16,23);
  for(let i=0;i<8;i++){const a=i/8*TAU;f.cone(Math.cos(a)*21,186,-14+Math.sin(a)*21,2.5,10,trim,8,1.8);}dome(f,0,186,-14,22,16,C.patina);f.cone(0,202,-14,2,2,C.gold,8,0);
  for(const x of [-111,-73,73,111])f.box(x,145,42,6,26,8,brick);word(f,'VICTORIA AND ALBERT',0,87,-64,4.8,142,C.iron);sideWindows(mesh,item,123,11,87,[38,77,110],trim);sideWindows(mesh,item,-123,11,87,[38,77,110],trim);
 });}

function westminsterCathedral(mesh,item){const f=frame(mesh,item),brick='#763f37',trim='#b2a184';base(f,244,142);f.box(-20,59,8,188,108,117,brick);f.box(-20,76,-31,112,142,52,brick);f.box(88,109,-5,33,208,47,brick);
 details(mesh,()=>{
  // Byzantine striped facade, round portal and one tall Italian campanile.
  for(const y of [17,35,53,71,89,107,125,143]){panel(f,-20,y,-58,110,4.2,trim);if(y<=107){panel(f,-88,y,-51.3,50,4.2,trim);panel(f,52,y,-51.3,30,4.2,trim);}}
  arch(f,-20,7,-59,66,90,trim,'#243e3e');arch(f,-20,15,-60,49,68,C.gold,'#355951');frontDisk(f,-20,69,-61,12,'#947653',0,24);statue(f,-20,49,-62,30,C.trim);for(const x of [-76,38])arch(f,x,16,-53,23,57,trim,C.glass);
  arch(f,-20,112,-59,58,35,trim,C.patina);f.cone(-20,150,-11,45,7,brick,24,45);dome(f,-20,157,-11,47,24,C.slate);
  for(const x of [-80,39]){f.cone(x,114,24,24,7,brick,24,24);dome(f,x,121,24,25,22,C.slate);}for(let y=25;y<200;y+=23){panel(f,88,y,-29.5,33,3.4,trim);panel(f,88,y+11,-29.7,8,12,C.glass);}cornice(f,88,210,-5,37,49,trim);
  for(const x of [79,88,97])arch(f,x,215,-31,5,16,trim,C.iron,8);f.box(88,223,-5,33,19,46,brick);for(const x of [79,88,97])arch(f,x,215,-29,5,15,trim,C.iron,8);cornice(f,88,234,-5,39,51,trim);dome(f,88,237,-5,20,9,C.slate);f.cone(88,245,-5,1.2,5,C.gold,8,0);
  for(const x of [-109,-59,20,59])panel(f,x,58,-52,3,100,trim);word(f,'WESTMINSTER CATHEDRAL',-20,102,-60,4.9,141,C.trim);sideWindows(mesh,item,-114,8,99,[37,73],trim);
 });}

function oldBailey(mesh,item){const f=frame(mesh,item),stone='#968c76';base(f,242,138);f.box(0,65,9,232,120,110,stone);f.box(0,81,-6,78,152,86,stone);
 details(mesh,()=>{
  bands(f,0,-47,229,14,123,10,C.shade);for(const x of [-97,-67,67,97]){arch(f,x,11,-48,19,32);window(f,x,67,-48,21,29);window(f,x,107,-48,18,22);}for(const x of [-113,-49,49,113])panel(f,x,73,-49,4,106,C.trim);
  cornice(f,0,127,9,235,113);for(const side of [-1,1])roof(f,side*82,132,12,67,111,22,C.slate);arch(f,0,11,-50,33,55,C.trim,C.iron);for(const x of [-28,28])shaft(f,x,15,-53,70,3.4);cornice(f,0,86,-7,82,90);for(const x of [-24,0,24])window(f,x,117,-51,13,34);
  cornice(f,0,154,-6,84,90);f.cone(0,157,-2,39,17,C.stone,24,39);for(let i=0;i<12;i++){const a=i/12*TAU;f.cone(Math.cos(a)*37,159,-2+Math.sin(a)*37,2.3,21,C.trim,8,2.3);}dome(f,0,178,-2,41,33,C.patina);f.cone(0,211,-2,8,8,C.shade,12,6);
  // Gilded Justice: gown, outstretched arms, sword and balanced scales.
  statue(f,0,219,-2,14,C.gold);beam(mesh,f.p(0,228,-2),f.p(-11,229,-2),1.1,C.gold);beam(mesh,f.p(0,228,-2),f.p(11,229,-2),1.1,C.gold);beam(mesh,f.p(-11,225,-2),f.p(-11,236,-2),.65,C.gold);beam(mesh,f.p(7,229,-2),f.p(15,229,-2),.6,C.gold);for(const x of [7,15]){beam(mesh,f.p(x,229,-2),f.p(x,225,-2),.4,C.gold);f.cone(x,223.5,-2,2,1.5,C.gold,8,1.6);}
  word(f,'CENTRAL CRIMINAL COURT',0,91,-53,5.3,154,C.iron);for(const side of [-1,1])sideWindows(mesh,item,side*116,10,92,[42,82,110]);
 });}

function somerset(mesh,item){const f=frame(mesh,item),stone='#928572',trim='#b6a58a';base(f,252,144);f.box(0,60,11,244,110,118,stone);f.box(0,75,-15,75,140,86,stone);
 details(mesh,()=>{
  for(const x of [-107,-78,-49,49,78,107]){arch(f,x,8,-49,18,28,trim);window(f,x,63,-49,18,27,trim);window(f,x,100,-49,17,22,trim);}for(const x of [-118,-93,-64,-37,37,64,93,118])panel(f,x,71,-51,3,81,trim);
  bands(f,0,-48.4,242,13,110,8,C.shade);cornice(f,0,116,11,246,118,trim);for(const side of [-1,1]){roof(f,side*82,120,12,78,117,28);for(const x of [side*54,side*85,side*111]){f.box(x,132,-26,14,20,18,stone);pediment(f,x,142,-36,19,8,12,trim,C.shade);window(f,x,132,-35.5,8,11,trim);}}
  arch(f,0,6,-59,32,51,trim,C.iron);for(const x of [-27,27])shaft(f,x,15,-60,76,3,trim);for(const x of [-22,0,22])window(f,x,109,-60,12,23,trim);cornice(f,0,133,-15,80,89,trim);pediment(f,0,138,-61,83,20,20,trim,C.shade);
  f.cone(0,142,22,19,10,C.stone,16,19);dome(f,0,152,22,20,14,C.patina);f.cone(0,166,22,1.6,3,C.gold,8,0);for(const x of [-112,112]){statue(f,x,124,-41,16,C.trim);f.box(x,122,-41,10,4,10,C.shade);}word(f,'SOMERSET HOUSE',0,91,-62,6.1,108,C.iron);for(const side of [-1,1])sideWindows(mesh,item,side*122,11,96,[36,72,103],trim);
 });}

function kingsCross(mesh,item){const f=frame(mesh,item),brick='#896447',trim='#b3976d';base(f,248,142);for(const x of [-66,66]){f.box(x,40,7,110,70,123,brick);f.box(x,65,-50,110,120,10,brick);}f.box(0,93,-21,26,176,65,brick);
 details(mesh,()=>{
  // Cubitt's paired great arched windows and central Italianate clock tower.
  for(const x of [-66,66]){arch(f,x,34,-56,89,86,trim,'#29434a',20);for(let u=-33;u<=33;u+=11)panel(f,x+u,66,-57.5,1.3,54,trim);for(const y of [47,64,81])panel(f,x,y,-57.5,86,1,trim);
   const spring=75,r=48;for(let i=0;i<16;i++){const a=i/16*Math.PI,b=(i+1)/16*Math.PI;f.quad([x+Math.cos(a)*r,spring+Math.sin(a)*r,-48],[x+Math.cos(b)*r,spring+Math.sin(b)*r,-48],[x+Math.cos(b)*r,spring+Math.sin(b)*r,66],[x+Math.cos(a)*r,spring+Math.sin(a)*r,66],i%4?'#31434d':'#647b7c');}
   for(const u of [-32,0,32])arch(f,x+u,8,-59,22,25,trim,'#2c4242');cornice(f,x,28,-57,107,8,trim);bands(f,x,-55.3,108,35,112,9,'#9d7756');}
  for(const y of [45,83,119])arch(f,0,y-12,-54.5,11,27,trim,C.glass);clock(f,0,158,-54.7,10);cornice(f,0,177,-21,30,68,trim);f.box(0,183,-21,25,9,62,C.shade);f.box(0,188,-21,32,2,69,trim);
  for(const x of [-118,-13,13,118])panel(f,x,68,-57,3,112,trim);word(f,'KINGS CROSS',0,31,-61,5.8,103,C.gold);for(const side of [-1,1])sideWindows(mesh,item,side*121,9,105,[27,57],trim);
 });}

const DRAW=Object.freeze({'leadenhall-market':leadenhall,'liberty-london':liberty,'st-jamess-palace':stJames,'royal-courts-of-justice':courts,'royal-exchange':exchange,'victoria-and-albert-museum':victoriaAlbert,'westminster-cathedral':westminsterCathedral,'old-bailey':oldBailey,'somerset-house':somerset,'kings-cross-station':kingsCross});
export function addLondonSecondLandmark(mesh,item){DRAW[item.kind]?.(mesh,item);}
