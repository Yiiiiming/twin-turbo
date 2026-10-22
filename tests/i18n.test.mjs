import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createI18n, translateText } from '../i18n.js';

class Element {
  constructor(tag='div') { this.nodeType=1;this.tagName=tag;this.childNodes=[];this.attrs=new Map();this.listeners=new Map();this.open=false; }
  append(child){child.parentElement=this;this.childNodes.push(child);return child;}
  get textContent(){return this.childNodes.map(node=>node.nodeType===3?node.nodeValue:node.textContent).join('');}
  set textContent(value){this.childNodes=[];this.append({nodeType:3,nodeValue:String(value)});}
  getAttribute(name){return this.attrs.get(name)??null;}
  setAttribute(name,value){this.attrs.set(name,String(value));}
  matches(selector){return selector.split(',').some(raw=>{const s=raw.trim();return s==='[data-i18n-skip]'?this.attrs.has('data-i18n-skip'):s==='[translate="no"]'?this.attrs.get('translate')==='no':s===this.tagName;});}
  closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector);}
  addEventListener(type,handler){this.listeners.set(type,[...(this.listeners.get(type)||[]),handler]);}
  dispatch(type,event={}){for(const handler of this.listeners.get(type)||[])handler(event);}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
function fixture(initialLanguage) {
  const nodes=new Map(),root=new Element('html'),memory=new Map(initialLanguage?[['twin-turbo-language',initialLanguage]]:[]),changes=[];
  const add=(id,tag='div',text='')=>{const node=root.append(new Element(tag));node.textContent=text;nodes.set(id,node);return node;};
  for(const id of ['language-dialog','language-zh','language-en','language-toggle'])add(id,id.endsWith('dialog')?'dialog':'button');
  nodes.get('language-toggle').setAttribute('data-i18n-skip','');
  const document={documentElement:root,getElementById:id=>nodes.get(id)};
  const storage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
  const client=createI18n({document,storage,onChange:lang=>changes.push(lang)});
  return {client,document,add,nodes,memory,changes};
}

test('race, AI controls, both ghost distances and independent standings have complete English text',()=>{
  const strings=[
    ['幽灵挑战','Ghost Challenge'],['配速幽灵','Pace ghost'],['1 圈极速竞技','1-lap sprint'],['3 圈','3 laps'],['青色闪电获胜！','Cyan Lightning wins!'],
    ['领先紫色幽灵 −0.15 秒','Ahead of Purple ghost −0.15s'],
    ['第 2 圈 · 计时点 03','Lap 2 · Checkpoint 03'],
    ['你驾驶橙色赛车，与 AI 较量。WASD 或方向键均可驾驶。','Drive the Orange car against AI. Use WASD or Arrow keys.'],
    ['选择赛道','Choose a circuit'],['返回主菜单','Back to main menu'],['已找到记录。点击「加入紫色幽灵」确认。','Record found. Click “Add purple ghost” to confirm.'],
  ];
  for(const [source,expected]of strings)assert.equal(translateText(source),expected);
  for(const source of [
    '完整 3 圈前五 · 点颜色加入，再点一次取消。已选颜色可替换。',
    '还没有完整 3 圈幽灵上榜。可以直接出发，完赛后保存自己的幽灵。',
    '最快单圈前五 · 每个昵称只展示最快成绩，其他成绩保留在历史记录中。',
    '3 圈整场前五 · 每个昵称只展示最快成绩，其他成绩保留在历史记录中。 部分幽灵暂未读取，可重试。',
    '整场成绩已保存；最快单圈与幽灵已保存；三圈幽灵暂未确认；重试只补存这一部分，昵称不用重填。',
    '整场成绩已保存至历史记录，本次未进入排行榜',
    '昵称、单圈时间和驾驶轨迹会公开。榜单只展示个人最快成绩，其他记录继续保留。',
    '为 P2 的刹车 / 倒车按一个新键；Esc 取消。',
    'Enter 已用于 P1 的氮气，请换一个键。',
  ])assert.doesNotMatch(translateText(source),/[\u3400-\u9fff]/,source);
  assert.equal(translateText(' 开始比赛 ','zh'),' 开始比赛 ');
  assert.equal(translateText(' 开始比赛 '),' Start race ');
});

test('nicknames are preserved even when they contain words from the translation dictionary',()=>{
  const name='海港青色车手';
  assert.equal(translateText(`正在为紫色幽灵查找「${name}」…`),`Searching “${name}” for the Purple ghost…`);
  assert.equal(translateText(`选择「${name}」为金色幽灵`),`Choose “${name}” as the gold ghost`);
  assert.equal(translateText(`「${name}」 · 00:42.10`),`“${name}” · 00:42.10`);
  const h=fixture('en'),nickname=h.add('nickname','strong',name);nickname.setAttribute('translate','no');
  const option=h.add('choice','option',`${name} · 00:42.10`);
  h.client.init();assert.equal(nickname.textContent,name);assert.equal(option.textContent,`${name} · 00:42.10`);
  h.client.setLanguage('zh');assert.equal(nickname.textContent,name);assert.equal(option.textContent,`${name} · 00:42.10`);
});

test('every launch asks for a language; choosing persists, closes the gate and can be changed later',()=>{
  const h=fixture('en'),label=h.add('start','button','开始比赛');
  h.client.init();assert.equal(h.nodes.get('language-dialog').open,true);assert.equal(h.client.language,'en');
  assert.equal(label.textContent,'Start race');assert.deepEqual(h.changes,['en']);
  let prevented=false;h.nodes.get('language-dialog').dispatch('cancel',{preventDefault(){prevented=true;}});assert.equal(prevented,true);
  h.nodes.get('language-zh').dispatch('click');assert.equal(h.nodes.get('language-dialog').open,false);
  assert.equal(h.memory.get('twin-turbo-language'),'zh');assert.equal(label.textContent,'开始比赛');
  assert.equal(h.document.documentElement.lang,'zh-CN');assert.equal(h.nodes.get('language-toggle').textContent,'English');
  h.nodes.get('language-toggle').dispatch('click');assert.equal(h.nodes.get('language-dialog').open,true);
  h.nodes.get('language-en').dispatch('click');assert.equal(h.document.documentElement.lang,'en');
  assert.deepEqual(h.changes,['en','zh','en']);assert.equal(h.nodes.get('language-toggle').textContent,'中文');
});

test('language switching restores original text and attributes while respecting newly changed messages',()=>{
  const h=fixture(),label=h.add('status','p','等待发车'),input=h.add('nickname','input');
  input.setAttribute('placeholder','你的昵称');input.setAttribute('aria-label','P1 成绩昵称');input.value='青色车手';
  const labelNode=label.childNodes[0];
  h.client.init();h.client.setLanguage('en');assert.equal(label.textContent,'On the grid');
  assert.equal(input.getAttribute('placeholder'),'Your nickname');assert.equal(input.getAttribute('aria-label'),'P1 record nickname');
  assert.equal(input.value,'青色车手');
  labelNode.nodeValue='比赛已暂停';h.client.refresh();assert.equal(label.textContent,'Paused');
  input.setAttribute('aria-label','P2 成绩昵称');h.client.refresh();assert.equal(input.getAttribute('aria-label'),'P2 record nickname');
  h.client.setLanguage('zh');assert.equal(label.textContent,'比赛已暂停');assert.equal(input.getAttribute('aria-label'),'P2 成绩昵称');
  h.client.setLanguage('en');assert.equal(label.textContent,'Paused');
});

test('fullscreen lobby, pause and dialog labels switch both ways without translating a matching nickname',()=>{
  const pairs=[['设置','Settings'],['已暂停','Paused'],['关闭设置','Close settings'],['关闭成绩榜','Close leaderboards'],['比赛计时','Race timing'],['发车准备','Race setup'],['Language / 语言','Language'],['正在匹配…','Matching…'],['对手','opponent'],['幽灵','ghost']];
  const h=fixture('en'),labels=pairs.map(([source],index)=>{
    const label=h.add(`lobby-label-${index}`,'button',source);
    label.setAttribute('aria-label',source);label.setAttribute('title',source);return label;
  });
  const name='设置已暂停比赛计时',nickname=h.add('nickname','strong',name),input=h.add('name-input','input');
  nickname.setAttribute('translate','no');input.value=name;
  assert.equal(translateText(`「${name}」 · 00:42.10`),`“${name}” · 00:42.10`);
  h.client.init();
  for(const language of['en','zh','en']){
    h.client.setLanguage(language);
    for(const [index,pair]of pairs.entries()){
      const expected=pair[language==='en'?1:0],label=labels[index];
      assert.equal(label.textContent,expected);
      assert.equal(label.getAttribute('aria-label'),expected);assert.equal(label.getAttribute('title'),expected);
    }
    assert.equal(nickname.textContent,name);assert.equal(input.value,name);
  }
});

test('dynamic DOM text and accessibility labels are translated without altering excluded content',t=>{
  const observers=[];
  class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(){this.observing=true;}disconnect(){this.observing=false;}}
  const original=globalThis.MutationObserver;globalThis.MutationObserver=Observer;t.after(()=>{globalThis.MutationObserver=original;});
  const h=fixture('en');h.client.init();const observer=observers[0];
  const status=h.add('async-status','p','正在保存成绩与幽灵…');
  observer.callback([{type:'childList',addedNodes:[status]}]);assert.equal(status.textContent,'Saving your results and ghosts…');
  status.setAttribute('aria-label','玩家2计时点差距');observer.callback([{type:'attributes',target:status}]);
  assert.equal(status.getAttribute('aria-label'),'Player 2 checkpoint gap');assert.equal(observer.observing,true);
  const excluded=h.add('self-managed','span','海岸技术环线');excluded.setAttribute('data-i18n-skip','');
  observer.callback([{type:'childList',addedNodes:[excluded]}]);assert.equal(excluded.textContent,'海岸技术环线');
});

test('language selection works when device storage is unavailable',()=>{
  const h=fixture();const client=createI18n({document:h.document,storage:{getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}}});
  client.init();assert.equal(h.nodes.get('language-dialog').open,true);client.setLanguage('en');assert.equal(client.language,'en');
});

test('the actual HTML has no untranslated English UI copy outside the bilingual language chooser',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8')
    .replace(/<dialog\b[^>]*id="language-dialog"[\s\S]*?<\/dialog>/g,'');
  const strings=[...html.matchAll(/>([^<]+)</g)].map(match=>match[1].trim());
  strings.push(...[...html.matchAll(/(?:aria-label|placeholder|title)="([^"]+)"/g)].map(match=>match[1]));
  for(const value of strings.filter(value=>/[\u3400-\u9fff]/.test(value))) {
    assert.doesNotMatch(translateText(value),/[\u3400-\u9fff]/,`Untranslated UI: ${value}`);
  }
});

test('off-road recovery warnings translate all three countdown values and the recovery notice',()=>{
 for(const seconds of [3,2,1])assert.equal(translateText(`请返回赛道，${seconds} 秒后自动复位`),`Return to the road — automatic recovery in ${seconds}s`);
 assert.equal(translateText('回到路面即可取消倒计时'),'Return to the road to cancel the countdown');
 assert.equal(translateText('离开赛道满 7 秒 · 已自动复位'),'7 seconds off-road · Automatically recovered');
});


test('ghost challenge setup and results translate fully without exposing AI mode internals',()=>{
  const values = [
    ['幽灵挑战', 'Ghost Challenge'], ['榜首挑战', 'Leaderboard challenge'], ['自选幽灵', 'Choose ghosts'],
    ['重新匹配','Match again'],['幽灵挑战对手','Ghost challengers'],['自动匹配','Auto-match'],['正在匹配本图最快的三位车手…','Matching this circuit’s three fastest drivers…'],
    ['配速幽灵','Pace ghost'],['人类纪录','Player record'],['自由计时','Time trial'],['开始挑战','Start challenge'],
    ['本场挑战排名','Challenge standings'],['你','You'],['挑战完成','Challenge complete'],['自由计时完成','Time trial complete'],
    ['目标用时','Target time'],['已匹配 3 位人类幽灵和 3 位配速幽灵。','Matched 3 player ghosts and 3 pace ghosts.'],
    ['已匹配 1 位人类幽灵和 3 位配速幽灵。','Matched 1 player ghost and 3 pace ghosts.'],
    ['第 4 名 · 挑战完成','P4 · Challenge complete'],
  ];
  for(const [source,expected] of values)assert.equal(translateText(source),expected);
  for(const source of [
    '以起终点之间的单圈用时比较幽灵。','以从 GO 开始的整场用时比较幽灵。',
    '一个昵称，一次保存整场成绩、最快单圈和幽灵。榜单只展示个人最佳，其他成绩保留在历史记录里。',
    '当前地图还没有可用的人类幽灵，可以先自由计时。',
    '暂时无法连接幽灵榜，可以重试或自由计时。',
    '人类幽灵不足三位，已使用当前可用纪录。',
    '最快的三位不同车手，加上三位配速幽灵。',
    '配速目标约比最慢的人类幽灵多 1、2、3 秒，不参与排行榜。',
    '幽灵均不碰撞；你完赛后立即结算。','选择你喜欢的车色。',
    '镜头全屏跟随你的赛车，挑战本图最快的人类幽灵和三位配速幽灵。两套键位都可驾驶，完赛后结算。',
    '你驾驶青色赛车，与人类纪录和配速幽灵较量。WASD 或方向键均可驾驶。',
    '你驾驶橙色赛车，与人类纪录和配速幽灵较量。WASD 或方向键均可驾驶。',
  ])assert.doesNotMatch(translateText(source),/[\u3400-\u9fff]/,source);
});

test('a rejected launch explains how to restart in English, including a partly saved result', () => {
  const notice = '这次单圈起步不符合规则，幽灵未保存；请从起跑位向前重新比赛';
  assert.equal(translateText(notice + '。'), 'This lap did not follow the start rules, so its ghost was not saved. Start a new race driving forward from the grid.');
  assert.equal(translateText('需重新比赛'), 'Start a new race');
  assert.doesNotMatch(translateText('整场成绩已保存；' + notice + '。'), /[\u3400-\u9fff]/);
  assert.doesNotMatch(translateText(notice + '；整场成绩暂未确认；重试只补存这一部分，昵称不用重填。'), /[\u3400-\u9fff]/);
});
