import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import { I18nProvider } from '@/i18n/I18nContext';
import { ToastProvider } from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { i18nService } from '@/i18n';
import '@/index.css';
import { getLogger } from '@/utils/logger';

const logger = getLogger('NekoSuite');

try {
  const rootElement = document.getElementById('root');

  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ErrorBoundary>
          <I18nProvider service={i18nService}>
            <ToastProvider>
              <App />
            </ToastProvider>
          </I18nProvider>
        </ErrorBoundary>
      </React.StrictMode>,
    );
  } else {
    logger.error('Root element not found!');
  }
} catch (error) {
  logger.error('Error rendering app:', error);
}
