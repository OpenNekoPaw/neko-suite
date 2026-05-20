import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RenderFrameMeta, SceneDelta, ViewportDescriptor } from '@neko/shared';
import {
  EngineClient,
  H264StreamClient,
  type SceneControlSocket,
  type SceneViewportCameraAck,
  type SceneViewportResolution,
  SceneViewportCameraRejectedError,
} from '@neko/neko-client';
import type { LocalPredictionSnapshot } from '../scene/LocalPredictionLayer';
import { InteractionLayer, isCompatibleViewportQueryResult } from './InteractionLayer';
import { buildViewportQueryCamera } from './InteractionLayer';
import { OverlayCanvas } from './OverlayCanvas';
import { ViewportOrbitControls } from './ViewportOrbitControls';
import { ViewportGuideOverlay } from './ViewportGuideOverlay';
import { ViewportNavigationControls } from './ViewportNavigationControls';
import { postMessage } from '@neko/shared/vscode';
import { useModelStore } from '../stores/modelStore';
import type { SceneHitTestResult } from '../scene/SceneDocument';
import { modelErrorMessage, toError, webviewErrorHandler } from '../platform/errors';

export interface VideoViewportProps {
  enginePort: number;
  sceneId: string;
  sceneRevision: number;
  selectedNodeId: string | null;
  hasPendingPrediction: boolean;
  sceneControlSocket: SceneControlSocket | null;
  overlay?: NonNullable<SceneDelta['overlay']> | null;
  predictions?: LocalPredictionSnapshot[];
  topologyWarning?: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onSceneControlError: (message: string) => void;
  onCameraMutated?: () => void;
}

const MAIN_VIEWPORT_ID = 'main';
const DEFAULT_VIEWPORT_STREAM_SIZE = { width: 1280, height: 720, pixelRatio: 1 };
const MAX_VIEWPORT_STREAM_PIXELS = 1280 * 720;
const MAX_VIEWPORT_DEVICE_PIXEL_RATIO = 1.25;
const VIEWPORT_DIMENSION_BUCKET = 16;

type ViewportStreamSize = SceneViewportResolution;

function bucketStreamDimension(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return VIEWPORT_DIMENSION_BUCKET;
  }
  return Math.max(
    VIEWPORT_DIMENSION_BUCKET,
    Math.round(value / VIEWPORT_DIMENSION_BUCKET) * VIEWPORT_DIMENSION_BUCKET,
  );
}

function createViewportStreamSize(rect: DOMRectReadOnly): ViewportStreamSize {
  const cssWidth = Math.max(1, rect.width);
  const cssHeight = Math.max(1, rect.height);
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

function isViewportCameraAckCompatible(
  ack: SceneViewportCameraAck,
  sceneId: string,
  sceneRevision: number,
  viewportId: string,
): boolean {
  if (ack.sceneId !== undefined && ack.sceneId !== sceneId) {
    return false;
  }
  if (ack.viewportId !== undefined && ack.viewportId !== viewportId) {
    return false;
  }
  const acceptedRevision = ack.acceptedRevision ?? ack.revision;
  return acceptedRevision === undefined || acceptedRevision >= sceneRevision;
}

function createViewportDescriptor(
  sceneId: string,
  cameraPosition: [number, number, number],
  cameraTarget: [number, number, number],
  streamSize: ViewportStreamSize,
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
    fps: 30,
    colorSpace: 'srgb',
    toneMapping: 'aces',
    postProcess: {
      bloom: false,
      ssao: true,
      taa: true,
    },
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
  // Serialise stream lifecycle across rerenders. Without this, a rapid
  // sceneId change would dispose stream A and start stream B in parallel,
  // letting two RenderGraph submissions race for the same wgpu device queue
  // (observed as duplicate `pbr_render_graph_encoder` validation errors).
  const pendingDestroyRef = useRef<Promise<void>>(Promise.resolve());
  const [frameMeta, setFrameMeta] = useState<RenderFrameMeta | null>(null);
  const [hasEngineFrame, setHasEngineFrame] = useState(false);
  const [routeAUnavailable, setRouteAUnavailable] = useState(false);
  const [routeAUnavailableReason, setRouteAUnavailableReason] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [viewportSize, setViewportSize] = useState<ViewportStreamSize | null>(null);
  const showViewportGrid = useModelStore((state) => state.showViewportGrid);

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

    const sendHttpFallback = async () => {
      const client = new EngineClient(enginePort);
      await client.updateEditorCamera(position, target, undefined, MAIN_VIEWPORT_ID);
    };

    if (!sceneControlSocket) {
      void sendHttpFallback().catch((error: unknown) => {
        void webviewErrorHandler.handleError(toError(error), {
          showToUser: false,
          severity: 'error',
        });
        onSceneControlError(modelErrorMessage('error.cameraUpdateFailed'));
      });
      return;
    }

    void sceneControlSocket
      .updateViewportCamera({
        sceneId,
        sceneRevision,
        viewportId: MAIN_VIEWPORT_ID,
        position,
        target,
        resolution: viewportSize ?? undefined,
      })
      .then((ack) => {
        if (!isViewportCameraAckCompatible(ack, sceneId, sceneRevision, MAIN_VIEWPORT_ID)) {
          onSceneControlError(modelErrorMessage('error.cameraAckViewportMismatch'));
          return;
        }
        sceneControlSocket.requestKeyframe(MAIN_VIEWPORT_ID);
      })
      .catch((error: unknown) => {
        if (error instanceof SceneViewportCameraRejectedError) {
          throw error;
        }
        return sendHttpFallback();
      })
      .catch((error: unknown) => {
        void webviewErrorHandler.handleError(toError(error), {
          showToUser: false,
          severity: 'error',
        });
        onSceneControlError(modelErrorMessage('error.cameraUpdateFailed'));
      });
  }, [enginePort, sceneControlSocket, sceneId, sceneRevision, viewportSize, onSceneControlError]);

  const handleClickSelect = React.useCallback(
    async (normalizedX: number, normalizedY: number) => {
      if (!sceneControlSocket) return;
      try {
        const result = (await sceneControlSocket.query('hitTest', {
          viewportId: MAIN_VIEWPORT_ID,
          sceneId,
          sceneRevision,
          resolution: viewportSize ?? undefined,
          x: normalizedX,
          y: normalizedY,
          camera: buildViewportQueryCamera(),
        })) as SceneHitTestResult;
        if (isCompatibleViewportQueryResult(result, sceneId, MAIN_VIEWPORT_ID, sceneRevision)) {
          onSelectNode(result.nodeId);
        }
      } catch (error) {
        void webviewErrorHandler.handleError(toError(error), {
          showToUser: false,
          severity: 'warning',
        });
        onSceneControlError(modelErrorMessage('error.hitTestFailed'));
      }
    },
    [sceneControlSocket, sceneId, sceneRevision, viewportSize, onSelectNode, onSceneControlError],
  );

  useEffect(() => {
    let disposed = false;
    const engineClient = new EngineClient(enginePort);
    setHasEngineFrame(false);
    setRouteAUnavailable(false);
    setRouteAUnavailableReason(null);
    setFrameMeta(null);

    const start = async () => {
      if (typeof VideoDecoder === 'undefined') {
        setRouteAUnavailable(true);
        setRouteAUnavailableReason(modelErrorMessage('error.webCodecsUnavailable'));
        return;
      }
      if (!viewportSize) {
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
          ),
        );
        if (disposed) {
          void engineClient.controlStream('streams', stream.descriptor.streamId, 'destroy');
          return;
        }

        streamIdRef.current = stream.descriptor.streamId;
        postMessage({ type: 'streamStarted', streamId: stream.descriptor.streamId });
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
            setFrameMeta(meta);
            useModelStore.getState().recordRenderFrameMeta(meta);
            if (meta.appliedSeq > 0) {
              useModelStore.getState().commitPredictionsThrough(meta.appliedSeq);
              useModelStore.getState().commitLocalPredictionsThrough(meta.appliedSeq);
            }
          },
          onFrame: (frame) => {
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
              ctx.drawImage(frame, 0, 0, width, height);
              setHasEngineFrame(true);
            }
            frame.close();
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
  }, [enginePort, retryToken, sceneId, viewportSize]);

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
        <ViewportGuideOverlay visible={showViewportGrid} />
        <ViewportNavigationControls
          viewportId={MAIN_VIEWPORT_ID}
          onCameraChange={sendViewportCamera}
          onCameraMutated={onCameraMutated}
        />
        <div className="pointer-events-none absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-amber-400" />
      </div>
    );
  }

  return (
    <div ref={viewportRef} className="model-viewport-frame relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden={!hasEngineFrame} />
      <ViewportGuideOverlay visible={showViewportGrid} />
      <InteractionLayer
        viewportId={MAIN_VIEWPORT_ID}
        sceneId={sceneId}
        sceneRevision={sceneRevision}
        resolution={viewportSize}
        selectedNodeId={selectedNodeId}
        socket={sceneControlSocket}
        onSelectNode={onSelectNode}
        onQueryError={(error) => onSceneControlError(error.message)}
      />
      <OverlayCanvas
        viewportId={MAIN_VIEWPORT_ID}
        frameMeta={
          frameMeta ?? {
            streamId: streamIdRef.current ?? '',
            viewportId: MAIN_VIEWPORT_ID,
            frameId: 0,
            ptsUs: 0,
            durationUs: 0,
            isKeyframe: true,
            sceneRevision,
            appliedSeq: 0,
          }
        }
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
      <ViewportNavigationControls
        viewportId={MAIN_VIEWPORT_ID}
        onCameraChange={sendViewportCamera}
        onCameraMutated={onCameraMutated}
      />
    </div>
  );
}
