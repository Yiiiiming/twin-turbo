import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceEngine, TRACK, trackPoint, mod, setTrack } from '../engine.js';
import { RaceAI } from '../ai.js';
import { sceneObstacles } from '../renderer.js';
import { GhostRecorder } from '../ghost-replay.js';
import { SplitTiming, SPLIT_FRACTIONS, ghostSplitTimes } from '../split-timing.js';

const signed = (from,to) => mod(to-from+TRACK.length/2,TRACK.length)-TRACK.length/2;
function realRun(hz=60,{laps=3,secondDelay=0}={}) {
  const engine=new RaceEngine({laps,obstacles:sceneObstacles()}).start();
  const drivers=[new RaceAI({carId:1}),new RaceAI({carId:2})],timing=new SplitTiming(),recorder=new GhostRecorder();
  const events=[],actual=[],originalAdvance=engine._advance.bind(engine);
  engine._advance=(car,dt)=>{
    const oldS=car._lastTrackS,oldEarned=car._started?car.lap*32+car._nextCheckpoint-1:-1;
    originalAdvance(car,dt);
    const earned=car._started?car.lap*32+car._nextCheckpoint-1:-1;
    if(earned>0&&earned>oldEarned&&earned%8===0) {
      const index=((earned/8-1)%4)+1,lap=Math.floor((earned/8-1)/4)+1;
      const delta=signed(oldS,car._lastTrackS),distance=mod(TRACK.startDistance+index*TRACK.length/4-oldS,TRACK.length);
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
