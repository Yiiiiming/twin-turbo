/**
 * Hand-built London street architecture on independently sourced OSM footprints.
 * Building profiles override estimates. Unknown facades remain explicitly
 * estimated: geometric detail is not evidence that a building was surveyed.
 * Every added detail is on or INSIDE the already collision-clipped footprint.
 */
import * as THREE from './vendor/three.module.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const numeric = value => { const n = Number.parseFloat(value); return Number.isFinite(n) ? n : null; };
const hash = value => {
  const s = String(value); let n = 2166136261;
  for (let i = 0; i < s.length; i++) { n ^= s.charCodeAt(i); n = Math.imul(n, 16777619); }
  return (n >>> 0) / 4294967296;
};
const signedArea = ring => ring.reduce((sum, p, i) => {
  const q = ring[(i + 1) % ring.length]; return sum + p.x * q.y - q.x * p.y;
}, 0) / 2;
const openRing = ring => {
  const points = ring.map(p => ({ x: p.x, y: p.y }));
  if (points.length > 1 && Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) < .001) points.pop();
  return points;
};
const orient = (ring, positive = true) => {
  const points = openRing(ring); return (signedArea(points) > 0) === positive ? points : points.reverse();
};
const pointInside = (p, ring) => {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
};
const pointOnBoundary=(p,ring,tolerance=.0001)=>ring.some((a,i)=>{
  const b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=tolerance;
});
const COLOR_ALIASES = { cream:'#d7cbb4', light_brown:'#a18d76', darkbrown:'#62524a', 'red-brown':'#946f5b', 'orange-brown':'#a77e62', 'yellow-brown':'#aa9573', grey:'#b9b6ad', gray:'#b9b6ad', white:'#dedbd1', red:'#a67762', brown:'#907968', yellow:'#c6b98f', beige:'#c5b9a3', black:'#484f50', lightgrey:'#c9c7bd' };
const safeColor = (value, fallback='#bfb8aa') => { const s=String(value||'').trim().toLowerCase().split(';')[0]; return COLOR_ALIASES[s] || (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(s) ? s : fallback); };
const STYLES = {
  'georgian-brick': { walls: ['#88766a', '#81756b', '#978575'], accent: '#d7cfbc', roof: '#555b61', shop: '#263d3d', bays: 2.85, floorHeight: 3.3, roofType: 'mansard', ground: 'residential', texture: 'brick', window: 'sash' },
  'victorian-redbrick': { walls: ['#aa7962', '#98705e', '#af846e'], accent: '#d3c5ae', roof: '#555863', shop: '#3e4a45', bays: 3.05, floorHeight: 3.5, roofType: 'gabled', ground: 'shopfront', texture: 'brick', window: 'arched' },
  'edwardian-stone': { walls: ['#c7bdab', '#bfb8aa', '#d0c6b5'], accent: '#e3dccc', roof: '#5b6267', shop: '#2b4140', bays: 3.5, floorHeight: 3.8, roofType: 'mansard', ground: 'rusticated', texture: 'stone', window: 'casement' },
  'westminster-stone': { walls: ['#c1b9aa', '#bbb4a6', '#cbc3b4'], accent: '#d8d0bd', roof: '#5c6263', shop: '#363e3d', bays: 3.7, floorHeight: 3.9, roofType: 'hipped', ground: 'rusticated', texture: 'stone', window: 'sash' },
  'retail-stucco': { walls: ['#d6c9b5', '#c6bbab', '#dfd3c0'], accent: '#e9e0cf', roof: '#5f6367', shop: '#7b3939', bays: 2.8, floorHeight: 3.2, roofType: 'mansard', ground: 'shopfront', texture: 'plaster', window: 'sash' },
  'theatre': { walls: ['#c9bda7', '#c4b4a3', '#d4c5ac'], accent: '#e7d8bd', roof: '#60616a', shop: '#793636', bays: 3.35, floorHeight: 4, roofType: 'mansard', ground: 'shopfront', texture: 'stone', window: 'arched' },
  'modern-stone': { walls: ['#c2c2b8', '#b9bcb4', '#cac9bd'], accent: '#d2d5cf', roof: '#696e70', shop: '#384e54', bays: 3.7, floorHeight: 3.45, roofType: 'flat', ground: 'shopfront', texture: 'stone', window: 'casement' },
};

/** Small seamless masonry only: the windows are modeled, never painted on. */
function masonryTexture(kind) {
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let shade = 247;
    if (kind === 'brick') {
      const row = Math.floor(y / 16), edge = y % 16 < 1 || ((x + (row % 2) * 32) % 64) < 1;
      const brick = Math.floor((x + (row % 2) * 32) / 64);
      shade = edge ? 210 : 240 + Math.floor(hash(`${row}-${brick}`) * 12);
    } else if (kind === 'stone') {
      const row = Math.floor(y / 64), edge = y % 64 < 1 || ((x + (row % 2) * 64) % 128) < 1;
      shade = edge ? 224 : 250;
    }
    const i = (y * size + x) * 4; data[i] = data[i + 1] = data[i + 2] = shade; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 8; texture.needsUpdate = true; return texture;
}

/** Accumulates geometry directly so a building does not create thousands of Object3Ds. */
class MeshBuilder {
  constructor() { this.batches = new Map(); this.triangles = 0; }
  triangle(paint, a, b, c, uvA = [0, 0], uvB = [0, 1], uvC = [1, 1]) {
    const material=paint.material || paint, color=paint.color || {r:1,g:1,b:1};
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const length = Math.hypot(...n); if (length < 1e-8) return;
    if (!this.batches.has(material)) this.batches.set(material, { position: [], normal: [], uv: [], color: [] });
    const batch = this.batches.get(material); batch.position.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) batch.normal.push(...n.map(value => value / length));
    batch.uv.push(...uvA, ...uvB, ...uvC);for(let i=0;i<3;i++)batch.color.push(color.r,color.g,color.b); this.triangles++;
  }
  quad(material, a, b, c, d, u = 1, v = 1) {
    this.triangle(material, a, b, c, [0, 0], [0, v], [u, v]);
    this.triangle(material, a, c, d, [0, 0], [u, v], [u, 0]);
  }
  emit(parent, metadata) {
    for (const [material, batch] of this.batches) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.position, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normal, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uv, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(batch.color, 3));
      geometry.computeBoundingSphere(); const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData = { ...metadata }; parent.add(mesh);
    }
    return this.batches.size;
  }
}

class Face {
  constructor(builder, a, b, units) {
    this.builder = builder; this.a = a; this.length = Math.hypot(b.x - a.x, b.y - a.y);
    this.ux = (b.x - a.x) / this.length; this.uz = (b.y - a.y) / this.length;
    this.nx = this.uz; this.nz = -this.ux; this.m = units;this.depthLimits=new Map();this.part=null;
  }
  at(x, y, depth = 0) {
    const bx=this.a.x+this.ux*x,bz=this.a.y+this.uz*x;
    if(depth<0&&this.part){
      const key=`${x}/${depth}`;
      if(this.depthLimits.has(key))depth=this.depthLimits.get(key);
      else {
        const requested=depth,valid=d=>{
          const p={x:bx+this.nx*d,y:bz+this.nz*d};
          return (pointInside(p,this.part.outer)||pointOnBoundary(p,this.part.outer))&&!this.part.holes.some(ring=>pointInside(p,ring)&&!pointOnBoundary(p,ring));
        };
        if(!valid(depth)){let safe=0,unsafe=depth;for(let i=0;i<13;i++){const middle=(safe+unsafe)/2;if(valid(middle))safe=middle;else unsafe=middle;}depth=safe;}
        this.depthLimits.set(`${x}/${requested}`,depth);
      }
    }
    return [bx+this.nx*depth,y,bz+this.nz*depth];
  }
  panel(material, x0, x1, y0, y1, depth = 0) {
    if (x1 - x0 < .005 || y1 - y0 < .005) return;
    this.builder.quad(material, this.at(x0, y0, depth), this.at(x0, y1, depth), this.at(x1, y1, depth), this.at(x1, y0, depth), (x1 - x0) / (this.m * 2.4), (y1 - y0) / (this.m * 1.2));
  }
  box(material, x0, x1, y0, y1, front = -.008, back = -.6) {
    this.panel(material, x0, x1, y0, y1, front);
    this.builder.quad(material, this.at(x0, y0, back), this.at(x0, y1, back), this.at(x0, y1, front), this.at(x0, y0, front));
    this.builder.quad(material, this.at(x1, y0, front), this.at(x1, y1, front), this.at(x1, y1, back), this.at(x1, y0, back));
    this.builder.quad(material, this.at(x0, y1, front), this.at(x0, y1, back), this.at(x1, y1, back), this.at(x1, y1, front));
    this.builder.quad(material, this.at(x0, y0, back), this.at(x0, y0, front), this.at(x1, y0, front), this.at(x1, y0, back));
  }
  /** Rectangular opening subdivides the solid wall so the glass really is recessed. */
  wallOpening(wall, x0, x1, y0, y1, left, right, bottom, top) {
    this.panel(wall, Math.max(x0,this.wallInset||0), left, y0, y1); this.panel(wall, right, Math.min(x1,this.length-(this.wallInset||0)), y0, y1);
    this.panel(wall, left, right, y0, bottom); this.panel(wall, left, right, top, y1);
  }
}

function styleName(value) {
  const name = String(value || '').toLowerCase(); if (STYLES[name]) return name;
  if (/theatre|theater/.test(name)) return 'theatre';
  if (/victorian|red.?brick/.test(name)) return 'victorian-redbrick';
  if (/georgian|brick/.test(name)) return 'georgian-brick';
  if (/stucco|retail|chinatown/.test(name)) return 'retail-stucco';
  if (/westminster|classical|portland/.test(name)) return 'westminster-stone';
  if (/modern|glass/.test(name)) return 'modern-stone'; return 'edwardian-stone';
}

export class CityFrontages {
  constructor({ unitsPerMeter = 6, sourceBuildings = [], projectPoint = null, profileForBuilding = null, projectToRoute = null } = {}) {
    this.m = unitsPerMeter; this.sources = new Map(sourceBuildings.map(item => [item.id, item]));
    this.projectPoint = projectPoint; this.projectToRoute = projectToRoute; this.farTextures = new Map(); this.profileForBuilding = profileForBuilding; this.materials = new Map();this.sharedMaterials=new Map();
    this.textures = { brick: masonryTexture('brick'), stone: masonryTexture('stone'), plaster: masonryTexture('plaster') };
    this.stats = { buildings: 0, detailed: 0, estimated: 0, referenced: 0, windows: 0, detailedWindows: 0, simpleWindows: 0, triangles: 0, meshes: 0 };
  }
  material(color, role = 'wall', texture = null) {
    color=safeColor(color);const key=`${color}/${role}/${texture||''}`,sharedKey=`${role}/${texture||''}`;
    if(!this.sharedMaterials.has(sharedKey)) this.sharedMaterials.set(sharedKey,new THREE.MeshStandardMaterial({
      color:'#ffffff',vertexColors:true,roughness:role==='glass'?.27:role==='metal'?.48:.86,
      metalness:role==='glass'?.23:role==='metal'?.4:0,...(texture?{map:this.textures[texture]}:{}),
    }));
    if(!this.materials.has(key))this.materials.set(key,{material:this.sharedMaterials.get(sharedKey),color:new THREE.Color(color)});
    return this.materials.get(key);
  }
  farMaterial(profile) {
    const wall=safeColor(profile.wallColor),key=`far/${profile.style}`;
    if(!this.sharedMaterials.has(key)) {
      const size=256,data=new Uint8Array(size*size*4),modern=profile.style==='modern-stone';
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const bx=x%64,by=y%128,window=bx>(modern?7:18)&&bx<(modern?57:46)&&by>(modern?12:27)&&by<(modern?116:100);
        const frame=bx>15&&bx<49&&by>24&&by<104,mullion=Math.abs(bx-32)<1||Math.abs(by-64)<1;
        const glass=window&&!mullion,shade=glass?1:(y%16===0&&profile.texture==='brick'?.96:1),i=(y*size+x)*4;
        data[i]=Math.round((glass?119:frame?255:247)*shade);data[i+1]=Math.round((glass?140:frame?255:247)*shade);data[i+2]=Math.round((glass?151:frame?255:247)*shade);data[i+3]=255;
      }
      const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=8;texture.needsUpdate=true;
      const material=new THREE.MeshStandardMaterial({map:texture,roughness:.88,vertexColors:true});this.farTextures.set(key,texture);this.sharedMaterials.set(key,material);
    }
    const descriptorKey=`${key}/${wall}`;
    if(!this.materials.has(descriptorKey))this.materials.set(descriptorKey,{material:this.sharedMaterials.get(key),color:new THREE.Color(wall)});
    return this.materials.get(descriptorKey);
  }
  makeSimpleFace(face,base,top,profile,palette) {
    const m=this.m,height=top-base,columns=clamp(Math.round(numeric(profile.bays)??face.length/(profile.bayWidth*m)),1,Math.min(45,Math.max(1,Math.floor(face.length/(m*1.8))))),bay=face.length/columns;
    const floors=clamp(profile.floors,1,Math.min(24,Math.floor(height/(m*2.1)))),floor=height/floors;
    face.panel(palette.wall,0,face.length,base,top,-m*.045);
    for(let row=0;row<floors;row++)for(let col=0;col<columns;col++){
      const shop=row===0&&/shop|retail/.test(profile.groundFloor)&&base<m,w=Math.min(bay*(shop?.8:.51),m*(shop?3.8:1.85));
      const x=(col+.5)*bay,bottom=base+row*floor+(shop?m*.2:floor*.20),h=Math.min(floor*(shop?.72:.60),m*2.6),border=m*.065;
      face.panel(shop?palette.shop:palette.trim,x-w/2-border,x+w/2+border,bottom-border,bottom+h+border,-m*.02);
      face.panel(palette.glass,x-w/2,x+w/2,bottom,bottom+h,-m*.009);
      if(profile.distance<80)face.panel(palette.frame,x-m*.025,x+m*.025,bottom,bottom+h,-m*.003);
      this.stats.windows++;this.stats.simpleWindows++;
    }
    if(profile.cornice)face.panel(palette.trim,0,face.length,top-m*.22,top,-m*.002);
  }
  /** Resolve explicit observations first, then OSM material/levels, then stated estimates. */
  resolveProfile(building, supplied = {}) {
    const source = this.sources.get(building.id) || {}, tags = { ...source.tags, ...building.tags };
    const override = this.profileForBuilding?.(building, source) || {};
    const record = { ...override, ...supplied }, facade = { ...(override.facade || override), ...(supplied.facade || supplied) };
    const random = hash(building.id), coordinates = source.coordinates || [], center = coordinates.length
      ? [coordinates.reduce((s, p) => s + p[0], 0) / coordinates.length, coordinates.reduce((s, p) => s + p[1], 0) / coordinates.length] : null;
    let estimatedStyle = 'edwardian-stone';
    if (/brick/i.test(tags['building:material'] || '')) estimatedStyle = 'georgian-brick';
    else if (center && center[1] > 51.510 && center[1] < 51.5142 && center[0] > -.1345 && center[0] < -.1273)
      estimatedStyle = random < .55 ? 'retail-stucco' : 'georgian-brick';
    else if (center && center[1] < 51.508) estimatedStyle = random < .7 ? 'westminster-stone' : 'georgian-brick';
    else estimatedStyle = random < .22 ? 'victorian-redbrick' : random < .45 ? 'georgian-brick' : 'edwardian-stone';
    if (/glass|concrete/i.test(tags['building:material'] || '')) estimatedStyle = 'modern-stone';
    const style = styleName(facade.style || estimatedStyle), defaults = STYLES[style];
    const distance = numeric(facade.distanceToRouteMeters) ?? numeric(source.distanceToRouteMeters) ?? 120;
    const levelTag = numeric(tags['building:levels']), floorOverride = numeric(facade.floors);
    const totalHeight = (building.height - building.minHeight) / this.m;
    const requestedRoof = String(facade.roof || tags['roof:shape'] || defaults.roofType).toLowerCase();
    const roofType = /mansard/.test(requestedRoof) ? 'mansard' : /gable/.test(requestedRoof) ? 'gabled' : /hip/.test(requestedRoof) ? 'hipped' : 'flat';
    const floors = clamp(Math.round(floorOverride ?? levelTag ?? totalHeight / defaults.floorHeight), 1, 24);
    const explicit = Object.keys(facade).length > 0;
    return {
      ...facade, style, distance, detail: distance <= 55 ? 2 : distance <= 145 ? 1 : 0,
      wallColor: facade.wallColor || tags['building:colour'] || defaults.walls[Math.floor(random * defaults.walls.length)],
      accentColor: facade.accentColor || defaults.accent, roofColor: facade.roofColor || tags['roof:colour'] || defaults.roof,
      shopColor: facade.shopColor || defaults.shop, texture: defaults.texture, floors,
      bayWidth: clamp(numeric(facade.bayWidth) ?? defaults.bays + (hash(`${building.id}-bay`) - .5) * .55, 2.15, 5.2),
      windowShape: facade.windowShape || defaults.window,
      groundFloor: facade.groundFloor || defaults.ground, roofType,
      cornice: facade.cornice !== false, estimated: !['verified', 'verified-features'].includes(record.confidence), explicit,
      facadeBearing: numeric(record.facadeBearing) ?? numeric(facade.facadeBearing),
      name: record.name || tags.name || '', sourceUrls: record.sourceUrls || [],
    };
  }
  renderBuilding(building, parent, suppliedProfile = {}) {
    const profile = this.resolveProfile(building, suppliedProfile), builder = new MeshBuilder(), m = this.m;
    const palette = {
      far: this.farMaterial(profile), wall: this.material(profile.wallColor, 'wall', profile.texture), trim: this.material(profile.accentColor),
      roof: this.material(profile.roofColor), frame: this.material(profile.style.includes('brick') ? '#c8c2b4' : '#ded8c7'),
      glass: this.material(['#53646a', '#4a5d63', '#5b6b70'][Math.floor(hash(building.id) * 3)], 'glass'),
      shop: this.material(profile.shopColor), door: this.material(profile.style === 'retail-stucco' ? '#5c3534' : '#30413e'),
      metal: this.material('#4c5552', 'metal'), recess: this.material('#555651'),
    };
    for (const part of building.parts) {
      const outer = orient(part.outer), holes = (part.holes || []).map(ring => orient(ring, false));
      if (outer.length < 3) continue;
      // A pitched roof is only used when its complete geometry fits the source polygon.
      const convex = outer.every((p, i) => {
        const a = outer[(i + outer.length - 1) % outer.length], b = outer[(i + 1) % outer.length];
        return (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x) >= -.001;
      });
      const roofType = convex && !holes.length && outer.length <= 12 && !building.isPart ? profile.roofType : 'flat';
      const roofRise = roofType === 'flat' ? 0 : Math.min(m * (roofType === 'mansard' ? 2.8 : 2.2), (building.height - building.minHeight) * .15);
      const wallTop = building.height - roofRise;
      for (const [ringIndex, ring] of [outer, ...holes].entries()) for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], face = new Face(builder, a, b, m);
        if (face.length < .05) continue; face.part={outer,holes};
        let faceDetail=ringIndex>0 ? 0 : Math.min(profile.detail,1);
        if (ringIndex===0 && this.projectToRoute) {
          const middleX=(a.x+b.x)/2,middleY=(a.y+b.y)/2,nearest=this.projectToRoute(middleX,middleY);
          const distance=Math.hypot(nearest.x-middleX,nearest.y-middleY),facing=(nearest.x-middleX)*face.nx+(nearest.y-middleY)*face.nz;
          faceDetail=facing>distance*.05 && distance<30*m ? 2 : facing>-distance*.12 && distance<95*m ? 1 : 0;
        } else if(ringIndex===0 && profile.detail===2) faceDetail=2;
        const bearing=profile.facadeBearing, facingMain=bearing===null || bearing===undefined || Math.cos((90-bearing)*Math.PI/180)*face.nx-Math.sin((90-bearing)*Math.PI/180)*face.nz>.72;
        const frontageCoordinates=outer.map(p=>p.x*face.ux+p.y*face.uz),frontageSpan=Math.max(...frontageCoordinates)-Math.min(...frontageCoordinates);
        const faceBays=facingMain&&numeric(profile.bays)!==null?Math.max(1,Math.round(profile.bays*face.length/Math.max(face.length,frontageSpan))):null;
        this.makeFace(face, building.minHeight, wallTop, {...profile,detail:faceDetail,bays:faceBays}, palette, ringIndex > 0);
      }
      this.makeRoof(builder, outer, holes, wallTop, building.height, roofType, profile, palette);
    }
    this.stats.buildings++; this.stats[profile.estimated ? 'estimated' : 'referenced']++; if (profile.detail === 2) this.stats.detailed++;
    this.stats.triangles += builder.triangles;
    this.stats.meshes += builder.emit(parent, { frontage: true, buildingId: building.id, facadeStyle: profile.style, appearanceEstimated: profile.estimated, profileSources: profile.sourceUrls });
    return profile;
  }
  makeFace(face, base, top, profile, palette, courtyard) {
    const m = this.m, height = top - base, width = face.length;
    let detail = courtyard ? Math.min(profile.detail, 1) : profile.detail;
    if (detail === 0 || width < m*1.5 || height < m*2.2) {
      face.builder.quad(palette.far,face.at(0,base),face.at(0,top),face.at(width,top),face.at(width,base),width/(profile.bayWidth*m*4),height/(m*3.4*2));return;
    }
    if(detail===1){ this.makeSimpleFace(face,base,top,profile,palette);return; }
    const floors = clamp(profile.floors, 1, Math.min(24, Math.max(1, Math.floor(height / (m * 2.1)))));
    const groundHeight = floors === 1 ? height : Math.min(height * .4, Math.max(m * 3.5, height / floors * 1.16));
    const otherFloorHeight = floors > 1 ? (height - groundHeight) / (floors - 1) : 0;
    const explicitBays = numeric(profile.bays), columns = clamp(Math.round(explicitBays ?? width / (profile.bayWidth * m)), 1, Math.min(45,Math.max(1,Math.floor(width/(m*1.8)))));
    const bay = width / columns, sideMargin = Math.min(m * .32, width * .06);
    const quoins = detail===2&&width>m*3&&/stone|stucco|theatre|victorian/.test(profile.style);
    if(quoins) {face.wallInset=Math.min(m*.48,bay*.2);face.panel(palette.wall,0,face.wallInset,base,top,-m*.13);face.panel(palette.wall,width-face.wallInset,width,base,top,-m*.13);}
    const corniceHeight=profile.cornice?m*(/edwardian|theatre/.test(profile.style)?.44:.28):0;
    for (let row = 0; row < floors; row++) {
      const y0 = row === 0 ? base : base + groundHeight + (row - 1) * otherFloorHeight;
      const y1 = row === 0 ? base + groundHeight : y0 + otherFloorHeight, rowHeight = y1 - y0;
      const shop = row === 0 && !courtyard && /shop|retail/.test(profile.groundFloor) && base < m;
      for (let col = 0; col < columns; col++) {
        const x0 = col * bay, x1 = (col + 1) * bay;
        const door = row === 0 && !courtyard && !shop && col === Math.floor(columns / 2) && base < m;
        const openingWidth = Math.min(bay * (shop ? .82 : door ? .5 : .51), m * (shop ? 3.8 : 1.85));
        const left = (x0 + x1 - openingWidth) / 2, right = left + openingWidth;
        const bottom = shop || door ? y0 + m * .12 : y0 + rowHeight * (row === 0 ? .22 : .20);
        const openingHeight = Math.min(rowHeight * (shop || door ? .73 : .60), m * (shop || door ? 3.3 : row === 0 ? 2.65 : 2.4));
        const windowTop = bottom + openingHeight;
        const reservedTop=row===floors-1?corniceHeight:profile.style!=='georgian-brick'?m*.14:0;
        face.wallOpening(palette.wall, x0, x1, y0, y1-reservedTop, left, right, bottom, windowTop);
        if (shop) this.makeShop(face, left, right, bottom, windowTop, palette, detail, col % 3 === 0);
        else this.makeWindow(face, left, right, bottom, windowTop, profile, palette, detail, door);
        this.stats.windows++;this.stats.detailedWindows++;
      }
      // Belt courses and their visible shadow are modeled within the volume.
      if (detail && row > 0 && profile.style !== 'georgian-brick') {
        const h = Math.min(m * .14, rowHeight * .08);
        face.box(palette.trim, sideMargin, width - sideMargin, y0 - h, y0, -.012, -m * .16);
      }
    }
    if (detail) {
      const corniceH = m * (profile.style === 'edwardian-stone' || profile.style === 'theatre' ? .44 : .28);
      if (profile.cornice && height > m * 3) {
        face.panel(palette.wall,0,width,top-corniceH,top,-m*.18);
        face.box(palette.trim, 0, width, top - corniceH, top - corniceH * .52, -.013, -m * .24);
        face.box(palette.trim, 0, width, top - corniceH * .4, top, -.009, -m * .32);
        if (detail === 2 && /edwardian|theatre|westminster/.test(profile.style)) {
          for (let x = m * .35; x < width - m * .25; x += m * .7)
            face.box(palette.trim, x, Math.min(width, x + m * .17), top - corniceH * .76, top - corniceH * .5, -.008, -m * .22);
        }
      }
      // Quoins articulate corners; alternating lengths differ from repeated flat skins.
      if (quoins) {
        const count = Math.min(34, Math.floor(height / (m * .62)));
        for (let i = 0; i < count; i++) for (const rightSide of [false, true]) {
          const q = Math.min(face.wallInset,m * (i % 2 ? .30 : .46)), y0 = base + i * height / count;
          face.box(palette.trim, rightSide ? width - q : 0, rightSide ? width : q, y0 + .1, y0 + height / count - .1, -.014, -m * .12);
        }
      }
    }
  }
  makeWindow(face, left, right, bottom, top, profile, palette, detail, door = false) {
    const m = this.m, width = right - left, height = top - bottom, depth = detail ? m * .22 : m * .03;
    const frame = Math.min(m * .09, width * .07), glassDepth = -depth;
    face.panel(door ? palette.door : palette.glass, left, right, bottom, top, glassDepth);
    if (!detail) return;
    // Four real reveals. Only exposed surfaces are emitted, avoiding hidden box faces.
    face.panel(palette.trim,left,left+frame,bottom,top,-.018);
    face.panel(palette.trim,right-frame,right,bottom,top,-.018);
    face.panel(palette.trim,left+frame,right-frame,bottom,bottom+frame*1.5,-.012);
    face.panel(palette.trim,left+frame,right-frame,top-frame,top,-.012);
    face.builder.quad(palette.trim,face.at(left+frame,bottom,-.018),face.at(left+frame,top,-.018),face.at(left+frame,top,-depth),face.at(left+frame,bottom,-depth));
    face.builder.quad(palette.trim,face.at(right-frame,bottom,-depth),face.at(right-frame,top,-depth),face.at(right-frame,top,-.018),face.at(right-frame,bottom,-.018));
    face.builder.quad(palette.trim,face.at(left+frame,bottom+frame,-.018),face.at(left+frame,bottom+frame,-depth),face.at(right-frame,bottom+frame,-depth),face.at(right-frame,bottom+frame,-.018));
    face.builder.quad(palette.trim,face.at(left+frame,top-frame,-depth),face.at(left+frame,top-frame,-.018),face.at(right-frame,top-frame,-.018),face.at(right-frame,top-frame,-depth));
    const thin = m * .034, mullionDepth = -depth + m * .016;
    if (door) {
      // Wood recessed panel below the glazed fanlight; never an open passage.
      const transom = top - height * .24;
      face.panel(palette.glass, left + frame, right - frame, transom, top - frame, glassDepth + .015);
      face.panel(palette.frame, left + frame, right - frame, transom - thin, transom + thin, mullionDepth);
      if (detail === 2) {
        const center = (left + right) / 2;
        face.panel(palette.frame, center - thin, center + thin, bottom + frame, transom, mullionDepth);
        face.panel(palette.trim, right - frame * 2.2, right - frame * 1.7, bottom + height * .43, bottom + height * .54, -depth + m * .025);
      }
    } else {
      const sashHeight = bottom + height * (profile.windowShape === 'casement' ? .62 : .5);
      face.panel(palette.frame, left + frame, right - frame, sashHeight - thin, sashHeight + thin, mullionDepth);
      face.panel(palette.frame, (left + right) / 2 - thin, (left + right) / 2 + thin, bottom + frame, top - frame, mullionDepth);
      if (detail === 2 && profile.windowShape === 'sash') {
        for (const fraction of [1 / 3, 2 / 3]) face.panel(palette.frame, left + width * fraction - thin / 2, left + width * fraction + thin / 2, bottom + frame, top - frame, mullionDepth);
      }
      if (detail === 2 && (profile.windowShape === 'arched' || profile.style === 'victorian-redbrick')) {
        // Stone arch is contained in the rectangular opening, with solid spandrels.
        const radius = width / 2 - frame, centerX = (left + right) / 2, spring = top - radius - frame;
        if (spring > bottom + height * .4) {
          const segments = 12;
          for (let i = 0; i < segments; i++) {
            const a = Math.PI * i / segments, b = Math.PI * (i + 1) / segments;
            const p = [centerX + Math.cos(a) * radius, spring + Math.sin(a) * radius];
            const q = [centerX + Math.cos(b) * radius, spring + Math.sin(b) * radius];
            // Triangles above the arch close the recess with real wall material.
            face.builder.quad(palette.wall, face.at(q[0], q[1], -.02), face.at(q[0], top - frame, -.02), face.at(p[0], top - frame, -.02), face.at(p[0], p[1], -.02));
            const ri = Math.max(0, radius - frame * 1.5);
            face.builder.quad(palette.trim, face.at(centerX + Math.cos(b) * ri, spring + Math.sin(b) * ri, -.015), face.at(q[0], q[1], -.015), face.at(p[0], p[1], -.015), face.at(centerX + Math.cos(a) * ri, spring + Math.sin(a) * ri, -.015));
          }
        }
      }
    }
  }
  makeShop(face, left, right, bottom, top, palette, detail, doorway) {
    const m = this.m, width = right - left, height = top - bottom, depth = detail ? m * .28 : m * .04;
    face.panel(palette.glass, left, right, bottom, top, -depth);
    if (!detail) return;
    const pier = Math.min(m * .14, width * .08), fascia = Math.min(m * .48, height * .18);
    face.box(palette.shop, left, left + pier, bottom, top, -.012, -depth);
    face.box(palette.shop, right - pier, right, bottom, top, -.012, -depth);
    face.box(palette.shop, left, right, top - fascia, top, -.01, -depth);
    face.box(palette.shop, left, right, bottom, bottom + m * .45, -.014, -depth);
    face.panel(palette.trim, left + pier, right - pier, top - fascia + m * .08, top - fascia + m * .11, -.008);
    const divider = doorway ? left + width * .31 : (left + right) / 2;
    face.box(palette.shop, divider - m * .04, divider + m * .04, bottom + .1, top - fascia, -depth + m * .04, -depth);
    face.panel(palette.frame, left + pier, right - pier, top - fascia - m * .34, top - fascia - m * .29, -depth + .025);
    if (doorway) face.panel(palette.trim, divider - m * .15, divider - m * .115, bottom + height * .37, bottom + height * .54, -depth + m * .05);
  }
  makeRoof(builder, outer, holes, bottom, top, kind, profile, palette) {
    const m = this.m;
    const polygon = (ring, holeRings, y, material) => {
      const points = [...ring, ...holeRings.flat()], vectors = ring.map(p => new THREE.Vector2(p.x, p.y));
      const triangles = THREE.ShapeUtils.triangulateShape(vectors, holeRings.map(r => r.map(p => new THREE.Vector2(p.x, p.y))));
      for (const triangle of triangles) {
        const a = points[triangle[0]], b = points[triangle[1]], c = points[triangle[2]];
        const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        builder.triangle(material, [a.x, y, a.y], [cross > 0 ? c.x : b.x, y, cross > 0 ? c.y : b.y], [cross > 0 ? b.x : c.x, y, cross > 0 ? b.y : c.y]);
      }
    };
    if (kind === 'flat' || top - bottom < .1) { polygon(outer, holes, top, palette.roof); return; }
    const roofLimit=top; top-=Math.min(m*.8,(top-bottom)*.4); const chimneyRise=Math.min(m*.7,roofLimit-top);
    const center = { x: outer.reduce((sum, p) => sum + p.x, 0) / outer.length, y: outer.reduce((sum, p) => sum + p.y, 0) / outer.length };
    const factor = kind === 'mansard' ? .73 : .50;
    const upper = outer.map(p => ({ x: center.x + (p.x - center.x) * factor, y: center.y + (p.y - center.y) * factor }));
    // A plateau hip/mansard follows the same convex polygon. It cannot overhang.
    for (let i = 0; i < outer.length; i++) {
      const j = (i + 1) % outer.length, a = outer[i], b = outer[j], c = upper[j], d = upper[i];
      builder.quad(palette.roof, [a.x, bottom, a.y], [d.x, top, d.y], [c.x, top, c.y], [b.x, bottom, b.y], Math.hypot(b.x - a.x, b.y - a.y) / (m * 2), 2);
    }
    polygon(upper, [], top, palette.roof);
    if (profile.detail === 0) return;
    // Chimneys and terracotta pots are set back on the roof, never on the street.
    const chimneyPositions = [upper[0], upper[Math.floor(upper.length / 2)]];
    for (const position of chimneyPositions) {
      const p = { x: center.x + (position.x - center.x) * .68, y: center.y + (position.y - center.y) * .68 };
      const r = m * .32;
      if (![[-r, -r], [-r, r], [r, r], [r, -r]].every(([x, y]) => pointInside({ x: p.x + x, y: p.y + y }, outer))) continue;
      // Four explicit sides avoid a billboarding chimney and share wall materials.
      const square = [{ x: p.x - r, y: p.y - r }, { x: p.x + r, y: p.y - r }, { x: p.x + r, y: p.y + r }, { x: p.x - r, y: p.y + r }];
      for (let i = 0; i < 4; i++) new Face(builder, square[i], square[(i + 1) % 4], m).panel(palette.wall, 0, r * 2, top, top + chimneyRise);
      polygon(square, [], top + chimneyRise, palette.trim);
    }
  }
  dispose() { for (const material of this.sharedMaterials.values()) material.dispose(); for (const texture of [...Object.values(this.textures),...this.farTextures.values()]) texture.dispose(); }
}
