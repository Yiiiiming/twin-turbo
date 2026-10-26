import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceEngine, TRACK, trackPoint, mod, setTrack } from '../src/engine.js';
import { RaceAI } from '../src/ai.js';
import { sceneObstacles, timingGateGeometry, updateChaseCamera } from '../src/renderer.js';
import { GhostRecorder } from '../src/ghost-replay.js';
import { SplitTiming, SPLIT_FRACTIONS, splitFractionsForTrack, ghostSplitTimes } from '../src/split-timing.js';
import { cityLandmarkPlacements } from '../src/city-scenery.js';
import { austinScoreboardSurface } from '../src/austin-football.js';

const signed = (from,to) => mod(to-from+TRACK.length/2,TRACK.length)-TRACK.length/2;
function realRun(hz=60,{laps=3,secondDelay=0,gateNumbers=[8,16,24,32]}={}) {
  const engine=new RaceEngine({laps,obstacles:sceneObstacles()}).start();
  const drivers=[new RaceAI({carId:1}),new RaceAI({carId:2})],timing=new SplitTiming(),recorder=new GhostRecorder();
  const events=[],actual=[],originalAdvance=engine._advance.bind(engine);
  engine._advance=(car,dt)=>{
    const oldS=car._lastTrackS,oldEarned=car._started?car.lap*TRACK.checkpoints+car._nextCheckpoint-1:-1;
    originalAdvance(car,dt);
    const earned=car._started?car.lap*TRACK.checkpoints+car._nextCheckpoint-1:-1;
    const physicalGate=earned%TRACK.checkpoints||TRACK.checkpoints;
    if(earned>0&&earned>oldEarned&&gateNumbers.includes(physicalGate)) {
      const index=gateNumbers.indexOf(physicalGate)+1,lap=Math.floor((earned-1)/TRACK.checkpoints)+1;
      const delta=signed(oldS,car._lastTrackS),distance=mod(TRACK.startDistance+physicalGate*TRACK.length/TRACK.checkpoints-oldS,TRACK.length);
      const time=index===4?car._lapStartTime:engine.time-dt+dt*Math.max(0,Math.min(1,distance/delta));
      actual.push({playerId:car.id,lap,index,timeMs:Math.round(time*1000)});
    }
  };
  let firstFinished=null;
  for(let frame=0;frame<hz*(60*laps+secondDelay+15)&&engine.state!=='finished';frame++) {
    timing.sample(engine);recorder.sample(engine);
    const keys=new Set(drivers.flatMap((driver,index)=>index===1&&engine.time<secondDelay?[]:[...driver.update(engine,1/hz)]));
    engine.step(1/hz,keys);events.push(...timing.sample(engine));recorder.sample(engine);
    if(!firstFinished&&engine.cars.some(car=>car.finished))firstFinished=engine.cars.find(car=>car.finished).id;
  }
  assert.equal(engine.state,'finished');assert.deepEqual(drivers.map(driver=>driver.rescues),[0,0]);
  return {engine,timing,events,actual,recorder,firstFinished};
}

for(const hz of [30,60,120])test(`real ${hz} Hz race records each earned quarter once with interpolated crossing times`,()=>{
  const {engine,timing,events,actual,recorder}=realRun(hz);
  assert.equal(events.length,24);assert.equal(actual.length,24);
  for(const event of events) {
    const truth=actual.find(item=>item.playerId===event.playerId&&item.lap===event.lap&&item.index===event.index);
    assert.ok(Math.abs(event.timeMs-truth.timeMs)<=2,JSON.stringify({hz,event,truth}));
    assert.ok(event.lapTimeMs>0);
  }
  for(const id of [1,2]) {
    assert.deepEqual(events.filter(event=>event.playerId===id).map(event=>[event.lap,event.index]),Array.from({length:12},(_,i)=>[1+Math.floor(i/4),1+i%4]));
    const latest=timing.latest(id);
    assert.equal(latest.lap,3);assert.equal(latest.index,4);
    assert.equal(latest.timeMs,Math.round(engine.cars[id-1].finishTime*1000));
    assert.equal(latest.deltaMs,Math.round(engine.cars[id-1].finishTime*1000)-Math.round(engine.cars[2-id].finishTime*1000));
    assert.equal(latest.waiting,false);
    const replay=recorder.fullRaceReplay(id),fullSplits=ghostSplitTimes(replay);
    assert.equal(fullSplits.length,12);assert.ok(fullSplits.every(Number.isFinite));
    for(const split of events.filter(event=>event.playerId===id)) {
      const index=(split.lap-1)*4+split.index-1;
      assert.ok(Math.abs(fullSplits[index]-split.timeMs)<=4,JSON.stringify({hz,id,index,ghost:fullSplits[index],actual:split.timeMs}));
    }
    assert.equal(fullSplits[11],replay.durationMs);
  }
  assert.equal(timing.latest(1).deltaMs,-timing.latest(2).deltaMs);
  assert.ok(events.some(event=>event.waiting&&event.deltaMs===null));
  assert.deepEqual(timing.sample(engine),[]);
});

test('a completed leader retains same-lap gates while a much later opponent finishes',()=>{
  const {engine,timing,events,firstFinished}=realRun(60,{laps:1,secondDelay:20});
  assert.equal(firstFinished,1);
  const finish1=events.find(event=>event.playerId===1&&event.index===4),finish2=events.find(event=>event.playerId===2&&event.index===4);
  assert.equal(finish1.deltaMs,null);assert.equal(finish1.waiting,true);
  assert.ok(finish2.deltaMs>19000);
  assert.equal(timing.latest(1).deltaMs,-finish2.deltaMs);
  assert.equal(timing.latest(2).timeMs,Math.round(engine.cars[1].finishTime*1000));
});

test('real ghost quarters use their own lap clock and match the recorded car',()=>{
  const first=realRun(60,{laps:2}),replay=first.recorder.bestReplay(2),ghostTimes=ghostSplitTimes(replay);
  assert.ok(ghostTimes.every(Number.isFinite));assert.equal(ghostTimes[3],replay.durationMs);
  assert.ok(ghostTimes.every((time,index)=>!index||time>ghostTimes[index-1]));
  const lap=first.engine.cars[1].lastLap===first.engine.cars[1].bestLap?2:1;
  for(let index=1;index<=4;index++) {
    const split=first.events.find(event=>event.playerId===2&&event.lap===lap&&event.index===index);
    assert.ok(Math.abs(split.lapTimeMs-ghostTimes[index-1])<=3);
  }
  first.timing.ghostTimes=ghostTimes;
  const latest=first.timing.latest(2);
  assert.equal(latest.ghostDeltaMs,latest.lapTimeMs-replay.durationMs);
  assert.notEqual(latest.ghostDeltaMs,latest.timeMs-replay.durationMs,'never mix race time with ghost lap time');
  assert.deepEqual(ghostSplitTimes(null),[null,null,null,null]);
  const slower={...replay,durationMs:Math.round(replay.durationMs*1.1),frames:replay.frames.map(frame=>[Math.round(frame[0]*1.1),...frame.slice(1)])};
  const multi=new SplitTiming().reset([{slotId:0,color:'#b8a2ed',colorLabel:'紫色',replay},{slotId:1,color:'#ffd166',colorLabel:'金色',replay:slower}]);
  multi.racers=first.timing.racers;
  const both=multi.latest(2).ghostDeltas;
  assert.equal(both.length,2);assert.deepEqual(both.map(item=>item.colorLabel),['紫色','金色']);
  assert.equal(both[0].deltaMs,latest.lapTimeMs-replay.durationMs);
  assert.equal(both[1].deltaMs,latest.lapTimeMs-slower.durationMs);
  multi.lastEngineTime=999;multi.sample({time:0,state:'countdown',cars:[]});
  assert.equal(multi.ghosts.length,2,'restart preserves both targets');assert.equal(multi.latest(2),null);

});

function snapshot(time,{id=1,lap=0,s=TRACK.length/4-2,next=8,start=0,finished=false,rescue=0}={}) {
  const p=trackPoint(s);
  return {id,...p,_lastTrackS:p.s,_started:true,lap,_nextCheckpoint:next,_lapStartTime:start,finished,rescueCooldown:rescue};
}
function engineAt(time,car,state='racing') {return {time,state,cars:[car]};}

test('different laps stay separate; pause freezes; backwards motion and rescue earn no split',()=>{
  const timing=new SplitTiming();
  timing.sample(engineAt(10,snapshot(10,{start:1})));
  let events=timing.sample(engineAt(10.02,snapshot(10.02,{s:TRACK.length/4+2,next:9,start:1})));
  assert.equal(events.length,1);assert.equal(events[0].timeMs,10010);assert.equal(events[0].deltaMs,null);
  const first=timing.latest(1);
  assert.deepEqual(timing.sample(engineAt(90,snapshot(90,{lap:2,s:TRACK.length/2,next:17}), 'paused')),[]);
  assert.deepEqual(timing.latest(1),first);
  assert.deepEqual(timing.sample(engineAt(10.04,snapshot(10.04,{s:TRACK.length/4-2,next:9,start:1}))),[]);
  assert.deepEqual(timing.sample(engineAt(10.06,snapshot(10.06,{s:TRACK.length/4+2,next:9,start:1}))),[]);
  assert.deepEqual(timing.sample(engineAt(10.08,snapshot(10.08,{s:TRACK.length/4+18,next:9,start:1,rescue:2}))),[]);
  // Another driver's next-lap CP1 is not this driver's first-lap CP1.
  timing.sample(engineAt(20,snapshot(20,{id:2,lap:1,start:11})));
  events=timing.sample(engineAt(20.02,snapshot(20.02,{id:2,lap:1,s:TRACK.length/4+2,next:9,start:11})));
  assert.equal(events.length,1);assert.equal(events[0].lap,2);assert.equal(events[0].deltaMs,null);
  assert.equal(timing.latest(1).deltaMs,null);
  timing.reset();assert.equal(timing.latest(1),null);assert.equal(timing.latest(2),null);
  assert.deepEqual(SPLIT_FRACTIONS,[.25,.5,.75,1]);
});

test('gate credit is required and engine restart clears old records',()=>{
  const timing=new SplitTiming();
  timing.sample(engineAt(10,snapshot(10)));
  assert.deepEqual(timing.sample(engineAt(10.02,snapshot(10.02,{s:TRACK.length/4+2,next:8}))),[],'shortcut has no earned gate');
  timing.sample(engineAt(10.04,snapshot(10.04,{s:TRACK.length/4-2,next:8})));
  assert.equal(timing.sample(engineAt(10.06,snapshot(10.06,{s:TRACK.length/4+2,next:9}))).length,1);
  timing.sample(engineAt(0,snapshot(0)));
  assert.equal(timing.latest(1),null);
});


function syntheticRaceReplay() {
  const durationMs=152000;
  return {version:1,kind:'race',laps:3,durationMs,lapEndsMs:[52000,102000,152000],
    frames:Array.from({length:durationMs/100+1},(_,index)=>{
      const time=index*100,s=TRACK.startDistance+(time<2000?-30+time*.015:(time-2000)*TRACK.length/50000);
      const point=trackPoint(s,-18);
      return [time,point.x,point.y,point.angle,point.elevation];
    })};
}

test('whole-race ghosts keep twelve ordered quarter passages and compare against GO time, not a repeating lap clock',()=>{
  const replay=syntheticRaceReplay(),times=ghostSplitTimes(replay);
  const expected=[14500,27000,39500,52000,64500,77000,89500,102000,114500,127000,139500,152000];
  assert.equal(times.length,12);
  for(let i=0;i<12;i++)assert.ok(Math.abs(times[i]-expected[i])<=2,`split ${i}: ${times[i]} vs ${expected[i]}`);
  const faster={...replay,durationMs:136800,lapEndsMs:replay.lapEndsMs.map(t=>Math.round(t*.9)),frames:replay.frames.map(frame=>[Math.round(frame[0]*.9),...frame.slice(1)])};
  const timing=new SplitTiming().reset([{slotId:0,colorLabel:'紫色',replay},{slotId:1,colorLabel:'金色',replay:faster}]);
  const record={playerId:1,lap:2,index:2,timeMs:79000,lapTimeMs:27000};
  timing.racers.set(1,{opponentId:2,records:new Map([['2:2',record]]),latest:record});
  const comparison=timing.latest(1);
  assert.ok(Math.abs(comparison.ghostDeltaMs-2000)<=2);
  assert.ok(Math.abs(comparison.ghostDeltas[0].deltaMs-2000)<=2);
  assert.ok(Math.abs(comparison.ghostDeltas[1].deltaMs-9700)<=2);
  assert.equal(timing.forPlayer(1).ghostDeltaSeconds,comparison.ghostDeltaMs/1000);
  const outside={...record,lap:4};timing.racers.get(1).latest=outside;
  assert.equal(timing.latest(1).ghostDeltaMs,null,'a three-lap ghost cannot wrap around into a fourth lap');
  assert.ok(timing.latest(1).ghostDeltas.every(ghost=>ghost.deltaMs===null));
});

test('missing quarters are never borrowed from the following lap and malformed race metadata has no comparison',()=>{
  const replay=syntheticRaceReplay(),broken={...replay,lapEndsMs:[26000,102000,152000]};
  const times=ghostSplitTimes(broken);
  assert.equal(times[3],null,'metadata that finishes away from the timing line cannot earn a finish');
  assert.equal(times[2],null,'the first lap cannot borrow its third quarter from lap two');
  for(const value of [null,{...replay,lapEndsMs:[52000,102000]},{...replay,lapEndsMs:[52000,102000,151999]}]) {
    assert.ok(ghostSplitTimes(value).every(time=>time===null));
  }
});

test('three-lap ghost projection retains the correct elevation throughout the ridge overpasses',()=>{
  try {
    setTrack('coast-ridge');
    const replay=syntheticRaceReplay(),times=ghostSplitTimes(replay);
    assert.equal(times.length,12);assert.ok(times.every(Number.isFinite));
    for(let lap=0;lap<3;lap++)for(let quarter=0;quarter<4;quarter++) {
      const expected=2000+lap*50000+(quarter+1)*12500;
      assert.ok(Math.abs(times[lap*4+quarter]-expected)<=2,`ridge lap ${lap+1} cp ${quarter+1} stayed on its road level`);
    }
  } finally {setTrack('coast');}
});

test('Austin moves only its first split to earned gate 30, sharing the passage with both drivers, ghosts and the timing sign',()=>{
  try {
    setTrack('coast-austin');
    assert.equal(TRACK.checkpoints,68,'physical progress gates remain unchanged');
    assert.deepEqual(splitFractionsForTrack(),[30/68,.5,.75,1]);
    assert.deepEqual(timingGateGeometry().map(gate=>Math.round(gate.fraction*68)),[30,34,51,68]);
    const {events,actual,recorder}=realRun(60,{laps:1,gateNumbers:[30,34,51,68]});
    assert.equal(events.length,8);assert.equal(actual.length,8);
    for(const id of [1,2]){
      const replay=recorder.bestReplay(id),ghosts=ghostSplitTimes(replay);
      assert.ok(ghosts.every(Number.isFinite));
      for(const event of events.filter(event=>event.playerId===id)){
        const physical=actual.find(item=>item.playerId===id&&item.index===event.index);
        assert.ok(Math.abs(event.timeMs-physical.timeMs)<=2,'live split must use the actual earned physics gate');
        assert.ok(Math.abs(event.lapTimeMs-ghosts[event.index-1])<=4,'replayed rivals are measured at exactly the same relocated split');
      }
    }
    assert.deepEqual(splitFractionsForTrack({id:'coast-london'}),SPLIT_FRACTIONS,'other maps retain their quarter passages');
  } finally {setTrack('coast');}
});

test('Austin has no ranking popup at the old first split and still requires earned progress at the moved point',()=>{
  try {
    setTrack('coast-austin');const timing=new SplitTiming();
    const old=TRACK.startDistance+TRACK.length/4,moved=TRACK.startDistance+TRACK.length*30/68;
    timing.sample(engineAt(10,snapshot(10,{s:old-2,next:17})));
    assert.deepEqual(timing.sample(engineAt(10.02,snapshot(10.02,{s:old+2,next:18}))),[]);
    assert.equal(timing.latest(1),null,'the scoreboard approach is clear of an earlier persistent split panel');
    timing.sample(engineAt(30,snapshot(30,{s:moved-2,next:30})));
    assert.deepEqual(timing.sample(engineAt(30.02,snapshot(30.02,{s:moved+2,next:30}))),[],'a shortcut without gate 30 cannot earn the moved split');
    timing.sample(engineAt(30.04,snapshot(30.04,{s:moved-2,next:30})));
    const events=timing.sample(engineAt(30.06,snapshot(30.06,{s:moved+2,next:31})));
    assert.equal(events.length,1);assert.equal(events[0].index,1);assert.equal(events[0].timeMs,30050);
    timing.sample(engineAt(30.08,snapshot(30.08,{s:moved-2,next:31})));
    assert.deepEqual(timing.sample(engineAt(30.10,snapshot(30.10,{s:moved+2,next:31}))),[],'recrossing never duplicates a split');
  } finally {setTrack('coast');}
});

test('the moved Austin split appears only after the complete football scoreboard is outside the chase-camera view',()=>{
  try {
    setTrack('coast-austin');const plot=cityLandmarkPlacements().find(item=>item.kind==='football-team');
    const vertices=austinScoreboardSurface(plot).vertices,s=timingGateGeometry()[0].s;
    const unit=v=>{const length=Math.hypot(...v);return v.map(x=>x/length);};
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0);
    for(const speed of [100,363,517])for(const lane of [-35,0,35])for(const aspect of [8/9,16/9,21/9]){
      let camera;
      for(let station=s-1200;station<s;station+=speed/60)camera=updateChaseCamera({...trackPoint(station,lane),speed,boosting:speed===517},camera);
      camera=updateChaseCamera({...trackPoint(s,lane),speed,boosting:speed===517},camera);
      const forward=unit(camera.target.map((value,index)=>value-camera.eye[index])),right=unit(cross(forward,[0,1,0]));
      for(let i=0;i<vertices.length;i+=5){
        const delta=[0,1,2].map(axis=>vertices[i+axis]-camera.eye[axis]),depth=dot(delta,forward);
        if(depth<=0)continue;
        const screenX=dot(delta,right)/(depth*Math.tan(camera.fov/2)*aspect);
        assert.ok(screenX>1.05,`scoreboard is still on screen at ${speed} speed, ${lane} lane, ${aspect} aspect: ${screenX}`);
      }
    }
  } finally {setTrack('coast');}
});

// Feed measured crossing clocks directly to isolate ranking from interpolation.
// The real-drive tests above cover how these records are earned on the road.
function rankField(ghostTimes, {kind='lap'}={}) {
  const timing=new SplitTiming();
  timing.ghosts=ghostTimes.map((times,slotId)=>({slotId,replay:{kind},times:[...times]}));
  return timing;
}
function rankRecord(playerId,index,timeMs,{lap=1,lapTimeMs=timeMs}={}) {
  return {playerId,lap,index,timeMs,lapTimeMs};
}
function rankRacer(timing,playerId,records,opponentId=null) {
  const racer={opponentId,records:new Map(records.map(record=>[`${record.lap}:${record.index}`,record])),latest:records.at(-1)};
  timing.racers.set(playerId,racer);return racer;
}
function appendRank(racer,record) {
  racer.records.set(`${record.lap}:${record.index}`,record);racer.latest=record;
}

test('the current driver exposes rank movement across all six ghosts without changing comparison clocks',()=>{
  const timing=rankField(Array.from({length:6},(_,index)=>[8000+index*100,21000+index*100]));
  const racer=rankRacer(timing,1,[rankRecord(1,1,10000)]);
  assert.equal(timing.latest(1).playerRankChange,null,'the first checkpoint has no previous rank');
  appendRank(racer,rankRecord(1,2,20000));
  const split=timing.latest(1);
  assert.equal(split.playerRankChange,6,'the player moves from seventh to first');
  assert.deepEqual(split.ghostDeltas.map(ghost=>ghost.rankChange),Array(6).fill(-1));
  assert.deepEqual(split.ghostDeltas.map(ghost=>ghost.deltaMs),Array.from({length:6},(_,index)=>-1000-index*100));
  assert.equal(timing.forPlayer(1).playerRankChange,6,'the seconds-based API carries the same current-driver movement');
  const saved=structuredClone(split),records=structuredClone([...timing.racers]);
  timing.sample({state:'paused',time:999,cars:[]});
  assert.deepEqual(timing.latest(1),saved);assert.deepEqual([...timing.racers],records);
});

test('local drivers and selected ghosts share one ranking cohort for every row',()=>{
  const timing=rankField([[8000,23000],[12000,19000]]);
  rankRacer(timing,1,[rankRecord(1,1,10000),rankRecord(1,2,20000)],2);
  rankRacer(timing,2,[rankRecord(2,1,9000),rankRecord(2,2,21000)],1);
  const first=timing.latest(1),second=timing.latest(2);
  assert.equal(first.playerRankChange,1);assert.equal(first.opponentRankChange,-1);
  assert.equal(second.playerRankChange,-1);assert.equal(second.opponentRankChange,1);
  assert.deepEqual(first.ghostDeltas.map(ghost=>ghost.rankChange),[-3,3],
    'a ghost crossing both drivers and another ghost changes by three places');
  assert.deepEqual(second.ghostDeltas.map(ghost=>ghost.rankChange),[-3,3]);
  assert.equal(first.deltaMs,-1000);assert.equal(second.deltaMs,1000,'physical crossing deltas remain opposite');
});

test('the current driver and local rival share tied ranks with ghosts independently of display ordering',()=>{
  const timing=rankField([[10000,19000],[10000,20000]]);
  rankRacer(timing,1,[rankRecord(1,1,10000),rankRecord(1,2,20000)],2);
  rankRacer(timing,2,[rankRecord(2,1,10000),rankRecord(2,2,20000)],1);
  const split=timing.latest(1);
  assert.equal(split.playerRankChange,-1);assert.equal(split.opponentRankChange,-1);
  assert.deepEqual(split.ghostDeltas.map(ghost=>ghost.rankChange),[0,-1]);
  timing.ghosts.reverse();
  assert.equal(timing.latest(1).playerRankChange,-1);
  assert.deepEqual(timing.latest(1).ghostDeltas.map(ghost=>ghost.rankChange),[-1,0]);
});

test('missing or newly available passages suppress every row movement until the same cohort is comparable',()=>{
  const timing=rankField([[9000,21000]]);
  rankRacer(timing,1,[rankRecord(1,1,10000),rankRecord(1,2,20000)],2);
  const other=rankRacer(timing,2,[rankRecord(2,1,11000)],1);
  const assertNoChanges=()=>{
    const split=timing.latest(1);assert.equal(split.playerRankChange,null);assert.equal(split.opponentRankChange,null);
    assert.ok(split.ghostDeltas.every(ghost=>ghost.rankChange===null));
  };
  assertNoChanges();
  appendRank(other,rankRecord(2,2,22000));
  assert.equal(timing.latest(1).playerRankChange,1,'late local passage makes the same field comparable');
  assert.equal(timing.latest(1).opponentRankChange,0);
  assert.deepEqual(timing.latest(1).ghostDeltas.map(ghost=>ghost.rankChange),[-1]);
  timing.ghosts.push({slotId:1,replay:{kind:'lap'},times:[null,19000]});assertNoChanges();
  timing.ghosts.at(-1).times[1]=null;
  assert.equal(timing.latest(1).playerRankChange,1,'a ghost absent at both points never joins the field');
  timing.racers.get(1).records.delete('1:1');assertNoChanges();
});

test('current-driver movement resets for a repeating lap ghost, carries across whole-race ghosts, and never survives restart',()=>{
  const records=[rankRecord(1,4,50000),rankRecord(1,1,65000,{lap:2,lapTimeMs:15000})];
  const clocks=[10000,20000,30000,49000,66000,80000,90000,100000,115000,130000,145000,160000];
  const whole=rankField([clocks],{kind:'race'});rankRacer(whole,1,records);
  assert.equal(whole.latest(1).playerRankChange,1);
  const lap=rankField([[16000,26000,36000,49000]]);rankRacer(lap,1,records,2);
  rankRacer(lap,2,[rankRecord(2,4,51000),rankRecord(2,1,64000,{lap:2,lapTimeMs:13000})],1);
  assert.equal(lap.latest(1).playerRankChange,null);assert.equal(lap.latest(1).opponentRankChange,null);
  assert.equal(lap.latest(1).ghostDeltas[0].rankChange,null,'every row uses the reset lap-ghost baseline');
  whole.reset();assert.equal(whole.latest(1),null);
  rankRacer(whole,1,[rankRecord(1,2,20000)]);
  assert.equal(whole.latest(1).playerRankChange,null,'a fresh run cannot borrow an older checkpoint');
});
