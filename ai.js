/** Fair, deterministic computer driver. Every movement uses the player's controls. */
import { TRACK, projectTrack, trackPoint, mod } from './engine.js';

const TAU=Math.PI*2;
const approach=(value,target,amount)=>value<target?Math.min(target,value+amount):Math.max(target,value-amount);
const angleDifference=(from,to)=>mod(to-from+Math.PI,TAU)-Math.PI;

export class RaceAI {
  constructor({carId=2}={}) {this.carId=carId;this.reset();}

  reset() {
    this.elapsed=0;this.rescues=0;
    this._lane=this.carId===1?-24:24;
    this._lastS=null;this._stuckFor=0;this._missedFor=0;this._offroadFor=0;
    this._boostRemaining=0;this._boostCooldown=15;
  }

  update(engine,dt=1/60) {
    const keys=new Set();
    if(engine.state!=='racing'||!Number.isFinite(dt)||dt<=0)return keys;
    const car=engine.cars.find(candidate=>candidate.id===this.carId);
    if(!car||car.finished)return keys;
    const tick=Math.min(dt,.1);
    this.elapsed+=tick;
    const projection=projectTrack(car.x,car.y,car._lastTrackS);
    const city=TRACK.id!=='coast'&&!TRACK.id.startsWith('coast-');
    const advanced=this._lastS===null?0:mod(projection.s-this._lastS+TRACK.length/2,TRACK.length)-TRACK.length/2;
    this._lastS=projection.s;
    if(car.rescueCooldown>0) {
      this._stuckFor=0;this._missedFor=0;this._offroadFor=0;this._boostRemaining=0;
      return keys;
    }
    this._stuckFor=advanced<tick*12?this._stuckFor+tick:Math.max(0,this._stuckFor-tick*2);
    this._missedFor=car.missedCheckpoint?this._missedFor+tick:0;
    this._offroadFor=projection.distance>TRACK.roadWidth/2?this._offroadFor+tick:0;
    if(this._stuckFor>4.2||this._missedFor>2.5||this._offroadFor>3.5) {
      engine.rescue(this.carId);
      this.rescues++;
      this._lastS=projectTrack(car.x,car.y).s;
      this._stuckFor=0;this._missedFor=0;this._offroadFor=0;this._boostRemaining=0;
      return keys;
    }

    const upcoming=city?Array.from({length:19},(_,index)=>{
      const s=projection.s+index*20,p=trackPoint(s);
      // OSM has short lane-alignment kinks. Judge the bend over the car's
      // approach distance instead of treating a one-metre arc as a hairpin.
      p.curvature=angleDifference(trackPoint(s-40).angle,trackPoint(s+40).angle)/80;
      return p;
    })
      :[projection,trackPoint(projection.s+150),trackPoint(projection.s+330)];
    const curvature=Math.max(...upcoming.map(point=>Math.abs(point.curvature)));
    // A little breathing room in corners and small line variations make a
    // beatable club-level opponent, without hidden speed or grip advantages.
    let targetSpeed=(curvature>.00165?329:curvature>.0002?340:351)+Math.sin(this.elapsed*.53)*2.5;
    if(city)targetSpeed=Math.min(345,Math.max(60,1.2/Math.max(curvature,.00001)));
    let desiredLane=(city?-18:this.carId===1?-24:24)+Math.sin(this.elapsed*.36)*1.8;
    if(city&&curvature>.018)desiredLane=0;
    const narrowPassage=city&&(TRACK.sections||[]).some(section=>section.passage&&projection.s>=section.start-220&&projection.s<=section.end+90);
    let traffic=false;
    const forward=[Math.cos(projection.angle),Math.sin(projection.angle)];
    for(const other of [...engine.cars,...(engine.traffic||[]).filter(vehicle=>vehicle.active)]) {
      if(other.id===this.carId||other.finished)continue;
      if((other.elevation??0)+(other.height??25)<=car.elevation||car.elevation+car.height<=(other.elevation??0))continue;
      const dx=other.x-car.x,dy=other.y-car.y;
      const ahead=dx*forward[0]+dy*forward[1],side=-dx*forward[1]+dy*forward[0];
      if(ahead<-45||ahead>330||Math.abs(side)>65)continue;
      const otherLane=projectTrack(other.x,other.y,other._lastTrackS??other.s).offset;
      const clearance=city?(other.width?other.width/2+TRACK.carRadius+10:TRACK.carCollisionDistance+5):40;
      if(Math.abs(side)<clearance) {
        // Plan an ordinary pass, and lift/brake while there is not enough room.
        desiredLane=otherLane>=0?city?-24:-38:city?24:38;
        if(ahead>0&&Math.abs(side)<clearance-3) {
          const otherForward=other.speed*Math.cos(other.angle-projection.angle);
          targetSpeed=Math.min(targetSpeed,Math.max(0,otherForward)+Math.max(0,ahead-80)*1.1);
          traffic=true;
        }
      }
    }
    // A real masonry arch is narrower than the surrounding boulevard. Queue
    // through its central passage instead of steering around another car into
    // a stone pier. This still uses only the same player controls.
    if(narrowPassage){desiredLane=0;targetSpeed=Math.min(targetSpeed,110);traffic=true;}
    this._lane=approach(this._lane,desiredLane,tick*22);
    const lookAhead=city?30+Math.abs(car.speed)*.16:75+Math.abs(car.speed)*.14;
    const target=trackPoint(projection.s+lookAhead,this._lane);
    const error=angleDifference(car.angle,Math.atan2(target.y-car.y,target.x-car.x));
    const controls=this.carId===1
      ?{forward:'KeyW',brake:'KeyS',left:'KeyA',right:'KeyD',boost:'ShiftLeft'}
      :{forward:'ArrowUp',brake:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',boost:'Enter'};
    if(error>.025)keys.add(controls.right);
    if(error<-.025)keys.add(controls.left);
    if(Math.abs(error)>.5)targetSpeed=Math.min(targetSpeed,city?60:150);
    if(projection.distance>TRACK.roadWidth/2)targetSpeed=Math.min(targetSpeed,125);

    this._boostCooldown=Math.max(0,this._boostCooldown-tick);
    this._boostRemaining=Math.max(0,this._boostRemaining-tick);
    const straight=curvature<.00001&&Math.abs(trackPoint(projection.s+500).curvature)<.00001;
    const canBoost=straight&&!traffic&&Math.abs(error)<.035&&car.speed>290&&car.boost>45&&!car.offroad;
    if(canBoost&&this._boostCooldown===0) {
      this._boostRemaining=.3;this._boostCooldown=20;
    }
    if(this._boostRemaining>0&&canBoost) {
      keys.add(controls.forward);keys.add(controls.boost);
    } else if(car.speed<targetSpeed-1)keys.add(controls.forward);
    else if(car.speed>targetSpeed+14)keys.add(controls.brake);
    return keys;
  }
}
