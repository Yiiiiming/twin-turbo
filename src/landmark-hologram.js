import { TRACKS } from './engine.js';
import { addCityLandmark } from './city-scenery.js';
import { londonEye } from './renderer.js';
import { themeForTrack, themeCssColor } from './color-themes.js';

// The same model builders as the race, collected once without a scene, physics
// world or WebGL context. Only their presentation changes in the lobby.
const LANDMARKS = Object.freeze({
  'coast-london': ['london-eye', '伦敦眼', 'London Eye', -Math.PI / 2 + .28],
  'coast-beijing': ['palace-gate', '天安门', 'Tiananmen', -.34],
  'coast-shanghai': ['oriental-pearl', '东方明珠', 'Oriental Pearl', -.34],
  'coast-rio': ['christ-redeemer', '基督像', 'Christ the Redeemer', -.22],
  'coast-austin': ['texas-capitol', '得州议会大厦', 'Texas State Capitol', -.34],
  'coast-paris': ['eiffel-tower', '埃菲尔铁塔', 'Eiffel Tower', -.34],
});
const TAU = Math.PI * 2;
const cache = new Map(), instances = new WeakMap();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

class ModelCollector {
  constructor() { this.vertices = []; this.faces = []; this.colliders = null; this.lookup = new Map(); }
  vertex(p) {
    if (!p.every(Number.isFinite)) throw new TypeError('Non-finite landmark vertex');
    const key = p.map(v => Math.round(v * 1e5)).join(',');
    if (!this.lookup.has(key)) { this.lookup.set(key, this.vertices.length); this.vertices.push(p); }
    return this.lookup.get(key);
  }
  polygon(points, color) {
    const ids = [...new Set(points.map(p => this.vertex(p)))];
    if (ids.length < 3) return;
    const a = this.vertices[ids[0]], b = this.vertices[ids[1]], c = this.vertices[ids[2]];
    const u = b.map((v, i) => v - a[i]), v = c.map((v, i) => v - a[i]);
    const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const length = Math.hypot(...n);
    if (length < 1e-8) return;
    const light = typeof color === 'string' ? parseInt(color.slice(1, 3), 16) / 255 : .55;
    this.faces.push({ ids, normal: n.map(v => v / length), light });
  }
  triangle(a, b, c, color) { this.polygon([a, b, c], color); }
  quad(a, b, c, d, color) { this.polygon([a, b, c, d], color); }
  box(x, y, z, sx, sy, sz, color, angle = 0) {
    const cs = Math.cos(angle), sn = Math.sin(angle);
    const p = (a, b, d) => [x + cs*a - sn*d, y + b, z + sn*a + cs*d];
    const hx = sx/2, hy = sy/2, hz = sz/2;
    const v = [p(-hx,-hy,-hz),p(hx,-hy,-hz),p(hx,hy,-hz),p(-hx,hy,-hz),p(-hx,-hy,hz),p(hx,-hy,hz),p(hx,hy,hz),p(-hx,hy,hz)];
    for (const ids of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]]) this.polygon(ids.map(i => v[i]), color);
  }
  cone(x, y, z, radius, height, color, sides = 7, topRadius = 0, phase = 0) {
    for (let i = 0; i < sides; i++) {
      const a = phase + i/sides*TAU, b = phase + (i+1)/sides*TAU;
      const p = [x+Math.cos(a)*radius,y,z+Math.sin(a)*radius];
      const q = [x+Math.cos(b)*radius,y,z+Math.sin(b)*radius];
      const t = [x+Math.cos(a)*topRadius,y+height,z+Math.sin(a)*topRadius];
      const u = [x+Math.cos(b)*topRadius,y+height,z+Math.sin(b)*topRadius];
      if (topRadius === 0) this.triangle(p,t,q,color); else this.quad(p,t,u,q,color);
    }
  }
  disk(x, y, z, rx, rz, color, sides = 12, angle = 0) {
    const cs = Math.cos(angle), sn = Math.sin(angle);
    const p = a => [x+Math.cos(a)*rx*cs-Math.sin(a)*rz*sn,y,z+Math.cos(a)*rx*sn+Math.sin(a)*rz*cs];
    for (let i=0;i<sides;i++) this.triangle([x,y,z],p(i/sides*TAU),p((i+1)/sides*TAU),color);
  }
}

function collectRoute(mesh, track) {
  // Six secondary circuits use their actual outline. This reads the immutable
  // segment definitions, never switches the selected physics track.
  for (const segment of track.segments) {
    const count = Math.max(2, Math.ceil(segment.length / 65));
    const p = (t, offset) => {
      if (segment.kind === 'line') return [segment.x1+(segment.x2-segment.x1)*t-Math.sin(segment.angle)*offset, 0,
        segment.y1+(segment.y2-segment.y1)*t+Math.cos(segment.angle)*offset];
      const a = segment.startAngle + segment.sweep*t, r = segment.radius-segment.direction*offset;
      return [segment.cx+Math.cos(a)*r,0,segment.cy+Math.sin(a)*r];
    };
    for (let i=0;i<count;i++) mesh.quad(p(i/count,-track.roadWidth*.7),p((i+1)/count,-track.roadWidth*.7),
      p((i+1)/count,track.roadWidth*.7),p(i/count,track.roadWidth*.7),'#aaaacc');
  }
}

/** Cached, origin-centred copies of production geometry, useful for QA too. */
export function landmarkHologramGeometry(trackId) {
  if (!Object.hasOwn(TRACKS, trackId)) trackId = 'coast-london';
  if (cache.has(trackId)) return cache.get(trackId);
  const meta = LANDMARKS[trackId], mesh = new ModelCollector();
  if (meta) {
    const item = {kind:meta[0],x:0,z:0,angle:0,elevation:0,side:1};
    if (item.kind === 'london-eye') londonEye(mesh,item); else addCityLandmark(mesh,item);
  } else collectRoute(mesh,TRACKS[trackId]);
  const bounds = [[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
  for (const p of mesh.vertices) for (let i=0;i<3;i++) { bounds[0][i]=Math.min(bounds[0][i],p[i]);bounds[1][i]=Math.max(bounds[1][i],p[i]); }
  const center = [(bounds[0][0]+bounds[1][0])/2,bounds[0][1],(bounds[0][2]+bounds[1][2])/2];
  const vertices = mesh.vertices.map(p=>p.map((v,i)=>v-center[i]));
  let radius = 1;
  for (const p of vertices) radius = Math.max(radius,Math.hypot(p[0],p[2]));
  const edges = new Map();
  mesh.faces.forEach((face,index)=>face.ids.forEach((a,j)=>{
    const b=face.ids[(j+1)%face.ids.length],key=a<b?`${a}:${b}`:`${b}:${a}`;
    if(!edges.has(key))edges.set(key,{a,b,faces:[]});
    edges.get(key).faces.push(index);
  }));
  // Drop internal coplanar tessellation; retain real silhouette and crease
  // edges, including the wheel's spokes and each building's roof detail.
  const lines = [...edges.values()].filter(edge=>edge.faces.length!==2 ||
    Math.abs(mesh.faces[edge.faces[0]].normal.reduce((sum,v,i)=>sum+v*mesh.faces[edge.faces[1]].normal[i],0)) < .9995);
  const result = {trackId,kind:meta?.[0]||'circuit',labels:meta?.slice(1,3)||['赛道','Circuit'],
    yaw:meta?.[3]||-.34,vertices,faces:mesh.faces,edges:lines,radius,height:bounds[1][1]-bounds[0][1],
    triangles:mesh.faces.reduce((n,face)=>n+face.ids.length-2,0)};
  cache.set(trackId,result);
  return result;
}

export function paintLandmarkHologram(ctx, model, width, height, yaw, time, reduced, themeId = themeForTrack(model.trackId)) {
  const colors = new Map(), color = value => {
    if (!colors.has(value)) colors.set(value, themeCssColor(value, themeId));
    return colors.get(value);
  };
  ctx.clearRect(0,0,width,height);
  const pitch = model.kind === 'circuit' ? .70 : .18, cp=Math.cos(pitch),sp=Math.sin(pitch),cs=Math.cos(yaw),sn=Math.sin(yaw);
  const scale = Math.min(width*.83/(2*model.radius),height*.78/Math.max(1,model.height*cp+2*model.radius*sp));
  const centerY=height*.45, offsetY=model.height*.5;
  const project=p=>{const x=cs*p[0]-sn*p[2],z=sn*p[0]+cs*p[2],y=p[1]-offsetY;
    return [width/2+x*scale,centerY-(y*cp+z*sp)*scale,z*cp-y*sp];};
  const points=model.vertices.map(project), base=project([0,0,0]);
  const rx=Math.min(width*.36,Math.max(21,model.radius*scale*1.03)),ry=Math.max(4,rx*.16);
  ctx.save();ctx.translate(width/2,base[1]);ctx.scale(1,.27);
  const glow=ctx.createRadialGradient(0,0,0,0,0,rx*1.25);
  glow.addColorStop(0,color('rgba(128,81,255,.18)'));glow.addColorStop(1,color('rgba(113,67,233,0)'));
  ctx.fillStyle=glow;ctx.fillRect(-rx*1.25,-rx*1.25,rx*2.5,rx*2.5);ctx.restore();
  for(const [r,alpha] of [[1,.32],[.78,.12]]){
    ctx.beginPath();ctx.ellipse(width/2,base[1]+2,rx*r,ry*r,0,0,TAU);ctx.strokeStyle=color(`rgba(172,128,255,${alpha})`);ctx.lineWidth=.7;ctx.stroke();
  }
  const facing=[], order=[];
  model.faces.forEach((face,index)=>{
    const q=face.ids.map(i=>points[i]);let area=0,depth=0;
    for(let i=0;i<q.length;i++){const p=q[i],n=q[(i+1)%q.length];area+=p[0]*n[1]-n[0]*p[1];depth+=p[2];}
    facing[index]=area>0;
    if(Math.abs(area)>.4)order.push({face,depth:depth/q.length,front:area>0});
  });
  order.sort((a,b)=>b.depth-a.depth);
  for(const {face,front} of order){
    ctx.beginPath();face.ids.forEach((id,i)=>{const p=points[id];if(i)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);});ctx.closePath();
    const light=Math.round(face.light*4);ctx.fillStyle=color(`rgba(${25+light*3},${23+light*3},${62+light*6},${front?.72:.44})`);ctx.fill();
  }
  // Batch all edges into three paths; do not apply costly per-edge shadows.
  const groups=[[],[],[]];
  for(const edge of model.edges){const a=points[edge.a],b=points[edge.b];if(Math.hypot(a[0]-b[0],a[1]-b[1])<.85)continue;
    const front=edge.faces.some(i=>facing[i]),back=edge.faces.some(i=>!facing[i]);
    groups[front?(back?2:1):0].push([a,b]);
  }
  for(let i=0;i<groups.length;i++){
    ctx.beginPath();for(const [a,b]of groups[i]){ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}
    ctx.lineWidth=i===2?2.3:1.5;ctx.strokeStyle=color(`rgba(143,91,255,${[.04,.075,.15][i]})`);ctx.stroke();
    ctx.lineWidth=i===2?.8:.55;ctx.strokeStyle=color([ 'rgba(148,109,238,.15)','rgba(168,161,255,.40)','rgba(122,230,255,.79)' ][i]);ctx.stroke();
  }
  // A moving, clipped light sweep enhances the projection without introducing
  // flicker. Reduced-motion mode has neither sweep nor automatic rotation.
  if(!reduced){
    const scan=height*(.12+((time*.00009)%1)*.70);
    ctx.save();ctx.globalCompositeOperation='source-atop';
    const stripe=ctx.createLinearGradient(0,scan-7,0,scan+7);
    stripe.addColorStop(0,color('rgba(104,223,255,0)'));stripe.addColorStop(.5,color('rgba(133,233,255,.22)'));stripe.addColorStop(1,color('rgba(104,223,255,0)'));
    ctx.fillStyle=stripe;ctx.fillRect(0,scan-7,width,14);ctx.restore();
  }
}

/** One controller per canvas. Nothing runs while the lobby is covered/hidden. */
export function initLandmarkHologram(doc = globalThis.document) {
  const host=doc?.getElementById('landmark-hologram');
  if(!host)return null;
  if(instances.has(host))return instances.get(host);
  const canvas=host.tagName==='CANVAS'?host:host.querySelector('canvas');
  const ctx=canvas?.getContext?.('2d');
  if(!ctx)return null;
  const win=doc.defaultView,menu=doc.getElementById('menu'),cards=doc.getElementById('track-cards');
  const media=win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced=!!media?.matches,model=null,yaw=0,width=0,height=0,frame=0,lastTime=0,lastPaint=0;
  let disposed=false,dirty=true,intersecting=true,pointer=null,dragUntil=0;
  const cleanups=[];
  const listen=(node,type,fn,options)=>{node?.addEventListener(type,fn,options);cleanups.push(()=>node?.removeEventListener(type,fn,options));};
  const active=()=>!disposed&&!doc.hidden&&intersecting&&!host.hidden&&!menu?.hidden&&!menu?.classList.contains('hidden')&&
    !doc.querySelector('dialog[open]')&&!(doc.getElementById('records-center')&&!doc.getElementById('records-center').hidden)&&
    width>0&&height>0;
  const draw=time=>{if(!model||!active())return;const dpr=Math.min(2,win.devicePixelRatio||1);ctx.setTransform(dpr,0,0,dpr,0,0);paintLandmarkHologram(ctx,model,width,height,yaw,time,reduced);dirty=false;};
  function tick(time){
    frame=0;if(!active()){lastTime=0;return;}
    const delta=lastTime?Math.min(100,time-lastTime):0;lastTime=time;
    if(!reduced&&!pointer&&time>=dragUntil)yaw=(yaw+delta*.00028)%TAU;
    if(dirty||time-lastPaint>=1000/24){draw(time);lastPaint=time;}
    if(!reduced)frame=win.requestAnimationFrame(tick);
  }
  function schedule(){
    if(!active()){if(frame)win.cancelAnimationFrame(frame);frame=0;lastTime=0;return;}
    if(!frame&&(dirty||!reduced))frame=win.requestAnimationFrame(tick);
  }
  function label(){
    if(!model)return;const english=doc.documentElement.lang?.startsWith('en');
    canvas.setAttribute('aria-label',`${model.labels[english?1:0]} · ${english?'Drag or use arrow keys to rotate':'拖动或用左右方向键旋转'}`);
  }
  function setTrack(id){
    if(!Object.hasOwn(TRACKS,id))id='coast-london';
    if(model?.trackId===id){label();return;}
    model=landmarkHologramGeometry(id);yaw=model.yaw;canvas.dataset.landmark=model.kind;canvas.dataset.hologramTrack=id;
    dirty=true;label();schedule();
  }
  function selected(){setTrack(cards?.querySelector('[data-track].selected,[data-track][aria-pressed="true"]')?.dataset.track||host.dataset.track||'coast-london');}
  function resize(){
    const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;
    const dpr=Math.min(2,win.devicePixelRatio||1),w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;dirty=true;}
    schedule();
  }
  canvas.tabIndex=canvas.tabIndex>=0?canvas.tabIndex:0;
  canvas.setAttribute('role','img');canvas.setAttribute('data-i18n-skip','');
  listen(canvas,'pointerdown',event=>{
    if(!active()||!event.isPrimary||event.button!==0)return;
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,dragged:false};dragUntil=Infinity;
    // Wait for horizontal intent on touch, preserving vertical page scrolling.
    if(event.pointerType!=='touch')canvas.setPointerCapture?.(event.pointerId);
  });
  listen(canvas,'pointermove',event=>{
    if(!pointer||pointer.id!==event.pointerId)return;
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
    if(!pointer.dragged){if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>5){endDrag(event);return;}if(Math.abs(dx)<3)return;
      pointer.dragged=true;canvas.setPointerCapture?.(event.pointerId);canvas.classList.add('is-dragging');}
    yaw=(yaw+dx*.014)%TAU;pointer.x=event.clientX;pointer.y=event.clientY;dirty=true;schedule();
  });
  function endDrag(event){
    if(!pointer||event?.pointerId!==undefined&&pointer.id!==event.pointerId)return;
    const id=pointer.id;pointer=null;canvas.classList.remove('is-dragging');
    if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);
    dragUntil=(win.performance?.now()||0)+1600;schedule();
  }
  for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(canvas,event,endDrag);
  for(const event of ['pointerup','pointercancel'])listen(win,event,endDrag);
  listen(canvas,'keydown',event=>{
    if(!active()||!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();yaw=event.key==='Home'?model.yaw:yaw+(event.key==='ArrowRight'?.18:-.18);
    dragUntil=(win.performance?.now()||0)+2200;dirty=true;schedule();
  });
  listen(doc,'visibilitychange',()=>{endDrag();schedule();});
  listen(win,'blur',()=>endDrag());
  listen(win,'resize',resize);
  const motion=event=>{reduced=event.matches;dirty=true;schedule();};
  if(media?.addEventListener)listen(media,'change',motion);
  else if(media?.addListener){media.addListener(motion);cleanups.push(()=>media.removeListener(motion));}
  const observer=win.MutationObserver?new win.MutationObserver(()=>{selected();if(!active())endDrag();schedule();}):null;
  if(observer){
    if(cards)observer.observe(cards,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-pressed']});
    if(menu)observer.observe(menu,{attributes:true,attributeFilter:['class','hidden','aria-hidden']});
    observer.observe(host,{attributes:true,attributeFilter:['data-track','hidden']});
    observer.observe(doc.documentElement,{attributes:true,attributeFilter:['lang']});
    for(const panel of doc.querySelectorAll('dialog,#records-center'))observer.observe(panel,{attributes:true,attributeFilter:['open','hidden']});
  }
  const resizeObserver=win.ResizeObserver?new win.ResizeObserver(resize):null;resizeObserver?.observe(canvas);
  const intersection=win.IntersectionObserver?new win.IntersectionObserver(entries=>{
    intersecting=entries[0]?.isIntersecting!==false;schedule();
  }):null;intersection?.observe(canvas);
  const controller={setTrack,destroy(){
    if(disposed)return;disposed=true;endDrag();if(frame)win.cancelAnimationFrame(frame);frame=0;
    observer?.disconnect();resizeObserver?.disconnect();intersection?.disconnect();
    for(const cleanup of cleanups)cleanup();instances.delete(host);
  }};
  instances.set(host,controller);selected();resize();return controller;
}
