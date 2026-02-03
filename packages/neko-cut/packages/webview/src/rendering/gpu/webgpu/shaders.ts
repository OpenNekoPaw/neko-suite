/**
 * WGSL Shaders - WebGPU 着色器
 * WGSL shaders for WebGPU compositor
 */

// =============================================================================
// Basic Shader - 基础渲染着色器
// =============================================================================

/**
 * 基础顶点/片段着色器
 * 用于纹理渲染和基本变换
 */
export const basicShader = /* wgsl */ `
// Vertex shader uniforms
struct TransformUniforms {
  mvpMatrix: mat4x4f,
  opacity: f32,
  _padding: vec3f,
}

@group(0) @binding(0) var<uniform> transform: TransformUniforms;
@group(0) @binding(1) var textureSampler: sampler;
@group(0) @binding(2) var textureData: texture_2d<f32>;

// Vertex input/output
struct VertexInput {
  @location(0) position: vec2f,
  @location(1) texCoord: vec2f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texCoord: vec2f,
}

// Vertex shader
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = transform.mvpMatrix * vec4f(input.position, 0.0, 1.0);
  output.texCoord = input.texCoord;
  return output;
}

// Fragment shader
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(textureData, textureSampler, input.texCoord);
  return vec4f(color.rgb, color.a * transform.opacity);
}
`;

// =============================================================================
// Color Correction Shader - 颜色校正着色器
// =============================================================================

/**
 * 颜色校正着色器
 * 支持亮度、对比度、饱和度、色温、色调调整
 */
export const colorCorrectionShader = /* wgsl */ `
struct TransformUniforms {
  mvpMatrix: mat4x4f,
  opacity: f32,
  _padding: vec3f,
}

struct ColorCorrectionUniforms {
  exposure: f32,      // -5 to 5 (EV stops)
  contrast: f32,      // -100 to 100 -> normalized to -1 to 1
  saturation: f32,    // -100 to 100 -> normalized to -1 to 1
  temperature: f32,   // -100 to 100 -> normalized to -1 to 1
  tint: f32,          // -100 to 100 -> normalized to -1 to 1
  vibrance: f32,      // -100 to 100 -> normalized to -1 to 1
  highlights: f32,    // -100 to 100 -> normalized to -1 to 1
  shadows: f32,       // -100 to 100 -> normalized to -1 to 1
  whites: f32,        // -100 to 100 -> normalized to -1 to 1
  blacks: f32,        // -100 to 100 -> normalized to -1 to 1
  _padding: vec2f,
}

@group(0) @binding(0) var<uniform> transform: TransformUniforms;
@group(0) @binding(1) var textureSampler: sampler;
@group(0) @binding(2) var textureData: texture_2d<f32>;
@group(0) @binding(3) var<uniform> colorCorrection: ColorCorrectionUniforms;

struct VertexInput {
  @location(0) position: vec2f,
  @location(1) texCoord: vec2f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texCoord: vec2f,
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = transform.mvpMatrix * vec4f(input.position, 0.0, 1.0);
  output.texCoord = input.texCoord;
  return output;
}

// RGB to HSL conversion
fn rgbToHsl(rgb: vec3f) -> vec3f {
  let maxC = max(max(rgb.r, rgb.g), rgb.b);
  let minC = min(min(rgb.r, rgb.g), rgb.b);
  let delta = maxC - minC;

  var h: f32 = 0.0;
  var s: f32 = 0.0;
  let l = (maxC + minC) / 2.0;

  if (delta > 0.0001) {
    s = select(delta / (2.0 - maxC - minC), delta / (maxC + minC), l < 0.5);

    if (maxC == rgb.r) {
      h = (rgb.g - rgb.b) / delta + select(0.0, 6.0, rgb.g < rgb.b);
    } else if (maxC == rgb.g) {
      h = (rgb.b - rgb.r) / delta + 2.0;
    } else {
      h = (rgb.r - rgb.g) / delta + 4.0;
    }
    h /= 6.0;
  }

  return vec3f(h, s, l);
}

// Helper for HSL to RGB
fn hueToRgb(p: f32, q: f32, t: f32) -> f32 {
  var tt = t;
  if (tt < 0.0) { tt += 1.0; }
  if (tt > 1.0) { tt -= 1.0; }
  if (tt < 1.0 / 6.0) { return p + (q - p) * 6.0 * tt; }
  if (tt < 1.0 / 2.0) { return q; }
  if (tt < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - tt) * 6.0; }
  return p;
}

// HSL to RGB conversion
fn hslToRgb(hsl: vec3f) -> vec3f {
  if (hsl.y < 0.0001) {
    return vec3f(hsl.z);
  }

  let q = select(hsl.z + hsl.y - hsl.z * hsl.y, hsl.z * (1.0 + hsl.y), hsl.z < 0.5);
  let p = 2.0 * hsl.z - q;

  return vec3f(
    hueToRgb(p, q, hsl.x + 1.0 / 3.0),
    hueToRgb(p, q, hsl.x),
    hueToRgb(p, q, hsl.x - 1.0 / 3.0)
  );
}

// Apply color temperature (Kelvin approximation)
fn applyTemperature(color: vec3f, temp: f32) -> vec3f {
  // Warm: increase red, decrease blue
  // Cool: decrease red, increase blue
  let warmCool = temp * 0.3;
  return vec3f(
    color.r + warmCool,
    color.g,
    color.b - warmCool
  );
}

// Apply tint (green-magenta axis)
fn applyTint(color: vec3f, tint: f32) -> vec3f {
  let greenMagenta = tint * 0.3;
  return vec3f(
    color.r + greenMagenta * 0.5,
    color.g - greenMagenta,
    color.b + greenMagenta * 0.5
  );
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  var color = textureSample(textureData, textureSampler, input.texCoord);
  var rgb = color.rgb;

  // Normalize parameters from -100..100 to -1..1 range
  let contrast = colorCorrection.contrast / 100.0;
  let saturation = colorCorrection.saturation / 100.0;
  let temperature = colorCorrection.temperature / 100.0;
  let tint = colorCorrection.tint / 100.0;
  let vibrance = colorCorrection.vibrance / 100.0;
  let highlights = colorCorrection.highlights / 100.0;
  let shadows = colorCorrection.shadows / 100.0;
  let whites = colorCorrection.whites / 100.0;
  let blacks = colorCorrection.blacks / 100.0;

  // Exposure (EV stops) - exposure is already in -5..5 range
  rgb = rgb * pow(2.0, colorCorrection.exposure);

  // Contrast
  rgb = (rgb - 0.5) * (1.0 + contrast) + 0.5;

  // Blacks and Whites (lift/gain adjustments)
  rgb = rgb + blacks * (1.0 - rgb); // Lift blacks
  rgb = rgb * (1.0 + whites);        // Gain for whites

  // Saturation and Vibrance using HSL
  var hsl = rgbToHsl(rgb);

  // Saturation: uniform adjustment
  hsl.y = clamp(hsl.y * (1.0 + saturation), 0.0, 1.0);

  // Vibrance: smart saturation that affects less saturated colors more
  let vibranceAmount = vibrance * (1.0 - hsl.y);
  hsl.y = clamp(hsl.y + vibranceAmount, 0.0, 1.0);

  rgb = hslToRgb(hsl);

  // Temperature and tint
  rgb = applyTemperature(rgb, temperature);
  rgb = applyTint(rgb, tint);

  // Highlights and shadows (tone mapping)
  let luminance = dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
  let highlightMask = smoothstep(0.5, 1.0, luminance);
  let shadowMask = 1.0 - smoothstep(0.0, 0.5, luminance);

  rgb = rgb + rgb * highlightMask * highlights;
  rgb = rgb + rgb * shadowMask * shadows;

  // Clamp output
  rgb = clamp(rgb, vec3f(0.0), vec3f(1.0));

  return vec4f(rgb, color.a * transform.opacity);
}
`;

// =============================================================================
// Blend Mode Shaders - 混合模式着色器
// =============================================================================

/**
 * 混合模式通用着色器
 * 支持 24 种 Photoshop 风格混合模式
 */
export const blendModeShader = /* wgsl */ `
struct TransformUniforms {
  mvpMatrix: mat4x4f,
  opacity: f32,
  blendMode: u32,
  _padding: vec2f,
}

@group(0) @binding(0) var<uniform> transform: TransformUniforms;
@group(0) @binding(1) var textureSampler: sampler;
@group(0) @binding(2) var sourceTexture: texture_2d<f32>;
@group(0) @binding(3) var destTexture: texture_2d<f32>;

struct VertexInput {
  @location(0) position: vec2f,
  @location(1) texCoord: vec2f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texCoord: vec2f,
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = transform.mvpMatrix * vec4f(input.position, 0.0, 1.0);
  output.texCoord = input.texCoord;
  return output;
}

// Blend mode constants
const BLEND_NORMAL: u32 = 0u;
const BLEND_MULTIPLY: u32 = 1u;
const BLEND_SCREEN: u32 = 2u;
const BLEND_OVERLAY: u32 = 3u;
const BLEND_DARKEN: u32 = 4u;
const BLEND_LIGHTEN: u32 = 5u;
const BLEND_COLOR_DODGE: u32 = 6u;
const BLEND_COLOR_BURN: u32 = 7u;
const BLEND_HARD_LIGHT: u32 = 8u;
const BLEND_SOFT_LIGHT: u32 = 9u;
const BLEND_DIFFERENCE: u32 = 10u;
const BLEND_EXCLUSION: u32 = 11u;
const BLEND_HUE: u32 = 12u;
const BLEND_SATURATION: u32 = 13u;
const BLEND_COLOR: u32 = 14u;
const BLEND_LUMINOSITY: u32 = 15u;
const BLEND_ADD: u32 = 16u;
const BLEND_SUBTRACT: u32 = 17u;
const BLEND_DIVIDE: u32 = 18u;
const BLEND_LINEAR_BURN: u32 = 19u;
const BLEND_LINEAR_DODGE: u32 = 20u;
const BLEND_VIVID_LIGHT: u32 = 21u;
const BLEND_LINEAR_LIGHT: u32 = 22u;
const BLEND_PIN_LIGHT: u32 = 23u;

// RGB to HSL
fn rgbToHsl(rgb: vec3f) -> vec3f {
  let maxC = max(max(rgb.r, rgb.g), rgb.b);
  let minC = min(min(rgb.r, rgb.g), rgb.b);
  let delta = maxC - minC;

  var h: f32 = 0.0;
  var s: f32 = 0.0;
  let l = (maxC + minC) / 2.0;

  if (delta > 0.0001) {
    s = select(delta / (2.0 - maxC - minC), delta / (maxC + minC), l < 0.5);
    if (maxC == rgb.r) {
      h = (rgb.g - rgb.b) / delta + select(0.0, 6.0, rgb.g < rgb.b);
    } else if (maxC == rgb.g) {
      h = (rgb.b - rgb.r) / delta + 2.0;
    } else {
      h = (rgb.r - rgb.g) / delta + 4.0;
    }
    h /= 6.0;
  }
  return vec3f(h, s, l);
}

fn hueToRgb(p: f32, q: f32, t: f32) -> f32 {
  var tt = t;
  if (tt < 0.0) { tt += 1.0; }
  if (tt > 1.0) { tt -= 1.0; }
  if (tt < 1.0 / 6.0) { return p + (q - p) * 6.0 * tt; }
  if (tt < 1.0 / 2.0) { return q; }
  if (tt < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - tt) * 6.0; }
  return p;
}

fn hslToRgb(hsl: vec3f) -> vec3f {
  if (hsl.y < 0.0001) { return vec3f(hsl.z); }
  let q = select(hsl.z + hsl.y - hsl.z * hsl.y, hsl.z * (1.0 + hsl.y), hsl.z < 0.5);
  let p = 2.0 * hsl.z - q;
  return vec3f(
    hueToRgb(p, q, hsl.x + 1.0 / 3.0),
    hueToRgb(p, q, hsl.x),
    hueToRgb(p, q, hsl.x - 1.0 / 3.0)
  );
}

// Blend functions
fn blendOverlay(base: f32, blend: f32) -> f32 {
  return select(1.0 - 2.0 * (1.0 - base) * (1.0 - blend), 2.0 * base * blend, base < 0.5);
}

fn blendSoftLight(base: f32, blend: f32) -> f32 {
  return select(
    base + (2.0 * blend - 1.0) * (sqrt(base) - base),
    base - (1.0 - 2.0 * blend) * base * (1.0 - base),
    blend < 0.5
  );
}

fn blendColorDodge(base: f32, blend: f32) -> f32 {
  return select(min(1.0, base / (1.0 - blend)), 0.0, blend >= 1.0);
}

fn blendColorBurn(base: f32, blend: f32) -> f32 {
  return select(1.0 - min(1.0, (1.0 - base) / blend), 1.0, blend <= 0.0);
}

fn blendVividLight(base: f32, blend: f32) -> f32 {
  return select(blendColorDodge(base, 2.0 * (blend - 0.5)), blendColorBurn(base, 2.0 * blend), blend < 0.5);
}

fn blendLinearLight(base: f32, blend: f32) -> f32 {
  return select(base + 2.0 * (blend - 0.5), base + 2.0 * blend - 1.0, blend < 0.5);
}

fn blendPinLight(base: f32, blend: f32) -> f32 {
  return select(max(base, 2.0 * (blend - 0.5)), min(base, 2.0 * blend), blend < 0.5);
}

fn applyBlend(base: vec3f, blend: vec3f, mode: u32) -> vec3f {
  switch (mode) {
    case BLEND_NORMAL: { return blend; }
    case BLEND_MULTIPLY: { return base * blend; }
    case BLEND_SCREEN: { return 1.0 - (1.0 - base) * (1.0 - blend); }
    case BLEND_OVERLAY: {
      return vec3f(
        blendOverlay(base.r, blend.r),
        blendOverlay(base.g, blend.g),
        blendOverlay(base.b, blend.b)
      );
    }
    case BLEND_DARKEN: { return min(base, blend); }
    case BLEND_LIGHTEN: { return max(base, blend); }
    case BLEND_COLOR_DODGE: {
      return vec3f(
        blendColorDodge(base.r, blend.r),
        blendColorDodge(base.g, blend.g),
        blendColorDodge(base.b, blend.b)
      );
    }
    case BLEND_COLOR_BURN: {
      return vec3f(
        blendColorBurn(base.r, blend.r),
        blendColorBurn(base.g, blend.g),
        blendColorBurn(base.b, blend.b)
      );
    }
    case BLEND_HARD_LIGHT: {
      return vec3f(
        blendOverlay(blend.r, base.r),
        blendOverlay(blend.g, base.g),
        blendOverlay(blend.b, base.b)
      );
    }
    case BLEND_SOFT_LIGHT: {
      return vec3f(
        blendSoftLight(base.r, blend.r),
        blendSoftLight(base.g, blend.g),
        blendSoftLight(base.b, blend.b)
      );
    }
    case BLEND_DIFFERENCE: { return abs(base - blend); }
    case BLEND_EXCLUSION: { return base + blend - 2.0 * base * blend; }
    case BLEND_HUE: {
      let baseHsl = rgbToHsl(base);
      let blendHsl = rgbToHsl(blend);
      return hslToRgb(vec3f(blendHsl.x, baseHsl.y, baseHsl.z));
    }
    case BLEND_SATURATION: {
      let baseHsl = rgbToHsl(base);
      let blendHsl = rgbToHsl(blend);
      return hslToRgb(vec3f(baseHsl.x, blendHsl.y, baseHsl.z));
    }
    case BLEND_COLOR: {
      let baseHsl = rgbToHsl(base);
      let blendHsl = rgbToHsl(blend);
      return hslToRgb(vec3f(blendHsl.x, blendHsl.y, baseHsl.z));
    }
    case BLEND_LUMINOSITY: {
      let baseHsl = rgbToHsl(base);
      let blendHsl = rgbToHsl(blend);
      return hslToRgb(vec3f(baseHsl.x, baseHsl.y, blendHsl.z));
    }
    case BLEND_ADD: { return min(base + blend, vec3f(1.0)); }
    case BLEND_SUBTRACT: { return max(base - blend, vec3f(0.0)); }
    case BLEND_DIVIDE: { return select(base / blend, vec3f(1.0), blend == vec3f(0.0)); }
    case BLEND_LINEAR_BURN: { return max(base + blend - 1.0, vec3f(0.0)); }
    case BLEND_LINEAR_DODGE: { return min(base + blend, vec3f(1.0)); }
    case BLEND_VIVID_LIGHT: {
      return vec3f(
        blendVividLight(base.r, blend.r),
        blendVividLight(base.g, blend.g),
        blendVividLight(base.b, blend.b)
      );
    }
    case BLEND_LINEAR_LIGHT: {
      return clamp(vec3f(
        blendLinearLight(base.r, blend.r),
        blendLinearLight(base.g, blend.g),
        blendLinearLight(base.b, blend.b)
      ), vec3f(0.0), vec3f(1.0));
    }
    case BLEND_PIN_LIGHT: {
      return vec3f(
        blendPinLight(base.r, blend.r),
        blendPinLight(base.g, blend.g),
        blendPinLight(base.b, blend.b)
      );
    }
    default: { return blend; }
  }
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let source = textureSample(sourceTexture, textureSampler, input.texCoord);
  let dest = textureSample(destTexture, textureSampler, input.texCoord);

  // Apply blend mode
  let blended = applyBlend(dest.rgb, source.rgb, transform.blendMode);

  // Alpha compositing with opacity
  let alpha = source.a * transform.opacity;
  let result = mix(dest.rgb, blended, alpha);
  let outAlpha = alpha + dest.a * (1.0 - alpha);

  return vec4f(result, outAlpha);
}
`;

// =============================================================================
// Utility Shaders
// =============================================================================

/**
 * 全屏四边形着色器 (用于后处理)
 */
export const fullscreenQuadShader = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texCoord: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Generate fullscreen triangle
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );

  var texCoords = array<vec2f, 3>(
    vec2f(0.0, 1.0),
    vec2f(2.0, 1.0),
    vec2f(0.0, -1.0)
  );

  var output: VertexOutput;
  output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  output.texCoord = texCoords[vertexIndex];
  return output;
}

@group(0) @binding(0) var textureSampler: sampler;
@group(0) @binding(1) var textureData: texture_2d<f32>;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return textureSample(textureData, textureSampler, input.texCoord);
}
`;

/**
 * Blit shader for canvas output
 * When canvas format is BGRA and we're rendering from RGBA texture,
 * we need to swap R and B channels for correct color output.
 * This is used by the blit pipeline to copy composite texture to canvas.
 */
export const blitShader = /* wgsl */ `
// Vertex shader uniforms
struct TransformUniforms {
  mvpMatrix: mat4x4f,
  opacity: f32,
  _padding: vec3f,
}

@group(0) @binding(0) var<uniform> transform: TransformUniforms;
@group(0) @binding(1) var textureSampler: sampler;
@group(0) @binding(2) var textureData: texture_2d<f32>;

// Vertex input/output
struct VertexInput {
  @location(0) position: vec2f,
  @location(1) texCoord: vec2f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texCoord: vec2f,
}

// Vertex shader
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = transform.mvpMatrix * vec4f(input.position, 0.0, 1.0);
  output.texCoord = input.texCoord;
  return output;
}

// Fragment shader - swap R and B channels for BGRA canvas format
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(textureData, textureSampler, input.texCoord);
  // Swap R and B channels: output BGRA when canvas expects BGRA
  // This fixes color inversion when exporting to JPEG
  return vec4f(color.b, color.g, color.r, color.a * transform.opacity);
}
`;

/**
 * 清屏着色器
 */
export const clearShader = /* wgsl */ `
struct ClearColor {
  color: vec4f,
}

@group(0) @binding(0) var<uniform> clearColor: ClearColor;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  return vec4f(positions[vertexIndex], 0.0, 1.0);
}

@fragment
fn fragmentMain() -> @location(0) vec4f {
  return clearColor.color;
}
`;

// =============================================================================
// Transition Shader - 转场着色器
// =============================================================================

/**
 * GPU 转场着色器
 * 支持 24 种转场效果，包括淡入淡出、擦除、滑动、缩放、时钟擦除等
 */
// =============================================================================
// External Texture Shaders - 零拷贝 VideoFrame 着色器
// =============================================================================

/**
 * External Texture 基础着色器
 * 用于 VideoFrame 零拷贝渲染（importExternalTexture）
 *
 * 关键差异：
 * - binding(2) 使用 texture_external 而非 texture_2d<f32>
 * - 采样使用 textureSampleBaseClampToEdge 而非 textureSample
 */
export const externalTextureShader = /* wgsl */ `
// Vertex shader uniforms
struct TransformUniforms {
  mvpMatrix: mat4x4f,
  opacity: f32,
  _padding: vec3f,
}

@group(0) @binding(0) var<uniform> transform: TransformUniforms;
@group(0) @binding(1) var textureSampler: sampler;
@group(0) @binding(2) var textureData: texture_external;

// Vertex input/output
struct VertexInput {
  @location(0) position: vec2f,
  @location(1) texCoord: vec2f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texCoord: vec2f,
}

// Vertex shader
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = transform.mvpMatrix * vec4f(input.position, 0.0, 1.0);
  output.texCoord = input.texCoord;
  return output;
}

// Fragment shader - uses textureSampleBaseClampToEdge for external texture
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSampleBaseClampToEdge(textureData, textureSampler, input.texCoord);
  return vec4f(color.rgb, color.a * transform.opacity);
}
`;

/**
 * External Texture + 颜色校正着色器
 * 用于带颜色校正的 VideoFrame 零拷贝渲染
 */
export const externalTextureColorCorrectionShader = /* wgsl */ `
struct TransformUniforms {
  mvpMatrix: mat4x4f,
  opacity: f32,
  _padding: vec3f,
}

struct ColorCorrectionUniforms {
  exposure: f32,      // -5 to 5 (EV stops)
  contrast: f32,      // -100 to 100 -> normalized to -1 to 1
  saturation: f32,    // -100 to 100 -> normalized to -1 to 1
  temperature: f32,   // -100 to 100 -> normalized to -1 to 1
  tint: f32,          // -100 to 100 -> normalized to -1 to 1
  vibrance: f32,      // -100 to 100 -> normalized to -1 to 1
  highlights: f32,    // -100 to 100 -> normalized to -1 to 1
  shadows: f32,       // -100 to 100 -> normalized to -1 to 1
  whites: f32,        // -100 to 100 -> normalized to -1 to 1
  blacks: f32,        // -100 to 100 -> normalized to -1 to 1
  _padding: vec2f,
}

@group(0) @binding(0) var<uniform> transform: TransformUniforms;
@group(0) @binding(1) var textureSampler: sampler;
@group(0) @binding(2) var textureData: texture_external;
@group(0) @binding(3) var<uniform> colorCorrection: ColorCorrectionUniforms;

struct VertexInput {
  @location(0) position: vec2f,
  @location(1) texCoord: vec2f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texCoord: vec2f,
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = transform.mvpMatrix * vec4f(input.position, 0.0, 1.0);
  output.texCoord = input.texCoord;
  return output;
}

// RGB to HSL conversion
fn rgbToHsl(rgb: vec3f) -> vec3f {
  let maxC = max(max(rgb.r, rgb.g), rgb.b);
  let minC = min(min(rgb.r, rgb.g), rgb.b);
  let delta = maxC - minC;

  var h: f32 = 0.0;
  var s: f32 = 0.0;
  let l = (maxC + minC) / 2.0;

  if (delta > 0.0001) {
    s = select(delta / (2.0 - maxC - minC), delta / (maxC + minC), l < 0.5);

    if (maxC == rgb.r) {
      h = (rgb.g - rgb.b) / delta + select(0.0, 6.0, rgb.g < rgb.b);
    } else if (maxC == rgb.g) {
      h = (rgb.b - rgb.r) / delta + 2.0;
    } else {
      h = (rgb.r - rgb.g) / delta + 4.0;
    }
    h /= 6.0;
  }

  return vec3f(h, s, l);
}

// Helper for HSL to RGB
fn hueToRgb(p: f32, q: f32, t: f32) -> f32 {
  var tt = t;
  if (tt < 0.0) { tt += 1.0; }
  if (tt > 1.0) { tt -= 1.0; }
  if (tt < 1.0 / 6.0) { return p + (q - p) * 6.0 * tt; }
  if (tt < 1.0 / 2.0) { return q; }
  if (tt < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - tt) * 6.0; }
  return p;
}

// HSL to RGB conversion
fn hslToRgb(hsl: vec3f) -> vec3f {
  if (hsl.y < 0.0001) {
    return vec3f(hsl.z);
  }

  let q = select(hsl.z + hsl.y - hsl.z * hsl.y, hsl.z * (1.0 + hsl.y), hsl.z < 0.5);
  let p = 2.0 * hsl.z - q;

  return vec3f(
    hueToRgb(p, q, hsl.x + 1.0 / 3.0),
    hueToRgb(p, q, hsl.x),
    hueToRgb(p, q, hsl.x - 1.0 / 3.0)
  );
}

// Apply color temperature (Kelvin approximation)
fn applyTemperature(color: vec3f, temp: f32) -> vec3f {
  let warmCool = temp * 0.3;
  return vec3f(
    color.r + warmCool,
    color.g,
    color.b - warmCool
  );
}

// Apply tint (green-magenta axis)
fn applyTint(color: vec3f, tint: f32) -> vec3f {
  let greenMagenta = tint * 0.3;
  return vec3f(
    color.r + greenMagenta * 0.5,
    color.g - greenMagenta,
    color.b + greenMagenta * 0.5
  );
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // External texture sampling
  var color = textureSampleBaseClampToEdge(textureData, textureSampler, input.texCoord);
  var rgb = color.rgb;

  // Normalize parameters from -100..100 to -1..1 range
  let contrast = colorCorrection.contrast / 100.0;
  let saturation = colorCorrection.saturation / 100.0;
  let temperature = colorCorrection.temperature / 100.0;
  let tint = colorCorrection.tint / 100.0;
  let vibrance = colorCorrection.vibrance / 100.0;
  let highlights = colorCorrection.highlights / 100.0;
  let shadows = colorCorrection.shadows / 100.0;
  let whites = colorCorrection.whites / 100.0;
  let blacks = colorCorrection.blacks / 100.0;

  // Exposure (EV stops)
  rgb = rgb * pow(2.0, colorCorrection.exposure);

  // Contrast
  rgb = (rgb - 0.5) * (1.0 + contrast) + 0.5;

  // Blacks and Whites (lift/gain adjustments)
  rgb = rgb + blacks * (1.0 - rgb);
  rgb = rgb * (1.0 + whites);

  // Saturation and Vibrance using HSL
  var hsl = rgbToHsl(rgb);
  hsl.y = clamp(hsl.y * (1.0 + saturation), 0.0, 1.0);
  let vibranceAmount = vibrance * (1.0 - hsl.y);
  hsl.y = clamp(hsl.y + vibranceAmount, 0.0, 1.0);
  rgb = hslToRgb(hsl);

  // Temperature and tint
  rgb = applyTemperature(rgb, temperature);
  rgb = applyTint(rgb, tint);

  // Highlights and shadows
  let luminance = dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
  let highlightMask = smoothstep(0.5, 1.0, luminance);
  let shadowMask = 1.0 - smoothstep(0.0, 0.5, luminance);
  rgb = rgb + rgb * highlightMask * highlights;
  rgb = rgb + rgb * shadowMask * shadows;

  // Clamp output
  rgb = clamp(rgb, vec3f(0.0), vec3f(1.0));

  return vec4f(rgb, color.a * transform.opacity);
}
`;

// =============================================================================
// Transition Shader - 转场着色器
// =============================================================================

/**
 * GPU 转场着色器
 * 支持 24 种转场效果，包括淡入淡出、擦除、滑动、缩放、时钟擦除等
 */
export const transitionShader = /* wgsl */ `
// Constants
const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

// Transition type constants (must match GPU_TRANSITION_TYPE_MAP)
const TRANS_NONE: u32 = 0u;
const TRANS_FADE: u32 = 1u;
const TRANS_DISSOLVE: u32 = 2u;
const TRANS_SLIDE_LEFT: u32 = 3u;
const TRANS_SLIDE_RIGHT: u32 = 4u;
const TRANS_SLIDE_UP: u32 = 5u;
const TRANS_SLIDE_DOWN: u32 = 6u;
const TRANS_ZOOM_IN: u32 = 7u;
const TRANS_ZOOM_OUT: u32 = 8u;
const TRANS_CROSS_ZOOM: u32 = 9u;
const TRANS_WIPE_LEFT: u32 = 10u;
const TRANS_WIPE_RIGHT: u32 = 11u;
const TRANS_WIPE_UP: u32 = 12u;
const TRANS_WIPE_DOWN: u32 = 13u;
const TRANS_IRIS_IN: u32 = 14u;
const TRANS_IRIS_OUT: u32 = 15u;
const TRANS_CLOCK_WIPE: u32 = 16u;
const TRANS_CLOCK_WIPE_CCW: u32 = 17u;
const TRANS_BLINDS_H: u32 = 18u;
const TRANS_BLINDS_V: u32 = 19u;
const TRANS_DIP_BLACK: u32 = 20u;
const TRANS_DIP_WHITE: u32 = 21u;
const TRANS_DIP_COLOR: u32 = 22u;
const TRANS_RADIAL_WIPE: u32 = 23u;

// Uniforms
struct TransitionUniforms {
  progress: f32,          // 0-1 transition progress
  transitionType: u32,    // transition type index
  softness: f32,          // edge softness (0-1)
  blindsCount: f32,       // number of blinds (for blinds transitions)
  startAngle: f32,        // start angle for clock wipe (radians)
  dipColorR: f32,         // dip color red
  dipColorG: f32,         // dip color green
  dipColorB: f32,         // dip color blue
  _padding: f32,
}

@group(0) @binding(0) var<uniform> params: TransitionUniforms;
@group(0) @binding(1) var textureSampler: sampler;
@group(0) @binding(2) var fromTexture: texture_2d<f32>;
@group(0) @binding(3) var toTexture: texture_2d<f32>;

struct VertexInput {
  @location(0) position: vec2f,
  @location(1) texCoord: vec2f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texCoord: vec2f,
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  // Identity transform for fullscreen quad
  output.position = vec4f(input.position * 2.0 - 1.0, 0.0, 1.0);
  output.texCoord = input.texCoord;
  return output;
}

// =============================================================================
// Transition Helper Functions
// =============================================================================

// Apply feather/softness to transition edge
fn applyFeather(value: f32, feather: f32) -> f32 {
  if (feather <= 0.0) {
    return step(0.5, value);
  }
  return smoothstep(0.5 - feather * 0.5, 0.5 + feather * 0.5, value);
}

// Pseudo-random noise
fn rand(co: vec2f) -> f32 {
  return fract(sin(dot(co, vec2f(12.9898, 78.233))) * 43758.5453);
}

// =============================================================================
// Fade Transitions
// =============================================================================

fn transitionFade(fromColor: vec4f, toColor: vec4f, progress: f32) -> vec4f {
  return mix(fromColor, toColor, progress);
}

fn transitionDissolve(uv: vec2f, fromColor: vec4f, toColor: vec4f, progress: f32) -> vec4f {
  let noise = rand(uv * 100.0);
  let threshold = progress * 1.2 - 0.1; // Slight overshoot for smoother edges
  let mixFactor = smoothstep(threshold - 0.1, threshold + 0.1, noise);
  return mix(fromColor, toColor, mixFactor);
}

// =============================================================================
// Wipe Transitions
// =============================================================================

fn transitionWipeLeft(uv: vec2f, progress: f32, feather: f32) -> f32 {
  let edge = progress * (1.0 + feather) - feather * 0.5;
  return applyFeather(edge - uv.x + 0.5, feather);
}

fn transitionWipeRight(uv: vec2f, progress: f32, feather: f32) -> f32 {
  let edge = progress * (1.0 + feather) - feather * 0.5;
  return applyFeather(uv.x - (1.0 - edge) + 0.5, feather);
}

fn transitionWipeUp(uv: vec2f, progress: f32, feather: f32) -> f32 {
  let edge = progress * (1.0 + feather) - feather * 0.5;
  return applyFeather(uv.y - (1.0 - edge) + 0.5, feather);
}

fn transitionWipeDown(uv: vec2f, progress: f32, feather: f32) -> f32 {
  let edge = progress * (1.0 + feather) - feather * 0.5;
  return applyFeather(edge - uv.y + 0.5, feather);
}

// =============================================================================
// Slide Transitions
// =============================================================================

fn transitionSlide(uv: vec2f, progress: f32, direction: vec2f) -> vec4f {
  let fromUv = uv + direction * progress;
  let toUv = uv + direction * (progress - 1.0);

  let fromValid = all(fromUv >= vec2f(0.0)) && all(fromUv <= vec2f(1.0));
  let toValid = all(toUv >= vec2f(0.0)) && all(toUv <= vec2f(1.0));

  // Use textureSampleLevel instead of textureSample for non-uniform control flow
  if (toValid) {
    return textureSampleLevel(toTexture, textureSampler, toUv, 0.0);
  } else if (fromValid) {
    return textureSampleLevel(fromTexture, textureSampler, fromUv, 0.0);
  }
  return vec4f(0.0);
}

// =============================================================================
// Zoom Transitions
// =============================================================================

fn transitionZoomIn(uv: vec2f, progress: f32, center: vec2f) -> vec2f {
  let scale = 1.0 + progress * 2.0;
  return (uv - center) / scale + center;
}

fn transitionZoomOut(uv: vec2f, progress: f32, center: vec2f) -> vec2f {
  let scale = 1.0 / (1.0 + (1.0 - progress) * 2.0);
  return (uv - center) / scale + center;
}

fn transitionCrossZoom(uv: vec2f, fromColor: vec4f, toColor: vec4f, progress: f32) -> vec4f {
  let center = vec2f(0.5);

  // Zoom out from source
  let fromScale = 1.0 + progress * 0.5;
  let fromUv = (uv - center) * fromScale + center;
  var fromSample = fromColor;
  // Use textureSampleLevel instead of textureSample for non-uniform control flow
  if (all(fromUv >= vec2f(0.0)) && all(fromUv <= vec2f(1.0))) {
    fromSample = textureSampleLevel(fromTexture, textureSampler, fromUv, 0.0);
  }

  // Zoom in to destination
  let toScale = 1.5 - progress * 0.5;
  let toUv = (uv - center) * toScale + center;
  var toSample = toColor;
  // Use textureSampleLevel instead of textureSample for non-uniform control flow
  if (all(toUv >= vec2f(0.0)) && all(toUv <= vec2f(1.0))) {
    toSample = textureSampleLevel(toTexture, textureSampler, toUv, 0.0);
  }

  return mix(fromSample, toSample, progress);
}

// =============================================================================
// Iris Transitions
// =============================================================================

fn transitionIrisIn(uv: vec2f, progress: f32, feather: f32) -> f32 {
  let center = vec2f(0.5);
  let dist = distance(uv, center);
  let maxDist = 0.7071; // sqrt(0.5)
  let radius = (1.0 - progress) * maxDist * 1.5;
  return applyFeather((dist - radius) / maxDist + 0.5, feather);
}

fn transitionIrisOut(uv: vec2f, progress: f32, feather: f32) -> f32 {
  let center = vec2f(0.5);
  let dist = distance(uv, center);
  let maxDist = 0.7071;
  let radius = progress * maxDist * 1.5;
  return applyFeather((radius - dist) / maxDist + 0.5, feather);
}

// =============================================================================
// Clock Wipe Transitions
// =============================================================================

fn transitionClockWipe(uv: vec2f, progress: f32, feather: f32, startAngle: f32, clockwise: bool) -> f32 {
  let center = vec2f(0.5);
  let diff = uv - center;
  var angle = atan2(diff.y, diff.x) - startAngle;
  angle = (angle + PI) / TAU; // Normalize to 0-1

  if (!clockwise) {
    angle = 1.0 - angle;
  }

  // Wrap angle
  angle = fract(angle);

  return applyFeather(progress - angle + 0.5, feather);
}

fn transitionRadialWipe(uv: vec2f, progress: f32, feather: f32) -> f32 {
  let center = vec2f(0.5);
  let dist = distance(uv, center);
  let diff = uv - center;
  var angle = (atan2(diff.y, diff.x) + PI) / TAU;

  // Combine radial and angular for spiral effect
  let combined = (dist * 0.5 + angle * 0.5);
  let edge = progress * 1.5;

  return applyFeather(edge - combined + 0.5, feather);
}

// =============================================================================
// Blinds Transitions
// =============================================================================

fn transitionBlindsHorizontal(uv: vec2f, progress: f32, feather: f32, count: f32) -> f32 {
  let blindPos = fract(uv.y * count);
  let edge = progress * (1.0 + feather);
  return applyFeather(edge - blindPos + 0.5, feather);
}

fn transitionBlindsVertical(uv: vec2f, progress: f32, feather: f32, count: f32) -> f32 {
  let blindPos = fract(uv.x * count);
  let edge = progress * (1.0 + feather);
  return applyFeather(edge - blindPos + 0.5, feather);
}

// =============================================================================
// Dip Transitions
// =============================================================================

fn transitionDipToColor(fromColor: vec4f, toColor: vec4f, progress: f32, dipColor: vec3f) -> vec4f {
  // First half: fade to color, second half: fade from color
  if (progress < 0.5) {
    let p = progress * 2.0;
    return mix(fromColor, vec4f(dipColor, 1.0), p);
  } else {
    let p = (progress - 0.5) * 2.0;
    return mix(vec4f(dipColor, 1.0), toColor, p);
  }
}

// =============================================================================
// Main Fragment Shader
// =============================================================================

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.texCoord;
  let fromColor = textureSample(fromTexture, textureSampler, uv);
  let toColor = textureSample(toTexture, textureSampler, uv);
  let progress = params.progress;
  let feather = params.softness;

  var mixFactor: f32 = progress;
  var result: vec4f;

  switch (params.transitionType) {
    // Basic transitions
    case TRANS_NONE: {
      return select(fromColor, toColor, progress >= 0.5);
    }
    case TRANS_FADE: {
      return transitionFade(fromColor, toColor, progress);
    }
    case TRANS_DISSOLVE: {
      return transitionDissolve(uv, fromColor, toColor, progress);
    }

    // Slide transitions
    case TRANS_SLIDE_LEFT: {
      return transitionSlide(uv, progress, vec2f(1.0, 0.0));
    }
    case TRANS_SLIDE_RIGHT: {
      return transitionSlide(uv, progress, vec2f(-1.0, 0.0));
    }
    case TRANS_SLIDE_UP: {
      return transitionSlide(uv, progress, vec2f(0.0, 1.0));
    }
    case TRANS_SLIDE_DOWN: {
      return transitionSlide(uv, progress, vec2f(0.0, -1.0));
    }

    // Zoom transitions
    case TRANS_ZOOM_IN: {
      let zoomedUv = transitionZoomIn(uv, progress, vec2f(0.5));
      // Use textureSampleLevel for non-uniform control flow
      if (all(zoomedUv >= vec2f(0.0)) && all(zoomedUv <= vec2f(1.0))) {
        let zoomedFrom = textureSampleLevel(fromTexture, textureSampler, zoomedUv, 0.0);
        return mix(zoomedFrom, toColor, progress);
      }
      return toColor;
    }
    case TRANS_ZOOM_OUT: {
      let zoomedUv = transitionZoomOut(uv, progress, vec2f(0.5));
      // Use textureSampleLevel for non-uniform control flow
      if (all(zoomedUv >= vec2f(0.0)) && all(zoomedUv <= vec2f(1.0))) {
        let zoomedTo = textureSampleLevel(toTexture, textureSampler, zoomedUv, 0.0);
        return mix(fromColor, zoomedTo, progress);
      }
      return fromColor;
    }
    case TRANS_CROSS_ZOOM: {
      return transitionCrossZoom(uv, fromColor, toColor, progress);
    }

    // Wipe transitions
    case TRANS_WIPE_LEFT: {
      mixFactor = transitionWipeLeft(uv, progress, feather);
    }
    case TRANS_WIPE_RIGHT: {
      mixFactor = transitionWipeRight(uv, progress, feather);
    }
    case TRANS_WIPE_UP: {
      mixFactor = transitionWipeUp(uv, progress, feather);
    }
    case TRANS_WIPE_DOWN: {
      mixFactor = transitionWipeDown(uv, progress, feather);
    }

    // Iris transitions
    case TRANS_IRIS_IN: {
      mixFactor = transitionIrisIn(uv, progress, feather);
    }
    case TRANS_IRIS_OUT: {
      mixFactor = transitionIrisOut(uv, progress, feather);
    }

    // Clock wipe transitions
    case TRANS_CLOCK_WIPE: {
      mixFactor = transitionClockWipe(uv, progress, feather, params.startAngle, true);
    }
    case TRANS_CLOCK_WIPE_CCW: {
      mixFactor = transitionClockWipe(uv, progress, feather, params.startAngle, false);
    }
    case TRANS_RADIAL_WIPE: {
      mixFactor = transitionRadialWipe(uv, progress, feather);
    }

    // Blinds transitions
    case TRANS_BLINDS_H: {
      mixFactor = transitionBlindsHorizontal(uv, progress, feather, params.blindsCount);
    }
    case TRANS_BLINDS_V: {
      mixFactor = transitionBlindsVertical(uv, progress, feather, params.blindsCount);
    }

    // Dip transitions
    case TRANS_DIP_BLACK: {
      return transitionDipToColor(fromColor, toColor, progress, vec3f(0.0));
    }
    case TRANS_DIP_WHITE: {
      return transitionDipToColor(fromColor, toColor, progress, vec3f(1.0));
    }
    case TRANS_DIP_COLOR: {
      let dipColor = vec3f(params.dipColorR, params.dipColorG, params.dipColorB);
      return transitionDipToColor(fromColor, toColor, progress, dipColor);
    }

    default: {
      return transitionFade(fromColor, toColor, progress);
    }
  }

  // Apply mix factor for wipe/iris/clock/blinds transitions
  return mix(fromColor, toColor, saturate(mixFactor));
}
`;
