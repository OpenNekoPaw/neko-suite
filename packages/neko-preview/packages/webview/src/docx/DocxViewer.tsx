/**
 * DOCX Viewer — renders DOCX using docx-preview library.
 * Native text selection works on the rendered DOM.
 */

import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import { renderAsync } from 'docx-preview';
import { useExtensionMessage, postMessage } from '../shared/useVscodeMessage';
import { useDocumentSelection } from '../shared/useDocumentSelection';
import { DocumentSelectionFab } from '../shared/DocumentSelectionFab';
import { useTranslation } from '../i18n/I18nContext';
import type { DocumentDataMessage } from '../shared/document-types';

export const DocxViewer: FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const styleContainerRef = useRef<HTMLDivElement>(null);

  const { selection, sendToAi } = useDocumentSelection({});

  useExtensionMessage((msg) => {
    if (msg.type === 'document:data') {
      const docMsg = msg as unknown as DocumentDataMessage;
      loadDocx(docMsg.payload.data);
    }
  });

  useEffect(() => {
    postMessage({ type: 'ready' } as never);
  }, []);

  const loadDocx = useCallback(async (base64Data: string) => {
    try {
      setLoading(true);
      setError(null);

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      if (containerRef.current && styleContainerRef.current) {
        await renderAsync(bytes.buffer, containerRef.current, styleContainerRef.current, {
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
        });
      }

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.1, 3)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.1, 0.5)), []);

  if (error) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ color: 'var(--vscode-errorForeground)' }}
      >
        {t('preview.document.error', { error })}
      </div>
    );
  }

  return (
    <div
      className="flex h-screen flex-col"
      style={{ background: 'var(--vscode-editor-background)' }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 border-b px-3 py-1.5 text-xs"
        style={{
          borderColor: 'var(--vscode-panel-border)',
          color: 'var(--vscode-foreground)',
          background: 'var(--vscode-sideBar-background)',
        }}
      >
        <button onClick={zoomOut} className="px-2 py-0.5" title={t('preview.document.zoomOut')}>
          -
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} className="px-2 py-0.5" title={t('preview.document.zoomIn')}>
          +
        </button>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div
          className="flex flex-1 items-center justify-center"
          style={{ color: 'var(--vscode-foreground)' }}
        >
          {t('preview.docx.loading')}
        </div>
      )}

      {/* Style container (docx-preview injects styles here) */}
      <div ref={styleContainerRef} style={{ display: 'none' }} />

      {/* DOCX content */}
      <div
        className="flex-1 overflow-auto"
        style={{
          display: loading ? 'none' : 'block',
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
        }}
      >
        <div ref={containerRef} className="mx-auto" />
      </div>

      <DocumentSelectionFab
        selection={selection}
        onSendToAi={sendToAi}
        label={t('preview.document.sendToAi')}
      />
    </div>
  );
};
