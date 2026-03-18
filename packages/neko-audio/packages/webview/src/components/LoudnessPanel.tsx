/**
 * LoudnessPanel - EBU R128 loudness analysis display (compact mode)
 *
 * Single-line inline display at the bottom of the main area.
 * Hidden when no loudness data is available.
 */

import { useAudioStore } from '../stores/audioStore';
import { t } from '../i18n';

export function LoudnessPanel() {
  const loudness = useAudioStore((s) => s.loudness);

  if (!loudness) return null;

  const isHot = loudness.truePeak > -1;

  return (
    <div className="audio-loudness">
      <span className="audio-loudness__item">
        <span className="audio-loudness__label">{t('audio.analysis.integrated')}</span>
        <span className="audio-loudness__value">{loudness.integratedLoudness.toFixed(1)} LUFS</span>
      </span>
      <span className="audio-loudness__sep" />
      <span className="audio-loudness__item">
        <span className="audio-loudness__label">{t('audio.analysis.truePeak')}</span>
        <span
          className="audio-loudness__value"
          style={isHot ? { color: 'var(--vscode-errorForeground)' } : undefined}
        >
          {loudness.truePeak.toFixed(1)} dBTP
        </span>
      </span>
      <span className="audio-loudness__sep" />
      <span className="audio-loudness__item">
        <span className="audio-loudness__label">{t('audio.analysis.range')}</span>
        <span className="audio-loudness__value">{loudness.loudnessRange.toFixed(1)} LU</span>
      </span>
    </div>
  );
}
