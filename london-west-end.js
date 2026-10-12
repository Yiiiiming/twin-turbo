/** Architecture-inspired West End landmarks for the compact London circuit.
 * Local x runs across the frontage; local -z faces the street. All artwork is
 * native geometry, including lettering. These are game models, not survey data.
 * References: Royal Ballet & Opera history / Floral Hall; Historic England
 * listed-building entries 1066339 (Palace), 1210130 (Palladium), 1265625 (fountain).
 */
const TAU=Math.PI*2;
// Shared architectural details keep later landmarks consistent with this set.
export { frame, details, beam, word, frontDisk, arch, window, cornice, pediment, column, canopy };
export const WEST_END_LANDMARKS=Object.freeze([
  Object.freeze({kind:'royal-opera-house',label:'Royal Opera House',radius:145,width:246,depth:146,height:176}),
  Object.freeze({kind:'palace-theatre',label:'Palace Theatre',radius:128,width:218,depth:120,height:226}),
  Object.freeze({kind:'london-palladium',label:'London Palladium',radius:135,width:228,depth:136,height:167}),
  Object.freeze({kind:'piccadilly-circus',label:'Piccadilly Circus',radius:150,width:274,depth:224,height:158}),
]);
const normalize=v=>{const length=Math.hypot(...v)||1;return v.map(n=>n/length);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function frame(mesh,item){
  const angle=item.angle||0,c=Math.cos(angle),s=Math.sin(angle),base=item.elevation||0;
  const p=(x,y,z)=>[item.x+c*x-s*z,base+y,item.z+s*x+c*z];
  return {p,box:(x,y,z,w,h,d,color,glow=0)=>mesh.box(...p(x,y,z),w,h,d,color,angle,glow),
    cone:(x,y,z,r,h,color,sides=32,top=r)=>mesh.cone(...p(x,y,z),r,h,color,sides,top,angle),
    quad:(a,b,c,d,color,glow=0)=>mesh.quad(p(...a),p(...b),p(...c),p(...d),color,glow),
    tri:(a,b,c,color,glow=0)=>mesh.triangle(p(...a),p(...b),p(...c),color,glow)};
}
function details(mesh,draw){const colliders=mesh.colliders;mesh.colliders=null;try{draw();}finally{mesh.colliders=colliders;}}
function beam(mesh,a,b,width,color){
  const axis=normalize(b.map((v,i)=>v-a[i])),u=normalize(cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0])),v=cross(axis,u);
  const ring=end=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([r,t])=>end.map((n,i)=>n+(u[i]*r+v[i]*t)*width/2));
  const ra=ring(a),rb=ring(b);mesh.quad(...ra,color);mesh.quad(...rb,color);
  for(let i=0;i<4;i++)mesh.quad(ra[i],rb[i],rb[(i+1)%4],ra[(i+1)%4],color);
}
// Continuous stroke glyphs, not pixel lettering: readable architectural signs.
const glyphs={
 A:[[[0,0],[.5,1],[1,0]],[[.23,.42],[.77,.42]]],B:[[[0,0],[0,1],[.68,1],[1,.82],[1,.65],[.7,.51],[0,.51]],[[.7,.51],[1,.36],[1,.17],[.68,0],[0,0]]],
 C:[[[1,.87],[.72,1],[.25,1],[0,.76],[0,.23],[.25,0],[.72,0],[1,.13]]],D:[[[0,0],[0,1],[.62,1],[1,.72],[1,.28],[.62,0],[0,0]]],
 E:[[[1,1],[0,1],[0,0],[1,0]],[[0,.51],[.8,.51]]],F:[[[0,0],[0,1],[1,1]],[[0,.54],[.8,.54]]],
 G:[[[1,.83],[.75,1],[.25,1],[0,.75],[0,.24],[.25,0],[1,0],[1,.45],[.6,.45]]],H:[[[0,0],[0,1]],[[1,0],[1,1]],[[0,.5],[1,.5]]],
 I:[[[.1,1],[.9,1]],[[.5,1],[.5,0]],[[.1,0],[.9,0]]],J:[[[1,1],[1,.2],[.8,0],[.25,0],[0,.25]]],
 K:[[[0,0],[0,1]],[[1,1],[0,.46],[1,0]]],L:[[[0,1],[0,0],[1,0]]],M:[[[0,0],[0,1],[.5,.4],[1,1],[1,0]]],
 N:[[[0,0],[0,1],[1,0],[1,1]]],O:[[[.25,0],[0,.22],[0,.78],[.25,1],[.75,1],[1,.78],[1,.22],[.75,0],[.25,0]]],
 P:[[[0,0],[0,1],[.75,1],[1,.78],[1,.61],[.75,.45],[0,.45]]],Q:[[[.25,0],[0,.22],[0,.78],[.25,1],[.75,1],[1,.78],[1,.22],[.75,0],[.25,0]],[[.6,.24],[1,-.08]]],
 R:[[[0,0],[0,1],[.75,1],[1,.8],[1,.62],[.75,.48],[0,.48]],[[.55,.48],[1,0]]],S:[[[1,.87],[.75,1],[.25,1],[0,.8],[.07,.59],[.88,.4],[1,.2],[.75,0],[.25,0],[0,.13]]],
 T:[[[0,1],[1,1]],[[.5,1],[.5,0]]],U:[[[0,1],[0,.22],[.25,0],[.75,0],[1,.22],[1,1]]],V:[[[0,1],[.5,0],[1,1]]],
 W:[[[0,1],[.2,0],[.5,.55],[.8,0],[1,1]]],X:[[[0,1],[1,0]],[[0,0],[1,1]]],Y:[[[0,1],[.5,.53],[1,1]],[[.5,.53],[.5,0]]],Z:[[[0,1],[1,1],[0,0],[1,0]]],
};
function word(f,text,x,y,z,height,width,color,glow=.2){
  // A viewer outside the local -Z frontage sees local -X as screen right.
  const advance=width/text.length,glyphWidth=advance*.68,stroke=Math.max(.32,height*.082);
  [...text].forEach((letter,index)=>{for(const line of glyphs[letter]||[])for(let j=1;j<line.length;j++){
    const a=[x+width/2-index*advance-advance*.16-line[j-1][0]*glyphWidth,y+line[j-1][1]*height],b=[x+width/2-index*advance-advance*.16-line[j][0]*glyphWidth,y+line[j][1]*height];
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),ox=-dy/length*stroke/2,oy=dx/length*stroke/2;
    f.quad([a[0]-ox,a[1]-oy,z],[a[0]+ox,a[1]+oy,z],[b[0]+ox,b[1]+oy,z],[b[0]-ox,b[1]-oy,z],color,glow);
  }});
}
function frontDisk(f,x,y,z,r,color,glow=0,segments=40){
 for(let i=0;i<segments;i++){const a=i/segments*TAU,b=(i+1)/segments*TAU;f.tri([x,y,z],[x+Math.cos(b)*r,y+Math.sin(b)*r,z],[x+Math.cos(a)*r,y+Math.sin(a)*r,z],color,glow);}
}
function arch(f,x,bottom,z,width,height,trim,glass,glow=.07){
 const r=width/2,spring=bottom+height-r;
 f.box(x,bottom+(height-r)/2,z,width,height-r,1.3,glass,glow);
 for(let i=0;i<24;i++){
  const a=i/24*Math.PI,b=(i+1)/24*Math.PI;
  f.tri([x,spring,z-.8],[x+Math.cos(b)*r,spring+Math.sin(b)*r,z-.8],[x+Math.cos(a)*r,spring+Math.sin(a)*r,z-.8],glass,glow);
  f.quad([x+Math.cos(a)*r,spring+Math.sin(a)*r,z-1],[x+Math.cos(b)*r,spring+Math.sin(b)*r,z-1],[x+Math.cos(b)*(r+2),spring+Math.sin(b)*(r+2),z-1],[x+Math.cos(a)*(r+2),spring+Math.sin(a)*(r+2),z-1],trim);
 }
 for(const sign of [-1,1])f.box(x+sign*(r+1),bottom+(height-r)/2,z-1,2,height-r,2,trim);
 f.box(x,bottom+height*.43,z-1.7,1.1,height*.85,1,trim);f.box(x,spring-1,z-1.7,width,1.1,1,trim);
 f.box(x,bottom-1,z-1,width+5,2.4,4,trim);
}
function window(f,x,y,z,w,h,trim,glass){
 f.box(x,y,z,w+3,h+3,1.3,trim);f.box(x,y,z-.8,w,h,1,glass);
 f.box(x,y,z-1.5,.9,h,.7,trim);f.box(x,y+1,z-1.5,w,.8,.7,trim);f.box(x,y-h/2-2,z-1,w+6,2.2,4,trim);
}
function cornice(f,x,y,z,w,d,stone){
 f.box(x,y-3,z,w,3,d,stone);f.box(x,y,z,w+4,3,d+4,stone);f.box(x,y+3,z,w+7,3,d+7,stone);
}
function pediment(f,x,y,z,width,height,depth,stone,shade){
 f.tri([x-width/2,y,z],[x+width/2,y,z],[x,y+height,z],stone);
 f.tri([x-width*.39,y+4,z-.4],[x+width*.39,y+4,z-.4],[x,y+height-5,z-.4],shade);
 f.quad([x-width/2,y,z],[x,y+height,z],[x,y+height,z+depth],[x-width/2,y,z+depth],stone);
 f.quad([x,y+height,z],[x+width/2,y,z],[x+width/2,y,z+depth],[x,y+height,z+depth],stone);
 f.box(x,y,z+depth/2,width+5,4,depth+3,stone);
}
function column(f,x,bottom,z,height,r,stone,shade){
 f.box(x,bottom+2,z,r*2.8,4,r*2.8,stone);f.cone(x,bottom+4,z,r*1.25,3,stone,24,r*1.25);
 f.cone(x,bottom+7,z,r,height-15,stone,32,r*.84);
 // The fluted front and individual curled capitals survive a chase-camera view.
 for(const offset of [-.54,0,.54])f.box(x+offset*r,bottom+height*.47,z-r*.88,.42,height-20,.5,shade);
 f.cone(x,bottom+height-9,z,r*.85,5,stone,24,r*1.35);f.box(x,bottom+height-2,z,r*2.9,5,r*2.9,stone);
 for(const sign of [-1,1])frontDisk(f,x+sign*r*.85,bottom+height-5,z-r*1.1,r*.42,shade);
}
function canopy(f,x,y,z,width,depth,color,trim){
 f.box(x,y,z,width,3,depth,trim);f.box(x,y-2,z,width-3,1.3,depth-2,color,.1);
 for(let j=0;j<=8;j++)f.box(x-width/2+j*width/8,y+1,z,.75,1,depth,trim);
 f.box(x,y-6,z-depth/2,width,8,2,'#26383c');f.box(x,y-10,z-depth/2-.6,width,1.1,1,'#e3bc70',.55);
 for(let j=0;j<=10;j++)f.box(x-width/2+3+j*(width-6)/10,y-9,z-depth/2-1,1.3,1.3,1,'#f7d99c',.65);
}
function operaHouse(mesh,item){
 const f=frame(mesh,item),stone='#d9d1be',trim='#eee7d5',shade='#baae96',glass='#3a5961';
 // Pale portico and blue iron conservatory are separate, recognizable volumes.
 f.box(-34,4,0,155,8,132,'#b1aa96');f.box(-34,71,14,151,126,104,stone);
 f.box(77,4,13,91,8,112,'#b1aa96');f.box(77,51,20,84,94,89,glass);
 for(const x of [-94,-70,-46,-22,2,26]){const p=f.p(x,9,-51);mesh.cone(...p,5.6,92,stone,32,4.7);}
 details(mesh,()=>{
  cornice(f,-34,132,14,154,106,trim);f.box(-34,143,20,132,14,92,'#535e62');
  for(const y of [41,71,103])for(const x of [-91,-63,-35,-7,21])window(f,x,y,-39,13,22,trim,glass);
  f.box(-34,18,-44,146,26,2,'#39494d');for(const x of [-81,-50,-19,12])arch(f,x,8,-46,20,32,trim,'#8f9d92',.22);
  for(const x of [-94,-70,-46,-22,2,26])column(f,x,9,-51,96,5.3,trim,shade);
  cornice(f,-34,111,-50,145,27,trim);f.box(-34,123,-60,146,20,5,stone);
  word(f,'ROYAL OPERA HOUSE',-34,121,-63.1,6.3,128,'#76694f');pediment(f,-34,136,-65,153,36,29,trim,shade);
  // Three sculpted relief medallions in the pediment, one continuous border.
  for(const x of [-57,-34,-11])frontDisk(f,x,145,-65.6,3.7,'#e9dfc4');
  for(let x=-104;x<38;x+=8)f.box(x,112,-65,3,4,4,shade);
  // Floral Hall: a glazed barrel vault with fine continuous wrought-iron ribs.
  const cx=77,r=43,spring=99,front=-36,back=65;
  for(let i=0;i<40;i++){
   const a=i/40*Math.PI,b=(i+1)/40*Math.PI;
   f.quad([cx+Math.cos(a)*r,spring+Math.sin(a)*r,front],[cx+Math.cos(a)*r,spring+Math.sin(a)*r,back],[cx+Math.cos(b)*r,spring+Math.sin(b)*r,back],[cx+Math.cos(b)*r,spring+Math.sin(b)*r,front],i%5===0?'#9bb8b7':'#668b91',.06);
  }
  for(const z of [front,front+25,front+50,front+75,back])for(let i=0;i<32;i++){
   const a=i/32*Math.PI,b=(i+1)/32*Math.PI;beam(mesh,f.p(cx+Math.cos(a)*(r+.4),spring+Math.sin(a)*(r+.4),z),f.p(cx+Math.cos(b)*(r+.4),spring+Math.sin(b)*(r+.4),z),1.4,trim);
  }
  for(const x of [35,56,77,98,119])f.box(x,56,front-1,2,87,2,trim);
  for(const y of [12,39,72,98])f.box(cx,y,front-1,86,2,2,trim);
  for(const x of [45.5,66.5,87.5,108.5])arch(f,x,43,front-1,15.5,50,trim,glass);
  for(let i=0;i<12;i++){
   const a=i/12*Math.PI,b=(i+1)/12*Math.PI;
   f.tri([cx,spring,front-.8],[cx+Math.cos(b)*r,spring+Math.sin(b)*r,front-.8],[cx+Math.cos(a)*r,spring+Math.sin(a)*r,front-.8],'#547a83',.08);
   beam(mesh,f.p(cx,spring,front-1.4),f.p(cx+Math.cos(a)*r,spring+Math.sin(a)*r,front-1.4),.8,trim);
  }
  frontDisk(f,cx,99,front-1.8,7,trim);frontDisk(f,cx,99,front-2,5.5,glass);
  canopy(f,-34,37,-60,117,22,'#82a2a4','#c1b698');word(f,'COVENT GARDEN',77,21,-37.5,5.2,72,'#e5d9b4');
 });
}
function palaceTheatre(mesh,item){
 const f=frame(mesh,item),brick='#9f493c',terracotta='#c17b58',trim='#d6a077',dark='#633e36',glass='#314750',copper='#537f75';
 f.box(0,4,0,204,8,108,'#9b8d7a');f.box(0,77,8,180,146,90,brick);
 for(const x of [-88,88]){f.cone(x,8,-21,21,152,brick,8,21);}
 details(mesh,()=>{
  // Shallow concave bays, terracotta belts, banded centre gable, octagonal turrets.
  for(const x of [-58,0,58]){
   const z=x===0?-34:-40;f.box(x,81,z,50,144,10,brick);
   for(const y of [47,85,119])for(const dx of [-13,13])arch(f,x+dx,y-13,z-6,15,29,terracotta,glass);
   for(const y of [38,75,110,142])f.box(x,y,z-7,54,4,6,terracotta);
   for(const side of [-1,1])f.box(x+side*24,86,z-7,3,109,3,terracotta);
  }
  for(const x of [-88,88]){
   for(const y of [39,80,120,156])f.cone(x,y,-21,22,4,terracotta,8,22);
   for(const y of [58,98,136])arch(f,x,y-12,-42.1,15,26,terracotta,glass);
   f.cone(x,160,-21,21,10,terracotta,8,20);f.cone(x,170,-21,22,12,copper,32,20);
   f.cone(x,182,-21,20,16,copper,32,12);f.cone(x,198,-21,12,9,copper,32,4);
   f.cone(x,207,-21,4,13,'#d3b17c',24,1);f.cone(x,220,-21,1.8,6,'#d3b17c',16,0);
  }
  f.box(0,155,10,132,8,96,terracotta);pediment(f,0,159,-44,122,34,22,terracotta,brick);
  for(const y of [166,174,182])f.box(0,y,-44.5,Math.max(14,108-(y-159)*3.25),2,.8,trim);
  frontDisk(f,0,177,-45.5,7,trim);frontDisk(f,0,177,-46,4.6,dark);
  for(const x of [-41,41]){
   f.cone(x,147,6,12,29,terracotta,8,12);f.cone(x,176,6,13,9,copper,32,10);f.cone(x,185,6,10,19,copper,32,0);
  }
  // Shadowed doors and warm marquee. Large wordmark is legible at track speed.
  f.box(0,21,-42,152,27,2,'#443432');for(const x of [-61,-31,0,31,61])arch(f,x,9,-44,20,27,terracotta,'#88785d',.2);
  canopy(f,0,39,-52,166,24,'#58747d','#c79870');f.box(0,47,-49,143,17,4,'#442f35');
  word(f,'PALACE THEATRE',0,43,-51.2,8,129,'#f1d6a6',.35);
  for(const x of [-66,66]){f.box(x,91,-49,23,50,3,'#462e42');word(f,'LIVE',x,88,-50.6,6.4,19,'#edbc7d',.4);f.box(x,111,-50.6,15,1.4,1,'#d0aa79',.3);}
  for(const side of [-1,1])for(let y=45;y<=125;y+=24){f.box(side*91,y,21,1.2,13,16,glass);f.box(side*92,y-8,21,3,2,20,terracotta);}
 });
}
function palladium(mesh,item){
 const f=frame(mesh,item),stone='#ddd6c3',shade='#b7ac96',trim='#f0e8d5',glass='#334b51';
 f.box(0,4,0,223,8,119,'#aaa493');f.box(0,60,9,213,106,96,stone);
 for(const x of [-96,-72,-48,48,72,96])f.cone(x,8,-47,5.2,96,stone,32,4.4);
 details(mesh,()=>{
  cornice(f,0,113,8,214,100,trim);f.box(0,122,12,199,11,91,'#626d6c');
  for(const x of [-79,-25,25,79])arch(f,x,44,-40,24,48,trim,glass);
  for(const x of [-28,0,28])arch(f,x,9,-42,20,33,shade,'#99a495',.18);
  for(const x of [-96,-72,-48,48,72,96])column(f,x,8,-47,94,5,trim,shade);
  f.box(0,106,-48,218,17,18,stone);word(f,'LONDON PALLADIUM',0,104,-58,7.5,168,'#7b6a4e');
  cornice(f,0,121,-45,219,28,trim);pediment(f,0,127,-62,222,36,40,trim,shade);
  for(const x of [-45,0,45]){frontDisk(f,x,140,-62.5,x===0?7:5.3,trim);frontDisk(f,x,140,-63,x===0?5.2:3.7,'#78898a');}
  for(let x=-104;x<=104;x+=8)f.box(x,116,-61,3.5,4,4,shade);
  canopy(f,0,43,-56,93,21,'#648789','#b4a783');word(f,'PALLADIUM',0,33,-67,5,77,'#efd9a3',.6);
  for(const side of [-1,1]){
   f.box(side*88,25,-43,25,29,2,'#3c4656');f.box(side*88,25,-44.2,19,23,1,'#a5505c');
   word(f,'SHOW',side*88,24,-45,4.8,16,'#f0debc',.25);f.box(side*105,70,16,2,71,78,shade);
   for(const z of [-15,15,43])f.box(side*106.3,75,z,1.4,21,12,glass);
  }
 });
}
function fountain(mesh,f){
 const bronze='#657668',dark='#46574e',silver='#c6d3c8',z=-83;
 f.cone(0,0,z,28,3,'#b4b5a5',8,28);f.cone(0,3,z,24,3,'#ccd0be',8,24);f.cone(0,6,z,20,4,bronze,8,20);
 f.cone(0,10,z,17,4,bronze,32,19);f.cone(0,14,z,18,2,bronze,32,18);
 details(mesh,()=>{
  mesh.disk(...f.p(0,16.1,z),16.5,16.5,'#5d9a9b',48);
  f.cone(0,13,z,7,8,dark,24,5);f.cone(0,21,z,5,14,bronze,24,3);f.cone(0,35,z,10,3,bronze,32,11);
  f.cone(0,38,z,10,3,bronze,32,3.5);f.cone(0,41,z,3.5,7,bronze,24,2.6);
  // The winged archer balances on one leg; the bow makes the silhouette specific.
  beam(mesh,f.p(0,47,z),f.p(2.8,56,z),1.8,silver);beam(mesh,f.p(2.8,56,z),f.p(1.5,61,z),2.2,silver);
  beam(mesh,f.p(2,56,z),f.p(7.5,52,z+1),1.5,silver);beam(mesh,f.p(7.5,52,z+1),f.p(10,53,z),1.2,silver);
  beam(mesh,f.p(1.5,61,z),f.p(-1,67,z),3.4,silver);f.cone(-1,66,z,2.4,4,silver,24,1.8);
  beam(mesh,f.p(-.5,64,z),f.p(-12,63,z-.5),1.4,silver);beam(mesh,f.p(-.3,64,z),f.p(-4,59,z-4),1.2,silver);beam(mesh,f.p(-4,59,z-4),f.p(-9,63,z-1),1.1,silver);
  const wing=(sign)=>{f.tri([0,63,z+1],[sign*7,73,z+2],[sign*16,77,z+1.5],silver);f.tri([0,63,z+1],[sign*16,77,z+1.5],[sign*12,68,z+1.5],'#aebfb3');for(let i=0;i<5;i++)beam(mesh,f.p(sign*(3+i*1.2),65+i*.9,z+1.7),f.p(sign*(10+i*1.5),70+i*1.6,z+1.7),.7,silver);};wing(-1);wing(1);
  for(let i=0;i<24;i++){const a=-1.2+i/24*2.4,b=-1.2+(i+1)/24*2.4;beam(mesh,f.p(-12-Math.cos(a)*3,63+Math.sin(a)*9,z-1),f.p(-12-Math.cos(b)*3,63+Math.sin(b)*9,z-1),.65,silver);}
  beam(mesh,f.p(-13.09,54.61,z-1),f.p(-13.09,71.39,z-1),.3,silver);beam(mesh,f.p(-6,63,z-1),f.p(-22,63,z-1),.45,silver);
 });
}
function piccadilly(mesh,item){
 const f=frame(mesh,item),stone='#cfc7b0',trim='#e5dfca',dark='#28353e';
 // A convex bow frontage, built as shallow solid facets, not flat rectangles.
 const radius=200,angle=.60,p=(a,y,inset=0)=>[Math.sin(a)*(radius+inset),y,173-Math.cos(a)*(radius+inset)];
 for(let i=0;i<20;i++){
  const a=-angle+i/20*angle*2,b=-angle+(i+1)/20*angle*2,m=(a+b)/2,center=p(m,70),world=f.p(...center);
  mesh.box(world[0],world[1],world[2],(radius*(b-a))+1,140,52,stone,(item.angle||0)+m);
 }
 details(mesh,()=>{
  const face=(a,b,low,high,color,offset=28,glow=0)=>f.quad(p(a,low,offset),p(b,low,offset),p(b,high,offset),p(a,high,offset),color,glow);
  for(let i=0;i<48;i++){
   const a=-angle+i/48*angle*2,b=-angle+(i+1)/48*angle*2;
   face(a,b,35,125,dark,28);face(a,b,130,134,trim,29);face(a,b,143,148,trim,28);face(a,b,17,21,trim,28);
   f.quad(p(a,148,-26),p(b,148,-26),p(b,148,29),p(a,148,29),'#566168');
  }
  // Four deliberately composed colour fields, each with continuous graphics.
  for(const [a,b,lo,hi,color]of[[-.58,-.18,43,121,'#bc5b45'],[-.16,.19,77,121,'#386a85'],[-.16,.19,43,73,'#b58951'],[.21,.58,43,121,'#466c61']]){
   for(let i=0;i<12;i++)face(a+(b-a)*i/12,a+(b-a)*(i+1)/12,lo,hi,color,29,.38);
  }
  // Lettering follows its panel's tangent; no licensed adverts are reproduced.
  const panelWord=(text,a,y,height,width)=>{const center=p(a,y,30),q=f.p(...center),sub=frame(mesh,{x:q[0],z:q[2],angle:(item.angle||0)+a,elevation:item.elevation||0});word(sub,text,0,y,0,height,width,'#f4ecd6',.48);};
  panelWord('WEST',-.38,89,10,62);panelWord('END',-.38,73,10,48);panelWord('LIVE',.015,91,12,58);panelWord('LONDON',.015,54,7,65);panelWord('NIGHT',.395,83,9,62);
  for(const [a,y,r]of [[-.38,57,7],[.395,106,8]]){const pos=p(a,y,30.4),q=f.p(...pos),sub=frame(mesh,{x:q[0],z:q[2],angle:(item.angle||0)+a,elevation:item.elevation||0});frontDisk(sub,0,y,0,r,'#edc887',.5);frontDisk(sub,0,y,-.2,r*.58,a<0?'#bc5b45':'#466c61',.4);}
  for(let i=0;i<12;i++){
   const a=-.56+i/11*1.12,m=p(a,28,28.5),q=f.p(...m);mesh.box(q[0],q[1],q[2],11,11,1.6,'#3c5157',(item.angle||0)+a);
   const top=p(a,139,28.5),t=f.p(...top);mesh.box(t[0],t[1],t[2],4,8,2,stone,(item.angle||0)+a);
  }
  for(const a of [-.60,.60]){const v=p(a,140),q=f.p(...v);mesh.box(q[0],q[1],q[2],17,29,57,stone,(item.angle||0)+a);}
 });
 fountain(mesh,f);
}
export function addWestEndLandmark(mesh,item){
 const draw={'royal-opera-house':operaHouse,'palace-theatre':palaceTheatre,'london-palladium':palladium,'piccadilly-circus':piccadilly};
 draw[item.kind]?.(mesh,item);
}
