/**
 * AudioPlayerControls - Playback controls for audio diff viewer.
 * Pure UI shell for audio playback controls.
 */

import { memo } from 'react';
import { useTranslation } from '../../../i18n/I18nContext';
import { formatTime } from './audioUtils';

interface AudioPlayerControlsProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playingVersion: 'current' | 'previous' | 'both';
  onPlayingVersionChange: (version: 'current' | 'previous' | 'both') => void;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  /** Disable Play while git show is extracting the previous version */
  isFetchingPrevious?: boolean;
}

export const AudioPlayerControls = memo(function AudioPlayerControls({
  currentTime,
  duration,
  isPlaying,
  playingVersion,
  onPlayingVersionChange,
  onPlayPause,
  onSeek,
  isFetchingPrevious,
}: AudioPlayerControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-4 p-3 bg-[var(--vscode-editor-background)] border-t border-[var(--vscode-panel-border)]">
      <button
        type="button"
        className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
          isFetchingPrevious
            ? 'opacity-40 cursor-not-allowed text-[var(--vscode-foreground)]'
            : 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]'
        }`}
        onClick={isFetchingPrevious ? undefined : onPlayPause}
        disabled={isFetchingPrevious}
        title={
          isFetchingPrevious ? t('mediaDiff.audio.fetchingPrevious') : isPlaying ? 'Pause' : 'Play'
        }
      >
        {isPlaying ? '\u23F8' : '\u25B6'}
      </button>

      <div className="flex items-center gap-1 text-xs">
        <button
          type="button"
          className={`px-2 py-1 rounded ${
            playingVersion === 'previous'
              ? 'bg-red-500 text-white'
              : 'bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)]'
          }`}
          onClick={() => onPlayingVersionChange('previous')}
        >
          {t('mediaDiff.audio.previous')}
        </button>
        <button
          type="button"
          className={`px-2 py-1 rounded ${
            playingVersion === 'both'
              ? 'bg-purple-500 text-white'
              : 'bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)]'
          }`}
          onClick={() => onPlayingVersionChange('both')}
        >
          {t('mediaDiff.audio.playBoth')}
        </button>
        <button
          type="button"
          className={`px-2 py-1 rounded ${
            playingVersion === 'current'
              ? 'bg-green-500 text-white'
              : 'bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)]'
          }`}
          onClick={() => onPlayingVersionChange('current')}
        >
          {t('mediaDiff.audio.current')}
        </button>
      </div>

      <span className="text-xs text-[var(--vscode-foreground)] font-mono min-w-[100px]">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <div className="flex-1">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="w-full h-1 bg-[var(--vscode-input-background)] rounded-lg appearance-none cursor-pointer"
        />
      </div>
    </div>
  );
});
