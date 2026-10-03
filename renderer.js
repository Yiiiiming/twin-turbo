/** Native WebGL racing renderer: two genuinely perspective, low chase cameras. */
import { TRACK, trackPoint, projectTrack, mod } from './engine.js';

const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const mix = (a, b, t) => a + (b - a) * t;
const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const normalize = v => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function perspective(fov, aspect, near = 2, far = 4400) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export function lookAt(eye, target) {
  const z = normalize(eye.map((n, i) => n - target[i]));
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}

export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) {
    out[col * 4 + row] = a[row] * b[col * 4] + a[row + 4] * b[col * 4 + 1] + a[row + 8] * b[col * 4 + 2] + a[row + 12] * b[col * 4 + 3];
  }
  return out;
}

function modelMatrix(x, y, z, angle, roll = 0) {
  const c = Math.cos(angle), s = Math.sin(angle), cr = Math.cos(roll), sr = Math.sin(roll);
  return new Float32Array([c, 0, s, 0, -s * sr, cr, c * sr, 0, -s * cr, -sr, c * cr, 0, x, y, z, 1]);
}

/** Angles are unwrapped before smoothing, so crossing +/-pi never spins a camera. */
export function updateChaseCamera(car, previous, dt = 1 / 60) {
  const snap = !previous || Math.hypot(car.x - previous.carX, car.y - previous.carY) > 260;
  const blend = snap ? 1 : 1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) * 7.5);
  const turnBlend = snap ? 1 : 1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) * 9);
  const angle = snap ? car.angle : previous.angle + (mod(car.angle - previous.angle + Math.PI, TAU) - Math.PI) * turnBlend;
  const speed = clamp(Math.abs(car.speed || 0) / 470, 0, 1);
  const distance = 169 + speed * 18;
  const height = 76 + speed * 8;
  const lateral = 13;
  const cs = Math.cos(angle), sn = Math.sin(angle);
  const desired = [car.x - cs * distance - sn * lateral, height, car.y - sn * distance + cs * lateral];
  const eye = snap ? desired : desired.map((n, i) => mix(previous.eye[i], n, blend));
  const target = [car.x + cs * (72 + speed * 22), 13, car.y + sn * (72 + speed * 22)];
  const desiredFov = (car.boosting ? 68 : 59 + speed * 3) * Math.PI / 180;
  return { angle, eye, target, fov: snap ? desiredFov : mix(previous.fov, desiredFov, blend), carX: car.x, carY: car.y };
}

const rgba = (color, alpha = 1) => {
  if (Array.isArray(color)) return color.length === 4 ? color : [...color, alpha];
  const h = color.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, alpha];
};

class MeshBuilder {
  constructor() { this.data = []; }
  vertex(v, normal, color, emission = 0) { this.data.push(...v, ...normal, ...rgba(color), emission); }
  triangle(a, b, c, color, emission = 0, normal) {
    normal ||= normalize(cross(b.map((n, i) => n - a[i]), c.map((n, i) => n - a[i])));
    this.vertex(a, normal, color, emission); this.vertex(b, normal, color, emission); this.vertex(c, normal, color, emission);
  }
  quad(a, b, c, d, color, emission = 0, normal) {
    this.triangle(a, b, c, color, emission, normal); this.triangle(a, c, d, color, emission, normal);
  }
  box(x, y, z, sx, sy, sz, color, angle = 0, emission = 0) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const p = (a, b, d) => [x + c * a - s * d, y + b, z + s * a + c * d];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const v = [p(-hx,-hy,-hz),p(hx,-hy,-hz),p(hx,hy,-hz),p(-hx,hy,-hz),p(-hx,-hy,hz),p(hx,-hy,hz),p(hx,hy,hz),p(-hx,hy,hz)];
    for (const [a,b,d,e] of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]]) this.quad(v[a],v[b],v[d],v[e],color,emission);
  }
  cone(x, y, z, radius, height, color, sides = 7, topRadius = 0, phase = 0) {
    for (let i = 0; i < sides; i++) {
      const a = phase + i / sides * TAU, b = phase + (i + 1) / sides * TAU;
      const p = [x + Math.cos(a) * radius, y, z + Math.sin(a) * radius];
      const q = [x + Math.cos(b) * radius, y, z + Math.sin(b) * radius];
      const t = [x + Math.cos(a) * topRadius, y + height, z + Math.sin(a) * topRadius];
      const u = [x + Math.cos(b) * topRadius, y + height, z + Math.sin(b) * topRadius];
      if(topRadius===0)this.triangle(p,t,q,color);
      else this.quad(p,t,u,q,color);
    }
  }
  disk(x, y, z, rx, rz, color, sides = 12, angle = 0) {
    const cs = Math.cos(angle), sn = Math.sin(angle);
    const p = a => [x + Math.cos(a)*rx*cs - Math.sin(a)*rz*sn,y,z + Math.cos(a)*rx*sn + Math.sin(a)*rz*cs];
    for (let i = 0; i < sides; i++) this.triangle([x,y,z],p(i/sides*TAU),p((i+1)/sides*TAU),color,0,[0,1,0]);
  }
}

const VERTEX = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec4 aColor;
attribute float aEmission;
uniform mat4 uViewProjection;
uniform mat4 uModel;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec4 vColor;
varying float vEmission;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vPosition = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  vEmission = aEmission;
  gl_Position = uViewProjection * world;
}`;
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vPosition;
varying vec3 vNormal;
varying vec4 vColor;
varying float vEmission;
uniform vec3 uEye;
uniform vec3 uFog;
void main() {
  vec3 n = normalize(vNormal);
  float sun = max(dot(n, normalize(vec3(-0.45, 0.86, 0.35))), 0.0);
  float hemisphere = 0.54 + 0.12 * n.y;
  vec3 color = vColor.rgb * mix(vec3(hemisphere) + vec3(0.52,0.46,0.36)*sun, vec3(1.17), vEmission);
  float fog = smoothstep(620.0, 2550.0, length(vPosition - uEye));
  color = mix(color, uFog, fog * 0.9);
  gl_FragColor = vec4(color, vColor.a);
}`;
const SKY_VERTEX = `attribute vec2 aPosition; varying vec2 vUV; void main(){vUV=aPosition*0.5+0.5;gl_Position=vec4(aPosition,0.999,1.0);}`;
const SKY_FRAGMENT = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uTextureA;
uniform sampler2D uTextureB;
uniform sampler2D uTextureC;
uniform float uReadyA;
uniform float uReadyB;
uniform float uReadyC;
uniform vec3 uWeights;
uniform float uHeading;
uniform float uAspect;
uniform vec3 uZenith;
uniform vec3 uHorizon;
void main(){
  vec3 gradient = mix(uHorizon,uZenith,pow(clamp(vUV.y,0.0,1.0),0.7));
  // Gentle repeating parallax keeps the painted horizon stable through corners.
  float x = 0.5 + (vUV.x - 0.5) * min(uAspect * 0.5,0.8) + sin(uHeading) * 0.085;
  float y = clamp((vUV.y-0.13)*1.13,0.0,1.0);
  vec3 a = mix(gradient,texture2D(uTextureA,vec2(x,y)).rgb,uReadyA);
  vec3 b = mix(gradient,texture2D(uTextureB,vec2(x,y)).rgb,uReadyB);
  vec3 c = mix(gradient,texture2D(uTextureC,vec2(x,y)).rgb,uReadyC);
  vec3 image = a*uWeights.x+b*uWeights.y+c*uWeights.z;
  float landscape = smoothstep(0.03,0.3,vUV.y);
  gl_FragColor=vec4(mix(uHorizon,image,landscape),1.0);
}`;

function program(gl, vertex, fragment) {
  const compile = (type, source) => {
    const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed');
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
  const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'Shader linking failed');
  return p;
}

function upload(gl, builder) {
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.data), gl.STATIC_DRAW);
  return { buffer, count: builder.data.length / 11 };
}

function random(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

/** Road ribbon samples follow engine geometry, including bank-free hairpins. */
export function sampleRoadRibbon(step = 10) {
  const count = Math.ceil(TRACK.length / step), rows = [];
  for (let i = 0; i <= count; i++) {
    const distance = i / count * TRACK.length;
    rows.push({ distance, center: trackPoint(distance), left: trackPoint(distance, -TRACK.roadWidth / 2), right: trackPoint(distance, TRACK.roadWidth / 2) });
  }
  return rows;
}

function buildRoad() {
  const mesh = new MeshBuilder(), step = TRACK.length / Math.ceil(TRACK.length / 10), half = TRACK.roadWidth / 2;
  const strip = (s, widthA, widthB, height, color, emission = 0) => {
    const p = trackPoint(s,widthA), q = trackPoint(s+step,widthA), r = trackPoint(s+step,widthB), t = trackPoint(s,widthB);
    mesh.quad([p.x,height,p.y],[q.x,height,q.y],[r.x,height,r.y],[t.x,height,t.y],color,emission,[0,1,0]);
  };
  for (let s = 0, i = 0; s < TRACK.length - 0.01; s += step, i++) {
    strip(s,-half-16,half+16,0.35,'#555b58');
    strip(s,-half,half,0.7,i%11===0?'#343a44':'#303640');
    for (const side of [-1,1]) {
      strip(s,side*half,side*(half+9),0.85,Math.floor(s/25)%2?'#edf2db':'#e85a62');
      strip(s,side*(half-5),side*(half-3),0.92,'#c6d6d7');
    }
    if (s % 83 < 31) strip(s,-0.8,0.8,1,'#c0c4b0');
    // Tire-darkened racing line adds surface variation without expensive textures.
    if (i%3!==0) { strip(s,-23,-20,0.82,'#2d323b'); strip(s,20,23,0.82,'#2d323b'); }
  }
  const start = TRACK.startDistance, cells = 12, depth = 7;
  for (let row = 0; row < 3; row++) for (let col = 0; col < cells; col++) {
    const d = start+row*depth, a = -half + col*TRACK.roadWidth/cells, b = a+TRACK.roadWidth/cells;
    const p=trackPoint(d,a),q=trackPoint(d+depth,a),r=trackPoint(d+depth,b),t=trackPoint(d,b);
    mesh.quad([p.x,1.1,p.y],[q.x,1.1,q.y],[r.x,1.1,r.y],[t.x,1.1,t.y],(row+col)%2?'#eff6f7':'#101b2c',0,[0,1,0]);
  }
  return mesh;
}

function pine(mesh,x,z,size,rng) {
  mesh.box(x,7*size,z,5*size,14*size,5*size,'#745c48');
  mesh.cone(x,9*size,z,22*size,40*size,'#245951',7,0,rng());
  mesh.cone(x,26*size,z,17*size,35*size,'#357c65',7,0,rng());
  mesh.cone(x,42*size,z,11*size,25*size,'#479277',7,0,rng());
}
function palm(mesh,x,z,size,rng) {
  mesh.cone(x,0,z,3.7*size,65*size,'#a58364',7,2.6*size);
  const phase = rng()*TAU;
  for(let i=0;i<7;i++) {
    const a=phase+i/7*TAU, c=Math.cos(a),s=Math.sin(a), length=(32+rng()*16)*size;
    const tip=[x+c*length,54*size,z+s*length], mid=[x+c*length*.52,72*size,z+s*length*.52];
    mesh.triangle([x,64*size,z],[mid[0]-s*7*size,mid[1],mid[2]+c*7*size],tip,'#3b8d72',0,[0,1,0]);
    mesh.triangle([x,64*size,z],tip,[mid[0]+s*7*size,mid[1],mid[2]-c*7*size],'#64b486',0,[0,1,0]);
  }
}
function building(mesh,x,z,w,d,h,rng) {
  const colors=['#334859','#405b6d','#334451','#536676','#456174'];
  mesh.box(x,h/2,z,w,h,d,colors[Math.floor(rng()*colors.length)]);
  mesh.box(x,h+2,z,w+4,4,d+4,'#76848c');
  mesh.box(x,h+5,z,w*.48,6,d*.48,'#243b4d');
  const neon = rng()>.45 ? '#3fe6e3' : '#ff67ad';
  mesh.box(x,h*.76,z+d/2+.25,w*.83,3,0.7,neon,0,0.95);
  const rows = Math.min(9,Math.floor(h/16)), cols=Math.min(6,Math.floor(w/10));
  for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
    const lit=rng()>.24, color=lit?(rng()>.5?'#bfe9e8':'#ffd1a0'):'#273c4e';
    const wx=x-w*.39+col*w*.78/Math.max(1,cols-1), wy=12+row*15;
    for(const side of [-1,1]) {
      const wz=z+side*(d/2+.5);
      mesh.quad([wx-2,wy-3,wz],[wx+2,wy-3,wz],[wx+2,wy+3,wz],[wx-2,wy+3,wz],color,lit?.7:0,[0,0,side]);
    }
  }
  for(let row=0;row<rows;row++) for(let col=0;col<3;col++) {
    const wz=z-d*.28+col*d*.28;
    const wy=12+row*15;
    for(const side of [-1,1]) {
      const wx=x+side*(w/2+.5);
      mesh.quad([wx,wy-3,wz-2],[wx,wy-3,wz+2],[wx,wy+3,wz+2],[wx,wy+3,wz-2],'#a2d3d4',.5,[side,0,0]);
    }
  }
}

const shoreBoundary = () => Math.max(...sampleRoadRibbon(50).map(row=>row.center.y))+TRACK.roadWidth/2+90;

/** Exact placements used by the renderer; radius includes roof and leaf overhang. */
export function sceneryPlacements() {
  const rng=random(216902),w=TRACK.width,h=TRACK.height,shore=shoreBoundary(),placements=[];
  const add=(kind,x,z,dimensions)=>{
    const radius=kind==='pine'?dimensions.size*22:kind==='palm'?dimensions.size*48
      :kind==='building'?Math.hypot(dimensions.width+4,dimensions.depth+4)/2:dimensions.radius;
    if(projectTrack(x,z).distance<TRACK.roadWidth/2+radius+10||z+radius>shore-10)return;
    placements.push({kind,x,z,...dimensions,radius});
  };
  for(let i=0;i<520;i++) {
    const x=-110+rng()*(w+220),z=-160+rng()*(h+225);
    if(z>h*.66) {
      if(rng()<.51)add('palm',x,z,{size:.65+rng()*.7});
      else if(rng()<.3)add('rock',x,z,{radius:15+rng()*18,height:9+rng()*18});
    } else if(x<w*.53)add('pine',x,z,{size:.57+rng()*.8});
    else if(rng()<.38)add('building',x,z,{width:36+rng()*44,depth:36+rng()*44,height:50+rng()*130});
    else if(rng()<.5)add('rock',x,z,{radius:12+rng()*16,height:14+rng()*21});
  }
  // Road-relative density stays the same when the driving map is enlarged.
  for(let s=0,i=0;s<TRACK.length;s+=55,i++) {
    const p=trackPoint(s),coastal=p.y>h*.65,city=p.x>w*.55&&!coastal;
    for(const side of [-1,1]) {
      const offset=TRACK.roadWidth/2+(city?100:coastal?75:45)+rng()*(city?100:115);
      const q=trackPoint(s+rng()*22,side*offset);
      if(city) {
        if(i%3===0)add('building',q.x,q.y,{width:38+rng()*36,depth:38+rng()*36,height:65+rng()*145});
        else if(i%2===0)add('pine',q.x,q.y,{size:.55+rng()*.45});
      } else if(coastal) {
        if(i%2===0)add('palm',q.x,q.y,{size:.8+rng()*.55});
        else add('rock',q.x,q.y,{radius:13+rng()*16,height:12+rng()*17});
      } else add('pine',q.x,q.y,{size:.6+rng()*.85});
    }
  }
  return placements;
}

/** Markers cover both directions of turn, including the enlarged-radius bends. */
export function cornerMarkers() {
  const markers=[];
  for(let s=50;s<TRACK.length;s+=105) {
    const before=trackPoint(s-30),after=trackPoint(s+35);
    const turn=mod(after.angle-before.angle+Math.PI,TAU)-Math.PI;
    if(Math.abs(turn)<.03)continue;
    const side=turn>0?-1:1,q=trackPoint(s,side*(TRACK.roadWidth/2+22));
    markers.push({...q,side,turn});
  }
  return markers;
}

function buildWorld() {
  const terrain=new MeshBuilder(), props=new MeshBuilder(), water=new MeshBuilder();
  const rng=random(90421), w=TRACK.width, h=TRACK.height;
  const shoreZ=shoreBoundary();
  const grid=130;
  for(let x=-1200;x<w+1200;x+=grid) for(let z=-1200;z<h+1200;z+=grid) {
    const n=rng(), coast=z>h*.71;
    const c=coast?[.47+n*.04,.54+n*.045,.39+n*.02]:[.19+n*.055,.37+n*.065,.30+n*.045];
    terrain.quad([x,-.1,z],[x+grid,-.1,z],[x+grid,-.1,z+grid],[x,-.1,z+grid],c,0,[0,1,0]);
  }
  // Ocean begins beyond the southern road shoulder; the circuit remains flat.
  water.quad([-1800,.12,shoreZ],[w+2400,.12,shoreZ],[w+2400,.12,h+2600],[-1800,.12,h+2600],'#318caa',.2,[0,1,0]);
  for(let i=0;i<85;i++) {
    const x=-1100+rng()*(w+2200),z=shoreZ+15+rng()*1600,len=25+rng()*130;
    water.quad([x,.17,z],[x+len,.17,z],[x+len,.17,z+1.6],[x,.17,z+1.6],'#78c6ce',.4,[0,1,0]);
  }
  // Angular distant mountains, layered enough to read under a low horizon.
  for(let i=0;i<32;i++) {
    const a=(i/32)*TAU, cx=w*.48+Math.cos(a)*(w*.7+180),cz=h*.47+Math.sin(a)*(h*.8+180);
    if(cz>h*.87) continue;
    const radius=140+rng()*220,height=160+rng()*300;
    props.cone(cx,-2,cz,radius,height,i%2?'#53766e':'#466568',6,0,rng()*2);
    if(height>340) props.cone(cx,height*.63,cz,radius*.36,height*.37,'#c3d5cf',6,0,rng()*2);
  }
  for(const item of sceneryPlacements()) {
    if(item.kind==='pine')pine(props,item.x,item.z,item.size,rng);
    else if(item.kind==='palm')palm(props,item.x,item.z,item.size,rng);
    else if(item.kind==='building')building(props,item.x,item.z,item.width,item.depth,item.height,rng);
    else props.cone(item.x,0,item.z,item.radius,item.height,item.z>h*.66?'#a6ab96':'#788f7e',6,4,rng()*2);
  }
  // Waterside promenade, piers, cargo and moored little boats.
  for(let i=0;i<8;i++) {
    const x=140+i*(w-200)/8,z=shoreZ-10;
    props.box(x,4,z,130,9,30,'#9b927d');
    props.box(x,4,z+53,23,9,130,'#a19680');
    for(const side of [-1,1]) {
      props.box(x+side*9,-1,z+95,5,24,5,'#67776d');
      props.box(x+side*45,8,z+64,28,13,15,side>0?'#eff1e6':'#e3a171');
      props.box(x+side*45,16,z+64,13,8,9,'#e8ece6');
      props.box(x+side*45,32,z+64,1.2,30,1.2,'#d9e4df');
    }
  }
  // Lamp posts and reflective barriers support road reading, including hairpins.
  for(let s=0,i=0;s<TRACK.length;s+=47,i++) {
    const p=trackPoint(s), coastal=p.y>h*.63, city=p.x>w*.56&&p.y<h*.63;
    if(i%3===0) {
      const side=i%2?1:-1, q=trackPoint(s,side*(TRACK.roadWidth/2+25));
      props.box(q.x,5,q.y,3,10,3,'#c7d3c3');
      props.box(q.x,9.5,q.y,4,2,4,i%2?'#ffbc7d':'#9ceaff',0,.65);
    }
    if((coastal||city)&&i%3===0) {
      const q=trackPoint(s,TRACK.roadWidth/2+27),angle=q.angle;
      props.box(q.x,37,q.y,3,74,3,'#516976');
      props.box(q.x-Math.sin(angle)*8,73,q.y+Math.cos(angle)*8,3,3,20,'#77969e',angle);
      props.box(q.x-Math.sin(angle)*16,71,q.y+Math.cos(angle)*16,7,2,10,'#ffdfa0',angle,.9);
    }
    if(coastal && i%2===0) {
      const side=p.y>h*.81?1:-1;
      const q=trackPoint(s,side*(TRACK.roadWidth/2+18)),r=trackPoint(s+43,side*(TRACK.roadWidth/2+18));
      props.box(q.x,8,q.y,3,16,3,'#98aeb2');
      props.box((q.x+r.x)/2,14,(q.y+r.y)/2,Math.hypot(r.x-q.x,r.y-q.y),5,2,'#b8c9cb',Math.atan2(r.y-q.y,r.x-q.x));
    }
  }
  // Road-side chevrons anticipate the technical corners instead of blind bends.
  for(const q of cornerMarkers()) {
    const {side}=q;
    props.box(q.x,19,q.y,5,38,3,'#536d77');
    props.box(q.x,34,q.y,2,19,23,'#142a39',q.angle);
    for(let k=0;k<3;k++) {
      const xx=q.x+Math.cos(q.angle)*1.3-Math.sin(q.angle)*(k*6-6),zz=q.y+Math.sin(q.angle)*1.3+Math.cos(q.angle)*(k*6-6);
      props.box(xx,34,zz,1.5,11,2.3,'#ffdb89',q.angle+side*.5,.75);
    }
  }
  const start=trackPoint(TRACK.startDistance),half=TRACK.roadWidth/2+15;
  for(const side of [-1,1]) {
    const p=trackPoint(TRACK.startDistance,side*half);
    props.box(p.x,43,p.y,10,86,10,'#233b4c',p.angle);
    props.box(p.x,45,p.y,11,64,11,side<0?'#53e4ec':'#ff70aa',p.angle,.6);
  }
  props.box(start.x,87,start.y,14,17,half*2+14,'#1b2d42',start.angle);
  props.box(start.x-Math.cos(start.angle)*8,85,start.y-Math.sin(start.angle)*8,2,3,half*2,'#b6fff4',start.angle,.8);
  // Rung flags give the gantry a readable racing silhouette without text textures.
  for(let k=0;k<14;k++) {
    const p=trackPoint(TRACK.startDistance,-half+k*half*2/14+5);
    props.box(p.x,90,p.y,16,5,8,k%2?'#f0efe4':'#273b49',start.angle);
  }
  return { terrain, props, water };
}

function carMesh(color) {
  const m=new MeshBuilder();
  // X is the vehicle's forward axis; lamps and rear wing make orientation clear.
  m.box(0,6.5,0,43,9,22,'#172433');
  m.box(1,10,0,42,9,25,color);
  m.box(16,12,0,10,7,23,color);
  m.box(-16,12,0,10,7,24,color);
  const a=[-12,14,-10],b=[9,14,-10],c=[5,23,-8],d=[-7,23,-8];
  const a2=[-12,14,10],b2=[9,14,10],c2=[5,23,8],d2=[-7,23,8];
  m.quad(a,b,c,d,'#192d44');m.quad(a2,d2,c2,b2,'#203d56');
  m.quad(b,b2,c2,c,'#79b7cd',.12);m.quad(a,d,d2,a2,'#385b74');
  m.quad(d,c,c2,d2,color);
  m.box(0,23.1,0,8,1,2.6,'#b1edf0');
  m.box(17,15.7,0,12,.6,3,'#142e41');
  m.box(-16,17.1,0,7,.7,3,'#142e41');
  for(const side of [-1,1]) {
    m.box(4,16,side*12,6,2,2,'#102c43');
    m.box(8,17,side*14.3,4,2,4,color);
    m.box(-17,21,side*8,2,10,2,'#18354b');
    m.box(21.6,12,side*7,1.2,3.5,7,'#e7ffff',0,1);
    m.box(-21.6,12,side*7,1.2,3,7,'#ff5274',0,1);
    m.box(-22,7.5,side*6,3,3,3,'#19222c');
    for(const x of [-13,13]) {
      // Octagonal tires with metallic outer hubs, all fully 3-D.
      const z=side*12.5, rr=6.8, thickness=4.7;
      for(let k=0;k<12;k++) {
        const t=k/12*TAU,u=(k+1)/12*TAU;
        const p=[x+Math.cos(t)*rr,rr+Math.sin(t)*rr,z-thickness/2];
        const q=[x+Math.cos(u)*rr,rr+Math.sin(u)*rr,z-thickness/2];
        const r=[q[0],q[1],z+thickness/2],v=[p[0],p[1],z+thickness/2];
        m.quad(p,v,r,q,'#121d2b');
        m.triangle([x,rr,z+side*(thickness/2+.1)], [p[0],p[1],z+side*(thickness/2+.1)],[q[0],q[1],z+side*(thickness/2+.1)],'#2d3a47');
        m.triangle([x,rr,z+side*(thickness/2+.2)],[x+Math.cos(t)*3.8,rr+Math.sin(t)*3.8,z+side*(thickness/2+.2)],[x+Math.cos(u)*3.8,rr+Math.sin(u)*3.8,z+side*(thickness/2+.2)],k%2?'#a6c3cf':'#648493');
      }
    }
  }
  m.box(-17,26,0,7,2,31,'#173145');
  m.box(-17,27.3,0,6,.7,29,color);
  return m;
}
function flameMesh() {
  const m=new MeshBuilder();
  for(const side of [-1,1]) {
    const x=-23,z=side*6;
    m.triangle([x,5,z-2.5],[x,11,z],[-52,7,z],'#62d7ff',1);
    m.triangle([x,11,z],[x,5,z+2.5],[-52,7,z],'#92efff',1);
    m.triangle([x,5,z+2.5],[x,5,z-2.5],[-52,7,z],'#387dff',1);
    m.triangle([x-1,6,z-1],[x-1,9,z+1],[-40,7,z],'#e0fdff',1);
  }
  return m;
}
function shadowMesh() {
  const m=new MeshBuilder(),inner=[0,0,0,.3],outer=[0,0,0,0];
  for(let i=0;i<20;i++) {
    const a=i/20*TAU,b=(i+1)/20*TAU;
    const p=[Math.cos(a)*25,0,Math.sin(a)*16],q=[Math.cos(b)*25,0,Math.sin(b)*16];
    m.vertex([0,0,0],[0,1,0],inner,1);m.vertex(p,[0,1,0],outer,1);m.vertex(q,[0,1,0],outer,1);
  }
  return m;
}

const SCENES = {
  coast: { zenith:[.28,.55,.73], horizon:[.69,.79,.78], fog:[.58,.73,.76] },
  alpine:{ zenith:[.32,.51,.65], horizon:[.69,.77,.76], fog:[.57,.7,.7] },
  city:  { zenith:[.27,.35,.54], horizon:[.71,.66,.69], fog:[.6,.65,.73] },
};
export function sceneWeights(x,y) {
  const coast=clamp((y/TRACK.height-.52)/.22,0,1);
  const city=clamp((x/TRACK.width-.43)/.2,0,1)*(1-coast);
  return { coast, alpine:Math.max(0,1-coast-city), city };
}

export class RaceRenderer {
  constructor(canvas,{sceneUrls={}}={}) {
    this.canvas=canvas;this.available=false;this.error=null;this.cameras=[null,null];this.textures={};
    this.sceneUrls={coast:'./assets/coast.png',alpine:'./assets/alpine.png',city:'./assets/city.png',...sceneUrls};
    try {
      const gl=canvas.getContext('webgl',{alpha:false,antialias:true,depth:true,powerPreference:'high-performance'})||canvas.getContext('experimental-webgl',{alpha:false,antialias:true,depth:true});
      if(!gl)throw new Error('你的浏览器暂不支持 WebGL 3D，请启用硬件加速后重试。');
      this.gl=gl;this._initialize();this.available=true;
      canvas.addEventListener?.('webglcontextlost',event=>{event.preventDefault();this.available=false;this.error='3D 画面连接暂时中断，正在恢复…';});
      canvas.addEventListener?.('webglcontextrestored',()=>{try{this._initialize();this.available=true;this.error=null;}catch(error){this.error=error.message;}});
    } catch(error) { this.error=error.message; }
  }
  _initialize() {
    const gl=this.gl;
    this.mainProgram=program(gl,VERTEX,FRAGMENT);this.skyProgram=program(gl,SKY_VERTEX,SKY_FRAGMENT);
    this.attributes={};this.uniforms={};
    for(const name of ['aPosition','aNormal','aColor','aEmission'])this.attributes[name]=gl.getAttribLocation(this.mainProgram,name);
    for(const name of ['uViewProjection','uModel','uEye','uFog'])this.uniforms[name]=gl.getUniformLocation(this.mainProgram,name);
    this.skyAttributes={position:gl.getAttribLocation(this.skyProgram,'aPosition')};this.skyUniforms={};
    for(const name of ['uTextureA','uTextureB','uTextureC','uReadyA','uReadyB','uReadyC','uWeights','uHeading','uAspect','uZenith','uHorizon'])this.skyUniforms[name]=gl.getUniformLocation(this.skyProgram,name);
    this.skyBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const world=buildWorld();
    this.meshes={terrain:upload(gl,world.terrain),road:upload(gl,buildRoad()),water:upload(gl,world.water),props:upload(gl,world.props),cars:[upload(gl,carMesh('#57dbe6')),upload(gl,carMesh('#ff9870'))],flames:upload(gl,flameMesh()),shadow:upload(gl,shadowMesh())};
    this.worldMatrix=identity();
    this.textures={};
    for(const [name,url] of Object.entries(this.sceneUrls))this._loadTexture(name,url);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.clearColor(.5,.68,.76,1);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  }
  _loadTexture(name,url) {
    const gl=this.gl,texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([140,180,195,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    const state=this.textures[name]={texture,ready:0};
    if(typeof Image==='undefined'||!url)return;
    const image=new Image();
    if(/^https?:/.test(url))image.crossOrigin='anonymous';
    image.onload=()=>{
      if(this.textures[name]!==state)return;
      try{gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);state.ready=1;}catch{state.ready=0;}
    };
    image.onerror=()=>{state.ready=0;};image.src=url;
  }
  resetCameras(engine,playerId) {
    if(playerId===undefined){this.cameras=engine.cars.map(car=>updateChaseCamera(car,null));return;}
    const index=engine.cars.findIndex(car=>car.id===playerId);
    if(index!==-1)this.cameras[index]=updateChaseCamera(engine.cars[index],null);
  }
  _mesh(mesh,model=this.worldMatrix) {
    if(!mesh.count)return;
    const gl=this.gl,a=this.attributes;
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
    for(const [name,size,offset]of[['aPosition',3,0],['aNormal',3,12],['aColor',4,24],['aEmission',1,40]]){
      gl.enableVertexAttribArray(a[name]);gl.vertexAttribPointer(a[name],size,gl.FLOAT,false,44,offset);
    }
    gl.uniformMatrix4fv(this.uniforms.uModel,false,model);gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }
  _sky(camera,weights,aspect) {
    const gl=this.gl,u=this.skyUniforms;
    const one=this.textures.coast,two=this.textures.alpine,three=this.textures.city;
    const color=field=>[0,1,2].map(i=>Object.entries(weights).reduce((sum,[name,w])=>sum+SCENES[name][field][i]*w,0));
    gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.useProgram(this.skyProgram);
    for(const loc of Object.values(this.attributes))gl.disableVertexAttribArray(loc);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.enableVertexAttribArray(this.skyAttributes.position);gl.vertexAttribPointer(this.skyAttributes.position,2,gl.FLOAT,false,0,0);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,one.texture);gl.uniform1i(u.uTextureA,0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,two.texture);gl.uniform1i(u.uTextureB,1);
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,three.texture);gl.uniform1i(u.uTextureC,2);
    gl.uniform1f(u.uReadyA,one.ready);gl.uniform1f(u.uReadyB,two.ready);gl.uniform1f(u.uReadyC,three.ready);
    gl.uniform3fv(u.uWeights,[weights.coast,weights.alpine,weights.city]);
    gl.uniform1f(u.uHeading,camera.angle);gl.uniform1f(u.uAspect,aspect);gl.uniform3fv(u.uZenith,color('zenith'));gl.uniform3fv(u.uHorizon,color('horizon'));
    gl.drawArrays(gl.TRIANGLES,0,6);gl.disableVertexAttribArray(this.skyAttributes.position);
    gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.useProgram(this.mainProgram);
    gl.uniform3fv(this.uniforms.uFog,color('fog'));
  }
  render(engine,dt=1/60,now=0) {
    if(!this.available)return;
    const gl=this.gl,w=this.canvas.width,h=this.canvas.height;
    if(!w||!h)return;
    gl.enable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);
    const divider=Math.floor(w/2);
    for(let i=0;i<2;i++) {
      const car=engine.cars[i];if(!car)continue;
      const x=i?divider:0,width=i?w-divider:divider;
      gl.viewport(x,0,width,h);gl.scissor(x,0,width,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const camera=this.cameras[i]=updateChaseCamera(car,this.cameras[i],dt);
      const aspect=width/h;
      this._sky(camera,sceneWeights(car.x,car.y),aspect);
      gl.uniformMatrix4fv(this.uniforms.uViewProjection,false,multiply(perspective(camera.fov,aspect),lookAt(camera.eye,camera.target)));
      gl.uniform3fv(this.uniforms.uEye,camera.eye);
      this._mesh(this.meshes.terrain);this._mesh(this.meshes.water);this._mesh(this.meshes.road);this._mesh(this.meshes.props);
      gl.enable(gl.BLEND);gl.depthMask(false);
      for(const vehicle of engine.cars)this._mesh(this.meshes.shadow,modelMatrix(vehicle.x,1.3,vehicle.y,vehicle.angle));
      gl.depthMask(true);gl.disable(gl.BLEND);
      for(let j=0;j<engine.cars.length;j++) {
        const vehicle=engine.cars[j],roll=-clamp(vehicle.steer||0,-1,1)*Math.min(Math.abs(vehicle.speed)/330,1)*.035;
        const bounce=vehicle.offroad?Math.sin(now*.041+vehicle.id)*Math.min(Math.abs(vehicle.speed)/100,1)*.7:0;
        const model=modelMatrix(vehicle.x,1.5+bounce,vehicle.y,vehicle.angle,roll);
        this._mesh(this.meshes.cars[j%2],model);
        if(vehicle.boosting)this._mesh(this.meshes.flames,model);
      }
    }
    gl.disable(gl.SCISSOR_TEST);
  }
}
