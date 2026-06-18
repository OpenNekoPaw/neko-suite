/**
 * i18n setup for puppet-webview
 *
 * Uses shared I18nService from @neko/shared.
 * Puppet editor has its own namespace with puppet-specific keys.
 */
import { createWebviewI18n } from '@neko/shared/i18n/webview';
import type { SupportedLocale } from '@neko/shared';

import { en } from './locales/en';
import { zhCN } from './locales/zh-cn';

const webviewI18n = createWebviewI18n({
  bundles: {
    en: { puppet: en },
    'zh-cn': { puppet: zhCN },
  },
});

export const { i18nService } = webviewI18n;

/** Change locale at runtime */
export function setLocale(locale: SupportedLocale): void {
  webviewI18n.setLocale(locale);
}
