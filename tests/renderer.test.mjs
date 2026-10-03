import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK, trackPoint, projectTrack, RaceEngine } from '../engine.js';
import { RaceRenderer, updateChaseCamera, perspective, lookAt, multiply, sampleRoadRibbon, sceneWeights, cornerMarkers, sceneryPlacements } from '../renderer.js';

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
  const car = { x: 500, y: 500, angle: 0, speed: 330, boosting: false };
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
  let boundBuffer;
  const gl = { calls, uploads, uniforms, buffers };
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
