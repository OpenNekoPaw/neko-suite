import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService } from './i18n';
import '@neko/ui/keyboard/focus.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider service={i18nService}>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
