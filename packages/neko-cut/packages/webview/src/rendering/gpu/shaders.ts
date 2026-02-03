/**
 * WebGL Shader Sources
 * WebGL 着色器源码
 *
 * 包含所有渲染所需的 vertex 和 fragment shaders
 */

// =============================================================================
// Vertex Shaders
// =============================================================================

/**
 * Basic quad vertex shader
 * 基础四边形顶点着色器
 */
export const VERTEX_QUAD = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

uniform mat3 u_matrix;

out vec2 v_texCoord;

void main() {
  vec3 pos = u_matrix * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

/**
 * Passthrough vertex shader (no transform)
 * 透传顶点着色器（无变换）
 */
export const VERTEX_PASSTHROUGH = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// =============================================================================
// Fragment Shaders - Basic
// =============================================================================

/**
 * Basic texture sampling shader
 * 基础纹理采样着色器
 */
export const FRAGMENT_BASIC = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_opacity;

out vec4 fragColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  fragColor = vec4(color.rgb, color.a * u_opacity);
}
`;

/**
 * Solid color shader
 * 纯色着色器
 */
export const FRAGMENT_SOLID = `#version 300 es
precision highp float;

uniform vec4 u_color;

out vec4 fragColor;

void main() {
  fragColor = u_color;
}
`;

// =============================================================================
// Fragment Shaders - Color Correction
// =============================================================================

/**
 * Color correction shader (extended)
 * 颜色校正着色器（扩展版）
 *
 * Implements:
 * - Basic: exposure, contrast, highlights, shadows, whites, blacks,
 *   temperature, tint, saturation, vibrance
 * - Vignette: amount, midpoint, roundness, feather
 * - Color wheels: shadows/midtones/highlights HSL adjustments
 */
export const FRAGMENT_COLOR_CORRECTION = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_opacity;

// Basic color correction uniforms
uniform float u_exposure;      // -5 to 5
uniform float u_contrast;      // -100 to 100
uniform float u_highlights;    // -100 to 100
uniform float u_shadows;       // -100 to 100
uniform float u_whites;        // -100 to 100
uniform float u_blacks;        // -100 to 100
uniform float u_temperature;   // -100 to 100
uniform float u_tint;          // -100 to 100
uniform float u_saturation;    // -100 to 100
uniform float u_vibrance;      // -100 to 100

// Vignette uniforms
uniform float u_vignetteAmount;    // -100 to 100
uniform float u_vignetteMidpoint;  // 0 to 100
uniform float u_vignetteRoundness; // -100 to 100
uniform float u_vignetteFeather;   // 0 to 100

// Color wheels uniforms (HSL: hue offset, saturation multiplier, luminance offset)
uniform vec3 u_wheelShadows;    // shadows HSL
uniform vec3 u_wheelMidtones;   // midtones HSL
uniform vec3 u_wheelHighlights; // highlights HSL

out vec4 fragColor;

// Constants
const float PI = 3.14159265359;

// Convert RGB to HSL
vec3 rgb2hsl(vec3 c) {
  float maxC = max(max(c.r, c.g), c.b);
  float minC = min(min(c.r, c.g), c.b);
  float l = (maxC + minC) * 0.5;

  if (maxC == minC) {
    return vec3(0.0, 0.0, l);
  }

  float d = maxC - minC;
  float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);

  float h;
  if (maxC == c.r) {
    h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  } else if (maxC == c.g) {
    h = (c.b - c.r) / d + 2.0;
  } else {
    h = (c.r - c.g) / d + 4.0;
  }
  h /= 6.0;

  return vec3(h, s, l);
}

// Convert HSL to RGB
float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0/2.0) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y == 0.0) {
    return vec3(hsl.z);
  }

  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;

  return vec3(
    hue2rgb(p, q, hsl.x + 1.0/3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0/3.0)
  );
}

// Get luminance
float getLuminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Apply color wheel adjustment to HSL
vec3 applyColorWheel(vec3 hsl, vec3 wheel, float weight) {
  // wheel.x = hue offset (degrees -> normalized)
  // wheel.y = saturation multiplier (100 = no change)
  // wheel.z = luminance offset (-100 to 100)
  float hueOffset = wheel.x / 360.0;
  float satMult = wheel.y / 100.0;
  float lumOffset = wheel.z / 100.0 * 0.5;

  hsl.x = fract(hsl.x + hueOffset * weight);
  hsl.y = clamp(hsl.y * (1.0 + (satMult - 1.0) * weight), 0.0, 1.0);
  hsl.z = clamp(hsl.z + lumOffset * weight, 0.0, 1.0);

  return hsl;
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  vec3 rgb = color.rgb;

  // ========== BASIC COLOR CORRECTION ==========

  // 1. Exposure (exponential)
  rgb *= pow(2.0, u_exposure);

  // 2. Contrast (S-curve around 0.5)
  float contrastFactor = 1.0 + u_contrast / 100.0;
  rgb = (rgb - 0.5) * contrastFactor + 0.5;

  // 3. Highlights and Shadows (basic)
  float lum = getLuminance(rgb);

  // Highlights affect bright areas
  float highlightMask = smoothstep(0.5, 1.0, lum);
  rgb += highlightMask * (u_highlights / 100.0) * 0.5;

  // Shadows affect dark areas
  float shadowMask = 1.0 - smoothstep(0.0, 0.5, lum);
  rgb += shadowMask * (u_shadows / 100.0) * 0.5;

  // 4. Whites (extreme highlights)
  float whiteMask = smoothstep(0.75, 1.0, lum);
  rgb += whiteMask * (u_whites / 100.0) * 0.3;

  // 5. Blacks (extreme shadows)
  float blackMask = 1.0 - smoothstep(0.0, 0.25, lum);
  rgb -= blackMask * (u_blacks / 100.0) * 0.3;

  // 6. Temperature (warm/cool shift)
  float tempShift = u_temperature / 100.0;
  rgb.r += tempShift * 0.1;
  rgb.b -= tempShift * 0.1;

  // 7. Tint (green/magenta shift)
  float tintShift = u_tint / 100.0;
  rgb.g -= tintShift * 0.1;

  // 8. Saturation
  vec3 gray = vec3(getLuminance(rgb));
  float satFactor = 1.0 + u_saturation / 100.0;
  rgb = mix(gray, rgb, satFactor);

  // 9. Vibrance (affects less saturated colors more)
  vec3 hsl = rgb2hsl(rgb);
  float vibFactor = u_vibrance / 100.0;
  float satBoost = vibFactor * (1.0 - hsl.y);
  hsl.y = clamp(hsl.y + satBoost, 0.0, 1.0);
  rgb = hsl2rgb(hsl);

  // ========== COLOR WHEELS ==========

  // Recalculate luminance after basic adjustments
  lum = getLuminance(rgb);
  hsl = rgb2hsl(rgb);

  // Shadows (dark areas, lum < 0.33)
  float shadowWeight = 1.0 - smoothstep(0.0, 0.33, lum);
  if (shadowWeight > 0.01) {
    hsl = applyColorWheel(hsl, u_wheelShadows, shadowWeight);
  }

  // Midtones (middle areas, centered around 0.5)
  float midtoneWeight = 1.0 - abs(lum - 0.5) * 3.0;
  midtoneWeight = clamp(midtoneWeight, 0.0, 1.0);
  if (midtoneWeight > 0.01) {
    hsl = applyColorWheel(hsl, u_wheelMidtones, midtoneWeight);
  }

  // Highlights (bright areas, lum > 0.66)
  float highlightWeight = smoothstep(0.66, 1.0, lum);
  if (highlightWeight > 0.01) {
    hsl = applyColorWheel(hsl, u_wheelHighlights, highlightWeight);
  }

  rgb = hsl2rgb(hsl);

  // ========== VIGNETTE ==========

  if (abs(u_vignetteAmount) > 0.01) {
    // Calculate distance from center
    vec2 center = vec2(0.5);
    vec2 coord = v_texCoord - center;

    // Apply roundness (1.0 = circle, other = ellipse)
    float aspect = 1.0 + u_vignetteRoundness / 100.0 * 0.5;
    coord.x *= aspect;

    float dist = length(coord) * 2.0;

    // Calculate vignette mask
    float midpoint = u_vignetteMidpoint / 100.0;
    float feather = max(u_vignetteFeather / 100.0, 0.001);
    float vignette = smoothstep(midpoint - feather, midpoint + feather, dist);

    // Apply amount (negative = darken, positive = lighten)
    float strength = u_vignetteAmount / 100.0;
    if (strength < 0.0) {
      // Darken edges
      rgb *= 1.0 - vignette * abs(strength);
    } else {
      // Lighten edges
      rgb = mix(rgb, vec3(1.0), vignette * strength);
    }
  }

  // ========== FINAL OUTPUT ==========

  // Clamp to valid range
  rgb = clamp(rgb, 0.0, 1.0);

  fragColor = vec4(rgb, color.a * u_opacity);
}
`;

// =============================================================================
// Fragment Shaders - Blend Modes
// =============================================================================

/**
 * Advanced blend mode shader
 * 高级混合模式着色器
 *
 * Implements Photoshop-style blend modes
 */
export const FRAGMENT_BLEND = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_baseTexture;
uniform sampler2D u_blendTexture;
uniform float u_opacity;
uniform int u_blendMode;

out vec4 fragColor;

// Blend mode constants
const int BLEND_NORMAL = 0;
const int BLEND_MULTIPLY = 1;
const int BLEND_SCREEN = 2;
const int BLEND_OVERLAY = 3;
const int BLEND_DARKEN = 4;
const int BLEND_LIGHTEN = 5;
const int BLEND_COLOR_DODGE = 6;
const int BLEND_COLOR_BURN = 7;
const int BLEND_HARD_LIGHT = 8;
const int BLEND_SOFT_LIGHT = 9;
const int BLEND_DIFFERENCE = 10;
const int BLEND_EXCLUSION = 11;
const int BLEND_HUE = 12;
const int BLEND_SATURATION = 13;
const int BLEND_COLOR = 14;
const int BLEND_LUMINOSITY = 15;
const int BLEND_LINEAR_DODGE = 16;
const int BLEND_LINEAR_BURN = 17;
const int BLEND_VIVID_LIGHT = 18;
const int BLEND_LINEAR_LIGHT = 19;
const int BLEND_PIN_LIGHT = 20;
const int BLEND_HARD_MIX = 21;
const int BLEND_SUBTRACT = 22;
const int BLEND_DIVIDE = 23;

// Helper functions
float getLuminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 setLuminance(vec3 c, float l) {
  float d = l - getLuminance(c);
  return clamp(c + d, 0.0, 1.0);
}

float getSaturation(vec3 c) {
  return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
}

vec3 setSaturation(vec3 c, float s) {
  float maxC = max(max(c.r, c.g), c.b);
  float minC = min(min(c.r, c.g), c.b);
  float d = maxC - minC;

  if (d == 0.0) return c;

  vec3 result = (c - minC) * s / d;
  return result;
}

// Individual blend mode functions
vec3 blendMultiply(vec3 base, vec3 blend) {
  return base * blend;
}

vec3 blendScreen(vec3 base, vec3 blend) {
  return 1.0 - (1.0 - base) * (1.0 - blend);
}

vec3 blendOverlay(vec3 base, vec3 blend) {
  return mix(
    2.0 * base * blend,
    1.0 - 2.0 * (1.0 - base) * (1.0 - blend),
    step(0.5, base)
  );
}

vec3 blendDarken(vec3 base, vec3 blend) {
  return min(base, blend);
}

vec3 blendLighten(vec3 base, vec3 blend) {
  return max(base, blend);
}

vec3 blendColorDodge(vec3 base, vec3 blend) {
  return clamp(base / (1.0 - blend + 0.001), 0.0, 1.0);
}

vec3 blendColorBurn(vec3 base, vec3 blend) {
  return 1.0 - clamp((1.0 - base) / (blend + 0.001), 0.0, 1.0);
}

vec3 blendHardLight(vec3 base, vec3 blend) {
  return blendOverlay(blend, base);
}

vec3 blendSoftLight(vec3 base, vec3 blend) {
  return mix(
    2.0 * base * blend + base * base * (1.0 - 2.0 * blend),
    sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend),
    step(0.5, blend)
  );
}

vec3 blendDifference(vec3 base, vec3 blend) {
  return abs(base - blend);
}

vec3 blendExclusion(vec3 base, vec3 blend) {
  return base + blend - 2.0 * base * blend;
}

vec3 blendHue(vec3 base, vec3 blend) {
  float baseLum = getLuminance(base);
  float baseSat = getSaturation(base);
  vec3 result = setSaturation(blend, baseSat);
  return setLuminance(result, baseLum);
}

vec3 blendSaturation(vec3 base, vec3 blend) {
  float baseLum = getLuminance(base);
  float blendSat = getSaturation(blend);
  vec3 result = setSaturation(base, blendSat);
  return setLuminance(result, baseLum);
}

vec3 blendColor(vec3 base, vec3 blend) {
  float baseLum = getLuminance(base);
  return setLuminance(blend, baseLum);
}

vec3 blendLuminosity(vec3 base, vec3 blend) {
  float blendLum = getLuminance(blend);
  return setLuminance(base, blendLum);
}

vec3 blendLinearDodge(vec3 base, vec3 blend) {
  return clamp(base + blend, 0.0, 1.0);
}

vec3 blendLinearBurn(vec3 base, vec3 blend) {
  return clamp(base + blend - 1.0, 0.0, 1.0);
}

vec3 blendVividLight(vec3 base, vec3 blend) {
  return mix(
    blendColorBurn(base, 2.0 * blend),
    blendColorDodge(base, 2.0 * (blend - 0.5)),
    step(0.5, blend)
  );
}

vec3 blendLinearLight(vec3 base, vec3 blend) {
  return clamp(base + 2.0 * blend - 1.0, 0.0, 1.0);
}

vec3 blendPinLight(vec3 base, vec3 blend) {
  return mix(
    blendDarken(base, 2.0 * blend),
    blendLighten(base, 2.0 * (blend - 0.5)),
    step(0.5, blend)
  );
}

vec3 blendHardMix(vec3 base, vec3 blend) {
  return step(1.0, base + blend);
}

vec3 blendSubtract(vec3 base, vec3 blend) {
  return clamp(base - blend, 0.0, 1.0);
}

vec3 blendDivide(vec3 base, vec3 blend) {
  return clamp(base / (blend + 0.001), 0.0, 1.0);
}

void main() {
  vec4 baseColor = texture(u_baseTexture, v_texCoord);
  vec4 blendColor = texture(u_blendTexture, v_texCoord);

  vec3 base = baseColor.rgb;
  vec3 blend = blendColor.rgb;
  vec3 result;

  // Apply blend mode
  if (u_blendMode == BLEND_NORMAL) {
    result = blend;
  } else if (u_blendMode == BLEND_MULTIPLY) {
    result = blendMultiply(base, blend);
  } else if (u_blendMode == BLEND_SCREEN) {
    result = blendScreen(base, blend);
  } else if (u_blendMode == BLEND_OVERLAY) {
    result = blendOverlay(base, blend);
  } else if (u_blendMode == BLEND_DARKEN) {
    result = blendDarken(base, blend);
  } else if (u_blendMode == BLEND_LIGHTEN) {
    result = blendLighten(base, blend);
  } else if (u_blendMode == BLEND_COLOR_DODGE) {
    result = blendColorDodge(base, blend);
  } else if (u_blendMode == BLEND_COLOR_BURN) {
    result = blendColorBurn(base, blend);
  } else if (u_blendMode == BLEND_HARD_LIGHT) {
    result = blendHardLight(base, blend);
  } else if (u_blendMode == BLEND_SOFT_LIGHT) {
    result = blendSoftLight(base, blend);
  } else if (u_blendMode == BLEND_DIFFERENCE) {
    result = blendDifference(base, blend);
  } else if (u_blendMode == BLEND_EXCLUSION) {
    result = blendExclusion(base, blend);
  } else if (u_blendMode == BLEND_HUE) {
    result = blendHue(base, blend);
  } else if (u_blendMode == BLEND_SATURATION) {
    result = blendSaturation(base, blend);
  } else if (u_blendMode == BLEND_COLOR) {
    result = blendColor(base, blend);
  } else if (u_blendMode == BLEND_LUMINOSITY) {
    result = blendLuminosity(base, blend);
  } else if (u_blendMode == BLEND_LINEAR_DODGE) {
    result = blendLinearDodge(base, blend);
  } else if (u_blendMode == BLEND_LINEAR_BURN) {
    result = blendLinearBurn(base, blend);
  } else if (u_blendMode == BLEND_VIVID_LIGHT) {
    result = blendVividLight(base, blend);
  } else if (u_blendMode == BLEND_LINEAR_LIGHT) {
    result = blendLinearLight(base, blend);
  } else if (u_blendMode == BLEND_PIN_LIGHT) {
    result = blendPinLight(base, blend);
  } else if (u_blendMode == BLEND_HARD_MIX) {
    result = blendHardMix(base, blend);
  } else if (u_blendMode == BLEND_SUBTRACT) {
    result = blendSubtract(base, blend);
  } else if (u_blendMode == BLEND_DIVIDE) {
    result = blendDivide(base, blend);
  } else {
    result = blend;
  }

  // Apply opacity and alpha compositing
  float alpha = blendColor.a * u_opacity;
  vec3 finalColor = mix(base, result, alpha);
  float finalAlpha = baseColor.a + alpha * (1.0 - baseColor.a);

  fragColor = vec4(finalColor, finalAlpha);
}
`;

// =============================================================================
// Fragment Shaders - Effects
// =============================================================================

/**
 * Gaussian blur shader
 * 高斯模糊着色器
 */
export const FRAGMENT_GAUSSIAN_BLUR = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_direction;  // (1,0) for horizontal, (0,1) for vertical
uniform float u_radius;
uniform vec2 u_texelSize;  // 1.0 / textureSize

out vec4 fragColor;

// 9-tap Gaussian kernel
const float kernel[9] = float[](
  0.0162162162, 0.0540540541, 0.1216216216, 0.1945945946,
  0.2270270270,
  0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162
);

void main() {
  vec4 sum = vec4(0.0);
  vec2 step = u_direction * u_texelSize * u_radius;

  for (int i = 0; i < 9; i++) {
    vec2 offset = step * float(i - 4);
    sum += texture(u_texture, v_texCoord + offset) * kernel[i];
  }

  fragColor = sum;
}
`;

/**
 * Vignette shader
 * 暗角着色器
 */
export const FRAGMENT_VIGNETTE = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_amount;    // -100 to 100
uniform float u_midpoint;  // 0 to 100
uniform float u_roundness; // -100 to 100
uniform float u_feather;   // 0 to 100

out vec4 fragColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord);

  // Calculate distance from center
  vec2 center = vec2(0.5);
  vec2 coord = v_texCoord - center;

  // Apply roundness (1.0 = circle, < 1.0 = ellipse)
  float aspect = 1.0 + u_roundness / 100.0 * 0.5;
  coord.x *= aspect;

  float dist = length(coord) * 2.0;

  // Calculate vignette
  float midpoint = u_midpoint / 100.0;
  float feather = max(u_feather / 100.0, 0.001);
  float vignette = smoothstep(midpoint - feather, midpoint + feather, dist);

  // Apply amount (negative = darken, positive = lighten)
  float strength = u_amount / 100.0;
  if (strength < 0.0) {
    // Darken edges
    color.rgb *= 1.0 - vignette * abs(strength);
  } else {
    // Lighten edges
    color.rgb = mix(color.rgb, vec3(1.0), vignette * strength);
  }

  fragColor = color;
}
`;

/**
 * Chromatic aberration shader
 * 色差着色器
 */
export const FRAGMENT_CHROMATIC_ABERRATION = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_redOffset;
uniform vec2 u_blueOffset;

out vec4 fragColor;

void main() {
  float r = texture(u_texture, v_texCoord + u_redOffset).r;
  float g = texture(u_texture, v_texCoord).g;
  float b = texture(u_texture, v_texCoord + u_blueOffset).b;
  float a = texture(u_texture, v_texCoord).a;

  fragColor = vec4(r, g, b, a);
}
`;

/**
 * Noise/grain shader
 * 噪点/颗粒着色器
 */
export const FRAGMENT_NOISE = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_amount;
uniform float u_time;
uniform bool u_colorNoise;

out vec4 fragColor;

// Simple hash function
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);

  // Generate noise
  vec2 noiseCoord = v_texCoord * 1000.0 + u_time * 100.0;

  float noise;
  if (u_colorNoise) {
    // Color noise (different noise per channel)
    float r = hash(noiseCoord + vec2(0.0, 0.0));
    float g = hash(noiseCoord + vec2(1.0, 0.0));
    float b = hash(noiseCoord + vec2(0.0, 1.0));
    color.rgb += (vec3(r, g, b) - 0.5) * u_amount / 100.0;
  } else {
    // Monochrome noise
    noise = hash(noiseCoord);
    color.rgb += (noise - 0.5) * u_amount / 100.0;
  }

  fragColor = clamp(color, 0.0, 1.0);
}
`;

/**
 * Glow shader
 * 发光着色器
 */
export const FRAGMENT_GLOW = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;      // Original texture
uniform sampler2D u_blurTexture;  // Blurred texture
uniform float u_intensity;
uniform float u_threshold;
uniform vec3 u_color;

out vec4 fragColor;

void main() {
  vec4 original = texture(u_texture, v_texCoord);
  vec4 blur = texture(u_blurTexture, v_texCoord);

  // Extract bright parts based on threshold
  float luminance = dot(blur.rgb, vec3(0.299, 0.587, 0.114));
  float bright = smoothstep(u_threshold, u_threshold + 0.1, luminance);

  // Apply glow color and intensity
  vec3 glow = blur.rgb * u_color * bright * u_intensity / 100.0;

  // Add glow to original (screen blend)
  vec3 result = original.rgb + glow - original.rgb * glow;

  fragColor = vec4(result, original.a);
}
`;

// =============================================================================
// Fragment Shaders - Keying
// =============================================================================

/**
 * Chroma key shader
 * 色度键（绿幕/蓝幕抠图）着色器
 */
export const FRAGMENT_CHROMA_KEY = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec3 u_keyColor;
uniform float u_similarity;
uniform float u_smoothness;
uniform float u_spillSuppression;

out vec4 fragColor;

// Convert RGB to YCbCr
vec3 rgb2ycbcr(vec3 rgb) {
  float y = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  float cb = 0.5 - 0.168736 * rgb.r - 0.331264 * rgb.g + 0.5 * rgb.b;
  float cr = 0.5 + 0.5 * rgb.r - 0.418688 * rgb.g - 0.081312 * rgb.b;
  return vec3(y, cb, cr);
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);

  // Convert to YCbCr for better chroma matching
  vec3 ycbcr = rgb2ycbcr(color.rgb);
  vec3 keyYcbcr = rgb2ycbcr(u_keyColor);

  // Calculate distance in CbCr space
  float dist = distance(ycbcr.yz, keyYcbcr.yz);

  // Calculate alpha mask
  float similarity = u_similarity / 100.0;
  float smoothness = u_smoothness / 100.0;
  float alpha = smoothstep(similarity - smoothness, similarity + smoothness, dist);

  // Spill suppression - reduce key color contribution
  float spill = u_spillSuppression / 100.0;
  if (spill > 0.0) {
    // Desaturate areas that are close to the key color
    float spillMask = 1.0 - alpha;
    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(color.rgb, vec3(gray), spillMask * spill);
  }

  fragColor = vec4(color.rgb, color.a * alpha);
}
`;

/**
 * Luma key shader
 * 亮度键着色器
 */
export const FRAGMENT_LUMA_KEY = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_threshold;
uniform float u_softness;
uniform bool u_invert;

out vec4 fragColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));

  float threshold = u_threshold / 100.0;
  float softness = max(u_softness / 100.0, 0.001);

  float alpha = smoothstep(threshold - softness, threshold + softness, luma);

  if (u_invert) {
    alpha = 1.0 - alpha;
  }

  fragColor = vec4(color.rgb, color.a * alpha);
}
`;

// =============================================================================
// Fragment Shaders - Mask
// =============================================================================

/**
 * Mask shader - applies mask to texture
 * 蒙版着色器 - 将蒙版应用到纹理
 *
 * Supports rectangle, ellipse, polygon, and bezier mask shapes
 * with feather, expansion, opacity, and invert options
 */
export const FRAGMENT_MASK = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_maskTexture;  // Pre-rendered mask texture (grayscale)
uniform float u_opacity;
uniform bool u_inverted;
uniform int u_blendMode;  // 0=add, 1=subtract, 2=intersect, 3=difference

out vec4 fragColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float mask = texture(u_maskTexture, v_texCoord).r;

  // Apply opacity
  mask *= u_opacity / 100.0;

  // Apply invert
  if (u_inverted) {
    mask = 1.0 - mask;
  }

  // Apply mask to alpha
  fragColor = vec4(color.rgb, color.a * mask);
}
`;

/**
 * Mask generation shader - renders mask shapes to texture
 * 蒙版生成着色器 - 将蒙版形状渲染到纹理
 */
export const FRAGMENT_MASK_GENERATE = `#version 300 es
precision highp float;

in vec2 v_texCoord;

// Mask shape uniforms
uniform int u_shapeType;  // 0=rectangle, 1=ellipse, 2=polygon, 3=bezier
uniform vec2 u_center;    // Normalized (0-1)
uniform vec2 u_size;      // Normalized (0-1)
uniform float u_rotation; // Degrees
uniform float u_cornerRadius; // For rectangle (0-1)
uniform float u_feather;  // Feather amount (0-1)
uniform float u_expansion; // Expansion (-1 to 1)

// Polygon/bezier points (up to 32 points)
uniform int u_pointCount;
uniform vec2 u_points[32];

out vec4 fragColor;

// Rotate point around center
vec2 rotatePoint(vec2 p, vec2 center, float angle) {
  float rad = angle * 3.14159265 / 180.0;
  float c = cos(rad);
  float s = sin(rad);
  vec2 d = p - center;
  return vec2(d.x * c - d.y * s, d.x * s + d.y * c) + center;
}

// SDF for rectangle with rounded corners
float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// SDF for ellipse
float sdEllipse(vec2 p, vec2 r) {
  float k1 = length(p / r);
  float k2 = length(p / (r * r));
  return k1 * (k1 - 1.0) / k2;
}

// Point in polygon test using winding number
float sdPolygon(vec2 p, int n) {
  float d = dot(p - u_points[0], p - u_points[0]);
  float wn = 0.0;

  for (int i = 0; i < 32; i++) {
    if (i >= n) break;
    int j = (i + 1) % n;
    vec2 a = u_points[i];
    vec2 b = u_points[j];

    // Distance to edge
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float dd = dot(pa - ba * h, pa - ba * h);
    d = min(d, dd);

    // Winding number
    if (a.y <= p.y) {
      if (b.y > p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) > 0.0) {
        wn += 1.0;
      }
    } else {
      if (b.y <= p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) < 0.0) {
        wn -= 1.0;
      }
    }
  }

  float sign = wn == 0.0 ? 1.0 : -1.0;
  return sign * sqrt(d);
}

void main() {
  vec2 uv = v_texCoord;
  float mask = 0.0;

  // Apply rotation (inverse to rotate the coordinate system)
  vec2 rotatedUV = rotatePoint(uv, u_center, -u_rotation);

  float sdf = 0.0;

  if (u_shapeType == 0) {
    // Rectangle
    vec2 halfSize = u_size * 0.5 * (1.0 + u_expansion);
    float radius = u_cornerRadius * min(halfSize.x, halfSize.y);
    sdf = sdRoundedBox(rotatedUV - u_center, halfSize, radius);
  } else if (u_shapeType == 1) {
    // Ellipse
    vec2 radius = u_size * 0.5 * (1.0 + u_expansion);
    sdf = sdEllipse(rotatedUV - u_center, radius);
  } else if (u_shapeType == 2 || u_shapeType == 3) {
    // Polygon or Bezier (simplified as polygon)
    sdf = sdPolygon(uv, u_pointCount);
    sdf -= u_expansion * 0.1;  // Apply expansion
  }

  // Apply feather (smooth edge)
  float featherAmount = max(u_feather, 0.001);
  mask = 1.0 - smoothstep(-featherAmount, featherAmount, sdf);

  fragColor = vec4(mask, mask, mask, 1.0);
}
`;

/**
 * Multi-mask compositing shader
 * 多蒙版合成着色器
 *
 * Combines multiple mask textures using blend modes
 */
export const FRAGMENT_MASK_COMPOSITE = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_maskA;
uniform sampler2D u_maskB;
uniform int u_blendMode;  // 0=add, 1=subtract, 2=intersect, 3=difference

out vec4 fragColor;

void main() {
  float a = texture(u_maskA, v_texCoord).r;
  float b = texture(u_maskB, v_texCoord).r;
  float result;

  if (u_blendMode == 0) {
    // Add - union of masks
    result = min(a + b, 1.0);
  } else if (u_blendMode == 1) {
    // Subtract - remove mask B from A
    result = max(a - b, 0.0);
  } else if (u_blendMode == 2) {
    // Intersect - intersection of masks
    result = a * b;
  } else if (u_blendMode == 3) {
    // Difference - XOR of masks
    result = abs(a - b);
  } else {
    result = a;
  }

  fragColor = vec4(result, result, result, 1.0);
}
`;

// =============================================================================
// Fragment Shaders - Transitions
// =============================================================================

/**
 * GPU Transition shader - supports multiple transition types
 * GPU 转场着色器 - 支持多种转场类型
 *
 * Transition types:
 * 0 = none, 1 = fade, 2 = dissolve
 * 3 = slide-left, 4 = slide-right, 5 = slide-up, 6 = slide-down
 * 7 = zoom-in, 8 = zoom-out, 9 = cross-zoom
 * 10 = wipe-left, 11 = wipe-right, 12 = wipe-up, 13 = wipe-down
 * 14 = iris-in, 15 = iris-out
 * 16 = clock-wipe, 17 = clock-wipe-ccw
 * 18 = blinds-horizontal, 19 = blinds-vertical
 * 20 = dip-to-black, 21 = dip-to-white, 22 = dip-to-color
 * 23 = radial-wipe
 */
export const FRAGMENT_TRANSITION = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_fromTexture;  // Source texture (outgoing)
uniform sampler2D u_toTexture;    // Destination texture (incoming)
uniform float u_progress;         // Transition progress (0-1)
uniform int u_transitionType;     // Transition type
uniform float u_softness;         // Edge softness (for wipe transitions)
uniform int u_blindsCount;        // Number of blinds
uniform float u_startAngle;       // Start angle for clock wipe (radians)
uniform vec3 u_dipColor;          // Color for dip-to-color

out vec4 fragColor;

// Constants
const float PI = 3.14159265359;

// Random function for dissolve
float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Smooth step with softness
float softStep(float edge, float x, float softness) {
  return smoothstep(edge - softness, edge + softness, x);
}

void main() {
  vec4 fromColor = texture(u_fromTexture, v_texCoord);
  vec4 toColor = texture(u_toTexture, v_texCoord);
  vec4 result;

  float p = u_progress;
  vec2 uv = v_texCoord;
  float softness = max(u_softness, 0.001);

  if (u_transitionType == 0) {
    // none - show from until halfway, then to
    result = p < 0.5 ? fromColor : toColor;
  }
  else if (u_transitionType == 1) {
    // fade - simple crossfade
    result = mix(fromColor, toColor, p);
  }
  else if (u_transitionType == 2) {
    // dissolve - random pixel transition
    float noise = random(uv * 1000.0);
    result = noise < p ? toColor : fromColor;
  }
  else if (u_transitionType == 3) {
    // slide-left
    float offset = p;
    vec2 fromUV = uv + vec2(offset, 0.0);
    vec2 toUV = uv + vec2(offset - 1.0, 0.0);
    if (uv.x < 1.0 - p) {
      result = texture(u_fromTexture, fromUV);
    } else {
      result = texture(u_toTexture, toUV);
    }
  }
  else if (u_transitionType == 4) {
    // slide-right
    float offset = p;
    vec2 fromUV = uv - vec2(offset, 0.0);
    vec2 toUV = uv - vec2(offset - 1.0, 0.0);
    if (uv.x > p) {
      result = texture(u_fromTexture, fromUV);
    } else {
      result = texture(u_toTexture, toUV);
    }
  }
  else if (u_transitionType == 5) {
    // slide-up
    float offset = p;
    vec2 fromUV = uv + vec2(0.0, offset);
    vec2 toUV = uv + vec2(0.0, offset - 1.0);
    if (uv.y < 1.0 - p) {
      result = texture(u_fromTexture, fromUV);
    } else {
      result = texture(u_toTexture, toUV);
    }
  }
  else if (u_transitionType == 6) {
    // slide-down
    float offset = p;
    vec2 fromUV = uv - vec2(0.0, offset);
    vec2 toUV = uv - vec2(0.0, offset - 1.0);
    if (uv.y > p) {
      result = texture(u_fromTexture, fromUV);
    } else {
      result = texture(u_toTexture, toUV);
    }
  }
  else if (u_transitionType == 7) {
    // zoom-in
    float fromScale = 1.0 + p * 0.2;
    float toScale = 0.8 + p * 0.2;
    vec2 center = vec2(0.5);
    vec2 fromUV = (uv - center) / fromScale + center;
    vec2 toUV = (uv - center) / toScale + center;
    vec4 from = texture(u_fromTexture, fromUV);
    vec4 to = texture(u_toTexture, toUV);
    result = mix(from, to, p);
  }
  else if (u_transitionType == 8) {
    // zoom-out
    float fromScale = 1.0 - p * 0.3;
    vec2 center = vec2(0.5);
    vec2 fromUV = (uv - center) / fromScale + center;
    vec4 from = texture(u_fromTexture, fromUV);
    result = mix(from, toColor, p);
  }
  else if (u_transitionType == 9) {
    // cross-zoom
    float fromScale = 1.0 + p * 0.5;
    float toScale = 0.5 + p * 0.5;
    vec2 center = vec2(0.5);
    vec2 fromUV = (uv - center) / fromScale + center;
    vec2 toUV = (uv - center) / toScale + center;
    vec4 from = texture(u_fromTexture, fromUV);
    vec4 to = texture(u_toTexture, toUV);
    result = mix(from, to, p);
  }
  else if (u_transitionType == 10) {
    // wipe-left
    float edge = 1.0 - p;
    float mask = softStep(edge, uv.x, softness);
    result = mix(fromColor, toColor, mask);
  }
  else if (u_transitionType == 11) {
    // wipe-right
    float edge = p;
    float mask = softStep(edge, 1.0 - uv.x, softness);
    result = mix(fromColor, toColor, mask);
  }
  else if (u_transitionType == 12) {
    // wipe-up
    float edge = 1.0 - p;
    float mask = softStep(edge, uv.y, softness);
    result = mix(fromColor, toColor, mask);
  }
  else if (u_transitionType == 13) {
    // wipe-down
    float edge = p;
    float mask = softStep(edge, 1.0 - uv.y, softness);
    result = mix(fromColor, toColor, mask);
  }
  else if (u_transitionType == 14) {
    // iris-in (circle expanding from center)
    float dist = length(uv - vec2(0.5)) * 2.0;
    float maxDist = 1.414; // sqrt(2)
    float radius = p * maxDist;
    float mask = softStep(radius, dist, softness);
    result = mix(toColor, fromColor, mask);
  }
  else if (u_transitionType == 15) {
    // iris-out (circle contracting to center)
    float dist = length(uv - vec2(0.5)) * 2.0;
    float maxDist = 1.414;
    float radius = (1.0 - p) * maxDist;
    float mask = softStep(radius, dist, softness);
    result = mix(fromColor, toColor, mask);
  }
  else if (u_transitionType == 16) {
    // clock-wipe (clockwise)
    vec2 center = vec2(0.5);
    vec2 dir = uv - center;
    float angle = atan(dir.y, dir.x) + PI; // 0 to 2*PI
    float startAngle = u_startAngle;
    float endAngle = startAngle + p * 2.0 * PI;
    float normalizedAngle = mod(angle - startAngle, 2.0 * PI);
    float mask = step(normalizedAngle, p * 2.0 * PI);
    result = mix(fromColor, toColor, mask);
  }
  else if (u_transitionType == 17) {
    // clock-wipe-ccw (counter-clockwise)
    vec2 center = vec2(0.5);
    vec2 dir = uv - center;
    float angle = atan(dir.y, dir.x) + PI;
    float startAngle = u_startAngle;
    float normalizedAngle = mod(startAngle - angle, 2.0 * PI);
    float mask = step(normalizedAngle, p * 2.0 * PI);
    result = mix(fromColor, toColor, mask);
  }
  else if (u_transitionType == 18) {
    // blinds-horizontal
    float blinds = float(u_blindsCount);
    float blindPos = fract(uv.y * blinds);
    float mask = step(blindPos, p);
    result = mix(fromColor, toColor, mask);
  }
  else if (u_transitionType == 19) {
    // blinds-vertical
    float blinds = float(u_blindsCount);
    float blindPos = fract(uv.x * blinds);
    float mask = step(blindPos, p);
    result = mix(fromColor, toColor, mask);
  }
  else if (u_transitionType == 20) {
    // dip-to-black
    vec4 black = vec4(0.0, 0.0, 0.0, 1.0);
    if (p < 0.5) {
      float t = p * 2.0;
      result = mix(fromColor, black, t);
    } else {
      float t = (p - 0.5) * 2.0;
      result = mix(black, toColor, t);
    }
  }
  else if (u_transitionType == 21) {
    // dip-to-white
    vec4 white = vec4(1.0, 1.0, 1.0, 1.0);
    if (p < 0.5) {
      float t = p * 2.0;
      result = mix(fromColor, white, t);
    } else {
      float t = (p - 0.5) * 2.0;
      result = mix(white, toColor, t);
    }
  }
  else if (u_transitionType == 22) {
    // dip-to-color
    vec4 dipColor = vec4(u_dipColor, 1.0);
    if (p < 0.5) {
      float t = p * 2.0;
      result = mix(fromColor, dipColor, t);
    } else {
      float t = (p - 0.5) * 2.0;
      result = mix(dipColor, toColor, t);
    }
  }
  else if (u_transitionType == 23) {
    // radial-wipe (same as iris-in)
    float dist = length(uv - vec2(0.5)) * 2.0;
    float maxDist = 1.414;
    float radius = p * maxDist;
    float mask = softStep(radius, dist, softness);
    result = mix(toColor, fromColor, mask);
  }
  else {
    // default: fade
    result = mix(fromColor, toColor, p);
  }

  fragColor = result;
}
`;

// =============================================================================
// Fragment Shaders - Additional Effects
// =============================================================================

/**
 * Sharpen shader (Unsharp Mask)
 * 锐化着色器（反锐化蒙版算法）
 *
 * Parameters:
 * - u_amount: Sharpening strength (0-5, default 1)
 * - u_radius: Blur radius for mask (pixels, default 1)
 * - u_threshold: Edge threshold (0-1, default 0)
 */
export const FRAGMENT_SHARPEN = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_amount;
uniform float u_radius;
uniform float u_threshold;

out vec4 fragColor;

void main() {
  vec2 texelSize = 1.0 / u_resolution;
  vec2 offset = texelSize * u_radius;

  // Sample center and neighbors
  vec4 center = texture(u_texture, v_texCoord);
  vec4 top = texture(u_texture, v_texCoord + vec2(0.0, offset.y));
  vec4 bottom = texture(u_texture, v_texCoord - vec2(0.0, offset.y));
  vec4 left = texture(u_texture, v_texCoord - vec2(offset.x, 0.0));
  vec4 right = texture(u_texture, v_texCoord + vec2(offset.x, 0.0));

  // Simple box blur for unsharp mask
  vec4 blur = (top + bottom + left + right) * 0.25;

  // Calculate difference (high-pass)
  vec4 diff = center - blur;

  // Apply threshold
  float diffLength = length(diff.rgb);
  float mask = smoothstep(u_threshold * 0.5, u_threshold, diffLength);

  // Apply sharpening
  vec4 sharpened = center + diff * u_amount * mask;

  fragColor = clamp(sharpened, 0.0, 1.0);
}
`;

/**
 * Motion Blur shader
 * 运动模糊着色器
 *
 * Parameters:
 * - u_angle: Motion direction in degrees (0-360)
 * - u_distance: Blur distance in pixels (0-100)
 * - u_samples: Number of samples (default 15)
 */
export const FRAGMENT_MOTION_BLUR = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_angle;
uniform float u_distance;
uniform int u_samples;

out vec4 fragColor;

void main() {
  float radians = u_angle * 3.14159265 / 180.0;
  vec2 dir = vec2(cos(radians), sin(radians)) * u_distance / u_resolution;

  int samples = max(1, u_samples);
  vec4 color = vec4(0.0);

  for (int i = 0; i < 32; i++) { // max 32 samples
    if (i >= samples) break;

    float t = float(i) / float(samples - 1) - 0.5;
    vec2 offset = dir * t;
    color += texture(u_texture, v_texCoord + offset);
  }

  fragColor = color / float(samples);
}
`;

/**
 * Radial Blur shader
 * 径向模糊着色器
 *
 * Parameters:
 * - u_centerX, u_centerY: Blur center (0-1, default 0.5)
 * - u_amount: Blur strength (0-1, default 0.5)
 * - u_type: 0 = spin (rotate), 1 = zoom (radial)
 * - u_samples: Number of samples (default 15)
 */
export const FRAGMENT_RADIAL_BLUR = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_centerX;
uniform float u_centerY;
uniform float u_amount;
uniform int u_type;
uniform int u_samples;

out vec4 fragColor;

void main() {
  vec2 center = vec2(u_centerX, u_centerY);
  vec2 toCenter = v_texCoord - center;
  float dist = length(toCenter);

  int samples = max(1, u_samples);
  vec4 color = vec4(0.0);

  if (u_type == 0) {
    // Spin (rotational) blur
    float angleStep = u_amount * 0.1 / float(samples);

    for (int i = 0; i < 32; i++) {
      if (i >= samples) break;

      float angle = angleStep * float(i - samples / 2);
      float s = sin(angle);
      float c = cos(angle);
      vec2 rotated = vec2(
        toCenter.x * c - toCenter.y * s,
        toCenter.x * s + toCenter.y * c
      );
      color += texture(u_texture, center + rotated);
    }
  } else {
    // Zoom (radial) blur
    for (int i = 0; i < 32; i++) {
      if (i >= samples) break;

      float t = 1.0 + u_amount * (float(i) / float(samples) - 0.5) * 0.1;
      vec2 samplePos = center + toCenter * t;
      color += texture(u_texture, samplePos);
    }
  }

  fragColor = color / float(samples);
}
`;

/**
 * Curves adjustment shader
 * 曲线调整着色器
 *
 * Uses a 1D LUT texture for RGB + Master curves
 * Parameters:
 * - u_curveLUT: 256x4 texture (R, G, B, Master curves)
 * - u_intensity: Effect intensity (0-1, default 1)
 */
export const FRAGMENT_CURVES = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_curveLUT;
uniform float u_intensity;
uniform bool u_hasCurveLUT;

out vec4 fragColor;

// Apply single curve from LUT
float applyCurve(float value, float channel) {
  // Channel: 0=R, 1=G, 2=B, 3=Master
  vec2 lutCoord = vec2(value, (channel + 0.5) / 4.0);
  return texture(u_curveLUT, lutCoord).r;
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);

  if (!u_hasCurveLUT) {
    fragColor = color;
    return;
  }

  // Apply individual RGB curves
  float r = applyCurve(color.r, 0.0);
  float g = applyCurve(color.g, 1.0);
  float b = applyCurve(color.b, 2.0);

  // Apply master curve to all channels
  r = applyCurve(r, 3.0);
  g = applyCurve(g, 3.0);
  b = applyCurve(b, 3.0);

  // Mix with original based on intensity
  vec3 curved = vec3(r, g, b);
  vec3 result = mix(color.rgb, curved, u_intensity);

  fragColor = vec4(result, color.a);
}
`;

/**
 * HSL adjustment shader
 * HSL 调整着色器
 *
 * Parameters:
 * - u_hueShift: Hue rotation (-180 to 180 degrees)
 * - u_saturation: Saturation adjustment (-100 to 100)
 * - u_lightness: Lightness adjustment (-100 to 100)
 */
export const FRAGMENT_HSL = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_hueShift;
uniform float u_saturation;
uniform float u_lightness;

out vec4 fragColor;

vec3 rgb2hsl(vec3 color) {
  float maxC = max(max(color.r, color.g), color.b);
  float minC = min(min(color.r, color.g), color.b);
  float delta = maxC - minC;

  float h = 0.0;
  float s = 0.0;
  float l = (maxC + minC) / 2.0;

  if (delta > 0.0001) {
    s = l < 0.5 ? delta / (maxC + minC) : delta / (2.0 - maxC - minC);

    if (maxC == color.r) {
      h = (color.g - color.b) / delta + (color.g < color.b ? 6.0 : 0.0);
    } else if (maxC == color.g) {
      h = (color.b - color.r) / delta + 2.0;
    } else {
      h = (color.r - color.g) / delta + 4.0;
    }
    h /= 6.0;
  }

  return vec3(h, s, l);
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
  vec3 rgb;

  if (hsl.y == 0.0) {
    rgb = vec3(hsl.z);
  } else {
    float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
    float p = 2.0 * hsl.z - q;
    rgb.r = hue2rgb(p, q, hsl.x + 1.0/3.0);
    rgb.g = hue2rgb(p, q, hsl.x);
    rgb.b = hue2rgb(p, q, hsl.x - 1.0/3.0);
  }

  return rgb;
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  vec3 hsl = rgb2hsl(color.rgb);

  // Apply adjustments
  hsl.x = fract(hsl.x + u_hueShift / 360.0);
  hsl.y = clamp(hsl.y * (1.0 + u_saturation / 100.0), 0.0, 1.0);
  hsl.z = clamp(hsl.z + u_lightness / 100.0, 0.0, 1.0);

  vec3 result = hsl2rgb(hsl);
  fragColor = vec4(result, color.a);
}
`;

// =============================================================================
// Shader Registry
// =============================================================================

export interface ShaderDefinition {
  name: string;
  vertex: string;
  fragment: string;
}

export const SHADER_DEFINITIONS: ShaderDefinition[] = [
  { name: 'basic', vertex: VERTEX_QUAD, fragment: FRAGMENT_BASIC },
  { name: 'solid', vertex: VERTEX_PASSTHROUGH, fragment: FRAGMENT_SOLID },
  { name: 'colorCorrection', vertex: VERTEX_QUAD, fragment: FRAGMENT_COLOR_CORRECTION },
  { name: 'blend', vertex: VERTEX_PASSTHROUGH, fragment: FRAGMENT_BLEND },
  { name: 'gaussianBlur', vertex: VERTEX_PASSTHROUGH, fragment: FRAGMENT_GAUSSIAN_BLUR },
  { name: 'vignette', vertex: VERTEX_QUAD, fragment: FRAGMENT_VIGNETTE },
  { name: 'chromaticAberration', vertex: VERTEX_QUAD, fragment: FRAGMENT_CHROMATIC_ABERRATION },
  { name: 'noise', vertex: VERTEX_QUAD, fragment: FRAGMENT_NOISE },
  { name: 'glow', vertex: VERTEX_PASSTHROUGH, fragment: FRAGMENT_GLOW },
  { name: 'chromaKey', vertex: VERTEX_QUAD, fragment: FRAGMENT_CHROMA_KEY },
  { name: 'lumaKey', vertex: VERTEX_QUAD, fragment: FRAGMENT_LUMA_KEY },
  { name: 'mask', vertex: VERTEX_QUAD, fragment: FRAGMENT_MASK },
  { name: 'maskGenerate', vertex: VERTEX_PASSTHROUGH, fragment: FRAGMENT_MASK_GENERATE },
  { name: 'maskComposite', vertex: VERTEX_PASSTHROUGH, fragment: FRAGMENT_MASK_COMPOSITE },
  { name: 'transition', vertex: VERTEX_PASSTHROUGH, fragment: FRAGMENT_TRANSITION },
  // Additional effects
  { name: 'sharpen', vertex: VERTEX_QUAD, fragment: FRAGMENT_SHARPEN },
  { name: 'motionBlur', vertex: VERTEX_PASSTHROUGH, fragment: FRAGMENT_MOTION_BLUR },
  { name: 'radialBlur', vertex: VERTEX_PASSTHROUGH, fragment: FRAGMENT_RADIAL_BLUR },
  { name: 'curves', vertex: VERTEX_QUAD, fragment: FRAGMENT_CURVES },
  { name: 'hsl', vertex: VERTEX_QUAD, fragment: FRAGMENT_HSL },
];
