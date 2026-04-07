/**
 * i18n setup for neko-market webview
 *
 * Uses shared I18nService from @neko/shared.
 * Locale is detected from the VSCode-injected `data-vscode-locale` attribute on <html>.
 */

import { I18nService } from '@neko/shared';
import { detectWebviewLocale } from '@neko/shared/i18n/webview';
import type { SupportedLocale, MessageBundle } from '@neko/shared';

import { bundles as enBundles } from './locales/en';
import { bundles as zhCnBundles } from './locales/zh-cn';

export const i18nService = new I18nService(detectWebviewLocale());

function registerAll(allBundles: Record<string, MessageBundle>, locale: SupportedLocale): void {
  Object.entries(allBundles).forEach(([ns, bundle]) => {
    i18nService.registerBundle(ns, locale, bundle);
  });
}

registerAll(enBundles, 'en');
registerAll(zhCnBundles, 'zh-cn');
