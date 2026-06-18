import { formatMediaTimeFromMilliseconds } from '@neko/neko-client';
import { Badge, Button, Select } from '@neko/ui/primitives';
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
          <Badge
            tone="danger"
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}
          >
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
              {formatMediaTimeFromMilliseconds(recordingElapsedMs)}
            </span>
          </Badge>
        )}
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <Select
          label={t('mode.vmc')}
          value={trackingMode}
          options={[
            { value: 'vmc', label: t('mode.vmc') },
            { value: 'mediapipe', label: t('mode.mediapipe'), disabled: true },
            { value: 'hybrid', label: t('mode.hybrid'), disabled: true },
          ]}
          className="h-6 min-w-24 text-[11px]"
          onValueChange={(value) => handleModeChange(value as TrackingMode)}
        />

        <Button
          size="xs"
          variant={isTracking ? 'danger' : 'default'}
          onClick={handleToggleTracking}
        >
          {isTracking ? t('controls.stop') : t('controls.start')}
        </Button>

        <Button size="xs" variant="secondary" onClick={handleSelectAvatar}>
          {t('controls.avatar')}
        </Button>

        <Button
          size="xs"
          variant={isRecording ? 'danger' : 'secondary'}
          onClick={handleToggleRecording}
        >
          {isRecording ? t('controls.stopRec') : t('controls.rec')}
        </Button>
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
