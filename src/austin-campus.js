// UT's limestone tower, four clocks and orange crown are inspired by the
// university's own history: https://news.utexas.edu/2018/10/04/whats-the-story-behind-the-tower/
// Compact game-world models, not a survey reconstruction or current renovation.
const TAU=Math.PI*2;
const colors={stone:'#d8cbb0',trim:'#eee3cc',shadow:'#b8a890',glass:'#405451',orange:'#bd571f',white:'#f0eee4',mask:'#6d7777'};
const normalize=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

function frame(mesh,item) {
  const c=Math.cos(item.angle),s=Math.sin(item.angle);
  const point=(f,y,l)=>[item.x+c*f-s*l,y,item.z+s*f+c*l];
  const box=(f,y,l,w,h,d,color,emission=0)=>mesh.box(...point(f,y,l),w,h,d,color,item.angle,emission);
  const quad=(a,b,c,d,color)=>mesh.quad(point(...a),point(...b),point(...c),point(...d),color);
  return {point,box,quad};
}

/** A closed prism, with the same height-aware collider convention as the renderer. */
function beam(mesh,a,b,width,color) {
  const axis=normalize(b.map((v,i)=>v-a[i]));
  const u=normalize(cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0])),v=cross(axis,u);
  const p=(end,s,t)=>end.map((n,i)=>n+(u[i]*s+v[i]*t)*width/2);
  const ring=end=>[p(end,-1,-1),p(end,1,-1),p(end,1,1),p(end,-1,1)],ra=ring(a),rb=ring(b);
  mesh.quad(...ra,color);mesh.quad(...rb,color);
  for(let i=0;i<4;i++)mesh.quad(ra[i],rb[i],rb[(i+1)%4],ra[(i+1)%4],color);
  if(mesh.colliders)mesh.colliders.push({id:`prop-${mesh.colliders.length}`,type:'box',
    x:(a[0]+b[0])/2,y:(a[2]+b[2])/2,halfWidth:(Math.hypot(b[0]-a[0],b[2]-a[2])+width)/2,
    halfDepth:width/2,angle:Math.atan2(b[2]-a[2],b[0]-a[0]),minHeight:Math.min(a[1],b[1])-width/2,maxHeight:Math.max(a[1],b[1])+width/2});
}

function faceDisk(mesh,center,right,normal,radius,color,sides=48) {
  const point=a=>center.map((n,i)=>n+right[i]*Math.cos(a)*radius+(i===1?Math.sin(a)*radius:0));
  for(let i=0;i<sides;i++)mesh.triangle(center,point(i/sides*TAU),point((i+1)/sides*TAU),color,.08,normal);
}

function universityTower(mesh,item) {
  const {box,point}=frame(mesh,item),{stone,trim,shadow,glass,orange}=colors;
  // A low, broad library podium and setbacks distinguish this from Big Ben.
  box(0,3,0,104,6,82,shadow);box(0,12,0,96,18,76,stone);box(0,22,0,100,4,80,trim);
  for(const f of [-1,1]){
    box(f*36,28,0,25,12,58,stone);box(f*36,35,0,27,3,60,'#a7684b');
  }
  for(const l of [-1,1])for(const x of [-42,-30,30,42])box(x,13,l*38.4,6,11,1,glass);
  box(0,124,0,42,202,42,stone);box(0,36,0,50,12,50,trim);
  for(const f of [-1,1])for(const l of [-1,1])box(f*20.3,134,l*20.3,3.8,192,3.8,trim);
  // Deep vertical reveals, grouped windows and horizontal stone joints.
  for(const side of [-1,1])for(const column of [-12,0,12]){
    box(column,133,side*21.3,6,173,.8,shadow);box(side*21.3,133,column,.8,173,6,shadow);
    for(let y=52;y<=207;y+=14){box(column,y,side*21.9,4.2,8.5,.7,glass);box(side*21.9,y,column,.7,8.5,4.2,glass);}
  }
  for(const y of [46,89,132,175,218])box(0,y,0,45,2.2,45,trim);
  box(0,225,0,50,7,50,trim);box(0,245,0,45,35,45,stone);
  for(const faceAngle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const a=item.angle+faceAngle,normal=[Math.cos(a),0,Math.sin(a)],right=[-Math.sin(a),0,Math.cos(a)];
    const center=[item.x+normal[0]*22.8,246,item.z+normal[2]*22.8];
    faceDisk(mesh,center,right,normal,13,'#b99a53');
    const front=center.map((n,i)=>n+normal[i]*.2);faceDisk(mesh,front,right,normal,11.6,'#f4ecd8');
    for(let tick=0;tick<12;tick++){
      const t=tick/12*TAU,p=r=>front.map((n,i)=>n+right[i]*Math.sin(t)*r+(i===1?Math.cos(t)*r:0)+normal[i]*.25);
      beam(mesh,p(9.2),p(10.6),tick%3===0?.85:.48,'#33413f');
    }
    for(const [theta,length]of [[-Math.PI/3,5.5],[Math.PI/2,8.7]]){
      const a=front.map((n,i)=>n+normal[i]*.65),b=a.map((n,i)=>n+right[i]*Math.sin(theta)*length+(i===1?Math.cos(theta)*length:0));beam(mesh,a,b,1.1,'#263330');
    }
  }
  box(0,265,0,54,6,54,trim);box(0,271,0,49,6,49,shadow);
  box(0,280,0,33,17,33,orange,.15);
  for(const side of [-1,1])for(const f of [-20,-10,0,10,20]){
    box(f,279,side*20,3.5,15,3.5,trim);if(Math.abs(f)!==20)box(side*20,279,f,3.5,15,3.5,trim);
  }
  box(0,289,0,50,5,50,trim);box(0,294,0,44,5,44,orange,.18);
  box(0,299,0,38,5,38,'#a6532b',.1);box(0,303.5,0,30,4,30,trim);
  // Four entrance pilasters and a stone porch remain solid at car height.
  for(const f of [-16,-5,5,16])box(f,11,-40,3.6,16,3.2,trim);
  box(0,20,-40,41,4,4,trim);
}

// A small smooth ellipsoid for helmets, hands and the pointed football.
function ellipsoid(mesh,point,center,radii,color,angle=0) {
  const p=(latitude,longitude)=>point(center[0]+Math.cos(latitude)*Math.cos(longitude)*radii[0],
    center[1]+Math.sin(latitude)*radii[1],center[2]+Math.cos(latitude)*Math.sin(longitude)*radii[2]);
  const rings=8,sides=16;
  for(let row=0;row<rings;row++)for(let col=0;col<sides;col++){
    const a=-Math.PI/2+row/rings*Math.PI,b=-Math.PI/2+(row+1)/rings*Math.PI,t=col/sides*TAU,u=(col+1)/sides*TAU;
    if(row===0)mesh.triangle(p(a,t),p(b,u),p(b,t),color);
    else if(row===rings-1)mesh.triangle(p(a,t),p(a,u),p(b,t),color);
    else mesh.quad(p(a,t),p(a,u),p(b,u),p(b,t),color);
  }
  if(mesh.colliders){const c=point(...center);mesh.colliders.push({id:`prop-${mesh.colliders.length}`,type:'box',x:c[0],y:c[2],
    halfWidth:radii[0],halfDepth:radii[2],angle,minHeight:c[1]-radii[1],maxHeight:c[1]+radii[1]});}
}

const digitSegments=['abcedf','bc','abged','abgcd','fgbc','afgcd','afgecd','abc','abcdefg','abfgcd'];
function jerseyNumber(quad,number,x,y,z) {
  const digits=String(number),width=digits.length===1?3.8:3.1;
  const segments={a:[0,3,width,.8],b:[width/2,1.5,.65,2.5],c:[width/2,-1.5,.65,2.5],d:[0,-3,width,.8],e:[-width/2,-1.5,.65,2.5],f:[-width/2,1.5,.65,2.5],g:[0,0,width,.8]};
  for(let i=0;i<digits.length;i++)for(const key of digitSegments[Number(digits[i])]){
    const [dx,dy,w,h]=segments[key],cx=x+(i-(digits.length-1)/2)*4.4+dx,cy=y+dy;
    quad([cx-w/2,cy-h/2,z],[cx+w/2,cy-h/2,z],[cx+w/2,cy+h/2,z],[cx-w/2,cy+h/2,z],colors.white);
  }
}

function footballPlayer(mesh,base,offset,index) {
  const {point,box,quad}=base,[f,l]=offset,skin=['#b17c56','#d3a17a','#8b6048'][index%3];
  const p=(x,y,z)=>point(f+x,y,l+z),b=(x,y,z,w,h,d,c)=>box(f+x,y,l+z,w,h,d,c);
  const q=(a,b,c,d,color)=>quad([a[0]+f,a[1],a[2]+l],[b[0]+f,b[1],b[2]+l],[c[0]+f,c[1],c[2]+l],[d[0]+f,d[1],d[2]+l],color);
  for(const side of [-1,1]){
    const foot=side*(index%3===0?5.5:4),knee=side*4.2;
    b(foot,2.1,-1,5,4.2,9,'#2c3332');beam(mesh,p(foot,4,0),p(knee,10,0),3.5,colors.orange);
    beam(mesh,p(knee,10,0),p(side*3.6,20,1.5),5.2,colors.white);
    b(side*5.8,16,1.2,1.1,8,4.8,colors.orange);
  }
  b(0,19.8,1,12,3.5,8,colors.white);b(0,25.2,0,12.3,10.5,8.3,colors.orange);
  b(0,30.4,0,17,5.5,9,colors.orange);b(0,19,-3.4,12,1,1,'#a2461e');
  for(const side of [-1,1])b(side*7.4,30.6,-.2,1.2,3.6,9.3,colors.white);
  b(0,34,0,4.5,3,4.5,skin);
  ellipsoid(mesh,p,[0,38.8,0],[5.6,5.4,5.9],colors.white,base.angle);
  b(0,43.5,-.2,1.3,.7,7.8,colors.orange);b(0,37,-5.1,7.5,4.5,1,'#363d3b');
  for(const y of [35.5,37.5])b(0,y,-6.3,9,.7,.7,colors.mask);
  for(const x of [-4,0,4])b(x,36.4,-6.4,.7,3,.7,colors.mask);
  for(const side of [-1,1]){
    const raised=(index%4===0&&side===-1)||(index===7&&side===1);
    const elbow=[side*(raised?11:10),raised?38:25,raised?-1:-2];
    const hand=[side*(raised?12:9),raised?47:20,raised?-2:-5];
    beam(mesh,p(side*7.4,30,0),p(...elbow),4.7,colors.orange);
    beam(mesh,p(...elbow),p(...hand),3.2,skin);ellipsoid(mesh,p,hand,[2,2.2,2],skin,base.angle);
  }
  jerseyNumber(q,[1,7,11,21,32,5,8,24,44,62,90][index],0,25,-4.25);
  if(index===2){
    ellipsoid(mesh,p,[8,25,-8],[6.7,3.1,3.1],'#81462b',base.angle);
    b(8,27.8,-8,7,.45,.7,colors.white);for(const x of [5.5,7.2,8.8,10.5])b(x,27.9,-8,.45,.4,2.2,colors.white);
  }
}

function footballTeam(mesh,item) {
  const base=frame(mesh,item);base.angle=item.angle;
  const {quad}=base;
  // Ground markings are visual quads: no curb or invisible collision slab.
  quad([-90,.2,-47.5],[90,.2,-47.5],[90,.2,47.5],[-90,.2,47.5],'#537456');
  for(let f=-90;f<90;f+=30)quad([f,.22,-47.5],[f+15,.22,-47.5],[f+15,.22,47.5],[f,.22,47.5],'#597d5b');
  for(const l of [-45,45])quad([-88,.28,l-.55],[88,.28,l-.55],[88,.28,l+.55],[-88,.28,l+.55],colors.white);
  for(let f=-75;f<=75;f+=30){
    quad([f-.5,.29,-45],[f+.5,.29,-45],[f+.5,.29,45],[f-.5,.29,45],colors.white);
    for(const l of [-29,29])for(let step=1;step<5;step++)if(f+step*6<88)quad([f+step*6-.35,.3,l-2],[f+step*6+.35,.3,l-2],[f+step*6+.35,.3,l+2],[f+step*6-.35,.3,l+2],colors.white);
  }
  const formation=[[-60,-19],[-30,-19],[0,-19],[30,-19],[60,-19],[-45,16],[-15,16],[15,16],[45,16],[-72,23],[72,23]];
  formation.forEach((offset,index)=>footballPlayer(mesh,base,offset,index));
}

export function addAustinCampus(mesh,item) {
  if(item.kind==='ut-tower')universityTower(mesh,item);
  else if(item.kind==='football-team')footballTeam(mesh,item);
}
