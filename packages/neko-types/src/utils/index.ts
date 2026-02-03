/**
 * Shared Utilities Index
 *
 * Re-exports all utility functions for convenient imports.
 */

// Animation utilities
export {
	easingFunctions,
	applyEasing,
	cubicBezier,
	getAnimatedValue,
	getComputedTransform,
	hasKeyframes,
} from './animation';

// Coordinate transformation utilities
export {
	pixelToNormalized,
	normalizedToPixel,
	webTransformToRust,
	rustTransformToWeb,
	type RustTransform2D,
} from './coordinateTransform';

// Color correction mapping utilities
export {
	webColorToRust,
	rustColorToWeb,
	hasColorCorrection,
	hasRustEffects,
	lerpColorParams,
	DEFAULT_EXTENDED_WEB_PARAMS,
	DEFAULT_RUST_EFFECT_PARAMS,
	type ExtendedWebColorParams,
	type RustEffectParams,
} from './colorCorrectionMapping';

// Transition mapping utilities
export {
	webTransitionToRust,
	rustTransitionToWeb,
	isTransitionSupported,
	getSupportedTransitions,
	getDegradedTransitions,
	getRustTransitionValue,
	batchConvertTransitions,
	RustTransitionValue,
	type RustTransitionType,
	type TransitionMappingResult,
} from './transitionMapping';
