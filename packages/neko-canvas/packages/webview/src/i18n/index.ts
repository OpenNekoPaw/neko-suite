/**
 * i18n setup for neko-canvas webview
 *
 * Uses shared I18nService from @neko/shared.
 * Canvas has a single namespace with all keys in one flat bundle.
 */
import { I18nService } from '@neko/shared';
import { detectWebviewLocale } from '@neko/shared/i18n/webview';
import type { SupportedLocale } from '@neko/shared';

import { en } from './locales/en';
import { zhCN } from './locales/zh-cn';

// Create service instance with detected locale
export const i18nService = new I18nService(detectWebviewLocale());

// Register bundles
i18nService.registerBundle('canvas', 'en', en);
i18nService.registerBundle('canvas', 'zh-cn', zhCN);

/**
 * Translate a message key with optional named parameters
 */
export function t(key: string, params?: Record<string, string | number>): string {
  return i18nService.t(key, params);
}

/**
 * Change locale at runtime
 */
export function setLocale(locale: SupportedLocale): void {
  i18nService.setLocale(locale);
}
