import { TRACK, trackPoint, mod } from './engine.js';

export const MAGIC_FLIGHT_ROUTE = Object.freeze({
 start:5850,end:7450,clearance:140,travelSeconds:10,turnSeconds:2,
});
export const MAGIC_FLIGHT_CYCLE = 2*(MAGIC_FLIGHT_ROUTE.travelSeconds+MAGIC_FLIGHT_ROUTE.turnSeconds);

/** Follow the racing centerline above Hogwarts. Slow to a hover before turning,
 * keeping the car over the road without an abrupt reversal or a low pass through
 * the roadside lamps. Simulation time synchronizes pause and both viewports. */
export function londonMagicFlight(time=0){
 if(TRACK.id!=='coast-london')return null;
 const {start,end,clearance,travelSeconds,turnSeconds}=MAGIC_FLIGHT_ROUTE,
  t=mod(Number.isFinite(time)?Math.max(0,time):0,MAGIC_FLIGHT_CYCLE),
  phase=t/MAGIC_FLIGHT_CYCLE*Math.PI*2,
  ease=u=>(1-Math.cos(Math.PI*u))*.5,
  turn=u=>u*u*(3-2*u);
 let s,heading=0;
 if(t<travelSeconds){s=start+(end-start)*ease(t/travelSeconds);}
 else if(t<travelSeconds+turnSeconds){
  s=end;heading=Math.PI*turn((t-travelSeconds)/turnSeconds);
 }else if(t<2*travelSeconds+turnSeconds){
  s=end-(end-start)*ease((t-travelSeconds-turnSeconds)/travelSeconds);heading=Math.PI;
 }else{
  s=start;heading=Math.PI*(1+turn((t-2*travelSeconds-turnSeconds)/turnSeconds));
 }
 const point=trackPoint(s);
 return {x:point.x,y:point.elevation+clearance+7*Math.sin(phase*2),z:point.y,
  angle:mod(point.angle+heading,Math.PI*2),roll:.08*Math.sin(phase),pitch:.045*Math.sin(phase*2),s};
}
