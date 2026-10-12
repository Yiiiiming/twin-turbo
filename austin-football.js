/** A staged 11-on-11 passing play, inspired by Texas's burnt-orange home kit.
 * Original game geometry, not a roster or a reconstruction of a live match.
 * Uniform reference: https://texaslonghorns.com/sports/football/roster
 * The roadside scoreboard uses the actual Austin clock, including DST.
 */
import { frame, details, beam, word } from './london-west-end.js';

export const AUSTIN_FOOTBALL_RADIUS=390;
export const AUSTIN_SCOREBOARD=Object.freeze({key:'austin-scoreboard',x:0,y:158,z:189.65,width:450,height:140});
const TAU=Math.PI*2;
const palette={texas:{jersey:'#bd541d',pants:'#f2eee3',helmet:'#f7f1e5',number:'#fff5df',stripe:'#c05b22',mask:'#939da0'},
  ou:{jersey:'#8b2638',pants:'#efe4cd',helmet:'#951f36',number:'#f7eed9',stripe:'#f7eed9',mask:'#ddd6c4'}};
// The line protects a quarterback with a raised throwing arm. Wide receivers
// have released downfield while the defence closes the pocket and covers them.
export const AUSTIN_FOOTBALL_PLAYERS=Object.freeze([
 {team:'texas',role:'LT',number:76,x:-24,z:-60,pose:'block'},
 {team:'texas',role:'LG',number:63,x:-28,z:-30,pose:'block'},
 {team:'texas',role:'C',number:55,x:-30,z:0,pose:'block'},
 {team:'texas',role:'RG',number:72,x:-28,z:30,pose:'block'},
 {team:'texas',role:'RT',number:79,x:-24,z:60,pose:'block'},
 {team:'texas',role:'QB',number:16,x:-109,z:-16,pose:'throw'},
 {team:'texas',role:'RB',number:22,x:-133,z:48,pose:'run',yaw:-.22},
 {team:'texas',role:'TE',number:85,x:-14,z:90,pose:'block'},
 {team:'texas',role:'WR',number:7,x:31,z:-116,pose:'run',yaw:-.12},
 {team:'texas',role:'WR',number:11,x:76,z:105,pose:'run',yaw:.17},
 {team:'texas',role:'WR',number:3,x:5,z:-84,pose:'run',yaw:.23},
 {team:'ou',role:'DE',number:91,x:17,z:-61,pose:'rush',yaw:.18},
 {team:'ou',role:'DT',number:97,x:13,z:-20,pose:'block'},
 {team:'ou',role:'DT',number:94,x:13,z:20,pose:'block'},
 {team:'ou',role:'DE',number:44,x:19,z:62,pose:'rush',yaw:-.24},
 {team:'ou',role:'LB',number:32,x:77,z:-62,pose:'ready'},
 {team:'ou',role:'LB',number:40,x:83,z:0,pose:'ready'},
 {team:'ou',role:'LB',number:26,x:78,z:66,pose:'ready'},
 {team:'ou',role:'CB',number:6,x:113,z:-113,pose:'run',yaw:.28},
 {team:'ou',role:'CB',number:9,x:148,z:103,pose:'run',yaw:-.15},
 {team:'ou',role:'S',number:12,x:215,z:-60,pose:'ready'},
 {team:'ou',role:'S',number:2,x:209,z:50,pose:'ready'},
].map(Object.freeze));

const clock=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function austinScoreboardText(now=Date.now()) {
 const time=clock.format(new Date(now));return {time,text:`It's ${time} and OU still sucks!`,minute:Math.floor(Number(new Date(now))/60000)};
}
export function paintAustinScoreboard(canvas,now=Date.now()) {
 const context=canvas?.getContext?.('2d');if(!context)return null;
 const info=austinScoreboardText(now);canvas.width=2048;canvas.height=640;
 const ctx=context;ctx.fillStyle='#101a20';ctx.fillRect(0,0,2048,640);
 ctx.fillStyle='#b34e1b';ctx.fillRect(0,0,2048,82);ctx.fillStyle='#f6ebd7';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.font='700 46px Arial, sans-serif';ctx.fillText('TEXAS FOOTBALL  ·  AUSTIN, TX',1024,43,1950);
 ctx.strokeStyle='#d1844e';ctx.lineWidth=5;ctx.strokeRect(20,101,2008,449);
 ctx.fillStyle='#ffd58c';ctx.font='700 156px Arial, sans-serif';ctx.fillText(`It's ${info.time}`,1024,222,1900);
 ctx.fillStyle='#fff3db';ctx.font='800 137px Arial, sans-serif';ctx.fillText('and OU still sucks!',1024,405,1900);
 ctx.fillStyle='#d99865';ctx.font='700 37px Arial, sans-serif';ctx.fillText("AUSTIN LOCAL TIME  ·  HOOK 'EM",1024,594,1930);
 return info;
}
export function footballFrame(item){return {...item,angle:(item.angle||0)+(item.side<0?Math.PI:0)+(item.side<0?1:-1)*Math.PI*.2};}
export function austinScoreboardSurface(item) {
 if(!item)return null;
 const f=frame(null,footballFrame(item)),{x,y,z,width:w,height:h}=AUSTIN_SCOREBOARD;
 const a=[...f.p(x+w/2,y-h/2,z),0,0],b=[...f.p(x+w/2,y+h/2,z),0,1],c=[...f.p(x-w/2,y+h/2,z),1,1],d=[...f.p(x-w/2,y-h/2,z),1,0];
 return {...AUSTIN_SCOREBOARD,vertices:new Float32Array([...a,...b,...c,...a,...c,...d])};
}

function sphere(mesh,p,center,radii,color,sides=14,rings=8) {
 const at=(lat,lon)=>p(center[0]+Math.cos(lat)*Math.cos(lon)*radii[0],center[1]+Math.sin(lat)*radii[1],center[2]+Math.cos(lat)*Math.sin(lon)*radii[2]);
 for(let r=0;r<rings;r++)for(let s=0;s<sides;s++){
  const a=-Math.PI/2+r/rings*Math.PI,b=-Math.PI/2+(r+1)/rings*Math.PI,c=s/sides*TAU,d=(s+1)/sides*TAU;
  if(r===0)mesh.triangle(at(a,c),at(b,d),at(b,c),color);
  else if(r===rings-1)mesh.triangle(at(a,c),at(a,d),at(b,c),color);
  else mesh.quad(at(a,c),at(a,d),at(b,d),at(b,c),color);
 }
}
function limb(mesh,p,a,b,ra,rb,color,sides=10) {
 const delta=b.map((v,i)=>v-a[i]),len=Math.hypot(...delta),axis=delta.map(v=>v/len),reference=Math.abs(axis[1])>.92?[1,0,0]:[0,1,0];
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],u=cross(axis,reference),ul=Math.hypot(...u);u.forEach((n,i)=>u[i]=n/ul);const v=cross(axis,u);
 const at=(end,r,t)=>p(...end.map((n,i)=>n+r*(u[i]*Math.cos(t)+v[i]*Math.sin(t))));
 for(let i=0;i<sides;i++){const t=i/sides*TAU,n=(i+1)/sides*TAU;mesh.quad(at(a,ra,t),at(a,ra,n),at(b,rb,n),at(b,rb,t),color);}
}
const digitSegments=['abcdef','bc','abged','abgcd','fgbc','afgcd','afgecd','abc','abcdefg','abfgcd'];
function numberQuads(quad,number,cx,cy,z,height,color) {
 const digits=String(number),unit=height/7,w=unit*3;
 const segments={a:[0,3,w,.75*unit],b:[w/2,1.5,.7*unit,2.5*unit],c:[w/2,-1.5,.7*unit,2.5*unit],d:[0,-3,w,.75*unit],e:[-w/2,-1.5,.7*unit,2.5*unit],f:[-w/2,1.5,.7*unit,2.5*unit],g:[0,0,w,.75*unit]};
 for(let i=0;i<digits.length;i++)for(const part of digitSegments[Number(digits[i])]){
  const [dx,dy,width,h]=segments[part],x=cx-(i-(digits.length-1)/2)*unit*4.6-dx,y=cy+dy*unit;
  quad([x-width/2,y-h/2,z],[x+width/2,y-h/2,z],[x+width/2,y+h/2,z],[x-width/2,y+h/2,z],color);
 }
}
function helmet(mesh,p,quad,head,kit,skin) {
 const [x,y,z]=head;
 // Dark face opening, rounded shell, ear holes, chinstrap and a real cage.
 sphere(mesh,p,[x,y-.8,z-.4],[4.4,4.2,4.2],skin,14,8);
 sphere(mesh,p,[x,y+.7,z+1.0],[5.55,5.6,5.2],kit.helmet,20,10);
 quad([x-4,y-2,z-4.05],[x-4,y+2.5,z-4.05],[x+4,y+2.5,z-4.05],[x+4,y-2,z-4.05],'#29363a');
 for(const side of [-1,1]){
  sphere(mesh,p,[x+side*5.1,y-.2,z+.5],[.48,1.1,1.35],'#bfc7c4',10,6);
  limb(mesh,p,[x+side*4.6,y-1,z-3.1],[x+side*4.2,y-4.2,z-5.0],.34,.34,kit.mask,6);
  limb(mesh,p,[x+side*4.6,y-.1,z-3.4],[x+side*4.7,y-.5,z-7.0],.4,.4,kit.mask,6);
  limb(mesh,p,[x+side*4.7,y-.5,z-7.0],[x+side*3.6,y-4.2,z-6.3],.38,.38,kit.mask,6);
 }
 for(const offset of [-.4,-2.9])limb(mesh,p,[x-4.5,y+offset,z-6.8],[x+4.5,y+offset,z-6.8],.36,.36,kit.mask,6);
 for(const dx of [-2.5,2.5])limb(mesh,p,[x+dx,y-.4,z-6.9],[x+dx,y-3.4,z-6.9],.32,.32,kit.mask,6);
 sphere(mesh,p,[x,y-4.1,z-5.4],[1.7,.65,.6],kit.helmet,10,5);
 // Crown stripe follows the shell instead of floating above a box head.
 for(let i=0;i<12;i++){
  const a=-.7+i/12*2.55,b=-.7+(i+1)/12*2.55;
  const at=(theta,dx)=>p(x+dx,y+.7+Math.sin(theta)*5.68,z+1-Math.cos(theta)*5.29);
  mesh.quad(at(a,-.7),at(a,.7),at(b,.7),at(b,-.7),kit.stripe);
 }
}

export function footballPlayerPose(player){
 const crouch=['block','rush','ready'].includes(player.pose),running=player.pose==='run',throwing=player.pose==='throw';
 const hip=[0,crouch?17.5:20,2],chest=[0,crouch?25:29,crouch?-3:0],head=[0,crouch?33:39,crouch?-6:-.7];
 const legs=[-1,1].map(side=>({hip:[side*3.7,hip[1],hip[2]],knee:[side*(crouch?7:5),10,side*(running?8:throwing?5:2)-1],foot:[side*(crouch?10:7),2,side*(running?13:throwing?9:4)-3]}));
 const arms=[-1,1].map(side=>{
  const shoulder=[side*8.3,chest[1]+2,chest[2]];
  if(throwing)return {shoulder,elbow:side===1?[13,36,7]:[-12,32,-7],hand:side===1?[9,45,5]:[-5,35,-14]};
  if(player.pose==='block'||player.pose==='rush')return {shoulder,elbow:[side*11,chest[1]-1,-10],hand:[side*7,chest[1]+2,-17]};
  if(running)return {shoulder,elbow:[side*10,chest[1]-5,side*8],hand:[side*7,chest[1]-1,side*13]};
  return {shoulder,elbow:[side*11,chest[1]-6,-5],hand:[side*12,chest[1]-9,-11]};
 });return {hip,chest,head,legs,arms};
}
function player(mesh,field,definition,index){
 const kit=palette[definition.team],skin=['#b8815d','#d6a27a','#8b5b43','#78503a'][index%4];
 const yaw=(definition.team==='texas'?Math.PI/2:-Math.PI/2)+(definition.yaw||0),cs=Math.cos(yaw),sn=Math.sin(yaw),scale=1.12;
 const p=(x,y,z)=>field.p(definition.x+scale*(cs*x-sn*z),scale*y,definition.z+scale*(sn*x+cs*z));
 const quad=(a,b,c,d,color)=>mesh.quad(p(...a),p(...b),p(...c),p(...d),color);
 const box=(x,y,z,w,h,d,color)=>{const center=p(x,y,z);mesh.box(...center,w*scale,h*scale,d*scale,color,field.angle+yaw);};
 const pose=footballPlayerPose(definition),{hip,chest,head,legs,arms}=pose;
 // Broad rounded pads above a tapered waist give recognizable football proportions.
 limb(mesh,p,[hip[0],hip[1],hip[2]],[chest[0],chest[1],chest[2]],5.9,7.7,kit.jersey,12);
 for(const side of [-1,1])sphere(mesh,p,[side*6.9,chest[1]+1.5,chest[2]],[4.5,4,5.2],kit.jersey,12,7);
 sphere(mesh,p,[0,hip[1]-2,hip[2]],[6.6,4.2,4.5],kit.pants,14,6);
 box(0,hip[1]-.7,hip[2],12.5,1.3,8.8,kit.stripe);
 for(const leg of legs){
  limb(mesh,p,leg.hip,leg.knee,3.7,3.05,kit.pants);
  limb(mesh,p,leg.knee,leg.foot,2.3,1.75,kit.jersey);
  sphere(mesh,p,[leg.knee[0],leg.knee[1],leg.knee[2]-.8],[2.9,3.1,2.9],kit.pants,10,6);
  box(leg.foot[0],1.8,leg.foot[2]-1.4,4.8,3.6,8.4,'#283135');
  box(leg.foot[0],.45,leg.foot[2]-1.4,5,.7,8.6,'#e3e2d7');
  for(const dx of [-1.5,1.5])box(leg.foot[0]+dx,.1,leg.foot[2]-3,1.1,.7,1.1,'#353737');
 }
 for(const arm of arms){
  limb(mesh,p,arm.shoulder,arm.elbow,3.0,2.65,kit.jersey);
  limb(mesh,p,arm.elbow,arm.hand,2.2,1.5,skin);
  sphere(mesh,p,arm.elbow,[2.45,2.45,2.45],kit.jersey,10,6);
  sphere(mesh,p,arm.hand,[1.9,2.4,1.7],definition.pose==='throw'?skin:kit.pants,10,6);
 }
 limb(mesh,p,[0,chest[1]+3,chest[2]],[0,head[1]-4,head[2]],2.2,2.1,skin);
 helmet(mesh,p,quad,head,kit,skin);
 numberQuads(quad,definition.number,0,chest[1]-.4,chest[2]-7.5,8.7,kit.number);
 // Back numerals face away from the chest; shoulder stripes remain visible in profile.
 const back=(a,b,c,d,color)=>quad(...[a,b,c,d].map(v=>[-v[0],v[1],2*chest[2]-v[2]]),color);
 numberQuads(back,definition.number,0,chest[1]-.4,chest[2]-7.8,8.7,kit.number);
 for(const side of [-1,1])box(side*8.6,chest[1]+2,chest[2],1.1,4.6,9.2,kit.number);
 if(definition.pose==='throw'){
  const hand=arms[1].hand; sphere(mesh,p,[hand[0],hand[1]+.9,hand[2]+1],[3.2,3.15,6.1],'#8a482a',18,10);
  limb(mesh,p,[hand[0],hand[1]+4.0,hand[2]-2.3],[hand[0],hand[1]+4.0,hand[2]+4.2],.24,.24,'#f1e4cc',6);
  for(let dz=-1.5;dz<=3.4;dz+=1.25)limb(mesh,p,[hand[0]-1.2,hand[1]+4.0,hand[2]+dz],[hand[0]+1.2,hand[1]+4.0,hand[2]+dz],.22,.22,'#f1e4cc',6);
 }
}

function groundWord(f,text,x,z,height,width,rotation=0,color='#eceadd'){
 const cs=Math.cos(rotation),sn=Math.sin(rotation),q=v=>f.p(x+cs*v[0]-sn*v[1],.41,z+sn*v[0]+cs*v[1]);
 word({quad:(a,b,c,d,c1)=>f.mesh.quad(q(a),q(b),q(c),q(d),c1,0,[0,1,0])},text,0,0,0,height,width,color,0);
}
export function addAustinFootball(mesh,item){
 const oriented=footballFrame(item),f=frame(mesh,oriented);f.angle=oriented.angle;f.mesh=mesh;
 // Occupied bodies, goalposts, bleachers and scoreboard supports are solid;
 // the playing surface, painted lines and tiny gear never create road barriers.
 const colliders=mesh.colliders;
 const ground=(a,b,c,d,color)=>mesh.quad(f.p(...a),f.p(...b),f.p(...c),f.p(...d),color,0,[0,1,0]);
 details(mesh,()=>{
  ground([-320,.18,-215],[-320,.18,215],[320,.18,215],[320,.18,-215],'#537254');
  for(let x=-300;x<300;x+=25)ground([x,.22,-150],[x,.22,150],[x+25,.22,150],[x+25,.22,-150],Math.round(x/25)%2?'#42744e':'#4a8055');
  for(const side of [-1,1])ground([side*250,.27,-150],[side*300,.27,-150],[side*300,.27,150],[side*250,.27,150],side<0?'#b94e20':'#802c38');
  for(const z of [-150,150])ground([-300,.30,z-.7],[300,.30,z-.7],[300,.30,z+.7],[-300,.30,z+.7],'#eceadd');
  for(let x=-250;x<=250;x+=25){
   ground([x-.55,.31,-150],[x+.55,.31,-150],[x+.55,.31,150],[x-.55,.31,150],'#eaeade');
   for(const z of [-88,88])for(let n=1;n<5;n++)if(x+n*5<250)ground([x+n*5-.32,.33,z-3],[x+n*5+.32,.33,z-3],[x+n*5+.32,.33,z+3],[x+n*5-.32,.33,z+3],'#eaeade');
  }
  for(let x=-200;x<=200;x+=50)for(const z of [-118,118]){
   const num=50-Math.abs(x)/5,q=(a,b,c,d,color)=>ground(...[a,b,c,d].map(v=>[x+v[0],.36,z+v[1]]),color);numberQuads(q,num,0,0,0,13,'#e9eadc');
  }
  groundWord(f,'TEXAS',-271,0,28,220,Math.PI/2);groundWord(f,'LONGHORNS',271,0,23,250,-Math.PI/2);
  // End-zone pylons and an unobtrusive chain marker make the field read as a game.
  for(const x of [-250,250])for(const z of [-149,149])f.box(x,4,z,3,8,3,'#ed7b3f');
  for(const z of [-162,162])f.box(-22,17,z,2,34,2,'#ed8543');
  AUSTIN_FOOTBALL_PLAYERS.forEach((definition,index)=>player(mesh,f,definition,index));
 });
 if(colliders)for(const definition of AUSTIN_FOOTBALL_PLAYERS){
  const p=f.p(definition.x,0,definition.z);colliders.push({id:`austin-player-${definition.team}-${definition.role}-${definition.number}`,type:'circle',x:p[0],y:p[2],radius:14,minHeight:0,maxHeight:56});
 }
 for(const end of [-1,1]){
  f.box(end*312,32,0,6,64,6,'#dbb240');
  for(const side of [-1,1])f.box(end*304,77,side*36,3.2,49,3.2,'#f3cd52');
  f.box(end*304,53,0,3.5,3.5,75,'#f3cd52');
  const a=f.p(end*312,53,0),b=f.p(end*304,53,0);beam(mesh,a,b,4,'#e5bb44');
 }
 // Four small bleacher banks flank the large elevated video board.
 for(const side of [-1,1])for(let row=0;row<5;row++){
  const z=162+row*10,y=5+row*6;f.box(side*265,y,z,85,3.5,9,'#a7b1af');
  for(const dx of [-35,35])f.box(side*265+dx,y/2,z,2,y,3,'#727e7d');
  for(let seat=-3;seat<=3;seat++)details(mesh,()=>{
   const x=side*265+seat*10;f.box(x,y+5,z,6,8,4,(row+seat)%3?'#b45827':'#e3d8bb');
   sphere(mesh,(x,y,z)=>f.p(x,y,z),[x,y+11.5,z],[2.7,2.9,2.7],(row+seat)%2?'#ad805f':'#ceab86',8,5);
  });
 }
 for(const x of [-179,179]){f.box(x,43,194,12,86,12,'#38484c');f.box(x,4,194,22,8,23,'#929d92');}
 f.box(0,158,194,464,160,8,'#27363d');f.box(0,241,194,476,7,16,'#c37137');
 details(mesh,()=>{
  for(const x of [-230,230])f.box(x,158,188.5,3,156,2,'#d29356');
  word(f,'TEXAS FOOTBALL',0,180,189.8,20,385,'#f3d49b',.35);word(f,'OU STILL SUCKS',0,132,189.8,20,386,'#fff0d1',.3);
 });
}
