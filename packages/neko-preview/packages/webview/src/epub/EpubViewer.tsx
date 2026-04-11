/**
 * EPUB Viewer — renders EPUB using epub.js with chapter navigation and text selection.
 *
 * Two view modes:
 * - Waterfall: true continuous scroll across all chapters (custom DOM, bypasses rendition)
 * - Paginated: traditional page-by-page (epubjs rendition)
 *
 * Features:
 * - Right-click context menu → send selection / page to AI
 * - Chapter navigation via toolbar and epub:navigate message from extension
 * - TOC via VSCode Outline (DocumentSymbolProvider in extension host)
 */

import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import ePub, { type Book, type Rendition } from 'epubjs';
import { useExtensionMessage, postMessage } from '../shared/useVscodeMessage';
import { useDocumentSelection, type DocumentSelection } from '../shared/useDocumentSelection';
import { DocumentContextMenu, useDocumentContextActions } from '../shared/DocumentContextMenu';
import { imgSrcToBase64 } from '../shared/imageToBase64';
import {
  usePersistedState,
  initPersistedStore,
  notifySubscribers,
} from '../shared/usePersistedState';

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

type ViewMode = 'waterfall' | 'paginated';

function matchesHref(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a);
}

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
  const [currentChapter, setCurrentChapter] = usePersistedState('currentChapter', '');
  const [currentChapterHref, setCurrentChapterHref] = usePersistedState('currentChapterHref', '');
  const [viewMode, setViewMode] = usePersistedState<ViewMode>('viewMode', 'waterfall');
  const [chapterCount, setChapterCount] = useState(0);
  const [, setChapterLayoutVersion] = useState(0);
  const [epubSelection, setEpubSelection] = useState<DocumentSelection | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [iframeMenuPos, setIframeMenuPos] = useState<{ x: number; y: number } | null>(null);
  const clearIframeMenuPos = useCallback(() => setIframeMenuPos(null), []);
  const [rightClickedImageSrc, setRightClickedImageSrc] = useState<string | null>(null);

  const persistedChapterRef = useRef(currentChapter);
  persistedChapterRef.current = currentChapter;
  const persistedChapterHrefRef = useRef(currentChapterHref);
  persistedChapterHrefRef.current = currentChapterHref;

  // Rendition mode refs (paginated)
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const tocRef = useRef<TocItem[]>([]);
  const loadingRef = useRef(false);

  // Waterfall mode refs
  const waterfallContainerRef = useRef<HTMLDivElement>(null);
  const measureContainerRef = useRef<HTMLDivElement>(null);
  const spineEntriesRef = useRef<SpineEntry[]>([]);
  const chapterRefsMap = useRef<Map<number, HTMLElement>>(new Map());
  const loadedChaptersRef = useRef<Set<number>>(new Set());
  const loadingChaptersRef = useRef<Set<number>>(new Set());
  const waterfallObserverRef = useRef<IntersectionObserver | null>(null);
  const [waterfallReady, setWaterfallReady] = useState(false);
  const chapterHeightsRef = useRef<Map<number, number>>(new Map());
  const measuringChaptersRef = useRef<Map<number, Promise<number>>>(new Map());
  const measurementQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Waterfall text selection via native document selection
  const { selection: waterfallSelection } = useDocumentSelection({
    chapterTitle: currentChapter,
  });

  const applyCurrentChapter = useCallback(
    (chapter: TocItem | null | undefined) => {
      if (!chapter) return;
      if (chapter.label !== persistedChapterRef.current) {
        setCurrentChapter(chapter.label);
      }
      if (chapter.href !== persistedChapterHrefRef.current) {
        setCurrentChapterHref(chapter.href);
      }
    },
    [setCurrentChapter, setCurrentChapterHref],
  );

  // =========================================================================
  // Extension ↔ Webview messaging
  // =========================================================================

  useExtensionMessage((msg) => {
    const m = msg as unknown as { type: string; payload: Record<string, unknown> };
    if (m.type === 'document:restoreState') {
      initPersistedStore(m.payload as Record<string, unknown>);
      notifySubscribers();
    } else if (msg.type === 'document:data') {
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
  // Rendition helpers (paginated mode)
  // =========================================================================

  const getContents = (): EpubContents | null => {
    const rendition = renditionRef.current;
    if (!rendition) return null;
    const list = (rendition as unknown as { getContents: () => EpubContents[] }).getContents?.();
    return list?.[0] ?? null;
  };

  const setupRendition = useCallback(
    (rendition: Rendition, tocItems: TocItem[]) => {
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
        const chapter = tocItems.find((item) => matchesHref(location.start.href, item.href));
        applyCurrentChapter(chapter);
        setEpubSelection(null);
      });

      rendition.on('selected', async (_cfi: string, contents: EpubContents) => {
        const sel = contents.window.getSelection();
        const raw = sel?.toString().trim() ?? '';
        if (!raw) {
          setEpubSelection(null);
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
      });

      rendition.on('click', () => {
        setEpubSelection(null);
      });

      // Forward contextmenu from iframe to parent menu
      rendition.hooks.content.register((contents: EpubContents) => {
        contents.document.addEventListener('contextmenu', (e: MouseEvent) => {
          e.preventDefault();
          // Detect right-click on image
          const target = e.target as HTMLElement;
          const imgEl = target.tagName === 'IMG' ? (target as HTMLImageElement) : null;
          setRightClickedImageSrc(imgEl?.src ?? null);

          const iframeEl = viewerRef.current?.querySelector('iframe');
          const iframeRect = iframeEl?.getBoundingClientRect();
          if (iframeRect) {
            const x = Math.min(iframeRect.left + e.clientX, window.innerWidth - 180);
            const y = Math.min(iframeRect.top + e.clientY, window.innerHeight - 120);
            setIframeMenuPos({ x, y });
          }
        });
      });
    },
    [applyCurrentChapter],
  );

  // =========================================================================
  // Book loading / re-rendering
  // =========================================================================

  const renderBook = useCallback(
    async (book: Book, tocItems: TocItem[], cfi?: string) => {
      if (!viewerRef.current) return;
      renditionRef.current?.destroy();
      const rendition = book.renderTo(viewerRef.current, {
        width: '100%',
        height: '100%',
        spread: 'none',
        flow: 'paginated',
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
    setChapterCount(entries.length || tocItems.length);

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
        await renderBook(book, tocItems);
      }
    },
    [viewMode, extractBookMetadata, renderBook],
  );

  // =========================================================================
  // Book loaders
  // =========================================================================

  /** Navigate to persisted chapter after load */
  const restoreChapter = useCallback(() => {
    const savedHref = persistedChapterHrefRef.current;
    const fallbackLabel = persistedChapterRef.current;
    const toc = savedHref
      ? tocRef.current.find((item) => matchesHref(item.href, savedHref))
      : fallbackLabel
        ? tocRef.current.find((item) => item.label === fallbackLabel)
        : null;
    if (!toc) return;
    // Delay to let waterfall observer or rendition settle
    requestAnimationFrame(() => {
      // Waterfall: scroll to chapter element directly
      const entry = spineEntriesRef.current.find((e) => matchesHref(e.href, toc.href));
      if (entry) {
        const el = chapterRefsMap.current.get(entry.index);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        renditionRef.current?.display(toc.href);
      }
    });
  }, []);

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
        // Restore persisted chapter position
        restoreChapter();
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
        restoreChapter();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [initBook],
  );

  useEffect(() => {
    if (loading || chapterCount === 0) return;

    const currentChapterIndex = currentChapterHref
      ? tocRef.current.findIndex((item) => matchesHref(item.href, currentChapterHref)) + 1
      : undefined;

    postMessage({
      type: 'document:statusUpdate',
      payload: {
        pageCount: chapterCount,
        currentPage:
          currentChapterIndex && currentChapterIndex > 0 ? currentChapterIndex : undefined,
        chapterHref: currentChapterHref || undefined,
        chapterTitle: currentChapter || undefined,
      },
    });
  }, [loading, chapterCount, currentChapterHref, currentChapter]);

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
        const toc = tocRef.current.find((item) => matchesHref(entry.href, item.href));
        applyCurrentChapter(toc);
        return;
      }
    }
  }, [applyCurrentChapter]);

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
  }, [
    viewMode,
    waterfallReady,
    loadChapterContent,
    unloadChapterContent,
    updateCurrentChapterFromScroll,
  ]);

  /** Navigate waterfall to a specific href */
  const navigateWaterfallToHref = useCallback((href: string) => {
    const entry = spineEntriesRef.current.find((e) => matchesHref(e.href, href));
    if (entry) {
      const el = chapterRefsMap.current.get(entry.index);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  useEffect(() => {
    if (viewMode !== 'waterfall' || !waterfallReady) return;

    const container = waterfallContainerRef.current;
    if (!container) return;

    let rafId = 0;
    const handleScroll = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        updateCurrentChapterFromScroll();
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [viewMode, waterfallReady, updateCurrentChapterFromScroll]);

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
  // Mode switching
  // =========================================================================

  const cycleViewMode = useCallback(async () => {
    const book = bookRef.current;
    if (!book) return;

    const modes: ViewMode[] = ['waterfall', 'paginated'];
    const currentIdx = modes.indexOf(viewMode);
    const nextMode = modes[(currentIdx + 1) % modes.length]!;

    // Capture position: CFI from rendition, or chapter href from waterfall
    const location = renditionRef.current?.currentLocation() as
      | { start: { cfi: string } }
      | null
      | undefined;
    const currentCfi = location?.start?.cfi;

    // Current chapter href bridges waterfall and paginated modes.
    const chapterHref =
      currentChapterHref ||
      tocRef.current.find((item) => item.label === currentChapter)?.href ||
      undefined;

    setViewMode(nextMode);
    setWaterfallReady(false);
    loadedChaptersRef.current.clear();
    loadingChaptersRef.current.clear();

    if (nextMode === 'waterfall') {
      renditionRef.current?.destroy();
      renditionRef.current = null;
      setWaterfallReady(true);
      // Scroll waterfall to the chapter we were reading
      if (chapterHref) {
        requestAnimationFrame(() => navigateWaterfallToHref(chapterHref));
      }
    } else {
      // Wait for React to update display so the viewer container is visible
      // and epubjs can measure its dimensions correctly.
      await new Promise((r) => requestAnimationFrame(r));
      // Use CFI if available (rendition→rendition), otherwise use chapter href
      const displayTarget = currentCfi ?? chapterHref;
      await renderBook(book, tocRef.current, displayTarget);
    }
  }, [viewMode, renderBook, currentChapter, currentChapterHref, navigateWaterfallToHref]);

  // =========================================================================
  // Send page to AI
  // =========================================================================

  const sendFileToAgent = useCallback(async () => {
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
                  text: bodyText,
                  contentKind: 'text',
                  context: { chapter: currentChapter || undefined },
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
      const bodyText = contents.document.body?.innerText?.trim().slice(0, MAX_SELECTION_CHARS);
      postMessage({
        type: 'document:sendToAi',
        payload: {
          text: bodyText || undefined,
          contentKind: 'text',
          context: { chapter: currentChapter || undefined },
        },
      } as never);
    } finally {
      setCapturing(false);
    }
  }, [capturing, currentChapter, viewMode]);

  // =========================================================================
  // Send text selection to AI (rendition modes)
  // =========================================================================

  const sendSelectionToAgent = useCallback(() => {
    if (!epubSelection) return;

    postMessage({
      type: 'document:sendToAi',
      payload: {
        text: epubSelection.text,
        contentKind: 'text',
        context: { chapter: currentChapter || undefined },
      },
    } as never);

    setEpubSelection(null);
  }, [epubSelection, currentChapter]);

  const handleContextMenuTarget = useCallback((target: HTMLElement) => {
    const imgEl = target.tagName === 'IMG' ? (target as HTMLImageElement) : null;
    setRightClickedImageSrc(imgEl?.src ?? null);
  }, []);

  // =========================================================================
  // View mode label & icon
  // =========================================================================

  const viewModeIconMap: Record<ViewMode, string> = {
    waterfall: '⇕',
    paginated: '⊡',
  };
  const viewModeIcon = viewModeIconMap[viewMode];

  // Title shows what the NEXT mode will be
  const nextModeMap: Record<ViewMode, string> = {
    waterfall: t('preview.epub.modePaginated'),
    paginated: t('preview.epub.modeWaterfall'),
  };
  const viewModeTitle = nextModeMap[viewMode];

  const isWaterfall = viewMode === 'waterfall';

  // =========================================================================
  // Render
  // =========================================================================

  const hasTextSelection = !!(isWaterfall ? waterfallSelection : epubSelection);
  const sendContentToAgent = useCallback(async () => {
    const text = isWaterfall ? waterfallSelection?.text : epubSelection?.text;
    const hasText = !!text;
    const hasImage = !!rightClickedImageSrc;
    if (!hasText && !hasImage) return;

    let imageData: string | undefined;
    if (hasImage) {
      try {
        imageData = await imgSrcToBase64(rightClickedImageSrc!);
      } catch {
        // Fallback: skip image if conversion fails (CORS etc.)
      }
    }

    const contentKind = hasText && imageData ? 'mixed' : hasText ? 'text' : 'image';
    postMessage({
      type: 'document:sendToAi',
      payload: {
        text: text || undefined,
        imageData,
        contentKind,
        context: { chapter: currentChapter || undefined },
      },
    } as never);

    if (isWaterfall) {
      window.getSelection()?.removeAllRanges();
    }
    setEpubSelection(null);
    setRightClickedImageSrc(null);
  }, [isWaterfall, waterfallSelection, epubSelection, rightClickedImageSrc, currentChapter]);

  const contextActions = useDocumentContextActions({
    hasContent: hasTextSelection || !!rightClickedImageSrc,
    onSendContentToAgent: sendContentToAgent,
    onSendFileToAgent: sendFileToAgent,
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
    <DocumentContextMenu
      actions={contextActions}
      externalMenuPosition={iframeMenuPos}
      onExternalMenuConsumed={clearIframeMenuPos}
      onContextMenuTarget={handleContextMenuTarget}
    >
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
          {/* Waterfall mode: custom DOM container */}
          <div
            ref={waterfallContainerRef}
            className="flex-1 overflow-y-auto"
            style={{ display: viewMode === 'waterfall' && !loading ? 'block' : 'none' }}
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

          {/* Rendition modes: epubjs viewer container */}
          <div
            className="flex-1 flex justify-center overflow-hidden"
            style={{ display: viewMode !== 'waterfall' && !loading ? undefined : 'none' }}
          >
            <div
              ref={viewerRef}
              className="h-full"
              style={{
                width: '100%',
                maxWidth: '800px',
              }}
            />
          </div>
        </div>
      </div>
    </DocumentContextMenu>
  );
};
