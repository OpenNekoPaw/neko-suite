/**
 * RecordingPanel - Microphone recording UI
 *
 * Device selection, record/stop/pause controls, level meter, and save.
 * Audio data is sent to extension as base64 via postMessage.
 */

import { useCallback } from 'react';
import { useRecording } from '../hooks/useRecording';
import { postMessage } from '../shared/useVscodeMessage';
import { MacButton } from '@neko/shared/components';
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
    <div className="flex flex-col gap-2 p-2">
      {/* Device selector */}
      {devices.length > 0 && (
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] opacity-70 shrink-0">{t('audio.recording.device')}</label>
          <select
            value={selectedDeviceId ?? ''}
            onChange={(e) => selectDevice(e.target.value)}
            disabled={state !== 'idle'}
            className="flex-1 text-[11px] px-1 py-0.5 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
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
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] opacity-70 shrink-0">{t('audio.recording.level')}</label>
        <div className="flex-1 h-2 bg-[var(--vscode-input-background)] rounded overflow-hidden">
          <div
            className="h-full rounded transition-[width] duration-50 ease-out"
            style={{
              width: `${level * 100}%`,
              background: level > 0.8 ? '#f44' : level > 0.5 ? '#ff0' : '#0c8',
            }}
          />
        </div>
      </div>

      {/* Duration */}
      {state !== 'idle' && (
        <div className="text-lg font-mono text-center">{formatDuration(duration)}</div>
      )}

      {/* Controls */}
      <div className="flex gap-1.5 justify-center">
        {state === 'idle' ? (
          <MacButton variant="primary" size="sm" onClick={startRecording}>
            {t('audio.recording.start')}
          </MacButton>
        ) : (
          <>
            {state === 'recording' ? (
              <MacButton variant="secondary" size="sm" onClick={pauseRecording}>
                {t('audio.controls.pause')}
              </MacButton>
            ) : (
              <MacButton variant="secondary" size="sm" onClick={resumeRecording}>
                {t('audio.controls.play')}
              </MacButton>
            )}
            <MacButton
              variant="ghost"
              size="sm"
              onClick={handleStopAndSave}
              className="text-[#f44]"
            >
              {t('audio.recording.stop')}
            </MacButton>
          </>
        )}
      </div>

      {/* Error */}
      {error && <div className="text-[11px] text-[#f44] text-center">{error}</div>}
    </div>
  );
}
