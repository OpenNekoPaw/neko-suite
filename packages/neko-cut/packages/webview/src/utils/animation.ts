/**
 * Animation Utilities (Webview)
 * 动画工具函数 - Webview 专用扩展
 *
 * Core animation functions (easing, interpolation, computed transform) are
 * imported from @neko/shared (Single Source of Truth).
 * This file provides webview-specific utilities (keyframe CRUD, element
 * transform at global time, math helpers).
 */

import type {
  AnimationKeyframe,
  AnimatableProperty,
  ElementTransform,
  ComputedTransform,
} from '../types/animation';

// =============================================================================
// Re-export core animation functions from @neko/shared
// =============================================================================

export {
  easingFunctions,
  applyEasing,
  cubicBezier,
  getAnimatedValue,
  getComputedTransform,
  hasKeyframes,
} from '@neko/shared';

// =============================================================================
// Element Transform at Global Time (Webview-specific)
// =============================================================================

// Import for internal use
import { getComputedTransform } from '@neko/shared';

/**
 * Get element transform at global timeline time
 * 获取元素在全局时间轴时间的变换
 *
 * @param element - Timeline element with optional transform
 * @param globalTime - Current timeline time
 * @returns Computed transform values
 */
export function getElementTransformAtTime(
  element: {
    startTime: number;
    trimStart: number;
    transform?: ElementTransform;
    // Legacy properties for backward compatibility
    x?: number;
    y?: number;
    rotation?: number;
    opacity?: number;
  },
  globalTime: number
): ComputedTransform {
  const localTime = globalTime - element.startTime + element.trimStart;

  if (element.transform) {
    return getComputedTransform(element.transform, localTime);
  }

  // Fallback to legacy properties (for TextElement backward compatibility)
  return {
    x: element.x ?? 0.5,
    y: element.y ?? 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: element.rotation ?? 0,
    opacity: element.opacity ?? 1,
    anchorX: 0.5,
    anchorY: 0.5,
  };
}

// =============================================================================
// Keyframe CRUD Utilities (Webview-specific)
// =============================================================================

/**
 * Get keyframe at specific time (within tolerance)
 * 获取指定时间的关键帧（在容差范围内）
 */
export function getKeyframeAtTime(
  property: AnimatableProperty,
  time: number,
  tolerance: number = 0.01
): AnimationKeyframe | undefined {
  if (!property || !property.keyframes) {
    return undefined;
  }

  return property.keyframes.find(
    kf => Math.abs(kf.time - time) <= tolerance
  );
}

/**
 * Insert a keyframe while maintaining sorted order
 * 插入关键帧并保持有序
 */
export function insertKeyframeSorted(
  keyframes: AnimationKeyframe[],
  newKeyframe: AnimationKeyframe
): AnimationKeyframe[] {
  let left = 0;
  let right = keyframes.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (keyframes[mid].time < newKeyframe.time) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  const result = [...keyframes];
  result.splice(left, 0, newKeyframe);
  return result;
}

/**
 * Remove a keyframe at a specific time
 * 删除指定时间的关键帧
 */
export function removeKeyframeAtTime(
  keyframes: AnimationKeyframe[],
  time: number,
  tolerance: number = 0.01
): AnimationKeyframe[] {
  const index = keyframes.findIndex(kf => Math.abs(kf.time - time) <= tolerance);
  if (index === -1) return keyframes;

  const result = [...keyframes];
  result.splice(index, 1);
  return result;
}

/**
 * Get all unique keyframe times from a transform
 * 获取变换中所有唯一的关键帧时间
 */
export function getAllKeyframeTimes(transform: ElementTransform): number[] {
  const times = new Set<number>();

  const properties: AnimatableProperty[] = [
    transform.x,
    transform.y,
    transform.scaleX,
    transform.scaleY,
    transform.rotation,
    transform.opacity,
  ];

  for (const prop of properties) {
    if (prop && prop.keyframes) {
      for (const kf of prop.keyframes) {
        times.add(kf.time);
      }
    }
  }

  return Array.from(times).sort((a, b) => a - b);
}

/**
 * Get keyframes at a specific time across all properties
 * 获取所有属性在指定时间的关键帧
 */
export function getKeyframesAtTime(
  transform: ElementTransform,
  time: number,
  tolerance: number = 0.01
): Array<{ property: keyof ElementTransform; keyframe: AnimationKeyframe }> {
  const result: Array<{ property: keyof ElementTransform; keyframe: AnimationKeyframe }> = [];

  const animatableProps: (keyof ElementTransform)[] = [
    'x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'
  ];

  for (const propName of animatableProps) {
    const prop = transform[propName] as AnimatableProperty;
    const kf = getKeyframeAtTime(prop, time, tolerance);
    if (kf) {
      result.push({ property: propName, keyframe: kf });
    }
  }

  return result;
}

// =============================================================================
// Math Utilities
// =============================================================================

/**
 * Linear interpolation between two values
 * 两个值之间的线性插值
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Clamp a value between min and max
 * 将值限制在最小值和最大值之间
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
