/** Roadside districts for the existing Shanghai architecture. This module owns
 * placement only: it imports neither city-scenery nor the rendering dispatcher,
 * so named buildings can reserve their plots before ordinary street infill. */
import { TRACK, trackPoint, projectTrack } from './engine.js';
import { shanghaiLandmarkPlacements } from './shanghai-landmarks.js';
import { SHANGHAI_DOWNHILL_MODERN } from './shanghai-downhill-modern.js';
import { SHANGHAI_HERITAGE_LANDMARKS } from './shanghai-downhill-heritage.js';
import { pudongSkylinePlacements, shanghaiRiverClearance } from './shanghai-riverfront.js';

export const SHANGHAI_ADDITIONAL_LANDMARKS=Object.freeze([
  ...SHANGHAI_DOWNHILL_MODERN,
  ...SHANGHAI_HERITAGE_LANDMARKS.map(meta=>Object.freeze({...meta,family:'heritage',
    features:Object.freeze(Array.isArray(meta.features)?[...meta.features]:meta.features.split(/,\s*/))})),
]);
const cache=new WeakMap();
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
// Curated against the frozen course with full footprint and frontage checks.
// Search runs during authoring; map changes only evaluate these 65 placements.
const PRESETS=Object.freeze([
  ['white-magnolia-plaza',7020.768421,-1,0,'upper-descent'],
  ['wheelock-square',7125.768421,1,0,'upper-descent'],
  ['tomorrow-square',7454.518421,-1,0,'upper-descent'],
  ['shimao-plaza',7454.518421,1,0,'upper-descent'],
  ['shanghai-ifc',7888.268421,-1,0,'upper-descent'],
  ['one-lujiazui',7888.268421,1,0,'upper-descent'],
  ['bank-china-tower',8322.018421,-1,0,'upper-descent'],
  ['bank-shanghai-tower',8322.018421,1,0,'upper-descent'],
  ['aurora-plaza',8755.768421,-1,0,'upper-descent'],
  ['citi-tower',8755.768421,1,0,'upper-descent'],
  ['hang-seng-tower',9189.518421,-1,0,'upper-descent'],
  ['jing-an-kerry-centre',9224.518421,1,0,'upper-descent'],
  ['k11-art-mall',9623.268421,-1,0,'upper-descent'],
  ['grand-gateway',9623.268421,1,0,'upper-descent'],
  ['plaza-66',10057.018421,-1,0,'upper-descent'],
  ['power-station-art',11064.599601,-1,0,'lower-descent'],
  ['china-art-museum',17336.732956,-1,0,'south-return'],
  ['natural-history-museum',17705.168562,1,0,'south-return'],
  ['science-technology-museum',18073.604168,-1,0,'south-return'],
  ['astronomy-museum',18442.039774,-1,0,'south-return'],
  ['oriental-art-center',18810.475380,-1,0,'south-return'],
  ['mercedes-benz-arena',19178.910985,-1,0,'south-return'],
  ['library-east',19547.346591,1,0,'south-return'],
  ['long-museum-west-bund',20020.782197,-1,0,'south-return'],
  ['west-bund-museum',20235.459261,-1,0,'civic-return'],
  ['yuz-museum',20996.377783,-1,140,'civic-return'],
  ['urban-planning-hall',21652.296304,-1,0,'civic-return'],
  ['international-cruise-terminal',14525.015153,-1,0,'bund-landward'],
  ['china-maritime-museum',15325.015153,-1,0,'bund-landward'],
  ['culture-square',22378.214826,-1,0,'civic-return'],
  ['shanghai-longhua-pagoda',17336.732956,1,0,'south-return'],
  ['shanghai-longhua-temple',17915.168562,1,0,'south-return'],
  ['shanghai-jingan-temple',18248.604168,1,0,'south-return'],
  ['shanghai-jade-buddha',966.250000,-1,0,'old-town'],
  ['shanghai-city-god',298.750000,-1,0,'old-town'],
  ['shanghai-wenmiao',298.750000,1,0,'old-town'],
  ['shanghai-chenxiang',756.250000,1,0,'old-town'],
  ['shanghai-zhenru',18582.039774,1,0,'south-return'],
  ['shanghai-fangta',12122.998005,-1,0,'lower-descent'],
  ['shanghai-sheshan-basilica',11064.599601,1,0,'lower-descent'],
  ['shanghai-sheshan-observatory',18880.475380,1,0,'south-return'],
  ['shanghai-guangfulin',19388.910985,-1,0,'south-return'],
  ['shanghai-nanxiang-twins',12122.998005,1,0,'lower-descent'],
  ['shanghai-guyi-garden',19722.346591,-1,0,'south-return'],
  ['shanghai-jiading-confucius',19810.782197,1,175,'south-return'],
  ['shanghai-fahua',11593.798803,1,0,'lower-descent'],
  ['shanghai-qiuxia',20725.459261,-1,0,'civic-return'],
  ['shanghai-kezhi',12652.197207,-1,0,'lower-descent'],
  ['shanghai-fangsheng-bridge',20996.377783,1,175,'civic-return'],
  ['shanghai-zuibai',21652.296304,1,0,'civic-return'],
  ['shanghai-moller-villa',11593.798803,-1,0,'lower-descent'],
  ['shanghai-soong-residence',1773.750000,-1,0,'old-town'],
  ['shanghai-sun-residence',22590.000000,-1,0,'civic-return'],
  ['shanghai-sihang',16710.015153,-1,0,'bund-landward'],
  ['shanghai-old-millfun',13940.015153,-1,140,'bund-landward'],
  ['shanghai-astor-house',16365.015153,-1,0,'bund-landward'],
  ['shanghai-union-church',15635.015153,-1,0,'bund-landward'],
  ['shanghai-broadway-mansions',13111.396409,-1,0,'lower-descent'],
  ['shanghai-history-museum',12652.197207,1,0,'lower-descent'],
  ['shanghai-paramount',22448.214826,1,0,'civic-return'],
  ['shanghai-ba-jin-residence',23100.000000,-1,0,'civic-return'],
  ['shanghai-first-cpc-site',1213.750000,1,0,'old-town'],
  ['shanghai-ohel-moishe',22894.133348,-1,0,'civic-return'],
  ['shanghai-holy-trinity',12901.396409,-1,70,'lower-descent'],
  ['shanghai-grand-cinema',23069.133348,1,0,'civic-return'],
].map(Object.freeze));

export function shanghaiLayoutDistricts(){
  if(TRACK.theme!=='shanghai')return [];
  const descent=TRACK.elevationProfile.find(profile=>profile.from>profile.to);
  return [
    {id:'upper-descent',start:descent.start+280,end:descent.start+3750,sides:[-1,1]},
    {id:'old-town',start:70,end:1900,sides:[-1,1]},
    {id:'lower-descent',start:10800,end:descent.end-90,sides:[-1,1]},
    {id:'bund-landward',start:TRACK.bund.start+30,end:TRACK.bund.end-60,sides:[-1]},
    {id:'south-return',start:TRACK.bund.end+250,end:20100,sides:[-1,1]},
    {id:'civic-return',start:20100,end:TRACK.length-70,sides:[-1,1]},
  ];
}

// Smaller, individually reserved aprons replace the overlapping broad courts.
// Modern podiums extend eight units beyond metadata width/depth; this margin
// encloses those real meshes while leaving a modest planted border.
function envelope(meta){
  const courtWidth=meta.width+24,courtDepth=meta.depth+24;
  return {...meta,modelRadius:meta.radius,radius:Math.max(meta.radius,Math.hypot(courtWidth,courtDepth)/2),courtWidth,courtDepth};
}
function clearView(item,other){
  if(!Number.isFinite(item.s))return true;
  const road=trackPoint(item.s),dx=item.x-road.x,dz=item.z-road.y,length=Math.hypot(dx,dz);
  const along=((other.x-road.x)*dx+(other.z-road.y)*dz)/length;
  if(along<=0||along>=length)return true;
  const cross=Math.abs((other.x-road.x)*dz-(other.z-road.y)*dx)/length;
  return cross>=(other.modelRadius??other.radius)+10;
}
function candidate(meta,zone,s,side,extra,reserved){
  const p=trackPoint(s,side*(meta.radius+132+extra)),nearest=projectTrack(p.x,p.y);
  if(nearest.distance<meta.radius+126)return null;
  if(p.x< -650||p.y< -400||p.x>TRACK.width+850||p.y>TRACK.height+700)return null;
  if(!shanghaiRiverClearance(p.x,p.y,meta.radius))return null;
  // The short buildings should be encountered at eye level, not far below a
  // high deck. The tall skyline sequence remains alongside the upper skyway.
  if(meta.family!=='skyline'&&p.elevation>Math.min(150,meta.height*.6))return null;
  const item={...meta,nameZh:meta.nameZh||meta.zh,x:p.x,z:p.y,elevation:0,
    angle:p.angle+(side<0?Math.PI:0),s,side,row:0,district:zone.id,
    roadElevation:p.elevation,distanceFromRoad:nearest.distance};
  for(const other of reserved){
    if(distance(item,other)<item.radius+other.radius+30)return null;
    if(!clearView(item,other))return null;
    // Preserve the retained landmarks' frontage and cross-river skyline views.
    if(!clearView(other,item))return null;
  }
  return item;
}

export function shanghaiAdditionalPlacements(){
  if(TRACK.theme!=='shanghai')return [];
  if(cache.has(TRACK))return cache.get(TRACK).additional;
  const original=shanghaiLandmarkPlacements(),reserved=[...original,...pudongSkylinePlacements()],additional=[];
  const metadata=new Map(SHANGHAI_ADDITIONAL_LANDMARKS.map(meta=>[meta.kind,envelope(meta)]));
  const districts=new Map(shanghaiLayoutDistricts().map(zone=>[zone.id,zone]));
  for(const [kind,s,side,extra,district]of PRESETS){
    const item=candidate(metadata.get(kind),districts.get(district),s,side,extra,[...reserved,...additional]);
    if(!item)throw new Error(`Shanghai preserved-road plot is obstructed: ${kind}`);
    additional.push(Object.freeze(item));
  }
  const plots=Object.freeze(additional),all=Object.freeze([...original,...plots]);
  cache.set(TRACK,{additional:plots,all});return plots;
}
export function shanghaiCityLandmarkPlacements(){
  if(TRACK.theme!=='shanghai')return [];
  shanghaiAdditionalPlacements();return cache.get(TRACK).all;
}
