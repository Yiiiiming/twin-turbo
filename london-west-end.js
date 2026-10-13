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
// London-only relief: exported helpers remain unchanged for other maps.
function londonPanel(f,x,y,z,w,h,color,glow=0){
 f.quad([x-w/2,y-h/2,z],[x-w/2,y+h/2,z],[x+w/2,y+h/2,z],[x+w/2,y-h/2,z],color,glow);
}
function londonStroke(f,a,b,width,color){
 const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),ox=-dy/length*width/2,oy=dx/length*width/2;
 f.quad([a[0]-ox,a[1]-oy,a[2]],[a[0]+ox,a[1]+oy,a[2]],[b[0]+ox,b[1]+oy,b[2]],[b[0]-ox,b[1]-oy,b[2]],color);
}
function londonSill(f,x,y,z,w,trim){
 londonPanel(f,x,y,z-.9,w,1.8,trim);
 f.quad([x-w/2,y+.9,z-.9],[x+w/2,y+.9,z-.9],[x+w/2-1,y+1.6,z+1],[x-w/2+1,y+1.6,z+1],'#61594e');
}
function londonWindow(f,x,y,z,w,h,trim,glass){
 londonPanel(f,x,y,z,w+3,h+3,trim);londonPanel(f,x,y,z-.18,w,h,glass);
 londonPanel(f,x-w*.26,y+1,z-.24,w*.32,h-3,'#50666b');
 for(const dx of [-w/2,0,w/2])londonPanel(f,x+dx,y,z-.4,.8,h,trim);
 for(const dy of [-h*.2,h*.22])londonPanel(f,x,y+dy,z-.4,w,.75,trim);
 londonSill(f,x,y-h/2-2,z,w+6,trim);
}
function londonArch(f,x,bottom,z,w,h,trim,glass,glow=.07){
 const r=w/2,sy=bottom+h-r;
 londonPanel(f,x,(bottom+sy)/2,z,w,sy-bottom,glass,glow);
 for(let i=0;i<16;i++){
  const a=i/16*Math.PI,b=(i+1)/16*Math.PI;
  f.tri([x,sy,z],[x+Math.cos(b)*r,sy+Math.sin(b)*r,z],[x+Math.cos(a)*r,sy+Math.sin(a)*r,z],glass,glow);
  f.quad([x+Math.cos(a)*r,sy+Math.sin(a)*r,z-.2],[x+Math.cos(b)*r,sy+Math.sin(b)*r,z-.2],[x+Math.cos(b)*(r+2),sy+Math.sin(b)*(r+2),z-.2],[x+Math.cos(a)*(r+2),sy+Math.sin(a)*(r+2),z-.2],trim);
 }
 for(const side of [-1,1])londonPanel(f,x+side*(r+1),(bottom+sy)/2,z-.3,2,sy-bottom,trim);
 londonPanel(f,x,bottom+(sy-bottom)/2,z-.4,.85,sy-bottom,trim);londonPanel(f,x,sy,z-.4,w,1,trim);
 for(let i=1;i<4;i++){const a=i/4*Math.PI;londonStroke(f,[x,sy,z-.4],[x+Math.cos(a)*r,sy+Math.sin(a)*r,z-.4],.55,trim);}
 f.quad([x-1.2,sy+r-1,z-.4],[x+1.2,sy+r-1,z-.4],[x+1.8,sy+r+2,z-.4],[x-1.8,sy+r+2,z-.4],'#c3b08b');
 londonSill(f,x,bottom-1,z,w+5,trim);
}
function londonColumn(f,x,bottom,z,h,r,trim,shade){
 // A solid shaft is already drawn by each portico. Add its bases and flutes.
 f.box(x,bottom+2,z,r*2.8,4,r*2.8,trim);f.cone(x,bottom+4,z,r*1.25,3,trim,16,r*1.25);
 f.cone(x,bottom+h-9,z,r*.85,5,trim,16,r*1.35);f.box(x,bottom+h-2,z,r*2.9,5,r*2.9,trim);
 for(const offset of [-.54,0,.54])londonPanel(f,x+offset*r,bottom+h*.47,z-r*1.05,.42,h-20,shade);
 for(const side of [-1,1]){frontDisk(f,x+side*r*.85,bottom+h-5,z-r*1.1,r*.42,shade,0,12);frontDisk(f,x+side*r*.85,bottom+h-5,z-r*1.12,r*.2,'#b48d4d',0,8);}
}
function londonCanopy(f,x,y,z,w,d,color,trim){
 f.box(x,y,z,w,3,d,trim);
 f.quad([x-w/2+1,y+1.6,z-d/2+1],[x+w/2-1,y+1.6,z-d/2+1],[x+w/2-1,y+1.6,z+d/2-1],[x-w/2+1,y+1.6,z+d/2-1],color);
 for(let j=0;j<=8;j++){const dx=x-w/2+j*w/8;f.quad([dx-.35,y+1.8,z-d/2],[dx+.35,y+1.8,z-d/2],[dx+.35,y+1.8,z+d/2],[dx-.35,y+1.8,z+d/2],trim);}
 londonPanel(f,x,y-6,z-d/2-.2,w,8,'#273638');londonPanel(f,x,y-10,z-d/2-.4,w,1.1,'#b48d4d',.4);
 for(let j=0;j<=10;j++)londonPanel(f,x-w/2+3+j*(w-6)/10,y-9,z-d/2-.5,1.3,1.3,'#f1cd85',.6);
}
function operaHouse(mesh,item){
 const f=frame(mesh,item),stone='#a29882',trim='#c3b08b',shade='#61594e',glass='#304b55';
 // Pale portico and blue iron conservatory are separate, recognizable volumes.
 f.box(-34,4,0,155,8,132,'#b1aa96');f.box(-34,71,14,151,126,104,stone);
 f.box(77,4,13,91,8,112,'#b1aa96');f.box(77,51,20,84,94,89,glass);
 for(const x of [-94,-70,-46,-22,2,26]){const p=f.p(x,9,-51);mesh.cone(...p,5.6,92,stone,32,4.7);}
 details(mesh,()=>{
  cornice(f,-34,132,14,154,106,trim);f.box(-34,143,20,132,14,92,'#535e62');
  for(const y of [41,71,103])for(const x of [-91,-63,-35,-7,21])londonWindow(f,x,y,-39,13,22,trim,glass);
  f.box(-34,18,-44,146,26,2,'#273638');for(const x of [-81,-50,-19,12])londonArch(f,x,8,-46,20,32,trim,'#576761',.15);
  for(const x of [-94,-70,-46,-22,2,26])londonColumn(f,x,9,-51,96,5.3,trim,shade);
  // Rusticated end piers and recessed joints continue behind the portico.
  for(const x of [-107,39])for(let y=39;y<126;y+=10)londonPanel(f,x,y,-39.4,5.5,7,y%20===19?'#8d826d':'#b5a17d');
  for(const y of [58,89,119])londonPanel(f,-34,y,-39.3,143,.65,shade);
  cornice(f,-34,111,-50,145,27,trim);f.box(-34,123,-60,146,20,5,stone);
  word(f,'ROYAL OPERA HOUSE',-34,121,-63.1,6.3,128,'#76694f');pediment(f,-34,136,-65,153,36,29,trim,shade);
  // Three sculpted relief medallions in the pediment, one continuous border.
  for(const x of [-57,-34,-11]){frontDisk(f,x,145,-65.6,3.7,'#d0bd96',0,20);frontDisk(f,x,145,-65.8,2.4,'#71644c',0,16);for(const side of [-1,1])londonStroke(f,[x+side*4,142,-65.8],[x+side*6,147,-65.8],.7,'#b48d4d');}
  for(let x=-104;x<38;x+=8)londonPanel(f,x,112,-67.1,3,4,shade);
  // Floral Hall: a glazed barrel vault with fine continuous wrought-iron ribs.
  const cx=77,r=43,spring=99,front=-36,back=65;
  for(let i=0;i<40;i++){
   const a=i/40*Math.PI,b=(i+1)/40*Math.PI;
   f.quad([cx+Math.cos(a)*r,spring+Math.sin(a)*r,front],[cx+Math.cos(a)*r,spring+Math.sin(a)*r,back],[cx+Math.cos(b)*r,spring+Math.sin(b)*r,back],[cx+Math.cos(b)*r,spring+Math.sin(b)*r,front],i%5===0?'#66847e':'#3d6268',.04);
  }
  for(const z of [front,front+25,front+50,front+75,back])for(let i=0;i<32;i++){
   const a=i/32*Math.PI,b=(i+1)/32*Math.PI,pa=[cx+Math.cos(a)*(r+.4),spring+Math.sin(a)*(r+.4)],pb=[cx+Math.cos(b)*(r+.4),spring+Math.sin(b)*(r+.4)];
   // Raised metal straps need a top and a radial face, not six prism faces.
   f.quad([...pa,z-.7],[...pb,z-.7],[...pb,z+.7],[...pa,z+.7],'#36584f');
   f.quad([...pa,z-.7],[...pb,z-.7],[cx+Math.cos(b)*(r+1),spring+Math.sin(b)*(r+1),z-.7],[cx+Math.cos(a)*(r+1),spring+Math.sin(a)*(r+1),z-.7],trim);
  }
  for(const x of [35,56,77,98,119])f.box(x,56,front-1,2,87,2,trim);
  for(const y of [12,39,72,98])f.box(cx,y,front-1,86,2,2,trim);
  for(const x of [45.5,66.5,87.5,108.5])londonArch(f,x,43,front-1,15.5,50,trim,glass);
  for(let i=0;i<12;i++){
   const a=i/12*Math.PI,b=(i+1)/12*Math.PI;
   f.tri([cx,spring,front-.8],[cx+Math.cos(b)*r,spring+Math.sin(b)*r,front-.8],[cx+Math.cos(a)*r,spring+Math.sin(a)*r,front-.8],'#547a83',.08);
   londonStroke(f,[cx,spring,front-1.4],[cx+Math.cos(a)*r,spring+Math.sin(a)*r,front-1.4],.8,trim);
  }
  frontDisk(f,cx,99,front-1.8,7,trim);frontDisk(f,cx,99,front-2,5.5,glass);
  londonStroke(f,[cx,99,front-2.2],[cx-2.3,101.5,front-2.2],.6,'#d3bf93');londonStroke(f,[cx,99,front-2.2],[cx+2,99,front-2.2],.6,'#d3bf93');
  for(const x of [35,56,77,98,119])for(const y of [39,72]){londonStroke(f,[x-3,y-3,front-2.1],[x+3,y+3,front-2.1],.5,'#b48d4d');londonStroke(f,[x-3,y+3,front-2.1],[x+3,y-3,front-2.1],.5,'#b48d4d');}
  londonCanopy(f,-34,37,-60,117,22,'#36584f','#b48d4d');word(f,'COVENT GARDEN',77,21,-37.5,5.2,72,'#d7c398');
 });
}
function palaceTheatre(mesh,item){
 const f=frame(mesh,item),brick='#793f35',terracotta='#a46b4d',trim='#c3a077',dark='#483a34',glass='#293f48',copper='#36584f';
 f.box(0,4,0,204,8,108,'#9b8d7a');f.box(0,77,8,180,146,90,brick);
 for(const x of [-88,88]){f.cone(x,8,-21,21,152,brick,8,21);}
 details(mesh,()=>{
  // Shallow concave bays, terracotta belts, banded centre gable, octagonal turrets.
  for(const x of [-58,0,58]){
   const z=x===0?-34:-40;f.box(x,81,z,50,144,10,brick);
   for(const y of [47,85,119])for(const dx of [-13,13])londonArch(f,x+dx,y-13,z-6,15,29,terracotta,glass);
   for(const y of [38,75,110,142])f.box(x,y,z-7,54,4,6,terracotta);
   for(const side of [-1,1])f.box(x+side*24,86,z-7,3,109,3,terracotta);
   // Moulded terracotta spandrels and keyed masonry between the window storeys.
   for(const y of [64,101,136]){
    londonPanel(f,x,y,z-5.4,43,5,dark);
    for(const dx of [-13,0,13])f.quad([x+dx-2.4,y,z-5.6],[x+dx,y+2.1,z-5.6],[x+dx+2.4,y,z-5.6],[x+dx,y-2.1,z-5.6],trim);
   }
   for(const side of [-1,1])for(let y=49;y<140;y+=9)londonPanel(f,x+side*23.9,y,z-8.7,3.2,.7,dark);
  }
  for(const x of [-88,88]){
   for(const y of [39,80,120,156])f.cone(x,y,-21,22,4,terracotta,8,22);
   for(const y of [58,98,136])londonArch(f,x,y-12,-42.1,15,26,terracotta,glass);
   f.cone(x,160,-21,21,10,terracotta,8,20);f.cone(x,170,-21,22,12,copper,32,20);
   f.cone(x,182,-21,20,16,copper,32,12);f.cone(x,198,-21,12,9,copper,32,4);
   f.cone(x,207,-21,4,13,'#d3b17c',24,1);f.cone(x,220,-21,1.8,6,'#d3b17c',16,0);
   // Copper standing seams follow each changing turret roof radius.
   for(let j=0;j<8;j++)for(const [y0,y1,r0,r1]of[[170,182,22,20],[182,198,20,12],[198,207,12,4]]){
    const a=j/8*TAU,b=a+.018;
    f.quad([x+Math.cos(a)*(r0+.15),y0,-21+Math.sin(a)*(r0+.15)],[x+Math.cos(a)*(r1+.15),y1,-21+Math.sin(a)*(r1+.15)],[x+Math.cos(b)*(r1+.15),y1,-21+Math.sin(b)*(r1+.15)],[x+Math.cos(b)*(r0+.15),y0,-21+Math.sin(b)*(r0+.15)],'#759081');
   }
  }
  f.box(0,155,10,132,8,96,terracotta);pediment(f,0,159,-44,122,34,22,terracotta,brick);
  for(const y of [166,174,182])f.box(0,y,-44.5,Math.max(14,108-(y-159)*3.25),2,.8,trim);
  frontDisk(f,0,177,-45.5,7,trim);frontDisk(f,0,177,-46,4.6,dark);
  for(const x of [-41,41]){
   f.cone(x,147,6,12,29,terracotta,8,12);f.cone(x,176,6,13,9,copper,32,10);f.cone(x,185,6,10,19,copper,32,0);
  }
  // Shadowed doors and warm marquee. Large wordmark is legible at track speed.
  f.box(0,21,-42,152,27,2,'#443432');for(const x of [-61,-31,0,31,61])londonArch(f,x,9,-44,20,27,terracotta,'#6a6050',.15);
  londonCanopy(f,0,39,-52,166,24,'#36584f','#b48d4d');f.box(0,47,-49,143,17,4,'#442f35');
  word(f,'PALACE THEATRE',0,43,-51.2,8,129,'#f1d6a6',.35);
  for(const x of [-66,66]){f.box(x,91,-49,23,50,3,'#462e42');word(f,'LIVE',x,88,-50.6,6.4,19,'#edbc7d',.4);f.box(x,111,-50.6,15,1.4,1,'#d0aa79',.3);}
  for(const side of [-1,1])for(let y=45;y<=125;y+=24){f.box(side*91,y,21,1.2,13,16,glass);f.box(side*92,y-8,21,3,2,20,terracotta);}
 });
}
function palladium(mesh,item){
 const f=frame(mesh,item),stone='#a29882',shade='#61594e',trim='#c3b08b',glass='#304650';
 f.box(0,4,0,223,8,119,'#aaa493');f.box(0,60,9,213,106,96,stone);
 for(const x of [-96,-72,-48,48,72,96])f.cone(x,8,-47,5.2,96,stone,32,4.4);
 details(mesh,()=>{
  cornice(f,0,113,8,214,100,trim);f.box(0,122,12,199,11,91,'#626d6c');
  for(const x of [-79,-25,25,79])londonArch(f,x,44,-40,24,48,trim,glass);
  for(const x of [-28,0,28])londonArch(f,x,9,-42,20,33,trim,'#62726c',.12);
  for(const x of [-96,-72,-48,48,72,96])londonColumn(f,x,8,-47,94,5,trim,shade);
  for(const x of [-103,103])for(let y=18;y<103;y+=9)londonPanel(f,x,y,-39.3,6,6,'#847b69');
  for(const y of [39,69,98])londonPanel(f,0,y,-39.3,207,.75,shade);
  f.box(0,106,-48,218,17,18,stone);word(f,'LONDON PALLADIUM',0,104,-58,7.5,168,'#7b6a4e');
  cornice(f,0,121,-45,219,28,trim);pediment(f,0,127,-62,222,36,40,trim,shade);
  for(const x of [-45,0,45]){frontDisk(f,x,140,-62.5,x===0?7:5.3,trim,0,24);frontDisk(f,x,140,-63,x===0?5.2:3.7,'#36584f',0,20);for(const sign of [-1,1])for(let j=0;j<4;j++)f.tri([x+sign*(5+j*1.6),135+j,-63.2],[x+sign*(9+j*1.4),137+j,-63.2],[x+sign*(6+j*1.6),138+j,-63.2],'#b48d4d');}
  for(let x=-104;x<=104;x+=8)londonPanel(f,x,116,-63.1,3.5,4,shade);
  for(let x=-70;x<=70;x+=20)londonPanel(f,x,121,-62.8,11,2.2,'#d1bd93');
  londonCanopy(f,0,43,-56,93,21,'#36584f','#b48d4d');word(f,'PALLADIUM',0,33,-67,5,77,'#efd9a3',.6);
  for(const side of [-1,1]){
   f.box(side*88,25,-43,25,29,2,'#3c4656');f.box(side*88,25,-44.2,19,23,1,'#a5505c');
   word(f,'SHOW',side*88,24,-45,4.8,16,'#f0debc',.25);f.box(side*105,70,16,2,71,78,shade);
   for(const z of [-15,15,43])f.box(side*106.3,75,z,1.4,21,12,glass);
  }
 });
}
function fountain(mesh,f){
 const bronze='#36584f',dark='#273638',silver='#b9c6b7',z=-83;
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
  for(let i=0;i<24;i++){const a=-1.2+i/24*2.4,b=-1.2+(i+1)/24*2.4;londonStroke(f,[-12-Math.cos(a)*3,63+Math.sin(a)*9,z-1],[-12-Math.cos(b)*3,63+Math.sin(b)*9,z-1],.65,silver);}
  londonStroke(f,[-13.09,54.61,z-1],[-13.09,71.39,z-1],.3,silver);londonStroke(f,[-6,63,z-1],[-22,63,z-1],.45,silver);
  for(let i=0;i<12;i++){const a=i/12*TAU,b=a+.08;f.quad([Math.cos(a)*7,22,z+Math.sin(a)*7],[Math.cos(a)*5,31,z+Math.sin(a)*5],[Math.cos(b)*5,31,z+Math.sin(b)*5],[Math.cos(b)*7,22,z+Math.sin(b)*7],'#8a956f');}
 });
}
function piccadilly(mesh,item){
 const f=frame(mesh,item),stone='#a29882',trim='#c3b08b',dark='#273638';
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
   const a=-.56+i/11*1.12;
   face(a-.026,a+.026,22,34,'#304b55',29.2);face(a-.025,a+.025,27,28,trim,29.4);
   face(a-.002,a+.002,22,34,trim,29.4);face(a-.026,a+.026,33.5,34.5,'#b48d4d',29.4);
   // Recessed attic coffers, gilded keys and staggered masonry joints.
   face(a-.026,a+.026,135,142,'#61594e',28.7);face(a-.008,a+.008,137,143,trim,29.1);
   face(a-.04,a+.04,10,10.6,'#776d59',28.2);face(a-.002,a+.002,1,17,'#776d59',28.3);
  }
  for(const a of [-.60,.60]){const v=p(a,140),q=f.p(...v);mesh.box(q[0],q[1],q[2],17,29,57,stone,(item.angle||0)+a);}
 });
 fountain(mesh,f);
}
export function addWestEndLandmark(mesh,item){
 const draw={'royal-opera-house':operaHouse,'palace-theatre':palaceTheatre,'london-palladium':palladium,'piccadilly-circus':piccadilly};
 draw[item.kind]?.(mesh,item);
}
