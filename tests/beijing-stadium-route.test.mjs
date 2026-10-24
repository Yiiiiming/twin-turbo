import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRACK, TRACKS, setTrack, trackPoint, projectTrack, RaceEngine, mod } from '../src/engine.js';
import { pointOnTrack } from '../src/tracks.js';
import { legacyToStadiumDistance } from '../src/beijing-stadium-route.js';
import { RaceAI } from '../src/ai.js';
import { sceneObstacles } from '../src/renderer.js';
import { routeDefinition, routeDigest, routeDrivingSamples } from './helpers/route-snapshot.mjs';

const locks=JSON.parse(readFileSync(new URL('./fixtures/route-locks.json',import.meta.url),'utf8'));
const angleGap=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
test.beforeEach(()=>setTrack('coast-beijing'));
test.afterEach(()=>setTrack('coast'));

test('the stadium preserves its accepted Beijing base and every other driving route',()=>{
 assert.equal(routeDigest(routeDefinition(TRACK.stadium.baseRoute)),
  '8bb4d411e74489c8fd3f3f7a417cc0f450921aa0b8f6b7cdcdbf57adf04ec020');
 for(const [id,track]of Object.entries(TRACKS)){
  if(id==='coast-beijing')continue;
  setTrack(id);
  assert.equal(routeDigest(routeDefinition(track)),locks.routes[id].geometrySha256,id);
  assert.equal(routeDigest(routeDrivingSamples(track,trackPoint)),locks.routes[id].drivingSha256,id);
 }
});

test('only the approved local splice changes world position or elevation',()=>{
 const stadium=TRACK.stadium,base=stadium.baseRoute;
 assert.deepEqual(TRACK.startGrid,base.startGrid);
 assert.equal(TRACK.startDistance,base.startDistance);assert.equal(TRACK.roadWidth,120);
 assert.deepEqual(TRACK.sections,base.sections,'the original garden hill stays unchanged');
 for(let s=0;s<base.length;s+=17){
  if(s>stadium.legacyStart&&s<stadium.legacyEnd)continue;
  for(const lane of[-38,0,38]){
   const old=pointOnTrack(base,s,lane),now=trackPoint(legacyToStadiumDistance(stadium,s),lane);
   assert.ok(Math.hypot(old.x-now.x,old.y-now.y)<1e-7,`old road moved at ${s}`);
   assert.ok(angleGap(old.angle,now.angle)<1e-10);assert.ok(Math.abs(old.elevation-now.elevation)<1e-10);
   assert.ok(Math.abs(old.slope-now.slope)<1e-10);
  }
 }
 assert.ok(Math.abs(legacyToStadiumDistance(stadium,base.length+350)-(TRACK.length+350))<1e-8);
});

test('the required lap uses both complete oval straights and over ninety-three percent of its perimeter',()=>{
 const stadium=TRACK.stadium,loop=stadium.loopSegments;
 assert.equal(stadium.radius,320);assert.equal(stadium.straightLength,800);
 assert.deepEqual(loop.filter(s=>s.kind==='line').map(s=>s.length),[800,800]);
 const length=loop.reduce((sum,s)=>sum+s.length,0),perimeter=2*stadium.straightLength+2*Math.PI*stadium.radius;
 assert.ok(Math.abs(length-(perimeter-250))<1e-8);
 assert.ok(length/perimeter>.93,'a large angular turn alone must not stand in for a whole oval lap');
 assert.ok(Math.abs(stadium.loopEnd-stadium.loopStart-length)<1e-8);
 assert.ok(TRACK.checkpoints>=80&&TRACK.checkpoints%4===0&&TRACK.length/TRACK.checkpoints<250);
 const entry=trackPoint(stadium.loopStart),exit=trackPoint(stadium.loopEnd);
 assert.ok(Math.hypot(entry.x-exit.x,entry.y-exit.y)>240,'the two doors never share one projection point');
});

test('the quarter arcs, splice tangents and bridge slopes remain continuous',()=>{
 for(const segment of TRACK.segments){
  if(segment.kind==='arc'){
   assert.ok(segment.radius>=250);
   if(segment.s>=TRACK.stadium.start&&segment.s<TRACK.stadium.end)assert.ok(Math.abs(segment.sweep)<=Math.PI/2+1e-10);
  }
  const a=trackPoint(segment.s+segment.length-1e-5),b=trackPoint(segment.s+segment.length+1e-5);
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-4);
  assert.ok(angleGap(a.angle,b.angle)<1e-6);assert.ok(Math.abs(a.elevation-b.elevation)<1e-4);
 }
 for(let s=0;s<TRACK.length;s+=11)assert.ok(Math.abs(trackPoint(s).slope)<=.25000001);
 assert.equal(trackPoint(TRACK.stadium.loopStart).elevation,160);
 assert.equal(trackPoint(TRACK.stadium.bridge.end+1).elevation,0);
});

test('overlapping bridge branches have a real floor gap and project onto their own route station',()=>{
 const points=[];let encounters=0;
 for(let s=0;s<TRACK.length;s+=16){
  points.push(trackPoint(s));
  for(const lane of[-40,0,40]){
   const p=trackPoint(s,lane),projected=projectTrack(p.x,p.y,s,p.elevation);
   assert.ok(Math.abs(mod(projected.s-s+TRACK.length/2,TRACK.length)-TRACK.length/2)<1e-6,`projection switched branch at ${s}/${lane}`);
  }
 }
 for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
  const a=points[i],b=points[j],gap=Math.min(b.s-a.s,TRACK.length-b.s+a.s);
  if(gap<550||Math.hypot(a.x-b.x,a.y-b.y)>=180)continue;
  encounters++;assert.ok(Math.abs(a.elevation-b.elevation)>=150,'a nonadjacent road crosses at the same height');
 }
 assert.ok(encounters>10,'the test must actually inspect the entrance overpass');
});

test('driving directly between stadium doors cannot earn the omitted oval checkpoints',()=>{
 const engine=new RaceEngine({laps:1}).start(),car=engine.cars[0],stadium=TRACK.stadium;
 // Enter the timed lap through the real standing-start controls; the later
 // synthetic path isolates stadium checkpoints, not pre-line launch rules.
 for(let frame=0;frame<600&&!car._started;frame++)engine.step(1/120,new Set(['KeyW']));
 assert.equal(car._started,true);assert.equal(car.launchResetCount,0);
 const sample=(p,dt=4/330)=>{
  engine.time+=dt;Object.assign(car,{x:p.x,y:p.y,angle:p.angle,elevation:p.elevation});engine._advance(car,dt);
 };
 const from=TRACK.startDistance+mod(car._lastTrackS-TRACK.startDistance,TRACK.length);
 for(let s=from+4;s<stadium.loopStart;s+=4)sample(trackPoint(s));
 const a=trackPoint(stadium.loopStart),b=trackPoint(stadium.loopEnd);
 for(let i=0;i<=80;i++)sample({x:a.x+(b.x-a.x)*i/80,y:a.y+(b.y-a.y)*i/80,angle:b.angle,elevation:a.elevation+(b.elevation-a.elevation)*i/80});
 for(let s=stadium.loopEnd+4;s<TRACK.length+TRACK.startDistance+8;s+=4)sample(trackPoint(s));
 assert.equal(car.lap,0);assert.equal(car.finished,false);assert.equal(car.missedCheckpoint,true);
});

for(const [hz,laps]of[[30,1],[60,3],[120,1]])test(`production Beijing: both drivers complete ${laps} laps at ${hz} Hz without recovery`,t=>{
 const engine=new RaceEngine({laps,obstacles:sceneObstacles()}).start(laps);
 const drivers=[new RaceAI({carId:1}),new RaceAI({carId:2})];let offroad=0,impacts=0;
 for(let frame=0;frame<hz*90*laps&&engine.state!=='finished';frame++){
  engine.step(1/hz,new Set(drivers.flatMap(driver=>[...driver.update(engine,1/hz)])));
  offroad+=engine.cars.some(car=>car.offroad)?1:0;impacts+=engine.cars.some(car=>car.impact>0)?1:0;
 }
 t.diagnostic(JSON.stringify({hz,laps,time:engine.time,offroadFrames:offroad,impactFrames:impacts,
  cars:engine.cars.map(car=>({id:car.id,finishTime:car.finishTime,bestLap:car.bestLap,rescues:car.rescueCount,lap:car.lap,station:car._lastTrackS}))}));
 assert.equal(engine.state,'finished');assert.deepEqual(drivers.map(d=>d.rescues),[0,0]);
 assert.deepEqual(engine.cars.map(car=>car.rescueCount),[0,0]);
 assert.equal(offroad,0);assert.equal(impacts,0);
 for(const car of engine.cars){assert.equal(car.lap,laps);assert.equal(car.missedCheckpoint,false);}
});
