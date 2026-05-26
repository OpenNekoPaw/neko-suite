import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RenderFrameMeta, SceneDelta, ViewportDescriptor } from '@neko/shared';
import type { ViewportMenuItem, ViewportFrameMeta, ViewportSerializableRecord } from '@neko/shared';
import { OverlayRenderer, ViewportShell } from '@neko/ui';
import {
  EngineClient,
  H264StreamClient,
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
  onSelectNode: (nodeId: string | null) => void;
  onSceneControlError: (message: string) => void;
  onCameraMutated?: () => void;
}

const MAIN_VIEWPORT_ID = 'main';
const DEFAULT_VIEWPORT_STREAM_SIZE = { width: 1280, height: 720, pixelRatio: 1 };
const MAX_VIEWPORT_STREAM_PIXELS = 1920 * 1080;
const MAX_VIEWPORT_DEVICE_PIXEL_RATIO = 1.5;
const VIEWPORT_DIMENSION_BUCKET = 16;
const MIN_VISIBLE_VIEWPORT_DIMENSION = 64;
const VIEWPORT_STREAM_FPS = 60;

type ViewportStreamSize = SceneViewportResolution;

interface PendingPresentationFrame {
  frame: VideoFrame;
  meta?: RenderFrameMeta;
}

function bucketStreamDimension(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return VIEWPORT_DIMENSION_BUCKET;
  }
  const bucketed = Math.max(
    VIEWPORT_DIMENSION_BUCKET,
    Math.round(value / VIEWPORT_DIMENSION_BUCKET) * VIEWPORT_DIMENSION_BUCKET,
  );
  return bucketed % 2 === 0 ? bucketed : bucketed + 1;
}

function createViewportStreamSize(rect: DOMRectReadOnly): ViewportStreamSize {
  const cssWidth = Math.max(0, rect.width);
  const cssHeight = Math.max(0, rect.height);
  if (cssWidth < MIN_VISIBLE_VIEWPORT_DIMENSION || cssHeight < MIN_VISIBLE_VIEWPORT_DIMENSION) {
    return {
      width: 0,
      height: 0,
      pixelRatio: DEFAULT_VIEWPORT_STREAM_SIZE.pixelRatio,
    };
  }
  const pixelRatio = Math.min(
    Math.max(window.devicePixelRatio || DEFAULT_VIEWPORT_STREAM_SIZE.pixelRatio, 1),
    MAX_VIEWPORT_DEVICE_PIXEL_RATIO,
  );

  let width = cssWidth * pixelRatio;
  let height = cssHeight * pixelRatio;
  const pixels = width * height;
  if (pixels > MAX_VIEWPORT_STREAM_PIXELS) {
    const scale = Math.sqrt(MAX_VIEWPORT_STREAM_PIXELS / pixels);
    width *= scale;
    height *= scale;
  }

  return {
    width: bucketStreamDimension(width),
    height: bucketStreamDimension(height),
    pixelRatio,
  };
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
  cameraPosition: [number, number, number],
  cameraTarget: [number, number, number],
  streamSize: ViewportStreamSize,
  helperPassesEnabled: boolean,
): ViewportDescriptor {
  return {
    viewportId: MAIN_VIEWPORT_ID,
    sceneId,
    renderMode: 'pbr',
    resolution: {
      width: streamSize.width,
      height: streamSize.height,
      pixelRatio: streamSize.pixelRatio,
    },
    fps: VIEWPORT_STREAM_FPS,
    colorSpace: 'srgb',
    toneMapping: 'aces',
    postProcess: {
      bloom: false,
      ssao: false,
      taa: false,
    },
    helperPassesEnabled,
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
      sceneControlSocket,
    ],
  );

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return;
    }

    const updateSize = (rect: DOMRectReadOnly) => {
      const next = createViewportStreamSize(rect);
      setViewportSize((current) => (areViewportStreamSizesEqual(current, next) ? current : next));
    };

    updateSize(element.getBoundingClientRect());
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        updateSize(entry.contentRect);
      }
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const sendViewportCamera = React.useCallback(() => {
    const store = useModelStore.getState();
    const position = store.getCameraPosition();
    const target = store.cameraTarget;

    const sendSceneControlCamera = async () => {
      if (!sceneControlSocket?.isOpen()) {
        return;
      }
      await sceneControlSocket.updateViewportCamera({
        sceneId,
        sceneRevision,
        viewportId: MAIN_VIEWPORT_ID,
        position,
        target,
        resolution: isViewportStreamSizeReady(viewportSize) ? viewportSize : undefined,
      });
      sceneControlSocket.requestKeyframe(MAIN_VIEWPORT_ID);
    };

    void sendSceneControlCamera().catch((error: unknown) => {
      void webviewErrorHandler.handleError(toError(error), {
        showToUser: false,
        severity: 'error',
      });
      onSceneControlError(modelErrorMessage('error.cameraUpdateFailed'));
    });
  }, [sceneControlSocket, sceneId, sceneRevision, viewportSize, onSceneControlError]);

  useEffect(() => {
    let disposed = false;
    const engineClient = new EngineClient(enginePort);
    setHasEngineFrame(false);
    setRouteAUnavailable(false);
    setRouteAUnavailableReason(null);
    frameMetaRef.current = null;

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
      closePendingPresentation();
    };

    const start = async () => {
      if (typeof VideoDecoder === 'undefined') {
        setRouteAUnavailable(true);
        setRouteAUnavailableReason(modelErrorMessage('error.webCodecsUnavailable'));
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
        const stream = await engineClient.startSceneRenderStream(
          createViewportDescriptor(
            sceneId,
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

        const presentLatestFrame = () => {
          presentationFrameRef.current = null;
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
            const drawStarted = performance.now();
            ctx.drawImage(frame, 0, 0, width, height);
            const drawTimeMs = performance.now() - drawStarted;
            if (meta) {
              const drawnMeta = {
                ...meta,
                diagnostics: {
                  ...meta.diagnostics,
                  drawTimeMs,
                },
              };
              frameMetaRef.current = drawnMeta;
              const store = useModelStore.getState();
              store.recordRenderFrameMeta(drawnMeta);
              if (drawnMeta.appliedSeq > 0) {
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
          }
          pendingPresentationRef.current = meta ? { frame, meta } : { frame };
          if (presentationFrameRef.current === null) {
            presentationFrameRef.current = window.requestAnimationFrame(presentLatestFrame);
          }
        };

        const h264 = new H264StreamClient({
          websocketUrl: stream.wsUrl,
          descriptor: stream.descriptor,
          width: stream.descriptor.width,
          height: stream.descriptor.height,
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
        }
      }
    };

    void start();

    return () => {
      disposed = true;
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
  }, [enginePort, retryToken, sceneId, viewportSize, helperPassesEnabled, visible]);

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

  if (routeAUnavailable) {
    return (
      <div
        ref={viewportRef}
        className="model-viewport-frame relative h-full w-full overflow-hidden"
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-[var(--model-fg-secondary)]">
          <span>{routeAUnavailableReason ?? modelErrorMessage('error.routeAUnavailable')}</span>
          <button
            className="pointer-events-auto model-btn-secondary px-2 py-1"
            onClick={() => setRetryToken((token) => token + 1)}
          >
            {modelErrorMessage('error.retry')}
          </button>
        </div>
        <ViewportGuideOverlay visible />
        <div className="pointer-events-none absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-amber-400" />
      </div>
    );
  }

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
          node: <canvas ref={canvasRef} className="h-full w-full" aria-hidden={!hasEngineFrame} />,
        }}
        onContextMenuAction={handleViewportContextMenuAction}
        renderOverlayLayer={({ frameMeta, overlays }) => (
          <>
            <OverlayRenderer frameMeta={frameMeta} overlays={overlays} />
            <ViewportGuideOverlay visible />
            <InteractionLayer
              viewportId={MAIN_VIEWPORT_ID}
              sceneId={sceneId}
              sceneRevision={sceneRevision}
              resolution={isViewportStreamSizeReady(viewportSize) ? viewportSize : null}
              selectedNodeId={selectedNodeId}
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
              onCameraChange={sendViewportCamera}
              onCameraMutated={onCameraMutated}
            />
          </>
        )}
        renderToolbar={() => null}
      />
    </div>
  );
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
