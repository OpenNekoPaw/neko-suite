import { useEffect, type ReactElement } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService, setLocale } from './i18n';
import { App } from './App';
import type { SupportedLocale } from '@neko/shared';
import '@neko/ui/keyboard/focus.css';
import './index.css';

export interface ModelWebviewRootProps {
  readonly locale?: SupportedLocale;
}

export function ModelWebviewRoot({ locale }: ModelWebviewRootProps): ReactElement {
  useEffect(() => {
    if (locale) {
      setLocale(locale);
    }
  }, [locale]);

  return (
    <ErrorBoundary>
      <I18nProvider service={i18nService}>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  );
}
