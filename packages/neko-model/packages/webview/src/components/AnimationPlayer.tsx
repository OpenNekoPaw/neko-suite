import React, { useCallback, useState } from 'react';
import type { AnimationClipInfo, PlaybackState } from '../types';
import { useTranslation } from '../i18n/I18nContext';

interface AnimationPlayerProps {
  clips: AnimationClipInfo[];
  activeClip: string | null;
  playbackState: PlaybackState;
  onSelectClip: (name: string) => void;
  onCrossfade: (clipName: string, fadeDuration: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  disabled?: boolean;
}

/**
 * Animation playback controls panel.
 *
 * When switching clips while one is playing, uses crossfade via the engine backend
 * instead of an abrupt stop + play.
 */
export function AnimationPlayer({
  clips,
  activeClip,
  playbackState,
  onSelectClip,
  onCrossfade,
  onPlay,
  onPause,
  onStop,
  disabled = false,
}: AnimationPlayerProps): React.JSX.Element {
  const [fadeDuration, setFadeDuration] = useState(0.3);

  const handleClipChange = useCallback(
    (clipName: string) => {
      // If currently playing, crossfade to the new clip instead of stop+play
      if (playbackState === 'playing' && activeClip && clipName !== activeClip) {
        onCrossfade(clipName, fadeDuration);
      }
      onSelectClip(clipName);
    },
    [playbackState, activeClip, fadeDuration, onCrossfade, onSelectClip],
  );

  const { t } = useTranslation();

  if (clips.length === 0) {
    return <></>;
  }

  return (
    <div className="model-animation-player flex min-w-0 flex-1 items-center gap-2 text-xs">
      <select
        className="min-w-32 px-2 py-1 text-xs"
        value={activeClip ?? ''}
        onChange={(e) => handleClipChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">{t('animation.selectPlaceholder')}</option>
        {clips.map((clip) => (
          <option key={clip.name} value={clip.name}>
            {clip.name} ({clip.duration.toFixed(2)}s)
          </option>
        ))}
      </select>

      <button
        className="model-btn-primary px-2 py-1"
        onClick={playbackState === 'playing' ? onPause : onPlay}
        disabled={disabled || !activeClip}
      >
        {playbackState === 'playing' ? t('animation.pause') : t('animation.play')}
      </button>

      <button
        className="model-btn-secondary px-2 py-1"
        onClick={onStop}
        disabled={disabled || !activeClip || playbackState === 'stopped'}
      >
        {t('animation.stop')}
      </button>

      <label className="flex items-center gap-1 text-[var(--model-fg-secondary)]">
        {t('animation.fade')}
        <input
          type="number"
          min={0}
          max={5}
          step={0.1}
          value={fadeDuration}
          onChange={(e) => setFadeDuration(Math.max(0, parseFloat(e.target.value) || 0))}
          disabled={disabled}
          className="model-input w-12 px-1 py-0.5 text-center text-xs"
        />
        {t('animation.unit')}
      </label>

      {activeClip && (
        <span className="ml-auto truncate text-[var(--model-fg-secondary)]">
          {playbackState === 'playing'
            ? t('animation.statusPlaying')
            : playbackState === 'paused'
              ? t('animation.statusPaused')
              : t('animation.statusStopped')}{' '}
          {activeClip}
        </span>
      )}
    </div>
  );
}
