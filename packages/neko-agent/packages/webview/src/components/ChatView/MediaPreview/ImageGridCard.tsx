/**
 * ImageGridCard - Responsive grid for multiple generated images (ADR-3)
 *
 * Replaces single ImagePreview when a task produces multiple outputs.
 * Displays 2-3 column grid with click-to-open and selection highlighting.
 */

import { useState, useCallback, memo } from 'react';

const vscode = (window as { vscode?: { postMessage: (msg: unknown) => void } }).vscode;

interface ImageGridCardProps {
  /** Webview-safe image URIs */
  urls: string[];
  /** Original local file paths (parallel array) */
  localPaths?: string[];
  /** Task or batch name shown in header */
  name?: string;
  className?: string;
}

function ImageGridCardComponent({ urls, localPaths, name, className }: ImageGridCardProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleOpen = useCallback(
    (index: number) => {
      const localPath = localPaths?.[index];
      const src = localPath ?? urls[index];
      if (!src) return;

      if (src.startsWith('/') || /^[A-Za-z]:[\\/]/.test(src)) {
        vscode?.postMessage({ type: 'openFile', filePath: src });
      } else {
        vscode?.postMessage({ type: 'openUrl', url: src });
      }
    },
    [localPaths, urls],
  );

  /** Notify Extension Host that a drag operation started (ADR-5 P1 DnD). */
  const handleDragStart = useCallback(
    (index: number) => {
      const localPath = localPaths?.[index];
      if (!localPath) return;
      const fileName = localPath.split(/[\\/]/).pop() ?? 'image';
      vscode?.postMessage({
        type: 'dnd:start',
        asset: { path: localPath, mediaType: 'image' as const, name: fileName },
      });
    },
    [localPaths],
  );

  if (urls.length === 0) return null;

  // Single image — delegate to simple view
  if (urls.length === 1) {
    const src = urls[0];
    if (!src) return null;
    return (
      <div className={`rounded overflow-hidden ${className ?? ''}`}>
        <img
          src={src}
          alt={name ?? 'Generated image'}
          className="w-full max-h-[200px] object-contain cursor-pointer hover:opacity-90 transition-opacity"
          draggable={!!localPaths?.[0]}
          onDragStart={() => handleDragStart(0)}
          onClick={() => handleOpen(0)}
          loading="lazy"
        />
      </div>
    );
  }

  // Determine grid columns: 2 for 2-3 images, 3 for 4+
  const cols = urls.length <= 3 ? 2 : 3;

  return (
    <div className={className ?? ''}>
      {/* Grid */}
      <div
        className="grid gap-1 rounded overflow-hidden"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {urls.map((url, index) => {
          if (!url) return null;
          const isSelected = selectedIndex === index;
          return (
            <div
              key={`img-${index}`}
              className={`relative cursor-pointer group overflow-hidden rounded
                ${isSelected ? 'ring-2 ring-[var(--vscode-focusBorder)]' : ''}
              `}
              draggable={!!localPaths?.[index]}
              onDragStart={() => handleDragStart(index)}
              onClick={() => {
                setSelectedIndex(index);
                handleOpen(index);
              }}
            >
              <img
                src={url}
                alt={`Result ${index + 1}`}
                className="w-full aspect-square object-cover group-hover:opacity-90 transition-opacity"
                loading="lazy"
              />
              {/* Index badge */}
              <div className="absolute top-1 left-1 px-1 py-0.5 bg-black/60 rounded text-[9px] text-white/80 tabular-nums">
                {index + 1}
              </div>
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
            </div>
          );
        })}
      </div>

      {/* Count label */}
      <div className="text-[10px] text-[var(--vscode-descriptionForeground)] mt-1">
        {urls.length} images generated
      </div>
    </div>
  );
}

export const ImageGridCard = memo(ImageGridCardComponent);
