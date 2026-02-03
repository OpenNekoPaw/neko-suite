/**
 * Shape Animation Utilities
 * 形状动画工具函数
 *
 * 提供形状动画的插值计算和路径处理
 */

import type {
  ShapeAnimationState,
  ShapeTransform,
  StrokeAnimation,
  ComputedShapeTransform,
  ComputedStrokeAnimation,
} from '../types/shapeAnimation';
import type { AnimatableProperty, AnimationKeyframe, EasingType } from '../types/animation';

// =============================================================================
// Easing Functions
// =============================================================================

/**
 * Standard easing function implementations
 */
const easingFunctions: Record<EasingType, (t: number) => number> = {
  'linear': (t) => t,
  'ease-in': (t) => t * t,
  'ease-out': (t) => t * (2 - t),
  'ease-in-out': (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  'ease-in-quad': (t) => t * t,
  'ease-out-quad': (t) => t * (2 - t),
  'ease-in-out-quad': (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  'ease-in-cubic': (t) => t * t * t,
  'ease-out-cubic': (t) => (--t) * t * t + 1,
  'ease-in-out-cubic': (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  'ease-in-back': (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  'ease-out-back': (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  'ease-in-out-back': (t) => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
  'bezier': (t) => t, // Bezier is handled specially
};

/**
 * Cubic bezier interpolation
 */
function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * Apply easing function to a progress value
 */
function applyEasing(t: number, easing: EasingType, keyframe?: AnimationKeyframe): number {
  if (easing === 'bezier' && keyframe?.bezierOut) {
    // Use bezier curve for easing
    const p1y = keyframe.bezierOut.y;
    const p2y = 1 - (keyframe.bezierIn?.y ?? 0);
    return cubicBezier(t, 0, p1y, p2y, 1);
  }
  return easingFunctions[easing](t);
}

// =============================================================================
// Property Interpolation
// =============================================================================

/**
 * Get the interpolated value of an animatable property at a given time
 * 获取可动画属性在指定时间的插值
 *
 * @param property The animatable property
 * @param time Time in seconds (relative to element start)
 * @returns Interpolated value
 */
export function interpolateProperty(property: AnimatableProperty, time: number): number {
  const { baseValue, keyframes } = property;

  // No keyframes - return base value
  if (keyframes.length === 0) {
    return baseValue;
  }

  // Sort keyframes by time (should already be sorted, but just in case)
  const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);

  // Before first keyframe
  if (time <= sortedKeyframes[0].time) {
    return sortedKeyframes[0].value;
  }

  // After last keyframe
  if (time >= sortedKeyframes[sortedKeyframes.length - 1].time) {
    return sortedKeyframes[sortedKeyframes.length - 1].value;
  }

  // Find surrounding keyframes
  for (let i = 0; i < sortedKeyframes.length - 1; i++) {
    const kf1 = sortedKeyframes[i];
    const kf2 = sortedKeyframes[i + 1];

    if (time >= kf1.time && time <= kf2.time) {
      // Interpolate between kf1 and kf2
      const duration = kf2.time - kf1.time;
      const progress = duration > 0 ? (time - kf1.time) / duration : 0;
      const easedProgress = applyEasing(progress, kf1.easing, kf1);

      return kf1.value + (kf2.value - kf1.value) * easedProgress;
    }
  }

  // Fallback (shouldn't reach here)
  return baseValue;
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
    x: interpolateProperty(transform.x, time),
    y: interpolateProperty(transform.y, time),
    scaleX: interpolateProperty(transform.scaleX, time),
    scaleY: interpolateProperty(transform.scaleY, time),
    rotation: interpolateProperty(transform.rotation, time),
    opacity: interpolateProperty(transform.opacity, time),
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
    width: interpolateProperty(stroke.width, time),
    opacity: interpolateProperty(stroke.opacity, time),
    dashOffset: interpolateProperty(stroke.dashOffset, time),
    trimStart: interpolateProperty(stroke.trimStart, time),
    trimEnd: interpolateProperty(stroke.trimEnd, time),
  };
}

// =============================================================================
// Path Trimming
// =============================================================================

/**
 * Get SVG path segment at specified trim range
 * 获取指定修剪范围的 SVG 路径段
 *
 * This is a simplified implementation. For production, consider using
 * a library like 'svg-path-commander' for accurate path operations.
 */
export function getTrimmedPathData(
  pathData: string,
  trimStart: number,
  trimEnd: number
): { path: string; dashArray: string; dashOffset: number } {
  // For simplicity, we use stroke-dasharray and stroke-dashoffset
  // to simulate path trimming
  //
  // trimStart=0, trimEnd=1 → full path
  // trimStart=0, trimEnd=0.5 → first half
  // trimStart=0.5, trimEnd=1 → second half

  // Estimate path length (for actual implementation, calculate from path data)
  const estimatedLength = 1000; // Placeholder

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
 * This requires creating an SVG path element and measuring it
 */
export function calculatePathLength(pathData: string): number {
  if (typeof document === 'undefined') {
    // SSR or non-browser environment
    return 1000; // Fallback estimate
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);

  // Temporarily add to DOM to measure
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

  // Transform origin is set via CSS transform-origin property
  // using anchorX and anchorY (0-1 values converted to percentage)

  const transforms: string[] = [];

  // Translation
  transforms.push(`translate(${translateX}px, ${translateY}px)`);

  // Scale
  if (transform.scaleX !== 1 || transform.scaleY !== 1) {
    transforms.push(`scale(${transform.scaleX}, ${transform.scaleY})`);
  }

  // Rotation
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

  // Translation to center
  transforms.push(`translate(${centerX}, ${centerY})`);

  // Rotation around origin
  if (transform.rotation !== 0) {
    transforms.push(`rotate(${transform.rotation})`);
  }

  // Scale
  if (transform.scaleX !== 1 || transform.scaleY !== 1) {
    transforms.push(`scale(${transform.scaleX}, ${transform.scaleY})`);
  }

  // Translate back based on anchor
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
    fillOpacity: interpolateProperty(animation.fill.opacity, time),
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

  // Check all animatable properties
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
