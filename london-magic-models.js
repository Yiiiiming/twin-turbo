import { frame, details, word } from './london-west-end.js';

// Original geometry inspired by the film silhouettes, not imported film assets.
// Castle reference: https://www.wbstudiotour.co.uk/press-office/wbstl-press-pack/
// Character/spell references: https://www.harrypotter.com/fact-file/characters
// https://www.harrypotter.com/fact-file/spells/the-killing-curse
const TAU=Math.PI*2;
const stone='#696d70',lightStone='#92918a',shade='#424d56',roof='#283449',gold='#cfa45b',window='#e6b567';
function face(f,x,y,z,w,h,color,glow=0){f.quad([x-w/2,y-h/2,z],[x-w/2,y+h/2,z],[x+w/2,y+h/2,z],[x+w/2,y-h/2,z],color,glow);}
function lancet(f,x,y,z,w,h){
 face(f,x,y,z,w+3,h+3,shade);face(f,x,y-.5,z-.3,w,h-2,window,.84);
 f.tri([x-w/2,y+h/2-1,z-.3],[x,y+h/2+w*.65,z-.3],[x+w/2,y+h/2-1,z-.3],window,.84);
 face(f,x,y,z-.5,1,h+2,shade);face(f,x,y-h*.12,z-.6,w,1,shade);
}
function hip(f,x,y,z,w,d,h){
 f.quad([x-w/2,y,z-d/2],[x-w/2,y,z+d/2],[x,y+h,z+d/2],[x,y+h,z-d/2],roof);
 f.quad([x,y+h,z-d/2],[x,y+h,z+d/2],[x+w/2,y,z+d/2],[x+w/2,y,z-d/2],roof);
 f.tri([x-w/2,y,z-d/2],[x,y+h,z-d/2],[x+w/2,y,z-d/2],roof);
 f.tri([x+w/2,y,z+d/2],[x,y+h,z+d/2],[x-w/2,y,z+d/2],roof);
}
function tower(mesh,f,x,z,r,h,top){
 f.cone(x,76,z,r,h,stone,12,r*.92);
 details(mesh,()=>{
  f.cone(x,76+h-4,z,r+4,9,lightStone,12,r+4);
  f.cone(x,76+h+5,z,r+7,top,roof,12,0);
  f.cone(x,76+h+top+5,z,2.3,10,gold,6,0);
  for(const y of [112,153,194,235,276,317])if(y<68+h)for(let j=0;j<8;j++){
   const a=(j+.5)/8*TAU,c=Math.cos(a),s=Math.sin(a),rr=r*(1-(y-76)/h*.08)+.5;
   const tangent=[-s,c],p=(dx,yy)=>f.p(x+c*rr+tangent[0]*dx,yy,z+s*rr+tangent[1]*dx);
   mesh.quad(p(-3,y-8),p(3,y-8),p(3,y+8),p(-3,y+8),window,.8);
  }
 });
}
function castle(mesh,item){
 const f=frame(mesh,item);
 // A closed rocky island with several terraces supports the whole silhouette.
 f.cone(0,0,0,261,70,'#414c56',14,217);f.cone(0,70,0,217,8,'#6b7772',14,217);
 f.box(-40,144,25,252,132,150,stone);f.box(104,116,10,116,76,126,'#737772');
 details(mesh,()=>{
  hip(f,-40,210,25,258,158,61);hip(f,104,154,10,120,132,35);
  for(let x=-145;x<=65;x+=30){
   f.box(x,145,-55,4,138,12,lightStone);lancet(f,x+13,158,-51,12,59);
  }
  for(let x=68;x<=145;x+=22)lancet(f,x,118,-54,10,36);
  f.box(-40,216,-53,264,6,8,lightStone);
  // Large rose window and a pointed entrance read from the racing approach.
  face(f,-34,111,-52,37,62,'#28363c');
  f.tri([-53,142,-52],[-34,170,-52],[-15,142,-52],'#28363c');
  for(let j=0;j<12;j++){const a=j/12*TAU,b=(j+1)/12*TAU;
   f.tri([-34,189,-52],[-34+Math.cos(a)*17,189+Math.sin(a)*17,-52],[-34+Math.cos(b)*17,189+Math.sin(b)*17,-52],j%2?'#c39567':'#6c9ba4',.65);
  }
  for(const x of [-178,174]){
   f.box(x,104,-80,43,52,67,stone);hip(f,x,130,-80,49,73,28);
  }
  // Bridge colonnade sits above its true solid piers, with open gaps.
  for(let x=-155;x<165;x+=32)f.box(x,91,-112,8,27,10,shade);
  f.box(0,108,-112,340,8,20,lightStone);hip(f,0,126,-112,347,27,15);
  word(f,'HOGWARTS',0,85,-132,17,153,gold,.6);
 });
 tower(mesh,f,-132,48,38,260,106);tower(mesh,f,26,70,46,295,116);
 tower(mesh,f,156,42,27,188,83);tower(mesh,f,-192,-28,20,150,66);
 tower(mesh,f,95,-50,20,139,64);tower(mesh,f,-74,-53,18,159,63);
}
function gate(mesh,item){
 const f=frame(mesh,item);
 for(const side of [-1,1]){
  f.box(side*107,69,0,18,138,23,stone);
  details(mesh,()=>{
   f.box(side*107,4,0,25,8,30,lightStone);f.box(side*107,139,0,23,8,28,lightStone);
   f.cone(side*107,143,0,17,32,roof,6,0);
   for(const y of [33,65,98])face(f,side*107,y,-11.9,5,14,gold,.5);
   f.box(side*107,118,-16,8,12,8,'#e8bc69',1);
  });
 }
 // The high arch clears the camera and the road; no invisible solid spans it.
 details(mesh,()=>{
  for(const side of [-1,1])f.quad([side*101,142,-10],[0,181,-10],[0,194,-10],[side*101,155,-10],shade);
  for(const side of [-1,1])f.quad([side*101,142,10],[side*101,155,10],[0,194,10],[0,181,10],stone);
  f.box(0,176,0,95,17,12,shade);
  word(f,item.index?'LONDON':'HOGWARTS',0,170,-7,10,80,gold,.65);
 });
}
function platform(mesh,item){
 const f=frame(mesh,item);
 // Separate stands keep the 160-unit duel distance visually unmistakable.
 // The space between them is genuinely open, including collision geometry.
 for(const x of [-80,80]){
  f.box(x,9,0,40,18,40,'#4c5764');f.box(x,19,0,44,2,44,'#858b89');
  details(mesh,()=>{
   f.box(x,32,18,4,24,4,shade);f.box(x,46,18,8,7,8,gold,.7);
   face(f,x,10,-20.3,24,4,gold,.35);
   for(const dx of [-11,0,11])f.quad([x+dx-.25,20.2,-21],[x+dx-.25,20.2,21],[x+dx+.25,20.2,21],[x+dx+.25,20.2,-21],'#616b70');
  });
 }
}
export function addLondonMagicScenery(mesh,items){
 for(const item of items)if(item.kind==='hogwarts-castle')castle(mesh,item);else if(item.kind==='magic-gate')gate(mesh,item);else platform(mesh,item);
}

const KIT={harry:{robe:'#242a35',lining:'#813e3f',skin:'#d1a686',hair:'#202630'},
 voldemort:{robe:'#253a36',lining:'#334e47',skin:'#c2c9bc',hair:null},
 hermione:{robe:'#2d303a',lining:'#9b4a3a',skin:'#d0a17c',hair:'#72513d'},
 deathEater:{robe:'#292d39',lining:'#414153',skin:'#b0b6bd',hair:null}};
function ellipsoid(f,x,y,z,rx,ry,rz,color,rows=5,sides=10){
 for(let row=0;row<rows;row++)for(let j=0;j<sides;j++){
  const a=row/rows*Math.PI,b=(row+1)/rows*Math.PI,u=j/sides*TAU,v=(j+1)/sides*TAU;
  const p=(t,q)=>[x+Math.sin(t)*Math.cos(q)*rx,y+Math.cos(t)*ry,z+Math.sin(t)*Math.sin(q)*rz];
  f.quad(p(a,u),p(a,v),p(b,v),p(b,u),color);
 }
}
export function addMagicCharacter(mesh,kind,part='body'){
 const f=frame(mesh,{x:0,z:0}),kit=KIT[kind];
 if(part==='arm'){
  // Pivot is the right shoulder; forearm and wand rise together in the duel.
  f.box(0,-1,-5,6,7,12,kit.robe);f.box(0,-1,-12,4,4,6,kit.skin);
  f.box(0,-1,-19.5,1.05,1.05,9,'#b19566');return;
 }
 for(const x of [-4.5,4.5])f.box(x,3,-1,6.5,6,11,'#202a2f');
 f.cone(0,6,1,12.3,26,kit.robe,10,7.3);f.cone(0,32,1,7.3,9,kit.robe,10,9.5);
 f.box(-9,28,0,5,20,6,kit.robe);f.box(-9,17,-.5,4,5,4,kit.skin);
 face(f,0,30,-7.5,4,21,kit.lining);face(f,0,38,-9,5,4,'#e1d3b8');
 ellipsoid(f,0,49,0,7.7,9.6,7,kit.skin);
 if(kit.hair){
  ellipsoid(f,0,54,1,8.3,5.5,7.8,kit.hair,3,10);
  if(kind==='hermione')for(const x of [-7,7])ellipsoid(f,x,47,2,3.7,10,5.6,kit.hair,4,8);
 }
 // Eyes, glasses and nose project beyond the curved face, not into the head.
 for(const x of [-3,3])face(f,x,50,-7.15,1.4,1.5,kind==='voldemort'?'#514c49':'#273034');
 f.box(0,47,-7.1,1.5,2,1.8,kit.skin);face(f,0,44,-6.8,3.8,.7,'#806e64');
 if(kind==='harry'){
  for(const x of [-3.4,3.4])for(let j=0;j<10;j++){
   const a=j/10*TAU,b=(j+1)/10*TAU;
   f.quad([x+Math.cos(a)*2.9,50+Math.sin(a)*2.9,-7.45],[x+Math.cos(b)*2.9,50+Math.sin(b)*2.9,-7.45],
    [x+Math.cos(b)*2.2,50+Math.sin(b)*2.2,-7.45],[x+Math.cos(a)*2.2,50+Math.sin(a)*2.2,-7.45],'#151e26');
  }
  face(f,0,50,-7.5,1.4,.8,'#151e26');
  f.tri([2,54,-6.3],[.4,52.8,-6.3],[2.3,52.4,-6.3],'#9c503d');
 } else if(kind==='deathEater'){
  face(f,0,46,-7.3,5.8,5,'#aeb5b6');face(f,0,45,-7.5,3,.7,'#37454d');
 }
 // A rear split cloak remains legible during the shoulder turn.
 f.quad([-9,38,5],[-14,8,8],[0,13,10],[0,39,7],kit.robe);
 f.quad([0,39,7],[0,13,10],[14,8,8],[9,38,5],kit.robe);
}
export function addMagicFlyingCar(mesh){
 const f=frame(mesh,{x:0,z:0});
 f.box(0,10,0,53,13,25,'#70a6bf');f.box(20,14,0,17,6,25,'#8bb5c4');
 f.box(-18,14,0,13,6,25,'#8bb5c4');f.box(-2,23,0,27,2,23,'#e0dfcf');
 for(const side of [-1,1]){
  f.quad([-15,16,side*11],[11,16,side*11],[9,22,side*10.7],[-13,22,side*10.7],'#345367');
  f.box(-2,19,side*11.4,1,7,1,'#d0d2c6');f.box(0,10,side*12.8,50,1,1,'#c0d0cf');
  f.box(27,12,side*7,1.4,4,5,'#e6eacb',1);f.box(-27,12,side*8,1.4,3,4,'#ac625d',.7);
  for(const x of [-17,17]){
   // Wheels face sideways; 3-D tires remain readable while the car banks.
   for(let j=0;j<10;j++){
    const a=j/10*TAU,b=(j+1)/10*TAU,p=q=>[x+Math.cos(q)*5.9,6+Math.sin(q)*5.9,side*13.6];
    f.tri([x,6,side*13.8],p(a),p(b),'#253139');
    f.quad(p(a),[p(a)[0],p(a)[1],side*10.3],[p(b)[0],p(b)[1],side*10.3],p(b),'#253139');
   }
   f.box(x,6,side*14,4,4,.6,'#a3b8bd');
  }
 }
 f.quad([11,16,-11],[11,16,11],[9,22,10.7],[9,22,-10.7],'#7296aa');
 f.quad([-15,16,-11],[-13,22,-10.7],[-13,22,10.7],[-15,16,11],'#4f7084');
 f.box(27,7,0,2,3,27,'#c2ccc7');f.box(-27,7,0,2,3,27,'#c2ccc7');
}
