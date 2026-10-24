const STRIDE = 11;
const QUANTIZE = 1000;
const MIN_LENGTH_SQUARED = 8 * 8;
const MAX_EDGES = 9000; // At most 792,000 bytes, leaving room for six ghost cars.
const COPLANAR_DOT = 0.985;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * Extract a static GL_LINES batch from the existing, non-indexed props mesh.
 * Only props mode 3 and ordinary-building mode 6 participate. Landmarks and
 * their triangles never enter the adjacency map. Source geometry is read-only.
 *
 * Shared endpoints are matched at 0.001 world units. Geometric face normals,
 * rather than supplied lighting normals, remove flat triangle diagonals even
 * when an old model has a reversed winding or a decorative normal override.
 * Keep structural lines of at least 8 units, then the longest 9,000 per scene.
 * This removes dense window grids and keeps all twelve production scenes under
 * the existing 40,000,000-byte geometry budget without changing their meshes.
 * Equal lengths use endpoint coordinates for deterministic selection, not noise.
 * The result uses the existing 11-float vertex layout, opaque alpha and mode-0
 * emission 1. Draw once as LINES, after the opaque props, using depth testing.
 */
export function hologramEdges(data) {
  if (!data || typeof data.length !== 'number' || data.length % (STRIDE * 3)) {
    throw new TypeError('hologramEdges expects complete triangles in the 11-float vertex layout.');
  }
  const points = new Map();
  const edges = new Map();
  let nextPoint = 0;
  function pointId(offset) {
    const key = `${Math.round(data[offset] * QUANTIZE)},${Math.round(data[offset + 1] * QUANTIZE)},${Math.round(data[offset + 2] * QUANTIZE)}`;
    let id = points.get(key);
    if (id === undefined) { id = nextPoint++; points.set(key, id); }
    return id;
  }
  function edge(a, b, ia, ib, nx, ny, nz, building) {
    const dx = data[a] - data[b], dy = data[a + 1] - data[b + 1], dz = data[a + 2] - data[b + 2];
    const lengthSquared = dx * dx + dy * dy + dz * dz;
    if (ia === ib || lengthSquared < MIN_LENGTH_SQUARED) return;
    const key = ia < ib ? `${ia}:${ib}` : `${ib}:${ia}`;
    const r = (data[a + 6] + data[b + 6]) * 0.5;
    const blue = (data[a + 8] + data[b + 8]) * 0.5;
    const existing = edges.get(key);
    if (existing) {
      existing.count++;
      existing.red += r;
      existing.blue += blue;
      existing.buildings += building;
      if (Math.abs(existing.nx * nx + existing.ny * ny + existing.nz * nz) <= COPLANAR_DOT) existing.hard = true;
    } else {
      const aFirst = data[a] < data[b] || (data[a] === data[b] &&
        (data[a + 1] < data[b + 1] || (data[a + 1] === data[b + 1] && data[a + 2] <= data[b + 2])));
      edges.set(key, { a: aFirst ? a : b, b: aFirst ? b : a, nx, ny, nz, lengthSquared, count: 1, hard: false, red: r, blue, buildings: building });
    }
  }
  for (let a = 0; a < data.length; a += STRIDE * 3) {
    const b = a + STRIDE, c = b + STRIDE;
    // All three vertices must belong to ordinary scenery. Material values are
    // exact small integers plus [0,1] emission in both JS and Float32 uploads.
    const mode = Math.floor(data[a + 10] / 4);
    if ((mode !== 3 && mode !== 6) || Math.floor(data[b + 10] / 4) !== mode || Math.floor(data[c + 10] / 4) !== mode) continue;
    const ux = data[b] - data[a], uy = data[b + 1] - data[a + 1], uz = data[b + 2] - data[a + 2];
    const vx = data[c] - data[a], vy = data[c + 1] - data[a + 1], vz = data[c + 2] - data[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (!(length > 1e-8) || !Number.isFinite(length)) continue;
    nx /= length; ny /= length; nz /= length;
    const ia = pointId(a), ib = pointId(b), ic = pointId(c);
    const building = mode === 6 ? 1 : 0;
    edge(a, b, ia, ib, nx, ny, nz, building);
    edge(b, c, ib, ic, nx, ny, nz, building);
    edge(c, a, ic, ia, nx, ny, nz, building);
  }
  const selected = [];
  for (const item of edges.values()) if (item.count === 1 || item.hard) selected.push(item);
  selected.sort((a, b) => {
    if (a.lengthSquared !== b.lengthSquared) return b.lengthSquared - a.lengthSquared;
    for (let axis = 0; axis < 3; axis++) {
      const difference = data[a.a + axis] - data[b.a + axis];
      if (difference) return difference;
    }
    for (let axis = 0; axis < 3; axis++) {
      const difference = data[a.b + axis] - data[b.b + axis];
      if (difference) return difference;
    }
    return 0;
  });
  if (selected.length > MAX_EDGES) selected.length = MAX_EDGES;
  const output = new Float32Array(selected.length * STRIDE * 2);
  let offset = 0;
  for (const item of selected) {
    const height = (data[item.a + 1] + data[item.b + 1]) * 0.5;
    const warmth = (item.red - item.blue) / item.count;
    const purple = clamp(0.38 + warmth * 0.65 + clamp(height / 220, 0, 1) * 0.22, 0.12, 0.85);
    const brightness = 1 + 0.28 * item.buildings / item.count;
    const red = (0.18 + (0.40 - 0.18) * purple) * brightness;
    const green = (0.48 + (0.25 - 0.48) * purple) * brightness;
    const blue = (0.62 + (0.65 - 0.62) * purple) * brightness;
    for (const source of [item.a, item.b]) {
      output[offset++] = data[source];
      output[offset++] = data[source + 1];
      output[offset++] = data[source + 2];
      output[offset++] = 0;
      output[offset++] = 1;
      output[offset++] = 0;
      output[offset++] = red;
      output[offset++] = green;
      output[offset++] = blue;
      output[offset++] = 1;
      output[offset++] = 1;
    }
  }
  return { data: output };
}
