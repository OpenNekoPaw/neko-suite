/**
 * Theme Module
 *
 * Unified theme tokens and types for all Neko Suite packages.
 *
 * Layer 0 (this module): Design tokens + ThemeKind type
 * Tailwind preset: import from '@neko/shared/theme/tailwind-preset'
 */
export type { IThemeInfo, ThemeKind } from './types';
export { vscodeCSSTokens } from './tokens';
