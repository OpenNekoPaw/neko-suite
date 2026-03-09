/**
 * PropertyPanel Webview Entry Point
 * Standalone entry for the PropertyPanel in the secondary sidebar
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { PropertyPanelStandalone } from '@/components/PropertyPanel/PropertyPanelStandalone';
import { I18nProvider } from '@/i18n/I18nContext';
import { i18nService } from '@/i18n';
import '@/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider service={i18nService}>
      <PropertyPanelStandalone />
    </I18nProvider>
  </React.StrictMode>,
);
