/** Ten Paris cultural landmarks, modelled for the street-level racing camera.
 * Local -Z is the frontage. Institution/architectural references are retained
 * in each definition; these are compact interpretations rather than surveys.
 * Solids collide, while separated glazing, tracery and lettering stay light.
 */
import {frame,details,word,frontDisk,pediment} from './london-west-end.js';
const TAU=Math.PI*2;
const definitions=[
 ['musee-carnavalet','Musée Carnavalet','卡纳瓦雷博物馆',190,135,125,['Renaissance courtyard','mansard pavilions','courtyard statue'],'https://www.carnavalet.paris.fr/le-musee/lhistoire'],
 ['centre-pompidou','Centre Pompidou','蓬皮杜中心',230,145,170,['external colour-coded services','diagonal escalator','exposed structural grid'],'https://www.centrepompidou.fr/en/centre-pompidou-is-transforming-itself/an-iconic-architecture'],
 ['fondation-louis-vuitton','Fondation Louis Vuitton','路易威登基金会',210,160,165,['twelve curved glass sails','iceberg galleries','timber and steel ribs'],'https://www.fondationlouisvuitton.fr/en/fondation/the-building'],
 ['philharmonie-paris','Philharmonie de Paris','巴黎爱乐厅',210,155,150,['angular mineral envelope','silver folded ribbons','bird mosaic'],'https://philharmoniedeparis.fr/en/discover/philharmonie'],
 ['la-geode','La Géode','球幕影院',155,135,130,['faceted mirror sphere','triangular steel panels','reflecting pool'],'https://www.lageode.fr/'],
 ['institut-monde-arabe','Institut du monde arabe','阿拉伯世界研究院',190,120,135,['geometric mashrabiya screens','glass rooftop pavilion','curved river facade'],'https://www.imarabe.org/fr/batiment-et-son-histoire'],
 ['bnf-francois-mitterrand','Bibliothèque François-Mitterrand','密特朗国家图书馆',230,165,195,['four open-book towers','sunken forest garden','timber esplanade'],'https://www.bnf.fr/fr/le-site-francois-mitterrand'],
 ['gare-du-nord','Gare du Nord','巴黎北站',235,135,150,['monumental neoclassical arches','city statues','glazed train sheds'],'https://www.garesetconnexions.sncf/fr/histoire-gare-du-nord'],
 ['gare-de-lyon','Gare de Lyon','巴黎里昂站',225,135,215,['four-face clock tower','Belle Époque frontage','Train Bleu entrance'],'https://www.garesetconnexions.sncf/fr/gares-services/paris-gare-lyon'],
 ['moulin-rouge','Moulin Rouge','红磨坊',150,105,150,['red windmill','four lattice sails','illuminated cabaret marquee'],'https://www.moulinrouge.fr/le-moulin-rouge/lhistoire/grandes-periodes/'],
];
export const PARIS_CULTURE=Object.freeze(definitions.map(([kind,label,nameZh,width,depth,height,features,source])=>Object.freeze({kind,label,nameZh,width,depth,height,radius:Math.hypot(width,depth)/2+8,family:'culture',features:Object.freeze(features),source})));
const C={stone:'#b6a88d',light:'#d0bea0',shade:'#776f60',slate:'#374550',iron:'#34434b',glass:'#496977',steel:'#9ba9a9',gold:'#c29b58',red:'#9d3b38',green:'#386653'};
function panel(f,x,y,z,w,h,c,em=0){f.quad([x-w/2,y-h/2,z],[x-w/2,y+h/2,z],[x+w/2,y+h/2,z],[x+w/2,y-h/2,z],c,em);}
function rod(f,a,b,w,c){
 const delta=b.map((n,i)=>n-a[i]),length=Math.hypot(...delta);if(length<1e-6)return;
 const axis=delta.map(n=>n/length),ref=Math.abs(axis[1])>.9?[1,0,0]:[0,1,0];
 const cross=(p,q)=>[p[1]*q[2]-p[2]*q[1],p[2]*q[0]-p[0]*q[2],p[0]*q[1]-p[1]*q[0]],raw=cross(axis,ref),v=raw.map(n=>n/Math.hypot(...raw));
 for(const n of [v,cross(axis,v)])f.quad(a.map((p,i)=>p-n[i]*w/2),b.map((p,i)=>p-n[i]*w/2),b.map((p,i)=>p+n[i]*w/2),a.map((p,i)=>p+n[i]*w/2),c);
}
function base(f,w,d,c=C.shade){f.box(0,2,0,w,4,d,c);}
function sign(f,text,x,y,z,w,h=5,c=C.light){panel(f,x,y,z,w+6,h+5,C.iron);word(f,text,x,y-h/2,z-.35,h,w,c,.08);}
function win(f,x,y,z,w,h){panel(f,x,y,z,w+2,h+3,C.light);panel(f,x,y,z-.25,w,h,C.glass);panel(f,x,y,z-.5,.7,h,C.shade);panel(f,x,y+1,z-.5,w,.7,C.shade);}
function arch(f,x,b,z,w,h,trim=C.light,glass=C.glass){
 const r=w/2,sy=b+h-r;panel(f,x,(b+sy)/2,z,w,sy-b,glass);
 for(let i=0;i<10;i++){const a=i/10*Math.PI,t=(i+1)/10*Math.PI;
  f.tri([x,sy,z],[x+Math.cos(a)*r,sy+Math.sin(a)*r,z],[x+Math.cos(t)*r,sy+Math.sin(t)*r,z],glass);
  f.quad([x+Math.cos(a)*r,sy+Math.sin(a)*r,z-.3],[x+Math.cos(t)*r,sy+Math.sin(t)*r,z-.3],[x+Math.cos(t)*(r+2),sy+Math.sin(t)*(r+2),z-.3],[x+Math.cos(a)*(r+2),sy+Math.sin(a)*(r+2),z-.3],trim);
 }
 for(const s of [-1,1])panel(f,x+s*(r+1),(b+sy)/2,z-.3,2,sy-b,trim);
 panel(f,x,b+h*.43,z-.6,.8,h*.82,C.iron);panel(f,x,sy,z-.6,w,.8,C.iron);
}
function mansard(f,x,y,z,w,d,h){
 const bottom=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]],top=bottom.map(([a,b])=>[a*.77,b*.72]);
 for(let k=0;k<4;k++){const n=(k+1)%4;f.quad([x+bottom[k][0],y,z+bottom[k][1]],[x+top[k][0],y+h,z+top[k][1]],[x+top[n][0],y+h,z+top[n][1]],[x+bottom[n][0],y,z+bottom[n][1]],k%2?C.slate:'#45535c');}
 f.quad(...top.map(([a,b])=>[x+a,y+h,z+b]),'#4c5a60');
 for(let dx=-w*.36;dx<=w*.36;dx+=18){panel(f,x+dx,y+h*.37,z-d*.44,7,9,C.light);panel(f,x+dx,y+h*.37,z-d*.44-.25,4,6,C.glass);}
}
function statue(f,x,y,z,h=15){f.cone(x,y,z,h*.14,h*.63,C.light,8,h*.08);f.cone(x,y+h*.66,z,h*.1,h*.19,C.light,8,h*.08);rod(f,[x,y+h*.46,z],[x+h*.23,y+h*.69,z],h*.1,C.light);}
function clock(f,x,y,z,r){frontDisk(f,x,y,z,r,C.light,0,24);frontDisk(f,x,y,z-.22,r*.83,'#e0d3b7',0,24);for(let i=0;i<12;i++){const a=i/12*TAU;rod(f,[x+Math.sin(a)*r*.69,y+Math.cos(a)*r*.69,z-.5],[x+Math.sin(a)*r*.79,y+Math.cos(a)*r*.79,z-.5],.65,C.iron);}rod(f,[x,y,z-.7],[x-r*.4,y+r*.25,z-.7],1,C.iron);rod(f,[x,y,z-.72],[x+r*.1,y+r*.61,z-.72],.8,C.iron);}
function solidCircle(mesh,f,x,b,z,r,h){if(mesh.colliders){const p=f.p(x,b,z);mesh.colliders.push({id:`prop-${mesh.colliders.length}`,type:'circle',x:p[0],y:p[2],radius:r,minHeight:p[1],maxHeight:p[1]+h});}}


function carnavalet(mesh,item){
 const f=frame(mesh,item);base(f,190,135);
 f.box(0,39,43,170,70,37,C.stone);
 for(const side of [-1,1]){f.box(side*71,34,-6,34,60,106,C.stone);f.box(side*43,22,-53,42,36,22,C.stone);}
 // A real open front gate reveals the paved court and its central sculpture.
 f.box(0,54,-53,46,28,22,C.stone);
 details(mesh,()=>{
  mansard(f,0,74,43,175,42,27);mansard(f,0,68,-53,49,27,25);
  for(const side of [-1,1]){mansard(f,side*71,64,-6,38,110,21);f.box(side*71,88,38,20,9,20,C.slate);f.cone(side*71,92,38,11,15,C.slate,4,0);}
  for(let x=-72;x<=72;x+=18)for(const y of [22,51])win(f,x,y,23.9,10,17);
  for(let x=-72;x<=72;x+=18)panel(f,x+7.5,40,23.4,2,61,C.light);
  for(const side of [-1,1]){
   const p=f.p(side*53.7,0,0),g=frame(mesh,{...item,x:p[0],z:p[2],angle:(item.angle||0)+side*Math.PI/2});
   for(const x of [-35,-13,9,31])for(const y of [22,47])win(g,x,y,-.3,10,15);
   for(const x of [side*31,side*54])arch(f,x,7,-64.3,14,23);
  }
  for(const z of [-64.6,23.5]){panel(f,0,64,z,42,2.6,C.light);pediment(f,0,65,z-.3,43,13,4,C.light,C.shade);}
  arch(f,0,45,-64.3,15,18);sign(f,'CARNAVALET',0,39,-64.5,38,3.6);
  f.box(0,7,2,17,7,17,C.shade);statue(f,0,11,2,26);
  for(const x of [-38,38])for(const z of [-18,14]){f.box(x,5,z,24,2,20,'#47684a');f.box(x,6,z,19,2,15,'#617a4c');}
  for(const side of [-1,1]){f.box(side*44,106,43,8,18,10,C.stone);f.box(side*44,117,43,11,4,12,C.light);}
 });
}
function pompidou(mesh,item){
 const f=frame(mesh,item);base(f,230,145);
 f.box(0,78,8,200,148,100,'#3e5d69');
 for(const x of [-103,103])for(const z of [-49,56])f.box(x,84,z,5,160,5,C.steel);
 details(mesh,()=>{
  for(const y of [15,39,63,87,111,135,157]){
   for(const z of [-49,59]){f.box(0,y,z,218,3,3,C.steel);for(let x=-100;x<100;x+=25){rod(f,[x,y-8,z],[x+25,y+8,z],1.1,C.steel);rod(f,[x,y+8,z],[x+25,y-8,z],1.1,C.steel);}}
   for(const x of [-104,104])f.box(x,y,5,4,3,112,C.steel);
  }
  for(let x=-90;x<=90;x+=20)for(const z of [-42.5,58.5])panel(f,x,80,z,1.2,145,'#78949a');
  for(const [x,c,r]of [[-92,'#34789c',4.6],[-71,'#4b8872',3.5],[69,'#bd9a49',2.5],[91,'#34789c',4.7]]){
   f.cone(x,6,65,r,153,c,10,r);f.cone(x,159,65,r*1.35,6,c,10,r*1.35);
   for(const y of [22,70,118])rod(f,[x,y,65],[x+(x<0?14:-14),y,65],r*1.4,c);
  }
  // Transparent escalator skin around the familiar red diagonal circulation.
  const a=[-96,18,-61],b=[96,144,-61];rod(f,a,b,12,'#a83e3c');
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),ux=-dy/len,uy=dx/len;
  for(let i=0;i<10;i++){const aa=i/10*TAU,bb=(i+1)/10*TAU,p=(v,t)=>[v[0]+ux*Math.cos(t)*8,v[1]+uy*Math.cos(t)*8,v[2]+Math.sin(t)*8];f.quad(p(a,aa),p(a,bb),p(b,bb),p(b,aa),i%3?'#66828b':'#b1b8ae');}
  for(let i=0;i<=12;i++){const t=i/12,q=a.map((n,k)=>n+(b[k]-n)*t);for(let j=0;j<8;j++){const aa=j/8*TAU,bb=(j+1)/8*TAU;rod(f,[q[0]+ux*Math.cos(aa)*8.3,q[1]+uy*Math.cos(aa)*8.3,q[2]+Math.sin(aa)*8.3],[q[0]+ux*Math.cos(bb)*8.3,q[1]+uy*Math.cos(bb)*8.3,q[2]+Math.sin(bb)*8.3],.7,C.steel);}}
  for(const x of [-90,-60,-30,0,30,60,90])arch(f,x,5,-43,17,21,C.steel,'#29434e');
  sign(f,'CENTRE POMPIDOU',0,162,-50,98,4.3);
 });
}
function vuitton(mesh,item){
 const f=frame(mesh,item);base(f,210,160,'#6e7775');
 for(const [x,z,w,d,h]of [[-37,0,65,60,71],[26,17,62,72,87],[0,-32,63,42,57]])f.box(x,h/2+4,z,w,h,d,'#c2bba9');
 details(mesh,()=>{
  // Twelve individually curved glass sails; broad panels retain their shape
  // from the road, and the slender ribs stay readable without dense glazing.
  const sails=[[-61,2,37,57,91,-.4],[-30,39,53,78,91,.15],[15,35,58,78,100,-.2],[53,5,42,57,99,.38],[37,-35,42,74,88,.25],[-15,-43,22,77,91,-.2],[-62,-30,24,53,84,-.75],[-3,3,64,73,94,.52],[54,35,26,52,88,-.3],[0,-14,47,64,99,-.54],[-32,16,58,62,93,-.4],[29,-4,66,57,94,.3]];
  for(let k=0;k<sails.length;k++){
   const [x,z,y,w,h,a]=sails[k],cs=Math.cos(a),sn=Math.sin(a);
   const p=(u,v)=>{const xx=u*w/2*(.75+.25*v)+v*w*.11,zz=Math.sin(v*Math.PI)*12+u*u*4+v*h*.27;return [x+cs*xx-sn*zz,y+v*h*(.5+.5*Math.cos(u*Math.PI/2)),z+sn*xx+cs*zz];};
   for(let row=0;row<8;row++)for(let col=0;col<6;col++){const u=col/3-1,v=row/8;f.quad(p(u,v),p(u+1/3,v),p(u+1/3,v+1/8),p(u,v+1/8),['#839fa4','#729297','#a7b8b5'][k%3]);}
   for(const u of [-1,0,1])for(let row=0;row<5;row++)rod(f,p(u,row/5),p(u,(row+1)/5),u===0?1.2:.8,k%2?C.steel:'#a89372');
   for(const v of [.2,.6,1])rod(f,p(-1,v),p(1,v),.8,C.steel);
  }
  for(const x of [-37,26]){panel(f,x,27,-54,31,37,'#3a5c67');panel(f,x,27,-54.3,1,37,C.steel);}
  f.quad([-90,4.2,-70],[90,4.2,-70],[90,4.2,-58],[-90,4.2,-58],'#598a90',.12);
  sign(f,'FONDATION LOUIS VUITTON',0,12,-74,112,3.5);
 });
}
function philharmonie(mesh,item){
 const f=frame(mesh,item);base(f,210,155);
 f.box(-10,42,4,168,76,118,'#6e7778');f.box(7,78,7,108,72,85,'#929d9a');
 details(mesh,()=>{
  const profile=[[-99,10],[-94,54],[-56,100],[-24,129],[45,145],[81,94],[100,41],[95,10]];
  for(const z of [-65,64])for(let i=1;i<profile.length-1;i++)f.tri([profile[0][0],profile[0][1],z],[profile[i][0],profile[i][1],z],[profile[i+1][0],profile[i+1][1],z],z<0?'#78817f':'#697475');
  for(let i=0;i<profile.length;i++){const a=profile[i],b=profile[(i+1)%profile.length];f.quad([a[0],a[1],-65],[a[0],a[1],64],[b[0],b[1],64],[b[0],b[1],-65],i%2?'#9ba5a2':'#687477');}
  panel(f,-9,30,-65.3,170,19,'#365460');for(let x=-83;x<=75;x+=13)panel(f,x,30,-65.6,.9,19,C.steel);
  // Separate interlocking bird silhouettes on the matte envelope.
  for(let row=0;row<4;row++)for(let col=0;col<11;col++){
   const x=-72+col*13+(row%2)*4,y=55+row*12;if(row===3&&(x<-38||x>53))continue;
   const c=['#c4c7bc','#8c9692','#4c5c60'][(row+col)%3];f.tri([x-5,y+1,-65.5],[x,y+4,-65.5],[x+1,y-3,-65.5],c);f.tri([x+1,y-3,-65.5],[x+2,y+3,-65.5],[x+7,y+1,-65.5],c);
  }
  for(let j=0;j<3;j++){
   const points=[[-81+j*6,72+j*6,-67-j*2],[-33,84+j*10,-70-j*2],[28,74+j*11,-69-j*2],[88-j*4,98+j*6,-65-j*2]];
   for(let i=0;i<3;i++){const a=points[i],b=points[i+1];f.quad(a,b,[b[0],b[1]+5,b[2]+3],[a[0],a[1]+5,a[2]+3],j%2?'#b6c0bb':'#8eaaa9');}
  }
  // Folded aluminium galleries curl around both sides of the mineral body.
  // Their crisp edge seams remain visible when the racing view passes obliquely.
  for(let band=0;band<3;band++)for(let i=0;i<24;i++){
   const a=i/24*TAU,b=(i+1)/24*TAU,p=t=>[Math.cos(t)*90,42+band*17+Math.sin(t+.4)*8,Math.sin(t)*69];
   const u=p(a),v=p(b),top=q=>[q[0]*.96,q[1]+6,q[2]*.96];
   f.quad(u,v,top(v),top(u),i%4===0?'#b9c3bd':'#8e9e9d');
   rod(f,u,v,.85,'#c1c8be');rod(f,top(u),top(v),.7,'#5d767e');
  }
  sign(f,'PHILHARMONIE',-10,13,-66,96,4.3);
 });
}
function geode(mesh,item){
 const f=frame(mesh,item);base(f,155,135,'#596c70');
 const r=60,cy=65,slices=28,bands=14;
 for(let row=0;row<bands;row++){
  const a=-Math.PI/2+row/bands*Math.PI,b=-Math.PI/2+(row+1)/bands*Math.PI;
  const y=cy+r*Math.sin(a),top=cy+r*Math.sin(b),radius=r*Math.max(Math.cos(a),Math.cos(b));solidCircle(mesh,f,0,y,0,radius,top-y);
  const p=(lat,long)=>[Math.cos(long)*Math.cos(lat)*r,cy+Math.sin(lat)*r,Math.sin(long)*Math.cos(lat)*r];
  for(let i=0;i<slices;i++){
   const u=i/slices*TAU,v=(i+1)/slices*TAU,colors=row<6?['#657f79','#9fae9d','#748c85']:['#b4c6c3','#87a4af','#9ab7bc'];
   if(row>0)f.tri(p(a,u),p(b,u),p(a,v),colors[(i+row)%3]);if(row<bands-1)f.tri(p(a,v),p(b,u),p(b,v),colors[(i+row+1)%3]);
  }
 }
 details(mesh,()=>{
  for(let i=0;i<slices;i+=2)for(let row=2;row<bands-2;row++){
   const a=-Math.PI/2+row/bands*Math.PI,b=-Math.PI/2+(row+1)/bands*Math.PI,u=i/slices*TAU;
   rod(f,[Math.cos(u)*Math.cos(a)*60.2,cy+Math.sin(a)*60.2,Math.sin(u)*Math.cos(a)*60.2],[Math.cos(u)*Math.cos(b)*60.2,cy+Math.sin(b)*60.2,Math.sin(u)*Math.cos(b)*60.2],.35,'#547780');
  }
  f.quad([-74,4.2,-64],[74,4.2,-64],[74,4.2,64],[-74,4.2,64],'#3f7a86',.16);
  f.box(0,7,-52,37,6,24,C.shade);panel(f,0,14,-60,27,13,'#283f48');sign(f,'LA GEODE',0,24,-60.4,38,4.3);
 });
}
function mondeArabe(mesh,item){
 const f=frame(mesh,item);base(f,190,120);
 f.box(0,60,-5,178,112,86,'#536b72');f.box(13,122,-1,73,12,58,'#4c6a76');
 details(mesh,()=>{
  // The geometric diaphragms are the facade itself, not generic office glass.
  for(let row=0;row<6;row++)for(let col=0;col<10;col++){
   const x=-78+col*17.3,y=18+row*16.1,z=-48.4;panel(f,x,y,z,15.7,14.7,'#879a9c');
   const aperture=row%2?3.5:4.6;
   for(let k=0;k<8;k++){const a=k/8*TAU,b=(k+1)/8*TAU;
    f.tri([x,y,z-.25],[x+Math.cos(a)*aperture,y+Math.sin(a)*aperture,z-.25],[x+Math.cos(b)*aperture,y+Math.sin(b)*aperture,z-.25],C.iron);
    f.tri([x+Math.cos(a)*aperture,y+Math.sin(a)*aperture,z-.4],[x+Math.cos(a+.18)*6.4,y+Math.sin(a+.18)*6.4,z-.4],[x+Math.cos(b)*aperture,y+Math.sin(b)*aperture,z-.4],k%2?'#b0b9b1':'#647f83');
   }
   for(const sx of [-1,1])for(const sy of [-1,1])panel(f,x+sx*5.8,y+sy*5.2,z-.2,1.6,1.6,C.iron);
  }
  for(let i=0;i<18;i++){
   const a=i/18*Math.PI,b=(i+1)/18*Math.PI,p=(t,y)=>[Math.cos(t)*88,y,36+Math.sin(t)*19];
   f.quad(p(a,5),p(a,112),p(b,112),p(b,5),i%3?'#456573':'#6a858d');rod(f,p(a,5),p(a,112),.9,C.steel);
   for(const y of [22,43,64,85,106])rod(f,p(a,y),p(b,y),.7,C.steel);
  }
  for(const x of [-89,89])panel(f,x,60,-48.8,2,113,C.steel);
  panel(f,13,122,-30.5,70,9,'#728d96');for(let x=-18;x<=43;x+=10)panel(f,x,122,-30.8,.8,9,C.steel);
  f.box(0,9,-52,39,10,9,C.iron);sign(f,'INSTITUT DU MONDE ARABE',0,9,-57,121,3.7);
 });
}
function bnf(mesh,item){
 const f=frame(mesh,item);base(f,230,165,'#8f8065');
 // Four separate Ls make four open books around an actual open central garden.
 for(const sx of [-1,1])for(const sz of [-1,1]){
  f.box(sx*86,97,sz*55,33,186,36,'#58717a');f.box(sx*66,97,sz*64,40,186,18,'#647d84');
 }
 details(mesh,()=>{
  for(const sx of [-1,1])for(const sz of [-1,1]){
   for(const [x,z,w,d]of [[sx*86,sz*55,33,36],[sx*66,sz*64,40,18]]){
    for(const side of [-1,1]){
     const p=f.p(x,0,z+side*(d/2+.3)),g=frame(mesh,{...item,x:p[0],z:p[2],angle:(item.angle||0)+(side>0?Math.PI:0)});
     for(let y=12;y<188;y+=11)panel(g,0,y,-.2,w,1.1,'#c0b69b');
     for(let dx=-w/2+4;dx<w/2;dx+=7){panel(g,dx,98,-.4,.8,182,C.steel);for(const y of [38,82,126,170])panel(g,dx,y,-.6,3.5,8,'#8e8874');}
    }
    f.box(x,191,z,w+1,3,d+1,C.steel);
   }
  }
  f.box(0,4.2,0,96,.4,77,'#2b4d42');
  for(let i=0;i<19;i++){
   const x=-36+(i%5)*17+(i%2)*2,z=-25+Math.floor(i/5)*15,h=28+(i*7%19);
   f.cone(x,5,z,1.5,h,'#6d6650',6,1.2);f.cone(x,h*.35,z,7,h*.7,'#3c6854',7,2);f.cone(x,h*.68,z,6,h*.6,'#557b60',7,0);
  }
  for(let x=-108;x<=108;x+=8)f.quad([x,4.2,-80],[x+.5,4.2,-80],[x+.5,4.2,80],[x,4.2,80],'#726a58');
  for(const side of [-1,1]){f.box(0,6,side*44,105,2,3,C.steel);f.box(side*53,6,0,3,2,86,C.steel);}
  sign(f,'BIBLIOTHEQUE NATIONALE',0,10,-80.7,116,3.4);
 });
}
function trainShed(f,x,z,w,d,y,h){
 const p=(a,z)=>[x+Math.cos(a)*w/2,y+Math.sin(a)*h,z];
 for(let i=0;i<12;i++){const a=i/12*Math.PI,b=(i+1)/12*Math.PI;f.quad(p(a,z-d/2),p(b,z-d/2),p(b,z+d/2),p(a,z+d/2),i%3?'#65818a':'#9ba9a4');rod(f,p(a,z-d/2),p(a,z+d/2),.75,C.iron);}
 for(const zz of [z-d/2,z,z+d/2])for(let i=0;i<12;i++){const a=i/12*Math.PI,b=(i+1)/12*Math.PI;rod(f,p(a,zz),p(b,zz),1.1,C.iron);}
}
function gareNord(mesh,item){
 const f=frame(mesh,item);base(f,235,135);
 f.box(0,42,-26,222,76,63,C.stone);f.box(0,91,-26,118,22,63,C.stone);
 for(const sx of [-1,1])f.box(sx*71,35,33,76,62,57,'#71786e');
 details(mesh,()=>{
  trainShed(f,-56,30,101,66,66,33);trainShed(f,56,30,101,66,66,33);
  for(const x of [-38,0,38])arch(f,x,7,-58,27,57,C.light,'#3b535e');
  for(const x of [-98,-76,76,98]){arch(f,x,8,-58,14,33);win(f,x,58,-58.3,13,15);}
  for(const x of [-58,-20,20,58]){f.cone(x,7,-60,2.7,59,C.light,10,2.4);f.box(x,68,-60,8,5,8,C.light);}
  for(const y of [40,77,102])panel(f,0,y,-58.2,y===102?126:225,3,C.light);
  pediment(f,0,104,-60,127,23,50,C.light,C.shade);clock(f,0,111,-60.6,8.5);
  for(const x of [-100,-76,-52,52,76,100]){f.box(x,83,-47,10,5,10,C.shade);statue(f,x,86,-47,18);}
  for(const [x,y]of [[-53,112],[0,128],[53,112]]){f.box(x,y,-50,11,4,10,C.shade);statue(f,x,y+2,-50,21);}
  for(const x of [-84,84])for(let row=0;row<3;row++)panel(f,x,21+row*10,-58.2,25,1,C.shade);
  sign(f,'GARE DU NORD',0,91,-58.6,83,6);
 });
}
function gareLyon(mesh,item){
 const f=frame(mesh,item);base(f,225,135);
 f.box(-8,44,-18,199,80,77,C.stone);f.box(84,95,-21,38,182,40,C.stone);f.box(-17,37,38,175,66,49,'#7b8074');
 details(mesh,()=>{
  trainShed(f,-22,34,168,58,70,31);
  mansard(f,-15,84,-19,188,80,24);f.box(-22,104,-30,65,5,38,C.light);
  for(let x=-93;x<65;x+=25){arch(f,x,7,-57.2,17,32);win(f,x,63,-57.4,16,23);}
  for(const x of [-104,-67,-42,-17,8,33,57])panel(f,x,47,-57.8,2.4,73,C.light);
  for(const y of [41,79,84])panel(f,-18,y,-57.8,177,2.7,C.light);
  pediment(f,-19,87,-59,69,18,29,C.light,C.shade);
  for(const x of [-50,12]){f.box(x,111,-37,9,3,9,C.shade);statue(f,x,113,-37,17);}
  f.box(-18,38,-60,84,3,13,'#2e536a');panel(f,-18,34,-66.6,80,5,C.gold);
  sign(f,'LE TRAIN BLEU',-18,45,-58.4,79,4.5);
  for(const side of [-1,1])for(const dx of [-15,15])panel(f,84+dx,95,-41.5+side*.1,2.5,177,C.light);
  for(const y of [39,80,124,147,184])f.box(84,y,-21,42,3,44,C.light);
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
   const center=f.p(84,0,-21),g=frame(mesh,{...item,x:center[0],z:center[2],angle:(item.angle||0)+a});
   clock(g,0,164,-21.3,13);arch(g,0,91,-21.2,13,39,C.light,'#354850');
  }
  mansard(f,84,186,-21,43,44,18);f.cone(84,204,-21,7,7,C.slate,8,2);f.cone(84,211,-21,1.3,4,C.gold,6,0);
  sign(f,'GARE DE LYON',-18,15,-58.7,90,4.4);
 });
}
function moulinRouge(mesh,item){
 const f=frame(mesh,item);base(f,150,105,'#5f5250');
 f.box(0,29,6,140,50,84,'#7e3238');f.cone(-18,54,2,21,49,'#a43d3a',16,14);f.cone(-18,103,2,17,13,'#772d34',16,0);
 details(mesh,()=>{
  f.box(0,55,6,143,4,88,C.red);
  for(const x of [-53,-27,0,27,53])arch(f,x,8,-36.5,16,28,'#b34d49','#2a303c');
  for(const side of [-1,1]){panel(f,side*59,29,-37,15,33,'#c4a071');panel(f,side*59,29,-37.3,12,28,'#4b283d');f.tri([side*59-4,20,-37.6],[side*59+5,20,-37.6],[side*59,33,-37.6],'#db7767');frontDisk(f,side*59,36,-37.6,2.4,C.gold,0,10);}
  f.box(0,41,-42,145,5,18,'#a3393e');panel(f,0,39,-51.2,139,4,C.gold,.2);
  for(let x=-68;x<=68;x+=7)frontDisk(f,x,40,-51.5,.65,'#e2bb72',.7,6);
  sign(f,'MOULIN ROUGE',0,61,-39,123,8,'#e5b092');
  // Four open timber lattice wings, not four filled rectangles.
  const hub=[-18,111,-21];
  for(let k=0;k<4;k++){
   const a=Math.PI/4+k*Math.PI/2,along=[Math.cos(a),Math.sin(a)],across=[-along[1],along[0]];
   const p=(r,w)=>[hub[0]+along[0]*r+across[0]*w,hub[1]+along[1]*r+across[1]*w,hub[2]];
   rod(f,p(0,0),p(43,0),2.2,'#b7463f');
   for(const w of [-4.5,4.5])rod(f,p(12,w),p(43,w),1,'#d16c55');
   for(let r=12;r<=43;r+=5)rod(f,p(r,-4.5),p(r,4.5),1,'#d16c55');
  }
  frontDisk(f,hub[0],hub[1],hub[2]-.4,3.5,C.gold,0,16);
  for(const x of [-24,-12]){panel(f,x,80,-16.5,6,12,'#ead0a4');panel(f,x,80,-17,3.5,9,'#4d3e44');}
 });
}
const builders={'musee-carnavalet':carnavalet,'centre-pompidou':pompidou,'fondation-louis-vuitton':vuitton,'philharmonie-paris':philharmonie,'la-geode':geode,'institut-monde-arabe':mondeArabe,'bnf-francois-mitterrand':bnf,'gare-du-nord':gareNord,'gare-de-lyon':gareLyon,'moulin-rouge':moulinRouge};
export function addParisCulture(mesh,item){const draw=builders[item.kind];if(!draw)return false;draw(mesh,item);return true;}
