import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DelegateAction } from '@neko/shared';
import { dispatchPreviewDelegate } from './previewDelegates';
import { isSafeWebviewUrl, WebviewPreviewResolver } from './previewResolver';
import { PreviewRuntime } from './previewRuntime';
import type { PreviewSourceDescriptor, RuntimePreviewVariant } from './types';
import { InlineVideoPlayer } from '../components/media/InlineVideoPlayer';
import { InlineAudioPlayer } from '../components/media/InlineAudioPlayer';
import { usePlaybackStore } from '../stores/playbackStore';
import { getGlobalVSCodeApi } from '../utils/vscode';

export interface PreviewRendererProps {
  source: PreviewSourceDescriptor;
  runtime?: PreviewRuntime;
  delegateActions?: DelegateAction[];
}

export type PreviewRenderer = (props: PreviewRendererProps) => React.ReactNode;

export type PreviewRendererRegistry = Partial<
  Record<PreviewSourceDescriptor['role'], PreviewRenderer>
>;

function createPreviewRendererRegistry(): PreviewRendererRegistry {
  return {
    image: renderVisualPreview,
    'document-cover': renderVisualPreview,
    'video-poster': renderVisualPreview,
    'video-proxy': renderVideoPreview,
    'audio-waveform': renderAudioPreview,
    'model-screenshot': renderVisualPreview,
    'model-turntable': renderVisualPreview,
    'panorama-fov-crop': renderVisualPreview,
    'panorama-rotation': renderVisualPreview,
    'generation-candidate': renderVisualPreview,
    'project-thumbnail': renderProjectPreview,
    fallback: renderFallbackPreview,
  };
}

export function PreviewSurface(props: PreviewRendererProps) {
  const registry = useMemo(() => createPreviewRendererRegistry(), []);
  const Renderer = registry[props.source.role] ?? renderFallbackPreview;
  return <Renderer {...props} />;
}

// =============================================================================
// Hooks
// =============================================================================

function useResolvedVariant(source: PreviewSourceDescriptor): RuntimePreviewVariant | undefined {
  const resolver = useMemo(() => new WebviewPreviewResolver(), []);
  const [variant, setVariant] = useState<RuntimePreviewVariant | undefined>();

  useEffect(() => {
    let cancelled = false;
    resolver.resolve({ source }).then((nextVariant) => {
      if (!cancelled) {
        setVariant(nextVariant);
      }
    });
    return () => {
      cancelled = true;
      resolver.dispose();
    };
  }, [resolver, source]);

  return variant;
}

function useCaptureFrame(assetPath: string | undefined, nodeId: string): string | null {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!assetPath || requestedRef.current) return;
    const vscode = getGlobalVSCodeApi();
    if (!vscode) return;

    requestedRef.current = true;

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (msg.type === 'media:captureFrameResult' && msg.nodeId === nodeId) {
        if (typeof msg.dataUrl === 'string') {
          setFrameUrl(msg.dataUrl);
        }
        window.removeEventListener('message', handleMessage);
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({
      type: 'media:captureFrame',
      nodeId,
      assetPath,
      time: 1,
    });

    return () => window.removeEventListener('message', handleMessage);
  }, [assetPath, nodeId]);

  return frameUrl;
}

// =============================================================================
// Media stream hook (with pause/resume/seek support)
// =============================================================================

interface MediaStreamState {
  videoStreamUrl: string | null;
  audioStreamUrl: string | null;
  width: number;
  height: number;
  fps: number;
  duration: number;
}

function useMediaStream(assetPath: string | undefined, mediaType: 'video' | 'audio') {
  const [stream, setStream] = useState<MediaStreamState | null>(null);
  const [probing, setProbing] = useState(false);
  const isPausedRef = useRef(false);
  const listenerRef = useRef<((e: MessageEvent) => void) | null>(null);
  const streamDurationRef = useRef(0);

  const [savedStartTime] = useState(() => {
    if (!assetPath) return 0;
    return usePlaybackStore.getState().getPlayback(assetPath)?.currentTime ?? 0;
  });

  const startPlayback = useCallback(
    (resumeFromTime?: number) => {
      const vscode = getGlobalVSCodeApi();
      if (!vscode || !assetPath) return;

      setProbing(true);
      isPausedRef.current = false;

      const startTime = resumeFromTime ?? savedStartTime;

      const handleMessage = (event: MessageEvent) => {
        const msg = event.data as Record<string, unknown>;
        if (msg.type === 'media:probeResult' && msg.nodeId === assetPath) {
          if (msg.error) {
            setProbing(false);
            return;
          }
          const mediaInfo = msg.mediaInfo as Record<string, unknown>;
          vscode.postMessage({
            type: 'media:play',
            nodeId: assetPath,
            assetPath,
            mediaInfo,
            startTime,
            speed: 1.0,
          });
        }
        if (msg.type === 'media:streamReady' && msg.nodeId === assetPath) {
          setProbing(false);
          if (msg.error) return;
          const mediaInfo = msg.mediaInfo as Record<string, unknown>;
          const dur = (mediaInfo?.duration as number) ?? 0;
          streamDurationRef.current = dur;
          setStream({
            videoStreamUrl: (msg.videoStreamUrl as string) ?? null,
            audioStreamUrl: (msg.audioStreamUrl as string) ?? null,
            width: (mediaInfo?.width as number) ?? 640,
            height: (mediaInfo?.height as number) ?? 360,
            fps: (mediaInfo?.fps as number) ?? 30,
            duration: dur,
          });
        }
      };

      listenerRef.current = handleMessage;
      window.addEventListener('message', handleMessage);
      vscode.postMessage({
        type: 'media:probe',
        nodeId: assetPath,
        assetPath,
        mediaType,
      });
    },
    [assetPath, mediaType, savedStartTime],
  );

  const pausePlayback = useCallback(
    (currentTime: number) => {
      const vscode = getGlobalVSCodeApi();
      if (!vscode || !assetPath) return;
      vscode.postMessage({ type: 'media:pause', nodeId: assetPath });
      isPausedRef.current = true;
      usePlaybackStore.getState().savePlayback(assetPath, {
        currentTime,
        duration: streamDurationRef.current,
        wasPlaying: true,
      });
    },
    [assetPath],
  );

  const resumePlayback = useCallback(() => {
    const vscode = getGlobalVSCodeApi();
    if (!vscode || !assetPath) return;
    vscode.postMessage({ type: 'media:resume', nodeId: assetPath });
    isPausedRef.current = false;
  }, [assetPath]);

  const seekPlayback = useCallback(
    (time: number) => {
      const vscode = getGlobalVSCodeApi();
      if (!vscode || !assetPath) return;
      vscode.postMessage({ type: 'media:seek', nodeId: assetPath, time });
    },
    [assetPath],
  );

  const stopPlayback = useCallback(
    (currentTime: number) => {
      if (listenerRef.current) {
        window.removeEventListener('message', listenerRef.current);
        listenerRef.current = null;
      }
      const vscode = getGlobalVSCodeApi();
      if (vscode && assetPath) {
        vscode.postMessage({ type: 'media:stop', nodeId: assetPath });
      }
      if (assetPath) {
        usePlaybackStore.getState().savePlayback(assetPath, {
          currentTime,
          duration: streamDurationRef.current,
          wasPlaying: false,
        });
      }
      setStream(null);
      isPausedRef.current = false;
    },
    [assetPath],
  );

  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        window.removeEventListener('message', listenerRef.current);
      }
    };
  }, []);

  return {
    stream,
    probing,
    isPaused: isPausedRef.current,
    savedStartTime,
    startPlayback,
    pausePlayback,
    resumePlayback,
    seekPlayback,
    stopPlayback,
  };
}

// =============================================================================
// Renderers
// =============================================================================

function renderVisualPreview({ source }: PreviewRendererProps): React.ReactNode {
  const variant = useResolvedVariant(source);
  const url = variant?.runtimeUrl ?? getStableSafeUrl(source);

  if (!url) {
    return renderFallbackPreview({ source });
  }

  return (
    <div className="relative flex min-h-[80px] items-center justify-center overflow-hidden rounded border border-[var(--node-border)] bg-black/20">
      <img src={url} alt={source.title ?? source.id} className="h-full w-full object-cover" />
    </div>
  );
}

function renderVideoPreview({ source }: PreviewRendererProps): React.ReactNode {
  const variant = useResolvedVariant(source);
  const thumbnailUrl = variant?.runtimeUrl ?? getStableSafeUrl(source);
  const assetPath = source.asset?.path;
  const capturedFrame = useCaptureFrame(assetPath, source.id);
  const {
    stream,
    probing,
    savedStartTime,
    startPlayback,
    pausePlayback,
    resumePlayback,
    seekPlayback,
    stopPlayback,
  } = useMediaStream(assetPath, 'video');

  const posterUrl = capturedFrame ?? thumbnailUrl;

  if (stream) {
    return (
      <div className="relative min-h-[90px] overflow-hidden rounded border border-[var(--node-border)] bg-black">
        <InlineVideoPlayer
          videoStreamUrl={stream.videoStreamUrl}
          audioStreamUrl={stream.audioStreamUrl}
          width={stream.width}
          height={stream.height}
          fps={stream.fps}
          duration={stream.duration}
          startTime={savedStartTime}
          onPause={pausePlayback}
          onResume={resumePlayback}
          onSeek={seekPlayback}
          onStop={stopPlayback}
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-[90px] overflow-hidden rounded border border-[var(--node-border)] bg-black/30">
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={source.title ?? source.id}
          className="h-full w-full object-cover"
        />
      ) : null}
      <button
        type="button"
        className="absolute inset-0 flex items-center justify-center text-white/80 hover:text-white"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          startPlayback();
        }}
        disabled={probing || !assetPath}
      >
        {probing ? '...' : '▶'}
      </button>
    </div>
  );
}

function renderAudioPreview({ source, delegateActions }: PreviewRendererProps): React.ReactNode {
  const assetPath = source.asset?.path;
  const {
    stream,
    probing,
    savedStartTime,
    startPlayback,
    pausePlayback,
    resumePlayback,
    seekPlayback,
    stopPlayback,
  } = useMediaStream(assetPath, 'audio');

  if (stream && stream.audioStreamUrl) {
    return (
      <div className="rounded border border-[var(--node-border)] bg-black/20">
        <InlineAudioPlayer
          audioStreamUrl={stream.audioStreamUrl}
          duration={stream.duration}
          startTime={savedStartTime}
          onPause={pausePlayback}
          onResume={resumePlayback}
          onSeek={seekPlayback}
          onStop={stopPlayback}
        />
      </div>
    );
  }

  return (
    <div className="rounded border border-[var(--node-border)] bg-black/20 p-2">
      <div className="mb-2 flex h-8 items-end gap-0.5">
        {Array.from({ length: 24 }).map((_, index) => (
          <div
            key={index}
            className="w-1 rounded-sm bg-[var(--node-selected)] opacity-70"
            style={{ height: `${20 + ((index * 17) % 60)}%` }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded bg-[var(--node-selected)] px-2 py-1 text-xs text-white"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            startPlayback();
          }}
          disabled={probing || !assetPath}
        >
          {probing ? '...' : '▶ Play'}
        </button>
        <span className="truncate text-xs text-[var(--node-fg-secondary)]">
          {source.title ?? source.asset?.path ?? source.id}
        </span>
        {delegateActions && delegateActions.length > 0 && (
          <button
            type="button"
            className="ml-auto flex-shrink-0 rounded border border-[var(--node-border)] px-2 py-1 text-xs"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              dispatchPreviewDelegate({ action: delegateActions[0]!, asset: source.asset });
            }}
          >
            Open
          </button>
        )}
      </div>
    </div>
  );
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
  nkv: 'Video Project',
  nka: 'Audio Project',
  nkm: '3D Model',
  nkp: 'Puppet',
};

function useProjectThumbnail(assetPath: string | undefined, nodeId: string): string | null {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!assetPath || requestedRef.current) return;
    const vscode = getGlobalVSCodeApi();
    if (!vscode) return;

    const ext = assetPath.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'nka') return;

    requestedRef.current = true;

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (msg.type === 'project:thumbnailResult' && msg.nodeId === nodeId) {
        if (typeof msg.dataUrl === 'string') {
          setThumbnailUrl(msg.dataUrl);
        }
        window.removeEventListener('message', handleMessage);
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({
      type: 'project:resolveThumbnail',
      nodeId,
      projectPath: assetPath,
      projectType: ext,
    });

    return () => window.removeEventListener('message', handleMessage);
  }, [assetPath, nodeId]);

  return thumbnailUrl;
}

function renderProjectPreview({ source, delegateActions }: PreviewRendererProps): React.ReactNode {
  const assetPath = source.asset?.path;
  const ext = assetPath?.split('.').pop()?.toLowerCase() ?? '';
  const thumbnailUrl = useProjectThumbnail(assetPath, source.id);
  const typeLabel = PROJECT_TYPE_LABELS[ext] ?? 'Project';

  return (
    <div className="relative flex min-h-[80px] flex-col overflow-hidden rounded border border-[var(--node-border)] bg-black/20">
      {thumbnailUrl ? (
        <div className="flex flex-1 items-center justify-center overflow-hidden">
          <img
            src={thumbnailUrl}
            alt={source.title ?? source.id}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-4 text-[var(--node-fg-secondary)]">
          <span className="text-sm font-medium uppercase opacity-40">{ext || 'nk'}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-[var(--node-border)] px-2 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-[var(--node-fg)]">
            {source.title ?? source.asset?.path ?? source.id}
          </div>
          <div className="text-[10px] text-[var(--node-fg-secondary)]">{typeLabel}</div>
        </div>
        {delegateActions && delegateActions.length > 0 && (
          <button
            type="button"
            className="flex-shrink-0 rounded border border-[var(--node-border)] px-2 py-1 text-xs"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              dispatchPreviewDelegate({ action: delegateActions[0]!, asset: source.asset });
            }}
          >
            Open
          </button>
        )}
      </div>
    </div>
  );
}

function getStableSafeUrl(source: PreviewSourceDescriptor): string | undefined {
  const variant = source.variants?.find((v) => v.role === source.role);
  const url = variant?.sourcePath;
  return url && isSafeWebviewUrl(url) ? url : undefined;
}

function renderFallbackPreview({ source, delegateActions }: PreviewRendererProps): React.ReactNode {
  return (
    <div className="flex min-h-[72px] items-center justify-between gap-2 rounded border border-dashed border-[var(--node-border)] bg-black/20 px-2 text-xs text-[var(--node-fg-secondary)]">
      <span className="min-w-0 truncate">{source.title ?? source.asset?.path ?? source.id}</span>
      {delegateActions && delegateActions.length > 0 && (
        <button
          type="button"
          className="flex-shrink-0 rounded border border-[var(--node-border)] px-2 py-1"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            dispatchPreviewDelegate({ action: delegateActions[0]!, asset: source.asset });
          }}
        >
          Open
        </button>
      )}
    </div>
  );
}
