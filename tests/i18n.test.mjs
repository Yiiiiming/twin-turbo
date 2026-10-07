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
    ['1 圈极速竞技','1-lap sprint'],['3 圈','3 laps'],['青色闪电获胜！','Cyan Lightning wins!'],
    ['领先紫色幽灵 −0.15 秒','Ahead of Purple ghost −0.15s'],
    ['第 2 圈 · 计时点 03','Lap 2 · Checkpoint 03'],
    ['你驾驶橙色赛车，与 AI 较量。WASD 或方向键均可驾驶。','Drive the Orange car against AI. Use WASD or Arrow keys.'],
    ['选择赛道','Choose a circuit'],['已找到记录。点击「加入紫色幽灵」确认。','Record found. Click “Add purple ghost” to confirm.'],
  ];
  for(const [source,expected]of strings)assert.equal(translateText(source),expected);
  for(const source of [
    '完整 3 圈前五 · 点颜色加入，再点一次取消。已选颜色可替换。',
    '还没有完整 3 圈幽灵上榜。可以直接出发，完赛后保存自己的幽灵。',
    '最快单圈前五 · 每次成绩独立排名，同一昵称可多次上榜。',
    '3 圈整场前五 · 每次完赛独立排名，同一昵称可多次上榜。 部分幽灵暂未读取，可重试。',
    '整场成绩已保存；最快单圈与幽灵已保存；三圈幽灵暂未确认；重试只补存这一部分，昵称不用重填。',
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
