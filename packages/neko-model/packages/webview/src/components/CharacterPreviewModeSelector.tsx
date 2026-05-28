import React from 'react';
import type { CharacterPreviewModeId } from '@neko/shared';
import { DEFAULT_CHARACTER_PREVIEW_MODE_DESCRIPTORS } from '@neko/shared';
import type { CharacterPreviewUiState } from '../stores/modelStore';

export interface CharacterPreviewModeSelectorProps {
  state: CharacterPreviewUiState;
  disabled: boolean;
  statusLabel?: string;
  onModeChange: (modeId: CharacterPreviewModeId) => void;
  onResetCamera: () => void;
  onPlaybackControl?: (action: 'play' | 'pause' | 'stop') => void;
}

export function CharacterPreviewModeSelector({
  state,
  disabled,
  statusLabel,
  onModeChange,
  onResetCamera,
  onPlaybackControl,
}: CharacterPreviewModeSelectorProps): React.JSX.Element {
  const activeMode = state.requestedMode ?? state.appliedMode ?? 'face';
  const diagnostic = state.diagnostics[0]?.message ?? null;
  const playbackState = state.state?.playback.state;
  const displayStatus =
    statusLabel ?? (state.status === 'pending' ? 'Pending' : (playbackState ?? state.status));
  const canControlPlayback =
    !disabled &&
    (state.appliedMode === 'motion' || state.appliedMode === 'voice-pack') &&
    (playbackState === 'playing' ||
      playbackState === 'paused' ||
      playbackState === 'stopped' ||
      playbackState === 'idle' ||
      playbackState === 'failed');
  const canResetCamera = !disabled && Boolean(state.appliedMode ?? state.requestedMode);
  const primaryPlaybackAction = playbackState === 'playing' ? 'pause' : 'play';

  return (
    <div className="model-character-preview-modes" aria-label="AI character preview modes">
      <div className="model-character-preview-segments" role="tablist">
        {DEFAULT_CHARACTER_PREVIEW_MODE_DESCRIPTORS.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={activeMode === mode.id}
            disabled={disabled}
            className={activeMode === mode.id ? 'active' : undefined}
            title={mode.label}
            onClick={() => onModeChange(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <div className="model-character-preview-status">
        <span>{displayStatus}</span>
        {canControlPlayback ? (
          <div className="model-character-preview-playback" aria-label="Preview playback controls">
            <button
              type="button"
              className="model-character-preview-playback-button"
              title={`${primaryPlaybackAction} preview playback`}
              onClick={() => onPlaybackControl?.(primaryPlaybackAction)}
            >
              {primaryPlaybackAction === 'pause' ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              className="model-character-preview-playback-button"
              title="Stop preview playback"
              onClick={() => onPlaybackControl?.('stop')}
            >
              Stop
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="model-character-preview-reset"
          disabled={!canResetCamera}
          title="Reset preview camera"
          onClick={onResetCamera}
        >
          Reset
        </button>
      </div>
      {diagnostic ? <div className="model-character-preview-diagnostic">{diagnostic}</div> : null}
    </div>
  );
}
