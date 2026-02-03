/**
 * Geometry Types
 *
 * Core geometric primitives used across all effect systems.
 * Platform-agnostic, can be used in WebGL, WebGPU, and wgpu.
 */

// =============================================================================
// 2D Primitives
// =============================================================================

export interface Point2D {
	x: number;
	y: number;
}

export interface Size2D {
	width: number;
	height: number;
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

// =============================================================================
// Bezier Curves
// =============================================================================

export interface BezierPoint {
	position: Point2D;
	controlIn: Point2D;
	controlOut: Point2D;
}

export interface CubicBezier {
	p0: Point2D;
	p1: Point2D; // control point 1
	p2: Point2D; // control point 2
	p3: Point2D;
}

// =============================================================================
// Transforms
// =============================================================================

export interface Transform2D {
	position: Point2D;
	scale: Point2D;
	rotation: number; // degrees
	anchor: Point2D;
}

export interface Matrix3x3 {
	m00: number; m01: number; m02: number;
	m10: number; m11: number; m12: number;
	m20: number; m21: number; m22: number;
}

// =============================================================================
// 3D Primitives (for 3D transitions)
// =============================================================================

export interface Point3D {
	x: number;
	y: number;
	z: number;
}

export interface Transform3D {
	position: Point3D;
	scale: Point3D;
	rotation: Point3D; // euler angles in degrees
	anchor: Point3D;
}

export interface Matrix4x4 {
	m: [
		number, number, number, number,
		number, number, number, number,
		number, number, number, number,
		number, number, number, number
	];
}

// =============================================================================
// Color Types
// =============================================================================

export interface RGBA {
	r: number; // 0-1
	g: number; // 0-1
	b: number; // 0-1
	a: number; // 0-1
}

export interface HSLA {
	h: number; // 0-360
	s: number; // 0-1
	l: number; // 0-1
	a: number; // 0-1
}

export interface HSVA {
	h: number; // 0-360
	s: number; // 0-1
	v: number; // 0-1
	a: number; // 0-1
}

// =============================================================================
// Gradient Types
// =============================================================================

export interface GradientStop {
	offset: number; // 0-1
	color: RGBA;
}

export interface LinearGradient {
	type: 'linear';
	angle: number; // degrees
	stops: GradientStop[];
}

export interface RadialGradient {
	type: 'radial';
	center: Point2D; // normalized 0-1
	radius: number;
	stops: GradientStop[];
}

export type Gradient = LinearGradient | RadialGradient;
