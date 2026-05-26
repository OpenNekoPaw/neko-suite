/**
 * RecordingPanel - Microphone recording UI
 *
 * Device selection, record/stop/pause controls, level meter, and save.
 * Audio data is sent to extension as base64 via postMessage.
 */

import { useCallback } from 'react';
import { useRecording } from '../hooks/useRecording';
import { postMessage } from '../shared/useVscodeMessage';
import { AudioButton, AudioSelect } from './shared/AudioUiPrimitives';
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
        type: 'audio:recording',
        action: 'saveBlob',
        data: base64Data,
        mimeType: 'audio/webm',
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
          <AudioSelect
            className="flex-1"
            label={t('audio.recording.device')}
            value={selectedDeviceId ?? ''}
            onChange={selectDevice}
            disabled={state !== 'idle'}
            options={devices.map((device) => ({
              value: device.deviceId,
              label:
                device.label ||
                t('audio.recording.micFallback', { id: device.deviceId.slice(0, 8) }),
            }))}
          />
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
              background:
                level > 0.8
                  ? 'var(--level-red)'
                  : level > 0.5
                    ? 'var(--level-yellow)'
                    : 'var(--level-green)',
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
          <AudioButton variant="primary" onClick={startRecording}>
            {t('audio.recording.start')}
          </AudioButton>
        ) : (
          <>
            {state === 'recording' ? (
              <AudioButton variant="secondary" onClick={pauseRecording}>
                {t('audio.controls.pause')}
              </AudioButton>
            ) : (
              <AudioButton variant="secondary" onClick={resumeRecording}>
                {t('audio.controls.play')}
              </AudioButton>
            )}
            <AudioButton
              variant="ghost"
              onClick={handleStopAndSave}
              className="text-[var(--status-error)]"
            >
              {t('audio.recording.stop')}
            </AudioButton>
          </>
        )}
      </div>

      {/* Error */}
      {error && <div className="text-[11px] text-[var(--status-error)] text-center">{error}</div>}
    </div>
  );
}
