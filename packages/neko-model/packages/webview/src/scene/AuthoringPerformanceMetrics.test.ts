import { describe, expect, it } from 'vitest';
import { AuthoringPerformanceMetrics } from './AuthoringPerformanceMetrics';

describe('AuthoringPerformanceMetrics', () => {
  it('reports ack percentiles, patch bandwidth, gpu upload, frame latency, and dropped predictions', () => {
    const metrics = new AuthoringPerformanceMetrics();
    for (const latency of [2, 4, 8, 16, 32]) {
      metrics.recordAckLatency(latency);
    }
    metrics.recordPatchBytes(256, 1_000);
    metrics.recordPatchBytes(512, 1_500);
    metrics.recordPatchBytes(128, 100);
    metrics.recordGpuUpload(3);
    metrics.recordGpuUpload(7);
    metrics.recordFrameLatency(20);
    metrics.incrementDroppedPrediction();

    expect(metrics.snapshot(1_600)).toEqual({
      ackP50Ms: 8,
      ackP95Ms: 32,
      ackP99Ms: 32,
      patchBandwidthBytesPerSec: 768,
      gpuUploadMs: 7,
      frameLatencyMs: 20,
      droppedPredictions: 1,
    });
  });
});
