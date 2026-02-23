/**
 * MediaNode - Media asset node component
 *
 * Displays video, image, or audio assets on the canvas.
 * Video/Audio: click to play inline via H.264+PCM stream (neko-preview API).
 * Image: inline viewer with zoom.
 * "Open in Preview" button still available for full-featured playback.
 */

import { useState, useCallback, useEffect } from 'react';
import type { MediaCanvasNode, CanvasViewport } from '@neko/shared';
import { BaseNode } from './BaseNode';
import { ImageViewer } from '../media/ImageViewer';
import { InlineMediaPlayer } from '../media/InlineMediaPlayer';
import { useCanvasStore } from '../../stores/canvasStore';
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

type ViewMode = 'thumbnail' | 'image-viewer' | 'probing' | 'playing';

interface StreamInfo {
  videoStreamUrl: string | null;
  audioStreamUrl: string | null;
  mediaInfo: {
    width: number;
    height: number;
    fps: number;
    duration: number;
  };
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

function getMediaUrl(assetPath: string, baseUrl?: string): string {
  if (assetPath.startsWith('http://') || assetPath.startsWith('https://') || assetPath.startsWith('blob:')) {
    return assetPath;
  }
  if (baseUrl) {
    return `${baseUrl}/${assetPath}`;
  }
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
  const [viewMode, setViewMode] = useState<ViewMode>('thumbnail');
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activePlayingNodeId = useCanvasStore((s) => s.activePlayingNodeId);
  const setActivePlayingNode = useCanvasStore((s) => s.setActivePlayingNode);

  const mediaUrl = getMediaUrl(assetPath, mediaBaseUrl);
  const posterUrl = thumbnailPath ? getMediaUrl(thumbnailPath, mediaBaseUrl) : undefined;

  // If another node starts playing, stop this one
  useEffect(() => {
    if (activePlayingNodeId && activePlayingNodeId !== node.id && (viewMode === 'playing' || viewMode === 'probing')) {
      handleStop();
    }
  }, [activePlayingNodeId, node.id, viewMode]);

  // Listen for extension messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.nodeId !== node.id) return;

      if (msg.type === 'media:probeResult') {
        if (msg.error) {
          setError(msg.error);
          setViewMode('thumbnail');
          return;
        }
        // Probe succeeded, request playback
        vscode?.postMessage({
          type: 'media:play',
          nodeId: node.id,
          assetPath,
          mediaInfo: msg.mediaInfo,
        });
      }

      if (msg.type === 'media:streamReady') {
        if (msg.error) {
          setError(msg.error);
          setViewMode('thumbnail');
          return;
        }
        setStreamInfo({
          videoStreamUrl: msg.videoStreamUrl,
          audioStreamUrl: msg.audioStreamUrl,
          mediaInfo: {
            width: msg.mediaInfo?.width ?? 1920,
            height: msg.mediaInfo?.height ?? 1080,
            fps: msg.mediaInfo?.fps ?? 25,
            duration: msg.mediaInfo?.duration ?? duration ?? 0,
          },
        });
        setViewMode('playing');
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [node.id, assetPath, duration]);

  // Start inline playback
  const handlePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (mediaType !== 'video' && mediaType !== 'audio') return;
    setError(null);
    setViewMode('probing');
    setActivePlayingNode(node.id);
    vscode?.postMessage({
      type: 'media:probe',
      nodeId: node.id,
      assetPath,
    });
  }, [assetPath, mediaType, node.id, setActivePlayingNode]);

  // Stop playback
  const handleStop = useCallback(() => {
    setViewMode('thumbnail');
    setStreamInfo(null);
    if (activePlayingNodeId === node.id) {
      setActivePlayingNode(null);
    }
    vscode?.postMessage({ type: 'media:stop', nodeId: node.id });
  }, [node.id, activePlayingNodeId, setActivePlayingNode]);

  // Open in neko-preview (full editor)
  const openInPreview = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    vscode?.postMessage({
      type: 'openMediaPreview',
      assetPath,
      mediaType,
    });
  }, [assetPath, mediaType]);

  // Image: switch to inline viewer
  const switchToImageViewer = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (mediaType === 'image') setViewMode('image-viewer');
  }, [mediaType]);

  // Image: switch back to thumbnail
  const switchToThumbnail = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setViewMode('thumbnail');
  }, []);

  // =========================================================================
  // Render media content
  // =========================================================================

  const renderMediaContent = () => {
    // Playing mode: inline H.264+PCM stream player
    if (viewMode === 'playing' && streamInfo) {
      return (
        <InlineMediaPlayer
          videoStreamUrl={streamInfo.videoStreamUrl}
          audioStreamUrl={streamInfo.audioStreamUrl}
          width={streamInfo.mediaInfo.width}
          height={streamInfo.mediaInfo.height}
          fps={streamInfo.mediaInfo.fps}
          duration={streamInfo.mediaInfo.duration}
          onStop={handleStop}
        />
      );
    }

    // Probing mode: loading indicator
    if (viewMode === 'probing') {
      return (
        <div className="flex-1 relative bg-black/30 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      );
    }

    // Image viewer mode
    if (viewMode === 'image-viewer' && mediaType === 'image') {
      return (
        <div className="flex-1 relative group">
          <ImageViewer
            src={mediaUrl}
            alt={fileName}
            className="w-full h-full"
            objectFit="contain"
            enableZoom={true}
          />
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

    // Thumbnail mode (default)
    const handleClick = (mediaType === 'video' || mediaType === 'audio')
      ? handlePlay
      : switchToImageViewer;

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

        {/* Video/Audio: play overlay */}
        {(mediaType === 'video' || mediaType === 'audio') && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <span className="text-2xl ml-1">▶</span>
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

        {/* Error indicator */}
        {error && (
          <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-red-600/80 rounded text-[10px] text-white">
            ⚠
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
