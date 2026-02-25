/**
 * Shape Animation Utilities
 * 形状动画工具函数
 *
 * Core interpolation is imported from local animation utils.
 * This file provides shape-specific animation computation and path utilities.
 */

import type {
  ShapeAnimationState,
  ShapeTransform,
  StrokeAnimation,
  ComputedShapeTransform,
  ComputedStrokeAnimation,
} from '../types/shapeAnimation';
import type { AnimatableProperty } from '../types/animation';

// Import core interpolation from local animation utils
import { getAnimatedValue } from './animation';

// =============================================================================
// Property Interpolation (delegates to @neko/shared)
// =============================================================================

/**
 * Get the interpolated value of an animatable property at a given time.
 * Delegates to @neko/shared's getAnimatedValue (binary search O(log n)).
 */
export function interpolateProperty(property: AnimatableProperty, time: number): number {
  return getAnimatedValue(property, time);
}

// =============================================================================
// Shape Transform Computation
// =============================================================================

/**
 * Compute shape transform at a specific time
 * 计算指定时间的形状变换
 */
export function computeShapeTransform(
  transform: ShapeTransform,
  time: number
): ComputedShapeTransform {
  return {
    x: getAnimatedValue(transform.x, time),
    y: getAnimatedValue(transform.y, time),
    scaleX: getAnimatedValue(transform.scaleX, time),
    scaleY: getAnimatedValue(transform.scaleY, time),
    rotation: getAnimatedValue(transform.rotation, time),
    opacity: getAnimatedValue(transform.opacity, time),
    anchorX: transform.anchorX,
    anchorY: transform.anchorY,
  };
}

/**
 * Compute stroke animation at a specific time
 * 计算指定时间的描边动画值
 */
export function computeStrokeAnimation(
  stroke: StrokeAnimation,
  time: number
): ComputedStrokeAnimation {
  return {
    width: getAnimatedValue(stroke.width, time),
    opacity: getAnimatedValue(stroke.opacity, time),
    dashOffset: getAnimatedValue(stroke.dashOffset, time),
    trimStart: getAnimatedValue(stroke.trimStart, time),
    trimEnd: getAnimatedValue(stroke.trimEnd, time),
  };
}

// =============================================================================
// Path Trimming
// =============================================================================

/**
 * Get SVG path segment at specified trim range
 * 获取指定修剪范围的 SVG 路径段
 */
export function getTrimmedPathData(
  pathData: string,
  trimStart: number,
  trimEnd: number
): { path: string; dashArray: string; dashOffset: number } {
  const estimatedLength = 1000;

  const visibleLength = (trimEnd - trimStart) * estimatedLength;
  const offset = trimStart * estimatedLength;

  return {
    path: pathData,
    dashArray: `${visibleLength} ${estimatedLength}`,
    dashOffset: -offset,
  };
}

/**
 * Calculate actual path length from SVG path data
 */
export function calculatePathLength(pathData: string): number {
  if (typeof document === 'undefined') {
    return 1000;
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);

  svg.style.position = 'absolute';
  svg.style.visibility = 'hidden';
  document.body.appendChild(svg);

  const length = path.getTotalLength();

  document.body.removeChild(svg);

  return length;
}

// =============================================================================
// CSS Transform Generation
// =============================================================================

/**
 * Generate CSS transform string from computed shape transform
 * 从计算的形状变换生成 CSS 变换字符串
 */
export function generateTransformCSS(
  transform: ComputedShapeTransform,
  containerWidth: number,
  containerHeight: number
): string {
  const translateX = (transform.x / 100) * containerWidth;
  const translateY = (transform.y / 100) * containerHeight;

  const transforms: string[] = [];

  transforms.push(`translate(${translateX}px, ${translateY}px)`);

  if (transform.scaleX !== 1 || transform.scaleY !== 1) {
    transforms.push(`scale(${transform.scaleX}, ${transform.scaleY})`);
  }

  if (transform.rotation !== 0) {
    transforms.push(`rotate(${transform.rotation}deg)`);
  }

  return transforms.join(' ');
}

/**
 * Generate SVG transform attribute from computed shape transform
 * 从计算的形状变换生成 SVG transform 属性
 */
export function generateTransformSVG(
  transform: ComputedShapeTransform,
  width: number,
  height: number
): string {
  const centerX = (transform.x / 100) * width;
  const centerY = (transform.y / 100) * height;

  const transforms: string[] = [];

  transforms.push(`translate(${centerX}, ${centerY})`);

  if (transform.rotation !== 0) {
    transforms.push(`rotate(${transform.rotation})`);
  }

  if (transform.scaleX !== 1 || transform.scaleY !== 1) {
    transforms.push(`scale(${transform.scaleX}, ${transform.scaleY})`);
  }

  const anchorOffsetX = -(transform.anchorX - 0.5) * width;
  const anchorOffsetY = -(transform.anchorY - 0.5) * height;
  if (anchorOffsetX !== 0 || anchorOffsetY !== 0) {
    transforms.push(`translate(${anchorOffsetX}, ${anchorOffsetY})`);
  }

  return transforms.join(' ');
}

// =============================================================================
// Shape Animation State Helpers
// =============================================================================

/**
 * Get current animated values from shape animation state
 */
export function getAnimatedValues(
  animation: ShapeAnimationState | undefined,
  time: number
): {
  transform: ComputedShapeTransform | null;
  stroke: ComputedStrokeAnimation | null;
  fillOpacity: number;
} {
  if (!animation) {
    return { transform: null, stroke: null, fillOpacity: 1 };
  }

  return {
    transform: computeShapeTransform(animation.transform, time),
    stroke: computeStrokeAnimation(animation.stroke, time),
    fillOpacity: getAnimatedValue(animation.fill.opacity, time),
  };
}

/**
 * Check if shape has any active animations at the given time
 */
export function isAnimatingAt(
  animation: ShapeAnimationState | undefined,
  time: number
): boolean {
  if (!animation) return false;

  const checkProperty = (prop: AnimatableProperty): boolean => {
    if (prop.keyframes.length < 2) return false;
    const first = prop.keyframes[0];
    const last = prop.keyframes[prop.keyframes.length - 1];
    return time >= first.time && time <= last.time;
  };

  return (
    checkProperty(animation.transform.x) ||
    checkProperty(animation.transform.y) ||
    checkProperty(animation.transform.scaleX) ||
    checkProperty(animation.transform.scaleY) ||
    checkProperty(animation.transform.rotation) ||
    checkProperty(animation.transform.opacity) ||
    checkProperty(animation.stroke.width) ||
    checkProperty(animation.stroke.opacity) ||
    checkProperty(animation.stroke.dashOffset) ||
    checkProperty(animation.stroke.trimStart) ||
    checkProperty(animation.stroke.trimEnd) ||
    checkProperty(animation.fill.opacity)
  );
}
