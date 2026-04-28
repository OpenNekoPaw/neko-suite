import React from 'react';
import { useModelStore } from '../stores/modelStore';

export function EngineDiagnosticsPanel(): React.JSX.Element {
  const sceneRevision = useModelStore((s) => s.sceneRevision);
  const topologyVersions = useModelStore((s) => s.characterTopologyVersions);
  const predictions = useModelStore((s) => s.localPredictions);
  const modelingSessions = useModelStore((s) => s.modelingSessions);
  const lastFrameMeta = useModelStore((s) => s.lastRenderFrameMeta);
  const metrics = useModelStore((s) => s.authoringMetricsSnapshot);
  const topologyWarning = useModelStore((s) => s.topologyWarning);

  const topologyVersion = Object.values(topologyVersions)[0] ?? 0;
  const qualityTier = readQualityTier(lastFrameMeta?.diagnostics);
  const modelingSession = formatModelingSession(Object.values(modelingSessions));

  return (
    <div className="pointer-events-none absolute bottom-12 right-3 z-10 min-w-56 rounded border border-[var(--model-border)] bg-[var(--model-panel-bg)]/90 px-3 py-2 text-[11px] text-[var(--model-fg-secondary)] shadow">
      <div className="mb-1 text-[var(--model-fg)]">Engine</div>
      <DiagnosticRow label="scene" value={sceneRevision} />
      <DiagnosticRow label="topology" value={topologyVersion} />
      <DiagnosticRow label="appliedSeq" value={lastFrameMeta?.appliedSeq ?? 0} />
      <DiagnosticRow label="predictions" value={predictions.length} />
      <DiagnosticRow label="session" value={modelingSession} />
      <DiagnosticRow label="quality" value={qualityTier} />
      <DiagnosticRow label="ack p95" value={`${metrics.ackP95Ms.toFixed(1)} ms`} />
      <DiagnosticRow label="patch bw" value={`${metrics.patchBandwidthBytesPerSec} B/s`} />
      <DiagnosticRow label="gpu upload" value={`${metrics.gpuUploadMs.toFixed(1)} ms`} />
      <DiagnosticRow label="frame p95" value={`${metrics.frameLatencyMs.toFixed(1)} ms`} />
      <DiagnosticRow label="dropped" value={metrics.droppedPredictions} />
      {topologyWarning && <div className="mt-1 text-[var(--model-danger)]">{topologyWarning}</div>}
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

function readQualityTier(diagnostics: unknown): string {
  if (!diagnostics || typeof diagnostics !== 'object') return 'unknown';
  const value = (diagnostics as Record<string, unknown>)['qualityTier'];
  return typeof value === 'string' ? value : 'unknown';
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
