/**
 * YUV420P to RGB Conversion Shader
 *
 * This shader converts YUV420P video frames to RGB for display.
 * Supports BT.601, BT.709, and BT.2020 color spaces.
 *
 * Usage:
 * 1. Create 3 textures for Y, U, V planes (R8 format)
 * 2. Upload YUV420P data to textures
 * 3. Render fullscreen quad with this shader
 *
 * Compatible with WebGPU and wgpu (Rust).
 */

export const YUV_CONVERSION_WGSL = /* wgsl */ `
// =============================================================================
// YUV420P to RGB Conversion Shader
// =============================================================================

// Color space constants
const COLOR_SPACE_BT601: i32 = 0;
const COLOR_SPACE_BT709: i32 = 1;
const COLOR_SPACE_BT2020: i32 = 2;

// Uniforms
struct YuvUniforms {
    // Output dimensions
    output_size: vec2<f32>,
    // Color space: 0=BT.601, 1=BT.709, 2=BT.2020
    color_space: i32,
    // Padding for alignment
    _padding: i32,
}

@group(0) @binding(0) var<uniform> uniforms: YuvUniforms;
@group(0) @binding(1) var y_texture: texture_2d<f32>;
@group(0) @binding(2) var u_texture: texture_2d<f32>;
@group(0) @binding(3) var v_texture: texture_2d<f32>;
@group(0) @binding(4) var tex_sampler: sampler;

// Vertex output
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// Fullscreen triangle vertex shader
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    // Generate fullscreen triangle (3 vertices cover entire screen)
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );

    var uvs = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0)
    );

    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.uv = uvs[vertex_index];
    return output;
}

// YUV to RGB conversion functions
fn yuv_to_rgb_bt601(y: f32, u: f32, v: f32) -> vec3<f32> {
    let r = y + 1.402 * v;
    let g = y - 0.344136 * u - 0.714136 * v;
    let b = y + 1.772 * u;
    return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn yuv_to_rgb_bt709(y: f32, u: f32, v: f32) -> vec3<f32> {
    let r = y + 1.5748 * v;
    let g = y - 0.1873 * u - 0.4681 * v;
    let b = y + 1.8556 * u;
    return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn yuv_to_rgb_bt2020(y: f32, u: f32, v: f32) -> vec3<f32> {
    let r = y + 1.4746 * v;
    let g = y - 0.1646 * u - 0.5714 * v;
    let b = y + 1.8814 * u;
    return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
}

// Fragment shader
@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv;

    // Sample Y plane at full resolution
    let y = textureSample(y_texture, tex_sampler, uv).r;

    // Sample U and V planes (bilinear interpolation handles 2x upscaling)
    // U and V are stored with 0.5 offset (128 in 8-bit), subtract to get signed value
    let u = textureSample(u_texture, tex_sampler, uv).r - 0.5;
    let v = textureSample(v_texture, tex_sampler, uv).r - 0.5;

    // Convert YUV to RGB based on color space
    var rgb: vec3<f32>;
    if (uniforms.color_space == COLOR_SPACE_BT601) {
        rgb = yuv_to_rgb_bt601(y, u, v);
    } else if (uniforms.color_space == COLOR_SPACE_BT709) {
        rgb = yuv_to_rgb_bt709(y, u, v);
    } else {
        rgb = yuv_to_rgb_bt2020(y, u, v);
    }

    return vec4<f32>(rgb, 1.0);
}
`;

/**
 * YUV420P to RGBA Conversion Shader (with alpha support)
 *
 * Same as above but outputs RGBA with configurable alpha.
 */
export const YUV_TO_RGBA_WGSL = /* wgsl */ `
// =============================================================================
// YUV420P to RGBA Conversion Shader (with alpha)
// =============================================================================

struct YuvRgbaUniforms {
    output_size: vec2<f32>,
    color_space: i32,
    alpha: f32,
}

@group(0) @binding(0) var<uniform> uniforms: YuvRgbaUniforms;
@group(0) @binding(1) var y_texture: texture_2d<f32>;
@group(0) @binding(2) var u_texture: texture_2d<f32>;
@group(0) @binding(3) var v_texture: texture_2d<f32>;
@group(0) @binding(4) var tex_sampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );

    var uvs = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0)
    );

    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.uv = uvs[vertex_index];
    return output;
}

fn yuv_to_rgb_bt601(y: f32, u: f32, v: f32) -> vec3<f32> {
    let r = y + 1.402 * v;
    let g = y - 0.344136 * u - 0.714136 * v;
    let b = y + 1.772 * u;
    return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn yuv_to_rgb_bt709(y: f32, u: f32, v: f32) -> vec3<f32> {
    let r = y + 1.5748 * v;
    let g = y - 0.1873 * u - 0.4681 * v;
    let b = y + 1.8556 * u;
    return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn yuv_to_rgb_bt2020(y: f32, u: f32, v: f32) -> vec3<f32> {
    let r = y + 1.4746 * v;
    let g = y - 0.1646 * u - 0.5714 * v;
    let b = y + 1.8814 * u;
    return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv;

    let y = textureSample(y_texture, tex_sampler, uv).r;
    let u = textureSample(u_texture, tex_sampler, uv).r - 0.5;
    let v = textureSample(v_texture, tex_sampler, uv).r - 0.5;

    var rgb: vec3<f32>;
    if (uniforms.color_space == 0) {
        rgb = yuv_to_rgb_bt601(y, u, v);
    } else if (uniforms.color_space == 1) {
        rgb = yuv_to_rgb_bt709(y, u, v);
    } else {
        rgb = yuv_to_rgb_bt2020(y, u, v);
    }

    return vec4<f32>(rgb, uniforms.alpha);
}
`;

/**
 * Color space enum for TypeScript
 */
export enum YuvColorSpace {
    BT601 = 0,  // SD video (DVD, broadcast)
    BT709 = 1,  // HD video (HDTV, Blu-ray)
    BT2020 = 2, // UHD/4K video (HDR)
}

/**
 * Detect color space based on video resolution
 */
export function detectColorSpace(width: number, height: number): YuvColorSpace {
    // UHD/4K and above: BT.2020
    if (width >= 3840 || height >= 2160) {
        return YuvColorSpace.BT2020;
    }
    // HD (720p and above): BT.709
    if (width >= 1280 || height >= 720) {
        return YuvColorSpace.BT709;
    }
    // SD: BT.601
    return YuvColorSpace.BT601;
}
