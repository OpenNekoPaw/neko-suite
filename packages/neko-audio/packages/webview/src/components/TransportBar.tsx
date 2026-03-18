/**
 * TransportBar - Unified top bar with file info, playback controls, and volume/speed.
 *
 * Merges the previous TransportBar (file info + tool icons) and AudioControls
 * (playback + volume + speed) into a single top bar.
 */

import { useCallback } from 'react';
import { useAudioStore } from '../stores/audioStore';
import { postMessage } from '../shared/useVscodeMessage';
import { t } from '../i18n';

interface TransportBarProps {
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

export function TransportBar({ onTogglePlay, onSeek, onStop }: TransportBarProps) {
  const {
    fileName,
    audioInfo,
    playbackState,
    currentTime,
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

  // Keyboard shortcuts
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

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newSpeed = parseFloat(e.target.value);
      setSpeed(newSpeed);
      postMessage({ type: 'editor:speed', speed: newSpeed });
    },
    [setSpeed],
  );

  const handleTrim = useCallback(() => {
    if (!selection) return;
    postMessage({
      type: 'editor:trim',
      startTime: selection.start,
      endTime: selection.end,
    });
  }, [selection]);

  return (
    <div className="audio-editor__toolbar" tabIndex={0} onKeyDown={handleKeyDown}>
      {/* File name */}
      <span className="file-info" title={fileName ?? ''}>
        {fileName}
      </span>

      {/* Format info */}
      {audioInfo && (
        <>
          <span className="divider" />
          <span className="file-info">
            {audioInfo.codec.toUpperCase()} · {(audioInfo.sampleRate / 1000).toFixed(1)}kHz ·{' '}
            {audioInfo.channels === 1
              ? 'Mono'
              : audioInfo.channels === 2
                ? 'Stereo'
                : `${audioInfo.channels}ch`}
            {audioInfo.bitrate ? ` · ${Math.round(audioInfo.bitrate / 1000)}kbps` : ''}
          </span>
        </>
      )}

      <span className="divider" />

      {/* Playback controls */}
      <button
        className={`btn btn--icon ${isPlaying ? 'btn--active' : ''}`}
        onClick={onTogglePlay}
        title={isPlaying ? t('audio.controls.pause') : t('audio.controls.play')}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <button className="btn btn--icon" onClick={onStop} title={t('audio.controls.stop')}>
        ⏹
      </button>

      <span className="time-display">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {/* Selection info + trim */}
      {selection && (
        <>
          <span className="divider" />
          <span className="time-display" style={{ opacity: 0.7, fontSize: 11 }}>
            {t('audio.waveform.selection', {
              start: formatTime(selection.start),
              end: formatTime(selection.end),
            })}
          </span>
          <button
            className="btn"
            onClick={handleTrim}
            title={t('audio.edit.trim')}
            style={{ fontSize: 11 }}
          >
            {t('audio.edit.trim')}
          </button>
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
