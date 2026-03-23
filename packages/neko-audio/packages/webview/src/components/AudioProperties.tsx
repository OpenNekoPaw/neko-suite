/**
 * AudioProperties - Side panel for audio property controls
 *
 * Volume, pan, gain sliders for the currently loaded audio.
 * Displayed when toggled from the transport bar (future Phase C+).
 */

import { t } from '../i18n';

interface AudioPropertiesProps {
  volume: number;
  pan: number;
  gain: number;
  onVolumeChange: (value: number) => void;
  onPanChange: (value: number) => void;
  onGainChange: (value: number) => void;
}

export function AudioProperties({
  volume,
  pan,
  gain,
  onVolumeChange,
  onPanChange,
  onGainChange,
}: AudioPropertiesProps) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <h3 className="m-0 text-[13px] opacity-70">{t('audio.properties.title')}</h3>

      {/* Volume */}
      <div className="flex items-center gap-2">
        <label className="text-[11px] w-[50px] shrink-0">{t('audio.properties.volume')}</label>
        <input
          type="range"
          className="neko-slider flex-1"
          min="0"
          max="2"
          step="0.01"
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        />
        <span className="text-[11px] w-10 text-right">{Math.round(volume * 100)}%</span>
      </div>

      {/* Pan */}
      <div className="flex items-center gap-2">
        <label className="text-[11px] w-[50px] shrink-0">{t('audio.properties.pan')}</label>
        <input
          type="range"
          className="neko-slider flex-1"
          min="-1"
          max="1"
          step="0.01"
          value={pan}
          onChange={(e) => onPanChange(parseFloat(e.target.value))}
        />
        <span className="text-[11px] w-10 text-right">
          {pan === 0
            ? 'C'
            : pan < 0
              ? `L${Math.round(Math.abs(pan) * 100)}`
              : `R${Math.round(pan * 100)}`}
        </span>
      </div>

      {/* Gain */}
      <div className="flex items-center gap-2">
        <label className="text-[11px] w-[50px] shrink-0">{t('audio.properties.gain')}</label>
        <input
          type="range"
          className="neko-slider flex-1"
          min="-20"
          max="20"
          step="0.5"
          value={gain}
          onChange={(e) => onGainChange(parseFloat(e.target.value))}
        />
        <span className="text-[11px] w-10 text-right">
          {gain > 0 ? '+' : ''}
          {gain.toFixed(1)}dB
        </span>
      </div>
    </div>
  );
}
