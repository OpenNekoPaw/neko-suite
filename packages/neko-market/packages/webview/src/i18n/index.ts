/**
 * i18n setup for neko-market webview
 *
 * Uses shared I18nService from @neko/shared.
 * Locale is detected from the VSCode-injected `data-vscode-locale` attribute on <html>.
 */

import { createWebviewI18n } from '@neko/shared/i18n/webview';

import { bundles as enBundles } from './locales/en';
import { bundles as zhCnBundles } from './locales/zh-cn';

const webviewI18n = createWebviewI18n({
  bundles: {
    en: enBundles,
    'zh-cn': zhCnBundles,
  },
});

export const { i18nService } = webviewI18n;
