import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGE_COLORS, PACE_PROFILES, paceReplay, createGhostChallenge, loadGhostChallenge } from '../ghost-challenge.js';
import { validateReplay, validateRaceReplay, sampleReplay, ghostVersionForCity, GhostRecorder, GHOST_LIMITS } from '../ghost-replay.js';
import { ghostSplitTimes } from '../split-timing.js';
import { RaceEngine, TRACK, setTrack, trackPoint } from '../engine.js';
import { RaceAI } from '../ai.js';
import { RaceRenderer } from '../renderer.js';

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

test('challenge mixes faster and slower pacing on different human paths without mutating history', () => {
  const input = [candidate('Alice', 40000), candidate('Bob', 39000), candidate('ＡLICE', 37000), candidate('Carol', 38000), candidate('Dave', 41000)];
  // Distinct driven lanes let this test detect reusing only the slowest path.
  input.forEach((value,index)=>value.replay.frames.forEach(frame=>{frame[1]+=index*31;}));
  const original = structuredClone(input), result = createGhostChallenge(input);
  assert.deepEqual(result.ghosts.slice(0, 3).map(g => g.entry.name), ['ＡLICE', 'Carol', 'Bob']);
  assert.equal(result.humanCount, 3); assert.equal(result.paceCount, 3);
  assert.deepEqual(result.ghosts.slice(3).map(g => g.targetMs), [36445,38190,40365]);
  assert.ok(result.ghosts.slice(3).some(g=>g.targetMs<39000));assert.ok(result.ghosts.slice(3).some(g=>g.targetMs>39000));
  for(let i=0;i<3;i++){
    const human=result.ghosts[i],pace=result.ghosts[i+3],source=original.find(value=>value.entry.id===human.entry.id);
    assert.deepEqual(human.replay,source.replay,'every original human frame and clock is retained');
    assert.deepEqual(sampleReplay(pace.replay,0),sampleReplay(human.replay,0),'pace slots use fastest, middle and slowest driven lanes');
  }
  assert.deepEqual(createGhostChallenge(input),result,'the same roster always generates the same clocks and poses');
  assert.equal(new Set(result.ghosts.map(g => g.color)).size, 6);
  assert.deepEqual(result.ghosts.map(g => g.slotId), [0, 1, 2, 3, 4, 5]);
  assert.ok(result.ghosts.slice(3).every(g => g.synthetic && g.entry.isHuman === false && g.entry.playerId === 0));
  result.ghosts[0].replay.frames[0][1] = 9999;
  assert.deepEqual(input, original, 'rendering or selection cannot change a stored attempt');
});

test('nonlinear faster and slower clocks preserve driven geometry and exact three-lap boundaries', () => {
  for (const laps of [1, 3]) for(const [profileIndex,profile]of PACE_PROFILES.entries()) {
    const original = replay(laps === 1 ? 39000 : 117000, laps), saved = structuredClone(original);
    const durationMs=Math.round(original.durationMs*profile.durationRatio),paced = paceReplay(original,durationMs,profileIndex);
    assert.ok(laps === 1 ? validateReplay(paced) : validateRaceReplay(paced));
    assert.equal(paced.durationMs,durationMs);assert.equal(paced.frames.at(-1)[0],durationMs);
    assert.deepEqual(sampleReplay(paced,0),sampleReplay(original,0));
    assert.deepEqual(sampleReplay(paced,durationMs),sampleReplay(original,original.durationMs));
    let previousSource=0;
    for (const frame of paced.frames) {
      // Independently recover the point's position on the source polyline.
      // Search only forward: an accidental reverse clock cannot pass this.
      let match=null;
      for(let i=Math.max(0,Math.floor(previousSource/100)-1);i<original.frames.length-1;i++){
        const a=original.frames[i],b=original.frames[i+1],dx=b[1]-a[1],dy=b[2]-a[2],u=((frame[1]-a[1])*dx+(frame[2]-a[2])*dy)/(dx*dx+dy*dy);
        if(u< -1e-8||u>1+1e-8||Math.hypot(frame[1]-a[1]-u*dx,frame[2]-a[2]-u*dy)>1e-6)continue;
        const time=a[0]+u*(b[0]-a[0]);if(time>=previousSource-1e-7){match=time;break;}
      }
      assert.notEqual(match,null,'retiming never leaves the original driven path');
      if(frame[0])assert.ok(match>previousSource,'the clock is strictly monotonic');
      previousSource=match;
      const pose = sampleReplay(original,Math.max(0,Math.min(original.durationMs,match)));
      assert.ok(Math.hypot(frame[1] - pose.x, frame[2] - pose.y) < 1e-7);
      assert.ok(Math.abs(frame[4] - pose.elevation) < 1e-7);
    }
    assert.deepEqual(original, saved);
    assert.equal(sampleReplay(paced, paced.durationMs + 1), null, 'finished ghosts never wrap around');
    if (laps === 3) {
      assert.notDeepEqual(paced.lapEndsMs,original.lapEndsMs.map(t=>Math.round(t*durationMs/original.durationMs)),'lap clocks follow the nonlinear rhythm');
      paced.lapEndsMs.forEach((time,index)=>{
        assert.ok(paced.frames.some(frame=>frame[0]===time),'every finish has an exact render frame');
        assert.deepEqual(sampleReplay(paced,time),sampleReplay(original,original.lapEndsMs[index]));
      });
    }
  }
});

test('three deterministic rhythms speed up and ease off smoothly, exchanging position during a run',()=>{
  const source=replay(39000),paced=PACE_PROFILES.map((profile,index)=>paceReplay(source,Math.round(source.durationMs*profile.durationRatio),index));
  const progress=(ghost,time)=>{const p=sampleReplay(ghost,time);return(Math.atan2(p.y,p.x)+Math.PI*2)%(Math.PI*2);};
  for(const ghost of paced){
    const speeds=[];let last=sampleReplay(ghost,0);
    for(let time=25;time<ghost.durationMs-100;time+=25){
      const pose=sampleReplay(ghost,time),delta=Math.atan2(last.x*pose.y-last.y*pose.x,last.x*pose.x+last.y*pose.y);
      assert.ok(delta>0&&delta<.007,'no reverse progress or teleport at any sub-frame sample');
      speeds.push(delta/.025);last=pose;
    }
    assert.ok(Math.max(...speeds)/Math.min(...speeds)>1.3,'each car has a substantial nonuniform pace');
    assert.ok(speeds.slice(1).every((speed,index)=>Math.abs(speed-speeds[index])<.001),'pace changes smoothly without frame-to-frame jitter');
  }
  const ordering=time=>paced.map((ghost,index)=>({index,p:progress(ghost,time)})).sort((a,b)=>b.p-a.p).map(v=>v.index).join(',');
  assert.notEqual(ordering(8000),ordering(22000),'front and mid-race specialists can exchange places');
  const quarterFractions=paced.map(ghost=>progress(ghost,ghost.durationMs/4)/(Math.PI*2));
  assert.ok(Math.max(...quarterFractions)-Math.min(...quarterFractions)>.03,'the three slots do not form an equally spaced train');
});

test('validator-edge archives use bounded safe fallback clocks and never create invalid synthetic records',()=>{
  for(const [duration,laps]of[[25000,1],[75000,3],[GHOST_LIMITS.maxDurationMs,1]]){
    const source=candidate('Limit',duration,laps),before=structuredClone(source),challenge=createGhostChallenge([source],laps);
    assert.equal(challenge.humanCount,1);assert.equal(challenge.paceCount,3);
    for(const ghost of challenge.ghosts.filter(g=>g.synthetic)){
      assert.ok(laps===3?validateRaceReplay(ghost.replay):validateReplay(ghost.replay));
      assert.equal(ghost.targetMs,ghost.replay.durationMs);assert.equal(ghost.entry.timeMs,ghost.targetMs);
      assert.equal(ghost.entry.mode,'ghost');assert.equal(ghost.entry.playerId,0);assert.equal(ghost.entry.isAI,true);
    }
    assert.deepEqual(source,before);
  }
  assert.equal(paceReplay(replay(),24999),null);assert.equal(paceReplay(replay(),900001),null);
  assert.equal(paceReplay(replay(),39000,99),null);assert.equal(paceReplay(replay(),39000,'map'),null);assert.equal(paceReplay(null,39000),null);
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
      const target=Math.round(original.durationMs*profile.durationRatio),paced=paceReplay(original,target,index),splits=ghostSplitTimes(paced);
      assert.ok(splits.every(Number.isFinite),'retiming preserves real-track checkpoint recognition');
      assert.equal(splits.at(-1),target);assert.equal(paced.frames.at(-1)[0],target);
      sourceSplits.forEach((sourceTime,gate)=>{
        const u=sourceTime/original.durationMs,expected=target*(u+profile.amplitude/(2*Math.PI)*(Math.sin(2*Math.PI*u+profile.phase)-Math.sin(profile.phase)));
        assert.ok(Math.abs(splits[gate]-expected)<=4,`gate ${gate} disagrees with the displayed trajectory clock`);
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
