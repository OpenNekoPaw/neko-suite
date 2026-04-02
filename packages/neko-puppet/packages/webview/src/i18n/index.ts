/**
 * i18n setup for puppet-webview
 *
 * Uses shared I18nService from @neko/shared.
 * Puppet editor has its own namespace with puppet-specific keys.
 */
import { I18nService } from '@neko/shared';
import { detectWebviewLocale } from '@neko/shared/i18n/webview';
import type { SupportedLocale } from '@neko/shared';

import { en } from './locales/en';
import { zhCN } from './locales/zh-cn';

// Create service instance with detected locale
export const i18nService = new I18nService(detectWebviewLocale());

// Register bundles
i18nService.registerBundle('puppet', 'en', en);
i18nService.registerBundle('puppet', 'zh-cn', zhCN);

/** Translate a message key with optional named parameters */
export function t(key: string, params?: Record<string, string | number>): string {
  return i18nService.t(key, params);
}

/** Change locale at runtime */
export function setLocale(locale: SupportedLocale): void {
  i18nService.setLocale(locale);
}
