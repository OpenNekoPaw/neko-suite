import { normalizeLocale, type SupportedLocale } from '@neko/shared';
import { createWebviewI18n } from '@neko/shared/i18n/webview';
import { enHomeMessages } from './locales/en';
import { zhCnHomeMessages } from './locales/zh-cn';

const HOME_I18N_BUNDLES = {
  en: { home: enHomeMessages },
  'zh-cn': { home: zhCnHomeMessages },
} as const;

export function detectHomeLocale(): SupportedLocale {
  if (typeof document !== 'undefined') {
    const documentLocale =
      document.documentElement.lang || document.documentElement.getAttribute('data-locale');
    if (documentLocale) return normalizeLocale(documentLocale);
  }
  if (typeof navigator !== 'undefined') {
    const navigatorLocale = navigator.languages?.[0] ?? navigator.language;
    if (navigatorLocale) return normalizeLocale(navigatorLocale);
  }
  return 'en';
}

export function createHomeI18n(initialLocale?: SupportedLocale) {
  return createWebviewI18n({
    bundles: HOME_I18N_BUNDLES,
    detectLocale: detectHomeLocale,
    ...(initialLocale ? { initialLocale } : {}),
  });
}

export const { i18nService } = createHomeI18n();
