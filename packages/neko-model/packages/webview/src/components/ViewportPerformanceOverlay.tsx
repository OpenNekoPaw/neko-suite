import React, { useMemo } from 'react';
import type { RenderFrameMeta } from '@neko/shared';
import { useTranslation } from '../i18n/I18nContext';
import { useModelStore } from '../stores/modelStore';
import type {
  AuthoringMetricsSnapshot,
  RenderDiagnosticsWindowSnapshot,
  PerformanceWindowStats,
} from '../scene/AuthoringPerformanceMetrics';

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
  const window = metrics.renderWindow;
  const droppedFrames = window.droppedFramesSinceLast;
  const presentFps = diagnostics?.presentFps;
  const presentationHostLimited =
    diagnostics?.presentationHostLimited === true ||
    isPresentationHostLimited(frameMeta, presentFps);

  return [
    {
      id: 'baseline-target',
      label: t('performance.metric.baselineTarget'),
      value: formatBaselineTarget(window, t),
      tone: toneForBaselineTarget(window),
    },
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
        : formatFpsStat(window.presentFps, 'avg'),
      tone: toneForPresentFps(window.presentFps.avg || presentFps),
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
      value: formatMsStat(window.gpuFrameTimeMs, 'p95'),
      tone: toneForFrameBudget(window.gpuFrameTimeMs.p95),
    },
    {
      id: 'render',
      label: t('performance.metric.render'),
      value: formatMsStat(window.renderTimeMs, 'p95'),
      tone: toneForFrameBudget(window.renderTimeMs.p95),
    },
    {
      id: 'convert',
      label: t('performance.metric.convert'),
      value: formatMsStat(window.convertTimeMs, 'p95'),
      tone: toneForFrameBudget(window.convertTimeMs.p95),
    },
    {
      id: 'gpu-wait',
      label: t('performance.metric.gpuWait'),
      value: formatMsStat(window.gpuWaitTimeMs, 'p95'),
      tone: toneForFrameBudget(window.gpuWaitTimeMs.p95),
    },
    {
      id: 'producer-frame',
      label: t('performance.metric.producerFrame'),
      value: formatMsStat(window.producerFrameTimeMs, 'p95'),
      tone: toneForFrameBudget(window.producerFrameTimeMs.p95),
    },
    {
      id: 'encode',
      label: t('performance.metric.encode'),
      value: formatMsStat(window.encodeTimeMs, 'p95'),
      tone: toneForFrameBudget(window.encodeTimeMs.p95),
    },
    {
      id: 'stream-submit',
      label: t('performance.metric.streamSubmit'),
      value: formatMsStat(window.streamSubmitTimeMs, 'p95'),
      tone: toneForFrameBudget(window.streamSubmitTimeMs.p95),
    },
    {
      id: 'schedule-lag',
      label: t('performance.metric.scheduleLag'),
      value: formatMsStat(window.scheduleLagMs, 'p95'),
      tone: toneForFrameBudget(window.scheduleLagMs.p95),
    },
    {
      id: 'decode',
      label: t('performance.metric.decode'),
      value: formatMsStat(window.decodeSubmitToOutputMs, 'p95'),
      tone: toneForFrameBudget(window.decodeSubmitToOutputMs.p95),
    },
    {
      id: 'packet-output',
      label: t('performance.metric.packetOutput'),
      value: formatMsStat(window.packetToDecodeOutputMs, 'p95'),
      tone: toneForFrameBudget(window.packetToDecodeOutputMs.p95),
    },
    {
      id: 'output-present',
      label: t('performance.metric.outputPresent'),
      value: formatMsStat(window.decodeOutputToPresentedMs, 'p95'),
      tone: toneForFrameBudget(window.decodeOutputToPresentedMs.p95),
    },
    {
      id: 'draw',
      label: t('performance.metric.draw'),
      value: formatMsStat(window.drawTimeMs, 'p95'),
      tone: toneForFrameBudget(window.drawTimeMs.p95),
    },
    {
      id: 'queue',
      label: t('performance.metric.queue'),
      value: formatCountStat(window.queueDepth, 'max'),
      tone: window.queueDepth.max > 2 ? 'warning' : undefined,
    },
    {
      id: 'webcodecs-queue',
      label: t('performance.metric.webcodecsQueue'),
      value: formatCountStat(window.webcodecsDecodeQueueSize, 'max'),
      tone: window.webcodecsDecodeQueueSize.max > 2 ? 'warning' : undefined,
    },
    {
      id: 'pending-decode',
      label: t('performance.metric.pendingDecode'),
      value: formatCountStat(window.pendingDecodeFrames, 'max'),
      tone: window.pendingDecodeFrames.max > 2 ? 'warning' : undefined,
    },
    {
      id: 'decode-output-interval',
      label: t('performance.metric.decodeOutputInterval'),
      value: formatMsStat(window.decodeOutputIntervalMs, 'p95'),
      tone: toneForFrameBudget(window.decodeOutputIntervalMs.p95),
    },
    {
      id: 'decode-output-burst',
      label: t('performance.metric.decodeOutputBurst'),
      value: formatCountStat(window.decodeOutputBurst, 'max'),
      tone: window.decodeOutputBurst.max > 1 ? 'warning' : undefined,
    },
    {
      id: 'pre-decode-drops',
      label: t('performance.metric.preDecodeDrops'),
      value: formatCountStat(window.droppedBeforeDecode, 'max'),
      tone: window.droppedBeforeDecode.max > 0 ? 'warning' : undefined,
    },
    {
      id: 'pre-present-drops',
      label: t('performance.metric.prePresentDrops'),
      value: formatCountStat(window.decodedDroppedBeforePresent, 'max'),
      tone: window.decodedDroppedBeforePresent.max > 0 ? 'warning' : undefined,
    },
    {
      id: 'stale-output-drops',
      label: t('performance.metric.staleOutputDrops'),
      value: formatCountStat(window.staleDecodedOutputsDropped, 'max'),
      tone: window.staleDecodedOutputsDropped.max > 0 ? 'warning' : undefined,
    },
    {
      id: 'decode-lag',
      label: t('performance.metric.decodeLag'),
      value: formatCountStat(window.decodeOutputLagFrames, 'max'),
      tone: window.decodeOutputLagFrames.max > 2 ? 'warning' : undefined,
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
      id: 'js-heap',
      label: t('performance.metric.jsHeap'),
      value: formatBytesStat(window.jsHeapUsedBytes, 'max'),
    },
    {
      id: 'js-heap-total',
      label: t('performance.metric.jsHeapTotal'),
      value: formatBytesStat(window.jsHeapTotalBytes, 'max'),
    },
    {
      id: 'js-heap-limit',
      label: t('performance.metric.jsHeapLimit'),
      value: formatBytesStat(window.jsHeapLimitBytes, 'max'),
      tone: window.jsHeapLimitBytes.samples > 0 ? undefined : 'muted',
    },
    {
      id: 'decoded-frame-memory',
      label: t('performance.metric.decodedFrameMemory'),
      value: formatBytesStat(window.estimatedDecodedFrameBytes, 'max'),
    },
    {
      id: 'decoded-frame-size',
      label: t('performance.metric.decodedFrameSize'),
      value: formatSizeStat(window.decodedFrameWidth, window.decodedFrameHeight),
    },
    {
      id: 'stream-size',
      label: t('performance.metric.streamSize'),
      value: formatSizeStat(window.streamWidth, window.streamHeight),
    },
    {
      id: 'coded-size',
      label: t('performance.metric.codedSize'),
      value: formatSizeStat(window.codedWidth, window.codedHeight),
    },
    {
      id: 'scheduled-size',
      label: t('performance.metric.scheduledSize'),
      value: formatSizeStat(window.scheduledWidth, window.scheduledHeight),
    },
    {
      id: 'scheduled-fps',
      label: t('performance.metric.scheduledFps'),
      value: formatFpsStat(window.scheduledFps, 'max'),
    },
    {
      id: 'gop-size',
      label: t('performance.metric.gopSize'),
      value: formatCountStat(window.gopSize, 'max'),
      tone: window.gopSize.max === 1 ? 'warning' : undefined,
    },
    {
      id: 'transport-bitrate',
      label: t('performance.metric.transportBitrate'),
      value: formatBitsPerSecondStat(window.transportBitrateBps, 'avg'),
    },
    {
      id: 'codec',
      label: t('performance.metric.codec'),
      value: diagnostics?.codecString ?? t('performance.value.none'),
      tone: diagnostics?.codecString ? undefined : 'muted',
    },
    {
      id: 'codec-profile',
      label: t('performance.metric.codecProfile'),
      value: formatCodecProfile(diagnostics?.codecProfile, diagnostics?.codecLevel, t),
      tone: diagnostics?.codecProfile || diagnostics?.codecLevel ? undefined : 'muted',
    },
    {
      id: 'latency-mode',
      label: t('performance.metric.latencyMode'),
      value: diagnostics?.latencyMode ?? t('performance.value.none'),
      tone: diagnostics?.latencyMode ? undefined : 'muted',
    },
    {
      id: 'post-process',
      label: t('performance.metric.postProcess'),
      value: formatBooleanDiagnostic(diagnostics?.postProcessEnabled, t),
      tone: diagnostics?.postProcessEnabled === undefined ? 'muted' : undefined,
    },
    {
      id: 'helper-passes',
      label: t('performance.metric.helperPasses'),
      value: formatBooleanDiagnostic(diagnostics?.helperPassesEnabled, t),
      tone: diagnostics?.helperPassesEnabled === undefined ? 'muted' : undefined,
    },
    {
      id: 'canvas-css-size',
      label: t('performance.metric.canvasCssSize'),
      value: formatSizeStat(window.canvasCssWidth, window.canvasCssHeight),
    },
    {
      id: 'canvas-physical-size',
      label: t('performance.metric.canvasPhysicalSize'),
      value: formatSizeStat(window.canvasPhysicalWidth, window.canvasPhysicalHeight),
    },
    {
      id: 'device-pixel-ratio',
      label: t('performance.metric.devicePixelRatio'),
      value: formatNumberStat(window.devicePixelRatio, 'max'),
    },
    {
      id: 'presentation-scale',
      label: t('performance.metric.presentationScale'),
      value: formatScaleStat(window.presentationScaleX, window.presentationScaleY),
      tone: toneForPresentationScale(window.presentationScaleX.max, window.presentationScaleY.max),
    },
    {
      id: 'iosurface-creations',
      label: t('performance.metric.iosurfaceCreations'),
      value: formatCountStat(window.iosurfaceCreations, 'max'),
      tone: window.iosurfaceCreations.max > 3 ? 'warning' : undefined,
    },
    {
      id: 'texture-allocations',
      label: t('performance.metric.textureAllocations'),
      value: formatCountStat(window.textureAllocations, 'max'),
      tone: window.textureAllocations.max > 4 ? 'warning' : undefined,
    },
    {
      id: 'vram-usage',
      label: t('performance.metric.vramUsage'),
      value: formatViewportFootprint(window),
      tone: window.estimatedDecodedFrameBytes.samples > 0 ? undefined : 'muted',
    },
    {
      id: 'frame-drops',
      label: t('performance.metric.frameDrops'),
      value: formatCountStat(droppedFrames, 'max'),
      tone: droppedFrames.max > 0 ? 'warning' : undefined,
    },
    {
      id: 'skipped-intervals',
      label: t('performance.metric.skippedIntervals'),
      value: formatCountStat(window.skippedIntervals, 'max'),
      tone: window.skippedIntervals.max > 0 ? 'warning' : undefined,
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

function formatMsStat(stats: PerformanceWindowStats, field: keyof PerformanceWindowStats): string {
  if (stats.samples <= 0 || field === 'samples') {
    return '-';
  }
  return formatMs(stats[field]);
}

function formatFpsStat(stats: PerformanceWindowStats, field: keyof PerformanceWindowStats): string {
  if (stats.samples <= 0 || field === 'samples') {
    return '-';
  }
  return formatFpsValue(stats[field]);
}

function formatCount(value: number | undefined): string {
  if (!isFinitePositiveOrZeroNumber(value)) {
    return '-';
  }
  return String(Math.round(value));
}

function formatCountStat(
  stats: PerformanceWindowStats,
  field: keyof PerformanceWindowStats,
): string {
  if (stats.samples <= 0 || field === 'samples') {
    return '-';
  }
  return formatCount(stats[field]);
}

function formatBytesStat(
  stats: PerformanceWindowStats,
  field: keyof PerformanceWindowStats,
): string {
  if (stats.samples <= 0 || field === 'samples') {
    return '-';
  }
  return formatBytes(stats[field]);
}

function formatBitsPerSecondStat(
  stats: PerformanceWindowStats,
  field: keyof PerformanceWindowStats,
): string {
  if (stats.samples <= 0 || field === 'samples') {
    return '-';
  }
  return formatBitsPerSecond(stats[field]);
}

function formatSizeStat(width: PerformanceWindowStats, height: PerformanceWindowStats): string {
  if (width.samples <= 0 || height.samples <= 0) {
    return '-';
  }
  return `${Math.round(width.max)}x${Math.round(height.max)}`;
}

function formatScaleStat(scaleX: PerformanceWindowStats, scaleY: PerformanceWindowStats): string {
  if (scaleX.samples <= 0 || scaleY.samples <= 0) {
    return '-';
  }
  return `${scaleX.max.toFixed(2)}x / ${scaleY.max.toFixed(2)}x`;
}

function formatNumberStat(
  stats: PerformanceWindowStats,
  field: keyof PerformanceWindowStats,
): string {
  if (stats.samples <= 0 || field === 'samples') {
    return '-';
  }
  return stats[field].toFixed(2);
}

function formatBytesPerSecond(value: number): string {
  if (!isFinitePositiveOrZeroNumber(value)) {
    return '-';
  }
  return `${formatBytes(value)}/s`;
}

function formatBitsPerSecond(value: number | undefined): string {
  if (!isFinitePositiveOrZeroNumber(value)) {
    return '-';
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} Mbps`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)} Kbps`;
  }
  return `${Math.round(value)} bps`;
}

function formatBytes(value: number | undefined): string {
  if (!isFinitePositiveOrZeroNumber(value)) {
    return '-';
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${Math.round(value)} B`;
}

function formatCodecProfile(
  profile: string | undefined,
  level: string | undefined,
  t: Translate,
): string {
  if (profile && level) {
    return `${profile} / ${level}`;
  }
  return profile ?? level ?? t('performance.value.none');
}

function formatBooleanDiagnostic(value: boolean | undefined, t: Translate): string {
  if (value === undefined) {
    return t('performance.value.none');
  }
  return value ? t('performance.value.enabled') : t('performance.value.disabled');
}

function formatViewportFootprint(window: RenderDiagnosticsWindowSnapshot): string {
  if (window.estimatedDecodedFrameBytes.samples <= 0) {
    return '-';
  }
  const decodedFrameBytes = window.estimatedDecodedFrameBytes.max;
  const canvasBytes = window.canvasPhysicalWidth.max * window.canvasPhysicalHeight.max * 4;
  const footprintBytes = Math.max(decodedFrameBytes, canvasBytes);
  return formatBytes(footprintBytes);
}

function formatBaselineTarget(window: RenderDiagnosticsWindowSnapshot, t: Translate): string {
  const effectiveSize = formatSizeStat(window.streamWidth, window.streamHeight);
  const scheduledFps = formatFpsStat(window.scheduledFps, 'max');
  if (effectiveSize === '-' && scheduledFps === '-') {
    return t('performance.value.none');
  }
  const effective = `${effectiveSize} @ ${scheduledFps}`;
  return toneForBaselineTarget(window) === 'warning'
    ? t('performance.value.baselineFallback', { effective })
    : t('performance.value.baselineMatched', { effective });
}

function toneForBaselineTarget(
  window: RenderDiagnosticsWindowSnapshot,
): PerformanceMetricRow['tone'] {
  const hasStreamSize = window.streamWidth.samples > 0 && window.streamHeight.samples > 0;
  const hasScheduledFps = window.scheduledFps.samples > 0;
  if (!hasStreamSize && !hasScheduledFps) {
    return 'muted';
  }
  const streamBelow1080 =
    hasStreamSize && Math.min(window.streamWidth.max, window.streamHeight.max) < 1080;
  const fpsBelow60 = hasScheduledFps && window.scheduledFps.max < 59.5;
  return streamBelow1080 || fpsBelow60 ? 'warning' : undefined;
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

function toneForPresentationScale(
  scaleX: number | undefined,
  scaleY: number | undefined,
): PerformanceMetricRow['tone'] {
  if (!isFinitePositiveNumber(scaleX) || !isFinitePositiveNumber(scaleY)) {
    return undefined;
  }
  return scaleX > 1.02 || scaleY > 1.02 ? 'warning' : undefined;
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
