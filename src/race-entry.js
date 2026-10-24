import { landmarkHologramGeometry, paintLandmarkHologram } from './landmark-hologram.js';
import { ENTRY_CAMERA_CUTS } from './entry-cameras.js';
import { themeForTrack, themeCssColor, remapHologramColor } from './color-themes.js';

const TRAIN_SECONDS = 3.6, PREVIEW_SECONDS = 6.0, TOTAL_SECONDS = TRAIN_SECONDS + PREVIEW_SECONDS;
const MENU_ZOOM_SECONDS = .75;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const ENTRY_COLORS = Object.freeze({
  '--entry-menu-core':'#30257b', '--entry-menu-mid':'#251e61',
  '--entry-menu-outer':'#1c1745', '--entry-menu-edge':'#15112b',
  '--entry-bars':'#0d081fe8', '--entry-cut-color':'#080413',
  '--entry-skip-bg':'#1a1238a6', '--entry-skip-border':'#d4c1ff4d',
  '--entry-skip-text':'#eee6ff', '--entry-skip-hover':'#38265bba',
  '--entry-skip-hover-border':'#e5d6ff99', '--entry-skip-focus':'#ded0ff',
});

function polygon(ctx, points, fill, stroke, lineWidth = 1) {
  if (points.length < 3) return;
  ctx.beginPath();
  points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
  ctx.closePath();ctx.fillStyle = fill;ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke;ctx.lineWidth = lineWidth;ctx.stroke(); }
}

// Clip each carriage at the portal plane so it enters the opening rather than
// shrinking forever in front of the landmark. These are presentation vertices.
function clipPortal(points, plane) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (a[2] <= plane) result.push(a);
    if ((a[2] <= plane) !== (b[2] <= plane)) {
      const t = (plane - a[2]) / (b[2] - a[2]);
      result.push(a.map((value, axis) => mix(value, b[axis], t)));
    }
  }
  return result;
}

function paintTrain(ctx, width, height, time, portal, themeId = 'purple') {
  const color = value => themeCssColor(value, themeId);
  const unit = Math.min(width / 1000, height / 650), plane = 1800, far = 700 / (plane + 700);
  const eye = [240,170,-700];
  const project = p => {
    const scale = 700 / (p[2] + 700);
    return [portal.x + (p[0] * scale - 240 * (scale - far)) * unit,
      portal.y + portal.ry * .65 + ((170 - p[1]) * scale - 170 * far) * unit];
  };
  const progress = clamp((time - .7) / 2.6), lead = 640 + 1960 * progress * progress;
  const passage = smooth((time - 3) / .6);
  ctx.save();ctx.globalAlpha = smooth((time - .55) / .55) * (1-passage);
  for (const x of [-48, 48]) {
    ctx.beginPath();
    for (let z = -160; z <= plane; z += 40) { const p = project([x, 0, z]);z === -160 ? ctx.moveTo(...p) : ctx.lineTo(...p); }
    ctx.strokeStyle = color('#9d7eff55');ctx.lineWidth = 3;ctx.stroke();
    ctx.strokeStyle = color('#a9e8ff99');ctx.lineWidth = .8;ctx.stroke();
  }
  for (let z = -120; z < plane; z += 100) {
    const a = project([-72, -2, z]), b = project([72, -2, z]);
    ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle = color('#9777c62e');ctx.lineWidth = 1;ctx.stroke();
  }
  const faces = [], wheels = [], axles = [];
  const add = (points, glass = false) => {
    const [a,b,c] = points, u = b.map((v,i)=>v-a[i]), v = c.map((n,i)=>n-a[i]);
    const normal = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const center = [0,1,2].map(i=>points.reduce((sum,p)=>sum+p[i],0)/points.length);
    if(normal.reduce((sum,n,i)=>sum+n*(eye[i]-center[i]),0)<=0)return;
    const clipped = clipPortal(points,plane);
    if(clipped.length>=3)faces.push({points,clipped,depth:center[2],glass});
  };
  // A chamfered rail body and tapered nose, rather than stacked solid boxes.
  // All four cars are projected in the same world and share one depth order.
  for(let index=0;index<4;index++){
    const z=lead-index*230,w=124-index*5,h=104-index*3,half=100;
    if(z-half>=plane)continue;
    const section = (station,narrow=1,lower=1) => [
      [-w*.5*narrow,29,station],[w*.5*narrow,29,station],
      [w*.5*narrow,h*.77*lower,station],[w*.33*narrow,h*lower,station],
      [-w*.33*narrow,h*lower,station],[-w*.5*narrow,h*.77*lower,station],
    ];
    const back=section(z-half),shoulder=section(z+(index===0?38:half-18)),nose=section(z+half,index===0?.68:.91,index===0?.83:.97);
    add([...back].reverse());add(nose);
    for(const [a,b] of [[back,shoulder],[shoulder,nose]])for(let i=0;i<a.length;i++){
      const next=(i+1)%a.length;add([a[i],a[next],b[next],b[i]]);
    }
    // Visible-side windows retain the rhythm of linked passenger carriages.
    for(const side of [-1,1])for(const dz of [-73,-40,-7,index===0?24:26,...(index===0?[]:[59])]){
      const x=side*(w*.5+.2),top=Math.min(76,h*.77-3),points=[[x,top-19,z+dz-11],[x,top,z+dz-11],[x,top,z+dz+11],[x,top-19,z+dz+11]];
      add(side>0?points:[...points].reverse(),true);
    }
    if(index<3)add([[-18,40,z-half],[18,40,z-half],[18,40,z-half-30],[-18,40,z-half-30]]);
    if(index===0){
      // Flush sloped windscreen at the locomotive's long wedge, no extra block.
      const a=shoulder[2],b=shoulder[3],c=nose[3],d=nose[2];
      add([a,b,c,d].map(p=>[p[0]+.25,p[1]+.15,p[2]]),true);
    }
    for(const dz of [-66,66]){
      const station=z+dz,halfWidth=w*.5+1;
      if(station<plane)axles.push([[-halfWidth,14,station],[halfWidth,14,station]]);
      for(const side of [-1,1])if(station-14<plane)wheels.push({p:[side*halfWidth,14,station],radius:14});
    }
  }
  faces.sort((a,b)=>b.depth-a.depth);
  // Clip original outline segments separately. Closing a clipped polygon with
  // a new bright line would draw an artificial bulkhead through the portal.
  const lines = new Map();
  for(const face of faces){
    polygon(ctx,face.clipped.map(project),color(face.glass?'rgba(119,230,255,.065)':'rgba(132,89,221,.035)'));
    for(let i=0;i<face.points.length;i++){
      let a=face.points[i],b=face.points[(i+1)%face.points.length];
      if(a[2]>plane&&b[2]>plane)continue;
      if(a[2]>plane||b[2]>plane){const t=(plane-a[2])/(b[2]-a[2]),hit=a.map((n,k)=>mix(n,b[k],t));if(a[2]>plane)a=hit;else b=hit;}
      const key=[a,b].map(p=>p.map(n=>Math.round(n*100)).join(',')).sort().join(':');
      if(!lines.has(key)||face.glass)lines.set(key,{a:project(a),b:project(b),glass:face.glass});
    }
  }
  for(const glass of [false,true]){
    ctx.beginPath();for(const edge of lines.values())if(edge.glass===glass){ctx.moveTo(...edge.a);ctx.lineTo(...edge.b);}
    ctx.strokeStyle=color(glass?'rgba(90,227,255,.10)':'rgba(161,110,255,.13)');ctx.lineWidth=4;ctx.stroke();
    ctx.strokeStyle=color(glass?'rgba(145,239,255,.76)':'rgba(199,165,255,.80)');ctx.lineWidth=glass?.7:1;ctx.stroke();
  }
  for(const axle of axles){
    ctx.beginPath();ctx.moveTo(...project(axle[0]));ctx.lineTo(...project(axle[1]));
    ctx.strokeStyle=color('#8ebdff66');ctx.lineWidth=.65;ctx.stroke();
  }
  // The transparent train shows both wheels on each axle. Clip every original
  // ring segment at the portal; never invent a straight closing edge there.
  for(const wheel of wheels){
    const ring=Array.from({length:32},(_,i)=>[wheel.p[0],wheel.p[1]+Math.cos(i*TAU/32)*wheel.radius,wheel.p[2]+Math.sin(i*TAU/32)*wheel.radius]);
    ctx.beginPath();
    for(let i=0;i<ring.length;i++){
      let a=ring[i],b=ring[(i+1)%ring.length];
      if(a[2]>plane&&b[2]>plane)continue;
      if(a[2]>plane||b[2]>plane){const t=(plane-a[2])/(b[2]-a[2]),hit=a.map((n,k)=>mix(n,b[k],t));if(a[2]>plane)a=hit;else b=hit;}
      ctx.moveTo(...project(a));ctx.lineTo(...project(b));
    }
    ctx.strokeStyle=color('#a4d8ff99');ctx.lineWidth=.75;ctx.stroke();
  }
  ctx.restore();
}

function paintEntry(ctx, width, height, time, image, origin, themeId = 'purple') {
  const color = value => themeCssColor(value, themeId);
  ctx.clearRect(0,0,width,height);
  if (time >= TRAIN_SECONDS) return;
  const appear = smooth(time / MENU_ZOOM_SECONDS), passage = smooth((time - 3) / .6);
  // The train canvas is opaque from its very first frame. CSS fades this whole
  // canvas over the menu, with the world canvases hidden until the preview.
  ctx.fillStyle = color('#15112b');ctx.fillRect(0,0,width,height);
  const background = ctx.createRadialGradient(width*.5,height*.46,0,width*.5,height*.46,Math.max(width*.72,height*.8));
  background.addColorStop(0,color('#30257b'));background.addColorStop(.36,color('#251e61'));background.addColorStop(.68,color('#1c1745'));background.addColorStop(1,color('#15112b'));
  ctx.fillStyle = background;ctx.fillRect(0,0,width,height);
  const portal = {x:width*.56,y:height*.40,rx:Math.min(width*.23,height*.29),ry:Math.min(height*.34,width*.31)};
  const cx = mix(origin.x,portal.x,appear), cy = mix(origin.y,portal.y,appear);
  const imageScale = Math.min(portal.rx*2.12/image.width,portal.ry*1.88/image.height);
  const iw = mix(origin.width,image.width*imageScale,appear), ih = mix(origin.height,image.height*imageScale,appear);
  ctx.save();ctx.globalAlpha = 1-passage;
  const halo = ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(iw,ih)*.7);
  halo.addColorStop(0,color('#8757ed21'));halo.addColorStop(.65,color('#6b55e90b'));halo.addColorStop(1,color('#6b55e900'));
  ctx.fillStyle = halo;ctx.fillRect(0,0,width,height);
  ctx.drawImage(image,cx-iw/2,cy-ih/2,iw,ih);
  ctx.restore();
  ctx.save();ctx.globalAlpha = appear*(1-passage);
  for (let i=0;i<3;i++) {
    ctx.beginPath();ctx.ellipse(portal.x,portal.y,portal.rx*(1+i*.045),portal.ry*(1+i*.025),0,0,TAU);
    ctx.strokeStyle = color(['#c3a1ffb3','#75dcf94d','#a186ef26'][i]);ctx.lineWidth = i ? 1 : 1.8;ctx.stroke();
  }
  // Only the illuminated rim accents travel. The opening stays fixed for the
  // train, and one eased revolution settles before the map is revealed.
  const rimAngle=-Math.PI/2+TAU*smooth((time-.55)/2.75),rimX=portal.rx*1.045,rimY=portal.ry*1.025;
  ctx.beginPath();ctx.ellipse(portal.x,portal.y,rimX,rimY,0,rimAngle-.34,rimAngle+.34);
  ctx.strokeStyle=color('#8c68e84d');ctx.lineWidth=6;ctx.stroke();
  ctx.strokeStyle=color('#96eaffd9');ctx.lineWidth=1.8;ctx.stroke();
  ctx.beginPath();
  for(let i=0;i<3;i++){
    const angle=rimAngle+.8+i*2;
    ctx.moveTo(portal.x+Math.cos(angle-.025)*rimX,portal.y+Math.sin(angle-.025)*rimY);
    ctx.ellipse(portal.x,portal.y,rimX,rimY,0,angle-.025,angle+.025);
  }
  ctx.strokeStyle=color('#bd9fffc4');ctx.lineWidth=1.6;ctx.stroke();
  ctx.restore();
  paintTrain(ctx,width,height,time,portal,themeId);
  if (passage > 0) {
    // The portal settles into a quiet themed veil, never an expanding flash.
    ctx.save();ctx.globalAlpha = passage;ctx.fillStyle=color('#0d081f');ctx.fillRect(0,0,width,height);ctx.restore();
  }
}

/** Presentation only: the caller freezes racing and advances this on visible frames. */
export function createRaceEntry(doc = globalThis.document) {
  const win = doc?.defaultView || globalThis.window;
  let stage=null,overlay=null,canvas=null,ctx=null,button=null,texture=null,clock=0,running=false,origin=null,media=null;
  let width=0,height=0,resizeObserver=null,previousFocus=null,themeId='purple';
  const snapshot = () => ({active:running,previewProgress:!running||clock<TRAIN_SECONDS?null:clamp((clock-TRAIN_SECONDS)/PREVIEW_SECONDS)});
  function finish() {
    running=false;
    resizeObserver?.disconnect();resizeObserver=null;
    media?.removeEventListener?.('change',motionChange);media=null;
    const heldFocus = button && doc.activeElement === button;
    overlay?.remove();overlay=null;canvas=null;ctx=null;texture=null;button=null;
    stage?.classList.remove('race-entry-active');
    if(stage){delete stage.dataset.entryPhase;stage.style.removeProperty('--entry-menu-scale');stage.style.removeProperty('--entry-menu-opacity');stage.style.removeProperty('--entry-canvas-opacity');stage.style.removeProperty('--entry-preview-opacity');stage.style.removeProperty('--entry-cut-shade');}
    if(stage)for(const property of [...Object.keys(ENTRY_COLORS),'--entry-veil-rgb'])stage.style.removeProperty(property);
    if(heldFocus)previousFocus?.focus?.({preventScroll:true});
    previousFocus=null;
  }
  function motionChange(event) { if(event.matches)finish(); }
  function resize() {
    if(!canvas||!stage)return;
    const rect=stage.getBoundingClientRect();width=rect.width;height=rect.height;
    const dpr=Math.min(2,win.devicePixelRatio||1);
    canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function render() {
    if(!running)return;
    const preview=clock>=TRAIN_SECONDS,p=clamp((clock-TRAIN_SECONDS)/PREVIEW_SECONDS);
    stage.dataset.entryPhase=preview?'preview':'train';
    const menuProgress=smooth(clock/MENU_ZOOM_SECONDS);
    stage.style.setProperty('--entry-menu-scale',String(1-.055*menuProgress));
    stage.style.setProperty('--entry-menu-opacity',String(1-menuProgress));
    stage.style.setProperty('--entry-canvas-opacity',String(menuProgress));
    stage.style.setProperty('--entry-preview-opacity',String(preview?1-smooth((clock-TRAIN_SECONDS)/.5):1));
    const cutShade=preview?Math.max(0,...ENTRY_CAMERA_CUTS.map(cut=>1-Math.abs(p-cut)/(.08/PREVIEW_SECONDS)))*.65:0;
    stage.style.setProperty('--entry-cut-shade',String(cutShade));
    button.textContent=doc.documentElement.lang?.startsWith('en')?'Skip':'跳过';
    if(preview)ctx.clearRect(0,0,width,height);
    else paintEntry(ctx,width,height,clock,texture,origin,themeId);
  }
  function start(trackId) {
    finish();clock=0;stage=doc?.getElementById('race-stage');
    if(!stage||!win)return snapshot();
    media=win.matchMedia?.('(prefers-reduced-motion: reduce)');
    if(media?.matches){media=null;return snapshot();}
    const model=landmarkHologramGeometry(trackId);
    themeId=themeForTrack(model.trackId);
    previousFocus=doc.activeElement;
    const stageRect=stage.getBoundingClientRect(),source=doc.getElementById('landmark-hologram')?.getBoundingClientRect();
    origin=source&&source.width>0&&source.height>0?{x:source.left-stageRect.left+source.width/2,y:source.top-stageRect.top+source.height/2,width:source.width,height:source.height}
      :{x:stageRect.width/2,y:stageRect.height*.32,width:200,height:120};
    texture=doc.createElement('canvas');texture.width=640;texture.height=Math.max(1,Math.round(640*origin.height/origin.width));
    const imageContext=texture.getContext('2d');
    if(!imageContext){finish();return snapshot();}
    paintLandmarkHologram(imageContext,model,texture.width,texture.height,model.yaw,0,true,themeId);
    overlay=doc.createElement('div');overlay.className='race-entry';
    canvas=doc.createElement('canvas');canvas.className='race-entry-canvas';canvas.setAttribute('aria-hidden','true');
    ctx=canvas.getContext('2d');
    if(!ctx){finish();return snapshot();}
    for(const [property,value] of Object.entries(ENTRY_COLORS))stage.style.setProperty(property,themeCssColor(value,themeId));
    stage.style.setProperty('--entry-veil-rgb',remapHologramColor([13/255,8/255,31/255],themeId).map(value=>Math.round(value*255)).join(','));
    button=doc.createElement('button');button.className='race-entry-skip';button.type='button';button.setAttribute('data-i18n-skip','');
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();finish();});
    overlay.append(canvas,button);stage.appendChild(overlay);
    stage.classList.add('race-entry-active');running=true;
    media?.addEventListener?.('change',motionChange);
    resizeObserver=win.ResizeObserver?new win.ResizeObserver(()=>{resize();render();}):null;resizeObserver?.observe(stage);
    resize();render();return snapshot();
  }
  return {start,update(dtSeconds){
    if(!running||doc.hidden)return snapshot();
    clock+=Math.max(0,Math.min(.1,Number.isFinite(dtSeconds)?dtSeconds:0));
    if(Math.abs(clock-TRAIN_SECONDS)<1e-9)clock=TRAIN_SECONDS;
    if(clock+1e-9>=TOTAL_SECONDS){clock=TOTAL_SECONDS;finish();}else render();
    return snapshot();
  },skip:finish,cancel:finish,get active(){return running;}};
}
