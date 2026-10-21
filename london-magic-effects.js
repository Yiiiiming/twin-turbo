import { magicLocal } from './london-magic-layout.js';

const TAU=Math.PI*2,clamp=n=>Math.max(0,Math.min(1,n));
const mix=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
export const MAGIC_EFFECT_VERTICES=4096;

/** Shared simulation clock: both viewports observe the same actors and spell
 * phase. No random per-frame mutations, timers, traffic or physics callbacks. */
export function londonMagicState(items,time=0){
 if(!items.length)return {actors:[],duels:[],car:null,lights:[]};
 const duels=items.filter(item=>item.kind.startsWith('magic-duel')).map((item,index)=>{
  const t=((Math.max(0,time)+index*2.9)%7.6),raise=smooth(t/1.05),release=smooth((t-1.08)/.64),
   impact=smooth((t-1.75)/.17)*(1-smooth((t-2.55)/.6)),rest=smooth((t-5.2)/1.8);
  const armPitch=.46*(1-raise)+.12*Math.sin(t*3)*(1-release)+.34*rest;
  const actors=[-1,1].map((side,i)=>{
   const p=magicLocal(item,side*80,20,0),angle=item.angle+(side<0?Math.PI/2:-Math.PI/2),
    kind=index?(i?'deathEater':'hermione'):(i?'voldemort':'harry');
   const actor={kind,x:p[0],y:p[1],z:p[2],angle,armPitch:armPitch+(i?.045:0)};
   actor.wand=magicWandPoint(actor);return actor;
  });
  const clash=magicLocal(item,0,55+4*Math.sin(t*2),-1);
  return {item,t,phase:t<1.08?'raise':t<1.75?'cast':t<3.15?'clash':t<5.2?'shield':'recover',release,impact,actors,clash,index};
 });
 const castle=items.find(item=>item.kind==='hogwarts-castle'),phase=time*.36;
 const local=[Math.cos(phase)*390,208+Math.sin(phase*1.6)*57,Math.sin(phase)*220-45];
 const pos=magicLocal(castle,...local),vx=-Math.sin(phase)*390,vz=Math.cos(phase)*220,
  tangent=castle.angle+Math.atan2(vz,vx);
 const lights=duels.map(duel=>({position:duel.clash,color:duel.index?[.28,.53,1]:[1,.42,.19],
  strength:duel.impact*1.1+(duel.phase==='cast'?.35:0)}));
 return {actors:duels.flatMap(duel=>duel.actors),duels,car:{x:pos[0],y:pos[1],z:pos[2],angle:tangent,
  roll:-.17*Math.sin(phase+.45),pitch:.12*Math.cos(phase*1.6)},lights};
}

/** Right-shoulder local X rotation composed with the actor's world yaw. */
export function magicArmMatrix(actor){
 const c=Math.cos(actor.angle),s=Math.sin(actor.angle),cp=Math.cos(actor.armPitch),sp=Math.sin(actor.armPitch);
 return new Float32Array([c,0,s,0,-s*sp,cp,c*sp,0,-s*cp,-sp,c*cp,0,
  actor.x+c*8,actor.y+38,actor.z+s*8,1]);
}
export function magicWandPoint(actor){
 const m=magicArmMatrix(actor),v=[0,-1,-24];
 return [0,1,2].map(row=>m[row]*v[0]+m[4+row]*v[1]+m[8+row]*v[2]+m[12+row]);
}

/** A bounded reusable VBO payload. Only this small buffer changes each frame;
 * the castle, characters and flying car are uploaded once per scene rebuild. */
export class MagicEffects {
 constructor(){this.data=new Float32Array(MAGIC_EFFECT_VERTICES*11);this.count=0;}
 vertex(p,color,alpha=1){
  if(this.count>=MAGIC_EFFECT_VERTICES)throw new RangeError('Magic effect pool exhausted');
  const k=this.count++*11;this.data.set([...p,0,1,0,...color,alpha,1],k);
 }
 tri(a,b,c,color,alpha=1){this.vertex(a,color,alpha);this.vertex(b,color,alpha);this.vertex(c,color,alpha);}
 ribbon(a,b,width,color,alpha,endWidth=width){
  const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz)||1,
   off=[-dz/length*width,0,dx/length*width];
  for(const axis of [off,[0,width,0]]){
   const p=(v,sign)=>v.map((n,i)=>n+sign*axis[i]*(v===b?endWidth/width:1));
   this.tri(p(a,-1),p(b,-1),p(b,1),color,alpha);this.tri(p(a,-1),p(b,1),p(a,1),color,alpha);
  }
 }
 orb(p,r,color,alpha){
  for(const axes of [[0,1],[1,2]])for(let j=0;j<10;j++){
   const a=j/10*TAU,b=(j+1)/10*TAU,q=t=>p.map((n,i)=>n+(i===axes[0]?Math.cos(t)*r:i===axes[1]?Math.sin(t)*r:0));
   this.vertex(p,color,alpha);this.vertex(q(a),color,0);this.vertex(q(b),color,0);
  }
 }
 ring(p,r,color,alpha,angle){
  const c=Math.cos(angle),s=Math.sin(angle),point=(a,radius)=>[p[0]+c*Math.cos(a)*radius,p[1]+Math.sin(a)*radius,p[2]+s*Math.cos(a)*radius];
  for(let j=0;j<20;j++){
   const a=j/20*TAU,b=(j+1)/20*TAU;
   this.tri(point(a,r),point(b,r),point(b,r+1.5),color,alpha);
   this.tri(point(a,r),point(b,r+1.5),point(a,r+1.5),color,alpha);
  }
 }
 update(state){
  this.count=0;
  for(const duel of state.duels){
   const colors=duel.index?[[.4,.64,1],[.9,.31,.73]]:[[1,.2,.12],[.19,1,.4]],t=duel.t;
   duel.actors.forEach((actor,i)=>{
    const color=colors[i];
    if(t<1.75)this.orb(actor.wand,4+4*smooth(t),color,.4+.5*smooth(t));
    if(t>=1.08&&t<3.15){
     const end=mix(actor.wand,duel.clash,duel.release),pulse=.7+.2*Math.sin(t*24+i);
     const path=[actor.wand,...[1/3,2/3].map((u,j)=>{const p=mix(actor.wand,end,u);p[1]+=Math.sin(t*21+j*2+i)*.9;return p;}),end];
     for(let j=0;j<3;j++){
      const taper=1-j*.13;
      this.ribbon(path[j],path[j+1],2.4*taper,color,.25*pulse,2.4*(taper-.13));
      this.ribbon(path[j],path[j+1],.65*taper,color.map(c=>c*.8+.2),pulse,.65*(taper-.13));
     }
     const bead=mix(actor.wand,end,(t*3+i*.4)%1);this.orb(bead,2.3,color,.7);
     this.orb(end,4,color,.7);
    }
   });
   if(duel.impact>0){
    this.orb(duel.clash,6+duel.impact*5,[1,.78,.38],duel.impact*.65);
    for(let j=0;j<28;j++){
     const a=j*2.399,age=(t-1.75)*(j%3*.11+.72),speed=18+(j%7)*5;
     if(age<0||age>1.45)continue;
     const at=dt=>[duel.clash[0]+Math.cos(a)*speed*dt,duel.clash[1]+(j%5-1)*12*dt-24*dt*dt,duel.clash[2]+Math.sin(a)*speed*dt];
     this.ribbon(at(age),at(Math.max(0,age-.065)),.65,j%2?colors[0]:colors[1],(1-age/1.45)*.85);
    }
   }
   if(t>=3.1&&t<5.2){
    const u=(t-3.1)/2.1,center=mix(duel.actors[0].wand,duel.actors[1].wand,.72);
    this.ring(center,5+u*30,[.32,.72,1],Math.sin(u*Math.PI)*.65,duel.item.angle);
    this.orb(center,5+u*12,[.35,.65,1],(1-u)*.3);
   }
  }
  return this;
 }
}
