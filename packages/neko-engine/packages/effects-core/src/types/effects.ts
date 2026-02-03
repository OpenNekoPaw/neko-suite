/**
 * Effect Types
 *
 * Video effect/filter definitions for clip processing.
 * Supports color correction, blur, stylization, and more.
 */

import type { Point2D, RGBA } from './geometry';

// =============================================================================
// Effect Categories
// =============================================================================

export type EffectCategory =
	| 'color'       // color correction, grading
	| 'blur'        // blur, sharpen
	| 'distort'     // warp, lens distortion
	| 'stylize'     // artistic effects
	| 'generate'    // noise, patterns
	| 'keying'      // chroma key, luma key
	| 'time'        // echo, trails
	| 'audio'       // audio visualization
	| 'custom';

// =============================================================================
// Effect Types
// =============================================================================

export type EffectType =
	// Color
	| 'colorCorrection'
	| 'curves'
	| 'levels'
	| 'hslAdjust'
	| 'colorBalance'
	| 'vibrance'
	| 'exposure'
	| 'whiteBalance'
	| 'lut'
	| 'tint'
	| 'blackAndWhite'
	| 'sepia'
	| 'invert'
	| 'posterize'
	| 'threshold'
	// Blur
	| 'gaussianBlur'
	| 'boxBlur'
	| 'motionBlur'
	| 'radialBlur'
	| 'zoomBlur'
	| 'lensBlur'
	| 'tiltShift'
	| 'sharpen'
	| 'unsharpMask'
	// Distort
	| 'transform'
	| 'cornerPin'
	| 'bezierWarp'
	| 'spherize'
	| 'twirl'
	| 'ripple'
	| 'wave'
	| 'displacementMap'
	| 'lensDistortion'
	// Stylize
	| 'glow'
	| 'bloom'
	| 'vignette'
	| 'filmGrain'
	| 'halftone'
	| 'mosaic'
	| 'pixelate'
	| 'oilPaint'
	| 'sketch'
	| 'emboss'
	| 'edgeDetect'
	// Generate
	| 'solidColor'
	| 'gradient'
	| 'noise'
	| 'fractalNoise'
	| 'checkerboard'
	| 'grid'
	// Keying
	| 'chromaKey'
	| 'lumaKey'
	| 'colorKey'
	| 'differenceKey'
	// Time
	| 'echo'
	| 'trails'
	| 'posterizeTime'
	// Custom
	| 'custom';

// =============================================================================
// Effect Parameters
// =============================================================================

/**
 * Base effect parameters
 */
export interface EffectParams {
	/** Effect enabled state */
	enabled?: boolean;
	/** Effect opacity/mix (0-1) */
	mix?: number;
}

/**
 * Color correction parameters
 */
export interface ColorCorrectionParams extends EffectParams {
	type: 'colorCorrection';
	brightness?: number;  // -1 to 1
	contrast?: number;    // 0 to 2
	saturation?: number;  // 0 to 2
	hue?: number;         // -180 to 180
	gamma?: number;       // 0.1 to 3
	exposure?: number;    // -3 to 3
	temperature?: number; // -100 to 100
	tint?: number;        // -100 to 100
}

/**
 * Blur parameters
 */
export interface BlurParams extends EffectParams {
	type: 'gaussianBlur' | 'boxBlur' | 'motionBlur' | 'radialBlur' | 'zoomBlur';
	radius: number;
	/** Direction for motion blur (degrees) */
	direction?: number;
	/** Center for radial/zoom blur */
	center?: Point2D;
}

/**
 * Sharpen parameters
 */
export interface SharpenParams extends EffectParams {
	type: 'sharpen' | 'unsharpMask';
	amount: number;    // 0 to 5
	radius?: number;   // for unsharp mask
	threshold?: number; // for unsharp mask
}

/**
 * Glow/Bloom parameters
 */
export interface GlowParams extends EffectParams {
	type: 'glow' | 'bloom';
	radius: number;
	intensity: number;
	threshold?: number;
	color?: RGBA;
}

/**
 * Vignette parameters
 */
export interface VignetteParams extends EffectParams {
	type: 'vignette';
	amount: number;     // 0 to 1
	radius: number;     // 0 to 2
	softness: number;   // 0 to 1
	roundness?: number; // 0 to 1
	center?: Point2D;
}

/**
 * Film grain parameters
 */
export interface FilmGrainParams extends EffectParams {
	type: 'filmGrain';
	amount: number;     // 0 to 1
	size: number;       // grain size
	roughness?: number;
	animated?: boolean;
}

/**
 * Chroma key parameters
 */
export interface ChromaKeyParams extends EffectParams {
	type: 'chromaKey';
	keyColor: RGBA;
	similarity: number;  // 0 to 1
	smoothness: number;  // 0 to 1
	spillSuppression?: number;
}

/**
 * LUT (Look-Up Table) parameters
 */
export interface LutParams extends EffectParams {
	type: 'lut';
	/** LUT data or URL */
	lutData: string | Float32Array;
	/** LUT size (typically 16, 32, or 64) */
	size: number;
	intensity?: number; // 0 to 1
}

/**
 * Transform parameters
 */
export interface TransformParams extends EffectParams {
	type: 'transform';
	position?: Point2D;
	scale?: Point2D;
	rotation?: number;
	anchor?: Point2D;
	skew?: Point2D;
}

// =============================================================================
// Effect Definition
// =============================================================================

/**
 * Union of all effect parameter types
 */
export type AnyEffectParams =
	| ColorCorrectionParams
	| BlurParams
	| SharpenParams
	| GlowParams
	| VignetteParams
	| FilmGrainParams
	| ChromaKeyParams
	| LutParams
	| TransformParams
	| (EffectParams & { type: EffectType });

/**
 * Complete effect definition
 */
export interface Effect {
	id: string;
	type: EffectType;
	category: EffectCategory;
	name: string;
	params: AnyEffectParams;
	/** Custom shader code (for custom effects) */
	customShader?: string;
}

/**
 * Effect instance on a clip
 */
export interface EffectInstance {
	id: string;
	effectId: string;
	/** Target clip ID */
	clipId: string;
	/** Order in effect stack (lower = applied first) */
	order: number;
	/** Parameter overrides */
	params?: Partial<AnyEffectParams>;
	/** Keyframe animations for effect params */
	animations?: Record<string, unknown>;
}

// =============================================================================
// Effect Preset
// =============================================================================

export interface EffectPreset {
	id: string;
	name: string;
	type: EffectType;
	category: EffectCategory;
	thumbnail?: string;
	params: AnyEffectParams;
}
