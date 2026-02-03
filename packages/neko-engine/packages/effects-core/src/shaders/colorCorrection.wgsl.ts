/**
 * Color Correction WGSL Shaders
 *
 * Professional color grading implementations.
 * Compatible with WebGPU and wgpu.
 */

export const COLOR_CORRECTION_WGSL = /* wgsl */ `
// =============================================================================
// Basic Adjustments
// =============================================================================

fn apply_exposure(color: vec3<f32>, stops: f32) -> vec3<f32> {
    return color * pow(2.0, stops);
}

fn apply_brightness(color: vec3<f32>, amount: f32) -> vec3<f32> {
    return color + amount;
}

fn apply_contrast(color: vec3<f32>, amount: f32) -> vec3<f32> {
    return (color - 0.5) * amount + 0.5;
}

fn apply_gamma(color: vec3<f32>, gamma: f32) -> vec3<f32> {
    return pow(max(color, vec3<f32>(0.0)), vec3<f32>(1.0 / gamma));
}

fn apply_saturation(color: vec3<f32>, amount: f32) -> vec3<f32> {
    let gray = luminance(color);
    return mix(vec3<f32>(gray), color, amount);
}

fn apply_vibrance(color: vec3<f32>, amount: f32) -> vec3<f32> {
    let max_c = max(max(color.r, color.g), color.b);
    let min_c = min(min(color.r, color.g), color.b);
    let sat = max_c - min_c;
    // Apply more saturation to less saturated colors
    let factor = 1.0 + amount * (1.0 - sat);
    let gray = luminance(color);
    return mix(vec3<f32>(gray), color, factor);
}

fn apply_hue_shift(color: vec3<f32>, degrees: f32) -> vec3<f32> {
    var hsl = rgb_to_hsl(color);
    hsl.x = fract(hsl.x + degrees / 360.0);
    return hsl_to_rgb(hsl);
}

// =============================================================================
// Temperature and Tint
// =============================================================================

fn apply_temperature(color: vec3<f32>, temp: f32) -> vec3<f32> {
    // Simplified temperature adjustment
    let shift = temp / 100.0;
    return vec3<f32>(
        color.r + shift * 0.1,
        color.g,
        color.b - shift * 0.1
    );
}

fn apply_tint(color: vec3<f32>, tint: f32) -> vec3<f32> {
    let shift = tint / 100.0;
    return vec3<f32>(
        color.r,
        color.g + shift * 0.1,
        color.b
    );
}

// More accurate white balance using color temperature in Kelvin
fn kelvin_to_rgb(kelvin: f32) -> vec3<f32> {
    let temp = kelvin / 100.0;
    var r: f32;
    var g: f32;
    var b: f32;

    if (temp <= 66.0) {
        r = 1.0;
        g = saturate((99.4708025861 * log(temp) - 161.1195681661) / 255.0);
    } else {
        r = saturate((329.698727446 * pow(temp - 60.0, -0.1332047592)) / 255.0);
        g = saturate((288.1221695283 * pow(temp - 60.0, -0.0755148492)) / 255.0);
    }

    if (temp >= 66.0) {
        b = 1.0;
    } else if (temp <= 19.0) {
        b = 0.0;
    } else {
        b = saturate((138.5177312231 * log(temp - 10.0) - 305.0447927307) / 255.0);
    }

    return vec3<f32>(r, g, b);
}

// =============================================================================
// Shadows/Highlights
// =============================================================================

fn apply_shadows(color: vec3<f32>, amount: f32) -> vec3<f32> {
    let lum = luminance(color);
    // Affect darker regions more
    let shadow_mask = 1.0 - smoothstep(0.0, 0.5, lum);
    return color + amount * shadow_mask;
}

fn apply_highlights(color: vec3<f32>, amount: f32) -> vec3<f32> {
    let lum = luminance(color);
    // Affect brighter regions more
    let highlight_mask = smoothstep(0.5, 1.0, lum);
    return color + amount * highlight_mask;
}

fn apply_whites(color: vec3<f32>, amount: f32) -> vec3<f32> {
    let lum = luminance(color);
    let white_mask = smoothstep(0.75, 1.0, lum);
    return color + amount * white_mask;
}

fn apply_blacks(color: vec3<f32>, amount: f32) -> vec3<f32> {
    let lum = luminance(color);
    let black_mask = 1.0 - smoothstep(0.0, 0.25, lum);
    return color + amount * black_mask;
}

// =============================================================================
// Curves
// =============================================================================

// Sample a curve defined by control points
// For GPU, curves are typically baked into a 1D LUT texture
fn sample_curve_lut(value: f32, lut: texture_1d<f32>, lut_sampler: sampler) -> f32 {
    return textureSample(lut, lut_sampler, value).r;
}

// Simplified S-curve for contrast
fn apply_s_curve(value: f32, strength: f32) -> f32 {
    let x = value * 2.0 - 1.0; // Map to -1..1
    let curved = x * (1.0 + strength * (1.0 - x * x));
    return curved * 0.5 + 0.5; // Map back to 0..1
}

// =============================================================================
// Levels
// =============================================================================

fn apply_levels(
    value: f32,
    input_black: f32,
    input_white: f32,
    gamma: f32,
    output_black: f32,
    output_white: f32
) -> f32 {
    // Input mapping
    let normalized = saturate((value - input_black) / (input_white - input_black));
    // Gamma
    let gamma_corrected = pow(normalized, 1.0 / gamma);
    // Output mapping
    return mix(output_black, output_white, gamma_corrected);
}

fn apply_levels_rgb(
    color: vec3<f32>,
    input_black: vec3<f32>,
    input_white: vec3<f32>,
    gamma: vec3<f32>,
    output_black: vec3<f32>,
    output_white: vec3<f32>
) -> vec3<f32> {
    return vec3<f32>(
        apply_levels(color.r, input_black.r, input_white.r, gamma.r, output_black.r, output_white.r),
        apply_levels(color.g, input_black.g, input_white.g, gamma.g, output_black.g, output_white.g),
        apply_levels(color.b, input_black.b, input_white.b, gamma.b, output_black.b, output_white.b)
    );
}

// =============================================================================
// HSL Per-Color Adjustments
// =============================================================================

// Get weight for a specific hue range
fn get_hue_weight(hue: f32, target_hue: f32, range: f32) -> f32 {
    let diff = abs(hue - target_hue);
    let wrapped_diff = min(diff, 1.0 - diff);
    return 1.0 - smoothstep(0.0, range, wrapped_diff);
}

fn apply_hsl_adjustment(
    color: vec3<f32>,
    target_hue: f32,  // 0-1 (normalized)
    hue_shift: f32,   // -0.5 to 0.5
    sat_adjust: f32,  // -1 to 1
    lum_adjust: f32   // -1 to 1
) -> vec3<f32> {
    var hsl = rgb_to_hsl(color);
    let weight = get_hue_weight(hsl.x, target_hue, 0.1);

    hsl.x = fract(hsl.x + hue_shift * weight);
    hsl.y = saturate(hsl.y + sat_adjust * weight);
    hsl.z = saturate(hsl.z + lum_adjust * weight);

    return hsl_to_rgb(hsl);
}

// =============================================================================
// Color Wheels (3-Way Color Correction)
// =============================================================================

fn apply_color_wheel(
    color: vec3<f32>,
    shadows_color: vec3<f32>,
    shadows_brightness: f32,
    midtones_color: vec3<f32>,
    midtones_brightness: f32,
    highlights_color: vec3<f32>,
    highlights_brightness: f32
) -> vec3<f32> {
    let lum = luminance(color);

    // Calculate masks
    let shadow_mask = 1.0 - smoothstep(0.0, 0.33, lum);
    let highlight_mask = smoothstep(0.66, 1.0, lum);
    let midtone_mask = 1.0 - shadow_mask - highlight_mask;

    // Apply color shifts
    var result = color;
    result += (shadows_color - 0.5) * 2.0 * shadow_mask;
    result += shadows_brightness * shadow_mask;
    result += (midtones_color - 0.5) * 2.0 * midtone_mask;
    result += midtones_brightness * midtone_mask;
    result += (highlights_color - 0.5) * 2.0 * highlight_mask;
    result += highlights_brightness * highlight_mask;

    return saturate3(result);
}

// =============================================================================
// LUT Application
// =============================================================================

// Sample 3D LUT (stored as 2D texture atlas)
fn sample_lut_3d(
    color: vec3<f32>,
    lut: texture_2d<f32>,
    lut_sampler: sampler,
    lut_size: f32
) -> vec3<f32> {
    let scaled = color * (lut_size - 1.0);
    let b_low = floor(scaled.b);
    let b_high = ceil(scaled.b);
    let b_frac = fract(scaled.b);

    // Calculate UV coordinates for low and high blue slices
    let uv_low = vec2<f32>(
        (b_low * lut_size + scaled.r + 0.5) / (lut_size * lut_size),
        (scaled.g + 0.5) / lut_size
    );
    let uv_high = vec2<f32>(
        (b_high * lut_size + scaled.r + 0.5) / (lut_size * lut_size),
        (scaled.g + 0.5) / lut_size
    );

    // Sample and interpolate
    let color_low = textureSample(lut, lut_sampler, uv_low).rgb;
    let color_high = textureSample(lut, lut_sampler, uv_high).rgb;

    return mix(color_low, color_high, b_frac);
}

// =============================================================================
// Complete Color Correction Pipeline
// =============================================================================

struct ColorCorrectionParams {
    exposure: f32,
    contrast: f32,
    highlights: f32,
    shadows: f32,
    whites: f32,
    blacks: f32,
    temperature: f32,
    tint: f32,
    vibrance: f32,
    saturation: f32,
    hue_shift: f32,
    gamma: f32,
}

fn apply_color_correction(color: vec3<f32>, params: ColorCorrectionParams) -> vec3<f32> {
    var result = color;

    // Exposure (first, as it's a multiplicative operation)
    result = apply_exposure(result, params.exposure);

    // Temperature and tint
    result = apply_temperature(result, params.temperature);
    result = apply_tint(result, params.tint);

    // Tonal adjustments
    result = apply_highlights(result, params.highlights);
    result = apply_shadows(result, params.shadows);
    result = apply_whites(result, params.whites);
    result = apply_blacks(result, params.blacks);

    // Contrast
    result = apply_contrast(result, params.contrast);

    // Gamma
    result = apply_gamma(result, params.gamma);

    // Color adjustments
    result = apply_vibrance(result, params.vibrance);
    result = apply_saturation(result, params.saturation);
    result = apply_hue_shift(result, params.hue_shift);

    return saturate3(result);
}
`;
