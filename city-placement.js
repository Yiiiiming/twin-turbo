/** Architectural placement is separate from the untouched OSM source data.
 * Bearings below describe the model's front, not the nearest road direction.
 * Road setback is a disclosed closed-course adaptation, shared by visible models
 * and their collision shapes. All model dimensions are in metres. */
import { geographicToWorld, pointOnTrack } from './tracks.js';

export const LANDMARK_FRONT_BEARINGS = Object.freeze({
  parliament: 104,
  'westminster-abbey': 260,
  'london-eye': 90,
});

export function placeLandmark(model, landmark, track, projectTrack) {
  const units = track.projection.unitsPerMeter || 6;
  const origin = geographicToWorld(track.projection, ...landmark.coordinates);
  if (landmark.id === 'admiralty-arch') {
    const section = track.sections.find(section => section.passage);
    const passage = model.userData.passages?.find(passage => Math.abs(passage.x) < .01);
    if (section && passage) {
      const point = pointOnTrack(track, (section.start + section.end) / 2);
      const rotation = -point.angle - Math.PI / 2;
      const cos = Math.cos(rotation), sin = Math.sin(rotation);
      model.scale.setScalar(units); model.rotation.y = rotation;
      model.position.set(point.x - units * (cos * passage.x + sin * passage.z), 0,
        point.y - units * (-sin * passage.x + cos * passage.z));
      model.updateMatrixWorld(true);
      model.userData.placement = { bearing: (180 - rotation * 180 / Math.PI) % 360, alignedToMappedPassage: true };
      return model.userData.placement;
    }
  }
  const bearing = LANDMARK_FRONT_BEARINGS[landmark.id] ?? landmark.bearing ?? 0;
  const rotation = (180 - bearing) * Math.PI / 180;
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const forward = { x: sin, y: cos };
  let setback = 0;
  const bounds = model.userData.bodyBounds;
  if (landmark.id.endsWith('theatre') && bounds && landmark.footprint?.length) {
    const local = landmark.footprint.map(coordinate => {
      const p = geographicToWorld(track.projection, ...coordinate);
      const x = (p.x - origin.x) / units, z = (p.y - origin.y) / units;
      return { x: x * cos - z * sin, z: x * sin + z * cos };
    });
    // Put the actual facade at the mapped frontage, not in the middle of the
    // much deeper theatre auditorium footprint. Do not stretch window details.
    setback = Math.max(...local.map(p => p.z)) - bounds.maxZ;
    const clearance = track.roadWidth / 2 + track.carRadius + 3;
    const outline = model.userData.footprint || [
      { x: bounds.minX, z: bounds.minZ }, { x: bounds.maxX, z: bounds.minZ },
      { x: bounds.maxX, z: bounds.maxZ }, { x: bounds.minX, z: bounds.maxZ },
    ];
    const intersectsRoad = shift => outline.some((a, i) => {
      const b = outline[(i + 1) % outline.length];
      const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
      for (let j = 0; j <= steps; j++) {
        const t = j / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t + shift;
        const wx = origin.x + (cos * x + sin * z) * units;
        const wy = origin.y + (-sin * x + cos * z) * units;
        const projection = projectTrack(wx, wy);
        if (!projection.tunnel && projection.distance < clearance) return true;
      }
      return false;
    });
    let attempts = 0;
    while (intersectsRoad(setback) && attempts++ < 100) setback -= .3;
  }
  model.scale.setScalar(units);
  model.rotation.y = rotation;
  model.position.set(origin.x + forward.x * setback * units, 0, origin.y + forward.y * setback * units);
  model.updateMatrixWorld(true);
  model.userData.placement = { bearing, frontageOffsetMeters: setback };
  return model.userData.placement;
}

export function landmarkSolidObstacles(model, id) {
  const scale = model.scale.x, rotation = model.rotation.y;
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  let solids = model.userData.groundSolids;
  if (!solids?.length && model.userData.bodyBounds) {
    const b = model.userData.bodyBounds;
    solids = [{ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2,
      width: b.maxX - b.minX, depth: b.maxZ - b.minZ,
      minHeight: b.minY || 0, height: b.maxY }];
  }
  return solids?.map((solid, index) => ({
    id: `landmark-${id}-solid-${index}`, type: solid.type === 'circle' ? 'circle' : 'box',
    x: model.position.x + scale * (cos * solid.x + sin * solid.z),
    y: model.position.z + scale * (-sin * solid.x + cos * solid.z),
    ...(solid.type === 'circle' ? {radius:solid.radius*scale} : {halfWidth:solid.width*scale/2,halfDepth:solid.depth*scale/2}),
    angle: -rotation - (solid.rotation || 0),
    minHeight: (solid.minHeight || 0) * scale,
    maxHeight: solid.height * scale,
  })) || [];
}
