import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService } from './i18n';
import './styles.css';

const root = document.getElementById('root');

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <I18nProvider service={i18nService}>
        <App />
      </I18nProvider>
    </React.StrictMode>,
  );
}
