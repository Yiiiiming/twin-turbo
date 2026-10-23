const STEPS = [
  { title: ['起步加速', 'Get moving'], text: ['按住油门，让赛车跑起来。', 'Hold the accelerator and get the car moving.'], actions: ['accelerate'] },
  { title: ['行驶中转向', 'Steer while moving'], text: ['保持前进，轻按左转或右转。', 'Keep moving and make a gentle left or right turn.'], actions: ['accelerate', 'left', 'right'] },
  { title: ['减速刹车', 'Slow down'], text: ['松开油门，按住刹车降速。', 'Release the accelerator and hold the brake to slow down.'], actions: ['brake'] },
  { title: ['氮气加速', 'Use nitro'], text: ['按住油门和氮气。时速盘下沿的亮弧越长，余量越多；尾焰也会随余量缩短。', 'Hold the accelerator and nitro. A longer arc below the speedometer means more nitro; the flames shorten as it runs out.'], actions: ['accelerate', 'boost'] },
  { title: ['回到赛道', 'Reset to the track'], text: ['按复位键，试着安全回到赛道。', 'Press reset to return safely to the track.'], actions: ['rescue'] },
];

// A tutorial observes real engine telemetry; it never changes vehicle physics,
// checkpoint progress, the recorded path, or the player's configured controls.
export function createDrivingTutorial(document, { bindings, language = () => 'zh', translate = value => value, onExit = () => {}, onComplete = () => {} } = {}) {
  const element=document.createElement('section');
  element.id='driving-tutorial';element.className='driving-tutorial';element.hidden=true;
  element.setAttribute('data-i18n-skip','');element.setAttribute('role','region');
  const progress=document.createElement('small');progress.className='tutorial-progress';
  const title=document.createElement('h2');title.className='tutorial-title';title.id='tutorial-title';
  const instruction=document.createElement('p');instruction.className='tutorial-instruction';instruction.setAttribute('aria-live','polite');
  const hints=document.createElement('div');hints.className='tutorial-keys';
  const exit=document.createElement('button');exit.type='button';exit.className='tutorial-exit';exit.id='tutorial-exit';
  element.setAttribute('aria-labelledby',title.id);element.append(progress,title,instruction,hints,exit);
  document.getElementById('race-stage').appendChild(element);
  exit.addEventListener('click',()=>onExit());
  let active=false,completed=false,step=0,previous=null,turn=0,braking=0,nitro=0,peakSpeed=0,reason='steps';
  const snapshot=car=>({speed:car.speed,angle:car.angle,boost:car.boost,rescueCount:car.rescueCount,launchResetCount:car.launchResetCount});
  function refresh() {
    const en=language()==='en',index=Number(en),item=STEPS[step];
    element.classList.toggle('is-complete',completed);element.dataset.step=String(step);
    progress.textContent=completed?(en?'PRACTICE COMPLETE':'练习完成'):`${step+1} / ${STEPS.length}`;
    title.textContent=completed?(en?'Ready to race':'准备好出发了'):item.title[index];
    instruction.textContent=completed
      ?reason==='lap'?(en?'Practice lap complete. Try a race whenever you are ready.':'已完成一圈练习，准备好就去参加比赛吧。')
        :(en?'You have tried all five controls. This practice does not save a result.':'五项操作都试过了，本次练习不会保存成绩。')
      :item.text[index];
    exit.textContent=completed?(en?'Back to menu':'返回主菜单'):(en?'End practice':'结束练习');
    hints.replaceChildren();
    if(!completed)for(const action of item.actions){
      const key=document.createElement('kbd');
      key.textContent=[...new Set((action==='rescue'?[1]:[1,2]).map(player=>translate(bindings.label(player,action))))].join(' / ');
      hints.appendChild(key);
    }
  }
  function advance(car) {
    if(step===STEPS.length-1){finish('steps');return;}
    step++;turn=0;braking=0;nitro=0;peakSpeed=Math.max(0,car.speed);refresh();
  }
  function start(car) {
    active=true;completed=false;step=0;turn=0;braking=0;nitro=0;peakSpeed=0;reason='steps';
    previous=snapshot(car);element.hidden=true;refresh();
  }
  function update(car, keys) {
    if(!active||completed)return;
    element.hidden=false;
    const before=previous||snapshot(car),moving=car.speed>25;
    peakSpeed=Math.max(peakSpeed,car.speed);
    if(step===0&&keys.has('KeyW')&&car.speed>=55)advance(car);
    else if(step===1&&moving&&(keys.has('KeyA')||keys.has('KeyD'))){
      turn+=Math.abs(Math.atan2(Math.sin(car.angle-before.angle),Math.cos(car.angle-before.angle)));
      if(turn>=.06)advance(car);
    }else if(step===2&&keys.has('KeyS')&&before.speed>10){
      braking+=Math.max(0,before.speed-car.speed);
      if(peakSpeed>=35&&braking>=20)advance(car);
    }else if(step===3&&car.boosting&&keys.has('KeyW')&&keys.has('ShiftLeft')
      &&car.rescueCount===before.rescueCount&&car.launchResetCount===before.launchResetCount){
      // Observe about two seconds of real fuel use. Recovery/launch teleports
      // and refilling do not count; partial attempts can accumulate after refill.
      nitro+=Math.max(0,before.boost-car.boost);
      if(nitro>=60)advance(car);
    }
    previous=snapshot(car);
  }
  function manualRescue(beforeCount,car) {
    if(active&&!completed&&step===4&&car.rescueCount>beforeCount&&car.rescueReason==='manual')advance(car);
  }
  function finish(why='steps') {
    if(!active||completed)return;
    completed=true;reason=why;refresh();element.hidden=false;onComplete();exit.focus({preventScroll:true});
  }
  function cancel(){active=false;completed=false;element.hidden=true;}
  return {start,update,manualRescue,finish,cancel,refresh,element,get active(){return active;},get completed(){return completed;},get step(){return step;}};
}
