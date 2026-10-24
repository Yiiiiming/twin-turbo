/**
 * Opaque holographic scenery for the native WebGL 1 renderer.
 *
 * Embed either string after the fragment shader's precision declaration and
 * before main(). No extension, texture, uniform or varying is introduced.
 * hologramSurface includes soft form shading: apply only the caller's fog/alpha.
 * Mode 0 is an exact pass-through for landmarks, posters, effects and shadows.
 *
 * Patterns are fixed in world space, broad and softened with distance. There is
 * deliberately no clock, random noise, alpha modulation, discard or fine grid.
 */
export const HOLOGRAM_MODES = Object.freeze({
  original: 0, terrain: 1, water: 2, props: 3, road: 4, playerCar: 5,
});

export const HOLOGRAM_MATERIALS = Object.freeze({
  landmark: 0, terrain: 1, water: 2, props: 3, road: 4, car: 5,
});

export const HOLOGRAM_PALETTE = Object.freeze({
  asphalt: '#0b1028', terrain: '#10152e', structure: '#171c43',
  water: '#0a1735', violet: '#8558d9', cyan: '#65d7e6',
  skyZenith: '#05091c', skyHorizon: '#101d3e', fog: '#101b36',
});

export const HOLOGRAM_FRAGMENT = /* glsl */ `
vec3 hologramSurface(vec3 baseColor, vec3 position, vec3 normal, vec3 eye, float emission, float mode) {
  if (mode < 0.5) return baseColor;
  vec3 source = clamp(baseColor, 0.0, 1.0);
  float lightness = dot(source, vec3(0.2126, 0.7152, 0.0722));
  float emit = clamp(emission, 0.0, 1.0);
  vec3 n = normal * inversesqrt(max(dot(normal, normal), 0.0001));
  // Scale before normalising: mediump devices must not square world distances.
  vec3 delta = eye - position;
  float extent = max(max(abs(delta.x), abs(delta.y)), abs(delta.z));
  vec3 direction = delta / max(extent, 0.01);
  float directionLength = sqrt(max(dot(direction, direction), 0.0001));
  vec3 view = direction / directionLength;
  float distanceToEye = extent * directionLength;
  float edge = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 3.0);
  float nearDetail = 1.0 - smoothstep(220.0, 850.0, distanceToEye);
  float vertical = 1.0 - abs(n.y);
  // About 30 world units between broad bands; never a pixel-width scanline.
  float scan = (0.5 + 0.5 * sin(position.y * 0.21)) * nearDetail;
  vec3 cyan = vec3(0.22, 0.62, 0.75);
  vec3 violet = vec3(0.44, 0.23, 0.72);
  vec3 edgeColor = mix(cyan, violet, 0.5 + 0.35 * n.x + 0.15 * n.z);
  vec3 color;

  if (mode < 1.5) {
    // Terrain stays darker than the shoulder, with the original relief intact.
    color = mix(vec3(0.026, 0.037, 0.083), vec3(0.079, 0.067, 0.145), lightness);
    color += edgeColor * (edge * 0.028 + scan * vertical * 0.012);
  } else if (mode < 2.5) {
    // Wide still bands read as reflective water without sparkling or transparency.
    float reflection = 0.5 + 0.5 * sin(position.x * 0.006 + position.z * 0.009);
    color = mix(vec3(0.020, 0.049, 0.115), vec3(0.079, 0.047, 0.174), reflection * 0.7);
    color += cyan * (edge * 0.15 + lightness * 0.018);
  } else if (mode < 3.5) {
    // Ordinary facades remain restrained even if their old plaster was white.
    float detail = smoothstep(0.15, 0.85, lightness);
    color = mix(vec3(0.035, 0.046, 0.102), vec3(0.105, 0.115, 0.215), detail);
    color += edgeColor * (edge * 0.095 + scan * vertical * 0.022);
    color += mix(violet, cyan, 0.75) * emit * 0.18;
  } else if (mode < 4.5) {
    // Old asphalt/tyre marks stay dark; mid-value shoulders retain contrast.
    float shoulder = smoothstep(0.24, 0.42, lightness);
    color = mix(vec3(0.038, 0.051, 0.105), vec3(0.105, 0.098, 0.190), shoulder);
    float red = smoothstep(0.10, 0.32, source.r - max(source.g, source.b));
    float brightRedCurb = red * smoothstep(0.40, 0.50, lightness);
    // Muted stadium-red surfaces become dark violet, never luminous floor slabs.
    color = mix(color, vec3(0.085, 0.039, 0.153), red * 0.8);
    color += vec3(0.20, 0.045, 0.35) * brightRedCurb;
    float iceLine = smoothstep(0.62, 0.84, lightness) * (1.0 - red);
    color = mix(color, vec3(0.48, 0.77, 0.86), iceLine);
    color += cyan * edge * 0.012;
  } else {
    // Preserve recognisable dark tyres/glass, and give the two players different
    // cyan / amber paint accents matching the players' existing colour choices.
    float body = smoothstep(0.22, 0.70, lightness);
    float warmPaint = smoothstep(0.06, 0.28, source.r - source.b);
    vec3 paint = mix(vec3(0.10, 0.28, 0.40), vec3(0.48, 0.22, 0.10), warmPaint);
    color = mix(vec3(0.026, 0.044, 0.083), paint, body);
    color += mix(cyan, vec3(0.92, 0.45, 0.20), warmPaint) * edge * (0.055 + body * 0.17);
    color += edgeColor * scan * body * 0.018;
    // Headlights stay cool white; red tail lamps retain their direction cue.
    vec3 lamp = mix(vec3(0.25, 0.58, 0.76), source, 0.72);
    color = mix(color, lamp, emit);
  }
  float formShade = 0.80 + 0.10 * max(n.y, 0.0)
    + 0.10 * max(dot(n, vec3(-0.436, 0.834, 0.340)), 0.0);
  return clamp(color * mix(formShade, 1.0, emit), 0.0, 0.94);
}
`;

export const HOLOGRAM_SKY = /* glsl */ `
vec3 hologramSky(vec2 uv, float heading, float aspect, float magic) {
  float height = clamp(uv.y, 0.0, 1.0);
  vec3 color = mix(vec3(0.062, 0.112, 0.242), vec3(0.020, 0.034, 0.108), pow(height, 0.72));
  float haze = 1.0 - smoothstep(0.05, 0.62, height);
  color += vec3(0.025, 0.008, 0.048) * haze;
  // Broad translucent-looking auroras are painted into an opaque sky. Their
  // circular form turns continuously through +/-pi, including split viewports.
  vec2 p = vec2((uv.x - 0.5) * clamp(aspect, 0.4, 3.5), uv.y - 0.5);
  vec2 centre = vec2(sin(heading) * 0.30, -0.91 + cos(heading) * 0.07);
  float radius = length(p - centre);
  float arc = 1.0 - smoothstep(0.018, 0.105, abs(radius - 1.28));
  float halo = 1.0 - smoothstep(0.05, 0.30, abs(radius - 1.17));
  color += vec3(0.015, 0.040, 0.062) * arc;
  color += vec3(0.032, 0.010, 0.057) * halo;
  float spellNight = clamp(magic, 0.0, 1.0);
  return color * mix(vec3(1.0), vec3(0.67, 0.77, 0.90), spellNight);
}
`;
