import { RaceEngine, TRACK, trackPoint, projectTrack, mod } from './engine.js';
import { RaceRenderer, sceneWeights } from './renderer.js';
import { CityRenderer } from './city-renderer.js';
import { RaceAI } from './ai.js';
import { LeaderboardClient } from './leaderboard-client.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const hud = $('hud');
const ctx = hud.getContext('2d');
const engine = new RaceEngine();
let renderer;
const renderers = {};
let selectedCity = new URLSearchParams(globalThis.location?.search || '').get('city') === 'coast' ? 'coast' : 'london';
const keys = new Set();
const ai = new RaceAI();
const leaderboard = new LeaderboardClient({ document, onOpen: () => keys.clear() });

const colors = ['#51dfe5', '#ff9870'];
const names = ['青色闪电', '橙色风暴'];
let selectedLaps = 3, selectedMode = 'local', raceMode = 'local', lastAIRescues = 0;
let lastTime = performance.now(), lastState = '', lastCount = 0;
let goUntil = 0, soundEnabled = false, audio = null, audioNodes = [];
let lastLaps = [0, 0], notices = ['', ''], noticeUntil = [0, 0], toastTime = 0;
const tau = Math.PI * 2;
const fmt = value => {
  const centiseconds = Math.round(Math.max(0, value || 0) * 100);
  return `${String(Math.floor(centiseconds / 6000)).padStart(2, '0')}:${((centiseconds % 6000) / 100).toFixed(2).padStart(5, '0')}`;
};
function rounded(c, x, y, w, h, r, color) {
  c.fillStyle = color;
  c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
}
function trackPath(c) {
  c.beginPath();
  for (let s = 0; s < TRACK.length; s += 20) {
    const p = trackPoint(s);
    if (s === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
  }
  c.closePath();
}
function drawMiniMap(c, x, y, playerId) {
  c.save(); c.translate(x, y);
  rounded(c, -8, -9, 162, 108, 8, '#101b25d9');
  const scale = Math.min(144 / TRACK.width, 87 / TRACK.height);
  const cityScale = TRACK.id === 'london' ? 2.7 : 1;
  c.translate((146 - TRACK.width * scale) / 2, 0);
  c.scale(scale, scale);
  trackPath(c); c.strokeStyle = '#aec0cd33'; c.lineWidth = TRACK.roadWidth; c.stroke();
  trackPath(c); c.strokeStyle = '#c1d4de99'; c.lineWidth = 22 * cityScale; c.stroke();
  const a = trackPoint(TRACK.startDistance, -60), b = trackPoint(TRACK.startDistance, 60);
  c.strokeStyle = '#f5ecc8'; c.lineWidth = 36 * cityScale;
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  for (const car of engine.cars) {
    c.beginPath(); c.arc(car.x, car.y, (car.id === playerId ? 48 : 35) * cityScale, 0, tau);
    c.fillStyle = colors[car.id - 1]; c.fill();
    if (car.id === playerId) { c.lineWidth = 15; c.strokeStyle = '#ffffff'; c.stroke(); }
  }
  c.restore();
}
function drawHUD(now) {
  ctx.setTransform(hud.width / 1200, 0, 0, hud.height / 700, 0, 0);
  ctx.clearRect(0, 0, 1200, 700);
  for (const [i, car] of engine.cars.entries()) {
    const x = i * 600;
    drawMiniMap(ctx, x + 418, 577, car.id);
    if (notices[i] && toastTime < noticeUntil[i] && engine.state === 'racing') {
      rounded(ctx, x + 163, 120, 274, 38, 7, '#10222ddd');
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = colors[i];
      ctx.fillText(notices[i], x + 300, 144);
    }
    const p = projectTrack(car.x, car.y);
    const headingError = Math.abs(mod(car.angle - p.angle + Math.PI, tau) - Math.PI);
    if (engine.state === 'racing' && !car.finished && !car.offroad && Math.abs(car.speed) > 50 && headingError > Math.PI * .65) {
      rounded(ctx, x + 231, 76, 138, 29, 6, '#302715d9');
      ctx.fillStyle = '#ffd08b'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('↶  逆向行驶', x + 300, 95);
    }
    if (engine.state === 'racing' && !car.finished) {
      const ahead = trackPoint(p.s + Math.max(110, Math.abs(car.speed) * .58));
      const curve = ahead.curvature || 0;
      let cue = '↑  直道 · 氮气时机';
      if (Math.abs(curve) > .0001) cue = curve > 0 ? '↱  前方右弯 · 松油减速' : '↰  前方左弯 · 松油减速';
      if ((TRACK.sections || []).some(section => section.passage && p.s >= section.start - 280 && p.s <= section.end + 70)) cue = '⇥  窄拱门 · 居中减速通过';
      rounded(ctx, x + 20, 61, 178, 29, 5, '#14212abb');
      ctx.font = '10px sans-serif'; ctx.fillStyle = '#e4e8dc'; ctx.textAlign = 'left';
      ctx.fillText(cue, x + 30, 80);
    }
    const region = Object.entries(sceneWeights(car.x, car.y)).sort((a, b) => b[1] - a[1])[0][0];
    const street = TRACK.streets?.find(street => p.s >= street.start && p.s < street.end);
    const sceneName = TRACK.id === 'london' ? (street?.name || 'London') : {coast:'海岸港湾', alpine:'松林山谷', city:'霓虹城区'}[region];
    $('scene' + car.id).textContent = sceneName;
  }
  ctx.fillStyle = '#101921'; ctx.fillRect(597, 0, 6, 700);
  ctx.fillStyle = '#b2c6d250'; ctx.fillRect(599, 0, 2, 700);
  rounded(ctx, 585, 20, 30, 30, 15, '#172632');
  ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#bacada'; ctx.fillText('VS', 600, 38);
  $('graphics-note').classList.toggle('hidden', renderer.available);
  $('start').disabled = !renderer.available; $('again').disabled = !renderer.available;
}
function updateRaceNotices() {
  for (const [i, car] of engine.cars.entries()) {
    if (car.lap > lastLaps[i]) {
      notices[i] = `第 ${car.lap} 圈完成 · ${fmt(car.lastLap)}`;
      noticeUntil[i] = toastTime + 3; lastLaps[i] = car.lap; tone(660 + i * 110, .11, .045);
    }
  }
}
function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(canvas.clientWidth * ratio), height = Math.round(canvas.clientHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  if (hud.width !== width || hud.height !== height) { hud.width = width; hud.height = height; }
}
new ResizeObserver(resize).observe(canvas);
function selectCity(city, initial = false) {
  if (!initial && engine.state !== 'menu') return;
  selectedCity = city === 'coast' ? 'coast' : 'london';
  engine.selectTrack(selectedCity);
  if (!renderers[selectedCity]) renderers[selectedCity] = selectedCity === 'london'
    ? new CityRenderer($('city-game')) : new RaceRenderer(canvas, { sceneUrls: globalThis.TWIN_SCENE_ART });
  renderer = renderers[selectedCity]; engine.setObstacles(renderer.obstacles || []); renderer.resetCameras(engine);
  ai.reset(); keys.clear(); const london = selectedCity === 'london';
  canvas.classList.toggle('city-active', london); $('city-game').classList.toggle('hidden', !london);
  document.body.classList.toggle('london-route', london);
  $('track-english').textContent = london ? '01 / LONDON GRAND PRIX' : '02 / COASTLINE GRAND PRIX';
  $('track-title').textContent = london ? '伦敦 · 王宫与泰晤士' : '海岸技术环线';
  $('route-eyebrow').textContent = london ? 'A ROYAL START. A WEST END ENCORE.' : 'COAST. MOUNTAINS. NEON.';
  $('route-title').textContent = london ? '下一站，伦敦。' : '沿着风景，一路较量。';
  $('route-description').textContent = london ? '沿青绿色路沿，从白金汉宫穿过中国城与西区，经大本钟返回。一圈约 3 分钟。' : '一圈约 40–60 秒。长直道、连续 S 弯和发夹弯，穿越三种风景。';
  $('city-detail').textContent = london ? '6.96 公里真实路网 · 从白金汉宫，跑进伦敦。' : '海岸技术环线 · 港湾、松林与城市';
  $('london-guide').classList.toggle('hidden', !london); $('board-city').value = selectedCity;
  document.querySelectorAll('[data-city]').forEach(button=>{const chosen=button.dataset.city===selectedCity;button.classList.toggle('selected',chosen);button.setAttribute('aria-pressed',String(chosen));});
  if (leaderboard.setCity) void leaderboard.setCity(selectedCity);
}
selectCity(selectedCity, true);
void leaderboard.init();
document.querySelectorAll('[data-city]').forEach(button=>button.addEventListener('click',()=>selectCity(button.dataset.city)));
$('board-city').addEventListener('change',()=>{if(leaderboard.setCity)void leaderboard.setCity($('board-city').value);});

function updateUI(now) {
  $('timer').textContent=fmt(engine.time);
  const statuses={menu:'等待发车',countdown:'准备出发',racing:'比赛进行中',paused:'比赛已暂停',finished:'比赛结束'};
  const finishers = engine.cars.filter(car => car.finished).sort((a, b) => a.finishTime - b.finishTime
    || (a === engine.winner ? -1 : b === engine.winner ? 1 : a.id - b.id));
  $('race-status').textContent=engine.state==='racing' && finishers.length ? '等待另一位完赛' : statuses[engine.state];
  for(const [i,car] of engine.cars.entries()) {
    const place = finishers.indexOf(car) + 1;
    $('lap'+car.id).textContent=car.lap;
    $('boost'+car.id).style.width=car.boost+'%';$('boost-label'+car.id).textContent=Math.round(car.boost)+'%';
    $('speed'+car.id).textContent=Math.round(Math.abs(car.speed)*(TRACK.unitsPerMeter ? 3.6/TRACK.unitsPerMeter : .66));
    $('offroad'+car.id).textContent=car.finished?`第 ${place} 名 · 已完赛`:car.rescueCooldown>0?'返回赛道 · 罚停中':car.missedCheckpoint?`漏过检查点 · 按 ${i===0?'Q':'/'} 回赛道`:car.impact>.15?'碰撞 · 减速':car.offroad?'草地减速':car.boosting?'NITRO ON':'';
    $('finisher'+car.id).classList.toggle('hidden', !car.finished || engine.state !== 'racing');
    if (car.finished) {
      $('finisher-place'+car.id).textContent=`第 ${place} 名 · 已完赛`;
      $('finisher-time'+car.id).textContent=fmt(car.finishTime);
    }
  }
  if(engine.state!==lastState){
    document.querySelectorAll('[data-city]').forEach(button=>button.disabled=engine.state!=='menu');
    $('menu').classList.toggle('hidden',engine.state!=='menu');$('pause-panel').classList.toggle('hidden',engine.state!=='paused');$('result').classList.toggle('hidden',engine.state!=='finished');
    $('pause').disabled=!['racing','countdown','paused'].includes(engine.state);$('pause').innerHTML=engine.state==='paused'?'继续 <kbd>Esc</kbd>':'暂停 <kbd>Esc</kbd>';
    document.body.classList.toggle('racing',engine.state==='racing');
    $('arena-tag-text').textContent=engine.state==='racing'?'LIVE / CHASE CAM':'CHASE CAM / P1';
    if(engine.state==='racing' && lastState==='countdown'){goUntil=now+1;tone(880,.2,.08);}
    if(engine.state==='finished'){
      const winner=engine.winner;
      $('winner-name').textContent=names[winner.id-1]+'获胜！';
      $('winner-name').style.color=colors[winner.id-1];
      $('result-subtitle').textContent=`两位车手均已完成 ${engine.laps} 圈`;
      finishers.forEach((car, index) => {
        const suffix = index === 0 ? '' : '2';
        $('result-driver'+(index+1)).textContent=names[car.id-1];
        $('result-driver'+(index+1)).style.color=colors[car.id-1];
        $('finish-time'+suffix).textContent=fmt(car.finishTime);
        $('best-lap'+suffix).textContent=car.bestLap===null?'—':fmt(car.bestLap);
      });
      keys.clear();tone(523,.2,.06);setTimeout(()=>tone(659,.2,.06),140);setTimeout(()=>tone(784,.35,.06),280);
      if (finishers.length === engine.cars.length) {
        const results = finishers.filter(car => Number.isFinite(car.finishTime) && !(raceMode === 'ai' && car.id === 2))
          .map(car => ({ finished: true, laps: engine.laps, timeMs: Math.round(car.finishTime * 1000), playerId: car.id, mode: raceMode, city: TRACK.id }));
        void leaderboard.considerResults(results);
      }
    }
    lastState=engine.state;
  }
  const counting=engine.state==='countdown',showGo=engine.state==='racing'&&now<goUntil;
  $('countdown').classList.toggle('hidden',!counting&&!showGo);
  if(counting){const count=Math.max(1,Math.ceil(engine.countdown));if($('countdown').firstElementChild.textContent!==String(count))$('countdown').firstElementChild.textContent=count;$('countdown').lastElementChild.textContent='READY TO RACE';if(count!==lastCount){lastCount=count;tone(440,.09,.05);}}
  else if(showGo){if($('countdown').firstElementChild.textContent!=='GO!')$('countdown').firstElementChild.textContent='GO!';$('countdown').lastElementChild.textContent='全油门出发';}
}

function initAudio(){if(audio)return;const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;audio=new Audio();for(let i=0;i<2;i++){const oscillator=audio.createOscillator(),filter=audio.createBiquadFilter(),gain=audio.createGain();oscillator.type='sawtooth';filter.type='lowpass';filter.frequency.value=360;gain.gain.value=0;oscillator.connect(filter);filter.connect(gain);gain.connect(audio.destination);oscillator.start();audioNodes.push({oscillator,gain,filter});}}
function tone(frequency,length,volume){if(!soundEnabled||!audio)return;const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+length);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+length);}
function updateAudio(){if(!audio)return;audioNodes.forEach((node,i)=>{const car=engine.cars[i];node.oscillator.frequency.setTargetAtTime(36+Math.abs(car.speed)*.24+(car.boosting?15:0),audio.currentTime,.12);node.filter.frequency.setTargetAtTime(160+Math.abs(car.speed)*1.3,audio.currentTime,.15);node.gain.gain.setTargetAtTime(soundEnabled&&engine.state==='racing'?.012+Math.abs(car.speed)*.00005:0,audio.currentTime,.08);});}
function begin(){if($('help-dialog').open||leaderboard.busyDialog||!renderer.available)return;leaderboard.newRace();raceMode=selectedMode;engine.start(selectedLaps);ai.reset();lastAIRescues=0;keys.clear();lastLaps=[0,0];notices=['',''];lastCount=0;renderer.resetCameras(engine);goUntil=0;canvas.focus({preventScroll:true});if(soundEnabled){initAudio();audio?.resume();}}
function togglePause(){
  if (engine.state === 'paused') {
    engine.resume();
    canvas.focus({preventScroll:true});
  } else engine.pause();
  keys.clear();
}
function rescue(id){if(engine.cars[id-1].finished)return;engine.rescue(id);renderer.resetCameras(engine,id);notices[id-1]='返回赛道 · 罚停 2 秒';noticeUntil[id-1]=toastTime+2.2;}
$('start').addEventListener('click',begin);$('again').addEventListener('click',begin);$('restart').addEventListener('click',begin);
$('resume').addEventListener('click',()=>{keys.clear();engine.resume();canvas.focus({preventScroll:true});});$('pause').addEventListener('click',togglePause);
function returnToMenu(){leaderboard.newRace();engine.reset();ai.reset();lastAIRescues=0;keys.clear();renderer.resetCameras(engine);}
$('back-menu').addEventListener('click',returnToMenu);
$('pause-menu').addEventListener('click',returnToMenu);
document.querySelectorAll('[data-laps]').forEach(button=>button.addEventListener('click',()=>{selectedLaps=Number(button.dataset.laps);document.querySelectorAll('[data-laps]').forEach(b=>{const selected=b===button;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});document.querySelectorAll('.total-laps').forEach(el=>el.textContent=selectedLaps);}));
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  if (engine.state !== 'menu') return;
  selectedMode = button.dataset.mode === 'ai' ? 'ai' : 'local';
  const solo = selectedMode === 'ai';
  names[1] = solo ? 'AI · 橙色风暴' : '橙色风暴';
  $('player2-name').textContent = names[1]; $('control-player2-name').textContent = names[1];
  $('player2-label').textContent = solo ? 'AI DRIVER' : 'PLAYER 02';
  $('control-player2-chip').textContent = solo ? 'AI' : 'P2';
  $('mode-label').textContent = solo ? '单人挑战 AI' : '双人分屏';
  $('mode-english').textContent = solo ? 'SINGLE PLAYER' : 'LOCAL MULTIPLAYER';
  $('mode-description').textContent = solo ? '你驾驶青色赛车，用 WASD 挑战 AI。' : '与身边的朋友，共用一块键盘。';
  $('player2-controls').classList.toggle('hidden', solo); $('ai-control-note').classList.toggle('hidden', !solo);
  $('help-mode-description').textContent = solo
    ? '你驾驶左侧青色赛车，使用 WASD、左 Shift 和 Q；右侧橙色赛车由 AI 驾驶。两车遵循相同物理和赛道规则，先完成全部圈数获胜，双方完赛后结算。'
    : '两位玩家共用键盘，各占半个屏幕，使用斜后方 3D 镜头跟随自己的赛车。先完成全部圈数的玩家获胜；另一位可继续跑完，双方完赛后一起结算。';
  document.querySelectorAll('[data-mode]').forEach(item => {
    const selected = item.dataset.mode === selectedMode;
    item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected));
  });
}));
$('sound').addEventListener('click',()=>{soundEnabled=!soundEnabled;$('sound').setAttribute('aria-pressed',String(soundEnabled));$('sound').title=soundEnabled?'关闭声音':'开启声音';$('sound').querySelector('span').textContent=soundEnabled?'声音开':'声音关';$('sound').querySelector('path').setAttribute('d',soundEnabled?'M11 5 6 9H3v6h3l5 4V5Zm5 3c2 2 2 6 0 8m3-11c4 4 4 10 0 14':'M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6');if(soundEnabled){initAudio();audio?.resume();tone(600,.08,.04);}if(['racing','countdown'].includes(engine.state))canvas.focus({preventScroll:true});});
$('help').addEventListener('click',()=>{engine.pause();keys.clear();$('help-dialog').showModal();});
$('close-help').addEventListener('click',()=>$('help-dialog').close());$('help-done').addEventListener('click',()=>$('help-dialog').close());
$('help-dialog').addEventListener('click',event=>{if(event.target===$('help-dialog')){const r=$('help-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('help-dialog').close();}});
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('race-stage').requestFullscreen();
    resize();
    canvas.focus({preventScroll: true});
  } catch { $('fullscreen').title = '请使用浏览器的全屏功能'; }
}
$('fullscreen').addEventListener('click', toggleFullscreen);
$('fullscreen-exit').addEventListener('click', toggleFullscreen);
const controlKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Space','Escape','KeyQ','Slash']);
const player2Keys = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Slash']);
function typingTarget(event) {
  return event.isComposing || event.keyCode === 229
    || event.target?.closest?.('input, textarea, select, [contenteditable]');
}
function nativeActivation(event) {
  return ['Enter', 'Space'].includes(event.code)
    && event.target?.closest?.('button, a, input, select, textarea, [contenteditable]');
}
window.addEventListener('keydown',event=>{
  if(event.metaKey||event.ctrlKey||event.altKey)return;
  if($('help-dialog').open || leaderboard.busyDialog || typingTarget(event))return;
  if(nativeActivation(event))return;
  if(controlKeys.has(event.code))event.preventDefault();
  if(raceMode==='ai' && player2Keys.has(event.code))return;
  if(event.code==='Escape'&&!event.repeat){togglePause();return;}
  if(event.code==='Space'&&!event.repeat){if(engine.state==='menu'||engine.state==='finished')begin();else togglePause();return;}
  if(event.code==='KeyQ'&&!event.repeat&&engine.state==='racing'){rescue(1);return;}if(event.code==='Slash'&&!event.repeat&&engine.state==='racing'){rescue(2);return;}
  if (['racing', 'countdown'].includes(engine.state) && controlKeys.has(event.code)) keys.add(event.code);
});
window.addEventListener('keyup',event=>{keys.delete(event.code);if(controlKeys.has(event.code)&&!$('help-dialog').open&&!leaderboard.busyDialog&&!typingTarget(event)&&!nativeActivation(event))event.preventDefault();});
window.addEventListener('blur',()=>{keys.clear();engine.pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();engine.pause();}});
function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, .05);
  lastTime = timestamp;
  const now = timestamp / 1000;
  toastTime += engine.state === 'racing' ? dt : 0;
  if (!renderer.available) { keys.clear(); engine.pause(); }
  let frameKeys = keys;
  if (raceMode === 'ai' && engine.state === 'racing') {
    frameKeys = new Set([...keys].filter(code => !player2Keys.has(code)));
    for (const code of ai.update(engine, dt)) if (player2Keys.has(code) && code !== 'Slash') frameKeys.add(code);
    if (ai.rescues > lastAIRescues) { renderer.resetCameras(engine, 2); lastAIRescues = ai.rescues; }
  }
  engine.step(dt, frameKeys);
  updateRaceNotices();
  renderer.render(engine, dt, now);
  drawHUD(now);
  updateUI(now);
  updateAudio();
  requestAnimationFrame(loop);
}
resize();requestAnimationFrame(loop);
