/**
 * EPUB Viewer — renders EPUB using epub.js with chapter navigation and text selection.
 */

import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import ePub, { type Book, type Rendition } from 'epubjs';
import { useExtensionMessage, postMessage } from '../shared/useVscodeMessage';
import { useDocumentSelection } from '../shared/useDocumentSelection';
import { DocumentSelectionFab } from '../shared/DocumentSelectionFab';
import { useTranslation } from '../i18n/I18nContext';

interface TocItem {
  label: string;
  href: string;
}

export const EpubViewer: FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [currentChapter, setCurrentChapter] = useState('');
  const [showToc, setShowToc] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const { selection, sendToAi } = useDocumentSelection({ chapterTitle: currentChapter });

  useExtensionMessage((msg) => {
    if (msg.type === 'document:data') {
      loadEpub(msg.payload.data);
    }
  });

  useEffect(() => {
    postMessage({ type: 'ready' } as never);
    return () => {
      renditionRef.current?.destroy();
      bookRef.current?.destroy();
    };
  }, []);

  const loadEpub = useCallback(async (base64Data: string) => {
    try {
      setLoading(true);
      setError(null);

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const book = ePub(bytes.buffer);
      bookRef.current = book;

      // Wait for book to load
      await book.ready;

      // Extract TOC
      const nav = await book.loaded.navigation;
      const tocItems: TocItem[] = nav.toc.map((item) => ({
        label: item.label.trim(),
        href: item.href,
      }));
      setToc(tocItems);

      // Render
      if (viewerRef.current) {
        const rendition = book.renderTo(viewerRef.current, {
          width: '100%',
          height: '100%',
          spread: 'none',
        });
        renditionRef.current = rendition;

        // Apply VSCode-aware theme
        rendition.themes.register('vscode', {
          body: {
            background: 'var(--vscode-editor-background) !important',
            color: 'var(--vscode-editor-foreground) !important',
            'font-family': 'var(--vscode-font-family) !important',
            'line-height': '1.6',
            padding: '20px !important',
          },
          'a, a:visited': {
            color: 'var(--vscode-textLink-foreground) !important',
          },
        });
        rendition.themes.select('vscode');

        // Track current chapter
        rendition.on('relocated', (location: { start: { href: string } }) => {
          const chapter = tocItems.find((item) => location.start.href.includes(item.href));
          if (chapter) setCurrentChapter(chapter.label);
        });

        await rendition.display();
      }

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  const goToPrev = useCallback(() => {
    renditionRef.current?.prev();
  }, []);

  const goToNext = useCallback(() => {
    renditionRef.current?.next();
  }, []);

  const goToChapter = useCallback((href: string) => {
    renditionRef.current?.display(href);
    setShowToc(false);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrev();
      else if (e.key === 'ArrowRight') goToNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext]);

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
        {t('preview.epub.loading')}
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
          onClick={() => setShowToc(!showToc)}
          className="rounded px-2 py-0.5"
          style={{
            background: showToc
              ? 'var(--vscode-button-background)'
              : 'var(--vscode-button-secondaryBackground)',
            color: showToc
              ? 'var(--vscode-button-foreground)'
              : 'var(--vscode-button-secondaryForeground)',
          }}
        >
          {t('preview.epub.toc')}
        </button>
        <span className="mx-2">|</span>
        <button onClick={goToPrev} className="px-2 py-0.5">
          &lt;
        </button>
        {currentChapter && <span className="truncate max-w-xs">{currentChapter}</span>}
        <button onClick={goToNext} className="px-2 py-0.5">
          &gt;
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* TOC sidebar */}
        {showToc && (
          <div
            className="w-64 shrink-0 overflow-auto border-r p-2 text-xs"
            style={{
              borderColor: 'var(--vscode-panel-border)',
              background: 'var(--vscode-sideBar-background)',
              color: 'var(--vscode-foreground)',
            }}
          >
            <ul className="space-y-1">
              {toc.map((item, i) => (
                <li key={i}>
                  <button
                    onClick={() => goToChapter(item.href)}
                    className="w-full truncate rounded px-2 py-1 text-left hover:opacity-80"
                    style={{
                      background:
                        currentChapter === item.label
                          ? 'var(--vscode-list-activeSelectionBackground)'
                          : 'transparent',
                      color:
                        currentChapter === item.label
                          ? 'var(--vscode-list-activeSelectionForeground)'
                          : 'inherit',
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* EPUB content */}
        <div ref={viewerRef} className="flex-1 overflow-auto" />
      </div>

      <DocumentSelectionFab
        selection={selection}
        onSendToAi={sendToAi}
        label={t('preview.document.sendToAi')}
      />
    </div>
  );
};
