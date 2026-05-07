/**
 * MediaNode - Media asset node component
 *
 * Displays video, image, or audio assets on the canvas.
 * Video/Audio: click to play inline via H.264+PCM stream (neko-preview API).
 * Image: inline viewer with zoom unless it is a panoramic candidate.
 * "Open in Preview" button still available for full-featured playback.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getPanoramicPreviewRoute, type MediaCanvasNode, type CanvasViewport } from '@neko/shared';
import { BaseNode } from './BaseNode';
import { ImageViewer } from '../media/ImageViewer';
import { InlineMediaPlayer } from '../media/InlineMediaPlayer';
import { useCanvasStore } from '../../stores/canvasStore';
import { t } from '../../i18n';

// Get vscode API for postMessage (lazy — window.vscode is set by CanvasApp at runtime)
function getVscode(): { postMessage: (msg: unknown) => void } | undefined {
  return (window as { vscode?: { postMessage: (msg: unknown) => void } }).vscode;
}

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
  onResize?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onResizeEnd?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
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
  if (
    assetPath.startsWith('http://') ||
    assetPath.startsWith('https://') ||
    assetPath.startsWith('blob:')
  ) {
    return assetPath;
  }
  if (baseUrl) {
    return `${baseUrl}/${assetPath}`;
  }
  return assetPath;
}

function isPanoramicPreviewCandidate(assetPath: string, mediaType?: string): boolean {
  return getPanoramicPreviewRoute({ filePath: assetPath, mediaType }) !== null;
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
  onResize,
  onResizeEnd,
  onConnectionStart,
  mediaBaseUrl,
}: MediaNodeProps) {
  const { assetPath, thumbnailPath, mediaType, duration } = node.data;
  const fileName = getFileName(assetPath);
  const [viewMode, setViewMode] = useState<ViewMode>('thumbnail');
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedThumbnail, setCapturedThumbnail] = useState<string | null>(null);
  const lastPlaybackTimeRef = useRef(0);
  const cachedMediaInfoRef = useRef<Record<string, unknown> | null>(null);

  const activePlayingNodeId = useCanvasStore((s) => s.activePlayingNodeId);
  const setActivePlayingNode = useCanvasStore((s) => s.setActivePlayingNode);

  const mediaUrl = getMediaUrl(assetPath, mediaBaseUrl);
  const posterUrl = thumbnailPath ? getMediaUrl(thumbnailPath, mediaBaseUrl) : undefined;
  const panoramicCandidate = isPanoramicPreviewCandidate(assetPath, mediaType);

  // If another node starts playing, stop this one
  useEffect(() => {
    if (
      activePlayingNodeId &&
      activePlayingNodeId !== node.id &&
      (viewMode === 'playing' || viewMode === 'probing')
    ) {
      handleStop();
    }
  }, [activePlayingNodeId, node.id, viewMode]);

  // Request thumbnail capture for video/audio nodes without a thumbnail
  useEffect(() => {
    if (mediaType === 'video' && !thumbnailPath && assetPath) {
      getVscode()?.postMessage({
        type: 'media:captureFrame',
        nodeId: node.id,
        assetPath,
        time: 0,
      });
    }
  }, [mediaType, thumbnailPath, assetPath, node.id]);

  // Listen for extension messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.nodeId !== node.id) return;

      if (msg.type === 'media:captureFrameResult') {
        if (!msg.error && msg.dataUrl) {
          setCapturedThumbnail(msg.dataUrl as string);
        }
        return;
      }

      if (msg.type === 'media:probeResult') {
        if (msg.error) {
          setError(msg.error);
          setViewMode('thumbnail');
          return;
        }
        // Cache mediaInfo for resume
        cachedMediaInfoRef.current = msg.mediaInfo as Record<string, unknown>;
        // Probe succeeded, request playback from last position
        getVscode()?.postMessage({
          type: 'media:play',
          nodeId: node.id,
          assetPath,
          mediaInfo: msg.mediaInfo,
          startTime: lastPlaybackTimeRef.current,
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
  const handlePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (mediaType !== 'video' && mediaType !== 'audio') return;
      setError(null);
      setViewMode('probing');
      setActivePlayingNode(node.id);

      // If we have cached mediaInfo from a previous probe, skip probe and go straight to play
      if (cachedMediaInfoRef.current) {
        getVscode()?.postMessage({
          type: 'media:play',
          nodeId: node.id,
          assetPath,
          mediaInfo: cachedMediaInfoRef.current,
          startTime: lastPlaybackTimeRef.current,
        });
      } else {
        getVscode()?.postMessage({
          type: 'media:probe',
          nodeId: node.id,
          assetPath,
        });
      }
    },
    [assetPath, mediaType, node.id, setActivePlayingNode],
  );

  // Stop playback
  const handleStop = useCallback(
    (stoppedTime?: number) => {
      if (typeof stoppedTime === 'number') {
        // If playback reached the end, reset to beginning
        lastPlaybackTimeRef.current = stoppedTime >= (duration ?? 0) ? 0 : stoppedTime;
      }
      setViewMode('thumbnail');
      setStreamInfo(null);
      if (activePlayingNodeId === node.id) {
        setActivePlayingNode(null);
      }
      getVscode()?.postMessage({ type: 'media:stop', nodeId: node.id });
    },
    [node.id, activePlayingNodeId, setActivePlayingNode, duration],
  );

  // Open in neko-preview (full editor)
  const openInPreview = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      getVscode()?.postMessage({
        type: 'openMediaPreview',
        assetPath,
        mediaType,
      });
    },
    [assetPath, mediaType],
  );

  // Image: switch to inline viewer
  const switchToImageViewer = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (panoramicCandidate) {
        getVscode()?.postMessage({
          type: 'openMediaPreview',
          assetPath,
          mediaType,
        });
        return;
      }
      if (mediaType === 'image') setViewMode('image-viewer');
    },
    [assetPath, mediaType, panoramicCandidate],
  );

  // Image: switch back to thumbnail
  const switchToThumbnail = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setViewMode('thumbnail');
  }, []);

  const handleThumbnailClick = useCallback(
    (e: React.MouseEvent) => {
      if (panoramicCandidate) {
        e.stopPropagation();
        return;
      }
      if ((mediaType === 'video' && !panoramicCandidate) || mediaType === 'audio') {
        handlePlay(e);
        return;
      }
      switchToImageViewer(e);
    },
    [handlePlay, mediaType, panoramicCandidate, switchToImageViewer],
  );

  const handleThumbnailDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!panoramicCandidate) return;
      openInPreview(e);
    },
    [openInPreview, panoramicCandidate],
  );

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
          startTime={lastPlaybackTimeRef.current}
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

    return (
      <div
        className="flex-1 relative bg-black/30 overflow-hidden cursor-pointer group"
        onClick={handleThumbnailClick}
        onDoubleClick={handleThumbnailDoubleClick}
      >
        {thumbnailPath || capturedThumbnail || mediaType === 'image' ? (
          <img
            src={mediaType === 'image' ? mediaUrl : posterUrl || capturedThumbnail || mediaUrl}
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

        {/* Image: zoom/delegation hint */}
        {mediaType === 'image' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="px-2 py-1 bg-black/60 rounded text-xs text-white">
              {panoramicCandidate ? t('node.openInPreview') : t('node.clickToView')}
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
      onResize={onResize}
      onResizeEnd={onResizeEnd}
      onConnectionStart={onConnectionStart}
    >
      <div className="flex flex-col h-full">
        {/* ── Header: type tag + filename + controls ── */}
        <div
          className="flex items-center gap-1.5 px-2 py-1.5"
          style={{
            borderBottom: '1px solid var(--node-border)',
            backgroundColor: 'var(--node-header-bg)',
          }}
        >
          <span
            className="px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 uppercase"
            style={{
              backgroundColor:
                mediaType === 'video'
                  ? '#f59e0b20'
                  : mediaType === 'audio'
                    ? '#22c55e20'
                    : '#8b5cf620',
              color:
                mediaType === 'video' ? '#f59e0b' : mediaType === 'audio' ? '#22c55e' : '#8b5cf6',
            }}
          >
            {mediaType || 'MEDIA'}
          </span>
          <div
            className="text-xs truncate flex-1"
            style={{ color: 'var(--node-fg)' }}
            title={fileName}
          >
            {fileName || 'Untitled'}
          </div>
          {duration && (
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--node-fg-secondary)' }}>
              {formatDuration(duration)}
            </span>
          )}
          {(mediaType === 'video' || mediaType === 'audio' || panoramicCandidate) && (
            <button
              className="p-0.5 rounded hover:bg-[var(--control-hover)] transition-colors shrink-0"
              onClick={openInPreview}
              title="Open in Neko Preview"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <svg
                className="w-3.5 h-3.5"
                style={{ color: 'var(--node-fg-secondary)' }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Media content area */}
        {renderMediaContent()}
      </div>
    </BaseNode>
  );
}
