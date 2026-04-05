/**
 * DOCX Viewer — renders DOCX using docx-preview library.
 * Fetches file directly from neko-engine via HTTP URL.
 * Native text selection works on the rendered DOM.
 */

import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import { renderAsync } from 'docx-preview';
import { useExtensionMessage, postMessage } from '../shared/useVscodeMessage';
import { useDocumentSelection } from '../shared/useDocumentSelection';
import { DocumentSelectionFab } from '../shared/DocumentSelectionFab';
import { DocumentContextMenu, useDocumentContextActions } from '../shared/DocumentContextMenu';
import { useTranslation } from '../i18n/I18nContext';

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
      if ('url' in msg.payload && msg.payload.url) {
        void loadDocxFromUrl(msg.payload.url as string);
      } else if (msg.payload.data) {
        void loadDocx(msg.payload.data as string);
      }
    }
  });

  useEffect(() => {
    postMessage({ type: 'ready' } as never);
  }, []);

  /** Load DOCX from a localhost URL — fetch full file, then render. */
  const loadDocxFromUrl = useCallback(async (url: string) => {
    try {
      setLoading(true);
      setError(null);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to fetch: ${resp.status}`);
      const buffer = await resp.arrayBuffer();
      await renderDocx(buffer);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  /** Render a complete DOCX ArrayBuffer via docx-preview. */
  const renderDocx = useCallback(async (buffer: ArrayBuffer) => {
    try {
      if (containerRef.current && styleContainerRef.current) {
        await renderAsync(buffer, containerRef.current, styleContainerRef.current, {
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
        });
      }
      setLoading(false);
      postMessage({ type: 'document:statusUpdate', payload: {} } as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  /** Legacy: load DOCX from base64 data. */
  const loadDocx = useCallback(async (base64Data: string) => {
    try {
      setLoading(true);
      setError(null);

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      await renderDocx(bytes.buffer as ArrayBuffer);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.1, 3)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.1, 0.5)), []);

  const contextActions = useDocumentContextActions({
    hasSelection: !!selection,
    onSendSelectionToAi: selection ? sendToAi : undefined,
  });

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
    <DocumentContextMenu actions={contextActions}>
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
    </DocumentContextMenu>
  );
};
