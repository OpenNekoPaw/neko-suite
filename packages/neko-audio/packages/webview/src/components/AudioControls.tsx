/**
 * AudioControls - Transport controls for audio editor
 *
 * Play/Pause, Volume, Speed, Time display, and keyboard shortcuts.
 */

import { useCallback } from 'react';
import { useAudioStore } from '../stores/audioStore';
import { postMessage } from '../shared/useVscodeMessage';
import { t } from '../i18n';

interface AudioControlsProps {
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onStop: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];

export function AudioControls({ onTogglePlay, onSeek, onStop }: AudioControlsProps) {
  const {
    playbackState,
    currentTime,
    audioInfo,
    volume,
    speed,
    isMuted,
    selection,
    setVolume,
    setSpeed,
    toggleMute,
    setSelection,
  } = useAudioStore();

  const duration = audioInfo?.duration ?? 0;
  const isPlaying = playbackState === 'playing';

  // =========================================================================
  // Keyboard shortcuts
  // =========================================================================

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          onTogglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onSeek(Math.max(0, currentTime - 5));
          break;
        case 'ArrowRight':
          e.preventDefault();
          onSeek(Math.min(duration, currentTime + 5));
          break;
        case 'Home':
          e.preventDefault();
          onSeek(0);
          break;
        case 'End':
          e.preventDefault();
          onSeek(duration);
          break;
        case 'Escape':
          e.preventDefault();
          setSelection(null);
          break;
        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setSelection({ start: 0, end: duration });
          }
          break;
        case 's':
          e.preventDefault();
          onStop();
          break;
      }
    },
    [onTogglePlay, onSeek, onStop, currentTime, duration, setSelection],
  );

  // =========================================================================
  // Speed change
  // =========================================================================

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newSpeed = parseFloat(e.target.value);
      setSpeed(newSpeed);
      postMessage({ type: 'editor:speed', speed: newSpeed });
    },
    [setSpeed],
  );

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="audio-editor__controls" tabIndex={0} onKeyDown={handleKeyDown}>
      {/* Play/Pause */}
      <button
        className={`btn btn--icon ${isPlaying ? 'btn--active' : ''}`}
        onClick={onTogglePlay}
        title={isPlaying ? t('audio.controls.pause') : t('audio.controls.play')}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      {/* Stop */}
      <button className="btn btn--icon" onClick={onStop} title={t('audio.controls.stop')}>
        ⏹
      </button>

      <span className="divider" />

      {/* Time */}
      <span className="time-display">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {/* Selection info */}
      {selection && (
        <>
          <span className="divider" />
          <span className="time-display" style={{ opacity: 0.7, fontSize: 11 }}>
            {t('audio.waveform.selection', {
              start: formatTime(selection.start),
              end: formatTime(selection.end),
            })}
          </span>
        </>
      )}

      <span style={{ flex: 1 }} />

      {/* Volume */}
      <button
        className="btn btn--icon"
        onClick={toggleMute}
        title={isMuted ? t('audio.controls.volume') : t('audio.controls.mute')}
      >
        {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
      </button>
      <input
        type="range"
        className="slider"
        min="0"
        max="1"
        step="0.05"
        value={isMuted ? 0 : volume}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
        style={{ width: 80 }}
      />

      <span className="divider" />

      {/* Speed */}
      <label style={{ fontSize: 11, opacity: 0.7 }}>{t('audio.controls.speed')}</label>
      <select
        value={speed}
        onChange={handleSpeedChange}
        style={{
          background: 'var(--input-bg)',
          color: 'var(--input-fg)',
          border: '1px solid var(--input-border)',
          borderRadius: 3,
          padding: '2px 4px',
          fontSize: 11,
        }}
      >
        {SPEED_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>
    </div>
  );
}
