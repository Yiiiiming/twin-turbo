import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceEngine, TRACK, setTrack, trackPoint, projectTrack, mod } from '../src/engine.js';
import { GhostRecorder, validateReplay, validateRaceReplay, ghostVersionForCity } from '../src/ghost-replay.js';
import { UnifiedRecordsClient } from '../src/unified-records.js';
import { LEADERBOARD_VERSION } from '../src/leaderboard.js';

test.afterEach(()=>setTrack('coast'));
const dt=1/60;

// Feed a smooth world-space path through the public physics step, then sample
// the real recorder exactly as main.js does. At 100 units/s on grass, including
// its gentle lateral arc, the excursion is below the 145-unit grass limit.
// There is no direct manipulation of checkpoints, laps, or recorder state.
function recordedRun({city='coast',laps=3,timeout=false}={}){
 setTrack(city);
 const engine=new RaceEngine({laps}).start(),recorder=new GhostRecorder(),completed=[];
 recorder.sample(engine);
 while(engine.state==='countdown'){engine.step(.1);recorder.sample(engine);}
 const cursor=engine.cars.map(car=>car._gridS),maxOffroad=[0,0],beyondRunoff=[false,false],grassGate=[false,false];
 const gate=TRACK.length/TRACK.checkpoints*4,halfSpan=timeout?1000:500;
 let rescueObserved=false,invalidAtRescue=false;
 for(let frame=0;frame<60*(laps*90+30)&&engine.state!=='finished';frame++){
  const oldCheckpoint=engine.cars.map(car=>car._nextCheckpoint);
  for(const [index,car]of engine.cars.entries()){
   if(car.finished||car.rescueCooldown>0)continue;
   const local=mod(cursor[index]-TRACK.startDistance,TRACK.length),distance=local-gate;
   const excursion=!timeout||index===0&&!rescueObserved;
   const within=excursion&&Math.abs(distance)<halfSpan;
   cursor[index]+=(within?(timeout?80:100):300)*dt;
   const nextLocal=mod(cursor[index]-TRACK.startDistance,TRACK.length),nextDistance=nextLocal-gate;
   const bump=excursion&&Math.abs(nextDistance)<halfSpan?Math.cos(nextDistance/halfSpan*Math.PI/2)**2:0;
   const outside=TRACK.roadWidth/2+TRACK.checkpointMargin+35;
   const lane=car._lane+Math.sign(car._lane)*(outside-Math.abs(car._lane))*bump;
   const p=trackPoint(cursor[index],lane),movement=Math.hypot(p.x-car.x,p.y-car.y);
   assert.ok(movement<10,`continuous input path: ${movement}`);
   car.x=p.x;car.y=p.y;car.angle=p.angle;car.speed=0;
  }
  engine.step(dt);completed.push(...recorder.sample(engine));
  for(const [index,car]of engine.cars.entries()){
   maxOffroad[index]=Math.max(maxOffroad[index],car.offroadTime);
   const outside=projectTrack(car.x,car.y).distance>TRACK.roadWidth/2+TRACK.checkpointMargin;
   beyondRunoff[index]||=outside;
   if(outside&&car._nextCheckpoint!==oldCheckpoint[index])grassGate[index]=true;
  }
  if(timeout&&!rescueObserved&&engine.cars[0].rescueCount){
   rescueObserved=true;
   const car=engine.cars[0],racer=recorder.racers.get(1);
   invalidAtRescue=racer.active?.valid===false&&racer.race.valid===false;
   assert.equal(car.rescueReason,'offroad');assert.ok(car.rescueCooldown>1.9);
   // Continue from the actual recovery point after the two-second penalty.
   cursor[0]=car._lastTrackS;
  }
 }
 assert.equal(engine.state,'finished','the real engine can finish after the excursion');
 return {engine,recorder,completed,maxOffroad,beyondRunoff,grassGate,rescueObserved,invalidAtRescue};
}

class Element{
 constructor(){this.children=[];this.textContent='';this.value='';this.classList={toggle(){}};}
 appendChild(child){this.children.push(child);return child;}
 replaceChildren(...children){this.children=children;}
 addEventListener(){}
 setAttribute(){}
}
async function saveRun(run){
 const nodes=new Map(),posts=[];
 const document={createElement:()=>new Element(),getElementById:id=>{
  if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);
 }};
 const client=new UnifiedRecordsClient({document,storage:null,origin:'https://records.test',fetchImpl:async(url,options)=>{
  const parsed=new URL(url),body=options.body?JSON.parse(options.body):null;
  let data;
  if(body){
   posts.push({path:parsed.pathname,body});
   data={city:body.city,version:body.version,saved:true,...(parsed.pathname==='/api/records'?{laps:body.laps}:{entry:{
    id:body.id,name:body.name,timeMs:body.timeMs,playerId:body.playerId,mode:body.mode,totalRecordId:body.totalRecordId,
    ...(body.replay.kind==='race'?{kind:'race',laps:3}:{kind:'lap',laps:1}),
   }})};
  }else data={city:TRACK.id,version:parsed.pathname==='/api/leaderboard'?LEADERBOARD_VERSION:parsed.searchParams.get('version'),
   laps:Number(parsed.searchParams.get('laps')),entries:[]};
  return {ok:true,status:200,json:async()=>data};
 }});
 client.city=client.raceCity=TRACK.id;
 client.showResults(run.engine.cars.map(car=>({city:TRACK.id,playerId:car.id,mode:'local',laps:run.engine.laps,
  finished:car.finished,timeMs:Math.round(car.finishTime*1000),replay:run.recorder.bestReplay(car.id),raceReplay:run.recorder.fullRaceReplay(car.id)})));
 assert.equal(client.cards.length,2);
 for(const card of client.cards){card.input.value=`Grass driver ${card.playerId}`;await client.save(card);assert.equal(card.done,true);assert.equal(card.total.state,'saved');assert.equal(card.lap.state,'saved');if(run.engine.laps===3)assert.equal(card.race.state,'saved');}
 return posts;
}

for(const city of ['coast','coast-beijing'])for(const laps of [1,3])test(`${city}: a continuous under-seven-second grass excursion still completes and saves ${laps}-lap ghosts`,async()=>{
 const run=recordedRun({city,laps});
 for(const [index,car]of run.engine.cars.entries()){
  assert.equal(car.rescueCount,0);assert.equal(car.missedCheckpoint,false);assert.equal(car.lap,laps);
  assert.ok(run.maxOffroad[index]>4&&run.maxOffroad[index]<7,`meaningful grace interval: ${run.maxOffroad[index]}`);
  assert.equal(run.beyondRunoff[index],true);assert.equal(run.grassGate[index],true,'earns an ordered gate beyond the old runoff');
  const replay=run.recorder.bestReplay(car.id);assert.ok(validateReplay(replay));
  assert.ok(replay.durationMs>=25000);assert.equal(run.completed.filter(event=>event.id===car.id).length,laps);
  if(laps===3){const full=run.recorder.fullRaceReplay(car.id);assert.ok(validateRaceReplay(full));assert.equal(full.durationMs,Math.round(car.finishTime*1000));}
 }
 const posts=await saveRun(run);
 assert.equal(posts.length,laps===3?6:4);
 for(const {path,body}of posts)if(path==='/api/laps'){
  const race=body.replay.kind==='race';assert.ok(race?validateRaceReplay(body.replay):validateReplay(body.replay));
  assert.equal(body.version,ghostVersionForCity(city,race?3:1));
 }
});

test('seven seconds on grass auto-recovers and rejects that replay, while later complete laps remain recordable',()=>{
 const run=recordedRun({laps:3,timeout:true});
 assert.equal(run.rescueObserved,true);assert.equal(run.invalidAtRescue,true);
 assert.ok(run.maxOffroad[0]>6.98&&run.maxOffroad[0]<7);
 assert.equal(run.engine.cars[0].rescueCount,1);assert.equal(run.engine.cars[1].rescueCount,0);
 assert.equal(run.recorder.fullRaceReplay(1),null,'a recovery cannot create a seamless whole-race ghost');
 assert.ok(validateReplay(run.recorder.bestReplay(1)),'the next clean lap can still be kept');
 assert.equal(run.completed.filter(event=>event.id===1).length,2,'only the recovered first lap is rejected');
 assert.equal(run.completed.filter(event=>event.id===2).length,3);
 assert.ok(validateRaceReplay(run.recorder.fullRaceReplay(2)),'the other human keeps their full race');
});
