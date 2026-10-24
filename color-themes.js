// Presentation only. Player/ghost identity colours and real landmark materials
// never pass through this palette. Purple is the original, unchanged edition.
export const COLOR_THEMES = Object.freeze({
  purple: Object.freeze({ label:'紫色', index:0, accent:'#9875f8', primary:[.61,.36,1], secondary:[.48,.90,1] }),
  red: Object.freeze({ label:'中国红', index:1, accent:'#df3448', primary:[1,.12,.19], secondary:[1,.72,.48] }),
  // UT Austin official primary: https://umac.utexas.edu/brand-center/colors/
  orange: Object.freeze({ label:'UT 焦橙', index:2, accent:'#bf5700', primary:[1,87/191,0], secondary:[1,.83,.57] }),
  green: Object.freeze({ label:'翡翠绿', index:3, accent:'#36d6a0', primary:[.06,1,.62], secondary:[.65,1,.25] }),
  ice: Object.freeze({ label:'冰蓝银灰', index:4, accent:'#85cce6', primary:[.24,.72,1], secondary:[.72,.93,1] }),
});
const CITY_THEMES = Object.freeze({
  'coast-london':'purple', 'coast-paris':'purple', 'coast-beijing':'red',
  'coast-austin':'orange', 'coast-rio':'green', 'coast-shanghai':'ice',
});
export function normalizeColorTheme(value) {
  return Object.hasOwn(COLOR_THEMES,value) ? value : 'purple';
}
export function themeForTrack(trackId) { return Object.hasOwn(CITY_THEMES,trackId) ? CITY_THEMES[trackId] : 'purple'; }

// Preserve the original peak intensity and neutral/white component, then map
// only its blue-violet chroma. Dark asphalt stays dark and lane lines stay pale.
export function remapHologramColor(color, themeId='purple') {
  const theme=COLOR_THEMES[normalizeColorTheme(themeId)];
  if(!theme.index)return [...color];
  const source=color.map(value=>Math.max(0,Math.min(1,value)));
  const low=Math.min(...source), high=Math.max(...source), chroma=high-low;
  const cool=Math.max(0,Math.min(1,(source[1]-source[0])/Math.max(chroma,.001)))*.75;
  return theme.primary.map((value,i)=>low+chroma*(value+(theme.secondary[i]-value)*cool));
}

export function themeCssColor(value, themeId='purple') {
  if(normalizeColorTheme(themeId)==='purple'||typeof value!=='string')return value;
  let source,alpha='1';
  const hex=value.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
  const rgb=value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if(hex){
    const digits=hex[1].length<5?[...hex[1]].map(c=>c+c).join(''):hex[1];
    source=[0,2,4].map(i=>parseInt(digits.slice(i,i+2),16)/255);
    if(digits.length===8)alpha=String(parseInt(digits.slice(6),16)/255);
  }else if(rgb){source=rgb.slice(1,4).map(x=>Number(x)/255);alpha=rgb[4]??'1';}
  else return value;
  const color=remapHologramColor(source,themeId).map(x=>Math.round(x*255));
  return `rgba(${color.join(',')},${alpha})`;
}

// Kept equivalent to the CPU palette so fog, canvas previews and WebGL surfaces
// join seamlessly. The original purple path returns its input exactly.
export const COLOR_THEME_GLSL = /* glsl */ `
vec3 themeColor(vec3 source, float theme) {
  if (theme < .5) return source;
  source=clamp(source,0.0,1.0);
  vec3 primary; vec3 secondary;
  if(theme < 1.5){primary=vec3(1.0,.12,.19);secondary=vec3(1.0,.72,.48);}
  else if(theme < 2.5){primary=vec3(1.0,87.0/191.0,0.0);secondary=vec3(1.0,.83,.57);}
  else if(theme < 3.5){primary=vec3(.06,1.0,.62);secondary=vec3(.65,1.0,.25);}
  else{primary=vec3(.24,.72,1.0);secondary=vec3(.72,.93,1.0);}
  float low=min(min(source.r,source.g),source.b);
  float high=max(max(source.r,source.g),source.b);
  float chroma=high-low;
  float cool=clamp((source.g-source.r)/max(chroma,.001),0.0,1.0)*.75;
  return vec3(low)+chroma*mix(primary,secondary,cool);
}
`;
