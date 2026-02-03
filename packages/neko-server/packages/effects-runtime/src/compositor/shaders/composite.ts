/**
 * Compositor Shaders (WGSL)
 *
 * GPU shaders for multi-track compositing.
 * Includes blend modes, transforms, and masking.
 */

// =============================================================================
// Blend Mode Constants
// =============================================================================

/**
 * Blend mode enum values (must match BlendMode type)
 */
export const BLEND_MODE_VALUES = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  darken: 4,
  lighten: 5,
  colorDodge: 6,
  colorBurn: 7,
  hardLight: 8,
  softLight: 9,
  difference: 10,
  exclusion: 11,
  add: 12,
  subtract: 13,
} as const;

// =============================================================================
// Composite Shader
// =============================================================================

/**
 * Main compositing shader
 *
 * Composites a source layer onto a destination texture with:
 * - 2D transform (position, scale, rotation)
 * - Opacity
 * - Blend modes
 * - Optional masking
 */
export const COMPOSITE_SHADER = /* wgsl */ `
// Uniforms for layer compositing
struct CompositeUniforms {
  // Transform matrix (3x3 stored as 3 vec4s for alignment)
  transform_row0: vec4<f32>,
  transform_row1: vec4<f32>,
  transform_row2: vec4<f32>,
  // Layer properties
  opacity: f32,
  blend_mode: u32,
  use_mask: u32,
  mask_inverted: u32,
  // Output size
  output_width: f32,
  output_height: f32,
  // Source size
  source_width: f32,
  source_height: f32,
}

@group(0) @binding(0) var<uniform> uniforms: CompositeUniforms;
@group(0) @binding(1) var source_texture: texture_2d<f32>;
@group(0) @binding(2) var dest_texture: texture_2d<f32>;
@group(0) @binding(3) var mask_texture: texture_2d<f32>;
@group(0) @binding(4) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(5) var tex_sampler: sampler;

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
const BLEND_ADD: u32 = 12u;
const BLEND_SUBTRACT: u32 = 13u;

// Apply blend mode to a single channel
fn blend_channel(src: f32, dst: f32, mode: u32) -> f32 {
  switch mode {
    case BLEND_MULTIPLY: {
      return src * dst;
    }
    case BLEND_SCREEN: {
      return 1.0 - (1.0 - src) * (1.0 - dst);
    }
    case BLEND_OVERLAY: {
      if dst < 0.5 {
        return 2.0 * src * dst;
      } else {
        return 1.0 - 2.0 * (1.0 - src) * (1.0 - dst);
      }
    }
    case BLEND_DARKEN: {
      return min(src, dst);
    }
    case BLEND_LIGHTEN: {
      return max(src, dst);
    }
    case BLEND_COLOR_DODGE: {
      if src >= 1.0 {
        return 1.0;
      }
      return min(1.0, dst / (1.0 - src));
    }
    case BLEND_COLOR_BURN: {
      if src <= 0.0 {
        return 0.0;
      }
      return max(0.0, 1.0 - (1.0 - dst) / src);
    }
    case BLEND_HARD_LIGHT: {
      if src < 0.5 {
        return 2.0 * src * dst;
      } else {
        return 1.0 - 2.0 * (1.0 - src) * (1.0 - dst);
      }
    }
    case BLEND_SOFT_LIGHT: {
      if src < 0.5 {
        return dst - (1.0 - 2.0 * src) * dst * (1.0 - dst);
      } else {
        let d = select(sqrt(dst), ((16.0 * dst - 12.0) * dst + 4.0) * dst, dst <= 0.25);
        return dst + (2.0 * src - 1.0) * (d - dst);
      }
    }
    case BLEND_DIFFERENCE: {
      return abs(src - dst);
    }
    case BLEND_EXCLUSION: {
      return src + dst - 2.0 * src * dst;
    }
    case BLEND_ADD: {
      return min(1.0, src + dst);
    }
    case BLEND_SUBTRACT: {
      return max(0.0, dst - src);
    }
    default: {
      // Normal blend - handled separately with alpha
      return src;
    }
  }
}

// Apply blend mode to RGB
fn blend_rgb(src: vec3<f32>, dst: vec3<f32>, mode: u32) -> vec3<f32> {
  return vec3<f32>(
    blend_channel(src.r, dst.r, mode),
    blend_channel(src.g, dst.g, mode),
    blend_channel(src.b, dst.b, mode)
  );
}

// Porter-Duff source-over compositing with blend mode
fn composite_colors(src: vec4<f32>, dst: vec4<f32>, blend_mode: u32, opacity: f32) -> vec4<f32> {
  // Apply opacity to source alpha
  let src_alpha = src.a * opacity;

  // If source is fully transparent, return destination
  if src_alpha <= 0.0 {
    return dst;
  }

  // If destination is fully transparent, return source with opacity
  if dst.a <= 0.0 {
    return vec4<f32>(src.rgb, src_alpha);
  }

  // Apply blend mode to RGB
  var blended_rgb: vec3<f32>;
  if blend_mode == BLEND_NORMAL {
    blended_rgb = src.rgb;
  } else {
    blended_rgb = blend_rgb(src.rgb, dst.rgb, blend_mode);
  }

  // Porter-Duff source-over alpha compositing
  let out_alpha = src_alpha + dst.a * (1.0 - src_alpha);

  if out_alpha <= 0.0 {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  // Composite RGB with premultiplied alpha
  let out_rgb = (blended_rgb * src_alpha + dst.rgb * dst.a * (1.0 - src_alpha)) / out_alpha;

  return vec4<f32>(out_rgb, out_alpha);
}

// Transform UV coordinates using the transform matrix
fn transform_uv(pixel_coord: vec2<f32>) -> vec2<f32> {
  // Build 3x3 transform matrix from uniform rows
  let m = mat3x3<f32>(
    uniforms.transform_row0.xyz,
    uniforms.transform_row1.xyz,
    uniforms.transform_row2.xyz
  );

  // Apply inverse transform to get source UV
  // We need to go from output pixel -> source UV
  let inv_m = m; // Note: We pass the inverse matrix from CPU

  let transformed = inv_m * vec3<f32>(pixel_coord, 1.0);

  // Convert to normalized UV (0-1)
  return vec2<f32>(
    transformed.x / uniforms.source_width,
    transformed.y / uniforms.source_height
  );
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let output_size = vec2<u32>(u32(uniforms.output_width), u32(uniforms.output_height));

  // Bounds check
  if global_id.x >= output_size.x || global_id.y >= output_size.y {
    return;
  }

  let pixel_coord = vec2<f32>(f32(global_id.x), f32(global_id.y));
  let output_uv = pixel_coord / vec2<f32>(uniforms.output_width, uniforms.output_height);

  // Get destination color
  let dest_color = textureSampleLevel(dest_texture, tex_sampler, output_uv, 0.0);

  // Transform to get source UV
  let source_uv = transform_uv(pixel_coord);

  // Check if UV is within source bounds
  if source_uv.x < 0.0 || source_uv.x > 1.0 || source_uv.y < 0.0 || source_uv.y > 1.0 {
    // Outside source bounds, keep destination
    textureStore(output_texture, vec2<i32>(global_id.xy), dest_color);
    return;
  }

  // Sample source texture
  let source_color = textureSampleLevel(source_texture, tex_sampler, source_uv, 0.0);

  // Apply mask if enabled
  var mask_alpha = 1.0;
  if uniforms.use_mask != 0u {
    let mask_value = textureSampleLevel(mask_texture, tex_sampler, source_uv, 0.0);
    mask_alpha = mask_value.a;
    if uniforms.mask_inverted != 0u {
      mask_alpha = 1.0 - mask_alpha;
    }
  }

  // Apply mask to source alpha
  let masked_source = vec4<f32>(source_color.rgb, source_color.a * mask_alpha);

  // Composite with blend mode
  let result = composite_colors(masked_source, dest_color, uniforms.blend_mode, uniforms.opacity);

  textureStore(output_texture, vec2<i32>(global_id.xy), result);
}
`;

// =============================================================================
// Clear Shader
// =============================================================================

/**
 * Shader to clear a texture to a solid color
 */
export const CLEAR_SHADER = /* wgsl */ `
struct ClearUniforms {
  color: vec4<f32>,
  width: f32,
  height: f32,
  _padding: vec2<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: ClearUniforms;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let output_size = vec2<u32>(u32(uniforms.width), u32(uniforms.height));

  if global_id.x >= output_size.x || global_id.y >= output_size.y {
    return;
  }

  textureStore(output_texture, vec2<i32>(global_id.xy), uniforms.color);
}
`;

// =============================================================================
// Copy Shader
// =============================================================================

/**
 * Shader to copy a texture (for ping-pong rendering)
 */
export const COPY_SHADER = /* wgsl */ `
struct CopyUniforms {
  width: f32,
  height: f32,
  _padding: vec2<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: CopyUniforms;
@group(0) @binding(1) var source_texture: texture_2d<f32>;
@group(0) @binding(2) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var tex_sampler: sampler;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let output_size = vec2<u32>(u32(uniforms.width), u32(uniforms.height));

  if global_id.x >= output_size.x || global_id.y >= output_size.y {
    return;
  }

  let uv = vec2<f32>(f32(global_id.x) / uniforms.width, f32(global_id.y) / uniforms.height);
  let color = textureSampleLevel(source_texture, tex_sampler, uv, 0.0);

  textureStore(output_texture, vec2<i32>(global_id.xy), color);
}
`;
