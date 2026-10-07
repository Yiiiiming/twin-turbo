import { isCityTheme, citySceneryPlacements, cityLandmarkPlacements, addCityLandmarks, addCityStreetScenery, addCityPavements } from './city-scenery.js';
import { SPLIT_FRACTIONS } from './split-timing.js';
/** Native WebGL racing renderer: two genuinely perspective, low chase cameras. */
import { TRACK, trackPoint, projectTrack, mod } from './engine.js';

const TAU = Math.PI * 2;
export const CAR_CLEARANCE_HEIGHT = 25;
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

function modelMatrix(x, y, z, angle, roll = 0, pitch = 0) {
  const c = Math.cos(angle), s = Math.sin(angle), cr = Math.cos(roll), sr = Math.sin(roll);
  const cp=Math.cos(pitch),sp=Math.sin(pitch);
  return new Float32Array([c*cp-s*sr*sp,cr*sp,s*cp+c*sr*sp,0,-c*sp-s*sr*cp,cr*cp,-s*sp+c*sr*cp,0,-s*cr,-sr,c*cr,0,x,y,z,1]);
}

/** Angles are unwrapped before smoothing, so crossing +/-pi never spins a camera. */
export function updateChaseCamera(car, previous, dt = 1 / 60) {
  const snap = !previous || Math.hypot(car.x - previous.carX, car.y - previous.carY) > 260;
  const blend = snap ? 1 : 1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) * 7.5);
  const turnBlend = snap ? 1 : 1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) * 9);
  const angle = snap ? car.angle : previous.angle + (mod(car.angle - previous.angle + Math.PI, TAU) - Math.PI) * turnBlend;
  const speed = clamp(Math.abs(car.speed || 0) / 517, 0, 1);
  const distance = 169 + speed * 18;
  const height = 76 + speed * 8;
  const lateral = 13;
  const cs = Math.cos(angle), sn = Math.sin(angle);
  const elevation=car.elevation||0,slope=car.slope||0;
  const desired = [car.x - cs * distance - sn * lateral, elevation+height-slope*distance*.65, car.y - sn * distance + cs * lateral];
  const eye = snap ? desired : desired.map((n, i) => mix(previous.eye[i], n, blend));
  const target = [car.x + cs * (72 + speed * 22), elevation+13+slope*(72+speed*22), car.y + sn * (72 + speed * 22)];
  const desiredFov = (car.boosting ? 68 : 59 + speed * 3) * Math.PI / 180;
  return { angle, eye, target, fov: snap ? desiredFov : mix(previous.fov, desiredFov, blend), carX: car.x, carY: car.y };
}

const rgba = (color, alpha = 1) => {
  if (Array.isArray(color)) return color.length === 4 ? color : [...color, alpha];
  const h = color.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, alpha];
};

class MeshBuilder {
  constructor(colliders=null) { this.data = [];this.colliders=colliders; }
  vertex(v, normal, color, emission = 0) { this.data.push(...v, ...normal, ...rgba(color), emission); }
  triangle(a, b, c, color, emission = 0, normal) {
    normal ||= normalize(cross(b.map((n, i) => n - a[i]), c.map((n, i) => n - a[i])));
    this.vertex(a, normal, color, emission); this.vertex(b, normal, color, emission); this.vertex(c, normal, color, emission);
  }
  quad(a, b, c, d, color, emission = 0, normal) {
    this.triangle(a, b, c, color, emission, normal); this.triangle(a, c, d, color, emission, normal);
  }
  box(x, y, z, sx, sy, sz, color, angle = 0, emission = 0) {
    // Only the scene builder opts in. Roads, paint, vehicles and shadows do not.
    if(this.colliders&&(TRACK.id!=='coast'||y-sy/2<CAR_CLEARANCE_HEIGHT)&&y+sy/2>0)this.colliders.push({
      id:`prop-${this.colliders.length}`,type:'box',x,y:z,halfWidth:sx/2,halfDepth:sz/2,angle,
      ...(TRACK.id!=='coast'?{minHeight:y-sy/2,maxHeight:y+sy/2}:{}),
    });
    const c = Math.cos(angle), s = Math.sin(angle);
    const p = (a, b, d) => [x + c * a - s * d, y + b, z + s * a + c * d];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const v = [p(-hx,-hy,-hz),p(hx,-hy,-hz),p(hx,hy,-hz),p(-hx,hy,-hz),p(-hx,-hy,hz),p(hx,-hy,hz),p(hx,hy,hz),p(-hx,hy,hz)];
    for (const [a,b,d,e] of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]]) this.quad(v[a],v[b],v[d],v[e],color,emission);
  }
  cone(x, y, z, radius, height, color, sides = 7, topRadius = 0, phase = 0) {
    // Use the largest real cross-section inside the vehicle's height band.
    // Low foliage is solid; crowns wholly above the roof remain passable below.
    if(this.colliders&&(TRACK.id!=='coast'||y<CAR_CLEARANCE_HEIGHT)&&y+height>0) {
      const sectionAt=heightY=>mix(radius,topRadius,clamp((heightY-y)/height,0,1));
      this.colliders.push({id:`prop-${this.colliders.length}`,type:'circle',x,y:z,
        radius:TRACK.id!=='coast'?Math.max(radius,topRadius):Math.max(sectionAt(Math.max(y,0)),sectionAt(Math.min(y+height,CAR_CLEARANCE_HEIGHT))),
        ...(TRACK.id!=='coast'?{minHeight:y,maxHeight:y+height}:{}),
      });
    }
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
uniform float uLondon;
void main(){
  vec3 gradient = mix(uHorizon,uZenith,pow(clamp(vUV.y,0.0,1.0),0.7));
  // Gentle repeating parallax keeps the painted horizon stable through corners.
  float x = 0.5 + (vUV.x - 0.5) * min(uAspect * 0.5,0.8) + sin(uHeading) * 0.085;
  float y = clamp((vUV.y-0.13)*1.13,0.0,1.0);
  vec3 a = mix(gradient,texture2D(uTextureA,vec2(x,y)).rgb,uReadyA);
  vec3 b = mix(gradient,texture2D(uTextureB,vec2(x,y)).rgb,uReadyB);
  vec3 c = mix(gradient,texture2D(uTextureC,vec2(x,y)).rgb,uReadyC);
  vec3 image = a*uWeights.x+b*uWeights.y+c*uWeights.z;
  float luminance=dot(image,vec3(.2126,.7152,.0722));
  image=mix(image,vec3(luminance)*vec3(.84,.98,1.13),uLondon*.64);
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
    mesh.quad([p.x,p.elevation+height,p.y],[q.x,q.elevation+height,q.y],[r.x,r.elevation+height,r.y],[t.x,t.elevation+height,t.y],color,emission,normalize([-p.slope*Math.cos(p.angle),1,-p.slope*Math.sin(p.angle)]));
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
    if (trackPoint(s).elevation > 3) {
      strip(s,-half-16,half+16,-7,'#263d48');
      for(const side of [-1,1]) {
        const a=trackPoint(s,side*(half+16)),b=trackPoint(s+step,side*(half+16));
        mesh.quad([a.x,a.elevation-7,a.y],[b.x,b.elevation-7,b.y],[b.x,b.elevation+.35,b.y],[a.x,a.elevation+.35,a.y],'#687b80');
      }
    }
  }
  const start = TRACK.startDistance, cells = 12, depth = 7;
  for (let row = 0; row < 3; row++) for (let col = 0; col < cells; col++) {
    const d = start+row*depth, a = -half + col*TRACK.roadWidth/cells, b = a+TRACK.roadWidth/cells;
    const p=trackPoint(d,a),q=trackPoint(d+depth,a),r=trackPoint(d+depth,b),t=trackPoint(d,b);
    mesh.quad([p.x,p.elevation+1.1,p.y],[q.x,q.elevation+1.1,q.y],[r.x,r.elevation+1.1,r.y],[t.x,t.elevation+1.1,t.y],(row+col)%2?'#eff6f7':'#101b2c',0,[0,1,0]);
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

/** Smooth, coordinated terrain palettes keep asphalt and curbs easy to read. */
export const TERRAIN_PALETTES=Object.freeze({
  coast:'#857766','coast-bay':'#91aa9b','coast-pines':'#2f5445','coast-neon':'#30394f',
  'coast-marina':'#8d6456','coast-grand':'#958556','coast-ridge':'#637881','coast-london':'#72817b','coast-beijing':'#8d947d','coast-austin':'#929476','coast-rio':'#b6bd8e',
});
const localPoint=(x,z,angle,forward,up,lateral)=>[x+Math.cos(angle)*forward-Math.sin(angle)*lateral,up,z+Math.sin(angle)*forward+Math.cos(angle)*lateral];

// A real prism, not a screen-facing sprite: landmarks stay solid from both views.
function beam(mesh,a,b,width,color) {
  const axis=normalize(b.map((v,i)=>v-a[i])),u=normalize(cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0]));
  const v=cross(axis,u),p=(end,s,t)=>end.map((n,i)=>n+(u[i]*s+v[i]*t)*width/2);
  const ring=end=>[p(end,-1,-1),p(end,1,-1),p(end,1,1),p(end,-1,1)],ra=ring(a),rb=ring(b);
  mesh.quad(...ra,color);mesh.quad(...rb,color);
  for(let i=0;i<4;i++)mesh.quad(ra[i],rb[i],rb[(i+1)%4],ra[(i+1)%4],color);
  if(mesh.colliders)mesh.colliders.push({id:`prop-${mesh.colliders.length}`,type:'box',x:(a[0]+b[0])/2,y:(a[2]+b[2])/2,
    halfWidth:(Math.hypot(b[0]-a[0],b[2]-a[2])+width)/2,halfDepth:width/2,angle:Math.atan2(b[2]-a[2],b[0]-a[0]),
    minHeight:Math.min(a[1],b[1])-width/2,maxHeight:Math.max(a[1],b[1])+width/2});
}
function verticalFace(mesh,center,right,normal,radius,color,sides=64) {
  const p=a=>center.map((n,i)=>n+right[i]*Math.cos(a)*radius+(i===1?Math.sin(a)*radius:0));
  for(let i=0;i<sides;i++)mesh.triangle(center,p(i/sides*TAU),p((i+1)/sides*TAU),color,.12,normal);
}

export function londonLandmarkPlacements() {
  if(TRACK.theme!=='london')return [];
  const tower=TRACK.bridges[0],westminster=TRACK.bridges[1],items=[];
  for(const station of [-240,240])for(const side of [-1,1]){
    const p=trackPoint(tower.s+station,side*114);
    items.push({kind:'tower-bridge-tower',x:p.x,z:p.y,angle:p.angle,radius:41,deck:tower.deckHeight,station,side});
  }
  const add=(kind,s,lane,radius,extra={})=>{const p=trackPoint(s,lane);items.push({kind,x:p.x,z:p.y,angle:p.angle,radius,...extra});};
  add('big-ben',westminster.s+750,-200,67);
  add('london-eye',westminster.s-1040,290,216);
  for(const [s,lane] of [[3100,-135],[10700,-145],[13600,140]])add('london-bus',s,lane,43);
  return items;
}
function londonSceneryPlacements() {
  const rng=random(614092),items=[],landmarks=londonLandmarkPlacements();
  for(let s=90,index=0;s<TRACK.length;s+=108,index++)for(const side of [-1,1]){
    const p=trackPoint(s,side*(150+rng()*45));
    if(p.elevation>5)continue;
    const tree=index%5===0,width=tree?25:62+rng()*32,depth=tree?25:52+rng()*18;
    const radius=tree?27:Math.hypot(width+8,depth+8)/2;
    if(Math.abs(p.y-TRACK.river.centerZ)<TRACK.river.halfWidth+radius+28||projectTrack(p.x,p.y).distance<radius+76)continue;
    if(landmarks.some(item=>Math.hypot(item.x-p.x,item.z-p.y)<item.radius+radius+35))continue;
    // Inner bends compress road-relative spacing: protect full roofs and crowns.
    if(items.some(item=>Math.hypot(item.x-p.x,item.z-p.y)<item.radius+radius+8))continue;
    items.push({kind:tree?'london-tree':'terrace',x:p.x,z:p.y,angle:p.angle,side,radius,width,depth,height:tree?78:72+rng()*50,variant:index%5});
  }
  return items;
}
function englishTerrace(mesh,item) {
  const {x,z,width:w,depth:d,height:h,angle,variant,side}=item;
  const colors=['#a05f4e','#bb8c70','#95775e','#a86d56','#b6ac91'],stone='#d5cbb4',slate='#3a4652',glass='#344a54';
  const box=(f,y,l,sx,sy,sz,color)=>mesh.box(...localPoint(x,z,angle,f,y,l),sx,sy,sz,color,angle);
  box(0,h/2,0,w,h,d,colors[variant]);box(0,h-3,0,w+6,6,d+6,stone);box(0,3,0,w+5,6,d+5,'#9c9c8e');
  // Real pitched roofs, chimney pots and varied masonry replace repeated cuboids.
  const p=(f,y,l)=>localPoint(x,z,angle,f,y,l),ridge=h+17;
  for(const roofSide of [-1,1])mesh.quad(p(-w/2-3,h,roofSide*(d/2+3)),p(w/2+3,h,roofSide*(d/2+3)),p(w/2+3,ridge,0),p(-w/2-3,ridge,0),slate);
  for(const end of [-1,1])mesh.triangle(p(end*w/2,h,-d/2),p(end*w/2,h,d/2),p(end*w/2,ridge,0),colors[variant]);
  for(const chimney of [-1,1]){box(chimney*w*.3,h+17,side*d*.15,8,24,9,colors[variant]);for(const pot of [-2,2])box(chimney*w*.3+pot,h+32,side*d*.15,2.7,8,3,'#755347');}
  const front=-side*(d/2+.8),rows=Math.max(2,Math.floor((h-25)/24)),cols=Math.max(3,Math.round(w/20));
  box(0,14,front,w*.9,24,1.4,variant%2?'#284848':'#314353');box(0,29,front,w*.94,5,2.2,stone);
  for(let col=0;col<cols;col++){
    const f=-w*.39+col*w*.78/(cols-1);box(f,14,front-side*.8,11,17,1.3,glass);
    for(let row=0;row<rows;row++){
      const y=44+row*23;box(f,y,front,12,17,2,stone);box(f,y,front-side*1.3,8.5,13.5,1.3,glass);
      box(f,y,front-side*2.1,.8,13.5,.8,stone);box(f,y,front-side*2.1,8.5,.8,.8,stone);
      box(f,y-9,front-side*1.3,15,2,4,stone);
    }
  }
  for(let y=36;y<h-9;y+=12)box(0,y,front+side*.3,w,.45,.8,variant%2?'#9e7966':'#8d594e');
}
function londonTree(mesh,item) {
  mesh.cone(item.x,0,item.z,4,46,'#736658',12,3);
  mesh.cone(item.x,30,item.z,17,17,'#577b63',18,27);mesh.cone(item.x,47,item.z,27,25,'#64886b',20,16);
  mesh.cone(item.x,72,item.z,16,10,'#718e6d',18,0);
}
function londonBus(mesh,item) {
  const {x,z,angle}=item,box=(f,y,l,sx,sy,sz,color)=>mesh.box(...localPoint(x,z,angle,f,y,l),sx,sy,sz,color,angle);
  box(0,8,0,71,7,25,'#242d30');box(0,29,0,73,39,27,'#bd343d');box(0,49,0,70,3,26,'#da4b4d');
  for(const side of [-1,1]){
    for(const f of [-23,22])box(f,7,side*14,12,12,4,'#202830');
    for(let f=-27;f<31;f+=12)for(const y of [23,40])box(f,y,side*13.8,10,11,1,'#283e48');
    box(0,31,side*14,70,3,1,'#e5c9aa');box(-5,31,side*14.6,35,5,1,'#efe3c9');
    for(const f of [-15,-4,7])box(f,31,side*15.3,5,1.2,.5,'#a14540');
  }
  box(37,39,0,1,13,22,'#30434e');box(37,23,0,1,13,22,'#30434e');box(37.6,48,0,1,5,22,'#223234');
  for(const side of [-1,1]){box(38,13,side*9,1,3,4,'#f3dfa7');box(-37,13,side*9,1,3,3,'#ec7766');}
  for(const l of [-7,-3,1,6])box(38.3,48,l,1,2,l===6?3:2,'#f1d79a');
}
function bigBen(mesh,item) {
  const {x,z,angle}=item,stone='#d1bb8c',trim='#e4d3aa',dark='#46534e',box=(f,y,l,sx,sy,sz,color)=>mesh.box(...localPoint(x,z,angle,f,y,l),sx,sy,sz,color,angle);
  box(0,7,0,86,14,86,'#b4ae94');box(0,119,0,62,224,62,stone);
  for(const f of [-1,1])for(const l of [-1,1])box(f*29,123,l*29,8,232,8,trim);
  for(const y of [28,75,121,164,207,253])box(0,y,0,y===253?77:69,7,y===253?77:69,trim);
  box(0,231,0,71,42,71,stone);
  for(const side of [-1,1])for(let i=-2;i<=2;i++)for(const y of [49,96,142,183]){
    box(i*10,y,side*31.5,3,28,1.3,dark);box(side*31.5,y,i*10,1.3,28,3,dark);
  }
  for(const faceAngle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const a=angle+faceAngle,normal=[Math.cos(a),0,Math.sin(a)],right=[-Math.sin(a),0,Math.cos(a)];
    const center=[x+normal[0]*36.1,233,z+normal[2]*36.1];
    verticalFace(mesh,center,right,normal,17.3,'#b89447');
    const front=center.map((n,i)=>n+normal[i]*.25);verticalFace(mesh,front,right,normal,15,'#f3e9ca');
    for(let tick=0;tick<12;tick++){
      const t=tick/12*TAU,point=r=>front.map((n,i)=>n+right[i]*Math.sin(t)*r+(i===1?Math.cos(t)*r:0)+normal[i]*.3);
      beam(mesh,point(12),point(14),.9,'#334039');
    }
    const hand=(theta,length)=>{const a=front.map((n,i)=>n+normal[i]*.8),b=a.map((n,i)=>n+right[i]*Math.sin(theta)*length+(i===1?Math.cos(theta)*length:0));beam(mesh,a,b,1.4,'#24332f');};
    hand(-Math.PI/3,8);hand(Math.PI/2,12);
  }
  box(0,264,0,58,17,58,dark);for(const f of [-1,1])for(const l of [-1,1]){
    const p=localPoint(x,z,angle,f*31,256,l*31);mesh.cone(p[0],p[1],p[2],7,33,trim,4,1,angle+Math.PI/4);
  }
  mesh.cone(x,272,z,43,74,'#3b514b',4,4,angle+Math.PI/4);mesh.cone(x,346,z,4,34,'#c2a55b',12,0);
}
function londonEye(mesh,item) {
  const {x,z}=item,angle=item.angle+Math.PI/2,radius=191,hubHeight=222,right=[Math.cos(angle),0,Math.sin(angle)],normal=[-Math.sin(angle),0,Math.cos(angle)];
  const p=(a,depth=0,r=radius)=>[x+right[0]*Math.cos(a)*r+normal[0]*depth,hubHeight+Math.sin(a)*r,z+right[2]*Math.cos(a)*r+normal[2]*depth];
  for(const depth of [-8,8])for(let i=0;i<112;i++)beam(mesh,p(i/112*TAU,depth),p((i+1)/112*TAU,depth),3,'#e1e9df');
  const hub=[x,hubHeight,z];
  for(let i=0;i<32;i++){
    const a=i/32*TAU;beam(mesh,hub,p(a),1.1,'#bbc9ca');
    const q=p(a,0,radius+5);mesh.box(q[0],q[1],q[2],17,11,24,'#a1c3ca',angle);mesh.box(q[0],q[1]-5,q[2],18,2,25,'#e2e8dc',angle);
    beam(mesh,p(a,-8),p(a,8),2,'#d7e3dc');
  }
  for(const side of [-1,1]){
    const foot=[x+right[0]*side*95+normal[0]*38,7,z+right[2]*side*95+normal[2]*38];
    mesh.box(foot[0],5,foot[2],38,10,32,'#acb8b1',angle);beam(mesh,foot,hub,12,'#dbe4dd');
  }
  beam(mesh,[x-normal[0]*16,hubHeight,z-normal[2]*16],[x+normal[0]*22,hubHeight,z+normal[2]*22],17,'#d9e0d8');
}
function towerBridge(mesh) {
  const bridge=TRACK.bridges[0],deck=bridge.deckHeight,stone='#c7c7b0',trim='#e0dac2',blue='#5c9caf';
  for(const item of londonLandmarkPlacements().filter(i=>i.kind==='tower-bridge-tower')){
    const {x,z,angle}=item,box=(f,y,l,sx,sy,sz,color)=>mesh.box(...localPoint(x,z,angle,f,y,l),sx,sy,sz,color,angle);
    box(0,(deck+148)/2,0,52,deck+148,54,stone);box(0,deck+148,0,62,10,63,trim);
    for(const y of [deck+30,deck+83,deck+132])box(0,y,0,58,5,59,trim);
    for(const face of [-1,1])for(const column of [-1,1]){
      box(face*27,deck+98,column*13,1.5,31,7,'#405866');box(column*13,deck+98,face*28,7,31,1.5,'#405866');
    }
    for(const f of [-1,1])for(const l of [-1,1]){
      box(f*24,deck+151,l*25,9,35,9,trim);
      const p=localPoint(x,z,angle,f*24,deck+168,l*25);mesh.cone(p[0],p[1],p[2],8,23,'#52768b',4,0,angle+Math.PI/4);
    }
    mesh.cone(x,deck+153,z,37,50,'#4c6e82',4,3,angle+Math.PI/4);mesh.cone(x,deck+203,z,2,15,'#bdb78e',10,0);
  }
  for(const station of [-240,240]){
    const q=trackPoint(bridge.s+station);mesh.box(q.x,deck+168,q.y,38,19,282,trim,q.angle);
    mesh.box(q.x,deck+179,q.y,40,3,283,blue,q.angle);
    for(const side of [-1,1])for(let i=0;i<4;i++){
      const p=trackPoint(bridge.s+station,side*(65+i*13));mesh.box(p.x,deck+153+i*3,p.y,38,5,13,trim,q.angle);
    }
  }
  for(const side of [-1,1]){
    const a=trackPoint(bridge.s-240,side*92),b=trackPoint(bridge.s+240,side*92);
    mesh.box((a.x+b.x)/2,deck+155,(a.y+b.y)/2,480,9,14,blue,bridge.angle);
    for(let offset=-500;offset<500;offset+=25){
      const a=trackPoint(bridge.s+offset,side*91),b=trackPoint(bridge.s+offset+25,side*91);
      const cableHeight=s=>deck+35+95*Math.max(0,1-Math.abs(Math.abs(s)-240)/260);
      beam(mesh,[a.x,cableHeight(offset),a.y],[b.x,cableHeight(offset+25),b.y],4,blue);
      if(offset%50===0)beam(mesh,[a.x,deck+27,a.y],[a.x,cableHeight(offset),a.y],2,trim);
    }
  }
}
function addLondonLandmarks(mesh) {
  towerBridge(mesh);
  for(const item of londonLandmarkPlacements()){
    if(item.kind==='big-ben')bigBen(mesh,item);
    else if(item.kind==='london-eye')londonEye(mesh,item);
    else if(item.kind==='london-bus')londonBus(mesh,item);
  }
  // River embankments stop outside every road approach, never across a bridge.
  for(const side of [-1,1])for(let x=-750;x<TRACK.width+750;x+=76){
    const z=TRACK.river.centerZ+side*(TRACK.river.halfWidth+8);
    if(projectTrack(x,z).distance<140)continue;
    mesh.box(x,9,z,76,18,12,'#a7b0a2');mesh.box(x,19,z,78,3,15,'#c4caba');
    for(const offset of [-30,0,30])mesh.box(x+offset,28,z,1.8,18,1.8,'#405251');
    mesh.box(x,37,z,76,2,2,'#4e6462');
  }
}
function londonPavements(mesh) {
  for(let s=0;s<TRACK.length;s+=22)for(const side of [-1,1]) {
    const a=trackPoint(s,side*67),b=trackPoint(s+22,side*67),c=trackPoint(s+22,side*126),d=trackPoint(s,side*126);
    if(Math.max(a.elevation,b.elevation)>3||[a,b,c,d].some(p=>Math.abs(p.y-TRACK.river.centerZ)<TRACK.river.halfWidth+12))continue;
    mesh.quad([a.x,.5,a.y],[b.x,.5,b.y],[c.x,.5,c.y],[d.x,.5,d.y],'#aaa99c',0,[0,1,0]);
    const e=trackPoint(s+.7,side*67),f=trackPoint(s+.7,side*126);
    mesh.quad([a.x,.6,a.y],[e.x,.6,e.y],[f.x,.6,f.y],[d.x,.6,d.y],'#969b94',0,[0,1,0]);
  }
}

const shoreBoundary = () => Math.max(...sampleRoadRibbon(50).map(row=>row.center.y))+TRACK.roadWidth/2+90;

/** Exact placements used by the renderer; radius includes roof and leaf overhang. */
export function sceneryPlacements() {
  if(isCityTheme())return citySceneryPlacements();
  if(TRACK.theme==='london')return londonSceneryPlacements();
  const rng=random(216902+(TRACK.theme?.length||0)*7129),w=TRACK.width,h=TRACK.height,shore=shoreBoundary(),placements=[];
  const district=(x,z)=>TRACK.theme==='neon'?'city':TRACK.theme==='pines'||TRACK.theme==='ridge'?'forest'
    :TRACK.theme==='bay'||TRACK.theme==='marina'?'coast':z>h*.66?'coast':x>w*.53?'city':'forest';
  const add=(kind,x,z,dimensions)=>{
    const radius=kind==='pine'?dimensions.size*22:kind==='palm'?dimensions.size*48
      :kind==='building'?Math.hypot(dimensions.width+4,dimensions.depth+4)/2:dimensions.radius;
    if(projectTrack(x,z).distance<TRACK.roadWidth/2+radius+10||z+radius>shore-10)return;
    placements.push({kind,x,z,...dimensions,radius});
  };
  for(let i=0;i<520;i++) {
    const x=-110+rng()*(w+220),z=-160+rng()*(h+225);
    if(district(x,z)==='coast') {
      if(rng()<.51)add('palm',x,z,{size:.65+rng()*.7});
      else if(rng()<.3)add('rock',x,z,{radius:15+rng()*18,height:9+rng()*18});
    } else if(district(x,z)==='forest')add('pine',x,z,{size:.57+rng()*.8});
    else if(rng()<.38)add('building',x,z,{width:36+rng()*44,depth:36+rng()*44,height:50+rng()*130});
    else if(rng()<.5)add('rock',x,z,{radius:12+rng()*16,height:14+rng()*21});
  }
  // Road-relative density stays the same when the driving map is enlarged.
  for(let s=0,i=0;s<TRACK.length;s+=55,i++) {
    const p=trackPoint(s),coastal=TRACK.theme?district(p.x,p.y)==='coast':p.y>h*.65,city=TRACK.theme?district(p.x,p.y)==='city':p.x>w*.55&&!coastal;
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

/** Local +Z is the driver's right: an outer mast's arm must extend toward -side. */
export function lampGeometry(distance,side=1) {
  const q=trackPoint(distance,side*(TRACK.roadWidth/2+27));
  const right=[-Math.sin(q.angle),Math.cos(q.angle)];
  const inward=(reach,height)=>[q.x-right[0]*side*reach,q.elevation+height,q.y-right[1]*side*reach];
  return {s:distance,side,angle:q.angle,
    mast:{position:[q.x,q.elevation+37,q.y],size:[3,74,3]},
    arm:{position:inward(22,73),size:[3,3,46]},
    head:{position:inward(43,71),size:[9,4,12]},
    lens:{position:inward(43,68.6),size:[8,.7,10]},
  };
}

export function roadsideLamps() {
  const lamps=[];
  for(let s=0,i=0;s<TRACK.length;s+=47,i++) {
    const p=trackPoint(s),coastal=p.y>TRACK.height*.63,city=p.x>TRACK.width*.56&&p.y<TRACK.height*.63;
    if((coastal||city||TRACK.theme==='neon'||TRACK.theme==='ridge'||TRACK.theme==='london'||isCityTheme())&&i%3===0)lamps.push(lampGeometry(s));
  }
  return lamps;
}

/** Paint sits on the upstream face, with three actual > or < shaped chevrons. */
export function cornerMarkerGeometry(marker) {
  const forward=[Math.cos(marker.angle),Math.sin(marker.angle)],right=[-forward[1],forward[0]];
  const normal=[-forward[0],0,-forward[1]],direction=Math.sign(marker.turn);
  const point=(horizontal,height)=>[marker.x-forward[0]*1.2+right[0]*horizontal,(marker.elevation||0)+height,marker.y-forward[1]*1.2+right[1]*horizontal];
  const stroke=(a,b)=>{
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const dx=-(b[1]-a[1])/length*.85,dy=(b[0]-a[0])/length*.85;
    return [point(a[0]+dx,a[1]+dy),point(b[0]+dx,b[1]+dy),point(b[0]-dx,b[1]-dy),point(a[0]-dx,a[1]-dy)];
  };
  const chevrons=[];
  for(const center of [-7,0,7]) {
    const upper=[center-direction*2.5,45],tip=[center+direction*2.5,40],lower=[center-direction*2.5,35];
    chevrons.push({tip:point(...tip),tails:[point(...upper),point(...lower)],strokes:[stroke(upper,tip),stroke(tip,lower)]});
  }
  return {normal,chevrons};
}

/** Timing points share the physics gate spacing. Posts leave full racing width. */
export function timingGateGeometry() {
  return SPLIT_FRACTIONS.map((fraction,index) => {
    const s = TRACK.startDistance + TRACK.length * fraction, center = trackPoint(s);
    const halfSpan = TRACK.roadWidth / 2 + 30;
    return { index:index+1, fraction, s, center, halfSpan, finish:index===3,
      posts:[-1,1].map(side=>trackPoint(s,side*halfSpan)),
      normal:[-Math.cos(center.angle),0,-Math.sin(center.angle)] };
  });
}
function addTimingGates(mesh) {
  const digits = {
    1:[[6,11,2,18]],
    2:[[0,21,14,2],[6,16,2,10],[0,11,14,2],[-6,6,2,10],[0,1,14,2]],
    3:[[0,21,14,2],[6,16,2,10],[0,11,14,2],[6,6,2,10],[0,1,14,2]],
  };
  for (const gate of timingGateGeometry().filter(gate=>!gate.finish)) {
    const {center,halfSpan}=gate;
    // Only slim supports touch the ground. The shared scene builder gives them
    // colliders; every overhead component clears the car by more than 60 units.
    for(const post of gate.posts) {
      mesh.box(post.x,post.elevation+4,post.y,10,8,10,'#243f4b',center.angle);
      mesh.box(post.x,post.elevation+50,post.y,5,100,5,'#354e5a',center.angle);
      mesh.box(post.x,post.elevation+60,post.y,5.6,51,5.6,'#93dccc',center.angle,.5);
    }
    mesh.box(center.x,center.elevation+102,center.y,7,8,halfSpan*2+9,'#213842',center.angle);
    mesh.box(center.x,center.elevation+98,center.y,7.4,1.8,halfSpan*2,'#a9e5cc',center.angle,.8);
    const face=(forward,height,lateral)=>[
      center.x+Math.cos(center.angle)*forward-Math.sin(center.angle)*lateral,center.elevation+height,
      center.y+Math.sin(center.angle)*forward+Math.cos(center.angle)*lateral];
    mesh.box(...face(-1,111,0),9,29,46,'#18313f',center.angle);
    for(const [lateral,height,width,tall] of digits[gate.index]) {
      mesh.box(...face(-5.6,99+height,lateral),.7,tall,width,'#d8ffe6',center.angle,.8);
    }
    // Three small lamps distinguish these split beacons from the start gantry.
    for(let i=0;i<3;i++)mesh.box(...face(-4.2,102,halfSpan-17-i*8),1,2,4,'#e4f7dd',center.angle,.8);
  }
}

/** Curated focal points occupy verified infield or waterside clearances. */
export function harborLandmarkPlacements() {
  if(isCityTheme())return cityLandmarkPlacements();
  if(TRACK.theme==='london')return londonLandmarkPlacements();
  if(!TRACK.theme)return [];
  if(TRACK.spirals)return TRACK.spirals.map((spiral,index)=>({kind:'spiral-core',x:spiral.cx,z:spiral.cy,radius:95,height:625,index}));
  const candidates=[];
  for(let x=450;x<TRACK.width-450;x+=310)for(let z=450;z<TRACK.height-450;z+=310){
    const clear=projectTrack(x,z).distance;
    if(clear>190)candidates.push({x,z,clear,score:Math.hypot(x-TRACK.width*.5,z-TRACK.height*.48)});
  }
  const center=candidates.sort((a,b)=>a.score-b.score)[0];
  const result=[];
  if(center)result.push({...center,kind:TRACK.theme==='neon'?'neon-plaza':TRACK.theme==='pines'?'forest-lodge':'sailing-club',radius:145});
  if(['bay','marina','grand'].includes(TRACK.theme))result.push({kind:'lighthouse',x:TRACK.width*.32,z:shoreBoundary()+88,radius:48});
  return result;
}
function addHarborLandmarks(mesh,shore) {
  if(isCityTheme()){addCityLandmarks(mesh);return;}
  if(TRACK.theme==='london'){addLondonLandmarks(mesh);return;}
  const rng=random(79521);
  for(const item of harborLandmarkPlacements()){
    const {x,z}=item;
    if(item.kind==='lighthouse'){
      mesh.cone(x,0,z,45,9,'#c0c4b3',32,45);
      for(let i=0;i<6;i++)mesh.cone(x,9+i*23,z,24-i*1.5,23,i%2?'#e5e4d6':'#bd6353',28,22.5-i*1.5);
      mesh.cone(x,147,z,23,6,'#d0d3bf',32,23);mesh.cone(x,153,z,15,25,'#9adfd5',20,15);
      for(let i=0;i<8;i++){const a=i/8*TAU;mesh.box(x+Math.cos(a)*16,165,z+Math.sin(a)*16,1.5,25,1.5,'#334e59');}
      mesh.cone(x,178,z,24,19,'#36535b',24,0);mesh.cone(x,198,z,2,13,'#cfbc85',12,0);
      mesh.box(x,164,z,10,9,10,'#ffe6a6',0,1);
    }else if(item.kind==='spiral-core'){
      mesh.cone(x,0,z,69,22,'#364e5a',32,69);mesh.cone(x,22,z,44,577,'#617e89',32,34);
      for(let h=65;h<600;h+=57){mesh.cone(x,h,z,46,3,'#92cecc',32,46);}
      mesh.cone(x,599,z,58,12,'#385667',32,58);mesh.cone(x,611,z,42,14,'#b6dce0',32,0);
      for(let i=0;i<8;i++){const a=i/8*TAU;mesh.box(x+Math.cos(a)*45,300,z+Math.sin(a)*45,3,565,3,item.index?'#d8b776':'#8fc7d8');}
    }else if(item.kind==='neon-plaza'){
      building(mesh,x,z,96,90,300,rng);building(mesh,x+101,z-22,50,64,195,rng);
      mesh.box(x,316,z,105,9,98,'#65e9dc',0,.8);mesh.box(x,333,z,55,25,48,'#284453');
      for(const side of [-1,1]){mesh.box(x+side*52,158,z,3,300,5,'#ea90d1',0,.8);mesh.box(x,160,z+side*48,72,4,1,'#91ebdc',0,.6);}
      mesh.cone(x,346,z,3,85,'#c0d9cd',16,0);
    }else if(item.kind==='forest-lodge'){
      mesh.box(x,28,z,120,56,82,'#8d6a48');mesh.cone(x,53,z,90,48,'#426254',6,0,Math.PI/6);
      for(const side of [-1,1])for(let k=-2;k<=2;k++)mesh.box(x+k*21,29,z+side*42,11,18,2,'#ffd59a',0,.25);
      mesh.box(x-57,41,z-26,13,82,16,'#9b9f8a');mesh.box(x,7,z+63,136,14,30,'#bdac83');
      for(const side of [-1,1])pine(mesh,x+side*120,z+28,1.8,rng);
    }else{
      mesh.box(x,21,z,140,42,74,'#dedbca');mesh.box(x,45,z,153,6,82,'#476979');
      for(let k=-3;k<=3;k++){mesh.box(x+k*18,24,z+38,13,25,1,'#436573');mesh.box(x+k*18,50,z+44,3,18,3,'#d1c09b');}
      mesh.box(x,60,z+44,136,3,3,'#d1c09b');
      for(const side of [-1,1]){mesh.box(x+side*115,55,z,2,110,2,'#c9d7d0');mesh.triangle([x+side*115,109,z],[x+side*115,65,z],[x+side*115+35,72,z],'#e8e1bd',.1);}
    }
  }
}

function buildWorld() {
  const obstacles=[],terrain=new MeshBuilder(), props=new MeshBuilder(obstacles), water=new MeshBuilder();
  const rng=random(90421), w=TRACK.width, h=TRACK.height;
  const shoreZ=shoreBoundary();
  const grid=130;
  for(let x=-1200;x<w+1200;x+=grid) for(let z=-1200;z<h+1200;z+=grid) {
    const n=(rng()-.5)*.012;
    const c=rgba(TERRAIN_PALETTES[TRACK.id]||'#72817b').slice(0,3).map(component=>component+n);
    terrain.quad([x,-.1,z],[x+grid,-.1,z],[x+grid,-.1,z+grid],[x,-.1,z+grid],c,0,[0,1,0]);
  }
  // Ocean begins beyond the southern road shoulder; the circuit remains flat.
  const london=TRACK.theme==='london',themedCity=isCityTheme(),river=TRACK.river,inland=TRACK.theme==='beijing';
  if(london)londonPavements(terrain);
  if(themedCity)addCityPavements(terrain);
  const waterStart=river?river.centerZ-river.halfWidth:shoreZ,waterEnd=river?river.centerZ+river.halfWidth:h+2600;
  if(!inland)water.quad([-1800,.12,waterStart],[w+2400,.12,waterStart],[w+2400,.12,waterEnd],[-1800,.12,waterEnd],london?'#577f88':'#318caa',.2,[0,1,0]);
  for(let i=0;i<(inland?0:85);i++) {
    const x=-1100+rng()*(w+2200),z=waterStart+15+rng()*(river?waterEnd-waterStart-30:1600),len=25+rng()*130;
    water.quad([x,.17,z],[x+len,.17,z],[x+len,.17,z+1.6],[x,.17,z+1.6],'#78c6ce',.4,[0,1,0]);
  }
  // Angular distant mountains, layered enough to read under a low horizon.
  for(let i=0;i<(london||themedCity?0:32);i++) {
    const a=(i/32)*TAU, cx=w*.48+Math.cos(a)*(w*.7+180),cz=h*.47+Math.sin(a)*(h*.8+180);
    if(cz>h*.87) continue;
    const radius=140+rng()*220,height=160+rng()*300;
    props.cone(cx,-2,cz,radius,height,i%2?'#53766e':'#466568',6,0,rng()*2);
    if(height>340) props.cone(cx,height*.63,cz,radius*.36,height*.37,'#c3d5cf',6,0,rng()*2);
  }
  for(const item of sceneryPlacements()) {
    if(themedCity)addCityStreetScenery(props,item);
    else if(item.kind==='terrace')englishTerrace(props,item);
    else if(item.kind==='london-tree')londonTree(props,item);
    else if(item.kind==='pine')pine(props,item.x,item.z,item.size,rng);
    else if(item.kind==='palm')palm(props,item.x,item.z,item.size,rng);
    else if(item.kind==='building')building(props,item.x,item.z,item.width,item.depth,item.height,rng);
    else props.cone(item.x,0,item.z,item.radius,item.height,item.z>h*.66?'#a6ab96':'#788f7e',6,4,rng()*2);
  }
  addHarborLandmarks(props,shoreZ);
  // Waterside promenade, piers, cargo and moored little boats.
  for(let i=0;i<(london||themedCity?0:8);i++) {
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
    const p=trackPoint(s), coastal=p.y>h*.63;
    if(i%3===0) {
      const side=i%2?1:-1, q=trackPoint(s,side*(TRACK.roadWidth/2+25));
      props.box(q.x,q.elevation+5,q.y,3,10,3,'#c7d3c3');
      props.box(q.x,q.elevation+9.5,q.y,4,2,4,i%2?'#ffbc7d':'#9ceaff',0,.65);
    }
    if(coastal && i%2===0) {
      const side=p.y>h*.81?1:-1;
      const q=trackPoint(s,side*(TRACK.roadWidth/2+18)),r=trackPoint(s+43,side*(TRACK.roadWidth/2+18));
      props.box(q.x,q.elevation+8,q.y,3,16,3,'#98aeb2');
      props.box((q.x+r.x)/2,(q.elevation+r.elevation)/2+14,(q.y+r.y)/2,Math.hypot(r.x-q.x,r.y-q.y),5,2,'#b8c9cb',Math.atan2(r.y-q.y,r.x-q.x));
    }
    if(p.elevation>3) {
      for(const side of [-1,1]) {
        const q=trackPoint(s,side*(TRACK.roadWidth/2+15)),r=trackPoint(s+47,side*(TRACK.roadWidth/2+15));
        props.box(q.x,q.elevation+13,q.y,3,26,3,'#9aaeb5');
        for(const lift of [11,25])props.box((q.x+r.x)/2,(q.elevation+r.elevation)/2+lift,(q.y+r.y)/2,
          Math.hypot(r.x-q.x,r.y-q.y)+2,4,3,lift===25?'#b2d4d6':'#6e8b96',Math.atan2(r.y-q.y,r.x-q.x));
        if(i%5===0&&q.elevation>70&&projectTrack(q.x,q.y).distance>TRACK.roadWidth/2+10)
          props.box(q.x,q.elevation/2-4,q.y,10,q.elevation-8,10,'#425b67');
      }
    }
  }
  for(const lamp of roadsideLamps()) {
    props.box(...lamp.mast.position,...lamp.mast.size,'#516976',lamp.angle);
    props.box(...lamp.arm.position,...lamp.arm.size,'#77969e',lamp.angle);
    props.box(...lamp.head.position,...lamp.head.size,'#5c7580',lamp.angle);
    props.box(...lamp.lens.position,...lamp.lens.size,'#ffdfa0',lamp.angle,.95);
  }
  // Road-side chevrons anticipate the technical corners instead of blind bends.
  for(const q of cornerMarkers()) {
    const geometry=cornerMarkerGeometry(q);
    props.box(q.x,q.elevation+19,q.y,5,38,3,'#536d77');
    props.box(q.x,q.elevation+40,q.y,2,19,23,'#142a39',q.angle);
    for(const chevron of geometry.chevrons)for(const vertices of chevron.strokes)props.quad(...vertices,'#ffdb89',.75,geometry.normal);
  }
  const start=trackPoint(TRACK.startDistance),half=TRACK.roadWidth/2+15,gantryRise=london||themedCity?40:0;
  for(const side of [-1,1]) {
    const p=trackPoint(TRACK.startDistance,side*half);
    props.box(p.x,p.elevation+43+gantryRise/2,p.y,10,86+gantryRise,10,'#233b4c',p.angle);
    props.box(p.x,p.elevation+45+gantryRise/2,p.y,11,64+gantryRise,11,side<0?'#53e4ec':'#ff70aa',p.angle,.6);
  }
  props.box(start.x,start.elevation+87+gantryRise,start.y,14,17,half*2+14,'#1b2d42',start.angle);
  props.box(start.x-Math.cos(start.angle)*8,start.elevation+85+gantryRise,start.y-Math.sin(start.angle)*8,2,3,half*2,'#b6fff4',start.angle,.8);
  // Rung flags give the gantry a readable racing silhouette without text textures.
  for(let k=0;k<14;k++) {
    const p=trackPoint(TRACK.startDistance,-half+k*half*2/14+5);
    props.box(p.x,p.elevation+90+gantryRise,p.y,16,5,8,k%2?'#f0efe4':'#273b49',start.angle);
  }
  addTimingGates(props);
  return { terrain, props, water, obstacles };
}

/** Headless physics verification uses the exact production mesh-building path. */
export function sceneObstacles() {return buildWorld().obstacles;}

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
// A visual-only copy of the real car; its MeshBuilder never registers obstacles.
function ghostCarMesh(color = '#b8a2ed') {
  const mesh = carMesh(color);
  const rgb = [1,3,5].map(start=>parseInt(color.slice(start,start+2),16)/255);
  for (let i = 0; i < mesh.data.length; i += 11) {
    mesh.data[i + 6] = rgb[0]; mesh.data[i + 7] = rgb[1]; mesh.data[i + 8] = rgb[2];
    mesh.data[i + 9] = .24; mesh.data[i + 10] = .65;
  }
  return mesh;
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
  if(TRACK.scene)return {...TRACK.scene};
  const coast=clamp((y/TRACK.height-.52)/.22,0,1);
  const city=clamp((x/TRACK.width-.43)/.2,0,1)*(1-coast);
  return { coast, alpine:Math.max(0,1-coast-city), city };
}

export class RaceRenderer {
  constructor(canvas,{sceneUrls={}}={}) {
    this.canvas=canvas;this.available=false;this.error=null;this.cameras=[null,null];this.textures={};this.obstacles=[];this.ghostPoses=[];
    this.sceneUrls={coast:'./assets/coast.png',alpine:'./assets/alpine.png',city:'./assets/city.png',clouds:'./assets/cloud-sky.jpg',...sceneUrls};
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
    for(const name of ['uTextureA','uTextureB','uTextureC','uReadyA','uReadyB','uReadyC','uWeights','uHeading','uAspect','uZenith','uHorizon','uLondon'])this.skyUniforms[name]=gl.getUniformLocation(this.skyProgram,name);
    this.skyBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const world=buildWorld();
    this.obstacles=world.obstacles;
    this.meshes={terrain:upload(gl,world.terrain),road:upload(gl,buildRoad()),water:upload(gl,world.water),props:upload(gl,world.props),cars:[upload(gl,carMesh('#57dbe6')),upload(gl,carMesh('#ff9870'))],ghost:upload(gl,ghostCarMesh()),ghostGold:upload(gl,ghostCarMesh('#ffd166')),flames:upload(gl,flameMesh()),shadow:upload(gl,shadowMesh())};
    this.trackId=TRACK.id;
    this.worldMatrix=identity();
    this.textures={};
    for(const [name,url] of Object.entries(this.sceneUrls))this._loadTexture(name,url);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.clearColor(.5,.68,.76,1);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  }
  rebuild(engine) {
    if(!this.available)return this;
    const gl=this.gl,world=buildWorld();
    for(const [key,builder] of Object.entries({terrain:world.terrain,road:buildRoad(),water:world.water,props:world.props})) {
      const previous=this.meshes[key];this.meshes[key]=upload(gl,builder);if(previous?.buffer)gl.deleteBuffer?.(previous.buffer);
    }
    this.obstacles=world.obstacles;this.trackId=TRACK.id;this.ghostPoses=[];
    if(engine){engine.setObstacles(this.obstacles);this.resetCameras(engine);}else this.cameras=[null,null];
    return this;
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
  // Each half follows its own lap clock. This state is never passed to physics.
  setGhostPoses(poses = []) {
    this.ghostPoses = [0,1].map(index => {
      const group = Array.isArray(poses[index]) ? poses[index] : [poses[index]];
      return group.filter(pose=>pose && ['x','y','angle','elevation'].every(key=>Number.isFinite(pose[key])))
        .slice(0,2).map(pose=>({...pose,slotId:pose.slotId===1?1:0}));
    });
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
    const citySky=TRACK.theme==='london'||isCityTheme(),clouds=this.textures.clouds;
    // City skylines come from modeled landmarks; their sky must contain no buildings.
    // A pending/failed cloud texture keeps ready=0 and uses the plain shader gradient.
    const one=citySky?clouds:this.textures.coast,two=citySky?clouds:this.textures.alpine,three=citySky?clouds:this.textures.city;
    const color=field=>[0,1,2].map(i=>Object.entries(weights).reduce((sum,[name,w])=>sum+SCENES[name][field][i]*w,0));
    gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.useProgram(this.skyProgram);
    for(const loc of Object.values(this.attributes))gl.disableVertexAttribArray(loc);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.enableVertexAttribArray(this.skyAttributes.position);gl.vertexAttribPointer(this.skyAttributes.position,2,gl.FLOAT,false,0,0);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,one.texture);gl.uniform1i(u.uTextureA,0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,two.texture);gl.uniform1i(u.uTextureB,1);
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,three.texture);gl.uniform1i(u.uTextureC,2);
    gl.uniform1f(u.uReadyA,one.ready);gl.uniform1f(u.uReadyB,two.ready);gl.uniform1f(u.uReadyC,three.ready);
    gl.uniform3fv(u.uWeights,[weights.coast,weights.alpine,weights.city]);
    gl.uniform1f(u.uLondon,TRACK.theme==='london'?1:0);
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
      for(const vehicle of engine.cars)this._mesh(this.meshes.shadow,modelMatrix(vehicle.x,(vehicle.elevation||0)+1.3,vehicle.y,vehicle.angle,0,Math.atan(vehicle.slope||0)));
      gl.depthMask(true);gl.disable(gl.BLEND);
      for(let j=0;j<engine.cars.length;j++) {
        const vehicle=engine.cars[j],roll=-clamp(vehicle.steer||0,-1,1)*Math.min(Math.abs(vehicle.speed)/363,1)*.035;
        const bounce=vehicle.offroad?Math.sin(now*.041+vehicle.id)*Math.min(Math.abs(vehicle.speed)/100,1)*.7:0;
        const model=modelMatrix(vehicle.x,(vehicle.elevation||0)+1.5+bounce,vehicle.y,vehicle.angle,roll,Math.atan(vehicle.slope||0));
        this._mesh(this.meshes.cars[vehicle.colorIndex === 1 ? 1 : vehicle.colorIndex === 0 ? 0 : j%2],model);
        if(vehicle.boosting)this._mesh(this.meshes.flames,model);
      }
      const ghosts = [...(this.ghostPoses?.[i] || [])].sort((a,b)=>
        Math.hypot(b.x-camera.eye[0],b.y-camera.eye[2])-Math.hypot(a.x-camera.eye[0],a.y-camera.eye[2]));
      if (ghosts.length) {
        gl.enable(gl.BLEND); gl.depthMask(false);
        for (const ghost of ghosts) this._mesh(ghost.slotId===1 ? this.meshes.ghostGold : this.meshes.ghost, modelMatrix(ghost.x,ghost.elevation+1.5,ghost.y,ghost.angle));
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    }
    gl.disable(gl.SCISSOR_TEST);
  }
}
