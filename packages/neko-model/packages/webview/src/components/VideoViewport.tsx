import React, { useEffect, useRef, useState } from 'react';
import type { RenderFrameMeta, SceneDelta, ViewportDescriptor } from '@neko/shared';
import { EngineClient, H264StreamClient, type SceneControlSocket } from '@neko/neko-client';
import type { LocalPredictionSnapshot } from '../scene/LocalPredictionLayer';
import { InteractionLayer, isCompatibleViewportQueryResult } from './InteractionLayer';
import { OverlayCanvas } from './OverlayCanvas';
import { ViewportOrbitControls } from './ViewportOrbitControls';
import { postMessage } from '@neko/shared/vscode';
import { useModelStore } from '../stores/modelStore';
import type { SceneHitTestResult } from '../scene/SceneDocument';

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
}

const MAIN_VIEWPORT_ID = 'main';

function createViewportDescriptor(
  sceneId: string,
  cameraPosition: [number, number, number],
  cameraTarget: [number, number, number],
): ViewportDescriptor {
  return {
    viewportId: MAIN_VIEWPORT_ID,
    sceneId,
    renderMode: 'pbr',
    resolution: {
      width: 1280,
      height: 720,
      pixelRatio: window.devicePixelRatio || 1,
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
}: VideoViewportProps): React.JSX.Element {
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
        setRouteAUnavailableReason('WebCodecs unavailable');
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
          createViewportDescriptor(sceneId, store.getCameraPosition(), store.cameraTarget),
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
          onError: () => {
            if (disposed) return;
            setRouteAUnavailable(true);
            setRouteAUnavailableReason('Engine stream disconnected');
          },
        });
        streamClientRef.current = h264;
        await h264.connect();
      } catch {
        if (!disposed) {
          setRouteAUnavailable(true);
          setRouteAUnavailableReason('Engine stream unavailable');
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
  }, [enginePort, retryToken, sceneId]);

  if (routeAUnavailable) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-black">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-[var(--model-fg-secondary)]">
          <span>{routeAUnavailableReason ?? 'Route A unavailable'}</span>
          <button
            className="pointer-events-auto model-btn-secondary px-2 py-1"
            onClick={() => setRetryToken((token) => token + 1)}
          >
            Retry
          </button>
        </div>
        <div className="pointer-events-none absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-amber-400" />
      </div>
    );
  }

  const handleClickSelect = React.useCallback(
    async (normalizedX: number, normalizedY: number) => {
      if (!sceneControlSocket) return;
      try {
        const result = (await sceneControlSocket.query('hitTest', {
          viewportId: MAIN_VIEWPORT_ID,
          sceneRevision,
          x: normalizedX,
          y: normalizedY,
        })) as SceneHitTestResult;
        if (isCompatibleViewportQueryResult(result, MAIN_VIEWPORT_ID, sceneRevision)) {
          onSelectNode(result.nodeId);
        }
      } catch {
        onSceneControlError('Hit test failed');
      }
    },
    [sceneControlSocket, sceneRevision, onSelectNode, onSceneControlError],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden={!hasEngineFrame} />
      <InteractionLayer
        viewportId={MAIN_VIEWPORT_ID}
        sceneRevision={sceneRevision}
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
      <ViewportOrbitControls enginePort={enginePort} onClickSelect={handleClickSelect} />
    </div>
  );
}
