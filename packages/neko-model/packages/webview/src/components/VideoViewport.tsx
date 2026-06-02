import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  RenderFrameMeta,
  RenderStreamDescriptor,
  SceneDelta,
  ViewportDescriptor,
  ViewportRenderMode,
} from '@neko/shared';
import type { ViewportMenuItem, ViewportFrameMeta, ViewportSerializableRecord } from '@neko/shared';
import { OverlayRenderer, ViewportShell } from '@neko/ui';
import {
  EngineClient,
  H264StreamClient,
  type H264BackpressurePolicy,
  type SceneControlSocket,
  type SceneViewportResolution,
} from '@neko/neko-client';
import type { LocalPredictionSnapshot } from '../scene/LocalPredictionLayer';
import { InteractionLayer } from './InteractionLayer';
import { OverlayCanvas } from './OverlayCanvas';
import { ViewportOrbitControls } from './ViewportOrbitControls';
import { ViewportGuideOverlay } from './ViewportGuideOverlay';
import { bridgeRenderFrameMetaToViewportFrameMeta } from '@neko/ui';
import { postMessage } from '@neko/shared/vscode';
import { useModelStore } from '../stores/modelStore';
import { handleModelMenuAction, ModelController } from '../viewport/ModelController';
import { sampleViewportMemory } from '../viewport/viewportMemoryProbe';
import { VIEWPORT_INTERACTION_PROFILE_TTL_MS } from '../viewport/streamInteractionPolicy';
import { modelErrorMessage, toError, webviewErrorHandler } from '../platform/errors';

export interface VideoViewportProps {
  enginePort: number;
  sceneId: string;
  sceneRevision: number;
  selectedNodeId: string | null;
  hasPendingPrediction: boolean;
  sceneControlSocket: SceneControlSocket | null;
  visible: boolean;
  overlay?: NonNullable<SceneDelta['overlay']> | null;
  predictions?: LocalPredictionSnapshot[];
  topologyWarning?: string | null;
  hudVisible?: boolean;
  interactionSignal?: number;
  onSelectNode: (nodeId: string | null) => void;
  onSceneControlError: (message: string) => void;
  onCameraMutated?: () => void;
}

const MAIN_VIEWPORT_ID = 'main';
const TARGET_VIEWPORT_STREAM_HEIGHT = 1080;
const MAX_VIEWPORT_STREAM_WIDTH = 3840;
const MAX_VIEWPORT_STREAM_HEIGHT = 2160;
const MAX_VIEWPORT_DEVICE_PIXEL_RATIO = 2;
const VIEWPORT_DIMENSION_BUCKET = 16;
const MIN_VISIBLE_VIEWPORT_DIMENSION = 64;
const VIEWPORT_STREAM_FPS = 60;
const VIEWPORT_RESIZE_COMMIT_DELAY_MS = 160;
const VIEWPORT_CAMERA_SEND_INTERVAL_MS = 33;
const VIEWPORT_CAMERA_KEYFRAME_INTERVAL_MS = 250;
const LOOKDEV_PENDING_DELAY_MS = 250;
const LOOKDEV_RETRY_DELAY_MS = 1500;
const RENDER_FRAME_META_STORE_INTERVAL_MS = 250;
const VIEWPORT_MEMORY_SAMPLE_INTERVAL_MS = 1000;
const RAF_PRESENTATION_LIMIT_INTERVAL_MS = 40;
const RAF_PRESENTATION_LIMIT_STRIKES = 3;
const RAF_LIMITED_FPS_THRESHOLD = 50;
const RAF_LIMITED_STREAM_FPS_THRESHOLD = 55;
const H264_DEBUG_SETTINGS_STORAGE_KEY = 'neko.model.h264';
const REALTIME_VIEWPORT_BACKPRESSURE: H264BackpressurePolicy = {
  maxDecodeQueueDepth: 2,
  dropDeltaFramesWhenBacklogged: true,
  preserveKeyframes: true,
  latestOnly: true,
  keyframeRequestDropThreshold: 12,
};
const INTERACTIVE_VIEWPORT_BACKPRESSURE: H264BackpressurePolicy = {
  maxDecodeQueueDepth: 1,
  dropDeltaFramesWhenBacklogged: true,
  preserveKeyframes: false,
  latestOnly: true,
  keyframeRequestDropThreshold: 6,
};

type ViewportStreamSize = SceneViewportResolution;
type ViewportStreamProfile = 'default' | 'interactive';
type PresentationSchedulerMode = 'raf' | 'timer';

interface PendingPresentationFrame {
  frame: VideoFrame;
  meta?: RenderFrameMeta;
  decodedAt: number;
  droppedBeforePresent: number;
}

type ViewportH264Settings = NonNullable<ViewportDescriptor['h264']>;

function bucketStreamDimension(value: number, maxValue?: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return VIEWPORT_DIMENSION_BUCKET;
  }
  const bucketed = Math.max(
    VIEWPORT_DIMENSION_BUCKET,
    Math.round(value / VIEWPORT_DIMENSION_BUCKET) * VIEWPORT_DIMENSION_BUCKET,
  );
  const clamped = maxValue === undefined ? bucketed : Math.min(bucketed, maxValue);
  return clamped % 2 === 0 ? clamped : clamped + 1;
}

function createViewportStreamSize(rect: DOMRectReadOnly): ViewportStreamSize {
  const cssWidth = Math.max(0, rect.width);
  const cssHeight = Math.max(0, rect.height);
  if (cssWidth < MIN_VISIBLE_VIEWPORT_DIMENSION || cssHeight < MIN_VISIBLE_VIEWPORT_DIMENSION) {
    return {
      width: 0,
      height: 0,
      pixelRatio: 1,
    };
  }
  const pixelRatio = Math.min(
    Math.max(window.devicePixelRatio || 1, 1),
    MAX_VIEWPORT_DEVICE_PIXEL_RATIO,
  );

  const targetPhysicalWidth = cssWidth * pixelRatio;
  const targetPhysicalHeight = Math.max(cssHeight * pixelRatio, TARGET_VIEWPORT_STREAM_HEIGHT);
  const aspectRatio = targetPhysicalWidth / targetPhysicalHeight;
  let height = Math.min(targetPhysicalHeight, MAX_VIEWPORT_STREAM_HEIGHT);
  let width = height * aspectRatio;
  if (width > MAX_VIEWPORT_STREAM_WIDTH) {
    width = MAX_VIEWPORT_STREAM_WIDTH;
    height = width / aspectRatio;
  }

  return {
    width: bucketStreamDimension(width, MAX_VIEWPORT_STREAM_WIDTH),
    height: bucketStreamDimension(height, MAX_VIEWPORT_STREAM_HEIGHT),
    pixelRatio,
  };
}

function readViewportH264DebugSettings(): ViewportH264Settings | undefined {
  try {
    const raw = window.localStorage?.getItem(H264_DEBUG_SETTINGS_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    const h264: ViewportH264Settings = {};
    if (typeof record.gopSize === 'number' && Number.isFinite(record.gopSize)) {
      h264.gopSize = Math.max(1, Math.floor(record.gopSize));
    }
    if (
      record.decoderPreference === 'prefer-hardware' ||
      record.decoderPreference === 'prefer-software' ||
      record.decoderPreference === 'no-preference'
    ) {
      h264.decoderPreference = record.decoderPreference;
    }
    return h264.gopSize !== undefined || h264.decoderPreference !== undefined ? h264 : undefined;
  } catch {
    return undefined;
  }
}

function backpressureForStreamProfile(profile: ViewportStreamProfile): H264BackpressurePolicy {
  return profile === 'interactive'
    ? INTERACTIVE_VIEWPORT_BACKPRESSURE
    : REALTIME_VIEWPORT_BACKPRESSURE;
}

function isPresentationHostLimited(
  presentFps: number | undefined,
  streamDurationUs: number,
): boolean {
  if (
    typeof presentFps !== 'number' ||
    !Number.isFinite(presentFps) ||
    !Number.isFinite(streamDurationUs) ||
    streamDurationUs <= 0
  ) {
    return false;
  }
  const streamFps = 1_000_000 / streamDurationUs;
  return streamFps >= RAF_LIMITED_STREAM_FPS_THRESHOLD && presentFps < RAF_LIMITED_FPS_THRESHOLD;
}

function areViewportStreamSizesEqual(
  left: ViewportStreamSize | null,
  right: ViewportStreamSize,
): boolean {
  return (
    left?.width === right.width &&
    left.height === right.height &&
    left.pixelRatio === right.pixelRatio
  );
}

function isViewportStreamSizeReady(size: ViewportStreamSize | null): size is ViewportStreamSize {
  return (
    size !== null &&
    size.width >= MIN_VISIBLE_VIEWPORT_DIMENSION &&
    size.height >= MIN_VISIBLE_VIEWPORT_DIMENSION
  );
}

function createViewportDescriptor(
  sceneId: string,
  renderMode: ViewportRenderMode,
  cameraPosition: [number, number, number],
  cameraTarget: [number, number, number],
  streamSize: ViewportStreamSize,
  helperPassesEnabled: boolean,
): ViewportDescriptor {
  return {
    viewportId: MAIN_VIEWPORT_ID,
    sceneId,
    renderMode,
    resolution: {
      width: streamSize.width,
      height: streamSize.height,
      pixelRatio: streamSize.pixelRatio,
    },
    fps: VIEWPORT_STREAM_FPS,
    allowFpsDegrade: false,
    allowQualityDegrade: false,
    colorSpace: 'srgb',
    toneMapping: 'aces',
    postProcess: {
      bloom: false,
      ssao: false,
      taa: true,
    },
    helperPassesEnabled,
    lookdev: {
      renderMode,
      helperPassesEnabled,
      showGrid: helperPassesEnabled,
    },
    h264: readViewportH264DebugSettings(),
    workMode: 'edit-parametric',
    cameraRef: {
      kind: 'editorCamera',
      rig: {
        position: { x: cameraPosition[0], y: cameraPosition[1], z: cameraPosition[2] },
        target: { x: cameraTarget[0], y: cameraTarget[1], z: cameraTarget[2] },
        fov: 45,
      },
    },
  };
}

export function VideoViewport({
  enginePort,
  sceneId,
  sceneRevision,
  selectedNodeId,
  hasPendingPrediction,
  sceneControlSocket,
  visible,
  overlay = null,
  predictions = [],
  topologyWarning = null,
  hudVisible = true,
  interactionSignal = 0,
  onSelectNode,
  onSceneControlError,
  onCameraMutated,
}: VideoViewportProps): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamClientRef = useRef<H264StreamClient | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const frameMetaRef = useRef<RenderFrameMeta | null>(null);
  const pendingPresentationRef = useRef<PendingPresentationFrame | null>(null);
  const presentationFrameRef = useRef<number | null>(null);
  const presentationTimerRef = useRef<number | null>(null);
  const presentationSchedulerModeRef = useRef<PresentationSchedulerMode>('raf');
  const rafPresentationLimitStrikeRef = useRef(0);
  const lastPresentedAtRef = useRef<number | null>(null);
  const lastFrameMetaStoreAtRef = useRef(0);
  const lastAppliedSeqCommittedRef = useRef(0);
  const lastMemorySampleAtRef = useRef(0);
  const decodedDroppedBeforePresentRef = useRef(0);
  const pendingResizeCommitRef = useRef<number | null>(null);
  const pendingInitialSizeFrameRef = useRef<number | null>(null);
  const latestResizeSizeRef = useRef<ViewportStreamSize | null>(null);
  const pendingCameraFlushTimerRef = useRef<number | null>(null);
  const pendingStreamProfileRestoreRef = useRef<number | null>(null);
  const streamProfileRef = useRef<ViewportStreamProfile>('default');
  const lastInteractionSignalRef = useRef(interactionSignal);
  const lastCameraSendAtRef = useRef(0);
  const lastCameraKeyframeRequestRef = useRef(0);
  // Serialise stream lifecycle across rerenders. Without this, a rapid
  // sceneId change would dispose stream A and start stream B in parallel,
  // letting two RenderGraph submissions race for the same wgpu device queue
  // (observed as duplicate `pbr_render_graph_encoder` validation errors).
  const pendingDestroyRef = useRef<Promise<void>>(Promise.resolve());
  const [hasEngineFrame, setHasEngineFrame] = useState(false);
  const [routeAUnavailable, setRouteAUnavailable] = useState(false);
  const [routeAUnavailableReason, setRouteAUnavailableReason] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [viewportSize, setViewportSize] = useState<ViewportStreamSize | null>(null);
  const helperPassesEnabled = useModelStore((state) => state.showViewportGrid);
  const sceneNodes = useModelStore((state) => state.sceneNodes);
  const lightNodeIds = useMemo(
    () =>
      sceneNodes
        .filter((node) => node.visible !== false && (node.kind === 'light' || node.light))
        .map((node) => node.nodeId),
    [sceneNodes],
  );
  const requestedLookDevMode = useModelStore((state) => state.lookDev.requestedMode);
  const appliedLookDevMode = useModelStore((state) => state.lookDev.appliedMode);
  const selectedRenderMode = requestedLookDevMode ?? appliedLookDevMode;
  const setStreamProfile = React.useCallback((profile: ViewportStreamProfile) => {
    if (streamProfileRef.current === profile) {
      return;
    }
    streamProfileRef.current = profile;
    streamClientRef.current?.updateBackpressurePolicy(backpressureForStreamProfile(profile));
  }, []);
  const markInteractiveStreamActivity = React.useCallback(() => {
    if (pendingStreamProfileRestoreRef.current !== null) {
      window.clearTimeout(pendingStreamProfileRestoreRef.current);
      pendingStreamProfileRestoreRef.current = null;
    }
    setStreamProfile('interactive');
    pendingStreamProfileRestoreRef.current = window.setTimeout(() => {
      pendingStreamProfileRestoreRef.current = null;
      setStreamProfile('default');
    }, VIEWPORT_INTERACTION_PROFILE_TTL_MS);
  }, [setStreamProfile]);
  const modelController = useMemo(
    () =>
      new ModelController({
        enginePort,
        sceneId,
        viewportId: MAIN_VIEWPORT_ID,
        sceneRevision,
        resolution: isViewportStreamSizeReady(viewportSize) ? viewportSize : null,
        onSelectNode,
        onError: onSceneControlError,
        onMaterialPreview: () => captureMaterialPreview(enginePort, onSceneControlError),
        onInteractiveStreamActivity: markInteractiveStreamActivity,
        sceneControlSocket,
        getViewportRect: () =>
          viewportRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1),
      }),
    [
      enginePort,
      sceneId,
      sceneRevision,
      viewportSize,
      onSelectNode,
      onSceneControlError,
      markInteractiveStreamActivity,
      sceneControlSocket,
    ],
  );

  useEffect(() => {
    if (interactionSignal === lastInteractionSignalRef.current) {
      return;
    }
    lastInteractionSignalRef.current = interactionSignal;
    markInteractiveStreamActivity();
  }, [interactionSignal, markInteractiveStreamActivity]);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return;
    }

    const commitSize = (next: ViewportStreamSize) => {
      latestResizeSizeRef.current = next;
      setViewportSize((current) => (areViewportStreamSizesEqual(current, next) ? current : next));
    };

    const scheduleSizeCommit = (next: ViewportStreamSize) => {
      latestResizeSizeRef.current = next;
      if (pendingResizeCommitRef.current !== null) {
        window.clearTimeout(pendingResizeCommitRef.current);
      }
      pendingResizeCommitRef.current = window.setTimeout(() => {
        pendingResizeCommitRef.current = null;
        const pending = latestResizeSizeRef.current;
        if (pending) {
          commitSize(pending);
        }
      }, VIEWPORT_RESIZE_COMMIT_DELAY_MS);
    };

    const updateSize = (rect: DOMRectReadOnly, commitImmediately: boolean) => {
      const next = createViewportStreamSize(rect);
      if (commitImmediately) {
        commitSize(next);
      } else {
        scheduleSizeCommit(next);
      }
    };

    const firstRect = element.getBoundingClientRect();
    latestResizeSizeRef.current = createViewportStreamSize(firstRect);
    pendingInitialSizeFrameRef.current = window.requestAnimationFrame(() => {
      pendingInitialSizeFrameRef.current = null;
      const next = createViewportStreamSize(element.getBoundingClientRect());
      const pending = latestResizeSizeRef.current;
      latestResizeSizeRef.current = next;
      commitSize(pending && areViewportStreamSizesEqual(pending, next) ? pending : next);
    });
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        if (pendingInitialSizeFrameRef.current !== null) {
          window.cancelAnimationFrame(pendingInitialSizeFrameRef.current);
          pendingInitialSizeFrameRef.current = null;
        }
      };
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        updateSize(entry.contentRect, false);
      }
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      if (pendingInitialSizeFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingInitialSizeFrameRef.current);
        pendingInitialSizeFrameRef.current = null;
      }
      if (pendingResizeCommitRef.current !== null) {
        window.clearTimeout(pendingResizeCommitRef.current);
        pendingResizeCommitRef.current = null;
      }
    };
  }, []);

  const sendViewportCamera = React.useCallback(() => {
    if (!sceneControlSocket?.isOpen()) {
      return;
    }

    try {
      const store = useModelStore.getState();
      const position = store.getCameraPosition();
      const target = store.cameraTarget;
      const streamProfile = streamProfileRef.current;
      sceneControlSocket.sendViewportCameraLatest({
        sceneId,
        sceneRevision,
        viewportId: MAIN_VIEWPORT_ID,
        position,
        target,
        resolution: isViewportStreamSizeReady(viewportSize) ? viewportSize : undefined,
        ...(streamProfile === 'interactive'
          ? {
              streamProfile,
              profileTtlMs: VIEWPORT_INTERACTION_PROFILE_TTL_MS,
            }
          : {}),
      });
      const now = performance.now();
      if (now - lastCameraKeyframeRequestRef.current >= VIEWPORT_CAMERA_KEYFRAME_INTERVAL_MS) {
        sceneControlSocket.requestKeyframe(MAIN_VIEWPORT_ID);
        lastCameraKeyframeRequestRef.current = now;
      }
    } catch (error) {
      void webviewErrorHandler.handleError(toError(error), {
        showToUser: false,
        severity: 'error',
      });
      onSceneControlError(modelErrorMessage('error.cameraUpdateFailed'));
    }
  }, [sceneControlSocket, sceneId, sceneRevision, viewportSize, onSceneControlError]);

  const flushViewportCamera = React.useCallback(() => {
    if (pendingCameraFlushTimerRef.current !== null) {
      window.clearTimeout(pendingCameraFlushTimerRef.current);
      pendingCameraFlushTimerRef.current = null;
    }
    lastCameraSendAtRef.current = performance.now();
    sendViewportCamera();
  }, [sendViewportCamera]);

  const scheduleViewportCamera = React.useCallback(
    (options?: { readonly immediate?: boolean }) => {
      if (options?.immediate === true) {
        flushViewportCamera();
        return;
      }

      const now = performance.now();
      const elapsed = now - lastCameraSendAtRef.current;
      if (elapsed >= VIEWPORT_CAMERA_SEND_INTERVAL_MS) {
        flushViewportCamera();
        return;
      }

      if (pendingCameraFlushTimerRef.current === null) {
        pendingCameraFlushTimerRef.current = window.setTimeout(() => {
          pendingCameraFlushTimerRef.current = null;
          lastCameraSendAtRef.current = performance.now();
          sendViewportCamera();
        }, VIEWPORT_CAMERA_SEND_INTERVAL_MS - elapsed);
      }
    },
    [flushViewportCamera, sendViewportCamera],
  );

  useEffect(() => {
    return () => {
      if (pendingCameraFlushTimerRef.current !== null) {
        window.clearTimeout(pendingCameraFlushTimerRef.current);
        pendingCameraFlushTimerRef.current = null;
      }
      if (pendingStreamProfileRestoreRef.current !== null) {
        window.clearTimeout(pendingStreamProfileRestoreRef.current);
        pendingStreamProfileRestoreRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let pendingTimer: number | null = null;
    let retryTimer: number | null = null;
    const engineClient = new EngineClient(enginePort);
    setRouteAUnavailable(false);
    setRouteAUnavailableReason(null);
    frameMetaRef.current = null;
    lastPresentedAtRef.current = null;
    lastFrameMetaStoreAtRef.current = 0;
    lastAppliedSeqCommittedRef.current = 0;
    presentationSchedulerModeRef.current = 'raf';
    rafPresentationLimitStrikeRef.current = 0;
    decodedDroppedBeforePresentRef.current = 0;

    const clearLookDevTimers = () => {
      if (pendingTimer !== null) {
        window.clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const closePendingPresentation = () => {
      const pending = pendingPresentationRef.current;
      pendingPresentationRef.current = null;
      pending?.frame.close();
    };

    const cancelPendingPresentation = () => {
      if (presentationFrameRef.current !== null) {
        window.cancelAnimationFrame(presentationFrameRef.current);
        presentationFrameRef.current = null;
      }
      if (presentationTimerRef.current !== null) {
        window.clearTimeout(presentationTimerRef.current);
        presentationTimerRef.current = null;
      }
      closePendingPresentation();
    };

    const start = async () => {
      if (typeof VideoDecoder === 'undefined') {
        setRouteAUnavailable(true);
        setRouteAUnavailableReason(modelErrorMessage('error.webCodecsUnavailable'));
        useModelStore.getState().rejectLookDevMode(modelErrorMessage('error.webCodecsUnavailable'));
        return;
      }
      if (!visible || !isViewportStreamSizeReady(viewportSize)) {
        return;
      }

      // Wait for the previous lifecycle's destroy to drain on the engine side
      // before opening a new stream. Cheap when there is no prior stream
      // (resolved promise) and avoids overlapping RenderGraph submissions.
      try {
        await pendingDestroyRef.current;
      } catch {
        // Previous destroy errors are not fatal for the new start.
      }
      if (disposed) {
        return;
      }

      try {
        const store = useModelStore.getState();
        const requestedMode = store.lookDev.requestedMode;
        const shouldReconcileLookDev = requestedMode === selectedRenderMode;
        if (shouldReconcileLookDev) {
          pendingTimer = window.setTimeout(() => {
            const current = useModelStore.getState().lookDev;
            if (current.requestedMode === selectedRenderMode) {
              useModelStore.getState().markLookDevPending(selectedRenderMode);
            }
          }, LOOKDEV_PENDING_DELAY_MS);
          retryTimer = window.setTimeout(() => {
            const current = useModelStore.getState().lookDev;
            if (current.requestedMode === selectedRenderMode && current.status !== 'applied') {
              useModelStore
                .getState()
                .timeoutLookDevMode(modelErrorMessage('error.engineStreamUnavailable'));
            }
          }, LOOKDEV_RETRY_DELAY_MS);
        }
        const stream = await engineClient.startSceneRenderStream(
          createViewportDescriptor(
            sceneId,
            selectedRenderMode,
            store.getCameraPosition(),
            store.cameraTarget,
            viewportSize,
            helperPassesEnabled,
          ),
        );
        if (disposed) {
          void engineClient.controlStream('streams', stream.descriptor.streamId, 'destroy');
          return;
        }

        streamIdRef.current = stream.descriptor.streamId;
        postMessage({ type: 'streamStarted', streamId: stream.descriptor.streamId });
        const confirmedMode = renderModeFromStreamDescriptor(stream.descriptor);
        if (shouldReconcileLookDev && confirmedMode) {
          if (confirmedMode === selectedRenderMode) {
            clearLookDevTimers();
            useModelStore.getState().applyLookDevMode(confirmedMode);
          } else {
            clearLookDevTimers();
            useModelStore
              .getState()
              .rejectLookDevMode(
                `Engine applied ${confirmedMode} instead of ${selectedRenderMode}`,
              );
          }
        }

        const presentLatestFrame = (schedulerTimestamp?: number) => {
          presentationFrameRef.current = null;
          presentationTimerRef.current = null;
          const pending = pendingPresentationRef.current;
          pendingPresentationRef.current = null;
          if (!pending) return;

          const { frame, meta } = pending;
          if (disposed) {
            frame.close();
            return;
          }

          const canvas = canvasRef.current;
          if (!canvas) {
            frame.close();
            return;
          }

          const width = frame.displayWidth || stream.descriptor.width;
          const height = frame.displayHeight || stream.descriptor.height;
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            const presentedAt = performance.now();
            const previousPresentedAt = lastPresentedAtRef.current;
            lastPresentedAtRef.current = presentedAt;
            const presentIntervalMs =
              previousPresentedAt !== null ? presentedAt - previousPresentedAt : undefined;
            if (
              presentationSchedulerModeRef.current === 'raf' &&
              schedulerTimestamp !== undefined &&
              presentIntervalMs !== undefined &&
              presentIntervalMs > RAF_PRESENTATION_LIMIT_INTERVAL_MS
            ) {
              rafPresentationLimitStrikeRef.current += 1;
              if (rafPresentationLimitStrikeRef.current >= RAF_PRESENTATION_LIMIT_STRIKES) {
                presentationSchedulerModeRef.current = 'timer';
              }
            } else if (
              presentationSchedulerModeRef.current === 'raf' &&
              presentIntervalMs !== undefined
            ) {
              rafPresentationLimitStrikeRef.current = 0;
            }
            const presentFps =
              presentIntervalMs !== undefined && presentIntervalMs > 0
                ? 1000 / presentIntervalMs
                : undefined;
            const outputToPresentedMs = presentedAt - pending.decodedAt;
            const drawStarted = performance.now();
            ctx.drawImage(frame, 0, 0, width, height);
            const drawTimeMs = performance.now() - drawStarted;
            if (meta) {
              const drawnMeta = {
                ...meta,
                diagnostics: {
                  ...meta.diagnostics,
                  decodedDroppedBeforePresent: pending.droppedBeforePresent,
                  decodeOutputToPresentedMs: outputToPresentedMs,
                  packetToPresentedMs:
                    meta.diagnostics?.packetToDecodeOutputMs !== undefined
                      ? meta.diagnostics.packetToDecodeOutputMs + outputToPresentedMs
                      : undefined,
                  presentIntervalMs,
                  presentFps,
                  presentationHostLimited: isPresentationHostLimited(presentFps, meta.durationUs),
                  drawTimeMs,
                },
              };
              frameMetaRef.current = drawnMeta;
              const store = useModelStore.getState();
              if (
                presentedAt - lastMemorySampleAtRef.current >=
                VIEWPORT_MEMORY_SAMPLE_INTERVAL_MS
              ) {
                lastMemorySampleAtRef.current = presentedAt;
                const canvasRect = canvas.getBoundingClientRect();
                store.recordViewportMemorySample(
                  sampleViewportMemory({
                    decodedFrameWidth: width,
                    decodedFrameHeight: height,
                    canvasCssWidth: canvasRect.width,
                    canvasCssHeight: canvasRect.height,
                    devicePixelRatio: window.devicePixelRatio || 1,
                  }),
                );
              }
              const hasNewAppliedSeq = drawnMeta.appliedSeq > lastAppliedSeqCommittedRef.current;
              const shouldUpdateFrameMeta =
                hasNewAppliedSeq ||
                presentedAt - lastFrameMetaStoreAtRef.current >=
                  RENDER_FRAME_META_STORE_INTERVAL_MS;
              if (shouldUpdateFrameMeta) {
                lastFrameMetaStoreAtRef.current = presentedAt;
                store.updateRenderFrameMeta(drawnMeta);
              } else {
                store.recordRenderFrameMetricsSample(drawnMeta);
              }
              const frameMode = renderModeFromFrameMeta(drawnMeta);
              if (frameMode === selectedRenderMode) {
                clearLookDevTimers();
                store.applyLookDevMode(frameMode);
              }
              if (hasNewAppliedSeq) {
                lastAppliedSeqCommittedRef.current = drawnMeta.appliedSeq;
                store.commitPredictionsThrough(drawnMeta.appliedSeq);
                store.commitLocalPredictionsThrough(drawnMeta.appliedSeq);
              }
            }
            setHasEngineFrame(true);
          }
          frame.close();
        };

        const schedulePresentation = (frame: VideoFrame, meta?: RenderFrameMeta) => {
          const previous = pendingPresentationRef.current;
          if (previous) {
            previous.frame.close();
            decodedDroppedBeforePresentRef.current += previous.droppedBeforePresent + 1;
          }
          const droppedBeforePresent = decodedDroppedBeforePresentRef.current;
          decodedDroppedBeforePresentRef.current = 0;
          pendingPresentationRef.current = meta
            ? { frame, meta, decodedAt: performance.now(), droppedBeforePresent }
            : { frame, decodedAt: performance.now(), droppedBeforePresent };
          if (
            presentationSchedulerModeRef.current === 'timer' &&
            presentationTimerRef.current === null
          ) {
            presentationTimerRef.current = window.setTimeout(() => presentLatestFrame(), 0);
          } else if (
            presentationSchedulerModeRef.current === 'raf' &&
            presentationFrameRef.current === null
          ) {
            presentationFrameRef.current = window.requestAnimationFrame(presentLatestFrame);
          }
        };

        const h264 = new H264StreamClient({
          websocketUrl: stream.wsUrl,
          descriptor: stream.descriptor,
          width: stream.descriptor.width,
          height: stream.descriptor.height,
          backpressure: backpressureForStreamProfile(streamProfileRef.current),
          onFrameMeta: (meta) => {
            // After dispose, callbacks from in-flight WS messages may still
            // fire; ignore them so we don't pollute the store with frames
            // belonging to a torn-down stream.
            if (disposed) return;
            frameMetaRef.current = meta;
          },
          onFrame: (frame, meta) => {
            if (disposed) {
              frame.close();
              return;
            }
            schedulePresentation(frame, meta);
          },
          onError: (error) => {
            if (disposed) return;
            void webviewErrorHandler.handleError(toError(error), {
              showToUser: false,
              severity: 'warning',
            });
            setRouteAUnavailable(true);
            setRouteAUnavailableReason(modelErrorMessage('error.engineStreamDisconnected'));
          },
        });
        streamClientRef.current = h264;
        await h264.connect();
      } catch (error) {
        if (!disposed) {
          void webviewErrorHandler.handleError(toError(error), {
            showToUser: false,
            severity: 'error',
          });
          setRouteAUnavailable(true);
          setRouteAUnavailableReason(modelErrorMessage('error.engineStreamUnavailable'));
          if (useModelStore.getState().lookDev.requestedMode === selectedRenderMode) {
            useModelStore
              .getState()
              .rejectLookDevMode(modelErrorMessage('error.engineStreamUnavailable'));
          }
        }
      }
    };

    void start();

    return () => {
      disposed = true;
      clearLookDevTimers();
      cancelPendingPresentation();
      streamClientRef.current?.dispose();
      streamClientRef.current = null;
      const streamId = streamIdRef.current;
      streamIdRef.current = null;
      if (streamId) {
        postMessage({ type: 'streamDestroyed', streamId });
        pendingDestroyRef.current = engineClient.controlStream('streams', streamId, 'destroy').then(
          () => undefined,
          () => undefined,
        );
      }
    };
  }, [
    enginePort,
    retryToken,
    sceneId,
    viewportSize,
    helperPassesEnabled,
    visible,
    selectedRenderMode,
  ]);

  const overlayFrameMeta = React.useMemo<RenderFrameMeta | null>(() => {
    const streamId = streamIdRef.current;
    if (!hasEngineFrame || !streamId) {
      return null;
    }
    return (
      frameMetaRef.current ?? {
        streamId,
        viewportId: MAIN_VIEWPORT_ID,
        frameId: 0,
        ptsUs: 0,
        durationUs: 0,
        isKeyframe: true,
        sceneRevision,
        appliedSeq: 0,
        frameTimestamp: 0,
        viewTransform: [1, 0, 0, 1, 0, 0],
      }
    );
  }, [hasEngineFrame, sceneRevision]);
  const viewportFrameMeta = useMemo<ViewportFrameMeta | null>(
    () =>
      overlayFrameMeta ? bridgeRenderFrameMetaToViewportFrameMeta(overlayFrameMeta, sceneId) : null,
    [overlayFrameMeta, sceneId],
  );
  const handleViewportContextMenuAction = React.useCallback(
    (item: ViewportMenuItem) => {
      void handleModelMenuAction(item, modelController);
    },
    [modelController],
  );
  const handleClickSelect = React.useCallback(
    async (normalizedX: number, normalizedY: number) => {
      try {
        const payload: ViewportSerializableRecord = viewportSize
          ? {
              viewportId: MAIN_VIEWPORT_ID,
              sceneId,
              sceneRevision,
              x: normalizedX,
              y: normalizedY,
              resolution: {
                width: viewportSize.width,
                height: viewportSize.height,
                pixelRatio: viewportSize.pixelRatio,
              },
            }
          : {
              viewportId: MAIN_VIEWPORT_ID,
              sceneId,
              sceneRevision,
              x: normalizedX,
              y: normalizedY,
            };
        const event = await modelController.sendViewportCommand('viewport:select', payload);
        await modelController.handleViewportEvent(event);
      } catch (error) {
        void webviewErrorHandler.handleError(toError(error), {
          showToUser: false,
          severity: 'warning',
        });
        onSceneControlError(modelErrorMessage('error.hitTestFailed'));
      }
    },
    [modelController, sceneId, sceneRevision, viewportSize, onSceneControlError],
  );

  return (
    <div ref={viewportRef} className="model-viewport-frame relative h-full w-full overflow-hidden">
      <ViewportShell
        sceneId={sceneId}
        viewportId={MAIN_VIEWPORT_ID}
        controller={modelController}
        frameMeta={viewportFrameMeta}
        className="relative h-full w-full overflow-hidden"
        surface={{
          kind: 'custom',
          node: (
            <canvas
              ref={canvasRef}
              className="model-viewport-video-canvas h-full w-full"
              aria-hidden={!hasEngineFrame}
            />
          ),
        }}
        onContextMenuAction={handleViewportContextMenuAction}
        renderOverlayLayer={({ frameMeta, overlays }) => (
          <>
            <OverlayRenderer frameMeta={frameMeta} overlays={overlays} />
            <ViewportGuideOverlay visible={hudVisible} />
            <InteractionLayer
              viewportId={MAIN_VIEWPORT_ID}
              sceneId={sceneId}
              sceneRevision={sceneRevision}
              resolution={isViewportStreamSizeReady(viewportSize) ? viewportSize : null}
              selectedNodeId={selectedNodeId}
              lightNodeIds={lightNodeIds}
              socket={sceneControlSocket}
              onSelectNode={onSelectNode}
              onQueryError={(error) => onSceneControlError(error.message)}
            />
            <OverlayCanvas
              viewportId={MAIN_VIEWPORT_ID}
              frameMeta={overlayFrameMeta}
              selectedNodeId={selectedNodeId}
              hasPendingPrediction={hasPendingPrediction}
              overlay={overlay}
              predictions={predictions}
              topologyWarning={topologyWarning}
            />
            <ViewportOrbitControls
              viewportId={MAIN_VIEWPORT_ID}
              onClickSelect={handleClickSelect}
              onCameraChange={(options) => {
                markInteractiveStreamActivity();
                scheduleViewportCamera(options);
              }}
              onInteractionActivity={(options) => {
                markInteractiveStreamActivity();
                if (options?.immediate === true) {
                  scheduleViewportCamera({ immediate: true });
                }
              }}
              onCameraMutated={onCameraMutated}
            />
          </>
        )}
        renderToolbar={() => null}
      />
      {routeAUnavailable ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-[rgba(0,0,0,0.24)] text-xs text-[var(--model-fg-secondary)]">
          <span>{routeAUnavailableReason ?? modelErrorMessage('error.routeAUnavailable')}</span>
          <button
            className="pointer-events-auto model-btn-secondary px-2 py-1"
            onClick={() => setRetryToken((token) => token + 1)}
          >
            {modelErrorMessage('error.retry')}
          </button>
        </div>
      ) : null}
      {routeAUnavailable ? (
        <div className="pointer-events-none absolute right-3 top-3 z-40 h-2.5 w-2.5 rounded-full bg-amber-400" />
      ) : null}
    </div>
  );
}

function renderModeFromStreamDescriptor(
  descriptor: RenderStreamDescriptor,
): ViewportRenderMode | null {
  return descriptor.renderMode ?? descriptor.lookdev?.renderMode ?? null;
}

function renderModeFromFrameMeta(meta: RenderFrameMeta): ViewportRenderMode | null {
  const value: unknown = meta;
  if (!isRecord(value)) return null;
  const direct = readViewportRenderMode(value['renderMode']);
  if (direct) return direct;
  const lookdev = value['lookdev'];
  if (isRecord(lookdev)) {
    const mode = readViewportRenderMode(lookdev['renderMode']);
    if (mode) return mode;
  }
  const diagnostics = value['diagnostics'];
  return isRecord(diagnostics) ? readViewportRenderMode(diagnostics['renderMode']) : null;
}

function readViewportRenderMode(value: unknown): ViewportRenderMode | null {
  switch (value) {
    case 'pbr':
    case 'clay':
    case 'wireframe':
    case 'unlit':
    case 'normal':
    case 'depth':
    case 'lightComplexity':
    case 'shadowAtlas':
      return value;
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function captureMaterialPreview(
  enginePort: number,
  onSceneControlError: (message: string) => void,
): Promise<void> {
  try {
    const preview = await new EngineClient(enginePort).captureScenePreview({
      width: 1280,
      height: 720,
      quality: 90,
    });
    useModelStore.getState().setQualityPreview(preview.dataUrl);
  } catch (error) {
    void webviewErrorHandler.handleError(toError(error), {
      showToUser: false,
      severity: 'warning',
    });
    onSceneControlError(modelErrorMessage('error.engineStreamUnavailable'));
  }
}
