/**
 * Animation Types - Keyframe animation system
 * 关键帧动画系统类型定义
 *
 * Core types are imported from @neko/shared for Single Source of Truth.
 * This file extends with webview-specific utilities (i18n keys, factory functions).
 */

// =============================================================================
// Re-export Core Types from Shared
// =============================================================================

export type {
  EasingType,
  BezierHandle,
  AnimationKeyframe,
  AnimatableProperty,
  AnimatablePropertyName,
  ElementTransform,
  ComputedTransform,
} from '@neko/shared';

export {
  createAnimatableProperty,
  createDefaultElementTransform,
} from '@neko/shared';

import type {
  EasingType,
  AnimatablePropertyName,
  AnimationKeyframe,
} from '@neko/shared';

// =============================================================================
// Webview-Specific Extensions: i18n Keys
// =============================================================================

/**
 * Easing type translation keys for i18n
 * 缓动类型的翻译键
 */
export const EASING_TYPE_I18N_KEYS: Record<EasingType, string> = {
  'linear': 'animation.easing.linear',
  'ease-in': 'animation.easing.easeIn',
  'ease-out': 'animation.easing.easeOut',
  'ease-in-out': 'animation.easing.easeInOut',
  'ease-in-quad': 'animation.easing.easeInQuad',
  'ease-out-quad': 'animation.easing.easeOutQuad',
  'ease-in-out-quad': 'animation.easing.easeInOutQuad',
  'ease-in-cubic': 'animation.easing.easeInCubic',
  'ease-out-cubic': 'animation.easing.easeOutCubic',
  'ease-in-out-cubic': 'animation.easing.easeInOutCubic',
  'ease-in-back': 'animation.easing.easeInBack',
  'ease-out-back': 'animation.easing.easeOutBack',
  'ease-in-out-back': 'animation.easing.easeInOutBack',
  'bezier': 'animation.easing.bezier',
};

/**
 * Property name translation keys for i18n
 * 属性名称的翻译键
 */
export const ANIMATABLE_PROPERTY_I18N_KEYS: Record<AnimatablePropertyName, string> = {
  'x': 'animation.property.positionX',
  'y': 'animation.property.positionY',
  'scaleX': 'animation.property.scaleX',
  'scaleY': 'animation.property.scaleY',
  'scale': 'animation.property.scale',
  'rotation': 'animation.property.rotation',
  'opacity': 'animation.property.opacity',
  'anchorX': 'animation.property.anchorX',
  'anchorY': 'animation.property.anchorY',
};

// =============================================================================
// Webview-Specific Extensions: Factory Functions
// =============================================================================

/**
 * Create a keyframe with default values
 * 创建具有默认值的关键帧
 */
export function createKeyframe(
  time: number,
  value: number,
  easing: EasingType = 'linear'
): AnimationKeyframe {
  return {
    id: `kf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    time,
    value,
    easing,
  };
}

// =============================================================================
// Webview-Specific Extensions: Keyframe Selection
// =============================================================================

/**
 * Keyframe selection reference
 * 关键帧选择引用
 */
export interface KeyframeSelection {
  trackId: string;
  elementId: string;
  propertyName: AnimatablePropertyName;
  keyframeId: string;
}
