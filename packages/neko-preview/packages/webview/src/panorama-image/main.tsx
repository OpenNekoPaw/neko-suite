import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useExtensionMessage, useVscodeReady, postMessage } from '../shared/useVscodeMessage';
import type { PanoramaInitMessage } from '../shared/types';
import { PanoramicViewer } from './PanoramicViewer';
import '../styles/panorama.css';

function PanoramaApp(): JSX.Element {
  const [init, setInit] = React.useState<PanoramaInitMessage['payload'] | null>(null);
  useVscodeReady();
  useExtensionMessage((message) => {
    if (message.type === 'panorama:init') {
      setInit((message as PanoramaInitMessage).payload);
    }
  });

  if (!init) {
    return <main className="panorama-loading">Loading panorama…</main>;
  }

  return <PanoramicViewer manifest={init.manifest} engineBaseUrl={init.engineBaseUrl} />;
}

export { postMessage };

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PanoramaApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
