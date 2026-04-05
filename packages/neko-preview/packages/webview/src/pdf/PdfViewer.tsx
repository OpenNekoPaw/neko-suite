/**
 * PDF Viewer — renders PDF using pdfjs-dist with TextLayer for text selection.
 *
 * View modes:
 * - scroll:  Waterfall continuous scroll (default)
 * - dual:    Two-page side-by-side spread
 * - single:  Single page with prev/next navigation
 */

import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { useExtensionMessage, postMessage } from '../shared/useVscodeMessage';
import { useDocumentSelection } from '../shared/useDocumentSelection';
import { DocumentContextMenu, useDocumentContextActions } from '../shared/DocumentContextMenu';
import { usePersistedState } from '../shared/usePersistedState';
import { useTranslation } from '../i18n/I18nContext';
import { getLogger } from '../utils/logger';

const logger = getLogger('PdfViewer');

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PageViewport {
  width: number;
  height: number;
}

type ViewMode = 'scroll' | 'dual' | 'single';
const VIEW_MODES: ViewMode[] = ['scroll', 'dual', 'single'];
const VIEW_MODE_ICONS: Record<ViewMode, string> = { scroll: '≡', dual: '⊞', single: '⊡' };

export const PdfViewer: FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = usePersistedState('currentPage', 1);
  const [scale, setScale] = usePersistedState('scale', 1.5);
  const [viewMode, setViewMode] = usePersistedState<ViewMode>('viewMode', 'scroll');

  const [pageViewports, setPageViewports] = useState<PageViewport[]>([]);

  // Ref to capture persisted page for use in load callbacks without dep churn
  const persistedPageRef = useRef(currentPage);
  persistedPageRef.current = currentPage;

  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());
  const renderingPagesRef = useRef<Set<number>>(new Set());
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  // Monotonic counter to invalidate stale renders after mode switch
  const modeEpochRef = useRef(0);

  const { selection, sendToAi } = useDocumentSelection({ pageNumber: currentPage });

  useExtensionMessage((msg) => {
    if (msg.type === 'document:data') {
      if ('url' in msg.payload && msg.payload.url) {
        void loadPdfFromUrl(msg.payload.url as string);
      } else if (msg.payload.data) {
        void loadPdf(msg.payload.data as string);
      }
    }
  });

  useEffect(() => {
    postMessage({ type: 'ready' } as never);
  }, []);

  const loadPdfFromUrl = useCallback(
    async (url: string) => {
      try {
        setLoading(true);
        setError(null);
        const pdf = await pdfjsLib.getDocument({ url }).promise;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        // Restore persisted page or start at 1
        const saved = persistedPageRef.current;
        const restoredPage = saved >= 1 && saved <= pdf.numPages ? saved : 1;
        setCurrentPage(restoredPage);
        await computeViewports(pdf, scale);
        setLoading(false);
        postMessage({
          type: 'document:statusUpdate',
          payload: { pageCount: pdf.numPages, currentPage: restoredPage },
        } as never);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    },
    [scale],
  );

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
        const saved = persistedPageRef.current;
        const restoredPage = saved >= 1 && saved <= pdf.numPages ? saved : 1;
        setCurrentPage(restoredPage);
        await computeViewports(pdf, scale);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    },
    [scale],
  );

  const computeViewports = useCallback(
    async (pdf: pdfjsLib.PDFDocumentProxy, pageScale: number) => {
      const viewports: PageViewport[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: pageScale });
        viewports.push({ width: vp.width, height: vp.height });
      }
      setPageViewports(viewports);
      renderedPagesRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    void computeViewports(pdf, scale);
  }, [scale, computeViewports]);

  // Scroll to restored page after initial load in scroll mode
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (loading || hasRestoredRef.current || pageViewports.length === 0) return;
    if (viewMode === 'scroll' && currentPage > 1) {
      requestAnimationFrame(() => {
        const el = pageRefsMap.current.get(currentPage);
        el?.scrollIntoView({ block: 'start' });
      });
    }
    hasRestoredRef.current = true;
  }, [loading, pageViewports.length > 0]);

  // =========================================================================
  // Shared page renderer
  // =========================================================================

  const renderPageIntoEl = useCallback(
    async (pageNum: number, el: HTMLElement, epoch: number) => {
      const pdf = pdfDocRef.current;
      if (!pdf) return;
      if (renderingPagesRef.current.has(pageNum) || renderedPagesRef.current.has(pageNum)) return;

      renderingPagesRef.current.add(pageNum);
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        // Stale check: mode changed or already rendered
        if (modeEpochRef.current !== epoch || renderedPagesRef.current.has(pageNum)) return;

        el.innerHTML = '';

        const pageDiv = document.createElement('div');
        pageDiv.style.position = 'relative';
        pageDiv.style.width = `${viewport.width}px`;
        pageDiv.style.height = `${viewport.height}px`;

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

        // Final stale check before DOM mutation
        if (modeEpochRef.current !== epoch) return;

        el.innerHTML = '';
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

  // =========================================================================
  // Scroll mode: IntersectionObserver
  // =========================================================================

  useEffect(() => {
    if (viewMode !== 'scroll' || pageViewports.length === 0) return;

    // Wait one frame for refs to mount after mode switch
    const rafId = requestAnimationFrame(() => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;

      observerRef.current?.disconnect();
      const epoch = modeEpochRef.current;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const pageNum = Number((entry.target as HTMLElement).dataset['page']);
            if (!pageNum) continue;

            if (entry.isIntersecting) {
              void renderPageIntoEl(pageNum, entry.target as HTMLElement, epoch);
            } else {
              // Clear off-screen pages
              if (renderedPagesRef.current.has(pageNum)) {
                (entry.target as HTMLElement).innerHTML = '';
                renderedPagesRef.current.delete(pageNum);
              }
            }
          }
          updateCurrentPageFromScroll();
        },
        { root: scrollContainer, rootMargin: '200% 0px' },
      );

      observerRef.current = observer;
      for (const [, el] of pageRefsMap.current) {
        observer.observe(el);
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [viewMode, pageViewports, renderPageIntoEl]);

  // =========================================================================
  // Single/Dual mode: render on page change
  // =========================================================================

  useEffect(() => {
    if (viewMode === 'scroll' || pageViewports.length === 0) return;
    const epoch = modeEpochRef.current;

    // Wait one frame for refs to mount
    const rafId = requestAnimationFrame(() => {
      renderedPagesRef.current.clear();

      if (viewMode === 'single') {
        const el = pageRefsMap.current.get(currentPage);
        if (el) void renderPageIntoEl(currentPage, el, epoch);
      } else if (viewMode === 'dual') {
        // Render current page + next page
        const el1 = pageRefsMap.current.get(currentPage);
        if (el1) void renderPageIntoEl(currentPage, el1, epoch);
        const nextPage = currentPage + 1;
        if (nextPage <= numPages) {
          const el2 = pageRefsMap.current.get(nextPage);
          if (el2) void renderPageIntoEl(nextPage, el2, epoch);
        }
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [viewMode, currentPage, scale, pageViewports, numPages, renderPageIntoEl]);

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
  // Navigation + mode switch
  // =========================================================================

  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= numPages) {
        setCurrentPage(page);
        if (viewMode === 'scroll') {
          const el = pageRefsMap.current.get(page);
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    },
    [numPages, viewMode],
  );

  const goToPrevPage = useCallback(() => {
    const step = viewMode === 'dual' ? 2 : 1;
    goToPage(Math.max(1, currentPage - step));
  }, [viewMode, currentPage, goToPage]);

  const goToNextPage = useCallback(() => {
    const step = viewMode === 'dual' ? 2 : 1;
    goToPage(Math.min(numPages, currentPage + step));
  }, [viewMode, currentPage, numPages, goToPage]);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 5)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.5)), []);

  const cycleViewMode = useCallback(() => {
    const idx = VIEW_MODES.indexOf(viewMode);
    const next = VIEW_MODES[(idx + 1) % VIEW_MODES.length]!;
    // Bump epoch to invalidate any in-flight renders from old mode
    modeEpochRef.current++;
    renderedPagesRef.current.clear();
    renderingPagesRef.current.clear();
    observerRef.current?.disconnect();
    setViewMode(next);
  }, [viewMode]);

  const setPageRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefsMap.current.set(pageNum, el);
    } else {
      pageRefsMap.current.delete(pageNum);
    }
  }, []);

  // =========================================================================
  // Render
  // =========================================================================

  const contextActions = useDocumentContextActions({
    hasSelection: !!selection,
    onSendSelectionToAi: selection ? sendToAi : undefined,
  });

  const viewModeTitle =
    viewMode === 'scroll'
      ? t('preview.document.modePage')
      : viewMode === 'dual'
        ? t('preview.document.modePage')
        : t('preview.document.modeScroll');

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
          {viewMode !== 'scroll' && (
            <button
              onClick={goToPrevPage}
              disabled={currentPage <= 1}
              className="px-2 py-0.5 disabled:opacity-30"
            >
              &lt;
            </button>
          )}
          <span>
            {t('preview.document.pageOf', {
              current: String(currentPage),
              total: String(numPages),
            })}
          </span>
          {viewMode !== 'scroll' && (
            <button
              onClick={goToNextPage}
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
          <button
            onClick={cycleViewMode}
            className="rounded px-2 py-0.5"
            title={viewModeTitle}
            style={{
              background:
                viewMode !== 'single'
                  ? 'var(--vscode-button-background)'
                  : 'var(--vscode-button-secondaryBackground)',
              color:
                viewMode !== 'single'
                  ? 'var(--vscode-button-foreground)'
                  : 'var(--vscode-button-secondaryForeground)',
            }}
          >
            {VIEW_MODE_ICONS[viewMode]}
          </button>
        </div>

        {/* PDF content */}
        {viewMode === 'scroll' ? (
          /* Waterfall mode — all pages stacked vertically */
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
        ) : viewMode === 'dual' ? (
          /* Dual mode — two pages side by side, centered */
          <div
            className="flex flex-1 items-start justify-center gap-4 overflow-auto p-4"
            style={{ background: 'var(--vscode-editor-background)' }}
          >
            {/* Left page */}
            {pageViewports[currentPage - 1] && (
              <div
                ref={(el) => setPageRef(currentPage, el)}
                data-page={currentPage}
                style={{
                  width: `${pageViewports[currentPage - 1]!.width}px`,
                  height: `${pageViewports[currentPage - 1]!.height}px`,
                  flexShrink: 0,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                }}
              />
            )}
            {/* Right page */}
            {currentPage < numPages && pageViewports[currentPage] && (
              <div
                ref={(el) => setPageRef(currentPage + 1, el)}
                data-page={currentPage + 1}
                style={{
                  width: `${pageViewports[currentPage]!.width}px`,
                  height: `${pageViewports[currentPage]!.height}px`,
                  flexShrink: 0,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                }}
              />
            )}
          </div>
        ) : (
          /* Single page mode — centered */
          <div
            className="flex flex-1 items-start justify-center overflow-auto p-4"
            style={{ background: 'var(--vscode-editor-background)' }}
          >
            {pageViewports[currentPage - 1] && (
              <div
                ref={(el) => setPageRef(currentPage, el)}
                data-page={currentPage}
                style={{
                  width: `${pageViewports[currentPage - 1]!.width}px`,
                  height: `${pageViewports[currentPage - 1]!.height}px`,
                  flexShrink: 0,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                }}
              />
            )}
          </div>
        )}
      </div>
    </DocumentContextMenu>
  );
};
