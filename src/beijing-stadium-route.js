import { pointOnTrack } from './tracks.js';

const TAU=Math.PI*2;
const freezeSegments=segments=>Object.freeze(segments.map(Object.freeze));

/** Only the explicitly approved Beijing stadium passage replaces its old bend.
 * The frozen base remains the world-space reference for the rest of the city. */
export function createBeijingStadiumRoute(base){
 if(base.id!=='coast-beijing')throw new Error('The stadium route belongs only to Beijing');
 const oldBend=base.segments[15];
 if(oldBend.kind!=='arc'||oldBend.direction!==-1)throw new Error('Beijing stadium splice no longer matches its approved base');
 const legacyStart=oldBend.s-300,legacyEnd=oldBend.s+oldBend.length+300;
 const entry=pointOnTrack(base,legacyStart),exit=pointOnTrack(base,legacyEnd);
 const radius=320,connectorRadius=250,halfStraight=400,gapLength=250;
 const center=Object.freeze({x:4400,z:2300}),angle=0,bridgeHeight=160,rampLength=960;
 const gapAngle=gapLength/radius;
 const builder=(x=0,y=0,heading=entry.angle,s=0)=>{
  const segments=[];
  const line=length=>{
   const x2=x+Math.cos(heading)*length,y2=y+Math.sin(heading)*length;
   segments.push({kind:'line',x1:x,y1:y,x2,y2,angle:heading,length,s});x=x2;y=y2;s+=length;
  };
  const arc=(r,sweep)=>{
   const direction=Math.sign(sweep),cx=x-Math.sin(heading)*direction*r,cy=y+Math.cos(heading)*direction*r;
   let startAngle=Math.atan2(y-cy,x-cx),remaining=sweep;
   while(Math.abs(remaining)>1e-10){
    const part=direction*Math.min(Math.PI/2,Math.abs(remaining)),length=r*Math.abs(part);
    segments.push({kind:'arc',cx,cy,radius:r,startAngle,sweep:part,direction,length,s});
    startAngle+=part;remaining-=part;s+=length;
   }
   x=cx+Math.cos(startAngle)*r;y=cy+Math.sin(startAngle)*r;heading+=sweep;
  };
  return {segments,line,arc,get pose(){return{x,y,angle:heading,s};}};
 };
 // Exact directed circle tangents join fixed poses without Bezier overshoot.
 const connect=(b,target,firstDirection,lastDirection)=>{
  const p=b.pose,r=connectorRadius;
  const c1={x:p.x-Math.sin(p.angle)*firstDirection*r,y:p.y+Math.cos(p.angle)*firstDirection*r};
  const c2={x:target.x-Math.sin(target.angle)*lastDirection*r,y:target.y+Math.cos(target.angle)*lastDirection*r};
  const dx=c2.x-c1.x,dy=c2.y-c1.y,distance=Math.hypot(dx,dy),offset=(firstDirection-lastDirection)*r;
  if(distance<=Math.abs(offset))throw new Error('Stadium connection has no forward tangent');
  const heading=Math.atan2(dy,dx)+Math.asin(offset/distance),turn=n=>((n%TAU)+TAU)%TAU;
  b.arc(r,firstDirection*turn(firstDirection*(heading-p.angle)));
  b.line(Math.sqrt(distance*distance-offset*offset));
  b.arc(r,lastDirection*turn(lastDirection*(target.angle-heading)));
  if(Math.hypot(b.pose.x-target.x,b.pose.y-target.y)>1e-7)throw new Error('Stadium connector misses its target');
 };
 const loopEntry={x:center.x-halfStraight,y:center.z+radius,angle};
 const passage=builder(entry.x,entry.y,entry.angle,legacyStart);
 connect(passage,loopEntry,-1,1);
 const loop={loopStart:passage.pose.s,loopFirst:passage.segments.length};
 // Both full straights and both end turns are driven. Only a 250-unit exit
 // opening is omitted from the 3610.6-unit perimeter (93.08% coverage).
 passage.line(halfStraight*2);passage.arc(radius,-Math.PI);
 passage.line(halfStraight*2);passage.arc(radius,-Math.PI+gapAngle);
 Object.assign(loop,{loopEnd:passage.pose.s,loopLast:passage.segments.length});
 connect(passage,exit,1,1);
 const newEnd=passage.pose.s,delta=newEnd-legacyEnd;
 const before=[],after=[];
 for(const segment of base.segments){
  const end=segment.s+segment.length;
  if(end<=legacyStart)before.push(segment);
  else if(segment.s<legacyStart){
   if(segment.kind!=='line')throw new Error('Stadium entry must splice a straight');
   before.push({...segment,x2:entry.x,y2:entry.y,length:legacyStart-segment.s});
  }
  if(segment.s>=legacyEnd)after.push({...segment,s:segment.s+delta});
  else if(end>legacyEnd){
   if(segment.kind!=='line')throw new Error('Stadium exit must splice a straight');
   after.push({...segment,x1:exit.x,y1:exit.y,length:end-legacyEnd,s:newEnd});
  }
 }
 const loopSegments=freezeSegments(passage.segments.slice(loop.loopFirst,loop.loopLast));
 const perimeter=halfStraight*4+TAU*radius,loopDegrees=(TAU-gapAngle)*180/Math.PI;
 const bridge=Object.freeze({start:legacyStart,upEnd:legacyStart+rampLength,downStart:loop.loopStart,
  end:loop.loopStart+rampLength,height:bridgeHeight,rampLength});
 const stadium=Object.freeze({
  center,angle,radius,halfStraight,straightLength:halfStraight*2,loopDegrees,gapDegrees:360-loopDegrees,elevation:0,
  gapLength,perimeter,loopLength:perimeter-gapLength,loopCoverage:(perimeter-gapLength)/perimeter,bridge,
  legacyStart,legacyEnd,newEnd,delta,loopStart:loop.loopStart,loopEnd:loop.loopEnd,
  start:legacyStart,end:newEnd,aiStart:legacyStart-450,aiEnd:newEnd+140,
  baseRoute:base,loopSegments,
  entry: Object.freeze({start:legacyStart,end:loop.loopStart,segments:freezeSegments(passage.segments.slice(0,loop.loopFirst))}),
  exit: Object.freeze({start:loop.loopEnd,end:newEnd,segments:freezeSegments(passage.segments.slice(loop.loopLast))}),
  accessSegments:freezeSegments([...passage.segments.slice(0,loop.loopFirst),...passage.segments.slice(loop.loopLast)]),
  portals:Object.freeze([
   Object.freeze({x:-halfStraight,z:radius,angle:0,width:260,side:1,elevation:bridgeHeight}),
   Object.freeze({x:-halfStraight-radius*Math.sin(gapAngle),z:radius*Math.cos(gapAngle),angle:gapAngle,width:260,side:1,elevation:0}),
  ]),
 });
 const length=base.length+delta;
 return Object.freeze({...base,length,segments:freezeSegments([...before,...passage.segments,...after]),
  checkpoints:Math.ceil(length/250/4)*4,stadium,
  elevationProfile:Object.freeze([
   Object.freeze({start:bridge.start,end:bridge.upEnd,from:0,to:bridgeHeight}),
   Object.freeze({start:bridge.upEnd,end:bridge.downStart,from:bridgeHeight,to:bridgeHeight}),
   Object.freeze({start:bridge.downStart,end:bridge.end,from:bridgeHeight,to:0}),
  ]),
  description:'驶入鸟巢，在看台与编织钢结构之间沿场内跑道绕行，再接回红墙金瓦与园林长城相伴的主路。',
  descriptionEn:'Enter the Bird’s Nest, circle its running track beneath the woven stadium shell, then rejoin Beijing’s palace and garden avenues.',
  metadata:Object.freeze({...base.metadata,suggestedLapSeconds:Math.round(length/320),stadiumPassage:true})});
}

/** Preserve the circular station of old city plots, including unwrapped s. */
export function legacyToStadiumDistance(stadium,distance){
 const oldLength=stadium.baseRoute.length,newLength=oldLength+stadium.delta;
 const turn=Math.floor(distance/oldLength),s=distance-turn*oldLength;
 if(s<=stadium.legacyStart)return turn*newLength+s;
 if(s>=stadium.legacyEnd)return turn*newLength+s+stadium.delta;
 return turn*newLength+stadium.legacyStart+(s-stadium.legacyStart)/(stadium.legacyEnd-stadium.legacyStart)*(stadium.newEnd-stadium.legacyStart);
}
