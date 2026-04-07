/**
 * i18n setup for neko-cut webview
 *
 * Uses shared I18nService from @neko/shared with Model B namespacing.
 * Each top-level translation category is registered as a separate namespace.
 * Components continue using t('dotted.key') unchanged.
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
