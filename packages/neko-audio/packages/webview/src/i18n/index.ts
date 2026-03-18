/**
 * i18n setup for neko-audio webview
 *
 * Uses shared I18nService from @neko/shared with Model B namespacing.
 * Registers 'audio' namespace for audio editor strings.
 */
import { I18nService } from '@neko/shared';
import { detectWebviewLocale } from '@neko/shared/i18n/webview';
import type { SupportedLocale, MessageBundle } from '@neko/shared';

import { bundles as enBundles } from './locales/en';
import { bundles as zhCnBundles } from './locales/zh-cn';

// Create service instance with detected locale
export const i18nService = new I18nService(detectWebviewLocale());

// Register all bundles by namespace
function registerAll(allBundles: Record<string, MessageBundle>, locale: SupportedLocale): void {
  Object.entries(allBundles).forEach(([ns, bundle]) => {
    i18nService.registerBundle(ns, locale, bundle);
  });
}

registerAll(enBundles, 'en');
registerAll(zhCnBundles, 'zh-cn');

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

/**
 * Get current locale
 */
export function getLocale(): SupportedLocale {
  return i18nService.locale;
}
