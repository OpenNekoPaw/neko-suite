import { useState, useCallback } from 'react';
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging';
import { ScriptRenderer } from './components/ScriptRenderer';
import type { FountainDocument, MessageToWebview } from './types';
import './styles/screenplay.css';
import './styles/print.css';

export function App() {
  const [document, setDocument] = useState<FountainDocument | null>(null);

  const handleMessage = useCallback((message: MessageToWebview) => {
    switch (message.type) {
      case 'update':
        setDocument(message.document);
        break;
      case 'scrollTo':
        // Find element at line and scroll to it
        scrollToLine(message.line);
        break;
    }
  }, []);

  useVSCodeMessaging(handleMessage);

  return <ScriptRenderer document={document} />;
}

function scrollToLine(line: number) {
  // Find element with matching line number via data attribute
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
