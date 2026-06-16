import { useCallback, useEffect, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import {
  useAudioProjectStore,
  type AiOperationHighlight,
  type AudioTrackUIState,
} from '../stores/audioProjectStore';
import type { TimelineTrack } from '@neko/shared';
import { t } from '../i18n';

export function MixerPanel() {
  const tracks = useAudioProjectStore((state) => state.audioProjectData?.tracks ?? []);
  const projectLoaded = useAudioProjectStore((state) => state.audioProjectData !== null);

  if (!projectLoaded) {
    return (
      <div className="neko-mixer-panel">
        <div className="neko-mixer-empty" />
      </div>
    );
  }

  return (
    <div className="neko-mixer-panel">
      <div className="neko-mixer-strip-row">
        {tracks.map((track) => (
          <ChannelStrip key={track.id} track={track} />
        ))}
        <MasterStrip />
      </div>
    </div>
  );
}

interface ChannelStripProps {
  track: TimelineTrack;
}

function ChannelStrip({ track }: ChannelStripProps) {
  const uiState = useAudioProjectStore((state) => state.getTrackUIState(track.id), shallow);
  const toggleTrackField = useAudioProjectStore((state) => state.toggleTrackField);
  const toggleSolo = useAudioProjectStore((state) => state.toggleSolo);
  const setTrackVolume = useAudioProjectStore((state) => state.setTrackVolume);
  const setTrackPan = useAudioProjectStore((state) => state.setTrackPan);
  const hasAiTrackHighlight = useAudioProjectStore((state) => state.hasAiTrackHighlight(track.id));
  const aiOperationHighlights = useAudioProjectStore((state) => state.aiOperationHighlights);
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

  const handleMute = useCallback(() => {
    toggleTrackField(track.id, 'muted');
  }, [track.id, toggleTrackField]);

  const handleSolo = useCallback(() => {
    toggleSolo(track.id);
  }, [track.id, toggleSolo]);

  const handleVolumeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setDraftVolume(Number.parseFloat(event.target.value));
  }, []);

  const handleVolumeCommit = useCallback(() => {
    if (draftVolume !== committedVolumeRef.current) {
      committedVolumeRef.current = draftVolume;
      setTrackVolume(track.id, draftVolume);
    }
  }, [draftVolume, track.id, setTrackVolume]);

  const handlePanChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setDraftPan(Number.parseFloat(event.target.value));
  }, []);

  const handlePanCommit = useCallback(() => {
    if (draftPan !== committedPanRef.current) {
      committedPanRef.current = draftPan;
      setTrackPan(track.id, draftPan);
    }
  }, [draftPan, track.id, setTrackPan]);

  return (
    <div className={`neko-channel-strip ${hasAiTrackHighlight ? 'neko-ai-track-highlight' : ''}`}>
      <div className="neko-channel-color" style={{ backgroundColor: uiState.color }} />
      <div className="neko-channel-head">
        <span className="flex items-center gap-1 min-w-0">
          <span className="neko-channel-name" title={track.name}>
            {track.name}
          </span>
          {hasAiTrackHighlight && <span className="neko-ai-badge">AI</span>}
        </span>
        <span className="neko-channel-meter" aria-label={formatGainLabel(draftVolume)}>
          {formatDb(draftVolume)}
        </span>
      </div>

      <div className="neko-channel-buttons">
        <button
          className={`neko-track-btn ${uiState.solo ? 'active-solo' : ''}`}
          onClick={handleSolo}
          title={t('audio.track.solo')}
        >
          S
        </button>
        <button
          className={`neko-track-btn ${track.muted ? 'active-mute' : ''}`}
          onClick={handleMute}
          title={track.muted ? t('audio.track.unmute') : t('audio.track.mute')}
        >
          M
        </button>
        <span
          className={`neko-channel-fx ${
            hasHighlightedEffect(uiState, aiOperationHighlights) ? 'neko-ai-effect-highlight' : ''
          }`}
        >
          {formatFx(uiState)}
        </span>
      </div>

      <label className="neko-channel-control">
        <span>{t('audio.mixer.volumeShort')}</span>
        <input
          type="range"
          min="0"
          max="2"
          step="0.01"
          value={draftVolume}
          onChange={handleVolumeChange}
          onPointerUp={handleVolumeCommit}
          onBlur={handleVolumeCommit}
          className="neko-fader"
          title={t('audio.mixer.volumePercent', { value: Math.round(draftVolume * 100) })}
        />
      </label>

      <label className="neko-channel-control">
        <span>{t('audio.mixer.panShort')}</span>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={draftPan}
          onChange={handlePanChange}
          onPointerUp={handlePanCommit}
          onBlur={handlePanCommit}
          className="neko-pan-knob"
          title={formatPan(draftPan)}
        />
      </label>
    </div>
  );
}

function MasterStrip() {
  const masterVolume = useAudioProjectStore((state) => state.audioProjectData?.masterVolume ?? 1);
  const setMasterVolume = useAudioProjectStore((state) => state.setMasterVolume);
  const [draftVolume, setDraftVolume] = useState(masterVolume);
  const committedVolumeRef = useRef(masterVolume);

  useEffect(() => {
    committedVolumeRef.current = masterVolume;
    setDraftVolume(masterVolume);
  }, [masterVolume]);

  const handleVolumeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setDraftVolume(Number.parseFloat(event.target.value));
  }, []);

  const handleVolumeCommit = useCallback(() => {
    if (draftVolume !== committedVolumeRef.current) {
      committedVolumeRef.current = draftVolume;
      setMasterVolume(draftVolume);
    }
  }, [draftVolume, setMasterVolume]);

  return (
    <div className="neko-channel-strip neko-master-strip">
      <div className="neko-channel-color neko-master-color" />
      <div className="neko-channel-head">
        <span className="flex items-center gap-1 min-w-0">
          <span className="neko-channel-name" title={t('audio.mixer.master')}>
            {t('audio.mixer.master')}
          </span>
        </span>
        <span className="neko-channel-meter" aria-label={formatGainLabel(draftVolume)}>
          {formatDb(draftVolume)}
        </span>
      </div>

      <div className="neko-master-meter" aria-label={t('audio.mixer.masterMeterPending')}>
        <span />
        <span />
      </div>

      <label className="neko-channel-control">
        <span>{t('audio.mixer.volumeShort')}</span>
        <input
          type="range"
          min="0"
          max="2"
          step="0.01"
          value={draftVolume}
          onChange={handleVolumeChange}
          onPointerUp={handleVolumeCommit}
          onBlur={handleVolumeCommit}
          className="neko-fader"
          title={t('audio.mixer.volumePercent', { value: Math.round(draftVolume * 100) })}
        />
      </label>
    </div>
  );
}

function formatDb(volume: number): string {
  if (volume <= 0) return '-inf';
  const db = 20 * Math.log10(volume);
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)}`;
}

function formatGainLabel(volume: number): string {
  return t('audio.mixer.gainDb', { value: formatDb(volume) });
}

function formatPan(pan: number): string {
  if (pan > 0) return `R${Math.round(pan * 100)}`;
  if (pan < 0) return `L${Math.round(Math.abs(pan) * 100)}`;
  return t('audio.mixer.center');
}

function formatFx(uiState: AudioTrackUIState): string {
  const count = uiState.effectChain.filter((effect) => effect.enabled).length;
  return count > 0 ? `FX ${count}` : 'FX';
}

function hasHighlightedEffect(
  uiState: AudioTrackUIState,
  highlights: Record<string, AiOperationHighlight>,
): boolean {
  return uiState.effectChain.some((effect) =>
    Object.values(highlights).some((highlight) => highlight.effectIds.includes(effect.id)),
  );
}
