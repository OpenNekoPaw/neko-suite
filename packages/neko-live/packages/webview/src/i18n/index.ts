/**
 * i18n setup for neko-live webview.
 * Uses shared I18nService from @neko/shared.
 */
import { createWebviewI18n } from '@neko/shared/i18n/webview';

import { en } from './locales/en';
import { zhCN } from './locales/zh-cn';

const webviewI18n = createWebviewI18n({
  bundles: {
    en: { live: en },
    'zh-cn': { live: zhCN },
  },
});

/** Translate a message key with optional named parameters */
export function t(key: string, params?: Record<string, string | number>): string {
  return webviewI18n.t(key, params);
}
