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

// Color correction mapping (UI ↔ Engine)
export {
	mapBasicColorToEngine,
	mapEngineColorToBasic,
} from './colorCorrectionMapping';
