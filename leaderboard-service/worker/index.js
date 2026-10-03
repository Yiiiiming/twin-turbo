import { LEADERBOARD_VERSION, normalizeName, qualifyingRank } from './rules.js';

const RANK_SQL = 'SELECT id,name,time_ms AS timeMs,laps,player_id AS playerId,mode,created_at AS createdAt FROM records WHERE version=? AND laps=? ORDER BY time_ms,seq LIMIT 5';
const INSERT_SQL = `INSERT OR IGNORE INTO records (id,version,laps,time_ms,name,player_id,mode,created_at)
 SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM (SELECT 1 FROM records WHERE version=? AND laps=? AND time_ms<=? LIMIT 5))<5`;
const recentWrites = new Map();
const allowedOrigins = new Set(['https://yiiiiming.github.io', 'null']);
function cors(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  if (!allowedOrigins.has(origin) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return null;
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', 'Vary': 'Origin' };
}
function json(data,status=200,headers={}) {
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
}
function scoreValid(body) {
  return body?.version===LEADERBOARD_VERSION && qualifyingRank([],body)!==null
    && body.timeMs>=body.laps*25000 && body.timeMs<=body.laps*3600000;
}
async function board(db,laps) { return (await db.prepare(RANK_SQL).bind(LEADERBOARD_VERSION,laps).all()).results; }
async function boundedBody(request) {
  if(Number(request.headers.get('Content-Length'))>4096)return null;
  if(!request.body)return '';
  const reader=request.body.getReader(),chunks=[];
  let size=0;
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>4096){await reader.cancel();return null;}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(bytes);
}
function limited(request) {
  const identity=request.headers.get('CF-Connecting-IP');
  if(!identity)return false;
  const minute=Math.floor(Date.now()/60000),previous=recentWrites.get(identity);
  const count=previous?.minute===minute?previous.count+1:1;
  if(recentWrites.size>2048)recentWrites.clear();
  recentWrites.set(identity,{minute,count});
  return count>20;
}
export default {
  async fetch(request,env) {
    const headers=cors(request);
    if(headers===null)return json({error:'origin_not_allowed'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    const url=new URL(request.url);
    if(url.pathname==='/')return json({service:'Twin Turbo shared leaderboard',game:'https://yiiiiming.github.io/mayi-shangshu/twin-turbo/',version:LEADERBOARD_VERSION},200,headers);
    if(!['/api/leaderboard','/api/qualify','/api/records'].includes(url.pathname))return json({error:'not_found'},404,headers);
    if(!env?.DB)return json({error:'temporarily_unavailable'},503,headers);
    try {
      if(url.pathname==='/api/leaderboard') {
        if(request.method!=='GET')return json({error:'method_not_allowed'},405,headers);
        const laps=Number(url.searchParams.get('laps'));
        if(![3,5].includes(laps)||url.searchParams.get('version')!==LEADERBOARD_VERSION)return json({error:'invalid_category'},400,headers);
        return json({entries:await board(env.DB,laps),laps,version:LEADERBOARD_VERSION},200,headers);
      }
      if(request.method!=='POST')return json({error:'method_not_allowed'},405,headers);
      if(!request.headers.get('Content-Type')?.includes('application/json'))return json({error:'json_required'},415,headers);
      const text=await boundedBody(request);
      if(text===null)return json({error:'payload_too_large'},413,headers);
      let body;try{body=JSON.parse(text);}catch{return json({error:'invalid_json'},400,headers);}
      if(!scoreValid(body))return json({error:'invalid_score'},400,headers);
      if(url.pathname==='/api/qualify') {
        const entries=await board(env.DB,body.laps);
        return json({rank:qualifyingRank(entries,body),entries},200,headers);
      }
      const name=normalizeName(body.name);
      if(!name||typeof body.id!=='string'||!/^[a-zA-Z0-9_-]{8,128}$/.test(body.id))return json({error:'invalid_name_or_id'},400,headers);
      if(limited(request))return json({error:'too_many_requests'},429,{'Retry-After':'60',...headers});
      // One atomic INSERT...SELECT checks current qualification; a racing client
      // cannot overwrite the winner of another simultaneous submission.
      await env.DB.prepare(INSERT_SQL).bind(body.id,LEADERBOARD_VERSION,body.laps,body.timeMs,name,body.playerId,body.mode,Date.now(),LEADERBOARD_VERSION,body.laps,body.timeMs).run();
      const stored=await env.DB.prepare('SELECT version,laps,time_ms AS timeMs,player_id AS playerId,mode,name FROM records WHERE id=?').bind(body.id).first();
      const entries=await board(env.DB,body.laps);
      if(!stored)return json({error:'rank_changed',entries},409,headers);
      if(stored.version!==LEADERBOARD_VERSION||stored.laps!==body.laps||stored.timeMs!==body.timeMs||stored.playerId!==body.playerId||stored.mode!==body.mode||stored.name!==name)return json({error:'id_conflict',entries},409,headers);
      const rank=entries.findIndex(entry=>entry.id===body.id)+1;
      return json({saved:true,rank:rank||null,entries},200,headers);
    } catch(error) {
      console.error('Leaderboard operation failed',error?.name||'Error');
      return json({error:'temporarily_unavailable'},503,headers);
    }
  }
};
