/**
 * Transition Types
 *
 * Video transition definitions for clip-to-clip effects.
 * Includes 50+ transition types with GPU shader support.
 */

import type { Point2D, RGBA } from './geometry';
import type { EasingType } from './easing';

// =============================================================================
// Transition Categories
// =============================================================================

export type TransitionCategory =
	| 'basic'      // fade, cut
	| 'slide'      // push, slide, cover
	| 'wipe'       // wipe, iris, clock
	| 'zoom'       // zoom, scale
	| '3d'         // flip, cube, fold
	| 'blur'       // blur, defocus
	| 'distort'    // morph, ripple, pixelate
	| 'stylized'   // glitch, film burn
	| 'custom';

// =============================================================================
// Transition Types
// =============================================================================

export type TransitionType =
	// Basic
	| 'cut'
	| 'fade'
	| 'crossfade'
	| 'dissolve'
	// Slide
	| 'slideLeft'
	| 'slideRight'
	| 'slideUp'
	| 'slideDown'
	| 'pushLeft'
	| 'pushRight'
	| 'pushUp'
	| 'pushDown'
	| 'coverLeft'
	| 'coverRight'
	| 'coverUp'
	| 'coverDown'
	| 'revealLeft'
	| 'revealRight'
	| 'revealUp'
	| 'revealDown'
	// Wipe
	| 'wipeLeft'
	| 'wipeRight'
	| 'wipeUp'
	| 'wipeDown'
	| 'wipeDiagonalTL'
	| 'wipeDiagonalTR'
	| 'wipeDiagonalBL'
	| 'wipeDiagonalBR'
	| 'irisOpen'
	| 'irisClose'
	| 'irisRectangle'
	| 'clockwise'
	| 'counterClockwise'
	| 'radialWipe'
	// Zoom
	| 'zoomIn'
	| 'zoomOut'
	| 'zoomInRotate'
	| 'zoomOutRotate'
	// 3D
	| 'flipLeft'
	| 'flipRight'
	| 'flipUp'
	| 'flipDown'
	| 'cubeLeft'
	| 'cubeRight'
	| 'cubeUp'
	| 'cubeDown'
	| 'foldLeft'
	| 'foldRight'
	| 'doorOpen'
	| 'doorClose'
	// Blur
	| 'blurFade'
	| 'directionalBlur'
	| 'radialBlur'
	| 'zoomBlur'
	// Distort
	| 'morph'
	| 'ripple'
	| 'pixelate'
	| 'swirl'
	| 'stretch'
	| 'squeeze'
	// Stylized
	| 'glitch'
	| 'filmBurn'
	| 'lightLeak'
	| 'flash'
	| 'whiteFlash'
	| 'blackFlash'
	| 'colorFlash'
	// Custom
	| 'custom';

// =============================================================================
// Transition Parameters
// =============================================================================

/**
 * Base transition parameters
 */
export interface TransitionParams {
	/** Transition duration in seconds */
	duration: number;
	/** Easing function */
	easing?: EasingType;
	/** Direction for directional transitions */
	direction?: 'left' | 'right' | 'up' | 'down';
	/** Softness/feather amount (0-1) */
	softness?: number;
}

/**
 * Wipe transition specific params
 */
export interface WipeTransitionParams extends TransitionParams {
	/** Wipe angle in degrees */
	angle?: number;
	/** Feather edge width */
	feather?: number;
}

/**
 * Zoom transition specific params
 */
export interface ZoomTransitionParams extends TransitionParams {
	/** Zoom center point (normalized 0-1) */
	center?: Point2D;
	/** Zoom scale factor */
	scale?: number;
}

/**
 * 3D transition specific params
 */
export interface Transition3DParams extends TransitionParams {
	/** Perspective distance */
	perspective?: number;
	/** Rotation axis */
	axis?: 'x' | 'y' | 'z';
}

/**
 * Blur transition specific params
 */
export interface BlurTransitionParams extends TransitionParams {
	/** Maximum blur radius */
	blurRadius?: number;
	/** Blur direction for directional blur */
	blurDirection?: Point2D;
}

/**
 * Glitch transition specific params
 */
export interface GlitchTransitionParams extends TransitionParams {
	/** Glitch intensity (0-1) */
	intensity?: number;
	/** Color separation amount */
	colorSeparation?: number;
	/** Block size for block glitch */
	blockSize?: number;
}

/**
 * Flash transition specific params
 */
export interface FlashTransitionParams extends TransitionParams {
	/** Flash color */
	color?: RGBA;
	/** Flash intensity (0-1) */
	intensity?: number;
}

// =============================================================================
// Transition Definition
// =============================================================================

/**
 * Complete transition definition
 */
export interface Transition {
	id: string;
	type: TransitionType;
	category: TransitionCategory;
	params: TransitionParams;
	/** Custom shader code (for custom transitions) */
	customShader?: string;
}

/**
 * Transition instance on timeline
 */
export interface TransitionInstance {
	id: string;
	transitionId: string;
	/** Clip ID before transition */
	fromClipId: string;
	/** Clip ID after transition */
	toClipId: string;
	/** Start time on timeline */
	startTime: number;
	/** Duration override */
	duration?: number;
	/** Parameter overrides */
	params?: Partial<TransitionParams>;
}

// =============================================================================
// Transition Preset
// =============================================================================

export interface TransitionPreset {
	id: string;
	name: string;
	type: TransitionType;
	category: TransitionCategory;
	thumbnail?: string;
	params: TransitionParams;
}
