/** Compact architectural interpretations, not a geographical reconstruction.
 * Primary references are attached to each model below. No paid assets or route edits.
 * Frontages face local -Z; detailed trim never creates invisible collision boxes.
 */
import { TRACK, trackPoint, projectTrack } from './engine.js';
import { beijingReferenceTrack, beijingReferencePoint, beijingReferenceProjection } from './beijing-reference.js';
import { addBeijingStadium, beijingStadiumClearance } from './beijing-stadium.js';
import { legacyToStadiumDistance } from './beijing-stadium-route.js';
import { beijingWallClearance } from './beijing-great-wall.js';
import { frame, details, beam, word, arch, window, frontDisk } from './london-west-end.js';
const TAU=Math.PI*2;
const AXIS='https://whc.unesco.org/en/list/1714/';
const SUMMER='https://whc.unesco.org/en/list/880/';
export const BEIJING_LANDMARKS=Object.freeze([
 ['beijing-birds-nest','国家体育场 · 鸟巢',980,238,'https://english.beijing.gov.cn/specials/beijinglifeonthesubway/landmarksalongthesubwaylines/line8/202206/t20220624_2750396.html'],
 ['beijing-water-cube','国家游泳中心 · 水立方',167,99,'https://english.beijing.gov.cn/beijing2022/venues/beijing/202103/t20210316_2308897.html'],
 ['beijing-ncpa','国家大剧院',183,90,'https://en.chncpa.org/'],
 ['beijing-cctv','中央电视台总部',156,330,'https://www.oma.com/projects/cctv-headquarters'],
 ['beijing-china-zun','中国尊',104,510,'https://www.kpf.com/project/citic-tower-china-zun'],
 ['beijing-beihai-dagoba','北海公园 · 白塔',134,239,'https://english.visitbeijing.com.cn/article/47OOq4hGyXn'],
 ['beijing-fragrant-tower','颐和园 · 佛香阁',142,234,SUMMER],
 ['beijing-seventeen-arch','颐和园 · 十七孔桥',185,60,SUMMER],
 ['beijing-drum-tower','鼓楼',132,164,AXIS],
 ['beijing-bell-tower','钟楼',102,207,AXIS],
 ['beijing-zhengyangmen','正阳门',143,191,AXIS],
 ['beijing-jingshan','景山 · 万春亭',121,154,AXIS],
 ['beijing-yonghe','雍和宫 · 万福阁',154,227,'https://english.visitbeijing.com.cn/article/47OLnUJdpOe'],
 ['beijing-confucius','孔庙 · 大成殿',145,108,'https://english.visitbeijing.com.cn/article/47OMtLMvO5S'],
 ['beijing-national-museum','中国国家博物馆',178,92,'https://english.beijing.gov.cn/travellinginbeijing/museums/'],
 ['beijing-railway-station','北京站',190,142,'https://www.beijing.gov.cn/hudong/gfxwjzj/zjxx/202309/P020230907659075819808.pdf'],
 ['beijing-exhibition-center','北京展览馆',185,264,'https://english.beijing.gov.cn/investinginbeijing/InvestmentSpecial/exhibition/Key_venues/202510/t20251024_4237790.html'],
 ['beijing-miaoying','妙应寺 · 白塔',134,251,'https://english.beijing.gov.cn/beijinginfo/facts/religion/202005/t20200518_1900210.html'],
 ['beijing-capital-museum','首都博物馆',158,157,'https://english.beijing.gov.cn/travellinginbeijing/museums/'],
 ['beijing-planetarium','北京天文馆',151,128,'https://english.beijing.gov.cn/beijinginfo/culture/culturaltreasures/cityofmuseums/list/202604/t20260427_4617304.html'],
].map(([kind,label,radius,height,source])=>Object.freeze({kind,label,radius,height,source})));
export const BEIJING_REFINEMENTS=Object.freeze([
 {kind:'temple-of-heaven',label:'天坛 · 祈年殿',radius:116,height:246,source:'https://english.visitbeijing.com.cn/article/47ONy6AX0b3'},
 {kind:'palace-gate',label:'天安门城楼',radius:163,height:157,source:AXIS},
 {kind:'beijing-paifang',label:'北京彩绘牌楼',radius:120,height:134,source:AXIS},
].map(Object.freeze));

// A single promenade plan includes the original three landmarks. Small changes
// stay inside each plot's slot; failed plots never migrate into another district.
export const BEIJING_DISTRICTS=Object.freeze([
 {id:'old-city',label:'古都与天际线',kinds:['beijing-paifang','beijing-zhengyangmen','beijing-china-zun','beijing-national-museum','beijing-ncpa']},
 {id:'culture',label:'京城文脉',kinds:['temple-of-heaven','beijing-confucius','beijing-yonghe','beijing-drum-tower','beijing-bell-tower']},
 {id:'gardens',label:'园林长城',kinds:['beijing-miaoying','beijing-jingshan','beijing-beihai-dagoba','beijing-fragrant-tower','beijing-seventeen-arch']},
 {id:'modern',label:'现代建筑与城楼',kinds:['beijing-water-cube','beijing-birds-nest','beijing-cctv','palace-gate']},
 {id:'civic',label:'城市街区',kinds:['beijing-exhibition-center','beijing-planetarium','beijing-capital-museum','beijing-railway-station']},
].map(d=>Object.freeze({...d,kinds:Object.freeze(d.kinds)})));

function referenceLandmarkPlacements(existing=[]){
 if(TRACK.theme!=='beijing')return [];
 const reference=beijingReferenceTrack();
 const result=[],metadata=[...BEIJING_LANDMARKS,...BEIJING_REFINEMENTS];
 // China Zun anchors the opening straight: the long approach reveals its full
 // silhouette before the chase camera passes below its crown. The late curved
 // slot never showed the whole tower, even though the model was still present.
 const plan=BEIJING_DISTRICTS.flatMap(d=>d.kinds.map(kind=>({kind,district:d.id})));
 const circularGap=(a,b)=>{const delta=Math.abs(a-b)%reference.length;return Math.min(delta,reference.length-delta);};
 for(const [index,plot]of plan.entries()){
  if(existing.some(item=>item.kind===plot.kind))continue;
  const original=metadata.find(m=>m.kind===plot.kind),meta=plot.kind==='beijing-birds-nest'?{...original,radius:213,height:110}:original,fraction=(index+.5)/plan.length,preferredSide=index%2?1:-1;
  let chosen;
  // Ground-level gardens remain visible from the 48-unit raised road. The
  // surrounding terrain is flat, so a road elevation is not a building veto.
  search: for(const shift of [0,-45,45,-90,90])for(const side of [preferredSide,-preferredSide])for(const setback of [76,112,40]){
   const s=reference.startDistance+fraction*reference.length+shift,p=beijingReferencePoint(s,side*(TRACK.roadWidth/2+meta.radius+setback));
   if(beijingReferenceProjection(p.x,p.y).distance<TRACK.roadWidth/2+meta.radius+30||!beijingWallClearance(p.x,p.y,meta.radius+10))continue;
   if([...existing,...result].some(q=>circularGap(s,q.s)<480||Math.hypot(p.x-q.x,p.y-q.z)<meta.radius+q.radius+80))continue;
   const refined=BEIJING_REFINEMENTS.some(m=>m.kind===meta.kind);
   chosen=Object.freeze({...meta,...plot,fraction,x:p.x,z:p.y,s,side,angle:p.angle+(!refined&&side<0?Math.PI:0),elevation:0});break search;
  }
  if(!chosen)throw new Error(`Beijing: no clear plot inside district slot for ${meta.kind}`);
  result.push(chosen);
 }
 return Object.freeze(result);
}

/** Retain the accepted city in world space; only plots touched by the new
 * stadium or its approaches move. The stadium footprint is a capsule, not its
 * much larger bounding circle, so nearby neighborhoods remain intact. */
export function beijingLandmarkPlacements(existing=[]){
 const original=referenceLandmarkPlacements(existing),stadium=TRACK.stadium;
 if(!stadium)return original;
 const bird=original.find(p=>p.kind==='beijing-birds-nest');
 const result=[],clear=(x,z,radius,others)=>projectTrack(x,z).distance>=TRACK.roadWidth/2+radius+30
  &&beijingWallClearance(x,z,radius+10)&&beijingStadiumClearance(stadium,x,z,radius+35)
  &&others.every(p=>Math.hypot(x-p.x,z-p.z)>=radius+p.radius+80);
 const ordinary=original.filter(p=>p!==bird),pending=[];
 // Reserve every untouched plot before looking for replacements.
 for(const item of ordinary){
  if(clear(item.x,item.z,item.radius,existing))result.push({...item,legacyS:item.s,s:legacyToStadiumDistance(stadium,item.s)});
  else pending.push(item);
 }
 for(const item of pending){
  let chosen;
  for(let distance=24;distance<=1400&&!chosen;distance+=24){
   for(let i=0;i<40;i++){
    const a=i/40*TAU,x=item.x+Math.cos(a)*distance,z=item.z+Math.sin(a)*distance;
    if(!clear(x,z,item.radius,[...existing,...result]))continue;
    const road=projectTrack(x,z),side=road.offset>=0?1:-1,refined=BEIJING_REFINEMENTS.some(m=>m.kind===item.kind);
    chosen={...item,x,z,s:road.s,legacyS:item.s,side,angle:road.angle+(!refined&&side<0?Math.PI:0)};break;
   }
  }
  if(!chosen)throw new Error(`Beijing stadium: no safe local relocation for ${item.kind}`);
  result.push(chosen);
 }
 if(bird)result.push({...bird,...BEIJING_LANDMARKS.find(m=>m.kind===bird.kind),x:stadium.center.x,z:stadium.center.z,
  angle:stadium.angle,s:(stadium.loopStart+stadium.loopEnd)/2,legacyS:bird.s,stadium});
 return Object.freeze(original.map(p=>Object.freeze(result.find(q=>q.kind===p.kind))));
}

const C={red:'#9c3e31',darkRed:'#633b31',gold:'#bb9344',goldLight:'#ddba69',blue:'#235a86',green:'#35635c',stone:'#d6d2bc',white:'#ece8d5',brick:'#858a80',glass:'#527b87'};
const rect=(f,x,y,z,w,h,color)=>f.quad([x-w/2,y-h/2,z],[x+w/2,y-h/2,z],[x+w/2,y+h/2,z],[x-w/2,y+h/2,z],color);
function line(mesh,f,a,b,w,c){
 if(w>1.8){beam(mesh,f.p(...a),f.p(...b),w,c);return;}
 // Sub-pixel tile ribs and window mullions need two crossed ribbons, not a
 // six-face solid prism. This retains the same contour with 1/3 the triangles.
 const aa=f.p(...a),bb=f.p(...b),d=bb.map((v,i)=>v-aa[i]),n=Math.hypot(...d)||1,axis=d.map(v=>v/n),ref=Math.abs(axis[1])>.9?[1,0,0]:[0,1,0];
 const cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],raw=cross(axis,ref),rn=Math.hypot(...raw),u=raw.map(v=>v/rn),v=cross(axis,u);
 for(const dir of (w<=.7?[u]:[u,v])){const p=(point,sign)=>point.map((q,i)=>q+dir[i]*w*.5*sign);mesh.quad(p(aa,-1),p(aa,1),p(bb,1),p(bb,-1),c);}
}
function slab(f,w,d,y=3){f.box(0,y,0,w,y*2,d,C.stone);f.box(0,y*2+1,0,w-3,2,d-3,C.white);}
function sign(f,text,x,y,z,w){f.box(x,y,z,w,13,2,'#254547');word(f,text,x,y-3,z-1.2,6.5,w-7,'#e5c985',.1);}
function rail(mesh,f,w,d,y){
 for(const z of [-d/2,d/2]){for(let x=-w/2;x<=w/2;x+=12){f.box(x,y+8,z,2.2,16,2.2,C.white);f.cone(x,y+16,z,2,2,C.white,8,0);}
  for(const h of [3,11])f.box(0,y+h,z,w,2,2,C.white);}
 for(const x of [-w/2,w/2]){for(let z=-d/2;z<=d/2;z+=12)f.box(x,y+8,z,2.2,16,2.2,C.white);for(const h of [3,11])f.box(x,y+h,0,2,2,d,C.white);}
}
function stairs(f,x,z,width,steps,height,depth){for(let i=0;i<steps;i++)f.box(x,height*(i+1)/2,z+i*depth,width,height*(i+1),depth,C.stone);}
/** Curved tiled roofs with actual hipped ends, lifted corners and ridge ornaments. */
function roof(mesh,f,x,y,z,w,d,h,color=C.gold){
 const p=(u,t,side)=>[x+u*w/2*(1-t*.22),y+h*Math.pow(t,.78)+Math.pow(Math.abs(u),6)*5*(1-t),z+side*d/2*(1-t)];
 for(const side of [-1,1]){
  for(let j=0;j<6;j++)for(let i=0;i<24;i++){const u=-1+i/12,v=u+1/12,a=p(u,j/6,side),b=p(v,j/6,side),c=p(v,(j+1)/6,side),e=p(u,(j+1)/6,side);if(side>0)f.quad(a,b,c,e,color);else f.quad(e,c,b,a,color);}
  for(let i=0;i<=24;i++){const u=-1+i/12;for(let j=0;j<4;j++){const a=p(u,j/4,side),b=p(u,(j+1)/4,side);a[1]+=.55;b[1]+=.55;line(mesh,f,a,b,.65,i%3?color:C.goldLight);}}
  for(const end of [-1,1]){
   line(mesh,f,p(end,0,side),[x+end*w*.54,y+10,z+side*d*.53],2.4,C.goldLight);
   for(let i=0;i<3;i++){const a=p(end*(1-i*.055),.10+i*.10,side);f.cone(a[0],a[1]+1,a[2],1.5,3.4,C.goldLight,8,.6);}
  }
 }
 for(const end of [-1,1]){f.tri([x+end*w/2,y+5,z-d/2],[x+end*w/2,y+5,z+d/2],[x+end*w*.39,y+h,z],color);}
 f.box(x,y+h+1,z,w*.80,2.7,3,C.goldLight);
 for(const end of [-1,1])f.cone(x+end*w*.39,y+h+2,z,3,7,C.goldLight,12,1);
}
function bracketBand(f,x,y,z,w){
 f.box(x,y,z,w,7,4,C.green);f.box(x,y+5,z,w,2,5,C.goldLight);
 for(let q=-w/2+6;q<w/2;q+=12){f.box(x+q,y-3,z-1,2,8,4,C.blue);f.box(x+q,y,z-2,8,1.5,5,C.goldLight);f.box(x+q,y+2,z-3,10,1.5,6,C.red);}
}
function hall(mesh,f,{x=0,z=0,y=8,w=140,d=76,h=53,roofH=28,color=C.gold,columns=7}={}){
 f.box(x,y+h/2,z,w-18,h,d-15,C.red);
 details(mesh,()=>{for(const side of [-1,1]){
  for(let i=0;i<columns;i++){const q=x-w/2+12+i*(w-24)/(columns-1);f.cone(q,y,z+side*(d/2-1),2.8,h,C.red,12,2.8);f.cone(q,y-1,z+side*(d/2-1),4,4,C.stone,12,4);
   if(i<columns-1){const mid=q+(w-24)/(columns-1)/2;rect(f,mid,y+h*.43,z+side*(d/2-5),(w-24)/(columns-1)-7,h*.65,'#593a30');for(let r=0;r<4;r++)f.box(mid,y+10+r*7,z+side*(d/2-4),12,.8,1,C.gold);}}
  bracketBand(f,x,y+h-4,z+side*d/2,w+1);
 }roof(mesh,f,x,y+h,z,w+28,d+31,roofH,color);});
}
function roundRoof(mesh,f,y,r,h,color=C.blue,sides=64){
 const shape=[1,.84,.68,.53,.39,.27,.16,.07];
 for(let j=0;j<7;j++)f.cone(0,y+j*h/7,0,r*shape[j],h/7,color,sides,r*shape[j+1]);
 f.cone(0,y-2,0,r+1,2,C.goldLight,sides,r+1);
 details(mesh,()=>{for(let i=0;i<sides;i++){const a=i/sides*TAU;for(let j=0;j<7;j++)line(mesh,f,[Math.cos(a)*r*shape[j],y+j*h/7+.55,Math.sin(a)*r*shape[j]],[Math.cos(a)*r*shape[j+1],y+(j+1)*h/7+.55,Math.sin(a)*r*shape[j+1]],.75,i%4?color:'#427d9e');}});
}
function ringRail(mesh,f,r,y){
 for(let i=0;i<64;i++){const a=i/64*TAU,b=(i+1)/64*TAU;f.cone(Math.cos(a)*r,y,Math.sin(a)*r,1.3,13,C.white,8,1.3);for(const h of [3,10])line(mesh,f,[Math.cos(a)*r,y+h,Math.sin(a)*r],[Math.cos(b)*r,y+h,Math.sin(b)*r],1.5,C.white);}
}
function temple(mesh,item){const f=frame(mesh,item);
 // Three white-marble terraces and three blue roof tiers, not a tall plain cylinder.
 for(const [i,r]of[112,98,85].entries())f.cone(0,i*8,0,r,8,C.stone,80,r);
 f.cone(0,24,0,56,65,C.red,64,56);f.cone(0,106,0,43,30,C.red,64,43);f.cone(0,154,0,31,27,C.red,64,31);
 details(mesh,()=>{
  [110,96,83].forEach((r,i)=>ringRail(mesh,f,r,(i+1)*8));
  for(let i=0;i<24;i++){const a=i/24*TAU,ca=Math.cos(a),sa=Math.sin(a);f.cone(ca*60,25,sa*60,2,66,C.red,12,2);const q=frame(mesh,{...item,x:item.x+Math.cos(item.angle)*ca*59-Math.sin(item.angle)*sa*59,z:item.z+Math.sin(item.angle)*ca*59+Math.cos(item.angle)*sa*59,angle:item.angle+a+Math.PI/2});
   rect(q,0,52,-.6,11,37,'#4b3b32');for(const y of [39,48,57,66])rect(q,0,y,-1,11,1,C.gold);for(const x of [-3,0,3])rect(q,x,52,-1,1,37,C.gold);
   bracketBand(q,0,82,-2,13);
  }
  for(const [y,r]of[[108,44],[157,32]]){f.cone(0,y,0,r,20,C.blue,48,r);f.cone(0,y,0,r+.3,1.5,C.goldLight,48,r+.3);f.cone(0,y+18.5,0,r+.3,1.5,C.goldLight,48,r+.3);}
  for(const [y,r]of[[116,44.7],[165,32.7]])for(let i=0;i<24;i++){const a=i/24*TAU;f.box(Math.cos(a)*r,y,Math.sin(a)*r,2.5,19,2.5,C.goldLight);}
  roundRoof(mesh,f,87,77,40);roundRoof(mesh,f,134,63,40);roundRoof(mesh,f,179,48,49);
  f.cone(0,228,0,5,9,C.goldLight,24,3);f.cone(0,237,0,3.5,9,C.goldLight,24,0);
  for(const side of [-1,1])for(let i=0;i<7;i++)f.box(0,(i+1)*1.7,side*(108-i*3),27,(i+1)*3.4,4,C.white);
 });}
function palace(mesh,item){const f=frame(mesh,item);slab(f,270,102);f.box(0,25,0,255,36,86,C.red);f.box(0,46,0,262,7,93,C.stone);
 hall(mesh,f,{y:50,w:194,d:72,h:53,roofH:38,columns:9});
 details(mesh,()=>{roof(mesh,f,0,76,0,238,116,27);rail(mesh,f,253,83,50);
  for(const x of [-87,-43,0,43,87]){arch(f,x,7,-44,21,27,C.gold,'#403630');for(const dx of [-4,4])for(let y=11;y<30;y+=5)f.box(x+dx,y,-46,1,1,1,C.goldLight);}
  for(const side of [-1,1]){f.cone(side*143,8,-23,4,65,C.white,16,4);f.cone(side*143,68,-23,9,6,C.white,16,9);f.box(side*143,77,-23,25,3,6,C.white);f.cone(side*143,80,-23,4,7,C.white,12,1);}
  sign(f,'TIANANMEN',0,103,-45,94);
 });}
function paifang(mesh,item){const f=frame(mesh,item);
 for(const x of [-87,-33,33,87]){f.box(x,6,0,17,12,20,C.stone);f.cone(x,11,0,4.5,86,C.red,16,4.5);}
 details(mesh,()=>{for(const y of [61,73])f.box(0,y,0,188,6,16,C.green);bracketBand(f,0,79,-8,189);f.box(0,97,0,68,23,14,C.blue);roof(mesh,f,0,110,0,91,42,17,C.green);
 for(const side of [-1,1]){roof(mesh,f,side*60,83,0,56,36,16,C.green);for(const dx of [-12,0,12])frontDisk(f,side*60+dx,67,-8.7,3,C.goldLight);}
 for(const x of [-87,87])roof(mesh,f,x,98,0,27,29,12,C.green);sign(f,'BEIJING',0,98,-8,59);
 });}
function birdsNest(mesh,item){const f=frame(mesh,item),rx=180,rz=119,p=(a,r,y)=>[Math.cos(a)*rx*r,y,Math.sin(a)*rz*r];
 slab(f,365,215);
 if(mesh.colliders)for(let i=0;i<40;i++){const a=p(i/40*TAU,.99,8),b=p((i+1)/40*TAU,.99,8),c=f.p((a[0]+b[0])/2,0,(a[2]+b[2])/2);mesh.colliders.push({type:'box',x:c[0],y:c[2],halfWidth:Math.hypot(b[0]-a[0],b[2]-a[2])/2,halfDepth:3,angle:item.angle+Math.atan2(b[2]-a[2],b[0]-a[0]),minHeight:8,maxHeight:81});}

 details(mesh,()=>{
  for(let i=0;i<80;i++){const a=i/80*TAU,b=(i+1)/80*TAU,h=82+21*Math.pow(Math.cos(a),2),hb=82+21*Math.pow(Math.cos(b),2);
   f.quad(p(a,1,8),p(b,1,8),p(b,1,hb),p(a,1,h),'#4b5351');f.quad(p(a,1,h),p(b,1,hb),p(b,.66,hb-11),p(a,.66,h-11),'#9b9d91');
   if(i%2===0){line(mesh,f,p(a,1.01,10),p(a+.28,1.01,95),3.8,'#c7c5b2');line(mesh,f,p(a,1.015,99),p(a+.42,1.015,9),3.2,'#b6b8ab');line(mesh,f,p(a,1.015,h),p(a+.32,.65,h-11),3.4,'#e0daca');}
  }
  for(const y of [25,44,65,84])for(let i=0;i<64;i++)line(mesh,f,p(i/64*TAU,1.02,y+6*Math.sin(i*.7)),p((i+1)/64*TAU,1.02,y+6*Math.sin((i+1)*.7)),3,'#c5c4b7');
  f.box(0,13,0,155,3,89,'#578768');for(let y=29;y<68;y+=7)for(const side of [-1,1])f.box(0,y,side*(53+(y-29)*.5),205,3,8,'#bd5c49');
  sign(f,'NATIONAL STADIUM',0,17,-rz-2,153);
 });}
function waterCube(mesh,item){const f=frame(mesh,item);slab(f,282,172);f.box(0,51,0,266,87,156,'#70a9b9');
 details(mesh,()=>{for(const side of [-1,1])for(let row=0;row<4;row++)for(let col=0;col<11;col++){
  const x=-122+col*24+(row%2)*8,y=19+row*21,r=12+(row+col)%3;
  for(let k=0;k<6;k++){const p=a=>[Math.max(-132.4,Math.min(132.4,x+Math.cos(a)*r)),Math.max(8.2,Math.min(93.8,y+Math.sin(a)*r)),side*78.3],a=p(k/6*TAU),b=p((k+1)/6*TAU);if(Math.abs((a[0]-x)*(b[1]-y)-(a[1]-y)*(b[0]-x))>.01)f.tri([x,y,side*78.3],a,b,['#79bac6','#94c7ce','#6ca7bd'][(col+row)%3]);a[2]=b[2]=side*79;if(Math.hypot(a[0]-b[0],a[1]-b[1])>.1)line(mesh,f,a,b,1.2,'#c4e1dc');}
 }for(const x of [-133,133])for(let y=18;y<93;y+=20)for(let z=-65;z<71;z+=22){f.box(x,y,z,1,17,19,'#92bdc8');}
 f.box(0,96,0,269,3,159,'#b0d5d6');for(let x=-123;x<130;x+=24)for(let z=-64;z<75;z+=22)f.box(x,98,z,21,1,19,'#77b5c1');sign(f,'WATER CUBE',0,20,-81,113);
 });}
function ellipsoid(mesh,f,rx,rz,h,base,material){
 for(let j=0;j<14;j++)for(let i=0;i<64;i++){const p=(u,v)=>[Math.cos(u)*Math.cos(v)*rx,base+Math.sin(v)*h,Math.sin(u)*Math.cos(v)*rz];const a=i/64*TAU,b=(i+1)/64*TAU,c=j/14*Math.PI/2,d=(j+1)/14*Math.PI/2;f.quad(p(a,c),p(a,d),p(b,d),p(b,c),typeof material==='function'?material(i,j):material);}
}
function ncpa(mesh,item){const f=frame(mesh,item);slab(f,304,196);f.box(0,8,0,300,2,191,'#4f868b');// Interior solids stay inside the curved shell; no cuboid corners protrude.
 if(mesh.colliders)for(let band=0;band<5;band++){const bottom=band*15,top=bottom+15,tr=Math.sqrt(1-(top/78)**2);for(let x=-126;x<=126;x+=18){const e=(Math.abs(x)+9)/139;if(e>=tr)continue;const d=87*Math.sqrt(tr*tr-e*e),c=f.p(x,9+bottom+7.5,0);mesh.colliders.push({type:'box',x:c[0],y:c[2],halfWidth:9,halfDepth:d,angle:item.angle,minHeight:9+bottom,maxHeight:9+top});}}

 details(mesh,()=>{ellipsoid(mesh,f,139,87,78,9,i=>i>=42&&i<54?'#82a9b1':'#aeb7ac');
 for(let i=0;i<48;i++){const a=i/48*TAU;for(let j=0;j<10;j++){const c=j/10*Math.PI/2,d=(j+1)/10*Math.PI/2;line(mesh,f,[Math.cos(a)*Math.cos(c)*139.3,9+Math.sin(c)*78.3,Math.sin(a)*Math.cos(c)*87.3],[Math.cos(a)*Math.cos(d)*139.3,9+Math.sin(d)*78.3,Math.sin(a)*Math.cos(d)*87.3],.5,'#d1d5c9');}}
 sign(f,'NATIONAL CENTRE FOR THE PERFORMING ARTS',0,13,-92,265);
 });}
function slantedPrism(mesh,f,a,b,w,d,color){const corners=(p)=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>[p[0]+x*w/2,p[1],p[2]+z*d/2]);const bottom=corners(a),top=corners(b);for(let i=0;i<4;i++)f.quad(bottom[i],bottom[(i+1)%4],top[(i+1)%4],top[i],color);f.quad(...[...top].reverse(),color);
 // Keep a series of solid footprints inside the actual leaning volume.
 for(let j=0;j<12;j++){const t=(j+.5)/12;f.box(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t,w-3,(b[1]-a[1])/12,d-3,color);}
}
function cctv(mesh,item){const f=frame(mesh,item);slab(f,251,134);slantedPrism(mesh,f,[-83,8,19],[-51,292,16],65,64,'#617a81');slantedPrism(mesh,f,[82,8,-17],[50,248,-17],65,64,'#7b9296');f.box(0,278,0,159,61,91,'#788f92');
 details(mesh,()=>{for(const [x,top,lean,z]of[[-83,292,32,-14],[82,248,-32,-50]])for(let y=16;y<top-10;y+=17){const xx=x+lean*y/top;f.box(xx,y,z,66,1.1,1.2,'#b6c6c2');for(let dx=-28;dx<=28;dx+=14)line(mesh,f,[xx+dx,y,z-.8],[xx+dx+lean*17/top+10,y+17,z-.8],1.2,'#c4ccc2');}
 for(let x=-74;x<=74;x+=16){line(mesh,f,[x,249,-46.5],[x+12,308,-46.5],1.2,'#c4ccc2');}
 sign(f,'CCTV',0,24,-61,67);
 });}
function chinaZun(mesh,item){const f=frame(mesh,item);slab(f,139,139);const half=y=>41+21*Math.pow((y/500-.48)*2,2);f.box(0,250,0,76,486,76,'#668d99');
 details(mesh,()=>{for(let j=0;j<36;j++){const y=8+j*(494/36),y2=y+494/36,a=half(y),b=half(y2);for(const side of [-1,1]){f.quad([-a,y,side*a],[a,y,side*a],[b,y2,side*b],[-b,y2,side*b],j%2?'#6e97a5':'#789eaa');f.quad([side*a,y,-a],[side*a,y,a],[side*b,y2,b],[side*b,y2,-b],'#608592');f.box(0,y2,side*b,b*2,1,1,'#b6c6c8');}
  for(let k=-6;k<=6;k++)for(const side of [-1,1]){line(mesh,f,[k*a/6,y,side*(a+.8)],[k*b/6,y2,side*(b+.8)],.8,'#c1d1ce');line(mesh,f,[side*(a+.8),y,k*a/6],[side*(b+.8),y2,k*b/6],.8,'#c1d1ce');}}
 f.box(0,503,0,120,6,120,'#d0d7cc');sign(f,'CITIC TOWER',0,20,-66,110);
 });}
function dagoba(mesh,item,miaoying=false){const f=frame(mesh,item);slab(f,144,128);f.box(0,19,0,105,22,91,C.stone);const y=30;
 // Tibetan stupa profiles differ: Beihai slender bulb; Miaoying wide inverted bowl with 13 rings.
 const profile=miaoying?[[0,53],[15,50],[30,42],[45,40],[60,43],[76,47],[94,40],[105,27],[115,20]]:[[0,47],[13,43],[23,34],[48,33],[66,40],[84,42],[98,29],[107,16]];
 for(let i=1;i<profile.length;i++)f.cone(0,y+profile[i-1][0],0,profile[i-1][1],profile[i][0]-profile[i-1][0],C.white,64,profile[i][1]);
 details(mesh,()=>{rail(mesh,f,111,97,30);for(let i=0;i<13;i++)f.cone(0,y+109+i*5.7,0,25-i*.8,3.2,C.white,48,25-i*.8);f.cone(0,y+185,0,27,6,C.gold,48,26);f.cone(0,y+191,0,7,19,C.goldLight,24,1);
 for(let i=0;i<12;i++){const a=i/12*TAU;f.cone(Math.cos(a)*26,y+181,Math.sin(a)*26,1.2,5,C.gold,8,2);}
 arch(f,0,41,-(miaoying?44:38),14,29,'#c8b991','#514339');
 for(const side of [-1,1])hall(mesh,f,{x:side*73,z:27,y:8,w:47,d:39,h:29,roofH:15,color:miaoying?'#606a60':C.gold,columns:3});sign(f,miaoying?'MIAOYING TEMPLE':'BEIHAI WHITE PAGODA',0,20,-67,124);
 });}
function fragrant(mesh,item){const f=frame(mesh,item);for(let i=0;i<4;i++)f.box(0,9+i*14,0,190-i*25,16,144-i*17,C.stone);f.cone(0,58,0,48,130,C.red,8,48);
 details(mesh,()=>{for(const y of [88,132,176]){f.cone(0,y,0,64,4,C.goldLight,8,64);roundRoof(mesh,f,y+4,64,31,C.gold,8);}
 for(let i=0;i<8;i++){const a=i/8*TAU;f.cone(Math.cos(a)*45,62,Math.sin(a)*45,2.5,117,C.red,12,2.5);for(const y of [77,120,164])f.box(Math.cos(a)*46,y,Math.sin(a)*46,4,16,4,C.goldLight);}
 rail(mesh,f,165,121,40);stairs(f,0,-96,31,9,6,6);sign(f,'TOWER OF BUDDHIST INCENSE',0,22,-76,170);f.cone(0,211,0,4,23,C.goldLight,16,0);
 });}
function seventeen(mesh,item){const f=frame(mesh,item);slab(f,342,129);
 // The white plinth ends at y=8. Keep the water top at y=9 so the two
 // overlapping surfaces cannot fight for the same depth-buffer pixels.
 details(mesh,()=>{f.box(0,8.5,0,338,1,124,'#527f82');});
 for(let i=-8;i<=8;i++){const x=i*18,h=38-16*Math.abs(i/8),r=6.4,spring=h-r;f.box(x-8,8+spring/2,0,4,spring,40,C.stone);
  for(let j=0;j<10;j++){const a=j/10*Math.PI,b=(j+1)/10*Math.PI;for(const side of [-1,1])f.quad([x+Math.cos(a)*r,8+spring+Math.sin(a)*r,side*20],[x+Math.cos(b)*r,8+spring+Math.sin(b)*r,side*20],[x+Math.cos(b)*r,h+8,side*20],[x+Math.cos(a)*r,h+8,side*20],C.white);}
  f.box(x,h+10,0,18,4,43,C.stone);details(mesh,()=>{for(const side of [-1,1]){f.box(x,h+18,side*20,18,1.7,2,C.white);f.cone(x,h+12,side*20,1.2,9,C.white,8,1.2);f.cone(x,h+21,side*20,2,3,C.white,8,1);}});
 }
 details(mesh,()=>sign(f,'SEVENTEEN ARCH BRIDGE',0,17,-62,170));}
function drumBell(mesh,item,bell=false){const f=frame(mesh,item);const w=bell?126:185,d=bell?91:129;slab(f,w+12,d+12);f.box(0,44,0,w,74,d,bell?'#8d8b7d':C.red);
 details(mesh,()=>{for(const z of [-d/2-.5,d/2+.5])for(const x of (bell?[0]:[-62,0,62]))arch(f,x,8,z,25,42,C.stone,'#3a3c32');
  for(let y=13;y<79;y+=8)for(const side of [-1,1])rect(f,0,y,side*(d/2+1),w,.45,'#b0a895');rail(mesh,f,w+2,d+2,83);
 });
 hall(mesh,f,{y:86,w:w-22,d:d-20,h:bell?58:39,roofH:bell?39:29,color:bell?'#596d63':C.gold,columns:bell?5:7});
 details(mesh,()=>{roof(mesh,f,0,bell?118:110,0,w+5,d+9,24,bell?'#596d63':C.gold);sign(f,bell?'BELL TOWER':'DRUM TOWER',0,97,-d/2,90);
  if(bell){f.cone(0,91,-42,13,28,'#8d8556',32,8);f.box(0,123,-42,29,3,3,C.darkRed);}else for(const x of [-61,-30,0,30,61]){frontDisk(f,x,108,-d/2-2,9,'#c09862');frontDisk(f,x,108,-d/2-3,7,'#ded1a5');}
 });}
function zhengyang(mesh,item){const f=frame(mesh,item);slab(f,236,138);f.box(0,42,0,222,69,125,'#85897f');
 details(mesh,()=>{arch(f,0,9,-63,40,47,C.stone,'#363e37');for(let y=15;y<74;y+=9)for(const s of [-1,1])rect(f,0,y,s*63.1,220,.6,'#a1a195');rail(mesh,f,221,123,79);});
 hall(mesh,f,{y:86,w:160,d:86,h:56,roofH:37,color:'#587166',columns:7});details(mesh,()=>{roof(mesh,f,0,119,0,211,132,25,'#587166');sign(f,'ZHENGYANGMEN',0,143,-48,104);});}
function jingshan(mesh,item){const f=frame(mesh,item);f.cone(0,0,0,115,51,'#7f9367',64,49);f.cone(0,51,0,51,6,C.stone,32,51);
 hall(mesh,f,{y:59,w:65,d:63,h:45,roofH:30,columns:5});details(mesh,()=>{roof(mesh,f,0,85,0,101,99,22);rail(mesh,f,79,77,60);sign(f,'WANCHUN PAVILION',0,101,-34,61);});}
function yonghe(mesh,item){const f=frame(mesh,item);slab(f,245,146);f.box(0,96,9,99,177,76,C.red);
 details(mesh,()=>{for(const y of [62,119,176]){roof(mesh,f,0,y,8,135,108,35);bracketBand(f,0,y-7,-31,103);for(const x of [-43,-22,0,22,43]){f.cone(x,y-48,-32,2.5,42,C.red,12,2.5);window(f,x,y-30,-31,12,24,C.gold,'#4e3c31');}}
  for(const side of [-1,1]){hall(mesh,f,{x:side*86,z:14,y:9,w:55,d:82,h:40,roofH:23,columns:3});f.box(side*59,90,5,39,7,28,C.red);roof(mesh,f,side*59,94,5,48,38,18);}
  stairs(f,0,-60,69,4,3,6);sign(f,'YONGHE LAMA TEMPLE',0,59,-44,110);f.cone(0,213,8,4,14,C.goldLight,16,0);
 });}
function confucius(mesh,item){const f=frame(mesh,item);slab(f,236,151);hall(mesh,f,{y:20,w:199,d:94,h:46,roofH:32,columns:9});details(mesh,()=>{rail(mesh,f,221,127,13);stairs(f,0,-71,48,4,4,5);sign(f,'DACHENG HALL',0,55,-52,87);
 for(const side of [-1,1])for(const z of [-22,10,42]){f.box(side*111,17,z,10,28,5,'#999c91');f.cone(side*111,31,z,7,4,C.stone,4,0);}
 });}
function nationalMuseum(mesh,item){const f=frame(mesh,item);slab(f,324,129);f.box(0,43,6,308,70,105,'#c1ad89');
 details(mesh,()=>{for(const y of [12,77,86])f.box(0,y,3,316,y===86?7:4,118,C.stone);for(const x of [-69,-46,-23,0,23,46,69]){f.cone(x,14,-61,4.8,64,'#e2d6b5',16,4.8);f.box(x,79,-61,12,5,12,C.white);}
 for(const side of [-1,1])for(let x=95;x<147;x+=17)for(const y of [27,51,69])window(f,side*x,y,-48,10,13,'#e0d1ab','#4d6360');f.box(0,84,-54,178,10,27,C.stone);sign(f,'NATIONAL MUSEUM OF CHINA',0,83,-69,196);stairs(f,0,-66,175,4,2,4);
 });}
function station(mesh,item){const f=frame(mesh,item);slab(f,339,146);f.box(0,42,8,325,68,115,'#c5bea7');
 details(mesh,()=>{for(const x of [-136,-102,-68,-34,0,34,68,102,136])arch(f,x,13,-50,21,45,C.white,C.glass);f.box(0,79,5,327,6,122,C.white);for(const side of [-1,1]){
 f.box(side*113,95,8,47,42,48,'#c8c2aa');roof(mesh,f,side*113,117,8,68,68,22,'#3c6c63');frontDisk(f,side*113,101,-17,12,C.white);line(mesh,f,[side*113,101,-18],[side*113,110,-18],1.1,'#314747');line(mesh,f,[side*113,101,-18],[side*113+7,98,-18],1.1,'#314747');}
 f.box(0,93,7,107,23,64,C.stone);roof(mesh,f,0,107,7,139,83,22,'#3c6c63');sign(f,'BEIJING RAILWAY STATION',0,83,-59,190);
 });}
function exhibition(mesh,item){const f=frame(mesh,item);slab(f,329,150);f.box(0,57,9,313,100,125,'#d5c8a8');f.box(0,112,4,90,58,91,'#e0d4b9');
 details(mesh,()=>{for(const x of [-140,-115,-90,-65,-40,40,65,90,115,140])arch(f,x,18,-54,15,66,C.white,'#526b6e');for(const x of [-27,-9,9,27]){f.cone(x,17,-65,3.5,80,C.white,16,3.5);}
 for(const y of [13,103,142])f.box(0,y,4,y===142?98:321,5,y===142?99:135,C.white);f.box(0,169,4,57,53,56,C.stone);for(const x of [-19,0,19])arch(f,x,150,-25,10,37,C.gold,C.glass);f.cone(0,197,4,32,14,C.gold,4,19);f.cone(0,211,4,8,36,C.goldLight,12,1);f.cone(0,245,4,2,13,C.goldLight,12,1);
 const p=(i,r)=>[Math.sin(i/10*TAU)*r,255+Math.cos(i/10*TAU)*r,3];for(let i=0;i<10;i++)f.tri([0,255,3],p(i,i%2?4:10),p(i+1,(i+1)%2?4:10),'#bd5140');sign(f,'BEIJING EXHIBITION CENTER',0,106,-66,230);
 });}
function capitalMuseum(mesh,item){const f=frame(mesh,item);slab(f,264,150);f.box(38,66,9,160,112,124,'#b4b6a7');f.box(-85,70,11,72,125,92,'#557b79');
 details(mesh,()=>{for(let y=19;y<118;y+=9){f.box(39,y,-54,158,1.3,1,'#788d8c');for(let x=-34;x<112;x+=16)rect(f,x,y+4,-54.7,1,7,'#73938d');}
 // The angled bronze drum pierces a vast overhanging flat roof.
 const p=(a,y)=>[-74+(y-11)*.18+Math.cos(a)*42,y,Math.sin(a)*42-5];for(let j=0;j<17;j++)for(let i=0;i<40;i++){const a=i/40*TAU,b=(i+1)/40*TAU,y=10+j*8;f.quad(p(a,y),p(b,y),p(b,y+8),p(a,y+8),j%3?'#877452':'#a18c60');}
 f.box(0,139,0,268,8,151,'#bac2b3');f.box(0,145,0,272,3,155,'#e0dfcb');for(let x=-119;x<123;x+=12)f.box(x,134,0,1.4,5,140,'#627b77');sign(f,'CAPITAL MUSEUM',39,24,-57,152);
 });}
function planetarium(mesh,item){const f=frame(mesh,item);slab(f,249,162);f.box(-52,37,5,127,58,130,'#c7c3ad');f.box(79,54,4,86,92,126,'#688c91');f.cone(-52,57,5,52,10,C.white,64,52);
 details(mesh,()=>{const sub={...f,p:(x,y,z)=>f.p(x-52,y,z+5),quad:(a,b,c,d,color)=>f.quad([a[0]-52,a[1],a[2]+5],[b[0]-52,b[1],b[2]+5],[c[0]-52,c[1],c[2]+5],[d[0]-52,d[1],d[2]+5],color)};ellipsoid(mesh,sub,52,52,54,66,'#a9b6ab');
  for(let y=15;y<98;y+=14)f.box(79,y,-60,86,1.2,1,'#bed0c8');for(let x=39;x<122;x+=13)f.box(x,55,-60,1.2,91,1,'#b3c9c1');for(const x of [-100,-74,-48,-22])arch(f,x,14,-61,17,34,C.white,'#476a71');sign(f,'BEIJING PLANETARIUM',-23,24,-69,182);
 });}
const draws={
 'beijing-birds-nest':addBeijingStadium,'beijing-water-cube':waterCube,'beijing-ncpa':ncpa,'beijing-cctv':cctv,'beijing-china-zun':chinaZun,
 'beijing-beihai-dagoba':(m,i)=>dagoba(m,i,false),'beijing-fragrant-tower':fragrant,'beijing-seventeen-arch':seventeen,
 'beijing-drum-tower':(m,i)=>drumBell(m,i,false),'beijing-bell-tower':(m,i)=>drumBell(m,i,true),'beijing-zhengyangmen':zhengyang,
 'beijing-jingshan':jingshan,'beijing-yonghe':yonghe,'beijing-confucius':confucius,'beijing-national-museum':nationalMuseum,
 'beijing-railway-station':station,'beijing-exhibition-center':exhibition,'beijing-miaoying':(m,i)=>dagoba(m,i,true),
 'beijing-capital-museum':capitalMuseum,'beijing-planetarium':planetarium,
 'temple-of-heaven':temple,'palace-gate':palace,'beijing-paifang':paifang,
};
export function addBeijingCityLandmark(mesh,item){
 // Existing placement angles followed road tangent; orient refinements explicitly.
 const refined=BEIJING_REFINEMENTS.some(meta=>meta.kind===item.kind);
 draws[item.kind]?.(mesh,refined?{...item,angle:item.angle+(item.side<0?Math.PI:0)}:item);
}
