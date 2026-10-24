/** Compact London architecture: varied brick, weathered stone, copper and iron.
 * Local -Z faces the street. These native models interpret the cited buildings,
 * without altering their racing route. Applied glazing and lettering sit in
 * front of the actual wall; only primary solid volumes collect collision hulls.
 */
import { frame, details, word, beam, frontDisk, pediment } from './london-west-end.js';
const TAU=Math.PI*2;
export const LONDON_THIRD_CIVIC=Object.freeze([
 {kind:'harrods',label:'Harrods',radius:119,width:208,depth:112,height:166,source:'https://historicengland.org.uk/listing/the-list/list-entry/1294346'},
 {kind:'british-library',label:'British Library',radius:114,width:194,depth:116,height:155,source:'https://historicengland.org.uk/listing/the-list/list-entry/1426345'},
 {kind:'guildhall',label:'Guildhall',radius:107,width:182,depth:108,height:182,source:'https://www.guildhall.cityoflondon.gov.uk/visual-guides/the-many-lives-of-guildhall'},
 {kind:'st-martin-in-the-fields',label:'St Martin-in-the-Fields',radius:100,width:162,depth:110,height:237,source:'https://historicengland.org.uk/listing/the-list/list-entry/1217661'},
 {kind:'royal-observatory',label:'Royal Observatory Greenwich',radius:101,width:174,depth:102,height:156,source:'https://www.rmg.co.uk/stories/space-astronomy/history-royal-observatory?page=1'},
].map(Object.freeze));
const C=Object.freeze({brick:'#754038',terra:'#996749',stone:'#a69a80',trim:'#c1ad87',shade:'#665e51',slate:'#303a42',copper:'#31564c',iron:'#293a3b',glass:'#29474b',gold:'#bd995c'});
function panel(f,x,y,z,w,h,color,glow=0){f.quad([x-w/2,y-h/2,z],[x-w/2,y+h/2,z],[x+w/2,y+h/2,z],[x+w/2,y-h/2,z],color,glow);}
function stroke(f,a,b,z,w,color){const dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy),ox=-dy/n*w/2,oy=dx/n*w/2;f.quad([a[0]-ox,a[1]-oy,z],[a[0]+ox,a[1]+oy,z],[b[0]+ox,b[1]+oy,z],[b[0]-ox,b[1]-oy,z],color);}
function window(f,x,y,z,w,h,trim=C.trim,glass=C.glass){panel(f,x,y,z,w+2,h+2,trim);panel(f,x,y,z-.45,w,h,glass);panel(f,x,y,z-.9,.8,h,trim);panel(f,x,y+1,z-.9,w,.8,trim);panel(f,x,y-h/2-1.6,z-.8,w+4,1.5,trim);}
function arch(f,x,b,z,w,h,trim=C.trim,glass=C.glass){const r=w/2,sy=b+h-r;panel(f,x,(b+sy)/2,z,w,sy-b,glass);for(let i=0;i<8;i++){const a=i/8*Math.PI,t=(i+1)/8*Math.PI;f.tri([x,sy,z],[x+Math.cos(t)*r,sy+Math.sin(t)*r,z],[x+Math.cos(a)*r,sy+Math.sin(a)*r,z],glass);f.quad([x+Math.cos(a)*r,sy+Math.sin(a)*r,z-.6],[x+Math.cos(t)*r,sy+Math.sin(t)*r,z-.6],[x+Math.cos(t)*(r+1.6),sy+Math.sin(t)*(r+1.6),z-.6],[x+Math.cos(a)*(r+1.6),sy+Math.sin(a)*(r+1.6),z-.6],trim);}for(const side of [-1,1])panel(f,x+side*(r+.8),(b+sy)/2,z-.6,1.6,sy-b,trim);panel(f,x,b+h*.38,z-1,.8,h*.73,trim);}
function pointed(f,x,b,z,w,h,trim=C.trim,glass=C.glass){const spring=b+h*.62;panel(f,x,(b+spring)/2,z,w,spring-b,glass);f.tri([x-w/2,spring,z],[x,b+h,z],[x+w/2,spring,z],glass);for(const side of [-1,1]){stroke(f,[x+side*(w/2+1),b],[x+side*(w/2+1),spring],z-.6,1.8,trim);stroke(f,[x+side*(w/2+1),spring],[x,b+h+1],z-.6,1.8,trim);}panel(f,x,b+h*.37,z-1,.9,h*.72,trim);for(const side of [-1,1])stroke(f,[x,b+h*.57],[x+side*w*.25,b+h*.79],z-1,.7,trim);}
function base(f,w,d){f.box(0,2,0,w,4,d,C.shade);}
function cornice(f,x,y,z,w,d,color=C.trim){f.box(x,y,z,w,2,d,color);f.box(x,y+2,z,w+3,2,d+3,color);}
function roof(f,x,y,z,w,d,h,color=C.slate){const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],e=[x-w/2,y,z+d/2],u=[x,y+h,z-d/2],v=[x,y+h,z+d/2];f.tri(a,u,b,color);f.tri(e,c,v,color);f.quad(a,e,v,u,color);f.quad(u,v,c,b,color);}
function hip(f,x,y,z,w,d,h,color=C.slate){const v=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([a,b])=>[x+a,y,z+b]);for(let i=0;i<4;i++)f.tri(v[i],[x,y+h,z],v[(i+1)%4],color);}
function dome(f,x,y,z,r,h,color=C.copper){for(let j=0;j<4;j++)for(let i=0;i<20;i++){const a=i/20*TAU,b=(i+1)/20*TAU,c=j/4*Math.PI/2,d=(j+1)/4*Math.PI/2,p=(t,u)=>[x+Math.cos(t)*Math.cos(u)*r,y+Math.sin(u)*h,z+Math.sin(t)*Math.cos(u)*r];f.quad(p(a,c),p(a,d),p(b,d),p(b,c),i%5===0?'#527568':color);}}
function clock(f,x,y,z,r){frontDisk(f,x,y,z,r,C.gold,0,20);frontDisk(f,x,y,z-.45,r-1.3,C.iron,0,20);for(let i=0;i<12;i++){const a=i/12*TAU;stroke(f,[x+Math.sin(a)*(r-2),y+Math.cos(a)*(r-2)],[x+Math.sin(a)*(r-3.2),y+Math.cos(a)*(r-3.2)],z-.9,.65,C.trim);}stroke(f,[x,y],[x-2,y+r*.55],z-1.2,.8,C.trim);stroke(f,[x,y],[x+r*.55,y+1],z-1.2,.8,C.trim);}
function sign(f,text,x,y,z,w,h=5.5){panel(f,x,y,z,w+6,h+5,C.iron);word(f,text,x,y-h/2,z-.55,h,w,C.trim,.08);}
function sideFrame(mesh,item,x,z,side){const p=frame(mesh,item).p(x,0,z);return frame(mesh,{...item,x:p[0],z:p[2],angle:(item.angle||0)+side*Math.PI/2});}

function harrods(mesh,item){const f=frame(mesh,item),brick='#85503c',terra='#ac7e55',green='#27483e';base(f,208,112);f.box(0,62,4,198,116,94,brick);f.box(0,77,-11,53,146,62,brick);
 details(mesh,()=>{
  // Terracotta bay windows, copper mansards and small domed corner pavilions.
  for(const x of [-79,-53,-27,0,27,53,79]){arch(f,x,9,-44,18,27,terra);for(const y of [56,85,111])window(f,x,y,-44,17,20,terra);panel(f,x,40,-46,23,3,C.gold);}
  for(const x of [-94,-66,-40,40,66,94])panel(f,x,76,-45.2,2.6,84,terra);for(const y of [43,72,100,124])f.box(0,y,-44,202,2,3,terra);
  cornice(f,0,123,4,199,95,terra);for(const x of [-75,75]){f.box(x,132,3,45,15,82,green);hip(f,x,139,3,49,86,19,green);f.cone(x,138,-24,15,5,terra,16,15);dome(f,x,143,-24,16,18,green);f.cone(x,161,-24,1.5,5,C.gold,8,0);}
  cornice(f,0,151,-11,57,63,terra);dome(f,0,154,-11,25,11,green);f.cone(0,164,-11,1.1,2,C.gold,8,0);
  for(const x of [-16,0,16])arch(f,x,127,-43,10,18,terra,green);sign(f,'HARRODS',0,43,-48,75,8);
  // A fine line of warm bulbs follows the storefront, instead of a white wall.
  for(let x=-96;x<=96;x+=8)panel(f,x,36,-46.3,1.2,1.2,'#d6b771',.45);for(const side of [-1,1]){const sf=sideFrame(mesh,item,side*99,4,side);for(const y of [29,58,88,111])for(const u of [-30,0,30])window(sf,u,y,-.8,13,18,terra);}
  for(const x of [-65,65]){f.box(x,30,-48,48,2,11,green);panel(f,x,27,-54,48,5,green);word(f,'HARRODS',x,25,-54.6,4,39,C.gold,.15);}
 });}

function britishLibrary(mesh,item){const f=frame(mesh,item),brick='#713a35',red='#8c4d40',roofColor='#353b43';base(f,194,116);
 f.box(-48,45,14,87,82,80,brick);f.box(40,60,23,100,112,63,red);f.box(44,104,31,74,25,46,brick);f.box(-23,69,5,44,130,56,brick);f.box(62,31,-20,51,54,37,brick);
 details(mesh,()=>{
  // Colin St John Wilson's stepped terraces and clerestory roof profile.
  for(const [x,y,z,w,d,h]of [[-48,87,14,90,83,22],[40,117,23,103,66,19],[-23,135,5,47,59,20]]){f.box(x,y-2,z,w,3,d,C.shade);roof(f,x,y,z,w,d,h,roofColor);}
  for(const x of [-79,-58,-37])for(const y of [30,54,77])window(f,x,y,-27,12,14,'#a87860');for(const x of [11,33,55,77])for(const y of [79,102])window(f,x,y,-9.5,15,13,'#b28a68');
  for(const y of [46,72,99,124])panel(f,-23,y,-24,34,5,'#2b4a50');for(const x of [-37,-30,-23,-16,-9])panel(f,x,82,-24.6,.9,91,'#9c745a');
  panel(f,62,32,-39,42,35,C.glass);for(const x of [48,62,76])panel(f,x,32,-39.6,1.5,35,'#a87860');f.box(62,57,-20,54,3,41,C.shade);
  for(const [x,y,z,w]of [[-48,92,-27.8,87],[40,122,-10.6,99]]){panel(f,x,y,z,w,5,'#35545b');for(let u=-w/2+5;u<w/2;u+=12)panel(f,x+u,y,z-.5,.8,5,C.shade);}
  for(const side of [-1,1]){const sf=sideFrame(mesh,item,side>0?90:-91.5,20,side);for(const y of [28,54,77])for(const u of [-17,17])window(sf,u,y,-.7,13,14,'#9c755e');}
  // Low garden walls and Paolozzi-inspired seated Newton with his compass.
  f.box(-39,9,-43,87,10,7,brick);f.box(1,5,-36,28,2,29,C.stone);f.box(1,11,-36,15,10,16,C.shade);
  const bronze='#58634d';f.box(1,23,-34,9,14,8,bronze);f.cone(2,30,-36,3.6,6,bronze,10,2.8);
  for(const side of [-1,1]){beam(mesh,f.p(1+side*3,19,-35),f.p(1+side*6,18,-43),2.4,bronze);beam(mesh,f.p(1+side*6,18,-43),f.p(1+side*6,10,-44),2.1,bronze);beam(mesh,f.p(1+side*4,28,-36),f.p(1+side*5,19,-43),1.8,bronze);}
  beam(mesh,f.p(-1,18,-44),f.p(-5,8,-47),.6,C.gold);beam(mesh,f.p(-1,18,-44),f.p(4,8,-47),.6,C.gold);sign(f,'BRITISH LIBRARY',-43,20,-47,83,5.8);
  for(let y=14;y<85;y+=9)panel(f,-48,y,-26.5,85,.5,'#8b5142');
 });}

function guildhall(mesh,item){const f=frame(mesh,item),stone='#8d8978',trim='#afa28a';base(f,182,108);f.box(0,62,6,174,116,87,stone);f.box(0,66,-21,73,124,56,stone);
 details(mesh,()=>{
  roof(f,0,121,7,177,90,40);pediment(f,0,132,-50,82,31,33,trim,C.shade);
  // A recessed Gothic entrance, pinnacles and tracery on the historic frontage.
  pointed(f,0,7,-50.3,35,74,trim,'#293a3e');pointed(f,0,92,-50.3,39,34,trim,'#36464a');for(const x of [-63,-43,43,63]){pointed(f,x,40,-38.7,13,61,trim,'#29383f');pointed(f,x,12,-38.7,10,17,trim,'#3b4846');}
  for(const x of [-82,-31,31,82]){f.box(x,68,-39,5,127,9,trim);f.box(x,137,-39,7,12,11,trim);f.cone(x,143,-39,6.2,32,C.slate,4,0,Math.PI/4);f.cone(x,175,-39,1.1,7,C.gold,8,0);}
  for(const y of [30,115,129])panel(f,0,y,-51.5,76,2,trim);for(const x of [-24,24]){panel(f,x,52,-51.7,2,83,trim);for(const y of [22,44,66])panel(f,x,y,-52.2,7,1.2,C.shade);}
  // Applied shields stand clear of masonry: red City cross, green and blue arms.
  for(const [x,color]of [[-53,'#793c34'],[0,'#244d4b'],[53,'#304961']]){const y=x===0?143:113,w=x===0?16:13,h=15,z=x===0?-52:-39.5;panel(f,x,y,z,w,h,trim);panel(f,x,y+1,z-.5,w-3,h-3,color);f.tri([x-w/2,y-h/2,z],[x,y-h/2-7,z],[x+w/2,y-h/2,z],trim);panel(f,x,y+1,z-1,2,h-3,C.gold);panel(f,x,y+1,z-1,w-3,2,C.gold);}
  sign(f,'GUILDHALL',0,86,-53.35,61,6);for(const side of [-1,1]){const sf=sideFrame(mesh,item,side*87,6,side);for(const u of [-27,0,27])pointed(sf,u,32,-.8,13,64,trim);for(const u of [-40,-14,14,40])panel(sf,u,65,-1.3,2,106,trim);}
  for(let y=17;y<115;y+=10){panel(f,-62,y,-38,47,.55,'#727366');panel(f,62,y,-38,47,.55,'#727366');}
 });}

function stMartin(mesh,item){const f=frame(mesh,item),stone='#a19479',trim='#bbac8d';base(f,162,110);f.box(0,50,13,145,92,77,stone);f.box(0,99,-6,37,116,36,stone);
 for(const x of [-57,-34,-11,11,34,57])f.cone(x,11,-39,3.3,72,stone,12,2.8);
 details(mesh,()=>{
  roof(f,0,97,13,148,80,29);cornice(f,0,84,-34,133,29,trim);pediment(f,0,91,-51.5,139,29,27,trim,C.shade);
  for(const x of [-57,-34,-11,11,34,57]){f.box(x,10,-39,9,4,9,trim);f.box(x,82,-39,10,5,10,trim);for(const u of [-1.4,0,1.4])panel(f,x+u,48,-42.1,.4,61,C.shade);}
  for(const x of [-46,0,46])arch(f,x,12,-26.5,18,47,trim);word(f,'ST MARTIN IN THE FIELDS',0,86,-54,4.5,126,C.shade);
  // Temple portico below a staged clock tower, lantern and slender stone spire.
  cornice(f,0,152,-6,42,41,trim);clock(f,0,140,-24.6,10);for(const side of [-1,1]){const sf=sideFrame(mesh,item,side*18.5,-6,side);clock(sf,0,140,-.8,9);}
  f.cone(0,157,-6,22,20,stone,8,22,Math.PI/8);f.cone(0,177,-6,23,4,trim,8,23,Math.PI/8);for(const x of [-13,0,13])arch(f,x,159,-26.8,5,14,C.shade,C.iron);
  f.cone(0,181,-6,18,12,C.shade,8,13,Math.PI/8);f.cone(0,193,-6,13,38,stone,8,1.4,Math.PI/8);f.cone(0,231,-6,1.1,6,C.gold,8,0);
  for(const side of [-1,1]){const sf=sideFrame(mesh,item,side*72.5,13,side);for(const u of [-27,-9,9,27]){arch(sf,u,17,-.8,11,29,trim);arch(sf,u,59,-.8,11,23,trim);}for(const u of [-37,-18,18,37])panel(sf,u,50,-1.3,2,86,trim);}
  for(let i=0;i<4;i++)f.box(0,5+i*1.4,-49+i*2,148-i*3,1.4,8,stone);for(const x of [-67,67]){panel(f,x,42,-27,3,71,trim);f.cone(x,102,15,2,12,C.shade,8,1);}
 });}

function royalObservatory(mesh,item){const f=frame(mesh,item),brick='#824739',trim='#af9270';base(f,174,102);f.box(-18,37,14,114,66,65,brick);f.cone(-33,70,9,31,65,brick,8,31);f.box(61,39,20,35,70,49,brick);f.box(-68,49,16,28,90,44,brick);
 details(mesh,()=>{
  // Flamsteed House's Octagon Room, copper instrument dome and red time ball.
  cornice(f,-18,71,14,115,65,trim);hip(f,-18,74,14,118,68,20,C.slate);f.cone(-33,135,9,32,4,trim,8,32);dome(f,-33,139,9,30,15);f.cone(61,75,20,23,5,trim,20,23);dome(f,61,80,20,24,26);
  for(let i=0;i<8;i++){const a=(i+.5)/8*TAU,p=f.p(-33+Math.cos(a)*28.7,0,9+Math.sin(a)*28.7),sf=frame(mesh,{...item,x:p[0],z:p[2],angle:(item.angle||0)+a+Math.PI/2});window(sf,0,116,-.5,14,24,trim);}
  for(const x of [-54,-27,0,25]){window(f,x,29,-19.6,14,21,trim);window(f,x,57,-19.6,14,14,trim);}window(f,61,43,-5.5,16,32,trim);for(const y of [25,56,84])window(f,-68,y,-7,11,17,trim);
  cornice(f,-68,95,16,30,46,trim);hip(f,-68,98,16,32,48,20,C.slate);f.cone(-68,117,16,1.1,39,C.iron,8,1.1);
  // A modest faceted sphere is unmistakable without an expensive sphere mesh.
  f.cone(-68,136,16,1.8,4,'#a34534',12,6);f.cone(-68,140,16,6,4,'#b94b36',12,5.8);f.cone(-68,144,16,5.8,4,'#a34534',12,1.4);
  const yardY=4.2;f.quad([-83,yardY,-48],[-83,yardY,-23],[83,yardY,-23],[83,yardY,-48],'#817d68');f.quad([5,yardY+.25,-49],[5,yardY+.25,-23],[6.8,yardY+.25,-23],[6.8,yardY+.25,-49],C.gold);
  for(let x=-76;x<=76;x+=19)f.quad([x,yardY+.2,-49],[x,yardY+.2,-24],[x+.55,yardY+.2,-24],[x+.55,yardY+.2,-49],'#a0977e');
  f.box(47,10,-34,14,11,14,C.shade);f.cone(47,16,-34,9,2,C.copper,16,9);f.tri([47,18,-41],[47,27,-34],[47,18,-30],C.gold);
  sign(f,'ROYAL OBSERVATORY',-21,14,-23,109,5.2);for(const x of [-81,81]){f.box(x,9,-34,2,10,26,C.iron);for(const z of [-44,-34,-24])f.box(x,11,z,1,14,1,C.iron);}
 });}

const DRAW=Object.freeze({'harrods':harrods,'british-library':britishLibrary,'guildhall':guildhall,'st-martin-in-the-fields':stMartin,'royal-observatory':royalObservatory});
export function addLondonThirdCivic(mesh,item){DRAW[item.kind]?.(mesh,item);}
