/**
 * Transition Types - Transition effect system
 * 转场效果系统类型定义
 *
 * Core types are imported from @neko/shared for Single Source of Truth.
 * This file extends with webview-specific utilities (i18n keys, icons, presets).
 */

// =============================================================================
// Re-export Core Types from Shared
// =============================================================================

export type {
  TransitionType,
  TransitionDirection,
  TransitionParams,
  Transition,
  TransitionPlacement,
  ElementTransition,
  EasingType,
} from '@neko/shared';

import type {
  TransitionType,
  Transition,
  TransitionParams,
  TransitionPlacement,
  EasingType,
} from '@neko/shared';

// =============================================================================
// Webview-Specific Extensions: i18n Keys
// =============================================================================

/**
 * Transition type translation keys for i18n
 * 转场类型的翻译键
 */
export const TRANSITION_TYPE_I18N_KEYS: Record<TransitionType, string> = {
  // Basic
  'none': 'transition.type.none',
  'fade': 'transition.type.fade',
  'dissolve': 'transition.type.dissolve',
  // Slide
  'slide-left': 'transition.type.slideLeft',
  'slide-right': 'transition.type.slideRight',
  'slide-up': 'transition.type.slideUp',
  'slide-down': 'transition.type.slideDown',
  // Zoom
  'zoom-in': 'transition.type.zoomIn',
  'zoom-out': 'transition.type.zoomOut',
  'cross-zoom': 'transition.type.crossZoom',
  // Wipe
  'wipe-left': 'transition.type.wipeLeft',
  'wipe-right': 'transition.type.wipeRight',
  'wipe-up': 'transition.type.wipeUp',
  'wipe-down': 'transition.type.wipeDown',
  // Iris
  'iris-in': 'transition.type.irisIn',
  'iris-out': 'transition.type.irisOut',
  // Clock Wipe
  'clock-wipe': 'transition.type.clockWipe',
  'clock-wipe-ccw': 'transition.type.clockWipeCCW',
  // Blinds
  'blinds-horizontal': 'transition.type.blindsHorizontal',
  'blinds-vertical': 'transition.type.blindsVertical',
  // 3D Effects
  'cube-left': 'transition.type.cubeLeft',
  'cube-right': 'transition.type.cubeRight',
  'cube-up': 'transition.type.cubeUp',
  'cube-down': 'transition.type.cubeDown',
  'flip-horizontal': 'transition.type.flipHorizontal',
  'flip-vertical': 'transition.type.flipVertical',
  // Page
  'page-curl-left': 'transition.type.pageCurlLeft',
  'page-curl-right': 'transition.type.pageCurlRight',
  // Special
  'pixelate': 'transition.type.pixelate',
  'blur': 'transition.type.blur',
  'glitch': 'transition.type.glitch',
  'radial-wipe': 'transition.type.radialWipe',
  'morph': 'transition.type.morph',
  // Dip
  'dip-to-black': 'transition.type.dipToBlack',
  'dip-to-white': 'transition.type.dipToWhite',
  'dip-to-color': 'transition.type.dipToColor',
  // Custom
  'custom': 'transition.type.custom',
};

/**
 * Transition icons for UI display
 * 转场图标
 */
export const TRANSITION_ICONS: Record<TransitionType, string> = {
  // Basic
  'none': '',
  'fade': '◐',
  'dissolve': '◑',
  // Slide
  'slide-left': '←',
  'slide-right': '→',
  'slide-up': '↑',
  'slide-down': '↓',
  // Zoom
  'zoom-in': '⊕',
  'zoom-out': '⊖',
  'cross-zoom': '⊛',
  // Wipe
  'wipe-left': '▌',
  'wipe-right': '▐',
  'wipe-up': '▀',
  'wipe-down': '▄',
  // Iris
  'iris-in': '◎',
  'iris-out': '○',
  // Clock Wipe
  'clock-wipe': '◷',
  'clock-wipe-ccw': '◶',
  // Blinds
  'blinds-horizontal': '☰',
  'blinds-vertical': '☷',
  // 3D Effects
  'cube-left': '⬅',
  'cube-right': '➡',
  'cube-up': '⬆',
  'cube-down': '⬇',
  'flip-horizontal': '↔',
  'flip-vertical': '↕',
  // Page
  'page-curl-left': '⤺',
  'page-curl-right': '⤻',
  // Special
  'pixelate': '▦',
  'blur': '◌',
  'glitch': '⚡',
  'radial-wipe': '◉',
  'morph': '∞',
  // Dip
  'dip-to-black': '■',
  'dip-to-white': '□',
  'dip-to-color': '▣',
  // Custom
  'custom': '✧',
};

// =============================================================================
// Webview-Specific Extensions: Transition Presets
// =============================================================================

/**
 * Transition preset for quick selection
 * 转场预设
 */
export interface TransitionPreset {
  type: TransitionType;
  i18nKey: string;
  icon: string;
  defaultDuration: number;
  defaultEasing: EasingType;
  params?: TransitionParams;
}

/**
 * Default transition presets
 * 默认转场预设
 */
export const TRANSITION_PRESETS: TransitionPreset[] = [
  // Basic
  {
    type: 'fade',
    i18nKey: 'transition.preset.fade',
    icon: '◐',
    defaultDuration: 0.5,
    defaultEasing: 'ease-in-out',
  },
  {
    type: 'dissolve',
    i18nKey: 'transition.preset.dissolve',
    icon: '◑',
    defaultDuration: 0.5,
    defaultEasing: 'linear',
  },
  // Slide
  {
    type: 'slide-left',
    i18nKey: 'transition.preset.slideLeft',
    icon: '←',
    defaultDuration: 0.3,
    defaultEasing: 'ease-out',
  },
  {
    type: 'slide-right',
    i18nKey: 'transition.preset.slideRight',
    icon: '→',
    defaultDuration: 0.3,
    defaultEasing: 'ease-out',
  },
  // Zoom
  {
    type: 'zoom-in',
    i18nKey: 'transition.preset.zoomIn',
    icon: '⊕',
    defaultDuration: 0.4,
    defaultEasing: 'ease-in-out',
  },
  {
    type: 'zoom-out',
    i18nKey: 'transition.preset.zoomOut',
    icon: '⊖',
    defaultDuration: 0.4,
    defaultEasing: 'ease-in-out',
  },
  {
    type: 'cross-zoom',
    i18nKey: 'transition.preset.crossZoom',
    icon: '⊛',
    defaultDuration: 0.5,
    defaultEasing: 'ease-in-out',
  },
  // Wipe
  {
    type: 'wipe-left',
    i18nKey: 'transition.preset.wipeLeft',
    icon: '▌',
    defaultDuration: 0.5,
    defaultEasing: 'linear',
    params: { softness: 0.05 },
  },
  {
    type: 'wipe-right',
    i18nKey: 'transition.preset.wipeRight',
    icon: '▐',
    defaultDuration: 0.5,
    defaultEasing: 'linear',
    params: { softness: 0.05 },
  },
  // Iris
  {
    type: 'iris-in',
    i18nKey: 'transition.preset.irisIn',
    icon: '◎',
    defaultDuration: 0.5,
    defaultEasing: 'ease-out',
  },
  {
    type: 'iris-out',
    i18nKey: 'transition.preset.irisOut',
    icon: '○',
    defaultDuration: 0.5,
    defaultEasing: 'ease-in',
  },
  // Clock Wipe
  {
    type: 'clock-wipe',
    i18nKey: 'transition.preset.clockWipe',
    icon: '◷',
    defaultDuration: 0.6,
    defaultEasing: 'linear',
    params: { startAngle: 0 },
  },
  {
    type: 'clock-wipe-ccw',
    i18nKey: 'transition.preset.clockWipeCCW',
    icon: '◶',
    defaultDuration: 0.6,
    defaultEasing: 'linear',
    params: { startAngle: 0 },
  },
  // Blinds
  {
    type: 'blinds-horizontal',
    i18nKey: 'transition.preset.blindsHorizontal',
    icon: '☰',
    defaultDuration: 0.5,
    defaultEasing: 'ease-in-out',
    params: { blindsCount: 10 },
  },
  {
    type: 'blinds-vertical',
    i18nKey: 'transition.preset.blindsVertical',
    icon: '☷',
    defaultDuration: 0.5,
    defaultEasing: 'ease-in-out',
    params: { blindsCount: 10 },
  },
  // 3D Effects
  {
    type: 'cube-left',
    i18nKey: 'transition.preset.cubeLeft',
    icon: '⬅',
    defaultDuration: 0.6,
    defaultEasing: 'ease-in-out',
    params: { perspective: 1000 },
  },
  {
    type: 'cube-right',
    i18nKey: 'transition.preset.cubeRight',
    icon: '➡',
    defaultDuration: 0.6,
    defaultEasing: 'ease-in-out',
    params: { perspective: 1000 },
  },
  {
    type: 'flip-horizontal',
    i18nKey: 'transition.preset.flipHorizontal',
    icon: '↔',
    defaultDuration: 0.5,
    defaultEasing: 'ease-in-out',
    params: { perspective: 1000 },
  },
  {
    type: 'flip-vertical',
    i18nKey: 'transition.preset.flipVertical',
    icon: '↕',
    defaultDuration: 0.5,
    defaultEasing: 'ease-in-out',
    params: { perspective: 1000 },
  },
  // Page
  {
    type: 'page-curl-left',
    i18nKey: 'transition.preset.pageCurlLeft',
    icon: '⤺',
    defaultDuration: 0.7,
    defaultEasing: 'ease-in-out',
  },
  {
    type: 'page-curl-right',
    i18nKey: 'transition.preset.pageCurlRight',
    icon: '⤻',
    defaultDuration: 0.7,
    defaultEasing: 'ease-in-out',
  },
  // Special
  {
    type: 'pixelate',
    i18nKey: 'transition.preset.pixelate',
    icon: '▦',
    defaultDuration: 0.5,
    defaultEasing: 'ease-in-out',
    params: { blockSize: 10 },
  },
  {
    type: 'blur',
    i18nKey: 'transition.preset.blur',
    icon: '◌',
    defaultDuration: 0.5,
    defaultEasing: 'ease-in-out',
    params: { blurRadius: 20 },
  },
  {
    type: 'glitch',
    i18nKey: 'transition.preset.glitch',
    icon: '⚡',
    defaultDuration: 0.4,
    defaultEasing: 'linear',
    params: { glitchIntensity: 0.5 },
  },
  {
    type: 'radial-wipe',
    i18nKey: 'transition.preset.radialWipe',
    icon: '◉',
    defaultDuration: 0.5,
    defaultEasing: 'ease-out',
  },
  {
    type: 'morph',
    i18nKey: 'transition.preset.morph',
    icon: '∞',
    defaultDuration: 0.6,
    defaultEasing: 'ease-in-out',
  },
  // Dip
  {
    type: 'dip-to-black',
    i18nKey: 'transition.preset.dipToBlack',
    icon: '■',
    defaultDuration: 0.8,
    defaultEasing: 'ease-in-out',
    params: { color: '#000000' },
  },
  {
    type: 'dip-to-white',
    i18nKey: 'transition.preset.dipToWhite',
    icon: '□',
    defaultDuration: 0.8,
    defaultEasing: 'ease-in-out',
    params: { color: '#ffffff' },
  },
  {
    type: 'dip-to-color',
    i18nKey: 'transition.preset.dipToColor',
    icon: '▣',
    defaultDuration: 0.8,
    defaultEasing: 'ease-in-out',
    params: { color: '#ff0000' },
  },
];

// =============================================================================
// Webview-Specific Extensions: Factory Functions
// =============================================================================

/**
 * Create a default transition
 * 创建默认转场
 */
export function createTransition(
  type: TransitionType = 'fade',
  duration: number = 0.5,
  easing: EasingType = 'ease-in-out'
): Transition {
  return {
    id: `tr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    type,
    duration,
    easing,
  };
}

/**
 * Create an element transition
 * 创建元素间转场
 */
export function createElementTransition(
  fromElementId: string,
  toElementId: string,
  transition: Transition,
  placement: TransitionPlacement = 'overlap'
) {
  return {
    id: `etr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    fromElementId,
    toElementId,
    transition,
    placement,
  };
}

/**
 * Create a transition from preset
 * 从预设创建转场
 */
export function createTransitionFromPreset(preset: TransitionPreset): Transition {
  return {
    id: `tr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    type: preset.type,
    duration: preset.defaultDuration,
    easing: preset.defaultEasing,
    params: preset.params,
  };
}

// =============================================================================
// Webview-Specific Extensions: Utility Functions
// =============================================================================

/**
 * Get transition icon
 * 获取转场图标
 */
export function getTransitionIcon(type: TransitionType): string {
  return TRANSITION_ICONS[type] || '◆';
}

/**
 * Check if a transition type is directional
 * 检查转场类型是否是方向性的
 */
export function isDirectionalTransition(type: TransitionType): boolean {
  return [
    'slide-left', 'slide-right', 'slide-up', 'slide-down',
    'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down',
    'cube-left', 'cube-right', 'cube-up', 'cube-down',
    'page-curl-left', 'page-curl-right',
  ].includes(type);
}

/**
 * Get opposite transition type (for reverse direction)
 * 获取相反的转场类型
 */
export function getOppositeTransition(type: TransitionType): TransitionType {
  const opposites: Partial<Record<TransitionType, TransitionType>> = {
    'slide-left': 'slide-right',
    'slide-right': 'slide-left',
    'slide-up': 'slide-down',
    'slide-down': 'slide-up',
    'wipe-left': 'wipe-right',
    'wipe-right': 'wipe-left',
    'wipe-up': 'wipe-down',
    'wipe-down': 'wipe-up',
    'zoom-in': 'zoom-out',
    'zoom-out': 'zoom-in',
    'iris-in': 'iris-out',
    'iris-out': 'iris-in',
    'clock-wipe': 'clock-wipe-ccw',
    'clock-wipe-ccw': 'clock-wipe',
    'cube-left': 'cube-right',
    'cube-right': 'cube-left',
    'cube-up': 'cube-down',
    'cube-down': 'cube-up',
    'flip-horizontal': 'flip-vertical',
    'flip-vertical': 'flip-horizontal',
    'page-curl-left': 'page-curl-right',
    'page-curl-right': 'page-curl-left',
    'dip-to-black': 'dip-to-white',
    'dip-to-white': 'dip-to-black',
  };
  return opposites[type] || type;
}

/**
 * Check if transition type is a 3D effect
 * 检查转场类型是否是 3D 效果
 */
export function is3DTransition(type: TransitionType): boolean {
  return [
    'cube-left', 'cube-right', 'cube-up', 'cube-down',
    'flip-horizontal', 'flip-vertical',
    'page-curl-left', 'page-curl-right',
  ].includes(type);
}

/**
 * Check if transition type requires a color parameter
 * 检查转场类型是否需要颜色参数
 */
export function requiresColorParam(type: TransitionType): boolean {
  return ['dip-to-color'].includes(type);
}

/**
 * Get transition category
 * 获取转场分类
 */
export type TransitionCategory =
  | 'basic'
  | 'slide'
  | 'zoom'
  | 'wipe'
  | 'iris'
  | 'clock'
  | 'blinds'
  | '3d'
  | 'page'
  | 'special'
  | 'dip'
  | 'custom';

export function getTransitionCategory(type: TransitionType): TransitionCategory {
  if (['none', 'fade', 'dissolve'].includes(type)) return 'basic';
  if (type.startsWith('slide-')) return 'slide';
  if (type.startsWith('zoom-') || type === 'cross-zoom') return 'zoom';
  if (type.startsWith('wipe-')) return 'wipe';
  if (type.startsWith('iris-')) return 'iris';
  if (type.startsWith('clock-')) return 'clock';
  if (type.startsWith('blinds-')) return 'blinds';
  if (type.startsWith('cube-') || type.startsWith('flip-')) return '3d';
  if (type.startsWith('page-')) return 'page';
  if (['pixelate', 'blur', 'glitch', 'radial-wipe', 'morph'].includes(type)) return 'special';
  if (type.startsWith('dip-')) return 'dip';
  return 'custom';
}
