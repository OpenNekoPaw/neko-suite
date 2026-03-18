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
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>{t('audio.properties.title')}</h3>

      {/* Volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 11, width: 50, flexShrink: 0 }}>
          {t('audio.properties.volume')}
        </label>
        <input
          type="range"
          className="slider"
          min="0"
          max="2"
          step="0.01"
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, width: 40, textAlign: 'right' }}>
          {Math.round(volume * 100)}%
        </span>
      </div>

      {/* Pan */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 11, width: 50, flexShrink: 0 }}>
          {t('audio.properties.pan')}
        </label>
        <input
          type="range"
          className="slider"
          min="-1"
          max="1"
          step="0.01"
          value={pan}
          onChange={(e) => onPanChange(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, width: 40, textAlign: 'right' }}>
          {pan === 0
            ? 'C'
            : pan < 0
              ? `L${Math.round(Math.abs(pan) * 100)}`
              : `R${Math.round(pan * 100)}`}
        </span>
      </div>

      {/* Gain */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 11, width: 50, flexShrink: 0 }}>
          {t('audio.properties.gain')}
        </label>
        <input
          type="range"
          className="slider"
          min="-20"
          max="20"
          step="0.5"
          value={gain}
          onChange={(e) => onGainChange(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, width: 40, textAlign: 'right' }}>
          {gain > 0 ? '+' : ''}
          {gain.toFixed(1)}dB
        </span>
      </div>
    </div>
  );
}
