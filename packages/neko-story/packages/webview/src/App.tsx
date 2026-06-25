import { useState, useCallback } from 'react';
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging';
import { ScriptRenderer } from './components/ScriptRenderer';
import type { FountainDocument, MessageToWebview } from './types';
import './styles/screenplay.css';
import './styles/print.css';

// =============================================================================
// App
// =============================================================================

export function App() {
  const [document, setDocument] = useState<FountainDocument | null>(null);

  const handleMessage = useCallback((message: MessageToWebview) => {
    switch (message.type) {
      case 'update':
        setDocument(message.document);
        break;
      case 'scrollTo':
        scrollToLine(message.line);
        break;
    }
  }, []);

  useVSCodeMessaging(handleMessage);

  return (
    <div
      className="story-view-shell"
      style={{ backgroundColor: 'var(--vscode-editor-background)' }}
    >
      <div className="story-view-content">
        <ScriptRenderer document={document} />
      </div>
    </div>
  );
}

function scrollToLine(line: number) {
  const elements = window.document.querySelectorAll<HTMLElement>('[data-line]');
  let closestElement: HTMLElement | null = null;
  let closestDiff = Infinity;

  elements.forEach((el) => {
    const elLine = parseInt(el.getAttribute('data-line') ?? '0', 10);
    const diff = Math.abs(elLine - line);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestElement = el;
    }
  });

  if (closestElement !== null) {
    (closestElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
