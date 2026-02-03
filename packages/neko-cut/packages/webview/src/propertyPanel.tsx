/**
 * PropertyPanel Webview Entry Point
 * Standalone entry for the PropertyPanel in the secondary sidebar
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { PropertyPanelStandalone } from '@/components/PropertyPanel/PropertyPanelStandalone';
import { I18nProvider } from '@/i18n/I18nContext';
import { detectLocale } from '@/i18n';
import '@/index.css';

// Detect locale from VSCode's data attribute
const initialLocale = detectLocale();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider initialLocale={initialLocale}>
      <PropertyPanelStandalone />
    </I18nProvider>
  </React.StrictMode>
);
