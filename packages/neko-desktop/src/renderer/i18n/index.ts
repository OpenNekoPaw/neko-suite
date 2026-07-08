import { normalizeLocale, type SupportedLocale } from '@neko/shared';
import { createWebviewI18n } from '@neko/shared/i18n/webview';
import { enDesktopMessages } from './locales/en';
import { zhCnDesktopMessages } from './locales/zh-cn';

const DESKTOP_I18N_BUNDLES = {
  en: {
    desktop: enDesktopMessages,
  },
  'zh-cn': {
    desktop: zhCnDesktopMessages,
  },
} as const;

export function detectDesktopLocale(): SupportedLocale {
  if (typeof document !== 'undefined') {
    const documentLocale =
      document.documentElement.lang ||
      document.documentElement.getAttribute('data-locale') ||
      document.documentElement.getAttribute('data-vscode-locale');
    if (documentLocale) {
      return normalizeLocale(documentLocale);
    }
  }

  if (typeof navigator !== 'undefined') {
    const navigatorLocale = navigator.languages?.[0] ?? navigator.language;
    if (navigatorLocale) {
      return normalizeLocale(navigatorLocale);
    }
  }

  return 'en';
}

export function createDesktopI18n(initialLocale?: SupportedLocale) {
  return createWebviewI18n({
    bundles: DESKTOP_I18N_BUNDLES,
    detectLocale: detectDesktopLocale,
    ...(initialLocale ? { initialLocale } : {}),
  });
}

const desktopI18n = createDesktopI18n();

export const { i18nService } = desktopI18n;
