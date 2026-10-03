import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';
import { LEADERBOARD_VERSION, normalizeName } from '../worker/rules.js';

const migrationDirectory=fileURLToPath(new URL('../drizzle/',import.meta.url));
const origin='https://yiiiiming.github.io';
const base='https://scores.example.test';

/** D1's async statement API backed by actual SQLite, using the production SQL. */
class D1Database {
  constructor() {
    this.sqlite=new DatabaseSync(':memory:');
    this.executed=[];
    for(const name of readdirSync(migrationDirectory).filter(name=>name.endsWith('.sql')).sort()) {
      this.sqlite.exec(readFileSync(`${migrationDirectory}/${name}`,'utf8'));
    }
  }
  prepare(sql) {
    const database=this;
    function statement(parameters=[]) {
      return {
        bind(...values){return statement(values);},
        async all(){
          await Promise.resolve();
          database.executed.push({operation:'all',sql,parameters});
          return {success:true,results:database.sqlite.prepare(sql).all(...parameters),meta:{}};
        },
        async first(column){
          await Promise.resolve();
          database.executed.push({operation:'first',sql,parameters});
          const row=database.sqlite.prepare(sql).get(...parameters);
          return row===undefined?null:column===undefined?row:row[column]??null;
        },
        async run(){
          // Each request gets to the await before competing SQL statements run.
          // SQLite then executes each INSERT...SELECT atomically, as D1 does.
          await new Promise(resolve=>setImmediate(resolve));
          database.executed.push({operation:'run',sql,parameters});
          const result=database.sqlite.prepare(sql).run(...parameters);
          return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};
        },
      };
    }
    return statement();
  }
  count(){return Number(this.sqlite.prepare('SELECT COUNT(*) AS count FROM records').get().count);}
  close(){this.sqlite.close();}
}

function fixture(t) {
  const DB=new D1Database();t.after(()=>DB.close());return {DB};
}
function score(overrides={}) {
  return {id:'score_0001',version:LEADERBOARD_VERSION,laps:3,timeMs:135000,
    name:'橙色赛车手',playerId:1,mode:'local',finished:true,...overrides};
}
function request(path,{method='GET',body,headers={}}={}) {
  const merged={Origin:origin,...headers};
  if(body!==undefined&&!Object.keys(merged).some(key=>key.toLowerCase()==='content-type'))merged['Content-Type']='application/json';
  return new Request(`${base}${path}`,{method,headers:merged,...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function call(env,path,options={}) {
  const response=await worker.fetch(request(path,options),env);
  return {response,status:response.status,data:response.status===204?null:await response.json()};
}
const readBoard=(env,laps=3)=>call(env,`/api/leaderboard?laps=${laps}&version=${encodeURIComponent(LEADERBOARD_VERSION)}`);
const submit=(env,value,headers)=>call(env,'/api/records',{method:'POST',body:value,headers});
const qualify=(env,value)=>call(env,'/api/qualify',{method:'POST',body:value});
async function seed(env,times,laps=3,prefix='seed') {
  for(const [index,timeMs]of times.entries()) {
    const result=await submit(env,score({id:`${prefix}_${String(index).padStart(4,'0')}`,laps,timeMs}));
    assert.equal(result.status,200,JSON.stringify(result.data));
  }
}

test('migrations create an empty shared leaderboard and responses are uncached JSON',async t=>{
  const env=fixture(t);
  for(const laps of [3,5]) {
    const result=await readBoard(env,laps);
    assert.equal(result.status,200);
    assert.deepEqual(result.data,{entries:[],laps,version:LEADERBOARD_VERSION});
    assert.match(result.response.headers.get('Content-Type'),/application\/json/);
    assert.equal(result.response.headers.get('Cache-Control'),'no-store');
    assert.equal(result.response.headers.get('Access-Control-Allow-Origin'),origin);
  }
  assert.equal(env.DB.count(),0);
  const indexes=env.DB.sqlite.prepare("PRAGMA index_list('records')").all();
  assert.ok(indexes.some(index=>index.name==='records_id'&&index.unique===1));
  assert.ok(indexes.some(index=>index.name==='records_ranking'));
});

test('independent clients read the same persisted scores while 3- and 5-lap boards stay separate',async t=>{
  const env=fixture(t),three=score({id:'three_0001',timeMs:133456}),five=score({id:'five_00001',laps:5,timeMs:218765,playerId:2});
  assert.equal((await submit(env,three)).status,200);
  assert.equal((await submit(env,five)).status,200);
  const clientA=await readBoard({DB:env.DB},3),clientB=await readBoard({DB:env.DB},3),longBoard=await readBoard({DB:env.DB},5);
  assert.deepEqual(clientA.data,clientB.data);
  assert.deepEqual(clientA.data.entries.map(entry=>entry.id),[three.id]);
  assert.deepEqual(longBoard.data.entries.map(entry=>entry.id),[five.id]);
  assert.equal(clientA.data.entries[0].timeMs,three.timeMs);
  assert.ok(Number.isSafeInteger(clientA.data.entries[0].createdAt));
  assert.equal(env.DB.count(),2);
});

test('qualification is read-only and uses current top-five ranking with new ties placed last',async t=>{
  const env=fixture(t);
  await seed(env,[100000,110000,120000,130000,140000]);
  const writesBefore=env.DB.executed.filter(entry=>entry.operation==='run').length;
  for(const [timeMs,rank]of [[95000,1],[120000,4],[139999,5],[140000,null],[150000,null]]) {
    const result=await qualify(env,score({timeMs}));
    assert.equal(result.status,200);assert.equal(result.data.rank,rank);
    assert.equal(result.data.entries.length,5);
  }
  assert.equal(env.DB.count(),5);
  assert.equal(env.DB.executed.filter(entry=>entry.operation==='run').length,writesBefore);
});

test('the atomic submission admits only a current top-five score and preserves insertion order for ties',async t=>{
  const env=fixture(t);
  await seed(env,[100000,100000,100000,100000,100000]);
  const initial=await readBoard(env);
  assert.deepEqual(initial.data.entries.map(entry=>entry.id),['seed_0000','seed_0001','seed_0002','seed_0003','seed_0004']);
  for(const timeMs of [100000,100001]) {
    const denied=await submit(env,score({id:`denied_${timeMs}`,timeMs}));
    assert.equal(denied.status,409);assert.equal(denied.data.error,'rank_changed');
  }
  assert.equal(env.DB.count(),5);
  const accepted=await submit(env,score({id:'faster_0001',timeMs:99999}));
  assert.equal(accepted.status,200);assert.equal(accepted.data.rank,1);
  assert.deepEqual(accepted.data.entries.map(entry=>entry.id),['faster_0001','seed_0000','seed_0001','seed_0002','seed_0003']);
  assert.equal(accepted.data.entries.length,5);
  // Superseded records may remain as submission history; only five are visible.
  assert.equal(env.DB.count(),6);
});

test('two candidates can both qualify for fifth, but simultaneous equal submissions admit only one',async t=>{
  const env=fixture(t);
  await seed(env,[90000,91000,92000,93000]);
  const a=score({id:'parallel_a',timeMs:100000}),b=score({id:'parallel_b',timeMs:100000});
  const checks=await Promise.all([qualify(env,a),qualify(env,b)]);
  assert.deepEqual(checks.map(result=>result.data.rank),[5,5]);assert.equal(env.DB.count(),4);
  const attempts=await Promise.all([submit(env,a),submit(env,b)]);
  assert.deepEqual(attempts.map(result=>result.status).sort(),[200,409]);
  assert.equal(attempts.find(result=>result.status===409).data.error,'rank_changed');
  const board=await readBoard(env);
  assert.equal(board.data.entries.length,5);assert.equal(env.DB.count(),5);
  assert.equal(board.data.entries.filter(entry=>entry.id===a.id||entry.id===b.id).length,1);
});

test('many interleaved candidates leave exactly the globally fastest five visible',async t=>{
  const env=fixture(t);
  const candidates=Array.from({length:18},(_,index)=>score({id:`candidate_${String(index).padStart(2,'0')}`,timeMs:126000-index*1200}));
  const results=await Promise.all(candidates.map(candidate=>submit(env,candidate)));
  assert.ok(results.every(result=>[200,409].includes(result.status)));
  const expected=[...candidates].sort((a,b)=>a.timeMs-b.timeMs).slice(0,5).map(candidate=>candidate.id);
  assert.deepEqual((await readBoard(env)).data.entries.map(entry=>entry.id),expected);
});

test('same-ID retries are idempotent, even if later scores push the original off the visible board',async t=>{
  const env=fixture(t),value=score({id:'retry_0001',timeMs:140000});
  const first=await submit(env,value),retry=await submit(env,value);
  assert.equal(first.status,200);assert.equal(retry.status,200);
  assert.deepEqual(retry.data,first.data);assert.equal(env.DB.count(),1);
  await seed(env,[90000,91000,92000,93000,94000]);
  const countBefore=env.DB.count(),later=await submit(env,value);
  assert.equal(later.status,200);assert.equal(later.data.saved,true);assert.equal(later.data.rank,null);
  assert.equal(env.DB.count(),countBefore);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM records WHERE id=?').get(value.id).count,1);
});

test('concurrent duplicate retries store a single row',async t=>{
  const env=fixture(t),value=score({id:'same_request'});
  const results=await Promise.all(Array.from({length:8},()=>submit(env,value)));
  assert.ok(results.every(result=>result.status===200&&result.data.saved));
  assert.equal(env.DB.count(),1);assert.equal((await readBoard(env)).data.entries.length,1);
});

test('an existing submission ID cannot be reused for a different score, name, player or category',async t=>{
  const env=fixture(t),value=score({id:'identity_01'});
  const initial=await submit(env,value);assert.equal(initial.status,200);
  const conflicts=[{timeMs:134999},{name:'另一个人'},{playerId:2},{mode:'ai'},{laps:5,timeMs:220000}];
  for(const change of conflicts) {
    const result=await submit(env,{...value,...change});
    assert.equal(result.status,409);assert.equal(result.data.error,'id_conflict');
    assert.equal(env.DB.count(),1);
  }
  assert.deepEqual((await readBoard(env)).data.entries,initial.data.entries);
  assert.deepEqual((await readBoard(env,5)).data.entries,[]);
});

test('AI competitors, unfinished runs, unsupported categories and impossible times are rejected before writes',async t=>{
  const env=fixture(t);
  const invalid=[
    {mode:'ai',playerId:2},{isAI:true},{isHuman:false},{finished:false},{finished:undefined},{finished:1},
    {laps:1},{laps:4},{laps:'3'},{timeMs:74999},{laps:5,timeMs:124999},{timeMs:3*3600000+1},
    {timeMs:0},{timeMs:-1},{timeMs:120000.5},{timeMs:'135000'},{timeMs:Number.MAX_SAFE_INTEGER+1},
    {playerId:0},{playerId:3},{mode:'unknown'},{version:'old-track-version'},
  ];
  for(const patch of invalid)for(const path of ['/api/qualify','/api/records']) {
    const result=await call(env,path,{method:'POST',body:score(patch)});
    assert.equal(result.status,400,`${path} accepted ${JSON.stringify(patch)}`);
    assert.equal(result.data.error,'invalid_score');
  }
  assert.equal(env.DB.count(),0);assert.equal(env.DB.executed.length,0);
  const humanInAI=await submit(env,score({id:'human_in_ai',mode:'ai',playerId:1}));
  assert.equal(humanInAI.status,200,'a real human result from AI mode is eligible');
});

test('names remain bound SQL text, normalization is stored, and injection never executes',async t=>{
  const env=fixture(t);
  env.DB.sqlite.exec("CREATE TABLE r(value TEXT); INSERT INTO r VALUES ('still here')");
  const injection="');DROP TABLE r;";
  assert.ok(injection.length<=16);
  const result=await submit(env,score({id:'injection_1',name:injection}));
  assert.equal(result.status,200);assert.equal(result.data.entries[0].name,injection);
  assert.equal(env.DB.sqlite.prepare('SELECT value FROM r').get().value,'still here');
  assert.equal(env.DB.count(),1);
  const raw='  赛车\u0000\u200b选手🎮名字很长很长很长很长很长  ';
  const normalized=await submit(env,score({id:'normalize_1',name:raw,timeMs:134000}));
  assert.equal(normalized.status,200);assert.equal(normalized.data.entries[0].name,normalizeName(raw));
  assert.ok(Array.from(normalized.data.entries[0].name).length<=16);
  for(const patch of [{name:' \u0000 '},{name:42},{id:'short'},{id:'bad/id_123'},{id:'x'.repeat(129)}]) {
    const denied=await submit(env,score(patch));
    assert.equal(denied.status,400);assert.equal(denied.data.error,'invalid_name_or_id');
  }
  assert.equal(env.DB.count(),2);
});

test('CORS allows the published game, offline and local development, and rejects unrelated origins',async t=>{
  const env=fixture(t),path=`/api/leaderboard?laps=3&version=${encodeURIComponent(LEADERBOARD_VERSION)}`;
  for(const allowedOrigin of [origin,'null','http://localhost:8765','http://127.0.0.1:8080']) {
    const result=await call(env,path,{headers:{Origin:allowedOrigin}});
    assert.equal(result.status,200);assert.equal(result.response.headers.get('Access-Control-Allow-Origin'),allowedOrigin);
    assert.equal(result.response.headers.get('Vary'),'Origin');
    const preflight=await call({},'/api/records',{method:'OPTIONS',headers:{Origin:allowedOrigin,'Access-Control-Request-Method':'POST'}});
    assert.equal(preflight.status,204);assert.equal(preflight.response.headers.get('Access-Control-Allow-Origin'),allowedOrigin);
    assert.match(preflight.response.headers.get('Access-Control-Allow-Methods'),/POST/);
    assert.match(preflight.response.headers.get('Access-Control-Allow-Headers'),/Content-Type/);
  }
  for(const deniedOrigin of ['https://attacker.example','https://yiiiiming.github.io.attacker.example','https://localhost:8765']) {
    const result=await call(env,path,{headers:{Origin:deniedOrigin}});
    assert.equal(result.status,403);assert.equal(result.data.error,'origin_not_allowed');
    assert.equal(result.response.headers.get('Access-Control-Allow-Origin'),null);
  }
  const noOrigin=await worker.fetch(new Request(`${base}${path}`),env);
  assert.equal(noOrigin.status,200);assert.equal(noOrigin.headers.get('Access-Control-Allow-Origin'),null);
});

test('missing or failing D1 returns a CORS-readable 503 without exposing database error details',async t=>{
  const errorLog=t.mock.method(console,'error',()=>{});
  const unavailable={DB:{prepare(){throw new Error('secret database address and credentials');}}};
  for(const env of [{},unavailable]) {
    for(const [path,options]of [
      [`/api/leaderboard?laps=3&version=${encodeURIComponent(LEADERBOARD_VERSION)}`,{}],
      ['/api/records',{method:'POST',body:score()}],
      ['/api/qualify',{method:'POST',body:score()}],
    ]) {
      const result=await call(env,path,options);
      assert.equal(result.status,503);assert.deepEqual(result.data,{error:'temporarily_unavailable'});
      assert.equal(result.response.headers.get('Access-Control-Allow-Origin'),origin);
      assert.equal(result.response.headers.get('Cache-Control'),'no-store');
    }
  }
  assert.ok(errorLog.mock.callCount()>=3);
});

test('wrong methods, malformed JSON, oversized payloads and invalid read categories are rejected',async t=>{
  const env=fixture(t);
  for(const suffix of ['laps=2','laps=3','laps=3&version=old']) {
    const result=await call(env,`/api/leaderboard?${suffix}`);
    assert.equal(result.status,400);assert.equal(result.data.error,'invalid_category');
  }
  assert.equal((await call(env,'/api/records')).status,405);
  assert.equal((await call(env,'/api/qualify')).status,405);
  assert.equal((await call(env,'/api/leaderboard',{method:'POST',body:score()})).status,405);
  assert.equal((await call(env,'/unknown')).status,404);
  const wrongType=await call(env,'/api/records',{method:'POST',body:score(),headers:{'Content-Type':'text/plain'}});
  assert.equal(wrongType.status,415);assert.equal(wrongType.data.error,'json_required');
  const malformed=await worker.fetch(new Request(`${base}/api/records`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{no'}),env);
  assert.equal(malformed.status,400);assert.equal((await malformed.json()).error,'invalid_json');
  const oversized=await call(env,'/api/records',{method:'POST',body:score({name:'a'.repeat(4097)})});
  assert.equal(oversized.status,413);assert.equal(oversized.data.error,'payload_too_large');
  assert.equal(env.DB.count(),0);
});

test('request limits measure UTF-8 bytes, including the exact 4096-byte boundary',async t=>{
  const env=fixture(t),encoder=new TextEncoder();
  const multibyte=score({name:'赛'.repeat(1400)}),text=JSON.stringify(multibyte);
  assert.ok(text.length<4096&&encoder.encode(text).length>4096);
  const denied=await qualify(env,multibyte);
  assert.equal(denied.status,413);assert.equal(denied.data.error,'payload_too_large');
  const boundary=score({padding:''});
  boundary.padding='a'.repeat(4096-encoder.encode(JSON.stringify(boundary)).length);
  assert.equal(encoder.encode(JSON.stringify(boundary)).length,4096);
  assert.equal((await qualify(env,boundary)).status,200);
  assert.equal((await qualify(env,{...boundary,padding:boundary.padding+'a'})).status,413);
  assert.equal(env.DB.count(),0);
});

test('streamed UTF-8 split across chunks decodes correctly and oversized streams are canceled',async t=>{
  const env=fixture(t),value=score({id:'streamed_01',name:'车🏎️手'}),bytes=new TextEncoder().encode(JSON.stringify(value));
  let offset=0;
  const body=new ReadableStream({pull(controller){
    if(offset===bytes.length){controller.close();return;}
    controller.enqueue(bytes.slice(offset,offset+1));offset++;
  }});
  const response=await worker.fetch(new Request(`${base}/api/records`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body,duplex:'half'}),env);
  assert.equal(response.status,200);assert.equal((await response.json()).entries[0].name,value.name);
  let canceled=false;
  const oversized=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(2049));},cancel(){canceled=true;}});
  const tooLarge=await worker.fetch(new Request(`${base}/api/records`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:oversized,duplex:'half'}),env);
  assert.equal(tooLarge.status,413);assert.equal(canceled,true);assert.equal(env.DB.count(),1);
});
