import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRaceEntry } from '../race-entry.js';
import { TRACK, TRACKS } from '../engine.js';
import { ENTRY_CAMERA_CUTS } from '../entry-cameras.js';

function fixture({ reduced = false, unavailableCanvas = false, captureStrokes = false } = {}) {
  const stats = { canvases: 0, textureDraws: 0, activeObservers: 0 };
  const context = () => new Proxy({ globalAlpha: 1, rectangles: [], saved: [], path: [], strokes: [] }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${String(key)} receives finite coordinates`);
        if (key === 'save') target.saved.push({ globalAlpha: target.globalAlpha, fillStyle: target.fillStyle });
        if (key === 'restore') Object.assign(target, target.saved.pop());
        if (key === 'fillRect') target.rectangles.push({ args, fill: target.fillStyle, alpha: target.globalAlpha });
        if (captureStrokes && key === 'beginPath') target.path=[];
        if (captureStrokes && ['moveTo','lineTo','ellipse'].includes(key)) target.path.push({ type:key,args });
        if (captureStrokes && key === 'stroke') target.strokes.push({ path:[...target.path],style:target.strokeStyle,alpha:target.globalAlpha });
        if (key === 'drawImage') stats.textureDraws++;
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return { addColorStop() {} };
      };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  let document;
  class Node {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase();this.children = [];this.dataset = {};this.attributes = {};this.listeners = new Map();
      this.width = 1200;this.height = 700;this.hidden = false;this.context = context();
      this.classList = { values: new Set(), add(v) { this.values.add(v); }, remove(v) { this.values.delete(v); }, contains(v) { return this.values.has(v); } };
      this.style = { values: new Map(), setProperty(k, v) { this.values.set(k, v); }, removeProperty(k) { this.values.delete(k); } };
    }
    append(...nodes) { for (const node of nodes) { this.children.push(node);node.parent = this; } }
    appendChild(node) { this.append(node); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    removeEventListener(type, handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type); }
    getContext() { return unavailableCanvas ? null : this.context; }
    getBoundingClientRect() { return this.hero ? { left: 490, top: 90, width: 220, height: 140 } : { left: 0, top: 0, width: 1200, height: 700 }; }
    focus() { document.activeElement = this; }
    click() { this.listeners.get('click')?.({ preventDefault() {}, stopPropagation() {} }); }
  }
  const stage = new Node(), hero = new Node('canvas'), game = new Node('canvas');hero.hero = true;
  const media = new Node();media.matches = reduced;
  document = {
    hidden: false, activeElement: game, documentElement: { lang: 'zh' },
    defaultView: { devicePixelRatio: 2, matchMedia: () => media, ResizeObserver: class {
      constructor(callback) { this.callback = callback;this.observing = false; }
      observe() { this.observing = true;stats.activeObservers++; }
      disconnect() { if (this.observing) stats.activeObservers--;this.observing = false; }
    } },
    getElementById: id => ({ 'race-stage': stage, 'landmark-hologram': hero })[id],
    createElement: tag => { if (tag === 'canvas') stats.canvases++;return new Node(tag); },
  };
  const entry = createRaceEntry(document);
  function advance(seconds) { let result;for (let remaining = seconds; remaining > 1e-9;) { const dt = Math.min(.05, remaining);result = entry.update(dt);remaining -= dt; }return result; }
  function clean() {
    assert.equal(entry.active, false);assert.equal(stage.children.length, 0);
    assert.equal(stage.classList.contains('race-entry-active'), false);
    assert.equal(stage.dataset.entryPhase, undefined);assert.equal(stage.style.values.size, 0);
    assert.equal(stats.activeObservers, 0);assert.equal(media.listeners.size, 0);
    assert.deepEqual(entry.update(.1), { active: false, previewProgress: null });
  }
  return { entry, document, stage, game, media, stats, advance, clean };
}

test('all twelve real map holograms render finite entry frames without selecting or moving a physics track', () => {
  const f = fixture(), initial = TRACK.id;
  for (const id of Object.keys(TRACKS)) {
    assert.deepEqual(f.entry.start(id), { active: true, previewProgress: null });
    assert.equal(f.stage.children.length, 1);assert.equal(f.stage.dataset.entryPhase, 'train');
    f.advance(1.3);f.entry.cancel();f.clean();
  }
  assert.equal(TRACK.id, initial);assert.ok(f.stats.textureDraws > 12);
});

test('entry freezes while hidden, reveals the camera after 3.6 seconds and fully cleans up at 9.6 seconds', () => {
  const f = fixture();f.entry.start('coast-london');
  assert.equal(f.advance(3.5).previewProgress, null);
  f.document.hidden = true;const before = f.stats.textureDraws;
  for (let i = 0; i < 90; i++) assert.equal(f.entry.update(.1).previewProgress, null);
  assert.equal(f.stats.textureDraws, before, 'a hidden page does not redraw or advance the train');
  f.document.hidden = false;const first = f.advance(.1);
  assert.ok(first.active);assert.equal(first.previewProgress, 0);
  assert.equal(f.stage.dataset.entryPhase, 'preview');
  const middle = f.advance(3);assert.ok(Math.abs(middle.previewProgress - .5) < 1e-9);
  assert.deepEqual(f.advance(3), { active: false, previewProgress: null });f.clean();
});

test('skip in either phase, explicit cancel and a replacement start leave no overlay, observer or temporary UI state', () => {
  const f = fixture();
  for (const seconds of [.7, 4.3]) {
    f.entry.start('coast-beijing');f.advance(seconds);
    const button = f.stage.children[0].children[1];button.focus();button.click();
    assert.equal(f.document.activeElement, f.game);f.clean();
  }
  f.entry.start('coast-london');f.entry.start('coast-beijing');
  assert.equal(f.stage.children.length, 1);assert.equal(f.stats.activeObservers, 1);
  f.entry.skip();f.clean();f.entry.start('coast-paris');f.entry.cancel();f.clean();
});

test('reduced motion skips before creating canvas or observers and changing the preference cancels an active intro', () => {
  const reduced = fixture({ reduced: true });
  assert.deepEqual(reduced.entry.start('coast-london'), { active: false, previewProgress: null });
  assert.equal(reduced.stats.canvases, 0);reduced.clean();
  const f = fixture();f.entry.start('coast-beijing');f.advance(.8);
  f.media.listeners.get('change')({ matches: true });f.clean();
  const unavailable = fixture({ unavailableCanvas: true });unavailable.entry.start('coast-london');unavailable.clean();
});

test('preview brief dark transitions use the renderer camera cuts and the skip label follows the chosen language', () => {
  const f = fixture();f.entry.start('coast-london');
  assert.equal(f.stage.children[0].children[1].textContent, '跳过');
  f.document.documentElement.lang = 'en';f.entry.update(0);
  assert.equal(f.stage.children[0].children[1].textContent, 'Skip');
  let elapsed = 0;
  for (const cut of ENTRY_CAMERA_CUTS) {
    const time = 3.6 + cut * 6;const result = f.advance(time - elapsed);elapsed = time;
    assert.ok(Math.abs(result.previewProgress - cut) < 1e-9);
    assert.ok(Math.abs(Number(f.stage.style.values.get('--entry-cut-shade')) - .65) < 1e-9);
  }
  f.entry.cancel();f.clean();
});

test('the train covers its first frame with opaque purple and the world stays hidden until the opaque preview handoff', () => {
  const f = fixture();f.entry.start('coast-london');
  const canvas = f.stage.children[0].children[0];
  assert.deepEqual(canvas.context.rectangles[0], { args: [0,0,1200,700], fill: '#15112b', alpha: 1 });
  assert.equal(f.stage.style.values.get('--entry-canvas-opacity'), '0');
  assert.equal(f.stage.style.values.get('--entry-menu-opacity'), '1');
  assert.equal(f.stage.style.values.get('--entry-preview-opacity'), '1');
  f.advance(.375);
  assert.equal(Number(f.stage.style.values.get('--entry-canvas-opacity')), .5);
  assert.equal(Number(f.stage.style.values.get('--entry-menu-opacity')), .5);
  assert.equal(f.stage.dataset.entryPhase, 'train');
  f.advance(.375);
  assert.equal(f.stage.style.values.get('--entry-canvas-opacity'), '1');
  assert.equal(f.stage.style.values.get('--entry-menu-opacity'), '0');
  const firstPreview = f.advance(2.85);
  assert.equal(firstPreview.previewProgress, 0);
  assert.equal(f.stage.dataset.entryPhase, 'preview');
  assert.equal(f.stage.style.values.get('--entry-preview-opacity'), '1', 'the real map becomes visible only underneath a fully opaque veil');
  f.advance(.25);
  assert.ok(Math.abs(Number(f.stage.style.values.get('--entry-preview-opacity'))-.5)<1e-9);
  f.entry.cancel();f.clean();
  const css = readFileSync(new URL('../race-entry.css', import.meta.url), 'utf8');
  assert.match(css, /\.race-entry-active\[data-entry-phase="train"\] :is\(#game,#city-game\)\s*\{\s*visibility:\s*hidden\s*!important/);
  assert.doesNotMatch(css, /:is\(#game,#city-game\)\s*\{[^}]*display\s*:/, 'canvas layout remains available to the renderer');
  assert.match(css, /\.race-entry-active\[data-entry-phase="train"\] #menu\s*\{\s*display:\s*flex\s*!important/, 'the temporary selector overrides the normal menu hidden class');
});

test('the painted train has sixteen wheels paired by eight axles, and wheel rings clip as they enter the portal', () => {
  const f=fixture({captureStrokes:true});f.entry.start('coast-london');f.advance(1.2);
  const ctx=f.stage.children[0].children[0].context;
  const frame=()=>{ctx.strokes.length=0;f.entry.update(0);return {
    wheels:ctx.strokes.filter(s=>s.style==='#a4d8ff99'),
    axles:ctx.strokes.filter(s=>s.style==='#8ebdff66'),
  };};
  const full=frame();
  assert.equal(full.wheels.length,16,'four cars each show two axles and a wheel on both sides');
  assert.equal(full.axles.length,8);
  const bounds=wheel=>{
    const xs=wheel.path.map(p=>p.args[0]),ys=wheel.path.map(p=>p.args[1]);
    return {minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
  };
  full.axles.forEach((axle,index)=>{
    assert.equal(axle.path.length,2);
    axle.path.forEach((point,side)=>{
      const wheel=full.wheels[index*2+side],b=bounds(wheel);
      assert.equal(wheel.path.length,64,'the complete visible ring is painted with all 32 original segments');
      assert.ok(wheel.alpha>.99);
      assert.ok(point.args[0]>b.minX&&point.args[0]<b.maxX&&point.args[1]>b.minY&&point.args[1]<b.maxY,'each axle terminates inside its matching wheel ring');
    });
    assert.ok(axle.path[1].args[0]-axle.path[0].args[0]>20,'the two wheels occupy distinct sides of their car');
  });
  // At this instant the locomotive front axle is exactly on the portal plane.
  const frontAxleAtPortal=.7+2.6*Math.sqrt((1800-66-640)/1960);
  f.advance(frontAxleAtPortal-1.2);const cut=frame();
  assert.equal(cut.wheels.length,16,'the visible rear half of each crossing wheel remains until it passes through');
  assert.equal(cut.wheels.filter(w=>w.path.length<64).length,2,'only the locomotive front wheel pair is clipped');
  for(const wheel of cut.wheels.filter(w=>w.path.length<64)){
    assert.ok(wheel.path.length>=30&&wheel.path.length<=38,'the portal reveals approximately half the original circular segments');
    assert.ok(wheel.path.every(p=>p.type==='moveTo'||p.type==='lineTo'),'no artificial ellipse or portal cap is added');
  }
  f.advance(3.35-frontAxleAtPortal);const gone=frame();
  assert.equal(gone.wheels.length,0);assert.equal(gone.axles.length,0,'wheel outlines and axles do not remain beyond the portal');
  f.entry.cancel();f.clean();
});

test('portal accents turn exactly once with the train while the elliptical opening remains fixed', () => {
  const f=fixture({captureStrokes:true});f.entry.start('coast-beijing');
  const ctx=f.stage.children[0].children[0].context;let elapsed=0;
  function rimAt(time){
    f.advance(time-elapsed);elapsed=time;ctx.strokes.length=0;f.entry.update(0);
    const opening=ctx.strokes.find(s=>s.style==='#c3a1ffb3').path[0].args;
    const arc=ctx.strokes.find(s=>s.style==='#96eaffd9').path[0].args;
    const ticks=ctx.strokes.find(s=>s.style==='#bd9fffc4').path.filter(p=>p.type==='ellipse').map(p=>p.args);
    assert.equal(ticks.length,3,'three sparse rim marks rotate with the luminous arc');
    assert.equal(arc[4],0,'the elliptical aperture itself never tilts or flips');
    for(const tick of ticks)assert.deepEqual(tick.slice(0,5),arc.slice(0,5));
    return {opening,arc,ticks};
  }
  const first=rimAt(.55),early=rimAt(.56),middle=rimAt(1.925),last=rimAt(3.3),settled=rimAt(3.5);
  for(const frame of [early,middle,last,settled]){
    assert.deepEqual(frame.opening,first.opening,'the train opening keeps exactly the same position and size');
    assert.deepEqual(frame.arc.slice(0,5),first.arc.slice(0,5));
    assert.ok(Math.abs((frame.arc[6]-frame.arc[5])-.68)<1e-9);
  }
  assert.ok(early.arc[5]-first.arc[5]<.001,'the rim eases into motion');
  assert.ok(Math.abs(middle.arc[5]-first.arc[5]-Math.PI)<1e-9);
  assert.ok(Math.abs(last.arc[5]-first.arc[5]-Math.PI*2)<1e-9,'the full visible pass is one revolution, not a looping spin');
  assert.deepEqual(settled.arc,last.arc,'rotation settles before the map transition');
  for(let i=0;i<3;i++)assert.ok(Math.abs(last.ticks[i][5]-first.ticks[i][5]-Math.PI*2)<1e-9);
  f.entry.cancel();f.clean();
});
