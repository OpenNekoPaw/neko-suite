import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService } from './i18n';
import { MarketplaceApp } from './components/MarketplaceApp';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider service={i18nService}>
      <MarketplaceApp />
    </I18nProvider>
  </React.StrictMode>,
);
