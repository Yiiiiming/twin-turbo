import { ObstacleWorld } from './collisions.js';
import { roadSurface } from './tracks.js';
import { HARBOR_TRACKS } from './harbor-tracks.js';

/** Pure, deterministic arcade simulation. Distances are pixels; time is seconds. */
const TAU = Math.PI * 2;
const CHECKPOINTS = 32;
// At the normal 363 px/s cruise speed, the 15,522 pixel route takes
// approximately 43 seconds. The long route preserves a full-length lap.
const CIRCUIT_SCALE = 2.6;

// One continuous technical circuit. The two opposite S bends and the infield
// hairpin are analytic arcs, so drawing, driving and checkpoint projection use
// the same exact geometry. Every corner has a radius of at least 520 pixels.
const segments = [];
let circuitLength = 0;
function addLine(x1, y1, x2, y2) {
  x1 *= CIRCUIT_SCALE; y1 *= CIRCUIT_SCALE;
  x2 *= CIRCUIT_SCALE; y2 *= CIRCUIT_SCALE;
  const length = Math.hypot(x2 - x1, y2 - y1);
  segments.push(Object.freeze({ kind: 'line', x1, y1, x2, y2, length,
    angle: Math.atan2(y2 - y1, x2 - x1), s: circuitLength }));
  circuitLength += length;
}
function addArc(cx, cy, radius, startAngle, sweep) {
  cx *= CIRCUIT_SCALE; cy *= CIRCUIT_SCALE; radius *= CIRCUIT_SCALE;
  const length = radius * Math.abs(sweep);
  segments.push(Object.freeze({ kind: 'arc', cx, cy, radius, startAngle,
    sweep, direction: Math.sign(sweep), length, s: circuitLength }));
  circuitLength += length;
}
addLine(700, 1430, 430, 1430);
addArc(430, 1200, 230, Math.PI / 2, Math.PI);
addLine(430, 970, 660, 970);
addArc(660, 750, 220, Math.PI / 2, -Math.PI / 2);
addArc(1100, 750, 220, Math.PI, Math.PI / 2);
addLine(1100, 530, 1870, 530);
addArc(1870, 860, 330, -Math.PI / 2, Math.PI / 2);
addLine(2200, 860, 2200, 1100);
addArc(1870, 1100, 330, 0, Math.PI / 2);
addLine(1870, 1430, 1760, 1430);
addArc(1760, 1210, 220, Math.PI / 2, Math.PI / 2);
addLine(1540, 1210, 1540, 1030);
addArc(1340, 1030, 200, 0, -Math.PI);
addLine(1140, 1030, 1140, 1210);
addArc(920, 1210, 220, 0, Math.PI / 2);
addLine(920, 1430, 700, 1430);
const LENGTH = circuitLength;

// Keep the existing staggered-grid handicap, now set to 0.15 seconds at
// the normal 363 px/s cruise speed. This is a distance equivalent, not a
// launch delay; both cars accelerate at GO and time laps at the common line.
const GRID_LANES = [-18, 22];
export const GRID_HANDICAP_SECONDS = 0.15;
const GRID_HANDICAP_DISTANCE = 363 * GRID_HANDICAP_SECONDS;
const START_GRID = Object.freeze(GRID_LANES.map((lane, index) => Object.freeze({
  lane, offset: -30 - (index === 1 ? GRID_HANDICAP_DISTANCE : 0),
})));

const COAST_TRACK = Object.freeze({
  id: 'coast', name: '海岸技术环线', city: 'coast',
  width: 2500 * CIRCUIT_SCALE, height: 1650 * CIRCUIT_SCALE, roadWidth: 120,
  checkpointMargin: 40,
  length: LENGTH, startDistance: 0, startGrid: START_GRID, checkpoints: CHECKPOINTS,
  segments: Object.freeze(segments), sections: Object.freeze([]),
  carRadius: 21, carCollisionDistance: 37, carHeight: 25,
});

const CITY_CIRCUITS = ['coast-austin','coast-beijing','coast-london','coast-rio'];
export const TRACKS = Object.fromEntries([
  ...CITY_CIRCUITS.map(id=>HARBOR_TRACKS.find(track=>track.id===id)),COAST_TRACK,
  ...HARBOR_TRACKS.filter(track=>!CITY_CIRCUITS.includes(track.id)),
].map(track=>[track.id,track]));
export let TRACK = COAST_TRACK;
export function registerTrack(track) {
  if (!track?.id || !(track.length > 0) || !Array.isArray(track.segments)) throw new TypeError('Invalid track.');
  TRACKS[track.id] = track;
  return track;
}
export function setTrack(cityId) {
  if (!Object.hasOwn(TRACKS, cityId)) throw new RangeError(`Unknown circuit: ${cityId}`);
  TRACK = TRACKS[cityId];
  return TRACK;
}

export const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const approach = (value, target, amount) => value < target
  ? Math.min(value + amount, target) : Math.max(value - amount, target);
const signedDistance = (from, to) => mod(to - from + TRACK.length / 2, TRACK.length) - TRACK.length / 2;

/** A point and forward heading. Positive lane is to the driver's right. */
export function trackPoint(distance, lane = 0) {
  const { length: LENGTH, segments } = TRACK;
  const s = mod(distance, LENGTH);
  let low = 0, high = segments.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (s < segments[middle].s + segments[middle].length) high = middle;
    else low = middle + 1;
  }
  const segment = segments[low];
  return { ...segmentPoint(segment, s - segment.s, lane), s, ...roadSurface(TRACK, s) };
}

function segmentPoint(segment, along, lane = 0) {
  let x, y, angle, curvature = 0;
  if (segment.kind === 'line') {
    const fraction = along / segment.length;
    x = segment.x1 + (segment.x2 - segment.x1) * fraction;
    y = segment.y1 + (segment.y2 - segment.y1) * fraction;
    angle = segment.angle;
  } else {
    const radial = segment.startAngle + segment.direction * along / segment.radius;
    x = segment.cx + Math.cos(radial) * segment.radius;
    y = segment.cy + Math.sin(radial) * segment.radius;
    angle = radial + segment.direction * Math.PI / 2;
    curvature = segment.direction / segment.radius;
  }
  return { x: x - Math.sin(angle) * lane, y: y + Math.cos(angle) * lane,
    angle, curvature };
}

/** Exact nearest point on the bounded lines/arcs, including both turn signs. */
export function projectTrack(x, y, referenceS = null, referenceElevation = null) {
  const { segments } = TRACK;
  let nearestS = 0, nearestSquared = Infinity;
  for (const segment of segments) {
    let along;
    if (segment.kind === 'line') {
      const dx = segment.x2 - segment.x1, dy = segment.y2 - segment.y1;
      along = clamp(((x - segment.x1) * dx + (y - segment.y1) * dy)
        / segment.length, 0, segment.length);
    } else {
      const radial = Math.atan2(y - segment.cy, x - segment.cx);
      const turn = mod(segment.direction * (radial - segment.startAngle), TAU);
      if (turn <= Math.abs(segment.sweep)) {
        along = turn * segment.radius;
      } else {
        // Outside an arc's sweep, the closest point is one of its endpoints.
        // Clamping a wrapped angle would incorrectly choose the far endpoint.
        const endAngle = segment.startAngle + segment.sweep;
        const startSquared = (x - segment.cx - Math.cos(segment.startAngle) * segment.radius) ** 2
          + (y - segment.cy - Math.sin(segment.startAngle) * segment.radius) ** 2;
        const endSquared = (x - segment.cx - Math.cos(endAngle) * segment.radius) ** 2
          + (y - segment.cy - Math.sin(endAngle) * segment.radius) ** 2;
        along = startSquared <= endSquared ? 0 : segment.length;
      }
    }
    const candidate = segmentPoint(segment, along);
    candidate.s = mod(segment.s + along, TRACK.length);
    const squared = (x - candidate.x) ** 2 + (y - candidate.y) ** 2;
    // Near a crossing or parallel street, retain the locally continuous road
    // whenever both projections are plausible for the vehicle's own position.
    const continuityPenalty = referenceS === null ? 0
      : Math.abs(signedDistance(referenceS, candidate.s)) > Math.max(250, TRACK.roadWidth * 3)
        ? TRACK.roadWidth ** 2 : 0;
    const heightPenalty = referenceElevation === null ? 0 : (roadSurface(TRACK, candidate.s).elevation - referenceElevation) ** 2;
    if (squared + continuityPenalty + heightPenalty < nearestSquared) {
      nearestSquared = squared + continuityPenalty + heightPenalty;
      nearestS = candidate.s;
    }
  }
  const p = trackPoint(nearestS);
  return { ...p, distance: Math.hypot(x - p.x, y - p.y),
    offset: -(x - p.x) * Math.sin(p.angle) + (y - p.y) * Math.cos(p.angle) };
}

function createCar(id) {
  const grid = TRACK.startGrid?.[id - 1];
  const lane = grid?.lane ?? (id === 1 ? -18 : 22);
  const gridS = TRACK.startDistance + (grid?.offset ?? -30);
  const p = trackPoint(gridS, lane);
  return {
    id, x: p.x, y: p.y, angle: p.angle, speed: 0,
    elevation: p.elevation, slope: p.slope, height: TRACK.carHeight,
    boost: 100, boosting: false, lap: 0, progress: 0,
    lapTime: 0, bestLap: null, lastLap: null,
    offroad: false, steer: 0, lastSkid: false, impact: 0,
    finished: false, finishTime: null, missedCheckpoint: false, rescueCooldown: 0,
    _lane: lane, _gridS: gridS, _started: false, _nextCheckpoint: 0,
    _lastTrackS: p.s, _lastX: p.x, _lastY: p.y,
    _lastCheckpointS: gridS, _lastCheckpointEligible: true,
    _lapStartTime: 0,
  };
}

export class RaceEngine {
  constructor({ laps = 3, obstacles = [] } = {}) {
    this.laps = clamp(Math.round(laps) || 3, 1, 9);
    this.obstacleWorld = new ObstacleWorld(obstacles, { carRadius: TRACK.carRadius });
    this.reset();
  }

  setObstacles(obstacles = []) {
    this.obstacleWorld = new ObstacleWorld(obstacles, { carRadius: TRACK.carRadius });
    for (const car of this.cars) {
      this.obstacleWorld.resolveCar(car);
      this._contain(car);
    }
    return this;
  }

  selectTrack(cityId) {
    setTrack(cityId);
    this.obstacleWorld = new ObstacleWorld([], { carRadius: TRACK.carRadius });
    return this.reset();
  }

  reset() {
    this.cars = [createCar(1), createCar(2)];
    this.state = 'menu';
    this.countdown = 3;
    this.time = 0;
    this.winner = null;
    this._resumeState = null;
    this.traffic = this._createTraffic();
    this.trafficWorld = new ObstacleWorld([], { carRadius: TRACK.carRadius });
    return this;
  }

  _createTraffic() {
    return (TRACK.trafficSections || []).map((section, index) => {
      const span = mod(section.end - section.start, TRACK.length);
      const s = mod(section.start + span * (.28 + index % 3 * .2), TRACK.length);
      const lane = section.lane ?? TRACK.roadWidth * .3;
      const p = trackPoint(s, lane);
      return { id: `london-bus-${index + 1}`, x: p.x, y: p.y,
        angle: p.angle + Math.PI, speed: 64, cruiseSpeed: 64,
        elevation: p.elevation, slope: -p.slope, length: 66, width: 15, height: 25,
        s, lane, routeStart: section.start, routeEnd: section.end, active: true, wait: 0 };
    });
  }

  _moveTraffic(dt) {
    for (const bus of this.traffic) {
      if (!bus.active) {
        bus.wait = Math.max(0, bus.wait - dt);
        const spawn = trackPoint(bus.routeEnd, bus.lane);
        if (bus.wait || this.cars.some(car => !car.finished && Math.hypot(car.x - spawn.x, car.y - spawn.y) < 450)) continue;
        bus.s = mod(bus.routeEnd, TRACK.length); bus.active = true;
      }
      const current = trackPoint(bus.s, bus.lane), angle = current.angle + Math.PI;
      let target = Math.min(bus.cruiseSpeed, Math.abs(current.curvature) > 1e-6 ? .9 / Math.abs(current.curvature) : Infinity);
      let clearance = Infinity;
      for (const car of this.cars) {
        if (car.finished || car.elevation + car.height <= bus.elevation || bus.elevation + bus.height <= car.elevation) continue;
        const dx = car.x - bus.x, dy = car.y - bus.y;
        const ahead = dx * Math.cos(angle) + dy * Math.sin(angle);
        const side = -dx * Math.sin(angle) + dy * Math.cos(angle);
        if (ahead < 0 || Math.abs(side) > bus.width / 2 + TRACK.carRadius + 4) continue;
        clearance = Math.min(clearance, ahead - bus.length / 2 - TRACK.carRadius - 2);
      }
      if (clearance < 90) target = Math.min(target, Math.max(0, clearance) * .8);
      bus.speed = approach(bus.speed, target, dt * (target < bus.speed ? 190 : 35));
      const movement = Math.max(0, Math.min(bus.speed * dt, clearance));
      if (mod(bus.s - bus.routeStart, TRACK.length) <= movement) {
        bus.active = false; bus.speed = 0; bus.wait = 5;
        continue;
      }
      bus.s = mod(bus.s - movement, TRACK.length);
      const p = trackPoint(bus.s, bus.lane);
      bus.x = p.x; bus.y = p.y; bus.angle = p.angle + Math.PI;
      bus.elevation = p.elevation; bus.slope = -p.slope;
    }
    this.trafficWorld = new ObstacleWorld(this.traffic.filter(bus => bus.active).map(bus => ({
      id: bus.id, type: 'box', x: bus.x, y: bus.y,
      halfWidth: bus.length / 2, halfDepth: bus.width / 2, angle: bus.angle,
      minHeight: bus.elevation, maxHeight: bus.elevation + bus.height,
    })), { carRadius: TRACK.carRadius });
  }

  start(laps = this.laps) {
    this.laps = clamp(Math.round(laps) || 3, 1, 9);
    this.reset();
    this.state = 'countdown';
    return this;
  }

  pause() {
    if (this.state === 'racing' || this.state === 'countdown') {
      this._resumeState = this.state;
      this.state = 'paused';
      this.cars.forEach(car => { car.boosting = false; });
    }
  }

  resume() {
    if (this.state === 'paused') {
      this.state = this._resumeState || 'racing';
      this._resumeState = null;
    }
  }

  /** Return a stuck car to its last earned checkpoint; never advances lap credit. */
  rescue(id) {
    const car = this.cars.find(candidate => candidate.id === id);
    if (!car || car.finished || this.state !== 'racing') return;
    const s = car._started ? car._lastCheckpointS + 18 : car._gridS;
    const p = trackPoint(s, car._lane);
    car.x = p.x; car.y = p.y; car.angle = p.angle;
    car.elevation = p.elevation; car.slope = p.slope;
    car.speed = 0; car.boosting = false; car.steer = 0;
    car.rescueCooldown = 2;
    car.offroad = false; car.lastSkid = false; car.impact = 0;
    car._lastTrackS = p.s; car._lastX = p.x; car._lastY = p.y;
    car._lastCheckpointEligible = true; car.missedCheckpoint = false;
    this._updateProgress(car, p.s);
  }

  /** Browser frame dt is clamped; fixed-size substeps keep contact stable. */
  step(dt, keys = new Set()) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, 0.1);
    if (this.state === 'countdown') {
      const used = Math.min(this.countdown, remaining);
      this.countdown = Math.max(0, this.countdown - used);
      remaining -= used;
      if (this.countdown > 1e-9) return;
      this.countdown = 0;
      this.state = 'racing';
    }
    if (this.state !== 'racing') return;
    while (remaining > 1e-9 && this.state === 'racing') {
      const tick = Math.min(remaining, 1 / 120);
      this._simulate(tick, keys);
      remaining -= tick;
    }
  }

  _simulate(dt, keys) {
    this.time += dt;
    if (this.traffic.length) this._moveTraffic(dt);
    for (const car of this.cars) {
      if (car.finished) continue;
      const previous = { x: car.x, y: car.y, elevation: car.elevation };
      this._drive(car, dt, keys);
      const surface = projectTrack(car.x, car.y, car._lastTrackS, car.elevation);
      car.elevation = surface.elevation; car.slope = surface.slope;
      this.obstacleWorld.resolveCar(car, previous);
      if (this.traffic.length) this.trafficWorld.resolveCar(car, previous);
      this._contain(car);
    }
    this._collide();
    for (const car of this.cars) {
      if (car.finished) continue;
      // Another car must not shove this car through a building or barrier.
      this.obstacleWorld.resolveCar(car);
      if (this.traffic.length) this.trafficWorld.resolveCar(car);
      this._contain(car);
      this._advance(car, dt);
    }
    const finishers = this.cars.filter(car => car.finished);
    if (!this.winner && finishers.length) {
      // Both cars can cross during one physics tick. Use their interpolated
      // crossing times, not the order in which the cars were simulated.
      this.winner = finishers.sort((a, b) => a.finishTime - b.finishTime || a.id - b.id)[0];
    }
    if (finishers.length === this.cars.length) {
      this.time = Math.max(...finishers.map(car => car.finishTime));
      this.state = 'finished';
    }
  }

  _drive(car, dt, keys) {
    if (car.rescueCooldown > 0) {
      car.rescueCooldown = Math.max(0, car.rescueCooldown - dt);
      car.speed = 0; car.boosting = false; car.lastSkid = false;
      return;
    }
    const p1 = car.id === 1;
    const forward = keys.has(p1 ? 'KeyW' : 'ArrowUp');
    const reverse = keys.has(p1 ? 'KeyS' : 'ArrowDown');
    const left = keys.has(p1 ? 'KeyA' : 'ArrowLeft');
    const right = keys.has(p1 ? 'KeyD' : 'ArrowRight');
    const boost = keys.has(p1 ? 'ShiftLeft' : 'Enter');
    const surface = projectTrack(car.x, car.y, car._lastTrackS, car.elevation);
    car.offroad = surface.distance > TRACK.roadWidth / 2;
    car.boosting = boost && forward && !reverse && car.boost > 0.5
      && car.speed > 40 && !car.offroad;
    car.boost = clamp(car.boost + (car.boosting ? -32 : 12) * dt, 0, 100);
    // Slope follows the car's heading, not just the circuit direction: turning
    // around swaps uphill/downhill, and driving across a slope has no assist.
    const grade = clamp(surface.slope * Math.cos(car.angle - surface.angle), -.25, .25);
    const slopeSpeed = clamp(grade * 1.2, -.18, .18);
    const maximum = (car.offroad ? 145 : car.boosting ? 517 : 363) * (1 - slopeSpeed);
    const reverseMaximum = -115 * (1 + slopeSpeed);
    // Apply gravity before throttle/drag so it changes acceleration and coast
    // distance without pushing a stationary car or defeating the brakes.
    // The adjusted speed target keeps the slope effect present at full throttle.
    if (car.speed !== 0 && grade !== 0) {
      const speed = car.speed - grade * 180 * dt;
      car.speed = car.speed > 0 ? Math.max(0, speed) : Math.min(0, speed);
    }
    if (forward && reverse) {
      car.speed = approach(car.speed, 0, 400 * dt);
    } else if (reverse) {
      car.speed = approach(car.speed, reverseMaximum, (car.speed > 0 ? 375 : 150) * dt);
    } else if (forward) {
      car.speed = approach(car.speed, maximum, (car.speed < 0 ? 350 : car.offroad ? 145 : car.boosting ? 484 : 258.5) * dt);
    } else {
      car.speed = approach(car.speed, 0, (car.offroad ? 145 : 62) * dt);
    }
    if (car.speed > maximum) car.speed = approach(car.speed, maximum, (car.offroad ? 620 : 250) * dt);
    const steerTarget = Number(right) - Number(left);
    // Ease into a held key over 200 ms. Release/countersteer returns toward
    // center faster, so corrections do not leave a long steering tail.
    const returning = steerTarget === 0 || (car.steer !== 0 && Math.sign(steerTarget) !== Math.sign(car.steer));
    car.steer = approach(car.steer, steerTarget, dt * (returning ? 7 : 5));
    const grip = Math.min(Math.abs(car.speed) / 180, 1);
    // Retain easy low-speed turns, soften normal cruise by 16.5%, and reduce
    // steering a further 8% progressively across the boost speed range.
    const speed = Math.abs(car.speed);
    const turnLimit = (2.18 - .36 * clamp(speed / 363, 0, 1))
      * (1 - .08 * clamp((speed - 363) / (517 - 363), 0, 1));
    const steeringGrip = TRACK.id === 'coast' || TRACK.id.startsWith('coast-') ? 0.23 + grip * 0.77 : 0.8 + grip * 0.2;
    const turn = car.steer * turnLimit * steeringGrip
      * Math.min(Math.abs(car.speed) / 30, 1) * Math.sign(car.speed);
    car.angle = mod(car.angle + turn * dt + Math.PI, TAU) - Math.PI;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.lastSkid = Math.abs(car.speed) > 230 && Math.abs(car.steer) > 0.5;
    car.impact = Math.max(0, car.impact - dt * 3);
    this._contain(car);
  }

  _contain(car) {
    const margin = TRACK.carRadius + 2;
    const clampedX = clamp(car.x, margin, TRACK.width - margin);
    const clampedY = clamp(car.y, margin, TRACK.height - margin);
    if (clampedX !== car.x || clampedY !== car.y) {
      car.x = clampedX; car.y = clampedY;
      car.speed *= -0.18; car.impact = 1;
    }
  }

  _collide() {
    const [a, b] = this.cars;
    // A completed car is no longer an active obstacle at the finish line.
    if (a.finished || b.finished) return;
    if (a.elevation + a.height <= b.elevation || b.elevation + b.height <= a.elevation) return;
    let dx = b.x - a.x, dy = b.y - a.y;
    const distance = Math.hypot(dx, dy);
    const minimumDistance = TRACK.carCollisionDistance;
    if (distance >= minimumDistance) return;
    if (distance < 1e-8) { dx = 1; dy = 0; }
    else { dx /= distance; dy /= distance; }
    const shift = (minimumDistance - distance) * 0.5 + 0.001;
    a.x -= dx * shift; a.y -= dy * shift;
    b.x += dx * shift; b.y += dy * shift;
    const ah = Math.cos(a.angle) * dx + Math.sin(a.angle) * dy;
    const bh = Math.cos(b.angle) * dx + Math.sin(b.angle) * dy;
    const closing = b.speed * bh - a.speed * ah;
    if (closing < 0) {
      const impulse = -closing * 0.64;
      a.speed = clamp(a.speed - impulse * ah, -160, 517);
      b.speed = clamp(b.speed + impulse * bh, -160, 517);
    }
    a.impact = b.impact = 1;
    this._contain(a);
    this._contain(b);
  }

  _advance(car, dt) {
    const { length: LENGTH, checkpoints: CHECKPOINTS } = TRACK;
    const p = projectTrack(car.x, car.y, car._lastTrackS, car.elevation);
    car.elevation = p.elevation; car.slope = p.slope;
    const onRoad = p.distance <= TRACK.roadWidth / 2;
    const checkpointLimit = TRACK.roadWidth / 2 + TRACK.checkpointMargin;
    const checkpointEligible = p.distance <= checkpointLimit;
    const delta = signedDistance(car._lastTrackS, p.s);
    const displacement = Math.hypot(car.x - car._lastX, car.y - car._lastY);
    const midpoint = projectTrack((car.x + car._lastX) / 2, (car.y + car._lastY) / 2, car._lastTrackS);
    // Short excursions onto the shoulder still pass invisible checkpoints.
    // Asphalt grip/slowdown stays strict, while both ends and the midpoint of
    // checkpoint movement must stay within the road plus its narrow runoff.
    // Ordered gates and bounded forward movement still reject shortcuts,
    // teleports, and repeated backward/forward finish-line crossings.
    const valid = checkpointEligible && car._lastCheckpointEligible && midpoint.distance <= checkpointLimit
      && delta > 0 && delta < 24 && displacement < 24;
    if (valid) {
      const gate = mod(TRACK.startDistance + car._nextCheckpoint * LENGTH / CHECKPOINTS, LENGTH);
      const untilGate = mod(gate - car._lastTrackS, LENGTH);
      if (untilGate <= delta + 1e-7) {
        const crossingTime = this.time - dt + dt * clamp(untilGate / delta, 0, 1);
        car._lastCheckpointS = gate;
        car.missedCheckpoint = false;
        if (!car._started) {
          car._started = true;
          car._lapStartTime = crossingTime;
          car._nextCheckpoint = 1;
        } else if (car._nextCheckpoint === CHECKPOINTS) {
          car.lastLap = crossingTime - car._lapStartTime;
          car.bestLap = car.bestLap === null ? car.lastLap : Math.min(car.bestLap, car.lastLap);
          car.lap += 1;
          car._lapStartTime = crossingTime;
          car._nextCheckpoint = 1;
          if (car.lap >= this.laps) {
            car.finished = true;
            car.finishTime = crossingTime;
            car.speed = 0; car.boosting = false; car.steer = 0;
            car.lastSkid = false; car.impact = 0;
          }
        } else {
          car._nextCheckpoint += 1;
        }
      }
    }
    // Give the renderer a helpful recover prompt if an expected gate was
    // crossed beyond the runoff, or if a relocation skipped it.
    if (!valid && delta > 0) {
      const gate = mod(TRACK.startDistance + car._nextCheckpoint * LENGTH / CHECKPOINTS, LENGTH);
      if (mod(gate - car._lastTrackS, LENGTH) <= delta) car.missedCheckpoint = true;
    }
    car.lapTime = car.finished ? car.lastLap
      : car._started ? Math.max(0, this.time - car._lapStartTime) : 0;
    car.offroad = !onRoad;
    this._updateProgress(car, p.s);
    car._lastTrackS = p.s; car._lastX = car.x; car._lastY = car.y;
    car._lastCheckpointEligible = checkpointEligible;
  }

  _updateProgress(car, s) {
    const { length: LENGTH, checkpoints: CHECKPOINTS } = TRACK;
    if (!car._started) { car.progress = 0; return; }
    if (car.finished) { car.progress = 1; return; }
    const section = LENGTH / CHECKPOINTS;
    const sinceGate = clamp(signedDistance(car._lastCheckpointS, s), 0, section);
    car.progress = clamp((car._nextCheckpoint - 1) / CHECKPOINTS + sinceGate / LENGTH, 0, 1);
  }
}
