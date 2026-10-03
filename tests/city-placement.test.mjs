import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLandmark, LANDMARK_IDS } from '../city-landmarks.js';
import { placeLandmark, landmarkSolidObstacles } from '../city-placement.js';
import { buildCityGeometry } from '../city-geometry.js';
import { geographicToWorld, pointOnTrack } from '../tracks.js';
import { RaceEngine, TRACKS, setTrack, projectTrack } from '../engine.js';
import { ObstacleWorld } from '../collisions.js';
import { RaceAI } from '../ai.js';
import map from '../assets/london-map.json' with { type: 'json' };

const track = TRACKS.london;
afterEach(() => setTrack('coast'));

function placedLandmark(id) {
  setTrack('london');
  const landmark = map.landmarks.find(item => item.id === id);
  const model = createLandmark(id);
  placeLandmark(model, landmark, track, projectTrack);
  return { landmark, model, obstacles: landmarkSolidObstacles(model, id) };
}

function carAt(point) {
  return { ...point, speed: 200, height: track.carHeight };
}

test('Sondheim wall collision follows the set-back visible curved facade and leaves both road edges clear', () => {
  const { model, obstacles } = placedLandmark('sondheim-theatre');
  assert.ok(obstacles.length > 20, 'curved facade uses its actual segmented wall outline');
  const world = new ObstacleWorld(obstacles, { carRadius: track.carRadius });
  const centre = projectTrack(model.position.x, model.position.z).s;
  // One metre between samples, including the prior failing left-edge location.
  for (let s = centre - 360; s <= centre + 360; s += 6) {
    for (const lane of [-30, -20, 0, 30]) {
      assert.equal(world.resolveCar(carAt(pointOnTrack(track, s, lane))), 0,
        `visible wall intrudes into road: s=${s}, lane=${lane}`);
    }
  }
  const wall = obstacles[26];
  assert.ok(world.resolveCar(carAt({ x: wall.x, y: wall.y, angle: 0, elevation: 0 })) > 0,
    'the clear road was not obtained by removing the theatre wall collider');
});

test('Admiralty central arch aligns with its mapped passage while full-sized stone piers remain solid', () => {
  const { landmark, model, obstacles } = placedLandmark('admiralty-arch');
  const passage = model.userData.passages.find(item => Math.abs(item.x) < .01);
  assert.equal(passage.width, 7.6, 'do not widen the architectural opening to fill the boulevard');
  assert.equal(model.userData.placement.alignedToMappedPassage, true);
  const section = track.sections.find(item => item.passage);
  const centre = pointOnTrack(track, (section.start + section.end) / 2);
  const c = Math.cos(model.rotation.y), s = Math.sin(model.rotation.y), scale = model.scale.x;
  const entranceCentre = {
    x: model.position.x + scale * (c * passage.x + s * passage.z),
    y: model.position.z + scale * (-s * passage.x + c * passage.z),
  };
  assert.ok(Math.hypot(centre.x - entranceCentre.x, centre.y - entranceCentre.y) < 1e-6);
  const mappedOrigin = geographicToWorld(track.projection, ...landmark.coordinates);
  assert.ok(Math.hypot(model.position.x - mappedOrigin.x, model.position.z - mappedOrigin.y) < 60,
    'rigid alignment stays within ten metres of the mapped landmark');
  const world = new ObstacleWorld(obstacles, { carRadius: track.carRadius });
  for (let distance = section.start - 30; distance <= section.end + 30; distance += 6) {
    assert.equal(world.resolveCar(carAt(pointOnTrack(track, distance, 0))), 0,
      `central passage blocked at ${distance}`);
  }
  for (const index of [2, 3]) {
    const pier = obstacles[index];
    assert.ok(world.resolveCar(carAt({ x: pier.x, y: pier.y, angle: 0, elevation: 0 })) > 0,
      `pier ${index} is physically solid`);
  }
  for (const lane of [-30, 30]) {
    assert.ok(world.resolveCar(carAt(pointOnTrack(track, centre.s, lane))) > 0,
      'the narrow arch is intentionally not three unobstructed parallel racing lanes');
  }
});

let cityObstacles;
function fullArchitecturalObstacles() {
  if (cityObstacles) return cityObstacles;
  cityObstacles = [...buildCityGeometry(map, track).obstacles];
  for (const landmark of map.landmarks) {
    if (!LANDMARK_IDS.includes(landmark.id)) continue;
    const { obstacles } = placedLandmark(landmark.id);
    if (obstacles.length) {
      cityObstacles.push(...obstacles);
      continue;
    }
    // Same fallback as CityRenderer for architectural studies without solids.
    const footprint = landmark.footprint?.map(coordinate => geographicToWorld(track.projection, ...coordinate));
    for (let i = 0; footprint && i < footprint.length - 1; i++) {
      const a = footprint[i], b = footprint[i + 1], length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < .2) continue;
      cityObstacles.push({ id: `landmark-${landmark.id}-${i}`, type: 'box',
        x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, halfWidth: length / 2, halfDepth: 1.2,
        angle: Math.atan2(b.y - a.y, b.x - a.x), minHeight: 0, maxHeight: 500 });
    }
  }
  return cityObstacles;
}

for (const carIds of [[2], [1, 2]]) {
  test(`${carIds.length === 1 ? 'one' : 'both'} real-control AI racers finish through the solid London architecture without rescue`, () => {
    setTrack('london');
    const engine = new RaceEngine({ laps: 1, obstacles: fullArchitecturalObstacles() }).start();
    const drivers = carIds.map(carId => new RaceAI({ carId }));
    let staticContacts = 0, narrowPassageImpacts = 0, offroad = 0;
    const originalResolve = engine.obstacleWorld.resolveCar;
    engine.obstacleWorld.resolveCar = function (...args) {
      const contacts = originalResolve.apply(this, args);
      staticContacts += contacts;
      return contacts;
    };
    const section = track.sections.find(item => item.passage);
    for (let frame = 0; frame < 60 * 280 && !carIds.every(id => engine.cars[id - 1].finished); frame++) {
      const controls = new Set(drivers.flatMap(driver => [...driver.update(engine, 1 / 60)]));
      engine.step(1 / 60, controls);
      for (const id of carIds) {
        const car = engine.cars[id - 1], position = projectTrack(car.x, car.y, car._lastTrackS);
        offroad += car.offroad ? 1 : 0;
        if (position.s >= section.start - 30 && position.s <= section.end + 30) {
          narrowPassageImpacts += car.impact > 0 ? 1 : 0;
        }
      }
    }
    for (const id of carIds) {
      assert.equal(engine.cars[id - 1].finished, true, `car ${id} reaches the finish`);
      assert.equal(engine.cars[id - 1].lap, 1);
    }
    assert.equal(staticContacts, 0, 'no London building or landmark wall contacts');
    assert.equal(narrowPassageImpacts, 0, 'both drivers queue safely through the real narrow opening');
    assert.equal(offroad, 0);
    assert.ok(drivers.every(driver => driver.rescues === 0));
    assert.equal(engine.state, carIds.length === 2 ? 'finished' : 'racing');
  });
}
