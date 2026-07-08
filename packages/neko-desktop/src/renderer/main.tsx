import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '@neko/shared/i18n/react';
import { App } from './App';
import { applyDesktopTheme } from './desktop-theme';
import { i18nService } from './i18n';
import '@neko/ui/workbench/editor-workbench.css';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Neko Desktop root element is missing.');
}

applyDesktopTheme({ kind: 'light' });

createRoot(rootElement).render(
  <React.StrictMode>
    <I18nProvider service={i18nService}>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
