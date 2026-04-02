/**
 * CBZ Viewer — renders comic book ZIP archives as image gallery.
 * Supports region selection for AI Vision analysis.
 */

import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js';
import { useExtensionMessage, postMessage } from '../shared/useVscodeMessage';
import { useDocumentSelection } from '../shared/useDocumentSelection';
import { DocumentSelectionFab } from '../shared/DocumentSelectionFab';
import { useTranslation } from '../i18n/I18nContext';

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;

function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export const CbzViewer: FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<string[]>([]); // Blob URLs
  const [currentPage, setCurrentPage] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

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
      const entries = await reader.getEntries();

      // Filter image entries and sort naturally
      const imageEntries = entries
        .filter((e) => !e.directory && IMAGE_EXTENSIONS.test(e.filename))
        .sort((a, b) => naturalSort(a.filename, b.filename));

      // Extract all images as Blob URLs
      const urls: string[] = [];
      for (const entry of imageEntries) {
        if ('getData' in entry) {
          const blobWriter = new BlobWriter();
          const imgBlob = await entry.getData(blobWriter);
          urls.push(URL.createObjectURL(imgBlob));
        }
      }

      await reader.close();
      setPages(urls);
      setCurrentPage(0);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      pages.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pages]);

  const goToPage = useCallback(
    (page: number) => {
      if (page >= 0 && page < pages.length) {
        setCurrentPage(page);
        setSelectionRect(null);
      }
    },
    [pages.length],
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
            total: String(pages.length),
          })}
        </span>
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= pages.length - 1}
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
          {pages[currentPage] && (
            <img
              ref={imgRef}
              src={pages[currentPage]}
              alt={`Page ${currentPage + 1}`}
              className="max-h-full max-w-full object-contain"
              draggable={false}
            />
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
    </div>
  );
};
