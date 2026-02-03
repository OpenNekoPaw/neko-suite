/**
 * Color Correction Types
 *
 * Professional color grading and correction definitions.
 * Supports curves, levels, HSL, color wheels, and LUTs.
 */

import type { RGBA, HSLA } from './geometry';

// =============================================================================
// Color Correction Presets
// =============================================================================

export type ColorCorrectionPreset =
	| 'none'
	| 'autoCorrect'
	| 'autoContrast'
	| 'autoColor'
	| 'warmth'
	| 'coolness'
	| 'vintage'
	| 'cinematic'
	| 'bleachBypass'
	| 'crossProcess'
	| 'orangeTeal'
	| 'blackAndWhite'
	| 'sepia'
	| 'highContrast'
	| 'lowContrast'
	| 'custom';

// =============================================================================
// Basic Color Correction
// =============================================================================

export interface BasicColorCorrection {
	/** Exposure adjustment (-3 to 3 stops) */
	exposure: number;
	/** Contrast adjustment (0 to 2, 1 = neutral) */
	contrast: number;
	/** Highlights adjustment (-1 to 1) */
	highlights: number;
	/** Shadows adjustment (-1 to 1) */
	shadows: number;
	/** White point adjustment (-1 to 1) */
	whites: number;
	/** Black point adjustment (-1 to 1) */
	blacks: number;
	/** Temperature adjustment (-100 to 100) */
	temperature: number;
	/** Tint adjustment (-100 to 100) */
	tint: number;
	/** Vibrance adjustment (-1 to 1) */
	vibrance: number;
	/** Saturation adjustment (0 to 2, 1 = neutral) */
	saturation: number;
}

// =============================================================================
// Curves Adjustment
// =============================================================================

export interface CurvePoint {
	x: number; // 0-1 input
	y: number; // 0-1 output
}

export type CurveChannel = 'rgb' | 'red' | 'green' | 'blue' | 'luma';

export interface CurvesAdjustment {
	/** Master RGB curve */
	rgb: CurvePoint[];
	/** Red channel curve */
	red: CurvePoint[];
	/** Green channel curve */
	green: CurvePoint[];
	/** Blue channel curve */
	blue: CurvePoint[];
}

// =============================================================================
// Levels Adjustment
// =============================================================================

export interface LevelsChannel {
	/** Input black point (0-255) */
	inputBlack: number;
	/** Input white point (0-255) */
	inputWhite: number;
	/** Gamma/midtone (0.1-10, 1 = neutral) */
	gamma: number;
	/** Output black point (0-255) */
	outputBlack: number;
	/** Output white point (0-255) */
	outputWhite: number;
}

export interface LevelsAdjustment {
	rgb: LevelsChannel;
	red: LevelsChannel;
	green: LevelsChannel;
	blue: LevelsChannel;
}

// =============================================================================
// HSL Adjustment
// =============================================================================

export type HSLTargetColor =
	| 'all'
	| 'reds'
	| 'oranges'
	| 'yellows'
	| 'greens'
	| 'cyans'
	| 'blues'
	| 'purples'
	| 'magentas';

export interface HSLColorAdjustment {
	hue: number;        // -180 to 180
	saturation: number; // -100 to 100
	lightness: number;  // -100 to 100
}

export interface HSLAdjustment {
	all: HSLColorAdjustment;
	reds: HSLColorAdjustment;
	oranges: HSLColorAdjustment;
	yellows: HSLColorAdjustment;
	greens: HSLColorAdjustment;
	cyans: HSLColorAdjustment;
	blues: HSLColorAdjustment;
	purples: HSLColorAdjustment;
	magentas: HSLColorAdjustment;
}

// =============================================================================
// Color Wheels (3-Way Color Correction)
// =============================================================================

export interface ColorWheelAdjustment {
	/** Color offset (hue/saturation in polar coordinates) */
	color: { angle: number; distance: number };
	/** Brightness adjustment (-1 to 1) */
	brightness: number;
}

export interface ColorWheels {
	/** Shadows/Lift */
	shadows: ColorWheelAdjustment;
	/** Midtones/Gamma */
	midtones: ColorWheelAdjustment;
	/** Highlights/Gain */
	highlights: ColorWheelAdjustment;
	/** Global adjustment */
	global?: ColorWheelAdjustment;
}

// =============================================================================
// Color Balance
// =============================================================================

export interface ColorBalanceRange {
	cyanRed: number;      // -100 to 100
	magentaGreen: number; // -100 to 100
	yellowBlue: number;   // -100 to 100
}

export interface ColorBalance {
	shadows: ColorBalanceRange;
	midtones: ColorBalanceRange;
	highlights: ColorBalanceRange;
	preserveLuminosity: boolean;
}

// =============================================================================
// Selective Color
// =============================================================================

export interface SelectiveColorAdjustment {
	cyan: number;    // -100 to 100
	magenta: number; // -100 to 100
	yellow: number;  // -100 to 100
	black: number;   // -100 to 100
}

export interface SelectiveColor {
	reds: SelectiveColorAdjustment;
	yellows: SelectiveColorAdjustment;
	greens: SelectiveColorAdjustment;
	cyans: SelectiveColorAdjustment;
	blues: SelectiveColorAdjustment;
	magentas: SelectiveColorAdjustment;
	whites: SelectiveColorAdjustment;
	neutrals: SelectiveColorAdjustment;
	blacks: SelectiveColorAdjustment;
	/** Relative vs Absolute mode */
	method: 'relative' | 'absolute';
}

// =============================================================================
// Complete Color Correction
// =============================================================================

export interface ColorCorrection {
	enabled: boolean;
	preset?: ColorCorrectionPreset;
	basic: Partial<BasicColorCorrection>;
	curves?: Partial<CurvesAdjustment>;
	levels?: Partial<LevelsAdjustment>;
	hsl?: Partial<HSLAdjustment>;
	colorWheels?: Partial<ColorWheels>;
	colorBalance?: Partial<ColorBalance>;
	selectiveColor?: Partial<SelectiveColor>;
	/** LUT file path or data */
	lut?: {
		enabled: boolean;
		data: string | Float32Array;
		size: number;
		intensity: number;
	};
}

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULT_BASIC_CORRECTION: BasicColorCorrection = {
	exposure: 0,
	contrast: 1,
	highlights: 0,
	shadows: 0,
	whites: 0,
	blacks: 0,
	temperature: 0,
	tint: 0,
	vibrance: 0,
	saturation: 1,
};

export const DEFAULT_CURVE_POINTS: CurvePoint[] = [
	{ x: 0, y: 0 },
	{ x: 1, y: 1 },
];

export const DEFAULT_LEVELS_CHANNEL: LevelsChannel = {
	inputBlack: 0,
	inputWhite: 255,
	gamma: 1,
	outputBlack: 0,
	outputWhite: 255,
};

export const DEFAULT_HSL_ADJUSTMENT: HSLColorAdjustment = {
	hue: 0,
	saturation: 0,
	lightness: 0,
};
