import { useEffect, type ReactElement } from 'react';
import { App } from './App';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService, setLocale } from './i18n';
import type { SupportedLocale } from '@neko/shared';
import '@neko/ui/keyboard/focus.css';
import './index.css';

export interface SketchWebviewRootProps {
  readonly locale?: SupportedLocale;
}

export function SketchWebviewRoot({ locale }: SketchWebviewRootProps): ReactElement {
  useEffect(() => {
    if (locale) {
      setLocale(locale);
    }
  }, [locale]);

  return (
    <I18nProvider service={i18nService}>
      <App />
    </I18nProvider>
  );
}
