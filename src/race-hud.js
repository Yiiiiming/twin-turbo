import { TRACK, projectTrack, mod } from './engine.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** Project each replay once, using height and the previous station to distinguish stacked ramps. */
export function ghostProgressTimeline(replay) {
  let station = TRACK.startDistance, distance = 0;
  const frames = replay.frames.map((frame, index) => {
    const next = projectTrack(frame[1], frame[2], station, frame[4]).s;
    if (index) distance += mod(next - station + TRACK.length / 2, TRACK.length) - TRACK.length / 2;
    station = next;
    return [frame[0], clamp(distance / TRACK.length, 0, 1)];
  });
  return {durationMs:replay.durationMs, frames};
}

export function progressAt(timeline, timeMs) {
  if (timeMs <= 0 || !timeline?.frames.length) return 0;
  if (timeMs >= timeline.durationMs) return 1;
  const frames=timeline.frames;
  let low=0, high=frames.length-1;
  while(high-low>1){const mid=(low+high)>>1;if(frames[mid][0]<=timeMs)low=mid;else high=mid;}
  const a=frames[low], b=frames[high], fraction=(timeMs-a[0])/(b[0]-a[0]);
  return a[1]+(b[1]-a[1])*fraction;
}

/** Completed ghosts stay ahead; ties do not penalize the player. */
export function liveGhostPosition(car, timelines) {
  if (!car?._started) return {place:1,total:timelines.length+1};
  const elapsed=(car.finished?car.lastLap:car.lapTime)*1000;
  let ahead=0;
  for(const timeline of timelines){
    if(car.finished ? timeline.durationMs < elapsed - .5
      : elapsed >= timeline.durationMs || progressAt(timeline,elapsed) > car.progress + .00001) ahead++;
  }
  return {place:ahead+1,total:timelines.length+1};
}

/** Screen-space anchor above the real car, following the same camera perspective. */
export function carNitroAnchor(camera, car, width, height) {
  if(!camera?.eye || !camera?.target || !Number.isFinite(camera.fov)) return null;
  const normalize=v=>{const length=Math.hypot(...v);return length?v.map(n=>n/length):[0,0,0];};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
  const forward=normalize(camera.target.map((n,i)=>n-camera.eye[i]));
  const right=normalize(cross(forward,[0,1,0])), up=cross(right,forward);
  const relative=[car.x-camera.eye[0],(car.elevation||0)+42-camera.eye[1],car.y-camera.eye[2]];
  const depth=dot(relative,forward), tangent=Math.tan(camera.fov/2);
  if(depth<=2 || width<=0 || height<=0) return null;
  const x=(1+dot(relative,right)/(depth*tangent*(width/height)))*width/2;
  const y=(1-dot(relative,up)/(depth*tangent))*height/2;
  return Number.isFinite(x+y)&&x>0&&x<width&&y>0&&y<height?{x,y}:null;
}
