import { ControlBindings, ACTION_LABELS } from './controls.js';
import { createI18n } from './i18n.js';
import { SplitTiming } from './split-timing.js';
import { GhostClient } from './ghost-client.js';
import { GhostRecorder, sampleReplay } from './ghost-replay.js';
import { RaceEngine, TRACK, TRACKS, trackPoint, projectTrack, mod } from './engine.js';
import { RaceRenderer, sceneWeights } from './renderer.js';
import { RaceAI } from './ai.js';
import { UnifiedRecordsClient } from './unified-records.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const hud = $('hud');
const ctx = hud.getContext('2d');
const engine = new RaceEngine();
let renderer;
const keys = new Set();
let controlStorage; try { controlStorage = window.localStorage; } catch {}
const bindings = new ControlBindings(controlStorage);
const i18n = createI18n({ document, storage: controlStorage, onChange: () => refreshTrackUI() });
let bindingCapture = null;
const ai = new RaceAI();
const leaderboard = new UnifiedRecordsClient({ document, onSaved: () => {
  if (engine.state === 'finished') returnToMenu();
}, onChallenge: async entry => {
  if (ghostClient.locked) return;
  if (engine.state === 'finished') returnToMenu();
  if (!['menu','finished'].includes(engine.state)) return;
  if (entry.city && entry.city !== TRACK.id) selectCircuit(entry.city);
  selectLaps(entry.kind === 'race' ? 3 : 1);
  openRaceSetup();
  await ghostClient.challenge(entry);
} });

const ghostClient = new GhostClient({ document, recordsManaged: true, onSelection: selections => {
  if (['menu','finished'].includes(engine.state)) $('ghost-race-label').textContent = selections.length
    ? selections.map(ghost => `${ghost.colorLabel}幽灵 · 「${ghost.entry.name}」`).join('  /  ') : '';
} });
const ghostRecorder = new GhostRecorder();
const splitTiming = new SplitTiming();
let activeGhosts = [];
void ghostClient.init();

const colors = ['#51dfe5', '#ff9870'];
const names = ['青色闪电', '橙色风暴'];
let selectedLaps = 1, selectedMode = 'ai', raceMode = 'local', lastAIRescues = 0;
let selectedColor = 'cyan';
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
  const cityScale = 1;
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
  const solo=selectedMode==='ai', viewWidth=solo?1200:600;
  for (const [i, car] of engine.cars.slice(0,solo?1:2).entries()) {
    const x = i * 600, center=x+viewWidth/2;
    drawMiniMap(ctx, x + viewWidth - 182, 577, car.id);
    if (notices[i] && toastTime < noticeUntil[i] && engine.state === 'racing') {
      rounded(ctx, center - 137, 120, 274, 38, 7, '#10222ddd');
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = colors[i];
      ctx.fillText(i18n.t(notices[i]), center, 144);
    }
    const p = projectTrack(car.x, car.y, car._lastTrackS, car.elevation);
    const headingError = Math.abs(mod(car.angle - p.angle + Math.PI, tau) - Math.PI);
    if (engine.state === 'racing' && !car.finished && !car.offroad && Math.abs(car.speed) > 50 && headingError > Math.PI * .65) {
      rounded(ctx, center - 69, 76, 138, 29, 6, '#302715d9');
      ctx.fillStyle = '#ffd08b'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(i18n.t('↶  逆向行驶'), center, 95);
    }
    if (engine.state === 'racing' && !car.finished) {
      const ahead = trackPoint(p.s + Math.max(110, Math.abs(car.speed) * .58));
      const curve = ahead.curvature || 0;
      let cue = '↑  直道 · 氮气时机';
      if (Math.abs(curve) > .0001) cue = curve > 0 ? '↱  前方右弯 · 松油减速' : '↰  前方左弯 · 松油减速';
      if ((TRACK.sections || []).some(section => section.passage && p.s >= section.start - 280 && p.s <= section.end + 70)) cue = '⇥  窄拱门 · 居中减速通过';
      rounded(ctx, x + 20, 61, 178, 29, 5, '#14212abb');
      ctx.font = '10px sans-serif'; ctx.fillStyle = '#e4e8dc'; ctx.textAlign = 'left';
      ctx.fillText(i18n.t(cue), x + 30, 80);
    }
    const region = Object.entries(sceneWeights(car.x, car.y)).sort((a, b) => b[1] - a[1])[0][0];
    const street = TRACK.streets?.find(street => p.s >= street.start && p.s < street.end);
    const sceneName = {coast:'海岸港湾', alpine:'松林山谷', city:'霓虹城区'}[region];
    $('scene' + car.id).textContent = i18n.t(TRACK.themeName || sceneName);
  }
  if(!solo){
  ctx.fillStyle = '#101921'; ctx.fillRect(597, 0, 6, 700);
  ctx.fillStyle = '#b2c6d250'; ctx.fillRect(599, 0, 2, 700);
  rounded(ctx, 585, 20, 30, 30, 15, '#172632');
  ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#bacada'; ctx.fillText('VS', 600, 38);
  }
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
// Start on compact London; retired prototype links do not change the selection.
engine.selectTrack('coast-london');
ghostClient.setTrack(TRACK.id);
renderer = new RaceRenderer(canvas, { sceneUrls: globalThis.TWIN_SCENE_ART });
engine.setObstacles(renderer.obstacles || []);
renderer.resetCameras(engine);
ai.reset();
keys.clear();
void leaderboard.init(TRACK.id);

function trackName(track = TRACK) {
  return i18n.language === 'en' ? (track.nameEn || 'Coastline Grand Prix') : track.name;
}
const trackCards = new Map();
function circuitOutline(track) {
  const points=[];
  for(const seg of track.segments) {
    const steps=Math.max(2,Math.ceil(seg.length/45));
    for(let i=0;i<steps;i++) {
      const u=i/steps,angle=seg.startAngle+seg.direction*seg.length*u/seg.radius;
      points.push(seg.kind==='line'?[seg.x1+(seg.x2-seg.x1)*u,seg.y1+(seg.y2-seg.y1)*u]
        :[seg.cx+Math.cos(angle)*seg.radius,seg.cy+Math.sin(angle)*seg.radius]);
    }
  }
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys);
  return {viewBox:`${minX-150} ${minY-150} ${Math.max(...xs)-minX+300} ${Math.max(...ys)-minY+300}`,
    path:points.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')+' Z'};
}
function refreshTrackUI() {
  $('map-count').textContent=`${String(Object.keys(TRACKS).length).padStart(2,'0')} CIRCUITS`;
  for(const [id,card]of trackCards) {
    const active=id===TRACK.id;card.label.textContent=trackName(TRACKS[id]);card.button.setAttribute('aria-label',trackName(TRACKS[id]));
    card.button.classList.toggle('selected',active);card.button.setAttribute('aria-pressed',String(active));
  }
  for(const option of $('records-track-choice').children) option.textContent=trackName(TRACKS[option.value]);
  $('records-track-choice').value=leaderboard.city;
  const name=trackName();
  $('track-title').textContent=name;
  $('track-english').textContent=`${String(Object.keys(TRACKS).indexOf(TRACK.id)+1).padStart(2,'0')} / ${(TRACK.nameEn||'COASTLINE GRAND PRIX').toUpperCase()}`;
  $('route-description').textContent=i18n.language==='en'
    ?TRACK.descriptionEn||'Coast, pines and neon. Fast straights, flowing S bends and a hairpin.'
    :TRACK.description||'长直道、连续 S 弯和发夹弯，穿越海岸、松林与霓虹城区。';
  $('route-title').textContent=TRACK.id==='coast'?(i18n.language==='en'?'Race through the scenery.':'沿着风景，一路较量。'):name;
  const boardName=trackName(TRACKS[leaderboard.city]);
  $('records-track').textContent=boardName;
  $('records-table').setAttribute('aria-label',`${boardName} · ${i18n.language==='en'?'Top five records':'全站前五名'}`);
}
for(const [index,track]of Object.values(TRACKS).entries()) {
  const button=document.createElement('button');button.type='button';button.className='track-card';button.dataset.track=track.id;
  const scene=['neon','london','beijing','austin'].includes(track.theme)?'city':['pines','ridge'].includes(track.theme)?'alpine':'coast';
  button.style.setProperty('--card-scene',`url('${globalThis.TWIN_SCENE_ART?.[scene] || `./assets/${scene}.png`}')`);
  button.style.setProperty('--card-position',`${35+index*6}% 60%`);
  const number=document.createElement('small');number.className='track-card-number';number.textContent=String(index+1).padStart(2,'0');button.appendChild(number);
  const preview=document.createElementNS('http://www.w3.org/2000/svg','svg');preview.classList.add('track-card-preview');preview.setAttribute('aria-hidden','true');
  const outline=circuitOutline(track);preview.setAttribute('viewBox',outline.viewBox);
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',outline.path);path.setAttribute('fill','none');preview.appendChild(path);button.appendChild(preview);
  const label=document.createElement('span');label.className='track-card-name';label.setAttribute('data-i18n-skip','');button.appendChild(label);
  trackCards.set(track.id,{button,label,preview});button.addEventListener('click',()=>selectCircuit(track.id));$('track-cards').appendChild(button);
  const option=document.createElement('option');option.value=track.id;$('records-track-choice').appendChild(option);
}
function selectCircuit(id) {
  if(engine.state!=='menu'||!Object.hasOwn(TRACKS,id))return;
  keys.clear();engine.selectTrack(id);renderer.rebuild(engine);applyPlayerColors();ai.reset();
  ghostRecorder.reset();splitTiming.reset();activeGhosts=[];renderer.setGhostPoses?.([]);
  ghostClient.setTrack(id);ghostClient.setLaps(selectedLaps);void leaderboard.setTrack(id);
  lastLaps=[0,0];notices=['',''];lastState='';refreshTrackUI();
}
$('records-track-choice').addEventListener('change',()=>{
  const city=$('records-track-choice').value;
  if(Object.hasOwn(TRACKS,city))void leaderboard.setTrack(city,{preserveResults:true});
  refreshTrackUI();
});

function splitLabel(deltaMs, target) {
  if (deltaMs === null || !Number.isFinite(deltaMs)) return `${target}尚未通过`;
  if (Math.abs(deltaMs) < 5) return `与${target}并驾齐驱`;
  return `${deltaMs > 0 ? '落后' : '领先'}${target} ${deltaMs > 0 ? '+' : '−'}${(Math.abs(deltaMs) / 1000).toFixed(2)} 秒`;
}
function updateSplitUI(car) {
  const split = splitTiming.latest(car.id), panel = $('split'+car.id);
  const visible = split && engine.state === 'racing';
  panel.classList.toggle('hidden', !visible);
  if (!visible) return;
  $('split-point'+car.id).textContent = `第 ${split.lap} 圈 · ${split.index === 4 ? '终点' : `计时点 0${split.index}`}`;
  const opponent = split.opponentId === 2 && raceMode === 'ai' ? 'AI' : '对手';
  const delta = $('split-gap'+car.id);
  delta.textContent = splitLabel(split.deltaMs, opponent);
  delta.classList.toggle('split-ahead', split.deltaMs !== null && split.deltaMs <= -5);
  delta.classList.toggle('split-behind', split.deltaMs !== null && split.deltaMs >= 5);
  const ghostLine = $('split-ghost'+car.id); ghostLine.replaceChildren();
  for (const delta of split.ghostDeltas || []) {
    if (delta.deltaMs === null) continue;
    const label = document.createElement('span'); label.style.color = delta.color;
    label.textContent = splitLabel(delta.deltaMs, `${delta.colorLabel}幽灵`); ghostLine.appendChild(label);
  }
}
function updateUI(now) {
  $('timer').textContent=fmt(engine.time);
  const statuses={menu:'等待发车',countdown:'准备出发',racing:'比赛进行中',paused:'比赛已暂停',finished:'比赛结束'};
  const finishers = engine.cars.filter(car => car.finished).sort((a, b) => a.finishTime - b.finishTime
    || (a === engine.winner ? -1 : b === engine.winner ? 1 : a.id - b.id));
  $('race-status').textContent=engine.state==='racing' && finishers.length ? '等待另一位完赛' : statuses[engine.state];
  for(const [i,car] of engine.cars.entries()) {
    const place = finishers.indexOf(car) + 1;
    updateSplitUI(car);
    $('lap'+car.id).textContent=car.lap;
    $('current-lap'+car.id).textContent = car._started ? fmt(car.lapTime) : '—';
    $('personal-best'+car.id).textContent = car.bestLap === null ? '—' : fmt(car.bestLap);
    $('boost'+car.id).style.width=car.boost+'%';$('boost-label'+car.id).textContent=Math.round(car.boost)+'%';
    $('speed'+car.id).textContent=Math.round(Math.abs(car.speed)*(TRACK.unitsPerMeter ? 3.6/TRACK.unitsPerMeter : .66));
    $('offroad'+car.id).textContent=car.finished?`第 ${place} 名 · 已完赛`:car.rescueCooldown>0?'返回赛道 · 罚停中':car.missedCheckpoint?`漏过检查点 · 按 ${bindings.label(car.id,'rescue')} 回赛道`:car.impact>.15?'碰撞 · 减速':car.offroad?'草地减速':car.boosting?'NITRO ON':'';
    $('finisher'+car.id).classList.toggle('hidden', !car.finished || engine.state !== 'racing');
    if (car.finished) {
      $('finisher-place'+car.id).textContent=`第 ${place} 名 · 已完赛`;
      $('finisher-time'+car.id).textContent=fmt(car.finishTime);
    }
  }
  if(engine.state!==lastState){
    for(const {button}of trackCards.values())button.disabled=engine.state!=='menu';
    document.querySelectorAll('[data-city]').forEach(button=>button.disabled=engine.state!=='menu');
    $('menu').classList.toggle('hidden',engine.state!=='menu');$('pause-panel').classList.toggle('hidden',engine.state!=='paused');$('result').classList.toggle('hidden',engine.state!=='finished');
    // Reuse the same forms: finished races save here; abandoned laps remain accessible below.
    $(engine.state==='finished'?'result-save-host':'records-pending-host').appendChild($('records-results'));
    $('pause').disabled=!['racing','countdown','paused'].includes(engine.state);$('pause').innerHTML=engine.state==='paused'?'继续 <kbd>Esc</kbd>':'暂停 <kbd>Esc</kbd>';
    document.body.classList.toggle('racing',engine.state==='racing');
    $('arena-tag-text').textContent=engine.state==='racing'?'LIVE / CHASE CAM':'CHASE CAM / P1';
    if(engine.state==='racing' && lastState==='countdown'){goUntil=now+1;tone(880,.2,.08);}
    if(engine.state==='finished'){
      ghostClient.endRace();
      leaderboard.setRaceActive(false);
      leaderboard.showResults(raceRecords(finishers));
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
      leaderboard.cards.find(card=>!card.done)?.input.focus({preventScroll:true});
      keys.clear();tone(523,.2,.06);setTimeout(()=>tone(659,.2,.06),140);setTimeout(()=>tone(784,.35,.06),280);

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
function begin(skipGhosts = false) {
  if ($('language-dialog').open || $('help-dialog').open || $('bindings-dialog').open || leaderboard.busyDialog || !renderer.available) return;
  $('race-setup-dialog').close();
  if (skipGhosts) ghostClient.node('ghost-enabled').checked = false;
  leaderboard.newRace(); leaderboard.setRaceActive(true);
  activeGhosts = ghostClient.startRace(); ghostRecorder.reset(); splitTiming.reset(activeGhosts);
  $('ghost-race-label').textContent = activeGhosts.map(ghost=>`${ghost.colorLabel}幽灵 · 「${ghost.entry.name}」 · ${fmt(ghost.entry.timeMs/1000)}`).join('  /  ');
  raceMode=selectedMode; renderer.setSinglePlayer(raceMode==='ai'); engine.start(selectedLaps); applyPlayerColors(); ai.reset(); lastAIRescues=0;
  keys.clear(); lastLaps=[0,0]; notices=['','']; lastCount=0; renderer.resetCameras(engine); goUntil=0;
  canvas.focus({preventScroll:true}); if(soundEnabled){initAudio();audio?.resume();}
}
function openRaceSetup() {
  if ($('language-dialog').open || $('help-dialog').open || $('bindings-dialog').open || !renderer.available) return;
  if (['racing','countdown'].includes(engine.state)) engine.pause();
  keys.clear(); ghostClient.menu();
  $('race-setup-summary').textContent = `${i18n.t(selectedMode === 'ai' ? `单人 · ${selectedColor === 'orange' ? '橙色风暴' : '青色闪电'}对战 AI` : '本地双人')} · ${trackName()} · ${i18n.t(`${selectedLaps} 圈`)}`;
  void ghostClient.openPicker(selectedLaps);
  if (!$('race-setup-dialog').open) $('race-setup-dialog').showModal();
}
$('setup-launch').addEventListener('click',()=>begin());
$('setup-skip').addEventListener('click',()=>begin(true));
$('setup-close').addEventListener('click',()=>$('race-setup-dialog').close());
$('race-setup-dialog').addEventListener('close',()=>{keys.clear();if(['racing','countdown','paused'].includes(engine.state))ghostClient.startRace();});
function togglePause(){
  if (engine.state === 'paused') {
    engine.resume();
    canvas.focus({preventScroll:true});
  } else engine.pause();
  keys.clear();
}
function rescue(id){if(engine.cars[id-1].finished)return;ghostRecorder.invalidate(id);engine.rescue(id);renderer.resetCameras(engine,id);notices[id-1]='返回赛道 · 罚停 2 秒';noticeUntil[id-1]=toastTime+2.2;}
$('start').addEventListener('click',openRaceSetup);$('again').addEventListener('click',showRaceStart);$('restart').addEventListener('click',openRaceSetup);
$('resume').addEventListener('click',()=>{keys.clear();engine.resume();canvas.focus({preventScroll:true});});$('pause').addEventListener('click',togglePause);
function raceRecords(cars = engine.cars) {
  return cars.filter(car => !(raceMode === 'ai' && car.id === 2)).map(car => ({
    playerId:car.id, driverLabel:names[car.id-1], mode:raceMode, laps:engine.laps, city:TRACK.id,
    finished:Boolean(car.finished), timeMs:car.finished ? Math.round(car.finishTime * 1000) : undefined,
    replay:ghostRecorder.bestReplay(car.id), raceReplay:ghostRecorder.fullRaceReplay(car.id),
  }));
}
function returnToMenu() {
  ghostClient.menu(); leaderboard.setRaceActive(false);
  if (!['finished','menu'].includes(engine.state)) leaderboard.showResults(raceRecords());
  ghostRecorder.reset(); splitTiming.reset(); activeGhosts=[]; renderer.setGhostPoses?.([]);
  engine.reset(); applyPlayerColors(); ai.reset(); lastAIRescues=0; keys.clear(); renderer.resetCameras(engine);
  const selected = ghostClient.node('ghost-enabled').checked ? ghostClient.selections() : [];
  $('ghost-race-label').textContent = selected.map(ghost => `${ghost.colorLabel}幽灵 · 「${ghost.entry.name}」`).join('  /  ');
  updateUI(performance.now()/1000);
}
async function openRecords(event) {
  event?.preventDefault(); keys.clear();
  if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} }
  $('records-center').scrollIntoView?.({behavior:'smooth',block:'start'});
  $('records-center').focus({preventScroll:true});
}
function showRaceStart(event) {
  event?.preventDefault();
  if (engine.state === 'finished') returnToMenu();
  $('race-stage').scrollIntoView?.({behavior:'smooth',block:'start'});
  (engine.state === 'menu' ? $('start') : engine.state === 'paused' ? $('resume') : canvas).focus({preventScroll:true});
}
$('menu-records').addEventListener('click',openRecords);
$('records-start').addEventListener('click',showRaceStart);

$('back-menu').addEventListener('click',returnToMenu);
$('pause-menu').addEventListener('click',returnToMenu);
function selectLaps(laps) {
  selectedLaps = laps === 1 ? 1 : 3;
  ghostClient.setLaps(selectedLaps);
  document.querySelectorAll('[data-laps]').forEach(button=>{const active=Number(button.dataset.laps)===selectedLaps;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
  document.querySelectorAll('.total-laps').forEach(el=>el.textContent=selectedLaps);
}
document.querySelectorAll('[data-laps]').forEach(button=>button.addEventListener('click',()=>{if(engine.state==='menu')selectLaps(Number(button.dataset.laps));}));

function applyPlayerColors() {
  const flipped = selectedMode === 'ai' && selectedColor === 'orange';
  const indices = flipped ? [1,0] : [0,1];
  const palette = ['#51dfe5','#ff9870'], labels = ['青色闪电','橙色风暴'];
  engine.cars.forEach((car,i)=>{car.colorIndex=indices[i];colors[i]=palette[indices[i]];names[i]=(selectedMode==='ai'&&i===1?'AI · ':'')+labels[indices[i]];});
  document.querySelectorAll('.player-card').forEach((node,i)=>{node.classList.toggle('cyan',indices[i]===0);node.classList.toggle('orange',indices[i]===1);});
  document.querySelectorAll('.control-player').forEach((node,i)=>{node.classList.toggle('cyan',indices[i]===0);node.classList.toggle('orange',indices[i]===1);});
  for (const id of [1,2]) {
    $('player'+id+'-name').textContent=names[id-1]; $('control-player'+id+'-name').textContent=names[id-1];
    $('help-player'+id+'-name').textContent=`0${id} ${names[id-1]}`;
    $('finisher'+id).style.setProperty('--accent',colors[id-1]);
  }
  document.querySelectorAll('[data-help-player]').forEach(node=>node.style.setProperty('--accent',colors[Number(node.dataset.helpPlayer)-1]));
  document.querySelectorAll('.speed-readout').forEach((node,i)=>node.style.setProperty('--accent',colors[i]));
  document.querySelectorAll('.live-dot').forEach((node,i)=>node.style.background=colors[i%2]);
}
function refreshBindings() {
  document.querySelectorAll('[data-bind-player]').forEach(button=>{
    const player=Number(button.dataset.bindPlayer),action=button.dataset.bindAction;
    const capturing=bindingCapture?.player===player&&bindingCapture?.action===action;
    button.textContent=capturing?'请按一个键…':bindings.label(player,action);
    button.classList.toggle('capturing',capturing);button.setAttribute('aria-pressed',String(capturing));
    button.setAttribute('aria-label',`P${player} ${ACTION_LABELS[action]}：${button.textContent}`);
  });
  document.querySelectorAll('[data-control-player]').forEach(node=>node.textContent=bindings.label(Number(node.dataset.controlPlayer),node.dataset.controlAction));
  canvas.setAttribute('aria-label',selectedMode==='ai'?'单人完整视野斜后方赛车。自定义按键见下方操作说明。':'左右分屏斜后方赛车。自定义按键见下方操作说明。');
  $('ai-control-note').textContent='AI 自动驾驶 · 遵循相同物理规则';
}
function updateMode() {
  const solo=selectedMode==='ai'; applyPlayerColors();
  renderer.setSinglePlayer(solo); document.body.classList.toggle('solo-mode',solo);
  $('race-arena').setAttribute('aria-label',solo?'单人赛道，镜头跟随你的赛车':'左右分屏赛道，左侧玩家一，右侧玩家二');
  $('player2-label').textContent=solo?'AI DRIVER':'PLAYER 02'; $('control-player2-chip').textContent=solo?'AI':'P2';
  $('mode-label').textContent=solo?'单人挑战 AI':'双人分屏'; $('mode-english').textContent=solo?'SINGLE PLAYER':'LOCAL MULTIPLAYER';
  $('mode-description').textContent=solo?`你驾驶${selectedColor==='orange'?'橙色':'青色'}赛车，与 AI 较量。WASD 或方向键均可驾驶。`:'与身边的朋友，共用一块键盘。';
  $('player-color-select').classList.toggle('hidden',!solo);
  $('player-color-description').textContent=`你驾驶${selectedColor==='orange'?'橙色':'青色'}赛车，AI 使用另一种颜色。`;
  $('player1-alternate-controls').classList.toggle('hidden',!solo);
  $('player2-controls').classList.toggle('hidden',solo); $('ai-control-note').classList.toggle('hidden',!solo);
  $('help-mode-description').textContent=solo?'镜头全屏跟随你的赛车，与 AI 在同一赛道较量。两套键位均控制你的赛车：WASD / 左 Shift / Q，或方向键 / Enter / 斜杠；也可在「自定义按键」中修改。两车遵循相同物理和赛道规则，双方完赛后结算。':'两位玩家共用键盘，各占半个屏幕。先完成全部圈数的玩家获胜；另一位可继续跑完，双方完赛后一起结算。';
  document.querySelectorAll('[data-mode]').forEach(button=>{const active=button.dataset.mode===selectedMode;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
  document.querySelectorAll('[data-player-color]').forEach(button=>{const active=button.dataset.playerColor===selectedColor;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
  refreshBindings();
}
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{if(engine.state!=='menu')return;selectedMode=button.dataset.mode==='ai'?'ai':'local';updateMode();}));
document.querySelectorAll('[data-player-color]').forEach(button=>button.addEventListener('click',()=>{if(engine.state!=='menu')return;selectedColor=button.dataset.playerColor==='orange'?'orange':'cyan';updateMode();}));
function openBindings() {
  engine.pause(); keys.clear(); bindingCapture=null; refreshBindings();
  $('bindings-message').textContent='点击要修改的动作，再按一个新键。重复键会提示；Esc 取消选键。';
  $('bindings-dialog').showModal();
}
$('open-bindings').addEventListener('click',openBindings); $('pause-bindings').addEventListener('click',openBindings);
document.querySelectorAll('[data-bind-player]').forEach(button=>button.addEventListener('click',()=>{
  bindingCapture={player:Number(button.dataset.bindPlayer),action:button.dataset.bindAction};
  $('bindings-message').textContent=`为 P${bindingCapture.player} 的${ACTION_LABELS[bindingCapture.action]}按一个新键；Esc 取消。`;refreshBindings();
}));
for(const id of ['bindings-done','bindings-close']) $(id).addEventListener('click',()=>$('bindings-dialog').close());
$('bindings-dialog').addEventListener('close',()=>{bindingCapture=null;keys.clear();refreshBindings();});
$('bindings-dialog').addEventListener('cancel',event=>{if(bindingCapture){event.preventDefault();bindingCapture=null;refreshBindings();$('bindings-message').textContent='已取消选键。';}});
$('bindings-reset').addEventListener('click',()=>{bindingCapture=null;const saved=bindings.reset();keys.clear();refreshBindings();$('bindings-message').textContent=saved?'已恢复默认键位并保存。':'已恢复默认键位，本次游玩有效。';});
updateMode();selectLaps(selectedLaps);
$('sound').addEventListener('click',()=>{soundEnabled=!soundEnabled;$('sound').setAttribute('aria-pressed',String(soundEnabled));$('sound').title=soundEnabled?'关闭声音':'开启声音';$('sound').querySelector('span').textContent=soundEnabled?'声音开':'声音关';$('sound').querySelector('path').setAttribute('d',soundEnabled?'M11 5 6 9H3v6h3l5 4V5Zm5 3c2 2 2 6 0 8m3-11c4 4 4 10 0 14':'M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6');if(soundEnabled){initAudio();audio?.resume();tone(600,.08,.04);}if(['racing','countdown'].includes(engine.state))canvas.focus({preventScroll:true});});
$('help').addEventListener('click',()=>{engine.pause();keys.clear();$('help-dialog').showModal();});
$('close-help').addEventListener('click',()=>$('help-dialog').close());$('help-done').addEventListener('click',()=>$('help-dialog').close());
$('help-dialog').addEventListener('click',event=>{if(event.target===$('help-dialog')){const r=$('help-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('help-dialog').close();}});
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('race-stage').requestFullscreen();
    resize();
    (engine.state==='finished' ? leaderboard.cards.find(card=>!card.done)?.input || canvas : canvas).focus({preventScroll: true});
  } catch { $('fullscreen').title = '请使用浏览器的全屏功能'; }
}
$('fullscreen').addEventListener('click', toggleFullscreen);
$('fullscreen-exit').addEventListener('click', toggleFullscreen);
const controlKeys={has:code=>bindings.recognizes(code)||['Space','Escape'].includes(code)};
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
  if ($('language-dialog').open) return;
  if ($('bindings-dialog').open) {
    if (!bindingCapture || event.repeat) return;
    event.preventDefault();
    if (event.code==='Escape') {bindingCapture=null;refreshBindings();$('bindings-message').textContent='已取消选键。';return;}
    if (event.metaKey||event.ctrlKey||event.altKey) {$('bindings-message').textContent='请只按一个键，不使用系统组合键。';return;}
    const result=bindings.set(bindingCapture.player,bindingCapture.action,event.code);
    if(result.ok){bindingCapture=null;keys.clear();}
    $('bindings-message').textContent=result.ok?(result.persisted?'键位已保存。':'键位已修改，本次游玩有效。'):result.message;
    refreshBindings();return;
  }
  if(event.metaKey||event.ctrlKey||event.altKey)return;
  if($('help-dialog').open || $('race-setup-dialog').open || leaderboard.busyDialog || typingTarget(event))return;
  if(nativeActivation(event))return;
  if(controlKeys.has(event.code))event.preventDefault();
  if(event.code==='Escape'&&!event.repeat){togglePause();return;}
  if(event.code==='Space'&&!event.repeat){if(engine.state==='menu'||engine.state==='finished')openRaceSetup();else togglePause();return;}
  if(!event.repeat&&engine.state==='racing') for(const id of [1,2]) if(event.code===bindings.code(id,'rescue')){rescue(raceMode==='ai'?1:id);return;}
  if (['racing', 'countdown'].includes(engine.state) && bindings.recognizes(event.code)) keys.add(event.code);
});
window.addEventListener('keyup',event=>{keys.delete(event.code);if(controlKeys.has(event.code)&&!$('help-dialog').open&&!$('bindings-dialog').open&&!$('race-setup-dialog').open&&!leaderboard.busyDialog&&!typingTarget(event)&&!nativeActivation(event))event.preventDefault();});
window.addEventListener('blur',()=>{keys.clear();engine.pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();engine.pause();}});
function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, .05);
  lastTime = timestamp;
  const now = timestamp / 1000;
  toastTime += engine.state === 'racing' ? dt : 0;
  if (!renderer.available) { keys.clear(); engine.pause(); }
  let frameKeys = bindings.frameKeys(keys, raceMode === 'ai');
  if (raceMode === 'ai' && engine.state === 'racing') {
    for (const code of ai.update(engine, dt)) if (player2Keys.has(code) && code !== 'Slash') frameKeys.add(code);
    if (ai.rescues > lastAIRescues) { renderer.resetCameras(engine, 2); lastAIRescues = ai.rescues; }
  }
  ghostRecorder.sample(engine, raceMode === 'ai' ? [1] : [1, 2]);
  splitTiming.sample(engine);
  engine.step(dt, frameKeys);
  splitTiming.sample(engine);
  ghostRecorder.sample(engine, raceMode === 'ai' ? [1] : [1, 2]);
  renderer.setGhostPoses?.(engine.cars.map(car => !car.finished && ['racing','paused'].includes(engine.state) ? activeGhosts.filter(ghost=>ghost.replay.kind==='race'||car._started).map(ghost => ({...sampleReplay(ghost.replay,(ghost.replay.kind==='race'?engine.time:car.lapTime)*1000),slotId:ghost.slotId})).filter(pose=>Number.isFinite(pose.x)) : []));
  updateRaceNotices();
  renderer.render(engine, dt, now);
  drawHUD(now);
  updateUI(now);
  updateAudio();
  requestAnimationFrame(loop);
}
$('language-toggle').addEventListener('click',()=>{keys.clear();engine.pause();});
i18n.init();
resize();requestAnimationFrame(loop);
