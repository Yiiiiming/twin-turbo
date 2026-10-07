/** Compact city districts: native geometry shared by rendering and collisions. */
import { TRACK, trackPoint, projectTrack } from './engine.js';
import { addAustinCampus } from './austin-campus.js';
const TAU=Math.PI*2;
const THEMES=new Set(['beijing','austin','rio']);
export const isCityTheme=()=>THEMES.has(TRACK.theme);
const seedRandom=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const point=(item,x,y,z)=>[item.x+Math.cos(item.angle)*x-Math.sin(item.angle)*z,y,item.z+Math.sin(item.angle)*x+Math.cos(item.angle)*z];
const boxAt=(mesh,item,x,y,z,w,h,d,color,glow=0)=>mesh.box(...point(item,x,y,z),w,h,d,color,item.angle,glow);
const clearOfRiver=(x,z,radius)=>!TRACK.river||Math.abs(z-TRACK.river.centerZ)>TRACK.river.halfWidth+radius+24;
const profiles={
 beijing:[['temple-of-heaven',.20,116,-1],['palace-gate',.51,163,1],['beijing-paifang',.79,120,-1]],
 austin:[['texas-capitol',.20,172,-1],['ut-tower',.37,75,-1],['football-team',.40,115,1],['music-guitar',.57,106,1],['austin-music-hall',.80,136,-1]],
 rio:[['christ-redeemer',.19,111,-1],['sugarloaf',.50,238,1],['lapa-aqueduct',.79,147,-1]],
};
const placementCache=new WeakMap(),sceneryCache=new WeakMap();

export function cityLandmarkPlacements() {
 if(!isCityTheme())return [];
 if(placementCache.has(TRACK))return placementCache.get(TRACK);
 const result=[];
 for(const [kind,fraction,radius,preferredSide]of profiles[TRACK.theme]){
  let found;
  for(const shift of [0,.014,-.014,.028,-.028,.05,-.05]){
   for(const side of [preferredSide,-preferredSide]){
    const s=TRACK.startDistance+(fraction+shift)*TRACK.length,p=trackPoint(s,side*(TRACK.roadWidth/2+radius+38));
    if(p.elevation>15||projectTrack(p.x,p.y).distance<TRACK.roadWidth/2+radius+24||!clearOfRiver(p.x,p.y,radius))continue;
    if(result.some(other=>Math.hypot(other.x-p.x,other.z-p.y)<other.radius+radius+30))continue;
    found={kind,x:p.x,z:p.y,angle:p.angle,side,radius,s};break;
   }
   if(found)break;
  }
  if(!found)throw new Error(`${TRACK.id}: no clear roadside plot for ${kind}`);
  result.push(Object.freeze(found));
 }
 for(const bridge of TRACK.bridges||[])if(bridge.kind==='austin-arch'){
  for(const station of [-1,1])for(const side of [-1,1]){
   const p=trackPoint(bridge.s+station*bridge.halfSpan,side*99);
   result.push(Object.freeze({kind:'austin-bridge-foot',x:p.x,z:p.y,angle:p.angle,radius:21,s:bridge.s+station*bridge.halfSpan,deck:bridge.deckHeight}));
  }
 }
 const frozen=Object.freeze(result);placementCache.set(TRACK,frozen);return frozen;
}
export function citySceneryPlacements() {
 if(!isCityTheme())return [];
 if(sceneryCache.has(TRACK))return sceneryCache.get(TRACK);
 const random=seedRandom({beijing:20751,austin:49178,rio:61937}[TRACK.theme]),items=[],landmarks=cityLandmarkPlacements();
 for(let s=110,index=0;s<TRACK.length;s+=110,index++)for(const side of [-1,1]){
  const tree=index%5===0,kind=tree?(TRACK.theme==='rio'?'rio-palm':'city-tree'):TRACK.theme==='beijing'?'hutong':TRACK.theme==='austin'?'music-street':'rio-house';
  const width=tree?24:58+random()*30,depth=tree?24:46+random()*20,radius=tree?36:Math.hypot(width+16,depth+16)/2;
  const p=trackPoint(s,side*(TRACK.roadWidth/2+radius+35+random()*20));
  if(p.elevation>5||!clearOfRiver(p.x,p.y,radius)||projectTrack(p.x,p.y).distance<TRACK.roadWidth/2+radius+18)continue;
  if(landmarks.some(item=>Math.hypot(item.x-p.x,item.z-p.y)<item.radius+radius+25)||items.some(item=>Math.hypot(item.x-p.x,item.z-p.y)<item.radius+radius+7))continue;
  items.push(Object.freeze({kind,x:p.x,z:p.y,angle:p.angle,side,radius,width,depth,height:TRACK.theme==='beijing'?38+random()*22:58+random()*45,variant:index%6}));
 }
 const frozen=Object.freeze(items);sceneryCache.set(TRACK,frozen);return frozen;
}

function beam(mesh,a,b,width,color){
 const delta=b.map((v,i)=>v-a[i]),length=Math.hypot(...delta),axis=delta.map(v=>v/length);
 const ref=Math.abs(axis[1])>.9?[1,0,0]:[0,1,0],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const raw=cross(axis,ref),n=Math.hypot(...raw),u=raw.map(v=>v/n),v=cross(axis,u);
 const ring=end=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([p,q])=>end.map((value,i)=>value+(u[i]*p+v[i]*q)*width/2));
 const r=ring(a),t=ring(b);mesh.quad(...r,color);mesh.quad(...t,color);
 for(let i=0;i<4;i++)mesh.quad(r[i],t[i],t[(i+1)%4],r[(i+1)%4],color);
 if(mesh.colliders)mesh.colliders.push({id:`prop-${mesh.colliders.length}`,type:'box',x:(a[0]+b[0])/2,y:(a[2]+b[2])/2,
  halfWidth:(Math.hypot(delta[0],delta[2])+width)/2,halfDepth:width/2,angle:Math.atan2(delta[2],delta[0]),minHeight:Math.min(a[1],b[1])-width/2,maxHeight:Math.max(a[1],b[1])+width/2});
}
function dome(mesh,x,z,bottom,radius,height,color){
 for(let ring=0;ring<12;ring++){
  const a=ring/12*Math.PI/2,b=(ring+1)/12*Math.PI/2;
  mesh.cone(x,bottom+Math.sin(a)*height,z,Math.cos(a)*radius,(Math.sin(b)-Math.sin(a))*height,color,48,Math.max(.08,Math.cos(b)*radius));
 }
}
function hipRoof(mesh,item,y,w,d,h,color,trim='#caae75'){
 for(const side of [-1,1])for(let i=0;i<12;i++)for(let j=0;j<5;j++){
  const surface=(col,row)=>{const u=-1+col/6,t=row/5;return point(item,u*w/2*(1-t*.24),y+h*Math.pow(t,.7)+Math.pow(Math.abs(u),5)*8*(1-t),side*d/2*(1-t));};
  mesh.quad(surface(i,j),surface(i+1,j),surface(i+1,j+1),surface(i,j+1),color);
 }
 for(const end of [-1,1])mesh.triangle(point(item,end*w/2,y+8,-d/2),point(item,end*w/2,y+8,d/2),point(item,end*w*.38,y+h,0),color);
 boxAt(mesh,item,0,y+h,0,w*.8,3,3,trim);
 for(const side of [-1,1])for(const end of [-1,1])beam(mesh,point(item,end*w*.43,y+3,side*d*.5),point(item,end*w*.52,y+13,side*d*.5),2,trim);
}
function roundRoof(mesh,x,z,y,r,h,color){
 const radii=[1,.94,.85,.72,.56,.36,.12];
 for(let i=0;i<6;i++)mesh.cone(x,y+i*h/6,z,r*radii[i],h/6,color,64,r*radii[i+1]);
 mesh.cone(x,y-2,z,r+1,3,'#bca66d',64,r+1);
}
function temple(mesh,item){
 const {x,z}=item;
 for(const [i,r]of[112,97,84].entries())mesh.cone(x,i*9,z,r,9,'#d3d4bf',64,r);
 mesh.cone(x,27,z,60,132,'#963f35',48,60);
 for(let i=0;i<24;i++){const a=i/24*TAU;mesh.box(x+Math.cos(a)*59,90,z+Math.sin(a)*59,3,123,3,'#cba768');}
 for(const [y,r,h]of [[91,79,30],[139,66,29],[186,52,40]])roundRoof(mesh,x,z,y,r,h,'#2d5e8c');
 mesh.cone(x,165,z,39,28,'#9a4539',48,39);
 mesh.cone(x,226,z,5,21,'#d2b35e',24,0);
 for(let i=0;i<28;i++){
  const a=i/28*TAU,px=x+Math.cos(a)*107,pz=z+Math.sin(a)*107;mesh.box(px,22,pz,3,16,3,'#e5e3cc');
  const b=(i+1)/28*TAU;beam(mesh,[px,29,pz],[x+Math.cos(b)*107,29,z+Math.sin(b)*107],2,'#e0dfc9');
 }
}
function palaceGate(mesh,item){
 boxAt(mesh,item,0,18,0,255,36,86,'#8c3d35');boxAt(mesh,item,0,39,0,263,7,94,'#cbb992');
 boxAt(mesh,item,0,78,0,185,72,74,'#9a4334');
 for(const side of [-1,1])for(let i=-4;i<=4;i++){
  boxAt(mesh,item,i*20,76,side*38,5,61,5,'#bda065');boxAt(mesh,item,i*20,68,side*39,11,37,1,'#442e2b');
 }
 hipRoof(mesh,item,111,230,119,40,'#bd9a45');hipRoof(mesh,item,68,230,120,26,'#b59951');
 for(const side of [-1,1]){boxAt(mesh,item,side*110,71,0,46,64,73,'#a14a39');const q=point(item,side*110,0,0);hipRoof(mesh,{...item,x:q[0],z:q[2]},100,66,93,27,'#bc9f58');}
 for(const door of [-75,0,75])boxAt(mesh,item,door,16,-44,29,31,1.4,'#382f2c');
 for(const door of [-75,0,75])for(const side of [-1,1])boxAt(mesh,item,door+side*10,16,-45,1.3,25,.8,'#ba9556');
}
function paifang(mesh,item){
 for(const x of [-85,-32,32,85]){
  boxAt(mesh,item,x,44,0,9,88,10,'#a44839');boxAt(mesh,item,x,6,0,17,12,20,'#bdbfae');
  const cap={...item,...(()=>{const p=point(item,x,0,0);return{x:p[0],z:p[2]};})()};hipRoof(mesh,cap,86,24,34,12,'#476568');
 }
 boxAt(mesh,item,0,73,0,190,9,14,'#b69b62');boxAt(mesh,item,0,88,0,63,23,16,'#426379');
 hipRoof(mesh,item,101,85,44,23,'#486c79');
 for(const side of [-1,1]){
  const p=point(item,side*61,0,0),wing={...item,x:p[0],z:p[2]};hipRoof(mesh,wing,80,62,40,18,'#486c79');
 }
 for(const x of [-18,-6,6,18])boxAt(mesh,item,x,88,-8.8,5,10,1,'#d7bd77');
}
function capitol(mesh,item){
 const {x,z}=item,rose='#bb8f7d',trim='#d9baa4',glass='#3e5357';
 boxAt(mesh,item,0,5,0,272,10,150,'#bba99a');
 for(const wing of [-1,1]){boxAt(mesh,item,wing*94,43,0,116,75,98,rose);boxAt(mesh,item,wing*94,83,0,123,7,104,trim);}
 boxAt(mesh,item,0,62,0,98,114,113,rose);
 for(const side of [-1,1])for(let col=-6;col<=6;col++)for(const y of [28,55,77])boxAt(mesh,item,col*20,y,side*50.5,8,14,1.3,glass);
 for(const side of [-1,1])for(const column of [-2,-1,0,1,2])boxAt(mesh,item,column*17,66,side*65,6,71,6,trim);
 for(const side of [-1,1]){
  mesh.triangle(point(item,-51,103,side*72),point(item,51,103,side*72),point(item,0,131,side*72),trim);
  boxAt(mesh,item,0,101,side*67,107,6,21,trim);
 }
 mesh.cone(x,110,z,42,52,rose,48,42);mesh.cone(x,159,z,49,6,trim,48,49);
 for(let i=0;i<16;i++){const a=i/16*TAU;mesh.box(x+Math.cos(a)*43,137,z+Math.sin(a)*43,4,37,4,trim);}
 dome(mesh,x,z,165,44,59,'#7c8b81');mesh.cone(x,222,z,11,22,trim,24,8);mesh.cone(x,244,z,5,23,'#b9c1a9',16,0);
}
function guitar(mesh,item){
 const {x,z}=item;boxAt(mesh,item,0,7,0,65,14,47,'#786961');boxAt(mesh,item,0,46,0,9,86,9,'#263a45');
 const center=point(item,0,92,-2),a=item.angle,right=[Math.cos(a),0,Math.sin(a)];
 const oval=(cx,cy,rx,ry,color)=>{
  const p=t=>[center[0]+right[0]*(cx+Math.cos(t)*rx),cy+Math.sin(t)*ry,center[2]+right[2]*(cx+Math.cos(t)*rx)];
  for(let i=0;i<40;i++)mesh.triangle([center[0]+right[0]*cx,cy,center[2]+right[2]*cx],p(i/40*TAU),p((i+1)/40*TAU),color,.8);
 };
 oval(0,84,27,25,'#e6a778');oval(0,106,20,21,'#df8986');oval(0,104,8,8,'#314954');
 boxAt(mesh,item,0,139,-2,8,58,4,'#a86b58');boxAt(mesh,item,0,171,-2,14,15,5,'#e1b383');
 for(const side of [-1,1])for(let i=0;i<3;i++)boxAt(mesh,item,side*10,167+i*5,-2,7,2,3,'#c1d6d0');
 for(const string of [-2,-.7,.7,2])beam(mesh,point(item,string,73,-4.2),point(item,string,176,-4.2),.5,'#f1edc1');
 // Stage pavilion and vertical sound bars make the district read at racing speed.
 boxAt(mesh,item,52,26,22,62,52,65,'#694c48');boxAt(mesh,item,52,55,22,68,6,69,'#344654');
 for(let i=0;i<5;i++)boxAt(mesh,item,32+i*10,35,56,4,15+i%3*8,1,i%2?'#88d7c2':'#e99ea9',.8);
}
function musicHall(mesh,item){
 boxAt(mesh,item,0,34,0,198,68,94,'#a06e59');boxAt(mesh,item,0,71,0,210,7,101,'#d3b793');
 for(const side of [-1,1])for(let i=-4;i<=4;i++)boxAt(mesh,item,i*20,32,side*48,12,38,1,'#3b5058');
 boxAt(mesh,item,0,69,-53,133,15,5,'#304d59');
 for(let i=-6;i<=6;i++)boxAt(mesh,item,i*10,69,-56,4,7+(i%3+3)%3*2,1,'#f0c679',.75);
 for(const side of [-1,1]){boxAt(mesh,item,side*88,93,0,30,36,79,'#8a6055');boxAt(mesh,item,side*88,113,0,37,5,85,'#d3b793');}
}
function archBridge(mesh){
 for(const bridge of TRACK.bridges||[])if(bridge.kind==='austin-arch'){
  const span=bridge.halfSpan,deck=bridge.deckHeight;
  for(const side of [-1,1]){
   for(let i=0;i<44;i++){
    const a=-span+i/44*span*2,b=-span+(i+1)/44*span*2;
    const ap=trackPoint(bridge.s+a,side*99),bp=trackPoint(bridge.s+b,side*99);
    const height=s=>deck+32+153*(1-(s/span)**2);
    beam(mesh,[ap.x,height(a),ap.y],[bp.x,height(b),bp.y],10,'#a25d42');
    if(i%4===0)beam(mesh,[ap.x,deck+19,ap.y],[ap.x,height(a),ap.y],3.5,'#b78664');
    if(i%8===0&&Math.abs(a)<span*.75){const opposite=trackPoint(bridge.s+a,-side*99);beam(mesh,[ap.x,height(a),ap.y],[opposite.x,height(a),opposite.y],5,'#ae795a');}
   }
  }
  for(const item of cityLandmarkPlacements().filter(item=>item.kind==='austin-bridge-foot'))boxAt(mesh,item,0,(deck+25)/2,0,29,deck+25,29,'#9a9480');
 }
}
function christ(mesh,item){
 const {x,z}=item;
 mesh.cone(x,0,z,105,29,'#69846b',48,91);mesh.cone(x,29,z,91,46,'#778775',48,64);mesh.cone(x,75,z,64,27,'#8f9682',40,39);
 boxAt(mesh,item,0,110,0,54,16,42,'#bab9a3');
 mesh.cone(x,118,z,21,102,'#d5d7c8',12,13,item.angle);
 for(const side of [-1,1]){
  beam(mesh,point(item,side*9,207,0),point(item,side*73,206,0),12,'#dce0d0');
  boxAt(mesh,item,side*79,208,0,13,6,8,'#e4e4d5');
 }
 boxAt(mesh,item,0,229,0,20,23,17,'#dce0d0');boxAt(mesh,item,0,239,0,18,5,17,'#b6bbb0');
 for(const pleat of [-10,0,10])beam(mesh,point(item,pleat,121,-16),point(item,pleat*.65,202,-12),1.3,'#adb6ad');
}
function sugarloaf(mesh,item){
 const {x,z}=item;
 // Rounded granite shoulder and dome instead of a stack of angular mountains.
 for(const [y,r,h,next]of [[0,232,49,212],[49,212,61,180],[110,180,77,145],[187,145,63,103],[250,103,43,59],[293,59,17,.2]])mesh.cone(x,y,z,r,h,y<110?'#788776':'#a9ac98',64,next,.12);
 const top=point(item,0,317,0);mesh.box(top[0],top[1],top[2],28,13,23,'#d5c9ab',item.angle);mesh.box(top[0],326,top[2],34,5,28,'#5d7477',item.angle);
 // Visible cable car and its cable stay inside the reserved mountain plot.
 beam(mesh,point(item,-160,152,55),point(item,0,330,0),1.2,'#465957');
 boxAt(mesh,item,-92,216,31,24,18,16,'#d8b958');boxAt(mesh,item,-92,220,31,25,7,17,'#45636e');
}
function lapa(mesh,item){
 const cream='#e0dfcb',shade='#c4cbbf';
 for(let arch=0;arch<6;arch++){
  const cx=-115+arch*46;
  for(const side of [-1,1])boxAt(mesh,item,cx+side*23,24,0,7,48,23,shade);
  for(let segment=0;segment<16;segment++){
   const a=segment/16*Math.PI,b=(segment+1)/16*Math.PI;
   const p=(angle,r,depth)=>point(item,cx+Math.cos(angle)*r,45+Math.sin(angle)*r,depth);
   for(const side of [-1,1])mesh.quad(p(a,19,side*12),p(b,19,side*12),p(b,26,side*12),p(a,26,side*12),cream);
   mesh.quad(p(a,19,-12),p(b,19,-12),p(b,19,12),p(a,19,12),shade);
   mesh.quad(p(a,26,-12),p(b,26,-12),p(b,26,12),p(a,26,12),cream);
   const lo=Math.min(Math.cos(a),Math.cos(b))*26,hi=Math.max(Math.cos(a),Math.cos(b))*26;
   if(mesh.colliders){const q=point(item,cx+(lo+hi)/2,0,0);mesh.colliders.push({id:`prop-${mesh.colliders.length}`,type:'box',x:q[0],y:q[2],halfWidth:Math.max(1,(hi-lo)/2),halfDepth:12,angle:item.angle,minHeight:45+Math.min(Math.sin(a),Math.sin(b))*19,maxHeight:45+Math.max(Math.sin(a),Math.sin(b))*26});}
  }
 }
 boxAt(mesh,item,0,75,0,284,9,29,cream);boxAt(mesh,item,0,84,0,282,9,20,shade);
 for(let x=-134;x<=134;x+=15)boxAt(mesh,item,x,95,0,3,14,3,cream);
 boxAt(mesh,item,0,102,0,282,3,4,cream);
}

export function addCityLandmark(mesh,item){
 const draw={'temple-of-heaven':temple,'palace-gate':palaceGate,'beijing-paifang':paifang,'texas-capitol':capitol,'music-guitar':guitar,'austin-music-hall':musicHall,'christ-redeemer':christ,sugarloaf,'lapa-aqueduct':lapa};
 if(item.kind==='ut-tower'||item.kind==='football-team')addAustinCampus(mesh,item.kind==='football-team'&&item.side<0?{...item,angle:item.angle+Math.PI}:item);
 else draw[item.kind]?.(mesh,item);
}
export function addCityLandmarks(mesh){
 if(!isCityTheme())return;
 for(const item of cityLandmarkPlacements())addCityLandmark(mesh,item);
 if(TRACK.theme==='austin'){
  archBridge(mesh);
  if(TRACK.river)for(const side of [-1,1])for(let x=-700;x<TRACK.width+700;x+=80){
   const z=TRACK.river.centerZ+side*(TRACK.river.halfWidth+8);if(projectTrack(x,z).distance<140)continue;
   mesh.box(x,7,z,80,14,12,'#a8a68c');mesh.box(x,15,z,80,3,15,'#c5bfa3');
   mesh.box(x,23,z,2.5,16,2.5,'#61776e');mesh.box(x,32,z,80,2,2,'#6c847b');
  }
 }
}

function streetBuilding(mesh,item){
 const {width:w,depth:d,height:h,side,variant,kind}=item;
 const beijing=kind==='hutong',austin=kind==='music-street';
 const palettes=beijing?['#8b8980','#9c9688','#858b85','#9e9683','#90938b','#aaa18e']:austin?['#a27862','#997262','#bb9272','#80665a','#c6a389','#a68c74']:['#cc8773','#d8bb76','#7aa5a5','#a6aace','#aa8a9c','#b5be91'];
 const wall=palettes[variant],trim=beijing?'#b7b5a6':'#dcd1b8',glass='#36505b',front=-side*(d/2+1);
 boxAt(mesh,item,0,h/2,0,w,h,d,wall);boxAt(mesh,item,0,4,0,w+5,8,d+5,'#a5a595');
 if(beijing){hipRoof(mesh,item,h,w+10,d+12,21,'#52616a','#899086');boxAt(mesh,item,0,18,front,16,33,2,'#6d3b34');}
 else{boxAt(mesh,item,0,h+2,0,w+7,5,d+7,trim);boxAt(mesh,item,0,h+7,0,w*.8,5,d*.8,austin?'#4c5e64':'#9b8f81');}
 const cols=Math.max(3,Math.floor(w/19)),rows=beijing?1:Math.floor((h-17)/23);
 for(let col=0;col<cols;col++){
  const x=-w*.38+col*w*.76/(cols-1);
  for(let row=0;row<rows;row++){
   const y=beijing?23:17+row*23;if(beijing&&Math.abs(x)<10)continue;
   boxAt(mesh,item,x,y,front,12,17,2,trim);boxAt(mesh,item,x,y,front-side*1.2,8.5,13.5,1.1,glass);
   boxAt(mesh,item,x,y,front-side*1.9,.8,13.5,.7,trim);boxAt(mesh,item,x,y,front-side*1.9,8.5,.9,.7,trim);
  }
 }
 if(austin){boxAt(mesh,item,0,h*.72,front-side, w*.77,8,3,'#36535a');for(let i=-2;i<=2;i++)boxAt(mesh,item,i*9,h*.72,front-side*3,4,4+(i+2)%3,1,variant%2?'#eeb787':'#9bdcca',.65);}
 if(!austin&&!beijing){boxAt(mesh,item,0,30,front-side*3,w*.7,3,11,'#9fa79b');for(let i=-2;i<=2;i++)boxAt(mesh,item,i*w*.14,37,front-side*7,1,12,1,'#6a807c');boxAt(mesh,item,0,43,front-side*7,w*.7,1.2,1.2,'#6a807c');}
 if(beijing)for(const end of [-1,1]){
  const q=point(item,end*w*.4,27,front-side*4);mesh.cone(q[0],q[1],q[2],4,11,'#b64d3d',16,4);mesh.cone(q[0],q[1]-1,q[2],4.5,2,'#d1b167',16,4.5);
 }
}
function tree(mesh,item){
 const{x,z,kind}=item;
 mesh.cone(x,0,z,3.5,kind==='rio-palm'?65:42,'#81715e',12,2.5);
 if(kind==='rio-palm'){
  for(let i=0;i<9;i++){const a=i/9*TAU,c=Math.cos(a),s=Math.sin(a);mesh.quad([x,65,z],[x+c*17-s*5,74,z+s*17+c*5],[x+c*34,53,z+s*34],[x+c*17+s*5,74,z+s*17-c*5],'#548972');}
 }else{
  mesh.cone(x,24,z,20,22,'#597d67',20,30);mesh.cone(x,46,z,30,22,'#6b8c71',24,14);mesh.cone(x,68,z,14,8,'#80987c',20,0);
 }
}
export function addCityStreetScenery(mesh,item){
 if(['hutong','music-street','rio-house'].includes(item.kind))streetBuilding(mesh,item);else tree(mesh,item);
}
export function addCityPavements(mesh){
 if(!isCityTheme())return;
 const rio=TRACK.theme==='rio';
 for(let s=0;s<TRACK.length;s+=24)for(const side of [-1,1]){
  const p=trackPoint(s),q=trackPoint(s+24);if(p.elevation>3||q.elevation>3)continue;
  for(let band=0;band<5;band++){
   const a=trackPoint(s,side*(69+band*9)),b=trackPoint(s+24,side*(69+band*9)),c=trackPoint(s+24,side*(78+band*9)),d=trackPoint(s,side*(78+band*9));
   if(!clearOfRiver(a.x,a.y,2)||!clearOfRiver(c.x,c.y,2))continue;
   let color=TRACK.theme==='beijing'?'#a9aaa0':TRACK.theme==='austin'?'#b5ab92':'#d4d0b8';
   mesh.quad([a.x,.5,a.y],[b.x,.5,b.y],[c.x,.5,c.y],[d.x,.5,d.y],color,0,[0,1,0]);
  }
 }
 // Smooth Copacabana-style waves are actual curved ribbons, never square tiles.
 if(rio)for(let s=0;s<TRACK.length;s+=8)for(const side of [-1,1])for(let band=-1;band<=2;band++){
  const stripe=t=>{const center=15+band*32+13*Math.sin(t/73);return [Math.max(0,Math.min(45,center-5)),Math.max(0,Math.min(45,center+5))];};
  const [lo,hi]=stripe(s),[nextLo,nextHi]=stripe(s+8);if(hi<=lo&&nextHi<=nextLo)continue;
  const a=trackPoint(s,side*(69+lo)),b=trackPoint(s+8,side*(69+nextLo)),c=trackPoint(s+8,side*(69+nextHi)),d=trackPoint(s,side*(69+hi));
  if(Math.max(a.elevation,b.elevation)>3||!clearOfRiver(a.x,a.y,2)||!clearOfRiver(c.x,c.y,2))continue;
  mesh.quad([a.x,.6,a.y],[b.x,.6,b.y],[c.x,.6,c.y],[d.x,.6,d.y],'#40545a',0,[0,1,0]);
 }
}
