/** A compact architectural interpretation of East Sixth Street, not a survey.
 * References: maggiemaesaustin.com; casinoelcamino.net; driskillhotel.com/about;
 * austintexas.org/listings/the-blind-pig-pub/6073 and /explore/entertainment-districts/sixth-street.
 */
import { TRACK, trackPoint } from './engine.js';
import { frame, details, word, arch, window, cornice, frontDisk, beam } from './london-west-end.js';
export const SIXTH_STREET_VENUES=Object.freeze([
 {kind:'sixth-driskill',label:'The Driskill Bar',s:3200,side:1,radius:149,width:240,depth:130,height:151},
 {kind:'sixth-maggie',label:"Maggie Mae’s",s:3330,side:-1,radius:120,width:194,depth:100,height:99},
 {kind:'sixth-blind-pig',label:'The Blind Pig Pub',s:3595,side:-1,radius:111,width:186,depth:100,height:100},
 {kind:'sixth-casino',label:'Casino El Camino',s:3860,side:-1,radius:109,width:184,depth:94,height:74},
 {kind:'sixth-shakespeares',label:"Shakespeare’s Pub",s:3590,side:1,radius:121,width:206,depth:104,height:117},
].map(Object.freeze));
export function sixthStreetPlacements(){
 if(TRACK.theme!=='austin')return [];
 return SIXTH_STREET_VENUES.map(item=>{const p=trackPoint(item.s,item.side*(TRACK.roadWidth/2+item.radius+30));return Object.freeze({...item,x:p.x,z:p.y,angle:p.angle+(item.side<0?Math.PI:0),elevation:0});});
}
function rail(f,w,y,z,color='#343b36'){
 for(let x=-w/2;x<=w/2+.1;x+=7)f.box(x,y+7,z,.85,14,.85,color);
 f.box(0,y+14,z,w+2,1.5,1.5,color);f.box(0,y+1,z,w+2,1.1,1.1,color);
}
function brickwork(f,w,h,z,color){
 for(let y=9;y<h;y+=6){f.box(0,y,z,w,.45,.18,color);for(let x=-w/2+((y/6|0)%2?8:2);x<w/2;x+=16)f.box(x,y+3,z,.38,5,.2,color);}
}
function board(f,text,x,y,z,w,h,bg,fg){f.box(x,y,z,w,h,2,bg);f.box(x,y+h/2,z-.8,w+2,.8,1,'#dab789');f.box(x,y-h/2,z-.8,w+2,.8,1,'#dab789');word(f,text,x,y-h*.24,z-1.2,h*.46,w-10,fg,.65);}
function doors(f,w,z,trim){
 for(const x of [-w*.32,0,w*.32]){f.box(x,20,z,31,34,1.3,'#203937');for(const q of [-1,1])f.box(x+q*16,21,z-1.4,2,37,2,trim);f.box(x,19,z-1.9,1,32,1,trim);f.box(x+5,19,z-2.7,1.3,6,1,'#d7be7b');f.box(x,30,z-2,26,1.1,1,trim);}
}
function lights(mesh,f,w,y,z){
 for(let i=0;i<14;i++){const x=-w/2+i*w/13,drop=4*Math.sin(i/13*Math.PI);if(i)beam(mesh,f.p(x-w/13,y-drop,z),f.p(x,y-drop,z),.45,'#363a35');f.cone(x,y-drop-2,z,.8,1.8,'#f9d788',10,.8);}
}
function rooftop(mesh,f,w,d,y,color){
 f.box(0,y,0,w,3,d,'#554b42');rail(f,w-6,y+2,-d/2+2);for(const side of [-1,1]){for(let z=-d/2+5;z<d/2;z+=9)f.box(side*(w/2-3),y+9,z,1,14,1,'#383e36');f.box(side*(w/2-3),y+16,0,1.5,1.5,d-4,'#383e36');}
 for(const x of [-w*.32,0,w*.32]){f.cone(x,y+3,1,1.3,9,'#303f39',12,1.3);f.cone(x,y+12,1,10,1.4,'#b9915e',24,10);for(const dx of [-14,14])f.box(x+dx,y+7,1,7,8,7,color);}
 lights(mesh,f,w-10,y+28,-d/2+5);
}
export function addSixthStreetVenue(mesh,item){
 const f=frame(mesh,item),w=item.width,d=item.depth,front=-d/2-1,driskill=item.kind==='sixth-driskill';
 const styles={
  'sixth-driskill':['#b89981','#eadbc3','#5b6658'],
  'sixth-maggie':['#995c43','#d9b790','#2d654e'],
  'sixth-blind-pig':['#c6ac82','#e4cfab','#432d34'],
  'sixth-casino':['#865045','#cda98a','#272e2c'],
  'sixth-shakespeares':['#7e493d','#d7b797','#354b45'],
 };
 const [brick,trim,accent]=styles[item.kind],h=driskill?124:item.kind==='sixth-casino'?58:72;
 f.box(0,3,0,w+4,6,d+4,'#a69680');f.box(0,h/2+6,0,w,h,d,brick);
 details(mesh,()=>{
  brickwork(f,w-3,h-5,front,driskill?'#ae937d':'#765143');cornice(f,0,h+6,0,w,d,trim);
  doors(f,w,front-1,accent);
  for(const x of [-w*.42,-w*.14,w*.14,w*.42])f.box(x,24,front-2,3,39,4,trim);
  if(driskill){
   for(const y of [58,89,115])for(let x=-96;x<=96;x+=32)arch(f,x,y-11,front-1,15,25,trim,'#365254');
   for(const side of [-1,1]){f.box(side*106,86,front+5,21,95,18,trim);f.cone(side*106,135,front+5,15,19,'#67786b',32,1);}
   f.box(0,45,front-7,214,3,16,trim);rail(f,209,47,front-14,'#4b544b');board(f,'THE DRISKILL',0,142,front+1,135,14,'#554b41','#f5dfad');
   board(f,'E SIXTH ST',-83,42,front-19,62,10,'#2e6853','#f5e9ce');f.box(0,48,front-9,86,4,19,accent);board(f,'DRISKILL BAR',0,42,front-19,91,12,accent,'#edc689');
   for(const x of [-100,-68,68,100])f.box(x,31,front-4,3,25,3,trim);
  }else if(item.kind==='sixth-maggie'){
   for(const x of [-70,-35,0,35,70])arch(f,x,46,front-1,21,23,trim,'#364b42');
   f.box(0,41,front-8,w,3,19,accent);rail(f,w-5,44,front-16);board(f,'MAGGIE MAES',0,34,front-19,155,15,accent,'#f1cc7c');
   rooftop(mesh,f,w-9,d-7,h+12,accent);for(const x of [-w/2+9,w/2-9])f.box(x,h+28,9,2,32,2,accent);
   f.box(0,h+43,10,w-15,3,34,accent);word(f,'LIVE MUSIC',0,h+32,-d/2+3,7,92,'#f0c271',.75);
  }else if(item.kind==='sixth-blind-pig'){
   for(const x of [-66,-22,22,66])window(f,x,61,front-1,24,15,'#9c815f','#25434a');
   rooftop(mesh,f,w-8,d-6,h+12,'#764a3f');board(f,'BLIND PIG PUB',0,37,front-3,165,16,'#4f3437','#efa2b5');
   // Distinct pink pig medallion, snout and ears rather than a generic sign.
   frontDisk(f,0,61,front-4,11,'#ce8d98');frontDisk(f,0,58,front-4.5,5,'#e2a9ae');for(const x of [-2,2])frontDisk(f,x,58,front-5,1,'#5e3d43',0,12);
   for(const x of [-7,7])f.tri([x-3,68,front-4],[x,77,front-4],[x+3,68,front-4],'#ce8d98');
  }else if(item.kind==='sixth-casino'){
   f.box(0,30,front-3,w-4,52,4,'#302f2c');for(const x of [-65,65]){f.box(x,26,front-6,38,35,2,'#203331');for(let y=12;y<44;y+=5)f.box(x,y,front-8,35,1,1,'#8b985e');}
   board(f,'CASINO EL CAMINO',0,55,front-7,w-8,17,'#3b3930','#b6d16f');word(f,'BAR AND GRILL',0,40,front-8,6,99,'#e3b98a',.55);
   for(const side of [-1,1]){f.box(side*42,22,front-5,7,32,5,'#7e8760');f.cone(side*42,38,front-5,6,5,'#b7b290',16,3);}
   // Sculptural sunburst evokes the venue's eclectic courtyard and carved trim.
   frontDisk(f,0,19,front-8,8,'#acb779');for(let i=0;i<12;i++){let a=i*Math.PI/6;f.tri([Math.cos(a-.12)*9,19+Math.sin(a-.12)*9,front-8],[Math.cos(a)*14,19+Math.sin(a)*14,front-8],[Math.cos(a+.12)*9,19+Math.sin(a+.12)*9,front-8],'#aeb975');}
  }else{
   for(const x of [-76,-38,0,38,76])arch(f,x,47,front-1,24,26,trim,'#334740');board(f,'SHAKESPEARES',0,37,front-4,183,14,accent,'#efd8a2');
   rooftop(mesh,f,w-7,d-7,h+14,'#755241');for(const x of [-85,85])f.box(x,h+34,-d/2+8,3,39,3,accent);
   f.box(0,h+55,0,w-18,4,d-15,accent);for(const x of [-85,-42,0,42,85])f.box(x,h+34,d/2-8,3,39,3,accent);
   board(f,'ROOFTOP LIVE MUSIC',0,h+42,front+9,160,12,'#233d35','#eac086');
  }
  // Small entrance lanterns, sidewalk planters, and individual facade lamps.
  for(const x of [-w*.44,w*.44]){f.box(x,11,front-4,12,16,8,'#736548');f.cone(x,19,front-4,6,13,'#627a50',18,4);f.box(x,34,front-5,3,7,3,'#f3cf8c',.7);}
 });
}
