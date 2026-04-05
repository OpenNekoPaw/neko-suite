/**
 * i18n setup for neko-live webview.
 * Uses shared I18nService from @neko/shared.
 */
import { I18nService } from '@neko/shared';
import { detectWebviewLocale } from '@neko/shared/i18n/webview';

import { en } from './locales/en';
import { zhCN } from './locales/zh-cn';

const i18nService = new I18nService(detectWebviewLocale());

i18nService.registerBundle('live', 'en', en);
i18nService.registerBundle('live', 'zh-cn', zhCN);

/** Translate a message key with optional named parameters */
export function t(key: string, params?: Record<string, string | number>): string {
  return i18nService.t(key, params);
}
