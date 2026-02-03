/**
 * Animation Calculation Engine
 * 动画计算引擎 - 处理关键帧插值和缓动函数
 */

import type {
  AnimationKeyframe,
  AnimatableProperty,
  EasingType,
  ElementTransform,
  ComputedTransform,
} from '../types/animation';
import { createDefaultElementTransform } from '../types/animation';

// =============================================================================
// Easing Functions
// =============================================================================

/**
 * Easing function implementations
 * 缓动函数实现
 */
export const easingFunctions: Record<EasingType, (t: number) => number> = {
  'linear': (t) => t,

  'ease-in': (t) => t * t,
  'ease-out': (t) => t * (2 - t),
  'ease-in-out': (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

  'ease-in-quad': (t) => t * t,
  'ease-out-quad': (t) => t * (2 - t),
  'ease-in-out-quad': (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

  'ease-in-cubic': (t) => t * t * t,
  'ease-out-cubic': (t) => {
    const t1 = t - 1;
    return t1 * t1 * t1 + 1;
  },
  'ease-in-out-cubic': (t) => {
    return t < 0.5
      ? 4 * t * t * t
      : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  },

  'ease-in-back': (t) => t * t * (2.70158 * t - 1.70158),
  'ease-out-back': (t) => {
    const t1 = t - 1;
    return 1 + t1 * t1 * (2.70158 * t1 + 1.70158);
  },
  'ease-in-out-back': (t) => {
    const c = 1.70158 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
  },

  // Bezier is handled separately
  'bezier': (t) => t,
};

/**
 * Apply easing to a progress value
 * 对进度值应用缓动
 */
export function applyEasing(progress: number, easing: EasingType): number {
  const fn = easingFunctions[easing];
  return fn ? fn(progress) : progress;
}

// =============================================================================
// Bezier Interpolation
// =============================================================================

/**
 * Cubic bezier interpolation
 * 三次贝塞尔插值
 */
export function cubicBezier(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number
): number {
  const u = 1 - t;
  return u * u * u * p0 +
         3 * u * u * t * p1 +
         3 * u * t * t * p2 +
         t * t * t * p3;
}

// =============================================================================
// Keyframe Value Calculation
// =============================================================================

/**
 * Binary search to find the pair of keyframes surrounding a given time
 * 二分查找包围给定时间的关键帧对
 *
 * @param sortedKeyframes - Pre-sorted array of keyframes
 * @param time - Time to search for
 * @returns Index of the keyframe before the given time, or -1 if before all keyframes
 */
function findKeyframeIndex(sortedKeyframes: AnimationKeyframe[], time: number): number {
  if (time <= sortedKeyframes[0].time) return -1;
  if (time >= sortedKeyframes[sortedKeyframes.length - 1].time) return sortedKeyframes.length - 1;

  let left = 0;
  let right = sortedKeyframes.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    if (sortedKeyframes[mid].time <= time &&
        (mid === sortedKeyframes.length - 1 || sortedKeyframes[mid + 1].time > time)) {
      return mid;
    }

    if (sortedKeyframes[mid].time > time) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return left - 1;
}

/**
 * Check if keyframes array is already sorted
 * 检查关键帧数组是否已排序
 */
function isSorted(keyframes: AnimationKeyframe[]): boolean {
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (keyframes[i].time > keyframes[i + 1].time) {
      return false;
    }
  }
  return true;
}

/**
 * Get the animated value of a property at a specific time
 * 获取属性在指定时间的动画值
 *
 * @param property - The animatable property
 * @param localTime - Time relative to element start (in seconds)
 * @returns The interpolated value at the given time
 */
export function getAnimatedValue(
  property: AnimatableProperty,
  localTime: number
): number {
  // Guard against undefined/null property
  if (!property) {
    return 0;
  }

  const { baseValue, keyframes } = property;

  // No keyframes - return base value
  if (!keyframes || keyframes.length === 0) {
    return baseValue;
  }

  // Only sort if needed (preserve original array if possible)
  const sorted = isSorted(keyframes)
    ? keyframes
    : [...keyframes].sort((a, b) => a.time - b.time);

  // Before first keyframe
  if (localTime <= sorted[0].time) {
    return sorted[0].value;
  }

  // After last keyframe
  if (localTime >= sorted[sorted.length - 1].time) {
    return sorted[sorted.length - 1].value;
  }

  // Binary search for surrounding keyframes (O(log n) instead of O(n))
  const prevIndex = findKeyframeIndex(sorted, localTime);
  const prevFrame = sorted[prevIndex];
  const nextFrame = sorted[prevIndex + 1];

  // Calculate interpolation progress
  const duration = nextFrame.time - prevFrame.time;
  const progress = duration > 0 ? (localTime - prevFrame.time) / duration : 0;

  // Apply bezier or standard easing
  if (prevFrame.easing === 'bezier' && prevFrame.bezierOut && nextFrame.bezierIn) {
    return cubicBezier(
      progress,
      prevFrame.value,
      prevFrame.value + prevFrame.bezierOut.y,
      nextFrame.value + nextFrame.bezierIn.y,
      nextFrame.value
    );
  } else {
    const easedProgress = applyEasing(progress, prevFrame.easing);
    return prevFrame.value + (nextFrame.value - prevFrame.value) * easedProgress;
  }
}

// =============================================================================
// Element Transform Calculation
// =============================================================================

/**
 * Get the complete transform values for an element at a specific time
 * 获取元素在指定时间的完整变换值
 *
 * @param transform - The element's transform properties
 * @param localTime - Time relative to element start (in seconds)
 * @returns Computed transform values
 */
export function getComputedTransform(
  transform: ElementTransform | undefined,
  localTime: number
): ComputedTransform {
  if (!transform) {
    const defaultTransform = createDefaultElementTransform();
    return {
      x: defaultTransform.x.baseValue,
      y: defaultTransform.y.baseValue,
      scaleX: defaultTransform.scaleX.baseValue,
      scaleY: defaultTransform.scaleY.baseValue,
      rotation: defaultTransform.rotation.baseValue,
      opacity: defaultTransform.opacity.baseValue,
      anchorX: defaultTransform.anchorX,
      anchorY: defaultTransform.anchorY,
    };
  }

  return {
    x: transform.x ? getAnimatedValue(transform.x, localTime) : 0.5,
    y: transform.y ? getAnimatedValue(transform.y, localTime) : 0.5,
    scaleX: transform.scaleX ? getAnimatedValue(transform.scaleX, localTime) : 1,
    scaleY: transform.scaleY ? getAnimatedValue(transform.scaleY, localTime) : 1,
    rotation: transform.rotation ? getAnimatedValue(transform.rotation, localTime) : 0,
    opacity: transform.opacity ? getAnimatedValue(transform.opacity, localTime) : 1,
    anchorX: transform.anchorX,
    anchorY: transform.anchorY,
  };
}

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
// Keyframe Utilities
// =============================================================================

/**
 * Check if a property has keyframes
 * 检查属性是否有关键帧
 */
export function hasKeyframes(property: AnimatableProperty | undefined): boolean {
  return property !== undefined && property.keyframes.length > 0;
}

/**
 * Get keyframe at specific time (within tolerance)
 * 获取指定时间的关键帧（在容差范围内）
 */
export function getKeyframeAtTime(
  property: AnimatableProperty,
  time: number,
  tolerance: number = 0.01
): AnimationKeyframe | undefined {
  // Guard against undefined/null property
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
 *
 * @param keyframes - Existing keyframes array
 * @param newKeyframe - Keyframe to insert
 * @returns New sorted array with the keyframe inserted
 */
export function insertKeyframeSorted(
  keyframes: AnimationKeyframe[],
  newKeyframe: AnimationKeyframe
): AnimationKeyframe[] {
  // Find insertion point using binary search
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

  // Insert at the found position
  const result = [...keyframes];
  result.splice(left, 0, newKeyframe);
  return result;
}

/**
 * Remove a keyframe at a specific time
 * 删除指定时间的关键帧
 *
 * @param keyframes - Existing keyframes array
 * @param time - Time of the keyframe to remove
 * @param tolerance - Time tolerance for matching
 * @returns New array with the keyframe removed, or original array if not found
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
    // Guard against undefined property or keyframes
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
// Interpolation Utilities
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
