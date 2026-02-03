/**
 * Mask Types
 *
 * Mask and matte definitions for compositing.
 * Supports shape masks, bezier paths, and track mattes.
 */

import type { Point2D, BezierPoint, RGBA } from './geometry';
import type { BlendModeType } from './blendMode';

// =============================================================================
// Mask Shape Types
// =============================================================================

export type MaskShapeType =
	| 'rectangle'
	| 'ellipse'
	| 'polygon'
	| 'star'
	| 'bezier'
	| 'freehand';

// =============================================================================
// Mask Mode
// =============================================================================

export type MaskMode =
	| 'add'
	| 'subtract'
	| 'intersect'
	| 'difference'
	| 'none';

// =============================================================================
// Mask Shapes
// =============================================================================

export interface RectangleMask {
	type: 'rectangle';
	x: number;
	y: number;
	width: number;
	height: number;
	cornerRadius?: number;
}

export interface EllipseMask {
	type: 'ellipse';
	centerX: number;
	centerY: number;
	radiusX: number;
	radiusY: number;
}

export interface PolygonMask {
	type: 'polygon';
	points: Point2D[];
	closed: boolean;
}

export interface StarMask {
	type: 'star';
	centerX: number;
	centerY: number;
	outerRadius: number;
	innerRadius: number;
	points: number;
	rotation?: number;
}

export interface BezierMask {
	type: 'bezier';
	points: BezierPoint[];
	closed: boolean;
}

export interface FreehandMask {
	type: 'freehand';
	points: Point2D[];
	smoothing?: number;
}

export type MaskShape =
	| RectangleMask
	| EllipseMask
	| PolygonMask
	| StarMask
	| BezierMask
	| FreehandMask;

// =============================================================================
// Mask Definition
// =============================================================================

export interface Mask {
	id: string;
	name: string;
	shape: MaskShape;
	mode: MaskMode;
	/** Mask opacity (0-1) */
	opacity: number;
	/** Feather/blur amount in pixels */
	feather: number;
	/** Expansion/contraction in pixels */
	expansion: number;
	/** Invert mask */
	inverted: boolean;
	/** Lock mask for editing */
	locked?: boolean;
	/** Mask color for display */
	displayColor?: RGBA;
}

/**
 * Mask instance on a clip
 */
export interface MaskInstance {
	id: string;
	maskId: string;
	clipId: string;
	/** Order in mask stack */
	order: number;
	/** Enabled state */
	enabled: boolean;
	/** Keyframe animations for mask properties */
	animations?: MaskAnimationData;
}

// =============================================================================
// Mask Animation
// =============================================================================

export interface MaskAnimationData {
	/** Animated mask path points */
	path?: MaskPathKeyframe[];
	/** Animated opacity */
	opacity?: MaskPropertyKeyframe[];
	/** Animated feather */
	feather?: MaskPropertyKeyframe[];
	/** Animated expansion */
	expansion?: MaskPropertyKeyframe[];
}

export interface MaskPathKeyframe {
	time: number;
	shape: MaskShape;
}

export interface MaskPropertyKeyframe {
	time: number;
	value: number;
}

// =============================================================================
// Track Matte
// =============================================================================

export type TrackMatteType =
	| 'alpha'
	| 'alphaInverted'
	| 'luma'
	| 'lumaInverted';

export interface TrackMatte {
	id: string;
	/** Source layer ID for matte */
	sourceLayerId: string;
	/** Target layer ID to apply matte */
	targetLayerId: string;
	type: TrackMatteType;
}

// =============================================================================
// Roto Brush (AI-assisted masking)
// =============================================================================

export interface RotoBrushStroke {
	id: string;
	/** Foreground (include) or background (exclude) */
	mode: 'foreground' | 'background';
	points: Point2D[];
	brushSize: number;
	frame: number;
}

export interface RotoBrushMask {
	id: string;
	clipId: string;
	strokes: RotoBrushStroke[];
	/** Propagation range */
	startFrame: number;
	endFrame: number;
	/** Edge refinement settings */
	edgeSettings?: {
		feather: number;
		contrast: number;
		shift: number;
	};
}
