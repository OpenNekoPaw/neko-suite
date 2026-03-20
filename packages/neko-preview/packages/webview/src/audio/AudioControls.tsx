/**
 * AudioControls - Modern playback controls for audio preview
 *
 * Apple Music-inspired layout:
 *   - Centered play/pause with skip forward/backward
 *   - Bottom bar: volume | view tabs | speed
 */

import { useCallback } from 'react';
import { formatTime } from '@neko/neko-client';
import { useTranslation } from '../i18n/I18nContext';
import { ProgressBar } from '../shared/ProgressBar';
import { MacIconButton } from '../shared/MacIconButton';
import { MacButton } from '../shared/MacButton';
import { MacTabs, type MacTab } from '../shared/MacTabs';
import { MacSlider } from '../shared/MacSlider';

export type ViewMode = 'cover' | 'lyrics' | 'waveform' | 'spectrum';

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

interface AudioControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  speed: number;
  viewMode: ViewMode;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onScrub?: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onSpeedChange: (speed: number) => void;
  onViewModeChange: (mode: ViewMode) => void;
}

export function AudioControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  speed,
  viewMode,
  onTogglePlay,
  onSeek,
  onScrub,
  onVolumeChange,
  onSpeedChange,
  onViewModeChange,
}: AudioControlsProps) {
  const { t } = useTranslation();

  // =========================
  // Speed cycling
  // ===============

  const handleSpeedClick = useCallback(() => {
    const currentIndex = SPEED_OPTIONS.indexOf(speed);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    onSpeedChange(SPEED_OPTIONS[nextIndex] ?? 1.0);
  }, [speed, onSpeedChange]);

  // ==============
  // Keyboard shortcuts
  // ==========================

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
        case 'ArrowUp':
          e.preventDefault();
          onVolumeChange(Math.min(1, volume + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          onVolumeChange(Math.max(0, volume - 0.05));
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
    [onTogglePlay, onSeek, onVolumeChange, currentTime, duration, volume],
  );

  // ==========================
  // View tabs configuration
  // =================

  const viewTabs: MacTab[] = [
    {
      id: 'cover',
      title: t('preview.audio.viewCover'),
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
        </svg>
      ),
    },
    {
      id: 'lyrics',
      title: t('preview.audio.viewLyrics'),
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
      ),
    },
    {
      id: 'waveform',
      title: t('preview.audio.viewWaveform'),
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 18h2V6H7v12zm4 4h2V2h-2v20zm-8-8h2v-4H3v4zm12-6v8h2V8h-2zm4 2v4h2v-4h-2z" />
        </svg>
      ),
    },
    {
      id: 'spectrum',
      title: t('preview.audio.viewSpectrum'),
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 17h2v-7H3v7zm4 2h2V5H7v14zm4 0h2V8h-2v11zm4-14v16h2V5h-2zm4 4v8h2V9h-2z" />
        </svg>
      ),
    },
  ];

  // ===============
  // Render
  // ====================

  return (
    <div tabIndex={0} onKeyDown={handleKeyDown} className="w-full outline-none">
      {/* Progress bar */}
      <div className="w-full pt-3 pb-1 flex-shrink-0">
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          onSeekCommit={onSeek}
          onSeeking={onScrub}
        />
        <div className="flex justify-between text-[11px] text-neko-preview-text-secondary pt-1 tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Transport controls: skip back / play / skip forward */}
      <div className="flex items-center justify-center gap-4 py-2">
        {/* Skip backward 10s */}
        <MacIconButton
          size="md"
          onClick={() => onSeek(Math.max(0, currentTime - 10))}
          title={t('preview.audio.skipBack')}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            <text
              x="12"
              y="15.5"
              textAnchor="middle"
              fontSize="7"
              fill="currentColor"
              fontWeight="700"
            >
              10
            </text>
          </svg>
        </MacIconButton>

        {/* Play / Pause */}
        <MacIconButton
          size="xl"
          variant="primary"
          onClick={onTogglePlay}
          title={isPlaying ? t('preview.audio.pauseButton') : t('preview.audio.playButton')}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </MacIconButton>

        {/* Skip forward 10s */}
        <MacIconButton
          size="md"
          onClick={() => onSeek(Math.min(duration, currentTime + 10))}
          title={t('preview.audio.skipForward')}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <path d="M12.01 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
            <text
              x="12"
              y="15.5"
              textAnchor="middle"
              fontSize="7"
              fill="currentColor"
              fontWeight="700"
            >
              10
            </text>
          </svg>
        </MacIconButton>
      </div>

      {/* Bottom bar: volume | view tabs | speed */}
      <div className="flex items-center justify-between gap-4 pt-2">
        {/* Volume */}
        <div className="flex items-center gap-2 min-w-[100px]">
          <MacIconButton
            size="sm"
            onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
            title={volume > 0 ? t('preview.audio.mute') : t('preview.audio.unmute')}
          >
            {volume > 0 ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            )}
          </MacIconButton>
          <MacSlider
            value={volume}
            min={0}
            max={1}
            step={0.05}
            onChange={onVolumeChange}
            className="w-16"
            title={t('preview.audio.volumeLabel', {
              percent: Math.round(volume * 100).toString(),
            })}
          />
        </div>

        {/* View mode tabs */}
        <MacTabs
          tabs={viewTabs}
          activeTab={viewMode}
          onChange={(id) => onViewModeChange(id as ViewMode)}
        />

        {/* Speed */}
        <MacButton
          variant="secondary"
          size="sm"
          onClick={handleSpeedClick}
          title={t('preview.audio.speedLabel')}
          className="min-w-[36px] text-[11px] font-semibold"
        >
          {speed === 1 ? '1x' : `${speed}x`}
        </MacButton>
      </div>
    </div>
  );
}
