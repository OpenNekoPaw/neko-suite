/**
 * i18n setup for neko-preview webview
 *
 * Uses shared I18nService from @neko/shared with Model B namespacing.
 * Registers 'preview' namespace for video and audio player strings.
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
