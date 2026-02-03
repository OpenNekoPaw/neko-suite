/**
 * Easing Types
 *
 * Defines easing function types for animations and transitions.
 * Compatible with CSS easing and After Effects style curves.
 */

// =============================================================================
// Easing Types
// =============================================================================

/**
 * Standard easing function types
 */
export type EasingType =
	// Linear
	| 'linear'
	// Quad
	| 'easeInQuad'
	| 'easeOutQuad'
	| 'easeInOutQuad'
	// Cubic
	| 'easeInCubic'
	| 'easeOutCubic'
	| 'easeInOutCubic'
	// Quart
	| 'easeInQuart'
	| 'easeOutQuart'
	| 'easeInOutQuart'
	// Quint
	| 'easeInQuint'
	| 'easeOutQuint'
	| 'easeInOutQuint'
	// Sine
	| 'easeInSine'
	| 'easeOutSine'
	| 'easeInOutSine'
	// Expo
	| 'easeInExpo'
	| 'easeOutExpo'
	| 'easeInOutExpo'
	// Circ
	| 'easeInCirc'
	| 'easeOutCirc'
	| 'easeInOutCirc'
	// Back
	| 'easeInBack'
	| 'easeOutBack'
	| 'easeInOutBack'
	// Elastic
	| 'easeInElastic'
	| 'easeOutElastic'
	| 'easeInOutElastic'
	// Bounce
	| 'easeInBounce'
	| 'easeOutBounce'
	| 'easeInOutBounce'
	// Custom
	| 'cubicBezier';

/**
 * Easing function signature
 * @param t - Progress value from 0 to 1
 * @returns Eased value from 0 to 1
 */
export type EasingFunction = (t: number) => number;

/**
 * Custom cubic bezier easing definition
 */
export interface CubicBezierEasing {
	type: 'cubicBezier';
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/**
 * Easing configuration - either a preset or custom bezier
 */
export type EasingConfig =
	| { type: Exclude<EasingType, 'cubicBezier'> }
	| CubicBezierEasing;

// =============================================================================
// Spring Physics (for natural animations)
// =============================================================================

export interface SpringConfig {
	mass: number;      // default: 1
	stiffness: number; // default: 100
	damping: number;   // default: 10
	velocity: number;  // initial velocity, default: 0
}

export interface SpringState {
	position: number;
	velocity: number;
}
