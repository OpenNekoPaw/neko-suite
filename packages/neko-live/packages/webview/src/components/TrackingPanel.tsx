import { useLiveStore } from '../stores/liveStore';
import type { TrackingMode } from '../types/tracking';
import { vscode } from '../vscode-api';
import { t } from '../i18n';

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
    deviceBindings,
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
    const { onStartRecording, onStopRecording } = useLiveStore.getState();
    if (recordingState === 'recording') {
      onStopRecording?.();
    } else {
      onStartRecording?.(true);
    }
  };

  const formatTime = (ms: number): string => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const isRecording = recordingState === 'recording';
  const activeBindingLabels = [
    deviceBindings.camera?.label,
    deviceBindings['audio-input']?.label,
    deviceBindings['midi-input']?.label,
    deviceBindings.gamepad?.label,
  ].filter(Boolean);

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
          {isTracking ? t('status.vmcFps', { fps: trackingFps }) : t('status.disconnected')}
        </span>

        {isAvatarLoaded && (
          <span style={{ color: 'var(--vscode-descriptionForeground)', marginLeft: 4 }}>
            {avatarType === 'puppet' ? t('status.2d') : t('status.3d')}
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
          <option value="vmc">{t('mode.vmc')}</option>
          <option value="mediapipe" disabled>
            {t('mode.mediapipe')}
          </option>
          <option value="hybrid" disabled>
            {t('mode.hybrid')}
          </option>
        </select>

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
          {isTracking ? t('controls.stop') : t('controls.start')}
        </button>

        <button
          onClick={handleSelectAvatar}
          style={{
            ...btnStyle,
            background: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
          }}
        >
          {t('controls.avatar')}
        </button>

        <button
          onClick={handleToggleRecording}
          style={{
            ...btnStyle,
            background: isRecording ? '#dc2626' : 'var(--vscode-button-secondaryBackground)',
            color: isRecording ? '#fff' : 'var(--vscode-button-secondaryForeground)',
          }}
        >
          {isRecording ? t('controls.stopRec') : t('controls.rec')}
        </button>
      </div>

      {/* Last recording path */}
      {activeBindingLabels.length > 0 && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--vscode-descriptionForeground)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {t('devices.bound', { devices: activeBindingLabels.join(', ') })}
        </div>
      )}

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
          {t('recording.saved', { filename: lastRecordingPath.split('/').pop() ?? '' })}
        </div>
      )}

      <style>{`@keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
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
