/** Compact, architecture-inspired London landmarks made from native geometry.
 * Local -Z faces the street. No track, physics, image or network dependencies.
 * References: stpauls.co.uk/explore-our-map and /6-western-towers-c-1685-1710;
 * shakespearesglobe.com/discover/about-us/globe-theatre/.
 */
import { frame, details, beam, word, frontDisk, arch, cornice, pediment } from './london-west-end.js';

const TAU = Math.PI * 2;
export const RIVERSIDE_LANDMARKS = Object.freeze([
  Object.freeze({ kind: 'st-pauls-cathedral', label: "St Paul's Cathedral", radius: 160, width: 244, depth: 244, height: 334 }),
  Object.freeze({ kind: 'shakespeares-globe', label: "Shakespeare's Globe", radius: 125, width: 244, depth: 244, height: 123 }),
]);

// Fine attached joinery is a surface detail, so avoid hidden box faces. Crossed
// strips retain slim roof seams from either side without twelve-triangle beams.
function face(f, x, y, z, w, h, color) {
  f.quad([x-w/2,y-h/2,z],[x-w/2,y+h/2,z],[x+w/2,y+h/2,z],[x+w/2,y-h/2,z],color);
}
function slimBeam(mesh, a, b, width, color) {
  const d=b.map((n,i)=>n-a[i]), length=Math.hypot(...d), u=d.map(n=>n/length);
  const ref=Math.abs(u[1])>.9?[1,0,0]:[0,1,0], cross=(p,q)=>[p[1]*q[2]-p[2]*q[1],p[2]*q[0]-p[0]*q[2],p[0]*q[1]-p[1]*q[0]];
  const raw=cross(u,ref), size=Math.hypot(...raw), v=raw.map(n=>n/size), w=cross(u,v);
  for(const normal of [v,w])mesh.quad(a.map((n,i)=>n-normal[i]*width/2),b.map((n,i)=>n-normal[i]*width/2),b.map((n,i)=>n+normal[i]*width/2),a.map((n,i)=>n+normal[i]*width/2),color);
}
function surfaceWindow(f,x,y,z,w,h,trim,glass) {
  face(f,x,y,z,w+3,h+3,trim);face(f,x,y,z-.25,w,h,glass);
  face(f,x,y,z-.5,.9,h,trim);face(f,x,y+1,z-.5,w,.8,trim);
  f.box(x,y-h/2-2,z,w+6,2.2,4,trim);
}
function porticoColumn(f,x,bottom,z,height,r,stone,shade) {
  f.box(x,bottom+2,z,r*2.8,4,r*2.8,stone);f.cone(x,bottom+4,z,r*1.25,3,stone,12,r*1.25);
  f.cone(x,bottom+7,z,r,height-15,stone,20,r*.84);
  for(const offset of [-.54,0,.54])face(f,x+offset*r,bottom+height*.47,z-r*.94,.42,height-20,shade);
  f.cone(x,bottom+height-9,z,r*.85,5,stone,12,r*1.35);f.box(x,bottom+height-2,z,r*2.9,5,r*2.9,stone);
  for(const sign of [-1,1])frontDisk(f,x+sign*r*.85,bottom+height-5,z-r*1.1,r*.42,shade,0,16);
}

function dome(f, cx, cz, profile, color, sides = 64) {
  for (let j = 1; j < profile.length; j++) {
    const [low, lowerRadius] = profile[j - 1], [high, upperRadius] = profile[j];
    for (let i = 0; i < sides; i++) {
      const a = i / sides * TAU, b = (i + 1) / sides * TAU;
      f.quad([cx + Math.cos(a) * lowerRadius, low, cz + Math.sin(a) * lowerRadius],
        [cx + Math.cos(a) * upperRadius, high, cz + Math.sin(a) * upperRadius],
        [cx + Math.cos(b) * upperRadius, high, cz + Math.sin(b) * upperRadius],
        [cx + Math.cos(b) * lowerRadius, low, cz + Math.sin(b) * lowerRadius], color);
    }
  }
}

function stPauls(mesh, item) {
  const f = frame(mesh, item), stone = '#d7d4c6', trim = '#ede7d6', shade = '#b9b49f', glass = '#435252', lead = '#7a8a87', gold = '#d1b463';
  // A cruciform body, two west towers and a deep colonnaded west front.
  f.box(0, 4, 15, 228, 8, 180, '#a9a99b');
  f.box(0, 57, 20, 118, 104, 158, stone);
  f.box(0, 52, 20, 220, 94, 56, stone);
  f.box(0, 67, -61, 209, 118, 49, stone);
  for (const x of [-83, 83]) f.box(x, 98, -60, 39, 180, 47, stone);
  for (const x of [-56, -34, -12, 12, 34, 56]) f.cone(x, 12, -92, 4.1, 66, trim, 24, 3.4);

  details(mesh, () => {
    for (let i = 0; i < 5; i++) f.box(0, 1 + i * 1.8, -103 + i * 3, 172 - i * 3, 2, 31 - i * 3, i % 2 ? trim : stone);
    cornice(f, 0, 109, 20, 123, 162, trim);
    cornice(f, 0, 102, 20, 222, 59, trim);
    f.box(0, 120, 23, 105, 13, 146, '#66736f');
    // Aedicules and buttressed side bays continue around both long elevations.
    for (const side of [-1, 1]) {
      const sideFrame = frame(mesh, { ...item, x: f.p(side * 60, 0, 0)[0], z: f.p(side * 60, 0, 0)[2], angle: (item.angle || 0) + side * Math.PI / 2 });
      for (const z of [-33, -3, 27, 57, 87]) {
        arch(sideFrame, side * z, 30, -1.2, 16, 35, trim, glass);
        surfaceWindow(sideFrame, side * z, 87, -1.6, 12, 15, trim, glass);
        pediment(sideFrame, side * z, 99, -3, 20, 7, 3, trim, shade);
      }
      for (const z of [-47, -18, 12, 42, 72, 98]) f.box(side * 63, 59, z, 5, 92, 5, shade);
      for (const x of [side * 89, side * 108]) f.box(x, 53, -10, 4.5, 89, 5, trim);
      f.box(side * 101, 61, -11, 13, 38, 1.5, glass);
    }
    for (const x of [-42, 0, 42]) arch(f, x, 12, -86, 21, 43, trim, glass);
    for (const x of [-56, -34, -12, 12, 34, 56]) porticoColumn(f, x, 12, -92, 65, 4, trim, shade);
    cornice(f, 0, 81, -89, 140, 28, trim);
    for (const x of [-51, -31, -11, 11, 31, 51]) porticoColumn(f, x, 89, -92, 36, 3, trim, shade);
    f.box(0, 91, -85, 124, 9, 9, stone);
    for (const x of [-39, 0, 39]) surfaceWindow(f, x, 106, -86.6, 20, 23, trim, glass);
    cornice(f, 0, 128, -87, 142, 32, trim);
    pediment(f, 0, 134, -106, 151, 27, 32, trim, shade);
    // The relief is restrained sculpture, not an oversized advertisement.
    frontDisk(f, 0, 145, -106.5, 6.5, trim);
    for (const x of [-25, -12, 12, 25]) {
      f.cone(x, 139, -107, 2.1, 9 - Math.abs(x) * .09, trim, 12, 1.4);
      frontDisk(f, x, 148 - Math.abs(x) * .12, -107.2, 1.8, trim);
    }
    word(f, 'ST PAULS', 0, 83, -106, 4.9, 67, '#756e56', .08);

    for (const x of [-83, 83]) {
      cornice(f, x, 135, -60, 42, 50, trim);
      arch(f, x, 149, -84.1, 16, 27, trim, '#3b4846');
      for (let y = 154; y < 171; y += 4) f.box(x, y, -85.1, 12, 1.5, 1.5, shade);
      cornice(f, x, 181, -60, 45, 52, trim);
      for (const dx of [-12, 12]) for (const dz of [-13, 13]) f.cone(x + dx, 187, -60 + dz, 3.1, 27, trim, 12, 2.6);
      f.cone(x, 188, -60, 10, 27, shade, 24, 10);
      f.cone(x, 213, -60, 21, 5, trim, 32, 21);
      dome(f, x, -60, [[218, 20], [224, 19], [230, 14], [235, 13], [240, 8], [245, 3]], lead, 40);
      f.cone(x, 245, -60, 3.8, 7, gold, 24, 2.6);
      f.cone(x, 252, -60, 2.6, 5, gold, 24, .3);
      // A clock on each tower gives the small silhouette a finished street face.
      frontDisk(f, x, 120, -85.2, 10, trim);
      frontDisk(f, x, 120, -85.5, 8.1, '#334846');
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU; face(f, x + Math.sin(a) * 6.7, 120 + Math.cos(a) * 6.7, -86.3, .65, 1.3, gold);
      }
      beam(mesh, f.p(x, 120, -86.5), f.p(x - 3.3, 124.5, -86.5), .7, gold);
      beam(mesh, f.p(x, 120, -86.5), f.p(x + 5, 120.7, -86.5), .7, gold);
    }

    // The great dome rises behind the west front: peristyle, stone gallery,
    // fine lead ribs, upper gallery, open lantern and gilded ball and cross.
    const cz = 25;
    f.cone(0, 120, cz, 53, 20, stone, 64, 53);
    f.cone(0, 140, cz, 58, 6, trim, 64, 58);
    f.cone(0, 146, cz, 46.5, 43, shade, 64, 46.5);
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU, x = Math.cos(a) * 52, z = cz + Math.sin(a) * 52;
      f.cone(x, 147, z, 3.8, 3, trim, 12, 3.8); f.cone(x, 150, z, 2.8, 33, trim, 12, 2.4); f.cone(x, 183, z, 3.8, 4, trim, 12, 3.8);
    }
    f.cone(0, 187, cz, 58, 5, trim, 64, 58);
    f.cone(0, 192, cz, 53, 8, stone, 64, 53);
    const profile = [[200, 52.5]];
    for (let i = 1; i <= 16; i++) { const a = i / 16 * Math.PI * .462; profile.push([200 + Math.sin(a) * 73, 52.5 * Math.cos(a)]); }
    dome(f, 0, cz, profile, lead);
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU;
      for (let j = 1; j < profile.length; j++) {
        const [y0, r0] = profile[j - 1], [y1, r1] = profile[j];
        slimBeam(mesh, f.p(Math.cos(a) * (r0 + .35), y0, cz + Math.sin(a) * (r0 + .35)), f.p(Math.cos(a) * (r1 + .35), y1, cz + Math.sin(a) * (r1 + .35)), .65, '#a5afaa');
      }
    }
    f.cone(0, 272, cz, 13.5, 4, trim, 48, 13.5);
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; f.cone(Math.cos(a) * 12, 276, cz + Math.sin(a) * 12, .8, 7, trim, 8, .8); }
    f.cone(0, 282, cz, 13.3, 2, trim, 48, 13.3);
    f.cone(0, 276, cz, 7.5, 18, shade, 32, 7.5);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; f.cone(Math.cos(a) * 10, 283, cz + Math.sin(a) * 10, 1.5, 17, trim, 12, 1.5); }
    f.cone(0, 300, cz, 12, 4, trim, 32, 12);
    dome(f, 0, cz, [[304, 11], [308, 10], [312, 6], [315, 2]], lead, 32);
    f.cone(0, 315, cz, 3.5, 5, gold, 24, 1.8); f.box(0, 326, cz, 1.7, 15, 1.7, gold); f.box(0, 329, cz, 9, 1.7, 1.7, gold);
  });
}

function globe(mesh, item) {
  const f = frame(mesh, item), plaster = '#e6dfc9', oak = '#624731', oakLight = '#8d6b46', shadow = '#403a2c', thatch = '#b4a068';
  const n = 20, step = TAU / n, point = (a, r, y) => [Math.sin(a) * r, y, -Math.cos(a) * r];
  const bayFrame = (a, r = 103) => { const p = f.p(...point(a, r, 0)); return frame(mesh, { ...item, x: p[0], z: p[2], angle: (item.angle || 0) + a }); };
  // Twenty solid wall bays surround an actually open courtyard. The courtyard
  // is not a solid cylinder: gallery, wall and stage hulls stay at their surfaces.
  for (let i = 0; i < n; i++) {
    const a = i * step, g = bayFrame(a);
    g.box(0, 35, 0, 33, 68, 8, plaster);
  }
  f.box(0, 8, 48, 66, 16, 41, oak);
  f.box(0, 48, 71, 68, 80, 9, plaster);
  for (const x of [-27, 27]) f.cone(x, 16, 32, 3.2, 61, '#a87a56', 24, 2.9);
  details(mesh, () => {
    mesh.disk(...f.p(0, .35, 0), 110, 110, '#adac94', 80, item.angle || 0);
    mesh.disk(...f.p(0, .55, 0), 75, 75, '#bfa982', 60, item.angle || 0);
    for (let i = 0; i < n; i++) {
      const a = (i - .5) * step, b = (i + .5) * step, center = i * step, g = bayFrame(center), bayWidth = 31.8;
      for (const y of [5, 27, 49, 70]) {
        face(g,0,y,-6,bayWidth+1.5,2.7,oak);
        f.quad(point(a, 78, y), point(a, 106, y), point(b, 106, y), point(b, 78, y), oakLight);
      }
      for (const x of [-15.6, 0, 15.6]) face(g,x,36,-6.4,2.5,67,oak);
      for (const y of [16, 38, 60]) {
        // Small continuous diagonal braces and shaded leaded windows.
        for (const sign of [-1, 1]) slimBeam(mesh, g.p(sign * 1.5, y - 9, -6.6), g.p(sign * 14, y + 9, -6.6), 1.7, oak);
        if (i % 3 !== 0 || y === 38) {
          face(g,0,y,-7,8.5,12,shadow);face(g,0,y,-7.5,.9,12,oakLight);face(g,0,y,-7.5,8.5,.9,oakLight);
        }
      }
      const inner = bayFrame(center, 78);
      for (const x of [-11.3, 11.3]) inner.box(x, 37, 0, 2.7, 67, 2.7, oak);
      for (const y of [13, 35, 57]) {
        slimBeam(mesh,inner.p(-13,y,-.1),inner.p(13,y,-.1),2,oakLight);
        for (const x of [-10, -5, 0, 5, 10]) slimBeam(mesh,inner.p(x,y-8,-.1),inner.p(x,y,-.1),1.2,oakLight);
        slimBeam(mesh,inner.p(-13,y-8,-.1),inner.p(13,y-8,-.1),1.8,oak);
      }
      for (const y of [9, 31, 53]) {
        const seat = bayFrame(center, 94);seat.box(0, y, 0, 28, 2, 8, oakLight);
      }
      // Pitched water-reed thatch forms a hollow annulus, not a capped cone.
      f.quad(point(a, 115, 72), point(a, 97, 94), point(b, 97, 94), point(b, 115, 72), i % 2 ? '#b9a46c' : thatch);
      f.quad(point(a, 97, 94), point(a, 74, 78), point(b, 74, 78), point(b, 97, 94), '#a48e59');
      f.quad(point(a, 115, 69.5), point(a, 115, 72), point(b, 115, 72), point(b, 115, 69.5), '#897646');
      f.quad(point(a, 74, 76), point(a, 74, 78), point(b, 74, 78), point(b, 74, 76), '#887046');
      for (let j = 0; j < 5; j++) {
        const angle = a + (j + .5) / 5 * step;
        slimBeam(mesh, f.p(...point(angle, 115, 72.2)), f.p(...point(angle, 97, 94.3)), .55, '#c5b67f');
        slimBeam(mesh, f.p(...point(angle, 97, 94.3)), f.p(...point(angle, 74, 78.2)), .5, '#bbab76');
      }
    }
    // The exposed thrust stage, classical painted columns and "Heavens" roof.
    for (let x = -30; x < 33; x += 5) f.box(x, 16.2, 46, .35, .4, 37, '#644831');
    for (const x of [-24, 0, 24]) arch(f, x, 18, 65.8, 15, 30, oak, '#725139');
    for (const x of [-27, 27]) {
      f.cone(x, 16, 32, 4.5, 3, goldColor(), 24, 4.5);f.cone(x, 72, 32, 4.6, 5, goldColor(), 24, 4.6);
      for (let j = 0; j < 7; j++) { const y = 21 + j * 7;f.cone(x, y, 32, 3.3, 1, '#d1b27c', 24, 3.3); }
    }
    f.box(0, 78, 48, 74, 5, 47, oak);f.box(0, 75, 48, 66, 1.2, 39, '#315d68');
    for (const x of [-22, -11, 0, 11, 22]) for (const z of [36, 47, 58]) mesh.disk(...f.p(x, 74.3, z), 1.1, 1.1, '#d8be75', 8);
    f.box(0, 88, 65, 62, 19, 19, plaster);for (const x of [-29, 0, 29]) f.box(x, 88, 54.9, 2, 20, 1.4, oak);
    pediment(f, 0, 100, 52, 77, 17, 36, oakLight, shadow);
    for (const x of [-22, 0, 22]) f.box(x, 91, 53.5, 12, 9, 1.2, shadow);
    f.box(0, 108, 69, 1.5, 29, 1.5, oak);f.quad([.8, 121, 69], [14, 118, 69], [14, 110, 69], [.8, 113, 69], '#b13e36');
    // A restrained entrance plaque and two hanging theatre banners.
    const entrance = bayFrame(0);
    arch(entrance, 0, 2.25, -7, 13.5, 23, oak, '#322f26');
    entrance.box(0, 32, -8, 30, 11, 2, oak);
    word(entrance, 'GLOBE', 0, 30, -9.2, 5, 25, '#ebd7a6', .08);
    for (const side of [-1, 1]) {
      const g = bayFrame(side * step);
      g.box(0, 48, -8.5, 11, 28, 1.3, side < 0 ? '#6a2f2b' : '#3c6261');
      word(g, side < 0 ? 'LIVE' : 'PLAY', 0, 45, -9.3, 3.7, 9, '#efd8ae', .12);
      g.box(0, 61.7, -8.7, 13, 1.5, 2, oak);
    }
  });
}

const goldColor = () => '#c5a36e';
export function addRiversideLandmark(mesh, item) {
  if (item.kind === 'st-pauls-cathedral') stPauls(mesh, item);
  else if (item.kind === 'shakespeares-globe') globe(mesh, item);
}
