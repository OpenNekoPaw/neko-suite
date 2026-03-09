import React from 'react';
import ReactDOM from 'react-dom/client';
import MediaDiffApp from './components/MediaDiff/MediaDiffApp';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService } from './i18n';
import './styles/index.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <I18nProvider service={i18nService}>
        <MediaDiffApp />
      </I18nProvider>
    </React.StrictMode>,
  );
}
