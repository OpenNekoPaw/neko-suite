/**
 * Filter GLSL Shader Sources
 *
 * Fragment shaders for built-in image filters (GLSL ES 3.0).
 * Each shader reads from u_texture and writes filtered output.
 */

export const FILTER_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

export const GAUSSIAN_BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_radius;
uniform float u_direction; // 0.0 = horizontal, 1.0 = vertical

void main() {
  vec2 texelSize = 1.0 / u_resolution;
  vec2 dir = u_direction < 0.5
    ? vec2(texelSize.x, 0.0)
    : vec2(0.0, texelSize.y);

  float r = max(1.0, u_radius);
  float sigma = r * 0.5;
  float invSigma2 = 1.0 / (2.0 * sigma * sigma);

  vec4 sum = vec4(0.0);
  float weightSum = 0.0;
  int iRadius = int(ceil(r));

  for (int i = -iRadius; i <= iRadius; i++) {
    float fi = float(i);
    float w = exp(-fi * fi * invSigma2);
    sum += texture(u_texture, v_texCoord + dir * fi) * w;
    weightSum += w;
  }

  fragColor = sum / weightSum;
}
`;

export const BRIGHTNESS_CONTRAST_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform float u_brightness;
uniform float u_contrast;

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  vec3 rgb = color.rgb + u_brightness;
  rgb = (rgb - 0.5) * (1.0 + u_contrast) + 0.5;
  fragColor = vec4(clamp(rgb, 0.0, 1.0), color.a);
}
`;

export const HUE_SATURATION_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform float u_hue;
uniform float u_saturation;
uniform float u_lightness;

vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  if (mx == mn) return vec3(0.0, 0.0, l);
  float d = mx - mn;
  float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
  float h;
  if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  return vec3(h / 6.0, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0/2.0) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y == 0.0) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(
    hue2rgb(p, q, hsl.x + 1.0/3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0/3.0)
  );
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  vec3 hsl = rgb2hsl(color.rgb);
  hsl.x = fract(hsl.x + u_hue);
  hsl.y = clamp(hsl.y * (1.0 + u_saturation), 0.0, 1.0);
  hsl.z = clamp(hsl.z + u_lightness, 0.0, 1.0);
  fragColor = vec4(hsl2rgb(hsl), color.a);
}
`;

export const SHARPEN_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_amount;

void main() {
  vec2 texel = 1.0 / u_resolution;
  vec4 center = texture(u_texture, v_texCoord);
  vec4 n = texture(u_texture, v_texCoord + vec2(0.0, -texel.y));
  vec4 s = texture(u_texture, v_texCoord + vec2(0.0, texel.y));
  vec4 e = texture(u_texture, v_texCoord + vec2(texel.x, 0.0));
  vec4 w = texture(u_texture, v_texCoord + vec2(-texel.x, 0.0));
  vec4 sharpened = center + (center * 4.0 - n - s - e - w) * u_amount;
  fragColor = vec4(clamp(sharpened.rgb, 0.0, 1.0), center.a);
}
`;

export const VIGNETTE_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform float u_radius;
uniform float u_softness;

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  vec2 center = v_texCoord - 0.5;
  float dist = length(center);
  float vignette = smoothstep(u_radius, u_radius - u_softness, dist);
  fragColor = vec4(color.rgb * vignette, color.a);
}
`;

export const CHROMATIC_ABERRATION_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_offset;

void main() {
  vec2 dir = (v_texCoord - 0.5) * u_offset / u_resolution;
  float r = texture(u_texture, v_texCoord + dir).r;
  float g = texture(u_texture, v_texCoord).g;
  float b = texture(u_texture, v_texCoord - dir).b;
  float a = texture(u_texture, v_texCoord).a;
  fragColor = vec4(r, g, b, a);
}
`;

// ── Additional filters translated from neko-engine WGSL shaders ──────────────

/** Exposure — adjust brightness in stops (powers of 2). */
export const EXPOSURE_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform float u_exposure; // stops: -3.0 .. 3.0

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  vec3 rgb = color.rgb * pow(2.0, u_exposure);
  fragColor = vec4(clamp(rgb, 0.0, 1.0), color.a);
}
`;

/** Color Temperature — shift white balance (cool to warm). */
export const TEMPERATURE_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform float u_temperature; // -1.0 (cool/blue) .. 1.0 (warm/orange)

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float t = u_temperature * 0.3;
  vec3 rgb = vec3(
    clamp(color.r + t,        0.0, 1.0),
    clamp(color.g + t * 0.2,  0.0, 1.0),
    clamp(color.b - t,        0.0, 1.0)
  );
  fragColor = vec4(rgb, color.a);
}
`;

/** Glow — bright-pass accumulation via 5x5 tap, added back with u_intensity. */
export const GLOW_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_intensity; // 0.0 .. 3.0
uniform float u_radius;    // 1.0 .. 20.0

void main() {
  vec2 texel = 1.0 / u_resolution;
  vec4 base  = texture(u_texture, v_texCoord);

  vec4  glow  = vec4(0.0);
  float total = 0.0;

  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      vec2  off       = vec2(float(dx), float(dy)) * texel * u_radius;
      vec4  s         = texture(u_texture, v_texCoord + off);
      float lum       = dot(s.rgb, vec3(0.2126, 0.7152, 0.0722));
      float w         = max(0.0, lum - 0.5) * 2.0;
      glow  += s * w;
      total += w;
    }
  }

  if (total > 0.0) glow /= total;
  vec3 rgb = clamp(base.rgb + glow.rgb * u_intensity, 0.0, 1.0);
  fragColor = vec4(rgb, base.a);
}
`;

/** Film Grain — static per-pixel noise overlay. */
export const FILM_GRAIN_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform float u_amount; // 0.0 .. 0.3

float rand(vec2 co) {
  return fract(sin(dot(co * 1000.0, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4  color = texture(u_texture, v_texCoord);
  float grain = (rand(v_texCoord) - 0.5) * 2.0;
  vec3  rgb   = clamp(color.rgb + grain * u_amount, 0.0, 1.0);
  fragColor   = vec4(rgb, color.a);
}
`;

/** Halftone — screen-space dot pattern driven by source luminance. */
export const HALFTONE_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_cellSize; // pixels per dot cell
uniform float u_angle;    // radians
uniform float u_amount;   // 0.0 .. 1.0

mat2 rotate2d(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float cellSize = max(2.0, u_cellSize);

  vec2 center = u_resolution * 0.5;
  vec2 pixel = v_texCoord * u_resolution;
  mat2 rot = rotate2d(u_angle);
  vec2 rotated = rot * (pixel - center);
  vec2 cell = floor(rotated / cellSize);
  vec2 cellCenter = (cell + 0.5) * cellSize;
  vec2 samplePixel = transpose(rot) * cellCenter + center;
  vec2 sampleUv = clamp(samplePixel / u_resolution, vec2(0.0), vec2(1.0));
  vec4 sampleColor = texture(u_texture, sampleUv);

  float luminance = dot(sampleColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float radius = sqrt(1.0 - luminance) * cellSize * 0.5;
  float dist = length(rotated - cellCenter);
  float edge = max(1.0, fwidth(dist));
  float dotMask = 1.0 - smoothstep(radius - edge, radius + edge, dist);

  vec3 paper = vec3(1.0);
  vec3 dotted = mix(paper, sampleColor.rgb, dotMask);
  vec3 rgb = mix(color.rgb, dotted, clamp(u_amount, 0.0, 1.0));
  fragColor = vec4(rgb, color.a);
}
`;

/** Gradient Map — remap luminance between two user-selected colors. */
export const GRADIENT_MAP_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform vec4 u_shadowColor;
uniform vec4 u_highlightColor;
uniform float u_amount; // 0.0 .. 1.0

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec4 mapped = mix(u_shadowColor, u_highlightColor, luminance);
  vec3 rgb = mix(color.rgb, mapped.rgb, clamp(u_amount, 0.0, 1.0));
  fragColor = vec4(rgb, color.a);
}
`;

/** SSAO — 2D screen-space ambient occlusion using alpha/luminance as depth hints. */
export const SSAO_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_radius;    // sample radius in pixels
uniform float u_intensity; // 0.0 .. 2.0
uniform float u_bias;      // depth-hint threshold

const float PI = 3.14159265359;

float depthHint(vec4 color) {
  float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  return color.a * (1.0 - luminance * 0.35);
}

float sampleOcclusion(vec2 direction, float centerDepth, float radiusPixels) {
  vec2 uv = clamp(v_texCoord + direction * radiusPixels / u_resolution, vec2(0.0), vec2(1.0));
  vec4 sampleColor = texture(u_texture, uv);
  float sampleDepth = depthHint(sampleColor);
  return max(0.0, sampleDepth - centerDepth - u_bias) * sampleColor.a;
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float radiusPixels = max(1.0, u_radius);
  float centerDepth = depthHint(color);

  float occlusion = 0.0;
  for (int i = 0; i < 8; i++) {
    float angle = (float(i) / 8.0) * PI * 2.0;
    vec2 direction = vec2(cos(angle), sin(angle));
    occlusion += sampleOcclusion(direction, centerDepth, radiusPixels);
    occlusion += sampleOcclusion(direction, centerDepth, radiusPixels * 0.5) * 0.5;
  }

  occlusion = clamp(occlusion / 12.0, 0.0, 1.0);
  float shade = 1.0 - occlusion * clamp(u_intensity, 0.0, 2.0) * color.a;
  fragColor = vec4(color.rgb * shade, color.a);
}
`;
