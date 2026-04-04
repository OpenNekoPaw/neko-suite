/**
 * CBZ Viewer — renders comic book ZIP archives as image gallery.
 * Supports region selection for AI Vision analysis.
 *
 * Lazy loading strategy: only the current page ±2 pages are decompressed and
 * held as Blob URLs.  All other pages are kept as cheap zip entry references.
 * This keeps memory usage constant regardless of total page count.
 */

import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import { type Entry, BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js';
import { useExtensionMessage, postMessage } from '../shared/useVscodeMessage';
import { useDocumentSelection } from '../shared/useDocumentSelection';
import { DocumentSelectionFab } from '../shared/DocumentSelectionFab';
import { useTranslation } from '../i18n/I18nContext';

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
// Pages to keep decoded on each side of the current page (current ±PREFETCH)
const PREFETCH = 2;

function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export const CbzViewer: FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Lightweight zip entry references — no image data yet
  const [imageEntries, setImageEntries] = useState<Entry[]>([]);
  // Sparse cache of decoded pages: index → Blob URL
  const [pageCache, setPageCache] = useState<Map<number, string>>(new Map());
  const [currentPage, setCurrentPage] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Track which pages are currently being decoded to avoid duplicate work
  const decodingRef = useRef<Set<number>>(new Set());

  const { selection, sendToAi, sendImageToAi } = useDocumentSelection({
    pageNumber: currentPage + 1,
    enabled: false, // CBZ uses region selection, not text
  });

  // Region selection state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);

  useExtensionMessage((msg) => {
    if (msg.type === 'document:data') {
      loadCbz(msg.payload.data);
    }
  });

  useEffect(() => {
    postMessage({ type: 'ready' } as never);
  }, []);

  const loadCbz = useCallback(async (base64Data: string) => {
    try {
      setLoading(true);
      setError(null);

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: 'application/zip' });
      const reader = new ZipReader(new BlobReader(blob));
      // getEntries() only reads the central directory — O(entries), no image data
      const entries = await reader.getEntries();
      await reader.close();

      const filtered = entries
        .filter((e) => !e.directory && IMAGE_EXTENSIONS.test(e.filename))
        .sort((a, b) => naturalSort(a.filename, b.filename));

      setImageEntries(filtered);
      setPageCache(new Map());
      setCurrentPage(0);
      decodingRef.current.clear();
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  // Decode a single page into a Blob URL
  const decodePage = useCallback(async (index: number, entries: Entry[]) => {
    if (decodingRef.current.has(index)) return;
    const entry = entries[index];
    if (!entry || !('getData' in entry)) return;

    decodingRef.current.add(index);
    try {
      const imgBlob = await entry.getData(new BlobWriter());
      const url = URL.createObjectURL(imgBlob);
      setPageCache((prev) => new Map(prev).set(index, url));
    } finally {
      decodingRef.current.delete(index);
    }
  }, []);

  // Sliding-window effect: keep current ±PREFETCH pages decoded, revoke the rest
  useEffect(() => {
    if (imageEntries.length === 0) return;

    const keep = new Set<number>();
    for (let i = currentPage - PREFETCH; i <= currentPage + PREFETCH; i++) {
      if (i >= 0 && i < imageEntries.length) keep.add(i);
    }

    // Start decoding pages not yet in cache
    for (const i of keep) {
      if (!pageCache.has(i)) {
        void decodePage(i, imageEntries);
      }
    }

    // Revoke Blob URLs outside the window to free memory
    setPageCache((prev) => {
      const next = new Map(prev);
      for (const [idx, url] of prev) {
        if (!keep.has(idx)) {
          URL.revokeObjectURL(url);
          next.delete(idx);
        }
      }
      return next;
    });
  }, [currentPage, imageEntries, decodePage]); // pageCache intentionally omitted

  // Revoke all Blob URLs on unmount
  useEffect(() => {
    return () => {
      pageCache.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = imageEntries.length;

  const goToPage = useCallback(
    (page: number) => {
      if (page >= 0 && page < totalPages) {
        setCurrentPage(page);
        setSelectionRect(null);
      }
    },
    [totalPages],
  );

  // Handle region selection for AI
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    setIsSelecting(true);
    setSelectionRect({
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      endX: e.clientX - rect.left,
      endY: e.clientY - rect.top,
    });
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isSelecting || !selectionRect || !imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      setSelectionRect((prev) =>
        prev ? { ...prev, endX: e.clientX - rect.left, endY: e.clientY - rect.top } : null,
      );
    },
    [isSelecting, selectionRect],
  );

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  const captureRegion = useCallback(() => {
    if (!selectionRect || !imgRef.current) return;
    const img = imgRef.current;
    const canvas = document.createElement('canvas');

    const x = Math.min(selectionRect.startX, selectionRect.endX);
    const y = Math.min(selectionRect.startY, selectionRect.endY);
    const w = Math.abs(selectionRect.endX - selectionRect.startX);
    const h = Math.abs(selectionRect.endY - selectionRect.startY);

    if (w < 10 || h < 10) {
      setSelectionRect(null);
      return;
    }

    // Scale to actual image dimensions
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    canvas.width = w * scaleX;
    canvas.height = h * scaleY;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(
      img,
      x * scaleX,
      y * scaleY,
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    sendImageToAi(dataUrl, currentPage + 1);
    setSelectionRect(null);
  }, [selectionRect, currentPage, sendImageToAi]);

  const sendFullPage = useCallback(() => {
    if (!imgRef.current) return;
    const canvas = document.createElement('canvas');
    const img = imgRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    sendImageToAi(dataUrl, currentPage + 1);
  }, [currentPage, sendImageToAi]);

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
        {t('preview.cbz.loading')}
      </div>
    );
  }

  const currentUrl = pageCache.get(currentPage);
  const selRectStyle = selectionRect
    ? {
        left: Math.min(selectionRect.startX, selectionRect.endX),
        top: Math.min(selectionRect.startY, selectionRect.endY),
        width: Math.abs(selectionRect.endX - selectionRect.startX),
        height: Math.abs(selectionRect.endY - selectionRect.startY),
      }
    : null;

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
          disabled={currentPage <= 0}
          className="px-2 py-0.5 disabled:opacity-30"
        >
          &lt;
        </button>
        <span>
          {t('preview.document.pageOf', {
            current: String(currentPage + 1),
            total: String(totalPages),
          })}
        </span>
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
          className="px-2 py-0.5 disabled:opacity-30"
        >
          &gt;
        </button>
        <span className="mx-2">|</span>
        <button
          onClick={sendFullPage}
          className="rounded px-2 py-0.5"
          style={{
            background: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
          }}
          title={t('preview.document.sendPageToAi')}
        >
          {t('preview.document.sendPageToAi')}
        </button>
      </div>

      {/* Comic page */}
      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        <div
          className="relative select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ cursor: 'crosshair' }}
        >
          {currentUrl ? (
            <img
              ref={imgRef}
              src={currentUrl}
              alt={`Page ${currentPage + 1}`}
              className="max-h-full max-w-full object-contain"
              draggable={false}
            />
          ) : (
            <div
              className="flex h-48 w-48 items-center justify-center text-sm"
              style={{ color: 'var(--vscode-descriptionForeground)' }}
            >
              {t('preview.cbz.loading')}
            </div>
          )}
          {/* Selection overlay */}
          {selRectStyle && (
            <div
              className="pointer-events-none absolute border-2 border-dashed"
              style={{
                ...selRectStyle,
                borderColor: 'var(--vscode-focusBorder)',
                backgroundColor: 'rgba(0, 120, 215, 0.15)',
              }}
            />
          )}
        </div>
      </div>

      {/* Region capture FAB */}
      {selectionRect &&
        !isSelecting &&
        Math.abs(selectionRect.endX - selectionRect.startX) > 10 && (
          <button
            onClick={captureRegion}
            className="fixed bottom-4 right-4 z-50 rounded-lg px-4 py-2 text-sm font-medium shadow-lg"
            style={{
              backgroundColor: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
            }}
          >
            {t('preview.document.sendToAi')}
          </button>
        )}

      {/* Text selection FAB (future: OCR on CBZ) */}
      <DocumentSelectionFab
        selection={selection}
        onSendToAi={sendToAi}
        label={t('preview.document.sendToAi')}
      />
      {/* Hidden canvas for region capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
