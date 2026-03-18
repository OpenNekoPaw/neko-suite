/**
 * Audio Editor entry point
 *
 * Mounts the AudioEditor component into the webview DOM.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioEditor } from './AudioEditor';

// Initialize i18n (side-effect: registers bundles)
import '../i18n';

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <AudioEditor />
    </StrictMode>,
  );
}
