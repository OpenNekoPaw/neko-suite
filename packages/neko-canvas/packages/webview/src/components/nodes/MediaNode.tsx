/**
 * MediaNode - Media asset node component
 *
 * Displays video, image, or audio assets on the canvas.
 * Video/Audio: click to open in neko-preview (hardware-accelerated customEditor).
 * Image: inline viewer with zoom (unchanged).
 */

import { useState, useCallback } from 'react';
import type { MediaCanvasNode, CanvasViewport } from '@neko/shared';
import { BaseNode } from './BaseNode';
import { ImageViewer } from '../media/ImageViewer';
import { t } from '../../i18n';

// Get vscode API for postMessage
const vscode = (window as { vscode?: { postMessage: (msg: unknown) => void } }).vscode;

// =============================================================================
// Types
// =============================================================================

export interface MediaNodeProps {
  node: MediaCanvasNode;
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void;
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void;
  /** 媒体文件的基础 URL（用于构建完整路径） */
  mediaBaseUrl?: string;
}

type ViewMode = 'thumbnail' | 'player';

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

function getMediaUrl(assetPath: string, baseUrl?: string): string {
  if (assetPath.startsWith('http://') || assetPath.startsWith('https://') || assetPath.startsWith('blob:')) {
    return assetPath;
  }
  if (baseUrl) {
    return `${baseUrl}/${assetPath}`;
  }
  // VSCode webview 需要特殊处理
  return assetPath;
}

// =============================================================================
// Component
// =============================================================================

export function MediaNode({
  node,
  viewport,
  isSelected,
  onSelect,
  onDrag,
  onMove,
  onConnectionStart,
  mediaBaseUrl,
}: MediaNodeProps) {
  const { assetPath, thumbnailPath, mediaType, duration } = node.data;
  const fileName = getFileName(assetPath);
  // Image still uses thumbnail/player toggle; video/audio always open in neko-preview
  const [viewMode, setViewMode] = useState<ViewMode>('thumbnail');

  const mediaUrl = getMediaUrl(assetPath, mediaBaseUrl);
  const posterUrl = thumbnailPath ? getMediaUrl(thumbnailPath, mediaBaseUrl) : undefined;

  // Open video/audio in neko-preview via postMessage
  const openInPreview = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Send assetPath to extension for opening with neko-preview
    vscode?.postMessage({
      type: 'openMediaPreview',
      assetPath: assetPath,
      mediaType: mediaType,
    });
  }, [assetPath, mediaType]);

  // Image: switch to inline viewer
  const switchToImageViewer = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (mediaType === 'image') {
      setViewMode('player');
    }
  }, [mediaType]);

  // Image: switch back to thumbnail
  const switchToThumbnail = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setViewMode('thumbnail');
  }, []);

  // 渲染媒体内容
  const renderMediaContent = () => {
    // Image player mode (inline viewer — kept as-is)
    if (viewMode === 'player' && mediaType === 'image') {
      return (
        <div className="flex-1 relative group">
          <ImageViewer
            src={mediaUrl}
            alt={fileName}
            className="w-full h-full"
            objectFit="contain"
            enableZoom={true}
          />
          {/* 返回缩略图按钮 */}
          <button
            className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 rounded text-xs text-white z-10 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={switchToThumbnail}
            title={t('node.backToThumbnail')}
          >
            ✕
          </button>
        </div>
      );
    }

    // 缩略图模式 (default for all types)
    const handleClick = (mediaType === 'video' || mediaType === 'audio')
      ? openInPreview       // video/audio → open in neko-preview
      : switchToImageViewer; // image → inline viewer

    return (
      <div
        className="flex-1 relative bg-black/30 overflow-hidden cursor-pointer group"
        onClick={handleClick}
      >
        {thumbnailPath || mediaType === 'image' ? (
          <img
            src={mediaType === 'image' ? mediaUrl : (posterUrl || mediaUrl)}
            alt={fileName}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">
            {getMediaIcon(mediaType)}
          </div>
        )}

        {/* Video/Audio: play overlay → opens in neko-preview */}
        {(mediaType === 'video' || mediaType === 'audio') && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <span className="text-2xl ml-1">▶</span>
            </div>
          </div>
        )}

        {/* Video/Audio: "Open in Preview" hint */}
        {(mediaType === 'video' || mediaType === 'audio') && (
          <div className="absolute bottom-6 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="px-2 py-1 bg-black/60 rounded text-xs text-white">
              Open in Neko Preview
            </div>
          </div>
        )}

        {/* Image: zoom hint */}
        {mediaType === 'image' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="px-2 py-1 bg-black/60 rounded text-xs text-white">
              {t('node.clickToView')}
            </div>
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
    );
  };

  return (
    <BaseNode
      node={node}
      viewport={viewport}
      isSelected={isSelected}
      onSelect={onSelect}
      onDrag={onDrag}
      onMove={onMove}
      onConnectionStart={onConnectionStart}
    >
      <div className="flex flex-col h-full">
        {/* Media content area */}
        {renderMediaContent()}

        {/* Info area */}
        <div className="p-2 border-t border-[var(--node-border)]">
          <div className="flex items-center gap-1">
            <div className="text-sm truncate flex-1" style={{ color: 'var(--toolbar-fg)' }} title={fileName}>
              {fileName || 'Untitled'}
            </div>
            {/* Open in Preview button for video/audio */}
            {(mediaType === 'video' || mediaType === 'audio') && (
              <button
                className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors shrink-0"
                onClick={openInPreview}
                title="Open in Neko Preview"
              >
                <svg className="w-3.5 h-3.5" style={{ color: 'var(--toolbar-fg-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            )}
          </div>
          <div className="text-xs truncate" style={{ color: 'var(--toolbar-fg-secondary)' }}>
            {getMediaIcon(mediaType)} {mediaType || 'media'}
            {duration ? ` · ${formatDuration(duration)}` : ''}
          </div>
        </div>
      </div>
    </BaseNode>
  );
}
