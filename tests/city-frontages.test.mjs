import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { CityFrontages } from '../city-frontages.js';
import { buildCityGeometry } from '../city-geometry.js';
import { TRACKS, projectTrack, setTrack } from '../engine.js';
import londonMap from '../assets/london-map.json' with { type:'json' };

const ring = points => points.map(([x,y])=>({x,y}));
const rectangle=ring([[0,0],[120,0],[120,72],[0,72],[0,0]]);
const building=(id,outer=rectangle)=>({id,index:0,height:108,minHeight:0,tags:{},parts:[{outer,holes:[]}]});
const nearSource=id=>({id,distanceToRouteMeters:10,tags:{}});
const within=(p,ring,tolerance=.025)=>{
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    if(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=tolerance)return true;
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }return inside;
};
const validate=(b,group)=>{
  for(const mesh of group.children){
    const positions=mesh.geometry.attributes.position.array;
    assert.equal(mesh.geometry.attributes.color.count,mesh.geometry.attributes.position.count);
    for(let i=0;i<positions.length;i+=3){
      const x=positions[i],height=positions[i+1],y=positions[i+2];
      assert.ok([x,y,height].every(Number.isFinite),'finite mesh positions');
      assert.ok(height>=b.minHeight-.03&&height<=b.height+.03,`${b.id} roof detail fits collision height`);
      assert.ok(b.parts.some(part=>within({x,y},part.outer)&&!part.holes.some(hole=>within({x,y},hole,-.025))),`${b.id} detail at ${x},${y} stays inside collision footprint`);
    }
  }
};

test('near street fronts use recessed geometry with per-building profiles and no footprint overhang',()=>{
  const b=building('test-house'),system=new CityFrontages({sourceBuildings:[nearSource(b.id)]}),group=new THREE.Group();
  const p=system.renderBuilding(b,group,{confidence:'verified-features',facade:{style:'victorian-redbrick',floors:4,bays:6,roof:'mansard',wallColor:'#aa7962',groundFloor:'shopfront'}});
  assert.equal(p.estimated,false);assert.equal(p.floors,4);assert.equal(p.roofType,'mansard');
  assert.ok(system.stats.detailedWindows>30);validate(b,group);
  const depth=new Set(group.children.flatMap(mesh=>Array.from(mesh.geometry.attributes.position.array).filter((_,i)=>i%3===2).map(v=>v.toFixed(2))));
  assert.ok(depth.has('1.32'),'22cm deep glazing is modeled behind the south facade');
});

test('unknown buildings keep appearance estimated and OSM levels override guessed floor counts',()=>{
  const b=building('unknown');b.tags={'building:levels':'5','building:material':'brick'};
  const system=new CityFrontages();const profile=system.resolveProfile(b);
  assert.equal(profile.estimated,true);assert.equal(profile.floors,5);assert.equal(profile.style,'georgian-brick');
});

test('different facade colours share materials and preserve vertex colours for batching',()=>{
  const system=new CityFrontages({sourceBuildings:[nearSource('one'),nearSource('two')]}),one=new THREE.Group(),two=new THREE.Group();
  system.renderBuilding(building('one'),one,{facade:{style:'georgian-brick',wallColor:'#995533'}});
  system.renderBuilding(building('two'),two,{facade:{style:'georgian-brick',wallColor:'#bbbb99'}});
  const materialsOne=new Set(one.children.map(mesh=>mesh.material));
  assert.ok(two.children.every(mesh=>materialsOne.has(mesh.material)));
  assert.ok(system.sharedMaterials.size<10);
  const colors=new Set([...one.children,...two.children].flatMap(mesh=>Array.from(mesh.geometry.attributes.color.array).map(value=>value.toFixed(3))));
  assert.ok(colors.size>8,'independent house colours survive shared materials');
});

test('a 31-bay principal frontage does not turn short or return walls into dense slats',()=>{
  const b=building('long',ring([[0,0],[480,0],[480,36],[0,36],[0,0]])),system=new CityFrontages({sourceBuildings:[nearSource(b.id)]}),group=new THREE.Group();
  system.renderBuilding(b,group,{facadeBearing:0,facade:{bays:31,floors:4,style:'edwardian-stone',roof:'flat'}});
  assert.ok(system.stats.windows<290,`31 bays apply proportionally only to the principal elevation; got ${system.stats.windows}`);
  validate(b,group);
});

test('distant buildings retain shared style materials without expensive close-view geometry',()=>{
  const b=building('far'),system=new CityFrontages({sourceBuildings:[{id:b.id,distanceToRouteMeters:220}]}),group=new THREE.Group();
  system.renderBuilding(b,group);
  assert.ok(system.stats.triangles<80);assert.equal(system.stats.detailedWindows,0);validate(b,group);
});

test('real clearance-clipped London footprints contain every generated close-view vertex',()=>{
  setTrack('london');
  try{
    const geometry=buildCityGeometry(londonMap,TRACKS.london),byId=new Map(londonMap.buildings.map(item=>[item.id,item]));
    const candidates=geometry.buildings.filter(b=>b.adjusted&&byId.get(b.id)?.distanceToRouteMeters<45).slice(0,18);
    assert.ok(candidates.length>10);
    const system=new CityFrontages({sourceBuildings:londonMap.buildings,projectToRoute:projectTrack});
    for(const b of candidates){const group=new THREE.Group();system.renderBuilding(b,group);validate(b,group);}
  }finally{setTrack('coast');}
});
