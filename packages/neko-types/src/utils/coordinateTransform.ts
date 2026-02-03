/**
 * Coordinate Transform Utilities
 *
 * Provides coordinate conversion between Web (normalized 0-1) and Rust (pixel) coordinate systems.
 * This is critical for maintaining visual consistency between Basic Mode (Web preview) and
 * Compatible Mode (Rust export).
 *
 * Coordinate System Summary:
 * - Web (Basic Mode): Uses 0-1 normalized coordinates where (0.5, 0.5) is center
 * - Rust (Compatible Mode): Uses pixel coordinates where (0, 0) is top-left
 *
 * Anchor Point Semantics:
 * - Web: anchorX/anchorY are 0-1 normalized (0.5 = center of layer)
 * - Rust: anchor_x/anchor_y are 0-1 normalized (same semantics)
 */

import type { Transform } from '../types/transform';

// =============================================================================
// Types
// =============================================================================

/**
 * Rust Transform2D format (pixel-based)
 * Matches the Transform2D struct in compositor.rs
 */
export interface RustTransform2D {
	/** Position X in pixels */
	x: number;
	/** Position Y in pixels */
	y: number;
	/** Scale X (1.0 = 100%) */
	scaleX: number;
	/** Scale Y (1.0 = 100%) */
	scaleY: number;
	/** Rotation in degrees */
	rotation: number;
	/** Anchor point X (0-1, 0.5 = center) */
	anchorX: number;
	/** Anchor point Y (0-1, 0.5 = center) */
	anchorY: number;
}

/**
 * Point in 2D space
 */
export interface Point2D {
	x: number;
	y: number;
}

// =============================================================================
// Coordinate Conversion Functions
// =============================================================================

/**
 * Convert pixel coordinates to normalized 0-1 range
 *
 * @param x - X position in pixels
 * @param y - Y position in pixels
 * @param width - Canvas/output width in pixels
 * @param height - Canvas/output height in pixels
 * @returns Normalized coordinates where (0.5, 0.5) is center
 *
 * @example
 * // For a 1920x1080 canvas, center point (960, 540) becomes (0.5, 0.5)
 * pixelToNormalized(960, 540, 1920, 1080) // { x: 0.5, y: 0.5 }
 */
export function pixelToNormalized(
	x: number,
	y: number,
	width: number,
	height: number
): Point2D {
	if (width <= 0 || height <= 0) {
		return { x: 0.5, y: 0.5 };
	}
	return {
		x: x / width,
		y: y / height,
	};
}

/**
 * Convert normalized 0-1 coordinates to pixel coordinates
 *
 * @param x - Normalized X position (0-1)
 * @param y - Normalized Y position (0-1)
 * @param width - Canvas/output width in pixels
 * @param height - Canvas/output height in pixels
 * @returns Pixel coordinates
 *
 * @example
 * // For a 1920x1080 canvas, (0.5, 0.5) becomes center pixel (960, 540)
 * normalizedToPixel(0.5, 0.5, 1920, 1080) // { x: 960, y: 540 }
 */
export function normalizedToPixel(
	x: number,
	y: number,
	width: number,
	height: number
): Point2D {
	return {
		x: x * width,
		y: y * height,
	};
}

/**
 * Transform Web ITransform (normalized coordinates) to Rust Transform2D format (pixel coordinates)
 *
 * This is the key function for maintaining visual consistency between Web preview and Rust export.
 *
 * Web coordinate system:
 * - x, y: 0-1 normalized, (0.5, 0.5) = center of output
 * - Position represents where the layer's anchor point is placed on the output canvas
 *
 * Rust coordinate system:
 * - x, y: pixels, (0, 0) = top-left of output
 * - Position represents where the layer's anchor point is placed on the output canvas
 *
 * The transform formula:
 * 1. Web position (0.5, 0.5) means the layer's anchor is at output center
 * 2. Convert: rust_x = web_x * outputWidth, rust_y = web_y * outputHeight
 *
 * @param transform - Web Transform with normalized coordinates
 * @param outputWidth - Output canvas width in pixels
 * @param outputHeight - Output canvas height in pixels
 * @param _layerWidth - Layer source width in pixels (reserved for future use)
 * @param _layerHeight - Layer source height in pixels (reserved for future use)
 * @returns Rust-compatible Transform2D with pixel coordinates
 */
export function webTransformToRust(
	transform: Transform,
	outputWidth: number,
	outputHeight: number,
	_layerWidth?: number,
	_layerHeight?: number
): RustTransform2D {
	// Convert normalized position to pixel position
	// Web: (0.5, 0.5) = center → Rust: (outputWidth/2, outputHeight/2)
	const pixelPosition = normalizedToPixel(
		transform.x,
		transform.y,
		outputWidth,
		outputHeight
	);

	return {
		x: pixelPosition.x,
		y: pixelPosition.y,
		scaleX: transform.scaleX,
		scaleY: transform.scaleY,
		rotation: transform.rotation,
		// Anchor points remain in normalized 0-1 format (same semantics)
		anchorX: transform.anchorX,
		anchorY: transform.anchorY,
	};
}

/**
 * Transform Rust Transform2D (pixel coordinates) to Web ITransform format (normalized coordinates)
 *
 * Inverse of webTransformToRust. Useful for:
 * - Importing from external tools that use pixel coordinates
 * - Preview consistency testing
 *
 * @param transform - Rust Transform2D with pixel coordinates
 * @param outputWidth - Output canvas width in pixels
 * @param outputHeight - Output canvas height in pixels
 * @returns Web-compatible Transform with normalized coordinates
 */
export function rustTransformToWeb(
	transform: RustTransform2D,
	outputWidth: number,
	outputHeight: number
): Transform {
	const normalizedPosition = pixelToNormalized(
		transform.x,
		transform.y,
		outputWidth,
		outputHeight
	);

	return {
		x: normalizedPosition.x,
		y: normalizedPosition.y,
		scaleX: transform.scaleX,
		scaleY: transform.scaleY,
		rotation: transform.rotation,
		anchorX: transform.anchorX,
		anchorY: transform.anchorY,
	};
}

/**
 * Create a default Rust transform (layer at top-left, no transformations)
 */
export function createDefaultRustTransform(): RustTransform2D {
	return {
		x: 0,
		y: 0,
		scaleX: 1,
		scaleY: 1,
		rotation: 0,
		anchorX: 0,
		anchorY: 0,
	};
}

/**
 * Create a centered Rust transform (layer at center of output)
 */
export function createCenteredRustTransform(
	outputWidth: number,
	outputHeight: number
): RustTransform2D {
	return {
		x: outputWidth / 2,
		y: outputHeight / 2,
		scaleX: 1,
		scaleY: 1,
		rotation: 0,
		anchorX: 0.5,
		anchorY: 0.5,
	};
}
