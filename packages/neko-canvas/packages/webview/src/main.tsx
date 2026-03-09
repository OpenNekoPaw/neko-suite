import React from 'react';
import ReactDOM from 'react-dom/client';
import { CanvasApp } from './CanvasApp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService } from './i18n';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider service={i18nService}>
      <ErrorBoundary>
        <CanvasApp />
      </ErrorBoundary>
    </I18nProvider>
  </React.StrictMode>,
);
