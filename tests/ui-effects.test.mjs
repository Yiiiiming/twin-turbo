import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';

class Target {
  constructor(){this.events=new Map();this.children=[];this.style={};this.dataset={};const values=new Set();this.classList={add:v=>values.add(v),remove:v=>values.delete(v),contains:v=>values.has(v),toggle:(v,on)=>on?values.add(v):values.delete(v)};}
  addEventListener(type,fn){this.events.set(type,[...(this.events.get(type)||[]),fn]);}
  emit(type,event={}){for(const fn of this.events.get(type)||[])fn(event);}
  appendChild(node){node.parentNode=this;this.children.push(node);return node;}
  setAttribute(){}
  closest(){for(let node=this;node;node=node.parentNode)if(node.dialog&&node.open)return node;return null;}
}
let sequence=0;
async function load(t,{fine=true,reduced=false}={}){
  const document=new Target(),window=new Target(),stage=new Target(),body=new Target(),root=new Target();
  document.body=body;document.documentElement=root;document.hidden=false;document.getElementById=id=>id==='race-stage'?stage:null;document.createElement=()=>new Target();
  const pointer=new Target(),motion=new Target();pointer.matches=fine;motion.matches=reduced;
  window.matchMedia=query=>query.includes('reduced-motion')?motion:pointer;
  let now=0,id=0;const frames=new Map();
  const globals={document,window,performance:{now:()=>now},requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:frame=>frames.delete(frame)};
  const previous=new Map(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const[k,v]of Object.entries(globals))Object.defineProperty(globalThis,k,{value:v,configurable:true});
  t.after(()=>{for(const[k,v]of previous)v?Object.defineProperty(globalThis,k,v):delete globalThis[k];});
  const source=(await readFile(new URL('../src/ui-effects.js',import.meta.url),'utf8'))
    .replace("from './track-select.js'","from 'data:text/javascript,export function enhanceTrackSelect(){}'")
    .replace("from './landmark-hologram.js'","from 'data:text/javascript,export function initLandmarkHologram(){}'");
  await import(`data:text/javascript;base64,${Buffer.from(source+`\n// ${++sequence}`).toString('base64')}`);
  const trail=stage.children[0];
  return {document,window,stage,root,body,pointer,motion,trail,frames,
    move(target,x,y,type='mouse'){document.emit('pointermove',{target,clientX:x,clientY:y,pointerType:type});},
    frame(dt=16.7){now+=dt;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now));}};
}
test('fast movement across menu, controls, modal dialogs and game canvas keeps a stable hidden native cursor and exact inner ring',async t=>{
  const ui=await load(t),menu=new Target(),button=new Target(),canvas=new Target(),dialog=new Target(),dialogButton=new Target();
  dialog.dialog=true;dialog.open=true;dialog.appendChild(dialogButton);
  const targets=[menu,button,dialogButton,canvas];
  for(let i=0;i<200;i++){
    const target=targets[i%4];ui.move(target,i*7%1200,i*13%700);
    assert.ok(ui.root.classList.contains('orbit-cursor'));assert.ok(ui.body.classList.contains('orbit-cursor'));
    assert.equal(ui.trail.parentNode,target===dialogButton?dialog:ui.stage);
    assert.equal(ui.trail.children[0].style.transform,`translate3d(${i*7%1200}px,${i*13%700}px,0) translate(-50%,-50%)`);
    assert.ok(ui.trail.classList.contains('visible'));assert.ok(ui.frames.size<=1);
  }
  ui.body.dataset.raceState='racing';ui.frame(1601);
  assert.equal(ui.trail.classList.contains('visible'),false);assert.ok(ui.root.classList.contains('orbit-cursor'),'idle racing must not restore the system arrow');
  ui.move(canvas,100,200);ui.window.emit('blur');assert.equal(ui.frames.size,0);assert.ok(ui.root.classList.contains('orbit-cursor'));
  ui.move(canvas,10,20);ui.document.emit('pointerout',{relatedTarget:null});assert.equal(ui.trail.classList.contains('visible'),false);
  ui.move(button,30,40);assert.ok(ui.trail.classList.contains('visible'),'returning from browser chrome restores rings');
});
test('coarse and no-hover pointers retain native behavior and touch never creates a mouse trail',async t=>{
  const ui=await load(t,{fine:false});ui.move(ui.stage,20,30,'touch');
  assert.equal(ui.root.classList.contains('orbit-cursor'),false);assert.equal(ui.frames.size,0);
  ui.pointer.matches=true;ui.pointer.emit('change');ui.move(ui.stage,20,30);
  assert.ok(ui.root.classList.contains('orbit-cursor'));assert.ok(ui.trail.classList.contains('visible'));
  ui.move(ui.stage,30,40,'touch');assert.equal(ui.trail.classList.contains('visible'),false);
  ui.pointer.matches=false;ui.pointer.emit('change');assert.equal(ui.root.classList.contains('orbit-cursor'),false);assert.equal(ui.frames.size,0);
});
test('reduced motion uses immediate concentric rings without replacing them with a system arrow or a trailing animation',async t=>{
  const ui=await load(t,{reduced:true});ui.move(ui.stage,20,30);ui.move(ui.stage,900,400);ui.frame();
  assert.ok(ui.root.classList.contains('orbit-cursor'));assert.ok(ui.trail.classList.contains('visible'));
  assert.ok(ui.trail.children.every(ring=>ring.style.transform==='translate3d(900px,400px,0) translate(-50%,-50%)'));
  assert.equal(ui.frames.size,0,'no continued smoothing or motion after the pointer stops');
});
test('root, descendants and modal/pseudo surfaces use a genuinely transparent native cursor with a none fallback',async()=>{
  const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
  const rule=css.match(/(html\.orbit-cursor[^{}]+)\{\s*cursor:url\("data:image\/png;base64,([^"]+)"\) 0 0,none!important;/);
  assert.ok(rule);for(const selector of ['html.orbit-cursor','html.orbit-cursor *','html.orbit-cursor *::before','html.orbit-cursor *::after','html.orbit-cursor ::backdrop'])assert.ok(rule[1].split(',').map(s=>s.trim()).includes(selector));
  const png=Buffer.from(rule[2],'base64'),chunks=[];
  assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),1);assert.equal(png.readUInt32BE(20),1);
  for(let offset=8;offset<png.length;){const length=png.readUInt32BE(offset);if(png.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(png.subarray(offset+8,offset+8+length));offset+=length+12;}
  assert.deepEqual([...inflateSync(Buffer.concat(chunks))],[0,0,0,0,0],'one fully transparent RGBA pixel');
});
