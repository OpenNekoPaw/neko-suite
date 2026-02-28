/**
 * i18n Module
 *
 * Unified internationalization for all Neko Suite packages.
 *
 * Layer 0 (this module): II18nService interface + I18nService default
 * Layer 1 (vscode/extension/i18n-bridge): VSCode locale detection for Extension Host
 * Layer 2 (each webview): Thin React Provider wrapping I18nService
 *
 * NOTE: detectWebviewLocale() requires DOM and is NOT exported here.
 * Import it from '@neko/shared/i18n/webview' in webview context only.
 */
export type { II18nService, MessageBundle, SupportedLocale } from './types';
export {
  I18nService,
  interpolate,
  normalizeLocale,
} from './core';
