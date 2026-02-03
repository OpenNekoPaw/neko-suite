/**
 * React i18n Context and hooks
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Translations, getTranslations, setLocale as setGlobalLocale, t as globalT } from './index';

interface I18nContextValue {
  locale: string;
  translations: Translations;
  setLocale: (locale: string) => void;
  t: (keyPath: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: string;
}

/**
 * I18n Provider component
 */
export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  // Normalize locale once for consistent initialization
  const normalizedInitialLocale = (initialLocale || 'en').toLowerCase();

  // Initialize locale synchronously to ensure global state is set before first render
  const [locale, setLocaleState] = useState<string>(() => {
    // Synchronously set global locale during state initialization
    setGlobalLocale(normalizedInitialLocale);
    return normalizedInitialLocale;
  });
  const [translations, setTranslations] = useState<Translations>(() =>
    getTranslations(normalizedInitialLocale)
  );

  // Listen for locale changes from VSCode
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'setLocale' && message.locale) {
        const newLocale = message.locale.toLowerCase();
        setLocaleState(newLocale);
        setTranslations(getTranslations(newLocale));
        setGlobalLocale(newLocale);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Update global locale when state changes
  useEffect(() => {
    setGlobalLocale(locale);
  }, [locale]);

  const setLocale = (newLocale: string) => {
    const normalizedLocale = newLocale.toLowerCase();
    setLocaleState(normalizedLocale);
    setTranslations(getTranslations(normalizedLocale));
    setGlobalLocale(normalizedLocale);
  };

  const t = (keyPath: string, params?: Record<string, string | number>): string => {
    return globalT(keyPath, params);
  };

  return (
    <I18nContext.Provider value={{ locale, translations, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

/**
 * Hook to use i18n context
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

/**
 * Hook to get translation function
 */
export function useTranslation() {
  const { t, locale } = useI18n();
  return { t, locale };
}
