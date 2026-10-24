/** Five compact London interpretations. The local -Z side faces the road.
 * Sources were checked against the institutions, architect and listing body.
 * Solid masses collide; attached glass, rigging and ornament use separated
 * surfaces. The Admiralty tunnels have neither a backing wall nor floor hull.
 */
import { frame, details, word, frontDisk, pediment } from './london-west-end.js';

const TAU=Math.PI*2;
export const LONDON_THIRD_RIVERSIDE=Object.freeze([
 {kind:'lloyds-building',label:"Lloyd’s Building",radius:108,width:174,depth:126,height:262,source:'https://www.lloyds.com/about-lloyds/the-lloyds-building'},
 {kind:'one-canada-square',label:'One Canada Square',radius:100,width:160,depth:112,height:345,source:'https://pcparch.com/work/one-canada-square-and-docklands-light-railway-station'},
 {kind:'cutty-sark',label:'Cutty Sark',radius:122,width:216,depth:110,height:211,source:'https://www.rmg.co.uk/collections/objects/rmgc-object-667478'},
 {kind:'admiralty-arch',label:'Admiralty Arch',radius:111,width:194,depth:106,height:143,source:'https://historicengland.org.uk/listing/the-list/list-entry/1238982'},
 {kind:'brompton-oratory',label:'Brompton Oratory',radius:113,width:194,depth:112,height:221,source:'https://www.bromptonoratory.co.uk/about-the-oratory'},
].map(Object.freeze));
const C=Object.freeze({stone:'#a29882',trim:'#c3b08b',shade:'#61594e',slate:'#303e47',patina:'#36584f',iron:'#273638',gold:'#b48d4d',glass:'#365660',steel:'#728481'});
function panel(f,x,y,z,w,h,color){f.quad([x-w/2,y-h/2,z],[x-w/2,y+h/2,z],[x+w/2,y+h/2,z],[x+w/2,y-h/2,z],color);}
// Two crossing ribbons keep cables and fine seams visible at oblique angles.
function rod(f,a,b,w,color){
 const d=b.map((n,i)=>n-a[i]),len=Math.hypot(...d),u=d.map(n=>n/len),ref=Math.abs(u[1])>.9?[1,0,0]:[0,1,0];
 const cross=(p,q)=>[p[1]*q[2]-p[2]*q[1],p[2]*q[0]-p[0]*q[2],p[0]*q[1]-p[1]*q[0]],raw=cross(u,ref),size=Math.hypot(...raw),v=raw.map(n=>n/size);
 for(const normal of [v,cross(u,v)])f.quad(a.map((n,i)=>n-normal[i]*w/2),b.map((n,i)=>n-normal[i]*w/2),b.map((n,i)=>n+normal[i]*w/2),a.map((n,i)=>n+normal[i]*w/2),color);
}
function sign(f,text,x,y,z,w,h=5){panel(f,x,y,z,w+5,h+5,C.iron);word(f,text,x,y-h/2,z-.45,h,w,C.trim,.06);}
function window(f,x,y,z,w,h){panel(f,x,y,z,w+2.6,h+2.6,C.trim);panel(f,x,y,z-.35,w,h,C.glass);panel(f,x,y,z-.65,.75,h,C.shade);panel(f,x,y+1,z-.65,w,.75,C.shade);}
function roundWindow(f,x,b,z,w,h){
 const r=w/2,sy=b+h-r;panel(f,x,(b+sy)/2,z,w,sy-b,C.glass);
 for(let i=0;i<8;i++){const a=i/8*Math.PI,t=(i+1)/8*Math.PI;f.tri([x,sy,z],[x+Math.cos(t)*r,sy+Math.sin(t)*r,z],[x+Math.cos(a)*r,sy+Math.sin(a)*r,z],C.glass);f.quad([x+Math.cos(a)*r,sy+Math.sin(a)*r,z-.35],[x+Math.cos(t)*r,sy+Math.sin(t)*r,z-.35],[x+Math.cos(t)*(r+2),sy+Math.sin(t)*(r+2),z-.35],[x+Math.cos(a)*(r+2),sy+Math.sin(a)*(r+2),z-.35],C.trim);}
 for(const side of [-1,1])panel(f,x+side*(r+1),(b+sy)/2,z-.35,2,sy-b,C.trim);
 panel(f,x,b+h*.43,z-.7,.8,h*.82,C.shade);
}
function solidBox(mesh,f,item,x,y,z,w,h,d){
 if(!mesh.colliders||h<=0)return;const p=f.p(x,y,z);
 mesh.colliders.push({id:`prop-${mesh.colliders.length}`,type:'box',x:p[0],y:p[2],halfWidth:w/2,halfDepth:d/2,angle:item.angle||0,minHeight:p[1]-h/2,maxHeight:p[1]+h/2});
}
function base(f,w,d){f.box(0,2,0,w,4,d,C.shade);}
function hip(f,x,y,z,w,d,h,color=C.patina){const p=[[-w/2,y,-d/2],[w/2,y,-d/2],[w/2,y,d/2],[-w/2,y,d/2]].map(a=>[a[0]+x,a[1],a[2]+z]);for(let i=0;i<4;i++)f.tri(p[i],[x,y+h,z],p[(i+1)%4],color);}
function statue(f,x,y,z,h){f.cone(x,y,z,h*.13,h*.65,C.trim,8,h*.07);f.cone(x,y+h*.69,z,h*.1,h*.22,C.trim,8,h*.07);}

function lloyds(mesh,item){
 const f=frame(mesh,item);base(f,174,126);
 f.box(0,106,8,104,204,82,'#344d55');
 // Six exposed service towers, with the lifts and stairs outside the core.
 const towers=[[-67,-43,238],[-68,6,213],[-67,43,225],[67,-43,224],[68,6,247],[67,43,233]];
 for(let i=0;i<towers.length;i++){
  const [x,z,h]=towers[i];
  if(i%2)f.cone(x,4,z,11,h-4,'#586967',12,11);
  else f.box(x,h/2+2,z,20,h-4,20,'#374e57');
 }
 details(mesh,()=>{
  // Blue-grey continuous floor bands and external stainless-steel mullions.
  for(const face of [-1,1]){
   const p=f.p(0,0,8+face*41.5),g=frame(mesh,{...item,x:p[0],z:p[2],angle:(item.angle||0)+(face>0?Math.PI:0)});
   for(let y=18;y<207;y+=14)panel(g,0,y,-.1,104,2.8,'#82918a');
   for(let x=-48;x<=48;x+=16)panel(g,x,108,-.35,2,195,C.steel);
   for(let y=28;y<202;y+=28)for(const x of [-39,-7,25])panel(g,x,y,-.6,11,8,'#506d73');
  }
  for(let i=0;i<towers.length;i++){
   const [x,z,h]=towers[i];
   if(i%2){
    for(let y=17;y<h-5;y+=28){f.cone(x,y,z,11.3,1.5,C.steel,12,11.3);}
    // The stair glimpses and parallel risers are offset from the steel drum.
    for(let y=30;y<h-15;y+=24)panel(f,x,y,z-11.6,8,10,'#263c42');
   }else{
    for(const dx of [-8,8])panel(f,x+dx,h/2+2,z-10.5,1.7,h-9,C.steel);
    for(let y=14;y<h-4;y+=17)panel(f,x,y,z-10.7,18,1.3,C.steel);
    for(const y of [h*.31,h*.69]){panel(f,x,y,z-11,12,16,'#759493');panel(f,x,y,z-11.3,.8,16,C.iron);}
   }
   for(const dx of [-3.6,3.6]){f.cone(x+dx,8,z-13.2,1.9,h-4,C.steel,6,1.9);f.cone(x+dx,h+4,z-13.2,2.9,3,'#84978b',6,2.9);}
   f.box(x,h+2,z,24,4,25,C.iron);
  }
  // The central atrium's barrel-vaulted glazing remains distinct from the
  // perimeter machinery; narrow panes avoid a bright solid cap.
  for(let i=0;i<16;i++){
   const a=i/16*Math.PI,b=(i+1)/16*Math.PI,p=(t,z)=>[Math.cos(t)*49,208+Math.sin(t)*26,z];
   f.quad(p(a,-30),p(b,-30),p(b,46),p(a,46),i%3?'#486c72':'#758b85');
   if(i%2===0)rod(f,p(a,-30.3),p(a,46.3),1.2,C.steel);
  }
  for(const z of [-30.5,7,46.5])for(let i=0;i<12;i++){const a=i/12*Math.PI,b=(i+1)/12*Math.PI;rod(f,[Math.cos(a)*49.3,208+Math.sin(a)*26.3,z],[Math.cos(b)*49.3,208+Math.sin(b)*26.3,z],1.1,C.steel);}
  // Permanent rooftop maintenance cranes are a characteristic Lloyd's detail.
  for(const [x,z,y,side]of [[-67,-40,245,1],[68,5,254,-1]]){
   rod(f,[x,y-7,z],[x,y+7,z],2,C.iron);rod(f,[x-side*7,y,z],[x+side*36,y+5,z],1.8,C.steel);
   rod(f,[x,y+7,z],[x+side*36,y+5,z],.7,C.iron);rod(f,[x+side*32,y+4,z],[x+side*32,y-12,z],.45,C.iron);
  }
  f.box(0,10,-47,63,13,17,C.iron);panel(f,0,12,-56,49,9,C.glass);sign(f,'LLOYDS',0,26,-56.5,53,6);
 });
}

function canadaSquare(mesh,item){
 const f=frame(mesh,item);base(f,160,112);
 // Two intersecting solids leave the four characteristic inverted corners.
 f.box(0,145,0,126,282,74,'#35535e');f.box(0,145,0,108,282,92,'#3d5e66');
 details(mesh,()=>{
  for(const [x,z,angle,w]of [[0,-46.4,0,108],[0,46.4,Math.PI,108],[63.4,0,Math.PI/2,74],[-63.4,0,-Math.PI/2,74]]){
   const p=f.p(x,0,z),g=frame(mesh,{...item,x:p[0],z:p[2],angle:(item.angle||0)+angle});
   for(let y=17;y<284;y+=10)panel(g,0,y,-.1,w,1.5,'#8b9891');
   for(let xx=-w/2+6;xx<w/2;xx+=12)panel(g,xx,145,-.35,1.3,277,'#7e918d');
   for(let y=33;y<279;y+=30)for(let xx=-w/2+12;xx<w/2-4;xx+=24)panel(g,xx,y,-.5,9,7,'#57777f');
  }
  for(const x of [-54.4,54.4])for(const z of [-41.7,41.7]){
   const p=f.p(x,0,z),g=frame(mesh,{...item,x:p[0],z:p[2],angle:(item.angle||0)+(x>0?Math.PI/2:-Math.PI/2)});
   panel(g,0,145,-.1,8.5,281,'#263e49');for(let y=17;y<284;y+=20)panel(g,0,y,-.3,8.5,1.4,C.steel);
  }
  f.box(0,286,0,130,5,96,'#84968d');
  // Four metal roof planes meet in one unmistakable pyramidal crown.
  const corners=[[-64,289,-47],[64,289,-47],[64,289,47],[-64,289,47]],tip=[0,343,0];
  for(let i=0;i<4;i++){
   const a=corners[i],b=corners[(i+1)%4];f.tri(a,tip,b,['#7e918a','#536f70','#6d8280','#455e63'][i]);
   rod(f,a,tip,1.1,'#a4aaa0');
   for(const y of [300,311,322,333]){
    const p=(v,h)=>{const t=(h-289)/54;return [v[0]*(1-t)*1.006,h,v[2]*(1-t)*1.006];};
    f.quad(p(a,y),p(a,y+.85),p(b,y+.85),p(b,y),'#526965');
   }
  }
  f.box(0,344,0,2,2,2,'#b4684f');
  f.box(0,13,-50,54,18,10,C.iron);panel(f,0,14,-55.4,45,14,'#4e7578');for(const x of [-15,0,15])panel(f,x,14,-55.8,1,14,C.steel);
  sign(f,'ONE CANADA SQUARE',0,34,-47.5,96,5);
 });
}

function cuttySark(mesh,item){
 const f=frame(mesh,item),wood='#4a352c',copper='#a57443',rope='#756c51';base(f,216,110);
 const sections=[[-91,1,68,37],[-78,14,63,25],[-52,23,60,18],[0,26,58,17],[51,24,60,20],[80,16,64,29],[89,4,66,39]];
 // Planked upper hull and copper-zinc sheathing are separate, faceted shells.
 const ring=([x,w,deck,keel])=>[[x,deck,-w],[x,44,-w*.8],[x,keel,0],[x,44,w*.8],[x,deck,w]];
 for(let i=0;i<sections.length-1;i++){
  const a=ring(sections[i]),b=ring(sections[i+1]);
  for(let j=0;j<4;j++)f.quad(a[j],b[j],b[j+1],a[j+1],j===0||j===3?wood:i%2?copper:'#b48a52');
  f.quad(a[0],a[4],b[4],b[0],'#8b704d');
  const [x,w,deck]=sections[i],[xx,ww,dd]=sections[i+1];
  solidBox(mesh,f,item,(x+xx)/2,50,0,xx-x,Math.min(deck,dd)-44,Math.min(w,ww)*1.5);
 }
 for(const index of [0,sections.length-1]){const p=ring(sections[index]);for(let j=1;j<p.length-1;j++)f.tri(p[0],p[j],p[j+1],wood);}
 f.box(-25,66,0,27,14,24,'#6d5840');f.box(53,71,0,30,17,24,'#66523b');
 const masts=[[-43,188],[9,209],[57,176]];
 for(const [x,h]of masts)f.cone(x,59,0,2.5,h-59,wood,10,1.15);
 details(mesh,()=>{
  // Low glass exhibit enclosure and its iron ribs reveal the hull above it.
  for(let i=0;i<20;i++){
   const a=i/20*TAU,b=(i+1)/20*TAU,p=(t,upper)=>[Math.cos(t)*(upper?91:103),upper?18:5,Math.sin(t)*(upper?32:49)];
   f.quad(p(a,false),p(a,true),p(b,true),p(b,false),i%3?'#496369':'#627b77');rod(f,p(a,false),p(a,true),1.1,C.iron);
  }
  for(let i=0;i<sections.length-1;i++){
   const [x,w,y]=sections[i],[xx,ww,yy]=sections[i+1];
   for(const side of [-1,1]){
    rod(f,[x,y+1,side*w],[xx,yy+1,side*ww],1.4,'#aa8e62');rod(f,[x,y-4,side*(w+.2)],[xx,yy-4,side*(ww+.2)],.8,'#9a7b54');
    for(const t of [.25,.6]){const u=x+(xx-x)*t,v=w+(ww-w)*t,h=y+(yy-y)*t;rod(f,[u,h,side*v],[u,h+6,side*v],.65,rope);}
    rod(f,[x,y+6,side*w],[xx,yy+6,side*ww],.7,rope);
   }
  }
  for(const [x,y]of [[-25,66],[53,71]]){f.box(x,y+8,0,30,2,27,'#4e5a4b');for(const u of [-8,0,8])window(f,x+u,y,-12.4,4,6);}
  for(const [x,h]of masts){
   f.cone(x,104,0,6,2,C.iron,12,6);
   for(let y=94;y<h-8;y+=28){
    const w=34-(y-94)*.13,a=[x-w*.34,y,-w*.9],b=[x+w*.34,y,w*.9];rod(f,a,b,2.2,wood);
    // Furled ochre canvas leaves the silhouette mostly open sky and rigging.
    f.quad([a[0],y-1,a[2]-.2],[a[0],y-3.7,a[2]-.2],[b[0],y-3.7,b[2]-.2],[b[0],y-1,b[2]-.2],'#c0af85');
    for(const side of [-1,1])rod(f,[x,h-5,0],[x+side*w*.34,y,side*w*.9],.5,rope);
   }
   for(const side of [-1,1]){
    for(const dx of [-12,12])rod(f,[x,h-22,0],[x+dx,61,side*23],.65,rope);
    for(let j=1;j<=10;j++){const t=j/12,y=61+(h-83)*t,z=side*23*(1-t);rod(f,[x-12*(1-t),y,z],[x+12*(1-t),y,z],.45,rope);}
   }
  }
  rod(f,[-87,67,0],[-106,91,0],2.1,wood);rod(f,[-106,91,0],[9,208,0],.75,rope);rod(f,[-106,91,0],[-43,183,0],.65,rope);
  rod(f,[-43,187,0],[9,208,0],.65,rope);rod(f,[9,208,0],[57,175,0],.65,rope);rod(f,[57,175,0],[88,68,0],.65,rope);
  // Two small staysails, deliberately warm and sparse rather than a white wall.
  f.tri([-100,94,-.8],[-47,177,-.8],[-58,105,-.8],'#b6a47d');f.tri([15,193,-.8],[52,169,-.8],[46,122,-.8],'#b09d77');
  f.quad([9,208,0],[19,210,0],[18,205,0],[9,204,0],'#87493d');
  frontDisk(f,78,74,-1,4.8,'#ad8f58',0,16);frontDisk(f,78,74,-1.3,3.3,wood,0,16);
  // Each small brass opening follows the tapered plank surface, including
  // the narrow bow and stern; none floats on one fixed broadside plane.
  const plankPoint=(x,y)=>{const index=sections.findIndex((s,i)=>i<sections.length-1&&x>=s[0]&&x<=sections[i+1][0]),a=sections[index],b=sections[index+1],t=(x-a[0])/(b[0]-a[0]),w=a[1]+(b[1]-a[1])*t,deck=a[2]+(b[2]-a[2])*t;return [x,y,-w*(.8+.2*(y-44)/(deck-44))-.4];};
  for(const x of [-70,-46,-22,2,26,50,72])f.quad(plankPoint(x-2.5,50.5),plankPoint(x-2.5,53.5),plankPoint(x+2.5,53.5),plankPoint(x+2.5,50.5),'#b5a67d');
  sign(f,'CUTTY SARK',0,12,-50,95,6);
 });
}

// Curved spandrel, voussoirs, intrados and conservative masonry-only hulls.
// No arch is painted on a blocking box. At ground level the opening is empty.
function tunnel(mesh,f,item,x,r,spring,front,back,ceiling){
 const segments=r<10?8:16;
 for(let i=0;i<segments;i++){
  const a=i/segments*Math.PI,b=(i+1)/segments*Math.PI,aa=[x+Math.cos(a)*r,spring+Math.sin(a)*r],bb=[x+Math.cos(b)*r,spring+Math.sin(b)*r];
  for(const z of [front,back]){
   f.quad([aa[0],aa[1],z],[bb[0],bb[1],z],[bb[0],ceiling,z],[aa[0],ceiling,z],C.stone);
   const offset=z===front?-.45:.45;
   f.quad([aa[0],aa[1],z+offset],[bb[0],bb[1],z+offset],[x+Math.cos(b)*(r+2.8),spring+Math.sin(b)*(r+2.8),z+offset],[x+Math.cos(a)*(r+2.8),spring+Math.sin(a)*(r+2.8),z+offset],i%2?C.trim:'#b1a084');
  }
  f.quad([aa[0],aa[1],front],[aa[0],aa[1],back],[bb[0],bb[1],back],[bb[0],bb[1],front],C.shade);
  const lo=Math.max(aa[1],bb[1]);solidBox(mesh,f,item,(aa[0]+bb[0])/2,(lo+ceiling)/2,(front+back)/2,Math.abs(bb[0]-aa[0]),ceiling-lo,back-front);
 }
}
function admiralty(mesh,item){
 const f=frame(mesh,item);
 for(const x of [-27,27])f.box(x,33,2,8,66,60,C.stone);
 for(const x of [-80.5,80.5])f.box(x,33,-5,7,66,74,C.stone);
 for(const x of [-95.5,95.5])f.box(x,33,-5,3,66,86,C.stone);
 for(const x of [-54,0,54]){
  const front=x===0?-26:-32,back=32;tunnel(mesh,f,item,x,23,40,front,back,66);
  f.box(x,91,(front+back)/2,54,50,back-front,C.stone);
 }
 for(const x of [-89,89]){
  tunnel(mesh,f,item,x,5,24,-48,38,66);f.box(x,88,-5,16,44,86,C.stone);
 }
 details(mesh,()=>{
  // The gently stepped concave wings carry rustication and a giant order.
  for(const x of [-95.5,-80.5,-27,27,80.5,95.5]){
   const z=Math.abs(x)>90?-48.4:Math.abs(x)>70?-42.4:-28.4;
   for(let y=8;y<65;y+=8)panel(f,x,y,z,Math.abs(x)>90?3:7,.65,C.shade);
   if(Math.abs(x)<90){f.cone(x,8,z-1.5,2.2,95,C.trim,10,1.9);f.box(x,105,z-1.5,6,4,6,C.trim);}
  }
  for(const x of [-54,0,54]){
   const z=x===0?-26.6:-32.6;for(const dx of [-16,0,16]){window(f,x+dx,84,z,9,17);window(f,x+dx,105,z,8,9);}
   f.box(x,116,(z+32)/2,54,4,32-z+2,C.trim);hip(f,x,119,(z+32)/2,53,32-z,17,C.patina);
  }
  for(const x of [-89,89]){window(f,x,84,-48.6,9,18);f.box(x,111,-5,16,3,86,C.trim);hip(f,x,114,-5,16,86,20,C.patina);}
  f.box(0,128,1,67,24,54,C.stone);f.box(0,141,1,71,4,58,C.trim);
  word(f,'VICTORIA',0,124,-26.8,5.5,53,'#62513a',.02);word(f,'ADMIRALTY ARCH',0,133,-26.8,3.2,56,'#62513a',.02);
  for(const x of [-54,0,54]){const z=x===0?-27.1:-33.1;panel(f,x,65,z,4,7,C.trim);}
  // Seated allegorical figures at the wing ends, simplified as stone relief.
  for(const x of [-83,83]){f.box(x,116,-38,9,3,8,C.trim);statue(f,x,118,-38,12);rod(f,[x-4,121,-39],[x+4,121,-39],1.3,C.trim);}
  f.quad([-97,.2,-52],[97,.2,-52],[97,.2,51],[-97,.2,51],'#787b6b');
 });
}

function oratory(mesh,item){
 const f=frame(mesh,item),sand='#917d5e',domeZ=16.5;base(f,194,112);
 f.box(0,54,8,178,96,86,sand);f.box(0,55,-35,114,98,30,sand);
 f.box(0,120,-35,88,34,30,sand);for(const x of [-73,73])f.box(x,45,0,38,78,88,sand);
 f.cone(0,117,domeZ,37,29,sand,24,37);
 details(mesh,()=>{
  for(const x of [-47,-29,-11,11,29,47]){
   f.box(x,9,-51.9,9,5,8,C.trim);f.cone(x,12,-51.9,2.9,75,C.trim,12,2.4);f.box(x,90,-51.9,9,6,8,C.trim);
   for(const dx of [-.8,.8])panel(f,x+dx,50,-55,.45,65,C.shade);
   for(const dx of [-2.8,2.8])frontDisk(f,x+dx,88,-55,1.8,C.shade,0,6);
  }
  for(const x of [-34,0,34])roundWindow(f,x,8,-50.5,17,x===0?50:41);
  for(const x of [-73,73])for(const y of [30,64])window(f,x,y,-44.6,14,20);
  for(const y of [19,32,45,58,71,84])for(const x of [-73,73])panel(f,x,y,-44.35,37,.6,'#695c46');
  f.box(0,97,-35,120,5,37,C.trim);f.box(0,103,-35,116,3,34,C.shade);
  for(const x of [-39,-17,17,39]){panel(f,x,119,-50.7,4,29,C.trim);panel(f,x,134,-51,7,2,C.trim);}
  roundWindow(f,0,107,-50.6,22,26);pediment(f,0,139,-52,101,18,27,C.trim,C.shade);
  frontDisk(f,0,147,-52.8,3.3,C.gold,0,16);
  for(const x of [-44,-29,29,44]){f.cone(x,142,-39,2.7,4,C.trim,8,3.4);f.cone(x,146,-39,3.4,4,C.trim,8,1.8);}
  statue(f,0,158,-39,15);rod(f,[-3.5,166,-39],[3.5,166,-39],1.5,C.trim);
  // Rear crossing drum, arched openings and ribbed copper-green outer dome.
  for(let i=0;i<8;i++){
   const a=i/8*TAU,p=f.p(Math.cos(a)*37.4,0,domeZ+Math.sin(a)*37.4),g=frame(mesh,{...item,x:p[0],z:p[2],angle:(item.angle||0)+a+Math.PI/2});
   roundWindow(g,0,123,-.1,8,16);panel(g,-6,133,-.5,1.3,24,C.trim);
  }
  f.cone(0,145,domeZ,39,4,C.trim,24,39);
  const profile=Array.from({length:6},(_,i)=>{const a=i/5*Math.PI/2;return [149+Math.sin(a)*48,38*Math.cos(a)];});
  for(let row=1;row<profile.length;row++)for(let i=0;i<24;i++){
   const a=i/24*TAU,b=(i+1)/24*TAU,[y,r]=profile[row-1],[yy,rr]=profile[row],p=(t,h,rad)=>[Math.cos(t)*rad,h,domeZ+Math.sin(t)*rad];
   f.quad(p(a,y,r),p(a,yy,rr),p(b,yy,rr),p(b,y,r),i%8?'#36584f':'#547769');
  }
  for(let i=0;i<8;i++){const a=i/8*TAU;for(let row=1;row<profile.length;row++){const p=([y,r])=>[Math.cos(a)*(r+.3),y+.2,domeZ+Math.sin(a)*(r+.3)];rod(f,p(profile[row-1]),p(profile[row]),.85,'#82937a');}}
  f.cone(0,197,domeZ,7,3,C.trim,16,7);
  for(let i=0;i<8;i++){const a=i/8*TAU;f.cone(Math.cos(a)*5.7,200,domeZ+Math.sin(a)*5.7,.8,11,C.trim,8,.7);}
  f.cone(0,211,domeZ,7.3,4,C.patina,16,2);rod(f,[0,215,domeZ],[0,221,domeZ],1.3,C.gold);rod(f,[-2.5,218.5,domeZ],[2.5,218.5,domeZ],1.3,C.gold);
  sign(f,'BROMPTON ORATORY',0,5,-54,112,4);
 });
}

export function addLondonThirdRiverside(mesh,item){
 const draw={'lloyds-building':lloyds,'one-canada-square':canadaSquare,'cutty-sark':cuttySark,'admiralty-arch':admiralty,'brompton-oratory':oratory}[item.kind];
 if(draw)draw(mesh,item);
}
