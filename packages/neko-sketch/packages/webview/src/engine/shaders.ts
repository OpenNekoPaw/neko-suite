/**
 * GLSL Shader Sources
 *
 * Vertex and fragment shaders for the 2D rendering pipeline.
 * Blend mode formulas translated from neko-engine WGSL shaders.
 */

// ─── Fullscreen Quad Vertex Shader ───
export const QUAD_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;
out vec2 v_texCoord;
uniform mat3 u_transform;
void main() {
  vec3 pos = u_transform * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// ─── Simple Texture Blit Fragment ───
export const BLIT_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform float u_opacity;
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  fragColor = color * u_opacity;
}
`;

// ─── Blend Mode Fragment Shader ───
export const BLEND_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_base;
uniform sampler2D u_blend;
uniform float u_opacity;
uniform int u_mode;

vec3 blendNormal(vec3 b, vec3 l) { return l; }
vec3 blendMultiply(vec3 b, vec3 l) { return b * l; }
vec3 blendScreen(vec3 b, vec3 l) { return 1.0 - (1.0 - b) * (1.0 - l); }

vec3 blendOverlay(vec3 b, vec3 l) {
  return vec3(
    b.r < 0.5 ? 2.0*b.r*l.r : 1.0 - 2.0*(1.0-b.r)*(1.0-l.r),
    b.g < 0.5 ? 2.0*b.g*l.g : 1.0 - 2.0*(1.0-b.g)*(1.0-l.g),
    b.b < 0.5 ? 2.0*b.b*l.b : 1.0 - 2.0*(1.0-b.b)*(1.0-l.b)
  );
}

vec3 blendDarken(vec3 b, vec3 l) { return min(b, l); }
vec3 blendLighten(vec3 b, vec3 l) { return max(b, l); }

vec3 blendColorDodge(vec3 b, vec3 l) {
  return vec3(
    l.r >= 1.0 ? 1.0 : min(1.0, b.r / (1.0 - l.r)),
    l.g >= 1.0 ? 1.0 : min(1.0, b.g / (1.0 - l.g)),
    l.b >= 1.0 ? 1.0 : min(1.0, b.b / (1.0 - l.b))
  );
}

vec3 blendColorBurn(vec3 b, vec3 l) {
  return vec3(
    l.r <= 0.0 ? 0.0 : max(0.0, 1.0 - (1.0 - b.r) / l.r),
    l.g <= 0.0 ? 0.0 : max(0.0, 1.0 - (1.0 - b.g) / l.g),
    l.b <= 0.0 ? 0.0 : max(0.0, 1.0 - (1.0 - b.b) / l.b)
  );
}

vec3 blendHardLight(vec3 b, vec3 l) {
  return vec3(
    l.r < 0.5 ? 2.0*b.r*l.r : 1.0 - 2.0*(1.0-b.r)*(1.0-l.r),
    l.g < 0.5 ? 2.0*b.g*l.g : 1.0 - 2.0*(1.0-b.g)*(1.0-l.g),
    l.b < 0.5 ? 2.0*b.b*l.b : 1.0 - 2.0*(1.0-b.b)*(1.0-l.b)
  );
}

float softLightChannel(float b, float l) {
  if (l <= 0.5) {
    return b - (1.0 - 2.0*l) * b * (1.0 - b);
  } else {
    float d = b <= 0.25
      ? ((16.0*b - 12.0)*b + 4.0)*b
      : sqrt(b);
    return b + (2.0*l - 1.0) * (d - b);
  }
}

vec3 blendSoftLight(vec3 b, vec3 l) {
  return vec3(
    softLightChannel(b.r, l.r),
    softLightChannel(b.g, l.g),
    softLightChannel(b.b, l.b)
  );
}

vec3 blendDifference(vec3 b, vec3 l) { return abs(b - l); }
vec3 blendExclusion(vec3 b, vec3 l) { return b + l - 2.0*b*l; }

void main() {
  vec4 base = texture(u_base, v_texCoord);
  vec4 blend = texture(u_blend, v_texCoord);
  float eff = u_opacity * blend.a;

  vec3 result;
  if (u_mode == 0) result = blendNormal(base.rgb, blend.rgb);
  else if (u_mode == 1) result = blendMultiply(base.rgb, blend.rgb);
  else if (u_mode == 2) result = blendScreen(base.rgb, blend.rgb);
  else if (u_mode == 3) result = blendOverlay(base.rgb, blend.rgb);
  else if (u_mode == 4) result = blendDarken(base.rgb, blend.rgb);
  else if (u_mode == 5) result = blendLighten(base.rgb, blend.rgb);
  else if (u_mode == 6) result = blendColorDodge(base.rgb, blend.rgb);
  else if (u_mode == 7) result = blendColorBurn(base.rgb, blend.rgb);
  else if (u_mode == 8) result = blendHardLight(base.rgb, blend.rgb);
  else if (u_mode == 9) result = blendSoftLight(base.rgb, blend.rgb);
  else if (u_mode == 10) result = blendDifference(base.rgb, blend.rgb);
  else if (u_mode == 11) result = blendExclusion(base.rgb, blend.rgb);
  else result = blend.rgb;

  fragColor = vec4(mix(base.rgb, result, eff), base.a + (1.0 - base.a) * eff);
}
`;

// ─── Stroke Rendering Vertex Shader ───
export const STROKE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in float a_pressure;
layout(location = 2) in vec2 a_tilt;
uniform mat3 u_transform;
uniform float u_size;
out float v_pressure;
out vec2 v_tilt;
void main() {
  v_pressure = a_pressure;
  v_tilt = a_tilt;
  vec3 pos = u_transform * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  gl_PointSize = u_size * a_pressure;
}
`;

// ─── Stroke Rendering Fragment Shader ───
export const STROKE_FRAG = `#version 300 es
precision highp float;
in float v_pressure;
in vec2 v_tilt;
out vec4 fragColor;
uniform vec4 u_color;
uniform float u_hardness;
void main() {
  vec2 center = gl_PointCoord - vec2(0.5);

  // Apply tilt influence: elongate the dab along the tilt direction.
  // tiltX/tiltY are in [-90,90] degrees — normalize to [-1,1] range.
  vec2 tiltNorm = clamp(v_tilt / 90.0, -1.0, 1.0);
  float tiltStrength = length(tiltNorm) * 0.4; // max 40% elongation
  // Stretch the distance field perpendicular to tilt direction
  vec2 tiltDir = length(tiltNorm) > 0.01 ? normalize(tiltNorm) : vec2(0.0, 1.0);
  vec2 perpDir = vec2(-tiltDir.y, tiltDir.x);
  float along = dot(center, tiltDir);
  float perp = dot(center, perpDir);
  float dist = length(vec2(along / (1.0 + tiltStrength), perp * (1.0 + tiltStrength))) * 2.0;

  float edge = 1.0 - u_hardness;
  float alpha = 1.0 - smoothstep(u_hardness, u_hardness + edge, dist);
  alpha *= v_pressure;
  fragColor = vec4(u_color.rgb, u_color.a * alpha);
}
`;

// ─── Checkerboard Background Fragment ───
export const CHECKER_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform vec2 u_resolution;
uniform float u_gridSize;
void main() {
  vec2 pos = gl_FragCoord.xy / u_gridSize;
  float checker = mod(floor(pos.x) + floor(pos.y), 2.0);
  float gray = mix(0.8, 0.9, checker);
  fragColor = vec4(vec3(gray), 1.0);
}
`;

/** Blend mode name → integer index mapping */
export const BLEND_MODE_INDEX: Record<string, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  darken: 4,
  lighten: 5,
  'color-dodge': 6,
  'color-burn': 7,
  'hard-light': 8,
  'soft-light': 9,
  difference: 10,
  exclusion: 11,
};
