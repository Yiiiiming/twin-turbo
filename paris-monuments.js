/** Compact Paris monuments, with their public frontage at local -Z.
 * Architecture references: notredamedeparis.fr/en/understand/architecture/;
 * musee-armee.fr/en/your-visit/museum-spaces/the-dome-tomb-of-napoleon.html;
 * paris.fr/pages/tout-savoir-sur-le-patrimoine-parisien-22969.
 * Dimensions are game envelopes, not measurements of the real monuments.
 */
import { frame, details, beam, frontDisk } from './london-west-end.js';
const TAU=Math.PI*2;
export const PARIS_STONE=Object.freeze({stone:'#b8ab91',light:'#d5c8ac',shadow:'#756e62',roof:'#3d4954',patina:'#52766c',gold:'#b39352',glass:'#334f59',dark:'#2d363e',brick:'#865b4b'});
const meta=(kind,label,nameZh,width,depth,height,features)=>Object.freeze({kind,label,nameZh,width,depth,height,radius:Math.hypot(width,depth)/2+8,family:'monument',features:Object.freeze(features)});
export const PARIS_MONUMENTS=Object.freeze([
 meta('notre-dame','Notre-Dame de Paris','巴黎圣母院',170,210,220,['twin square towers','rose window','flying buttresses','slender spire']),
 meta('sacre-coeur','Sacré-Cœur','圣心堂',190,150,230,['clustered white domes','rear campanile','arched portico']),
 meta('pantheon','Panthéon','先贤祠',190,150,215,['columned portico','triple drum dome','cross plan']),
 meta('invalides','Dôme des Invalides','荣军院',190,140,250,['gilded ribbed dome','lantern','four corner pavilions']),
 meta('sainte-chapelle','Sainte-Chapelle','圣礼拜堂',120,190,210,['tall stained glass','buttress pinnacles','slender flèche']),
 meta('madeleine','La Madeleine','玛德莲教堂',190,130,145,['peristyle temple','deep pediment','fluted columns']),
 meta('saint-sulpice','Saint-Sulpice','圣叙尔皮斯教堂',190,145,195,['unequal twin towers','double arcaded portico','balustrade']),
 meta('saint-eustache','Saint-Eustache','圣厄斯塔什教堂',185,160,200,['gothic nave','unfinished south tower','flying buttresses']),
 meta('tour-saint-jacques','Tour Saint-Jacques','圣雅克塔',88,88,205,['flamboyant tracery','corner pinnacles','four tall belfry faces']),
 meta('institut-de-france','Institut de France','法兰西学会',205,125,180,['central copper dome','curving wings','classical entrance']),
]);

// Paris-local surface vocabulary. These helpers never alter shared city builders.
export function parisKit(mesh,item){
 const f=frame(mesh,item),C=PARIS_STONE;
 const panel=(x,y,z,w,h,color=C.glass)=>f.quad([x-w/2,y-h/2,z],[x-w/2,y+h/2,z],[x+w/2,y+h/2,z],[x+w/2,y-h/2,z],color);
 const stroke=(a,b,w,color=C.light)=>{const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,ox=-dy/len*w/2,oy=dx/len*w/2;f.quad([a[0]-ox,a[1]-oy,a[2]],[a[0]+ox,a[1]+oy,a[2]],[b[0]+ox,b[1]+oy,b[2]],[b[0]-ox,b[1]-oy,b[2]],color);};
 const window=(x,y,z,w,h,color=C.glass)=>{panel(x,y,z,w+3,h+3,C.shadow);panel(x,y,z-.16,w,h,color);panel(x,y,z-.32,.8,h,C.light);panel(x,y+h*.08,z-.32,w,.8,C.light);panel(x,y-h/2-2,z-.38,w+5,2,C.light);};
 const arch=(x,b,z,w,h,pointed=false,color=C.glass)=>{
  const r=w/2,sy=b+h-(pointed?r*1.35:r),outline=[];
  for(let i=0;i<=12;i++){const u=i/12,xx=-r+u*w;outline.push([x+xx,sy+(pointed?(1-Math.abs(xx/r))**.7*r*1.35:Math.sqrt(Math.max(0,r*r-xx*xx))),z]);}
  panel(x,(b+sy)/2,z,w,sy-b,color);
  for(let i=0;i<12;i++){f.tri([x,sy,z],outline[i],outline[i+1],color);stroke(outline[i].map((v,k)=>k===2?v-.25:v),outline[i+1].map((v,k)=>k===2?v-.25:v),1.7,C.light);}
  for(const side of [-1,1])panel(x+side*(r+.8),(b+sy)/2,z-.3,1.6,sy-b,C.light);
  panel(x,b+h*.42,z-.5,.8,h*.8,C.light);panel(x,sy-2,z-.5,w,.8,C.light);
 };
 const rose=(x,y,z,r)=>{frontDisk(f,x,y,z,r+2,C.light,0,24);frontDisk(f,x,y,z-.2,r,C.glass,0,24);for(let i=0;i<12;i++){const a=i/12*TAU;stroke([x,y,z-.4],[x+Math.cos(a)*r,y+Math.sin(a)*r,z-.4],.8,C.light);}frontDisk(f,x,y,z-.55,r*.25,C.patina,0,12);};
 const roof=(x,y,z,w,d,h,color=C.roof)=>{const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],e=[x-w/2,y,z+d/2],p=[x,y+h,z-d/2],q=[x,y+h,z+d/2];f.quad(a,e,q,p,color);f.quad(p,q,c,b,color);f.tri(a,p,b,C.shadow);f.tri(e,c,q,C.shadow);};
 const mansard=(x,y,z,w,d,h,color=C.roof)=>{const ring=(yy,inset)=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sz])=>[x+sx*(w/2-inset),yy,z+sz*(d/2-inset)]),a=ring(y,0),b=ring(y+h*.78,Math.min(w,d)*.12),c=ring(y+h,Math.min(w,d)*.27);for(let i=0;i<4;i++){let j=(i+1)%4;f.quad(a[i],b[i],b[j],a[j],color);f.quad(b[i],c[i],c[j],b[j],color);}f.quad(...[...c].reverse(),color);};
 const dome=(x,y,z,r,h,color=C.patina)=>{const p=(a,t)=>[x+Math.cos(a)*Math.cos(t)*r,y+Math.sin(t)*h,z+Math.sin(a)*Math.cos(t)*r];for(let i=0;i<8;i++)for(let j=0;j<24;j++){const a=j/24*TAU,b=(j+1)/24*TAU,t=i/8*Math.PI/2,u=(i+1)/8*Math.PI/2;if(i===7)f.tri(p(a,t),[x,y+h,z],p(b,t),color);else f.quad(p(a,t),p(a,u),p(b,u),p(b,t),color);}};
 const col=(x,y,z,h,r=3.5)=>{f.cone(x,y,z,r*1.4,3,C.light,12,r*1.4);f.cone(x,y+3,z,r,h-7,C.stone,12,r*.86);f.box(x,y+h-2,z,r*2.7,4,r*2.7,C.light);};
 const pediment=(x,y,z,w,h,d=12)=>{f.tri([x-w/2,y,z],[x,y+h,z],[x+w/2,y,z],C.light);f.tri([x-w*.39,y+3,z-.25],[x,y+h-4,z-.25],[x+w*.39,y+3,z-.25],C.shadow);f.quad([x-w/2,y,z],[x-w/2,y,z+d],[x,y+h,z+d],[x,y+h,z],C.roof);f.quad([x,y+h,z],[x,y+h,z+d],[x+w/2,y,z+d],[x+w/2,y,z],C.roof);};
 const cornice=(x,y,z,w,d)=>{f.box(x,y,z,w,2.5,d,C.light);f.box(x,y-3,z,w-3,3,d-3,C.shadow);};
 const statue=(x,y,z,h=10)=>{f.cone(x,y,z,h*.15,h*.7,C.light,7,h*.09);f.cone(x,y+h*.73,z,h*.12,h*.23,C.light,8,h*.08);};
 const face=(x,z,angle)=>{const p=f.p(x,0,z);return parisKit(mesh,{...item,x:p[0],z:p[2],angle:(item.angle||0)+angle});};
 return {f,C,panel,stroke,window,arch,rose,roof,mansard,dome,col,pediment,cornice,statue,face,
  base:(w,d)=>f.box(0,2,0,w,4,d,C.shadow),detail:draw=>details(mesh,draw),
  beam:(a,b,w=1.5,color=C.light)=>beam(mesh,f.p(...a),f.p(...b),w,color)};
}

function notreDame(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(166,206);
 f.box(0,52,12,68,96,168,C.stone);for(const side of [-1,1]){f.box(side*49,28,23,30,48,144,C.stone);f.box(side*52,75,-73,38,142,45,C.stone);}f.box(0,49,-88,118,90,16,C.stone);
 k.detail(()=>{k.roof(0,100,12,75,166,38);for(const side of [-1,1]){
  k.cornice(side*52,147,-73,42,49);for(const x of [-8,8])k.arch(side*52+x,107,-96,11,29,true);for(const y of [44,89,101])k.cornice(side*52,y,-73,39,46);
  const g=k.face(side*65,23,side*Math.PI/2);for(let z=-54;z<=54;z+=27)g.arch(z,29,-.3,15,38,true);
  for(let z=-44;z<=72;z+=29){f.box(side*77,35,z,7,62,8,C.shadow);f.cone(side*77,66,z,4,14,C.light,4,0);k.beam([side*77,64,z],[side*36,97,z],3.2,C.light);k.beam([side*69,51,z],[side*36,78,z],1.8,C.shadow);}
 }
 for(const x of [-35,0,35])k.arch(x,6,-96.5,22,39,true);k.rose(0,76,-96.8,17);
 for(let x=-48;x<=48;x+=12){k.arch(x,96,-97,7,10);k.statue(x,48,-97,6);}
 f.cone(0,138,25,10,16,C.patina,8,7);f.cone(0,154,25,7,62,C.roof,8,0);f.box(0,216,25,1.4,8,1.4,C.gold);f.box(0,215,25,6,1.2,1.4,C.gold);
 });
}
function sacreCoeur(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k,stone='#cec5af';k.base(186,146);
 f.box(0,48,4,113,88,93,stone);f.box(0,49,-49,131,90,26,stone);f.box(0,97,51,36,186,32,stone);
 for(const side of [-1,1])f.cone(side*58,4,-7,25,79,stone,20,25);
 k.detail(()=>{for(let i=0;i<4;i++)f.box(0,5+i*2,-66+i*3,139-i*7,2,8,stone);
  f.cone(0,92,1,33,35,stone,24,33);k.dome(0,127,1,36,61,stone);f.cone(0,188,1,9,16,stone,16,7);k.dome(0,204,1,9,11,stone);f.box(0,222,1,1.5,16,1.5,C.gold);f.box(0,223,1,7,1.3,1.3,C.gold);
  for(const side of [-1,1]){k.dome(side*58,83,-7,26,33,stone);f.cone(side*58,116,-7,3.4,14,C.gold,8,0);k.arch(side*58,33,-32.5,18,33);for(const x of [-11,11])k.arch(side*58+x,16,-32.6,9,15);}
  for(const x of [-41,0,41]){k.arch(x,13,-62.3,26,37);k.rose(x,72,-62.7,9);}
  for(const x of [-65,-22,22,65])k.col(x,5,-63,43,3);
  for(const x of [-10,10])k.arch(x,145,34.5,11,30);k.cornice(0,191,51,40,36);k.roof(0,192,51,38,34,17,C.roof);
 });
}
function pantheon(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(186,146);f.box(0,51,9,154,94,78,C.stone);f.box(0,55,10,84,102,119,C.stone);
 for(const x of [-58,-35,-12,12,35,58])k.col(x,8,-57,66,4.4);
 f.cone(0,105,13,34,29,C.stone,24,34);
 k.detail(()=>{k.cornice(0,78,-47,137,29);k.pediment(0,80,-66,145,28,35);k.roof(0,106,10,84,113,17);k.dome(0,134,13,36,48,C.roof);f.cone(0,182,13,9,21,C.stone,16,9);k.dome(0,203,13,10,9);f.cone(0,212,13,2,3,C.gold,8,0);
  for(let i=0;i<16;i++){const a=i/16*TAU;k.col(Math.cos(a)*35,109,13+Math.sin(a)*35,25,1.8);}
  for(const side of [-1,1]){const g=k.face(side*77,9,side*Math.PI/2);for(const x of [-24,0,24])g.arch(x,24,-.4,13,35);}
  for(const x of [-27,0,27])k.arch(x,13,-50.5,15,43);k.panel(0,86,-66.5,85,4,C.shadow);
 });
}
function invalides(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(186,136);f.box(0,47,2,112,86,98,C.stone);for(const x of [-74,74])f.box(x,31,8,34,54,96,C.stone);f.cone(0,90,4,34,37,C.stone,24,34);
 k.detail(()=>{k.cornice(0,91,2,118,102);for(const x of [-44,-22,22,44])k.col(x,9,-51,58,3.6);k.pediment(0,73,-55,104,26,20);k.arch(0,9,-51,22,49);
  k.dome(0,127,4,38,72,C.gold);for(let i=0;i<12;i++){const a=i/12*TAU;for(let j=0;j<5;j++){const t=j/5*Math.PI/2,u=(j+1)/5*Math.PI/2;k.beam([Math.cos(a)*Math.cos(t)*38.3,127+Math.sin(t)*72,4+Math.sin(a)*Math.cos(t)*38.3],[Math.cos(a)*Math.cos(u)*38.3,127+Math.sin(u)*72,4+Math.sin(a)*Math.cos(u)*38.3],.8,C.light);}}
  f.cone(0,199,4,9,24,C.dark,16,8);for(let i=0;i<8;i++){const a=i/8*TAU;k.col(Math.cos(a)*9,200,4+Math.sin(a)*9,23,1.1);}k.dome(0,223,4,10,10,C.gold);f.cone(0,233,4,3,13,C.gold,8,.7);f.box(0,246,4,1.3,8,1.3,C.gold);f.box(0,246,4,6,1,1,C.gold);
  for(const x of [-73,73])for(const z of [-35,45]){f.box(x,65,z,26,16,26,C.stone);k.mansard(x,73,z,29,29,23);f.cone(x,96,z,1.7,9,C.gold,8,0);}
  for(const x of [-73,73])for(const y of [24,45])k.window(x,y,-41,12,16);
 });
}
function sainteChapelle(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(116,186);f.box(0,62,6,65,116,153,C.stone);f.cone(0,4,60,33,116,C.stone,10,33);
 k.detail(()=>{k.roof(0,120,2,72,157,35);for(const side of [-1,1]){
  const g=k.face(side*33,0,side*Math.PI/2);for(let x=-60;x<=60;x+=24)g.arch(x,45,-.4,15,65,true,x%48?'#4b547c':'#536e80');
  for(let z=-69;z<=75;z+=24){f.box(side*44,61,z,6,114,8,C.light);k.beam([side*52,16,z],[side*35,105,z],2.4,C.shadow);f.cone(side*44,119,z,4,20,C.light,4,0);}
 }
 k.rose(0,88,-71.2,20);k.arch(0,9,-71.3,26,34,true);k.pediment(0,122,-74,70,31,7);
 f.cone(0,155,14,8,12,C.patina,8,6);f.cone(0,167,14,6,40,C.roof,8,0);f.box(0,207,14,1,6,1,C.gold);
 });
}
function madeleine(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(186,126);f.box(0,51,0,136,86,74,C.stone);
 for(const z of [-50,50])for(let x=-78;x<=78;x+=26)k.col(x,10,z,85,4.6);
 for(const x of [-79,79])for(const z of [-25,0,25])k.col(x,10,z,85,4.6);
 k.detail(()=>{for(let i=0;i<4;i++)f.box(0,5+i*2,-57+i*2,180-i*5,2,9,C.light);k.cornice(0,98,0,174,112);k.roof(0,103,0,176,112,37);k.pediment(0,105,-57,174,36,9);for(let x=-54;x<=54;x+=18)k.statue(x,109,-58,9+(1-Math.abs(x)/60)*8);k.arch(0,14,-37.3,26,59);for(const x of [-44,44])k.panel(x,52,-37.4,24,44,C.shadow);});
}
function saintSulpice(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(186,141);f.box(0,48,9,101,88,115,C.stone);f.box(0,48,-45,172,88,29,C.stone);
 for(const [x,h]of[[-64,185],[64,168]])f.box(x,h/2+4,-39,36,h,40,C.stone);
 k.detail(()=>{k.roof(0,92,10,108,106,27);for(const y of [10,52])for(const x of [-40,-20,0,20,40]){k.arch(x,y,-60.1,13,31);k.col(x-8,y,-61,34,1.6);}for(const y of [45,89])k.cornice(0,y,-45,174,32);
  for(const [x,h]of[[-64,185],[64,168]]){for(const y of [106,145])if(y<h-20)for(const dx of [-8,8])k.arch(x+dx,y,-59.4,11,25);k.cornice(x,h+4,-39,40,44);f.cone(x,h+6,-39,16,4,C.roof,12,16);for(const side of [-1,1])f.box(x+side*17,h/2+4,-59.6,2,h-6,.8,C.light);}
  for(let x=-48;x<=48;x+=12)k.statue(x,92,-59,8);k.pediment(0,96,-61,82,19,8);
 });
}
function saintEustache(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(181,156);f.box(0,53,8,78,98,130,C.stone);f.box(0,38,17,141,68,110,C.stone);f.box(-58,89,-45,31,170,35,C.stone);f.box(58,60,-45,31,112,35,C.stone);f.box(0,45,-51,137,82,17,C.stone);
 k.detail(()=>{k.roof(0,102,8,84,134,37);k.rose(0,83,-61,19);for(const x of [-35,0,35])k.arch(x,8,-61.5,21,40,true);for(const side of [-1,1]){const g=k.face(side*71,17,side*Math.PI/2);for(let z=-39;z<=49;z+=22)g.arch(z,22,-.4,13,37,true);for(let z=-30;z<=58;z+=22){f.box(side*81,39,z,5,69,7,C.light);k.beam([side*81,72,z],[side*40,104,z],2.1,C.light);f.cone(side*81,74,z,3,15,C.light,4,0);}}
  for(const dx of [-7,7])k.arch(-58+dx,132,-63,10,31);k.cornice(-58,175,-45,35,39);f.cone(-58,178,-45,15,15,C.roof,8,8);f.cone(-58,193,-45,3,7,C.gold,8,0);k.cornice(58,119,-45,35,39);
 });
}
function saintJacques(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(84,84);f.box(0,87,0,48,166,48,C.stone);
 for(const x of [-28,28])for(const z of [-28,28])f.box(x,91,z,10,174,10,C.light);
 k.detail(()=>{for(const [x,z,a]of[[0,-24.4,0],[24.4,0,Math.PI/2],[0,24.4,Math.PI],[-24.4,0,-Math.PI/2]]){const g=k.face(x,z,a);for(const xx of [-11,11]){g.arch(xx,79,-.2,14,67,true);g.arch(xx,31,-.2,14,28,true);}for(const xx of [-18,0,18])g.panel(xx,117,-.7,1.3,88,C.light);for(const y of [29,73,154,168])g.panel(0,y,-1,49,3,C.light);g.rose(0,64,-.8,7);}
  for(const x of [-28,28])for(const z of [-28,28]){f.cone(x,178,z,6,22,C.light,4,0);k.statue(x,196,z,9);}
  for(let x=-18;x<=18;x+=9)for(const z of [-25,25])f.box(x,174,z,3,10,3,C.light);for(let z=-18;z<=18;z+=9)for(const x of [-25,25])f.box(x,174,z,3,10,3,C.light);
 });
}
function institut(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(201,121);f.box(0,45,13,71,82,73,C.stone);
 for(const side of [-1,1])for(let i=0;i<3;i++){const x=side*(48+i*18),z=17-i*i*4;f.box(x,33,z,24,58,43,C.stone);}
 f.cone(0,86,13,28,24,C.stone,24,28);
 k.detail(()=>{k.dome(0,110,13,32,43);f.cone(0,153,13,7,16,C.stone,12,6);k.dome(0,169,13,7,8);f.cone(0,177,13,1.5,3,C.gold,8,0);
  for(const x of [-25,-12,12,25])k.col(x,8,-25,56,3);k.pediment(0,69,-30,77,22,13);k.arch(0,8,-24,20,43);
  for(const side of [-1,1])for(let i=0;i<3;i++){const x=side*(48+i*18),z=17-i*i*4;k.mansard(x,62,z,25,45,17);for(const y of [20,43])k.window(x,y,z-22,11,15);k.cornice(x,61,z,25,45);}
  for(let i=0;i<12;i++){const a=i/12*TAU;k.col(Math.cos(a)*28.3,90,13+Math.sin(a)*28.3,20,1.4);}
 });
}
const BUILDERS=Object.freeze({'notre-dame':notreDame,'sacre-coeur':sacreCoeur,pantheon,invalides,'sainte-chapelle':sainteChapelle,madeleine,'saint-sulpice':saintSulpice,'saint-eustache':saintEustache,'tour-saint-jacques':saintJacques,'institut-de-france':institut});
export function addParisMonument(mesh,item){const draw=BUILDERS[item.kind];if(!draw)return false;draw(mesh,item);return true;}
