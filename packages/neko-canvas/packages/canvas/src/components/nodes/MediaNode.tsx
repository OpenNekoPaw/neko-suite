/**
 * MediaNode - Media asset node component
 * Displays video, image, or audio assets with thumbnail preview
 */

import type { MediaCanvasNode, CanvasViewport } from '@neko/shared';
import { BaseNode } from './BaseNode';

// =============================================================================
// Types
// =============================================================================

export interface MediaNodeProps {
  node: MediaCanvasNode;
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onConnectionStart?: (nodeId: string, anchor: string) => void;
}

// =============================================================================
// Helpers
// =============================================================================

function getMediaIcon(mediaType?: string): string {
  switch (mediaType) {
    case 'video':
      return '🎬';
    case 'image':
      return '🖼️';
    case 'audio':
      return '🎵';
    default:
      return '📁';
  }
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function getFileName(path: string): string {
  return path.split('/').pop() || 'Unknown';
}

// =============================================================================
// Component
// =============================================================================

export function MediaNode({
  node,
  viewport,
  isSelected,
  onSelect,
  onMove,
  onConnectionStart,
}: MediaNodeProps) {
  const { assetPath, thumbnailPath, mediaType, duration } = node.data;
  const fileName = getFileName(assetPath);

  return (
    <BaseNode
      node={node}
      viewport={viewport}
      isSelected={isSelected}
      onSelect={onSelect}
      onMove={onMove}
      onConnectionStart={onConnectionStart}
    >
      <div className="flex flex-col h-full">
        {/* Thumbnail area */}
        <div className="flex-1 relative bg-black/30 overflow-hidden">
          {thumbnailPath ? (
            <img
              src={thumbnailPath}
              alt={fileName}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl">
              {getMediaIcon(mediaType)}
            </div>
          )}

          {/* Duration badge */}
          {duration && (
            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-xs text-white">
              {formatDuration(duration)}
            </div>
          )}

          {/* Media type badge */}
          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/70 rounded text-xs text-white uppercase">
            {mediaType || 'media'}
          </div>
        </div>

        {/* Info area */}
        <div className="p-2 border-t border-[var(--node-border)]">
          <div className="text-sm text-gray-200 truncate" title={fileName}>
            {fileName}
          </div>
          <div className="text-xs text-gray-500 truncate" title={assetPath}>
            {assetPath}
          </div>
        </div>
      </div>
    </BaseNode>
  );
}
