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
import { NEKO_LIVE_RENDERER_FALLBACK_ENABLED } from './rendererMigration';

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
    setDeviceBinding,
  } = useLiveStore();

  const isRecording = recordingState === 'recording';

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
      vscode.postMessage({ type: 'startRecording', includeAudio });
    },
    [setRecordingState, setRecordingElapsed],
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
        console.error('[CanvasRecorder] Failed to encode blob:', err);
      }
    }

    // Tell extension host to stop audio recording
    vscode.postMessage({ type: 'stopRecording' });
  }, [setRecordingState]);

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
          break;

        case 'recordingProgress':
          setRecordingElapsed(msg.elapsedMs);
          break;

        case 'deviceBindingChanged':
          setDeviceBinding(msg.role, msg.binding);
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
        {!avatarUrl ? (
          <EmptyState />
        ) : NEKO_LIVE_RENDERER_FALLBACK_ENABLED ? (
          avatarType === 'puppet' ? (
            <PuppetViewer />
          ) : (
            <Viewport3D />
          )
        ) : (
          <EmptyState />
        )}

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

      <TrackingPanel />

      <style>{`@keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
    </div>
  );
}
