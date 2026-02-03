/**
 * Shape Types
 *
 * Vector shape definitions for graphics and overlays.
 * Supports basic shapes, paths, and text.
 */

import type { Point2D, BezierPoint, RGBA, Gradient } from './geometry';
import type { BlendModeType } from './blendMode';

// =============================================================================
// Shape Types
// =============================================================================

export type ShapeType =
	| 'rectangle'
	| 'ellipse'
	| 'polygon'
	| 'star'
	| 'line'
	| 'polyline'
	| 'path'
	| 'text'
	| 'group';

// =============================================================================
// Fill Types
// =============================================================================

export type FillType = 'solid' | 'gradient' | 'none';

export interface SolidFill {
	type: 'solid';
	color: RGBA;
}

export interface GradientFill {
	type: 'gradient';
	gradient: Gradient;
}

export interface NoFill {
	type: 'none';
}

export type ShapeFill = SolidFill | GradientFill | NoFill;

// =============================================================================
// Stroke Types
// =============================================================================

export type StrokeLineCap = 'butt' | 'round' | 'square';
export type StrokeLineJoin = 'miter' | 'round' | 'bevel';

export interface ShapeStroke {
	enabled: boolean;
	color: RGBA;
	width: number;
	lineCap?: StrokeLineCap;
	lineJoin?: StrokeLineJoin;
	miterLimit?: number;
	dashArray?: number[];
	dashOffset?: number;
}

// =============================================================================
// Shape Style
// =============================================================================

export interface ShapeStyle {
	fill: ShapeFill;
	stroke: ShapeStroke;
	opacity: number;
	blendMode?: BlendModeType;
	/** Drop shadow */
	shadow?: {
		enabled: boolean;
		color: RGBA;
		offsetX: number;
		offsetY: number;
		blur: number;
		spread?: number;
	};
}

// =============================================================================
// Shape Definitions
// =============================================================================

export interface BaseShape {
	id: string;
	name: string;
	type: ShapeType;
	style: ShapeStyle;
	transform: {
		x: number;
		y: number;
		rotation: number;
		scaleX: number;
		scaleY: number;
		anchorX: number;
		anchorY: number;
	};
	locked?: boolean;
	visible?: boolean;
}

export interface RectangleShape extends BaseShape {
	type: 'rectangle';
	width: number;
	height: number;
	cornerRadius?: number | [number, number, number, number];
}

export interface EllipseShape extends BaseShape {
	type: 'ellipse';
	radiusX: number;
	radiusY: number;
}

export interface PolygonShape extends BaseShape {
	type: 'polygon';
	points: Point2D[];
	closed: boolean;
}

export interface StarShape extends BaseShape {
	type: 'star';
	outerRadius: number;
	innerRadius: number;
	points: number;
}

export interface LineShape extends BaseShape {
	type: 'line';
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface PolylineShape extends BaseShape {
	type: 'polyline';
	points: Point2D[];
}

export interface PathShape extends BaseShape {
	type: 'path';
	points: BezierPoint[];
	closed: boolean;
}

export interface TextShape extends BaseShape {
	type: 'text';
	text: string;
	fontSize: number;
	fontFamily: string;
	fontWeight?: number | 'normal' | 'bold';
	fontStyle?: 'normal' | 'italic';
	textAlign?: 'left' | 'center' | 'right';
	verticalAlign?: 'top' | 'middle' | 'bottom';
	lineHeight?: number;
	letterSpacing?: number;
	/** Text box dimensions (for wrapping) */
	boxWidth?: number;
	boxHeight?: number;
}

export interface GroupShape extends BaseShape {
	type: 'group';
	children: Shape[];
}

export type Shape =
	| RectangleShape
	| EllipseShape
	| PolygonShape
	| StarShape
	| LineShape
	| PolylineShape
	| PathShape
	| TextShape
	| GroupShape;

// =============================================================================
// Shape Layer
// =============================================================================

export interface ShapeLayer {
	id: string;
	name: string;
	shapes: Shape[];
	/** Layer dimensions */
	width: number;
	height: number;
	/** Layer opacity */
	opacity: number;
	blendMode?: BlendModeType;
	/** Layer visibility */
	visible: boolean;
	locked: boolean;
}
