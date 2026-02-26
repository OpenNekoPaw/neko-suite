/**
 * Internationalization (i18n) module
 * Provides locale detection and translation utilities
 */

import { en, Translations } from './locales/en';
import { zhCN } from './locales/zh-CN';

// Supported locales
export type SupportedLocale = 'en' | 'zh-cn' | 'zh-tw';

// Locale to translations mapping
const locales: Record<string, Translations> = {
  'en': en,
  'en-us': en,
  'en-gb': en,
  'zh-cn': zhCN,
  'zh-hans': zhCN,
  'zh': zhCN,
  'zh-tw': zhCN, // Fallback to simplified for now
  'zh-hant': zhCN,
};

// Default locale
const DEFAULT_LOCALE = 'en';

// Current locale state
let currentLocale: string = DEFAULT_LOCALE;
let currentTranslations: Translations = en;

/**
 * Get translations for a locale
 */
export function getTranslations(locale: string): Translations {
  const normalizedLocale = locale.toLowerCase();
  return locales[normalizedLocale] || en;
}

/**
 * Set the current locale
 */
export function setLocale(locale: string): void {
  currentLocale = locale.toLowerCase();
  currentTranslations = getTranslations(currentLocale);
}

/**
 * Get the current locale
 */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Get current translations
 */
export function getT(): Translations {
  return currentTranslations;
}

/**
 * Translate a key path with optional interpolation
 * @param keyPath - Dot-separated path to translation key (e.g., "common.cancel")
 * @param params - Optional parameters for interpolation (e.g., { name: "John" } for "Hello {name}")
 */
export function t(keyPath: string, params?: Record<string, string | number>): string {
  const keys = keyPath.split('.');
  let value: any = currentTranslations;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      // Fallback to English if key not found
      value = keys.reduce((obj: any, k) => obj?.[k], en);
      if (value === undefined) {
        return keyPath;
      }
      break;
    }
  }

  if (typeof value !== 'string') {
    return keyPath;
  }

  // Handle interpolation
  if (params) {
    return value.replace(/\{(\w+)\}/g, (_, key) => {
      return params[key]?.toString() ?? `{${key}}`;
    });
  }

  return value;
}

/**
 * Detect locale from VSCode environment
 * VSCode passes language via data attribute or message
 */
export function detectLocale(): string {
  // Check for VSCode webview language data attribute
  const root = document.documentElement;
  const vscodeLocale = root.getAttribute('data-vscode-locale');
  if (vscodeLocale) {
    return vscodeLocale.toLowerCase();
  }

  // Fallback to browser language
  const browserLang = navigator.language || (navigator as any).userLanguage;
  if (browserLang) {
    return browserLang.toLowerCase();
  }

  return DEFAULT_LOCALE;
}

/**
 * Initialize i18n with detected or provided locale
 */
export function initI18n(locale?: string): void {
  const detectedLocale = locale || detectLocale();
  setLocale(detectedLocale);
}

export { en, zhCN, type Translations };
