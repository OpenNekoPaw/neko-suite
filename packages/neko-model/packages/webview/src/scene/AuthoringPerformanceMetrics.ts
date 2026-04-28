export interface AuthoringMetricsSnapshot {
  ackP50Ms: number;
  ackP95Ms: number;
  ackP99Ms: number;
  patchBandwidthBytesPerSec: number;
  gpuUploadMs: number;
  frameLatencyMs: number;
  droppedPredictions: number;
}

const MAX_SAMPLES = 128;

export class AuthoringPerformanceMetrics {
  private readonly ackLatencyMs: number[] = [];
  private readonly patchBytes: Array<{ bytes: number; atMs: number }> = [];
  private readonly gpuUploadMs: number[] = [];
  private readonly frameLatencyMs: number[] = [];
  private droppedPredictions = 0;

  recordAckLatency(ms: number): void {
    pushBounded(this.ackLatencyMs, Math.max(0, ms));
  }

  recordPatchBytes(bytes: number, atMs = Date.now()): void {
    this.patchBytes.push({ bytes: Math.max(0, bytes), atMs });
    while (this.patchBytes.length > MAX_SAMPLES) {
      this.patchBytes.shift();
    }
  }

  recordGpuUpload(ms: number): void {
    pushBounded(this.gpuUploadMs, Math.max(0, ms));
  }

  recordFrameLatency(ms: number): void {
    pushBounded(this.frameLatencyMs, Math.max(0, ms));
  }

  incrementDroppedPrediction(): void {
    this.droppedPredictions += 1;
  }

  snapshot(nowMs = Date.now()): AuthoringMetricsSnapshot {
    return {
      ackP50Ms: percentile(this.ackLatencyMs, 0.5),
      ackP95Ms: percentile(this.ackLatencyMs, 0.95),
      ackP99Ms: percentile(this.ackLatencyMs, 0.99),
      patchBandwidthBytesPerSec: patchBandwidth(this.patchBytes, nowMs),
      gpuUploadMs: percentile(this.gpuUploadMs, 0.95),
      frameLatencyMs: percentile(this.frameLatencyMs, 0.95),
      droppedPredictions: this.droppedPredictions,
    };
  }
}

function pushBounded(samples: number[], value: number): void {
  samples.push(value);
  while (samples.length > MAX_SAMPLES) {
    samples.shift();
  }
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
  const windowStart = nowMs - 1_000;
  const bytes = samples
    .filter((sample) => sample.atMs >= windowStart)
    .reduce((total, sample) => total + sample.bytes, 0);
  return bytes;
}
