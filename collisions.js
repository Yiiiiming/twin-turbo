/** Static ground obstacles in physics x/y coordinates (rendering world x/z). */
const EPSILON = 1e-9;
const SEPARATION = .002;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function obstacleShape(source) {
  if (!source || !Number.isFinite(source.x) || !Number.isFinite(source.y)) {
    throw new TypeError('Obstacle positions must be finite.');
  }
  if ((source.minHeight !== undefined && !Number.isFinite(source.minHeight))
    || (source.maxHeight !== undefined && !Number.isFinite(source.maxHeight))
    || (source.minHeight !== undefined && source.maxHeight !== undefined && source.minHeight >= source.maxHeight)) {
    throw new TypeError('Obstacle height intervals must be finite and have positive clearance.');
  }
  if (source.type === 'circle') {
    if (!(source.radius > 0) || !Number.isFinite(source.radius)) {
      throw new TypeError('Circle obstacles need a positive finite radius.');
    }
    return { ...source, minX: source.x - source.radius, maxX: source.x + source.radius,
      minY: source.y - source.radius, maxY: source.y + source.radius };
  }
  if (source.type !== 'box' || !(source.halfWidth > 0) || !(source.halfDepth > 0)
    || !Number.isFinite(source.halfWidth + source.halfDepth + (source.angle ?? 0))) {
    throw new TypeError('Box obstacles need positive finite half extents and a finite angle.');
  }
  const cosine = Math.cos(source.angle || 0), sine = Math.sin(source.angle || 0);
  const extentX = Math.abs(cosine) * source.halfWidth + Math.abs(sine) * source.halfDepth;
  const extentY = Math.abs(sine) * source.halfWidth + Math.abs(cosine) * source.halfDepth;
  return { ...source, cosine, sine,
    minX: source.x - extentX, maxX: source.x + extentX,
    minY: source.y - extentY, maxY: source.y + extentY };
}

function contact(car, obstacle, radius) {
  const dx = car.x - obstacle.x, dy = car.y - obstacle.y;
  if (obstacle.type === 'circle') {
    const sum = radius + obstacle.radius, squared = dx * dx + dy * dy;
    if (squared >= sum * sum) return null;
    if (squared < EPSILON) {
      const direction = car.speed < 0 ? 1 : -1;
      return { nx: Math.cos(car.angle) * direction, ny: Math.sin(car.angle) * direction, depth: sum };
    }
    const distance = Math.sqrt(squared);
    return { nx: dx / distance, ny: dy / distance, depth: sum - distance };
  }

  // Work in the box's local axes; the closest-point test keeps rounded car
  // corners accurate instead of treating the expanded AABB as a solid box.
  const { cosine: c, sine: s, halfWidth: hw, halfDepth: hd } = obstacle;
  const localX = dx * c + dy * s, localY = -dx * s + dy * c;
  const closestX = clamp(localX, -hw, hw), closestY = clamp(localY, -hd, hd);
  const differenceX = localX - closestX, differenceY = localY - closestY;
  const squared = differenceX * differenceX + differenceY * differenceY;
  if (squared >= radius * radius) return null;
  let nx, ny, depth;
  if (squared > EPSILON) {
    const distance = Math.sqrt(squared);
    nx = differenceX / distance; ny = differenceY / distance; depth = radius - distance;
  } else {
    // A center inside/on a box must exit its nearest face, including exact
    // center coincidence where the opposite velocity gives a stable side.
    const toX = hw - Math.abs(localX), toY = hd - Math.abs(localY);
    const forwardX = Math.cos(car.angle) * c + Math.sin(car.angle) * s;
    const forwardY = -Math.cos(car.angle) * s + Math.sin(car.angle) * c;
    if (toX < toY) {
      nx = Math.sign(localX) || Math.sign(-forwardX * (car.speed || 1)) || 1;
      ny = 0; depth = radius + toX;
    } else {
      nx = 0;
      ny = Math.sign(localY) || Math.sign(-forwardY * (car.speed || 1)) || 1;
      depth = radius + toY;
    }
  }
  return { nx: nx * c - ny * s, ny: nx * s + ny * c, depth };
}

/**
 * Immutable obstacle geometry with a spatial hash for large scenery sets.
 * circle: { type:'circle', x,y,radius }
 * box: { type:'box', x,y,halfWidth,halfDepth,angle } (angle in radians)
 */
export class ObstacleWorld {
  constructor(obstacles = [], { carRadius = 21, cellSize = 240 } = {}) {
    if (!(carRadius > 0) || !Number.isFinite(carRadius) || !(cellSize > 0) || !Number.isFinite(cellSize)) {
      throw new TypeError('Collision dimensions must be positive and finite.');
    }
    this.carRadius = carRadius;
    this.cellSize = cellSize;
    this.obstacles = obstacles.map(obstacleShape);
    this.cells = new Map();
    // Useful for profiling without depending on wall-clock test timing.
    this.lastCandidateChecks = 0;
    for (let index = 0; index < this.obstacles.length; index++) {
      const obstacle = this.obstacles[index];
      for (let x = Math.floor(obstacle.minX / cellSize); x <= Math.floor(obstacle.maxX / cellSize); x++) {
        for (let y = Math.floor(obstacle.minY / cellSize); y <= Math.floor(obstacle.maxY / cellSize); y++) {
          const key = `${x},${y}`;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(index);
        }
      }
    }
  }

  _candidates(x, y) {
    const radius = this.carRadius, size = this.cellSize, found = new Set();
    for (let gx = Math.floor((x - radius) / size); gx <= Math.floor((x + radius) / size); gx++) {
      for (let gy = Math.floor((y - radius) / size); gy <= Math.floor((y + radius) / size); gy++) {
        for (const index of this.cells.get(`${gx},${gy}`) || []) found.add(index);
      }
    }
    return found;
  }

  _separate(car, touched) {
    // Re-query after displacement because resolving a building can place the
    // car beside a second object in a different spatial-hash cell.
    for (let iteration = 0; iteration < 8; iteration++) {
      let corrected = false;
      for (const index of this._candidates(car.x, car.y)) {
        const obstacle = this.obstacles[index];
        const floor = car.elevation ?? 0, roof = floor + (car.height ?? 25);
        if (roof <= (obstacle.minHeight ?? -Infinity) || floor >= (obstacle.maxHeight ?? Infinity)) continue;
        this.lastCandidateChecks++;
        const hit = contact(car, obstacle, this.carRadius);
        if (!hit) continue;
        corrected = true; touched.add(index);
        car.x += hit.nx * (hit.depth + SEPARATION);
        car.y += hit.ny * (hit.depth + SEPARATION);
        const normalHeading = Math.cos(car.angle) * hit.nx + Math.sin(car.angle) * hit.ny;
        const incoming = car.speed * normalHeading;
        // Apply an impulse only while moving into the surface. Reversing or
        // steering away never suffers a second braking impulse or wall lock.
        if (incoming < -.01) {
          car.speed -= 1.08 * incoming * normalHeading;
          car.impact = Math.max(car.impact || 0, clamp(-incoming / 160, .12, 1));
        }
      }
      if (!corrected) break;
    }
  }

  /**
   * Resolve in place and return the number of distinct objects touched.
   * Passing the previous {x,y} also sweeps the displacement in short steps,
   * preventing thin poles/rails from being skipped by an unusually long move.
   * Normal simulation ticks move at most 517/120 = 4.31 pixels.
   */
  resolveCar(car, previousPosition = null) {
    this.lastCandidateChecks = 0;
    if (!this.obstacles.length || !Number.isFinite(car.x + car.y + car.angle + car.speed)) return 0;
    const touched = new Set();
    if (previousPosition && Number.isFinite(previousPosition.x + previousPosition.y)) {
      const dx = car.x - previousPosition.x, dy = car.y - previousPosition.y;
      const elevation = car.elevation ?? 0;
      const previousElevation = previousPosition.elevation ?? elevation;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (this.carRadius / 2)));
      car.x = previousPosition.x; car.y = previousPosition.y;
      for (let step = 0; step < steps; step++) {
        car.x += dx / steps; car.y += dy / steps;
        if (car.elevation !== undefined) car.elevation = previousElevation + (elevation - previousElevation) * (step + 1) / steps;
        this._separate(car, touched);
      }
    } else this._separate(car, touched);
    return touched.size;
  }
}
