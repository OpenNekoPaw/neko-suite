/**
 * Animation Calculation Engine (Shared)
 * 动画计算引擎 - 处理关键帧插值和缓动函数
 *
 * 此模块可在 Extension 和 Webview 中共享使用
 */

import type {
	AnimationKeyframe,
	AnimatableProperty,
	ElementTransform,
	ComputedTransform,
} from '../types/animation';
import type { EasingType } from '../types/easing';

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

/**
 * Get element transform at a specific local time
 * 获取元素在指定局部时间的变换
 *
 * @param transform - Element transform with animatable properties
 * @param localTime - Time relative to element start (in seconds)
 * @returns Computed transform values
 */
export function getComputedTransform(
	transform: ElementTransform | undefined,
	localTime: number
): ComputedTransform {
	// Default transform when none provided
	if (!transform) {
		return {
			x: 0.5,
			y: 0.5,
			scaleX: 1,
			scaleY: 1,
			rotation: 0,
			opacity: 1,
			anchorX: 0.5,
			anchorY: 0.5,
		};
	}

	// Compute animated values for each property
	return {
		x: getAnimatedValue(transform.x, localTime),
		y: getAnimatedValue(transform.y, localTime),
		scaleX: getAnimatedValue(transform.scaleX, localTime),
		scaleY: getAnimatedValue(transform.scaleY, localTime),
		rotation: getAnimatedValue(transform.rotation, localTime),
		opacity: getAnimatedValue(transform.opacity, localTime),
		anchorX: transform.anchorX,
		anchorY: transform.anchorY,
	};
}

/**
 * Check if a property has keyframes
 * 检查属性是否有关键帧
 */
export function hasKeyframes(property: AnimatableProperty | undefined): boolean {
	return property !== undefined && property.keyframes.length > 0;
}
