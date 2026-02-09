/**
 * MediaNode - Media asset node component
 * Displays video, image, or audio assets with inline playback
 */

import { useState, useCallback } from 'react';
import type { MediaCanvasNode, CanvasViewport } from '@neko/shared';
import { BaseNode } from './BaseNode';
import { VideoPlayer } from '../media/VideoPlayer';
import { AudioPlayer } from '../media/AudioPlayer';
import { ImageViewer } from '../media/ImageViewer';
import { t } from '../../i18n';

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
  onMove,
  onConnectionStart,
  mediaBaseUrl,
}: MediaNodeProps) {
  const { assetPath, thumbnailPath, mediaType, duration } = node.data;
  const fileName = getFileName(assetPath);
  const [viewMode, setViewMode] = useState<ViewMode>('thumbnail');

  const mediaUrl = getMediaUrl(assetPath, mediaBaseUrl);
  const posterUrl = thumbnailPath ? getMediaUrl(thumbnailPath, mediaBaseUrl) : undefined;

  // 切换到播放模式
  const switchToPlayer = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (mediaType === 'video' || mediaType === 'audio' || mediaType === 'image') {
      setViewMode('player');
    }
  }, [mediaType]);

  // 切换回缩略图模式
  const switchToThumbnail = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setViewMode('thumbnail');
  }, []);

  // 渲染媒体内容
  const renderMediaContent = () => {
    // 播放器模式
    if (viewMode === 'player') {
      switch (mediaType) {
        case 'video':
          return (
            <div className="flex-1 relative">
              <VideoPlayer
                src={mediaUrl}
                poster={posterUrl}
                className="w-full h-full"
              />
              {/* 返回缩略图按钮 */}
              <button
                className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 rounded text-xs text-white z-10"
                onClick={switchToThumbnail}
                title={t('node.backToThumbnail')}
              >
                ✕
              </button>
            </div>
          );

        case 'audio':
          return (
            <div className="flex-1 flex flex-col">
              <AudioPlayer
                src={mediaUrl}
                className="flex-1"
                showWaveform={true}
              />
              {/* 返回缩略图按钮 */}
              <button
                className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 rounded text-xs text-white z-10"
                onClick={switchToThumbnail}
                title={t('node.backToThumbnail')}
              >
                ✕
              </button>
            </div>
          );

        case 'image':
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
    }

    // 缩略图模式
    return (
      <div
        className="flex-1 relative bg-black/30 overflow-hidden cursor-pointer group"
        onClick={switchToPlayer}
      >
        {thumbnailPath || mediaType === 'image' ? (
          <img
            src={mediaType === 'image' && viewMode === 'thumbnail' ? mediaUrl : (posterUrl || mediaUrl)}
            alt={fileName}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">
            {getMediaIcon(mediaType)}
          </div>
        )}

        {/* 播放按钮覆盖层 */}
        {(mediaType === 'video' || mediaType === 'audio') && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <span className="text-2xl ml-1">▶</span>
            </div>
          </div>
        )}

        {/* 图片放大提示 */}
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
      onMove={onMove}
      onConnectionStart={onConnectionStart}
    >
      <div className="flex flex-col h-full">
        {/* Media content area */}
        {renderMediaContent()}

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
