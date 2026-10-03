import { RaceEngine, TRACK, trackPoint, projectTrack, mod } from './engine.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });
const engine = new RaceEngine();
const keys = new Set();
const colors = ['#51dfe5', '#ff9870'];
const names = ['青色闪电', '橙色风暴'];
const cameras = [{ x: 630, y: 528, angle: Math.PI }, { x: 630, y: 568, angle: Math.PI }];
let selectedLaps = 3, lastTime = performance.now(), lastState = '', lastCount = 0;
let goUntil = 0, soundEnabled = false, audio = null, audioNodes = [];
let particles = [], skidMarks = [], previousPositions = [], cameraReady = false;
let lastLaps = [0, 0], notices = ['', ''], noticeUntil = [0, 0], toastTime = 0;
const tau = Math.PI * 2;
const fmt = value => {
  const centiseconds = Math.round(Math.max(0, value || 0) * 100);
  const minutes = Math.floor(centiseconds / 6000);
  const seconds = ((centiseconds % 6000) / 100).toFixed(2);
  return `${String(minutes).padStart(2, '0')}:${seconds.padStart(5, '0')}`;
};
const random = (min, max) => min + Math.random() * (max - min);
const trackPath = (c, offset = 0) => { const r = TRACK.radius + offset; c.beginPath(); c.moveTo(360, 350 - r); c.lineTo(840, 350 - r); c.arc(840, 350, r, -Math.PI / 2, Math.PI / 2); c.lineTo(360, 350 + r); c.arc(360, 350, r, Math.PI / 2, Math.PI * 1.5); c.closePath(); };
function rounded(c, x, y, w, h, r, color) { c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }

// The scenery is painted once; only cars, cameras and effects change each frame.
const scenery = document.createElement('canvas');
scenery.width = TRACK.width * 2; scenery.height = TRACK.height * 2;
const map = scenery.getContext('2d'); map.scale(2, 2);
function paintScenery() {
  map.fillStyle = '#21362d'; map.fillRect(0, 0, 1200, 700);
  for (let y = 0; y < 700; y += 36) { map.fillStyle = y % 72 ? '#ffffff02' : '#00000006'; map.fillRect(0, y, 1200, 36); }
  // Deterministic grain gives the grass texture without fetching an image.
  let seed = 42; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 6200; i++) { map.fillStyle = rand() > .5 ? '#60795718' : '#10251e30'; map.fillRect(rand() * 1200, rand() * 700, 1.5, 2); }
  trackPath(map); map.strokeStyle = '#0e211b'; map.lineWidth = 174; map.stroke();
  trackPath(map); map.strokeStyle = '#566052'; map.lineWidth = 152; map.stroke();
  trackPath(map); map.strokeStyle = '#141e1b'; map.lineWidth = 143; map.stroke();
  // Alternating kerbs frame both edges of the racing surface.
  for (let s = 0, i = 0; s < TRACK.length; s += 15, i++) {
    for (const lane of [-64, 64]) {
      const a = trackPoint(s, lane), b = trackPoint(s + 15, lane);
      map.beginPath(); map.moveTo(a.x, a.y); map.lineTo(b.x, b.y); map.lineWidth = 9; map.strokeStyle = i % 3 === 0 ? '#d5836d' : '#c5cbb3'; map.stroke();
    }
  }
  trackPath(map); map.strokeStyle = '#303a3c'; map.lineWidth = 119; map.stroke();
  trackPath(map); map.strokeStyle = '#354043'; map.lineWidth = 103; map.stroke();
  trackPath(map); map.strokeStyle = '#ffffff13'; map.lineWidth = 1.5; map.setLineDash([19, 21]); map.stroke(); map.setLineDash([]);
  for (let i = 0; i < 11000; i++) { const x = rand() * 1200, y = rand() * 700; if (projectTrack(x, y).distance < 58) { map.fillStyle = rand() > .5 ? '#bdc0b90b' : '#050c121c'; map.fillRect(x, y, 1, 1); } }
  // The start line and starting grid remain readable in both cameras.
  for (let y = 490, row = 0; y < 610; y += 10, row++) for (let col = 0; col < 3; col++) { map.fillStyle = (row + col) % 2 ? '#243031' : '#eeeedd'; map.fillRect(585 + col * 10, y, 10, 10); }
  map.font = 'bold 12px sans-serif'; map.fillStyle = '#d2d9ca'; map.save(); map.translate(576, 550); map.rotate(-Math.PI / 2); map.textAlign = 'center'; map.fillText('START / FINISH', 0, 0); map.restore();
  for (const [x, y] of [[630, 528], [630, 568], [694, 528], [694, 568]]) { map.strokeStyle = '#becabb66'; map.lineWidth = 1.5; map.beginPath(); map.moveTo(x + 20, y - 16); map.lineTo(x - 23, y - 16); map.lineTo(x - 23, y + 16); map.lineTo(x + 20, y + 16); map.stroke(); }
  for (let s = 130; s < TRACK.length; s += 210) { const p = trackPoint(s); map.save(); map.translate(p.x, p.y); map.rotate(p.angle); map.beginPath(); map.moveTo(-7, -4); map.lineTo(0, 0); map.lineTo(-7, 4); map.strokeStyle = '#d4ddd329'; map.lineWidth = 2; map.stroke(); map.restore(); }
  // Trackside objects give a consistent sense of speed.
  const tree = (x, y, size) => { map.fillStyle = '#071a1666'; map.beginPath(); map.ellipse(x + 5, y + 8, size, size * .8, 0, 0, tau); map.fill(); map.fillStyle = '#172d22'; map.beginPath(); map.arc(x, y, size, 0, tau); map.fill(); map.fillStyle = '#294833'; map.beginPath(); map.arc(x - size * .23, y - size * .27, size * .72, 0, tau); map.fill(); map.fillStyle = '#3b594036'; map.beginPath(); map.arc(x - size * .4, y - size * .4, size * .4, 0, tau); map.fill(); };
  [[68,95,24],[92,150,18],[1120,530,23],[1140,590,25],[1065,652,20],[87,610,30],[450,265,19],[477,287,14],[744,425,17],[774,400,23],[1080,65,20],[1025,49,16],[170,660,17]].forEach(a => tree(...a));
  for (const [sx, sy, width, color] of [[355,39,220,'#697a6e'],[647,39,205,'#717660'],[350,637,150,'#6f7a6c'],[680,638,160,'#79756a']]) {
    rounded(map, sx + 4, sy + 8, width, 26, 3, '#07161166'); rounded(map, sx, sy, width, 26, 3, '#1c2725');
    for (let row = 0; row < 3; row++) for (let col = 0; col < width / 8 - 1; col++) { map.fillStyle = rand() > .35 ? color : '#34433b'; map.fillRect(sx + 5 + col * 8, sy + 5 + row * 6, 5, 3); }
  }
  const banner = (x, y, label, color, width = 123) => { rounded(map, x + 2, y + 3, width, 22, 2, '#07161077'); rounded(map, x, y, width, 20, 2, color); map.font = 'bold 9px sans-serif'; map.textAlign = 'center'; map.fillStyle = '#18231b'; map.fillText(label, x + width / 2, y + 13); };
  banner(398, 227, 'TWIN / TURBO', '#bfd971'); banner(677, 227, 'MAKE YOUR MOVE.', '#d5d3bf'); banner(512, 441, 'TWO DRIVERS. ONE WINNER.', '#a0b28d', 190);
  map.save(); map.translate(600, 342); map.textAlign = 'center'; map.fillStyle = '#90a37d16'; map.font = 'italic 900 71px sans-serif'; map.fillText('TWIN TURBO', 0, 0); map.fillStyle = '#8fa87945'; map.font = '10px monospace'; map.fillText('M I D N I G H T   C I R C U I T', 0, 28); map.restore();
  // Lights, fences, and braking boards.
  for (let s = 40; s < TRACK.length; s += 155) { const p = trackPoint(s, -91); map.fillStyle = '#142219'; map.beginPath(); map.arc(p.x, p.y, 4, 0, tau); map.fill(); map.fillStyle = '#dfe6b2'; map.beginPath(); map.arc(p.x, p.y, 1.8, 0, tau); map.fill(); }
  for (const s of [280, 370, 1350, 1440]) { const p = trackPoint(s, -78); map.save(); map.translate(p.x, p.y); map.rotate(p.angle); rounded(map, -10, -6, 20, 12, 1, '#dce0ce'); map.fillStyle = '#313a31'; map.font = 'bold 6px monospace'; map.textAlign = 'center'; map.fillText(s === 280 || s === 1350 ? '100' : '50', 0, 2); map.restore(); }
}
paintScenery();

function drawCar(c, car, now) {
  c.save(); c.translate(car.x, car.y); c.rotate(car.angle);
  if (car.boosting) {
    const length = 22 + Math.sin(now * 40) * 6;
    const flame = c.createLinearGradient(-18, 0, -48, 0); flame.addColorStop(0, '#deffb4'); flame.addColorStop(.3, colors[car.id - 1]); flame.addColorStop(1, '#54ddec00'); c.fillStyle = flame;
    c.beginPath(); c.moveTo(-16, -7); c.lineTo(-20 - length, 0); c.lineTo(-16, 7); c.fill();
  }
  // White headlamps cast a subtle beam onto the asphalt.
  const light = c.createLinearGradient(18, 0, 85, 0); light.addColorStop(0, '#e4f5d315'); light.addColorStop(1, '#e4f5d300'); c.fillStyle = light; c.beginPath(); c.moveTo(17,-10); c.lineTo(90,-27); c.lineTo(90,27); c.lineTo(17,10); c.fill();
  rounded(c, -21, -10, 46, 26, 7, '#07111175');
  rounded(c, -14, -14, 11, 5, 2, '#0b1418'); rounded(c, 8, -14, 10, 5, 2, '#0b1418'); rounded(c, -14, 9, 11, 5, 2, '#0b1418'); rounded(c, 8, 9, 10, 5, 2, '#0b1418');
  rounded(c, -22, -10.5, 45, 21, [4, 7, 7, 4], colors[car.id - 1]);
  c.fillStyle = '#ffffff35'; c.fillRect(-16,-9,30,2);
  rounded(c, -8, -8, 17, 16, [3, 5, 5, 3], '#162f38');
  rounded(c, -5, -7, 6, 14, 2, car.id === 1 ? '#3fbdc7' : '#db7852');
  c.fillStyle = '#c6edf12b'; c.beginPath(); c.moveTo(2,-7); c.lineTo(7,-5); c.lineTo(7,5); c.lineTo(2,7); c.fill();
  c.fillStyle = '#ffffd7'; c.fillRect(20,-8,3,5); c.fillRect(20,3,3,5);
  c.fillStyle = '#ff5954'; c.fillRect(-23,-8,2,5); c.fillRect(-23,3,2,5);
  rounded(c, -23, -13, 4, 26, 1, '#18292e');
  c.fillStyle = '#172e35'; c.font = 'bold 7px sans-serif'; c.textAlign = 'center'; c.fillText(String(car.id).padStart(2,'0'), 15, 2.5);
  c.restore();
}

function drawMiniMap(c, x, y, playerId) {
  c.save(); c.translate(x, y); rounded(c, -7, -9, 150, 92, 8, '#111c1bc7'); c.scale(.115, .115);
  trackPath(c); c.strokeStyle = '#83957d33'; c.lineWidth = 30; c.stroke(); trackPath(c); c.strokeStyle = '#b7c6a04d'; c.lineWidth = 4; c.stroke();
  c.fillStyle = '#e3ecd4'; c.fillRect(585,488,24,124);
  for (const car of engine.cars) { c.beginPath(); c.arc(car.x,car.y,car.id === playerId ? 31 : 24,0,tau); c.fillStyle = colors[car.id-1]; c.fill(); if(car.id === playerId) { c.lineWidth = 10; c.strokeStyle = '#ffffffcc'; c.stroke(); } }
  c.restore();
}

function renderViewport(index, dt, now) {
  const car = engine.cars[index], camera = cameras[index], x = index * 600;
  let diff = mod(car.angle - camera.angle + Math.PI, tau) - Math.PI;
  const active = engine.state === 'racing' || engine.state === 'finished';
  const smooth = 1 - Math.exp(-dt * 7);
  camera.x += (car.x - camera.x) * smooth; camera.y += (car.y - camera.y) * smooth; camera.angle += diff * (1 - Math.exp(-dt * 4.5));
  if (!cameraReady) { camera.x = car.x; camera.y = car.y; camera.angle = car.angle; }
  const zoom = 1.37 - Math.min(Math.abs(car.speed) / 470, 1) * .19;
  ctx.save(); ctx.beginPath(); ctx.rect(x,0,600,700); ctx.clip();
  ctx.fillStyle = index === 0 ? '#21362d' : '#23362d'; ctx.fillRect(x,0,600,700);
  ctx.save();
  const shake = active ? car.impact * 2 : 0;
  ctx.translate(x + 300 + Math.sin(now*91)*shake, 435 + Math.cos(now*83)*shake);
  ctx.scale(zoom,zoom); ctx.rotate(-camera.angle - Math.PI / 2); ctx.translate(-camera.x,-camera.y);
  ctx.drawImage(scenery,0,0,1200,700);
  for (const mark of skidMarks) { ctx.strokeStyle = `rgba(8,17,19,${mark.alpha})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(mark.x1,mark.y1); ctx.lineTo(mark.x2,mark.y2); ctx.stroke(); }
  for (const p of particles) { ctx.globalAlpha = Math.max(0,p.life / p.maxLife); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,tau); ctx.fill(); } ctx.globalAlpha = 1;
  for (const other of engine.cars) drawCar(ctx, other, now);
  // A floating marker is deliberately small so it never hides a corner.
  ctx.save(); ctx.translate(car.x,car.y); ctx.rotate(camera.angle + Math.PI/2); ctx.fillStyle = colors[index]; ctx.beginPath(); ctx.moveTo(0,-32); ctx.lineTo(-4,-39); ctx.lineTo(4,-39); ctx.fill(); ctx.restore();
  ctx.restore();
  const vignette = ctx.createRadialGradient(x+300,340,170,x+300,340,480); vignette.addColorStop(0,'#06131700'); vignette.addColorStop(1,'#07111988'); ctx.fillStyle=vignette;ctx.fillRect(x,0,600,700);
  if (car.boosting) { ctx.strokeStyle = `${colors[index]}40`; ctx.lineWidth=1; for(let j=0;j<10;j++){const side=j%2;const lx=x+(side?570:30)+(j%3)*8;const yy=mod(now*900+j*73,700);ctx.beginPath();ctx.moveTo(lx,yy);ctx.lineTo(lx,yy+25+j*4);ctx.stroke();} }
  if (active && notices[index] && toastTime < noticeUntil[index]) { rounded(ctx,x+180,122,240,39,6,'#11211bec'); ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillStyle=colors[index];ctx.fillText(notices[index],x+300,147); }
  if (engine.state === 'racing' && !car.offroad && Math.abs(car.speed)>50) { const angleDelta = Math.abs(mod(car.angle - projectTrack(car.x,car.y).angle + Math.PI,tau)-Math.PI); if(angleDelta>Math.PI*.65){ctx.fillStyle='#e9c985';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText('↶  逆向行驶',x+300,110);} }
  drawMiniMap(ctx, x+426, 588, car.id);
  ctx.restore();
}

function updateEffects(dt) {
  if (engine.state !== 'racing') return;
  for (const [i, car] of engine.cars.entries()) {
    const previous=previousPositions[i];
    if (previous && Math.hypot(car.x-previous.x,car.y-previous.y)<30 && car.lastSkid) {
      for(const side of [-8,8]){const nx=Math.sin(car.angle)*side,ny=-Math.cos(car.angle)*side;skidMarks.push({x1:previous.x+nx,y1:previous.y+ny,x2:car.x+nx,y2:car.y+ny,alpha:.45});}
    }
    if (car.boosting || (car.offroad && Math.abs(car.speed)>35)) {
      const life=random(.15,.45), reverse=car.angle+Math.PI; particles.push({x:car.x+Math.cos(reverse)*23,y:car.y+Math.sin(reverse)*23,vx:Math.cos(reverse)*random(30,80)+random(-20,20),vy:Math.sin(reverse)*random(30,80)+random(-20,20),life,maxLife:life,size:car.boosting?random(1,3):random(2,6),color:car.boosting?colors[i]:'#a2a07b'});
    }
    previousPositions[i]={x:car.x,y:car.y};
    if(car.lap>lastLaps[i]) { notices[i]=`第 ${car.lap} 圈完成 · ${fmt(car.lastLap)}`;noticeUntil[i]=toastTime+3;lastLaps[i]=car.lap;tone(660+i*110,.11,.045); }
  }
  particles=particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;return p.life>0;});
  if(skidMarks.length>650)skidMarks.splice(0,skidMarks.length-650);
}

function resize() { const ratio=Math.min(window.devicePixelRatio||1,2);const width=Math.round(canvas.clientWidth*ratio);const height=Math.round(canvas.clientHeight*ratio);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;} }
new ResizeObserver(resize).observe(canvas);
function draw(dt, now) {
  ctx.setTransform(canvas.width/1200,0,0,canvas.height/700,0,0);
  renderViewport(0,dt,now);renderViewport(1,dt,now);cameraReady=true;
  ctx.fillStyle='#101918';ctx.fillRect(597,0,6,700);ctx.fillStyle='#b2c1a837';ctx.fillRect(599,0,2,700);
  rounded(ctx,585,52,30,30,15,'#1d2b24');ctx.font='bold 8px sans-serif';ctx.textAlign='center';ctx.fillStyle='#b4c0a9';ctx.fillText('VS',600,70);
}

function updateUI(now) {
  $('timer').textContent=fmt(engine.time);
  const statuses={menu:'等待发车',countdown:'准备出发',racing:'比赛进行中',paused:'比赛已暂停',finished:'比赛结束'};
  $('race-status').textContent=statuses[engine.state];
  for(const [i,car] of engine.cars.entries()) {
    $('lap'+car.id).textContent=car.lap;
    $('boost'+car.id).style.width=car.boost+'%';$('boost-label'+car.id).textContent=Math.round(car.boost)+'%';
    $('speed'+car.id).textContent=Math.round(Math.abs(car.speed)*.66);
    $('offroad'+car.id).textContent=car.rescueCooldown>0?'返回赛道 · 罚停中':car.missedCheckpoint?`漏过检查点 · 按 ${i===0?'Q':'/'} 回赛道`:car.offroad?'草地减速':car.boosting?'NITRO ON':'';
  }
  if(engine.state!==lastState){
    $('menu').classList.toggle('hidden',engine.state!=='menu');$('pause-panel').classList.toggle('hidden',engine.state!=='paused');$('result').classList.toggle('hidden',engine.state!=='finished');
    $('pause').disabled=!['racing','countdown','paused'].includes(engine.state);$('pause').innerHTML=engine.state==='paused'?'继续 <kbd>Esc</kbd>':'暂停 <kbd>Esc</kbd>';
    document.body.classList.toggle('racing',engine.state==='racing');
    $('arena-tag-text').textContent=engine.state==='racing'?'LIVE / SPLIT SCREEN':'SPLIT SCREEN / P1';
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
function begin(){if($('help-dialog').open)return;engine.start(selectedLaps);keys.clear();particles=[];skidMarks=[];previousPositions=[];lastLaps=[0,0];notices=['',''];lastCount=0;cameraReady=false;goUntil=0;canvas.focus({preventScroll:true});if(soundEnabled){initAudio();audio?.resume();}}
function togglePause(){
  if (engine.state === 'paused') {
    engine.resume();
    canvas.focus({preventScroll:true});
  } else engine.pause();
  keys.clear();
}
function rescue(id){engine.rescue(id);cameras[id-1].x=engine.cars[id-1].x;cameras[id-1].y=engine.cars[id-1].y;cameras[id-1].angle=engine.cars[id-1].angle;previousPositions[id-1]=null;notices[id-1]='返回赛道 · 罚停 2 秒';noticeUntil[id-1]=toastTime+2.2;}
$('start').addEventListener('click',begin);$('again').addEventListener('click',begin);$('restart').addEventListener('click',begin);
$('resume').addEventListener('click',()=>{keys.clear();engine.resume();canvas.focus({preventScroll:true});});$('pause').addEventListener('click',togglePause);
$('back-menu').addEventListener('click',()=>{engine.reset();keys.clear();cameraReady=false;});
document.querySelectorAll('[data-laps]').forEach(button=>button.addEventListener('click',()=>{selectedLaps=Number(button.dataset.laps);document.querySelectorAll('[data-laps]').forEach(b=>{const selected=b===button;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});document.querySelectorAll('.total-laps').forEach(el=>el.textContent=selectedLaps);}));
$('sound').addEventListener('click',()=>{soundEnabled=!soundEnabled;$('sound').setAttribute('aria-pressed',String(soundEnabled));$('sound').title=soundEnabled?'关闭声音':'开启声音';$('sound').querySelector('span').textContent=soundEnabled?'声音开':'声音关';$('sound').querySelector('path').setAttribute('d',soundEnabled?'M11 5 6 9H3v6h3l5 4V5Zm5 3c2 2 2 6 0 8m3-11c4 4 4 10 0 14':'M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6');if(soundEnabled){initAudio();audio?.resume();tone(600,.08,.04);}if(['racing','countdown'].includes(engine.state))canvas.focus({preventScroll:true});});
$('help').addEventListener('click',()=>{engine.pause();keys.clear();$('help-dialog').showModal();});
$('close-help').addEventListener('click',()=>$('help-dialog').close());$('help-done').addEventListener('click',()=>$('help-dialog').close());
$('help-dialog').addEventListener('click',event=>{if(event.target===$('help-dialog')){const r=$('help-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('help-dialog').close();}});
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
function loop(timestamp){const dt=Math.min((timestamp-lastTime)/1000,.05);lastTime=timestamp;const now=timestamp/1000;toastTime+=engine.state==='racing'?dt:0;engine.step(dt,keys);updateEffects(dt);draw(dt,now);updateUI(now);updateAudio();requestAnimationFrame(loop);}
resize();requestAnimationFrame(loop);
