/**
 * PDF Viewer — renders PDF using pdfjs-dist with TextLayer for text selection.
 */

import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { useExtensionMessage, postMessage } from '../shared/useVscodeMessage';
import { useDocumentSelection } from '../shared/useDocumentSelection';
import { DocumentSelectionFab } from '../shared/DocumentSelectionFab';
import { useTranslation } from '../i18n/I18nContext';
import { getLogger } from '../utils/logger';

const logger = getLogger('PdfViewer');

// Configure pdfjs worker — loaded from the same assets directory
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export const PdfViewer: FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.5);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderingRef = useRef(false);

  const { selection, sendToAi } = useDocumentSelection({ pageNumber: currentPage });

  // Listen for messages from extension
  useExtensionMessage((msg) => {
    if (msg.type === 'document:data') {
      if ('url' in msg.payload && msg.payload.url) {
        void loadPdfFromUrl(msg.payload.url as string);
      } else if (msg.payload.data) {
        void loadPdf(msg.payload.data as string);
      }
    }
  });

  // Send ready on mount
  useEffect(() => {
    postMessage({ type: 'ready' } as never);
  }, []);

  /** Load PDF from a localhost URL — pdfjs uses Range requests for per-page lazy loading. */
  const loadPdfFromUrl = useCallback(async (url: string) => {
    try {
      setLoading(true);
      setError(null);
      const pdf = await pdfjsLib.getDocument({ url }).promise;
      pdfDocRef.current = pdf;
      setNumPages(pdf.numPages);
      setCurrentPage(1);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  /** Load PDF from base64 data (legacy fallback). */
  const loadPdf = useCallback(async (base64Data: string) => {
    try {
      setLoading(true);
      setError(null);
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      pdfDocRef.current = pdf;
      setNumPages(pdf.numPages);
      setCurrentPage(1);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  // Render current page
  useEffect(() => {
    if (!pdfDocRef.current || renderingRef.current) return;
    renderPage(currentPage, scale);
  }, [currentPage, scale]);

  const renderPage = useCallback(async (pageNum: number, pageScale: number) => {
    const pdf = pdfDocRef.current;
    const container = containerRef.current;
    if (!pdf || !container) return;
    if (renderingRef.current) return;
    renderingRef.current = true;

    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: pageScale });

      // Clear container
      container.innerHTML = '';

      // Create page wrapper
      const pageDiv = document.createElement('div');
      pageDiv.style.position = 'relative';
      pageDiv.style.width = `${viewport.width}px`;
      pageDiv.style.height = `${viewport.height}px`;
      pageDiv.style.margin = '0 auto';

      // Canvas layer
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      pageDiv.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise;
      }

      // Text layer for selection
      const textDiv = document.createElement('div');
      textDiv.style.position = 'absolute';
      textDiv.style.top = '0';
      textDiv.style.left = '0';
      textDiv.style.width = `${viewport.width}px`;
      textDiv.style.height = `${viewport.height}px`;
      textDiv.classList.add('textLayer');
      pageDiv.appendChild(textDiv);

      const textContent = await page.getTextContent();
      const textLayer = new TextLayer({
        textContentSource: textContent,
        container: textDiv,
        viewport,
      });
      await textLayer.render();

      container.appendChild(pageDiv);
    } catch (err) {
      logger.error('Failed to render page:', err);
    } finally {
      renderingRef.current = false;
    }
  }, []);

  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= numPages) setCurrentPage(page);
    },
    [numPages],
  );

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 5)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.5)), []);

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

  if (loading) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ color: 'var(--vscode-foreground)' }}
      >
        {t('preview.pdf.loading')}
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
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="px-2 py-0.5 disabled:opacity-30"
        >
          &lt;
        </button>
        <span>
          {t('preview.document.pageOf', { current: String(currentPage), total: String(numPages) })}
        </span>
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= numPages}
          className="px-2 py-0.5 disabled:opacity-30"
        >
          &gt;
        </button>
        <span className="mx-2">|</span>
        <button onClick={zoomOut} className="px-2 py-0.5" title={t('preview.document.zoomOut')}>
          -
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} className="px-2 py-0.5" title={t('preview.document.zoomIn')}>
          +
        </button>
      </div>

      {/* PDF content */}
      <div
        className="flex-1 overflow-auto p-4"
        style={{ background: 'var(--vscode-editor-background)' }}
      >
        <div ref={containerRef} />
      </div>

      {/* Selection FAB */}
      <DocumentSelectionFab
        selection={selection}
        onSendToAi={sendToAi}
        label={t('preview.document.sendToAi')}
      />
    </div>
  );
};
