import type { RenderFrameMeta } from '@neko/shared';

type RenderFrameDiagnostics = NonNullable<RenderFrameMeta['diagnostics']>;

export interface PerformanceWindowStats {
  avg: number;
  p95: number;
  max: number;
  samples: number;
}

export interface RenderDiagnosticsWindowSnapshot {
  jsHeapUsedBytes: PerformanceWindowStats;
  jsHeapTotalBytes: PerformanceWindowStats;
  jsHeapLimitBytes: PerformanceWindowStats;
  estimatedDecodedFrameBytes: PerformanceWindowStats;
  decodedFrameWidth: PerformanceWindowStats;
  decodedFrameHeight: PerformanceWindowStats;
  canvasCssWidth: PerformanceWindowStats;
  canvasCssHeight: PerformanceWindowStats;
  canvasPhysicalWidth: PerformanceWindowStats;
  canvasPhysicalHeight: PerformanceWindowStats;
  devicePixelRatio: PerformanceWindowStats;
  presentationScaleX: PerformanceWindowStats;
  presentationScaleY: PerformanceWindowStats;
  streamWidth: PerformanceWindowStats;
  streamHeight: PerformanceWindowStats;
  codedWidth: PerformanceWindowStats;
  codedHeight: PerformanceWindowStats;
  scheduledWidth: PerformanceWindowStats;
  scheduledHeight: PerformanceWindowStats;
  scheduledFps: PerformanceWindowStats;
  gopSize: PerformanceWindowStats;
  transportBitrateBps: PerformanceWindowStats;
  presentFps: PerformanceWindowStats;
  gpuFrameTimeMs: PerformanceWindowStats;
  renderTimeMs: PerformanceWindowStats;
  convertTimeMs: PerformanceWindowStats;
  gpuWaitTimeMs: PerformanceWindowStats;
  producerFrameTimeMs: PerformanceWindowStats;
  encodeTimeMs: PerformanceWindowStats;
  streamSubmitTimeMs: PerformanceWindowStats;
  scheduleLagMs: PerformanceWindowStats;
  decodeSubmitToOutputMs: PerformanceWindowStats;
  packetToDecodeOutputMs: PerformanceWindowStats;
  decodeOutputToPresentedMs: PerformanceWindowStats;
  drawTimeMs: PerformanceWindowStats;
  decodeOutputIntervalMs: PerformanceWindowStats;
  decodeOutputBurst: PerformanceWindowStats;
  queueDepth: PerformanceWindowStats;
  webcodecsDecodeQueueSize: PerformanceWindowStats;
  pendingDecodeFrames: PerformanceWindowStats;
  decodeOutputLagFrames: PerformanceWindowStats;
  droppedBeforeDecode: PerformanceWindowStats;
  decodedDroppedBeforePresent: PerformanceWindowStats;
  droppedFramesSinceLast: PerformanceWindowStats;
  skippedIntervals: PerformanceWindowStats;
  iosurfaceCreations: PerformanceWindowStats;
  textureAllocations: PerformanceWindowStats;
}

export interface ViewportMemorySample {
  readonly jsHeapUsedBytes?: number;
  readonly jsHeapTotalBytes?: number;
  readonly jsHeapLimitBytes?: number;
  readonly estimatedDecodedFrameBytes?: number;
  readonly decodedFrameWidth?: number;
  readonly decodedFrameHeight?: number;
  readonly canvasCssWidth?: number;
  readonly canvasCssHeight?: number;
  readonly canvasPhysicalWidth?: number;
  readonly canvasPhysicalHeight?: number;
  readonly devicePixelRatio?: number;
  readonly presentationScaleX?: number;
  readonly presentationScaleY?: number;
}

export interface AuthoringMetricsSnapshot {
  ackP50Ms: number;
  ackP95Ms: number;
  ackP99Ms: number;
  patchBandwidthBytesPerSec: number;
  gpuUploadMs: number;
  frameLatencyMs: number;
  droppedPredictions: number;
  renderWindow: RenderDiagnosticsWindowSnapshot;
}

const MAX_SAMPLES = 128;
const WINDOW_MS = 1_000;

export class AuthoringPerformanceMetrics {
  private readonly ackLatencyMs: Array<{ value: number; atMs: number }> = [];
  private readonly patchBytes: Array<{ bytes: number; atMs: number }> = [];
  private readonly gpuUploadMs: Array<{ value: number; atMs: number }> = [];
  private readonly frameLatencyMs: Array<{ value: number; atMs: number }> = [];
  private readonly renderDiagnostics: Array<{ diagnostics: RenderFrameDiagnostics; atMs: number }> =
    [];
  private readonly memorySamples: Array<{ sample: ViewportMemorySample; atMs: number }> = [];
  private droppedPredictions = 0;

  recordAckLatency(ms: number, atMs = Date.now()): void {
    pushBounded(this.ackLatencyMs, { value: Math.max(0, ms), atMs });
  }

  recordPatchBytes(bytes: number, atMs = Date.now()): void {
    this.patchBytes.push({ bytes: Math.max(0, bytes), atMs });
    while (this.patchBytes.length > MAX_SAMPLES) {
      this.patchBytes.shift();
    }
  }

  recordGpuUpload(ms: number, atMs = Date.now()): void {
    pushBounded(this.gpuUploadMs, { value: Math.max(0, ms), atMs });
  }

  recordFrameLatency(ms: number, atMs = Date.now()): void {
    pushBounded(this.frameLatencyMs, { value: Math.max(0, ms), atMs });
  }

  recordRenderDiagnostics(
    diagnostics: RenderFrameDiagnostics | undefined,
    atMs = Date.now(),
  ): void {
    if (!diagnostics) return;
    pushBounded(this.renderDiagnostics, { diagnostics, atMs });
  }

  recordMemorySample(sample: ViewportMemorySample, atMs = Date.now()): void {
    pushBounded(this.memorySamples, { sample, atMs });
  }

  incrementDroppedPrediction(): void {
    this.droppedPredictions += 1;
  }

  snapshot(nowMs = Date.now()): AuthoringMetricsSnapshot {
    return {
      ackP50Ms: percentile(windowValues(this.ackLatencyMs, nowMs), 0.5),
      ackP95Ms: percentile(windowValues(this.ackLatencyMs, nowMs), 0.95),
      ackP99Ms: percentile(windowValues(this.ackLatencyMs, nowMs), 0.99),
      patchBandwidthBytesPerSec: patchBandwidth(this.patchBytes, nowMs),
      gpuUploadMs: percentile(windowValues(this.gpuUploadMs, nowMs), 0.95),
      frameLatencyMs: percentile(windowValues(this.frameLatencyMs, nowMs), 0.95),
      droppedPredictions: this.droppedPredictions,
      renderWindow: renderDiagnosticsWindow(this.renderDiagnostics, this.memorySamples, nowMs),
    };
  }
}

function pushBounded<T>(samples: T[], value: T): void {
  samples.push(value);
  while (samples.length > MAX_SAMPLES) {
    samples.shift();
  }
}

function windowValues(
  samples: readonly { value: number; atMs: number }[],
  nowMs: number,
): number[] {
  const windowStart = nowMs - WINDOW_MS;
  return samples.filter((sample) => sample.atMs >= windowStart).map((sample) => sample.value);
}

function percentile(samples: readonly number[], q: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[index] ?? 0;
}

function patchBandwidth(
  samples: readonly { bytes: number; atMs: number }[],
  nowMs: number,
): number {
  const windowStart = nowMs - WINDOW_MS;
  const bytes = samples
    .filter((sample) => sample.atMs >= windowStart)
    .reduce((total, sample) => total + sample.bytes, 0);
  return bytes;
}

function renderDiagnosticsWindow(
  samples: readonly { diagnostics: RenderFrameDiagnostics; atMs: number }[],
  memorySamples: readonly { sample: ViewportMemorySample; atMs: number }[],
  nowMs: number,
): RenderDiagnosticsWindowSnapshot {
  const windowStart = nowMs - WINDOW_MS;
  const diagnostics = samples
    .filter((sample) => sample.atMs >= windowStart)
    .map((sample) => sample.diagnostics);
  const memory = memorySamples
    .filter((sample) => sample.atMs >= windowStart)
    .map((sample) => sample.sample);

  return {
    jsHeapUsedBytes: statsForMemory(memory, 'jsHeapUsedBytes'),
    jsHeapTotalBytes: statsForMemory(memory, 'jsHeapTotalBytes'),
    jsHeapLimitBytes: statsForMemory(memory, 'jsHeapLimitBytes'),
    estimatedDecodedFrameBytes: statsForMemory(memory, 'estimatedDecodedFrameBytes'),
    decodedFrameWidth: statsForMemory(memory, 'decodedFrameWidth'),
    decodedFrameHeight: statsForMemory(memory, 'decodedFrameHeight'),
    canvasCssWidth: statsForMemory(memory, 'canvasCssWidth'),
    canvasCssHeight: statsForMemory(memory, 'canvasCssHeight'),
    canvasPhysicalWidth: statsForMemory(memory, 'canvasPhysicalWidth'),
    canvasPhysicalHeight: statsForMemory(memory, 'canvasPhysicalHeight'),
    devicePixelRatio: statsForMemory(memory, 'devicePixelRatio'),
    presentationScaleX: statsForMemory(memory, 'presentationScaleX'),
    presentationScaleY: statsForMemory(memory, 'presentationScaleY'),
    streamWidth: statsFor(diagnostics, 'streamWidth'),
    streamHeight: statsFor(diagnostics, 'streamHeight'),
    codedWidth: statsFor(diagnostics, 'codedWidth'),
    codedHeight: statsFor(diagnostics, 'codedHeight'),
    scheduledWidth: statsFor(diagnostics, 'scheduledWidth'),
    scheduledHeight: statsFor(diagnostics, 'scheduledHeight'),
    scheduledFps: statsFor(diagnostics, 'scheduledFps'),
    gopSize: statsFor(diagnostics, 'gopSize'),
    transportBitrateBps: statsFor(diagnostics, 'transportBitrateBps'),
    presentFps: statsFor(diagnostics, 'presentFps'),
    gpuFrameTimeMs: statsFor(diagnostics, 'gpuFrameTimeMs', 'renderTimeMs'),
    renderTimeMs: statsFor(diagnostics, 'renderTimeMs'),
    convertTimeMs: statsFor(diagnostics, 'convertTimeMs'),
    gpuWaitTimeMs: statsFor(diagnostics, 'gpuWaitTimeMs'),
    producerFrameTimeMs: statsFor(diagnostics, 'producerFrameTimeMs'),
    encodeTimeMs: statsFor(diagnostics, 'encodeTimeMs'),
    streamSubmitTimeMs: statsFor(diagnostics, 'streamSubmitTimeMs'),
    scheduleLagMs: statsFor(diagnostics, 'scheduleLagMs'),
    decodeSubmitToOutputMs: statsFor(diagnostics, 'decodeSubmitToOutputMs', 'decodeTimeMs'),
    packetToDecodeOutputMs: statsFor(diagnostics, 'packetToDecodeOutputMs'),
    decodeOutputToPresentedMs: statsFor(diagnostics, 'decodeOutputToPresentedMs'),
    drawTimeMs: statsFor(diagnostics, 'drawTimeMs'),
    decodeOutputIntervalMs: statsFor(diagnostics, 'decodeOutputIntervalMs'),
    decodeOutputBurst: statsFor(diagnostics, 'decodeOutputBurst'),
    queueDepth: statsFor(diagnostics, 'queueDepth'),
    webcodecsDecodeQueueSize: statsFor(diagnostics, 'webcodecsDecodeQueueSize'),
    pendingDecodeFrames: statsFor(diagnostics, 'pendingDecodeFrames'),
    decodeOutputLagFrames: statsFor(diagnostics, 'decodeOutputLagFrames'),
    droppedBeforeDecode: statsFor(diagnostics, 'droppedBeforeDecode'),
    decodedDroppedBeforePresent: statsFor(diagnostics, 'decodedDroppedBeforePresent'),
    droppedFramesSinceLast: statsFor(diagnostics, 'droppedFramesSinceLast'),
    skippedIntervals: statsFor(diagnostics, 'skippedIntervals'),
    iosurfaceCreations: statsFor(diagnostics, 'iosurfaceCreations'),
    textureAllocations: statsFor(diagnostics, 'textureAllocations'),
  };
}

function statsForMemory(
  samples: readonly ViewportMemorySample[],
  key: keyof ViewportMemorySample,
): PerformanceWindowStats {
  const values = samples
    .map((sample) => sample[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (values.length === 0) {
    return emptyStats();
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    avg: total / values.length,
    p95: percentile(values, 0.95),
    max: Math.max(...values),
    samples: values.length,
  };
}

function statsFor(
  diagnostics: readonly RenderFrameDiagnostics[],
  primary: keyof RenderFrameDiagnostics,
  fallback?: keyof RenderFrameDiagnostics,
): PerformanceWindowStats {
  const values = diagnostics
    .map((entry) => readFiniteMetric(entry, primary, fallback))
    .filter((value): value is number => value !== undefined);
  if (values.length === 0) {
    return emptyStats();
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    avg: total / values.length,
    p95: percentile(values, 0.95),
    max: Math.max(...values),
    samples: values.length,
  };
}

function readFiniteMetric(
  diagnostics: RenderFrameDiagnostics,
  primary: keyof RenderFrameDiagnostics,
  fallback?: keyof RenderFrameDiagnostics,
): number | undefined {
  const value = diagnostics[primary];
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (!fallback) {
    return undefined;
  }
  const fallbackValue = diagnostics[fallback];
  return typeof fallbackValue === 'number' && Number.isFinite(fallbackValue) && fallbackValue >= 0
    ? fallbackValue
    : undefined;
}

function emptyStats(): PerformanceWindowStats {
  return { avg: 0, p95: 0, max: 0, samples: 0 };
}
