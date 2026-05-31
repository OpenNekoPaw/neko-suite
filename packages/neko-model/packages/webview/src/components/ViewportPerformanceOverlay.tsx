import React, { useMemo } from 'react';
import type { RenderFrameMeta } from '@neko/shared';
import { useTranslation } from '../i18n/I18nContext';
import { useModelStore } from '../stores/modelStore';
import type { AuthoringMetricsSnapshot } from '../scene/AuthoringPerformanceMetrics';

const HOST_LIMITED_PRESENT_FPS_THRESHOLD = 50;
const HOST_LIMITED_STREAM_FPS_THRESHOLD = 55;

interface PerformanceMetricRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly tone?: 'warning' | 'danger' | 'muted';
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function ViewportPerformanceOverlay(): React.JSX.Element {
  const { t } = useTranslation();
  const metrics = useModelStore((state) => state.authoringMetricsSnapshot);
  const frameMeta = useModelStore((state) => state.lastRenderFrameMeta);
  const rows = useMemo(() => buildPerformanceRows(metrics, frameMeta, t), [frameMeta, metrics, t]);
  const qualityTier = frameMeta?.diagnostics?.qualityTier ?? null;

  return (
    <aside
      id="model-performance-metrics"
      className="model-performance-overlay"
      aria-label={t('performance.aria.metrics')}
      data-quality-tier={qualityTier ?? 'unknown'}
    >
      <div className="model-performance-header">
        <span className="model-performance-title">{t('performance.title')}</span>
        <span className="model-performance-tier">{qualityTier ?? t('performance.value.none')}</span>
      </div>
      <dl className="model-performance-grid">
        {rows.map((row) => (
          <div
            key={row.id}
            className="model-performance-row"
            data-performance-tone={row.tone ?? 'normal'}
          >
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function buildPerformanceRows(
  metrics: AuthoringMetricsSnapshot,
  frameMeta: RenderFrameMeta | null,
  t: Translate,
): PerformanceMetricRow[] {
  const diagnostics = frameMeta?.diagnostics;
  const droppedFrames = diagnostics?.droppedFramesSinceLast ?? 0;
  const presentFps = diagnostics?.presentFps;
  const presentationHostLimited =
    diagnostics?.presentationHostLimited === true ||
    isPresentationHostLimited(frameMeta, presentFps);

  return [
    {
      id: 'stream-fps',
      label: t('performance.metric.streamFps'),
      value: formatFps(frameMeta),
    },
    {
      id: 'present-fps',
      label: t('performance.metric.presentFps'),
      value: presentationHostLimited
        ? t('performance.value.hostLimited', { fps: formatFpsNumber(presentFps) })
        : formatFpsValue(presentFps),
      tone: toneForPresentFps(presentFps),
    },
    {
      id: 'frame-p95',
      label: t('performance.metric.frameP95'),
      value: formatMs(metrics.frameLatencyMs),
      tone: toneForFrameBudget(metrics.frameLatencyMs),
    },
    {
      id: 'gpu-frame',
      label: t('performance.metric.gpuFrame'),
      value: formatMs(diagnostics?.gpuFrameTimeMs ?? diagnostics?.renderTimeMs),
      tone: toneForFrameBudget(diagnostics?.gpuFrameTimeMs ?? diagnostics?.renderTimeMs),
    },
    {
      id: 'producer-frame',
      label: t('performance.metric.producerFrame'),
      value: formatMs(diagnostics?.producerFrameTimeMs),
      tone: toneForFrameBudget(diagnostics?.producerFrameTimeMs),
    },
    {
      id: 'encode',
      label: t('performance.metric.encode'),
      value: formatMs(diagnostics?.encodeTimeMs),
      tone: toneForFrameBudget(diagnostics?.encodeTimeMs),
    },
    {
      id: 'stream-submit',
      label: t('performance.metric.streamSubmit'),
      value: formatMs(diagnostics?.streamSubmitTimeMs),
      tone: toneForFrameBudget(diagnostics?.streamSubmitTimeMs),
    },
    {
      id: 'schedule-lag',
      label: t('performance.metric.scheduleLag'),
      value: formatMs(diagnostics?.scheduleLagMs),
      tone: toneForFrameBudget(diagnostics?.scheduleLagMs),
    },
    {
      id: 'decode',
      label: t('performance.metric.decode'),
      value: formatMs(diagnostics?.decodeSubmitToOutputMs ?? diagnostics?.decodeTimeMs),
      tone: toneForFrameBudget(diagnostics?.decodeSubmitToOutputMs ?? diagnostics?.decodeTimeMs),
    },
    {
      id: 'packet-output',
      label: t('performance.metric.packetOutput'),
      value: formatMs(diagnostics?.packetToDecodeOutputMs),
      tone: toneForFrameBudget(diagnostics?.packetToDecodeOutputMs),
    },
    {
      id: 'output-present',
      label: t('performance.metric.outputPresent'),
      value: formatMs(diagnostics?.decodeOutputToPresentedMs),
      tone: toneForFrameBudget(diagnostics?.decodeOutputToPresentedMs),
    },
    {
      id: 'draw',
      label: t('performance.metric.draw'),
      value: formatMs(diagnostics?.drawTimeMs),
      tone: toneForFrameBudget(diagnostics?.drawTimeMs),
    },
    {
      id: 'queue',
      label: t('performance.metric.queue'),
      value: formatCount(diagnostics?.queueDepth),
      tone: diagnostics?.queueDepth && diagnostics.queueDepth > 2 ? 'warning' : undefined,
    },
    {
      id: 'webcodecs-queue',
      label: t('performance.metric.webcodecsQueue'),
      value: formatCount(diagnostics?.webcodecsDecodeQueueSize),
      tone:
        diagnostics?.webcodecsDecodeQueueSize && diagnostics.webcodecsDecodeQueueSize > 2
          ? 'warning'
          : undefined,
    },
    {
      id: 'pending-decode',
      label: t('performance.metric.pendingDecode'),
      value: formatCount(diagnostics?.pendingDecodeFrames),
      tone:
        diagnostics?.pendingDecodeFrames && diagnostics.pendingDecodeFrames > 2
          ? 'warning'
          : undefined,
    },
    {
      id: 'decode-output-interval',
      label: t('performance.metric.decodeOutputInterval'),
      value: formatMs(diagnostics?.decodeOutputIntervalMs),
      tone: toneForFrameBudget(diagnostics?.decodeOutputIntervalMs),
    },
    {
      id: 'decode-output-burst',
      label: t('performance.metric.decodeOutputBurst'),
      value: formatCount(diagnostics?.decodeOutputBurst),
      tone:
        diagnostics?.decodeOutputBurst && diagnostics.decodeOutputBurst > 1 ? 'warning' : undefined,
    },
    {
      id: 'pre-decode-drops',
      label: t('performance.metric.preDecodeDrops'),
      value: formatCount(diagnostics?.droppedBeforeDecode),
      tone:
        diagnostics?.droppedBeforeDecode && diagnostics.droppedBeforeDecode > 0
          ? 'warning'
          : undefined,
    },
    {
      id: 'pre-present-drops',
      label: t('performance.metric.prePresentDrops'),
      value: formatCount(diagnostics?.decodedDroppedBeforePresent),
      tone:
        diagnostics?.decodedDroppedBeforePresent && diagnostics.decodedDroppedBeforePresent > 0
          ? 'warning'
          : undefined,
    },
    {
      id: 'decode-lag',
      label: t('performance.metric.decodeLag'),
      value: formatCount(diagnostics?.decodeOutputLagFrames),
      tone:
        diagnostics?.decodeOutputLagFrames && diagnostics.decodeOutputLagFrames > 2
          ? 'warning'
          : undefined,
    },
    {
      id: 'ack-p95',
      label: t('performance.metric.ackP95'),
      value: formatMs(metrics.ackP95Ms),
      tone: metrics.ackP95Ms > 50 ? 'warning' : undefined,
    },
    {
      id: 'patch-bandwidth',
      label: t('performance.metric.patchBandwidth'),
      value: formatBytesPerSecond(metrics.patchBandwidthBytesPerSec),
    },
    {
      id: 'gpu-upload',
      label: t('performance.metric.gpuUpload'),
      value: formatMs(metrics.gpuUploadMs),
      tone: toneForFrameBudget(metrics.gpuUploadMs),
    },
    {
      id: 'frame-drops',
      label: t('performance.metric.frameDrops'),
      value: formatCount(droppedFrames),
      tone: droppedFrames > 0 ? 'warning' : undefined,
    },
    {
      id: 'skipped-intervals',
      label: t('performance.metric.skippedIntervals'),
      value: formatCount(diagnostics?.skippedIntervals),
      tone:
        diagnostics?.skippedIntervals && diagnostics.skippedIntervals > 0 ? 'warning' : undefined,
    },
    {
      id: 'prediction-drops',
      label: t('performance.metric.predictionDrops'),
      value: formatCount(metrics.droppedPredictions),
      tone: metrics.droppedPredictions > 0 ? 'warning' : undefined,
    },
    {
      id: 'render-path',
      label: t('performance.metric.renderPath'),
      value: diagnostics?.renderPath ?? t('performance.value.none'),
      tone: diagnostics?.renderPath ? undefined : 'muted',
    },
    {
      id: 'revision',
      label: t('performance.metric.revision'),
      value:
        frameMeta !== null
          ? t('performance.value.frameRevision', {
              frame: frameMeta.frameId,
              revision: frameMeta.sceneRevision,
            })
          : t('performance.value.none'),
      tone: frameMeta !== null ? undefined : 'muted',
    },
  ];
}

function formatFps(frameMeta: RenderFrameMeta | null): string {
  const durationUs = frameMeta?.durationUs;
  if (!isFinitePositiveNumber(durationUs)) {
    return '-';
  }
  return `${(1_000_000 / durationUs).toFixed(1)} fps`;
}

function formatFpsValue(value: number | undefined): string {
  if (!isFinitePositiveOrZeroNumber(value)) {
    return '-';
  }
  return `${formatFpsNumber(value)} fps`;
}

function formatFpsNumber(value: number | undefined): string {
  if (!isFinitePositiveOrZeroNumber(value)) {
    return '-';
  }
  return value.toFixed(1);
}

function formatMs(value: number | undefined): string {
  if (!isFinitePositiveOrZeroNumber(value)) {
    return '-';
  }
  return `${value.toFixed(1)} ms`;
}

function formatCount(value: number | undefined): string {
  if (!isFinitePositiveOrZeroNumber(value)) {
    return '-';
  }
  return String(Math.round(value));
}

function formatBytesPerSecond(value: number): string {
  if (!isFinitePositiveOrZeroNumber(value)) {
    return '-';
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB/s`;
  }
  return `${Math.round(value)} B/s`;
}

function toneForFrameBudget(value: number | undefined): PerformanceMetricRow['tone'] {
  if (!isFinitePositiveOrZeroNumber(value)) {
    return undefined;
  }
  if (value >= 33.3) {
    return 'danger';
  }
  if (value >= 16.7) {
    return 'warning';
  }
  return undefined;
}

function toneForPresentFps(value: number | undefined): PerformanceMetricRow['tone'] {
  if (!isFinitePositiveOrZeroNumber(value)) {
    return undefined;
  }
  if (value < 50) {
    return 'danger';
  }
  if (value < 58) {
    return 'warning';
  }
  return undefined;
}

function isPresentationHostLimited(
  frameMeta: RenderFrameMeta | null,
  presentFps: number | undefined,
): boolean {
  const durationUs = frameMeta?.durationUs;
  if (!isFinitePositiveNumber(durationUs) || !isFinitePositiveOrZeroNumber(presentFps)) {
    return false;
  }
  const streamFps = 1_000_000 / durationUs;
  return (
    streamFps >= HOST_LIMITED_STREAM_FPS_THRESHOLD &&
    presentFps < HOST_LIMITED_PRESENT_FPS_THRESHOLD
  );
}

function isFinitePositiveNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFinitePositiveOrZeroNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
