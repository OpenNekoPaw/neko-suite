import React from 'react';
import ReactDOM from 'react-dom/client';
import { AIAssistant } from '@/components';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { I18nProvider } from '@/i18n/I18nContext';
import { detectLocale } from '@/i18n';
import '@/index.css';

// Detect locale from VSCode's data attribute
const initialLocale = detectLocale();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider initialLocale={initialLocale}>
        <AIAssistant />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
