import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, TRACKS, RaceEngine, setTrack, trackPoint, projectTrack } from '../src/engine.js';
import { RaceRenderer, roadsideLamps, updateChaseCamera, perspective, lookAt, multiply } from '../src/renderer.js';
import { entrySegmentBlocked } from '../src/entry-cameras.js';
import { HOUSE_BANNERS, houseCrestTriangles } from '../src/london-house-banner-models.js';
import { HouseCeremony, HOUSE_CEREMONY_LOCATION, HOUSE_CEREMONY_TIMING, bannerPoint, appendHouseBanners } from '../src/london-house-ceremony.js';
import { londonMagicPlacements } from '../src/london-magic-layout.js';
import { londonMagicState, MagicEffects, MAGIC_EFFECT_VERTICES, magicBodyMatrix, magicArmMatrix } from '../src/london-magic-effects.js';

test.afterEach(() => setTrack('coast'));
const place = (car, s, lane = 0) => Object.assign(car, trackPoint(s, lane), { _lastTrackS: s });
const transform = (matrix, point) => [0, 1, 2].map(row =>
  matrix[row] * point[0] + matrix[4 + row] * point[1] + matrix[8 + row] * point[2] + matrix[12 + row]);
const near = (a,b,epsilon=1e-6) => assert.ok(Math.abs(a-b)<epsilon, `${a} != ${b}`);
const ceremonyEnd=HOUSE_CEREMONY_TIMING.release+3*HOUSE_CEREMONY_TIMING.stagger+HOUSE_CEREMONY_TIMING.descent;
const entryS=HOUSE_CEREMONY_TIMING.triggerS+1;

function recordingGL() {
  let bound, program, viewport, id=0;
  const uniforms = new Map(), gl = { buffers:new Map(), draws:[], uploads:[], subloads:[], deletes:[], depthWrite:true, blend:false };
  for(const name of ['ARRAY_BUFFER','STATIC_DRAW','DYNAMIC_DRAW','TRIANGLES','LINES','BLEND','SRC_ALPHA','ONE','ONE_MINUS_SRC_ALPHA'])gl[name]=name;
  for(const name of ['createShader','createProgram','createBuffer','createTexture'])gl[name]=()=>({id:++id});
  gl.getShaderParameter=gl.getProgramParameter=()=>true;gl.getAttribLocation=()=>0;
  gl.getUniformLocation=(owner,name)=>({owner,name});gl.useProgram=owner=>{program=owner;};
  gl.bindBuffer=(_,value)=>{bound=value;};
  gl.bufferData=(_,data,usage)=>{gl.buffers.set(bound,Float32Array.from(data));gl.uploads.push({buffer:bound,usage});};
  gl.bufferSubData=(_,offset,data)=>{gl.buffers.get(bound).set(data,offset/4);gl.subloads.push({buffer:bound,offset,count:data.length});};
  gl.deleteBuffer=buffer=>{gl.deletes.push(buffer);gl.buffers.delete(buffer);};
  const put=(location,value)=>{if(!uniforms.has(location.owner))uniforms.set(location.owner,{});uniforms.get(location.owner)[location.name]=typeof value==='number'?value:Array.from(value);};
  for(const name of ['uniform1f','uniform1i','uniform3fv'])gl[name]=put;
  gl.uniformMatrix4fv=(location,_,value)=>put(location,value);
  gl.viewport=x=>{viewport=x;};
  gl.drawArrays=(type,first,count)=>gl.draws.push({buffer:bound,program,viewport,type,first,count,depthWrite:gl.depthWrite,blend:gl.blend,blendMode:gl.blendMode,uniforms:{...uniforms.get(program)}});
  gl.depthMask=value=>{gl.depthWrite=value;};gl.enable=kind=>{if(kind===gl.BLEND)gl.blend=true;};gl.disable=kind=>{if(kind===gl.BLEND)gl.blend=false;};gl.blendFunc=(a,b)=>{gl.blendMode=[a,b];};
  for(const name of ['shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindTexture','texImage2D','texParameteri','depthFunc','clearColor','enableVertexAttribArray','vertexAttribPointer','disableVertexAttribArray','activeTexture','scissor','clear','pixelStorei'])gl[name]=()=>{};
  return gl;
}
function scene() {
  const gl=recordingGL(),renderer=new RaceRenderer({width:1440,height:820,getContext:()=>gl,addEventListener(){}});
  assert.equal(renderer.available,true,renderer.error);return {gl,renderer};
}
function bounds(data) {
  const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<data.length;i+=11)for(let axis=0;axis<3;axis++){low[axis]=Math.min(low[axis],data[i+axis]);high[axis]=Math.max(high[axis],data[i+axis]);}
  return Array.from({length:8},(_,bits)=>low.map((value,axis)=>bits&(1<<axis)?high[axis]:value));
}
function lampBodies() {
  return roadsideLamps().flatMap(lamp=>['mast','arm','head','lens'].map(key=>{
    const {position:p,size:s}=lamp[key];return {type:'box',x:p[0],y:p[2],halfWidth:s[0]/2,halfDepth:s[2]/2,
      angle:lamp.angle,minHeight:p[1]-s[1]/2,maxHeight:p[1]+s[1]/2};
  }));
}

test('the four house banners retain distinct heraldry and original colors without relying on remote artwork',()=>{
  assert.deepEqual(HOUSE_BANNERS.map(h=>h.id),['gryffindor','slytherin','ravenclaw','hufflepuff']);
  assert.equal(new Set(HOUSE_BANNERS.map(h=>h.cloth)).size,4);
  const silhouettes=[];
  for(const house of HOUSE_BANNERS){
    const triangles=houseCrestTriangles(house.id);assert.ok(triangles.length>=20,'each badge contains a shield and its own animal silhouette');
    silhouettes.push(JSON.stringify(triangles));
    for(const triangle of triangles){
      assert.equal(triangle.points.length,3);assert.match(triangle.color,/^#[a-f\d]{6}$/i);
      assert.ok(Number.isFinite(triangle.layer)&&triangle.layer>=0);
      for(const uv of triangle.points)assert.ok(uv.length===2&&uv.every(v=>Number.isFinite(v)&&v>0&&v<1));
    }
  }
  assert.equal(new Set(silhouettes).size,4,'the four badges cannot be the same symbol recolored');
});

test('the first approaching racer triggers one timely shared ceremony per lap, with reset and twelve-map isolation',()=>{
  setTrack('coast-london');const engine=new RaceEngine(),ceremony=new HouseCeremony();
  place(engine.cars[0],entryS);place(engine.cars[1],entryS-400);engine.time=20;engine.state='countdown';
  assert.equal(ceremony.update(engine).elapsed,null,'the cinematic/countdown must not consume the entrance event');
  engine.state='racing';place(engine.cars[0],entryS,300);
  assert.equal(ceremony.update(engine).elapsed,null,'a remote off-road car cannot summon flags');
  place(engine.cars[0],entryS);const waiting=ceremony.update(engine);
  assert.equal(waiting.elapsed,0);assert.equal(waiting.banners.length,0);
  engine.time=20.8;const raising=ceremony.update(engine);
  assert.ok(raising.caster.armPitch>waiting.caster.armPitch+1.5,'Dumbledore must visibly lift his wand above the resting pose');
  assert.ok(Math.hypot(...raising.caster.wand.map((value,i)=>value-waiting.caster.wand[i]))>25,'the rendered wand tip must trace a broad gesture');
  assert.equal(raising.banners.length,0,'the lift leads the flags instead of occurring after their appearance');
  engine.time=20+HOUSE_CEREMONY_TIMING.release+.1;const release=ceremony.update(engine);
  assert.equal(release.banners.length,1,'the houses enter with a deliberate stagger');
  engine.time=22.4;const sweeping=ceremony.update(engine);
  assert.ok(sweeping.caster.armYaw>raising.caster.armYaw+.5,'the held lift must flow into an outward sweep');
  assert.ok(sweeping.caster.armSpread>raising.caster.armSpread+.1);
  assert.ok(ceremonyEnd>=3.8&&ceremonyEnd<=4.5,'the complete descent is unhurried but finishes during the drive-by');
  engine.time=20+ceremonyEnd+.01;const open=ceremony.update(engine);
  assert.equal(open.banners.length,4);assert.ok(open.banners.every(b=>b.unfold===1&&b.progress===1),'all four flags must unfold before a fast driver passes');
  engine.state='paused';const frozen=structuredClone(ceremony.update(engine));
  assert.deepEqual(ceremony.update(engine),frozen,'both views and pause use one simulation timestamp');
  engine.state='racing';place(engine.cars[0],7100);place(engine.cars[1],entryS);engine.time=25;
  assert.equal(ceremony.update(engine).elapsed,5,'a trailing second player cannot restart the same lap ceremony');
  place(engine.cars[0],entryS);engine.time=26;assert.equal(ceremony.update(engine).elapsed,6,'reverse re-entry cannot restart the same lap');
  engine.cars[1].lap=1;engine.time=27;assert.equal(ceremony.update(engine).elapsed,0,'a later lap may summon the banners again');
  engine.time=0;engine.state='countdown';assert.equal(ceremony.update(engine).elapsed,null,'restart clears the previous performance');
  for(const id of Object.keys(TRACKS)){setTrack(id);const state=ceremony.update(engine);if(id!=='coast-london')assert.equal(state,null,id);}
});

test('unfolding cloth and animal badges share the reserved spell buffer without altering a single existing spell vertex',()=>{
  setTrack('coast-london');const engine=new RaceEngine(),ceremony=new HouseCeremony(),items=londonMagicPlacements(),pool=new MagicEffects();
  const data=pool.data;engine.state='racing';place(engine.cars[0],entryS);place(engine.cars[1],entryS-400);let maximum=0;
  for(const epoch of [0,17.37,1000.731]){
    ceremony.reset();engine.time=epoch;ceremony.update(engine);
    for(let frame=0;frame<=600;frame++){
      engine.time=epoch+frame/120;const state=ceremony.update(engine);pool.update(londonMagicState(items,engine.time));
      const count=pool.count,before=data.slice(0,count*11),range=appendHouseBanners(pool,state);
      assert.equal(pool.data,data);assert.equal(data.length,MAGIC_EFFECT_VERTICES*11);
      assert.equal(range.first,count);assert.equal(range.count,pool.count-count);
      assert.deepEqual(data.slice(0,count*11),before,'the old duel prefix must remain byte-for-byte identical');
      assert.ok(pool.count<=MAGIC_EFFECT_VERTICES);assert.equal(range.count%3,0);maximum=Math.max(maximum,pool.count);
      for(let i=count*11;i<pool.count*11;i++)assert.ok(Number.isFinite(data[i]));
      for(let i=count*11;i<pool.count*11;i+=11){assert.equal(data[i+9],1,'cloth is opaque, not an additive spell');assert.ok(data[i+10]>=0&&data[i+10]<=1,'all house colors remain unthemed material 0');}
    }
  }
  assert.ok(maximum>3000&&maximum<=4096,'exercise the complete flags and active duel at the same instant');
});

test('the uploaded heraldry remains in front of the actual triangulated cloth throughout its flutter cycle',()=>{
  setTrack('coast-london');const engine=new RaceEngine(),ceremony=new HouseCeremony();engine.state='racing';
  place(engine.cars[0],entryS);engine.time=0;ceremony.update(engine);
  const pool={data:new Float32Array(4096*11),count:0},us=[0,.045,.25,.5,.75,.955,1];
  let minimum=Infinity;
  for(let frame=0;frame<=120;frame++){
    engine.time=ceremonyEnd+.01+frame/20;const state=ceremony.update(engine);
    assert.equal(state.banners.length,4);assert.ok(state.banners.every(b=>b.unfold===1));
    for(const banner of state.banners){
      pool.count=0;appendHouseBanners(pool,{...state,banners:[banner]});
      const depth=index=>(pool.data[index*11]-banner.x)*Math.cos(banner.angle)+(pool.data[index*11+2]-banner.z)*Math.sin(banner.angle);
      const clothDepth=(u,v)=>{
        const col=us.findIndex((n,i)=>i<6&&u>=n&&u<=us[i+1]),row=Math.min(7,Math.floor(v*8));
        assert.ok(col>=0);const x=(u-us[col])/(us[col+1]-us[col]),y=v*8-row,first=(col*8+row)*6;
        return x>=y?depth(first)*(1-x)+depth(first+1)*(x-y)+depth(first+2)*y:
          depth(first+3)*(1-y)+depth(first+4)*x+depth(first+5)*(y-x);
      };
      const crests=houseCrestTriangles(banner.house.id);
      for(let index=0;index<crests.length;index++)for(let a=0;a<=10;a++)for(let c=0;c<=10-a;c++){
        const weights=[a/10,c/10,1-(a+c)/10],points=crests[index].points;
        const u=weights.reduce((sum,w,i)=>sum+w*points[i][0],0),v=weights.reduce((sum,w,i)=>sum+w*points[i][1],0);
        const crestDepth=weights.reduce((sum,w,i)=>sum+w*depth(6*8*6+6+index*3+i),0);
        const gap=clothDepth(u,v)-crestDepth;minimum=Math.min(minimum,gap);
        assert.ok(gap>.3,`${banner.house.id} heraldry intersects the cloth at ${engine.time}`);
      }
    }
  }
  assert.ok(minimum<.7,'sample the shield closest to the fabric, not only raised animal details');
});

test('the complete summoning path and settled flags clear the racing lane, flying car envelope, scenery and streetlights',()=>{
  setTrack('coast-london');const {renderer,gl}=scene(),engine=new RaceEngine(),ceremony=new HouseCeremony();
  engine.state='racing';place(engine.cars[0],entryS);place(engine.cars[1],entryS-400);engine.time=30;ceremony.update(engine);
  const solids=[...renderer.obstacles,...lampBodies()];
  const previous=new Map(),lanes=[-126,-42,42,126];
  for(const [x,y,z] of bounds(gl.buffers.get(renderer.magicMeshes.car.buffer))){
    assert.ok(Math.hypot(x,y,z)<40,'the complete flying-car hull must fit the tested horizontal envelope at every heading');
    assert.ok(147+Math.abs(y)+Math.abs(x)*Math.sin(.045)+Math.abs(z)*Math.sin(.08)<178,
      'maximum hover, pitch and bank must fit the tested height envelope');
  }
  for(let step=0;step<=300;step++){
    engine.time=30+step/60;const state=ceremony.update(engine);
    for(const part of ['body','arm']){
      const mesh=renderer.magicMeshes[`dumbledore:${part}`],matrix=part==='body'?magicBodyMatrix(state.caster):magicArmMatrix(state.caster);
      const points=bounds(gl.buffers.get(mesh.buffer)).map(p=>transform(matrix,p));
      for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit))assert.equal(entrySegmentBlocked(points[i],points[i|bit],solids,2),false,`caster ${part} intersects scenery`);
      for(const point of points)assert.ok(projectTrack(point[0],point[2],HOUSE_CEREMONY_LOCATION.casterS).distance>TRACK.roadWidth/2+10,'Dumbledore remains beside the racing lane');
    }
    for(const banner of state.banners){
      const target=trackPoint(HOUSE_CEREMONY_LOCATION.bannerS,lanes[banner.index]);
      near(banner.x,target.x);near(banner.z,target.y);
      assert.ok(banner.y>=target.elevation+HOUSE_CEREMONY_LOCATION.top-1e-6,'the roll lowers from above its final hanging position');
      const last=previous.get(banner.index);
      if(last){assert.ok(banner.y<=last.y+1e-6,'flags descend instead of flying out from the caster');assert.ok(banner.unfold>=last.unfold,'vertical unrolling must not reverse');}
      else{
        assert.ok(banner.y>target.elevation+HOUSE_CEREMONY_LOCATION.top+200,'the first glimpse must be high overhead');
        const left=bannerPoint(banner,0,0),right=bannerPoint(banner,1,0),bottom=bannerPoint(banner,.5,1),top=bannerPoint(banner,.5,0);
        assert.ok(Math.hypot(right[0]-left[0],right[2]-left[2])>HOUSE_CEREMONY_LOCATION.width*.85,'the initial roll already spans the banner width');
        assert.ok(top[1]-bottom[1]<10,'the rolled fabric opens downward rather than growing from a tiny point');
      }
      previous.set(banner.index,banner);
      const points=[];for(const u of [0,.25,.5,.75,1])for(const v of [0,.25,.5,.75,1])points.push(bannerPoint(banner,u,v));
      for(const p of points){
        const road=projectTrack(p[0],p[2],HOUSE_CEREMONY_LOCATION.bannerS);
        // The flying Ford stays on the centerline; its complete yaw/roll/pitch
        // hull fits within 40 units horizontally and below height 178. Ground
        // racers use the wider road. Streetlights are checked as actual solids.
        if(road.distance<40)assert.ok(p[1]-road.elevation>178,'fabric may not enter the flying-car envelope');
        if(road.distance<TRACK.roadWidth/2)assert.ok(p[1]-road.elevation>100,'fabric may not enter the ground-racing envelope');
        assert.equal(entrySegmentBlocked(p,p,solids,2),false,'cloth vertex passes through a building or lamp');
      }
      for(const u of [0,.5,1])assert.equal(entrySegmentBlocked(bannerPoint(banner,u,0),bannerPoint(banner,u,1),solids,3),false,'the hanging face intersects scenery');
      if(banner.unfold===1)assert.ok(Math.min(...points.map(p=>p[1]))>=189.99,'settled banners stay fully above the flying car');
    }
  }
  assert.equal(previous.size,4);
  engine.time=30+Math.max(5.1,ceremonyEnd+.1);const state=ceremony.update(engine);
  assert.equal(state.banners.length,4);assert.ok(state.banners.every(b=>b.unfold===1));
  for(const speed of [0,363,517])for(const lane of [-25,0,25]){
    const camera=updateChaseCamera({...trackPoint(5500,lane),speed},null),m=multiply(perspective(camera.fov,16/9),lookAt(camera.eye,camera.target));
    for(const b of state.banners)for(const uv of [[0,0],[1,0],[0,1],[1,1]]){
      const point=[...bannerPoint(b,...uv),1],clip=[0,1,2,3].map(row=>point.reduce((sum,n,i)=>sum+n*m[i*4+row],0));
      assert.ok(clip[3]>0&&Math.abs(clip[0]/clip[3])<1&&Math.abs(clip[1]/clip[3])<1,'all four banners must be visible in the real approach camera');
    }
  }
  // The approach bend initially reveals the ceremony from the side. After
  // turning into Hogwarts, both normal and maximum-boost racers see the slow
  // unrolling and the complete final banner before passing underneath it.
  for(const speed of [363,517]){
   ceremony.reset();engine.time=0;place(engine.cars[0],entryS);ceremony.update(engine);
   for(const elapsed of [2.2,2.6,3,3.5,ceremonyEnd+.01]){
    engine.time=elapsed;const state=ceremony.update(engine),camera=updateChaseCamera({...trackPoint(entryS+elapsed*speed),speed,boosting:speed===517},null);
    const matrix=multiply(perspective(camera.fov,16/9),lookAt(camera.eye,camera.target));
    assert.equal(state.banners.length,4);
    for(const b of state.banners)for(const uv of [[0,0],[1,0],[0,1],[1,1],[.5,.5]]){
      const point=[...bannerPoint(b,...uv),1],clip=[0,1,2,3].map(row=>point.reduce((sum,n,i)=>sum+n*matrix[i*4+row],0));
      assert.ok(clip[3]>0&&Math.abs(clip[0]/clip[3])<1&&Math.abs(clip[1]/clip[3])<1,`the driver at speed ${speed} misses the flags at ${elapsed}`);
    }
   }
  }
});

test('production renders opaque cloth and additive spells from separate ranges in one shared upload and fits six ghosts under 40 MB',()=>{
  setTrack('coast-london');const {renderer,gl}=scene(),engine=new RaceEngine();engine.state='racing';
  engine.setObstacles(renderer.obstacles);place(engine.cars[0],entryS);place(engine.cars[1],entryS,20);engine.time=40;
  const initialObstacles=structuredClone(renderer.obstacles),traffic=structuredClone(engine.traffic),world=engine.obstacleWorld;
  assert.equal(gl.uploads.filter(u=>u.usage===gl.DYNAMIC_DRAW).length,1,'flags reuse the existing spell allocation');
  const effects=renderer.magicMeshes.effects,initialPool=gl.buffers.get(effects.buffer);assert.equal(initialPool.length,4096*11);assert.ok(initialPool.every(v=>v===0));
  renderer.resetCameras(engine);renderer.render(engine,0,0);engine.time=40+ceremonyEnd+.01;
  place(engine.cars[0],5500);place(engine.cars[1],5500,20);renderer.resetCameras(engine);gl.draws.length=0;gl.subloads.length=0;
  const uploads=gl.uploads.length;renderer.render(engine,0,1e12);
  assert.equal(gl.subloads.length,1);assert.equal(gl.subloads[0].buffer,effects.buffer);
  const range=renderer.magicBannerRange,draws=gl.draws.filter(d=>d.buffer===effects.buffer);
  assert.equal(draws.length,4,'two cloth batches and two spell batches for the two viewports');
  const cloth=draws.filter(d=>d.first===range.first),spells=draws.filter(d=>d.first===0);
  assert.equal(range.first,effects.count);assert.equal(cloth.length,2);assert.equal(spells.length,2);
  for(const draw of cloth){assert.equal(draw.count,range.count);assert.equal(draw.blend,false);assert.equal(draw.depthWrite,true);}
  for(const draw of spells){assert.equal(draw.count,effects.count);assert.equal(draw.depthWrite,false);assert.deepEqual(draw.blendMode,[gl.SRC_ALPHA,gl.ONE]);}
  assert.deepEqual(cloth.map(d=>d.uniforms.uModel),spells.map(d=>d.uniforms.uModel),'both ranges use the unchanged world transform');
  assert.equal(gl.uploads.length,uploads,'animation does not allocate or upload a static model');
  const oldPayload=gl.buffers.get(effects.buffer).slice(),oldState=structuredClone(renderer.houseState);
  engine.state='paused';renderer.render(engine,.05,0);assert.deepEqual(renderer.houseState,oldState);assert.deepEqual(gl.buffers.get(effects.buffer),oldPayload);
  assert.equal(engine.obstacleWorld,world);assert.deepEqual(renderer.obstacles,initialObstacles);assert.deepEqual(engine.traffic,traffic);
  renderer.setSinglePlayer(true);const car=engine.cars[0];renderer.setGhostPoses([Array.from({length:6},(_,slotId)=>({slotId,x:car.x+slotId*12,y:car.y+70,angle:car.angle,elevation:car.elevation}))]);renderer.render(engine,0,2);
  assert.equal(renderer.ghostMeshes.length,6);const totalBytes=[...gl.buffers.values()].reduce((sum,d)=>sum+d.byteLength,0);
  assert.ok(totalBytes<40_000_000,`six-ghost ceremony scene uses ${totalBytes} bytes`);
  const actorBuffers=['dumbledore:body','dumbledore:arm'].map(k=>renderer.magicMeshes[k].buffer);
  engine.selectTrack('coast-paris');renderer.rebuild(engine);
  assert.equal(renderer.houseState,null);assert.equal(renderer.houseCeremony,null);assert.equal(renderer.magicBannerRange.count,0);
  for(const b of [...actorBuffers,effects.buffer])assert.ok(gl.deletes.includes(b)&&!gl.buffers.has(b),'leaving London releases the ceremony assets');
});
