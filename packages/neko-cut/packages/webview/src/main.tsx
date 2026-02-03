import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import { I18nProvider } from '@/i18n/I18nContext';
import { ToastProvider } from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { detectLocale } from '@/i18n';
import '@/index.css';

// Export GPU test utilities to window for console debugging
import {
  testWebGPUSupport,
  isWebGPUSupported,
  isWebGL2Supported,
  isVSCodeWebview,
} from '@/rendering/gpu/CompositorFactory';

// Export file range read utilities for testing on-demand loading
import { readFileRange } from '@/hooks/useVSCodeMessaging';

// Expose to window for console testing
declare global {
  interface Window {
    __GPU_TEST__: {
      testWebGPU: typeof testWebGPUSupport;
      isWebGPUSupported: typeof isWebGPUSupported;
      isWebGL2Supported: typeof isWebGL2Supported;
      isVSCodeWebview: typeof isVSCodeWebview;
    };
    // File range read test utilities
    readFileRange: typeof readFileRange;
    testFileRangeRead: (path: string, start: number, end: number) => Promise<void>;
  }
}

window.__GPU_TEST__ = {
  testWebGPU: testWebGPUSupport,
  isWebGPUSupported,
  isWebGL2Supported,
  isVSCodeWebview,
};

// Expose file range read utilities
window.readFileRange = readFileRange;
window.testFileRangeRead = async (path: string, start: number, end: number): Promise<void> => {
  console.log(`[TEST] Reading file range: path=${path}, range=${start}-${end}`);
  const startTime = performance.now();

  try {
    const data = await readFileRange(path, start, end);
    const elapsed = performance.now() - startTime;
    console.log(`[TEST] Success! Received ${data.byteLength} bytes in ${elapsed.toFixed(2)}ms`);

    // Show first 32 bytes as hex
    const view = new Uint8Array(data);
    const hex = Array.from(view.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`[TEST] First 32 bytes: ${hex}`);
  } catch (error) {
    console.error('[TEST] Failed:', error);
  }
};

try {
  const rootElement = document.getElementById('root');

  if (rootElement) {
    // Detect locale from VSCode environment
    const initialLocale = detectLocale();

    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ErrorBoundary>
          <I18nProvider initialLocale={initialLocale}>
            <ToastProvider>
              <App />
            </ToastProvider>
          </I18nProvider>
        </ErrorBoundary>
      </React.StrictMode>
    );
  } else {
    console.error('[UniEdit] Root element not found!');
  }
} catch (error) {
  console.error('[UniEdit] Error rendering app:', error);
}
