import { createHash } from 'node:crypto';

// Stable across harmless object-key ordering and platform trig rounding.
// Nine decimals retain sub-nanometre precision at the game's world scale.
export function canonicalRouteJSON(value) {
 const normalize=value=>{
  if(typeof value==='number')return Number(value.toFixed(9));
  if(Array.isArray(value))return value.map(normalize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalize(value[key])]));
  return value??null;
 };
 return JSON.stringify(normalize(value));
}
export const routeDigest=value=>createHash('sha256').update(canonicalRouteJSON(value)).digest('hex');
const pick=(object,keys)=>Object.fromEntries(keys.map(key=>[key,object[key]??null]));

// Deliberately excludes names, descriptions, colors, scenery, landmark models,
// river styling and display order. This locks the drivable course, not its art.
export function routeDefinition(track) {
 return {
  ...pick(track,['width','height','roadWidth','length','startDistance','checkpoints','checkpointMargin','unitsPerMeter']),
  segments:track.segments.map(segment=>pick(segment,segment.kind==='line'
   ?['kind','s','length','x1','y1','x2','y2','angle']
   :['kind','s','length','cx','cy','radius','startAngle','sweep','direction'])),
  startGrid:track.startGrid.map(grid=>pick(grid,['lane','offset'])),
  elevationProfile:(track.elevationProfile||[]).map(section=>pick(section,['start','end','from','to'])),
  sections:(track.sections||[]).map(section=>pick(section,['type','start','end','peak','ramp'])),
  bridges:(track.bridges||[]).map(bridge=>pick(bridge,['s','angle','x','y','halfSpan','deckHeight'])),
  spirals:(track.spirals||[]).map(spiral=>pick(spiral,['start','end','degrees','direction','cx','cy','radius'])),
 };
}

// Also protects actual driving/elevation interpolation: unchanged definitions
// must not silently produce a different road after a shared engine refactor.
export function routeDrivingSamples(track,point) {
 const samples=[];
 for(let i=0;i<=256;i++)for(const lane of [-32,0,32])samples.push(pick(point(track.length*i/256,lane),['x','y','angle','curvature','s','elevation','slope','tunnel','bridge']));
 for(const grid of track.startGrid)samples.push(pick(point(track.startDistance+grid.offset,grid.lane),['x','y','angle','curvature','s','elevation','slope','tunnel','bridge']));
 return samples;
}
