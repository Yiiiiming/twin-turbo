import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/traffic.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
function memory() {
  const data = new Map();
  return {getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), data};
}
function page(options={}) {
  const calls = [], timers = [], storage = options.storage || memory();
  const doc = Object.assign(new EventTarget(), {visibilityState: 'visible'}, options.doc);
  const nav = {...options.nav}, clock = {now: '2026-11-03T05:59:59.000Z'};
  class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [clock.now])); } }
  const win = {crypto: {randomUUID}, localStorage:storage, fetch:async (url, args) => {
    calls.push({url, ...args, payload:JSON.parse(args.body)});
    const reply = options.replies?.shift() ?? 204;
    if(reply instanceof Error) throw reply;
    return {status:reply};
  }};
  const ctx = vm.createContext({window:win, navigator:nav, document:doc,
    location:new URL(options.url || 'https://yiiiiming.github.io/twin-turbo/?v=abc#menu'),
    setTimeout:fn=>timers.push(fn), Date:FakeDate, Intl});
  const load=()=>vm.runInContext(source, ctx);
  return {doc,nav,win,clock,calls,timers,storage,load};
}

test('only an activated visible document counts, once across focus changes and duplicate installs', async () => {
  const p=page({doc:{visibilityState:'hidden',prerendering:true}});
  p.load(); p.load(); await settle(); assert.equal(p.calls.length,0);
  p.doc.visibilityState='visible';p.doc.dispatchEvent(new Event('visibilitychange'));await settle();
  assert.equal(p.calls.length,0);
  p.doc.prerendering=false;p.doc.dispatchEvent(new Event('prerenderingchange'));
  p.doc.dispatchEvent(new Event('visibilitychange'));p.load();await settle();
  assert.equal(p.calls.length,1);
  const request=p.calls[0];assert.equal(request.method,'POST');
  assert.equal(request.url,'https://twin-turbo-records-yiiiiming.heym0701.chatgpt.site/api/traffic/visit');
  assert.equal(request.credentials,'omit');assert.equal(request.referrerPolicy,'no-referrer');
  assert.deepEqual(Object.keys(request.payload).sort(),['day','viewId','visitorId']);
  assert.equal(request.headers['Content-Type'],'application/json');
  assert.equal(request.payload.day,'2026-11-02');
});

test('same-day refresh and simultaneous tabs reuse one daily browser ID; each page opening has its own ID', async () => {
  const storage=memory();let lockCalls=0, last=Promise.resolve();
  const nav={locks:{request:(name,fn)=>{lockCalls++;return last=last.then(fn);}}};
  const pages=[page({storage,nav}),page({storage,nav,url:'https://yiiiiming.github.io/twin-turbo/index.html'})];
  for(const p of pages)p.load();await settle();
  const [a,b]=pages.map(p=>p.calls[0].payload);
  assert.equal(lockCalls,2);assert.equal(a.visitorId,b.visitorId);assert.notEqual(a.viewId,b.viewId);
  assert.match(a.visitorId,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);assert.equal(storage.data.size,1);
  const next=page({storage,nav});next.clock.now='2026-11-03T06:00:00.000Z';next.load();await settle();
  assert.equal(next.calls[0].payload.day,'2026-11-03');assert.notEqual(next.calls[0].payload.visitorId,a.visitorId);
  assert.equal(storage.data.size,1);assert.ok(![...storage.data.values()][0].includes(a.visitorId));
});

test('Chicago summer and winter boundaries are independent of browser time zone', async () => {
  for(const [now,day] of [['2026-07-01T04:59:59Z','2026-06-30'],['2026-07-01T05:00:00Z','2026-07-01'],
    ['2026-11-01T05:05:00Z','2026-11-01'],['2026-11-02T05:59:59Z','2026-11-01']]){
    const p=page();p.clock.now=now;p.load();await settle();assert.equal(p.calls[0].payload.day,day);
  }
});

test('other games, local previews, offline files, privacy signals and automated browsers do not access storage or send', async () => {
  for(const options of [
    {url:'http://127.0.0.1:8873/twin-turbo/'},{url:'file:///tmp/Twin%20Turbo.html'},
    {url:'https://yiiiiming.github.io/mayi-shangshu/'},{url:'https://yiiiiming.github.io/twin-turbo/tools/'},
    {url:'https://example.com/twin-turbo/'},{nav:{globalPrivacyControl:true}},
    {nav:{doNotTrack:'1'}},{nav:{msDoNotTrack:'1'}},{nav:{webdriver:true}}
  ]){
    const p=page(options);p.load();await settle();assert.equal(p.calls.length,0);assert.equal(p.storage.data.size,0);
  }
});

test('blocked storage still counts the opening without inventing a unique visitor', async () => {
  const p=page();Object.defineProperty(p.win,'localStorage',{get(){throw new Error('SecurityError');}});
  p.load();await settle();assert.equal(p.calls.length,1);assert.equal(p.calls[0].payload.visitorId,null);
});

test('retryable response or network error retries once with identical IDs; rejected or successful visits do not retry', async () => {
  for(const status of [503,408,new Error('network')]){
    const p=page({replies:[status,503]});p.load();await settle();assert.equal(p.timers.length,1);
    p.timers.shift()();await settle();assert.equal(p.calls.length,2);
    assert.equal(p.calls[0].body,p.calls[1].body);assert.equal(p.timers.length,0);
  }
  for(const status of [200,204,400,403,429]){
    const p=page({replies:[status]});p.load();await settle();assert.equal(p.calls.length,1);assert.equal(p.timers.length,0);
  }
});

test('a retry across local midnight or after opting out is not sent', async () => {
  for(const change of [p=>p.clock.now='2026-11-03T06:00:01Z', p=>p.nav.globalPrivacyControl=true]){
    const p=page({replies:[503]});p.load();await settle();change(p);
    p.timers.shift()();await settle();assert.equal(p.calls.length,1);
  }
});
