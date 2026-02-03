/**
 * Easing Algorithms
 *
 * Pure easing function implementations.
 * Platform-agnostic, can be used in JS, WGSL, and Rust.
 */

import type { EasingType, EasingFunction, CubicBezierEasing, SpringConfig, SpringState } from '../types/easing';

// =============================================================================
// Standard Easing Functions
// =============================================================================

// Linear
export const linear: EasingFunction = (t) => t;

// Quad
export const easeInQuad: EasingFunction = (t) => t * t;
export const easeOutQuad: EasingFunction = (t) => t * (2 - t);
export const easeInOutQuad: EasingFunction = (t) =>
	t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

// Cubic
export const easeInCubic: EasingFunction = (t) => t * t * t;
export const easeOutCubic: EasingFunction = (t) => (--t) * t * t + 1;
export const easeInOutCubic: EasingFunction = (t) =>
	t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

// Quart
export const easeInQuart: EasingFunction = (t) => t * t * t * t;
export const easeOutQuart: EasingFunction = (t) => 1 - (--t) * t * t * t;
export const easeInOutQuart: EasingFunction = (t) =>
	t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t;

// Quint
export const easeInQuint: EasingFunction = (t) => t * t * t * t * t;
export const easeOutQuint: EasingFunction = (t) => 1 + (--t) * t * t * t * t;
export const easeInOutQuint: EasingFunction = (t) =>
	t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t;

// Sine
export const easeInSine: EasingFunction = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const easeOutSine: EasingFunction = (t) => Math.sin((t * Math.PI) / 2);
export const easeInOutSine: EasingFunction = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

// Expo
export const easeInExpo: EasingFunction = (t) =>
	t === 0 ? 0 : Math.pow(2, 10 * t - 10);
export const easeOutExpo: EasingFunction = (t) =>
	t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
export const easeInOutExpo: EasingFunction = (t) =>
	t === 0 ? 0 : t === 1 ? 1 : t < 0.5
		? Math.pow(2, 20 * t - 10) / 2
		: (2 - Math.pow(2, -20 * t + 10)) / 2;

// Circ
export const easeInCirc: EasingFunction = (t) => 1 - Math.sqrt(1 - t * t);
export const easeOutCirc: EasingFunction = (t) => Math.sqrt(1 - (--t) * t);
export const easeInOutCirc: EasingFunction = (t) =>
	t < 0.5
		? (1 - Math.sqrt(1 - 4 * t * t)) / 2
		: (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;

// Back
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;

export const easeInBack: EasingFunction = (t) => c3 * t * t * t - c1 * t * t;
export const easeOutBack: EasingFunction = (t) =>
	1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
export const easeInOutBack: EasingFunction = (t) =>
	t < 0.5
		? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
		: (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;

// Elastic
const c4 = (2 * Math.PI) / 3;
const c5 = (2 * Math.PI) / 4.5;

export const easeInElastic: EasingFunction = (t) =>
	t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
export const easeOutElastic: EasingFunction = (t) =>
	t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
export const easeInOutElastic: EasingFunction = (t) =>
	t === 0 ? 0 : t === 1 ? 1 : t < 0.5
		? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
		: (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;

// Bounce
export const easeOutBounce: EasingFunction = (t) => {
	const n1 = 7.5625;
	const d1 = 2.75;

	if (t < 1 / d1) {
		return n1 * t * t;
	} else if (t < 2 / d1) {
		return n1 * (t -= 1.5 / d1) * t + 0.75;
	} else if (t < 2.5 / d1) {
		return n1 * (t -= 2.25 / d1) * t + 0.9375;
	} else {
		return n1 * (t -= 2.625 / d1) * t + 0.984375;
	}
};

export const easeInBounce: EasingFunction = (t) => 1 - easeOutBounce(1 - t);
export const easeInOutBounce: EasingFunction = (t) =>
	t < 0.5
		? (1 - easeOutBounce(1 - 2 * t)) / 2
		: (1 + easeOutBounce(2 * t - 1)) / 2;

// =============================================================================
// Easing Function Registry
// =============================================================================

const EASING_FUNCTIONS: Record<Exclude<EasingType, 'cubicBezier'>, EasingFunction> = {
	linear,
	easeInQuad,
	easeOutQuad,
	easeInOutQuad,
	easeInCubic,
	easeOutCubic,
	easeInOutCubic,
	easeInQuart,
	easeOutQuart,
	easeInOutQuart,
	easeInQuint,
	easeOutQuint,
	easeInOutQuint,
	easeInSine,
	easeOutSine,
	easeInOutSine,
	easeInExpo,
	easeOutExpo,
	easeInOutExpo,
	easeInCirc,
	easeOutCirc,
	easeInOutCirc,
	easeInBack,
	easeOutBack,
	easeInOutBack,
	easeInElastic,
	easeOutElastic,
	easeInOutElastic,
	easeInBounce,
	easeOutBounce,
	easeInOutBounce,
};

/**
 * Get easing function by type
 */
export function getEasingFunction(type: EasingType): EasingFunction {
	if (type === 'cubicBezier') {
		throw new Error('Use createCubicBezierEasing for custom bezier curves');
	}
	return EASING_FUNCTIONS[type];
}

// =============================================================================
// Cubic Bezier
// =============================================================================

/**
 * Create a cubic bezier easing function
 * Based on WebKit's implementation
 */
export function createCubicBezierEasing(config: CubicBezierEasing): EasingFunction {
	const { x1, y1, x2, y2 } = config;

	// Special cases
	if (x1 === y1 && x2 === y2) {
		return linear;
	}

	// Calculate coefficients
	const cx = 3 * x1;
	const bx = 3 * (x2 - x1) - cx;
	const ax = 1 - cx - bx;

	const cy = 3 * y1;
	const by = 3 * (y2 - y1) - cy;
	const ay = 1 - cy - by;

	const sampleCurveX = (t: number) => ((ax * t + bx) * t + cx) * t;
	const sampleCurveY = (t: number) => ((ay * t + by) * t + cy) * t;
	const sampleCurveDerivativeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

	// Newton-Raphson iteration to find t for given x
	const solveCurveX = (x: number): number => {
		let t = x;
		for (let i = 0; i < 8; i++) {
			const currentX = sampleCurveX(t) - x;
			if (Math.abs(currentX) < 1e-6) {
				return t;
			}
			const derivative = sampleCurveDerivativeX(t);
			if (Math.abs(derivative) < 1e-6) {
				break;
			}
			t -= currentX / derivative;
		}

		// Fall back to bisection
		let t0 = 0;
		let t1 = 1;
		t = x;

		while (t0 < t1) {
			const currentX = sampleCurveX(t);
			if (Math.abs(currentX - x) < 1e-6) {
				return t;
			}
			if (x > currentX) {
				t0 = t;
			} else {
				t1 = t;
			}
			t = (t1 - t0) * 0.5 + t0;
		}

		return t;
	};

	return (x: number) => sampleCurveY(solveCurveX(x));
}

// =============================================================================
// Spring Physics
// =============================================================================

/**
 * Default spring configuration
 */
export const DEFAULT_SPRING_CONFIG: SpringConfig = {
	mass: 1,
	stiffness: 100,
	damping: 10,
	velocity: 0,
};

/**
 * Calculate spring physics step
 * @param state Current spring state
 * @param target Target position
 * @param config Spring configuration
 * @param dt Delta time in seconds
 * @returns New spring state
 */
export function springStep(
	state: SpringState,
	target: number,
	config: SpringConfig,
	dt: number
): SpringState {
	const { mass, stiffness, damping } = config;
	const { position, velocity } = state;

	// Spring force: F = -k * x
	const springForce = -stiffness * (position - target);
	// Damping force: F = -c * v
	const dampingForce = -damping * velocity;
	// Total force
	const force = springForce + dampingForce;
	// Acceleration: a = F / m
	const acceleration = force / mass;

	// Euler integration
	const newVelocity = velocity + acceleration * dt;
	const newPosition = position + newVelocity * dt;

	return {
		position: newPosition,
		velocity: newVelocity,
	};
}

/**
 * Check if spring has settled
 */
export function isSpringSettled(
	state: SpringState,
	target: number,
	threshold = 0.001
): boolean {
	return (
		Math.abs(state.position - target) < threshold &&
		Math.abs(state.velocity) < threshold
	);
}

// =============================================================================
// Interpolation Helpers
// =============================================================================

/**
 * Linear interpolation
 */
export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/**
 * Map value from one range to another
 */
export function mapRange(
	value: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number
): number {
	return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

/**
 * Smooth step interpolation
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
	return t * t * (3 - 2 * t);
}

/**
 * Smoother step interpolation (Ken Perlin's version)
 */
export function smootherstep(edge0: number, edge1: number, x: number): number {
	const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
	return t * t * t * (t * (t * 6 - 15) + 10);
}
