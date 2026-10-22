/** Individual Shanghai skyline and cultural landmarks, interpreted as compact
 * native-mesh architecture. Placement is scenic rather than a geographic map. */
import { frame, details, beam, word } from './london-west-end.js';

const TAU = Math.PI * 2;
const tower = (kind, label, nameZh, width, depth, height, form, glass, features) =>
  ({ kind, label, nameZh, width, depth, height, family: 'skyline', form, glass, features });
const culture = (kind, label, nameZh, width, depth, height, form, features) =>
  ({ kind, label, nameZh, width, depth, height, family: 'culture', form, features });
export const SHANGHAI_DOWNHILL_MODERN = Object.freeze([
  tower('white-magnolia-plaza','White Magnolia Plaza','白玉兰广场',154,112,475,'magnolia','#8faeb5',['tapered silver crown','vertical divided fins']),
  tower('wheelock-square','Wheelock Square','会德丰国际广场',138,122,455,'wheelock','#87a6a9',['chamfered glass shaft','diagonal crown']),
  tower('tomorrow-square','Tomorrow Square','明天广场',145,120,431,'tomorrow','#7d9b9e',['rotated diamond crown','four pointed roof fins']),
  tower('shimao-plaza','Shimao International Plaza','世茂国际广场',150,116,456,'shimao','#8c9b9c',['twin rooftop spires','stepped Art Deco shoulders']),
  tower('shanghai-ifc','Shanghai IFC','上海国金中心',180,126,440,'ifc','#7eabb9',['unequal paired towers','silver faceted roof caps']),
  tower('one-lujiazui','One Lujiazui','陆家嘴滨江中心',145,112,418,'lujiazui','#6e999e',['tapered green shaft','tiered open crown']),
  tower('bank-china-tower','Bank of China Tower','中银大厦',142,120,410,'boc','#a2b6be',['stone-framed blue glass','stepped central crown']),
  tower('bank-shanghai-tower','Bank of Shanghai Headquarters','上海银行大厦',155,112,403,'bank','#799aa8',['split blue glass mass','silver horizontal sky frame']),
  tower('aurora-plaza','Aurora Plaza','震旦国际大楼',135,110,383,'aurora','#c0a461',['golden curtain wall','dark rooftop display band']),
  tower('citi-tower','Citigroup Tower','花旗集团大厦',150,110,385,'citi','#749aaa',['cut-back glazed corners','angled roof shoulders']),
  tower('hang-seng-tower','Hang Seng Bank Tower','恒生银行大厦',145,112,382,'hangseng','#789c98',['green rounded glass corners','horizontal silver rings']),
  tower('jing-an-kerry-centre','Jing An Kerry Centre','静安嘉里中心',175,118,379,'kerry','#8ba9b0',['paired asymmetric glass slabs','layered retail podium']),
  tower('k11-art-mall','K11 Art Mall Tower','上海K11艺术购物中心',148,118,367,'k11','#6b929b',['green copper-like crown','tall central blade']),
  tower('grand-gateway','Grand Gateway 66','港汇恒隆广场',183,128,363,'gateway','#a49a89',['symmetrical twin towers','stepped copper crowns']),
  tower('plaza-66','Plaza 66','恒隆广场',143,116,390,'plaza','#9bac9b',['slim stepped green tower','tall silver crown fin']),
  culture('power-station-art','Power Station of Art','上海当代艺术博物馆',186,126,310,'power',['industrial turbine hall','freestanding striped smokestack']),
  culture('china-art-museum','China Art Museum','中华艺术宫',190,146,164,'china',['red inverted-pyramid dougong','four monumental legs']),
  culture('natural-history-museum','Shanghai Natural History Museum','上海自然博物馆',186,142,111,'natural',['spiral green roof','cellular glass wall']),
  culture('science-technology-museum','Shanghai Science and Technology Museum','上海科技馆',198,134,138,'science',['central transparent globe','sweeping paired wings']),
  culture('astronomy-museum','Shanghai Astronomy Museum','上海天文馆',194,148,116,'astronomy',['planetarium sphere','large roof oculus']),
  culture('oriental-art-center','Shanghai Oriental Art Center','上海东方艺术中心',190,154,133,'oriental',['five petal-shaped halls','copper perforation rhythm']),
  culture('mercedes-benz-arena','Mercedes-Benz Arena','梅赛德斯奔驰文化中心',194,150,120,'arena',['flying-saucer roof','continuous band of glass']),
  culture('library-east','Shanghai Library East','上海图书馆东馆',184,130,137,'library',['offset cantilevered volumes','white stone-screen facade']),
  culture('long-museum-west-bund','Long Museum West Bund','龙美术馆西岸馆',184,130,124,'long',['exposed concrete umbrella vaults','retained industrial coal hopper']),
  culture('west-bund-museum','West Bund Museum','西岸美术馆',194,136,112,'westbund',['three pale rectilinear galleries','central open courtyard']),
  culture('yuz-museum','Yuz Museum','余德耀美术馆',190,138,114,'yuz',['former aviation hangar outline','sawtooth industrial skylights']),
  culture('urban-planning-hall','Urban Planning Exhibition Center','上海城市规划展示馆',182,132,159,'planning',['four-petal white roof crown','civic stone colonnade']),
  culture('international-cruise-terminal','International Cruise Terminal','上海国际客运中心',188,146,135,'cruise',['three suspended glass eggs','long curved metal canopy']),
  culture('china-maritime-museum','China Maritime Museum','中国航海博物馆',186,142,151,'maritime',['paired sail-shaped roofs','ship mast and rigging']),
  culture('culture-square','Shanghai Culture Square','上海文化广场',188,148,107,'square',['low green undulating roof','large glazed theatre entrance']),
].map(item => Object.freeze({ ...item, features: Object.freeze(item.features), radius: Math.hypot(item.width, item.depth) / 2 + 15 })));

function pane(f,x,y,z,w,h,color,glow=0){f.quad([x-w/2,y-h/2,z],[x-w/2,y+h/2,z],[x+w/2,y+h/2,z],[x+w/2,y-h/2,z],color,glow);}
function line(f,x,y,z,w,h,color){pane(f,x,y,z,w,h,color);}
function facade(mesh,item,w,d,bottom,top,{glass='#40646d',trim='#c5ccbd',spacing=19,cols=6}={}){
  details(mesh,()=>{
    for(let side=0;side<4;side++){
      const face=frame(mesh,{...item,angle:item.angle+side*Math.PI/2}),width=side%2?d:w,depth=side%2?w:d;
      const count=Math.max(3,Math.round(cols*width/w)),step=(width-10)/count;
      for(let y=bottom+spacing*.48;y<top-3;y+=spacing){
        const z=-depth/2-.35;
        // A continuous spandrel follows each floor across the curtain wall.
        // Sharing this strip preserves facade detail with fewer tiny faces.
        line(face,0,y-spacing*.32,z-.2,width-9,.85,trim);
        for(let col=0;col<count;col++){
          const x=-width/2+5+(col+.5)*step;
          pane(face,x,y,z,step*.68,spacing*.62,glass,.025);
          if(col%3===0)line(face,x,y,z-.24,.65,spacing*.62,trim);
        }
      }
    }
  });
}
function plaque(f,item,y=24,z=-item.depth/2-2){
  f.box(0,y,z,item.width*.76,14,2,'#263f47');word(f,item.label.toUpperCase(),0,y-3.2,z-1.2,6.2,item.width*.69,'#e9d9b1',.15);
}
function flatRoof(f,w,d,y,color='#c0c6b9'){
  f.box(0,y,0,w+4,3,d+4,color);
  for(const side of [-1,1]){f.box(side*(w/2-1),y+3,0,2,6,d,color);f.box(0,y+3,side*(d/2-1),w,6,2,color);}
}
function ring(f,x,y,z,r,height,color,sides=32,top=r){f.cone(x,y,z,r,height,color,sides,top);}
function ellipsoid(f,x,y,z,rx,ry,rz,color,rings=12,sides=32){
  const p=(a,b)=>[x+Math.cos(a)*Math.sin(b)*rx,y+Math.cos(b)*ry,z+Math.sin(a)*Math.sin(b)*rz];
  for(let j=0;j<rings;j++)for(let i=0;i<sides;i++)f.quad(p(i/sides*TAU,j/rings*Math.PI),p(i/sides*TAU,(j+1)/rings*Math.PI),p((i+1)/sides*TAU,(j+1)/rings*Math.PI),p((i+1)/sides*TAU,j/rings*Math.PI),color,.03);
}
function pitched(f,x,y,z,w,d,h,color){
  f.quad([x-w/2,y,z-d/2],[x,y+h,z-d/2],[x,y+h,z+d/2],[x-w/2,y,z+d/2],color);
  f.quad([x,y+h,z-d/2],[x+w/2,y,z-d/2],[x+w/2,y,z+d/2],[x,y+h,z+d/2],color);
  for(const side of [-1,1])f.tri([x-w/2,y,z+side*d/2],[x+w/2,y,z+side*d/2],[x,y+h,z+side*d/2],color);
}
function podium(mesh,item,f){
  f.box(0,4,0,item.width+8,8,item.depth+8,'#a6afa9');
  f.box(0,19,0,item.width,30,item.depth,'#c4c4b3');
  details(mesh,()=>{facade(mesh,item,item.width,item.depth,7,32,{spacing:24,cols:7,glass:'#355866'});plaque(f,item,35);});
}
function crownFin(f,x,y,z,width,height,depth,color){
  f.tri([x-width/2,y,z-depth/2],[x+width/2,y,z-depth/2],[x,y+height,z-depth/2],color);
  f.tri([x-width/2,y,z+depth/2],[x,y+height,z+depth/2],[x+width/2,y,z+depth/2],color);
  f.quad([x-width/2,y,z-depth/2],[x,y+height,z-depth/2],[x,y+height,z+depth/2],[x-width/2,y,z+depth/2],color);
  f.quad([x,y+height,z-depth/2],[x+width/2,y,z-depth/2],[x+width/2,y,z+depth/2],[x,y+height,z+depth/2],color);
}
function skyscraper(mesh,item){
  const f=frame(mesh,item),{width:w,depth:d,height:h,glass,form}=item,metal='#c3cdd0',dark='#3f626f';podium(mesh,item,f);
  const twin=['ifc','gateway','kerry'].includes(form),shaftWidth=w*(twin?.34:.73),shaftDepth=d*.77;
  const shafts=twin?[-1,1]:[0];
  for(const side of shafts){
    const x=side*w*.23,top=h*(twin&&side<0&&form!=='gateway'?.81:.87),bottom=34,sw=shaftWidth;
    if(form==='hangseng'){
      f.box(0,(top+bottom)/2,0,sw*.66,top-bottom,shaftDepth,glass);
      for(const sign of [-1,1])ring(f,sign*sw*.31,bottom,0,sw*.25,top-bottom,glass,24,sw*.25);
    }else f.box(x,(top+bottom)/2,0,sw,top-bottom,shaftDepth,glass);
    const offset={...item,x:f.p(x,0,0)[0],z:f.p(x,0,0)[2]};
    facade(mesh,offset,sw,shaftDepth,bottom,top,{glass:form==='aurora'?'#c4a76c':dark,trim:metal,cols:twin?4:7,spacing:15+(form==='plaza'?3:0)});
    details(mesh,()=>{
      for(let n=-2;n<=2;n++)f.box(x+n*sw/5,(top+bottom)/2,-shaftDepth/2-.8,1.3,top-bottom,1.1,metal);
      if(['ifc','citi','wheelock'].includes(form)){
        crownFin(f,x,top,0,sw,Math.min(h-top,50),shaftDepth,metal);
        f.box(x-sw*.17,top+18,0,2,35,shaftDepth+1,'#5c8192');
      }else if(form==='magnolia'){
        for(let i=0;i<5;i++)f.box(x+(i-2)*sw*.17,top+(h-top)*(1-Math.abs(i-2)*.14)/2,0,sw*.16,(h-top)*(1-Math.abs(i-2)*.14),shaftDepth*(.8-Math.abs(i-2)*.11),metal);
      }else if(form==='tomorrow'){
        const roof=frame(mesh,{...item,angle:item.angle+Math.PI/4});
        roof.cone(0,top,0,sw*.43,h-top-4,metal,4,sw*.16);
        for(const sx of [-1,1])for(const sz of [-1,1])crownFin(f,sx*sw*.28,top,sz*shaftDepth*.29,sw*.17,h-top,sw*.17,metal);
      }else if(form==='shimao'){
        for(let i=0;i<3;i++)f.box(0,top+i*9+4,0,sw*(1-.18*i),8,shaftDepth*(1-.16*i),metal);
        for(const sign of [-1,1])ring(f,sign*sw*.28,top+20,0,2.7,h-top-20,'#d2d6d2',12,.6);
      }else if(form==='aurora'){
        f.box(0,top+14,0,sw+2,28,shaftDepth+2,'#273c43');word(f,'AURORA',0,top+7,-shaftDepth/2-1.2,12,sw*.85,'#e3c473',.4);flatRoof(f,sw+5,shaftDepth+5,top+30,'#cfb579');
      }else if(form==='bank'){
        f.box(-sw*.27,top+22,0,sw*.35,44,shaftDepth,metal);f.box(sw*.27,top+15,0,sw*.35,30,shaftDepth,glass);f.box(0,top+38,0,sw,8,shaftDepth*.65,metal);
      }else{
        const copper=['gateway','k11','plaza'].includes(form)?'#6a9185':metal;
        for(let tier=0;tier<4;tier++){const tw=sw*(.91-tier*.18),td=shaftDepth*(.88-tier*.16),hh=(h-top)*.19;f.box(x,top+(tier+.5)*hh,0,tw,hh,td,copper);}
        if(form!=='kerry')ring(f,x,top+(h-top)*.72,0,2.6,(h-top)*.28,metal,12,.7);
      }
      if(form==='wheelock')for(const sign of [-1,1])beam(mesh,f.p(sign*sw/2,top-58,-shaftDepth/2-1),f.p(0,top+24,-shaftDepth/2-1),1.9,metal);
      if(form==='boc')for(const sign of [-1,1])f.box(sign*sw*.43,(top+bottom)/2,0,8,top-bottom+14,shaftDepth+4,'#c3bca6');
      if(form==='lujiazui')for(const sign of [-1,1])beam(mesh,f.p(sign*sw*.48,bottom,-shaftDepth/2-1),f.p(sign*sw*.27,top,-shaftDepth/2-1),2,metal);
      if(form==='k11')f.box(0,top+(h-top)/2,0,sw*.22,h-top,shaftDepth*.38,'#507b70');
      for(const sign of [-1,1])f.box(x+sign*sw*.25,top+5,shaftDepth*.23,sw*.14,10,10,'#6c8285');
    });
  }
}

function cultural(mesh,item){
  const f=frame(mesh,item),{width:w,depth:d,height:h,form}=item,stone='#c9c9b9',glass='#527d88',steel='#bccbd0',dark='#3b5660';
  f.box(0,3,0,w+8,6,d+8,'#a9b2ab');
  if(form==='power'){
    f.box(-w*.1,47,0,w*.72,88,d*.84,'#a4a5a0');f.box(-w*.1,94,0,w*.75,7,d*.9,'#697d81');
    ring(f,w*.36,6,d*.1,11,h-6,'#b2a39c',24,7);
    details(mesh,()=>{for(let y=104;y<h-10;y+=21)ring(f,w*.36,y,d*.1,11-(y-6)/(h-6)*4,1.8,'#747d7c',24,11-(y-6)/(h-6)*4);for(let x=-w*.4;x<w*.22;x+=18)pane(f,x,49,-d*.425,11,57,glass);for(let i=0;i<5;i++)pitched(f,-w*.35+i*w*.125,98,0,w*.12,d*.84,10,steel);});
  }else if(form==='china'){
    for(const x of [-w*.22,w*.22])for(const z of [-d*.22,d*.22])f.box(x,38,z,24,70,24,'#8d2924');
    for(let tier=0;tier<7;tier++){const ww=w*(.48+tier*.073),dd=d*(.44+tier*.08);f.box(0,75+tier*10,0,ww,9,dd,tier%2?'#b3452c':'#a83228');}
    f.box(0,150,0,w,10,d,'#a62f26');
    details(mesh,()=>{for(let tier=0;tier<7;tier++)for(let i=-4;i<=4;i++)f.box(i*w*.09,75+tier*10,-d*(.44+tier*.08)/2-.7,3,9,1.2,'#d76a3d');for(let z=-d*.4;z<=d*.4;z+=14)f.box(0,157,z,w*.86,3,2,'#ce5a37');});
  }else if(form==='natural'){
    f.box(0,31,0,w*.9,56,d*.88,'#b6c7bd');
    details(mesh,()=>{for(let i=0;i<40;i++){const a=i/40*TAU,r=w*.37*(1-i/63),y=60+i*.9;f.box(Math.cos(a)*r,y,Math.sin(a)*d*.31,23,9,23,i%3?'#6e8f69':'#8fa17b');}for(let col=0;col<15;col++)for(let row=0;row<4;row++){const x=-w*.4+col*w*.057,y=15+row*12;pane(f,x,y,-d*.445,w*.043,10,glass);beam(mesh,f.p(x-4,y-5,-d*.45),f.p(x+4,y+5,-d*.45),.8,steel);} });
  }else if(form==='science'){
    for(const sign of [-1,1]){f.box(sign*w*.3,40,6,w*.35,74,d*.77,stone);f.box(sign*w*.3,79,6,w*.37,5,d*.8,steel);}
    ring(f,0,7,-d*.03,41,70,glass,40,41);
    details(mesh,()=>{ellipsoid(f,0,71,-d*.04,45,56,45,glass);for(let i=0;i<16;i++){const a=i/16*TAU;beam(mesh,f.p(Math.cos(a)*45,71,Math.sin(a)*45),f.p(0,127,0),.8,steel);}for(const sign of [-1,1])for(let x=0;x<5;x++)pane(f,sign*(w*.14+x*w*.065),43,-d*.39,10,48,glass);});
  }else if(form==='astronomy'){
    f.box(0,29,0,w*.87,52,d*.86,'#d0c8af');
    details(mesh,()=>{ellipsoid(f,w*.19,63,d*.04,39,46,39,'#bdc3c0');for(let i=0;i<48;i++){const a=i/48*TAU,b=(i+1)/48*TAU,outer=w*.43,inner=w*.15;f.quad([Math.cos(a)*inner,64,Math.sin(a)*inner],[Math.cos(a)*outer,64,Math.sin(a)*d*.42],[Math.cos(b)*outer,64,Math.sin(b)*d*.42],[Math.cos(b)*inner,64,Math.sin(b)*inner],'#c1b79c');}pane(f,-w*.24,29,-d*.44,w*.3,40,glass);});
  }else if(form==='oriental'){
    for(let i=0;i<5;i++){const a=i/5*TAU,x=Math.cos(a)*w*.26,z=Math.sin(a)*d*.23,r=29+i%2*4;ring(f,x,6,z,r,70+i*5,'#ad8766',32,r*.8);details(mesh,()=>{ellipsoid(f,x,78+i*5,z,r*.82,18,r*.82,steel,8,24);for(let j=0;j<14;j++){const b=j/14*TAU;f.box(x+Math.cos(b)*r,39,z+Math.sin(b)*r,1,58,1,'#d0b190');}});}
  }else if(form==='arena'){
    ring(f,0,6,0,w*.38,49,glass,48,w*.42);
    details(mesh,()=>{ellipsoid(f,0,66,0,w*.49,47,d*.48,steel,16,56);for(const y of [48,58,68,78])for(let i=0;i<48;i++){const a=i/48*TAU,b=(i+1)/48*TAU;f.quad([Math.cos(a)*w*.48,y,Math.sin(a)*d*.47],[Math.cos(b)*w*.48,y,Math.sin(b)*d*.47],[Math.cos(b)*w*.48,y+2,Math.sin(b)*d*.47],[Math.cos(a)*w*.48,y+2,Math.sin(a)*d*.47],dark);}});
  }else if(form==='library'){
    f.box(0,29,0,w*.75,52,d*.78,glass);f.box(-w*.07,74,0,w*.86,38,d*.9,stone);f.box(w*.06,111,0,w*.88,36,d*.86,'#d6d4c3');
    details(mesh,()=>{for(let i=0;i<27;i++){const x=-w*.47+i*w*.035;f.box(x,90,-d*.455,1,70,1,steel);}for(const sign of [-1,1])for(let j=0;j<7;j++)f.box(sign*w*.44,91,-d*.37+j*d*.12,1,67,1,steel);pane(f,0,27,-d*.4,w*.6,38,dark);});
  }else if(form==='long'){
    for(let i=0;i<4;i++){const x=(i-1.5)*w*.22;f.box(x,41,0,w*.19,70,d*.85,'#9da6a3');details(mesh,()=>{for(let j=0;j<16;j++){const a=j/16*Math.PI,b=(j+1)/16*Math.PI,r=w*.108;f.quad([x+Math.cos(a)*r,80+Math.sin(a)*24,-d*.44],[x+Math.cos(b)*r,80+Math.sin(b)*24,-d*.44],[x+Math.cos(b)*r,80+Math.sin(b)*24,d*.44],[x+Math.cos(a)*r,80+Math.sin(a)*24,d*.44],'#b5beb6');}});}
    f.box(w*.29,52,-d*.37,w*.14,90,d*.19,'#7f8f89');f.box(w*.29,101,-d*.37,w*.25,15,d*.29,'#9caaa0');
  }else if(form==='westbund'){
    for(const [x,z,ww,dd,hh]of[[-w*.29,0,w*.3,d*.9,80],[w*.29,d*.06,w*.3,d*.79,88],[0,d*.28,w*.42,d*.3,100]]){f.box(x,6+hh/2,z,ww,hh,dd,'#c5d0cc');details(mesh,()=>{for(let y=17;y<hh;y+=11)f.box(x,6+y,z-dd/2-.4,ww,1,1,'#a5b9bb');pane(f,x,22,z-dd/2-.8,ww*.58,26,glass);});}
  }else if(form==='yuz'){
    f.box(0,37,0,w*.92,62,d*.88,'#b9c1b6');
    details(mesh,()=>{for(let i=0;i<6;i++){const x=-w*.38+i*w*.15;pitched(f,x,69,0,w*.15,d*.9,32,'#b7c9c9');pane(f,x,80,-d*.455,w*.1,13,glass);}pane(f,0,36,-d*.447,w*.68,44,glass);for(let x=-w*.35;x<=w*.35;x+=13)f.box(x,36,-d*.45,1.4,50,1.4,steel);});
  }else if(form==='planning'){
    f.box(0,52,0,w*.87,92,d*.88,stone);facade(mesh,item,w*.87,d*.88,15,96,{cols:8,spacing:23,glass});
    details(mesh,()=>{for(const sx of [-1,1])for(const sz of [-1,1]){const x=sx*w*.2,z=sz*d*.19;f.cone(x,100,z,31,35,'#e0dfcb',4,9);f.box(x,139,z,21,5,21,'#c4c7b6');}for(let x=-w*.36;x<=w*.36;x+=17)f.box(x,41,-d*.48,5,68,5,'#d8d8c3');});
  }else if(form==='cruise'){
    f.box(0,30,0,w*.9,48,d*.55,glass);
    details(mesh,()=>{for(let i=-1;i<=1;i++){ellipsoid(f,i*w*.29,78,0,23,48,30,['#77aab4','#b8c7ca','#83a2b6'][i+1]);for(const sign of [-1,1])beam(mesh,f.p(i*w*.29+sign*20,40,0),f.p(i*w*.29+sign*25,112,0),1,steel);}for(let i=0;i<20;i++){const x=-w*.46+i*w*.046,y=55+13*Math.cos(x/w*Math.PI*2);f.box(x,y,0,w*.05,3,d*.91,steel);}});
  }else if(form==='maritime'){
    f.box(0,34,0,w*.88,56,d*.84,stone);
    details(mesh,()=>{for(const sign of [-1,1])for(let j=0;j<16;j++){const t=j/16,u=(j+1)/16,x=sign*w*.32;const p=v=>[x+sign*(v-.5)*w*.22,63+73*Math.sin(v*Math.PI),-d*.43+v*d*.86];f.quad(p(t),p(u),[p(u)[0]-sign*12,p(u)[1],p(u)[2]],[p(t)[0]-sign*12,p(t)[1],p(t)[2]],'#d8d9c7');}f.box(0,95,0,2,110,2,'#c8b797');for(const side of [-1,1])beam(mesh,f.p(0,147,0),f.p(side*w*.2,34,-d*.35),.7,'#d9cfb5');});
  }else if(form==='square'){
    f.box(0,28,0,w*.89,44,d*.84,glass);
    details(mesh,()=>{for(let i=0;i<22;i++){const x=-w*.47+i*w*.044,y=65+24*Math.cos(x/w*Math.PI*2);f.box(x,y,0,w*.046,5,d*.91,i%3?'#829c80':'#9aab8b');}for(let x=-w*.38;x<=w*.38;x+=15)f.box(x,31,-d*.44,1.2,49,1.2,steel);});
  }
  details(mesh,()=>{
    plaque(f,item,17,-d/2-3);
    for(const side of [-1,1]){
      f.box(side*(w/2-13),9,-d/2+7,18,8,14,'#a8b6a2');f.box(side*(w/2-13),15,-d/2+7,15,6,11,'#668766');
    }
  });
}

export function addShanghaiDownhillModern(mesh,item){
  if(item.family==='skyline')skyscraper(mesh,item);else cultural(mesh,item);
}
