import { CityRenderer } from '../city-renderer.js';
import { RaceEngine, TRACK, setTrack, trackPoint, projectTrack, mod } from '../engine.js';
import { geographicToWorld, distanceAlongTrack } from '../tracks.js';
import { RaceAI } from '../ai.js';
import { ObstacleWorld } from '../collisions.js';
import map from '../assets/london-map.json' with { type: 'json' };

const $ = id => document.getElementById(id);
setTrack('london');
const engine = new RaceEngine({ laps: 1 });
const started = performance.now();
const renderer = new CityRenderer($('scene'));
const buildMs = performance.now() - started;
if (!renderer.available) throw new Error(renderer.error?.message || 'Renderer unavailable');
engine.setObstacles(renderer.obstacles);
const drivers = [new RaceAI({ carId: 1 }), new RaceAI({ carId: 2 })];
const locations = [{ id: 'start', label: '起跑线 · The Mall', s: TRACK.startDistance + 30 }];
const continuousStreets = [];
for (const street of TRACK.streets) {
  const previous = continuousStreets.at(-1);
  if (previous?.name === street.name && Math.abs(previous.end - street.start) < 1) previous.end = street.end;
  else continuousStreets.push({ ...street });
}
for (const street of continuousStreets.filter(street=>['Gerrard Street','Shaftesbury Avenue','Wardour Street'].includes(street.name))) {
  locations.push({id:`street-${street.start}`,label:`${street.name} · 赛道入口`,s:street.start-50});
  locations.push({id:`street-mid-${street.start}`,label:`${street.name} · 路段中间`,s:(street.start+street.end)/2});
}
for (const landmark of map.landmarks) {
  const world = geographicToWorld(TRACK.projection, ...landmark.coordinates);
  locations.push({ id: landmark.id, label: landmark.name, s: distanceAlongTrack(TRACK, world) - 100, world });
}
for (const section of TRACK.sections) {
  for (const [label, s] of [['入口前', section.start - 90], ['入口内', section.start + section.ramp],
    ['中段', (section.start + section.end) / 2], ['出口内', section.end - section.ramp], ['出口后', section.end + 60]]) {
    locations.push({ id: `${section.id}-${label}`, label: `${section.name} · ${label}`, s });
  }
}
for (const location of locations) {
  const option = document.createElement('option'); option.value = location.id; option.textContent = location.label; $('location').append(option);
}
let currentS = TRACK.startDistance, target = null, report = null;
let validationRunning = false, clearanceRunning = false;
const keys = new Set();
function jumpTo(s, world = null) {
  if (validationRunning) return;
  currentS = mod(s, TRACK.length); target = world;
  engine.state = 'racing'; engine.winner = null; engine.time = 0;
  for (const [index, car] of engine.cars.entries()) {
    const p = trackPoint(currentS, index === 0 ? -18 : 22);
    const checkpoint = Math.floor(mod(currentS - TRACK.startDistance, TRACK.length) / TRACK.length * TRACK.checkpoints);
    Object.assign(car, { x: p.x, y: p.y, angle: p.angle, elevation: p.elevation, slope: p.slope,
      speed: 0, steer: 0, boosting: false, boost: 100, offroad: false, impact: 0, lap: 0,
      finished: false, finishTime: null, bestLap: null, lastLap: null, lapTime: 0,
      _started: true, _nextCheckpoint: checkpoint + 1,
      _lastTrackS: p.s, _lastX: p.x, _lastY: p.y, _lastCheckpointEligible: true,
      _lastCheckpointS: mod(TRACK.startDistance + checkpoint * TRACK.length / TRACK.checkpoints, TRACK.length),
      _lapStartTime: 0, missedCheckpoint: false, rescueCooldown: 0 });
    drivers[index].reset();
  }
  keys.clear(); renderer.resetCameras(engine);
}
function selectLocation() {
  const location = locations.find(location => location.id === $('location').value);
  jumpTo(location.s, location.world);
}
$('location').addEventListener('change', selectLocation);
for (const [id, direction] of [['previous', -1], ['next', 1]]) $(id).addEventListener('click', () => {
  $('location').selectedIndex = mod($('location').selectedIndex + direction, locations.length); selectLocation();
});
$('forward').addEventListener('click', () => jumpTo(currentS + 120, target));
$('back').addEventListener('click', () => jumpTo(currentS - 120, target));
$('driving').addEventListener('change', () => keys.clear());
window.addEventListener('keydown', event => {
  if (['INPUT', 'SELECT', 'BUTTON'].includes(event.target.tagName)) return;
  if (/^(Key[WASD]|Arrow|ShiftLeft|Enter)/.test(event.code)) { event.preventDefault(); keys.add(event.code); }
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
const updateCamera = renderer.updateCamera.bind(renderer);
renderer.updateCamera = (car, index, dt) => {
  updateCamera(car, index, dt);
  if ($('look-at').checked && target) renderer.cameras[index].lookAt(target.x, 55, target.y);
};

async function checkClearance() {
  if (validationRunning || clearanceRunning) return;
  clearanceRunning = true; $('verify-race').disabled = true;
  $('check').disabled = true; $('collision').textContent = '正在扫描全圈…';
  const failures = []; let samples = 0;
  const world = new ObstacleWorld(renderer.obstacles, { carRadius: TRACK.carRadius });
  for (let s = 0; s < TRACK.length; s += 20) {
    const narrow=TRACK.sections.some(section=>section.passage&&s>=section.start-60&&s<=section.end+80);
    for (const lane of narrow ? [0] : [-30, 0, 30]) {
      const p = trackPoint(s, lane), car = { ...p, speed: 0, height: TRACK.carHeight };
      const count = world.resolveCar(car); samples++;
      if (count) {
        const ids = [...world._candidates(p.x, p.y)].filter(index => {
          const test = { ...p, speed: 0, height: TRACK.carHeight };
          return new ObstacleWorld([world.obstacles[index]], { carRadius: TRACK.carRadius }).resolveCar(test) > 0;
        }).map(index => world.obstacles[index].id);
        failures.push({ s, lane, elevation: p.elevation, count, ids });
      }
    }
    if (samples % 300 === 0) { $('collision').textContent = `扫描 ${samples} 点，异常 ${failures.length}`; await new Promise(requestAnimationFrame); }
  }
  report = { generatedAt: new Date().toISOString(), track: TRACK.id, samples, failures,
    sceneObstacles: renderer.obstacles.length, sceneBuildMs: buildMs, geometry: renderer.cityGeometry?.stats || null };
  $('collision').textContent = `碰撞异常：${failures.length} / ${samples} 点`;
  $('collision').classList.toggle('error', failures.length > 0);
  $('report').textContent = JSON.stringify(report, null, 2); $('check').disabled = false;
  clearanceRunning = false; $('verify-race').disabled = false;
  return report;
}
$('check').addEventListener('click', checkClearance);

async function verifyRace() {
  if (validationRunning || clearanceRunning) return;
  validationRunning = true;
  const lockedControls = [...document.querySelectorAll('header button, header input, header select'), $('check'), $('verify-race')];
  const disabledBefore = lockedControls.map(control => control.disabled);
  lockedControls.forEach(control => { control.disabled = true; });
  $('driving').checked = false; $('ai').checked = false; keys.clear(); target = null;
  $('report').closest('details').open = true;
  $('collision').classList.remove('error');
  const wallStarted = performance.now(), fixedDt = 1 / 60, maximumFrames = 60 * 300;
  const originalResolve = engine.obstacleWorld.resolveCar;
  let frames = 0, staticContacts = 0, staticContactFrames = 0, contactsThisFrame = 0;
  const offroadFrames = [0, 0], impactFrames = [0, 0], firstStaticContacts = [];
  const snapshot = (state, error = null) => ({
    type: 'full-race-validation', state, track: TRACK.id, lapsRequested: 1,
    fixedStepSeconds: fixedDt, frames, simulatedSeconds: frames * fixedDt,
    raceTime: engine.time, wallSeconds: (performance.now() - wallStarted) / 1000,
    sceneObstacles: renderer.obstacles.length, staticContacts, staticContactFrames,
    offroad: offroadFrames.reduce((sum, value) => sum + value, 0),
    rescues: drivers.reduce((sum, driver) => sum + driver.rescues, 0),
    cars: engine.cars.map((car, index) => ({ id: car.id, finished: car.finished,
      time: car.finishTime, laps: car.lap, offroad: offroadFrames[index],
      rescues: drivers[index].rescues, impactFrames: impactFrames[index] })),
    firstStaticContacts,
    notes: 'Uses the complete CityRenderer obstacle set, production buses and real AI keyboard controls. Impact frames may include legal car-to-car contact. No leaderboard requests.',
    ...(error ? { error } : {}),
  });
  try {
    engine.laps = 1; engine.start(); drivers.forEach(driver => driver.reset()); renderer.resetCameras(engine);
    // Measure actual physics contacts without changing resolution or movement.
    engine.obstacleWorld.resolveCar = function (car, previousPosition) {
      const before = { x: car.x, y: car.y, s: car._lastTrackS };
      const count = originalResolve.call(this, car, previousPosition);
      staticContacts += count; contactsThisFrame += count;
      if (count && firstStaticContacts.length < 12) {
        firstStaticContacts.push({ frame: frames, carId: car.id, count, ...before });
      }
      return count;
    };
    while (frames < maximumFrames && engine.state !== 'finished') {
      const batchStarted = performance.now(); let batchFrames = 0;
      // Yield for rendering and accessibility updates at least every ~16ms of
      // simulation work. The independent animation loop never advances physics
      // while this deterministic validation owns the engine.
      do {
        contactsThisFrame = 0;
        const input = new Set(drivers.flatMap(driver => [...driver.update(engine, fixedDt)]));
        engine.step(fixedDt, input);
        if (contactsThisFrame) staticContactFrames++;
        engine.cars.forEach((car, index) => {
          offroadFrames[index] += car.offroad ? 1 : 0;
          impactFrames[index] += car.impact > 0 ? 1 : 0;
        });
        frames++; batchFrames++;
      } while (frames < maximumFrames && engine.state !== 'finished' && batchFrames < 180 && performance.now() - batchStarted < 16);
      currentS = engine.cars[0]._lastTrackS;
      report = snapshot('running');
      $('report').textContent = JSON.stringify(report, null, 2);
      $('collision').textContent = `完整比赛验证：${engine.time.toFixed(1)} 秒 · ${engine.cars.filter(car => car.finished).length}/2 完赛 · 静态接触 ${staticContacts}`;
      $('status').textContent = '正在用正式场景与碰撞验证双车完整比赛（固定 60 Hz）…';
      await new Promise(requestAnimationFrame);
    }
    report = snapshot(engine.state === 'finished' ? 'completed' : 'timed-out');
    report.passed = engine.cars.every(car => car.finished && car.lap === 1)
      && staticContacts === 0 && report.offroad === 0 && report.rescues === 0;
    report.generatedAt = new Date().toISOString();
    $('collision').textContent = `完整比赛${report.passed ? '通过' : '需检查'}：${engine.cars.filter(car => car.finished).length}/2 完赛 · 静态接触 ${staticContacts} · 越野 ${report.offroad} · 救援 ${report.rescues}`;
    $('collision').classList.toggle('error', !report.passed);
    $('status').textContent = report.passed ? '双车均已完成一圈，正式场景验证通过。' : '完整比赛验证发现问题，详见检查报告。';
  } catch (error) {
    report = { ...snapshot('error', error instanceof Error ? error.message : String(error)), passed: false };
    $('collision').textContent = '完整比赛验证出错，请查看报告'; $('collision').classList.add('error');
    $('status').textContent = '验证未完成，车辆已停止。';
  } finally {
    engine.obstacleWorld.resolveCar = originalResolve;
    validationRunning = false; keys.clear();
    lockedControls.forEach((control, index) => { control.disabled = disabledBefore[index]; });
    $('report').textContent = JSON.stringify(report, null, 2);
  }
  return report;
}
$('verify-race').addEventListener('click', verifyRace);
function download(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('export-obstacles').addEventListener('click', () => download('london-scene-obstacles.json', renderer.obstacles));
$('export-report').addEventListener('click', () => download('london-scene-check.json', report || { message: '先运行扫描' }));
let previous = performance.now(), lastInfo = 0, fps = 60;
function frame(now) {
  const dt = Math.min(.1, Math.max(0, (now - previous) / 1000)); previous = now;
  fps = fps * .95 + .05 / Math.max(dt, .001);
  if (!validationRunning && $('driving').checked) {
    const input = new Set(keys);
    if ($('ai').checked) for (const driver of drivers) for (const key of driver.update(engine, dt)) input.add(key);
    engine.step(dt, input); currentS = engine.cars[0]._lastTrackS;
  }
  renderer.render(engine, dt);
  if (now - lastInfo > 250) {
    const p = projectTrack(engine.cars[0].x, engine.cars[0].y, currentS);
    const street = TRACK.streets.find(street => p.s >= street.start && p.s <= street.end)?.name || '路口';
    $('position').textContent = `s=${p.s.toFixed(1)} / x=${p.x.toFixed(1)} / z=${p.y.toFixed(1)} / 高度=${p.elevation.toFixed(1)}`;
    $('street').textContent = `${street} · ${p.tunnel ? '隧道' : p.bridge ? '桥梁' : '地面'} · 坡度 ${(p.slope * 100).toFixed(1)}%`;
    $('performance').textContent = `${Math.round(fps)} FPS · ${renderer.gl.info.render.calls} draw calls · ${renderer.gl.info.render.triangles.toLocaleString()} triangles`;
    lastInfo = now;
  }
  requestAnimationFrame(frame);
}
selectLocation();
$('status').textContent = `免费手工场景 · ${Object.keys(renderer.frontages?.stats||{}).length ? renderer.frontages.stats.buildings.toLocaleString() : ''} 栋开放地图建筑 · 实际比赛使用同一场景`;
window.sceneTest = { engine, renderer, jumpTo, checkClearance, verifyRace, locations,
  get report() { return report; }, get validationRunning() { return validationRunning; } };
requestAnimationFrame(frame);
