/** Compact architectural interpretations for the existing London racecourse.
 * Frontage is local -Z. The East Front and balcony of Buckingham Palace,
 * Westminster's Gothic west towers, and the Museum's Ionic south portico are
 * informed by the institutions' own architectural histories; proportions are
 * compressed to suit the established game world, not geographic reconstructions.
 * https://www.rct.uk/visit/buckingham-palace/history-of-the-east-wing-of-buckingham-palace
 * https://www.westminster-abbey.org/history/explore-our-history/architecture
 * https://www.britishmuseum.org/about-us/british-museum-story/architecture
 */
import { frame, details, beam, word, frontDisk, arch, window, cornice, pediment, column } from './london-west-end.js';

const TAU=Math.PI*2;
export const ROYAL_LANDMARKS=Object.freeze([
 Object.freeze({kind:'buckingham-palace',label:'Buckingham Palace',radius:160,width:282,depth:138,height:151}),
 Object.freeze({kind:'westminster-abbey',label:'Westminster Abbey',radius:145,width:186,depth:214,height:233}),
 Object.freeze({kind:'british-museum',label:'British Museum',radius:160,width:282,depth:138,height:158}),
]);

function balustrade(f,x,y,z,width,stone){
 f.box(x,y,z,width,2.6,3.6,stone);f.box(x,y+12,z,width+1,2.2,4,stone);
 const count=Math.floor(width/6);
 for(let i=0;i<=count;i++){
  const xx=x-width/2+i*width/count;f.cone(xx,y+1,z,1.45,3,stone,12,1.0);f.cone(xx,y+4,z,1,4,stone,12,1.6);f.cone(xx,y+8,z,1.6,3,stone,12,.9);
 }
}
function reliefPerson(mesh,f,x,y,z,scale,color,pose=0){
 f.cone(x,y,z,2.6*scale,9*scale,color,16,1.9*scale);f.cone(x,y+9*scale,z,1.9*scale,3.8*scale,color,16,1.4*scale);
 beam(mesh,f.p(x-1.4*scale,y+7*scale,z),f.p(x-4*scale,y+(pose?9:4)*scale,z),1.2*scale,color);
 beam(mesh,f.p(x+1.4*scale,y+7*scale,z),f.p(x+4*scale,y+(pose?11:4)*scale,z),1.2*scale,color);
}
function buckingham(mesh,item){
 const f=frame(mesh,item),stone='#d5cebc',trim='#eee7d5',shade='#b9af98',glass='#41545b',iron='#283637',gold='#d3b777';
 // Three subtly projected risalits give the broad, low East Front its rhythm.
 f.box(0,4,4,276,8,110,'#a49f8c');f.box(0,54,13,268,94,88,stone);
 for(const x of [-111,0,111])f.box(x,54,6,x===0?74:48,96,105,stone);
 // A closed royal forecourt is solid at car height; ornament is decorative.
 f.box(0,4.5,-61,274,9,14,'#a8a28f');
 for(const x of [-130,-65,65,130])f.box(x,14,-61,8,27,8,stone);
 details(mesh,()=>{
  // Stone rustication and carefully inset sash windows, rather than a flat grid.
  for(const y of [15,24,33])f.box(0,y,-43.7,265,.65,.9,shade);
  for(const x of [-112,-94,-76,-58,-40,-20,0,20,40,58,76,94,112]){
   const front=Math.abs(x)<38||Math.abs(x)>87?-47.2:-31.5;
   for(const y of [21,54,81])window(f,x,y,front,10,y===54?19:15,trim,glass);
   if(yWithinFacade(x))pediment(f,x,66,front-2.5,15,4,2,trim,shade);
  }
  // Giant pilasters, capitals and entablature of Aston Webb's Portland front.
  for(const x of [-134,-88,-38,-12,12,38,88,134]){
   const z=Math.abs(x)>=88?-47:-47.3;f.box(x,64,z,4.4,59,2.8,trim);f.box(x,37,z,6,4,4,shade);f.box(x,91,z,7,4,4,trim);
   for(const dx of [-.8,.8])f.box(x+dx,64,z-1.6,.4,45,.6,shade);
  }
  cornice(f,0,100,5,271,106,trim);f.box(0,110,6,269,12,103,stone);
  for(const x of [-111,0,111]){
   const w=x===0?79:49;cornice(f,x,115,4,w,109,trim);
   for(let xx=x-w/2+4;xx<=x+w/2-4;xx+=8)f.box(xx,109,-51.5,2.6,6,1.5,shade);
  }
  for(let x=-130;x<=130;x+=7)f.box(x,97,-49,2.6,3,3,shade);
  for(const x of [-67,67])balustrade(f,x,105,-49,42,trim);
  // Famous central balcony: projecting stone brackets and open baluster rail.
  f.box(0,48,-54,49,4,18,trim);for(const x of [-19,19]){
   f.box(x,42,-50,4,10,9,shade);f.tri([x-2,37,-46],[x-2,46,-59],[x-2,46,-46],trim);
  }
  balustrade(f,0,50,-62,48,trim);for(const x of [-25,25])f.box(x,56,-54,3,14,18,trim);
  // Centre attic's sculptural coat of arms and flagpole make the silhouette clear.
  frontDisk(f,0,108,-53.7,6.6,shade);frontDisk(f,0,108,-54.1,4.9,trim);
  for(const x of [-8,8])f.cone(x,104,-53.5,2,7,trim,16,1.6);
  for(let i=-2;i<=2;i++)f.cone(i*1.8,113,-54.3,.8,2.8,trim,12,0);
  f.cone(0,118,5,.9,33,iron,16,.7);
  // Small rippled Union flag; coloured cloth is geometry, never a sky texture.
  const flag=(x,y)=>[x,y,5+Math.sin(x*.31)*1.15];
  for(let i=0;i<12;i++){
   const a=i*1.9,b=(i+1)*1.9;f.quad(flag(a,134),flag(b,134),flag(b,148),flag(a,148),'#344b6c');
   const mid=141+(a/22.8-.5)*10.5,next=141+(b/22.8-.5)*10.5;
   f.quad(flag(a,mid-1),flag(b,next-1),flag(b,next+1),flag(a,mid+1),'#f0e3cb');
   const lo=282-mid,hi=282-next;f.quad(flag(a,lo-1),flag(b,hi-1),flag(b,hi+1),flag(a,lo+1),'#f0e3cb');
   f.quad(flag(a,139),flag(b,139),flag(b,143),flag(a,143),'#f0e3cb');f.quad(flag(a,140),flag(b,140),flag(b,142),flag(a,142),'#b54844');
  }
  f.quad(flag(9.8,134),flag(13,134),flag(13,148),flag(9.8,148),'#f0e3cb');f.quad(flag(10.6,134),flag(12.2,134),flag(12.2,148),flag(10.6,148),'#b54844');
  // Forecourt gates have narrow gold spearheads and a central crest.
  for(let x=-126;x<=126;x+=5){
   f.box(x,15,-64,1.1,23,1.1,iron);f.cone(x,26.5,-64,.95,3.5,gold,12,0);
  }
  for(const y of [9,20,25])f.box(0,y,-64,260,1.1,1.3,iron);
  for(const x of [-130,-65,65,130]){
   f.box(x,28,-61,10,3,10,trim);f.cone(x,29.5,-61,4,2,trim,24,2.9);f.cone(x,31.5,-61,2.8,4.6,trim,24,1.1);
  }
  frontDisk(f,0,18,-65.2,6.5,gold);frontDisk(f,0,18,-65.5,4.7,iron);
  for(const x of [-14,14])f.box(x,19,-65.5,11,1,1,gold);
  f.box(0,34,-65,96,11,2,iron);word(f,'BUCKINGHAM PALACE',0,31.5,-66.1,4.8,86,gold,.15);
  // Subtle returns and chimneys keep rear-quarter views composed.
  for(const side of [-1,1])for(const z of [-13,13,39])for(const y of [52,79])f.box(side*135,y,z,1,15,10,glass);
  for(const x of [-109,-62,62,109]){f.box(x,118,29,7,17,9,stone);f.box(x,127,29,9,2,11,shade);for(const dx of [-2,2])f.cone(x+dx,128,29,1.2,5,'#a2886c',12,1.2);}
 });
}
function yWithinFacade(x){return Math.abs(x)===58||Math.abs(x)===76||Math.abs(x)===20;}

// Two-centre pointed arch with continuous curved voussoirs and inset tracery.
function pointed(mesh,f,x,bottom,z,w,h,trim,glass,mullions=2){
 const r=w/2,peak=r*Math.sqrt(3),spring=bottom+h-peak,path=[];
 for(let i=0;i<=18;i++){const a=Math.PI-i/18*Math.PI/3;path.push([x+r+Math.cos(a)*w,spring+Math.sin(a)*w,z]);}
 for(let i=1;i<=18;i++){const a=Math.PI/3-i/18*Math.PI/3;path.push([x-r+Math.cos(a)*w,spring+Math.sin(a)*w,z]);}
 f.box(x,(bottom+spring)/2,z,w,Math.max(1,spring-bottom),1.2,glass,.04);
 for(let i=1;i<path.length;i++){
  f.tri([x,spring,z-.7],path[i].map((n,j)=>j===2?n-.7:n),path[i-1].map((n,j)=>j===2?n-.7:n),glass,.04);
  const a=path[i-1],b=path[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),ox=-dy/length*.85,oy=dx/length*.85;
  f.quad([a[0]-ox,a[1]-oy,z-1.1],[a[0]+ox,a[1]+oy,z-1.1],[b[0]+ox,b[1]+oy,z-1.1],[b[0]-ox,b[1]-oy,z-1.1],trim);
 }
 for(const sign of [-1,1])f.box(x+sign*(r+.7),(bottom+spring)/2,z-1,1.5,spring-bottom,2,trim);
 for(let i=1;i<=mullions;i++){
  const xx=x-r+w*i/(mullions+1),d=Math.abs(xx-x),top=spring+Math.sqrt(Math.max(0,w*w-(r+d)**2));
  f.box(xx,(bottom+top)/2,z-1.7,.8,top-bottom,1,trim);
 }
 f.box(x,bottom,z-1.3,w+3,2.5,3,trim);f.box(x,spring-5,z-1.8,w,1.0,.8,trim);
}
function pinacle(f,x,bottom,z,height,stone){
 f.box(x,bottom+height*.34,z,4,height*.68,4,stone);f.cone(x,bottom+height*.67,z,3.5,height*.33,stone,4,0);
}
function abbey(mesh,item){
 const f=frame(mesh,item),stone='#d4cebd',trim='#ebe4cf',shade='#afa792',glass='#415765',roof='#5c6869';
 // Long nave and low aisles, with west towers markedly taller than the centre.
 f.box(0,4,8,150,8,202,'#a6a18e');f.box(0,62,14,84,113,183,stone);
 for(const side of [-1,1])f.box(side*55,37,22,36,64,163,stone);
 for(const side of [-1,1])f.box(side*59,107,-61,43,206,47,stone);
 f.box(0,52,-69,76,96,40,stone);
 // Footings for the flying buttresses remain solid at their visible base.
 for(const side of [-1,1])for(const z of [-8,30,68])f.box(side*85,30,z,10,59,12,stone);
 details(mesh,()=>{
  // An actual ridge roof, with visible pitches on both nave and side aisles.
  const ridge=(cx,y,z,w,d,rise,color)=>{
   f.quad([cx-w/2,y,z-d/2],[cx,y+rise,z-d/2],[cx,y+rise,z+d/2],[cx-w/2,y,z+d/2],color);
   f.quad([cx,y+rise,z-d/2],[cx+w/2,y,z-d/2],[cx+w/2,y,z+d/2],[cx,y+rise,z+d/2],color);
   f.tri([cx-w/2,y,z-d/2],[cx+w/2,y,z-d/2],[cx,y+rise,z-d/2],color);
  };
  ridge(0,122,18,87,175,37,roof);for(const s of [-1,1])ridge(s*59,72,23,40,161,14,roof);
  f.box(0,161,17,2,3,172,trim);
  // Great west window and deep, gabled main portal.
  pointed(mesh,f,0,66,-90,62,69,trim,glass,5);
  for(const x of [-21,-10.5,0,10.5,21])pointed(mesh,f,x,69,-91.9,8,36,trim,x===0?'#87928a':glass,0);
  f.box(0,15,-91,45,26,2,'#574f45');pointed(mesh,f,0,5,-92,46,56,trim,'#584b3e',1);
  for(const offset of [3,6]){
   const ww=46+offset*2;pointed(mesh,f,0,5,-91+offset*.2,ww,56+offset*.9,shade,'#6b6558',0);
  }
  // Reapply the recessed inner entrance so outer archivolts never conceal it.
  pointed(mesh,f,0,5,-94,41,51,trim,'#493f37',1);f.box(0,20,-95.8,1.7,27,1,trim);
  for(const x of [-12,12])for(const y of [14,29])f.box(x,y,-96,11,11,.7,'#605342');
  pediment(f,0,54,-96,71,25,11,trim,shade);reliefPerson(mesh,f,0,61,-97,1.1,trim,1);
  f.box(0,141,-86,79,5,12,trim);for(let x=-34;x<=34;x+=8)f.box(x,148,-86,4,10,5,trim);
  // The two Hawksmoor towers: banded stages, tall louvres, crenellated crown.
  for(const side of [-1,1]){
   const x=side*59;
   for(const y of [39,90,143,197,209])cornice(f,x,y,-61,44,48,trim);
   for(const dx of [-19,19]){
    f.box(x+dx,107,-85.5,3,198,4,trim);
    for(const y of [29,76,129,177])pinacle(f,x+dx,y,-87.5,16,trim);
   }
   pointed(mesh,f,x,12,-85.6,25,43,trim,glass,1);
   for(const y of [101,150])pointed(mesh,f,x,y,-86,26,40,trim,'#44535a',1);
   for(const yy of [154,159,164,169,174])f.box(x,yy,-87.9,22,1.3,1.2,shade);
   for(let dx=-18;dx<=18;dx+=9)f.box(x+dx,216,-84,5,12,6,trim);
   for(const dx of [-20,20])for(const z of [-83,-39])pinacle(f,x+dx,211,z,22,trim);
   for(const dx of [-11,0,11])f.box(x+dx,213,-37,4,9,5,trim);
   // North tower clock versus south tower roundel, as on the west elevation.
   frontDisk(f,x,71,-88,11,trim);frontDisk(f,x,71,-88.3,8.7,side<0?'#334d5b':shade);
   if(side<0){
    for(let j=0;j<12;j++){const a=j/12*TAU;f.box(x+Math.sin(a)*7,71+Math.cos(a)*7,-88.8,1,1.3,.6,'#e3c98a');}
    beam(mesh,f.p(x,71,-89.3),f.p(x-4.5,76,-89.3),.8,'#e3c98a');
   }else frontDisk(f,x,71,-88.7,4.8,trim);
   // Exposed side lancets are rotated onto the flank, rather than painted front.
   const q=f.p(x+side*22,0,-58),sf=frame(mesh,{x:q[0],z:q[2],angle:(item.angle||0)+side*Math.PI/2,elevation:item.elevation||0});
   for(const y of [103,151])pointed(mesh,sf,0,y,0,24,38,trim,glass,1);
  }
  // Flying buttress arches spring from low outer piers into the tall nave wall.
  for(const side of [-1,1])for(const z of [-8,30,68]){
   pinacle(f,side*85,57,z,27,trim);f.box(side*85,8,z,13,8,15,shade);
   const start=f.p(side*84,67,z),end=f.p(side*42,102,z);
   for(let i=0;i<18;i++){
    const t=i/18,u=(i+1)/18,p=a=>[start[0]+(end[0]-start[0])*a,start[1]+(end[1]-start[1])*a+Math.sin(a*Math.PI)*5,start[2]+(end[2]-start[2])*a];beam(mesh,p(t),p(u),3.5,trim);
   }
   f.box(side*42,92,z,5,44,6,trim);pinacle(f,side*43,114,z,26,trim);
  }
  // Nave clerestory windows and six trefoil medallions, readable from an approach.
  for(const side of [-1,1]){
   const q=f.p(side*43.5,0,32),sf=frame(mesh,{x:q[0],z:q[2],angle:(item.angle||0)+side*Math.PI/2,elevation:item.elevation||0});
   for(const xx of [-57,-19,19,57])pointed(mesh,sf,xx,83,0,21,32,trim,glass,1);
   for(const xx of [-38,0,38])for(const a of [0,2.094,4.189])frontDisk(sf,xx+Math.cos(a)*3.2,119+Math.sin(a)*3.2,-.8,2.6,shade);
  }
  f.box(0,4,-102,103,8,10,shade);word(f,'WESTMINSTER ABBEY',0,2.2,-107.1,3.6,94,'#f1e6c7',.08);
 });
}

function museum(mesh,item){
 const f=frame(mesh,item),stone='#cbbd9f',trim='#e6dac0',shade='#aa9878',glass='#41555a';
 f.box(0,3,0,276,6,127,'#aaa18c');f.box(0,58,19,268,105,86,stone);
 f.box(0,6,-51,139,6,28,'#c3b69b');f.box(0,10,-48,132,3,28,trim);
 // Central eight-column portico plus colonnaded wings and side returns.
 const portico=[-52.5,-37.5,-22.5,-7.5,7.5,22.5,37.5,52.5];
 const wing=[-125,-111,-97,-83,83,97,111,125];
 for(const x of [...portico,...wing])f.cone(x,9,x>=-60&&x<=60?-48:-34,4.4,94,stone,32,3.7);
 for(const side of [-1,1])for(const z of [-12,11,34])f.cone(side*125,9,z,4.4,94,stone,32,3.7);
 details(mesh,()=>{
  // Shaded colonnade backing stays visible between individual fluted columns.
  for(const x of [-112,-87,-62,-37,37,62,87,112])window(f,x,61,-24.5,10,29,shade,glass);
  for(const x of [-18,0,18])f.box(x,34,-25.4,13,49,2,'#43504b');
  for(const x of [...portico,...wing])column(f,x,9,x>=-60&&x<=60?-48:-34,95,4.3,trim,shade);
  for(const side of [-1,1])for(const z of [-12,11,34])column(f,side*125,9,z,95,4.3,trim,shade);
  // Deep paired volutes make the capitals unmistakably Ionic.
  for(const x of [...portico,...wing]){
   const z=x>=-60&&x<=60?-53:-39;
   for(const side of [-1,1]){
    frontDisk(f,x+side*4.3,98,z,2.9,trim);frontDisk(f,x+side*4.3,98,z-.2,1.8,shade);frontDisk(f,x+side*4.3,98,z-.4,.85,trim);
   }
  }
  f.box(0,109,0,272,13,126,stone);cornice(f,0,119,0,274,126,trim);
  f.box(0,108,-53.5,126,15,8,stone);word(f,'THE BRITISH MUSEUM',0,106,-57.7,5.6,115,'#7b6b4c',.04);
  cornice(f,0,119,-46,130,30,trim);pediment(f,0,125,-64,137,32,39,trim,shade);
  // The Progress of Civilisation is suggested with dimensional draped figures,
  // a central raised figure and instruments, not a featureless triangle.
  for(const [x,size] of [[-48,.45],[-36,.7],[-24,1],[-12,1.15],[0,1.65],[12,1.15],[24,1],[36,.7],[48,.45]])reliefPerson(mesh,f,x,128,-65,size,trim,x===0?1:0);
  for(const side of [-1,1]){
   f.box(side*27,132,-66,5,6,1.6,trim);beam(mesh,f.p(side*15,131,-66),f.p(side*20,138,-66),1.1,trim);
   f.cone(side*39,127,-65,2,6,trim,16,2);
  }
  for(let x=-132;x<=132;x+=6)f.box(x,115,-64,2.7,3,3,shade);
  f.box(0,128,21,262,9,84,'#7a786b');f.box(0,133,21,260,2,84,trim);
  // Glass hint of the Great Court at the rear, with a smooth lattice roof.
  const cx=0,cz=27,rx=67,rz=31,base=134;
  for(let ring=0;ring<6;ring++){
   const t0=ring/6*Math.PI/2,t1=(ring+1)/6*Math.PI/2;
   for(let j=0;j<40;j++){
    const a=j/40*TAU,b=(j+1)/40*TAU,p=(t,q)=>[cx+Math.cos(q)*rx*Math.cos(t),base+Math.sin(t)*20,cz+Math.sin(q)*rz*Math.cos(t)];
    f.quad(p(t0,a),p(t0,b),p(t1,b),p(t1,a),'#95aaa5');
   }
  }
  for(let j=0;j<16;j++)for(let i=0;i<10;i++){
   const a=j/16*TAU,t=i/10*Math.PI/2,u=(i+1)/10*Math.PI/2,p=q=>f.p(cx+Math.cos(a)*rx*Math.cos(q),base+Math.sin(q)*20+.3,cz+Math.sin(a)*rz*Math.cos(q));beam(mesh,p(t),p(u),.65,trim);
  }
  for(const side of [-1,1]){
   for(const z of [-8,18,43])f.box(side*135,65,z,1,25,11,glass);
   f.box(side*92,14,-55,26,21,3,'#334e55');word(f,'MUSEUM',side*92,15,-56.8,3.6,23,'#ead9ad',.1);
  }
 });
}

export function addRoyalLandmark(mesh,item){
 const draw={'buckingham-palace':buckingham,'westminster-abbey':abbey,'british-museum':museum};
 draw[item.kind]?.(mesh,item);
}
