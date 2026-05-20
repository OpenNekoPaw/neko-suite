import React from 'react';
import type { EngineRenderFrameDiagnostics } from '@neko/shared';
import { useModelStore } from '../stores/modelStore';
import { useTranslation } from '../i18n/I18nContext';

export function EngineDiagnosticsPanel(): React.JSX.Element {
  const [expanded, setExpanded] = React.useState(false);
  const sceneRevision = useModelStore((s) => s.sceneRevision);
  const topologyVersions = useModelStore((s) => s.characterTopologyVersions);
  const predictions = useModelStore((s) => s.localPredictions);
  const modelingSessions = useModelStore((s) => s.modelingSessions);
  const lastFrameMeta = useModelStore((s) => s.lastRenderFrameMeta);
  const metrics = useModelStore((s) => s.authoringMetricsSnapshot);
  const topologyWarning = useModelStore((s) => s.topologyWarning);

  const { t } = useTranslation();
  const topologyVersion = Object.values(topologyVersions)[0] ?? 0;
  const diagnostics = lastFrameMeta?.diagnostics;
  const qualityTier = diagnostics?.qualityTier ?? 'unknown';
  const modelingSession = formatModelingSession(Object.values(modelingSessions));

  return (
    <div className="model-engine-diagnostics">
      <button
        type="button"
        className="model-engine-pill"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className={lastFrameMeta ? 'model-engine-dot ready' : 'model-engine-dot'} />
        <span>{t('diagnostics.title')}</span>
        <span>rev {sceneRevision}</span>
      </button>
      {expanded && (
        <div className="model-engine-popover">
          <DiagnosticRow label={t('diagnostics.scene')} value={sceneRevision} />
          <DiagnosticRow label={t('diagnostics.topology')} value={topologyVersion} />
          <DiagnosticRow
            label={t('diagnostics.appliedSeq')}
            value={lastFrameMeta?.appliedSeq ?? 0}
          />
          <DiagnosticRow label={t('diagnostics.predictions')} value={predictions.length} />
          <DiagnosticRow label={t('diagnostics.session')} value={modelingSession} />
          <DiagnosticRow label={t('diagnostics.quality')} value={qualityTier} />
          <DiagnosticRow
            label={t('diagnostics.path')}
            value={diagnostics?.renderPath ?? 'unknown'}
          />
          <DiagnosticRow
            label={t('diagnostics.ackP95')}
            value={`${metrics.ackP95Ms.toFixed(1)} ms`}
          />
          <DiagnosticRow
            label={t('diagnostics.patchBw')}
            value={`${metrics.patchBandwidthBytesPerSec} B/s`}
          />
          <DiagnosticRow
            label={t('diagnostics.gpuUpload')}
            value={`${metrics.gpuUploadMs.toFixed(1)} ms`}
          />
          <DiagnosticRow
            label={t('diagnostics.render')}
            value={formatMs(diagnostics?.renderTimeMs ?? diagnostics?.gpuFrameTimeMs)}
          />
          <DiagnosticRow
            label={t('diagnostics.convert')}
            value={formatMs(diagnostics?.convertTimeMs ?? diagnostics?.gpuUploadTimeMs)}
          />
          <DiagnosticRow
            label={t('diagnostics.encode')}
            value={formatMs(diagnostics?.encodeTimeMs)}
          />
          <DiagnosticRow
            label={t('diagnostics.decode')}
            value={formatMs(diagnostics?.decodeTimeMs)}
          />
          <DiagnosticRow label={t('diagnostics.draw')} value={formatMs(diagnostics?.drawTimeMs)} />
          <DiagnosticRow
            label={t('diagnostics.gpuWait')}
            value={formatMs(diagnostics?.gpuWaitTimeMs)}
          />
          <DiagnosticRow
            label={t('diagnostics.frameP95')}
            value={`${metrics.frameLatencyMs.toFixed(1)} ms`}
          />
          <DiagnosticRow
            label={t('diagnostics.iosurfaceCreations')}
            value={formatCount(diagnostics?.iosurfaceCreations)}
          />
          <DiagnosticRow
            label={t('diagnostics.textureAllocations')}
            value={formatCount(diagnostics?.textureAllocations)}
          />
          <DiagnosticRow
            label={t('diagnostics.queueDepth')}
            value={formatCount(diagnostics?.queueDepth)}
          />
          <DiagnosticRow
            label={t('diagnostics.dropped')}
            value={formatDroppedFrames(diagnostics, metrics.droppedPredictions)}
          />
          {topologyWarning && (
            <div className="mt-1 text-[var(--model-danger)]">{topologyWarning}</div>
          )}
        </div>
      )}
    </div>
  );
}

function DiagnosticRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}): React.JSX.Element {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="text-[var(--model-fg)]">{value}</span>
    </div>
  );
}

function formatModelingSession(
  sessions: Array<{ sessionId: string; state: string; topologyVersion: number }>,
): string {
  const active = sessions.filter(
    (session) => session.state !== 'committed' && session.state !== 'cancelled',
  );
  if (active.length === 0) return 'none';
  const first = active[0];
  if (!first) return 'none';
  return `${first.sessionId}@${first.topologyVersion}${active.length > 1 ? ` +${active.length - 1}` : ''}`;
}

function formatMs(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '-';
  return `${value.toFixed(1)} ms`;
}

function formatCount(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '-';
  return String(value);
}

function formatDroppedFrames(
  diagnostics: EngineRenderFrameDiagnostics | undefined,
  droppedPredictions: number,
): string {
  const droppedFrames = diagnostics?.droppedFramesSinceLast;
  if (droppedFrames === undefined || !Number.isFinite(droppedFrames)) {
    return String(droppedPredictions);
  }
  return `${droppedFrames}`;
}
