/**
 * Color Correction Parameter Mapping
 *
 * Provides mapping between Web color correction parameters and Rust effect parameters.
 * This ensures visual consistency between Basic Mode (Web preview) and Compatible Mode (Rust export).
 *
 * Parameter Range Summary:
 * | Parameter    | Web Range      | Rust Range     | Conversion                           |
 * |--------------|----------------|----------------|--------------------------------------|
 * | exposure     | -5 to 5        | -3 to 3        | rust = web * 0.6                     |
 * | contrast     | -100 to 100    | 0 to 2         | rust = (web + 100) / 100             |
 * | saturation   | -100 to 100    | 0 to 2         | rust = (web + 100) / 100             |
 * | brightness   | N/A (Web)      | -1 to 1        | Added to Web                         |
 * | gamma        | N/A (Web)      | 0.1 to 3       | Added to Web, default 1.0            |
 * | hueShift     | N/A (Web)      | -180 to 180    | Added to Web                         |
 * | vibrance     | -100 to 100    | -1 to 1        | rust = web / 100                     |
 * | temperature  | -100 to 100    | -100 to 100    | Same                                 |
 * | tint         | -100 to 100    | -100 to 100    | Same                                 |
 * | highlights   | -100 to 100    | -1 to 1        | rust = web / 100                     |
 * | shadows      | -100 to 100    | -1 to 1        | rust = web / 100                     |
 * | whites       | -100 to 100    | -1 to 1        | rust = web / 100                     |
 * | blacks       | -100 to 100    | -1 to 1        | rust = web / 100                     |
 */

import type { BasicColorAdjustment } from '../types/colorCorrection';

// =============================================================================
// Types
// =============================================================================

/**
 * Extended Web color correction parameters (includes missing parameters)
 */
export interface ExtendedWebColorParams extends BasicColorAdjustment {
	/** Brightness adjustment (-100 to 100, 0 = no change) */
	brightness: number;
	/** Gamma adjustment (0.1 to 3.0, 1.0 = no change) */
	gamma: number;
	/** Hue shift in degrees (-180 to 180, 0 = no change) */
	hueShift: number;
}

/**
 * Rust effect parameters format
 * Matches the Uniforms struct in color_correction shader
 */
export interface RustEffectParams {
	/** Brightness adjustment (-1.0 to 1.0) */
	brightness: number;
	/** Contrast multiplier (0.0 to 2.0, 1.0 = no change) */
	contrast: number;
	/** Saturation multiplier (0.0 to 2.0, 1.0 = no change) */
	saturation: number;
	/** Exposure in stops (-3.0 to 3.0) */
	exposure: number;
	/** Gamma correction (0.1 to 3.0, 1.0 = no change) */
	gamma: number;
	/** Hue shift in degrees (-180 to 180) */
	hueShift: number;
	/** Vibrance adjustment (-1.0 to 1.0) */
	vibrance: number;
	/** Color temperature adjustment (-100 to 100) */
	temperature: number;
	/** Tint adjustment (-100 to 100) */
	tint: number;
	/** Highlights adjustment (-1.0 to 1.0) */
	highlights: number;
	/** Shadows adjustment (-1.0 to 1.0) */
	shadows: number;
	/** Whites adjustment (-1.0 to 1.0) */
	whites: number;
	/** Blacks adjustment (-1.0 to 1.0) */
	blacks: number;
}

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULT_EXTENDED_WEB_PARAMS: ExtendedWebColorParams = {
	exposure: 0,
	contrast: 0,
	highlights: 0,
	shadows: 0,
	whites: 0,
	blacks: 0,
	temperature: 0,
	tint: 0,
	saturation: 0,
	vibrance: 0,
	clarity: 0,
	dehaze: 0,
	brightness: 0,
	gamma: 1,
	hueShift: 0,
};

export const DEFAULT_RUST_EFFECT_PARAMS: RustEffectParams = {
	brightness: 0,
	contrast: 1,
	saturation: 1,
	exposure: 0,
	gamma: 1,
	hueShift: 0,
	vibrance: 0,
	temperature: 0,
	tint: 0,
	highlights: 0,
	shadows: 0,
	whites: 0,
	blacks: 0,
};

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert Web color correction parameters to Rust effect parameters
 *
 * @param web - Web color parameters (BasicColorAdjustment with optional extensions)
 * @returns Rust-compatible effect parameters
 */
export function webColorToRust(
	web: BasicColorAdjustment | ExtendedWebColorParams
): RustEffectParams {
	const extended = web as ExtendedWebColorParams;

	return {
		// Exposure: Web -5~5 → Rust -3~3 (scale by 0.6)
		exposure: clamp(web.exposure * 0.6, -3, 3),

		// Contrast: Web -100~100 → Rust 0~2 (map to multiplier)
		contrast: clamp((web.contrast + 100) / 100, 0, 2),

		// Saturation: Web -100~100 → Rust 0~2 (map to multiplier)
		saturation: clamp((web.saturation + 100) / 100, 0, 2),

		// Brightness: Web -100~100 → Rust -1~1 (or use extended value)
		brightness: extended.brightness !== undefined
			? clamp(extended.brightness / 100, -1, 1)
			: 0,

		// Gamma: Web 0.1~3 → Rust 0.1~3 (same scale, or default 1)
		gamma: extended.gamma !== undefined
			? clamp(extended.gamma, 0.1, 3)
			: 1,

		// Hue Shift: Web -180~180 → Rust -180~180 (same scale)
		hueShift: extended.hueShift !== undefined
			? clamp(extended.hueShift, -180, 180)
			: 0,

		// Vibrance: Web -100~100 → Rust -1~1
		vibrance: clamp(web.vibrance / 100, -1, 1),

		// Temperature: Same scale (-100 to 100)
		temperature: clamp(web.temperature, -100, 100),

		// Tint: Same scale (-100 to 100)
		tint: clamp(web.tint, -100, 100),

		// Highlights: Web -100~100 → Rust -1~1
		highlights: clamp(web.highlights / 100, -1, 1),

		// Shadows: Web -100~100 → Rust -1~1
		shadows: clamp(web.shadows / 100, -1, 1),

		// Whites: Web -100~100 → Rust -1~1
		whites: clamp(web.whites / 100, -1, 1),

		// Blacks: Web -100~100 → Rust -1~1
		blacks: clamp(web.blacks / 100, -1, 1),
	};
}

/**
 * Convert Rust effect parameters to Web color correction parameters
 *
 * @param rust - Rust effect parameters
 * @returns Web-compatible color parameters
 */
export function rustColorToWeb(rust: RustEffectParams): ExtendedWebColorParams {
	return {
		// Exposure: Rust -3~3 → Web -5~5 (scale by 1/0.6 ≈ 1.667)
		exposure: clamp(rust.exposure / 0.6, -5, 5),

		// Contrast: Rust 0~2 → Web -100~100
		contrast: clamp(rust.contrast * 100 - 100, -100, 100),

		// Saturation: Rust 0~2 → Web -100~100
		saturation: clamp(rust.saturation * 100 - 100, -100, 100),

		// Brightness: Rust -1~1 → Web -100~100
		brightness: clamp(rust.brightness * 100, -100, 100),

		// Gamma: Same scale
		gamma: clamp(rust.gamma, 0.1, 3),

		// Hue Shift: Same scale
		hueShift: clamp(rust.hueShift, -180, 180),

		// Vibrance: Rust -1~1 → Web -100~100
		vibrance: clamp(rust.vibrance * 100, -100, 100),

		// Temperature: Same scale
		temperature: clamp(rust.temperature, -100, 100),

		// Tint: Same scale
		tint: clamp(rust.tint, -100, 100),

		// Highlights: Rust -1~1 → Web -100~100
		highlights: clamp(rust.highlights * 100, -100, 100),

		// Shadows: Rust -1~1 → Web -100~100
		shadows: clamp(rust.shadows * 100, -100, 100),

		// Whites: Rust -1~1 → Web -100~100
		whites: clamp(rust.whites * 100, -100, 100),

		// Blacks: Rust -1~1 → Web -100~100
		blacks: clamp(rust.blacks * 100, -100, 100),

		// These don't have Rust equivalents, set to default
		clarity: 0,
		dehaze: 0,
	};
}

/**
 * Check if color correction has any non-default values
 */
export function hasColorCorrection(params: BasicColorAdjustment): boolean {
	return (
		params.exposure !== 0 ||
		params.contrast !== 0 ||
		params.highlights !== 0 ||
		params.shadows !== 0 ||
		params.whites !== 0 ||
		params.blacks !== 0 ||
		params.temperature !== 0 ||
		params.tint !== 0 ||
		params.saturation !== 0 ||
		params.vibrance !== 0 ||
		params.clarity !== 0 ||
		params.dehaze !== 0
	);
}

/**
 * Check if Rust effect params have any non-default values
 */
export function hasRustEffects(params: RustEffectParams): boolean {
	return (
		params.brightness !== 0 ||
		params.contrast !== 1 ||
		params.saturation !== 1 ||
		params.exposure !== 0 ||
		params.gamma !== 1 ||
		params.hueShift !== 0 ||
		params.vibrance !== 0 ||
		params.temperature !== 0 ||
		params.tint !== 0 ||
		params.highlights !== 0 ||
		params.shadows !== 0 ||
		params.whites !== 0 ||
		params.blacks !== 0
	);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/**
 * Interpolate between two color correction parameter sets
 *
 * @param a - Start parameters
 * @param b - End parameters
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated parameters
 */
export function lerpColorParams(
	a: RustEffectParams,
	b: RustEffectParams,
	t: number
): RustEffectParams {
	const lerp = (start: number, end: number) => start + (end - start) * t;

	return {
		brightness: lerp(a.brightness, b.brightness),
		contrast: lerp(a.contrast, b.contrast),
		saturation: lerp(a.saturation, b.saturation),
		exposure: lerp(a.exposure, b.exposure),
		gamma: lerp(a.gamma, b.gamma),
		hueShift: lerp(a.hueShift, b.hueShift),
		vibrance: lerp(a.vibrance, b.vibrance),
		temperature: lerp(a.temperature, b.temperature),
		tint: lerp(a.tint, b.tint),
		highlights: lerp(a.highlights, b.highlights),
		shadows: lerp(a.shadows, b.shadows),
		whites: lerp(a.whites, b.whites),
		blacks: lerp(a.blacks, b.blacks),
	};
}
