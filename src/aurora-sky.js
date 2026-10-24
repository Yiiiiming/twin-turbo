/**
 * Three layered aurora curtains for the WebGL 1 sky pass.
 *
 * phase is a full 0..2PI cycle (100 seconds in the renderer). Every phase and
 * azimuth harmonic is an integer so both time-wrap and heading-wrap are smooth.
 * Only bounded trigonometry and broad smoothstep bands are used: no texture,
 * random flicker, derivatives, transparency, ray march or additional uniforms.
 * The caller applies themeColor() once to this original violet/cyan palette.
 */
export const AURORA_SKY = /* glsl */ `
vec3 auroraCurtain(float azimuth, float height, float phase, float layer) {
  float drift = phase + layer * 2.0943951;
  // A low, scalloped luminous edge opens into a taller, translucent-looking
  // sheet. Different folds keep the three curtains from reading as nested arcs.
  float fold = sin(azimuth * 3.0 + drift) * 0.058
    + sin(azimuth * 7.0 - drift) * 0.028
    + sin(azimuth * 13.0 + drift) * 0.009;
  float hem = 0.43 + layer * 0.115 + fold;
  float rise = height - hem;
  float envelope = 0.30 + 0.70 * pow(0.5 + 0.5 * sin(azimuth * 2.0 - phase + layer * 1.8), 2.0);
  float sheet = smoothstep(-0.018, 0.028, rise)
    * (1.0 - smoothstep(0.080, 0.345 - layer * 0.022, rise));
  float fringe = 1.0 - smoothstep(0.007, 0.034, abs(rise));
  // Soft vertical folds, wide enough to remain stable on a small split screen.
  // The integer frequencies keep the panorama continuous at either heading seam.
  float broad = sin(azimuth * 29.0 + 2.4 * sin(azimuth * 5.0 + drift) + rise * 4.0);
  float fine = sin(azimuth * 59.0 - 1.6 * sin(azimuth * 3.0 - drift) + rise * 9.0 + drift);
  float filaments = 0.24 + 0.48 * smoothstep(-0.80, 0.90, broad)
    + 0.28 * smoothstep(-0.70, 0.95, fine);
  vec3 violet = vec3(0.40, 0.20, 0.76);
  vec3 lower = mix(vec3(0.15, 0.68, 0.77), violet, layer * 0.28);
  vec3 upper = mix(lower, violet, smoothstep(0.025, 0.25, rise));
  float halo = 1.0 - smoothstep(0.065, 0.36, abs(rise - 0.06));
  return envelope * (lower * fringe * (0.11 + 0.12 * filaments)
    + upper * sheet * filaments * 0.46 + violet * halo * 0.035);
}

vec3 auroraSky(vec2 uv, float heading, float aspect, float magic, float phase) {
  float height = clamp(uv.y, 0.0, 1.0);
  vec3 color = mix(vec3(0.043, 0.063, 0.128), vec3(0.009, 0.014, 0.043), pow(height, 0.72));
  color += vec3(0.018, 0.008, 0.032) * (1.0 - smoothstep(0.0, 0.48, height));
  float viewAngle = atan((uv.x - 0.5) * clamp(aspect, 0.4, 3.5) * 1.15);
  // Reduce the heading before higher harmonics, keeping mediump arguments small.
  float azimuth = atan(sin(heading + viewAngle), cos(heading + viewAngle));
  vec3 curtains = auroraCurtain(azimuth, height, phase, 0.0)
    + auroraCurtain(azimuth, height, phase, 1.0)
    + auroraCurtain(azimuth, height, phase, 2.0);
  color += curtains * smoothstep(0.18, 0.38, height);
  // The London spell scene remains a darker place without switching sky models.
  return clamp(color * mix(1.0, 0.70, clamp(magic, 0.0, 1.0)), 0.0, 0.72);
}
`;
