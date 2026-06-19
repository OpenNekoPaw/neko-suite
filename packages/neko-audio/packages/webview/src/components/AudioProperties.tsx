/**
 * AudioProperties - Side panel for audio property controls
 *
 * Volume, pan, gain sliders for the currently loaded audio.
 * Displayed when toggled from the transport bar (future Phase C+).
 */

import { SliderPropertyRow } from '@neko/ui/creative';
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
    <div className="flex flex-col gap-3 p-3" data-audio-composition-path="properties">
      <h3 className="m-0 text-[13px] opacity-70">{t('audio.properties.title')}</h3>

      <SliderPropertyRow
        density="compact"
        id="audio.properties.volume"
        label={t('audio.properties.volume')}
        max={200}
        min={0}
        onCommit={(_, value) => onVolumeChange(value / 100)}
        onPreviewChange={(_, value) => onVolumeChange(value / 100)}
        step={1}
        unit="%"
        value={Math.round(volume * 100)}
      />

      <SliderPropertyRow
        density="compact"
        id="audio.properties.pan"
        label={t('audio.properties.pan')}
        max={1}
        min={-1}
        onCommit={(_, value) => onPanChange(value)}
        onPreviewChange={(_, value) => onPanChange(value)}
        step={0.01}
        unit={formatPan(pan)}
        value={pan}
      />

      <SliderPropertyRow
        density="compact"
        id="audio.properties.gain"
        label={t('audio.properties.gain')}
        max={20}
        min={-20}
        onCommit={(_, value) => onGainChange(value)}
        onPreviewChange={(_, value) => onGainChange(value)}
        step={0.5}
        unit="dB"
        value={gain}
      />
    </div>
  );
}

function formatPan(pan: number): string {
  if (pan === 0) return 'C';
  return pan < 0 ? `L${Math.round(Math.abs(pan) * 100)}` : `R${Math.round(pan * 100)}`;
}
