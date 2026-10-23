/** Paris public architecture: individually shaped courtyards, pavilions,
 * clocks and roofs. Local -Z faces the road; dimensions include ornament.
 * References: operadeparis.fr (Palais Garnier); musee-orsay.fr (architecture);
 * grandpalais.fr/en/magazine/rediscover-europes-largest-glass-roof;
 * petitpalais.paris.fr; musee-rodin.fr; paris.fr (Hôtel de Ville).
 */
import { frontDisk } from './london-west-end.js';
import { parisKit } from './paris-monuments.js';
const TAU=Math.PI*2;
const meta=(kind,label,nameZh,width,depth,height,features)=>Object.freeze({kind,label,nameZh,width,depth,height,radius:Math.hypot(width,depth)/2+8,family:'palace',features:Object.freeze(features)});
export const PARIS_PALACES=Object.freeze([
 meta('palais-garnier','Palais Garnier','加尼叶歌剧院',220,150,180,['paired columns','copper dome','gilded rooftop sculpture']),
 meta('musee-orsay',"Musée d’Orsay",'奥赛博物馆',240,130,145,['station clock','long glazed vault','stone pavilions']),
 meta('grand-palais','Grand Palais','大皇宫',250,155,155,['green iron glass vault','crossing nave','quadriga sculptures']),
 meta('petit-palais','Petit Palais','小皇宫',210,140,150,['great entrance arch','central dome','semicircular colonnade']),
 meta('hotel-de-ville','Hôtel de Ville','巴黎市政厅',240,140,185,['central clock tower','steep pavilion roofs','sculpted galleries']),
 meta('conciergerie','Conciergerie','巴黎古监狱',230,125,180,['three round towers','clock pavilion','slate cones']),
 meta('palais-luxembourg','Palais du Luxembourg','卢森堡宫',220,145,150,['rusticated courtyard','three pavilion roofs','paired wings']),
 meta('palais-bourbon','Palais Bourbon','波旁宫',205,125,135,['Corinthian portico','wide pediment','side pavilions']),
 meta('palais-royal','Palais-Royal','王宫',220,145,135,['arcaded court','striped courtyard columns','mansard pavilions']),
 meta('hotel-biron','Hôtel Biron — Musée Rodin','比隆府／罗丹博物馆',165,120,115,['garden mansion','central pediment','sculpture terrace']),
]);
function clock(k,x,y,z,r){const {f,C}=k;frontDisk(f,x,y,z,r+2,C.light,0,24);frontDisk(f,x,y,z-.2,r,C.dark,0,24);for(let i=0;i<12;i++){const a=i/12*TAU;k.stroke([x+Math.sin(a)*r*.79,y+Math.cos(a)*r*.79,z-.4],[x+Math.sin(a)*r*.94,y+Math.cos(a)*r*.94,z-.4],.7,C.gold);}k.stroke([x,y,z-.5],[x-r*.12,y+r*.62,z-.5],1.1,C.light);k.stroke([x,y,z-.5],[x+r*.47,y-r*.18,z-.5],.9,C.light);}
function vault(k,x,y,z,w,d,h,color){const {f,C}=k;for(let i=0;i<16;i++){const a=i/16*Math.PI,b=(i+1)/16*Math.PI,p=(t,zz)=>[x+Math.cos(t)*w/2,y+Math.sin(t)*h,zz];f.quad(p(a,z-d/2),p(b,z-d/2),p(b,z+d/2),p(a,z+d/2),color||C.glass);if(i%2===0)k.beam(p(a,z-d/2-.2),p(a,z+d/2+.2),1.2,C.patina);}for(const zz of [-.5,-.25,0,.25,.5])for(let i=0;i<16;i++){const a=i/16*Math.PI,b=(i+1)/16*Math.PI;k.beam([x+Math.cos(a)*w/2,y+Math.sin(a)*h,z+zz*d],[x+Math.cos(b)*w/2,y+Math.sin(b)*h,z+zz*d],1.1,C.patina);}}
function garnier(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(216,146);f.box(0,51,8,199,94,112,C.stone);f.box(0,79,30,71,150,62,C.shadow);
 for(const x of [-75,-51,-27,0,27,51,75])k.col(x,43,-52,43,3.7);
 k.detail(()=>{k.cornice(0,97,8,203,115);for(const x of [-75,-45,-15,15,45,75]){k.arch(x,10,-48.5,17,29);k.arch(x,49,-48.6,17,34);k.statue(x,100,-52,9);}
  for(const x of [-91,91]){f.box(x,100,4,25,18,105,C.stone);k.mansard(x,109,4,29,110,24);k.statue(x,133,-40,18);f.cone(x,151,-40,2.4,10,C.gold,8,0);}
  f.cone(0,107,-4,36,12,C.patina,24,36);k.dome(0,119,-4,36,36,C.patina);k.cornice(0,157,30,75,65);
  for(const side of [-1,1]){k.statue(side*15,160,30,16);k.beam([side*15,168,30],[side*31,172,30],2,C.gold);}k.statue(0,163,30,17);
  k.panel(0,91,-53,133,4,C.gold);for(let x=-90;x<=90;x+=12)k.panel(x,35,-49,5,4,C.shadow);
  for(const side of [-1,1]){const g=k.face(side*100,8,side*Math.PI/2);for(const z of [-34,0,34])for(const y of [27,67])g.window(z,y,-.3,17,24);}
 });
}
function orsay(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(236,126);f.box(0,40,2,225,72,103,C.stone);
 for(const x of [-96,96])f.box(x,60,-5,33,112,107,C.stone);
 k.detail(()=>{vault(k,0,78,6,158,91,43,'#55727a');for(const x of [-96,96]){k.mansard(x,116,-5,37,110,25);k.cornice(x,113,-5,37,110);for(const y of [28,66,94])k.window(x,y,-59,17,19);}
  for(let x=-64;x<=64;x+=21.3)k.arch(x,12,-50,15,49);k.cornice(0,76,0,230,106);f.box(0,104,-48,48,56,9,C.stone);clock(k,0,110,-53,16);k.pediment(0,133,-54,50,12,8);
  for(const side of [-1,1]){const g=k.face(side*113,0,side*Math.PI/2);for(const z of [-34,0,34])g.arch(z,18,-.2,18,44);}
 });
}
function grandPalais(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(246,151);f.box(0,31,3,232,54,130,C.stone);f.box(0,54,-56,87,100,18,C.stone);
 for(const x of [-104,104])f.box(x,42,-48,24,76,27,C.stone);
 k.detail(()=>{vault(k,0,65,8,167,110,65,'#597d7b');k.cornice(0,61,3,238,133);for(let x=-91;x<=91;x+=26)k.col(x,11,-63,44,3.3);for(const x of [-80,-52,52,80])k.arch(x,15,-62.5,17,36);k.arch(0,9,-66,34,57);k.pediment(0,108,-67,91,23,13);
  for(const side of [-1,1]){f.box(side*104,83,-48,27,4,29,C.light);for(const x of [-7,7]){f.box(side*104+x,90,-47,8,8,16,C.patina);f.cone(side*104+x,94,-53,3.1,9,C.patina,8,1.5);}k.statue(side*104,90,-42,18);}
  for(let i=0;i<12;i++){const a=i/12*TAU;f.cone(Math.cos(a)*22,123,8+Math.sin(a)*22,1.3,11,C.patina,6,1.3);}k.dome(0,131,8,24,20,'#72958b');f.cone(0,151,8,1.8,4,C.gold,8,0);
 });
}
function petitPalais(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(206,136);for(const x of [-68,68])f.box(x,34,7,66,60,106,C.stone);f.box(0,45,-18,59,82,65,C.stone);
 k.detail(()=>{for(const x of [-68,68]){k.mansard(x,65,7,70,110,20);for(const xx of [-21,0,21]){k.arch(x+xx,13,-47,14,38);k.col(x+xx-8,10,-49,42,2.2);}}
  k.arch(0,8,-51,35,63);for(const x of [-27,27])k.col(x,8,-53,67,4);k.cornice(0,82,-18,64,68);f.cone(0,85,-18,28,14,C.stone,24,28);k.dome(0,99,-18,31,35);f.cone(0,134,-18,4,12,C.gold,8,2);k.statue(0,141,-18,9);
  for(let i=0;i<9;i++){const a=Math.PI+i/8*Math.PI,x=Math.cos(a)*48,z=43+Math.sin(a)*28;k.col(x,7,z,34,2.5);}
  for(const side of [-1,1])k.statue(side*44,69,-49,15);
 });
}
function hotelVille(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(236,136);f.box(0,47,0,225,86,110,C.stone);f.box(0,74,-26,42,140,65,C.stone);
 for(const x of [-96,96])for(const z of [-42,42])f.box(x,57,z,30,106,33,C.stone);
 k.detail(()=>{k.mansard(0,91,0,227,112,24);for(const x of [-96,96])for(const z of [-42,42]){k.mansard(x,110,z,34,37,31);f.cone(x,141,z,1.7,10,C.gold,6,0);}
  for(const x of [-76,-57,-38,38,57,76])for(const y of [23,51,77])k.window(x,y,-55.6,11,17);for(const x of [-96,96])for(const y of [27,58,88])k.arch(x,y-8,-59,13,19);
  for(const x of [-17,0,17])k.arch(x,7,-59,12,36);clock(k,0,115,-59,12);k.cornice(0,145,-26,47,68);k.mansard(0,148,-26,47,66,31);f.cone(0,179,-26,1.8,6,C.gold,6,0);
  for(let x=-78;x<=78;x+=13)if(Math.abs(x)>25)k.statue(x,94,-57,9);for(const y of [40,67,91])k.panel(0,y,-56,222,2.5,C.light);
  for(const side of [-1,1]){const g=k.face(side*113,0,side*Math.PI/2);for(const x of [-28,0,28])for(const y of [28,61])g.window(x,y,-.4,13,20);}
 });
}
function conciergerie(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(226,121);f.box(0,47,12,217,86,80,C.stone);f.box(-91,68,-28,31,128,33,C.stone);
 for(const [x,r,h]of[[-35,18,130],[30,18,130],[91,16,120]])f.cone(x,4,-35,r,h,C.stone,20,r);
 k.detail(()=>{k.roof(0,90,12,220,85,34);k.mansard(-91,132,-28,35,37,25);clock(k,-91,108,-45,8);
  for(const [x,r,h]of[[-35,18,130],[30,18,130],[91,16,120]]){f.cone(x,h+4,-35,r+2,42,C.roof,20,0);f.cone(x,h+46,-35,1,4,C.gold,6,0);for(const y of [31,71,109])k.arch(x,y,-35-r-.2,8,17,true);f.cone(x,h,-35,r+1,3,C.light,20,r+1);}
  for(let x=-72;x<=72;x+=24)for(const y of [27,58,80])k.window(x,y,-28.4,10,14);for(const x of [-63,0,63])k.arch(x,6,-28.8,15,22);k.cornice(0,91,12,220,84);
 });
}
function luxembourg(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(216,141);f.box(0,41,45,191,74,39,C.stone);for(const x of [-80,80]){f.box(x,41,0,32,74,116,C.stone);f.box(x,49,-43,41,90,39,C.stone);}f.box(0,57,44,45,106,45,C.stone);
 k.detail(()=>{k.mansard(0,111,44,49,49,28);f.cone(0,139,44,2.5,11,C.gold,8,0);for(const x of [-80,80]){k.mansard(x,95,-43,45,43,31);k.mansard(x,79,20,36,78,24);for(const y of [23,51,78])for(const dx of [-11,11])k.window(x+dx,y,-63,9,17);}
  k.mansard(0,80,45,194,42,24);for(let x=-60;x<=60;x+=20)for(const y of [23,53])k.window(x,y,24.8,12,20);k.pediment(0,109,20,47,19,7);
  for(const x of [-80,80])for(let y=14;y<92;y+=8)k.panel(x,y,-63.4,40,.8,C.shadow);for(const side of [-1,1]){const g=k.face(side*64,0,-side*Math.PI/2);for(const z of [-32,-8,16,40])for(const y of [23,52])g.window(z,y,-.3,11,19);}
 });
}
function bourbon(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(201,121);f.box(0,40,10,183,72,79,C.stone);
 for(let x=-68;x<=68;x+=13.6)k.col(x,9,-43,64,3.7);
 k.detail(()=>{k.cornice(0,77,-38,158,27);k.pediment(0,82,-54,166,34,21);for(let x=-50;x<=50;x+=17)k.statue(x,88,-54.5,9+(1-Math.abs(x)/60)*8);k.roof(0,78,10,187,83,24);for(const x of [-81,81]){f.box(x,84,28,27,20,42,C.stone);k.mansard(x,94,28,31,46,25);k.statue(x,118,28,12);}for(const x of [-48,-24,0,24,48])k.arch(x,11,-30,15,47);for(const x of [-94,94])k.statue(x,7,-48,20);f.cone(0,116,-46,1.5,19,C.gold,6,0);});
}
function royal(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(216,141);f.box(0,45,47,200,82,36,C.stone);for(const x of [-88,88])f.box(x,44,0,25,80,115,C.stone);f.box(0,53,46,42,98,40,C.stone);
 k.detail(()=>{k.mansard(0,104,46,46,44,26);f.cone(0,130,46,1.5,5,C.gold,6,0);k.mansard(0,88,47,203,40,22);for(const x of [-88,88]){k.mansard(x,86,0,29,119,23);const g=k.face(x-Math.sign(x)*13,0,-Math.sign(x)*Math.PI/2);for(let z=-45;z<=45;z+=18){g.arch(z,8,-.2,12,29);g.window(z,61,-.5,10,19);}}
  for(let x=-78;x<=78;x+=19.5){k.arch(x,9,28.7,13,28);k.window(x,63,28.5,11,20);}k.pediment(0,104,24,46,22,6);
  for(const x of [-48,-24,0,24,48])for(const z of [-41,-17,7]){const h=7+(Math.round(x/24)+Math.round(z/24)+8)%3*4;f.cone(x,4,z,4.3,h,C.light,12,4.3);for(let i=0;i<12;i+=2){const a=i/12*TAU,b=(i+1)/12*TAU,p=(angle,y)=>[x+Math.cos(angle)*4.34,y,z+Math.sin(angle)*4.34];f.quad(p(a,4),p(a,4+h),p(b,4+h),p(b,4),C.dark);}}
 });
}
function biron(mesh,item){
 const k=parisKit(mesh,item),{f,C}=k;k.base(161,116);f.box(0,34,8,143,60,80,C.stone);f.box(0,43,2,48,78,94,C.stone);
 k.detail(()=>{k.mansard(0,84,2,53,98,25);for(const x of [-50,50])k.mansard(x,66,8,49,84,24);k.pediment(0,79,-46,51,23,8);for(const x of [-57,-38,38,57])for(const y of [23,48])k.window(x,y,-32.5,12,19);for(const x of [-14,0,14])k.arch(x,11,-45.5,10,35);for(const x of [-14,14])k.window(x,64,-46,10,15);k.cornice(0,64,8,146,84);
  for(const x of [-53,53]){f.box(x,8,-45,14,8,14,C.shadow);f.cone(x,12,-45,4,12,C.patina,8,2.5);f.cone(x+1,24,-45,2.8,5,C.patina,8,2);k.beam([x,21,-45],[x+6,17,-48],1.9,C.patina);}
  for(const x of [-23,23]){f.box(x,91,27,7,18,9,C.shadow);f.box(x,101,27,9,3,11,C.light);}f.cone(0,109,2,1.5,6,C.gold,6,0);
 });
}
const BUILDERS=Object.freeze({'palais-garnier':garnier,'musee-orsay':orsay,'grand-palais':grandPalais,'petit-palais':petitPalais,'hotel-de-ville':hotelVille,conciergerie,'palais-luxembourg':luxembourg,'palais-bourbon':bourbon,'palais-royal':royal,'hotel-biron':biron});
export function addParisPalace(mesh,item){const draw=BUILDERS[item.kind];if(!draw)return false;draw(mesh,item);return true;}
