/** Basic color adjustment parameters */
export interface BasicColorAdjustment {
    /** Exposure (-5 to +5, 0 = no change) */
    exposure: number;
    /** Contrast (-100 to +100, 0 = no change) */
    contrast: number;
    /** Highlights (-100 to +100, 0 = no change) */
    highlights: number;
    /** Shadows (-100 to +100, 0 = no change) */
    shadows: number;
    /** Whites (-100 to +100, 0 = no change) */
    whites: number;
    /** Blacks (-100 to +100, 0 = no change) */
    blacks: number;
    /** Temperature (-100 to +100, 0 = no change) */
    temperature: number;
    /** Tint (-100 to +100, 0 = no change) */
    tint: number;
    /** Saturation (-100 to +100, 0 = no change) */
    saturation: number;
    /** Vibrance (-100 to +100, 0 = no change) */
    vibrance: number;
    /** Clarity (-100 to +100, 0 = no change) */
    clarity: number;
    /** Dehaze (-100 to +100, 0 = no change) */
    dehaze: number;
}
export declare const DEFAULT_BASIC_COLOR_ADJUSTMENT: BasicColorAdjustment;
/** A point on a curve */
export interface CurvePoint {
    /** X position (0-1) */
    x: number;
    /** Y position (0-1) */
    y: number;
}
/** Curve channel types */
export type CurveChannel = 'rgb' | 'red' | 'green' | 'blue' | 'luma';
/** Curve adjustment for a single channel */
export interface CurveAdjustment {
    /** Curve points (sorted by x) */
    points: CurvePoint[];
    /** Whether this curve is enabled */
    enabled: boolean;
}
/** All curves for color grading */
export interface CurvesAdjustment {
    /** Master RGB curve */
    rgb: CurveAdjustment;
    /** Red channel curve */
    red: CurveAdjustment;
    /** Green channel curve */
    green: CurveAdjustment;
    /** Blue channel curve */
    blue: CurveAdjustment;
    /** Luminance curve */
    luma: CurveAdjustment;
}
export declare const DEFAULT_CURVE: CurveAdjustment;
export declare const DEFAULT_CURVES_ADJUSTMENT: CurvesAdjustment;
/** HSL color ranges for selective color adjustment */
export type HSLColorRange = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'magenta';
/** HSL adjustment for a specific color range */
export interface HSLRangeAdjustment {
    /** Hue shift (-180 to +180) */
    hue: number;
    /** Saturation adjustment (-100 to +100) */
    saturation: number;
    /** Luminance adjustment (-100 to +100) */
    luminance: number;
}
/** Complete HSL adjustment with all color ranges */
export type HSLAdjustment = Record<HSLColorRange, HSLRangeAdjustment>;
export declare const DEFAULT_HSL_RANGE: HSLRangeAdjustment;
export declare const DEFAULT_HSL_ADJUSTMENT: HSLAdjustment;
/** LUT adjustment settings */
export interface LUTAdjustment {
    /** Whether LUT is enabled */
    enabled: boolean;
    /** LUT data reference (id or filename) */
    lutId: string | null;
    /** LUT intensity/strength (0-100) */
    intensity: number;
}
export declare const DEFAULT_LUT_ADJUSTMENT: LUTAdjustment;
/** Vignette effect parameters */
export interface VignetteParams {
    /** Whether vignette is enabled */
    enabled: boolean;
    /** Vignette amount (-100 to 100, negative = darken, positive = lighten) */
    amount: number;
    /** Midpoint position (0 to 100, default 50) */
    midpoint: number;
    /** Roundness (-100 to 100, 0 = circle) */
    roundness: number;
    /** Feather amount (0 to 100, default 50) */
    feather: number;
}
export declare const DEFAULT_VIGNETTE_PARAMS: VignetteParams;
/** Single color wheel value (HSL offset) */
export interface ColorWheelValue {
    /** Hue offset (-180 to 180 degrees) */
    hue: number;
    /** Saturation multiplier (0 to 200, 100 = no change) */
    saturation: number;
    /** Luminance offset (-100 to 100) */
    luminance: number;
}
export declare const DEFAULT_COLOR_WHEEL_VALUE: ColorWheelValue;
/** Three-way color wheel (shadows, midtones, highlights) */
export interface ColorWheelsParams {
    /** Shadows color adjustment */
    shadows: ColorWheelValue;
    /** Midtones color adjustment */
    midtones: ColorWheelValue;
    /** Highlights color adjustment */
    highlights: ColorWheelValue;
    /** Global color adjustment */
    global: ColorWheelValue;
}
export declare const DEFAULT_COLOR_WHEELS_PARAMS: ColorWheelsParams;
/** Complete color correction settings */
export interface ColorCorrection {
    /** Whether color correction is enabled */
    enabled: boolean;
    /** Basic adjustments */
    basic: BasicColorAdjustment;
    /** Curves adjustments */
    curves: CurvesAdjustment;
    /** Color wheels adjustments */
    colorWheels: ColorWheelsParams;
    /** HSL adjustments */
    hsl: HSLAdjustment;
    /** LUT settings */
    lut: LUTAdjustment;
    /** Vignette settings */
    vignette: VignetteParams;
}
export declare const DEFAULT_COLOR_CORRECTION: ColorCorrection;
//# sourceMappingURL=colorCorrection.d.ts.map