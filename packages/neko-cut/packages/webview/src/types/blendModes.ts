/**
 * Blend Modes Types
 * 混合模式类型定义
 *
 * 实现标准图层混合模式，与 Adobe After Effects / Premiere / Photoshop 兼容
 */

// =============================================================================
// Blend Mode Types
// =============================================================================

/**
 * Standard blend mode types
 * 标准混合模式类型
 *
 * 分类:
 * - Normal: 正常混合
 * - Darken: 变暗组
 * - Lighten: 变亮组
 * - Contrast: 对比组
 * - Inversion: 反转组
 * - Component: 分量组
 */
export type BlendMode =
  // Normal (正常)
  | 'normal'
  | 'dissolve'
  // Darken Group (变暗组)
  | 'darken'
  | 'multiply'
  | 'color-burn'
  | 'linear-burn'
  | 'darker-color'
  // Lighten Group (变亮组)
  | 'lighten'
  | 'screen'
  | 'color-dodge'
  | 'linear-dodge' // (add)
  | 'lighter-color'
  // Contrast Group (对比组)
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'vivid-light'
  | 'linear-light'
  | 'pin-light'
  | 'hard-mix'
  // Inversion Group (反转组)
  | 'difference'
  | 'exclusion'
  | 'subtract'
  | 'divide'
  // Component Group (分量组)
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/**
 * Blend mode category
 * 混合模式分类
 */
export type BlendModeCategory =
  | 'normal'
  | 'darken'
  | 'lighten'
  | 'contrast'
  | 'inversion'
  | 'component';

/**
 * Blend mode definition with metadata
 * 带元数据的混合模式定义
 */
export interface BlendModeDefinition {
  /** Blend mode identifier */
  mode: BlendMode;
  /** Display name (i18n key) */
  nameKey: string;
  /** Category */
  category: BlendModeCategory;
  /** CSS mix-blend-mode value (if supported) */
  cssValue?: string;
  /** Whether it's not supported by Canvas 2D (requires custom shader) */
  notSupported?: boolean;
}

// =============================================================================
// Blend Mode Definitions
// =============================================================================

/**
 * All available blend modes with metadata
 * 所有可用的混合模式及元数据
 */
export const BLEND_MODE_DEFINITIONS: BlendModeDefinition[] = [
  // Normal
  { mode: 'normal', nameKey: 'blendMode.normal', category: 'normal', cssValue: 'normal' },
  { mode: 'dissolve', nameKey: 'blendMode.dissolve', category: 'normal', notSupported: true },

  // Darken Group
  { mode: 'darken', nameKey: 'blendMode.darken', category: 'darken', cssValue: 'darken' },
  { mode: 'multiply', nameKey: 'blendMode.multiply', category: 'darken', cssValue: 'multiply' },
  { mode: 'color-burn', nameKey: 'blendMode.colorBurn', category: 'darken', cssValue: 'color-burn' },
  { mode: 'linear-burn', nameKey: 'blendMode.linearBurn', category: 'darken', notSupported: true },
  { mode: 'darker-color', nameKey: 'blendMode.darkerColor', category: 'darken', notSupported: true },

  // Lighten Group
  { mode: 'lighten', nameKey: 'blendMode.lighten', category: 'lighten', cssValue: 'lighten' },
  { mode: 'screen', nameKey: 'blendMode.screen', category: 'lighten', cssValue: 'screen' },
  { mode: 'color-dodge', nameKey: 'blendMode.colorDodge', category: 'lighten', cssValue: 'color-dodge' },
  { mode: 'linear-dodge', nameKey: 'blendMode.linearDodge', category: 'lighten', notSupported: true },
  { mode: 'lighter-color', nameKey: 'blendMode.lighterColor', category: 'lighten', notSupported: true },

  // Contrast Group
  { mode: 'overlay', nameKey: 'blendMode.overlay', category: 'contrast', cssValue: 'overlay' },
  { mode: 'soft-light', nameKey: 'blendMode.softLight', category: 'contrast', cssValue: 'soft-light' },
  { mode: 'hard-light', nameKey: 'blendMode.hardLight', category: 'contrast', cssValue: 'hard-light' },
  { mode: 'vivid-light', nameKey: 'blendMode.vividLight', category: 'contrast', notSupported: true },
  { mode: 'linear-light', nameKey: 'blendMode.linearLight', category: 'contrast', notSupported: true },
  { mode: 'pin-light', nameKey: 'blendMode.pinLight', category: 'contrast', notSupported: true },
  { mode: 'hard-mix', nameKey: 'blendMode.hardMix', category: 'contrast', notSupported: true },

  // Inversion Group
  { mode: 'difference', nameKey: 'blendMode.difference', category: 'inversion', cssValue: 'difference' },
  { mode: 'exclusion', nameKey: 'blendMode.exclusion', category: 'inversion', cssValue: 'exclusion' },
  { mode: 'subtract', nameKey: 'blendMode.subtract', category: 'inversion', notSupported: true },
  { mode: 'divide', nameKey: 'blendMode.divide', category: 'inversion', notSupported: true },

  // Component Group
  { mode: 'hue', nameKey: 'blendMode.hue', category: 'component', cssValue: 'hue' },
  { mode: 'saturation', nameKey: 'blendMode.saturation', category: 'component', cssValue: 'saturation' },
  { mode: 'color', nameKey: 'blendMode.color', category: 'component', cssValue: 'color' },
  { mode: 'luminosity', nameKey: 'blendMode.luminosity', category: 'component', cssValue: 'luminosity' },
];

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get blend mode definition by mode
 * 根据模式获取混合模式定义
 */
export function getBlendModeDefinition(mode: BlendMode): BlendModeDefinition | undefined {
  return BLEND_MODE_DEFINITIONS.find(d => d.mode === mode);
}

/**
 * Get blend modes by category
 * 按分类获取混合模式
 */
export function getBlendModesByCategory(category: BlendModeCategory): BlendModeDefinition[] {
  return BLEND_MODE_DEFINITIONS.filter(d => d.category === category);
}

/**
 * Get CSS-supported blend modes
 * 获取 CSS 支持的混合模式
 */
export function getCSSBlendModes(): BlendModeDefinition[] {
  return BLEND_MODE_DEFINITIONS.filter(d => d.cssValue);
}

/**
 * Get unsupported blend modes (require custom shader)
 * 获取不支持的混合模式（需要自定义 shader）
 */
export function getUnsupportedBlendModes(): BlendModeDefinition[] {
  return BLEND_MODE_DEFINITIONS.filter(d => d.notSupported);
}

/**
 * Get CSS value for a blend mode
 * 获取混合模式的 CSS 值
 *
 * @param mode - Blend mode
 * @returns CSS mix-blend-mode value, or 'normal' if not CSS-supported
 */
export function getBlendModeCSSValue(mode: BlendMode): string {
  const definition = getBlendModeDefinition(mode);
  return definition?.cssValue ?? 'normal';
}

/**
 * Check if blend mode is supported by CSS
 * 检查混合模式是否被 CSS 支持
 */
export function isBlendModeCSSSupported(mode: BlendMode): boolean {
  const definition = getBlendModeDefinition(mode);
  return !!definition?.cssValue;
}

/**
 * Blend mode category i18n keys
 * 混合模式分类的国际化键
 */
export const BLEND_MODE_CATEGORY_I18N_KEYS: Record<BlendModeCategory, string> = {
  normal: 'blendMode.category.normal',
  darken: 'blendMode.category.darken',
  lighten: 'blendMode.category.lighten',
  contrast: 'blendMode.category.contrast',
  inversion: 'blendMode.category.inversion',
  component: 'blendMode.category.component',
};
