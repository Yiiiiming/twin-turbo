import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, trackPoint, projectTrack, RaceEngine } from '../engine.js';
import { RaceRenderer, updateChaseCamera, perspective, lookAt, multiply, sampleRoadRibbon, sceneWeights, cornerMarkers, sceneryPlacements, lampGeometry, roadsideLamps, cornerMarkerGeometry, CAR_CLEARANCE_HEIGHT, timingGateGeometry } from '../renderer.js';

const project = (matrix, p) => {
  const v = [...p, 1], out = [0, 0, 0, 0];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) out[row] += matrix[col * 4 + row] * v[col];
  return out.slice(0, 3).map(n => n / out[3]);
};

test('chase camera stays behind and above each heading, with the car low in the view', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const car = { x: 500, y: 500, angle, speed: 240 };
    const c = updateChaseCamera(car, null);
    const behind = (c.eye[0] - car.x) * Math.cos(angle) + (c.eye[2] - car.y) * Math.sin(angle);
    assert.ok(behind < -160);
    assert.ok(c.eye[1] >= 76 && c.eye[1] <= 84);
    const pitch = Math.atan2(c.eye[1] - c.target[1], Math.hypot(c.eye[0] - c.target[0], c.eye[2] - c.target[2]));
    assert.ok(pitch > 0 && pitch < Math.PI / 6, 'camera must read as rear chase, not overhead');
    for (const aspect of [.48, .7, 1.2]) {
      const matrix = multiply(perspective(c.fov, aspect), lookAt(c.eye, c.target));
      const screen = project(matrix, [car.x, 14, car.y]);
      assert.ok(screen[0] > -.4 && screen[0] < .4);
      assert.ok(screen[1] > -.75 && screen[1] < -.1, `car anchor ${screen[1]} must leave road ahead visible`);
      assert.ok(screen[2] > -1 && screen[2] < 1);
    }
  }
});

test('camera follows shortest rotation across the angle wrap and snaps after rescue', () => {
  const car = { x: 700, y: 500, angle: Math.PI - .01, speed: 240 };
  const before = updateChaseCamera(car, null);
  const after = updateChaseCamera({ ...car, angle: -Math.PI + .01 }, before, 1 / 60);
  assert.ok(Math.abs(after.angle - before.angle) < .01);
  const rescued = { ...car, x: 1200, y: 1100 };
  assert.deepEqual(updateChaseCamera(rescued, after), updateChaseCamera(rescued, null));
  assert.equal(before.carX, 700, 'previous camera state remains immutable');
});

test('boost widens field of view smoothly without moving camera above the car', () => {
  const car = { x: 500, y: 500, angle: 0, speed: 363, boosting: false };
  const regular = updateChaseCamera(car, null);
  const boost = updateChaseCamera({ ...car, boosting: true }, regular, 1 / 60);
  assert.ok(boost.fov > regular.fov && boost.fov < 68 * Math.PI / 180);
  assert.deepEqual(boost.eye, regular.eye);
});

test('rescuing one player resets only that camera and preserves the opponent camera object', () => {
  const engine=new RaceEngine(),renderer=Object.create(RaceRenderer.prototype);
  renderer.resetCameras(engine);
  const before=renderer.cameras.slice(),opponentSnapshot=structuredClone(before[1]);
  engine.cars[0].x+=500;engine.cars[1].x+=40;
  renderer.resetCameras(engine,engine.cars[0].id);
  assert.notEqual(renderer.cameras[0],before[0]);
  assert.equal(renderer.cameras[0].carX,engine.cars[0].x);
  assert.equal(renderer.cameras[1],before[1]);
  assert.deepEqual(renderer.cameras[1],opponentSnapshot);
  renderer.resetCameras(engine);
  assert.notEqual(renderer.cameras[1],before[1]);
  assert.equal(renderer.cameras[1].carX,engine.cars[1].x);
});

test('road geometry closes and preserves lane width on the technical circuit', () => {
  const rows = sampleRoadRibbon();
  assert.ok(rows.length > 500);
  assert.ok(Math.hypot(rows[0].center.x - rows.at(-1).center.x, rows[0].center.y - rows.at(-1).center.y) < .001);
  for (const row of rows) {
    assert.ok(Math.abs(Math.hypot(row.left.x - row.right.x, row.left.y - row.right.y) - TRACK.roadWidth) < 1e-6);
    assert.ok(Number.isFinite(row.center.angle));
  }
});

test('scene transitions are continuous normalized blends at every position', () => {
  for (let x = 0; x <= TRACK.width; x += 71) for (let y = 0; y <= TRACK.height; y += 61) {
    const weights = sceneWeights(x, y), next = sceneWeights(x + .1, y + .1);
    assert.ok(Math.abs(Object.values(weights).reduce((s, n) => s + n, 0) - 1) < 1e-9);
    for (const name of ['coast', 'alpine', 'city']) {
      assert.ok(weights[name] >= 0 && weights[name] <= 1);
      assert.ok(Math.abs(weights[name] - next[name]) < .001);
    }
  }
});

test('enlarged left and right bends receive real corner markers outside the road', () => {
  const markers=cornerMarkers();
  assert.ok(markers.length>40,'a scale change must not silently remove all bend signs');
  assert.ok(markers.some(marker=>marker.turn>0));
  assert.ok(markers.some(marker=>marker.turn<0));
  for(const segment of TRACK.segments.filter(segment=>segment.kind==='arc')) {
    assert.ok(markers.some(marker=>marker.s>=segment.s&&marker.s<segment.s+segment.length),`arc at ${segment.s} needs a visible warning`);
  }
  for(const marker of markers) {
    assert.equal(Math.sign(marker.side),-Math.sign(marker.turn),'sign belongs on the outside of the bend');
    assert.ok(projectTrack(marker.x,marker.y).distance-11.55>TRACK.roadWidth/2+8,'whole sign footprint clears asphalt');
  }
});

test('lamp arms reach inward from the roadside and warm lenses face down over asphalt', () => {
  const installed=roadsideLamps();
  assert.ok(installed.length>60);
  for(const lamp of [...installed,...installed.map(lamp=>lampGeometry(lamp.s,-1))]) {
    const right=[-Math.sin(lamp.angle),Math.cos(lamp.angle)];
    const reach=(lamp.head.position[0]-lamp.mast.position[0])*right[0]+(lamp.head.position[2]-lamp.mast.position[2])*right[1];
    assert.ok(reach*lamp.side<-40,'head points into the carriageway on either roadside');
    assert.ok(projectTrack(lamp.mast.position[0],lamp.mast.position[2]).distance>TRACK.roadWidth/2+20);
    assert.ok(projectTrack(lamp.head.position[0],lamp.head.position[2]).distance<TRACK.roadWidth/2-10);
    assert.ok(lamp.lens.position[1]+lamp.lens.size[1]/2<lamp.head.position[1]-lamp.head.size[1]/2,'light is on the underside of the housing');
    assert.ok(lamp.arm.position[1]-lamp.arm.size[1]/2>60,'arm leaves ample driving clearance');
  }
});

test('chevron paint is on the incoming face and projects toward the actual bend', () => {
  for(const marker of cornerMarkers()) {
    const geometry=cornerMarkerGeometry(marker),forward=[Math.cos(marker.angle),Math.sin(marker.angle)];
    const car={...trackPoint(marker.s-130),speed:363};
    const camera=updateChaseCamera(car,null),vp=multiply(perspective(camera.fov,.9),lookAt(camera.eye,camera.target));
    const visible=(camera.eye[0]-marker.x)*geometry.normal[0]+(camera.eye[2]-marker.y)*geometry.normal[2];
    assert.ok(visible>100,'paint faces the approaching chase camera');
    for(const chevron of geometry.chevrons) {
      const tip=project(vp,chevron.tip),tails=chevron.tails.map(tail=>project(vp,tail));
      const direction=tip[0]-(tails[0][0]+tails[1][0])/2;
      assert.ok(direction*Math.sign(marker.turn)>0.001,'visible arrow tip points right for a right bend and left for a left bend');
      for(const vertex of chevron.strokes.flat()) {
        const longitudinal=(vertex[0]-marker.x)*forward[0]+(vertex[2]-marker.y)*forward[1];
        const lateral=-(vertex[0]-marker.x)*forward[1]+(vertex[2]-marker.y)*forward[0];
        assert.ok(longitudinal<-1.1,'actual paint vertices sit in front of the incoming board face, not behind it');
        assert.ok(vertex[1]>30.5&&vertex[1]<49.5&&Math.abs(lateral)<11.5,'every painted corner fits inside the raised board');
      }
    }
  }
});

test('actual trees, palm crowns, roofs and rocks leave a continuous clear racing corridor', () => {
  const placements=sceneryPlacements();
  assert.ok(placements.length>500,'the longer route still has dense physical scenery');
  assert.deepEqual([...new Set(placements.map(p=>p.kind))].sort(),['building','palm','pine','rock']);
  for(const item of placements) {
    const gap=projectTrack(item.x,item.z).distance-item.radius-TRACK.roadWidth/2;
    assert.ok(gap>=10-1e-8,`${item.kind} at ${item.x},${item.z} has only ${gap} of road clearance`);
    // A center-distance proof is supplemented by actual boundary projections.
    for(let i=0;i<12;i++) {
      const angle=i/12*Math.PI*2;
      const edge=projectTrack(item.x+Math.cos(angle)*item.radius,item.z+Math.sin(angle)*item.radius);
      assert.ok(edge.distance>=TRACK.roadWidth/2+10-1e-7);
    }
  }
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

test('WebGL rendering uses separate complete viewports and finite bounded static meshes', () => {
  const gl = mockGL(), canvas = { width: 1281, height: 800, getContext: () => gl, addEventListener: () => {} };
  const renderer = new RaceRenderer(canvas);
  assert.equal(renderer.available, true, renderer.error);
  assert.equal(renderer.error, null);
  assert.ok(gl.uploads.reduce((n, v) => n + v, 0) < 4_500_000, 'batched world geometry stays under 18 MB');
  const p2=gl.buffers.get(renderer.meshes.cars[1].buffer);
  let orangeVertices=0;
  for(let offset=6;offset<p2.length;offset+=11) {
    if(Math.abs(p2[offset]-1)<1e-6&&Math.abs(p2[offset+1]-152/255)<1e-6&&Math.abs(p2[offset+2]-112/255)<1e-6)orangeVertices++;
  }
  assert.ok(orangeVertices>100,'P2 actual uploaded car paint matches the orange HUD');
  const props=gl.buffers.get(renderer.meshes.props.buffer),markers=cornerMarkers();
  let arrowVertices=0,lensVertices=0;
  for(let offset=0;offset<props.length;offset+=11) {
    const isColor=(r,g,b)=>Math.abs(props[offset+6]-r/255)<1e-6&&Math.abs(props[offset+7]-g/255)<1e-6&&Math.abs(props[offset+8]-b/255)<1e-6;
    if(isColor(255,219,137)) {
      arrowVertices++;
      const nearest=markers.reduce((best,marker)=>Math.hypot(marker.x-props[offset],marker.y-props[offset+2])<Math.hypot(best.x-props[offset],best.y-props[offset+2])?marker:best);
      const face=(props[offset]-nearest.x)*Math.cos(nearest.angle)+(props[offset+2]-nearest.y)*Math.sin(nearest.angle);
      assert.ok(face<-1.1,'uploaded arrow triangles must be on the approaching side');
    }
    if(isColor(255,223,160)) {
      lensVertices++;
      assert.ok(projectTrack(props[offset],props[offset+2]).distance<TRACK.roadWidth/2,'actual uploaded lamp lenses overhang the road');
    }
  }
  assert.equal(arrowVertices,markers.length*3*2*6,'all three two-stroke chevrons reach the real world mesh');
  assert.equal(lensVertices,roadsideLamps().length*36,'every lamp has its downward lens in the real mesh');
  const engine = new RaceEngine(); renderer.resetCameras(engine); renderer.render(engine, 1 / 60, 1000);
  assert.deepEqual(gl.calls.filter(c => c[0] === 'viewport'), [['viewport', 0, 0, 640, 800], ['viewport', 640, 0, 641, 800]]);
  assert.deepEqual(gl.calls.filter(c => c[0] === 'scissor'), [['scissor', 0, 0, 640, 800], ['scissor', 640, 0, 641, 800]]);
  assert.equal(gl.calls.filter(c => c[0] === 'clear').length, 2);
  assert.ok(gl.calls.filter(c => c[0] === 'drawArrays').length >= 18);
  assert.equal(gl.calls.filter(c=>c[0]==='uniform1i'&&c[1]==='uTextureC'&&c[2]===2).length,2,'both views blend all three backgrounds');
  assert.notEqual(renderer.cameras[0], renderer.cameras[1]);
});

test('missing WebGL reports an actionable error instead of throwing', () => {
  const renderer = new RaceRenderer({ getContext: () => null });
  assert.equal(renderer.available, false);
  assert.match(renderer.error, /WebGL/);
  assert.doesNotThrow(() => renderer.render(new RaceEngine()));
});

test('physical colliders come from actual props, preserve road clearance and leave both grid slots clear', () => {
  const gl=mockGL(),renderer=new RaceRenderer({width:1280,height:800,getContext:()=>gl,addEventListener:()=>{}});
  assert.equal(renderer.available,true,renderer.error);
  const obstacles=renderer.obstacles;
  assert.ok(obstacles.length>1000,'trees, buildings, rocks, lamps and barriers all have physical bodies');
  assert.equal(new Set(obstacles.map(o=>o.id)).size,obstacles.length);
  const near=(a,b)=>Math.abs(a-b)<1e-7;
  const at=(x,y)=>obstacles.filter(o=>near(o.x,x)&&near(o.y,y));
  for(const item of sceneryPlacements()) {
    const bodies=at(item.x,item.z);
    if(item.kind==='pine') {
      assert.ok(bodies.some(o=>o.type==='box'&&near(o.halfWidth,2.5*item.size)&&near(o.halfDepth,2.5*item.size)),'pine trunk exactly matches its rendered box');
      const branches=[[9,22],[26,17],[42,11]].filter(([base])=>base*item.size<CAR_CLEARANCE_HEIGHT);
      const actual=bodies.filter(o=>o.type==='circle').map(o=>o.radius).sort((a,b)=>a-b);
      const expected=branches.map(([,radius])=>radius*item.size).sort((a,b)=>a-b);
      assert.equal(actual.length,expected.length,'every branch within the vehicle height band is solid, and higher crowns are excluded');
      for(let i=0;i<expected.length;i++)assert.ok(near(actual[i],expected[i]),'low foliage collider uses its largest intersecting section');
    } else if(item.kind==='palm') {
      assert.ok(bodies.some(o=>o.type==='circle'&&near(o.radius,3.7*item.size)),'palm trunk exactly matches its tapered ground section');
    } else if(item.kind==='rock') {
      assert.ok(bodies.some(o=>o.type==='circle'&&near(o.radius,item.radius)),'boulder uses its real ground radius');
    } else {
      assert.ok(bodies.some(o=>o.type==='box'&&near(o.halfWidth,item.width/2)&&near(o.halfDepth,item.depth/2)),'building walls use their actual width and depth');
    }
  }
  for(const lamp of roadsideLamps()) {
    assert.ok(at(lamp.mast.position[0],lamp.mast.position[2]).some(o=>o.type==='box'&&o.halfWidth===1.5&&o.halfDepth===1.5));
    assert.equal(at(lamp.head.position[0],lamp.head.position[2]).length,0,'overhead lamp head does not block the roadway');
  }
  for(const marker of cornerMarkers()) {
    const bodies=at(marker.x,marker.y);
    assert.ok(bodies.some(o=>o.type==='box'&&o.halfWidth===2.5&&o.halfDepth===1.5),'sign support is solid');
    assert.equal(bodies.some(o=>o.type==='box'&&o.halfDepth===11.5),false,'raised sign face stays above the car collider');
  }
  const cars=new RaceEngine().cars;
  for(const obstacle of obstacles) {
    if(obstacle.type==='circle') {
      assert.ok(projectTrack(obstacle.x,obstacle.y).distance-obstacle.radius>TRACK.roadWidth/2,'circular props do not occupy asphalt');
      for(const car of cars)assert.ok(Math.hypot(car.x-obstacle.x,car.y-obstacle.y)>21+obstacle.radius,'spawn clears every circular collider');
    } else {
      const c=Math.cos(obstacle.angle),s=Math.sin(obstacle.angle);
      for(const u of [-1,0,1])for(const v of [-1,0,1]) {
        const x=obstacle.x+c*u*obstacle.halfWidth-s*v*obstacle.halfDepth,y=obstacle.y+s*u*obstacle.halfWidth+c*v*obstacle.halfDepth;
        assert.ok(projectTrack(x,y).distance>TRACK.roadWidth/2,'box corners and edge centers remain outside asphalt');
      }
      for(const car of cars) {
        const dx=car.x-obstacle.x,dy=car.y-obstacle.y;
        const closestX=Math.max(0,Math.abs(dx*c+dy*s)-obstacle.halfWidth),closestY=Math.max(0,Math.abs(-dx*s+dy*c)-obstacle.halfDepth);
        assert.ok(Math.hypot(closestX,closestY)>21,'spawn clears every oriented box');
      }
    }
  }
});


test('harbor ghosts are transparent visual copies, scoped to their own viewport and never physical', () => {
  const gl=mockGL(),renderer=new RaceRenderer({width:1280,height:800,getContext:()=>gl,addEventListener:()=>{}});
  const engine=new RaceEngine(),obstacles=structuredClone(renderer.obstacles),carState=structuredClone(engine.cars);
  const first={x:100,y:200,angle:.2,elevation:0},second={x:350,y:420,angle:-.5,elevation:0};
  renderer.setGhostPoses([first,second]); first.x=999;
  const vertices=gl.buffers.get(renderer.meshes.ghost.buffer);
  for(let i=0;i<vertices.length;i+=11){assert.ok(vertices[i+9]>.1&&vertices[i+9]<.4);assert.ok(vertices[i+8]>vertices[i+7]);}
  renderer.render(engine);
  const ghosts=gl.draws.filter(draw=>draw.buffer===renderer.meshes.ghost.buffer);
  assert.equal(ghosts.length,2);
  assert.deepEqual(ghosts.map(draw=>[draw.model[12],draw.model[13],draw.model[14]]),[[100,1.5,200],[350,1.5,420]]);
  assert.ok(ghosts.every(draw=>!draw.depthWrite&&draw.blending));
  assert.deepEqual(renderer.obstacles,obstacles); assert.deepEqual(engine.cars,carState);
  gl.draws.length=0;renderer.setGhostPoses([null,second]);renderer.render(engine);
  assert.equal(gl.draws.filter(draw=>draw.buffer===renderer.meshes.ghost.buffer).length,1);
  gl.draws.length=0;renderer.setGhostPoses([]);renderer.render(engine);
  assert.equal(gl.draws.filter(draw=>draw.buffer===renderer.meshes.ghost.buffer).length,0);
});

test('two ghost colours appear independently in both viewports with transparent meshes and no physical state', () => {
  const gl=mockGL(),renderer=new RaceRenderer({width:1280,height:800,getContext:()=>gl,addEventListener:()=>{}}),engine=new RaceEngine();
  const obstacles=structuredClone(renderer.obstacles),cars=structuredClone(engine.cars);
  const poses=[
    [{slotId:0,x:100,y:200,angle:.2,elevation:3},{slotId:1,x:140,y:260,angle:.3,elevation:4}],
    [{slotId:0,x:350,y:420,angle:-.5,elevation:5},{slotId:1,x:400,y:470,angle:-.3,elevation:6}],
  ];
  renderer.setGhostPoses(poses);poses[0][0].x=9999;renderer.render(engine);
  for(const [slot,mesh,rgb] of [[0,renderer.meshes.ghost,[184/255,162/255,237/255]],[1,renderer.meshes.ghostGold,[1,209/255,102/255]]]) {
    const vertices=gl.buffers.get(mesh.buffer);
    for(let i=0;i<vertices.length;i+=11){
      rgb.forEach((value,axis)=>assert.ok(Math.abs(vertices[i+6+axis]-value)<1e-6));
      assert.ok(vertices[i+9]>.1&&vertices[i+9]<.4,'each ghost vertex has transparent paint');
    }
    const draws=gl.draws.filter(draw=>draw.buffer===mesh.buffer);assert.equal(draws.length,2);
    assert.deepEqual(draws.map(draw=>draw.viewport),[[0,0,640,800],[640,0,640,800]]);
    const expected=slot===0?[[100,4.5,200],[350,6.5,420]]:[[140,5.5,260],[400,7.5,470]];
    assert.deepEqual(draws.map(draw=>[draw.model[12],draw.model[13],draw.model[14]]),expected);
    assert.ok(draws.every(draw=>draw.blending&&!draw.depthWrite));
  }
  const realDraws=gl.draws.filter(draw=>renderer.meshes.cars.some(mesh=>mesh.buffer===draw.buffer));
  assert.equal(realDraws.length,4);assert.ok(realDraws.every(draw=>draw.depthWrite&&!draw.blending));
  assert.deepEqual(renderer.obstacles,obstacles);assert.deepEqual(engine.cars,cars);
  const purple=gl.buffers.get(renderer.meshes.ghost.buffer),real=gl.buffers.get(renderer.meshes.cars[0].buffer);
  assert.ok(real.some((value,i)=>i%11===9&&value===1));assert.ok(purple.every((value,i)=>i%11!==9||value<1),'ghost opacity differs from solid body paint');
  gl.draws.length=0;renderer.setGhostPoses([[],[{slotId:1,x:1,y:2,angle:0,elevation:0}]]);renderer.render(engine);
  const ghostDraws=gl.draws.filter(draw=>draw.buffer===renderer.meshes.ghost.buffer||draw.buffer===renderer.meshes.ghostGold.buffer);
  assert.equal(ghostDraws.length,1);assert.equal(ghostDraws[0].buffer,renderer.meshes.ghostGold.buffer);assert.equal(ghostDraws[0].viewport[0],640);
});

test('vehicle colour selection uses the correct real mesh without swapping player identity or position', () => {
  const gl=mockGL(),renderer=new RaceRenderer({width:1280,height:800,getContext:()=>gl,addEventListener:()=>{}}),engine=new RaceEngine();
  engine.cars[0].colorIndex=1;engine.cars[1].colorIndex=0;const before=structuredClone(engine.cars);
  renderer.render(engine);
  for(const [player,mesh] of [[0,renderer.meshes.cars[1]],[1,renderer.meshes.cars[0]]]) {
    const draws=gl.draws.filter(draw=>draw.buffer===mesh.buffer);assert.equal(draws.length,2);
    assert.ok(draws.every(draw=>Math.abs(draw.model[12]-engine.cars[player].x)<.01&&Math.abs(draw.model[14]-engine.cars[player].y)<.01));
    assert.deepEqual(draws.map(draw=>draw.viewport[0]),[0,640]);
  }
  assert.deepEqual(engine.cars,before);assert.deepEqual(engine.cars.map(car=>car.id),[1,2]);
});

test('invalid ghost poses are ignored and each viewport is limited to two visual ghosts', () => {
  const renderer=Object.create(RaceRenderer.prototype),valid={x:1,y:2,angle:0,elevation:0};
  renderer.setGhostPoses([[{...valid,x:NaN},{...valid,slotId:1},{...valid,slotId:0},{...valid,x:100}],{...valid,slotId:1}]);
  assert.equal(renderer.ghostPoses[0].length,2);assert.equal(renderer.ghostPoses[1].length,1);
  assert.deepEqual(renderer.ghostPoses[0].map(pose=>pose.slotId),[1,0]);
  assert.equal(renderer.ghostPoses[1][0].slotId,1,'legacy single-pose input remains supported');
});


test('four timing locations align with quarter gates, with visible forward-facing boards and solid posts outside the road', () => {
  const gl=mockGL(),renderer=new RaceRenderer({width:1280,height:800,getContext:()=>gl,addEventListener:()=>{}});
  const gates=timingGateGeometry();assert.deepEqual(gates.map(gate=>gate.fraction),[.25,.5,.75,1]);
  assert.equal(gates[3].finish,true,'existing start/finish gantry supplies the fourth point');
  const props=gl.buffers.get(renderer.meshes.props.buffer);
  for(const gate of gates.slice(0,3)){
    const p=trackPoint(TRACK.startDistance+TRACK.length*gate.fraction);
    assert.ok(Math.hypot(p.x-gate.center.x,p.y-gate.center.y)<1e-7);
    for(const post of gate.posts){
      assert.ok(projectTrack(post.x,post.y).distance>=TRACK.roadWidth/2+29.9);
      assert.ok(renderer.obstacles.some(body=>body.type==='box'&&Math.hypot(body.x-post.x,body.y-post.y)<1e-7&&body.halfWidth===2.5&&body.halfDepth===2.5),'rendered support has a real collider');
    }
    const forward=[Math.cos(p.angle),Math.sin(p.angle)];let numeralVertices=0;
    for(let i=0;i<props.length;i+=11){
      const dx=props[i]-p.x,dz=props[i+2]-p.y;
      const along=dx*forward[0]+dz*forward[1],side=-dx*forward[1]+dz*forward[0];
      if(Math.abs(side)>10||Math.abs(along)>8||props[i+1]<98||props[i+1]>124)continue;
      if(Math.abs(props[i+6]-216/255)<1e-6&&Math.abs(props[i+7]-1)<1e-6&&Math.abs(props[i+8]-230/255)<1e-6){
        numeralVertices++;assert.ok(along<-5.2,'digits are entirely in front of the incoming board face');
      }
    }
    assert.ok(numeralVertices>=36,'checkpoint number reaches the actual world mesh');
    assert.ok(renderer.obstacles.every(body=>body.type!=='box'||Math.hypot(body.x-p.x,body.y-p.y)>30),'no gate collider spans the drivable center');
  }
});
