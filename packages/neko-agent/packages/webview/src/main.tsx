import React from 'react';
import ReactDOM from 'react-dom/client';
import { AIAssistant } from '@/components';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { I18nProvider } from '@/i18n/I18nContext';
import { i18nService } from '@/i18n';
import { registerDefaultRenderers } from '@/components/ChatView/RichContent';
import '@/index.css';

// Register built-in rich content renderers (ADR-6 §6.2)
registerDefaultRenderers();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider service={i18nService}>
        <AIAssistant />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
