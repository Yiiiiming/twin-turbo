/** A continuous scenic Great Wall ridge. The existing Beijing racecourse stays untouched. */
import { TRACK, trackPoint } from './engine.js';
const TAU = Math.PI * 2;
const cache = new WeakMap();
const empty = Object.freeze({ nodes: Object.freeze([]), segments: Object.freeze([]), towers: Object.freeze([]), length: 0 });
const mix = (a,b,t) => a+(b-a)*t;
const distance = (a,b) => Math.hypot(b.x-a.x,b.z-a.z);
const RIDGE_HALF_WIDTH = 96;

export function beijingWallLayout() {
  if (TRACK.theme !== 'beijing') return empty;
  if (cache.has(TRACK)) return cache.get(TRACK);
  // Soften the exterior offsets at the two concave bends, rather than folding
  // an offset ribbon back over itself. These offsets change scenery only.
  const turns = TRACK.segments.filter(segment => segment.kind === 'arc' && segment.direction < 0);
  const raw = [], samples = Math.ceil(TRACK.length/32);
  for (let i=0;i<=samples;i++) {
    const s=i/samples*TRACK.length,t=s/TRACK.length;
    let offset=550+45*Math.sin(t*TAU*3)+20*Math.cos(t*TAU*7);
    for (const turn of turns) {
      const delta=Math.abs(s-(turn.s+turn.length/2));
      offset-=205*Math.exp(-((delta/(turn.length*.8))**4));
    }
    const p=trackPoint(s,-offset);
    raw.push({x:p.x,z:p.y,s,base:105+42*Math.sin(t*TAU*3+.4)+23*Math.sin(t*TAU*7-.6)});
  }
  const arc=[0];for(let i=1;i<raw.length;i++)arc.push(arc.at(-1)+distance(raw[i-1],raw[i]));
  const length=arc.at(-1),count=Math.ceil(length/90),nodes=[];let cursor=0;
  for(let i=0;i<count;i++){
    const along=i/count*length;
    while(cursor+1<arc.length-1&&arc[cursor+1]<along)cursor++;
    const t=(along-arc[cursor])/(arc[cursor+1]-arc[cursor]);
    const a=raw[cursor],b=raw[cursor+1];
    nodes.push({x:mix(a.x,b.x,t),z:mix(a.z,b.z,t),s:mix(a.s,b.s,t),base:mix(a.base,b.base,t),along});
  }
  for(let i=0;i<count;i++){
    const a=nodes[(i+count-1)%count],n=nodes[i],b=nodes[(i+1)%count];
    const h=Math.atan2(b.z-a.z,b.x-a.x);
    Object.assign(n,{angle:h,nx:-Math.sin(h),nz:Math.cos(h)});Object.freeze(n);
  }
  const segments=nodes.map((a,i)=>{
    const b=nodes[(i+1)%count],angle=Math.atan2(b.z-a.z,b.x-a.x);
    return Object.freeze({a,b,index:i,x:(a.x+b.x)/2,z:(a.z+b.z)/2,length:distance(a,b),angle,base:(a.base+b.base)/2,halfWidth:RIDGE_HALF_WIDTH});
  });
  const towers=[],towerCount=18;
  for(let i=0;i<towerCount;i++){
    const n=nodes[Math.round(i/towerCount*count)%count];
    towers.push(Object.freeze({...n,index:i,kind:i%6===0?'gate-watchtower':i%3===1?'roof-watchtower':'battlement-watchtower',width:i%6===0?93:71,height:79+(i%3)*11,radius:i%6===0?67:56}));
  }
  const result=Object.freeze({nodes:Object.freeze(nodes),segments:Object.freeze(segments),towers:Object.freeze(towers),length,ridgeHalfWidth:RIDGE_HALF_WIDTH});
  cache.set(TRACK,result);return result;
}

/** Clearance for ordinary roadside scenery, including the full mountain skirt. */
export function beijingWallClearance(x,z,radius=0) {
  if(TRACK.theme!=='beijing')return true;
  const layout=beijingWallLayout();
  for(const segment of layout.segments){
    const {a,b}=segment,dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    if(Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<RIDGE_HALF_WIDTH+radius+18)return false;
  }
  return true;
}

function detail(mesh,draw){const colliders=mesh.colliders;mesh.colliders=null;try{draw();}finally{mesh.colliders=colliders;}}
function local(item,x,y,z){return[item.x+Math.cos(item.angle)*x-Math.sin(item.angle)*z,y,item.z+Math.sin(item.angle)*x+Math.cos(item.angle)*z];}
function box(mesh,item,x,y,z,w,h,d,color){mesh.box(...local(item,x,y,z),w,h,d,color,item.angle);}
function ridge(mesh,segment){
  const {a,b,index}=segment;
  const profile=[[-96,0],[-63,.27],[-29,.84],[0,1],[29,.84],[63,.27],[96,0]];
  const p=(node,c)=>[node.x+node.nx*c[0],Math.max(0,node.base*c[1]),node.z+node.nz*c[0]];
  for(let i=0;i<profile.length-1;i++){
    const color=['#666f51','#73805a','#859066','#798561','#697750','#586748'][(i+index%2)%6];
    mesh.quad(p(a,profile[i]),p(a,profile[i+1]),p(b,profile[i+1]),p(b,profile[i]),color);
  }
  // Layered boxes remain inside the visible ridge cross-section. They do not
  // turn the sloping hillside into a wide, invisible vertical collision wall.
  if(mesh.colliders){
    const height=Math.min(a.base,b.base),inset=Math.max(2,segment.length/2-5);
    for(const [lo,hi,width]of[[0,.2,70],[.2,.45,44],[.45,.7,29],[.7,.9,11]])mesh.colliders.push({
      id:`beijing-ridge-${index}-${lo}`,type:'box',x:segment.x,y:segment.z,halfWidth:inset,halfDepth:width,angle:segment.angle,minHeight:height*lo,maxHeight:height*hi,
    });
  }
}
function stonePrism(mesh,item,x,y,z,w,h,d,color,faces=[0,1,2,3,4,5]){
  const v=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(([a,b,c])=>local(item,x+a*w/2,y+b*h/2,z+c*d/2));
  const indices=[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]];
  for(const face of faces)mesh.quad(...indices[face].map(i=>v[i]),color);
  if(mesh.colliders){const p=local(item,x,y,z);mesh.colliders.push({id:`beijing-wall-${mesh.colliders.length}`,type:'box',x:p[0],y:p[2],halfWidth:w/2,halfDepth:d/2,angle:item.angle,minHeight:y-h/2,maxHeight:y+h/2});}
}
function curtainWall(mesh,segment){
  const {base,length,index}=segment,top=base+58;
  // Adjacent stone spans join below the parapets; their buried bottoms and
  // internal end faces need no triangles. Collision still uses the exact solid.
  stonePrism(mesh,segment,0,top/2,0,length+1.6,top,43,index%4===0?'#82887e':'#92968b',[0,1,4]);
  for(const side of[-1,1])stonePrism(mesh,segment,0,top+7,side*19,length+1.7,14,6,'#a5a89a',[0,1,4]);
  detail(mesh,()=>{
    mesh.quad(local(segment,-length/2,top+.8,-16),local(segment,-length/2,top+.8,16),local(segment,length/2,top+.8,16),local(segment,length/2,top+.8,-16),'#b5b5a4');
    for(const side of[-1,1]){
      const z=side*21.56;
      // Flat inset masonry joints, kept to large legible courses rather than
      // expensive tiny box bricks that shimmer at normal racing distance.
      for(let row=0;row<4;row++){
        const h=top-10-row*11;
        mesh.quad(local(segment,-length/2,h,z),local(segment,length/2,h,z),local(segment,length/2,h+.9,z),local(segment,-length/2,h+.9,z),'#737e75');
        if(row%2===index%2){const x=row%2?length*.23:-length*.23;
          mesh.quad(local(segment,x,h,z),local(segment,x+.9,h,z),local(segment,x+.9,h+10.1,z),local(segment,x,h+10.1,z),'#798177');
        }
      }
    }
  });
  for(const side of[-1,1]){
    stonePrism(mesh,segment,0,top+21,side*19,18,14,7,'#aaac9e',[0,1,2,3,4]);
    detail(mesh,()=>mesh.quad(local(segment,-10,top+28.2,side*19-5),local(segment,-10,top+28.2,side*19+5),local(segment,10,top+28.2,side*19+5),local(segment,10,top+28.2,side*19-5),'#c3c4b0'));
  }
}
function watchtower(mesh,item){
  const {base,width:w,height:h,index}=item,depth=68,top=base+h;
  box(mesh,item,0,base+3,0,w+10,6,depth+10,'#737e75');
  box(mesh,item,0,base+h/2,0,w,h,depth,index%2?'#999e90':'#92988b');
  box(mesh,item,0,top-3,0,w+7,6,depth+7,'#c1c1ac');
  const rows=6;
  detail(mesh,()=>{
    for(let row=0;row<rows;row++)for(const side of[-1,1]){
      const y=base+10+row*9;
      mesh.quad(local(item,-w/2,y,side*(depth/2+.3)),local(item,w/2,y,side*(depth/2+.3)),local(item,w/2,y+.8,side*(depth/2+.3)),local(item,-w/2,y+.8,side*(depth/2+.3)),'#717d75');
      mesh.quad(local(item,side*(w/2+.3),y,-depth/2),local(item,side*(w/2+.3),y,depth/2),local(item,side*(w/2+.3),y+.8,depth/2),local(item,side*(w/2+.3),y+.8,-depth/2),'#717d75');
    }
    // Recessed arched embrasures on every face, with cut-stone arch rings.
    for(let face=0;face<4;face++){
      const frame={...item,angle:item.angle+face*Math.PI/2},front=-(face%2?w:depth)/2-.6;
      for(const x of[-19,0,19]){
        mesh.quad(local(frame,x-5,base+h-36.5,front-.7),local(frame,x+5,base+h-36.5,front-.7),local(frame,x+5,base+h-19.5,front-.7),local(frame,x-5,base+h-19.5,front-.7),'#38433f');
        const cy=base+h-20;
        for(let step=0;step<8;step++){
          const a=step/8*Math.PI,b=(step+1)/8*Math.PI;
          mesh.triangle(local(frame,x,cy,front-.15),local(frame,x+Math.cos(a)*5,cy+Math.sin(a)*5,front-.15),local(frame,x+Math.cos(b)*5,cy+Math.sin(b)*5,front-.15),'#38433f');
          mesh.quad(local(frame,x+Math.cos(a)*5,cy+Math.sin(a)*5,front-.25),local(frame,x+Math.cos(a)*7,cy+Math.sin(a)*7,front-.25),local(frame,x+Math.cos(b)*7,cy+Math.sin(b)*7,front-.25),local(frame,x+Math.cos(b)*5,cy+Math.sin(b)*5,front-.25),'#c1c1af');
        }
        mesh.quad(local(frame,x-6.5,base+h-38,front-.7),local(frame,x+6.5,base+h-38,front-.7),local(frame,x+6.5,base+h-36,front-.7),local(frame,x-6.5,base+h-36,front-.7),'#c1c1af');
      }
    }
  });
  if(item.kind==='roof-watchtower'){
    // A minority have tiled guard pavilions: two shallow eaves and a ridge.
    detail(mesh,()=>{
      const y=top+8;
      for(const side of[-1,1])for(let step=0;step<5;step++){
        const a=step/5,b=(step+1)/5,front=t=>side*(depth/2+7)*(1-t),up=t=>y+22*Math.pow(t,.76)+4*(1-t)**5;
        const roof=[local(item,-w/2-8,up(a),front(a)),local(item,w/2+8,up(a),front(a)),local(item,w/2+8,up(b),front(b)),local(item,-w/2-8,up(b),front(b))];
        mesh.quad(...(side>0?roof:roof.reverse()),'#4e5e59');
        for(let tile=-4;tile<=4;tile++){const tx=tile*(w+10)/10;mesh.quad(local(item,tx,up(a)+.3,front(a)),local(item,tx+1.2,up(a)+.3,front(a)),local(item,tx+1.2,up(b)+.3,front(b)),local(item,tx,up(b)+.3,front(b)),'#79847a');}
      }
      box(mesh,item,0,y+23,0,w+19,3,4,'#aeb29d');
    });
    // The closed support walls are exact solids; the decorative roof overhang
    // stays above them and never receives an oversized collision cylinder.
    box(mesh,item,0,top+4,0,w+2,8,depth+2,'#858e80');
  }else{
    for(const side of[-1,1]){
      box(mesh,item,0,top+7,side*(depth/2-2),w+6,14,6,'#a7ac99');
      box(mesh,item,side*(w/2-2),top+7,0,6,14,depth+6,'#a7ac99');
      for(let i=-2;i<=2;i++)box(mesh,item,i*w/5,top+22,side*(depth/2-2),10,16,8,'#b3b7a3');
      for(let i=-1;i<=1;i++)box(mesh,item,side*(w/2-2),top+22,i*depth/4,8,16,10,'#b3b7a3');
    }
  }
  if(item.kind==='gate-watchtower'){
    for(const side of[-1,1]){
      box(mesh,item,side*(w/2+8),base+30,0,16,60,depth+8,'#899283');
      box(mesh,item,side*(w/2+8),base+61,0,19,3,depth+11,'#bfc2ad');
    }
  }
}
export function addBeijingGreatWall(mesh){
  if(TRACK.theme!=='beijing')return;
  const {segments,towers}=beijingWallLayout();
  for(const segment of segments)ridge(mesh,segment);
  for(const segment of segments)curtainWall(mesh,segment);
  for(const tower of towers)watchtower(mesh,tower);
}
