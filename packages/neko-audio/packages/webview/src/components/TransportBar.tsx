/**
 * TransportBar - Unified top bar with file info, playback controls, and volume/speed.
 *
 * Merges the previous TransportBar (file info + tool icons) and AudioControls
 * (playback + volume + speed) into a single top bar.
 */

import { useCallback } from 'react';
import { useAudioStore } from '../stores/audioStore';
import { postMessage } from '../shared/useVscodeMessage';
import { MacButton } from '../shared/MacButton';
import { MacIconButton } from '../shared/MacIconButton';
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
      className="flex items-center gap-2 px-3 h-10 shrink-0 bg-[var(--toolbar-bg)] border-b border-[var(--editor-border)]"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* File name */}
      <span className="text-xs opacity-80 truncate max-w-[200px]" title={fileName ?? ''}>
        {fileName}
      </span>

      {/* Format info */}
      {audioInfo && (
        <>
          <span className="w-px h-4 bg-[var(--editor-border)] shrink-0" />
          <span className="text-xs opacity-60 whitespace-nowrap">
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

      <span className="w-px h-4 bg-[var(--editor-border)] shrink-0" />

      {/* Playback controls */}
      <MacIconButton
        size="sm"
        active={isPlaying}
        onClick={onTogglePlay}
        title={isPlaying ? t('audio.controls.pause') : t('audio.controls.play')}
      >
        {isPlaying ? '⏸' : '▶'}
      </MacIconButton>

      <MacIconButton size="sm" onClick={onStop} title={t('audio.controls.stop')}>
        ⏹
      </MacIconButton>

      <span className="text-xs font-mono opacity-80 whitespace-nowrap">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {/* Selection info + trim */}
      {selection && (
        <>
          <span className="w-px h-4 bg-[var(--editor-border)] shrink-0" />
          <span className="text-[11px] font-mono opacity-60 whitespace-nowrap">
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
            className="text-[11px] px-2 py-1"
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
        {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
      </MacIconButton>
      <input
        type="range"
        className="neko-slider w-20 bg-[var(--neko-surface)]"
        min="0"
        max="1"
        step="0.05"
        value={isMuted ? 0 : volume}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
      />

      <span className="w-px h-4 bg-[var(--editor-border)] shrink-0" />

      {/* Speed */}
      <label className="text-[11px] opacity-60">{t('audio.controls.speed')}</label>
      <select
        value={speed}
        onChange={handleSpeedChange}
        className="text-[11px] px-1 py-0.5 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
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
