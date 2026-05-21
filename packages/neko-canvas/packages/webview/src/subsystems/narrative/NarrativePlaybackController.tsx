import type React from 'react';
import { SkipBackIcon, SkipForwardIcon, PlayIcon } from '@neko/shared/icons';
import { t } from '../../i18n';
import type { PlaybackControllerComponentProps } from '../types';

export default function NarrativePlaybackController(_props: PlaybackControllerComponentProps) {
  // TODO(P1): Wire controls to narrative playback state once runtime stepping is implemented.
  return (
    <div className="flex items-center gap-1">
      <ToolbarIconButton title={t('toolbar.playbackPrevious')} disabled>
        <SkipBackIcon size={14} />
      </ToolbarIconButton>
      <ToolbarIconButton title={t('toolbar.playbackPlay')} disabled>
        <PlayIcon size={14} />
      </ToolbarIconButton>
      <ToolbarIconButton title={t('toolbar.playbackNext')} disabled>
        <SkipForwardIcon size={14} />
      </ToolbarIconButton>
    </div>
  );
}

function ToolbarIconButton({
  title,
  disabled,
  children,
}: {
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded disabled:opacity-45"
      style={{
        border: '1px solid var(--control-border)',
        backgroundColor: 'var(--control-bg)',
        color: 'var(--control-fg)',
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </button>
  );
}
