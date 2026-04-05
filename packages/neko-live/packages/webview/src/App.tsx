import { useEffect, useRef, useCallback } from 'react';
import { Viewport3D } from './components/Viewport3D';
import { PuppetViewer } from './components/PuppetViewer';
import { EmptyState } from './components/EmptyState';
import { TrackingPanel } from './components/TrackingPanel';
import { useLiveStore } from './stores/liveStore';
import type { LiveExtensionMessage } from './types/messages';
import { vscode } from './vscode-api';
import { CanvasRecorder } from './recording/CanvasRecorder';
import { t } from './i18n';

const canvasRecorder = new CanvasRecorder();

export function App() {
  const viewportRef = useRef<HTMLDivElement>(null);
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
    setAvatarLoaded,
  } = useLiveStore();

  const isRecording = recordingState === 'recording';

  // Find the canvas element inside the viewport container
  const findCanvas = useCallback((): HTMLCanvasElement | null => {
    return viewportRef.current?.querySelector('canvas') ?? null;
  }, []);

  // Try to start canvas capture (best-effort, recording works without it)
  const tryStartCanvasCapture = useCallback(() => {
    const canvas = findCanvas();
    if (!canvas) {
      console.info('[CanvasRecorder] No canvas in viewport — audio-only recording');
      return;
    }
    console.info(`[CanvasRecorder] Found canvas ${canvas.width}x${canvas.height}`);
    const error = canvasRecorder.start(canvas);
    if (error) {
      console.warn(`[CanvasRecorder] Canvas capture unavailable: ${error} — audio-only recording`);
    } else {
      console.info('[CanvasRecorder] Canvas capture started');
    }
  }, [findCanvas]);

  // Stop canvas capture and send blob to extension (if capture was active)
  const stopCanvasCapture = useCallback(async () => {
    if (!canvasRecorder.isRecording) return;
    const blob = await canvasRecorder.stop();
    if (blob && blob.size > 0) {
      try {
        const dataUrl = await CanvasRecorder.blobToDataUrl(blob);
        vscode.postMessage({ type: 'videoRecordingBlob', dataUrl, mimeType: blob.type });
      } catch (err) {
        console.error('[CanvasRecorder] Failed to convert blob:', err);
      }
    }
  }, []);

  // Message bridge: Extension Host → Webview
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

        case 'recordingStarted':
          setRecordingState('recording');
          setRecordingElapsed(0);
          tryStartCanvasCapture();
          break;

        case 'recordingStopped':
          setRecordingState('idle');
          setLastRecordingPath(msg.filePath);
          break;

        case 'stopCanvasCapture' as string:
          stopCanvasCapture();
          break;

        case 'recordingProgress':
          setRecordingElapsed(msg.elapsedMs);
          break;

        case 'enginePort':
          break;

        default:
          break;
      }
    };

    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'ready' });

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
    setAvatarLoaded,
    tryStartCanvasCapture,
    stopCanvasCapture,
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
        {!avatarUrl ? <EmptyState /> : avatarType === 'puppet' ? <PuppetViewer /> : <Viewport3D />}

        {/* REC badge overlay */}
        {isRecording && (
          <div
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
          </div>
        )}
      </div>

      {/* Control panel at bottom */}
      <TrackingPanel />

      <style>{`@keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
    </div>
  );
}
