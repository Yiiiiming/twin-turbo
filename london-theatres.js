/** Eight compact West End interpretations, all with their street frontage at -Z.
 * Their characteristic elevations follow the venue/heritage references below;
 * these are purpose-built game models, not geographic or measured replicas.
 * Selected playbills use locally packaged official show artwork; the other
 * illustrated signs remain original geometry. No third-party meshes are used.
 */
import { frame, details, beam, word, frontDisk, cornice, pediment, canopy } from './london-west-end.js';

export const LONDON_THEATRES=Object.freeze([
  {kind:'his-majestys-theatre',label:"His Majesty's Theatre",radius:112,width:190,depth:112,height:212},
  {kind:'theatre-royal-drury-lane',label:'Theatre Royal Drury Lane',radius:112,width:196,depth:114,height:139},
  {kind:'lyceum-theatre',label:'Lyceum Theatre',radius:118,width:198,depth:128,height:156},
  {kind:'sondheim-theatre',label:'Sondheim Theatre',radius:105,width:180,depth:112,height:130},
  {kind:'apollo-victoria',label:'Apollo Victoria',radius:112,width:198,depth:112,height:146},
  {kind:'victoria-palace',label:'Victoria Palace',radius:112,width:192,depth:116,height:220},
  {kind:'savoy-theatre',label:'Savoy Theatre',radius:102,width:176,depth:106,height:134},
  {kind:'prince-edward-theatre',label:'Prince Edward Theatre',radius:112,width:196,depth:116,height:165},
].map(Object.freeze));

/** Local façade surfaces; raster artwork covers the fallback illustration only.
 * Local +X is screen left when viewed from the street (-Z). */
export const THEATRE_POSTERS=Object.freeze([
  {key:'lion',kind:'lyceum-theatre',file:'lion-king.jpg',x:-9,y:73,z:-50.7,width:55,height:47},
  {key:'mormon',kind:'savoy-theatre',file:'book-of-mormon.jpg',x:-26,y:84,z:-34,width:62,height:48},
  {key:'wrong',kind:'prince-edward-theatre',file:'play-that-goes-wrong.jpg',x:-37,y:91,z:-39,width:53,height:57},
].map(Object.freeze));

export function theatrePosterSurfaces(landmarks){
  return THEATRE_POSTERS.flatMap(poster=>{
    const item=landmarks.find(item=>item.kind===poster.kind);if(!item)return [];
    const f=frame(null,item),{x,y,z,width:w,height:h}=poster;
    // Slightly ahead of all fallback lettering, still within the existing frame.
    const corner=(dx,dy,u,v)=>[...f.p(x+dx*w/2,y+dy*h/2,z-1.1),u,v];
    const a=corner(1,-1,0,0),b=corner(1,1,0,1),c=corner(-1,1,1,1),d=corner(-1,-1,1,0);
    return [{...poster,vertices:new Float32Array([...a,...b,...c,...a,...c,...d])}];
  });
}

export const LONDON_THEATRE_REFERENCES=Object.freeze([
  'https://historicengland.org.uk/listing/the-list/list-entry/1357090',
  'https://thelane.co.uk/restoration',
  'https://historicengland.org.uk/listing/the-list/list-entry/1066119',
  'https://historicengland.org.uk/listing/the-list/list-entry/1236175',
  'https://www.atgtickets.com/venues/apollo-victoria-theatre/',
  'https://historicengland.org.uk/listing/the-list/list-entry/1238140',
  'https://www.thesavoytheatre.com/about-us/the-venue',
  'https://www.delfontmackintosh.co.uk/theatres/prince-edward-theatre/history',
]);

const TAU=Math.PI*2,glass='#354e59',gold='#d3b775',stone='#d9d3c1',ivory='#ebe3ce',shade='#aa9f89';
// Thin facade details are planes; silhouettes and occupied volumes remain solid.
// This spends triangles on domes and porticos without filling the GPU with boxes.
function panel(f,x,y,z,w,h,color,glow=0){
  f.quad([x-w/2,y-h/2,z],[x-w/2,y+h/2,z],[x+w/2,y+h/2,z],[x+w/2,y-h/2,z],color,glow);
}
function pane(f,x,y,z,w,h,trim=ivory,color=glass){
  panel(f,x,y,z,w+3,h+3,trim);panel(f,x,y,z-.12,w,h,color,.03);
  panel(f,x,y,z-.25,.8,h,trim);panel(f,x,y+2,z-.25,w,.8,trim);
  f.box(x,y-h/2-1.6,z-.5,w+5,2,3,trim);
}
function archLite(f,x,bottom,z,w,h,trim=ivory,color=glass){
  const r=w/2,sy=bottom+h-r;
  panel(f,x,(bottom+sy)/2,z,w,sy-bottom,color,.05);
  for(let j=0;j<16;j++){
    const a=j/16*Math.PI,b=(j+1)/16*Math.PI;
    f.tri([x,sy,z],[x+Math.cos(a)*r,sy+Math.sin(a)*r,z],[x+Math.cos(b)*r,sy+Math.sin(b)*r,z],color,.05);
    f.quad([x+Math.cos(a)*r,sy+Math.sin(a)*r,z-.12],[x+Math.cos(a)*(r+2),sy+Math.sin(a)*(r+2),z-.12],[x+Math.cos(b)*(r+2),sy+Math.sin(b)*(r+2),z-.12],[x+Math.cos(b)*r,sy+Math.sin(b)*r,z-.12],trim);
  }
  for(const sign of [-1,1])panel(f,x+sign*(r+1),(bottom+sy)/2,z-.12,2,sy-bottom,trim);
  panel(f,x,bottom+h*.46,z-.25,.9,h*.89,trim);panel(f,x,sy,z-.25,w,1,trim);
  f.box(x,bottom-1,z-.5,w+5,2,3,trim);
}
function shaft(f,x,y,z,h,r,color=ivory){
  f.box(x,y+2,z,r*2.7,4,r*2.7,color);f.cone(x,y+4,z,r,h-10,color,20,r*.86);
  f.box(x,y+h-3,z,r*2.7,6,r*2.7,color);
  for(const d of [-.52,0,.52])panel(f,x+d*r,y+h/2,z-r*.95,.38,h-14,shade);
}
function balustrade(f,x,y,z,w,color=ivory){
  f.box(x,y+6,z,w,2.5,3,color);f.box(x,y-3,z,w,2.5,4,color);
  for(let dx=-w/2+3;dx<w/2;dx+=9)f.box(x+dx,y+1,z,1.8,8,2.5,color);
}
function mansard(f,x,y,z,w,d,h,color){
  const bottom=[[-w/2,0,-d/2],[w/2,0,-d/2],[w/2,0,d/2],[-w/2,0,d/2]],top=[[-w*.36,h,-d*.3],[w*.36,h,-d*.3],[w*.36,h,d*.3],[-w*.36,h,d*.3]];
  const p=a=>[a[0]+x,a[1]+y,a[2]+z];
  for(let i=0;i<4;i++)f.quad(p(bottom[i]),p(top[i]),p(top[(i+1)%4]),p(bottom[(i+1)%4]),color);
  f.quad(...top.map(p),color);
}
function dome(f,x,y,z,r,h,color,segments=28){
  // Raised drum followed by a smooth six-ring copper/lead profile.
  const rings=[[0,1],[.13,1.03],[.35,.94],[.58,.75],[.8,.48],[.96,.18],[1,0]];
  for(let j=1;j<rings.length;j++)for(let i=0;i<segments;i++){
    const a=i/segments*TAU,b=(i+1)/segments*TAU,[y0,r0]=rings[j-1],[y1,r1]=rings[j];
    f.quad([x+Math.cos(a)*r*r0,y+y0*h,z+Math.sin(a)*r*r0],[x+Math.cos(a)*r*r1,y+y1*h,z+Math.sin(a)*r*r1],[x+Math.cos(b)*r*r1,y+y1*h,z+Math.sin(b)*r*r1],[x+Math.cos(b)*r*r0,y+y0*h,z+Math.sin(b)*r*r0],i%7===0?'#67887b':color);
  }
}
function showPanel(f,x,y,z,w,h,color){
  panel(f,x,y,z,w+3,h+3,gold);panel(f,x,y,z-.12,w,h,color,.06);
  word(f,'LIVE',x,y+3,z-.3,6,w*.8,ivory,.15);word(f,'ON STAGE',x,y-8,z-.3,3.5,w*.84,gold,.15);
}
// Original playbill compositions, not reproductions of a show's official artwork.
// These advertise a fictional game programme; they do not assert real residencies.
function musicalPoster(f,x,y,z,w,h,show){
 const schemes={phantom:['#162c49','#bd5b55'],frozen:['#244f7c','#b8dfdb'],lion:['#e9b341','#30281e'],mis:['#263e62','#bd665b'],wicked:['#204c38','#acd389'],hamilton:['#946735','#edce81'],mormon:['#467eaf','#f4e8c4'],wrong:['#683745','#f2cc98']};
 const [bg,ink]=schemes[show],left=x-w/2,base=y-h/2,p=(u,v)=>[left+u*w,base+v*h,z-.45];
 panel(f,x,y,z,w+3,h+3,gold);panel(f,x,y,z-.1,w,h,bg,.04);
 panel(f,x,base+h*.91,z-.2,w*.86,.55,ink);word(f,'WEST END',x,base+h*.92,z-.3,h*.047,w*.73,ink,.25);
 const tri=(a,b,c,col=ink)=>f.tri(p(...a),p(...b),p(...c),col,.1);
 const disk=(u,v,r,col=ink)=>frontDisk(f,left+u*w,base+v*h,z-.4,r*w,col,.12,20);
 if(show==='mormon'){
  tri([.05,.49],[.29,.83],[.55,.49],'#dfdfc6');tri([.35,.49],[.69,.81],[.96,.49],'#a5c0c2');
  panel(f,x,base+h*.58,z-.5,w*.31,h*.23,'#f0eee1');tri([.45,.71],[.55,.71],[.5,.54],'#243342');
  panel(f,x-w*.19,base+h*.57,z-.6,w*.16,h*.15,'#253849');word(f,'BOOK',x-w*.19,base+h*.57,z-.7,h*.028,w*.13,gold);
 }else if(show==='wrong'){
  tri([.21,.5],[.12,.82],[.64,.82]);tri([.21,.5],[.64,.82],[.75,.5]);
  tri([.3,.5],[.24,.75],[.55,.75],'#273c46');tri([.3,.5],[.55,.75],[.6,.5],'#273c46');
  panel(f,x+w*.29,base+h*.73,z-.6,w*.19,h*.12,'#b65e51');tri([.69,.6],[.89,.58],[.86,.63]);
 }else if(show==='lion'){
  disk(.5,.67,.24,'#edc365');disk(.5,.67,.19,'#986134');
  for(let i=0;i<12;i++){const a=i/12*TAU;tri([.5+Math.cos(a)*.17,.67+Math.sin(a)*.12],[.5+Math.cos(a+.19)*.27,.67+Math.sin(a+.19)*.19],[.5+Math.cos(a+.37)*.17,.67+Math.sin(a+.37)*.12]);}
  tri([.4,.57],[.39,.75],[.63,.7],'#efcb75');tri([.4,.57],[.63,.7],[.62,.6],'#efcb75');disk(.55,.69,.015,'#714626');
 }else if(show==='phantom'){
  for(const side of [-1,1]){disk(.5+side*.115,.71,.145,'#e4e6d7');disk(.5+side*.12,.73,.036,'#172c46');}
  tri([.42,.65],[.58,.65],[.5,.52],'#e4e6d7');panel(f,x+w*.22,base+h*.56,z-.5,w*.012,h*.15,'#96a075');disk(.72,.64,.044,'#bb6157');
 }else if(show==='frozen'){
  for(let i=0;i<6;i++){const a=i/6*TAU,dx=Math.cos(a)*.25,dy=Math.sin(a)*.2;tri([.49,.67],[.5+dx,.67+dy],[.51,.68]);}
  tri([.1,.5],[.32,.73],[.49,.5],'#82b7c8');tri([.4,.5],[.69,.75],[.9,.5],'#a7cdcd');
 }else if(show==='wicked'){
  disk(.5,.69,.25,'#91bd75');disk(.59,.73,.21,bg);tri([.19,.53],[.39,.81],[.5,.54],'#182e31');
  tri([.15,.53],[.56,.53],[.35,.57],'#182e31');panel(f,x+w*.18,base+h*.62,z-.6,w*.25,h*.025,'#c5cba0');
 }else if(show==='hamilton'){
  for(let i=0;i<5;i++){const a=i/5*TAU-Math.PI/2,b=a+Math.PI/5;tri([.5,.68],[.5+Math.cos(a)*.26,.68-Math.sin(a)*.19],[.5+Math.cos(b)*.11,.68-Math.sin(b)*.08]);}
  for(let i=0;i<5;i++)panel(f,left+w*(.25+i*.12),base+h*.53,z-.6,w*.07,h*(.08+(i%3)*.025),'#553d2e');
 }else{
  tri([.06,.5],[.24,.83],[.44,.5],'#c17069');tri([.32,.5],[.51,.84],[.68,.5],'#e5d7bb');tri([.58,.5],[.8,.81],[.96,.5],'#628b9a');
  for(let i=0;i<5;i++)panel(f,left+w*(.18+i*.16),base+h*.54,z-.5,w*.11,h*(.09+(i%2)*.05),'#24354a');
 }
 const titles={phantom:['THE PHANTOM','OF THE OPERA'],frozen:['FROZEN'],lion:['THE LION','KING'],mis:['LES','MISERABLES'],wicked:['WICKED'],hamilton:['HAMILTON'],mormon:['THE BOOK','OF MORMON'],wrong:['THE PLAY','THAT GOES','WRONG']}[show];
 titles.forEach((line,i)=>word(f,line,x,base+h*(.36-i*.11),z-.8,h*.075,w*.88,ink,.27));
 word(f,'ON STAGE',x,base+h*.045,z-.8,h*.041,w*.65,ink,.2);
}
function doors(f,x,z,count,spacing,trim=gold){
  for(let i=0;i<count;i++){const dx=x+(i-(count-1)/2)*spacing;pane(f,dx,18,z,spacing-5,24,trim,'#647b79');panel(f,dx+3,18,z-.4,.55,7,ivory,.25);}
}

function hisMajestys(mesh,item){
 const f=frame(mesh,item),roof='#416758',pale='#d0caba';
 f.box(0,3,0,186,6,108,'#a79e8e');f.box(0,68,6,176,124,94,pale);
 f.box(-57,85,-14,57,158,66,pale);
 details(mesh,()=>{
  for(const y of [38,78,116])f.box(0,y,-42,179,3,4,ivory);
  for(const x of [-77,-57,-37,-11,16,43,70])for(const y of [56,97])pane(f,x,y,-42.8,13,24,ivory);
  for(const x of [-25,3,31,59])archLite(f,x,119,-41.9,17,25,ivory);
  for(const x of [-83,-31,83])f.box(x,90,-44,4.5,94,4,ivory);
  cornice(f,0,147,7,176,88,ivory);mansard(f,14,152,9,133,87,31,roof);
  for(const x of [-13,14,41,68]){pane(f,x,161,-31,12,15,ivory);pediment(f,x,169,-32,18,8,4,ivory,shade);}
  // French pavilion roof and rounded corner dome, with an open lantern.
  cornice(f,-57,166,-14,58,67,ivory);dome(f,-57,171,-14,29,32,roof);
  f.cone(-57,199,-14,4,7,gold,16,3);f.cone(-57,206,-14,1.4,6,gold,12,0);
  balustrade(f,19,117,-45,114);for(const x of [-17,20,57])f.box(x,103,-45,2.5,25,3,ivory);
  canopy(f,0,35,-44,173,23,'#273d39',gold);word(f,'HIS MAJESTYS THEATRE',0,27,-56,6.1,157,'#f4dc9f',.4);
  doors(f,0,-42.4,7,23);musicalPoster(f,-57,80,-47,38,51,'phantom');
 });
}

function druryLane(mesh,item){
 const f=frame(mesh,item),warm='#d3c5a9';
 f.box(0,3,0,192,6,104,'#aaa18e');f.box(0,63,5,184,114,94,warm);
 for(const x of [-30,-10,10,30])f.cone(x,6,-42,3.8,42,ivory,20,3.3);
 details(mesh,()=>{
  cornice(f,0,122,6,185,91,ivory);f.box(0,130,9,180,9,84,'#b7aa8f');
  for(const x of [-72,-48,-24,0,24,48,72]){pane(f,x,81,-42.2,14,24,ivory);pane(f,x,109,-42.2,14,12,ivory);}
  for(const x of [-77,-52,52,77])archLite(f,x,8,-42.3,17,29,ivory,'#647a74');
  for(const x of [-30,-10,10,30])shaft(f,x,6,-44,43,3.7);
  cornice(f,0,50,-40,83,28,ivory);balustrade(f,0,61,-53,82);doors(f,0,-42.5,3,19);
  word(f,'THEATRE ROYAL',0,99,-43.1,5.4,152,'#786749');word(f,'DRURY LANE',0,48,-55.7,4.7,71,'#746046');
  // Long Regency side arcade is visible while the driver passes the plot.
  for(const z of [-20,2,24,44]){
   f.box(90,29,z,5,45,5,ivory);f.box(91,17,z,2,23,13,glass);
  }
  f.box(90,54,9,8,5,86,ivory);f.box(90,63,9,7,3,86,ivory);
  for(let x=-86;x<=86;x+=13)f.box(x,136,-39,2.4,5,4,ivory);
  for(const x of [-66,66]){showPanel(f,x,48,-45,20,26,'#356957');}
  musicalPoster(f,0,81,-43,43,35,'frozen');
 });
}

function lyceum(mesh,item){
 const f=frame(mesh,item),pale='#d8c5a7';
 f.box(0,3,0,194,6,122,'#a5967e');f.box(-14,75,13,162,138,94,pale);f.box(80,43,15,32,74,94,pale);
 for(const x of [-74,-58,-25,7,40,56])f.cone(x,9,-44,4.6,86,ivory,20,4);
 details(mesh,()=>{
  // Six-column portico, with coupled outer columns and a low side arcade.
  for(const [y,w,d]of[[5,144,38],[8,138,32]])f.box(-9,y,-43,w,3,d,ivory);
  for(const x of [-74,-58,-25,7,40,56]){
   shaft(f,x,9,-44,84,4.5);for(const s of [-1,1])frontDisk(f,x+s*3,88,-49,2,shade,0,12);
  }
  for(const x of [-45,-10,25])archLite(f,x,10,-35,23,37,ivory,'#6b654f');
  cornice(f,-9,98,-42,143,30,ivory);word(f,'LYCEUM',-9,96,-58.5,8,95,'#8c7752');
  pediment(f,-9,110,-59,151,27,33,ivory,shade);frontDisk(f,-9,121,-59.5,4.2,ivory,0,24);
  f.box(-14,145,15,162,14,87,pale);cornice(f,-14,151,15,163,87,ivory);
  for(let x=-80;x<66;x+=10)f.box(x,105,-58,3,3,3,shade);
  for(const x of [77,91])archLite(f,x,13,-33,10,36,ivory);cornice(f,80,84,15,28,87,ivory);
  for(const x of [-43,-9,25])pane(f,x,76,-34.2,20,30,ivory);
  showPanel(f,77,65,-34.5,23,27,'#a57435');
  // The playbill hangs from the entablature in front of the columns, so its
  // title remains visible from a moving car instead of disappearing behind them.
  f.box(-9,73,-50,58,49,1,'#936d33');
  for(const x of [-31,13])f.box(x,98,-50,1.1,8,1.1,gold);
  musicalPoster(f,-9,73,-50.7,55,47,'lion');
 });
}

function sondheim(mesh,item){
 const f=frame(mesh,item),steel='#acb8b3',dark='#2a4146';
 f.box(0,3,2,176,6,106,'#9fa296');f.box(0,61,12,168,110,85,'#c8c8b6');
 f.box(53,68,2,51,124,99,'#8b5141');
 details(mesh,()=>{
  // Surviving modern facade: four storeys of curtain wall curving at the corner.
  const r=155,center=109,point=(a,y,offset=0)=>[Math.sin(a)*(r+offset),y,center-Math.cos(a)*(r+offset)];
  for(let i=0;i<18;i++){
   const a=-.51+i/18*.89,b=-.51+(i+1)/18*.89;
   f.quad(point(a,35),point(a,120),point(b,120),point(b,35),i%3===0?'#527b7f':'#3e646d',.04);
   for(const y of [36,59,83,107,121])f.quad(point(a,y,1),point(a,y+1.8,1),point(b,y+1.8,1),point(b,y,1),steel);
   f.quad(point(a,35,1.2),point(a,121,1.2),point(a+.004,121,1.2),point(a+.004,35,1.2),steel);
  }
  f.box(-12,125,2,149,4,88,steel);f.box(66,126,1,29,3,100,'#b2977c');
  doors(f,-6,-45.1,6,22,steel);canopy(f,-9,34,-43,158,22,dark,'#a9b19f');
  word(f,'SONDHEIM THEATRE',-9,26,-54.3,7,144,'#f0d487',.5);
  for(const x of [-58,32])showPanel(f,x,79,-48.2,27,41,'#303b55');musicalPoster(f,-13,79,-48.5,37,50,'mis');
  // The entrance's golden light reads separately from the blue glass grid.
  panel(f,-6,15,-45.5,132,2,'#f0c786',.45);f.box(78,77,-48,5,66,8,'#a96b50');
 });
}

function apolloVictoria(mesh,item){
 const f=frame(mesh,item),pale='#d3d5c2',trim='#ece9d7',dark='#274638';
 f.box(0,3,0,194,6,108,'#a4a797');f.box(0,59,7,188,106,91,pale);
 f.box(-65,73,0,36,134,96,pale);f.box(65,73,0,36,134,96,pale);
 details(mesh,()=>{
  // Interwar streamlined bow, striped entrance, and emphatic vertical fins.
  const r=190,cz=150,p=(a,y,o=0)=>[Math.sin(a)*(r+o),y,cz-Math.cos(a)*(r+o)];
  for(let i=0;i<28;i++){
   const a=-.45+i/28*.9,b=-.45+(i+1)/28*.9;
   for(const [lo,hi,c]of[[9,36,'#2d5043'],[37,43,trim],[44,87,pale],[88,96,'#425e57'],[97,109,pale]])f.quad(p(a,lo),p(a,hi),p(b,hi),p(b,lo),c);
   for(const y of [35,44,100,110])f.quad(p(a,y,1),p(a,y+1.5,1),p(b,y+1.5,1),p(b,y,1),trim);
  }
  for(const x of [-78,-69,-60,60,69,78]){f.box(x,96,-49,3,96,5,trim);panel(f,x,104,-52,1.2,66,'#b8d09b',.17);}
  for(const x of [-65,65]){
   f.box(x,139,-1,39,5,98,trim);f.box(x,144,-1,29,4,90,pale);
   panel(f,x,102,-52,14,64,dark);[...'APOLLO'].forEach((c,i)=>word(f,c,x,125-i*9.4,-52.3,6.5,9,'#d9e1ae',.35));
  }
  f.box(0,69,-48,99,49,3,dark);musicalPoster(f,0,69,-49.6,84,46,'wicked');word(f,'VICTORIA',0,102,-42,7,81,'#566945');
  doors(f,0,-44,7,23,trim);canopy(f,0,37,-46,179,16,'#3a6656',gold);
 });
}

function victoriaPalace(mesh,item){
 const f=frame(mesh,item),pale='#e5dece',roof='#5d8273';
 f.box(0,3,0,188,6,109,'#b2a998');f.box(0,73,7,175,134,96,pale);f.box(0,85,-15,78,158,56,pale);
 details(mesh,()=>{
  // Great central niche, open loggia, small octagonal cupola, gilded dancer.
  archLite(f,0,48,-44,58,73,ivory,'#758078');balustrade(f,0,74,-46,59);
  for(const x of [-70,70]){
   for(const y of [51,84])pane(f,x,y,-41.2,22,24,ivory);frontDisk(f,x,119,-42,11,shade,0,24);frontDisk(f,x,119,-42.2,8,glass,0,24);
   for(const dx of [-16,16])f.box(x+dx,93,-44,3.5,82,3,ivory);
  }
  for(const x of [-27,-9,9,27])shaft(f,x,119,-44,30,2.8);
  cornice(f,0,151,-20,83,54,ivory);pediment(f,0,158,-49,88,18,25,ivory,shade);
  cornice(f,0,140,6,176,96,ivory);word(f,'VICTORIA PALACE',0,139,-45.6,6.5,157,'#9b584d');
  f.cone(0,171,-12,17,7,ivory,8,17);f.cone(0,178,-12,12,16,'#5a6c60',8,12);
  for(let i=0;i<8;i++){const a=i/8*TAU;f.cone(Math.cos(a)*13,178,-12+Math.sin(a)*13,1.4,17,ivory,10,1.4);}
  f.cone(0,194,-12,17,4,ivory,24,17);dome(f,0,198,-12,16,13,roof,24);
  // Simple sculptural Anna Pavlova silhouette, rather than a texture billboard.
  f.cone(0,209,-12,2,5,gold,12,1);beam(mesh,f.p(0,213,-12),f.p(0,217,-12),1.5,gold);
  beam(mesh,f.p(0,215,-12),f.p(-4,219,-12),1,gold);beam(mesh,f.p(0,215,-12),f.p(5,217,-12),1,gold);
  f.cone(0,217,-12,1.25,2,gold,12,.7);
  for(const x of [-77,77]){f.cone(x,145,-29,4,8,ivory,16,2);f.cone(x,153,-29,2,4,ivory,16,0);}
  canopy(f,0,37,-46,150,22,'#476155',gold);word(f,'VICTORIA PALACE',0,28,-57.5,6.3,139,'#f7dfa0',.45);doors(f,0,-43,5,25);
  for(const x of [-61,61])showPanel(f,x,86,-46.2,22,37,'#426657');
  musicalPoster(f,0,88,-45,49,55,'hamilton');
 });
}

function savoy(mesh,item){
 const f=frame(mesh,item),pale='#ddccb1',brown='#70503e',jade='#3b766b';
 f.box(0,3,1,172,6,101,'#b7a68d');f.box(0,58,10,164,104,83,pale);f.box(51,67,1,49,122,94,pale);
 details(mesh,()=>{
  // Court entrance: layered Deco portal and small marquee; asymmetric sign tower.
  for(const x of [-72,-51,-30,-9,12])for(const y of [74,99])pane(f,x,y,-32.1,13,14,'#bca78c',glass);
  for(const y of [57,85,113])f.box(-18,y,9,127,2,86,'#b5a085');
  for(const [w,h,z,c]of[[84,59,-34,brown],[73,51,-35,gold],[63,45,-36,jade]])panel(f,-23,h/2+6,z,w,h,c);
  doors(f,-23,-37,3,16,gold);canopy(f,-23,37,-43,78,17,jade,gold);word(f,'SAVOY',-23,42,-36.3,9,56,'#ead59f',.3);
  for(const x of [-72,24]){f.box(x,28,-37,16,37,3,brown);showPanel(f,x,28,-39,12,27,'#b96645');}
  f.box(51,126,1,52,5,96,'#bda990');f.box(51,131,2,43,5,85,pale);
  panel(f,51,88,-47,26,74,'#315952');for(const x of [35,67])f.box(x,88,-47.5,2,80,2,gold);
  [...'SAVOY'].forEach((c,i)=>word(f,c,51,113-i*13,-47.4,9.4,13,'#f0d8a1',.35));
  word(f,'THEATRE',51,43,-48,4.3,37,brown);for(const x of [-78,76])f.box(x,73,-35,3,84,4,'#c4af8f');
  musicalPoster(f,-26,84,-34,62,48,'mormon');
 });
}

function princeEdward(mesh,item){
 const f=frame(mesh,item),brick='#9f5141',terra='#bd7858',trim='#dba987',dark='#493c3c';
 f.box(0,3,1,192,6,112,'#b0967b');f.box(-11,72,11,167,132,88,brick);f.cone(67,6,-15,26,126,brick,28,26);
 details(mesh,()=>{
  // Warm brick Italianate mass with a rounded corner, tall arcades and lantern.
  for(const x of [-72,-39,-6,27])archLite(f,x,66,-34.2,21,55,trim,'#4e5253');
  for(const x of [-88,-56,-22,11,43])f.box(x,94,-36,4,85,4,terra);
  for(const y of [44,61,127,135])f.box(-13,y,11,167,4,91,terra);
  for(let i=0;i<16;i++){
   const a=Math.PI+i/16*Math.PI,b=Math.PI+(i+1)/16*Math.PI;
   for(const y of [46,61,127,136])f.quad([67+Math.cos(a)*27,y,-15+Math.sin(a)*27],[67+Math.cos(a)*27,y+3,-15+Math.sin(a)*27],[67+Math.cos(b)*27,y+3,-15+Math.sin(b)*27],[67+Math.cos(b)*27,y,-15+Math.sin(b)*27],trim);
  }
  f.cone(67,139,-15,20,15,terra,28,20);f.cone(67,154,-15,22,6,'#567268',28,16);f.cone(67,160,-15,16,5,'#567268',28,0);
  pane(f,67,107,-42.2,17,28,trim);panel(f,67,70,-44,19,41,dark);
  [...'PRINCE'].forEach((c,i)=>word(f,c,67,86-i*5.9,-44.3,4.5,7,'#e5c49d',.2));
  canopy(f,-12,41,-44,162,24,'#702f36',gold);word(f,'PRINCE EDWARD',-12,32,-56.5,7,148,'#f5d5a4',.4);
  doors(f,-16,-34.4,6,24,trim);musicalPoster(f,-37,91,-39,53,57,'wrong');
  f.box(-12,144,15,134,13,76,brick);f.box(-12,153,15,106,6,65,terra);
  for(const x of [-62,-12,38])f.box(x,154,-18,9,14,9,terra);
 });
}

const BUILDERS=Object.freeze({
 'his-majestys-theatre':hisMajestys,'theatre-royal-drury-lane':druryLane,'lyceum-theatre':lyceum,
 'sondheim-theatre':sondheim,'apollo-victoria':apolloVictoria,'victoria-palace':victoriaPalace,
 'savoy-theatre':savoy,'prince-edward-theatre':princeEdward,
});
export function addLondonTheatre(mesh,item){const draw=BUILDERS[item.kind];if(draw)draw(mesh,item);}
