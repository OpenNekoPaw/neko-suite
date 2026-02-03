/**
 * Animation Types
 *
 * Keyframe animation system types for video editing.
 * Supports property animations with easing curves.
 */

import type { Point2D, Point3D, RGBA } from './geometry';
import type { EasingType, CubicBezierEasing } from './easing';

// =============================================================================
// Animatable Properties
// =============================================================================

/**
 * Properties that can be animated
 */
export type AnimatableProperty =
	// Transform
	| 'position'
	| 'positionX'
	| 'positionY'
	| 'positionZ'
	| 'scale'
	| 'scaleX'
	| 'scaleY'
	| 'rotation'
	| 'rotationX'
	| 'rotationY'
	| 'rotationZ'
	| 'anchor'
	| 'anchorX'
	| 'anchorY'
	// Opacity
	| 'opacity'
	// Color
	| 'color'
	| 'backgroundColor'
	// Effects
	| 'blur'
	| 'brightness'
	| 'contrast'
	| 'saturation'
	| 'hue'
	// Audio
	| 'volume'
	// Custom
	| string;

/**
 * Value types for animatable properties
 */
export type AnimatableValue = number | Point2D | Point3D | RGBA | string;

// =============================================================================
// Keyframes
// =============================================================================

/**
 * Single keyframe definition
 */
export interface Keyframe<T extends AnimatableValue = AnimatableValue> {
	/** Time in seconds from clip start */
	time: number;
	/** Value at this keyframe */
	value: T;
	/** Easing to next keyframe */
	easing?: EasingType | CubicBezierEasing;
	/** Bezier handles for graph editor (optional) */
	handles?: {
		in: Point2D;
		out: Point2D;
	};
}

/**
 * Keyframe track for a single property
 */
export interface KeyframeTrack<T extends AnimatableValue = AnimatableValue> {
	property: AnimatableProperty;
	keyframes: Keyframe<T>[];
	/** Default value when no keyframes */
	defaultValue?: T;
}

// =============================================================================
// Animation Definition
// =============================================================================

/**
 * Complete animation definition for an element
 */
export interface Animation {
	id: string;
	/** Target element ID */
	targetId: string;
	/** Keyframe tracks for different properties */
	tracks: KeyframeTrack[];
	/** Animation duration (auto-calculated from keyframes if not set) */
	duration?: number;
	/** Loop settings */
	loop?: {
		enabled: boolean;
		count?: number; // undefined = infinite
	};
}

// =============================================================================
// Element Transform State
// =============================================================================

/**
 * Current transform state of an element
 */
export interface ElementTransform {
	position: Point2D;
	scale: Point2D;
	rotation: number;
	anchor: Point2D;
	opacity: number;
}

/**
 * 3D transform state
 */
export interface ElementTransform3D {
	position: Point3D;
	scale: Point3D;
	rotation: Point3D;
	anchor: Point3D;
	opacity: number;
}

// =============================================================================
// Animation Presets
// =============================================================================

/**
 * Built-in animation preset types
 */
export type AnimationPresetType =
	// Entrance
	| 'fadeIn'
	| 'slideInLeft'
	| 'slideInRight'
	| 'slideInUp'
	| 'slideInDown'
	| 'zoomIn'
	| 'bounceIn'
	| 'rotateIn'
	// Exit
	| 'fadeOut'
	| 'slideOutLeft'
	| 'slideOutRight'
	| 'slideOutUp'
	| 'slideOutDown'
	| 'zoomOut'
	| 'bounceOut'
	| 'rotateOut'
	// Emphasis
	| 'pulse'
	| 'shake'
	| 'bounce'
	| 'swing'
	| 'wobble'
	| 'flash'
	| 'rubberBand'
	// Custom
	| 'custom';

/**
 * Animation preset definition
 */
export interface AnimationPreset {
	type: AnimationPresetType;
	name: string;
	duration: number;
	tracks: KeyframeTrack[];
}
