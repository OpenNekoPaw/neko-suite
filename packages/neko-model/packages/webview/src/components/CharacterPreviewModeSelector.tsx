import React from 'react';
import type { CharacterPreviewModeId, CharacterPreviewPlaybackState } from '@neko/shared';
import { DEFAULT_CHARACTER_PREVIEW_MODE_DESCRIPTORS } from '@neko/shared';
import type { CharacterPreviewUiState } from '../stores/modelStore';
import { useTranslation } from '../i18n/I18nContext';

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
  const { t } = useTranslation();
  const activeMode = state.requestedMode ?? state.appliedMode ?? 'face';
  const diagnostic = state.diagnostics[0]?.message ?? null;
  const playbackState = state.state?.playback.state;
  const displayStatus = statusLabel ?? characterPreviewStatusLabel(state.status, playbackState, t);
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
    <div className="model-character-preview-modes" aria-label={t('characterPreview.aria.modes')}>
      <div className="model-character-preview-segments" role="tablist">
        {DEFAULT_CHARACTER_PREVIEW_MODE_DESCRIPTORS.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={activeMode === mode.id}
            disabled={disabled}
            className={activeMode === mode.id ? 'active' : undefined}
            title={t(`characterPreview.modeTitle.${mode.id}`)}
            onClick={() => onModeChange(mode.id)}
          >
            {t(`characterPreview.mode.${mode.id}`)}
          </button>
        ))}
      </div>
      <div className="model-character-preview-status">
        <span>{displayStatus}</span>
        {canControlPlayback ? (
          <div
            className="model-character-preview-playback"
            aria-label={t('characterPreview.aria.playback')}
          >
            <button
              type="button"
              className="model-character-preview-playback-button"
              title={t(`characterPreview.playbackTitle.${primaryPlaybackAction}`)}
              onClick={() => onPlaybackControl?.(primaryPlaybackAction)}
            >
              {primaryPlaybackAction === 'pause'
                ? t('characterPreview.pause')
                : t('characterPreview.play')}
            </button>
            <button
              type="button"
              className="model-character-preview-playback-button"
              title={t('characterPreview.playbackTitle.stop')}
              onClick={() => onPlaybackControl?.('stop')}
            >
              {t('characterPreview.stop')}
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="model-character-preview-reset"
          disabled={!canResetCamera}
          title={t('characterPreview.resetTitle')}
          onClick={onResetCamera}
        >
          {t('characterPreview.reset')}
        </button>
      </div>
      {diagnostic ? <div className="model-character-preview-diagnostic">{diagnostic}</div> : null}
    </div>
  );
}

function characterPreviewStatusLabel(
  status: CharacterPreviewUiState['status'],
  playbackState: CharacterPreviewPlaybackState | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (status === 'pending') {
    return t('characterPreview.status.pending');
  }
  if (playbackState) {
    return t(`characterPreview.playbackStatus.${playbackState}`);
  }
  return t(`characterPreview.status.${status}`);
}
