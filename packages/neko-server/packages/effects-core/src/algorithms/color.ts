/**
 * Color Algorithms
 *
 * Color manipulation and conversion functions.
 * Platform-agnostic, can be used in JS, WGSL, and Rust.
 */

import type { RGBA, HSLA, HSVA } from '../types/geometry';

// =============================================================================
// Color Space Conversions
// =============================================================================

/**
 * Convert RGBA to HSLA
 */
export function rgbaToHsla(color: RGBA): HSLA {
	const { r, g, b, a } = color;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;

	if (max === min) {
		return { h: 0, s: 0, l, a };
	}

	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

	let h: number;
	switch (max) {
		case r:
			h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
			break;
		case g:
			h = ((b - r) / d + 2) * 60;
			break;
		default:
			h = ((r - g) / d + 4) * 60;
			break;
	}

	return { h, s, l, a };
}

/**
 * Convert HSLA to RGBA
 */
export function hslaToRgba(color: HSLA): RGBA {
	const { h, s, l, a } = color;
	const hNorm = h / 360;

	if (s === 0) {
		return { r: l, g: l, b: l, a };
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
		r: hue2rgb(p, q, hNorm + 1 / 3),
		g: hue2rgb(p, q, hNorm),
		b: hue2rgb(p, q, hNorm - 1 / 3),
		a,
	};
}

/**
 * Convert RGBA to HSVA
 */
export function rgbaToHsva(color: RGBA): HSVA {
	const { r, g, b, a } = color;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	const v = max;
	const s = max === 0 ? 0 : d / max;

	if (max === min) {
		return { h: 0, s, v, a };
	}

	let h: number;
	switch (max) {
		case r:
			h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
			break;
		case g:
			h = ((b - r) / d + 2) * 60;
			break;
		default:
			h = ((r - g) / d + 4) * 60;
			break;
	}

	return { h, s, v, a };
}

/**
 * Convert HSVA to RGBA
 */
export function hsvaToRgba(color: HSVA): RGBA {
	const { h, s, v, a } = color;
	const hNorm = h / 60;
	const i = Math.floor(hNorm);
	const f = hNorm - i;
	const p = v * (1 - s);
	const q = v * (1 - s * f);
	const t = v * (1 - s * (1 - f));

	let r: number, g: number, b: number;
	switch (i % 6) {
		case 0: r = v; g = t; b = p; break;
		case 1: r = q; g = v; b = p; break;
		case 2: r = p; g = v; b = t; break;
		case 3: r = p; g = q; b = v; break;
		case 4: r = t; g = p; b = v; break;
		default: r = v; g = p; b = q; break;
	}

	return { r, g, b, a };
}

// =============================================================================
// Color Adjustments
// =============================================================================

/**
 * Adjust brightness
 * @param color Input color
 * @param amount Adjustment amount (-1 to 1)
 */
export function adjustBrightness(color: RGBA, amount: number): RGBA {
	return {
		r: Math.max(0, Math.min(1, color.r + amount)),
		g: Math.max(0, Math.min(1, color.g + amount)),
		b: Math.max(0, Math.min(1, color.b + amount)),
		a: color.a,
	};
}

/**
 * Adjust contrast
 * @param color Input color
 * @param amount Contrast multiplier (0 to 2, 1 = no change)
 */
export function adjustContrast(color: RGBA, amount: number): RGBA {
	return {
		r: Math.max(0, Math.min(1, (color.r - 0.5) * amount + 0.5)),
		g: Math.max(0, Math.min(1, (color.g - 0.5) * amount + 0.5)),
		b: Math.max(0, Math.min(1, (color.b - 0.5) * amount + 0.5)),
		a: color.a,
	};
}

/**
 * Adjust saturation
 * @param color Input color
 * @param amount Saturation multiplier (0 to 2, 1 = no change)
 */
export function adjustSaturation(color: RGBA, amount: number): RGBA {
	const hsla = rgbaToHsla(color);
	hsla.s = Math.max(0, Math.min(1, hsla.s * amount));
	return hslaToRgba(hsla);
}

/**
 * Adjust hue
 * @param color Input color
 * @param degrees Hue rotation in degrees
 */
export function adjustHue(color: RGBA, degrees: number): RGBA {
	const hsla = rgbaToHsla(color);
	hsla.h = (hsla.h + degrees + 360) % 360;
	return hslaToRgba(hsla);
}

/**
 * Apply gamma correction
 * @param color Input color
 * @param gamma Gamma value (1 = no change)
 */
export function applyGamma(color: RGBA, gamma: number): RGBA {
	const invGamma = 1 / gamma;
	return {
		r: Math.pow(Math.max(0, color.r), invGamma),
		g: Math.pow(Math.max(0, color.g), invGamma),
		b: Math.pow(Math.max(0, color.b), invGamma),
		a: color.a,
	};
}

/**
 * Apply exposure adjustment
 * @param color Input color
 * @param stops Exposure stops (-3 to 3)
 */
export function applyExposure(color: RGBA, stops: number): RGBA {
	const multiplier = Math.pow(2, stops);
	return {
		r: Math.max(0, Math.min(1, color.r * multiplier)),
		g: Math.max(0, Math.min(1, color.g * multiplier)),
		b: Math.max(0, Math.min(1, color.b * multiplier)),
		a: color.a,
	};
}

/**
 * Apply temperature adjustment
 * @param color Input color
 * @param amount Temperature shift (-100 to 100)
 */
export function applyTemperature(color: RGBA, amount: number): RGBA {
	const shift = amount / 100;
	return {
		r: Math.max(0, Math.min(1, color.r + shift * 0.1)),
		g: color.g,
		b: Math.max(0, Math.min(1, color.b - shift * 0.1)),
		a: color.a,
	};
}

/**
 * Apply tint adjustment
 * @param color Input color
 * @param amount Tint shift (-100 to 100)
 */
export function applyTint(color: RGBA, amount: number): RGBA {
	const shift = amount / 100;
	return {
		r: color.r,
		g: Math.max(0, Math.min(1, color.g + shift * 0.1)),
		b: color.b,
		a: color.a,
	};
}

// =============================================================================
// Color Utilities
// =============================================================================

/**
 * Get luminance of a color (perceived brightness)
 */
export function getLuminance(color: RGBA): number {
	// sRGB luminance formula
	return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

/**
 * Get relative luminance for WCAG contrast calculations
 */
export function getRelativeLuminance(color: RGBA): number {
	const toLinear = (c: number) =>
		c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

	return (
		0.2126 * toLinear(color.r) +
		0.7152 * toLinear(color.g) +
		0.0722 * toLinear(color.b)
	);
}

/**
 * Calculate contrast ratio between two colors (WCAG)
 */
export function getContrastRatio(color1: RGBA, color2: RGBA): number {
	const l1 = getRelativeLuminance(color1);
	const l2 = getRelativeLuminance(color2);
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Invert a color
 */
export function invertColor(color: RGBA): RGBA {
	return {
		r: 1 - color.r,
		g: 1 - color.g,
		b: 1 - color.b,
		a: color.a,
	};
}

/**
 * Convert to grayscale
 */
export function toGrayscale(color: RGBA): RGBA {
	const gray = getLuminance(color);
	return { r: gray, g: gray, b: gray, a: color.a };
}

/**
 * Mix two colors
 * @param color1 First color
 * @param color2 Second color
 * @param t Mix factor (0 = color1, 1 = color2)
 */
export function mixColors(color1: RGBA, color2: RGBA, t: number): RGBA {
	return {
		r: color1.r + (color2.r - color1.r) * t,
		g: color1.g + (color2.g - color1.g) * t,
		b: color1.b + (color2.b - color1.b) * t,
		a: color1.a + (color2.a - color1.a) * t,
	};
}

// =============================================================================
// Hex Conversion
// =============================================================================

/**
 * Convert RGBA to hex string
 */
export function rgbaToHex(color: RGBA, includeAlpha = false): string {
	const toHex = (n: number) =>
		Math.round(n * 255)
			.toString(16)
			.padStart(2, '0');

	const hex = `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
	return includeAlpha ? `${hex}${toHex(color.a)}` : hex;
}

/**
 * Parse hex string to RGBA
 */
export function hexToRgba(hex: string): RGBA {
	const clean = hex.replace('#', '');
	const len = clean.length;

	if (len === 3 || len === 4) {
		// Short form: #RGB or #RGBA
		const r = parseInt(clean[0]! + clean[0]!, 16) / 255;
		const g = parseInt(clean[1]! + clean[1]!, 16) / 255;
		const b = parseInt(clean[2]! + clean[2]!, 16) / 255;
		const a = len === 4 ? parseInt(clean[3]! + clean[3]!, 16) / 255 : 1;
		return { r, g, b, a };
	}

	if (len === 6 || len === 8) {
		// Long form: #RRGGBB or #RRGGBBAA
		const r = parseInt(clean.slice(0, 2), 16) / 255;
		const g = parseInt(clean.slice(2, 4), 16) / 255;
		const b = parseInt(clean.slice(4, 6), 16) / 255;
		const a = len === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
		return { r, g, b, a };
	}

	throw new Error(`Invalid hex color: ${hex}`);
}
