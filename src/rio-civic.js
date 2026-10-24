/** Rio's civic and cultural architecture, interpreted at roadside game scale.
 * Local -Z is the frontage. Institution sources document the identifying forms;
 * complete solids collide, separated glazing/ornaments use inexpensive surfaces. */
import {frame,details,word,frontDisk} from './london-west-end.js';
const TAU=Math.PI*2;
const modelFrame=(mesh,item)=>({...frame(mesh,item),angle:item.angle||0});
const definitions=[
 ['rio-theatro-municipal','Theatro Municipal','里约市立剧院',220,150,183,['green copper central roof and twin cupolas','gilded eagle','colonnaded theatre loggia'],'https://riotur.rio/que_fazer/theatromunicipal/'],
 ['rio-biblioteca-nacional','Biblioteca Nacional','巴西国家图书馆',200,138,158,['monumental stair and three bronze doors','giant paired columns','copper skylight and rooftop statuary'],'https://bndigital.bn.gov.br/exposicoes/biblioteca-nacional-as-maos-que-restauram-o-tempo/a-restauracao-da-fachada/'],
 ['rio-belas-artes','Museu Nacional de Belas Artes','国家美术博物馆',220,142,154,['three domed roof pavilions','rusticated academy facade','statues above the central portal'],'https://museusbr.museus.gov.br/arquitetura-museus-ibram/285007-2/'],
 ['rio-palacio-tiradentes','Palácio Tiradentes','蒂拉登特斯宫',212,150,172,['six monumental entrance columns','octagonal glazed dome','broad stair and bronze forecourt monument'],'https://palaciotiradentes.rj.gov.br/noticias/historias-dos-100-anos-do-palacio-a-fachada'],
 ['rio-paco-imperial','Paço Imperial','皇宫文化中心',208,144,106,['low colonial courtyard palace','terracotta hipped roofs','stone portals and dark balcony shutters'],'https://www.gov.br/iphan/pt-br/unidades-especiais/centro-cultural-paco-imperial'],
 ['rio-ccbb','Centro Cultural Banco do Brasil','巴西银行文化中心',192,148,149,['rounded corner banking facade','giant Ionic pilasters','glazed rotunda roof'],'https://riotur.rio/que_fazer/ccbb/'],
 ['rio-real-gabinete','Real Gabinete Português de Leitura','皇家葡萄牙文图书馆',150,120,161,['neo-Manueline carved frontage','three pointed upper windows','nautical medallions and four explorer statues'],'https://www.realgabinete.com.br/O-Real-Gabinete/Patrimonio-Artistico/Arquitetura'],
 ['rio-palacio-catete','Palácio do Catete','卡特蒂宫',188,138,145,['three rusticated palace storeys','dark bronze eagles on the parapet','iron balcony and central stained-glass skylight'],'https://museusbr.museus.gov.br/arquitetura-museus-ibram/284464-2/'],
 ['rio-museu-nacional','Museu Nacional · São Cristóvão','国家博物馆·圣克里斯托旺宫',224,146,150,['twin squared palace towers','long ochre neoclassical frontage','central pediment and rooftop statues'],'https://museunacional.ufrj.br/destaques/docs/livro-mn/mn_passadopresentefuturo.pdf'],
 ['rio-palacio-laranjeiras','Palácio das Laranjeiras','拉兰热拉斯宫',204,148,156,['Louis XIII pavilion roofs','arched ornamental garden loggia','double garden staircase and fountain'],'https://www.palaciolaranjeiras.rj.gov.br/PalacioLaranjeiras.aspx'],
];
export const RIO_CIVIC_LANDMARKS=Object.freeze(definitions.map(([kind,label,nameZh,width,depth,height,features,source])=>Object.freeze({kind,label,nameZh,width,depth,height,radius:Math.hypot(width,depth)/2+8,family:'civic',features:Object.freeze(features),source})));
const C={stone:'#aa9274',light:'#c8b798',shade:'#726657',ochre:'#b69c6e',rose:'#a68171',iron:'#303d40',glass:'#385c64',copper:'#397669',copperDark:'#28554d',gold:'#bc9652',tile:'#975b44',slate:'#34464b',bronze:'#655738'};
function panel(f,x,y,z,w,h,color){f.quad([x-w/2,y-h/2,z],[x-w/2,y+h/2,z],[x+w/2,y+h/2,z],[x+w/2,y-h/2,z],color);}
function stroke(f,a,b,w,color){
 const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)||1,ox=-dy/length*w/2,oy=dx/length*w/2;
 f.quad([a[0]-ox,a[1]-oy,a[2]],[a[0]+ox,a[1]+oy,a[2]],[b[0]+ox,b[1]+oy,b[2]],[b[0]-ox,b[1]-oy,b[2]],color);
}
function base(f,w,d){f.box(0,2,0,w,4,d,C.shade);}
function sign(f,text,x,y,z,w,h=4.6){panel(f,x,y,z,w+7,h+5,C.iron);word(f,text,x,y-h/2,z-.5,h,w,C.light,0);}
function window(f,x,y,z,w,h,trim=C.light,glass=C.glass){
 panel(f,x,y,z,w+3,h+3,trim);panel(f,x,y,z-.3,w,h,glass);
 panel(f,x,y,z-.6,.8,h,trim);panel(f,x,y+1,z-.6,w,.8,trim);panel(f,x,y-h/2-2,z-.7,w+6,1.7,trim);
}
function arch(f,x,b,z,w,h,trim=C.light,glass=C.glass){
 const r=w/2,sy=b+h-r;panel(f,x,(b+sy)/2,z,w,sy-b,glass);
 for(let i=0;i<10;i++){const a=i/10*Math.PI,t=(i+1)/10*Math.PI;
  f.tri([x,sy,z],[x+Math.cos(t)*r,sy+Math.sin(t)*r,z],[x+Math.cos(a)*r,sy+Math.sin(a)*r,z],glass);
  f.quad([x+Math.cos(a)*r,sy+Math.sin(a)*r,z-.3],[x+Math.cos(t)*r,sy+Math.sin(t)*r,z-.3],[x+Math.cos(t)*(r+2),sy+Math.sin(t)*(r+2),z-.3],[x+Math.cos(a)*(r+2),sy+Math.sin(a)*(r+2),z-.3],trim);
 }
 for(const side of [-1,1])panel(f,x+side*(r+1),(b+sy)/2,z-.3,2,sy-b,trim);
 panel(f,x,(b+sy)/2,z-.6,.8,sy-b,trim);panel(f,x,sy,z-.6,w,.8,trim);
}
function pointed(f,x,b,z,w,h){
 const sy=b+h*.61,r=w/2;panel(f,x,(b+sy)/2,z,w,sy-b,C.glass);
 f.tri([x-r,sy,z],[x,sy+h*.39,z],[x+r,sy,z],C.glass);
 for(const side of [-1,1]){panel(f,x+side*(r+1),(b+sy)/2,z-.3,2,sy-b,C.light);stroke(f,[x+side*(r+1),sy,z-.3],[x,b+h+2,z-.3],2.3,C.light);stroke(f,[x,b+h-4,z-.6],[x+side*r*.65,sy-2,z-.6],.8,C.light);}
 panel(f,x,b+h*.32,z-.6,.8,h*.64,C.light);panel(f,x,sy-3,z-.6,w,.8,C.light);
}
function pediment(f,x,y,z,w,h,d,color=C.light){
 f.tri([x-w/2,y,z],[x,y+h,z],[x+w/2,y,z],color);
 f.tri([x-w*.36,y+3,z-.4],[x,y+h-4,z-.4],[x+w*.36,y+3,z-.4],C.shade);
 f.quad([x-w/2,y,z],[x-w/2,y,z+d],[x,y+h,z+d],[x,y+h,z],color);
 f.quad([x,y+h,z],[x,y+h,z+d],[x+w/2,y,z+d],[x+w/2,y,z],color);
 f.box(x,y-1,z+d/2,w+4,3,d+2,color);
}
function hip(mesh,f,x,y,z,w,d,h,color=C.tile){
 const p=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]],top=p.map(([a,b])=>[a*.58,b*.38]);
 for(let i=0;i<4;i++){const n=(i+1)%4;f.quad([x+p[i][0],y,z+p[i][1]],[x+top[i][0],y+h,z+top[i][1]],[x+top[n][0],y+h,z+top[n][1]],[x+p[n][0],y,z+p[n][1]],color);}
 f.quad([x+top[0][0],y+h,z+top[0][1]],[x+top[3][0],y+h,z+top[3][1]],[x+top[2][0],y+h,z+top[2][1]],[x+top[1][0],y+h,z+top[1][1]],color);
 if(mesh.colliders){const p=f.p(x,y,z);for(let level=0;level<5;level++){const t=level/5;mesh.colliders.push({type:'box',x:p[0],y:p[2],halfWidth:w/2*(1-.42*t),halfDepth:d/2*(1-.62*t),angle:f.angle,minHeight:p[1]+h*t,maxHeight:p[1]+h*(level+1)/5});}}
}
function dome(f,x,y,z,r,h,color=C.copper,sides=20){
 for(let k=0;k<5;k++){const a=k/5*Math.PI/2,b=(k+1)/5*Math.PI/2;f.cone(x,y+Math.sin(a)*h,z,Math.cos(a)*r,(Math.sin(b)-Math.sin(a))*h,color,sides,Math.max(.15,Math.cos(b)*r));}
}
function column(f,x,b,z,h,r,color=C.light){
 f.box(x,b+2,z,r*2.8,4,r*2.8,color);f.cone(x,b+4,z,r,h-8,color,10,r*.85);f.box(x,b+h-2,z,r*2.9,4,r*2.9,color);
}
function balustrade(f,x,y,z,w,color=C.light){
 panel(f,x,y,z,w,2,color);panel(f,x,y+9,z-.2,w,2,color);
 for(let dx=-w/2+3;dx<w/2;dx+=7)panel(f,x+dx,y+4.5,z-.3,1.6,8,color);
}
function statue(f,x,y,z,h=14,color=C.light){f.cone(x,y,z,h*.14,h*.65,color,8,h*.09);f.cone(x,y+h*.69,z,h*.11,h*.2,color,8,h*.07);stroke(f,[x-h*.2,y+h*.55,z-.7],[x+h*.2,y+h*.55,z-.7],h*.08,color);}
function eagle(f,x,y,z,size,color=C.bronze){
 f.cone(x,y,z,size*.14,size*.64,color,8,size*.09);f.cone(x,y+size*.6,z,size*.1,size*.16,color,8,size*.08);
 for(const side of [-1,1]){
  f.tri([x,y+size*.4,z-.3],[x+side*size*.72,y+size*.9,z],[x+side*size*.53,y+size*.18,z-.2],color);
  for(let j=0;j<4;j++)stroke(f,[x+side*size*(.2+j*.12),y+size*(.48+j*.09),z-.5],[x+side*size*(.22+j*.12),y+size*(.13+j*.06),z-.5],size*.04,C.gold);
 }
}
function sideWindows(mesh,item,width,depth,height,rows=2,centerZ=0){
 item={...item,x:item.x-Math.sin(item.angle||0)*centerZ,z:item.z+Math.cos(item.angle||0)*centerZ};
 for(const side of [-1,1]){
  const a=(item.angle||0)+side*Math.PI/2,c=Math.cos(item.angle||0),s=Math.sin(item.angle||0),f=frame(mesh,{...item,x:item.x+c*side*width/2,z:item.z+s*side*width/2,angle:a});
  for(let x=-depth/2+15;x<depth/2-9;x+=22)for(let row=0;row<rows;row++)window(f,x,20+row*(height-30)/Math.max(1,rows-1),-.5,9,13);
 }
 const a=(item.angle||0)+Math.PI,c=Math.cos(item.angle||0),s=Math.sin(item.angle||0),back=frame(mesh,{...item,x:item.x-s*depth/2,z:item.z+c*depth/2,angle:a});
 for(let x=-width/2+16;x<width/2-10;x+=24)for(let row=0;row<rows;row++)window(back,x,20+row*(height-30)/Math.max(1,rows-1),-.5,10,13);
}
function theatre(mesh,item){
 const f=modelFrame(mesh,item);base(f,220,150);
 f.box(0,47,10,202,86,104,C.stone);f.box(0,95,19,112,24,84,C.ochre);
 for(const side of [-1,1]){f.box(side*78,58,-30,48,108,61,C.ochre);f.box(side*78,114,-30,53,5,66,C.light);dome(f,side*78,117,-30,25,31);f.cone(side*78,148,-30,4,13,C.gold,10,1);}
 hip(mesh,f,0,107,19,116,88,47,C.copper);f.box(0,159,19,24,10,19,C.copperDark);
 for(const x of [-46,-23,0,23,46])column(f,x,22,-53,57,3.5);
 details(mesh,()=>{
  for(const x of [-41,-20.5,0,20.5,41])arch(f,x,26,-42.5,15,44);
  for(const side of [-1,1]){arch(f,side*78,14,-61,22,34);arch(f,side*78,63,-61,22,32);balustrade(f,side*78,99,-61.5,39);for(const dx of [-18,18])panel(f,side*78+dx,59,-61.3,3,93,C.light);}
  f.box(0,82,-50,111,7,23,C.light);balustrade(f,0,87,-62,111);sign(f,'THEATRO MUNICIPAL',0,81,-62.3,97,5.3);
  for(const x of [-36,-12,12,36])panel(f,x,101,-24,17,10,C.copperDark);
  for(const side of [-1,1])for(const x of [-40,0,40])statue(f,x,109,side*43+19,15,C.gold);
  eagle(f,0,163,19,20,C.gold);sideWindows(mesh,item,204,104,78,2,10);
  for(let j=0;j<4;j++)f.box(0,4+j*2,-66+j*2,111-j*4,2,15-j*2,C.light);
 });
}
function library(mesh,item){
 const f=modelFrame(mesh,item);base(f,200,138);f.box(0,57,4,188,106,112,C.rose);
 f.box(0,115,9,194,7,120,C.light);f.box(0,118,10,96,12,79,C.stone);dome(f,0,124,10,36,25,C.copperDark);
 for(const x of [-48,-32,32,48])column(f,x,44,-57,61,4.2);
 details(mesh,()=>{
  for(let x=-78;x<=78;x+=26){arch(f,x,10,-52.5,15,25,C.light,C.bronze);if(Math.abs(x)>50)for(const y of [61,89])window(f,x,y,-52.5,15,20);}
  for(const x of [-23,0,23])arch(f,x,47,-52.5,17,43);
  f.box(0,108,-56,118,7,18,C.light);sign(f,'BIBLIOTECA NACIONAL',0,108,-65.5,108,4.6);
  for(const side of [-1,1]){pediment(f,side*73,108,-55,38,15,9);statue(f,side*75,125,-42,24);}
  for(const x of [-35,35])statue(f,x,123,-31,19);f.cone(0,149,10,3.3,8,C.gold,10,0);
  for(let step=0;step<7;step++)f.box(0,4+step*2,-64+step*2.5,88-step*3,2,9,C.light);
  for(let y=14;y<42;y+=8)panel(f,0,y,-52.8,182,.65,C.shade);sideWindows(mesh,item,188,112,101,3,4);
 });
}
function fineArts(mesh,item){
 const f=modelFrame(mesh,item);base(f,220,142);f.box(0,48,6,208,88,120,C.stone);
 for(const x of [-83,0,83]){const w=x===0?61:41;f.box(x,101,-8,w,22,92,C.ochre);hip(mesh,f,x,112,-8,w+3,96,x===0?33:23,C.slate);}
 f.box(0,94,6,215,6,126,C.light);
 details(mesh,()=>{
  for(let x=-88;x<=88;x+=22){arch(f,x,10,-54.4,14,22);arch(f,x,47,-54.4,14,33);panel(f,x+9,65,-54.8,2,40,C.light);}
  for(let y=10;y<40;y+=8)panel(f,0,y,-54.6,204,.7,C.shade);
  for(const x of [-83,0,83]){arch(f,x,98,-54.4,x===0?22:16,12,C.light,C.iron);balustrade(f,x,84,-56, x===0?58:37);}
  pediment(f,0,111,-57,61,20,6);for(const x of [-20,20])statue(f,x,132,-45,18);
  sign(f,'MUSEU DE BELAS ARTES',0,41,-55.5,116,4.2);sideWindows(mesh,item,208,120,84,2,6);
 });
}
function tiradentes(mesh,item){
 const f=modelFrame(mesh,item);base(f,212,150);f.box(0,54,12,190,94,100,C.ochre);f.box(0,104,12,197,7,107,C.light);
 f.cone(0,108,17,47,14,C.stone,8,47);dome(f,0,122,17,47,46,'#658b83',8);
 for(const x of [-55,-33,-11,11,33,55])column(f,x,30,-47,66,4.2);
 f.box(0,100,-43,135,9,25,C.light);
 details(mesh,()=>{
  for(const x of [-43,-21,0,21,43])arch(f,x,35,-38.4,15,47,C.light,C.bronze);
  for(const side of [-1,1]){arch(f,side*80,23,-38.5,16,39);statue(f,side*81,110,-25,24);column(f,side*86,4,-62,28,3,C.shade);eagle(f,side*86,32,-62,15,C.bronze);}
  for(let step=0;step<10;step++)f.box(0,4+step*2.6,-68+step*2.4,142-step*5,2.6,11,C.light);
  f.box(0,10,-68,13,14,12,C.shade);statue(f,0,17,-68,26,C.bronze);
  sign(f,'PALACIO TIRADENTES',0,102,-56,119,4.5);sideWindows(mesh,item,190,100,90,2,12);
  // Eight dark ribs preserve the faceted glass dome's recognizable profile.
  for(let k=0;k<8;k++){const a=k/8*TAU;for(let j=0;j<4;j++){const t=j/4*Math.PI/2,u=(j+1)/4*Math.PI/2,p=q=>[Math.cos(a)*Math.cos(q)*47.3,122+Math.sin(q)*46.3,17+Math.sin(a)*Math.cos(q)*47.3];const aa=p(t),bb=p(u);f.quad([aa[0]-.7,aa[1],aa[2]],[bb[0]-.7,bb[1],bb[2]],[bb[0]+.7,bb[1],bb[2]],[aa[0]+.7,aa[1],aa[2]],C.copperDark);}}
 });
}
function imperial(mesh,item){
 const f=modelFrame(mesh,item);base(f,208,144);
 // Open central court surrounded by a low colonial perimeter and taller entry.
 for(const [x,z,w,d,h]of [[0,-48,196,37,64],[-80,7,36,110,64],[80,7,36,110,64],[0,51,136,30,64],[0,-48,64,37,84]]){f.box(x,h/2+4,z,w,h,d,C.light);hip(mesh,f,x,h+4,z,w+4,d+4,17,C.tile);}
 details(mesh,()=>{
  for(let x=-84;x<=84;x+=21){window(f,x,19,-67,11,19,C.stone,C.iron);window(f,x,49,-67,11,22,C.stone,'#304c43');balustrade(f,x,36,-69,15,C.iron);}
  for(const x of [-21,0,21])window(f,x,75,-67,11,16,C.stone,'#304c43');arch(f,0,5,-67.4,15,27,C.stone,C.iron);
  sign(f,'PACO IMPERIAL',0,31,-69.5,61,3.9);panel(f,0,67,-67.5,194,2,C.stone);
  for(const side of [-1,1]){const c=Math.cos(item.angle||0),s=Math.sin(item.angle||0),g=frame(mesh,{...item,x:item.x+c*side*62,z:item.z+s*side*62,angle:(item.angle||0)-side*Math.PI/2});for(const x of [-30,-9,12,33])for(const y of [20,49])window(g,x,y,-.3,10,16,C.stone,'#304c43');}
  f.box(0,5,12,38,2,27,'#557c5a');f.cone(0,6,12,7,4,C.shade,16,7);f.cone(0,10,12,2.5,14,C.stone,10,2.5);
  sideWindows(mesh,item,196,132,60,2);
 });
}
function ccbb(mesh,item){
 const f=modelFrame(mesh,item);base(f,192,142);f.box(0,53,9,172,98,114,C.ochre);
 // Convex entrance bay breaks the rectangular banking block at road level.
 f.cone(0,4,-34,37,98,C.stone,20,37);f.box(0,105,9,179,7,121,C.light);
 f.cone(0,109,17,40,7,C.stone,24,40);dome(f,0,116,17,40,29,'#577a7b',24);
 details(mesh,()=>{
  for(const side of [-1,1])for(const x of [side*52,side*75]){arch(f,x,10,-48.5,14,24);window(f,x,59,-48.5,14,32);window(f,x,89,-48.5,14,16);panel(f,x+side*9,67,-49,3,65,C.light);}
  for(let i=0;i<7;i++){
   const a=-Math.PI*.83+i/6*Math.PI*.66,x=Math.cos(a)*37.3,z=-34+Math.sin(a)*37.3,angle=(item.angle||0)+a+Math.PI/2,p=f.p(x,0,z),g=frame(mesh,{...item,x:p[0],z:p[2],angle});
   arch(g,0,11,-.3,10,25);window(g,0,62,-.3,10,30);panel(g,7,68,-.8,2.3,64,C.light);frontDisk(g,7,95,-1,2.8,C.light,0,10);
  }
  sign(f,'CCBB RIO',0,43,-71.4,55,5);balustrade(f,0,99,-71.1,48);sideWindows(mesh,item,172,114,94,3,9);
 });
}
function gabinete(mesh,item){
 const f=modelFrame(mesh,item);base(f,150,120);f.box(0,62,6,138,116,104,'#ad9b80');f.box(0,122,6,144,7,108,C.light);hip(mesh,f,0,126,11,137,94,20,C.slate);
 for(const side of [-1,1]){f.box(side*64,77,-47,8,144,8,C.stone);f.cone(side*64,149,-47,7,11,C.light,8,0);}
 details(mesh,()=>{
  for(const x of [-43,0,43]){pointed(f,x,55,-46.6,25,53);arch(f,x,10,-46.6,22,30,C.light,C.iron);}
  for(const x of [-29,-14,14,29]){f.box(x,49,-49,9,5,10,C.shade);statue(f,x,52,-50,22,C.light);}
  for(const x of [-44,0,44]){frontDisk(f,x,119,-47,7.5,C.shade,0,16);frontDisk(f,x,119,-47.4,5.7,C.gold,0,16);stroke(f,[x-3,119,-47.9],[x+3,119,-47.9],.9,C.iron);stroke(f,[x,116,-47.9],[x,122,-47.9],.9,C.iron);}
  // Carved rope edges and open cusped crest, kept visibly in front of stone.
  for(const x of [-60,-28,28,60])for(let y=12;y<116;y+=8){stroke(f,[x-1.4,y,-47.6],[x+1.4,y+4,-47.6],1.1,C.light);stroke(f,[x+1.4,y+4,-47.6],[x-1.4,y+8,-47.6],1.1,C.light);}
  for(let x=-55;x<=55;x+=11){arch(f,x,129,-47,7,11,C.light,C.iron);f.cone(x,142,-47,2.3,9,C.light,6,0);}
  sign(f,'REAL GABINETE PORTUGUES',0,44,-48.5,114,3.7);sideWindows(mesh,item,138,104,112,3,6);
 });
}
function catete(mesh,item){
 const f=modelFrame(mesh,item);base(f,188,138);f.box(0,59,6,176,110,116,'#967b6d');f.box(0,116,6,183,7,122,C.light);hip(mesh,f,0,120,13,171,100,17,C.tile);
 details(mesh,()=>{
  for(let x=-72;x<=72;x+=24){arch(f,x,8,-52.5,15,24,C.light,C.iron);window(f,x,58,-52.5,14,25);window(f,x,91,-52.5,14,20);pediment(f,x,73,-54,18,8,3);}
  for(const y of [37,78,108])panel(f,0,y,-53,178,2.8,C.light);for(let y=8;y<36;y+=7)panel(f,0,y,-52.8,172,.75,C.shade);
  for(const x of [-72,-24,24,72]){f.box(x,121,-47,13,5,12,C.light);eagle(f,x,124,-47,21,C.iron);}
  f.box(0,42,-58,65,4,16,C.light);balustrade(f,0,45,-66.3,65,C.iron);sign(f,'PALACIO DO CATETE',0,38,-66.5,90,3.9);
  dome(f,0,122,14,17,19,'#527c7a',16);sideWindows(mesh,item,176,116,106,3,6);
 });
}
function national(mesh,item){
 const f=modelFrame(mesh,item);base(f,224,146);f.box(0,46,5,212,84,124,C.ochre);
 for(const side of [-1,1]){f.box(side*85,105,-5,42,38,112,C.stone);f.box(side*85,127,-5,48,6,118,C.light);hip(mesh,f,side*85,130,-5,45,114,12,C.tile);}
 f.box(0,91,5,217,7,130,C.light);hip(mesh,f,0,95,9,135,116,13,C.tile);
 details(mesh,()=>{
  for(let x=-91;x<=91;x+=26){arch(f,x,8,-57.5,16,26);window(f,x,61,-57.5,15,24);}
  for(const side of [-1,1]){for(const x of [side*75,side*96])window(f,x,107,-61.5,12,20);for(const x of [side*69,side*100])statue(f,x,132,-58,18,C.light);}
  for(const x of [-45,-30,30,45])panel(f,x,64,-58,3.5,57,C.light);
  pediment(f,0,94,-60,77,23,11);frontDisk(f,0,102,-60.6,5,C.gold,0,16);sign(f,'MUSEU NACIONAL',0,42,-58.4,92,4.6);
  for(const x of [-32,0,32])statue(f,x,113,-36,16);sideWindows(mesh,item,212,124,80,2,5);
 });
}
function laranjeiras(mesh,item){
 const f=modelFrame(mesh,item);base(f,204,148);f.box(0,48,14,190,88,108,C.rose);
 for(const side of [-1,1]){f.box(side*72,76,-6,45,48,100,C.stone);hip(mesh,f,side*72,100,-6,49,104,42,C.slate);}
 f.box(0,96,14,112,8,114,C.light);hip(mesh,f,0,100,16,111,104,25,C.slate);
 details(mesh,()=>{
  for(const x of [-37,-12,12,37])arch(f,x,38,-40.5,17,39);
  for(const x of [-48,-24,0,24,48])column(f,x,35,-47,49,2.3);
  for(const side of [-1,1]){for(const y of [32,70])window(f,side*72,y,-56.5,23,25);pediment(f,side*72,85,-59,32,13,6);f.box(side*72,116,-50,17,20,9,C.stone);arch(f,side*72,108,-55,13,17);f.cone(side*72,142,-6,3,12,C.gold,8,0);}
  f.box(0,86,-45,112,4,12,C.light);
  balustrade(f,0,29,-56,109);f.box(0,28,-49,113,4,18,C.light);pediment(f,0,100,-45,67,19,7);sign(f,'PALACIO LARANJEIRAS',0,89,-51.8,103,4.3);
  for(const side of [-1,1])for(let step=0;step<7;step++)f.box(side*(58-step*4),4+step*3.3,-64+step*2,29,3.3,12,C.light);
  f.cone(0,4,-61,11,3,C.shade,20,11);f.cone(0,7,-61,9,1,'#527e81',20,9);f.cone(0,8,-61,2.4,13,C.stone,10,2.4);f.cone(0,21,-61,6,2,C.light,16,6);
  for(const x of [-40,40])statue(f,x,106,-39,18);sideWindows(mesh,item,190,108,84,2,14);
 });
}
const builders={'rio-theatro-municipal':theatre,'rio-biblioteca-nacional':library,'rio-belas-artes':fineArts,'rio-palacio-tiradentes':tiradentes,'rio-paco-imperial':imperial,'rio-ccbb':ccbb,'rio-real-gabinete':gabinete,'rio-palacio-catete':catete,'rio-museu-nacional':national,'rio-palacio-laranjeiras':laranjeiras};
export function addRioCivic(mesh,item){const draw=builders[item.kind];if(!draw)return false;draw(mesh,item);return true;}
