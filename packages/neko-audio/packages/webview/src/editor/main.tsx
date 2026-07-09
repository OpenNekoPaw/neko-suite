/**
 * Audio Editor entry point
 *
 * Mounts the AudioEditor component into the webview DOM.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioWebviewRoot } from '../root';

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <AudioWebviewRoot />
    </StrictMode>,
  );
}
