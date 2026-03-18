/**
 * LoudnessPanel - EBU R128 loudness analysis display
 *
 * Shows integrated loudness (LUFS), true peak (dBTP), and loudness range (LU)
 * with visual meter bars.
 */

import { useAudioStore } from '../stores/audioStore';
import { t } from '../i18n';

/** Map a dB value to a 0–100% bar width */
function dbToPercent(db: number, min: number, max: number): number {
  return Math.max(0, Math.min(100, ((db - min) / (max - min)) * 100));
}

function MeterRow({
  label,
  value,
  unit,
  min,
  max,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
}) {
  const pct = dbToPercent(value, min, max);
  const isHot = unit === 'dBTP' && value > -1;

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}
      >
        <span style={{ opacity: 0.7 }}>{label}</span>
        <span
          style={{
            fontFamily: 'monospace',
            fontWeight: 600,
            color: isHot ? 'var(--vscode-errorForeground)' : undefined,
          }}
        >
          {value.toFixed(1)} {unit}
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--vscode-input-background)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 3,
            background: isHot
              ? 'var(--vscode-errorForeground)'
              : 'var(--vscode-progressBar-background)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

export function LoudnessPanel() {
  const loudness = useAudioStore((s) => s.loudness);

  if (!loudness) {
    return (
      <div
        className="audio-editor__panel"
        style={{ padding: '12px 16px', opacity: 0.6, fontSize: 12 }}
      >
        {t('audio.analysis.noData')}
      </div>
    );
  }

  return (
    <div className="audio-editor__panel" style={{ padding: '12px 16px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, opacity: 0.8 }}>
        {t('audio.analysis.loudness')}
      </div>

      <MeterRow
        label={t('audio.analysis.integrated')}
        value={loudness.integratedLoudness}
        unit="LUFS"
        min={-60}
        max={0}
      />
      <MeterRow
        label={t('audio.analysis.truePeak')}
        value={loudness.truePeak}
        unit="dBTP"
        min={-60}
        max={3}
      />
      <MeterRow
        label={t('audio.analysis.range')}
        value={loudness.loudnessRange}
        unit="LU"
        min={0}
        max={30}
      />
    </div>
  );
}
