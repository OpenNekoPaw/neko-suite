import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService } from './i18n';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <I18nProvider service={i18nService}>
          <App />
        </I18nProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
