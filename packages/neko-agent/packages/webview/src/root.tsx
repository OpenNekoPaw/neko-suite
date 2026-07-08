import { useEffect, type ReactElement } from 'react';
import { AppShell } from '@/components/AppShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { I18nProvider } from '@/i18n/I18nContext';
import { i18nService, setLocale } from '@/i18n';
import { registerDefaultRenderers } from '@/components/ChatView/RichContent';
import type { SupportedLocale } from '@neko/shared';
import '@/index.css';

registerDefaultRenderers();

export interface AgentWebviewRootProps {
  readonly locale?: SupportedLocale;
}

export function AgentWebviewRoot({ locale }: AgentWebviewRootProps): ReactElement {
  useEffect(() => {
    if (locale) {
      setLocale(locale);
    }
  }, [locale]);

  return (
    <ErrorBoundary>
      <I18nProvider service={i18nService}>
        <AppShell />
      </I18nProvider>
    </ErrorBoundary>
  );
}
