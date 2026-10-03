import { RaceEngine, TRACK, trackPoint, projectTrack, mod } from './engine.js';
import { RaceRenderer, sceneWeights } from './renderer.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const hud = $('hud');
const ctx = hud.getContext('2d');
const engine = new RaceEngine();
const renderer = new RaceRenderer(canvas, { sceneUrls: globalThis.TWIN_SCENE_ART });
engine.setObstacles(renderer.obstacles || []);
const keys = new Set();
const colors = ['#51dfe5', '#ff9870'];
const names = ['青色闪电', '橙色风暴'];
let selectedLaps = 3, lastTime = performance.now(), lastState = '', lastCount = 0;
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
  c.translate((146 - TRACK.width * scale) / 2, 0);
  c.scale(scale, scale);
  trackPath(c); c.strokeStyle = '#aec0cd33'; c.lineWidth = TRACK.roadWidth; c.stroke();
  trackPath(c); c.strokeStyle = '#c1d4de99'; c.lineWidth = 22; c.stroke();
  const a = trackPoint(TRACK.startDistance, -60), b = trackPoint(TRACK.startDistance, 60);
  c.strokeStyle = '#f5ecc8'; c.lineWidth = 36;
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  for (const car of engine.cars) {
    c.beginPath(); c.arc(car.x, car.y, car.id === playerId ? 48 : 35, 0, tau);
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
    if (engine.state === 'racing' && !car.offroad && Math.abs(car.speed) > 50 && headingError > Math.PI * .65) {
      rounded(ctx, x + 231, 76, 138, 29, 6, '#302715d9');
      ctx.fillStyle = '#ffd08b'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('↶  逆向行驶', x + 300, 95);
    }
    if (engine.state === 'racing') {
      const ahead = trackPoint(p.s + Math.max(110, Math.abs(car.speed) * .58));
      const curve = ahead.curvature || 0;
      let cue = '↑  直道 · 氮气时机';
      if (Math.abs(curve) > .0001) cue = curve > 0 ? '↱  前方右弯 · 松油减速' : '↰  前方左弯 · 松油减速';
      rounded(ctx, x + 20, 61, 178, 29, 5, '#14212abb');
      ctx.font = '10px sans-serif'; ctx.fillStyle = '#e4e8dc'; ctx.textAlign = 'left';
      ctx.fillText(cue, x + 30, 80);
    }
    const region = Object.entries(sceneWeights(car.x, car.y)).sort((a, b) => b[1] - a[1])[0][0];
    const sceneName = {coast:'海岸港湾', alpine:'松林山谷', city:'霓虹城区'}[region];
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
renderer.resetCameras(engine);

function updateUI(now) {
  $('timer').textContent=fmt(engine.time);
  const statuses={menu:'等待发车',countdown:'准备出发',racing:'比赛进行中',paused:'比赛已暂停',finished:'比赛结束'};
  $('race-status').textContent=statuses[engine.state];
  for(const [i,car] of engine.cars.entries()) {
    $('lap'+car.id).textContent=car.lap;
    $('boost'+car.id).style.width=car.boost+'%';$('boost-label'+car.id).textContent=Math.round(car.boost)+'%';
    $('speed'+car.id).textContent=Math.round(Math.abs(car.speed)*.66);
    $('offroad'+car.id).textContent=car.rescueCooldown>0?'返回赛道 · 罚停中':car.missedCheckpoint?`漏过检查点 · 按 ${i===0?'Q':'/'} 回赛道`:car.impact>.15?'碰撞 · 减速':car.offroad?'草地减速':car.boosting?'NITRO ON':'';
  }
  if(engine.state!==lastState){
    $('menu').classList.toggle('hidden',engine.state!=='menu');$('pause-panel').classList.toggle('hidden',engine.state!=='paused');$('result').classList.toggle('hidden',engine.state!=='finished');
    $('pause').disabled=!['racing','countdown','paused'].includes(engine.state);$('pause').innerHTML=engine.state==='paused'?'继续 <kbd>Esc</kbd>':'暂停 <kbd>Esc</kbd>';
    document.body.classList.toggle('racing',engine.state==='racing');
    $('arena-tag-text').textContent=engine.state==='racing'?'LIVE / CHASE CAM':'CHASE CAM / P1';
    if(engine.state==='racing' && lastState==='countdown'){goUntil=now+1;tone(880,.2,.08);}
    if(engine.state==='finished'){
      const winner=engine.winner;$('winner-name').textContent=names[winner.id-1]+'获胜！';$('winner-name').style.color=colors[winner.id-1];$('result-subtitle').textContent=`PLAYER 0${winner.id} · 率先完成 ${engine.laps} 圈`;$('finish-time').textContent=fmt(winner.finishTime);$('best-lap').textContent=winner.bestLap===null?'—':fmt(winner.bestLap);keys.clear();tone(523,.2,.06);setTimeout(()=>tone(659,.2,.06),140);setTimeout(()=>tone(784,.35,.06),280);
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
function begin(){if($('help-dialog').open||!renderer.available)return;engine.start(selectedLaps);keys.clear();lastLaps=[0,0];notices=['',''];lastCount=0;renderer.resetCameras(engine);goUntil=0;canvas.focus({preventScroll:true});if(soundEnabled){initAudio();audio?.resume();}}
function togglePause(){
  if (engine.state === 'paused') {
    engine.resume();
    canvas.focus({preventScroll:true});
  } else engine.pause();
  keys.clear();
}
function rescue(id){engine.rescue(id);renderer.resetCameras(engine,id);notices[id-1]='返回赛道 · 罚停 2 秒';noticeUntil[id-1]=toastTime+2.2;}
$('start').addEventListener('click',begin);$('again').addEventListener('click',begin);$('restart').addEventListener('click',begin);
$('resume').addEventListener('click',()=>{keys.clear();engine.resume();canvas.focus({preventScroll:true});});$('pause').addEventListener('click',togglePause);
$('back-menu').addEventListener('click',()=>{engine.reset();keys.clear();renderer.resetCameras(engine);});
document.querySelectorAll('[data-laps]').forEach(button=>button.addEventListener('click',()=>{selectedLaps=Number(button.dataset.laps);document.querySelectorAll('[data-laps]').forEach(b=>{const selected=b===button;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});document.querySelectorAll('.total-laps').forEach(el=>el.textContent=selectedLaps);}));
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
function nativeActivation(event) {
  return ['Enter', 'Space'].includes(event.code)
    && event.target?.closest?.('button, a, input, select, textarea, [contenteditable]');
}
window.addEventListener('keydown',event=>{
  if(event.metaKey||event.ctrlKey||event.altKey)return;
  if($('help-dialog').open)return;
  if(nativeActivation(event))return;
  if(controlKeys.has(event.code))event.preventDefault();
  if(event.code==='Escape'&&!event.repeat){togglePause();return;}
  if(event.code==='Space'&&!event.repeat){if(engine.state==='menu'||engine.state==='finished')begin();else togglePause();return;}
  if(event.code==='KeyQ'&&!event.repeat&&engine.state==='racing'){rescue(1);return;}if(event.code==='Slash'&&!event.repeat&&engine.state==='racing'){rescue(2);return;}
  if (['racing', 'countdown'].includes(engine.state) && controlKeys.has(event.code)) keys.add(event.code);
});
window.addEventListener('keyup',event=>{keys.delete(event.code);if(controlKeys.has(event.code)&&!$('help-dialog').open&&!nativeActivation(event))event.preventDefault();});
window.addEventListener('blur',()=>{keys.clear();engine.pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();engine.pause();}});
function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, .05);
  lastTime = timestamp;
  const now = timestamp / 1000;
  toastTime += engine.state === 'racing' ? dt : 0;
  if (!renderer.available) { keys.clear(); engine.pause(); }
  engine.step(dt, keys);
  updateRaceNotices();
  renderer.render(engine, dt, now);
  drawHUD(now);
  updateUI(now);
  updateAudio();
  requestAnimationFrame(loop);
}
resize();requestAnimationFrame(loop);
