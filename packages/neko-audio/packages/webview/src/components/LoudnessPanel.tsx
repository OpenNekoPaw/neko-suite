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
    <div className="flex items-center gap-3 px-3 py-1.5 shrink-0 text-[11px] bg-[var(--activity-bg)] border-t border-[var(--editor-border)]">
      <span className="inline-flex items-center gap-1.5">
        <span className="opacity-60">{t('audio.analysis.integrated')}</span>
        <span className="font-mono">{loudness.integratedLoudness.toFixed(1)} LUFS</span>
      </span>
      <span className="w-px h-3 bg-[var(--editor-border)]" />
      <span className="inline-flex items-center gap-1.5">
        <span className="opacity-60">{t('audio.analysis.truePeak')}</span>
        <span
          className="font-mono"
          style={isHot ? { color: 'var(--vscode-errorForeground)' } : undefined}
        >
          {loudness.truePeak.toFixed(1)} dBTP
        </span>
      </span>
      <span className="w-px h-3 bg-[var(--editor-border)]" />
      <span className="inline-flex items-center gap-1.5">
        <span className="opacity-60">{t('audio.analysis.range')}</span>
        <span className="font-mono">{loudness.loudnessRange.toFixed(1)} LU</span>
      </span>
    </div>
  );
}
