import * as THREE from './vendor/three.module.js';

// Metric architectural studies, based on the official references in assets/.
// Origin: ground-level footprint centre. The principal facade faces local +Z.
const PI = Math.PI;
const materials = {};
const surface = (name, color, roughness = .78, metalness = 0, extra = {}) =>
  materials[name] ||= new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const M = {
  stone: surface('portland-stone', '#d1c7b5'), light: surface('limestone-trim', '#e4ddcb'),
  shadow: surface('recessed-masonry', '#a39783'), sandstone: surface('anston-stone', '#baa681'),
  brick: surface('london-red-brick', '#855449'), darkBrick: surface('soho-brick', '#66584e'),
  roof: surface('slate-roof', '#485052', .6), lead: surface('weathered-lead', '#737c78', .54, .2),
  copper: surface('aged-copper', '#667e76', .6, .35), iron: surface('wrought-iron', '#182127', .45, .65),
  gold: surface('gilded-detail', '#c59b42', .28, .78), white: surface('painted-steel', '#e4e8e7', .43, .4),
  glass: surface('dark-window-glass', '#263d43', .23, .55), litGlass: surface('warm-foyer-glass', '#787760', .25, .3, { emissive:'#827455', emissiveIntensity:.18 }),
  red: surface('vermilion-columns', '#a52625', .53), green: surface('glazed-roof-tiles', '#205d53', .4),
  blue: surface('enamel-blue', '#153d62', .42), bronze: surface('patinated-bronze', '#44594f', .6, .5),
  water: surface('memorial-water', '#839e9b', .15, .38), bulb: surface('marquee-bulbs', '#ffdf99', .25, 0, { emissive:'#ffcc78', emissiveIntensity:.75 }),
};
const geometries = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 32, 16),
  detailSphere: new THREE.SphereGeometry(1, 16, 10),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 32),
  cone: new THREE.ConeGeometry(1, 1, 32),
  baluster: new THREE.LatheGeometry([[.13,0],[.15,.08],[.1,.2],[.09,.3],[.17,.5],[.17,.6],[.09,.78],[.1,.91],[.15,1]].map(p=>new THREE.Vector2(...p)),16),
};
const textures = new Map();
function mesh(group, geometry, material, x=0, y=0, z=0, sx=1, sy=1, sz=1) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(x, y, z); item.scale.set(sx, sy, sz);
  item.castShadow = true; item.receiveShadow = true; group.add(item); return item;
}
const box = (g,x,y,z,w,h,d,m=M.stone) => mesh(g,geometries.box,m,x,y,z,w,h,d);
const sphere = (g,x,y,z,rx,ry,rz,m=M.stone) => mesh(g,geometries.sphere,m,x,y,z,rx,ry,rz);
const cylinder = (g,x,y,z,r,h,m=M.stone) => mesh(g,geometries.cylinder,m,x,y,z,r,h,r);
function tube(g,points,r,m=M.iron) {
  const curve = new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  return mesh(g,new THREE.TubeGeometry(curve,Math.max(16,Math.min(96,points.length*2)),r,8,false),m);
}
function beam(g,a,b,r,m=M.iron) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta=end.clone().sub(start);
  const item=cylinder(g,0,0,0,r,delta.length(),m);
  item.position.copy(start.add(end).multiplyScalar(.5));
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return item;
}
function ring(g,x,y,z,r,t,m=M.stone,rotation=0) {
  const item=mesh(g,new THREE.TorusGeometry(r,t,12,64),m,x,y,z);item.rotation.x=rotation;return item;
}
function groupAt(g,x=0,y=0,z=0,rotation=0) {
  const child=new THREE.Group();child.position.set(x,y,z);child.rotation.y=rotation;g.add(child);return child;
}
function plaque(g,text,x,y,z,w,h,{bg='#172637',fg='#f2dfae',font='Georgia',size=66,border=true}={}) {
  // A horizontal canopy sign and a tall poster must never share a stretched map.
  const key=[text,bg,fg,font,size,(w/h).toFixed(4),border].join('|');
  let material=textures.get(key);
  if(!material) {
    material=new THREE.MeshStandardMaterial({color:bg,roughness:.55});
    if(typeof document!=='undefined') {
      const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=Math.min(2048,Math.max(256,Math.round(1536*h/w)));
      const ctx=canvas.getContext?.('2d');
      if(ctx?.fillText) {
        const cw=canvas.width,ch=canvas.height,poster=w/h<2.3;
        ctx.fillStyle=bg;ctx.fillRect(0,0,cw,ch);
        if(border){ctx.strokeStyle=fg;ctx.lineWidth=3;ctx.strokeRect(13,13,cw-26,ch-26);}
        const lines=[];let line='';
        if(text.includes('\n'))lines.push(...text.split('\n'));
        else{for(const word of text.split(' ')){if(poster&&line.length+word.length>13){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);}
        const fontSize=Math.min(cw*.83/(Math.max(...lines.map(v=>v.length))*.61),ch*.63/(lines.length*1.25));
        ctx.font=`600 ${fontSize}px ${font}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=fg;
        lines.forEach((value,index)=>ctx.fillText(value,cw/2,ch/2+(index-(lines.length-1)/2)*fontSize*1.25,cw*.9));
        if(poster&&border){ctx.lineWidth=2;for(const y of [ch*.17,ch*.83]){ctx.beginPath();ctx.moveTo(cw*.23,y);ctx.lineTo(cw*.77,y);ctx.stroke();}}
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
        material.map=texture;material.color.set('#ffffff');material.emissive.set('#ffffff');material.emissiveMap=texture;material.emissiveIntensity=.12;
      }
    }
    textures.set(key,material);
  }
  if(border)box(g,x,y,z-.11,w+.18,h+.18,.25,M.iron);
  const item=mesh(g,new THREE.PlaneGeometry(w,h),material,x,y,z+.025);item.userData.label=text;return item;
}
function unionFlag(g,x,y,z,w=4.1,h=2.05){
  const flag=groupAt(g,x,y,z), white=surface('flag-white','#f7f5ee',.92,0,{side:THREE.DoubleSide}),red=surface('flag-red','#ba263a',.92,0,{side:THREE.DoubleSide});
  // Model the national flag directly. Its cloth remains visible on either face.
  const flagBlue=surface('flag-blue','#16254b',.92,0,{side:THREE.DoubleSide});
  const cloth=new THREE.PlaneGeometry(w,h);mesh(flag,cloth,flagBlue,w/2,0,0);
  const polygon=(points,m,offset)=>{
    const shape=new THREE.Shape(points.map(([px,py])=>new THREE.Vector2(px*w,py*h))),geo=new THREE.ShapeGeometry(shape,1),pos=geo.attributes.position;
    for(let i=0;i<pos.count;i++)pos.setZ(i,offset);
    geo.computeVertexNormals();mesh(flag,geo,m);
    // The reverse side receives the same fabric colors, behind the blue cloth.
    const reverse=geo.clone();for(let i=0;i<reverse.attributes.position.count;i++)reverse.attributes.position.setZ(i,reverse.attributes.position.getZ(i)-offset*2);mesh(flag,reverse,m);
  };
  polygon([[0,.5],[.08,.5],[1,-.42],[1,-.5],[.92,-.5],[0,.42]],white,.002);
  polygon([[0,-.5],[.08,-.5],[1,.42],[1,.5],[.92,.5],[0,-.42]],white,.002);
  // Counterchanged diagonal cross, rather than a symmetrical red X.
  polygon([[0,.5],[.04,.5],[.5,.04],[.5,0]],red,.004);
  polygon([[.5,0],[.5,-.04],[.96,-.5],[1,-.5]],red,.004);
  polygon([[0,-.5],[.04,-.5],[.5,-.04],[.5,0]],red,.004);
  polygon([[.5,0],[.5,.04],[.96,.5],[1,.5]],red,.004);
  polygon([[.4,-.5],[.6,-.5],[.6,.5],[.4,.5]],white,.006);
  polygon([[0,-.17],[1,-.17],[1,.17],[0,.17]],white,.006);
  polygon([[.44,-.5],[.56,-.5],[.56,.5],[.44,.5]],red,.008);
  polygon([[0,-.10],[1,-.10],[1,.10],[0,.10]],red,.008);
}
function windowFrame(g,x,y,z,w,h,{arched=false,lit=false,m=M.light,frame=.14,mullions=true}={}) {
  const glass=lit?M.litGlass:M.glass;
  if(arched) {
    const spring=h-w/2, shape=new THREE.Shape();
    shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(w/2,spring);
    shape.absarc(0,spring,w/2,0,PI,false);shape.lineTo(-w/2,0);
    mesh(g,new THREE.ShapeGeometry(shape,32),glass,x,y-h/2,z+.035);
    const pts=[];for(let i=0;i<=32;i++){const a=i/32*PI;pts.push([x+Math.cos(a)*(w/2+frame/2),y-h/2+spring+Math.sin(a)*(w/2+frame/2),z+.12]);}
    tube(g,pts,frame/2,m);
    box(g,x-w/2-frame/2,y-h/2+spring/2,z+.13,frame,spring,.28,m);
    box(g,x+w/2+frame/2,y-h/2+spring/2,z+.13,frame,spring,.28,m);
  } else {
    box(g,x,y,z-.02,w,h,.12,glass);
    box(g,x-w/2-frame/2,y,z+.12,frame,h+.28,.28,m);box(g,x+w/2+frame/2,y,z+.12,frame,h+.28,.28,m);
    box(g,x,y+h/2+frame/2,z+.12,w+.32,frame,.28,m);
  }
  box(g,x,y-h/2-.1,z+.18,w+.45,.2,.45,m);
  if(mullions){box(g,x,y,z+.16,.065,h,.08,M.iron);box(g,x,y-h*.1,z+.16,w,.065,.08,M.iron);}
}
function gothicWindow(g,x,y,z,w,h,m=M.light) {
  const shape=new THREE.Shape();shape.moveTo(-w/2,-h/2);shape.lineTo(w/2,-h/2);shape.lineTo(w/2,h*.17);
  shape.quadraticCurveTo(w*.45,h*.37,0,h/2);shape.quadraticCurveTo(-w*.45,h*.37,-w/2,h*.17);shape.closePath();
  mesh(g,new THREE.ShapeGeometry(shape,24),M.glass,x,y,z+.03);
  tube(g,[[x-w/2,y-h/2,z+.13],[x-w/2,y+h*.17,z+.13],[x-w*.3,y+h*.37,z+.13],[x,y+h/2,z+.13],[x+w*.3,y+h*.37,z+.13],[x+w/2,y+h*.17,z+.13],[x+w/2,y-h/2,z+.13]],.11,m);
  for(const dx of [-w/6,w/6])box(g,x+dx,y-h*.07,z+.13,.08,h*.82,.15,m);
  box(g,x,y-h*.12,z+.13,w,.1,.15,m);
}
function column(g,x,y,z,r,h,m=M.light) {
  cylinder(g,x,y+h/2,z,r,h,m);
  cylinder(g,x,y+.18,z,r*1.34,.36,m);cylinder(g,x,y+.45,z,r*1.14,.16,m);
  cylinder(g,x,y+h-.2,z,r*1.25,.4,m);box(g,x,y+h+.05,z,r*2.85,.24,r*2.85,m);
  for(let i=0;i<8;i++){const a=i*PI/4;mesh(g,geometries.detailSphere,m,x+Math.cos(a)*r*.94,y+h-.03,z+Math.sin(a)*r*.94,r*.2,r*.28,r*.2);}
}
function cornice(g,w,y,z,d,m=M.light) {
  box(g,0,y,z,w,.32,d,m);box(g,0,y+.27,z,w+.5,.2,d+.42,m);box(g,0,y+.53,z,w+.95,.24,d+.7,m);
}
function balustrade(g,x,y,z,w,{metal=false,height=1}={}) {
  const m=metal?M.iron:M.light;
  box(g,x,y+height,z,w,.12,.17,m);box(g,x,y+.08,z,w,.1,.2,m);
  for(let dx=-w/2+.17;dx<w/2;dx+=metal?.4:.65){
    if(metal)box(g,x+dx,y+height/2,z,.045,height,.055,m);
    else mesh(g,geometries.baluster,m,x+dx,y,z,1,height,1);
  }
}
function triangularPediment(g,x,y,z,w,h,d,m=M.light) {
  const s=new THREE.Shape();s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(0,h);s.closePath();
  mesh(g,new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false}),m,x,y,z-d/2);
  beam(g,[x-w/2,y,z+d/2],[x,y+h,z+d/2],.12,m);beam(g,[x,y+h,z+d/2],[x+w/2,y,z+d/2],.12,m);
}
function urn(g,x,y,z,s=.65,m=M.light){cylinder(g,x,y+s*.22,z,s*.42,s*.4,m);sphere(g,x,y+s*.76,z,s*.53,s*.56,s*.53,m);cylinder(g,x,y+s*1.15,z,s*.6,s*.16,m);sphere(g,x,y+s*1.35,z,s*.18,s*.23,s*.18,m);}
function pin(g,x,y,z,h=4,m=M.sandstone){cylinder(g,x,y+h*.4,z,.16,h*.8,m);mesh(g,geometries.cone,m,x,y+h*.9,z,.32,h*.2,.32);}
function sculptedFigure(g,x,y,z,s=1,m=M.light) {
  const profile=[[.3,0],[.43,.35],[.35,1.3],[.26,1.55],[.22,1.9],[.12,2.05]].map(p=>new THREE.Vector2(p[0]*s,p[1]*s));
  mesh(g,new THREE.LatheGeometry(profile,32),m,x,y,z);sphere(g,x,y+2.28*s,z,.24*s,.31*s,.25*s,m);
  beam(g,[x-.2*s,y+1.7*s,z],[x-.5*s,y+.9*s,z+.13*s],.115*s,m);
  beam(g,[x+.2*s,y+1.7*s,z],[x+.5*s,y+1.0*s,z+.15*s],.115*s,m);
}
function buckingham(root) {
  // Retain the 108 × 120 m palace envelope and its open central quadrangle.
  const g=groupAt(root,0,0,42);
  for(const x of [-47,47]){box(root,x,11.5,-9,14,23,102,M.stone);cornice(groupAt(root,x),14,22.2,-9,102);}
  box(root,0,11.5,-50,108,23,20,M.stone);cornice(root,108,22.2,-50,20);
  const w=108,d=36,z=d/2;
  box(g,0,.55,0,112,1.1,40,M.shadow);box(g,0,11.5,0,w,22,36,M.stone);
  for(const x of [-46,0,46])box(g,x,12,z+.8,17,23,2.1,M.stone);
  cornice(g,w,7.5,0,d);cornice(g,w,20.8,0,d);box(g,0,23.2,0,w+1,.7,d+1,M.light);
  for(let i=-11;i<=11;i++){
    const x=i*4.6,projected=Math.abs(i)<=1||Math.abs(i)>=9,faceZ=z+(projected?1.91:.11);
    for(const [y,h]of [[3.8,3.4],[11.3,4.5],[17.4,3.4]])windowFrame(g,x,y,faceZ,2.25,h,{arched:y===3.8&&(i===0||!projected),m:M.light});
    beam(g,[x-1.5,13.8,faceZ+.32],[x,14.65,faceZ+.32],.095,M.light);beam(g,[x,14.65,faceZ+.32],[x+1.5,13.8,faceZ+.32],.095,M.light);
    box(g,x,22.1,z+.35,2,.65,.4,M.shadow);
  }
  for(let i=-12;i<=11;i++){
    const x=(i+.5)*4.6,projected=Math.abs(x)<8.5||Math.abs(x)>37.5;
    if(projected)column(g,x,8.15,z+2.05,.4,11.2);
    else{box(g,x,13.75,z+.3,.55,11.2,.5,M.light);box(g,x,19.45,z+.35,.85,.45,.7,M.light);}
  }
  balustrade(g,0,8.65,z+2.45,106,{height:1.05});
  box(g,0,8.25,z+3.0,16,.55,5,M.light);balustrade(g,0,8.65,z+5.25,16,{height:1.05});
  for(const x of [-7.7,7.7]){box(g,x,9.15,z+3.1,.4,1.1,4.6,M.light);}
  for(const x of [-46,0,46])triangularPediment(g,x,23.7,z+1.9,17,2.7,1.25);
  for(const x of [-47,-39,-11,0,11,39,47])urn(g,x,23.6,z+.5,.85);
  // Sculptural crest and shallow relief, kept geometric rather than a billboard.
  sphere(g,0,24.8,z+2.7,1.15,1.3,.35,M.light);
  for(const x of [-2.25,2.25])sculptedFigure(g,x,23.8,z+2.5,.75);
  cylinder(g,0,29.55,-1,.085,7,M.iron);unionFlag(g,.08,32,-1);
  // Stone courses and side elevations continue around the East Wing, so it is
  // still an architectural object when driven past rather than a single facade.
  for(let y=1.8;y<7.5;y+=.72)box(g,0,y,z+.035,108,.028,.02,M.shadow);
  for(const side of [-1,1]){
    const face=groupAt(g,side*54,0,0,side*PI/2);
    for(let x=-14;x<=14;x+=5.6)for(const [y,h]of [[3.8,3.4],[11.3,4.5],[17.4,3.4]])windowFrame(face,x,y,.03,2.25,h,{arched:y===3.8});
  }
  // The forecourt gate is separate from the palace entrance.
  for(const x of [-43,-23,23,43]){box(g,x,2.7,30,1.8,5.4,2,M.light);urn(g,x,5.5,30,.65);}
  for(const [cx,width]of [[-33,18],[0,44],[33,18]]){
    balustrade(g,cx,.45,30,width,{metal:true,height:3.2});
    for(let x=cx-width/2+.35;x<cx+width/2;x+=.8){mesh(g,geometries.cone,M.gold,x,3.9,30,.12,.45,.12);}
  }
  for(const x of [-7,7]){ring(g,x,2.35,30.12,.9,.10,M.gold);box(g,x,2.35,30.16,.09,1.8,.05,M.gold);}
}
function victoria(g){
  cylinder(g,0,.28,0,15,.56,M.shadow);cylinder(g,0,.72,0,13.3,.5,M.light);cylinder(g,0,1.03,0,11.8,.2,M.water);
  cylinder(g,0,1.4,0,6.8,.9,M.light);cylinder(g,0,2.2,0,5.2,.7,M.light);box(g,0,6,0,5.1,7,5.1,M.light);
  box(g,0,10.1,0,5.7,1.25,5.7,M.light);box(g,0,12.6,0,3.8,4,3.8,M.light);cornice(g,4.2,14.5,0,4.2);
  sculptedFigure(g,0,16,0,2.3,M.gold);
  for(const side of [-1,1]){
    const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(1.3,1.5,2.5,2.1,3.5,3.3);shape.bezierCurveTo(3.1,.4,1.8,-.5,0,-.7);shape.closePath();
    const wing=mesh(g,new THREE.ExtrudeGeometry(shape,{depth:.22,bevelEnabled:true,bevelSize:.08,bevelThickness:.08,bevelSegments:2,steps:1,curveSegments:24}),M.gold,side*.35,20,0);wing.rotation.y=side<0?PI:0;
  }
  sculptedFigure(g,0,2.55,3.3,2.1,M.light);
  for(const x of [-9,9])for(const z of [-5,5]){
    box(g,x,1.9,z,3,1.4,4.8,M.light);sphere(g,x,3.2,z,1.25,.65,1.8,M.bronze);sphere(g,x,3.8,z+1.4,.72,.78,.65,M.bronze);
    for(const dx of [-.75,.75])beam(g,[x+dx,3.1,z+1],[x+dx,2.5,z+1.9],.22,M.bronze);
    sculptedFigure(g,x+.5,3.5,z-.6,1.15,M.bronze);
  }
}
function clockFace(g,y,z){
  let material=textures.get('elizabeth-clock');
  if(!material){
    material=new THREE.MeshStandardMaterial({color:'#f2ecda',roughness:.5});
    if(typeof document!=='undefined'){
      const c=document.createElement('canvas');c.width=512;c.height=512;const ctx=c.getContext?.('2d');
      if(ctx?.fillText){ctx.fillStyle='#f4efdb';ctx.fillRect(0,0,512,512);ctx.translate(256,256);ctx.strokeStyle='#c6a14b';ctx.lineWidth=10;ctx.beginPath();ctx.arc(0,0,233,0,PI*2);ctx.stroke();
        const roman=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
        ctx.fillStyle='#174874';ctx.font='bold 41px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';
        for(let i=0;i<12;i++){const a=i*PI/6;ctx.fillText(roman[i],Math.sin(a)*183,-Math.cos(a)*183);}
        ctx.strokeStyle='#224f7b';for(let i=0;i<60;i++){const a=i*PI/30;ctx.lineWidth=i%5===0?4:2;ctx.beginPath();ctx.moveTo(Math.sin(a)*212,-Math.cos(a)*212);ctx.lineTo(Math.sin(a)*226,-Math.cos(a)*226);ctx.stroke();}
        for(const [a,len,width]of [[PI/3,163,8],[-PI/3,118,12]]){ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(-Math.sin(a)*22,Math.cos(a)*22);ctx.lineTo(Math.sin(a)*len,-Math.cos(a)*len);ctx.stroke();}
        ctx.fillStyle='#b28c32';ctx.beginPath();ctx.arc(0,0,12,0,PI*2);ctx.fill();const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;material.map=texture;material.color.set('#ffffff');
      }
    }
    textures.set('elizabeth-clock',material);
  }
  mesh(g,new THREE.CircleGeometry(3.5,64),material,0,y,z);
  ring(g,0,y,z+.04,3.62,.15,M.gold);ring(g,0,y,z+.06,3.86,.15,M.sandstone);
  if(!material.map){beam(g,[0,y,z+.08],[2.5,y+1.4,z+.08],.07,M.blue);beam(g,[0,y,z+.09],[-1.6,y+1.0,z+.09],.095,M.blue);}
}
function bigBen(g){
  box(g,0,1,0,13.4,2,13.4,M.shadow);box(g,0,32,0,11.8,62,11.8,M.sandstone);
  for(const side of [0,1,2,3]){
    const face=groupAt(g,0,0,0,side*PI/2);
    for(const x of [-5.25,-4.45,4.45,5.25])box(face,x,32,6.0,.34,62,.48,M.light);
    for(const y of [9,22,35,48])for(const x of [-2.7,0,2.7])gothicWindow(face,x,y,5.96,1.4,7.3);
    for(const y of [4,16,29,42,51.8,63.0])box(face,0,y,6.05,12.5,.38,.55,M.light);
    clockFace(face,57.3,6.02);
    for(const x of [-3.1,0,3.1])gothicWindow(face,x,69.1,5.2,1.9,8.7);
    for(const x of [-5.25,5.25])pin(face,x,63,5.25,13);
  }
  box(g,0,68.8,0,10.2,11.2,10.2,M.sandstone);cornice(g,12.5,63,0,12.5);cornice(g,10.6,74.1,0,10.6);
  const roof=mesh(g,new THREE.ConeGeometry(8.15,11.8,4),M.roof,0,80.8,0);roof.rotation.y=PI/4;
  for(const x of [-5.5,5.5])for(const z of [-5.5,5.5])pin(g,x,74.7,z,7.1,M.gold);
  cylinder(g,0,87.75,0,1.7,3.6,M.sandstone);cylinder(g,0,87.7,0,1.73,.45,M.gold);
  mesh(g,new THREE.ConeGeometry(2.45,6.5,8),M.roof,0,91.25,0);
  cylinder(g,0,95.05,0,.09,2.5,M.gold);sphere(g,0,96.15,0,.15,.15,.15,M.gold);
}
function parliament(g){
  const w=255,d=58;box(g,0,1,0,w+3,2,d+2,M.shadow);box(g,0,12,0,w,23,d,M.sandstone);
  for(const side of [1,-1]){
    const face=groupAt(g,0,0,0,side===1?0:PI);
    for(let x=-121;x<=121;x+=6.7){gothicWindow(face,x,9.5,d/2+.04,3.4,9.5);gothicWindow(face,x,19.4,d/2+.04,3.4,5.4);
      box(face,x+3.2,12.8,d/2+.48,.48,24,.8,M.light);pin(face,x+3.2,25,d/2+.48,3.2);}
  }
  cornice(g,w,24,0,d);
  for(const x of [-113,-57,0,57,113]){
    box(g,x,17.5,0,10.5,35,61,M.sandstone);cornice(groupAt(g,x),11.5,34.8,0,62);
    for(const z of [-29.5,29.5])for(const dx of [-4.6,4.6])pin(g,x+dx,35.8,z,6);
  }
  for(const x of [-87,-29,29,87]){const roof=box(g,x,27,0,46,1,31,M.roof);roof.rotation.x=.17;}
  const central=groupAt(g,0,0,-10);cylinder(central,0,46,0,5.5,26,M.sandstone);mesh(central,new THREE.ConeGeometry(6,25,8),M.roof,0,71.5,0);pin(central,0,84,0,7.4,M.gold);
}
function roofSurface(g,x,y,z,w,d,rise=2){
  const nx=32,nz=16,positions=[],uv=[],indices=[];
  for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
    const u=ix/nx*2-1,v=iz/nz*2-1;
    positions.push(x+u*w/2,y+rise*(1-Math.abs(v))+.8*Math.pow(Math.abs(u),6)+.15*v*v,z+v*d/2);uv.push(ix/nx,iz/nz);
  }
  for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){const a=iz*(nx+1)+ix;indices.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  mesh(g,geometry,surface('roof-double-side','#226456',.37,0,{side:THREE.DoubleSide}));
  for(const v of [-1,1]){const pts=[];for(let i=0;i<=24;i++){const u=i/24*2-1;pts.push([x+u*w/2,y+.8*Math.pow(Math.abs(u),6)+.15,z+v*d/2]);}tube(g,pts,.1,M.gold);}
  for(let dx=-w/2+.4;dx<w/2;dx+=.48){const lift=.8*Math.pow(Math.abs(dx/(w/2)),6);tube(g,[[x+dx,y+lift+.15,z-d/2],[x+dx,y+rise*.52+lift,z-d*.24],[x+dx,y+rise+lift,z],[x+dx,y+rise*.52+lift,z+d*.24],[x+dx,y+lift+.15,z+d/2]],.045,M.green);}
}
function chinatown(g){
  for(const x of [-9,-4.7,4.7,9]){box(g,x,.5,0,1.4,1,1.4,M.light);cylinder(g,x,4.55,0,.43,8.1,M.red);cylinder(g,x,1.1,0,.52,.25,M.gold);}
  box(g,0,6.7,0,19,1.2,1.1,M.blue);box(g,0,7.5,0,19,.25,1.35,M.gold);
  box(g,0,9.4,0,10.2,1.6,1.2,M.blue);plaque(g,'倫敦華埠',0,9.4,.7,6.4,1.35,{bg:'#173859',fg:'#e6c166',font:'serif',size:100});
  for(let x=-9;x<=9;x+=.7){box(g,x,7.85,0,.34,.48,1.6,M.green);box(g,x,8.12,0,.64,.18,1.9,M.gold);}
  roofSurface(g,0,10.35,0,12.6,4.6,2.0);roofSurface(g,-7.3,8.5,0,5.2,3.6,1.4);roofSurface(g,7.3,8.5,0,5.2,3.6,1.4);roofSurface(g,0,13,0,8.4,3.4,1.55);
  for(const x of [-6.9,6.9]){
    beam(g,[x,7.2,1],[x,6.5,1],.045,M.gold);sphere(g,x,5.85,1,.48,.64,.48,M.red);cylinder(g,x,6.45,1,.22,.13,M.gold);cylinder(g,x,5.25,1,.22,.13,M.gold);beam(g,[x,5.2,1],[x,4.7,1],.05,M.gold);
    for(let i=0;i<8;i++){const a=i*PI/4;const pts=[];for(let j=0;j<=12;j++){const t=j/12*PI;pts.push([x+Math.cos(a)*Math.sin(t)*.49,5.85+Math.cos(t)*.64,1+Math.sin(a)*Math.sin(t)*.49]);}tube(g,pts,.012,M.gold);}
  }
  const reverse=groupAt(g,0,0,0,PI);plaque(reverse,'倫敦華埠',0,9.4,.7,6.4,1.35,{bg:'#173859',fg:'#e6c166',font:'serif',size:100});
  // The lintel starts 6.1 m up; collisions are the actual four pillar bases.
  g.userData.groundSolids=[-9,-4.7,4.7,9].map(x=>({x,z:0,width:1.4,depth:1.4,height:8.6}));
  g.userData.passages=[{x:0,z:0,width:8,depth:1.4,height:6.1},{x:-6.85,z:0,width:2.9,depth:1.4,height:6.1},{x:6.85,z:0,width:2.9,depth:1.4,height:6.1}];
}
function theatreBase(g,w,d,h,body=M.stone,{canopy='solid'}={}){
  box(g,0,.22,0,w+.7,.44,d+.8,M.shadow);box(g,0,h/2,0,w,h,d,body);
  g.userData.bodyBounds={minX:-w/2,maxX:w/2,minZ:-d/2,maxZ:d/2,minY:0,maxY:h};
  g.userData.groundSolids=[{x:0,z:0,width:w,depth:d,height:h}];
  cornice(g,w,h-.8,0,d);
  if(canopy==='glass'){
    const depth=2.8,width=w+.9,cz=d/2+1.15;
    const glass=surface('theatre-canopy-glass','#607b7e',.19,.45);
    // The original canopy envelope stays unchanged; close views can now read
    // individual glazed panels held by the iron perimeter and transverse ribs.
    for(const sign of [-1,1]){
      box(g,0,4.25,cz+sign*(depth/2-.075),width,.45,.15,M.iron);
      box(g,sign*(width/2-.075),4.25,cz,.15,.45,depth,M.iron);
    }
    const panels=18,pitch=(width-.3)/panels;
    for(let i=0;i<panels;i++){
      const x=-width/2+.15+(i+.5)*pitch;
      box(g,x,4.37,cz,pitch-.09,.055,depth-.3,glass);
      if(i<panels-1)box(g,x+pitch/2,4.25,cz,.075,.18,depth-.18,M.iron);
    }
    for(const x of [-12.8,-6.4,0,6.4,12.8]){
      tube(g,[[x,3.56,d/2+.26],[x,3.77,d/2+.56],[x,4.03,d/2+1.23],[x,4.04,d/2+2.36]],.035,M.iron);
    }
  }else box(g,0,4.25,d/2+1.15,w+.9,.45,2.8,M.iron);
  for(let x=-w/2+.4;x<w/2;x+=.8)sphere(g,x,4.08,d/2+2.55,.08,.055,.08,M.bulb);
}
function theatreEntrances(g,w,z,count,{arched=false,fanlight=false,doors=false,finish=M.iron}={}){
  for(let i=0;i<count;i++){
    const x=(i-(count-1)/2)*w/count,ww=Math.min(2.5,w/count*.68);
    windowFrame(g,x,1.95,z,ww,3.3,{arched,lit:true,m:finish,mullions:!doors});
    if(doors){
      const transom=arched?3.6-ww/2:2.48;
      const brass=surface('theatre-door-brass','#aa8d53',.3,.7);
      box(g,x,transom,z+.15,ww,.11,.14,finish);
      box(g,x,(transom+.31)/2,z+.15,.075,transom-.31,.14,finish);
      box(g,x,.34,z+.15,ww,.09,.14,finish);
      for(const sign of [-1,1]){
        const leafX=x+sign*ww*.25,leafWidth=ww*.5-.13;
        // A glazed upper door over a solid lower panel, with a narrow pull and
        // kick plate. All additions sit within the existing arch/window reveal.
        box(g,leafX,.72,z+.10,leafWidth,.65,.07,finish);
        box(g,leafX,.47,z+.15,leafWidth-.08,.14,.045,brass);
        box(g,leafX,1.075,z+.15,leafWidth,.065,.10,finish);
        box(g,x+sign*.13,1.34,z+.23,.027,.37,.045,brass);
        for(const y of [1.19,1.49])box(g,x+sign*.13,y,z+.195,.04,.035,.095,brass);
      }
    }
    if(fanlight){
      const cy=3.6-ww/2;
      for(let n=1;n<6;n++){const a=n*PI/6;beam(g,[x,cy,z+.2],[x+Math.cos(a)*ww*.47,cy+Math.sin(a)*ww*.47,z+.2],.025,M.iron);}
      const arc=[];for(let n=0;n<=12;n++){const a=n*PI/12;arc.push([x+Math.cos(a)*ww*.23,cy+Math.sin(a)*ww*.23,z+.205]);}tube(g,arc,.022,M.iron);
      box(g,x,cy,z+.2,ww,.05,.06,M.iron);
    }
  }
}
function squareDome(g,x,y,z,w,h){
  // Rounded French pavilion dome: curved vertical profile, square plan.
  const rows=18,cols=64,pos=[],idx=[],uv=[];
  for(let j=0;j<=rows;j++){
    const t=j/rows, r=w/2*(.29+.71*Math.cos(t*PI/2));
    for(let i=0;i<=cols;i++){const a=i/cols*PI*2,c=Math.cos(a),s=Math.sin(a);pos.push(x+Math.sign(c)*Math.pow(Math.abs(c),.36)*r,y+t*h,z+Math.sign(s)*Math.pow(Math.abs(s),.36)*r);uv.push(i/cols,t);}
  }
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const a=j*(cols+1)+i;idx.push(a,a+cols+1,a+1,a+1,a+cols+1,a+cols+2);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();mesh(g,geo,M.lead);
  for(const sx of [-1,1])for(const sz of [-1,1]){const pts=[];for(let i=0;i<=18;i++){const t=i/18,r=w/2*(.29+.71*Math.cos(t*PI/2));pts.push([x+sx*r*.883,y+t*h,z+sz*r*.883]);}tube(g,pts,.07,M.iron);}
}
function mansardRoof(g,x,y,z,w,d,h){
  const positions=[-w/2,0,-d/2,w/2,0,-d/2,w/2,0,d/2,-w/2,0,d/2,-w*.37,h,-d*.34,w*.37,h,-d*.34,w*.37,h,d*.34,-w*.37,h,d*.34];
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setIndex([0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0,4,7,6,4,6,5]);
  const flat=geo.toNonIndexed();flat.computeVertexNormals();mesh(g,flat,M.roof,x,y,z);
}
function hisMajestys(g){
  const w=32,d=29,z=d/2;theatreBase(g,w,d,23.3,M.stone,{canopy:'glass'});theatreEntrances(g,29,z+.05,9,{doors:true});
  for(let i=0;i<9;i++){const x=(i-4)*3.28;for(const [y,h]of [[7.8,3.5],[13.1,3.7],[19.2,2.5]])windowFrame(g,x,y,z+.07,1.8,h);}
  for(let i=0;i<6;i++)column(g,(i-2.5)*3.28,5.05,z+1.15,.36,11.1);
  for(const x of [-14.9,-11.5,11.5,14.9])box(g,x,10.6,z+.3,.45,11.1,.42,M.light);
  cornice(g,18.5,16.45,z+.7,2.5);balustrade(g,0,5,z+1.9,18.1,{height:.86});
  const side=groupAt(g,-16,0,8.9,-PI/2);for(const x of [-4.9,0,4.9])for(const [y,h]of [[7.8,3.5],[13.1,3.7],[19.2,2.5]])windowFrame(side,x,y,.05,1.8,h);
  const mansardGeometry=new THREE.CylinderGeometry(13,16.6,5,4);mansardGeometry.rotateY(PI/4);
  mesh(g,mansardGeometry,M.roof,0,25.25,0,1.43,1,1.30);
  box(g,0,26.5,0,11.4,5.2,11.4,M.stone);squareDome(g,0,29.1,0,12.2,7.1);
  cylinder(g,0,37.2,0,1.5,2.3,M.light);mesh(g,new THREE.ConeGeometry(2,2.4,8),M.roof,0,39.55,0);pin(g,0,40.7,0,1.8,M.gold);
  for(const x of [-13.5,-10.2,10.2,13.5]){windowFrame(g,x,24.25,z-.5,2.0,2.8);triangularPediment(g,x,25.8,z-.2,2.8,1.4,.6);}
  plaque(g,"HIS MAJESTY'S THEATRE",0,4.65,z+2.61,30,1.06,{bg:'#202a2d',fg:'#e4d2a1',size:64});
  plaque(g,'THE PHANTOM OF THE OPERA',0,10.65,z+1.63,16,2.05,{bg:'#10172a',fg:'#e9dfce',size:76});
}
function sondheim(g){
  const w=28,d=25,z=d/2,h=22,cx=9.6,cz=8.1,r=4.4;
  const outline=[[-14,-12.5],[14,-12.5],[14,cz]];
  for(let i=1;i<=24;i++){const a=i/24*PI/2;outline.push([cx+Math.cos(a)*r,cz+Math.sin(a)*r]);}
  outline.push([-14,z]);
  const shape=new THREE.Shape(outline.map(([x,z])=>new THREE.Vector2(x,-z)));
  const geo=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,curveSegments:1});geo.rotateX(-PI/2);
  mesh(g,geo,surface('sondheim-dark-brick','#4c4c48'));
  g.userData.bodyBounds={minX:-14,maxX:14,minZ:-12.5,maxZ:12.5,minY:0,maxY:h};
  g.userData.footprint=outline.map(([x,z])=>({x,z}));
  // Edge boxes follow the same curve as the visible corner, for wall collision.
  g.userData.groundSolids=outline.map((p,i)=>{const q=outline[(i+1)%outline.length],dx=q[0]-p[0],dz=q[1]-p[1];return{x:(p[0]+q[0])/2,z:(p[1]+q[1])/2,width:Math.hypot(dx,dz)+.06,depth:.22,height:h,rotation:-Math.atan2(dz,dx)};});
  const edge=(y,rr,material,thickness=.11)=>{const pts=[[-14,y,z+rr-r],[cx,y,z+rr-r]];for(let i=1;i<=24;i++){const a=PI/2-i/24*PI/2;pts.push([cx+Math.cos(a)*rr,y,cz+Math.sin(a)*rr]);}pts.push([cx+rr,y,-12.5]);tube(g,pts,thickness,material);};
  for(const y of [4.3,7.5,18.3,21.7])edge(y,r+.16,M.lead,.16);
  edge(22.28,r+.13,M.iron,.028);
  for(let x=-13;x<9;x+=1.8)box(g,x,22.06,z+.14,.035,.45,.035,M.iron);
  edge(21.48,r+.25,surface('sondheim-violet-cornice','#6570a5',.4,0,{emissive:'#496de0',emissiveIntensity:.2}),.09);
  // The true corner is cut out of the building, not a cylinder pasted outside it.
  for(let x=-11.5;x<=7.8;x+=3.85){windowFrame(g,x,20.0,z+.045,3.15,2.2,{m:M.lead,frame:.1});windowFrame(g,x,6,z+.05,3.05,2.2,{lit:true,m:M.lead,frame:.1});}
  for(const a of [PI/8,3*PI/8]){const face=groupAt(g,cx+Math.sin(a)*(r+.025),0,cz+Math.cos(a)*(r+.025),a);windowFrame(face,0,20.0,.02,2.9,2.2,{m:M.lead,frame:.1});windowFrame(face,0,6,.02,2.8,2.2,{lit:true,m:M.lead,frame:.1});}
  const side=groupAt(g,14,0,-2.2,PI/2);for(const x of [-7,-2,3,8])for(const y of [6,12,19.6])windowFrame(side,x,y,.03,1.45,2.5,{m:M.lead,frame:.09});
  theatreEntrances(g,22,z+.055,6);
  box(g,-2.2,4.15,z+.9,23.6,.35,2.1,M.iron);
  plaque(g,'SONDHEIM THEATRE',-2.2,4.55,z+1.98,23.6,.92,{bg:'#173f78',fg:'#f1e9d3',size:71});
  plaque(g,'LES MISÉRABLES',-2.2,12.8,z+.13,22.6,9.1,{bg:'#132b54',fg:'#eee7d6',size:95});
  const curvedMaterial=plaque(new THREE.Group(),'LES\nMISÉRABLES',0,0,0,r*PI/2,9.1,{bg:'#172d53',fg:'#eee7d6',size:111,border:false}).material;
  mesh(g,new THREE.CylinderGeometry(r+.13,r+.13,9.1,32,1,true,0,PI/2),curvedMaterial,cx,12.8,cz);
  // A narrow blade sign and a canopy with individual lights distinguish this
  // restrained post-war building from the ornate Gielgud Theatre next door.
  const blade=groupAt(g,7.0,0,z+1.2,PI/2);plaque(blade,'S\nO\nN\nD\nH\nE\nI\nM',0,16,.04,1.25,8,{bg:'#151d26',fg:'#e9e3cc',size:80,border:false});
  for(let i=0;i<24;i++)sphere(g,-13.2+i*.94,3.95,z+1.95,.055,.055,.055,M.bulb);
}
function princeEdward(g){
  const w=32,d=30,z=d/2;theatreBase(g,w,d,23,surface('prince-edward-brick','#70574b'));theatreEntrances(g,30,z+.03,7,{arched:true,fanlight:true,doors:true,finish:surface('prince-edward-door-metal','#323b35',.45,.45)});
  for(let i=-3;i<=3;i++){
    const x=i*4.2;box(g,x,12.7,z+.06,2.8,14.9,.35,M.shadow);
    for(const y of [7.4,11.9,17])windowFrame(g,x,y,z+.31,2.3,3.25,{m:M.iron});
    box(g,x-1.7,12.9,z+.44,.45,15.6,.6,M.brick);
  }
  cornice(g,w,21.4,0,d);balustrade(g,0,5,z+1.95,30,{metal:true,height:.8});
  for(let x=-15.2;x<16;x+=.8)box(g,x,22.08,z+.44,.28,.38,.55,M.light);
  for(const x of [-12.8,-8.55,-4.3,0,4.3,8.55,12.8]){box(g,x,4.03,z+1.1,.09,.13,2.7,M.gold);}
  const side=groupAt(g,-16,0,0,-PI/2);for(let x=-11;x<=11;x+=5.5)for(const y of [7.4,11.9,17])windowFrame(side,x,y,.05,2.3,3.2,{m:M.iron});
  plaque(g,'PRINCE EDWARD',0,4.65,z+2.59,29.5,1.02,{bg:'#211e1b',fg:'#d9c69d',size:83});
  // Venue name only: future productions can change without making the street wrong.
  plaque(g,'PRINCE EDWARD THEATRE',0,13.0,z+.91,11,7.5,{bg:'#182c38',fg:'#e9dcc0',size:72});
}
function lyceum(g){
  const w=31,d=35,z=d/2;theatreBase(g,w,d,22.5);theatreEntrances(g,23,z+.03,3,{arched:true,doors:true,finish:surface('lyceum-door-paint','#233b38',.5,.1)});
  for(const x of [-12,-9,-3.2,3.2,9,12]){
    column(g,x,1.3,z+3.5,.66,14.8);
    // The plinth radius, rather than just the narrower shaft, sets the drivable
    // clearance. Keep six separate solids so the gaps are not an invisible wall.
    g.userData.groundSolids.push({type:'circle',x,z:z+3.5,radius:.66*1.34,height:16.47});
  }
  g.userData.bodyBounds.maxZ=z+3.5+.66*1.34;
  cornice(g,29,16.4,z+1.85,5.7);triangularPediment(g,0,17.1,z+3.15,30,3.2,1.4);box(g,0,21.3,z+1,28,2.25,2.1,M.light);
  // Beazley's portico has a dentilled and modillioned entablature. These small
  // projected units sit beneath its existing cornice, not beyond its footprint.
  for(let x=-14.1;x<=14.1;x+=.52)box(g,x,16.14,z+4.48,.24,.27,.32,M.light);
  for(let x=-13.6;x<=13.6;x+=1.6){box(g,x,15.94,z+4.34,.30,.17,.52,M.light);box(g,x,16.07,z+4.23,.30,.19,.73,M.light);}
  plaque(g,'LYCEUM THEATRE',0,16.25,z+4.75,25,1.0,{bg:'#b8af9d',fg:'#353a39',size:76});
  plaque(g,'THE LION KING',0,5.15,z+4.32,26,1.58,{bg:'#d6a52c',fg:'#32291d',size:100});
  for(const x of [-7,7])plaque(g,'THE LION KING',x,10,z+.4,4,7.2,{bg:'#d6a52c',fg:'#32291d',size:90});
  for(const x of [-13.5,13.5])urn(g,x,22.55,z+1,.85);
}
function dominion(g){
  const w=34,d=37,z=d/2;theatreBase(g,w,d,23.5,M.stone);theatreEntrances(g,30,z+.1,7);
  for(let x=-13;x<=13;x+=4.3){windowFrame(g,x,13.2,z+.12,3,10.3,{m:M.shadow,frame:.24});box(g,x-2,13,z+.55,.75,16,.5,M.light);}
  cornice(g,w,21.3,0,d);
  plaque(g,'DOMINION THEATRE',0,5.2,z+2.67,31,1.3,{bg:'#391d1c',fg:'#f0c3a3',size:86});
  plaque(g,'DOMINION',0,11.8,z+1.21,17,5.7,{bg:'#272435',fg:'#dcc197',size:123});
  // The restored heraldic relief above the tall windows, flanked by gryphons.
  sphere(g,0,20.8,z+.44,1.35,1.2,.24,M.light);
  for(const side of [-1,1]){sphere(g,side*2.4,20.7,z+.53,1.5,.55,.3,M.light);beam(g,[side*1.5,20.8,z+.56],[side*3.0,22.0,z+.56],.18,M.light);sphere(g,side*2.1,21.8,z+.6,.3,.4,.24,M.light);}
}
function aldwych(g){
  const w=26,d=28,z=d/2;theatreBase(g,w,d,24.5);theatreEntrances(g,24,z+.03,5,{arched:true});
  for(let x=-9;x<=9;x+=4.5){for(const y of [8.1,13.6,19.3])windowFrame(g,x,y,z+.08,2.3,3.5,{arched:y===19.3});column(g,x-1.65,5.1,z+.72,.30,11.4);}
  cornice(g,w,16.6,0,d);cornice(g,w,22.75,0,d);
  // Its roof is concealed: the corner is bowed, with sculpted pediments, not a dome.
  cylinder(g,-9.6,12,z-2.2,3.9,24,M.stone);ring(g,-9.6,23.5,z-2.2,4.05,.15,M.light,PI/2);
  g.userData.groundSolids.push({type:'circle',x:-9.6,z:z-2.2,radius:3.9,height:24});
  g.userData.bodyBounds.minX=Math.min(g.userData.bodyBounds.minX,-9.6-3.9);
  g.userData.bodyBounds.maxZ=Math.max(g.userData.bodyBounds.maxZ,z-2.2+3.9);
  for(const x of [-6.5,6.5]){triangularPediment(g,x,24.5,z+.2,8.6,2.1,.8);sculptedFigure(g,x,26.6,z+.4,.85);}
  for(const x of [-11.5,0,11.5])urn(g,x,24.4,z,.72);
  plaque(g,'ALDWYCH THEATRE',0,4.65,z+2.59,24,1.06,{bg:'#273629',fg:'#ead7a5',size:82});
  plaque(g,'ALDWYCH',0,11.2,z+1.15,9,5.8,{bg:'#3b2732',fg:'#efd6a1',size:122});
}
function londonEye(g){
  // 135 m total height, 120 m ring. Smooth rim with all 32 passenger capsules.
  const centreY=72,r=60;
  for(const z of [-1.1,1.1])ring(g,0,centreY,z,r,.48,M.white);
  for(let i=0;i<64;i++){
    const a=i*PI/32,b=(i+1)*PI/32;
    beam(g,[Math.cos(a)*r,centreY+Math.sin(a)*r,-1.1],[Math.cos(b)*r,centreY+Math.sin(b)*r,1.1],.08,M.white);
    if(i%2===0)for(const z of [-1,1])beam(g,[0,centreY,z*2],[Math.cos(a)*r,centreY+Math.sin(a)*r,z*1.1],.036,M.white);
  }
  const hub=cylinder(g,0,centreY,0,2.4,9,M.white);hub.rotation.x=PI/2;
  beam(g,[-15,1,-18],[0,centreY,-4],1.35,M.white);beam(g,[15,1,-18],[0,centreY,-4],1.35,M.white);
  beam(g,[-22,1,-27],[0,centreY,-4],.15,M.iron);beam(g,[22,1,-27],[0,centreY,-4],.15,M.iron);
  for(const x of [-15,15])box(g,x,1,-18,8,2,11,M.shadow);
  box(g,0,2.2,10,37,1.2,11,M.light);balustrade(g,0,2.8,15.1,37,{metal:true,height:1.25});
  for(let i=0;i<32;i++){
    const a=i*PI/16,x=Math.cos(a)*(r+1.0),y=centreY+Math.sin(a)*(r+1.0);
    const pod=groupAt(g,x,y,0);pod.name=`passenger-capsule-${i+1}`;
    sphere(pod,0,0,0,3.4,1.9,2.6,M.glass);box(pod,0,-1.2,0,5.3,.24,3.7,M.white);
    for(const offset of [-1.5,0,1.5]){const hoop=ring(pod,offset,0,0,1.82,.055,M.white);hoop.rotation.y=PI/2;hoop.scale.y=1;hoop.scale.x=1.32;}
    beam(pod,[-2.7,1.4,1.5],[2.7,1.4,1.5],.06,M.white);beam(pod,[-2.7,1.4,-1.5],[2.7,1.4,-1.5],.06,M.white);
  }
}
function abbey(g){
  const z=49;box(g,0,.6,0,37,1.2,104,M.shadow);box(g,0,15,0,31,29,99,M.stone);
  const roofProfile=new THREE.Shape();roofProfile.moveTo(-16,0);roofProfile.lineTo(16,0);roofProfile.lineTo(0,11);roofProfile.closePath();
  mesh(g,new THREE.ExtrudeGeometry(roofProfile,{depth:97,bevelEnabled:false}),M.roof,0,29,-49);
  for(const x of [-13,13]){
    box(g,x,28,z-4,11,56,13,M.stone);cornice(groupAt(g,x),11.8,54.8,z-4,13.8);
    for(const y of [10,24,40])gothicWindow(g,x,y,z+2.6,6,11);
    for(const dx of [-4.5,4.5])for(const dz of [-9.4,1.4])pin(g,x+dx,55.8,z+dz,10.4,M.light);
    for(const dx of [-4.2,4.2])box(g,x+dx,29,z+2.4,.7,54,.9,M.light);
  }
  gothicWindow(g,0,10.2,z+.2,10,18,M.light);gothicWindow(g,0,26.6,z+.21,9.5,10.8,M.light);
  triangularPediment(g,0,32,z+.3,18,7,1,M.light);
  for(let depth=-42;depth<=36;depth+=10){
    for(const side of [-1,1]){
      const face=groupAt(g,side*15.6,0,depth,side*PI/2);gothicWindow(face,0,19.6,.06,5.4,12.5);
      box(g,side*20,12,depth,2.1,24,2.7,M.light);beam(g,[side*19.9,23,depth],[side*14.8,28,depth],.53,M.light);pin(g,side*20,24,depth,6.8);
    }
  }
}

function admiraltyArch(g){
  const w=55,d=15,h=24;
  const openings=[{x:-22,r:1.6,spring:4.0},{x:-11,r:3.8,spring:7.3},{x:0,r:3.8,spring:7.3},{x:11,r:3.8,spring:7.3},{x:22,r:1.6,spring:4.0}];
  // A notched outer contour leaves genuinely open road passages all the way
  // through the wall. No glass, billboard or hidden box spans these arches.
  const shape=new THREE.Shape();shape.moveTo(-w/2,0);
  for(const opening of openings){const{x,r,spring}=opening;shape.lineTo(x-r,0);shape.lineTo(x-r,spring);shape.absarc(x,spring,r,PI,0,true);shape.lineTo(x+r,0);}
  shape.lineTo(w/2,0);shape.lineTo(w/2,h);shape.lineTo(-w/2,h);shape.closePath();
  mesh(g,new THREE.ExtrudeGeometry(shape,{depth:d,curveSegments:40,bevelEnabled:false}),M.stone,0,0,-d/2);
  for(const sign of [-1,1]){
    const face=groupAt(g,0,0,sign*d/2,sign===1?0:PI);
    for(const{x,r,spring}of openings){
      const points=[];for(let i=0;i<=40;i++){const a=i/40*PI;points.push([x+Math.cos(a)*(r+.18),spring+Math.sin(a)*(r+.18),.19]);}tube(face,points,.18,M.light);
      for(const dx of [-r-.23,r+.23])box(face,x+dx,spring/2,.2,.35,spring,.6,M.light);
      box(face,x,spring+r+.35,.23,.75,.9,.8,M.light);
      for(let i=0;i<=16;i++){const a=i*PI/16;beam(face,[x+Math.cos(a)*(r+.37),spring+Math.sin(a)*(r+.37),.34],[x+Math.cos(a)*(r+.86),spring+Math.sin(a)*(r+.86),.34],.018,M.shadow);}
    }
    for(const x of [-25.9,-18.4,-5.5,5.5,18.4,25.9])column(face,x,.3,.35,.57,16.3);
    for(let x=-24;x<=24;x+=4.8){windowFrame(face,x,14.2,.12,2.3,3.5,{arched:true});windowFrame(face,x,20.0,.1,2.2,2.65);}
    box(face,0,17.45,.3,55.8,.65,1,M.light);
    plaque(face,': ANNO : DECIMO : EDWARDI : SEPTIMI : REGIS :\n: VICTORIÆ : REGINÆ : CIVES : GRATISSIMI : MDCCCCX :',0,26.35,.04,34,2.25,{bg:'#d1c7b5',fg:'#655c43',size:84,border:false});
  }
  cornice(g,55.5,23.3,0,16);box(g,0,26.0,0,39,4.1,14.9,M.stone);cornice(g,39.7,28,0,15.5);
  balustrade(g,-24,24.0,7.8,7,{height:1.1});balustrade(g,24,24.0,7.8,7,{height:1.1});
  for(const side of [-1,1]){
    const wing=groupAt(g,side*39.2,0,4.5,-side*.27);
    box(wing,0,11.2,0,27,22.4,17,M.stone);cornice(wing,27,21.8,0,17);
    for(let x=-10.5;x<=10.5;x+=4.2){for(const y of side===1?[3.8,10.5,17.2]:[5.0,14.1])windowFrame(wing,x,y,8.6,2.3,side===1?3.6:5.0,{arched:y>8});column(wing,x-1.6,6.2,9,.37,12);}
    mansardRoof(wing,0,22.4,0,27,17,5.4);
    for(const x of [-8.5,0,8.5]){windowFrame(wing,x,24.9,7.15,2,2.5);triangularPediment(wing,x,26.3,7.25,3,1.2,.5);}
  }
  const spans=[];let edge=-w/2;
  for(const{x,r}of openings){spans.push({x:(edge+x-r)/2,z:0,width:x-r-edge,depth:d,height:h});edge=x+r;}
  spans.push({x:(edge+w/2)/2,z:0,width:w/2-edge,depth:d,height:h});
  for(const span of spans)for(let y=.85;y<9.7;y+=.82)for(const sign of [-1,1])box(g,span.x,y,sign*(d/2+.012),Math.max(.05,span.width-.12),.026,.025,M.shadow);
  for(const side of [-1,1])spans.push({x:side*39.2,z:4.5,width:27,depth:17,height:22.4,rotation:-side*.27});
  g.userData.passages=openings.map(o=>({x:o.x,z:0,width:o.r*2,depth:d,height:o.spring,maxHeight:o.spring+o.r,profile:'semicircular'}));
  g.userData.groundSolids=spans;
}

const FACTORIES = Object.freeze({
  buckingham, 'admiralty-arch':admiraltyArch, 'victoria-memorial':victoria, 'big-ben':bigBen, parliament,
  'chinatown-gate':chinatown, 'his-majestys-theatre':hisMajestys,
  'sondheim-theatre':sondheim, 'prince-edward-theatre':princeEdward,
  'lyceum-theatre':lyceum, 'dominion-theatre':dominion, 'aldwych-theatre':aldwych,
  'london-eye':londonEye, 'westminster-abbey':abbey,
});
const NAMES = {
  buckingham:'Buckingham Palace', 'admiralty-arch':'Admiralty Arch', 'victoria-memorial':'Victoria Memorial', 'big-ben':'Elizabeth Tower / Big Ben', parliament:'Palace of Westminster',
  'chinatown-gate':'Chinatown Gate', 'his-majestys-theatre':"His Majesty’s Theatre", 'sondheim-theatre':'Sondheim Theatre', 'prince-edward-theatre':'Prince Edward Theatre',
  'lyceum-theatre':'Lyceum Theatre', 'dominion-theatre':'Dominion Theatre', 'aldwych-theatre':'Aldwych Theatre', 'london-eye':'London Eye', 'westminster-abbey':'Westminster Abbey',
};
export const LANDMARK_IDS = Object.freeze(Object.keys(FACTORIES));
export function createLandmark(id) {
  const factory=FACTORIES[id];if(!factory)throw new RangeError(`Unknown London landmark: ${id}`);
  const group=new THREE.Group();group.name=id;factory(group);group.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(group,true),size=bounds.getSize(new THREE.Vector3());
  const centre=bounds.getCenter(new THREE.Vector3());
  for(const child of group.children){child.position.x-=centre.x;child.position.z-=centre.z;child.position.y-=bounds.min.y;}
  group.updateMatrixWorld(true);
  // Dimension metadata covers ornamental projections too, for placement/clearance.
  for(const key of ['passages','groundSolids'])if(group.userData[key])group.userData[key]=group.userData[key].map(p=>({...p,x:p.x-centre.x,z:p.z-centre.z}));
  if(group.userData.footprint)group.userData.footprint=group.userData.footprint.map(p=>({x:p.x-centre.x,z:p.z-centre.z}));
  if(group.userData.bodyBounds){const b=group.userData.bodyBounds;group.userData.bodyBounds={minX:b.minX-centre.x,maxX:b.maxX-centre.x,minZ:b.minZ-centre.z,maxZ:b.maxZ-centre.z,minY:b.minY-bounds.min.y,maxY:b.maxY-bounds.min.y};group.userData.facadeZ=group.userData.bodyBounds.maxZ;}
  group.userData={...group.userData,id,name:NAMES[id],width:size.x,depth:size.z,height:size.y,units:'metres',front:'+Z',architecturalStudy:true};
  return group;
}
