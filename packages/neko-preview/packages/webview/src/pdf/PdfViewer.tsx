/**
 * PDF Viewer — renders PDF using pdfjs-dist with TextLayer for text selection.
 * Supports waterfall (continuous scroll) and single-page modes.
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

/** Viewport dimensions for a single page at a given scale */
interface PageViewport {
  width: number;
  height: number;
}

/** Pages to keep rendered on each side of the visible area */
const BUFFER_PAGES = 2;

export const PdfViewer: FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.5);
  const [scrollMode, setScrollMode] = useState(true);

  // Page viewport dimensions (indexed from 0)
  const [pageViewports, setPageViewports] = useState<PageViewport[]>([]);

  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  // Single-page mode container
  const singlePageContainerRef = useRef<HTMLDivElement>(null);
  // Waterfall mode scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Waterfall mode page element refs
  const pageRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());
  // Track which pages are currently being rendered
  const renderingPagesRef = useRef<Set<number>>(new Set());
  // Track which pages have been rendered (to avoid re-render)
  const renderedPagesRef = useRef<Set<number>>(new Set());
  // IntersectionObserver ref
  const observerRef = useRef<IntersectionObserver | null>(null);
  // Single-page mode rendering guard
  const singleRenderingRef = useRef(false);

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
  const loadPdfFromUrl = useCallback(
    async (url: string) => {
      try {
        setLoading(true);
        setError(null);
        const pdf = await pdfjsLib.getDocument({ url }).promise;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setCurrentPage(1);
        await computeViewports(pdf, scale);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    },
    [scale],
  );

  /** Load PDF from base64 data (legacy fallback). */
  const loadPdf = useCallback(
    async (base64Data: string) => {
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
        await computeViewports(pdf, scale);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    },
    [scale],
  );

  /** Pre-compute viewport dimensions for all pages */
  const computeViewports = useCallback(
    async (pdf: pdfjsLib.PDFDocumentProxy, pageScale: number) => {
      const viewports: PageViewport[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: pageScale });
        viewports.push({ width: vp.width, height: vp.height });
      }
      setPageViewports(viewports);
      // Clear rendered pages cache when viewports change
      renderedPagesRef.current.clear();
    },
    [],
  );

  // Recompute viewports when scale changes
  useEffect(() => {
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    void computeViewports(pdf, scale);
  }, [scale, computeViewports]);

  // =========================================================================
  // Waterfall mode: IntersectionObserver
  // =========================================================================

  useEffect(() => {
    if (!scrollMode || pageViewports.length === 0) return;

    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    // Cleanup previous observer
    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNum = Number((entry.target as HTMLElement).dataset['page']);
          if (!pageNum) continue;

          if (entry.isIntersecting) {
            void renderPageInPlace(pageNum);
          } else {
            clearPageInPlace(pageNum);
          }
        }
        // Update currentPage to the first visible page
        updateCurrentPageFromScroll();
      },
      {
        root: scrollContainer,
        rootMargin: '200% 0px',
      },
    );

    observerRef.current = observer;

    // Observe all page placeholders
    for (const [, el] of pageRefsMap.current) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [scrollMode, pageViewports]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Render a page into its placeholder div (waterfall mode) */
  const renderPageInPlace = useCallback(
    async (pageNum: number) => {
      const pdf = pdfDocRef.current;
      const el = pageRefsMap.current.get(pageNum);
      if (!pdf || !el) return;
      if (renderingPagesRef.current.has(pageNum) || renderedPagesRef.current.has(pageNum)) return;

      renderingPagesRef.current.add(pageNum);
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        // Check if still mounted and not already rendered by another call
        if (renderedPagesRef.current.has(pageNum)) return;

        // Clear placeholder content
        el.innerHTML = '';

        // Create page wrapper
        const pageDiv = document.createElement('div');
        pageDiv.style.position = 'relative';
        pageDiv.style.width = `${viewport.width}px`;
        pageDiv.style.height = `${viewport.height}px`;

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

        el.appendChild(pageDiv);
        renderedPagesRef.current.add(pageNum);
      } catch (err) {
        logger.error(`Failed to render page ${pageNum}:`, err);
      } finally {
        renderingPagesRef.current.delete(pageNum);
      }
    },
    [scale],
  );

  /** Clear a rendered page to save memory (waterfall mode) */
  const clearPageInPlace = useCallback((pageNum: number) => {
    const el = pageRefsMap.current.get(pageNum);
    if (!el) return;
    // Keep the placeholder dimensions, just clear rendered content
    if (renderedPagesRef.current.has(pageNum)) {
      el.innerHTML = '';
      renderedPagesRef.current.delete(pageNum);
    }
  }, []);

  /** Determine which page is currently visible at the top of the scroll area */
  const updateCurrentPageFromScroll = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const midY = containerRect.top + containerRect.height / 3;

    for (const [pageNum, el] of pageRefsMap.current) {
      const rect = el.getBoundingClientRect();
      if (rect.top <= midY && rect.bottom >= midY) {
        setCurrentPage(pageNum);
        return;
      }
    }
  }, []);

  // =========================================================================
  // Single-page mode rendering
  // =========================================================================

  useEffect(() => {
    if (scrollMode) return;
    if (!pdfDocRef.current || singleRenderingRef.current) return;
    void renderSinglePage(currentPage, scale);
  }, [currentPage, scale, scrollMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderSinglePage = useCallback(async (pageNum: number, pageScale: number) => {
    const pdf = pdfDocRef.current;
    const container = singlePageContainerRef.current;
    if (!pdf || !container) return;
    if (singleRenderingRef.current) return;
    singleRenderingRef.current = true;

    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: pageScale });

      container.innerHTML = '';

      const pageDiv = document.createElement('div');
      pageDiv.style.position = 'relative';
      pageDiv.style.width = `${viewport.width}px`;
      pageDiv.style.height = `${viewport.height}px`;
      pageDiv.style.margin = '0 auto';

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      pageDiv.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise;
      }

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
      singleRenderingRef.current = false;
    }
  }, []);

  // =========================================================================
  // Navigation
  // =========================================================================

  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= numPages) {
        setCurrentPage(page);
        if (scrollMode) {
          // Scroll to the target page in waterfall mode
          const el = pageRefsMap.current.get(page);
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    },
    [numPages, scrollMode],
  );

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 5)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.5)), []);

  const toggleScrollMode = useCallback(() => {
    setScrollMode((prev) => {
      const next = !prev;
      // Clear rendered cache when switching modes
      renderedPagesRef.current.clear();
      return next;
    });
  }, []);

  // Store page ref callback
  const setPageRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefsMap.current.set(pageNum, el);
    } else {
      pageRefsMap.current.delete(pageNum);
    }
  }, []);

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
        {!scrollMode && (
          <>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-2 py-0.5 disabled:opacity-30"
            >
              &lt;
            </button>
          </>
        )}
        <span>
          {t('preview.document.pageOf', { current: String(currentPage), total: String(numPages) })}
        </span>
        {!scrollMode && (
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            className="px-2 py-0.5 disabled:opacity-30"
          >
            &gt;
          </button>
        )}
        <span className="mx-2">|</span>
        <button onClick={zoomOut} className="px-2 py-0.5" title={t('preview.document.zoomOut')}>
          -
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} className="px-2 py-0.5" title={t('preview.document.zoomIn')}>
          +
        </button>
        <span className="mx-1 opacity-20">|</span>
        {/* Scroll / page mode toggle */}
        <button
          onClick={toggleScrollMode}
          className="rounded px-2 py-0.5"
          title={scrollMode ? t('preview.document.modePage') : t('preview.document.modeScroll')}
          style={{
            background: scrollMode
              ? 'var(--vscode-button-background)'
              : 'var(--vscode-button-secondaryBackground)',
            color: scrollMode
              ? 'var(--vscode-button-foreground)'
              : 'var(--vscode-button-secondaryForeground)',
          }}
        >
          {scrollMode ? '≡' : '⊡'}
        </button>
      </div>

      {/* PDF content */}
      {scrollMode ? (
        /* Waterfall mode */
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto p-4"
          style={{ background: 'var(--vscode-editor-background)' }}
        >
          {pageViewports.map((vp, i) => (
            <div
              key={i}
              ref={(el) => setPageRef(i + 1, el)}
              data-page={i + 1}
              style={{
                width: `${vp.width}px`,
                height: `${vp.height}px`,
                margin: '8px auto',
                background: 'var(--vscode-editor-background)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
              }}
            />
          ))}
        </div>
      ) : (
        /* Single-page mode */
        <div
          className="flex-1 overflow-auto p-4"
          style={{ background: 'var(--vscode-editor-background)' }}
        >
          <div ref={singlePageContainerRef} />
        </div>
      )}

      {/* Selection FAB */}
      <DocumentSelectionFab
        selection={selection}
        onSendToAi={sendToAi}
        label={t('preview.document.sendToAi')}
      />
    </div>
  );
};
