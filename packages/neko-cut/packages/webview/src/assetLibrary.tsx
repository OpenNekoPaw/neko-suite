/**
 * AssetLibrary Webview Entry Point
 * Standalone entry for the Asset Library panel in the activity bar
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { AssetLibraryStandalone } from '@/components/AssetLibrary/AssetLibraryStandalone';
import { I18nProvider } from '@/i18n/I18nContext';
import { detectLocale } from '@/i18n';
import '@/index.css';

// Detect locale from VSCode's data attribute
const initialLocale = detectLocale();

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<I18nProvider initialLocale={initialLocale}>
			<AssetLibraryStandalone />
		</I18nProvider>
	</React.StrictMode>
);
