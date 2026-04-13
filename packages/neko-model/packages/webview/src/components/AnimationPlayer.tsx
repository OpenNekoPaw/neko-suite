import React, { useCallback, useState } from 'react';
import type { AnimationClipInfo, PlaybackState } from '../types';
import { postMessage } from '@neko/shared/vscode';

interface AnimationPlayerProps {
  clips: AnimationClipInfo[];
  activeClip: string | null;
  playbackState: PlaybackState;
  onSelectClip: (name: string) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
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
  onPlay,
  onPause,
  onStop,
}: AnimationPlayerProps): React.JSX.Element {
  const [fadeDuration, setFadeDuration] = useState(0.3);

  const handleClipChange = useCallback(
    (clipName: string) => {
      // If currently playing, crossfade to the new clip instead of stop+play
      if (playbackState === 'playing' && activeClip && clipName !== activeClip) {
        postMessage({
          type: 'crossfadeAnimation',
          clipName,
          fadeDuration,
          loop: true,
        });
      }
      onSelectClip(clipName);
    },
    [playbackState, activeClip, fadeDuration, onSelectClip],
  );

  if (clips.length === 0) {
    return <></>;
  }

  return (
    <div className="model-bottom-panel absolute bottom-0 left-0 right-0 flex items-center gap-2 p-2 text-xs">
      <select
        className="px-2 py-1 text-xs"
        value={activeClip ?? ''}
        onChange={(e) => handleClipChange(e.target.value)}
      >
        <option value="">-- Select Animation --</option>
        {clips.map((clip) => (
          <option key={clip.name} value={clip.name}>
            {clip.name} ({clip.duration.toFixed(2)}s)
          </option>
        ))}
      </select>

      <button
        className="model-btn-primary px-2 py-1"
        onClick={playbackState === 'playing' ? onPause : onPlay}
        disabled={!activeClip}
      >
        {playbackState === 'playing' ? 'Pause' : 'Play'}
      </button>

      <button
        className="model-btn-secondary px-2 py-1"
        onClick={onStop}
        disabled={!activeClip || playbackState === 'stopped'}
      >
        Stop
      </button>

      <label className="flex items-center gap-1 text-[var(--model-fg-secondary)]">
        Fade
        <input
          type="number"
          min={0}
          max={5}
          step={0.1}
          value={fadeDuration}
          onChange={(e) => setFadeDuration(Math.max(0, parseFloat(e.target.value) || 0))}
          className="model-input w-12 px-1 py-0.5 text-center text-xs"
        />
        s
      </label>

      {activeClip && (
        <span className="ml-auto text-[var(--model-fg-secondary)]">
          {playbackState === 'playing'
            ? 'Playing'
            : playbackState === 'paused'
              ? 'Paused'
              : 'Stopped'}{' '}
          {activeClip}
        </span>
      )}
    </div>
  );
}
