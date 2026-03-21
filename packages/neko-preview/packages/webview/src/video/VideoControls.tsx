/**
 * VideoControls - YouTube-style playback control bar (Tailwind + macOS components)
 *
 * Two-row layout:
 *   Row 1: ProgressBar (full-width)
 *   Row 2: [Play] [Volume] [Time] — spacer — [Speed] [Stats] [PiP] [Connection]
 */

import { useCallback } from 'react';
import { formatTime } from '@neko/neko-client';
import { useTranslation } from '../i18n/I18nContext';
import { ProgressBar } from '../shared/ProgressBar';
import { MacIconButton } from '../shared/MacIconButton';
import { MacSlider } from '../shared/MacSlider';
import { PlayIcon, PauseIcon, VolumeIcon, VolumeOffIcon } from '@neko/shared/icons';

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

interface VideoControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  volume: number;
  isConnected: boolean;
  isPiPActive?: boolean;
  showStats?: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onScrub?: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onVolumeChange: (volume: number) => void;
  onTogglePiP?: () => void;
  onToggleStats?: () => void;
  visible?: boolean;
}

export function VideoControls({
  isPlaying,
  currentTime,
  duration,
  speed,
  volume,
  isConnected,
  isPiPActive = false,
  showStats = false,
  onTogglePlay,
  onSeek,
  onScrub,
  onSpeedChange,
  onVolumeChange,
  onTogglePiP,
  onToggleStats,
  visible = true,
}: VideoControlsProps) {
  const { t } = useTranslation();

  const handleSpeedClick = useCallback(() => {
    const currentIndex = SPEED_OPTIONS.indexOf(speed);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    onSpeedChange(SPEED_OPTIONS[nextIndex] ?? 1.0);
  }, [speed, onSpeedChange]);

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
        case 'j':
          e.preventDefault();
          onSeek(Math.max(0, currentTime - 10));
          break;
        case 'l':
          e.preventDefault();
          onSeek(Math.min(duration, currentTime + 10));
          break;
        case 'Home':
          e.preventDefault();
          onSeek(0);
          break;
        case 'End':
          e.preventDefault();
          onSeek(duration);
          break;
      }
    },
    [onTogglePlay, onSeek, currentTime, duration],
  );

  return (
    <div
      className={`flex flex-col gap-1 px-3 py-1 pb-2 bg-transparent shrink-0 outline-none ${!visible ? 'pointer-events-none' : ''}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Row 1: Progress bar */}
      <ProgressBar
        currentTime={currentTime}
        duration={duration}
        onSeekCommit={onSeek}
        onSeeking={onScrub}
        variant="video"
      />

      {/* Row 2: Buttons */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          {/* Play/Pause */}
          <MacIconButton
            size="lg"
            onClick={onTogglePlay}
            className="text-white/85 hover:text-white hover:bg-white/15"
            title={isPlaying ? t('preview.video.pauseButton') : t('preview.video.playButton')}
          >
            {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
          </MacIconButton>

          {/* Volume */}
          <div className="flex items-center gap-1">
            <MacIconButton
              size="sm"
              onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
              className="text-white/85 hover:text-white hover:bg-white/15"
              title={volume > 0 ? t('preview.video.mute') : t('preview.video.unmute')}
            >
              {volume > 0 ? (
                <VolumeIcon className="w-4 h-4" />
              ) : (
                <VolumeOffIcon className="w-4 h-4" />
              )}
            </MacIconButton>
            <MacSlider
              value={volume}
              min={0}
              max={1}
              step={0.05}
              onChange={onVolumeChange}
              className="w-15"
              title={t('preview.video.volumeLabel', {
                percent: Math.round(volume * 100).toString(),
              })}
            />
          </div>

          {/* Time */}
          <span className="text-xs tabular-nums text-white/85 whitespace-nowrap min-w-[90px] text-center">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Speed */}
          <button
            className="text-[11px] font-semibold px-2 py-1 rounded-neko-sm bg-white/10 text-white/85 hover:bg-white/20 hover:text-white cursor-pointer transition-all duration-150 min-w-[40px] text-center border-none"
            onClick={handleSpeedClick}
            title={t('preview.video.speedLabel')}
          >
            {speed}x
          </button>

          {/* Stats toggle */}
          {onToggleStats && (
            <MacIconButton
              size="sm"
              active={showStats}
              onClick={onToggleStats}
              className={`${showStats ? 'bg-white/25 text-white' : 'text-white/85 hover:text-white hover:bg-white/15'}`}
              title={showStats ? t('preview.video.hideStats') : t('preview.video.showStats')}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H5v-2h7v2zm5-4H5v-2h12v2zm0-4H5V7h12v2z" />
              </svg>
            </MacIconButton>
          )}

          {/* PiP */}
          {onTogglePiP && (
            <MacIconButton
              size="sm"
              active={isPiPActive}
              onClick={onTogglePiP}
              className={`${isPiPActive ? 'bg-white/25 text-white' : 'text-white/85 hover:text-white hover:bg-white/15'}`}
              title={isPiPActive ? t('preview.video.exitPip') : t('preview.video.pipButton')}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z" />
              </svg>
            </MacIconButton>
          )}

          {/* Connection indicator */}
          {!isConnected && (
            <span
              className="inline-block w-2 h-2 rounded-full bg-[var(--vscode-errorForeground,#f44)] shrink-0"
              title={t('preview.video.disconnected')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
