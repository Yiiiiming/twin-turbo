import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceAI } from '../ai.js';
import { RaceEngine, TRACK, trackPoint, projectTrack, mod } from '../engine.js';
import { sceneObstacles } from '../renderer.js';

const obstacles=sceneObstacles();
const allowed=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter']);
const humanKeys=(car)=>{
  const p=projectTrack(car.x,car.y),target=trackPoint(p.s+75+Math.abs(car.speed)*.14,24);
  const error=mod(Math.atan2(target.y-car.y,target.x-car.x)-car.angle+Math.PI,Math.PI*2)-Math.PI;
  const keys=new Set(['KeyW']);
  if(error>.025)keys.add('KeyD');
  if(error<-.025)keys.add('KeyA');
  return keys;
};

function runComputer({laps=3,hz=60}={}) {
  const engine=new RaceEngine({laps,obstacles}).start(),ai=new RaceAI();
  const humanBefore=structuredClone(engine.cars[0]);
  let offroad=0,impacts=0,boostFrames=0,lastLap=0;
  const lapTimes=[];
  for(let frame=0;frame<hz*60*laps+hz*15&&engine.state!=='finished';frame++) {
    const keys=ai.update(engine,1/hz);
    assert.ok(keys instanceof Set);
    assert.ok([...keys].every(key=>allowed.has(key)),'AI only issues player-two controls');
    if(keys.has('Enter')) {
      boostFrames++;
      const p=projectTrack(engine.cars[1].x,engine.cars[1].y);
      assert.equal(p.curvature,0,'nitro is reserved for safe straight sections');
    }
    engine.step(1/hz,keys);
    const car=engine.cars[1];
    offroad+=car.offroad?1:0;impacts+=car.impact>0?1:0;
    if(car.lap>lastLap){lapTimes.push(car.lastLap);lastLap=car.lap;}
  }
  assert.equal(engine.state,'finished');assert.equal(engine.winner.id,2);
  assert.equal(engine.cars[1].lap,laps);assert.equal(ai.rescues,0);
  assert.equal(offroad,0);assert.equal(impacts,0);
  assert.equal(engine.cars[0].x,humanBefore.x);assert.equal(engine.cars[0].y,humanBefore.y);
  assert.ok(lapTimes.every(time=>time>=44&&time<=48),`human-beatable lap times: ${lapTimes}`);
  return {engine,ai,lapTimes,boostFrames};
}

test('computer uses real controls to complete three laps through production obstacles at a beatable pace',()=>{
  const result=runComputer();
  assert.equal(result.lapTimes.length,3);
  assert.ok(result.boostFrames>0&&result.boostFrames<150,'nitro consists of occasional short bursts');
});

for(const hz of [30,120])test(`computer stays on the road at ${hz} updates per second`,()=>{
  runComputer({laps:1,hz});
});

test('normal control decisions do not edit either car or the race clock',()=>{
  const engine=new RaceEngine({obstacles}).start();engine.state='racing';
  const ai=new RaceAI(),cars=structuredClone(engine.cars),time=engine.time;
  const keys=ai.update(engine,1/60);
  assert.ok(keys.has('ArrowUp'));
  assert.deepEqual(engine.cars,cars);assert.equal(engine.time,time);
  assert.equal(ai.rescues,0);
});

test('menu, countdown, pause and finish never advance AI timers or leave held inputs',()=>{
  const engine=new RaceEngine({obstacles}),ai=new RaceAI();
  for(const state of ['menu','countdown','paused','finished']) {
    engine.state=state;
    const before={...ai};
    for(let i=0;i<120;i++)assert.equal(ai.update(engine,1/30).size,0);
    assert.deepEqual({...ai},before);
  }
  engine.start();
  for(let frame=0;frame<60*20;frame++)engine.step(1/60,ai.update(engine,1/60));
  engine.pause();const driver={...ai},cars=structuredClone(engine.cars),time=engine.time;
  for(let frame=0;frame<120;frame++) {
    const keys=ai.update(engine,1/30);assert.equal(keys.size,0);engine.step(1/30,keys);
  }
  assert.deepEqual({...ai},driver);assert.deepEqual(engine.cars,cars);assert.equal(engine.time,time);
  engine.resume();engine.step(1/60,ai.update(engine,1/60));assert.ok(ai.elapsed>driver.elapsed);
  assert.ok(Math.hypot(engine.cars[1].x-cars[1].x,engine.cars[1].y-cars[1].y)>1,'the computer resumes normal motion, including coasting');
});

test('a blocked computer calls the normal rescue and serves the full two-second stop',()=>{
  const barrier=trackPoint(TRACK.startDistance+80);
  const wall={type:'box',x:barrier.x,y:barrier.y,halfWidth:3,halfDepth:85,angle:barrier.angle};
  const engine=new RaceEngine({obstacles:[...obstacles,wall]}).start(),ai=new RaceAI();
  const playerBefore=structuredClone(engine.cars[0]);
  const rescue=engine.rescue.bind(engine),calls=[];
  engine.rescue=id=>{
    calls.push({id,time:engine.time,lap:engine.cars[1].lap,checkpoint:engine.cars[1]._lastCheckpointS});
    rescue(id);
  };
  let hadImpact=false;
  for(let frame=0;frame<60*15&&ai.rescues===0;frame++) {
    const keys=ai.update(engine,1/60);
    if(ai.rescues)break;
    engine.step(1/60,keys);hadImpact||=engine.cars[1].impact>0;
  }
  assert.equal(hadImpact,true);assert.equal(ai.rescues,1);assert.equal(calls.length,1);
  assert.equal(calls[0].id,2);assert.ok(calls[0].time>4.2);
  const car=engine.cars[1];assert.equal(car.rescueCooldown,2);assert.equal(car.speed,0);
  assert.equal(car.lap,calls[0].lap);assert.equal(car._lastCheckpointS,calls[0].checkpoint);
  const stopped={x:car.x,y:car.y};
  for(let frame=0;frame<119;frame++) {
    const keys=ai.update(engine,1/60);assert.equal(keys.size,0);engine.step(1/60,keys);
    assert.equal(car.x,stopped.x);assert.equal(car.y,stopped.y);assert.equal(car.speed,0);
  }
  assert.ok(car.rescueCooldown>0);assert.equal(ai.rescues,1);
  assert.equal(engine.cars[0].x,playerBefore.x);assert.equal(engine.cars[0].y,playerBefore.y);
});

test('computer and a human driver share the real engine and the faster human can win',()=>{
  const engine=new RaceEngine({obstacles,laps:3}).start(),ai=new RaceAI();
  let impacts=0,offroad=0;
  for(let frame=0;frame<60*165&&engine.state!=='finished';frame++) {
    const keys=new Set([...humanKeys(engine.cars[0]),...ai.update(engine,1/60)]);
    engine.step(1/60,keys);
    impacts+=engine.cars.some(car=>car.impact>0)?1:0;
    offroad+=engine.cars.some(car=>car.offroad)?1:0;
  }
  assert.equal(engine.state,'finished');assert.equal(engine.winner.id,1);
  assert.equal(engine.cars[0].lap,3);assert.ok(engine.cars[1].lap>=2);
  assert.ok(engine.cars[1].bestLap>=44&&engine.cars[1].bestLap<=48);
  assert.equal(impacts,0);assert.equal(offroad,0);assert.equal(ai.rescues,0);
});

test('a persistently skipped checkpoint triggers ordinary recovery without giving lap credit',()=>{
  const engine=new RaceEngine({obstacles}).start(),ai=new RaceAI();engine.state='racing';
  const car=engine.cars[1],p=trackPoint(TRACK.length/TRACK.checkpoints+160,-24);
  Object.assign(car,{x:p.x,y:p.y,angle:p.angle,speed:330,_started:true,_nextCheckpoint:1,
    _lastCheckpointS:TRACK.startDistance,_lastTrackS:p.s,_lastX:p.x,_lastY:p.y,missedCheckpoint:true});
  for(let frame=0;frame<60*4&&ai.rescues===0;frame++) {
    const keys=ai.update(engine,1/60);
    if(ai.rescues)break;
    engine.step(1/60,keys);
  }
  assert.equal(ai.rescues,1);assert.ok(ai.elapsed>=2.5&&ai.elapsed<2.6);
  assert.equal(car.rescueCooldown,2);assert.equal(car.speed,0);assert.equal(car.lap,0);
  assert.equal(car._nextCheckpoint,1);assert.equal(car._lastCheckpointS,TRACK.startDistance);
  assert.ok(projectTrack(car.x,car.y).s<30,'return is to the last earned checkpoint');
});

test('reset clears recovery and boost state, and invalid frame times have no side effects',()=>{
  const engine=new RaceEngine().start(),ai=new RaceAI();engine.state='racing';
  ai.update(engine,.1);assert.ok(ai.elapsed>0);
  const before={...ai};
  for(const dt of [0,-1,NaN,Infinity])assert.equal(ai.update(engine,dt).size,0);
  assert.deepEqual({...ai},before);
  ai.reset();assert.equal(ai.elapsed,0);assert.equal(ai.rescues,0);
  assert.equal(ai._boostRemaining,0);assert.equal(ai._stuckFor,0);assert.equal(ai._lane,-24);
});
