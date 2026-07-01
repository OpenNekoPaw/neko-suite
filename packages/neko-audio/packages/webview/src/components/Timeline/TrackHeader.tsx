/**
 * TrackHeader — Track label panel with Solo/Mute/Lock, volume fader, pan knob, color bar.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioProjectStore, type AudioTrackUIState } from '../../stores/audioProjectStore';
import { useAudioStore } from '../../stores/audioStore';
import type { TimelineTrack } from '@neko/shared';
import { t } from '../../i18n';

interface TrackHeaderProps {
  track: TimelineTrack;
  uiState: AudioTrackUIState;
  width: number;
  height: number;
  automationExpanded?: boolean;
  onToggleAutomation?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function TrackHeader({
  track,
  uiState,
  width,
  height,
  automationExpanded,
  onToggleAutomation,
  onContextMenu,
}: TrackHeaderProps) {
  const toggleTrackField = useAudioProjectStore((s) => s.toggleTrackField);
  const toggleSolo = useAudioProjectStore((s) => s.toggleSolo);
  const setTrackVolume = useAudioProjectStore((s) => s.setTrackVolume);
  const setTrackPan = useAudioProjectStore((s) => s.setTrackPan);
  const removeTrack = useAudioProjectStore((s) => s.removeTrack);
  const setSelectedWorkbenchTarget = useAudioStore((s) => s.setSelectedWorkbenchTarget);
  const hasAiHighlight = useAudioProjectStore((s) => s.hasAiTrackHighlight(track.id));
  const [draftVolume, setDraftVolume] = useState(uiState.volume);
  const [draftPan, setDraftPan] = useState(uiState.pan);
  const committedVolumeRef = useRef(uiState.volume);
  const committedPanRef = useRef(uiState.pan);

  useEffect(() => {
    committedVolumeRef.current = uiState.volume;
    setDraftVolume(uiState.volume);
  }, [uiState.volume]);

  useEffect(() => {
    committedPanRef.current = uiState.pan;
    setDraftPan(uiState.pan);
  }, [uiState.pan]);

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

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraftVolume(parseFloat(e.target.value));
  }, []);

  const handleVolumeCommit = useCallback(() => {
    if (draftVolume !== committedVolumeRef.current) {
      committedVolumeRef.current = draftVolume;
      setTrackVolume(track.id, draftVolume);
    }
  }, [draftVolume, track.id, setTrackVolume]);

  const handlePanChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraftPan(parseFloat(e.target.value));
  }, []);

  const handlePanCommit = useCallback(() => {
    if (draftPan !== committedPanRef.current) {
      committedPanRef.current = draftPan;
      setTrackPan(track.id, draftPan);
    }
  }, [draftPan, track.id, setTrackPan]);

  const fxCount = uiState.effectChain.filter((e) => e.enabled).length;

  return (
    <div
      className="neko-track-header flex shrink-0 border-r border-[var(--editor-border)] bg-[var(--track-header-bg)] overflow-hidden"
      style={{ width, minWidth: width, height }}
      onClick={() => setSelectedWorkbenchTarget({ kind: 'track', trackId: track.id })}
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
          {hasAiHighlight && <span className="neko-ai-badge">AI</span>}
          {fxCount > 0 && (
            <span className="text-[9px] px-1 rounded bg-[var(--accent)] text-white leading-tight">
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
          <button
            onClick={onToggleAutomation}
            title={t('audio.automation.toggle')}
            className={`neko-track-btn ${automationExpanded ? 'active-solo' : ''}`}
          >
            A
          </button>
        </div>

        {/* Row 3: Volume fader + Pan */}
        <div className="flex items-center gap-1">
          <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={draftVolume}
            onChange={handleVolumeChange}
            onPointerUp={handleVolumeCommit}
            onBlur={handleVolumeCommit}
            className="neko-fader flex-1 h-3"
            title={t('audio.mixer.volumePercent', { value: Math.round(draftVolume * 100) })}
          />
          <input
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={draftPan}
            onChange={handlePanChange}
            onPointerUp={handlePanCommit}
            onBlur={handlePanCommit}
            className="neko-pan-knob w-8 h-3"
            title={t('audio.mixer.panValue', {
              value:
                draftPan > 0
                  ? `R${Math.round(draftPan * 100)}`
                  : draftPan < 0
                    ? `L${Math.round(-draftPan * 100)}`
                    : t('audio.mixer.center'),
            })}
          />
        </div>
      </div>
    </div>
  );
}
