import React, { useEffect, useRef, useState } from 'react';
import type { RenderFrameMeta, SceneDelta, ViewportDescriptor } from '@neko/shared';
import { EngineClient, H264StreamClient, type SceneControlSocket } from '@neko/neko-client';
import type { LocalPredictionSnapshot } from '../scene/LocalPredictionLayer';
import { InteractionLayer } from './InteractionLayer';
import { OverlayCanvas } from './OverlayCanvas';
import { useModelStore } from '../stores/modelStore';

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

function createViewportDescriptor(sceneId: string): ViewportDescriptor {
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

      try {
        const stream = await engineClient.startSceneRenderStream(createViewportDescriptor(sceneId));
        if (disposed) {
          void engineClient.controlStream('streams', stream.descriptor.streamId, 'destroy');
          return;
        }

        streamIdRef.current = stream.descriptor.streamId;
        const h264 = new H264StreamClient({
          websocketUrl: stream.wsUrl,
          descriptor: stream.descriptor,
          width: stream.descriptor.width,
          height: stream.descriptor.height,
          onFrameMeta: (meta) => {
            setFrameMeta(meta);
            useModelStore.getState().recordRenderFrameMeta(meta);
            if (meta.appliedSeq > 0) {
              useModelStore.getState().commitPredictionsThrough(meta.appliedSeq);
              useModelStore.getState().commitLocalPredictionsThrough(meta.appliedSeq);
            }
          },
          onFrame: (frame) => {
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
        void engineClient.controlStream('streams', streamId, 'destroy');
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
    </div>
  );
}
