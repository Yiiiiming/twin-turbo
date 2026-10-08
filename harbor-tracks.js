import { createClosedTrack } from './tracks.js';

const TAU = Math.PI * 2;
const GRID = Object.freeze([{ lane: -18, offset: -30 }, { lane: 22, offset: -84.45 }].map(Object.freeze));
const shared = { roadWidth: 120, checkpointMargin: 40, carRadius: 21, carCollisionDistance: 37, carHeight: 25, unitsPerMeter:60/11,
  startGrid: GRID, city: 'coast', trafficSections: Object.freeze([]) };
const profiles = [
  { id:'coast-bay', name:'碧湾追风', nameEn:'Azure Bay Sprint', themeName:'蔚蓝海湾', theme:'bay',
    description:'沿海长直道衔接双 S 弯，掠过白色灯塔与低桥。', descriptionEn:'Coastal straights, flowing S bends, a lighthouse and a low sea bridge.',
    points:[[750,2600],[700,1200],[1700,650],[3900,650],[4950,1250],[4800,2600],[3700,3000],[2800,2200],[2000,3250]], radius:440,
    sections:[{type:'bridge',from:.25,to:.44,peak:75,ramp:650}], scene:{coast:.85,alpine:.12,city:.03}, lengthTarget:15600 },
  { id:'coast-pines', name:'松岚曲径', nameEn:'Pine Valley Run', themeName:'松林山谷', theme:'pines',
    description:'松林里的连续反向弯和山谷回头弯，节奏紧凑。', descriptionEn:'Linked reverse bends and a valley hairpin through dense pines.',
    points:[[800,2800],[650,1400],[1400,600],[2800,800],[3350,1500],[4450,500],[5200,1400],[4700,3200],[3500,3300],[2950,2400],[1900,3400]], radius:430,
    sections:[{type:'hill',from:.20,to:.42,peak:105,ramp:800},{type:'hill',from:.57,to:.83,peak:70,ramp:900}], scene:{coast:.05,alpine:.92,city:.03}, lengthTarget:16400 },
  { id:'coast-neon', name:'霓虹疾驰', nameEn:'Neon District', themeName:'霓虹城区', theme:'neon',
    description:'灯火街区的高速大道、错位双弯与宽阔回头弯。', descriptionEn:'Bright boulevards, offset chicanes and a sweeping urban hairpin.',
    points:[[750,2800],[750,800],[2500,800],[2500,1400],[4250,1400],[4250,700],[5350,700],[5350,3150],[3400,3150],[3400,2450],[2100,2450],[2100,3350]], radius:340,
    sections:[], scene:{coast:.02,alpine:.03,city:.95}, lengthTarget:16500 },
  { id:'coast-marina', name:'帆港绕行', nameEn:'Marina Passage', themeName:'游艇港湾', theme:'marina',
    description:'环绕帆船码头，以长弧弯接入船坞区的技术 S 弯。', descriptionEn:'Sweep past sailboat quays into a technical dockside S section.',
    points:[[650,2400],[900,950],[2150,650],[3800,900],[5150,700],[5400,2350],[4450,3350],[3150,3400],[2800,2450],[1850,2900],[1250,3500]], radius:460,
    sections:[{type:'bridge',from:.36,to:.59,peak:95,ramp:780}], scene:{coast:.90,alpine:.03,city:.07}, lengthTarget:15900 },
  { id:'coast-grand', name:'灯塔大奖赛', nameEn:'Lighthouse Grand Prix', themeName:'海港大奖赛', theme:'grand',
    description:'发车长直道、连弯、抬升观景桥与终点回头弯的综合赛。', descriptionEn:'A long launch straight, linked bends, a viewing bridge and a final hairpin.',
    points:[[700,3000],[700,750],[2350,650],[2950,1500],[3950,650],[5350,1050],[5100,2800],[4400,3300],[3500,2700],[2500,3450],[1800,2400]], radius:440,
    sections:[{type:'bridge',from:.13,to:.30,peak:110,ramp:750},{type:'hill',from:.52,to:.7,peak:65,ramp:800}], scene:{coast:.47,alpine:.29,city:.24}, lengthTarget:16900 },
];
function rounded(spec) {
  const raw = createClosedTrack({ ...spec, city:spec.id, width:6200, height:4200, roadWidth:120,
    points:spec.points.map(([x,y])=>({x,y})), simplifyTolerance:0 });
  const scale = spec.lengthTarget / raw.length;
  const points = spec.points.map(([x,y])=>({x:x*scale,y:y*scale}));
  const base = createClosedTrack({ ...spec, city:spec.id, points, radius:spec.radius*scale,
    width:Math.max(...points.map(p=>p.x))+650, height:Math.max(...points.map(p=>p.y))+650,
    roadWidth:120, simplifyTolerance:0 });
  return Object.freeze({ ...base, ...shared, city:spec.id, startDistance:Math.min(350,base.segments[0].length*.48),
    checkpoints:Math.ceil(Math.max(48,base.length/260)/4)*4, nameEn:spec.nameEn, description:spec.description,
    descriptionEn:spec.descriptionEn, themeName:spec.themeName, theme:spec.theme, scene:Object.freeze(spec.scene),
    metadata:Object.freeze({ nameEn:spec.nameEn, description:spec.description, descriptionEn:spec.descriptionEn,
      themeName:spec.themeName, suggestedLapSeconds:Math.round(base.length/340), difficulty:spec.theme==='bay'?'flow':'technical' }) });
}

function twinHelix() {
  let x=700,y=1500,heading=0,s=0;
  const segments=[], elevationProfile=[];
  const line=length=>{const x2=x+Math.cos(heading)*length,y2=y+Math.sin(heading)*length;
    segments.push(Object.freeze({kind:'line',x1:x,y1:y,x2,y2,angle:heading,length,s}));x=x2;y=y2;s+=length;};
  const arc=(radius,sweep)=>{
    const direction=Math.sign(sweep),cx=x-Math.sin(heading)*direction*radius,cy=y+Math.cos(heading)*direction*radius;
    let startAngle=Math.atan2(y-cy,x-cx),remaining=sweep;
    // Quarter-turn pieces make every level uniquely projectable by route distance.
    while(Math.abs(remaining)>1e-8){const part=direction*Math.min(Math.PI/2,Math.abs(remaining)),length=radius*Math.abs(part);
      segments.push(Object.freeze({kind:'arc',cx,cy,radius,startAngle,sweep:part,direction,length,s}));
      s+=length;startAngle+=part;remaining-=part;
    }
    x=cx+Math.cos(startAngle)*radius;y=cy+Math.sin(startAngle)*radius;heading+=sweep;
  };
  line(1650);
  const upStart=s;arc(275,TAU*3);const upEnd=s;
  elevationProfile.push({start:upStart,end:upEnd,from:0,to:570});
  line(1050);arc(550,Math.PI);
  const downStart=s;arc(275,TAU*3);const downEnd=s;
  elevationProfile.push({start:upEnd,end:downStart,from:570,to:570},{start:downStart,end:downEnd,from:570,to:0});
  line(2700);arc(550,Math.PI);
  const name='云脊双螺旋',nameEn='Sky Ridge 1080',description='连续 1080° 螺旋爬升，再以 1080° 螺旋下降，云端连接桥贯穿两塔。';
  const descriptionEn='Climb a full 1080-degree helix, cross the sky bridge, then descend another 1080 degrees.';
  return Object.freeze({ ...shared,id:'coast-ridge',name,nameEn,description,descriptionEn,city:'coast-ridge',
    width:4600,height:3450,length:s,startDistance:400,checkpoints:Math.ceil(s/240/4)*4,segments:Object.freeze(segments),
    sections:Object.freeze([]), elevationProfile:Object.freeze(elevationProfile.map(Object.freeze)), theme:'ridge',themeName:'双螺旋高架',
    scene:Object.freeze({coast:.24,alpine:.74,city:.02}), spirals:Object.freeze([
      Object.freeze({start:upStart,end:upEnd,degrees:1080,direction:'up',cx:2350,cy:1775,radius:275}),
      Object.freeze({start:downStart,end:downEnd,degrees:1080,direction:'down',cx:3400,cy:2325,radius:275}),
    ]),metadata:Object.freeze({nameEn,description,descriptionEn,themeName:'双螺旋高架',suggestedLapSeconds:60,difficulty:'expert',elevationGain:570}) });
}
/** A river circuit crosses its east-west river on exactly two straights, west bridge first. */
function riverBridges(base,river,{kinds,decks,abutment,ramp}) {
  const crossings=base.segments.filter(segment=>segment.kind==='line'&&
    (segment.y1-river.centerZ)*(segment.y2-river.centerZ)<0).map(segment=>{
      const u=(river.centerZ-segment.y1)/(segment.y2-segment.y1);
      return {s:segment.s+segment.length*u,angle:segment.angle,x:segment.x1+(segment.x2-segment.x1)*u,y:river.centerZ};
    }).sort((a,b)=>a.x-b.x);
  if(crossings.length!==2)throw new Error(`${base.id} must cross its river on exactly two bridges.`);
  const bridges=crossings.map((crossing,index)=>Object.freeze({...crossing,kind:kinds[index],
    halfSpan:river.halfWidth/Math.abs(Math.sin(crossing.angle))+abutment,deckHeight:decks[index]}));
  const sections=bridges.map(bridge=>Object.freeze({type:'bridge',name:bridge.kind,
    start:bridge.s-bridge.halfSpan-ramp,end:bridge.s+bridge.halfSpan+ramp,peak:bridge.deckHeight,ramp}));
  return {bridges:Object.freeze(bridges),sections:Object.freeze(sections)};
}
function londonRiverside() {
  const spec={id:'coast-london',name:'伦敦河岸',nameEn:'London Riverside',themeName:'伦敦河岸',theme:'london',
    description:'穿过塔桥双塔，沿泰晤士河畔掠过大本钟、伦敦眼与红色双层巴士。',
    descriptionEn:'Race through Tower Bridge, then pass Big Ben, the London Eye and red double-decker buses along the Thames.',
    points:[[900,3000],[900,850],[2600,650],[3000,1400],[4650,850],[5350,1550],[5200,3300],[3850,3500],[3450,2550],[2250,2800],[1800,3650]],
    radius:420,lengthTarget:16600,sections:[],scene:{coast:.02,alpine:.53,city:.45}};
  const base=rounded(spec),scale=base.sourcePoints[0].x/900;
  const river=Object.freeze({centerZ:2050*scale,halfWidth:205*scale});
  const {bridges,sections}=riverBridges(base,river,{kinds:['tower-bridge','westminster-bridge'],decks:[90,64],abutment:115,ramp:600});
  return Object.freeze({...base,river,bridges,sections,
    metadata:Object.freeze({...base.metadata,themeName:'伦敦河岸',landmarks:['Tower Bridge','Big Ben','London Eye','London buses'],
      courseStyle:'Compact London-inspired racing circuit; not a geographic road reconstruction.'})});
}
// City circuits use the same compact scale and handling as London Riverside.
// Their routes are designed for racing, with familiar architecture along the way.
const cityProfiles=[
  {id:'coast-beijing',name:'京华御道',nameEn:'Beijing Imperial Run',theme:'beijing',themeName:'北京古都',
    description:'红墙金瓦、三重蓝檐与灰瓦胡同相伴，宽阔御道接入园林连弯。',
    descriptionEn:'Golden palace roofs, the blue Temple of Heaven and hutong courtyards line broad avenues and garden bends.',
    points:[[900,3000],[900,850],[2300,650],[2850,1300],[4000,650],[5250,850],[5200,2250],[4300,2850],[3350,2050],[2450,3050],[1700,3650]],
    radius:450,lengthTarget:16200,sections:[{type:'hill',from:.52,to:.70,peak:48,ramp:680}],scene:{coast:.03,alpine:.20,city:.77}},
  {id:'coast-rio',name:'里约逐浪',nameEn:'Rio Coastal Rhythm',theme:'rio',themeName:'里约海岸',
    description:'掠过彩色街屋与白色拱廊，沿海滩爬坡，远眺基督像和糖面包山。',
    descriptionEn:'Pass colorful streets and white Lapa arches, climb the coastal hills and spot Christ the Redeemer and Sugarloaf Mountain.',
    points:[[850,2900],[700,1300],[1550,650],[2950,750],[3650,1450],[4700,750],[5500,1600],[4850,3050],[3850,3600],[2900,3000],[1950,3550]],
    radius:465,lengthTarget:16400,sections:[{type:'hill',from:.20,to:.42,peak:116,ramp:860},{type:'hill',from:.59,to:.77,peak:62,ramp:760}],
    scene:{coast:.78,alpine:.12,city:.10}},
];
function austinRiverRun(){
  const base=rounded({id:'coast-austin',name:'奥斯汀律动',nameEn:'Austin River Run',theme:'austin',themeName:'奥斯汀河谷',
    description:'穿越钢拱桥与湖岸弯道，经过粉红穹顶州议会大厦和现场音乐街。',
    descriptionEn:'Cross a steel arch bridge, sweep along the lake and pass the pink-domed State Capitol and live-music streets.',
    points:[[800,3200],[800,850],[2450,650],[3400,1250],[4600,700],[5400,1300],[5450,3250],[4150,3550],[3200,2800],[2200,3550]],
    radius:460,lengthTarget:16800,sections:[],scene:{coast:.16,alpine:.25,city:.59}});
  const scale=base.sourcePoints[0].x/800,river=Object.freeze({centerZ:1950*scale,halfWidth:175*scale});
  const {bridges,sections}=riverBridges(base,river,{kinds:['austin-arch','austin-congress'],decks:[88,60],abutment:95,ramp:620});
  // Keep both grid spots on a flat boulevard, clear of the first bridge approach.
  const startDistance=base.segments.find(segment=>segment.kind==='line'&&segment.s>sections[0].end&&segment.length>500)?.s+250;
  return Object.freeze({...base,startDistance:Number.isFinite(startDistance)?startDistance:base.startDistance,river,
    bridges,sections,
    metadata:Object.freeze({...base.metadata,landmarks:['Texas State Capitol','Pennybacker-inspired bridge','Live music streets'],
      courseStyle:'Compact Austin-inspired racing circuit; not a geographic road reconstruction.'})});
}
function parisSeineLoop(){
  const base=rounded({id:'coast-paris',name:'巴黎塞纳',nameEn:'Paris Seine Loop',theme:'paris',themeName:'巴黎塞纳河',
    description:'驶过埃菲尔铁塔，经金色桥塔与石拱桥两跨塞纳河，再掠过凯旋门与卢浮宫玻璃金字塔。',
    descriptionEn:'Race past the Eiffel Tower, cross the Seine on a gilded bridge and a stone-arch bridge, then sweep by the Arc de Triomphe and the Louvre Pyramid.',
    points:[[4400,3600],[3300,3600],[2650,3000],[1800,3550],[650,3050],[650,900],[1800,560],[2550,1350],[3550,1150],[4150,560],[5350,760],[5450,3050]],
    radius:450,lengthTarget:16600,sections:[],scene:{coast:.10,alpine:.22,city:.68}});
  const scale=base.sourcePoints[0].x/4400,river=Object.freeze({centerZ:2000*scale,halfWidth:150*scale});
  // Short ramps keep both bridge approaches on their straights, with the start grid flat.
  const {bridges,sections}=riverBridges(base,river,{kinds:['paris-alexandre','paris-pont-neuf'],decks:[80,62],abutment:95,ramp:580});
  return Object.freeze({...base,river,bridges,sections,
    metadata:Object.freeze({...base.metadata,landmarks:['Eiffel Tower','Arc de Triomphe','Louvre Pyramid','Pont Alexandre III','Pont Neuf'],
      courseStyle:'Compact Paris-inspired racing circuit; not a geographic road reconstruction.'})});
}
export const HARBOR_TRACKS = Object.freeze([...profiles.map(rounded),twinHelix(),londonRiverside(),rounded(cityProfiles[0]),austinRiverRun(),rounded(cityProfiles[1]),parisSeineLoop()]);
