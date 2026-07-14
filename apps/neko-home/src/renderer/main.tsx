import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nProvider } from '@neko/shared/i18n/react';
import { App } from './App';
import { initializeHomeTheme } from './home-theme';
import { i18nService } from './i18n';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Neko Home renderer root is missing.');
initializeHomeTheme();
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <I18nProvider service={i18nService}>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
