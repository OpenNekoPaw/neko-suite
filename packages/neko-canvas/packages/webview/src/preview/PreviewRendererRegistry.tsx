import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isResourceRef, type DelegateAction, type ResourceRef } from '@neko/shared';
import { dispatchPreviewDelegate } from './previewDelegates';
import { isSafeWebviewUrl, WebviewPreviewResolver } from './previewResolver';
import { PreviewRuntime } from './previewRuntime';
import type { PreviewSourceDescriptor, RuntimePreviewVariant } from './types';
import { InlineVideoPlayer } from '../components/media/InlineVideoPlayer';
import { InlineAudioPlayer } from '../components/media/InlineAudioPlayer';
import { usePlaybackStore } from '../stores/playbackStore';
import type { PlaybackSurfaceKind } from '../stores/playbackStore';
import { getGlobalVSCodeApi } from '../utils/vscode';
import { t } from '../i18n';

export interface PreviewRendererProps {
  source: PreviewSourceDescriptor;
  runtime?: PreviewRuntime;
  delegateActions?: DelegateAction[];
  surfaceKind?: PlaybackSurfaceKind;
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

function useCaptureFrame(
  assetPath: string | undefined,
  nodeId: string,
  resourceRef: ResourceRef | undefined,
): string | null {
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
      ...(resourceRef ? { resourceRef } : {}),
      time: 1,
    });

    return () => window.removeEventListener('message', handleMessage);
  }, [assetPath, nodeId, resourceRef]);

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

const PLAYBACK_PROGRESS_SYNC_INTERVAL_MS = 250;
const PLAYBACK_PROGRESS_SYNC_DELTA_SECONDS = 0.25;

let playbackSurfaceCounter = 0;

function createPlaybackSurfaceId(mediaType: 'video' | 'audio'): string {
  playbackSurfaceCounter += 1;
  return `${mediaType}-${playbackSurfaceCounter.toString(36)}`;
}

function getMonotonicTimeMs(): number {
  return performance.now();
}

function useMediaStream(
  assetPath: string | undefined,
  mediaType: 'video' | 'audio',
  surfaceKind: PlaybackSurfaceKind,
  resourceRef: ResourceRef | undefined,
) {
  const [surfaceId] = useState(() => createPlaybackSurfaceId(mediaType));
  const [stream, setStream] = useState<MediaStreamState | null>(null);
  const [probing, setProbing] = useState(false);
  const isPausedRef = useRef(false);
  const listenerRef = useRef<((e: MessageEvent) => void) | null>(null);
  const streamDurationRef = useRef(0);

  const [savedStartTime] = useState(() => {
    if (!assetPath) return 0;
    const playbackStore = usePlaybackStore.getState();
    return (
      (playbackStore.activePlayback?.assetPath === assetPath
        ? playbackStore.activePlayback.currentTime
        : playbackStore.getPlayback(assetPath)?.currentTime) ?? 0
    );
  });
  const currentTimeRef = useRef(savedStartTime);
  const lastProgressSyncRef = useRef({
    currentTime: savedStartTime,
    updatedAtMs: 0,
  });

  const startPlayback = useCallback(
    (resumeFromTime?: number) => {
      const vscode = getGlobalVSCodeApi();
      if (!vscode || !assetPath) return;

      const playbackStore = usePlaybackStore.getState();
      const active = playbackStore.activePlayback;
      if (active && active.assetPath === assetPath && active.surfaceId !== surfaceId) {
        playbackStore.requestHandoff({
          assetPath,
          mediaType,
          fromSurfaceId: active.surfaceId,
          toKind: surfaceKind,
          startTime: active.currentTime,
        });
        return;
      }

      setProbing(true);
      isPausedRef.current = false;

      const handoff = playbackStore.consumeHandoff(assetPath, surfaceKind);
      const startTime =
        resumeFromTime ??
        handoff?.startTime ??
        playbackStore.getPlayback(assetPath)?.currentTime ??
        savedStartTime;

      const handleMessage = (event: MessageEvent) => {
        const msg = event.data as Record<string, unknown>;
        if (msg.type === 'media:probeResult' && msg.nodeId === surfaceId) {
          if (msg.error) {
            setProbing(false);
            return;
          }
          const mediaInfo = msg.mediaInfo as Record<string, unknown>;
          vscode.postMessage({
            type: 'media:play',
            nodeId: surfaceId,
            assetPath,
            ...(resourceRef ? { resourceRef } : {}),
            mediaInfo,
            mediaType,
            startTime,
            speed: 1.0,
          });
        }
        if (msg.type === 'media:streamReady' && msg.nodeId === surfaceId) {
          setProbing(false);
          if (msg.error) return;
          const mediaInfo = msg.mediaInfo as Record<string, unknown>;
          const dur = (mediaInfo?.duration as number) ?? 0;
          streamDurationRef.current = dur;
          usePlaybackStore.getState().startActivePlayback({
            assetPath,
            mediaType,
            surfaceId,
            surfaceKind,
            currentTime: startTime,
            duration: dur,
          });
          currentTimeRef.current = startTime;
          lastProgressSyncRef.current = {
            currentTime: startTime,
            updatedAtMs: getMonotonicTimeMs(),
          };
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
        nodeId: surfaceId,
        assetPath,
        ...(resourceRef ? { resourceRef } : {}),
        mediaType,
      });
    },
    [assetPath, mediaType, resourceRef, savedStartTime, surfaceId, surfaceKind],
  );

  const pausePlayback = useCallback(
    (currentTime: number) => {
      const vscode = getGlobalVSCodeApi();
      if (!vscode || !assetPath) return;
      vscode.postMessage({ type: 'media:pause', nodeId: surfaceId });
      isPausedRef.current = true;
      lastProgressSyncRef.current = {
        currentTime,
        updatedAtMs: getMonotonicTimeMs(),
      };
      usePlaybackStore.getState().savePlayback(assetPath, {
        currentTime,
        duration: streamDurationRef.current,
        wasPlaying: true,
      });
      usePlaybackStore.getState().updateActivePlayback(assetPath, surfaceId, {
        currentTime,
        isPlaying: false,
      });
      currentTimeRef.current = currentTime;
    },
    [assetPath, surfaceId],
  );

  const resumePlayback = useCallback(() => {
    const vscode = getGlobalVSCodeApi();
    if (!vscode || !assetPath) return;
    vscode.postMessage({ type: 'media:resume', nodeId: surfaceId });
    isPausedRef.current = false;
    usePlaybackStore.getState().updateActivePlayback(assetPath, surfaceId, { isPlaying: true });
  }, [assetPath, surfaceId]);

  const seekPlayback = useCallback(
    (time: number) => {
      const vscode = getGlobalVSCodeApi();
      if (!vscode || !assetPath) return;
      vscode.postMessage({ type: 'media:seek', nodeId: surfaceId, time });
      lastProgressSyncRef.current = {
        currentTime: time,
        updatedAtMs: getMonotonicTimeMs(),
      };
      usePlaybackStore.getState().updateActivePlayback(assetPath, surfaceId, { currentTime: time });
      currentTimeRef.current = time;
    },
    [assetPath, surfaceId],
  );

  const updatePlaybackProgress = useCallback(
    (currentTime: number) => {
      if (!assetPath) return;
      currentTimeRef.current = currentTime;
      const now = getMonotonicTimeMs();
      const last = lastProgressSyncRef.current;
      const shouldSync =
        Math.abs(currentTime - last.currentTime) >= PLAYBACK_PROGRESS_SYNC_DELTA_SECONDS ||
        now - last.updatedAtMs >= PLAYBACK_PROGRESS_SYNC_INTERVAL_MS;
      if (!shouldSync) return;

      lastProgressSyncRef.current = { currentTime, updatedAtMs: now };
      usePlaybackStore.getState().updateActivePlayback(assetPath, surfaceId, {
        currentTime,
        duration: streamDurationRef.current,
      });
    },
    [assetPath, surfaceId],
  );

  const getCurrentTime = useCallback(() => currentTimeRef.current, []);

  const stopPlayback = useCallback(
    (currentTime: number) => {
      if (listenerRef.current) {
        window.removeEventListener('message', listenerRef.current);
        listenerRef.current = null;
      }
      const vscode = getGlobalVSCodeApi();
      if (vscode && assetPath) {
        vscode.postMessage({ type: 'media:stop', nodeId: surfaceId });
      }
      if (assetPath) {
        const playbackStore = usePlaybackStore.getState();
        playbackStore.savePlayback(assetPath, {
          currentTime,
          duration: streamDurationRef.current,
          wasPlaying: false,
        });
        lastProgressSyncRef.current = {
          currentTime,
          updatedAtMs: getMonotonicTimeMs(),
        };
        playbackStore.stopActivePlayback(assetPath, surfaceId, currentTime);
      }
      setStream(null);
      isPausedRef.current = false;
    },
    [assetPath, surfaceId],
  );

  usePlaybackHandoff({
    assetPath,
    mediaType,
    surfaceId,
    surfaceKind,
    stream,
    probing,
    getCurrentTime,
    startPlayback,
    stopPlayback,
  });

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
    surfaceId,
    startPlayback,
    pausePlayback,
    resumePlayback,
    seekPlayback,
    updatePlaybackProgress,
    stopPlayback,
  };
}

interface PlaybackHandoffOptions {
  assetPath: string | undefined;
  mediaType: 'video' | 'audio';
  surfaceId: string;
  surfaceKind: PlaybackSurfaceKind;
  stream: MediaStreamState | null;
  probing: boolean;
  getCurrentTime: () => number;
  startPlayback: (resumeFromTime?: number) => void;
  stopPlayback: (currentTime: number) => void;
}

function usePlaybackHandoff({
  assetPath,
  mediaType,
  surfaceId,
  surfaceKind,
  stream,
  probing,
  getCurrentTime,
  startPlayback,
  stopPlayback,
}: PlaybackHandoffOptions): void {
  const requestedMountHandoffRef = useRef(false);
  const handledHandoffRef = useRef<string | null>(null);

  useEffect(() => {
    if (!assetPath || !stream) return;
    const unsubscribe = usePlaybackStore.subscribe((state) => {
      const request = state.handoffRequest;
      const requestKey = request ? handoffRequestKey(request) : null;
      if (
        request?.assetPath === assetPath &&
        request.fromSurfaceId === surfaceId &&
        requestKey &&
        handledHandoffRef.current !== requestKey
      ) {
        handledHandoffRef.current = requestKey;
        stopPlayback(request.startTime);
      }
    });
    return unsubscribe;
  }, [assetPath, stopPlayback, stream, surfaceId]);

  useEffect(() => {
    if (!assetPath || stream || probing) return;
    const unsubscribe = usePlaybackStore.subscribe((state) => {
      const request = state.handoffRequest;
      if (
        request?.assetPath === assetPath &&
        request.toKind === surfaceKind &&
        state.activePlayback === null
      ) {
        const consumed = usePlaybackStore.getState().consumeHandoff(assetPath, surfaceKind);
        if (consumed) {
          startPlayback(consumed.startTime);
        }
      }
    });
    return unsubscribe;
  }, [assetPath, probing, startPlayback, stream, surfaceKind]);

  useEffect(() => {
    if (surfaceKind !== 'overlay' || !assetPath || stream || probing) return;
    if (requestedMountHandoffRef.current) return;
    const active = usePlaybackStore.getState().activePlayback;
    if (
      active &&
      active.assetPath === assetPath &&
      active.surfaceId !== surfaceId &&
      active.isPlaying
    ) {
      requestedMountHandoffRef.current = true;
      usePlaybackStore.getState().requestHandoff({
        assetPath,
        mediaType,
        fromSurfaceId: active.surfaceId,
        toKind: 'overlay',
        startTime: active.currentTime,
      });
    }
  }, [assetPath, mediaType, probing, stream, surfaceId, surfaceKind]);

  useEffect(() => {
    if (!stream) return;
    return () => {
      const active = usePlaybackStore.getState().activePlayback;
      if (
        surfaceKind === 'overlay' &&
        assetPath &&
        active?.assetPath === assetPath &&
        active.surfaceId === surfaceId &&
        active.isPlaying
      ) {
        usePlaybackStore.getState().requestHandoff({
          assetPath,
          mediaType,
          fromSurfaceId: surfaceId,
          toKind: 'inline',
          startTime: getCurrentTime(),
        });
      }
      stopPlayback(getCurrentTime());
    };
  }, [assetPath, getCurrentTime, mediaType, stopPlayback, stream, surfaceId, surfaceKind]);
}

function handoffRequestKey(request: {
  readonly fromSurfaceId: string;
  readonly toKind: PlaybackSurfaceKind;
  readonly startTime: number;
}): string {
  return `${request.fromSurfaceId}:${request.toKind}:${request.startTime}`;
}

// =============================================================================
// Renderers
// =============================================================================

function renderVisualPreview({
  source,
  surfaceKind = 'inline',
}: PreviewRendererProps): React.ReactNode {
  const variant = useResolvedVariant(source);
  const url = variant?.runtimeUrl ?? getStableSafeUrl(source);

  if (!url) {
    return renderFallbackPreview({ source });
  }

  return (
    <div className={getVisualPreviewFrameClassName(surfaceKind)}>
      <img
        src={url}
        alt={source.title ?? source.id}
        className={getVisualPreviewImageClassName(surfaceKind)}
      />
    </div>
  );
}

function getVisualPreviewFrameClassName(surfaceKind: PlaybackSurfaceKind): string {
  const base =
    'relative flex min-h-[80px] items-center justify-center overflow-hidden rounded border border-[var(--node-border)] bg-black/20';
  if (surfaceKind === 'overlay') {
    return `${base} max-h-[52vh]`;
  }
  return base;
}

function getVisualPreviewImageClassName(surfaceKind: PlaybackSurfaceKind): string {
  if (surfaceKind === 'overlay') {
    return 'max-h-[52vh] w-full object-contain';
  }
  return 'h-full w-full object-cover';
}

function renderVideoPreview({
  source,
  surfaceKind = 'inline',
}: PreviewRendererProps): React.ReactNode {
  const variant = useResolvedVariant(source);
  const thumbnailUrl = variant?.runtimeUrl ?? getStableSafeUrl(source);
  const assetPath = source.asset?.path;
  const resourceRef = readPreviewSourceResourceRef(source);
  const capturedFrame = useCaptureFrame(assetPath, source.id, resourceRef);
  const {
    stream,
    probing,
    savedStartTime,
    startPlayback,
    pausePlayback,
    resumePlayback,
    seekPlayback,
    updatePlaybackProgress,
    stopPlayback,
  } = useMediaStream(assetPath, 'video', surfaceKind, resourceRef);

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
          onTimeUpdate={updatePlaybackProgress}
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

function renderAudioPreview({
  source,
  delegateActions,
  surfaceKind = 'inline',
}: PreviewRendererProps): React.ReactNode {
  const assetPath = source.asset?.path;
  const resourceRef = readPreviewSourceResourceRef(source);
  const {
    stream,
    probing,
    savedStartTime,
    startPlayback,
    pausePlayback,
    resumePlayback,
    seekPlayback,
    updatePlaybackProgress,
    stopPlayback,
  } = useMediaStream(assetPath, 'audio', surfaceKind, resourceRef);

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
          onTimeUpdate={updatePlaybackProgress}
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

function readPreviewSourceResourceRef(source: PreviewSourceDescriptor): ResourceRef | undefined {
  const ref = source.metadata?.['resourceRef'];
  return isResourceRef(ref) ? ref : undefined;
}

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
  const typeLabel = resolveProjectTypeLabel(source.metadata?.['projectType'], ext);

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
            {t('preview.open')}
          </button>
        )}
      </div>
    </div>
  );
}

function resolveProjectTypeLabel(value: unknown, defaultExt: string): string {
  const projectType = typeof value === 'string' ? value : defaultExt;
  switch (projectType) {
    case 'nkv':
      return t('project.type.nkv');
    case 'nka':
      return t('project.type.nka');
    case 'nkm':
      return t('project.type.nkm');
    case 'nkp':
      return t('project.type.nkp');
    default:
      return t('node.project');
  }
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
