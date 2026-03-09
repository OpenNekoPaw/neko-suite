/**
 * VideoControls - YouTube-style playback control bar
 *
 * Two-row layout:
 *   Row 1: ProgressBar (full-width)
 *   Row 2: [Play] [Volume] [Time] — spacer — [Speed] [Connection]
 */

import { useCallback } from 'react';
import { formatTime } from '@neko/neko-client';
import { useTranslation } from '../i18n/I18nContext';
import { ProgressBar } from '../shared/ProgressBar';

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

  // =========================================================================
  // Speed cycling
  // =========================================================================

  const handleSpeedClick = useCallback(() => {
    const currentIndex = SPEED_OPTIONS.indexOf(speed);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    onSpeedChange(SPEED_OPTIONS[nextIndex] ?? 1.0);
  }, [speed, onSpeedChange]);

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

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div
      className={`controls ${!visible ? 'controls--hidden' : ''}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Row 1: Progress bar */}
      <ProgressBar
        currentTime={currentTime}
        duration={duration}
        onSeekCommit={onSeek}
        onSeeking={onScrub}
      />

      {/* Row 2: Buttons */}
      <div className="controls__buttons">
        <div className="controls__left">
          {/* Play/Pause button */}
          <button
            className="controls__btn controls__btn--play"
            onClick={onTogglePlay}
            title={isPlaying ? t('preview.video.pauseButton') : t('preview.video.playButton')}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Volume */}
          <div className="controls__volume">
            <button
              className="controls__btn"
              onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
              title={volume > 0 ? t('preview.video.mute') : t('preview.video.unmute')}
            >
              {volume > 0 ? (
                <svg viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              className="controls__volume-slider"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              title={t('preview.video.volumeLabel', {
                percent: Math.round(volume * 100).toString(),
              })}
            />
          </div>

          {/* Time display */}
          <span className="controls__time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="controls__right">
          {/* Speed */}
          <button
            className="controls__speed"
            onClick={handleSpeedClick}
            title={t('preview.video.speedLabel')}
          >
            {speed}x
          </button>

          {/* Stats toggle */}
          {onToggleStats && (
            <button
              className={`controls__btn ${showStats ? 'controls__btn--active' : ''}`}
              onClick={onToggleStats}
              title={showStats ? t('preview.video.hideStats') : t('preview.video.showStats')}
            >
              <svg viewBox="0 0 24 24">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H5v-2h7v2zm5-4H5v-2h12v2zm0-4H5V7h12v2z" />
              </svg>
            </button>
          )}

          {/* Picture-in-Picture */}
          {onTogglePiP && (
            <button
              className={`controls__btn ${isPiPActive ? 'controls__btn--active' : ''}`}
              onClick={onTogglePiP}
              title={isPiPActive ? t('preview.video.exitPip') : t('preview.video.pipButton')}
            >
              <svg viewBox="0 0 24 24">
                <path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z" />
              </svg>
            </button>
          )}

          {/* Connection indicator */}
          {!isConnected && (
            <span
              style={{ fontSize: 10, color: 'var(--vscode-errorForeground, #f44)' }}
              title={t('preview.video.disconnected')}
            >
              &#x25CF;
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
