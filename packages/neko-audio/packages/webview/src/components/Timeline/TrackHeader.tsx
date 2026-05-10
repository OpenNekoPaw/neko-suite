/**
 * TrackHeader — Track label panel with Solo/Mute/Lock, volume fader, pan knob, color bar.
 */

import { useCallback } from 'react';
import { useAudioProjectStore, type AudioTrackUIState } from '../../stores/audioProjectStore';
import type { TimelineTrack } from '@neko/shared';
import { t } from '../../i18n';

interface TrackHeaderProps {
  track: TimelineTrack;
  uiState: AudioTrackUIState;
  width: number;
  height: number;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function TrackHeader({ track, uiState, width, height, onContextMenu }: TrackHeaderProps) {
  const toggleTrackField = useAudioProjectStore((s) => s.toggleTrackField);
  const toggleSolo = useAudioProjectStore((s) => s.toggleSolo);
  const setTrackVolume = useAudioProjectStore((s) => s.setTrackVolume);
  const setTrackPan = useAudioProjectStore((s) => s.setTrackPan);
  const removeTrack = useAudioProjectStore((s) => s.removeTrack);

  const handleToggleMute = useCallback(() => {
    toggleTrackField(track.id, 'muted');
  }, [track.id, toggleTrackField]);

  const handleToggleSolo = useCallback(() => {
    toggleSolo(track.id);
  }, [track.id, toggleSolo]);

  const handleToggleLock = useCallback(() => {
    toggleTrackField(track.id, 'locked');
  }, [track.id, toggleTrackField]);

  const handleRemove = useCallback(() => {
    removeTrack(track.id);
  }, [track.id, removeTrack]);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTrackVolume(track.id, parseFloat(e.target.value));
    },
    [track.id, setTrackVolume],
  );

  const handlePanChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTrackPan(track.id, parseFloat(e.target.value));
    },
    [track.id, setTrackPan],
  );

  const fxCount = uiState.effectChain.filter((e) => e.enabled).length;

  return (
    <div
      className="flex shrink-0 border-r border-[var(--editor-border)] bg-[var(--track-header-bg)] overflow-hidden"
      style={{ width, minWidth: width, height }}
      onContextMenu={onContextMenu}
    >
      {/* Color bar */}
      <div className="w-1 shrink-0" style={{ backgroundColor: uiState.color }} />

      <div className="flex flex-col justify-between py-1 px-1.5 flex-1 min-w-0">
        {/* Row 1: Track name + FX badge */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-[var(--activity-fg)] truncate flex-1">
            {track.name}
          </span>
          {fxCount > 0 && (
            <span className="text-[9px] px-1 rounded bg-[var(--neko-accent)] text-white leading-tight">
              FX {fxCount}
            </span>
          )}
        </div>

        {/* Row 2: S M L × buttons */}
        <div className="flex gap-0.5 items-center">
          <button
            onClick={handleToggleSolo}
            title={t('audio.track.solo')}
            className={`neko-track-btn ${uiState.solo ? 'active-solo' : ''}`}
          >
            S
          </button>
          <button
            onClick={handleToggleMute}
            title={track.muted ? t('audio.track.unmute') : t('audio.track.mute')}
            className={`neko-track-btn ${track.muted ? 'active-mute' : ''}`}
          >
            M
          </button>
          <button
            onClick={handleToggleLock}
            title={track.locked ? t('audio.track.unlock') : t('audio.track.lock')}
            className={`neko-track-btn ${track.locked ? 'active-lock' : ''}`}
          >
            L
          </button>
          <button
            onClick={handleRemove}
            title={t('audio.track.delete')}
            className="neko-track-btn remove"
          >
            ×
          </button>
        </div>

        {/* Row 3: Volume fader + Pan */}
        <div className="flex items-center gap-1">
          <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={uiState.volume}
            onChange={handleVolumeChange}
            className="neko-fader flex-1 h-3"
            title={`Vol: ${Math.round(uiState.volume * 100)}%`}
          />
          <input
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={uiState.pan}
            onChange={handlePanChange}
            className="neko-pan-knob w-8 h-3"
            title={`Pan: ${uiState.pan > 0 ? `R${Math.round(uiState.pan * 100)}` : uiState.pan < 0 ? `L${Math.round(-uiState.pan * 100)}` : 'C'}`}
          />
        </div>
      </div>
    </div>
  );
}
