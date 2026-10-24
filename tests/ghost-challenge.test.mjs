import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGE_COLORS, PACE_PROFILES, PACE_SPEED_LIMIT, paceReplay, createGhostChallenge, loadGhostChallenge } from '../src/ghost-challenge.js';
import { validateReplay, validateRaceReplay, sampleReplay, ghostVersionForCity, GhostRecorder, GHOST_LIMITS } from '../src/ghost-replay.js';
import { ghostSplitTimes } from '../src/split-timing.js';
import { RaceEngine, TRACK, setTrack, trackPoint, projectTrack, mod } from '../src/engine.js';
import { RaceAI } from '../src/ai.js';
import { RaceRenderer } from '../src/renderer.js';

function replay(timeMs = 39000, laps = 1) {
  const frames = [];
  for (let time = 0; time < timeMs; time += 100) {
    const phase = time / timeMs * Math.PI * 2 * laps;
    frames.push([time, 1000 * Math.cos(phase), 1000 * Math.sin(phase), Math.atan2(Math.cos(phase), -Math.sin(phase)), 20 + Math.sin(phase) * 10]);
  }
  frames.push([timeMs, 1000, 0, Math.PI / 2, 20]);
  return { version: 1, durationMs: timeMs, frames,
    ...(laps === 3 ? { kind: 'race', laps, lapEndsMs: [Math.round(timeMs / 3), Math.round(timeMs * 2 / 3), timeMs] } : {}) };
}
let nextId = 0;
function candidate(name, timeMs = 39000, laps = 1, id = `record-${++nextId}`) {
  return { entry: { id, name, timeMs, playerId: 1, mode: 'ai',
    ...(laps === 3 ? { kind: 'race', laps: 3 } : {}) }, replay: replay(timeMs, laps) };
}

// Match every output segment back to its original straight segment. Testing
// speeds between every pair of output frames proves the bound for arbitrary
// playback times too, since sampleReplay interpolates linearly between them.
function assertSegmentBounds(source,paced){
  const times=[...new Set([...source.frames.map(f=>f[0]),...(source.lapEndsMs||[])])].sort((a,b)=>a-b);
  let at=0;
  const mapped=new Map([[0,0]]);
  for(let i=1;i<times.length;i++){
    const a=sampleReplay(source,times[i-1]),b=sampleReplay(source,times[i]),dx=b.x-a.x,dy=b.y-a.y;
    const length=Math.hypot(dx,dy),sourceSpeed=length*1000/(times[i]-times[i-1]),start=at;
    let previousU=0;
    do{
      const before=paced.frames[at],frame=paced.frames[++at];assert.ok(frame,'every original vertex remains represented');
      const u=((frame[1]-a.x)*dx+(frame[2]-a.y)*dy)/(length*length);
      assert.ok(u>previousU&&u<=1+1e-9,'corresponding source progress is strictly forward');previousU=u;
      assert.ok(Math.hypot(frame[1]-a.x-u*dx,frame[2]-a.y-u*dy)<1e-7,'no chord cuts across an original corner');
      const speed=Math.hypot(frame[1]-before[1],frame[2]-before[2])*1000/(frame[0]-before[0]);
      assert.ok(speed<=sourceSpeed,`pace ${speed} exceeds human segment ${sourceSpeed}`);
      assert.ok(speed<=PACE_SPEED_LIMIT,`pace ${speed} exceeds the vehicle speed cap`);
      assert.ok(frame[0]-before[0]>0&&frame[0]-before[0]<=100);
      const sourceTime=times[i-1]+u*(times[i]-times[i-1]);assert.ok(frame[0]>=sourceTime,'pace progress never leads the fastest human clock');
      const pose=sampleReplay(source,Math.max(0,Math.min(source.durationMs,sourceTime)));
      assert.ok(Math.abs(frame[4]-pose.elevation)<1e-7);
    }while(Math.hypot(paced.frames[at][1]-b.x,paced.frames[at][2]-b.y)>1e-7);
    assert.ok(paced.frames[at][0]-paced.frames[start][0]>=times[i]-times[i-1],'integer rounding never shrinks a source interval');
    mapped.set(times[i],paced.frames[at][0]);
  }
  assert.equal(at,paced.frames.length-1);return mapped;
}

test('all pace ghosts follow the fastest human and finish behind every original human record',()=>{
  const input=[candidate('Alice',40000),candidate('Bob',39000),candidate('ＡLICE',37000),candidate('Carol',38000),candidate('Dave',41000)];
  input.forEach((value,index)=>value.replay.frames.forEach(frame=>{frame[1]+=index*31;}));
  const original=structuredClone(input),result=createGhostChallenge(input);
  assert.deepEqual(result.ghosts.slice(0,3).map(g=>g.entry.name),['ＡLICE','Carol','Bob']);
  assert.equal(result.humanCount,3);assert.equal(result.paceCount,3);
  for(let i=0;i<3;i++){
    const human=result.ghosts[i],pace=result.ghosts[i+3],source=original.find(value=>value.entry.id===human.entry.id);
    assert.deepEqual(human.replay,source.replay,'every human frame and timestamp is unchanged');
    assert.equal(pace.entry.timeMs,pace.replay.durationMs);assert.equal(pace.targetMs,pace.replay.durationMs);
    assert.ok(pace.targetMs>=39000+PACE_PROFILES[i].delayMs&&pace.targetMs<43000,'rounding retains roughly one to four seconds behind the slowest human');
    assertSegmentBounds(result.ghosts[0].replay,pace.replay);
  }
  assert.deepEqual(createGhostChallenge(input),result,'same source and slot always give identical clocks');
  assert.equal(new Set(result.ghosts.map(g=>g.color)).size,6);assert.deepEqual(result.ghosts.map(g=>g.slotId),[0,1,2,3,4,5]);
  assert.ok(result.ghosts.slice(3).every(g=>g.synthetic&&g.entry.isHuman===false&&g.entry.playerId===0&&g.entry.mode==='ghost'));
  result.ghosts[0].replay.frames[0][1]=9999;assert.deepEqual(input,original);
});

test('per-segment slowdown keeps every path corner, exact lap boundary, speed ceiling and finish clock',()=>{
  for(const laps of[1,3])for(const [index,profile]of PACE_PROFILES.entries()){
    const source=replay(laps===1?39017:117043,laps),saved=structuredClone(source);
    // Exercise an extra one-millisecond source interval and fractional lap-end
    // poses between original samples, not just conveniently aligned 100 ms data.
    const at=sampleReplay(source,1);source.frames.splice(1,0,[1,at.x,at.y,at.angle,at.elevation]);saved.frames=structuredClone(source.frames);
    const paced=paceReplay(source,source.durationMs+profile.delayMs,index);
    assert.ok(laps===3?validateRaceReplay(paced):validateReplay(paced));
    const mapped=assertSegmentBounds(source,paced);
    assert.equal(paced.frames.at(-1)[0],paced.durationMs);assert.equal(sampleReplay(paced,paced.durationMs+1),null);
    assert.deepEqual(sampleReplay(paced,0),sampleReplay(source,0));
    assert.deepEqual(sampleReplay(paced,paced.durationMs),sampleReplay(source,source.durationMs));
    if(laps===3){
      assert.deepEqual(paced.lapEndsMs,source.lapEndsMs.map(time=>mapped.get(time)));
      paced.lapEndsMs.forEach((time,i)=>assert.deepEqual(sampleReplay(paced,time),sampleReplay(source,source.lapEndsMs[i])));
    }
    assert.deepEqual(source,saved);
  }
});

test('three nonnegative delay rhythms vary pace and exchange places without ever accelerating beyond the source',()=>{
  const source=replay(),paced=PACE_PROFILES.map((profile,index)=>paceReplay(source,source.durationMs+profile.delayMs,index));
  const progress=(ghost,time)=>{const p=sampleReplay(ghost,time);return(Math.atan2(p.y,p.x)+Math.PI*2)%(Math.PI*2);};
  for(const ghost of paced){
    const speeds=[];let last=sampleReplay(ghost,0);
    for(let time=25;time<ghost.durationMs-100;time+=25){
      const pose=sampleReplay(ghost,time),delta=Math.atan2(last.x*pose.y-last.y*pose.x,last.x*pose.x+last.y*pose.y);
      assert.ok(delta>0&&delta<.005,'no reversed motion or teleports');speeds.push(delta/.025);last=pose;
    }
    assert.ok(Math.max(...speeds)/Math.min(...speeds)>1.035,'each pace has a visible rhythm rather than a uniform distance ratio');
    assert.ok(speeds.slice(1).every((speed,i)=>Math.abs(speed-speeds[i])<.002),'millisecond clock rounding does not introduce a large speed jump');
    assertSegmentBounds(source,ghost);
  }
  const ordering=time=>paced.map((ghost,index)=>({index,p:progress(ghost,time)})).sort((a,b)=>b.p-a.p).map(v=>v.index).join(',');
  assert.notEqual(ordering(9000),ordering(23000),'paces can trade positions while the human remains ahead');
});

test('the absolute speed ceiling adds real time instead of compressing an over-fast archived path',()=>{
  const source=replay();source.frames.forEach(frame=>{frame[1]*=5;frame[2]*=5;});assert.ok(validateReplay(source),'the broad storage validator accepts this over-fast archive');
  const paced=paceReplay(source,source.durationMs+1000);assert.ok(validateReplay(paced));
  assert.ok(paced.durationMs>source.durationMs+15000,'speed limiting takes precedence over the requested finish target');
  assertSegmentBounds(source,paced);
});

test('duration and frame capacity limits omit a pace instead of making it faster or dropping path vertices',()=>{
  for(const [duration,laps]of[[25000,1],[75000,3],[GHOST_LIMITS.maxDurationMs,1]]){
    const source=candidate('Limit',duration,laps),before=structuredClone(source),challenge=createGhostChallenge([source],laps);
    assert.equal(challenge.humanCount,1);assert.equal(challenge.paceCount,duration===GHOST_LIMITS.maxDurationMs?0:3);
    for(const ghost of challenge.ghosts.filter(g=>g.synthetic)){
      assert.ok(laps===3?validateRaceReplay(ghost.replay):validateReplay(ghost.replay));
      assert.equal(ghost.targetMs,ghost.replay.durationMs);assert.ok(ghost.targetMs>duration);
    }
    assert.deepEqual(source,before);
  }
  const crowded=replay(650000);assert.ok(validateReplay(crowded));assert.equal(paceReplay(crowded,651000),null,'preserving corners plus safe sampling exceeds maxFrames');
  assert.equal(paceReplay(replay(),39000),null);assert.equal(paceReplay(replay(),38999),null);
  assert.equal(paceReplay(replay(),900001),null);assert.equal(paceReplay(replay(),40000,99),null);
  assert.equal(paceReplay(replay(),40000,'map'),null);assert.equal(paceReplay(null,40000),null);
});

test('empty and partially populated boards do not invent human records', () => {
  assert.deepEqual(createGhostChallenge([]), { laps: 1, ghosts: [], humanCount: 0, paceCount: 0 });
  for (const n of [1, 2]) {
    const challenge = createGhostChallenge(Array.from({ length: n }, (_, i) => candidate(`Racer${i}`, 39000 + i * 1000)));
    assert.equal(challenge.humanCount, n); assert.equal(challenge.paceCount, 3);
    assert.equal(challenge.ghosts.length, n + 3);
  }
  const invalid = candidate('Robot'); invalid.entry.playerId = 2;
  const mismatch = candidate('Mismatch'); mismatch.entry.timeMs++;
  assert.equal(createGhostChallenge([invalid, mismatch]).ghosts.length, 0);
});

test('loader uses the selected city and race version, skips broken replays and never submits a score', async () => {
  for (const city of ['coast-london', 'coast-beijing', 'coast-shanghai', 'coast-austin']) for (const laps of [1, 3]) {
    const version = ghostVersionForCity(city, laps), start = laps === 3 ? 117000 : 39000;
    const candidates = [candidate('Missing', start - 1000, laps), candidate('First', start, laps), candidate('Second', start + 1000, laps), candidate('Third', start + 2000, laps)];
    const requests = [];
    const fetchImpl = async (input, options) => {
      const url = new URL(input); requests.push(url.pathname);
      assert.equal(options.method, undefined); assert.equal(url.searchParams.get('city'), city); assert.equal(url.searchParams.get('version'), version);
      if (url.pathname === '/api/laps') return { ok: true, json: async () => ({ city, version, entries: candidates.map(c => c.entry) }) };
      const item = candidates.find(c => url.pathname.endsWith(c.entry.id));
      if (item.entry.name === 'Missing') return { ok: false };
      return { ok: true, json: async () => ({ city, version, ...item }) };
    };
    const result = await loadGhostChallenge({ city, laps, fetchImpl });
    assert.equal(result.humanCount, 3); assert.equal(result.failedCount, 1); assert.equal(result.ghosts.length, 6);
    assert.equal(requests.length, 5); assert.ok(result.ghosts.every(g => laps === 3 ? validateRaceReplay(g.replay) : validateReplay(g.replay)));
  }
});

test('loader rejects category mismatch and supports canceling an in-flight preparation', async () => {
  await assert.rejects(loadGhostChallenge({ city: 'coast', fetchImpl: async () => ({ ok: true, json: async () => ({ city: 'coast-london', version: 'coast-ghost-v1', entries: [] }) }) }), /category mismatch/);
  const controller = new AbortController();
  const promise = loadGhostChallenge({ city: 'coast', signal: controller.signal, fetchImpl: (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })) });
  controller.abort(); await assert.rejects(promise, /cancelled/);
});

test('solo uses one centered physical car at the same grid distance and local mode restores both racers', () => {
  setTrack('coast'); const engine = new RaceEngine(), start = structuredClone(engine.cars[0]);
  engine.setPlayerCount(1); assert.equal(engine.cars.length, 1);
  const center=trackPoint(start._gridS,0),solo=engine.cars[0];
  assert.equal(solo._gridS,start._gridS);assert.equal(solo._lane,0);
  assert.equal(solo.x,center.x);assert.equal(solo.y,center.y);
  engine.start(1); for (let i = 0; i < 30; i++) engine.step(.1);
  assert.doesNotThrow(() => engine.step(.1, new Set(['KeyW']))); assert.equal(engine.cars.length, 1);
  assert.throws(() => engine.setPlayerCount(2), /before starting/);
  engine.reset().setPlayerCount(2); assert.deepEqual(engine.cars.map(c => c.id), [1, 2]);
  assert.deepEqual(engine.cars[0], start);
  engine.setPlayerCount(1).selectTrack('coast-london'); assert.equal(engine.cars.length, 1);
  setTrack('coast');
});

test('real one-car recordings keep every checkpoint, lap boundary and finish on the same pace clock', () => {
  setTrack('coast');
  for (const laps of [1, 3]) {
    const engine = new RaceEngine({ playerCount: 1 }).start(laps);
    // The existing deterministic driver is a test-only source of human keys;
    // challenge gameplay does not instantiate it or create a second car.
    const driver = new RaceAI({ carId: 1 }),recorder=new GhostRecorder();recorder.sample(engine,[1]);
    for (let step = 0; step < 60 * 220 && engine.state !== 'finished'; step++) {engine.step(1 / 60, driver.update(engine));recorder.sample(engine,[1]);}
    assert.equal(engine.state, 'finished'); assert.equal(engine.cars.length, 1);
    assert.equal(engine.winner, engine.cars[0]); assert.equal(engine.cars[0].lap, laps);
    assert.equal(engine.time, engine.cars[0].finishTime); assert.equal(driver.rescues, 0);
    const original=laps===3?recorder.fullRaceReplay(1):recorder.bestReplay(1),saved=structuredClone(original),sourceSplits=ghostSplitTimes(original);
    assert.equal(sourceSplits.length,laps*4);assert.ok(sourceSplits.every(Number.isFinite),'the real recorded drive crosses every gate');
    for(const [index,profile]of PACE_PROFILES.entries()){
      const target=original.durationMs+profile.delayMs,paced=paceReplay(original,target,index),splits=ghostSplitTimes(paced);
      assert.ok(splits.every(Number.isFinite),'retiming preserves real-track checkpoint recognition');
      assert.equal(splits.at(-1),paced.durationMs);assert.equal(paced.frames.at(-1)[0],paced.durationMs);
      assert.ok(paced.durationMs>=target);
      sourceSplits.forEach((sourceTime,gate)=>{
        assert.ok(splits[gate]>=sourceTime,'no checkpoint can be reached before the fastest source');
        const pose=sampleReplay(paced,splits[gate]),projection=projectTrack(pose.x,pose.y,undefined,pose.elevation);
        const station=mod(TRACK.startDistance+((gate%4)+1)*TRACK.length/4,TRACK.length);
        const distance=Math.abs(mod(projection.s-station+TRACK.length/2,TRACK.length)-TRACK.length/2);
        assert.ok(distance<5,'the rendered pose actually reaches the timed checkpoint');
      });
      if(laps===3)assert.deepEqual([splits[3],splits[7],splits[11]],paced.lapEndsMs);
    }
    assert.deepEqual(original,saved,'building synthetic rivals never retimes the stored human');
  }
});

test('solo renderer retains six independently colored poses without touching physical cars; local still limits to two', () => {
  const renderer = Object.create(RaceRenderer.prototype); renderer.singlePlayer = true;
  const engine = new RaceEngine({ playerCount: 1 }), before = structuredClone(engine.cars);
  const poses = CHALLENGE_COLORS.map(({ slotId }) => ({ slotId, x: 10 * slotId, y: 100, angle: .2, elevation: 4 }));
  renderer.setGhostPoses([poses]); assert.equal(renderer.ghostPoses[0].length, 6);
  assert.deepEqual(renderer.ghostPoses[0].map(p => p.slotId), [0, 1, 2, 3, 4, 5]);
  poses[0].x = 999; assert.equal(renderer.ghostPoses[0][0].x, 0);
  assert.deepEqual(engine.cars, before);
  renderer.setSinglePlayer(false).setGhostPoses([poses]); assert.equal(renderer.ghostPoses[0].length, 2);
});

function mockGL() {
  const calls = [], uploads = [], uniforms = new Map(),buffers=new Map();
  let boundBuffer, depthWrite=true, viewport;
  const enabled = new Set();
  const gl = { calls, uploads, uniforms, buffers, draws: [] };
  for (const [i, name] of ['ARRAY_BUFFER','STATIC_DRAW','VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','TEXTURE_2D','RGBA','UNSIGNED_BYTE','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','LINEAR','DEPTH_TEST','LEQUAL','CULL_FACE','SRC_ALPHA','ONE_MINUS_SRC_ALPHA','FLOAT','TRIANGLES','TEXTURE0','TEXTURE1','TEXTURE2','SCISSOR_TEST','BLEND','UNPACK_FLIP_Y_WEBGL'].entries()) gl[name] = i + 1;
  gl.COLOR_BUFFER_BIT = 0x4000; gl.DEPTH_BUFFER_BIT = 0x100;
  let count = 0;
  for (const name of ['createShader','createProgram','createBuffer','createTexture']) gl[name] = () => ({ id: ++count });
  gl.getShaderParameter = gl.getProgramParameter = () => true;
  gl.getAttribLocation = (_, name) => ({ aPosition: 0, aNormal: 1, aColor: 2, aEmission: 3 })[name];
  gl.getUniformLocation = (_, name) => name;
  gl.uniformMatrix4fv = (name, transpose, value) => { assert.equal(transpose, false); assert.equal(value.length, 16); assert.ok([...value].every(Number.isFinite)); uniforms.set(name, value); };
  gl.bufferData = (_, data) => { assert.ok([...data].every(Number.isFinite)); uploads.push(data.length); buffers.set(boundBuffer,data); };
  for (const name of ['shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindBuffer','bindTexture','texImage2D','texParameteri','enable','depthFunc','disable','clearColor','blendFunc','enableVertexAttribArray','vertexAttribPointer','drawArrays','depthMask','useProgram','disableVertexAttribArray','activeTexture','uniform1i','uniform1f','uniform3fv','viewport','scissor','clear','pixelStorei']) gl[name] = (...args) => { calls.push([name, ...args]); };
  gl.bindBuffer=(_,buffer)=>{boundBuffer=buffer;};
  gl.depthMask=value=>{depthWrite=value;calls.push(['depthMask',value]);};
  gl.enable=value=>{enabled.add(value);calls.push(['enable',value]);};
  gl.disable=value=>{enabled.delete(value);calls.push(['disable',value]);};
  gl.viewport=(...args)=>{viewport=args;calls.push(['viewport',...args]);};
  gl.drawArrays=(...args)=>{calls.push(['drawArrays',...args]);gl.draws.push({buffer:boundBuffer,model:uniforms.get('uModel')?.slice(),depthWrite,blending:enabled.has(gl.BLEND),viewport:viewport?.slice()});};
  return gl;
}


test('six challenge ghost colors are really drawn transparently in the single full-width viewport', () => {
  setTrack('coast');
  const gl = mockGL(), renderer = new RaceRenderer({ width: 1280, height: 800, getContext: () => gl, addEventListener: () => {} });
  const engine = new RaceEngine({ playerCount: 1 }), before = structuredClone(engine.cars), obstacles = renderer.obstacles;
  renderer.setSinglePlayer(true).setGhostPoses([CHALLENGE_COLORS.map(({ slotId }) => ({ slotId, x: 100 + slotId * 20, y: 200, angle: .2, elevation: 3 }))]);
  renderer.render(engine);
  assert.equal(renderer.ghostMeshes.length, 6);
  for (const [index, mesh] of renderer.ghostMeshes.entries()) {
    const draws = gl.draws.filter(draw => draw.buffer === mesh.buffer);
    assert.equal(draws.length, 1); assert.deepEqual(draws[0].viewport, [0, 0, 1280, 800]);
    assert.equal(draws[0].blending, true); assert.equal(draws[0].depthWrite, false);
    const rgb = CHALLENGE_COLORS[index].color.slice(1).match(/../g).map(hex => parseInt(hex, 16) / 255);
    const vertices = gl.buffers.get(mesh.buffer);
    for (let at = 0; at < vertices.length; at += 11) {
      rgb.forEach((v, axis) => assert.ok(Math.abs(vertices[at + 6 + axis] - v) < 1e-6));
      assert.ok(vertices[at + 9] > .1 && vertices[at + 9] < .4);
    }
  }
  assert.equal(gl.draws.filter(draw => renderer.meshes.cars.some(mesh => draw.buffer === mesh.buffer)).length, 1);
  assert.deepEqual(engine.cars, before); assert.equal(renderer.obstacles, obstacles);
  const uploads = gl.uploads.length; renderer.render(engine); assert.equal(gl.uploads.length, uploads, 'colors are uploaded once, not every frame');
});
