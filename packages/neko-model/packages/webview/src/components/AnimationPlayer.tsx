import React, { useCallback, useState } from 'react';
import type { AnimationClipInfo, PlaybackState } from '../types';

// Acquire VSCode API if available
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

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
        vscode?.postMessage({
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
    <div className="absolute bottom-0 left-0 right-0 bg-[var(--vscode-panel-background,#252526)] border-t border-[var(--vscode-panel-border,#3c3c3c)] p-2 flex items-center gap-2 text-xs">
      {/* Clip selector */}
      <select
        className="bg-[var(--vscode-dropdown-background,#3c3c3c)] text-[var(--vscode-dropdown-foreground,#cccccc)] border border-[var(--vscode-dropdown-border,#555)] rounded px-2 py-1 text-xs"
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

      {/* Playback controls */}
      <button
        className="px-2 py-1 rounded bg-[var(--vscode-button-background,#0e639c)] text-[var(--vscode-button-foreground,#ffffff)] hover:opacity-80 disabled:opacity-40"
        onClick={playbackState === 'playing' ? onPause : onPlay}
        disabled={!activeClip}
      >
        {playbackState === 'playing' ? 'Pause' : 'Play'}
      </button>

      <button
        className="px-2 py-1 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] text-[var(--vscode-button-secondaryForeground,#cccccc)] hover:opacity-80 disabled:opacity-40"
        onClick={onStop}
        disabled={!activeClip || playbackState === 'stopped'}
      >
        Stop
      </button>

      {/* Fade duration control */}
      <label className="flex items-center gap-1 opacity-70">
        Fade
        <input
          type="number"
          min={0}
          max={5}
          step={0.1}
          value={fadeDuration}
          onChange={(e) => setFadeDuration(Math.max(0, parseFloat(e.target.value) || 0))}
          className="w-12 bg-[var(--vscode-input-background,#3c3c3c)] text-[var(--vscode-input-foreground,#cccccc)] border border-[var(--vscode-input-border,#555)] rounded px-1 py-0.5 text-xs text-center"
        />
        s
      </label>

      {/* Status */}
      {activeClip && (
        <span className="ml-auto opacity-60">
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
