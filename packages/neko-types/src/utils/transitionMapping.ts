/**
 * Transition Effect Mapping
 *
 * Provides mapping between Web transition effects (24 types) and Rust transition effects (18 types).
 * Unsupported Web transitions are gracefully degraded to the closest Rust equivalent.
 *
 * Transition Type Summary:
 * | Web Type           | Rust Type      | Notes                          |
 * |--------------------|----------------|--------------------------------|
 * | fade               | Fade           | Direct mapping                 |
 * | dissolve           | Dissolve       | Direct mapping                 |
 * | slide-left         | SlideLeft      | Direct mapping                 |
 * | slide-right        | SlideRight     | Direct mapping                 |
 * | wipe-left          | WipeLeft       | Direct mapping                 |
 * | wipe-right         | WipeRight      | Direct mapping                 |
 * | wipe-up            | WipeUp         | Direct mapping                 |
 * | wipe-down          | WipeDown       | Direct mapping                 |
 * | iris-in            | IrisCircle     | Direct mapping                 |
 * | iris-out           | IrisCircle     | Inverted progress              |
 * | clock-wipe         | Clock          | Direct mapping                 |
 * | zoom-in            | ZoomIn         | Direct mapping                 |
 * | zoom-out           | ZoomOut        | Direct mapping                 |
 * | pixelate           | Pixelate       | Direct mapping                 |
 * | glitch             | Glitch         | Direct mapping                 |
 * | dip-to-black       | Flash          | Degraded                       |
 * | blinds-horizontal  | WipeDown       | Degraded                       |
 * | blinds-vertical    | WipeRight      | Degraded                       |
 * | cube-left          | SlideLeft      | Degraded (no 3D support)       |
 * | cube-right         | SlideRight     | Degraded (no 3D support)       |
 * | flip-horizontal    | SlideRight     | Degraded (no 3D support)       |
 * | flip-vertical      | SlideRight     | Degraded (no 3D support)       |
 * | morph              | Dissolve       | Degraded (no morph support)    |
 * | radial-wipe        | Clock          | Degraded                       |
 */

import type { TransitionType } from '../types/transition';

// =============================================================================
// Types
// =============================================================================

/**
 * Rust transition types supported by the TRANSITION_COMPUTE_SHADER
 */
export type RustTransitionType =
	| 'Fade'
	| 'WipeLeft'
	| 'WipeRight'
	| 'WipeUp'
	| 'WipeDown'
	| 'IrisCircle'
	| 'IrisRectangle'
	| 'Clock'
	| 'SlideLeft'
	| 'SlideRight'
	| 'ZoomIn'
	| 'ZoomOut'
	| 'Dissolve'
	| 'Pixelate'
	| 'Ripple'
	| 'Swirl'
	| 'Glitch'
	| 'Flash';

/**
 * Rust transition type numeric values (must match TRANSITION_COMPUTE_SHADER constants)
 */
export enum RustTransitionValue {
	Fade = 0,
	WipeLeft = 1,
	WipeRight = 2,
	WipeUp = 3,
	WipeDown = 4,
	IrisCircle = 5,
	IrisRectangle = 6,
	Clock = 7,
	SlideLeft = 8,
	SlideRight = 9,
	ZoomIn = 10,
	ZoomOut = 11,
	Dissolve = 12,
	Pixelate = 13,
	Ripple = 14,
	Swirl = 15,
	Glitch = 16,
	Flash = 17,
}

/**
 * Mapping result with optional warning
 */
export interface TransitionMappingResult {
	/** Rust transition type */
	rustType: RustTransitionType;
	/** Numeric value for shader */
	rustValue: RustTransitionValue;
	/** Whether this is a degraded mapping */
	isDegraded: boolean;
	/** Warning message for degraded mappings */
	warning?: string;
}

// =============================================================================
// Mapping Tables
// =============================================================================

/**
 * Direct mappings from Web to Rust (no quality loss)
 */
const DIRECT_MAPPINGS: Partial<Record<TransitionType, RustTransitionType>> = {
	'none': 'Fade',
	'fade': 'Fade',
	'dissolve': 'Dissolve',
	'slide-left': 'SlideLeft',
	'slide-right': 'SlideRight',
	'slide-up': 'SlideLeft', // Vertical slide maps to horizontal
	'slide-down': 'SlideRight',
	'zoom-in': 'ZoomIn',
	'zoom-out': 'ZoomOut',
	'cross-zoom': 'ZoomIn',
	'wipe-left': 'WipeLeft',
	'wipe-right': 'WipeRight',
	'wipe-up': 'WipeUp',
	'wipe-down': 'WipeDown',
	'iris-in': 'IrisCircle',
	'iris-out': 'IrisCircle',
	'clock-wipe': 'Clock',
	'clock-wipe-ccw': 'Clock',
	'pixelate': 'Pixelate',
	'glitch': 'Glitch',
	'dip-to-black': 'Flash',
	'dip-to-white': 'Flash',
	'dip-to-color': 'Flash',
};

/**
 * Degraded mappings (with quality loss, warning will be logged)
 */
const DEGRADED_MAPPINGS: Partial<Record<TransitionType, { rustType: RustTransitionType; reason: string }>> = {
	'blinds-horizontal': { rustType: 'WipeDown', reason: 'Blinds effect not supported in Rust, using WipeDown' },
	'blinds-vertical': { rustType: 'WipeRight', reason: 'Blinds effect not supported in Rust, using WipeRight' },
	'cube-left': { rustType: 'SlideLeft', reason: '3D cube effect not supported in Rust, using SlideLeft' },
	'cube-right': { rustType: 'SlideRight', reason: '3D cube effect not supported in Rust, using SlideRight' },
	'cube-up': { rustType: 'SlideLeft', reason: '3D cube effect not supported in Rust, using SlideLeft' },
	'cube-down': { rustType: 'SlideRight', reason: '3D cube effect not supported in Rust, using SlideRight' },
	'flip-horizontal': { rustType: 'SlideRight', reason: '3D flip effect not supported in Rust, using SlideRight' },
	'flip-vertical': { rustType: 'SlideRight', reason: '3D flip effect not supported in Rust, using SlideRight' },
	'page-curl-left': { rustType: 'WipeLeft', reason: 'Page curl effect not supported in Rust, using WipeLeft' },
	'page-curl-right': { rustType: 'WipeRight', reason: 'Page curl effect not supported in Rust, using WipeRight' },
	'blur': { rustType: 'Dissolve', reason: 'Blur transition not supported in Rust, using Dissolve' },
	'radial-wipe': { rustType: 'Clock', reason: 'Radial wipe mapped to Clock wipe' },
	'morph': { rustType: 'Dissolve', reason: 'Morph effect not supported in Rust, using Dissolve' },
	'custom': { rustType: 'Fade', reason: 'Custom transitions not supported in Rust export, using Fade' },
};

/**
 * Map Rust type name to numeric value
 */
const RUST_TYPE_TO_VALUE: Record<RustTransitionType, RustTransitionValue> = {
	'Fade': RustTransitionValue.Fade,
	'WipeLeft': RustTransitionValue.WipeLeft,
	'WipeRight': RustTransitionValue.WipeRight,
	'WipeUp': RustTransitionValue.WipeUp,
	'WipeDown': RustTransitionValue.WipeDown,
	'IrisCircle': RustTransitionValue.IrisCircle,
	'IrisRectangle': RustTransitionValue.IrisRectangle,
	'Clock': RustTransitionValue.Clock,
	'SlideLeft': RustTransitionValue.SlideLeft,
	'SlideRight': RustTransitionValue.SlideRight,
	'ZoomIn': RustTransitionValue.ZoomIn,
	'ZoomOut': RustTransitionValue.ZoomOut,
	'Dissolve': RustTransitionValue.Dissolve,
	'Pixelate': RustTransitionValue.Pixelate,
	'Ripple': RustTransitionValue.Ripple,
	'Swirl': RustTransitionValue.Swirl,
	'Glitch': RustTransitionValue.Glitch,
	'Flash': RustTransitionValue.Flash,
};

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert Web transition type to Rust transition type
 *
 * @param webType - Web transition type
 * @returns Mapping result with Rust type and any warnings
 */
export function webTransitionToRust(webType: TransitionType): TransitionMappingResult {
	// Check direct mappings first
	const directType = DIRECT_MAPPINGS[webType];
	if (directType) {
		return {
			rustType: directType,
			rustValue: RUST_TYPE_TO_VALUE[directType],
			isDegraded: false,
		};
	}

	// Check degraded mappings
	const degraded = DEGRADED_MAPPINGS[webType];
	if (degraded) {
		return {
			rustType: degraded.rustType,
			rustValue: RUST_TYPE_TO_VALUE[degraded.rustType],
			isDegraded: true,
			warning: degraded.reason,
		};
	}

	// Unknown type, default to Fade
	return {
		rustType: 'Fade',
		rustValue: RustTransitionValue.Fade,
		isDegraded: true,
		warning: `Unknown transition type '${webType}', defaulting to Fade`,
	};
}

/**
 * Check if a Web transition type is fully supported in Rust
 *
 * @param webType - Web transition type
 * @returns true if the transition has a direct mapping (no quality loss)
 */
export function isTransitionSupported(webType: TransitionType): boolean {
	return webType in DIRECT_MAPPINGS;
}

/**
 * Get all supported transition types (with direct mappings)
 */
export function getSupportedTransitions(): TransitionType[] {
	return Object.keys(DIRECT_MAPPINGS) as TransitionType[];
}

/**
 * Get all degraded transition types (with quality loss)
 */
export function getDegradedTransitions(): TransitionType[] {
	return Object.keys(DEGRADED_MAPPINGS) as TransitionType[];
}

/**
 * Convert Rust transition type to Web transition type
 * Note: Some Web types map to the same Rust type, so this is a one-to-many inverse
 *
 * @param rustType - Rust transition type
 * @returns Primary Web transition type for this Rust type
 */
export function rustTransitionToWeb(rustType: RustTransitionType): TransitionType {
	switch (rustType) {
		case 'Fade': return 'fade';
		case 'Dissolve': return 'dissolve';
		case 'WipeLeft': return 'wipe-left';
		case 'WipeRight': return 'wipe-right';
		case 'WipeUp': return 'wipe-up';
		case 'WipeDown': return 'wipe-down';
		case 'IrisCircle': return 'iris-in';
		case 'IrisRectangle': return 'iris-in';
		case 'Clock': return 'clock-wipe';
		case 'SlideLeft': return 'slide-left';
		case 'SlideRight': return 'slide-right';
		case 'ZoomIn': return 'zoom-in';
		case 'ZoomOut': return 'zoom-out';
		case 'Pixelate': return 'pixelate';
		case 'Ripple': return 'fade'; // No direct Web equivalent
		case 'Swirl': return 'fade'; // No direct Web equivalent
		case 'Glitch': return 'glitch';
		case 'Flash': return 'dip-to-white';
		default: return 'fade';
	}
}

/**
 * Get Rust transition numeric value from type name
 *
 * @param rustType - Rust transition type name
 * @returns Numeric value for shader
 */
export function getRustTransitionValue(rustType: RustTransitionType): number {
	return RUST_TYPE_TO_VALUE[rustType];
}

/**
 * Batch convert multiple transitions with aggregated warnings
 *
 * @param webTypes - Array of Web transition types
 * @returns Array of mapping results and aggregated warnings
 */
export function batchConvertTransitions(
	webTypes: TransitionType[]
): { results: TransitionMappingResult[]; warnings: string[] } {
	const results: TransitionMappingResult[] = [];
	const warnings: string[] = [];

	for (const webType of webTypes) {
		const result = webTransitionToRust(webType);
		results.push(result);
		if (result.warning) {
			warnings.push(result.warning);
		}
	}

	return { results, warnings };
}
