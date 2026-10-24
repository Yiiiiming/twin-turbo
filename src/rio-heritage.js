/** Rio heritage silhouettes. Local -Z is the public entrance; all bases are 0.
 * References: catedral.com.br/relevo/; riotur.rio/que_fazer/igreja-de-nossa-senhora-da-candelaria/;
 * riotur.rio/wp-content/uploads/2022/12/Igrejas-do-Rio-6-1_baixa.pdf;
 * marinha.mil.br/dphdm/ilha-fiscal; mhn.museus.gov.br/.
 * Game envelopes include steps, roofs and finials, not real-world dimensions.
 */
import { parisKit } from './paris-monuments.js';
import { frontDisk } from './london-west-end.js';
const TAU=Math.PI*2;
const C=Object.freeze({stone:'#b7aa8b',cream:'#d2c4a0',shadow:'#746b58',roof:'#6f4836',green:'#718d74',dark:'#334d45',bronze:'#976c43',glass:'#3b6879',blue:'#536d87',gold:'#b59857'});
const meta=(kind,label,nameZh,width,depth,height,features)=>Object.freeze({kind,label,nameZh,width,depth,height,radius:Math.hypot(width,depth)/2+8,family:'heritage',features:Object.freeze(features)});
export const RIO_HERITAGE_LANDMARKS=Object.freeze([
 meta('rio-metropolitan-cathedral','Metropolitan Cathedral of Saint Sebastian','里约主教座堂',240,180,225,['tapered concrete cone','four stained-glass ribbons','horizontal lattice','separate bell tower']),
 meta('rio-candelaria','Candelária Church','坎德拉里亚教堂',180,160,211,['twin bell towers','Latin-cross nave','ribbed stone dome','bronze portals']),
 meta('rio-sao-bento','São Bento Monastery','圣本笃修道院',190,145,145,['austere twin pyramid towers','three arched portals','ochre cloister','terracotta roofs']),
 meta('rio-gloria-church','Church of Our Lady of Glória','荣耀圣母教堂',122,140,162,['two octagonal volumes','front bell tower','granite terrace','blue framed windows']),
 meta('rio-penha-church','Church of Our Lady of Penha','佩尼亚教堂',170,200,260,['granite hill','long central staircase','twin pointed towers','hilltop terrace']),
 meta('rio-old-cathedral','Old Cathedral of Rio de Janeiro','里约旧主教座堂',144,130,178,['single tall bell tower','baroque central pediment','bronze entry doors','warm stone pilasters']),
 meta('rio-ilha-fiscal','Ilha Fiscal Palace','财政岛宫',210,120,200,['green Gothic palace','central clock tower','four corner turrets','crenellated parapets']),
 meta('rio-copacabana-fort','Copacabana Fort','科帕卡巴纳堡',224,150,75,['low concrete casemate','paired armored turrets','long cannon barrels','seaward terrace']),
 meta('rio-national-history-museum','National Historical Museum','国家历史博物馆',220,150,110,['ochre colonial courtyard','arcaded frontage','terracotta roofs','central pediment']),
 meta('rio-vista-chinesa','Vista Chinesa','中国观景亭',150,150,115,['open hexagonal pavilion','upturned double eaves','bamboo-like columns','stone lookout terrace']),
]);
const cross=(f,x,y,z,size=9)=>{f.box(x,y,z,1.5,size,1.5,C.gold);f.box(x,y+size*.12,z,size*.62,1.3,1.5,C.gold);};
function tower(k,x,z,y,h,w=25,pointed=false){
 const {f}=k;f.box(x,y+h/2,z,w,h,w,C.cream);
 k.detail(()=>{for(const [dx,dz,a]of[[0,-w/2-.3,0],[w/2+.3,0,Math.PI/2],[0,w/2+.3,Math.PI],[-w/2-.3,0,-Math.PI/2]])k.face(x+dx,z+dz,a).arch(0,y+h-26,0,w*.44,19,false,C.dark);
  for(const yy of [y+8,y+h-32,y+h])k.cornice(x,yy,z,w+4,w+4);
  if(pointed)f.cone(x,y+h+2,z,w*.66,24,C.roof,4,0,Math.PI/4);else{k.dome(x,y+h+2,z,w*.62,17,C.shadow);f.cone(x,y+h+19,z,2,8,C.gold,8,0);}cross(f,x,y+h+30,z,8);
 });
}
function cathedral(mesh,item){
 const k=parisKit(mesh,item),{f}=k;k.base(236,176);
 f.cone(-22,4,0,82,181,C.shadow,48,24);f.box(92,89,8,13,170,15,C.stone);
 k.detail(()=>{const point=(a,y,r)=>[-22+Math.cos(a)*r,y,Math.sin(a)*r];
  for(let row=0;row<16;row++){const y=8+row*10.8,r=82-(y-4)/181*58;for(let i=0;i<48;i++){const a=i/48*TAU,b=(i+1)/48*TAU;f.quad(point(a,y,r+.35),point(a,y+2,r-.29),point(b,y+2,r-.29),point(b,y,r+.35),row%2?C.stone:C.cream);}}
  for(let i=0;i<32;i++){const a=i/32*TAU;k.beam(point(a,6,82.2),point(a,185,24.2),.9,C.cream);}
  for(let j=0;j<4;j++){const a=j*Math.PI/2;for(let band=0;band<18;band++){const y=9+band*9.4,r=82-(y-4)/181*58,yy=y+8.2,rr=82-(yy-4)/181*58,half=.085;f.quad(point(a-half,y,r+.8),point(a-half,yy,rr+.8),point(a+half,yy,rr+.8),point(a+half,y,r+.8),['#3e7590','#ad7a4e','#608968','#8f5d76'][j]);}}
  f.cone(-22,185,0,24,3,C.cream,48,24);for(let i=0;i<48;i++){const a=i/48*TAU,b=(i+1)/48*TAU;f.tri([-22,188,0],point(b,188,24),point(a,188,24),C.shadow);}
  f.box(-22,13,-80,41,18,5,C.bronze);for(let x=-38;x<=-6;x+=6)for(const y of [9,15,21])k.panel(x,y,-82.6,3.8,3.2,C.shadow);
  for(const x of [82,102]){f.box(x,100,8,3,192,4,C.stone);k.beam([x,196,8],[92,213,8],2.8,C.cream);}
  for(let i=0;i<6;i++){frontDisk(f,92,39+i*24,-.1,6,C.dark,0,12);f.cone(92,35+i*24,7,3.4,6,C.bronze,10,2.5);}cross(f,92,220,8,10);
 });
}
function candelaria(mesh,item){
 const k=parisKit(mesh,item),{f}=k;k.base(176,156);f.box(0,44,10,69,80,126,C.stone);f.box(0,43,17,151,78,42,C.stone);f.box(0,40,-58,129,72,24,C.cream);
 for(const x of [-53,53])tower(k,x,-54,4,112,29);
 f.cone(0,85,16,31,28,C.stone,24,31);
 k.detail(()=>{k.roof(0,85,8,73,119,23,C.roof);for(const x of [-55,55])k.roof(x,83,17,41,46,17,C.roof);
  k.dome(0,113,16,34,63,C.shadow);for(let i=0;i<8;i++){const a=i/8*TAU;for(let j=0;j<3;j++){const t=j/3*Math.PI/2,u=(j+1)/3*Math.PI/2;k.beam([Math.cos(a)*Math.cos(t)*34.4,113+Math.sin(t)*63,16+Math.sin(a)*Math.cos(t)*34.4],[Math.cos(a)*Math.cos(u)*34.4,113+Math.sin(u)*63,16+Math.sin(a)*Math.cos(u)*34.4],1,C.cream);}}
  f.cone(0,176,16,7,17,C.cream,12,7);k.dome(0,193,16,8,10,C.shadow);cross(f,0,207,16,8);
  for(const x of [-30,0,30]){k.arch(x,8,-70.3,17,33,false,C.bronze);k.window(x,59,-70.6,13,17);}
  for(const x of [-40,-19,19,40])k.col(x,6,-72,69,2.6);k.pediment(0,80,-73,82,23,8);k.cornice(0,78,-59,132,27);k.rose(0,91,-73.4,6);
  for(const side of [-1,1]){const g=k.face(side*34.6,12,side*Math.PI/2);for(const x of [-39,-13,13,39])g.arch(x,32,-.3,12,29);}
 });
}
function bento(mesh,item){
 const k=parisKit(mesh,item),{f}=k;k.base(186,141);f.box(0,41,-34,133,74,49,'#b5a072');f.box(0,35,43,172,62,43,'#b5a072');for(const x of [-71,71])f.box(x,35,6,30,62,102,'#b5a072');
 for(const x of [-50,50])tower(k,x,-44,4,107,26,true);
 k.detail(()=>{k.roof(0,79,-25,80,74,24);k.roof(0,66,43,177,46,20);for(const x of [-71,71])k.roof(x,66,4,34,96,19);
  for(const x of [-28,0,28]){k.arch(x,8,-59,20,33,false,C.dark);k.window(x,62,-59.3,13,15);}
  for(const x of [-39,39])k.panel(x,42,-59.6,4,73,C.shadow);k.cornice(0,80,-35,136,52);k.pediment(0,82,-62,82,26,9);
  for(const side of [-1,1]){const g=k.face(side*87,4,side*Math.PI/2);for(const x of [-34,-11,11,34])for(const y of [25,49])g.window(x,y,-.3,10,15);}
  for(const x of [-68,-45,-22,0,22,45,68]){k.window(x,46,20.8,11,17);k.arch(x,8,20.5,13,23);}
 });
}
function gloria(mesh,item){
 const k=parisKit(mesh,item),{f}=k;k.base(118,136);f.cone(0,4,7,49,14,C.shadow,8,44,Math.PI/8);f.cone(0,18,13,38,72,C.cream,8,38,Math.PI/8);f.cone(0,18,-26,28,68,C.cream,8,28,Math.PI/8);f.box(0,52,-50,23,68,11,C.cream);tower(k,0,-38,18,104,23,true);
 k.detail(()=>{f.cone(0,90,13,41,28,C.roof,8,5,Math.PI/8);f.cone(0,86,-26,30,22,C.roof,8,3,Math.PI/8);
  for(let i=0;i<8;i++){const a=i/8*TAU+Math.PI/8,xx=Math.cos(a)*38,zz=13+Math.sin(a)*38;k.beam([xx,19,zz],[xx,89,zz],2,C.shadow);}
  for(const side of [-1,1]){const g=k.face(side*35,12,side*Math.PI/2);for(const x of [-15,15])g.arch(x,37,-.5,12,28,false,C.blue);}
  k.arch(0,20,-55.9,13,28,false,C.bronze);k.window(0,71,-55.9,11,14,C.blue);for(const x of [-13,13])k.panel(x,52,-56.1,3,68,C.shadow);for(const y of [18,52,84])k.panel(0,y,-56.2,29,2.5,C.shadow);
  for(let i=0;i<8;i++)f.box(0,1+i*2,-63+i*3,39-i*1.6,2,6,C.stone);for(const x of [-44,44])f.box(x,20,-16,3,7,75,C.cream);
 });
}
function penha(mesh,item){
 const k=parisKit(mesh,item),{f}=k;
 f.cone(0,0,16,80,42,'#758372',32,67);f.cone(0,42,16,67,46,'#8c8c79',32,47);f.cone(0,88,16,47,34,'#a1a08b',24,40);
 f.box(0,124,14,94,4,85,C.shadow);f.box(0,159,12,56,66,64,C.cream);f.box(0,153,-23,79,54,15,C.cream);
 for(const x of [-31,31])tower(k,x,-21,126,96,20,true);
 // Real walkable-looking treads, each with its own low solid; no floating decal staircase.
 for(let i=0;i<24;i++){const height=(i+1)*5.25;f.box(0,height/2,-96+i*3.1,24,height,3.3,C.stone);}
 k.detail(()=>{k.roof(0,192,12,61,69,24,C.roof);k.pediment(0,184,-32,58,19,8);k.arch(0,129,-31,18,36,false,C.bronze);k.rose(0,175,-32.3,7);
  for(const x of [-45,45]){f.box(x,132,15,2.5,13,82,C.cream);for(let z=-20;z<=48;z+=17)f.box(x,134,z,4,18,4,C.shadow);}
  for(const side of [-1,1]){const g=k.face(side*28.5,14,side*Math.PI/2);for(const x of [-19,0,19])g.arch(x,145,-.2,10,24,false,C.blue);k.beam([side*15,5,-96],[side*15,130,-24],2,C.shadow);}
 });
}
function oldCathedral(mesh,item){
 const k=parisKit(mesh,item),{f}=k;k.base(140,126);f.box(-11,45,7,89,82,107,C.cream);f.box(-9,42,-47,100,76,18,C.stone);tower(k,48,-35,4,135,28);
 k.detail(()=>{k.roof(-11,86,9,95,106,28);k.pediment(-9,84,-58,99,26,11);for(const x of [-39,-9,21]){k.arch(x,8,-56.4,19,32,false,C.bronze);k.window(x,65,-56.6,13,18);}
  for(const x of [-54,-24,6,36])k.col(x,6,-57.6,74,2.5);k.cornice(-9,82,-47,103,21);k.rose(-9,96,-58.4,7);cross(f,-9,116,-48,9);
  const g=k.face(-56,10,-Math.PI/2);for(const x of [-36,-12,12,36])g.window(x,48,-.5,12,25);for(const y of [43,88,109])k.panel(48,y,-49.5,30,3,C.shadow);
 });
}
function fiscal(mesh,item){
 const k=parisKit(mesh,item),{f}=k;k.base(206,116);f.box(0,39,2,188,70,84,C.green);f.box(0,75,-21,35,142,36,C.green);
 for(const x of [-87,87])for(const z of [-34,38])f.cone(x,4,z,13,91,C.green,8,13,Math.PI/8);
 k.detail(()=>{k.roof(0,74,4,188,89,24,C.dark);
  for(const x of [-87,87])for(const z of [-34,38]){f.cone(x,95,z,16,28,C.dark,8,0,Math.PI/8);f.cone(x,123,z,1,7,C.gold,6,0);}
  for(let x=-72;x<=72;x+=18){k.arch(x,14,-40.4,12,35,true,C.glass);k.arch(x,53,-40.5,9,16,true,C.dark);f.box(x,78,-40,5,11,5,C.cream);f.box(x,78,44,5,11,5,C.cream);}
  for(const x of [-96,96])for(let z=-16;z<=20;z+=18)f.box(x,78,z,5,11,5,C.cream);
  for(const [x,z,a]of[[0,-39.4,0],[18.4,-21,Math.PI/2],[0,-2.6,Math.PI],[-18.4,-21,-Math.PI/2]]){const g=k.face(x,z,a);g.arch(0,82,-.2,15,28,true);frontDisk(g.f,0,126,-.5,10,C.cream,0,20);g.stroke([0,126,-.8],[0,133,-.8],1,C.dark);g.stroke([0,126,-.8],[5,123,-.8],1,C.dark);}
  k.cornice(0,146,-21,40,41);f.cone(0,148,-21,26,39,C.dark,4,0,Math.PI/4);f.cone(0,187,-21,1.5,13,C.gold,8,0);k.arch(0,8,-40.7,17,43,true,C.bronze);
 });
}
function fort(mesh,item){
 const k=parisKit(mesh,item),{f}=k;k.base(220,146);f.box(0,18,15,195,28,104,'#9d9984');f.box(0,34,22,166,6,96,C.shadow);
 for(const x of [-49,49]){f.cone(x,37,10,26,18,C.dark,24,22);k.detail(()=>{k.dome(x,55,10,22,14,C.dark);});
  for(const dx of [-7,7]){f.box(x+dx,51,-30,6,6,78,C.dark);f.box(x+dx,51,-69,8,8,6,C.shadow);}
 }
 // The real cannon barrels are solids and stay inside the advertised terrace.
 k.detail(()=>{for(const x of [-81,-54,-27,0,27,54,81]){k.arch(x,8,-37.4,16,16,false,C.dark);k.panel(x,31,-37.7,13,2,C.cream);}for(const side of [-1,1])for(let z=-57;z<=57;z+=19){f.box(side*104,10,z,3,13,3,C.dark);if(z<57)k.beam([side*104,16,z],[side*104,16,z+19],1.5,C.dark);}for(const x of [-90,90]){f.box(x,45,40,13,15,13,C.stone);k.roof(x,53,40,18,18,9,C.roof);}f.box(0,51,42,2,48,2,C.dark);f.quad([1,74,42],[1,59,42],[18,61,42],[18,72,42],C.green);});
}
function historyMuseum(mesh,item){
 const k=parisKit(mesh,item),{f}=k,ochre='#b89c68';k.base(216,146);
 f.box(0,31,-48,207,54,33,ochre);for(const x of [-88,88])f.box(x,31,9,31,54,111,ochre);f.box(0,31,57,207,54,25,ochre);f.box(0,40,-48,43,72,38,C.cream);
 k.detail(()=>{k.roof(0,58,-48,211,37,22,C.roof);k.roof(0,58,57,211,29,20,C.roof);for(const x of [-88,88])k.roof(x,58,9,35,111,20,C.roof);
  for(let x=-88;x<=88;x+=22){const front=x===0?-67.4:-65;k.arch(x,7,front,13,27,false,C.dark);k.window(x,45,front-.2,11,13);}
  k.pediment(0,77,-68,49,25,10);k.cornice(0,76,-49,47,41);k.rose(0,86,-68.4,7);cross(f,0,106,-48,8);
  for(const side of [-1,1]){const outer=k.face(side*104,4,side*Math.PI/2),inner=k.face(side*72,4,-side*Math.PI/2);for(const x of [-30,0,30]){outer.window(x,36,-.4,13,24);inner.arch(x,8,-.4,16,33);}}
  for(const x of [-55,-25,25,55])k.face(x,44,Math.PI).arch(0,8,-.3,12,25);
  for(const x of [-43,43]){f.cone(x,4,3,11,12,C.dark,12,9);k.beam([x,16,3],[x,18,-15],3.5,C.bronze);}
 });
}
function vista(mesh,item){
 const k=parisKit(mesh,item),{f}=k;
 f.cone(0,0,0,71,7,C.shadow,6,71);f.cone(0,7,0,62,7,C.stone,6,62);
 for(let i=0;i<6;i++){const a=i/6*TAU,x=Math.cos(a)*43,z=Math.sin(a)*43;f.cone(x,14,z,3.5,57,C.bronze,8,3.5);}
 // The open pavilion has independent columns and elevated roof collision,
 // never a solid invisible block across its open public entrance.
 if(mesh.colliders){const p=f.p(0,0,0);mesh.colliders.push({type:'circle',x:p[0],y:p[2],radius:62,minHeight:(item.elevation||0)+69,maxHeight:(item.elevation||0)+95});}
 k.detail(()=>{const ring=(r,y)=>Array.from({length:6},(_,i)=>{const a=i/6*TAU;return [Math.cos(a)*r,y,Math.sin(a)*r];});
  const curvedRoof=(y,r,h)=>{const rings=[ring(r,y+7),ring(r*.79,y),ring(r*.46,y+h*.62),ring(0,y+h)];for(let band=0;band<3;band++)for(let i=0;i<6;i++){let j=(i+1)%6;if(band===2)f.tri(rings[band][i],rings[band+1][i],rings[band][j],C.dark);else f.quad(rings[band][i],rings[band+1][i],rings[band+1][j],rings[band][j],C.dark);k.beam(rings[band][i],rings[band+1][i],1.5,C.bronze);}for(let i=0;i<6;i++)k.beam(rings[0][i],rings[0][(i+1)%6],2,C.bronze);};
  curvedRoof(69,62,26);curvedRoof(94,29,18);f.cone(0,112,0,2.5,3,C.gold,8,0);
  for(let i=0;i<6;i++){const a=i/6*TAU,b=(i+1)/6*TAU,x=Math.cos(a)*43,z=Math.sin(a)*43;for(let y=22;y<=66;y+=11)f.cone(x,y,z,4.2,1.8,C.shadow,8,4.2);k.beam([x,65,z],[Math.cos(b)*43,65,Math.sin(b)*43],3.2,C.bronze);if(i!==4){k.beam([x,29,z],[Math.cos(b)*43,29,Math.sin(b)*43],2,C.bronze);for(let j=1;j<=4;j++){const u=j/5,xx=x*(1-u)+Math.cos(b)*43*u,zz=z*(1-u)+Math.sin(b)*43*u;k.beam([xx,14,zz],[xx,29,zz],1.3,C.bronze);}}}
  for(let i=0;i<3;i++)f.box(0,2+i*2,-68+i*5,35,4,8,C.stone);
 });
}
const BUILDERS=Object.freeze({'rio-metropolitan-cathedral':cathedral,'rio-candelaria':candelaria,'rio-sao-bento':bento,'rio-gloria-church':gloria,'rio-penha-church':penha,'rio-old-cathedral':oldCathedral,'rio-ilha-fiscal':fiscal,'rio-copacabana-fort':fort,'rio-national-history-museum':historyMuseum,'rio-vista-chinesa':vista});
export function addRioHeritage(mesh,item){const draw=BUILDERS[item.kind];if(!draw)return false;draw(mesh,item);return true;}
