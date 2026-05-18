import { memo, useCallback } from 'react';
import { VSCodeMessages } from '@/components/hooks/useVSCode';
import type { DocumentImageThumbnailProjection } from '@/presenters/tool-call-presenter';

interface DocumentImageThumbnailsProps {
  thumbnails: readonly DocumentImageThumbnailProjection[];
}

function DocumentImageThumbnailsComponent({ thumbnails }: DocumentImageThumbnailsProps) {
  const handleOpen = useCallback((thumbnail: DocumentImageThumbnailProjection) => {
    if (!thumbnail.locator) return;
    VSCodeMessages.revealDocumentLocator({
      filePath: thumbnail.filePath,
      locator: thumbnail.locator,
      ...(thumbnail.source ? { source: thumbnail.source } : {}),
    });
  }, []);

  if (thumbnails.length === 0) return null;

  return (
    <div className="mt-2 overflow-x-auto">
      <div className="flex gap-2 pb-1">
        {thumbnails.map((thumbnail) => {
          const dimensions = formatDimensions(thumbnail.width, thumbnail.height);
          const byteSize = formatByteSize(thumbnail.byteSize);
          const title = [thumbnail.label, dimensions, byteSize].filter(Boolean).join(' · ');
          return (
            <button
              key={thumbnail.id}
              type="button"
              disabled={!thumbnail.locator}
              onClick={() => handleOpen(thumbnail)}
              className="group w-20 shrink-0 overflow-hidden rounded border border-[var(--agent-input-border)] bg-[var(--agent-elevated)] text-left transition-colors hover:border-[var(--agent-accent)] disabled:cursor-default disabled:hover:border-[var(--agent-input-border)]"
              title={title || thumbnail.path}
            >
              <div className="relative h-28 w-full bg-[var(--agent-bg)]">
                <img
                  src={thumbnail.src}
                  alt={thumbnail.label}
                  loading="lazy"
                  draggable={false}
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-1 top-1 rounded bg-black/65 px-1 py-0.5 text-[9px] font-medium leading-none text-white">
                  {thumbnail.label}
                </span>
              </div>
              {(dimensions || byteSize) && (
                <div className="space-y-0.5 px-1.5 py-1 text-[9px] leading-tight text-[var(--agent-fg-secondary)]">
                  {dimensions && <div className="truncate">{dimensions}</div>}
                  {byteSize && <div className="truncate">{byteSize}</div>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatDimensions(width: number | undefined, height: number | undefined): string {
  return width !== undefined && height !== undefined ? `${width} x ${height}` : '';
}

function formatByteSize(byteSize: number | undefined): string {
  if (byteSize === undefined) return '';
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${Math.round(byteSize / 1024)} KB`;
  return `${(byteSize / 1024 / 1024).toFixed(1)} MB`;
}

export const DocumentImageThumbnails = memo(DocumentImageThumbnailsComponent);
