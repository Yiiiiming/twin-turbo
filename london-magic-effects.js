import { magicLocal } from './london-magic-layout.js';

const TAU=Math.PI*2,clamp=n=>Math.max(0,Math.min(1,n));
const mix=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
export const MAGIC_EFFECT_VERTICES=4096;

export const MAGIC_DUEL_CYCLE=1.8;

/** The duel is already in progress at every arrival time. Attacks change hands
 * every .9 seconds, so driving past never lands in a long preparation/rest gap.
 * One simulation clock keeps both views, pause and replay perfectly in sync. */
export function londonMagicState(items,time=0){
 if(!items.length)return {actors:[],duels:[],car:null,lights:[]};
 const duels=items.filter(item=>item.kind.startsWith('magic-duel')).map((item,index)=>{
  const t=(Math.max(0,time)+index*.43)%MAGIC_DUEL_CYCLE,
   attackSide=Math.floor(t/.9),attackProgress=(t% .9)/.9,
   strike=smooth(attackProgress/.16)*(1-smooth((attackProgress-.55)/.42)),
   counter=smooth((attackProgress-.68)/.18),impact=.5+.5*strike;
  const actors=[-1,1].map((side,i)=>{
   const attacking=i===attackSide,p=magicLocal(item,side*80,20,0),
    angle=item.angle+(side<0?Math.PI/2:-Math.PI/2),kind=index?(i?'deathEater':'hermione'):(i?'voldemort':'harry');
   // The body leans into a cast; its opponent recoils and snaps a counter back.
   // Shoulder and wand use the same body transform, keeping every joint joined.
   const bodyRoll=attacking?-.12*strike:.13*strike-.09*counter,
    armPitch=attacking?.19*(1-smooth(attackProgress/.14))+.035*Math.sin(t*24):.10*strike-.12*counter;
   const actor={kind,x:p[0],y:p[1],z:p[2],angle,armPitch,bodyRoll,
    attacking,beamStrength:attacking?.9+.1*strike:.58+.35*counter};
   actor.wand=magicWandPoint(actor);return actor;
  });
  const clash=magicLocal(item,(attackSide===0?1:-1)*strike*22,57+3*Math.sin(t*9),-1);
  return {item,t,phase:attackProgress<.18?'cast':attackProgress<.72?'clash':'counter',
   attackSide,attackProgress,release:1,impact,strike,counter,actors,clash,index};
 });
 const castle=items.find(item=>item.kind==='hogwarts-castle'),phase=time*.36;
 const local=[Math.cos(phase)*390,208+Math.sin(phase*1.6)*57,Math.sin(phase)*220-45];
 const pos=magicLocal(castle,...local),vx=-Math.sin(phase)*390,vz=Math.cos(phase)*220,
  tangent=castle.angle+Math.atan2(vz,vx);
 const lights=duels.map(duel=>({position:duel.clash,color:duel.index?[.28,.53,1]:[1,.42,.19],
  strength:.55+duel.impact*.55}));
 return {actors:duels.flatMap(duel=>duel.actors),duels,car:{x:pos[0],y:pos[1],z:pos[2],angle:tangent,
  roll:-.17*Math.sin(phase+.45),pitch:.12*Math.cos(phase*1.6)},lights};
}

export function magicBodyMatrix(actor){
 const c=Math.cos(actor.angle),s=Math.sin(actor.angle),cp=Math.cos(actor.bodyRoll||0),sp=Math.sin(actor.bodyRoll||0);
 return new Float32Array([c,0,s,0,-s*sp,cp,c*sp,0,-s*cp,-sp,c*cp,0,actor.x,actor.y,actor.z,1]);
}
/** Right-shoulder X rotation composed with the same moving body as the robe. */
export function magicArmMatrix(actor){
 const c=Math.cos(actor.angle),s=Math.sin(actor.angle),body=actor.bodyRoll||0,
  cp=Math.cos(body+actor.armPitch),sp=Math.sin(body+actor.armPitch),bs=Math.sin(body),bc=Math.cos(body);
 return new Float32Array([c,0,s,0,-s*sp,cp,c*sp,0,-s*cp,-sp,c*cp,0,
  actor.x+c*8-s*38*bs,actor.y+38*bc,actor.z+s*8+c*38*bs,1]);
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
    const color=colors[i],end=duel.clash,pulse=actor.beamStrength*(.88+.12*Math.sin(t*32+i));
    // Both sides stay visibly connected. Fast travelling cores and a moving
    // collision point show pressure and counterattack even during a short pass.
    const path=[actor.wand,...[.2,.4,.6,.8].map((u,j)=>{
     const p=mix(actor.wand,end,u),wave=Math.sin(t*31+j*1.8+i)*1.45*Math.sin(u*Math.PI);
     p[1]+=wave;p[0]+=Math.sin(duel.item.angle)*wave*.5;p[2]-=Math.cos(duel.item.angle)*wave*.5;return p;
    }),end];
    for(let j=0;j<5;j++){
     this.ribbon(path[j],path[j+1],2.7,color,.28*pulse,2.1);
     this.ribbon(path[j],path[j+1],.8,color.map(c=>c*.7+.3),pulse,.6);
    }
    this.orb(actor.wand,4+2*pulse,color,.48);
    for(const offset of[0,.5]){
     const progress=(t*5+offset+i*.21)%1,head=mix(actor.wand,end,progress),tail=mix(actor.wand,end,Math.max(0,progress-.22));
     this.ribbon(tail,head,1.5,color.map(c=>c*.5+.5),.95);
     this.orb(head,3.2,color,.8);
    }
   });
   this.orb(duel.clash,6+duel.strike*3,[1,.8,.48],.65);
   // Short, continuously renewed sparks replace the old multi-second wait.
   for(let j=0;j<20;j++){
    const a=j*2.399,age=((t*3+j*.071)%1)*.35,speed=40+(j%7)*8;
    const at=dt=>[duel.clash[0]+Math.cos(a)*speed*dt,duel.clash[1]+(j%5-1)*24*dt-40*dt*dt,duel.clash[2]+Math.sin(a)*speed*dt];
    this.ribbon(at(age),at(Math.max(0,age-.05)),.7,j%2?colors[0]:colors[1],(1-age/.35)*.8);
   }
   if(duel.counter>0){
    const defender=duel.actors[1-duel.attackSide],center=mix(defender.wand,duel.clash,.24),
     alpha=Math.sin(duel.counter*Math.PI)*.6;
    this.ring(center,10+duel.counter*12,[.32,.72,1],alpha,duel.item.angle);
   }
  }
  return this;
 }
}
