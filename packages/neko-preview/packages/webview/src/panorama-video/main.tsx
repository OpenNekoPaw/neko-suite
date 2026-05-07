import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useExtensionMessage, useVscodeReady } from '../shared/useVscodeMessage';
import type { PanoramaInitMessage, PreviewStreamReadyMessage } from '../shared/types';
import '../styles/panorama.css';

function PanoramaVideoApp(): JSX.Element {
  const [init, setInit] = React.useState<PanoramaInitMessage['payload'] | null>(null);
  const [stream, setStream] = React.useState<PreviewStreamReadyMessage['payload'] | null>(null);
  useVscodeReady();
  useExtensionMessage((message) => {
    if (message.type === 'panorama:init') {
      setInit((message as PanoramaInitMessage).payload);
    }
    if (message.type === 'preview:streamReady') {
      setStream((message as PreviewStreamReadyMessage).payload);
    }
  });

  return (
    <main className="panorama-loading">
      {init
        ? `${init.manifest.sourceName} · ${stream?.streamId ?? 'stream pending'}`
        : 'Loading panorama…'}
    </main>
  );
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PanoramaVideoApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
