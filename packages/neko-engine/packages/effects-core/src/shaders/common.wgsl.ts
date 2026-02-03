/**
 * Common WGSL Shader Utilities
 *
 * Shared functions for all shaders.
 * Compatible with WebGPU and wgpu.
 */

export const COMMON_WGSL = /* wgsl */ `
// =============================================================================
// Constants
// =============================================================================

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const E: f32 = 2.71828182846;

// =============================================================================
// Math Utilities
// =============================================================================

fn saturate(x: f32) -> f32 {
    return clamp(x, 0.0, 1.0);
}

fn saturate3(x: vec3<f32>) -> vec3<f32> {
    return clamp(x, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn saturate4(x: vec4<f32>) -> vec4<f32> {
    return clamp(x, vec4<f32>(0.0), vec4<f32>(1.0));
}

fn lerp_f32(a: f32, b: f32, t: f32) -> f32 {
    return a + (b - a) * t;
}

fn lerp_vec3(a: vec3<f32>, b: vec3<f32>, t: f32) -> vec3<f32> {
    return a + (b - a) * t;
}

fn lerp_vec4(a: vec4<f32>, b: vec4<f32>, t: f32) -> vec4<f32> {
    return a + (b - a) * t;
}

fn smoothstep_manual(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = saturate((x - edge0) / (edge1 - edge0));
    return t * t * (3.0 - 2.0 * t);
}

fn smootherstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = saturate((x - edge0) / (edge1 - edge0));
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

// =============================================================================
// Color Space Conversion
// =============================================================================

fn rgb_to_hsl(rgb: vec3<f32>) -> vec3<f32> {
    let max_c = max(max(rgb.r, rgb.g), rgb.b);
    let min_c = min(min(rgb.r, rgb.g), rgb.b);
    let l = (max_c + min_c) / 2.0;

    if (max_c == min_c) {
        return vec3<f32>(0.0, 0.0, l);
    }

    let d = max_c - min_c;
    let s = select(d / (2.0 - max_c - min_c), d / (max_c + min_c), l > 0.5);

    var h: f32;
    if (max_c == rgb.r) {
        h = (rgb.g - rgb.b) / d + select(0.0, 6.0, rgb.g < rgb.b);
    } else if (max_c == rgb.g) {
        h = (rgb.b - rgb.r) / d + 2.0;
    } else {
        h = (rgb.r - rgb.g) / d + 4.0;
    }
    h /= 6.0;

    return vec3<f32>(h, s, l);
}

fn hue_to_rgb(p: f32, q: f32, t: f32) -> f32 {
    var t_mod = t;
    if (t_mod < 0.0) { t_mod += 1.0; }
    if (t_mod > 1.0) { t_mod -= 1.0; }
    if (t_mod < 1.0/6.0) { return p + (q - p) * 6.0 * t_mod; }
    if (t_mod < 1.0/2.0) { return q; }
    if (t_mod < 2.0/3.0) { return p + (q - p) * (2.0/3.0 - t_mod) * 6.0; }
    return p;
}

fn hsl_to_rgb(hsl: vec3<f32>) -> vec3<f32> {
    if (hsl.y == 0.0) {
        return vec3<f32>(hsl.z, hsl.z, hsl.z);
    }

    let q = select(hsl.z + hsl.y - hsl.z * hsl.y, hsl.z * (1.0 + hsl.y), hsl.z < 0.5);
    let p = 2.0 * hsl.z - q;

    return vec3<f32>(
        hue_to_rgb(p, q, hsl.x + 1.0/3.0),
        hue_to_rgb(p, q, hsl.x),
        hue_to_rgb(p, q, hsl.x - 1.0/3.0)
    );
}

fn rgb_to_hsv(rgb: vec3<f32>) -> vec3<f32> {
    let max_c = max(max(rgb.r, rgb.g), rgb.b);
    let min_c = min(min(rgb.r, rgb.g), rgb.b);
    let d = max_c - min_c;

    let s = select(d / max_c, 0.0, max_c == 0.0);
    let v = max_c;

    if (max_c == min_c) {
        return vec3<f32>(0.0, s, v);
    }

    var h: f32;
    if (max_c == rgb.r) {
        h = (rgb.g - rgb.b) / d + select(0.0, 6.0, rgb.g < rgb.b);
    } else if (max_c == rgb.g) {
        h = (rgb.b - rgb.r) / d + 2.0;
    } else {
        h = (rgb.r - rgb.g) / d + 4.0;
    }
    h /= 6.0;

    return vec3<f32>(h, s, v);
}

fn hsv_to_rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = hsv.x * 6.0;
    let s = hsv.y;
    let v = hsv.z;

    let i = floor(h);
    let f = h - i;
    let p = v * (1.0 - s);
    let q = v * (1.0 - s * f);
    let t = v * (1.0 - s * (1.0 - f));

    let i_mod = i32(i) % 6;
    if (i_mod == 0) { return vec3<f32>(v, t, p); }
    if (i_mod == 1) { return vec3<f32>(q, v, p); }
    if (i_mod == 2) { return vec3<f32>(p, v, t); }
    if (i_mod == 3) { return vec3<f32>(p, q, v); }
    if (i_mod == 4) { return vec3<f32>(t, p, v); }
    return vec3<f32>(v, p, q);
}

// =============================================================================
// Luminance
// =============================================================================

fn luminance(rgb: vec3<f32>) -> f32 {
    return dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn luminance_bt601(rgb: vec3<f32>) -> f32 {
    return dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
}

// =============================================================================
// YUV ↔ RGB Conversion (for video decoding)
// =============================================================================

// BT.601 coefficients (SD video, NTSC/PAL)
// Used for: DVD, SD broadcast, older content
const YUV_BT601_KR: f32 = 0.299;
const YUV_BT601_KB: f32 = 0.114;

// BT.709 coefficients (HD video)
// Used for: HDTV, Blu-ray, modern content
const YUV_BT709_KR: f32 = 0.2126;
const YUV_BT709_KB: f32 = 0.0722;

// BT.2020 coefficients (UHD/4K video)
// Used for: 4K/8K content, HDR
const YUV_BT2020_KR: f32 = 0.2627;
const YUV_BT2020_KB: f32 = 0.0593;

/**
 * Convert YUV to RGB using BT.601 standard (SD video)
 *
 * Input: Y in [0, 1], U/V in [-0.5, 0.5] (or [0, 1] with 0.5 offset)
 * Output: RGB in [0, 1]
 *
 * For video with limited range (16-235 for Y, 16-240 for UV):
 * - Y' = (Y - 16) / 219
 * - U' = (U - 128) / 224
 * - V' = (V - 128) / 224
 */
fn yuv_to_rgb_bt601(y: f32, u: f32, v: f32) -> vec3<f32> {
    // BT.601 conversion matrix (full range)
    // R = Y + 1.402 * V
    // G = Y - 0.344136 * U - 0.714136 * V
    // B = Y + 1.772 * U
    let r = y + 1.402 * v;
    let g = y - 0.344136 * u - 0.714136 * v;
    let b = y + 1.772 * u;
    return saturate3(vec3<f32>(r, g, b));
}

/**
 * Convert YUV to RGB using BT.709 standard (HD video)
 *
 * Input: Y in [0, 1], U/V in [-0.5, 0.5]
 * Output: RGB in [0, 1]
 */
fn yuv_to_rgb_bt709(y: f32, u: f32, v: f32) -> vec3<f32> {
    // BT.709 conversion matrix (full range)
    // R = Y + 1.5748 * V
    // G = Y - 0.1873 * U - 0.4681 * V
    // B = Y + 1.8556 * U
    let r = y + 1.5748 * v;
    let g = y - 0.1873 * u - 0.4681 * v;
    let b = y + 1.8556 * u;
    return saturate3(vec3<f32>(r, g, b));
}

/**
 * Convert YUV to RGB using BT.2020 standard (UHD/4K video)
 *
 * Input: Y in [0, 1], U/V in [-0.5, 0.5]
 * Output: RGB in [0, 1]
 */
fn yuv_to_rgb_bt2020(y: f32, u: f32, v: f32) -> vec3<f32> {
    // BT.2020 conversion matrix (full range)
    let r = y + 1.4746 * v;
    let g = y - 0.1646 * u - 0.5714 * v;
    let b = y + 1.8814 * u;
    return saturate3(vec3<f32>(r, g, b));
}

/**
 * Sample YUV420P texture and convert to RGB
 *
 * YUV420P layout:
 * - Y plane: full resolution (width × height)
 * - U plane: half resolution (width/2 × height/2)
 * - V plane: half resolution (width/2 × height/2)
 *
 * @param y_tex Y plane texture (R8 format)
 * @param u_tex U plane texture (R8 format)
 * @param v_tex V plane texture (R8 format)
 * @param tex_sampler Texture sampler
 * @param uv Texture coordinates [0, 1]
 * @param color_space 0=BT.601, 1=BT.709, 2=BT.2020
 */
fn sample_yuv420p_to_rgb(
    y_tex: texture_2d<f32>,
    u_tex: texture_2d<f32>,
    v_tex: texture_2d<f32>,
    tex_sampler: sampler,
    uv: vec2<f32>,
    color_space: i32
) -> vec3<f32> {
    // Sample Y at full resolution
    let y = textureSample(y_tex, tex_sampler, uv).r;

    // Sample U and V at half resolution (bilinear interpolation handles upscaling)
    let u = textureSample(u_tex, tex_sampler, uv).r - 0.5;
    let v = textureSample(v_tex, tex_sampler, uv).r - 0.5;

    // Convert based on color space
    if (color_space == 0) {
        return yuv_to_rgb_bt601(y, u, v);
    } else if (color_space == 1) {
        return yuv_to_rgb_bt709(y, u, v);
    } else {
        return yuv_to_rgb_bt2020(y, u, v);
    }
}

/**
 * Convert RGB to YUV using BT.709 standard
 * Useful for encoding or effects that work in YUV space
 */
fn rgb_to_yuv_bt709(rgb: vec3<f32>) -> vec3<f32> {
    let y = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
    let u = (rgb.b - y) / 1.8556;
    let v = (rgb.r - y) / 1.5748;
    return vec3<f32>(y, u + 0.5, v + 0.5);
}

// =============================================================================
// Coordinate Utilities
// =============================================================================

fn uv_to_pixel(uv: vec2<f32>, size: vec2<f32>) -> vec2<i32> {
    return vec2<i32>(uv * size);
}

fn pixel_to_uv(pixel: vec2<i32>, size: vec2<f32>) -> vec2<f32> {
    return (vec2<f32>(pixel) + 0.5) / size;
}

fn rotate_uv(uv: vec2<f32>, angle: f32, center: vec2<f32>) -> vec2<f32> {
    let cos_a = cos(angle);
    let sin_a = sin(angle);
    let centered = uv - center;
    return vec2<f32>(
        centered.x * cos_a - centered.y * sin_a,
        centered.x * sin_a + centered.y * cos_a
    ) + center;
}

fn scale_uv(uv: vec2<f32>, scale: vec2<f32>, center: vec2<f32>) -> vec2<f32> {
    return (uv - center) / scale + center;
}
`;
