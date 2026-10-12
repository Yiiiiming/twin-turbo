import test from 'node:test';
import assert from 'node:assert/strict';
import {setTrack,TRACK,RaceEngine,trackPoint,projectTrack} from '../engine.js';
import {RaceRenderer,sceneObstacles,updateChaseCamera} from '../renderer.js';
import {cityLandmarkPlacements} from '../city-scenery.js';
import {AUSTIN_FOOTBALL_PLAYERS,AUSTIN_FOOTBALL_RADIUS,AUSTIN_SCOREBOARD,footballPlayerPose,footballFrame,addAustinFootball,austinScoreboardText,paintAustinScoreboard,austinScoreboardSurface} from '../austin-football.js';
test.afterEach(()=>setTrack('coast'));

class ModelProbe{
 constructor(){this.colliders=[];this.triangles=0;this.radius=0;this.height=0;this.colors=new Map();}
 vertex(v){assert.ok(v.every(Number.isFinite));this.radius=Math.max(this.radius,Math.hypot(v[0],v[2]));this.height=Math.max(this.height,v[1]);}
 triangle(a,b,c,color){[a,b,c].forEach(v=>this.vertex(v));this.triangles++;this.colors.set(color,(this.colors.get(color)||0)+1);}
 quad(a,b,c,d,color){this.triangle(a,b,c,color);this.triangle(a,c,d,color);}
 box(x,y,z,w,h,d,color,angle=0){assert.ok([w,h,d].every(n=>n>0));for(const a of [-1,1])for(const b of [-1,1])for(const c of [-1,1])this.vertex([x+Math.cos(angle)*a*w/2-Math.sin(angle)*c*d/2,y+b*h/2,z+Math.sin(angle)*a*w/2+Math.cos(angle)*c*d/2]);this.triangles+=12;this.colors.set(color,(this.colors.get(color)||0)+12);}
}
function canvasFixture(){const labels=[],fills=[];const context={fillRect(...a){fills.push(a);},strokeRect(){},fillText(...a){labels.push(a);}};return {labels,fills,canvas:{getContext:kind=>kind==='2d'?context:null,width:0,height:0}};}

test('football stages an eleven-player offense against eleven defenders with a QB cocking his throwing arm',()=>{
 assert.equal(AUSTIN_FOOTBALL_PLAYERS.length,22);
 const offence=AUSTIN_FOOTBALL_PLAYERS.filter(p=>p.team==='texas'),defence=AUSTIN_FOOTBALL_PLAYERS.filter(p=>p.team==='ou');
 assert.equal(offence.length,11);assert.equal(defence.length,11);
 assert.deepEqual(offence.filter(p=>['LT','LG','C','RG','RT'].includes(p.role)).map(p=>p.role),['LT','LG','C','RG','RT']);
 assert.equal(offence.filter(p=>p.role==='WR').length,3);assert.ok(offence.some(p=>p.role==='RB'));assert.ok(offence.some(p=>p.role==='TE'));
 const quarterback=offence.find(p=>p.role==='QB'),pose=footballPlayerPose(quarterback);
 assert.equal(quarterback.pose,'throw');assert.ok(pose.arms[1].hand[1]>pose.head[1]);assert.ok(pose.arms[1].elbow[2]>pose.head[2]);assert.ok(quarterback.x<Math.min(...offence.filter(p=>p.pose==='block').map(p=>p.x)));
 assert.equal(new Set(AUSTIN_FOOTBALL_PLAYERS.map(p=>`${p.x}/${p.z}`)).size,22);
});

test('field, detailed two-colour players, goals, stands and large board stay within their reserved footprint',()=>{
 const mesh=new ModelProbe();addAustinFootball(mesh,{x:0,z:0,angle:0,side:1});
 assert.ok(mesh.radius<=AUSTIN_FOOTBALL_RADIUS+.01,`${mesh.radius}`);assert.ok(mesh.height>=240);
 assert.ok(mesh.triangles>20_000&&mesh.triangles<60_000,`${mesh.triangles} triangles`);
 assert.ok(mesh.colors.get('#bd541d')>1000);assert.ok(mesh.colors.get('#8b2638')>1000);
 assert.equal(mesh.colliders.filter(c=>c.id.startsWith('austin-player-')).length,22);
 assert.ok(AUSTIN_SCOREBOARD.width>=450&&AUSTIN_SCOREBOARD.height>=140);
});

test('enlarged football plot keeps actual car and chase-camera paths clear',()=>{
 setTrack('coast-austin');const plot=cityLandmarkPlacements().find(item=>item.kind==='football-team');
 assert.equal(plot.radius,AUSTIN_FOOTBALL_RADIUS);assert.ok(projectTrack(plot.x,plot.z).distance>=TRACK.roadWidth/2+plot.radius+24);
 const obstacles=sceneObstacles(),engine=new RaceEngine({obstacles}),footballWorld=new RaceEngine({obstacles:obstacles.filter(o=>Math.hypot(o.x-plot.x,o.y-plot.z)<=plot.radius)}).obstacleWorld;
 for(let s=plot.s-600;s<=plot.s+600;s+=17)for(const lane of [-30,0,30]){
  const car={...trackPoint(s,lane),height:25,speed:363};assert.equal(engine.obstacleWorld.resolveCar(car),0);
  const camera=updateChaseCamera(car,null),probe={x:camera.eye[0],y:camera.eye[2],elevation:camera.eye[1]-4,height:8,speed:0,angle:0};assert.equal(footballWorld.resolveCar(probe),0,'football geometry leaves all three chase-camera paths clear');
 }
});

test('scoreboard reflects Austin civil time automatically through both daylight-saving transitions',()=>{
 assert.equal(austinScoreboardText('2026-01-12T18:07:00Z').text,"It's 12:07 and OU still sucks!");
 assert.equal(austinScoreboardText('2026-07-12T17:07:00Z').text,"It's 12:07 and OU still sucks!");
 assert.equal(austinScoreboardText('2026-03-08T07:59:00Z').time,'01:59');assert.equal(austinScoreboardText('2026-03-08T08:00:00Z').time,'03:00');
 const first=austinScoreboardText('2026-11-01T06:30:00Z'),second=austinScoreboardText('2026-11-01T07:30:00Z');assert.equal(first.time,'01:30');assert.equal(second.time,'01:30');assert.notEqual(first.minute,second.minute);
});

test('scoreboard raster paints the requested full phrase and reads correctly from either roadside',()=>{
 const fixture=canvasFixture(),info=paintAustinScoreboard(fixture.canvas,'2026-07-12T17:07:00Z');
 assert.equal(fixture.canvas.width,2048);assert.equal(fixture.canvas.height,640);assert.ok(fixture.labels.some(a=>a[0]==="It's 12:07"));assert.ok(fixture.labels.some(a=>a[0]==='and OU still sucks!'));assert.equal(info.text,"It's 12:07 and OU still sucks!");
 for(const side of [-1,1]){
  const item={x:100,z:200,angle:.8,side},oriented=footballFrame(item),surface=austinScoreboardSurface(item),vertices=surface.vertices;
  const right=[Math.cos(oriented.angle),Math.sin(oriented.angle)];
  const physical=(offset)=>((vertices[offset]-item.x)*right[0]+(vertices[offset+2]-item.z)*right[1]);
  assert.ok(physical(0)>physical(10),'texture u=0 is viewer-left on the street-facing board');assert.deepEqual(Array.from(vertices.slice(3,5)),[0,0]);assert.deepEqual(Array.from(vertices.slice(13,15)),[1,1]);
 }
});

test('renderer refreshes Austin scoreboard only at a minute change and never leaves an expired text frame cached',()=>{
 setTrack('coast-austin');const fixture=canvasFixture(),uploads=[],state={texture:{},ready:0};
 const renderer=Object.assign(Object.create(RaceRenderer.prototype),{canvas:{ownerDocument:{createElement:()=>fixture.canvas}},textures:{'poster:austin-scoreboard':state},gl:{bindTexture(){},pixelStorei(){},texImage2D(...args){uploads.push(args);}}});
 const now=Date.parse('2026-07-12T17:07:20Z');renderer._refreshAustinScoreboard(now);renderer._refreshAustinScoreboard(now+15000);assert.equal(uploads.length,1);assert.equal(state.ready,1);assert.equal(state.text,"It's 12:07 and OU still sucks!");
 renderer._refreshAustinScoreboard(now+60000);assert.equal(uploads.length,2);assert.equal(state.text,"It's 12:08 and OU still sucks!");
 setTrack('coast-london');renderer._refreshAustinScoreboard(now+120000);assert.equal(uploads.length,2,'other city renders never update a hidden board');
});
