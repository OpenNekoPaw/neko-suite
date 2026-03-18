/**
 * RecordingPanel - Microphone recording UI
 *
 * Device selection, record/stop/pause controls, level meter, and save.
 * Audio data is sent to extension as base64 via postMessage.
 */

import { useCallback } from 'react';
import { useRecording } from '../hooks/useRecording';
import { postMessage } from '../shared/useVscodeMessage';
import { t } from '../i18n';

export function RecordingPanel() {
  const {
    state,
    duration,
    level,
    devices,
    selectedDeviceId,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    selectDevice,
  } = useRecording();

  const handleStopAndSave = useCallback(async () => {
    const base64Data = await stopRecording();
    if (base64Data) {
      postMessage({
        type: 'editor:saveRecording',
        data: base64Data,
        format: 'audio/webm',
      });
    }
  }, [stopRecording]);

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div
      style={{
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Device selector */}

      {/* Device selector */}
      {devices.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 10, opacity: 0.8, flexShrink: 0 }}>
            {t('audio.recording.device')}
          </label>
          <select
            value={selectedDeviceId ?? ''}
            onChange={(e) => selectDevice(e.target.value)}
            disabled={state !== 'idle'}
            style={{
              flex: 1,
              fontSize: 11,
              padding: '2px 4px',
              background: 'var(--vscode-input-background, #1e1e1e)',
              color: 'var(--vscode-input-foreground, #ccc)',
              border: '1px solid var(--vscode-input-border, #333)',
              borderRadius: 3,
            }}
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Level meter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ fontSize: 10, opacity: 0.8, flexShrink: 0 }}>
          {t('audio.recording.level')}
        </label>
        <div
          style={{
            flex: 1,
            height: 8,
            background: 'var(--vscode-input-background, #1e1e1e)',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${level * 100}%`,
              height: '100%',
              background: level > 0.8 ? '#f44' : level > 0.5 ? '#ff0' : '#0c8',
              transition: 'width 50ms ease-out',
              borderRadius: 4,
            }}
          />
        </div>
      </div>

      {/* Duration */}
      {state !== 'idle' && (
        <div style={{ fontSize: 18, fontFamily: 'monospace', textAlign: 'center' }}>
          {formatDuration(duration)}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        {state === 'idle' ? (
          <button
            className="btn"
            onClick={startRecording}
            style={{ fontSize: 11, padding: '4px 12px' }}
          >
            {t('audio.recording.start')}
          </button>
        ) : (
          <>
            {state === 'recording' ? (
              <button
                className="btn"
                onClick={pauseRecording}
                style={{ fontSize: 11, padding: '4px 12px' }}
              >
                {t('audio.controls.pause')}
              </button>
            ) : (
              <button
                className="btn"
                onClick={resumeRecording}
                style={{ fontSize: 11, padding: '4px 12px' }}
              >
                {t('audio.controls.play')}
              </button>
            )}
            <button
              className="btn"
              onClick={handleStopAndSave}
              style={{ fontSize: 11, padding: '4px 12px', color: '#f44' }}
            >
              {t('audio.recording.stop')}
            </button>
          </>
        )}
      </div>

      {/* Error */}
      {error && <div style={{ fontSize: 11, color: '#f44', textAlign: 'center' }}>{error}</div>}
    </div>
  );
}
