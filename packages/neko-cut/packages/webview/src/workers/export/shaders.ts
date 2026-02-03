/**
 * Export Worker Shaders
 *
 * Unified shaders for export Worker, imported from effects-core.
 * This ensures preview and export use the same rendering algorithms.
 *
 * Architecture:
 * - Common utilities from effects-core (color space conversion, math)
 * - Color correction from effects-core
 * - External texture shaders for zero-copy VideoFrame rendering
 */

// Import shader strings directly from effects-core (browser-compatible)
// Using relative path imports to avoid alias resolution issues in workers
import { COMMON_WGSL } from '../../../../../../neko-server/packages/effects-core/src/shaders/common.wgsl';
import { COLOR_CORRECTION_WGSL } from '../../../../../../neko-server/packages/effects-core/src/shaders/colorCorrection.wgsl';

// =============================================================================
// External Texture Shader (Basic)
// =============================================================================

/**
 * External Texture 基础着色器
 * 用于 VideoFrame 零拷贝渲染（importExternalTexture）
 *
 * Uses effects-core common utilities for consistency with preview.
 */
export const EXTERNAL_TEXTURE_SHADER = /* wgsl */ `
// Import common utilities from effects-core
${COMMON_WGSL}

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

// =============================================================================
// External Texture + Color Correction Shader
// =============================================================================

/**
 * External Texture + 颜色校正着色器
 * 用于带颜色校正的 VideoFrame 零拷贝渲染
 *
 * Uses effects-core color correction algorithms for consistency with preview.
 */
export const EXTERNAL_TEXTURE_COLOR_CORRECTION_SHADER = /* wgsl */ `
// Import common utilities and color correction from effects-core
${COMMON_WGSL}
${COLOR_CORRECTION_WGSL}

struct TransformUniforms {
  mvpMatrix: mat4x4f,
  opacity: f32,
  _padding: vec3f,
}

struct ExportColorCorrectionUniforms {
  exposure: f32,      // -5 to 5 (EV stops)
  contrast: f32,      // -100 to 100
  saturation: f32,    // -100 to 100
  temperature: f32,   // -100 to 100
  tint: f32,          // -100 to 100
  vibrance: f32,      // -100 to 100
  highlights: f32,    // -100 to 100
  shadows: f32,       // -100 to 100
  whites: f32,        // -100 to 100
  blacks: f32,        // -100 to 100
  _padding: vec2f,
}

@group(0) @binding(0) var<uniform> transform: TransformUniforms;
@group(0) @binding(1) var textureSampler: sampler;
@group(0) @binding(2) var textureData: texture_external;
@group(0) @binding(3) var<uniform> ccUniforms: ExportColorCorrectionUniforms;

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

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // External texture sampling
  var color = textureSampleBaseClampToEdge(textureData, textureSampler, input.texCoord);
  var rgb = color.rgb;

  // Build ColorCorrectionParams struct for effects-core function
  var params: ColorCorrectionParams;
  params.exposure = ccUniforms.exposure;
  params.contrast = 1.0 + ccUniforms.contrast / 100.0; // Convert to multiplier
  params.highlights = ccUniforms.highlights / 100.0;
  params.shadows = ccUniforms.shadows / 100.0;
  params.whites = ccUniforms.whites / 100.0;
  params.blacks = ccUniforms.blacks / 100.0;
  params.temperature = ccUniforms.temperature;
  params.tint = ccUniforms.tint;
  params.vibrance = ccUniforms.vibrance / 100.0;
  params.saturation = 1.0 + ccUniforms.saturation / 100.0; // Convert to multiplier
  params.hue_shift = 0.0;
  params.gamma = 1.0;

  // Apply color correction using effects-core algorithm
  rgb = apply_color_correction(rgb, params);

  return vec4f(rgb, color.a * transform.opacity);
}
`;
