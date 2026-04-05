import { useLiveStore } from '../stores/liveStore';
import type { TrackingMode } from '../types/tracking';
import { vscode } from '../vscode-api';

/**
 * Compact control panel for tracking, avatar selection, and recording.
 * Uses inline styles — no Tailwind dependency.
 */
export function TrackingPanel() {
  const {
    trackingMode,
    isTracking,
    trackingFps,
    avatarType,
    isAvatarLoaded,
    recordingState,
    recordingElapsedMs,
    lastRecordingPath,
    setTrackingMode,
  } = useLiveStore();

  const handleModeChange = (mode: TrackingMode) => {
    setTrackingMode(mode);
    vscode.postMessage({ type: 'setTrackingMode', mode });
  };

  const handleToggleTracking = () => {
    vscode.postMessage({ type: isTracking ? 'stopVmcReceiver' : 'startVmcReceiver' });
  };

  const handleSelectAvatar = () => {
    vscode.postMessage({ type: 'selectAvatar' });
  };

  const handleToggleRecording = () => {
    if (recordingState === 'recording') {
      vscode.postMessage({ type: 'stopRecording' });
    } else {
      vscode.postMessage({ type: 'startRecording', includeAudio: true });
    }
  };

  const formatTime = (ms: number): string => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const isRecording = recordingState === 'recording';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        borderTop: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-sideBar-background)',
      }}
    >
      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: isTracking ? '#4ade80' : '#6b7280',
          }}
        />
        <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
          {isTracking ? `VMC ${trackingFps} fps` : 'Disconnected'}
        </span>

        {isAvatarLoaded && (
          <span style={{ color: 'var(--vscode-descriptionForeground)', marginLeft: 4 }}>
            {avatarType === 'puppet' ? '2D' : '3D'}
          </span>
        )}

        {isRecording && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                animation: 'blink 1s infinite',
              }}
            />
            <span style={{ color: '#ef4444', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(recordingElapsedMs)}
            </span>
          </span>
        )}
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {/* Tracking mode */}
        <select
          value={trackingMode}
          onChange={(e) => handleModeChange(e.target.value as TrackingMode)}
          style={{
            padding: '2px 4px',
            fontSize: 11,
            borderRadius: 3,
            background: 'var(--vscode-dropdown-background)',
            color: 'var(--vscode-dropdown-foreground)',
            border: '1px solid var(--vscode-dropdown-border)',
          }}
        >
          <option value="vmc">VMC</option>
          <option value="mediapipe" disabled>
            MediaPipe
          </option>
          <option value="hybrid" disabled>
            Hybrid
          </option>
        </select>

        {/* Start/Stop tracking */}
        <button
          onClick={handleToggleTracking}
          style={{
            ...btnStyle,
            background: isTracking
              ? 'var(--vscode-statusBarItem-errorBackground, #c53030)'
              : 'var(--vscode-button-background)',
            color: isTracking
              ? 'var(--vscode-statusBarItem-errorForeground, #fff)'
              : 'var(--vscode-button-foreground)',
          }}
        >
          {isTracking ? 'Stop' : 'Start'}
        </button>

        {/* Select Avatar */}
        <button
          onClick={handleSelectAvatar}
          style={{
            ...btnStyle,
            background: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
          }}
        >
          Avatar
        </button>

        {/* Record */}
        <button
          onClick={handleToggleRecording}
          style={{
            ...btnStyle,
            background: isRecording ? '#dc2626' : 'var(--vscode-button-secondaryBackground)',
            color: isRecording ? '#fff' : 'var(--vscode-button-secondaryForeground)',
          }}
        >
          {isRecording ? 'Stop Rec' : 'Rec'}
        </button>
      </div>

      {/* Last recording path */}
      {lastRecordingPath && !isRecording && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--vscode-descriptionForeground)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          Saved: {lastRecordingPath.split('/').pop()}
        </div>
      )}

      {/* Blink animation for recording indicator */}
      <style>{`@keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '2px 8px',
  fontSize: 11,
  borderRadius: 3,
  border: 'none',
  cursor: 'pointer',
};
