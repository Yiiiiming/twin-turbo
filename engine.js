/** Pure, deterministic arcade simulation. Distances are pixels; time is seconds. */
const TAU = Math.PI * 2;
const CHECKPOINTS = 32;
// At the normal 330 px/s cruise speed, the 15,522 pixel route takes
// approximately 47 seconds. Extend the geography, not the car's response.
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

export const TRACK = Object.freeze({
  width: 2500 * CIRCUIT_SCALE, height: 1650 * CIRCUIT_SCALE, roadWidth: 120,
  length: LENGTH, startDistance: 0, checkpoints: CHECKPOINTS,
  segments: Object.freeze(segments),
});

export const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const approach = (value, target, amount) => value < target
  ? Math.min(value + amount, target) : Math.max(value - amount, target);
const signedDistance = (from, to) => mod(to - from + LENGTH / 2, LENGTH) - LENGTH / 2;

/** A point and forward heading. Positive lane is to the driver's right. */
export function trackPoint(distance, lane = 0) {
  const s = mod(distance, LENGTH);
  const segment = segments.find(part => s < part.s + part.length) || segments.at(-1);
  const along = s - segment.s;
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
    angle, curvature, s };
}

/** Exact nearest point on the bounded lines/arcs, including both turn signs. */
export function projectTrack(x, y) {
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
    const candidate = trackPoint(segment.s + along);
    const squared = (x - candidate.x) ** 2 + (y - candidate.y) ** 2;
    if (squared < nearestSquared) {
      nearestSquared = squared;
      nearestS = candidate.s;
    }
  }
  const p = trackPoint(nearestS);
  return { ...p, distance: Math.sqrt(nearestSquared),
    offset: -(x - p.x) * Math.sin(p.angle) + (y - p.y) * Math.cos(p.angle) };
}

function createCar(id) {
  const lane = id === 1 ? 22 : -18;
  const p = trackPoint(TRACK.startDistance - 30, lane);
  return {
    id, x: p.x, y: p.y, angle: p.angle, speed: 0,
    boost: 100, boosting: false, lap: 0, progress: 0,
    lapTime: 0, bestLap: null, lastLap: null,
    offroad: false, steer: 0, lastSkid: false, impact: 0,
    finished: false, finishTime: null, missedCheckpoint: false, rescueCooldown: 0,
    _lane: lane, _started: false, _nextCheckpoint: 0,
    _lastTrackS: p.s, _lastX: p.x, _lastY: p.y,
    _lastCheckpointS: TRACK.startDistance - 30, _lastOnRoad: true,
    _lapStartTime: 0,
  };
}

export class RaceEngine {
  constructor({ laps = 3 } = {}) {
    this.laps = clamp(Math.round(laps) || 3, 1, 9);
    this.reset();
  }

  reset() {
    this.cars = [createCar(1), createCar(2)];
    this.state = 'menu';
    this.countdown = 3;
    this.time = 0;
    this.winner = null;
    this._resumeState = null;
    return this;
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
    const s = car._started ? car._lastCheckpointS + 18 : TRACK.startDistance - 30;
    const p = trackPoint(s, car._lane);
    car.x = p.x; car.y = p.y; car.angle = p.angle;
    car.speed = 0; car.boosting = false; car.steer = 0;
    car.rescueCooldown = 2;
    car.offroad = false; car.lastSkid = false; car.impact = 0;
    car._lastTrackS = p.s; car._lastX = p.x; car._lastY = p.y;
    car._lastOnRoad = true; car.missedCheckpoint = false;
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
    for (const car of this.cars) this._drive(car, dt, keys);
    this._collide();
    for (const car of this.cars) this._advance(car, dt);
    const finishers = this.cars.filter(car => car.finished);
    if (finishers.length) {
      this.winner = finishers.sort((a, b) => a.finishTime - b.finishTime)[0];
      this.time = this.winner.finishTime;
      this.state = 'finished';
      this.cars.forEach(car => { car.boosting = false; });
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
    car.offroad = projectTrack(car.x, car.y).distance > TRACK.roadWidth / 2;
    car.boosting = boost && forward && !reverse && car.boost > 0.5
      && car.speed > 40 && !car.offroad;
    car.boost = clamp(car.boost + (car.boosting ? -32 : 12) * dt, 0, 100);
    const maximum = car.offroad ? 145 : car.boosting ? 470 : 330;
    if (forward && reverse) {
      car.speed = approach(car.speed, 0, 400 * dt);
    } else if (reverse) {
      car.speed = approach(car.speed, -115, (car.speed > 0 ? 375 : 150) * dt);
    } else if (forward) {
      car.speed = approach(car.speed, maximum, (car.speed < 0 ? 350 : car.offroad ? 145 : car.boosting ? 440 : 235) * dt);
    } else {
      car.speed = approach(car.speed, 0, (car.offroad ? 145 : 62) * dt);
    }
    if (car.speed > maximum) car.speed = approach(car.speed, maximum, (car.offroad ? 620 : 250) * dt);
    car.steer = approach(car.steer, Number(right) - Number(left), dt * 8);
    const grip = Math.min(Math.abs(car.speed) / 180, 1);
    const turn = car.steer * 2.18 * (0.23 + grip * 0.77)
      * Math.min(Math.abs(car.speed) / 30, 1) * Math.sign(car.speed);
    car.angle = mod(car.angle + turn * dt + Math.PI, TAU) - Math.PI;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.lastSkid = Math.abs(car.speed) > 230 && Math.abs(car.steer) > 0.5;
    car.impact = Math.max(0, car.impact - dt * 3);
    this._contain(car);
  }

  _contain(car) {
    const clampedX = clamp(car.x, 23, TRACK.width - 23);
    const clampedY = clamp(car.y, 23, TRACK.height - 23);
    if (clampedX !== car.x || clampedY !== car.y) {
      car.x = clampedX; car.y = clampedY;
      car.speed *= -0.18; car.impact = 1;
    }
  }

  _collide() {
    const [a, b] = this.cars;
    let dx = b.x - a.x, dy = b.y - a.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= 37) return;
    if (distance < 1e-8) { dx = 1; dy = 0; }
    else { dx /= distance; dy /= distance; }
    const shift = (37 - distance) * 0.5 + 0.001;
    a.x -= dx * shift; a.y -= dy * shift;
    b.x += dx * shift; b.y += dy * shift;
    const ah = Math.cos(a.angle) * dx + Math.sin(a.angle) * dy;
    const bh = Math.cos(b.angle) * dx + Math.sin(b.angle) * dy;
    const closing = b.speed * bh - a.speed * ah;
    if (closing < 0) {
      const impulse = -closing * 0.64;
      a.speed = clamp(a.speed - impulse * ah, -160, 470);
      b.speed = clamp(b.speed + impulse * bh, -160, 470);
    }
    a.impact = b.impact = 1;
    this._contain(a);
    this._contain(b);
  }

  _advance(car, dt) {
    const p = projectTrack(car.x, car.y);
    const onRoad = p.distance <= TRACK.roadWidth / 2;
    const delta = signedDistance(car._lastTrackS, p.s);
    const displacement = Math.hypot(car.x - car._lastX, car.y - car._lastY);
    const midpoint = projectTrack((car.x + car._lastX) / 2, (car.y + car._lastY) / 2);
    // Both ends and midpoint must remain on the road. Reject teleports as well
    // as infield jumps; reversing never earns a checkpoint.
    const valid = onRoad && car._lastOnRoad && midpoint.distance <= TRACK.roadWidth / 2
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
          }
        } else {
          car._nextCheckpoint += 1;
        }
      }
    }
    // Give the renderer a helpful recover prompt if an expected gate was
    // crossed off the road, or if a relocation skipped it.
    if (!valid && delta > 0) {
      const gate = mod(TRACK.startDistance + car._nextCheckpoint * LENGTH / CHECKPOINTS, LENGTH);
      if (mod(gate - car._lastTrackS, LENGTH) <= delta) car.missedCheckpoint = true;
    }
    car.lapTime = car.finished ? car.lastLap
      : car._started ? Math.max(0, this.time - car._lapStartTime) : 0;
    car.offroad = !onRoad;
    this._updateProgress(car, p.s);
    car._lastTrackS = p.s; car._lastX = car.x; car._lastY = car.y;
    car._lastOnRoad = onRoad;
  }

  _updateProgress(car, s) {
    if (!car._started) { car.progress = 0; return; }
    if (car.finished) { car.progress = 1; return; }
    const section = LENGTH / CHECKPOINTS;
    const sinceGate = clamp(signedDistance(car._lastCheckpointS, s), 0, section);
    car.progress = clamp((car._nextCheckpoint - 1) / CHECKPOINTS + sinceGate / LENGTH, 0, 1);
  }
}
