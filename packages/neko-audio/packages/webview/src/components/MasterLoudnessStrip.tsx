import { useAudioStore } from '../stores/audioStore';
import { requestAudioAnalysis } from '../utils/audioAnalysisActions';
import { resolveMasterReadiness } from '../utils/audioWorkbench';
import { AudioButton } from './shared/AudioUiPrimitives';
import { t } from '../i18n';

export interface MasterLoudnessStripProps {
  readonly variant?: 'mixer' | 'export';
}

export function MasterLoudnessStrip({ variant = 'mixer' }: MasterLoudnessStripProps) {
  const loudness = useAudioStore((s) => s.loudness);
  const status = useAudioStore((s) => s.loudnessAnalysisStatus);
  const readiness = resolveMasterReadiness(loudness, status);
  const isPending = readiness.state === 'pending';
  const hasMetrics = readiness.loudness !== null;
  const className = `master-loudness-strip ${variant} ${readiness.state}`;

  return (
    <div
      className={className}
      data-master-readiness={readiness.state}
      aria-label={t('audio.masterReadiness.title')}
    >
      <div className="master-loudness-summary">
        <span>{t('audio.masterReadiness.title')}</span>
        <strong>{t(readiness.diagnosticKey)}</strong>
      </div>
      {hasMetrics ? (
        <div className="master-loudness-metrics">
          <Metric
            label={t('audio.analysis.integrated')}
            value={`${readiness.loudness.integratedLoudness.toFixed(1)} LUFS`}
          />
          <Metric
            label={t('audio.analysis.truePeak')}
            value={`${readiness.loudness.truePeak.toFixed(1)} dBTP`}
            hot={readiness.state === 'clipping'}
          />
          <Metric
            label={t('audio.analysis.range')}
            value={`${readiness.loudness.loudnessRange.toFixed(1)} LU`}
          />
        </div>
      ) : (
        <div className="master-loudness-empty">{t('audio.masterReadiness.noMetrics')}</div>
      )}
      <AudioButton
        variant="secondary"
        disabled={isPending}
        onClick={() => requestAudioAnalysis('loudness')}
      >
        {isPending ? t('audio.masterReadiness.analyzing') : t('audio.masterReadiness.analyze')}
      </AudioButton>
    </div>
  );
}

interface MetricProps {
  readonly label: string;
  readonly value: string;
  readonly hot?: boolean;
}

function Metric({ label, value, hot = false }: MetricProps) {
  return (
    <span className={hot ? 'hot' : undefined}>
      <em>{label}</em>
      <strong>{value}</strong>
    </span>
  );
}
