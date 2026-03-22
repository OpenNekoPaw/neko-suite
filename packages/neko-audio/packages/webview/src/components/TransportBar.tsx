/**
 * TransportBar - Unified top bar with file info, playback controls, and volume/speed.
 *
 * Merges the previous TransportBar (file info + tool icons) and AudioControls
 * (playback + volume + speed) into a single top bar.
 */

import { useCallback } from 'react';
import { useAudioStore } from '../stores/audioStore';
import { postMessage } from '../shared/useVscodeMessage';
import { MacButton, MacIconButton } from '@neko/shared/components';
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
    <div
      className="neko-daw-transport flex items-center gap-2 px-3 h-10 shrink-0"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* File name */}
      <span
        className="text-[12px] font-medium text-[var(--activity-fg)] opacity-85 truncate max-w-[180px]"
        title={fileName ?? ''}
      >
        {fileName}
      </span>

      {/* Format info */}
      {audioInfo && (
        <>
          <span className="w-px h-4 bg-[var(--editor-border)] shrink-0 opacity-60" />
          <span className="text-[11px] text-[var(--activity-inactive)] whitespace-nowrap">
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

      <span className="w-px h-4 bg-[var(--editor-border)] shrink-0 opacity-60" />

      {/* Playback controls */}
      <MacIconButton
        size="sm"
        active={isPlaying}
        onClick={onTogglePlay}
        title={isPlaying ? t('audio.controls.pause') : t('audio.controls.play')}
      >
        {isPlaying ? (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <rect x="4" y="3" width="4" height="14" rx="1.5" />
            <rect x="12" y="3" width="4" height="14" rx="1.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M5 3.5l12 6.5-12 6.5V3.5z" />
          </svg>
        )}
      </MacIconButton>

      <MacIconButton size="sm" onClick={onStop} title={t('audio.controls.stop')}>
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
          <rect x="3" y="3" width="14" height="14" rx="2" />
        </svg>
      </MacIconButton>

      <span className="text-[12px] font-mono text-[var(--activity-fg)] opacity-75 whitespace-nowrap tabular-nums">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {/* Selection info + trim */}
      {selection && (
        <>
          <span className="w-px h-4 bg-[var(--editor-border)] shrink-0 opacity-60" />
          <span className="text-[11px] font-mono text-[var(--activity-inactive)] whitespace-nowrap">
            {t('audio.waveform.selection', {
              start: formatTime(selection.start),
              end: formatTime(selection.end),
            })}
          </span>
          <MacButton
            variant="ghost"
            size="sm"
            onClick={handleTrim}
            title={t('audio.edit.trim')}
            className="text-[11px] px-2 py-0.5"
          >
            {t('audio.edit.trim')}
          </MacButton>
        </>
      )}

      <span className="flex-1" />

      {/* Volume */}
      <MacIconButton
        size="sm"
        onClick={toggleMute}
        title={isMuted ? t('audio.controls.volume') : t('audio.controls.mute')}
      >
        {isMuted || volume === 0 ? (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" opacity="0.5">
            <path
              d="M9 4L5 7.5H2v5h3l4 3.5V4zM14 8l-4 4M14 12l-4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        ) : volume < 0.5 ? (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M9 4L5 7.5H2v5h3l4 3.5V4z" />
            <path
              d="M13 8a4 4 0 010 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M9 4L5 7.5H2v5h3l4 3.5V4z" />
            <path
              d="M13 7a5 5 0 010 6M15.5 5a8 8 0 010 10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        )}
      </MacIconButton>
      <input
        type="range"
        className="neko-slider w-16 bg-[var(--btn-bg)]"
        min="0"
        max="1"
        step="0.05"
        value={isMuted ? 0 : volume}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
      />

      <span className="w-px h-4 bg-[var(--editor-border)] shrink-0 opacity-60" />

      {/* Speed */}
      <label className="text-[11px] text-[var(--activity-inactive)]">
        {t('audio.controls.speed')}
      </label>
      <select
        value={speed}
        onChange={handleSpeedChange}
        className="text-[11px] px-1.5 py-0.5 bg-[var(--btn-bg)] text-[var(--activity-fg)] border border-[var(--btn-border)] rounded-md appearance-none cursor-pointer hover:bg-[var(--btn-bg-hover)] transition-colors"
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
