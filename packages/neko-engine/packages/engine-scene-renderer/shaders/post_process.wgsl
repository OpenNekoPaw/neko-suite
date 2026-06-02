// Post-processing shader: tone mapping + color grading
//
// Applied as a fullscreen pass after PBR rendering.
// Converts HDR Rgba16Float -> tone-mapped output.

struct PostProcessUniforms {
    exposure: f32,
    bloom_intensity: f32,
    bloom_threshold: f32,
    vignette_intensity: f32,
    contrast: f32,
    saturation: f32,
    gamma: f32,
    tone_mapping_mode: u32,  // 0=none, 1=reinhard, 2=aces, 3=uncharted2
    resolution: vec2<f32>,
    anti_aliasing_strength: f32,
    _padding: f32,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(0) @binding(2) var<uniform> params: PostProcessUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// Fullscreen triangle
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(vertex_index & 1u) * 4 - 1);
    let y = f32(i32(vertex_index >> 1u) * 4 - 1);
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>(x * 0.5 + 0.5, 1.0 - (y * 0.5 + 0.5));
    return out;
}

// ============================================================
// Tone mapping operators
// ============================================================

fn tone_map_reinhard(color: vec3<f32>) -> vec3<f32> {
    return color / (color + vec3<f32>(1.0));
}

fn tone_map_aces(color: vec3<f32>) -> vec3<f32> {
    // Narkowicz 2015, "ACES Filmic Tone Mapping Curve"
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn uncharted2_partial(x: vec3<f32>) -> vec3<f32> {
    let a = 0.15;
    let b = 0.50;
    let c = 0.10;
    let d = 0.20;
    let e = 0.02;
    let f = 0.30;
    return ((x * (a * x + c * b) + d * e) / (x * (a * x + b) + d * f)) - e / f;
}

fn tone_map_uncharted2(color: vec3<f32>) -> vec3<f32> {
    let exposure_bias = 2.0;
    let curr = uncharted2_partial(color * exposure_bias);
    let w = vec3<f32>(11.2);
    let white_scale = vec3<f32>(1.0) / uncharted2_partial(w);
    return curr * white_scale;
}

// ============================================================
// Color grading
// ============================================================

fn luminance(color: vec3<f32>) -> f32 {
    return dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn apply_contrast(color: vec3<f32>, contrast: f32) -> vec3<f32> {
    let midpoint = vec3<f32>(0.5);
    return midpoint + (color - midpoint) * (1.0 + contrast);
}

fn apply_saturation(color: vec3<f32>, saturation: f32) -> vec3<f32> {
    let lum = luminance(color);
    return mix(vec3<f32>(lum), color, 1.0 + saturation);
}

fn apply_vignette(color: vec3<f32>, uv: vec2<f32>, intensity: f32) -> vec3<f32> {
    let center = uv - vec2<f32>(0.5);
    let dist = length(center);
    let vignette = 1.0 - smoothstep(0.3, 0.8, dist) * intensity;
    return color * vignette;
}

fn sample_input_raw(uv: vec2<f32>) -> vec3<f32> {
    return textureSample(input_texture, input_sampler, clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0))).rgb;
}

fn sample_input(uv: vec2<f32>) -> vec3<f32> {
    let input_dimensions = textureDimensions(input_texture);
    let input_resolution = vec2<f32>(f32(input_dimensions.x), f32(input_dimensions.y));
    let output_resolution = max(params.resolution, vec2<f32>(1.0));
    let scale = input_resolution / output_resolution;
    if max(scale.x, scale.y) <= 1.05 {
        return sample_input_raw(uv);
    }

    let radius = min(scale, vec2<f32>(2.0)) * 0.28 / max(input_resolution, vec2<f32>(1.0));
    let center = sample_input_raw(uv);
    let north = sample_input_raw(uv + vec2<f32>(0.0, -radius.y));
    let south = sample_input_raw(uv + vec2<f32>(0.0, radius.y));
    let east = sample_input_raw(uv + vec2<f32>(radius.x, 0.0));
    let west = sample_input_raw(uv + vec2<f32>(-radius.x, 0.0));

    return center * 0.5 + (north + south + east + west) * 0.125;
}

fn apply_edge_antialias(color: vec3<f32>, uv: vec2<f32>, strength: f32) -> vec3<f32> {
    if strength <= 0.0 {
        return color;
    }

    let input_dimensions = textureDimensions(input_texture);
    let input_resolution = vec2<f32>(f32(input_dimensions.x), f32(input_dimensions.y));
    let texel = vec2<f32>(1.0) / max(input_resolution, vec2<f32>(1.0));
    let north = sample_input_raw(uv + vec2<f32>(0.0, -texel.y));
    let south = sample_input_raw(uv + vec2<f32>(0.0, texel.y));
    let east = sample_input_raw(uv + vec2<f32>(texel.x, 0.0));
    let west = sample_input_raw(uv + vec2<f32>(-texel.x, 0.0));

    let center_luma = luminance(color);
    let north_luma = luminance(north);
    let south_luma = luminance(south);
    let east_luma = luminance(east);
    let west_luma = luminance(west);
    let min_luma = min(center_luma, min(min(north_luma, south_luma), min(east_luma, west_luma)));
    let max_luma = max(center_luma, max(max(north_luma, south_luma), max(east_luma, west_luma)));
    let range = max_luma - min_luma;
    let local_luma_scale = max(1.0, max_luma);
    let edge = smoothstep(0.035 * local_luma_scale, 0.16 * local_luma_scale, range);
    let neighborhood = (north + south + east + west) * 0.25;

    return mix(color, neighborhood, edge * clamp(strength, 0.0, 1.0) * 0.42);
}

// ============================================================
// Fragment shader
// ============================================================

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var color = sample_input(in.uv);

    // Exposure adjustment
    color = color * params.exposure;

    // Tone mapping
    switch params.tone_mapping_mode {
        case 1u: { color = tone_map_reinhard(color); }
        case 2u: { color = tone_map_aces(color); }
        case 3u: { color = tone_map_uncharted2(color); }
        default: {} // No tone mapping
    }

    // Color grading (after tone mapping, in [0,1] range)
    color = apply_contrast(color, params.contrast);
    color = apply_saturation(color, params.saturation);

    // Vignette
    if params.vignette_intensity > 0.0 {
        color = apply_vignette(color, in.uv, params.vignette_intensity);
    }

    color = apply_edge_antialias(color, in.uv, params.anti_aliasing_strength);

    // Gamma correction
    color = pow(max(color, vec3<f32>(0.0)), vec3<f32>(1.0 / params.gamma));

    return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
