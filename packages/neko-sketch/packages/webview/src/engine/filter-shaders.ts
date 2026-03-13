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
