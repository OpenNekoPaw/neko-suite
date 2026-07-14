import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  LiveCompositorScene,
  RenderFrameMeta,
  ViewportControlConnectionState,
  ViewportFrameMeta,
} from '@neko/shared';
import { EngineClient, H264StreamClient } from '@neko/neko-client';
import { Badge } from '@neko/ui/primitives';
import { ViewportShell, bridgeRenderFrameMetaToViewportFrameMeta } from '@neko/ui';
import { EmptyState } from './components/EmptyState';
import { TrackingPanel } from './components/TrackingPanel';
import { useLiveStore } from './stores/liveStore';
import type { LiveExtensionMessage } from './types/messages';
import { vscode } from './vscode-api';
import { CanvasRecorder } from './recording/CanvasRecorder';
import { t } from './i18n';
import { NEKO_LIVE_LOCAL_PREVIEW_ENABLED } from './rendererMigration';
import {
  LiveCompositorCanvas,
  type LiveCompositorCanvasHandle,
} from './viewport/LiveCompositorCanvas';
import { LiveController } from './viewport/LiveController';
import {
  LIVE_COMPOSITOR_SCENE_ID,
  LIVE_COMPOSITOR_VIEWPORT_ID,
  createDefaultLiveCompositorScene,
} from './viewport/liveCompositorScene';
import { selectLiveVisualPath, type LiveCompositorStatus } from './viewport/liveVisualPath';
import { LiveLocalPreviewSurface } from './viewport/LiveLocalPreviewSurface';

export function App() {
  const canvasRecorder = useMemo(() => new CanvasRecorder(), []);
  const viewportRef = useRef<HTMLDivElement>(null);
  const liveCanvasRef = useRef<LiveCompositorCanvasHandle>(null);
  const streamClientRef = useRef<H264StreamClient | null>(null);
  const liveEngineClientRef = useRef<EngineClient | null>(null);
  const liveSceneRef = useRef<LiveCompositorScene>(createDefaultLiveCompositorScene());
  const [enginePort, setEnginePort] = useState<number | null>(null);
  const [liveScene, setLiveScene] = useState<LiveCompositorScene>(() => liveSceneRef.current);
  const [frameMeta, setFrameMeta] = useState<ViewportFrameMeta | null>(null);
  const [compositorStatus, setCompositorStatus] = useState<LiveCompositorStatus>('idle');
  const [liveControlState, setLiveControlState] =
    useState<ViewportControlConnectionState>('disconnected');
  const [sceneSyncVersion, setSceneSyncVersion] = useState(0);
  const {
    avatarUrl,
    avatarType,
    recordingState,
    applyTrackingData,
    setAvatarUrl,
    setIsTracking,
    setPuppetParameters,
    applyPuppetDelta,
    setRecordingState,
    setRecordingElapsed,
    setLastRecordingPath,
    setLastRecordingRetained,
    setAvatarLoaded,
    setDeviceBinding,
    deviceBindings,
  } = useLiveStore();

  const isRecording = recordingState === 'recording';

  const handleCompositorError = useCallback((message: string) => {
    vscode.postMessage({ type: 'showWarning', message });
  }, []);

  const liveController = useMemo(() => {
    if (enginePort === null) return null;
    return new LiveController({
      enginePort,
      scene: liveSceneRef.current,
      viewportId: LIVE_COMPOSITOR_VIEWPORT_ID,
      controlConnectionState: 'disconnected',
      onSceneChange: setLiveScene,
      onError: handleCompositorError,
    });
  }, [enginePort, handleCompositorError]);
  const visualPath = selectLiveVisualPath({
    compositorStatus,
    hasController: liveController !== null,
    hasAvatar: avatarUrl !== null,
    localPreviewEnabled: NEKO_LIVE_LOCAL_PREVIEW_ENABLED,
  });

  useEffect(() => {
    liveSceneRef.current = liveScene;
    liveController?.updateScene(liveScene);
  }, [liveController, liveScene]);
  useEffect(() => {
    liveController?.updateControlConnectionState(liveControlState);
  }, [liveControlState, liveController]);

  useEffect(() => {
    setLiveScene((previous) => {
      const next = createDefaultLiveCompositorScene({
        avatarUrl,
        avatarType,
        cameraBinding: deviceBindings.camera,
      });
      return {
        ...next,
        revision: previous.revision,
        activePresetId: previous.activePresetId ?? next.activePresetId,
        trackingOverlay: {
          ...next.trackingOverlay,
          enabled: previous.trackingOverlay.enabled,
          visible: previous.trackingOverlay.visible,
          mode: previous.trackingOverlay.mode,
        },
        updatedAt: Date.now(),
      };
    });
    setSceneSyncVersion((version) => version + 1);
  }, [
    avatarType,
    avatarUrl,
    deviceBindings.camera?.label,
    deviceBindings.camera?.sessionId,
    deviceBindings.camera?.compositorSourceRef?.sourceId,
    deviceBindings.camera?.compositorSourceRef?.deviceSessionRef,
  ]);

  useEffect(() => {
    if (enginePort === null || sceneSyncVersion === 0 || compositorStatus === 'idle') return;
    const client = liveEngineClientRef.current ?? new EngineClient(enginePort);
    client.createOrUpdateLiveCompositorScene(liveSceneRef.current).catch((error: unknown) => {
      handleCompositorError(error instanceof Error ? error.message : String(error));
    });
  }, [compositorStatus, enginePort, handleCompositorError, sceneSyncVersion]);

  useEffect(() => {
    if (enginePort === null) return undefined;

    let disposed = false;
    let streamId: string | undefined;
    const client = new EngineClient(enginePort);
    liveEngineClientRef.current = client;
    setCompositorStatus('starting');
    setLiveControlState('connecting');

    const start = async (): Promise<void> => {
      try {
        const scene = await client.createOrUpdateLiveCompositorScene(liveSceneRef.current);
        if (disposed) return;
        setLiveScene(scene);
        setLiveControlState('connected');

        const handle = await client.startLiveCompositorStream({
          sceneId: scene.sceneId,
          viewportId: LIVE_COMPOSITOR_VIEWPORT_ID,
          width: scene.canvas.width,
          height: scene.canvas.height,
          fps: scene.canvas.fps,
        });
        if (disposed) {
          await client.stopLiveCompositorStream({ streamId: handle.descriptor.streamId });
          return;
        }

        streamId = handle.descriptor.streamId;
        const streamClient = new H264StreamClient({
          websocketUrl: handle.wsUrl,
          descriptor: handle.descriptor,
          width: handle.descriptor.width,
          height: handle.descriptor.height,
          onFrame: (frame, meta) => {
            drawCompositorFrame(liveCanvasRef.current, frame, meta, setFrameMeta);
          },
          onFrameMeta: (meta) => {
            setFrameMeta(bridgeLiveFrameMeta(meta));
          },
          onConnectionChange: (connected) => {
            if (!disposed) {
              setCompositorStatus(connected ? 'active' : 'unavailable');
              setLiveControlState(connected ? 'connected' : 'degraded');
            }
          },
          onError: (error) => {
            if (!disposed) {
              setCompositorStatus('unavailable');
              setLiveControlState('degraded');
              handleCompositorError(`${t('diagnostics.compositorUnavailable')}: ${error.message}`);
            }
          },
        });
        streamClientRef.current = streamClient;
        await streamClient.connect();
      } catch (error) {
        if (!disposed) {
          setCompositorStatus('unavailable');
          setLiveControlState('disconnected');
          handleCompositorError(
            `${t('diagnostics.compositorUnavailable')}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    };

    void start();

    return () => {
      disposed = true;
      streamClientRef.current?.dispose();
      streamClientRef.current = null;
      if (streamId) {
        void client.stopLiveCompositorStream({ streamId }).catch(() => undefined);
      }
      if (liveEngineClientRef.current === client) {
        liveEngineClientRef.current = null;
      }
      setLiveControlState('closed');
    };
  }, [enginePort, handleCompositorError]);

  const handleLiveToolbarAction = useCallback(
    (item: Parameters<LiveController['handleToolbarAction']>[0]) => {
      void liveController?.handleToolbarAction(item);
    },
    [liveController],
  );

  const handleLiveMenuAction = useCallback(
    (item: Parameters<LiveController['handleMenuAction']>[0]) => {
      void liveController?.handleMenuAction(item);
    },
    [liveController],
  );

  // ─── Recording: webview-driven (canvas must exist here) ─────────────

  /** Called by TrackingPanel "Rec" button. Checks preconditions before starting. */
  const handleStartRecording = useCallback(
    (includeAudio: boolean) => {
      const { avatarUrl: url, isAvatarLoaded: loaded } = useLiveStore.getState();

      // Check 1: avatar must be loaded
      if (!url || !loaded) {
        vscode.postMessage({ type: 'showWarning', message: t('recording.noAvatar') });
        return;
      }

      // Check 2: canvas must exist in viewport
      const canvas = viewportRef.current?.querySelector('canvas');
      if (!canvas) {
        vscode.postMessage({ type: 'showWarning', message: t('recording.noCanvas') });
        return;
      }

      // Check 3: try to start canvas capture
      const error = canvasRecorder.start(canvas);
      if (error) {
        vscode.postMessage({
          type: 'showError',
          message: `${t('recording.captureFailed')}: ${error}`,
        });
        return;
      }

      // Canvas capture started — tell extension host to start audio + progress timer
      setRecordingState('recording');
      setRecordingElapsed(0);
      vscode.postMessage({ type: 'startRecording', includeAudio, authority: 'local-preview' });
    },
    [canvasRecorder, setRecordingState, setRecordingElapsed],
  );

  /** Stop recording: stop canvas capture, send blob, notify extension host */
  const handleStopRecording = useCallback(async () => {
    setRecordingState('stopping');

    // Stop canvas capture
    const blob = await canvasRecorder.stop();

    // Send video blob to extension host for disk save
    if (blob && blob.size > 0) {
      try {
        const dataUrl = await CanvasRecorder.blobToDataUrl(blob);
        vscode.postMessage({ type: 'videoRecordingBlob', dataUrl, mimeType: blob.type });
      } catch (err) {
        vscode.postMessage({
          type: 'showError',
          message: `${t('recording.captureFailed')}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    }

    // Tell extension host to stop audio recording
    vscode.postMessage({ type: 'stopRecording' });
  }, [canvasRecorder, setRecordingState]);

  useEffect(() => {
    return () => {
      if (canvasRecorder.isRecording) {
        void canvasRecorder.stop();
      }
    };
  }, [canvasRecorder]);

  // Expose handlers to TrackingPanel via store
  useEffect(() => {
    useLiveStore.setState({
      onStartRecording: handleStartRecording,
      onStopRecording: handleStopRecording,
    });
  }, [handleStartRecording, handleStopRecording]);

  // ─── Message bridge: Extension Host → Webview ───────────────────────

  useEffect(() => {
    const handler = (event: MessageEvent<LiveExtensionMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case 'vmcTrackingData':
          applyTrackingData(msg.data);
          break;

        case 'avatarSelected':
          setAvatarUrl(msg.uri, msg.avatarType);
          if (msg.avatarType === 'puppet') {
            setAvatarLoaded(true);
          }
          break;

        case 'puppetLoaded':
          setPuppetParameters(msg.parameters);
          break;

        case 'puppetDelta':
          applyPuppetDelta(msg.delta);
          break;

        case 'trackingStatus':
          setIsTracking(msg.active);
          break;

        case 'recordingStopped':
          setRecordingState('idle');
          setLastRecordingPath(msg.filePath);
          setLastRecordingRetained(false);
          break;

        case 'recordingPromoted':
          setLastRecordingPath(msg.filePath);
          setLastRecordingRetained(true);
          break;

        case 'recordingProgress':
          setRecordingElapsed(msg.elapsedMs);
          break;

        case 'deviceBindingChanged':
          setDeviceBinding(msg.role, msg.binding);
          break;

        case 'enginePort':
          setEnginePort(msg.port);
          break;

        default:
          break;
      }
    };

    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'ready' });
    vscode.postMessage({ type: 'requestEnginePort' });

    return () => window.removeEventListener('message', handler);
  }, [
    applyTrackingData,
    setAvatarUrl,
    setIsTracking,
    setPuppetParameters,
    applyPuppetDelta,
    setRecordingState,
    setRecordingElapsed,
    setLastRecordingPath,
    setLastRecordingRetained,
    setAvatarLoaded,
    setDeviceBinding,
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Avatar viewport with recording border */}
      <div
        ref={viewportRef}
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          border: isRecording ? '2px solid #ef4444' : '2px solid transparent',
          transition: 'border-color 0.2s',
        }}
      >
        {visualPath === 'compositor' && liveController ? (
          <ViewportShell
            className="live-viewport-shell"
            sceneId={LIVE_COMPOSITOR_SCENE_ID}
            viewportId={LIVE_COMPOSITOR_VIEWPORT_ID}
            controller={liveController}
            frameMeta={frameMeta}
            surface={{
              kind: 'custom',
              node: <LiveCompositorCanvas ref={liveCanvasRef} />,
              label: 'Live compositor',
            }}
            onToolbarAction={handleLiveToolbarAction}
            onContextMenuAction={handleLiveMenuAction}
          />
        ) : visualPath === 'local-preview' ? (
          <LiveLocalPreviewSurface avatarType={avatarType ?? undefined} />
        ) : (
          <EmptyState />
        )}

        {/* REC badge overlay */}
        {isRecording && (
          <Badge
            tone="danger"
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(239, 68, 68, 0.85)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              pointerEvents: 'none',
              animation: 'blink 1s infinite',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
            {t('recording.rec')}
          </Badge>
        )}
      </div>

      <TrackingPanel />

      <style>{`@keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
    </div>
  );
}

function drawCompositorFrame(
  canvas: LiveCompositorCanvasHandle | null,
  frame: VideoFrame,
  meta: RenderFrameMeta | undefined,
  commitFrameMeta: (meta: ViewportFrameMeta) => void,
): void {
  try {
    canvas?.drawFrame(frame);
    if (meta) {
      commitFrameMeta(bridgeLiveFrameMeta(meta));
    }
  } finally {
    frame.close();
  }
}

function bridgeLiveFrameMeta(meta: RenderFrameMeta): ViewportFrameMeta {
  return bridgeRenderFrameMetaToViewportFrameMeta(meta, LIVE_COMPOSITOR_SCENE_ID);
}
