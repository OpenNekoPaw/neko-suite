/**
 * Blend Mode Algorithms
 *
 * Pure blend mode implementations.
 * Platform-agnostic, can be used in JS, WGSL, and Rust.
 */

import type { BlendModeType } from '../types/blendMode';
import type { RGBA, HSLA } from '../types/geometry';

// =============================================================================
// Color Space Conversion
// =============================================================================

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;

	if (max === min) {
		return { h: 0, s: 0, l };
	}

	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

	let h: number;
	switch (max) {
		case r:
			h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
			break;
		case g:
			h = ((b - r) / d + 2) / 6;
			break;
		default:
			h = ((r - g) / d + 4) / 6;
			break;
	}

	return { h: h * 360, s, l };
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
	h = h / 360;

	if (s === 0) {
		return { r: l, g: l, b: l };
	}

	const hue2rgb = (p: number, q: number, t: number): number => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};

	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;

	return {
		r: hue2rgb(p, q, h + 1 / 3),
		g: hue2rgb(p, q, h),
		b: hue2rgb(p, q, h - 1 / 3),
	};
}

/**
 * Get luminosity of RGB color
 */
export function getLuminosity(r: number, g: number, b: number): number {
	return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Set luminosity of RGB color
 */
export function setLuminosity(
	r: number,
	g: number,
	b: number,
	lum: number
): { r: number; g: number; b: number } {
	const d = lum - getLuminosity(r, g, b);
	return clipColor(r + d, g + d, b + d);
}

/**
 * Clip color to valid range
 */
function clipColor(r: number, g: number, b: number): { r: number; g: number; b: number } {
	const l = getLuminosity(r, g, b);
	const n = Math.min(r, g, b);
	const x = Math.max(r, g, b);

	if (n < 0) {
		r = l + ((r - l) * l) / (l - n);
		g = l + ((g - l) * l) / (l - n);
		b = l + ((b - l) * l) / (l - n);
	}

	if (x > 1) {
		r = l + ((r - l) * (1 - l)) / (x - l);
		g = l + ((g - l) * (1 - l)) / (x - l);
		b = l + ((b - l) * (1 - l)) / (x - l);
	}

	return { r, g, b };
}

/**
 * Get saturation of RGB color
 */
export function getSaturation(r: number, g: number, b: number): number {
	return Math.max(r, g, b) - Math.min(r, g, b);
}

// =============================================================================
// Blend Mode Functions
// =============================================================================

type BlendFunc = (base: number, blend: number) => number;

// Normal modes
const normal: BlendFunc = (_base, blend) => blend;

// Darken modes
const darken: BlendFunc = (base, blend) => Math.min(base, blend);
const multiply: BlendFunc = (base, blend) => base * blend;
const colorBurn: BlendFunc = (base, blend) =>
	blend === 0 ? 0 : Math.max(0, 1 - (1 - base) / blend);
const linearBurn: BlendFunc = (base, blend) => Math.max(0, base + blend - 1);

// Lighten modes
const lighten: BlendFunc = (base, blend) => Math.max(base, blend);
const screen: BlendFunc = (base, blend) => 1 - (1 - base) * (1 - blend);
const colorDodge: BlendFunc = (base, blend) =>
	blend === 1 ? 1 : Math.min(1, base / (1 - blend));
const linearDodge: BlendFunc = (base, blend) => Math.min(1, base + blend);

// Contrast modes
const overlay: BlendFunc = (base, blend) =>
	base < 0.5 ? 2 * base * blend : 1 - 2 * (1 - base) * (1 - blend);
const softLight: BlendFunc = (base, blend) => {
	if (blend < 0.5) {
		return base - (1 - 2 * blend) * base * (1 - base);
	}
	const d = base <= 0.25
		? ((16 * base - 12) * base + 4) * base
		: Math.sqrt(base);
	return base + (2 * blend - 1) * (d - base);
};
const hardLight: BlendFunc = (base, blend) =>
	blend < 0.5 ? 2 * base * blend : 1 - 2 * (1 - base) * (1 - blend);
const vividLight: BlendFunc = (base, blend) =>
	blend < 0.5 ? colorBurn(base, 2 * blend) : colorDodge(base, 2 * (blend - 0.5));
const linearLight: BlendFunc = (base, blend) =>
	blend < 0.5 ? linearBurn(base, 2 * blend) : linearDodge(base, 2 * (blend - 0.5));
const pinLight: BlendFunc = (base, blend) =>
	blend < 0.5 ? Math.min(base, 2 * blend) : Math.max(base, 2 * (blend - 0.5));
const hardMix: BlendFunc = (base, blend) =>
	base + blend >= 1 ? 1 : 0;

// Inversion modes
const difference: BlendFunc = (base, blend) => Math.abs(base - blend);
const exclusion: BlendFunc = (base, blend) => base + blend - 2 * base * blend;
const subtract: BlendFunc = (base, blend) => Math.max(0, base - blend);
const divide: BlendFunc = (base, blend) =>
	blend === 0 ? 1 : Math.min(1, base / blend);

// =============================================================================
// Per-Channel Blend Functions
// =============================================================================

const CHANNEL_BLEND_FUNCS: Partial<Record<BlendModeType, BlendFunc>> = {
	normal,
	darken,
	multiply,
	colorBurn,
	linearBurn,
	lighten,
	screen,
	colorDodge,
	linearDodge,
	overlay,
	softLight,
	hardLight,
	vividLight,
	linearLight,
	pinLight,
	hardMix,
	difference,
	exclusion,
	subtract,
	divide,
};

// =============================================================================
// Full Color Blend Functions
// =============================================================================

type ColorBlendFunc = (base: RGBA, blend: RGBA) => RGBA;

/**
 * Blend using per-channel function
 */
function blendPerChannel(base: RGBA, blend: RGBA, func: BlendFunc): RGBA {
	return {
		r: func(base.r, blend.r),
		g: func(base.g, blend.g),
		b: func(base.b, blend.b),
		a: base.a, // Alpha handled separately
	};
}

/**
 * Darker color blend (compares total RGB)
 */
const darkerColor: ColorBlendFunc = (base, blend) => {
	const baseSum = base.r + base.g + base.b;
	const blendSum = blend.r + blend.g + blend.b;
	return blendSum < baseSum ? blend : base;
};

/**
 * Lighter color blend (compares total RGB)
 */
const lighterColor: ColorBlendFunc = (base, blend) => {
	const baseSum = base.r + base.g + base.b;
	const blendSum = blend.r + blend.g + blend.b;
	return blendSum > baseSum ? blend : base;
};

/**
 * Hue blend mode
 */
const hueBlend: ColorBlendFunc = (base, blend) => {
	const baseHsl = rgbToHsl(base.r, base.g, base.b);
	const blendHsl = rgbToHsl(blend.r, blend.g, blend.b);
	const result = hslToRgb(blendHsl.h, baseHsl.s, baseHsl.l);
	return { ...result, a: base.a };
};

/**
 * Saturation blend mode
 */
const saturationBlend: ColorBlendFunc = (base, blend) => {
	const baseHsl = rgbToHsl(base.r, base.g, base.b);
	const blendHsl = rgbToHsl(blend.r, blend.g, blend.b);
	const result = hslToRgb(baseHsl.h, blendHsl.s, baseHsl.l);
	return { ...result, a: base.a };
};

/**
 * Color blend mode
 */
const colorBlend: ColorBlendFunc = (base, blend) => {
	const baseHsl = rgbToHsl(base.r, base.g, base.b);
	const blendHsl = rgbToHsl(blend.r, blend.g, blend.b);
	const result = hslToRgb(blendHsl.h, blendHsl.s, baseHsl.l);
	return { ...result, a: base.a };
};

/**
 * Luminosity blend mode
 */
const luminosityBlend: ColorBlendFunc = (base, blend) => {
	const result = setLuminosity(base.r, base.g, base.b, getLuminosity(blend.r, blend.g, blend.b));
	return { ...result, a: base.a };
};

/**
 * Dissolve blend mode (random pixel selection)
 */
const dissolveBlend: ColorBlendFunc = (base, blend) => {
	// In actual implementation, this would use a random threshold per pixel
	// Here we just return blend for simplicity
	return blend;
};

// =============================================================================
// Main Blend Function
// =============================================================================

/**
 * Blend two colors using specified blend mode
 * @param base Base/bottom color
 * @param blend Blend/top color
 * @param mode Blend mode
 * @param opacity Blend opacity (0-1)
 * @returns Blended color
 */
export function blendColors(
	base: RGBA,
	blend: RGBA,
	mode: BlendModeType,
	opacity: number = 1
): RGBA {
	let result: RGBA;

	// Check for per-channel blend function
	const channelFunc = CHANNEL_BLEND_FUNCS[mode];
	if (channelFunc) {
		result = blendPerChannel(base, blend, channelFunc);
	} else {
		// Use full color blend function
		switch (mode) {
			case 'dissolve':
				result = dissolveBlend(base, blend);
				break;
			case 'darkerColor':
				result = darkerColor(base, blend);
				break;
			case 'lighterColor':
				result = lighterColor(base, blend);
				break;
			case 'hue':
				result = hueBlend(base, blend);
				break;
			case 'saturation':
				result = saturationBlend(base, blend);
				break;
			case 'color':
				result = colorBlend(base, blend);
				break;
			case 'luminosity':
				result = luminosityBlend(base, blend);
				break;
			default:
				result = blend;
		}
	}

	// Apply opacity and alpha compositing
	const effectiveOpacity = opacity * blend.a;
	return {
		r: base.r + (result.r - base.r) * effectiveOpacity,
		g: base.g + (result.g - base.g) * effectiveOpacity,
		b: base.b + (result.b - base.b) * effectiveOpacity,
		a: base.a + (1 - base.a) * effectiveOpacity,
	};
}

/**
 * Get blend function for a specific mode (for shader generation)
 */
export function getBlendFunction(mode: BlendModeType): BlendFunc | null {
	return CHANNEL_BLEND_FUNCS[mode] ?? null;
}
