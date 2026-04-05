/**
 * EPUB Viewer — renders EPUB using epub.js with chapter navigation and text selection.
 *
 * Three view modes:
 * - Paginated: traditional page-by-page (epubjs rendition)
 * - Scrolled-doc: single-chapter scroll with auto-advance (epubjs rendition)
 * - Waterfall: true continuous scroll across all chapters (custom DOM, bypasses rendition)
 *
 * Features:
 * - Text selection → FAB → send text (+ nearby inline figures) to AI
 * - "Send page" toolbar button → captures images/text → send to AI
 * - Chapter navigation via toolbar and epub:navigate message from extension
 * - TOC via VSCode Outline (DocumentSymbolProvider in extension host)
 */

import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import ePub, { type Book, type Rendition } from 'epubjs';
import { useExtensionMessage, postMessage } from '../shared/useVscodeMessage';
import { useDocumentSelection } from '../shared/useDocumentSelection';
import { DocumentSelectionFab } from '../shared/DocumentSelectionFab';
import { DocumentContextMenu, useDocumentContextActions } from '../shared/DocumentContextMenu';
import type { DocumentSelection } from '../shared/useDocumentSelection';

/** Minimal section interface — epubjs doesn't export Section from its main entry.
 *  The actual runtime returns Promises despite the .d.ts saying otherwise. */
interface EpubSection {
  index: number;
  href: string;
  url: string;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  render(request?: Function): Promise<string>;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  load(request?: Function): Promise<Document>;
  unload(): void;
}
import { captureIframeImages, collectNearbyImages, fetchAndCompress } from '../shared/imageUtils';
import type { CapturedImagePayload } from '../shared/document-types';
import { useTranslation } from '../i18n/I18nContext';
import { getLogger } from '../utils/logger';

const logger = getLogger('EpubViewer');

interface TocItem {
  label: string;
  href: string;
}

/** epubjs Contents object (not fully typed in @types/epubjs) */
interface EpubContents {
  document: Document;
  window: Window;
}

/** Spine item metadata for waterfall mode */
interface SpineEntry {
  index: number;
  href: string;
  section: EpubSection;
}

/** Max characters forwarded to agent — stays within message size budget */
const MAX_SELECTION_CHARS = 4000;
/** Max images per send-page action */
const MAX_PAGE_IMAGES = 5;
/** Max inline figures included alongside text selection */
const MAX_INLINE_FIGURES = 3;

type ViewMode = 'paginated' | 'scrolled' | 'waterfall';

/**
 * Custom request function for epub.js that uses fetch() instead of XMLHttpRequest.
 * VSCode webview service workers can block XHR to localhost; fetch works reliably.
 */
async function fetchForEpub(url: string, type?: string): Promise<unknown> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}: ${url}`);

  if (type === 'blob' || type === 'binary') {
    return resp.blob();
  }
  if (type === 'json') {
    return resp.json();
  }

  const text = await resp.text();

  // XML types: parse to Document
  const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() ?? '';
  const isXml = type === 'xml' || ['xml', 'opf', 'ncx', 'xhtml', 'svg'].includes(ext);
  if (isXml) {
    const parser = new DOMParser();
    return parser.parseFromString(text, 'application/xml');
  }
  if (type === 'xhtml' || ext === 'xhtml') {
    const parser = new DOMParser();
    return parser.parseFromString(text, 'application/xhtml+xml');
  }
  if (type === 'html' || ext === 'html' || ext === 'htm') {
    const parser = new DOMParser();
    return parser.parseFromString(text, 'text/html');
  }

  return text;
}

/** VSCode theme CSS applied to waterfall chapter content */
const WATERFALL_THEME_CSS = `
  .epub-chapter-content {
    background: var(--vscode-editor-background) !important;
    color: var(--vscode-editor-foreground) !important;
    font-family: var(--vscode-font-family) !important;
    line-height: 1.6;
  }
  .epub-chapter-content a,
  .epub-chapter-content a:visited { color: var(--vscode-textLink-foreground) !important; }
  .epub-chapter-content img,
  .epub-chapter-content image {
    max-width: 100% !important;
    height: auto !important;
    display: block !important;
    margin: 0 auto !important;
  }
`;

export const EpubViewer: FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentChapter, setCurrentChapter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('waterfall');
  const [epubSelection, setEpubSelection] = useState<DocumentSelection | null>(null);
  const [capturing, setCapturing] = useState(false);
  // Context menu is now handled by shared DocumentContextMenu component

  // Rendition mode refs (paginated / scrolled-doc)
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const tocRef = useRef<TocItem[]>([]);
  const loadingRef = useRef(false);
  const selectionImagesRef = useRef<CapturedImagePayload[]>([]);
  const scrollCooldownRef = useRef(false);

  // Waterfall mode refs
  const waterfallContainerRef = useRef<HTMLDivElement>(null);
  const spineEntriesRef = useRef<SpineEntry[]>([]);
  const chapterRefsMap = useRef<Map<number, HTMLElement>>(new Map());
  const loadedChaptersRef = useRef<Set<number>>(new Set());
  const loadingChaptersRef = useRef<Set<number>>(new Set());
  const waterfallObserverRef = useRef<IntersectionObserver | null>(null);
  const [waterfallReady, setWaterfallReady] = useState(false);
  const chapterHeightsRef = useRef<Map<number, number>>(new Map());

  // Waterfall text selection via native document selection
  const { selection: waterfallSelection, sendToAi: waterfallSendToAi } = useDocumentSelection({
    chapterTitle: currentChapter,
  });

  // =========================================================================
  // Extension ↔ Webview messaging
  // =========================================================================

  useExtensionMessage((msg) => {
    if (msg.type === 'document:data') {
      if ('url' in msg.payload && msg.payload.url) {
        void loadEpubFromUrl(msg.payload.url);
      } else if (msg.payload.data) {
        void loadEpub(msg.payload.data);
      }
    } else if (msg.type === 'epub:navigate') {
      const href = (msg as { type: string; payload: { href: string } }).payload.href;
      if (viewMode === 'waterfall') {
        navigateWaterfallToHref(href);
      } else {
        renditionRef.current?.display(href);
      }
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
  // Rendition helpers (paginated + scrolled-doc modes)
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
      setEpubSelection(null);
      selectionImagesRef.current = [];
    });

    rendition.on('selected', async (_cfi: string, contents: EpubContents) => {
      const sel = contents.window.getSelection();
      const raw = sel?.toString().trim() ?? '';
      if (!raw) {
        setEpubSelection(null);
        selectionImagesRef.current = [];
        return;
      }
      const text = raw.length > MAX_SELECTION_CHARS ? raw.slice(0, MAX_SELECTION_CHARS) : raw;

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

      if (range) {
        const nearbyImgEls = collectNearbyImages(range, contents.document, MAX_INLINE_FIGURES);
        const compressed: CapturedImagePayload[] = [];
        for (const img of nearbyImgEls) {
          const src = img.currentSrc || img.src;
          if (!src) continue;
          const dataUrl = await fetchAndCompress(src);
          if (dataUrl) compressed.push({ role: 'figure', dataUrl });
        }
        selectionImagesRef.current = compressed;
      }
    });

    rendition.on('click', () => {
      setEpubSelection(null);
      selectionImagesRef.current = [];
    });
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

  /** Extract TOC and spine entries from book */
  const extractBookMetadata = useCallback(async (book: Book) => {
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
      type SpItem = { href?: string; url?: string };
      const spineItems = (book.spine as unknown as { items: SpItem[] })?.items;
      if (Array.isArray(spineItems)) {
        spineItems.forEach((item, i) => {
          const href = item.href ?? item.url ?? '';
          if (href) tocItems.push({ label: `Section ${i + 1}`, href });
        });
      }
    }
    tocRef.current = tocItems;

    // Collect spine entries for waterfall mode
    const entries: SpineEntry[] = [];
    const spineItems = (
      book.spine as unknown as { items: Array<{ index: number; href?: string; url?: string }> }
    )?.items;
    if (Array.isArray(spineItems)) {
      for (const item of spineItems) {
        const section = book.section(item.index) as unknown as EpubSection | null;
        if (section) {
          entries.push({ index: item.index, href: item.href ?? item.url ?? '', section });
        }
      }
    }
    spineEntriesRef.current = entries;

    return tocItems;
  }, []);

  /** Init book — unified entry point for all modes */
  const initBook = useCallback(
    async (book: Book) => {
      const tocItems = await extractBookMetadata(book);

      if (viewMode === 'waterfall') {
        // Destroy any existing rendition
        renditionRef.current?.destroy();
        renditionRef.current = null;
        loadedChaptersRef.current.clear();
        loadingChaptersRef.current.clear();
        chapterHeightsRef.current.clear();
        setWaterfallReady(true);
      } else {
        const flow = viewMode === 'scrolled' ? 'scrolled-doc' : 'paginated';
        await renderBook(book, tocItems, flow as 'paginated' | 'scrolled-doc');
      }
    },
    [viewMode, extractBookMetadata, renderBook],
  );

  // =========================================================================
  // Book loaders
  // =========================================================================

  /** Load EPUB from a localhost URL served by neko-engine. */
  const loadEpubFromUrl = useCallback(
    async (url: string) => {
      try {
        setLoading(true);
        loadingRef.current = true;
        setError(null);
        // Use custom requestMethod with fetch instead of epub.js's default XMLHttpRequest.
        // VSCode webview service worker can interfere with XHR to localhost.
        const book = ePub(url, { requestMethod: fetchForEpub });
        bookRef.current = book;
        await initBook(book);
        setLoading(false);
        loadingRef.current = false;
        // Send status with chapter count
        const chapterCount = spineEntriesRef.current.length || tocRef.current.length;
        postMessage({
          type: 'document:statusUpdate',
          payload: { pageCount: chapterCount },
        } as never);
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
  // Waterfall mode: load/unload chapter content
  // =========================================================================

  const loadChapterContent = useCallback(async (entry: SpineEntry) => {
    const book = bookRef.current;
    if (!book) return;
    if (loadedChaptersRef.current.has(entry.index) || loadingChaptersRef.current.has(entry.index))
      return;

    const el = chapterRefsMap.current.get(entry.index);
    if (!el) return;

    loadingChaptersRef.current.add(entry.index);
    try {
      // section.render() returns HTML string with resource URLs resolved via book.load()
      const html = await entry.section.render(book.load.bind(book));

      if (!chapterRefsMap.current.has(entry.index)) return;

      el.innerHTML = html;

      // Rewrite relative resource URLs to absolute HTTP URLs served by neko-engine.
      // Use section.url as base (e.g. http://…/epub/{token}/OEBPS/text/ch1.xhtml)
      // so that relative paths like "../image/cover.jpg" resolve correctly.
      const sectionBase = entry.section.url ?? '';
      const rewriteAttr = (el2: Element, attr: string) => {
        const val = el2.getAttribute(attr);
        if (
          val &&
          !val.startsWith('blob:') &&
          !val.startsWith('data:') &&
          !val.startsWith('http')
        ) {
          try {
            el2.setAttribute(attr, new URL(val, sectionBase).href);
          } catch {
            /* keep original */
          }
        }
      };
      el.querySelectorAll('img').forEach((img) => rewriteAttr(img, 'src'));
      el.querySelectorAll('image').forEach((img) => {
        rewriteAttr(img, 'href');
        rewriteAttr(img, 'xlink:href');
      });
      el.querySelectorAll('link[rel="stylesheet"]').forEach((link) => rewriteAttr(link, 'href'));

      loadedChaptersRef.current.add(entry.index);
      chapterHeightsRef.current.set(entry.index, el.scrollHeight);
    } catch (err) {
      logger.error(`Failed to load chapter ${entry.index}:`, err);
    } finally {
      loadingChaptersRef.current.delete(entry.index);
    }
  }, []);

  const unloadChapterContent = useCallback((entry: SpineEntry) => {
    const el = chapterRefsMap.current.get(entry.index);
    if (!el || !loadedChaptersRef.current.has(entry.index)) return;

    chapterHeightsRef.current.set(entry.index, el.scrollHeight);
    el.style.minHeight = `${el.scrollHeight}px`;
    el.innerHTML = '';
    loadedChaptersRef.current.delete(entry.index);
  }, []);

  // =========================================================================
  // Waterfall mode: IntersectionObserver
  // =========================================================================

  useEffect(() => {
    if (viewMode !== 'waterfall' || !waterfallReady) return;

    const container = waterfallContainerRef.current;
    if (!container) return;

    waterfallObserverRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const observerEntry of entries) {
          const idx = Number((observerEntry.target as HTMLElement).dataset['spineIndex']);
          if (isNaN(idx)) continue;

          const spineEntry = spineEntriesRef.current.find((e) => e.index === idx);
          if (!spineEntry) continue;

          if (observerEntry.isIntersecting) {
            void loadChapterContent(spineEntry);
          } else {
            unloadChapterContent(spineEntry);
          }
        }
        updateCurrentChapterFromScroll();
      },
      {
        root: container,
        rootMargin: '100% 0px',
      },
    );

    waterfallObserverRef.current = observer;

    for (const [, el] of chapterRefsMap.current) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
      waterfallObserverRef.current = null;
    };
  }, [viewMode, waterfallReady, loadChapterContent, unloadChapterContent]);

  /** Update current chapter title based on scroll position */
  const updateCurrentChapterFromScroll = useCallback(() => {
    const container = waterfallContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const checkY = containerRect.top + containerRect.height * 0.3;

    for (const entry of spineEntriesRef.current) {
      const el = chapterRefsMap.current.get(entry.index);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= checkY && rect.bottom >= checkY) {
        const toc = tocRef.current.find(
          (item) => entry.href.includes(item.href) || item.href.includes(entry.href),
        );
        if (toc) setCurrentChapter(toc.label);
        return;
      }
    }
  }, []);

  /** Navigate waterfall to a specific href */
  const navigateWaterfallToHref = useCallback((href: string) => {
    const entry = spineEntriesRef.current.find(
      (e) => e.href === href || e.href.includes(href) || href.includes(e.href),
    );
    if (entry) {
      const el = chapterRefsMap.current.get(entry.index);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const setChapterRef = useCallback((index: number, el: HTMLElement | null) => {
    if (el) {
      chapterRefsMap.current.set(index, el);
    } else {
      chapterRefsMap.current.delete(index);
    }
  }, []);

  // =========================================================================
  // Navigation
  // =========================================================================

  const goToPrev = useCallback(() => {
    if (viewMode === 'waterfall') {
      const container = waterfallContainerRef.current;
      if (!container) return;
      const entries = spineEntriesRef.current;
      const containerRect = container.getBoundingClientRect();
      const checkY = containerRect.top + 10;
      for (let i = entries.length - 1; i >= 0; i--) {
        const el = chapterRefsMap.current.get(entries[i]!.index);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top < checkY) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
    } else {
      renditionRef.current?.prev();
    }
  }, [viewMode]);

  const goToNext = useCallback(() => {
    if (viewMode === 'waterfall') {
      const container = waterfallContainerRef.current;
      if (!container) return;
      const entries = spineEntriesRef.current;
      const containerRect = container.getBoundingClientRect();
      const checkY = containerRect.top + containerRect.height * 0.5;
      for (const entry of entries) {
        const el = chapterRefsMap.current.get(entry.index);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top > checkY) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
    } else {
      renditionRef.current?.next();
    }
  }, [viewMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrev();
      else if (e.key === 'ArrowRight') goToNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext]);

  // =========================================================================
  // Cross-chapter scrolling (scrolled-doc mode only)
  // =========================================================================

  useEffect(() => {
    if (viewMode !== 'scrolled') return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    const THRESHOLD = 40;
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
  }, [viewMode]);

  // =========================================================================
  // Mode switching
  // =========================================================================

  const cycleViewMode = useCallback(async () => {
    const book = bookRef.current;
    if (!book) return;

    const modes: ViewMode[] = ['waterfall', 'paginated', 'scrolled'];
    const currentIdx = modes.indexOf(viewMode);
    const nextMode = modes[(currentIdx + 1) % modes.length]!;

    const location = renditionRef.current?.currentLocation() as
      | { start: { cfi: string } }
      | null
      | undefined;

    setViewMode(nextMode);
    setWaterfallReady(false);
    loadedChaptersRef.current.clear();
    loadingChaptersRef.current.clear();

    if (nextMode === 'waterfall') {
      renditionRef.current?.destroy();
      renditionRef.current = null;
      setWaterfallReady(true);
    } else {
      const flow = nextMode === 'scrolled' ? 'scrolled-doc' : 'paginated';
      await renderBook(
        book,
        tocRef.current,
        flow as 'paginated' | 'scrolled-doc',
        location?.start?.cfi,
      );
    }
  }, [viewMode, renderBook]);

  // =========================================================================
  // Send page to AI
  // =========================================================================

  const sendPageToAi = useCallback(async () => {
    if (capturing) return;

    if (viewMode === 'waterfall') {
      setCapturing(true);
      try {
        const container = waterfallContainerRef.current;
        if (!container) return;

        for (const entry of spineEntriesRef.current) {
          const el = chapterRefsMap.current.get(entry.index);
          if (!el || !loadedChaptersRef.current.has(entry.index)) continue;
          const rect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
            const bodyText = el.innerText?.trim().slice(0, MAX_SELECTION_CHARS);
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
            break;
          }
        }
      } finally {
        setCapturing(false);
      }
      return;
    }

    const contents = getContents();
    if (!contents) return;

    setCapturing(true);
    try {
      const captured = await captureIframeImages(contents.document, MAX_PAGE_IMAGES);
      if (captured.length === 0) {
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
  }, [capturing, currentChapter, viewMode]);

  // =========================================================================
  // Send text selection to AI (rendition modes)
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
  // View mode label & icon
  // =========================================================================

  const viewModeIcon = viewMode === 'waterfall' ? '⇕' : viewMode === 'scrolled' ? '≡' : '⊡';
  const viewModeTitle =
    viewMode === 'waterfall'
      ? t('preview.epub.modePaginated')
      : viewMode === 'paginated'
        ? t('preview.epub.modeScrolled')
        : t('preview.epub.modeWaterfall');

  const activeSelection = viewMode === 'waterfall' ? waterfallSelection : epubSelection;
  const activeSendToAi = viewMode === 'waterfall' ? waterfallSendToAi : sendSelectionToAi;

  // =========================================================================
  // Render
  // =========================================================================

  const contextActions = useDocumentContextActions({
    hasSelection: !!(viewMode === 'waterfall' ? waterfallSelection : epubSelection),
    onSendSelectionToAi:
      viewMode === 'waterfall'
        ? waterfallSelection
          ? waterfallSendToAi
          : undefined
        : epubSelection
          ? sendSelectionToAi
          : undefined,
    onSendPageToAi: sendPageToAi,
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

          {/* View mode cycle button */}
          <button
            onClick={cycleViewMode}
            className="rounded px-2 py-0.5"
            title={viewModeTitle}
            style={{
              background:
                viewMode !== 'paginated'
                  ? 'var(--vscode-button-background)'
                  : 'var(--vscode-button-secondaryBackground)',
              color:
                viewMode !== 'paginated'
                  ? 'var(--vscode-button-foreground)'
                  : 'var(--vscode-button-secondaryForeground)',
            }}
          >
            {viewModeIcon}
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

          {/* Waterfall mode: custom DOM container */}
          {viewMode === 'waterfall' && (
            <div
              ref={waterfallContainerRef}
              className="flex-1 overflow-y-auto"
              style={{ display: loading ? 'none' : 'block' }}
            >
              <style>{WATERFALL_THEME_CSS}</style>
              {spineEntriesRef.current.map((entry) => (
                <article
                  key={entry.index}
                  ref={(el) => setChapterRef(entry.index, el)}
                  data-spine-index={entry.index}
                  data-href={entry.href}
                  className="epub-chapter-content mx-auto"
                  style={{
                    maxWidth: '800px',
                    padding: '20px',
                    minHeight: chapterHeightsRef.current.get(entry.index) ?? '200px',
                    borderBottom: '1px solid var(--vscode-panel-border)',
                  }}
                />
              ))}
            </div>
          )}

          {/* Rendition modes: epubjs viewer container */}
          {viewMode !== 'waterfall' && (
            <div
              ref={viewerRef}
              className={`flex-1 ${viewMode === 'scrolled' ? 'overflow-y-auto' : 'overflow-hidden'}`}
              style={{ display: loading ? 'none' : undefined }}
            />
          )}
        </div>

        {/* FAB: appears on text selection */}
        <DocumentSelectionFab
          selection={activeSelection}
          onSendToAi={activeSendToAi}
          label={t('preview.document.sendToAi')}
        />
      </div>
    </DocumentContextMenu>
  );
};
