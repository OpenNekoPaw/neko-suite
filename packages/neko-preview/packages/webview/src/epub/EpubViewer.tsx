/**
 * EPUB Viewer — renders EPUB using epub.js with chapter navigation and text selection.
 *
 * Features:
 * - Paginated / scrolled-doc mode toggle
 * - Text selection → FAB → send text (+ nearby inline figures) to AI
 * - "Send page" toolbar button → captures all images on current page → send to AI
 * - Chapter navigation via toolbar and epub:navigate message from extension
 * - TOC via VSCode Outline (DocumentSymbolProvider in extension host)
 */

import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import ePub, { type Book, type Rendition } from 'epubjs';
import { useExtensionMessage, postMessage } from '../shared/useVscodeMessage';
import { DocumentSelectionFab } from '../shared/DocumentSelectionFab';
import type { DocumentSelection } from '../shared/useDocumentSelection';
import { captureIframeImages, collectNearbyImages, fetchAndCompress } from '../shared/imageUtils';
import type { CapturedImagePayload } from '../shared/document-types';
import { useTranslation } from '../i18n/I18nContext';

interface TocItem {
  label: string;
  href: string;
}

/** epubjs Contents object (not fully typed in @types/epubjs) */
interface EpubContents {
  document: Document;
  window: Window;
}

/** Max characters forwarded to agent — stays within message size budget */
const MAX_SELECTION_CHARS = 4000;
/** Max images per send-page action */
const MAX_PAGE_IMAGES = 5;
/** Max inline figures included alongside text selection */
const MAX_INLINE_FIGURES = 3;

export const EpubViewer: FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentChapter, setCurrentChapter] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [epubSelection, setEpubSelection] = useState<DocumentSelection | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const tocRef = useRef<TocItem[]>([]);
  const loadingRef = useRef(false);
  // Pending inline figures from the most recent text selection
  const selectionImagesRef = useRef<CapturedImagePayload[]>([]);
  // Prevents rapid chapter-skip while auto-advancing in scrolled mode
  const scrollCooldownRef = useRef(false);

  // =========================================================================
  // Extension ↔ Webview messaging
  // =========================================================================

  useExtensionMessage((msg) => {
    if (msg.type === 'document:data') {
      if ('url' in msg.payload && msg.payload.url) {
        loadEpubFromUrl(msg.payload.url);
      } else if (msg.payload.data) {
        loadEpub(msg.payload.data);
      }
    } else if (msg.type === 'epub:navigate') {
      renditionRef.current?.display(
        (msg as { type: string; payload: { href: string } }).payload.href,
      );
    }
  });

  // =========================================================================
  // Mount / unmount
  // =========================================================================

  useEffect(() => {
    postMessage({ type: 'ready' } as never);

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!loadingRef.current) return;
      event.preventDefault();
      const msg = event.reason instanceof Error ? event.reason.message : String(event.reason);
      setError(msg);
      setLoading(false);
      loadingRef.current = false;
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      renditionRef.current?.destroy();
      bookRef.current?.destroy();
    };
  }, []);

  // =========================================================================
  // Rendition helpers
  // =========================================================================

  const getContents = (): EpubContents | null => {
    const rendition = renditionRef.current;
    if (!rendition) return null;
    const list = (rendition as unknown as { getContents: () => EpubContents[] }).getContents?.();
    return list?.[0] ?? null;
  };

  const setupRendition = useCallback((rendition: Rendition, tocItems: TocItem[]) => {
    rendition.themes.register('vscode', {
      body: {
        background: 'var(--vscode-editor-background) !important',
        color: 'var(--vscode-editor-foreground) !important',
        'font-family': 'var(--vscode-font-family) !important',
        'line-height': '1.6',
        padding: '20px !important',
      },
      'a, a:visited': { color: 'var(--vscode-textLink-foreground) !important' },
      'img, image': {
        'max-width': '100% !important',
        height: 'auto !important',
        display: 'block !important',
        margin: '0 auto !important',
      },
    });
    rendition.themes.select('vscode');

    rendition.on('relocated', (location: { start: { href: string } }) => {
      const chapter = tocItems.find((item) => location.start.href.includes(item.href));
      if (chapter) setCurrentChapter(chapter.label);
      // Clear stale selection when page changes
      setEpubSelection(null);
      selectionImagesRef.current = [];
    });

    // -----------------------------------------------------------------------
    // Text selection inside the epub iframe
    // -----------------------------------------------------------------------
    rendition.on('selected', async (_cfi: string, contents: EpubContents) => {
      const sel = contents.window.getSelection();
      const raw = sel?.toString().trim() ?? '';
      if (!raw) {
        setEpubSelection(null);
        selectionImagesRef.current = [];
        return;
      }
      const text = raw.length > MAX_SELECTION_CHARS ? raw.slice(0, MAX_SELECTION_CHARS) : raw;

      // Map iframe-relative selection rect → parent viewport coords
      const iframeEl = viewerRef.current?.querySelector('iframe');
      const iframeRect = iframeEl?.getBoundingClientRect();
      const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
      const rangeRect = range?.getBoundingClientRect();
      const rect =
        iframeRect && rangeRect
          ? new DOMRect(
              iframeRect.left + rangeRect.left,
              iframeRect.top + rangeRect.top,
              rangeRect.width,
              rangeRect.height,
            )
          : null;

      setEpubSelection({ text, rect });

      // Asynchronously collect nearby inline figures (fire-and-forget)
      if (range) {
        const nearbyImgEls = collectNearbyImages(range, contents.document, MAX_INLINE_FIGURES);
        const compressed = await Promise.all(
          nearbyImgEls.map(async (img) => {
            const src = img.currentSrc || img.src;
            const dataUrl = src ? await fetchAndCompress(src) : null;
            return dataUrl ? { role: 'figure' as const, dataUrl } : null;
          }),
        );
        selectionImagesRef.current = compressed.filter(
          (x): x is CapturedImagePayload => x !== null,
        );
      }
    });

    rendition.on('click', () => {
      setEpubSelection(null);
      selectionImagesRef.current = [];
    });

    // -----------------------------------------------------------------------
    // Right-click context menu inside the epub iframe
    // Events don't bubble out of the iframe, so we register via hooks.content
    // which fires for every chapter document as it loads.
    // -----------------------------------------------------------------------
    type ContentHooks = { content: { register: (fn: (c: EpubContents) => void) => void } };
    (rendition as unknown as { hooks: ContentHooks }).hooks?.content?.register(
      (contents: EpubContents) => {
        contents.document.addEventListener('contextmenu', (e: Event) => {
          const me = e as MouseEvent;
          me.preventDefault();
          const iframeEl = viewerRef.current?.querySelector('iframe');
          const iframeRect = iframeEl?.getBoundingClientRect();
          if (!iframeRect) return;
          const x = Math.min(iframeRect.left + me.clientX, window.innerWidth - 180);
          const y = Math.min(iframeRect.top + me.clientY, window.innerHeight - 80);
          setContextMenu({ x, y });
        });
      },
    );
  }, []);

  // =========================================================================
  // Book loading / re-rendering
  // =========================================================================

  const renderBook = useCallback(
    async (book: Book, tocItems: TocItem[], flow: 'paginated' | 'scrolled-doc', cfi?: string) => {
      if (!viewerRef.current) return;
      renditionRef.current?.destroy();
      const isScrolled = flow === 'scrolled-doc';
      const rendition = book.renderTo(viewerRef.current, {
        width: '100%',
        // In scrolled-doc mode don't constrain height — let the iframe expand naturally
        // so the parent overflow-y-auto container can scroll through it.
        ...(isScrolled ? {} : { height: '100%' }),
        spread: 'none',
        flow,
      });
      renditionRef.current = rendition;
      setupRendition(rendition, tocItems);
      await rendition.display(cfi);
    },
    [setupRendition],
  );

  // Shared post-ready TOC extraction and initial render
  const initBook = useCallback(
    async (book: Book) => {
      await Promise.race([
        book.ready,
        new Promise<never>((_, reject) => {
          book.on('openFailed', (err: unknown) => reject(err));
        }),
      ]);

      const extractLabel = (raw: unknown): string => {
        if (typeof raw === 'string') return raw.trim();
        if (raw && typeof raw === 'object' && 'text' in raw)
          return String((raw as { text: unknown }).text).trim();
        return String(raw ?? '').trim();
      };

      const nav = await book.loaded.navigation;
      const rawToc: unknown = nav.toc;
      const tocItems: TocItem[] = Array.isArray(rawToc)
        ? rawToc
            .map((item) => ({
              label: extractLabel(item.label),
              href: String(item.href ?? ''),
            }))
            .filter((item) => item.href)
        : [];

      if (tocItems.length === 0) {
        type SpineItem = { href?: string; url?: string };
        const spineItems = (book.spine as unknown as { items: SpineItem[] })?.items;
        if (Array.isArray(spineItems)) {
          spineItems.forEach((item, i) => {
            const href = item.href ?? item.url ?? '';
            if (href) tocItems.push({ label: `Section ${i + 1}`, href });
          });
        }
      }
      tocRef.current = tocItems;
      await renderBook(book, tocItems, 'paginated');
    },
    [renderBook],
  );

  /** Load EPUB from a direct webview URL (preferred — no base64 overhead). */
  const loadEpubFromUrl = useCallback(
    async (url: string) => {
      // Probe whether the vscode-webview:// protocol supports HTTP Range requests.
      // Result is posted back to the extension host so it can be surfaced to the user.
      void fetch(url, { headers: { Range: 'bytes=0-1023' } })
        .then(async (r) => {
          const buf = await r.arrayBuffer();
          postMessage({
            type: 'epub:rangeTestResult',
            payload: {
              status: r.status,
              acceptRanges: r.headers.get('Accept-Ranges'),
              contentRange: r.headers.get('Content-Range'),
              receivedBytes: buf.byteLength,
              rangeSupported: r.status === 206,
            },
          } as never);
        })
        .catch((err: unknown) => {
          postMessage({
            type: 'epub:rangeTestResult',
            payload: { error: String(err), rangeSupported: false },
          } as never);
        });

      try {
        setLoading(true);
        loadingRef.current = true;
        setError(null);
        const book = ePub(url);
        bookRef.current = book;
        await initBook(book);
        setLoading(false);
        loadingRef.current = false;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [initBook],
  );

  /** Legacy: load EPUB from base64 string (fallback). */
  const loadEpub = useCallback(
    async (base64Data: string) => {
      try {
        setLoading(true);
        loadingRef.current = true;
        setError(null);

        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

        const book = ePub(bytes.buffer as ArrayBuffer);
        bookRef.current = book;
        await initBook(book);
        setLoading(false);
        loadingRef.current = false;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [initBook],
  );

  // =========================================================================
  // Navigation
  // =========================================================================

  const goToPrev = useCallback(() => renditionRef.current?.prev(), []);
  const goToNext = useCallback(() => renditionRef.current?.next(), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrev();
      else if (e.key === 'ArrowRight') goToNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext]);

  // =========================================================================
  // Cross-chapter scrolling (scrolled-doc mode)
  //
  // epubjs renders one chapter per iframe even in scrolled-doc mode.
  // We bridge chapter boundaries by:
  //   • scroll-to-bottom  → rendition.next(), reset viewer to top
  //   • wheel-up at top   → rendition.prev(), jump viewer to bottom
  // A cooldown ref prevents rapid chapter-skipping during fast scroll.
  // =========================================================================

  useEffect(() => {
    if (!scrolled) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    const THRESHOLD = 40; // px from edge that counts as "at boundary"
    const COOLDOWN_MS = 600;

    const advance = (direction: 'next' | 'prev') => {
      if (scrollCooldownRef.current) return;
      scrollCooldownRef.current = true;
      const action =
        direction === 'next' ? renditionRef.current?.next() : renditionRef.current?.prev();
      void action
        ?.then(() => {
          if (direction === 'next') {
            viewer.scrollTop = 0;
          } else {
            // Jump to bottom so the reader can scroll back up naturally
            requestAnimationFrame(() => {
              viewer.scrollTop = viewer.scrollHeight;
            });
          }
        })
        .finally(() => {
          setTimeout(() => {
            scrollCooldownRef.current = false;
          }, COOLDOWN_MS);
        });
    };

    const onScroll = () => {
      if (scrollCooldownRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = viewer;
      if (scrollTop + clientHeight >= scrollHeight - THRESHOLD) {
        advance('next');
      }
    };

    // Detect upward wheel at the very top to go to previous chapter
    const onWheel = (e: WheelEvent) => {
      if (scrollCooldownRef.current) return;
      if (e.deltaY < 0 && viewer.scrollTop <= 0) {
        advance('prev');
      }
    };

    viewer.addEventListener('scroll', onScroll, { passive: true });
    viewer.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      viewer.removeEventListener('scroll', onScroll);
      viewer.removeEventListener('wheel', onWheel);
    };
  }, [scrolled]);

  const toggleScrollMode = useCallback(async () => {
    const book = bookRef.current;
    const rendition = renditionRef.current;
    if (!book) return;
    const newScrolled = !scrolled;
    setScrolled(newScrolled);
    const location = rendition?.currentLocation() as { start: { cfi: string } } | null | undefined;
    await renderBook(
      book,
      tocRef.current,
      newScrolled ? 'scrolled-doc' : 'paginated',
      location?.start?.cfi,
    );
  }, [scrolled, renderBook]);

  // =========================================================================
  // Send current page images to AI
  // =========================================================================

  const sendPageToAi = useCallback(async () => {
    const contents = getContents();
    if (!contents || capturing) return;

    setCapturing(true);
    try {
      const captured = await captureIframeImages(contents.document, MAX_PAGE_IMAGES);
      if (captured.length === 0) {
        // No images — fall back to sending visible text
        const bodyText = contents.document.body?.innerText?.trim().slice(0, MAX_SELECTION_CHARS);
        if (bodyText) {
          postMessage({
            type: 'document:sendToAi',
            payload: {
              selectedText: bodyText,
              chapterTitle: currentChapter || undefined,
              contentKind: 'text',
            },
          } as never);
        }
        return;
      }

      postMessage({
        type: 'document:sendToAi',
        payload: {
          chapterTitle: currentChapter || undefined,
          images: captured,
          contentKind: 'image',
        },
      } as never);
    } finally {
      setCapturing(false);
    }
  }, [capturing, currentChapter]);

  // =========================================================================
  // Send text selection (+ optional nearby figures) to AI
  // =========================================================================

  const sendSelectionToAi = useCallback(() => {
    if (!epubSelection) return;
    const inlineFigures = selectionImagesRef.current;
    const hasImages = inlineFigures.length > 0;

    postMessage({
      type: 'document:sendToAi',
      payload: {
        selectedText: epubSelection.text,
        chapterTitle: currentChapter || undefined,
        images: hasImages ? inlineFigures : undefined,
        contentKind: hasImages ? 'mixed' : 'text',
      },
    } as never);

    setEpubSelection(null);
    selectionImagesRef.current = [];
  }, [epubSelection, currentChapter]);

  // =========================================================================
  // Render
  // =========================================================================

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
      onClick={() => setContextMenu(null)}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-1 border-b px-3 py-1.5 text-xs"
        style={{
          borderColor: 'var(--vscode-panel-border)',
          color: 'var(--vscode-foreground)',
          background: 'var(--vscode-sideBar-background)',
        }}
      >
        <button onClick={goToPrev} className="px-2 py-0.5 hover:opacity-70">
          &lt;
        </button>
        <span className="flex-1 truncate text-center opacity-70">{currentChapter}</span>
        <button onClick={goToNext} className="px-2 py-0.5 hover:opacity-70">
          &gt;
        </button>

        <span className="mx-1 opacity-20">|</span>

        {/* Send current page to AI */}
        <button
          onClick={sendPageToAi}
          disabled={loading || capturing}
          className="rounded px-2 py-0.5 hover:opacity-80 disabled:opacity-40"
          style={{
            background: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
          }}
          title={t('preview.epub.sendPage')}
        >
          {capturing ? '…' : '⌅'}
        </button>

        {/* Scroll / paginated mode toggle */}
        <button
          onClick={toggleScrollMode}
          className="rounded px-2 py-0.5"
          title={scrolled ? t('preview.epub.modePaginated') : t('preview.epub.modeScrolled')}
          style={{
            background: scrolled
              ? 'var(--vscode-button-background)'
              : 'var(--vscode-button-secondaryBackground)',
            color: scrolled
              ? 'var(--vscode-button-foreground)'
              : 'var(--vscode-button-secondaryForeground)',
          }}
        >
          {scrolled ? '≡' : '⊡'}
        </button>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        {/* Loading overlay */}
        {loading && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center"
            style={{
              background: 'var(--vscode-editor-background)',
              color: 'var(--vscode-foreground)',
            }}
          >
            {t('preview.epub.loading')}
          </div>
        )}

        {/* EPUB content — scrolled-doc needs overflow-y-auto; paginated needs overflow-hidden */}
        <div
          ref={viewerRef}
          className={`flex-1 ${scrolled ? 'overflow-y-auto' : 'overflow-hidden'}`}
        />
      </div>

      {/* FAB: appears on text selection inside the epub iframe */}
      <DocumentSelectionFab
        selection={epubSelection}
        onSendToAi={sendSelectionToAi}
        label={t('preview.document.sendToAi')}
      />

      {/* Context menu — right-click inside epub iframe */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded py-1 text-xs shadow-lg"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            minWidth: '160px',
            background: 'var(--vscode-menu-background, var(--vscode-sideBar-background))',
            border: '1px solid var(--vscode-menu-border, var(--vscode-panel-border))',
            color: 'var(--vscode-menu-foreground, var(--vscode-foreground))',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {epubSelection && (
            <button
              className="block w-full px-3 py-1.5 text-left hover:opacity-80"
              style={{ background: 'transparent', color: 'inherit' }}
              onClick={() => {
                sendSelectionToAi();
                setContextMenu(null);
              }}
            >
              {t('preview.document.sendToAi')}
            </button>
          )}
          <button
            className="block w-full px-3 py-1.5 text-left hover:opacity-80"
            style={{ background: 'transparent', color: 'inherit' }}
            onClick={() => {
              void sendPageToAi();
              setContextMenu(null);
            }}
          >
            {t('preview.epub.sendPage')}
          </button>
        </div>
      )}
    </div>
  );
};
