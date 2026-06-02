import { describe, expect, it } from 'vitest';
import { AuthoringPerformanceMetrics } from './AuthoringPerformanceMetrics';

describe('AuthoringPerformanceMetrics', () => {
  it('reports ack percentiles, patch bandwidth, gpu upload, frame latency, and dropped predictions', () => {
    const metrics = new AuthoringPerformanceMetrics();
    for (const latency of [2, 4, 8, 16, 32]) {
      metrics.recordAckLatency(latency, 1_500);
    }
    metrics.recordPatchBytes(256, 1_000);
    metrics.recordPatchBytes(512, 1_500);
    metrics.recordPatchBytes(128, 100);
    metrics.recordGpuUpload(3, 1_500);
    metrics.recordGpuUpload(7, 1_500);
    metrics.recordFrameLatency(20, 1_500);
    metrics.recordRenderDiagnostics(
      {
        presentFps: 60,
        streamWidth: 1488,
        streamHeight: 1080,
        codedWidth: 1504,
        codedHeight: 1088,
        scheduledWidth: 1920,
        scheduledHeight: 1080,
        scheduledFps: 60,
        gopSize: 1,
        transportBitrateBps: 25_000_000,
        gpuFrameTimeMs: 12,
        renderTimeMs: 8,
        decodeSubmitToOutputMs: 20,
        packetToDecodeOutputMs: 24,
        queueDepth: 1,
        iosurfaceCreations: 1,
        textureAllocations: 2,
      },
      1_500,
    );
    metrics.recordMemorySample(
      {
        jsHeapUsedBytes: 32 * 1024 * 1024,
        jsHeapTotalBytes: 64 * 1024 * 1024,
        jsHeapLimitBytes: 512 * 1024 * 1024,
        estimatedDecodedFrameBytes: 1920 * 1080 * 4,
        decodedFrameWidth: 1920,
        decodedFrameHeight: 1080,
        canvasCssWidth: 1920,
        canvasCssHeight: 1080,
        canvasPhysicalWidth: 3840,
        canvasPhysicalHeight: 2160,
        devicePixelRatio: 2,
        presentationScaleX: 1,
        presentationScaleY: 1,
      },
      1_500,
    );
    metrics.incrementDroppedPrediction();

    const snapshot = metrics.snapshot(1_600);
    expect(snapshot).toMatchObject({
      ackP50Ms: 8,
      ackP95Ms: 32,
      ackP99Ms: 32,
      patchBandwidthBytesPerSec: 768,
      gpuUploadMs: 7,
      frameLatencyMs: 20,
      droppedPredictions: 1,
    });
    expect(snapshot.renderWindow.presentFps).toEqual({ avg: 60, p95: 60, max: 60, samples: 1 });
    expect(snapshot.renderWindow.streamWidth).toEqual({
      avg: 1488,
      p95: 1488,
      max: 1488,
      samples: 1,
    });
    expect(snapshot.renderWindow.codedWidth).toEqual({
      avg: 1504,
      p95: 1504,
      max: 1504,
      samples: 1,
    });
    expect(snapshot.renderWindow.scheduledWidth).toEqual({
      avg: 1920,
      p95: 1920,
      max: 1920,
      samples: 1,
    });
    expect(snapshot.renderWindow.scheduledFps).toEqual({
      avg: 60,
      p95: 60,
      max: 60,
      samples: 1,
    });
    expect(snapshot.renderWindow.gopSize).toEqual({
      avg: 1,
      p95: 1,
      max: 1,
      samples: 1,
    });
    expect(snapshot.renderWindow.transportBitrateBps).toEqual({
      avg: 25_000_000,
      p95: 25_000_000,
      max: 25_000_000,
      samples: 1,
    });
    expect(snapshot.renderWindow.gpuFrameTimeMs).toEqual({
      avg: 12,
      p95: 12,
      max: 12,
      samples: 1,
    });
    expect(snapshot.renderWindow.decodeSubmitToOutputMs).toEqual({
      avg: 20,
      p95: 20,
      max: 20,
      samples: 1,
    });
    expect(snapshot.renderWindow.jsHeapUsedBytes).toEqual({
      avg: 32 * 1024 * 1024,
      p95: 32 * 1024 * 1024,
      max: 32 * 1024 * 1024,
      samples: 1,
    });
    expect(snapshot.renderWindow.iosurfaceCreations).toEqual({
      avg: 1,
      p95: 1,
      max: 1,
      samples: 1,
    });
    expect(snapshot.renderWindow.decodedFrameWidth).toEqual({
      avg: 1920,
      p95: 1920,
      max: 1920,
      samples: 1,
    });
    expect(snapshot.renderWindow.canvasPhysicalWidth).toEqual({
      avg: 3840,
      p95: 3840,
      max: 3840,
      samples: 1,
    });
    expect(snapshot.renderWindow.devicePixelRatio).toEqual({
      avg: 2,
      p95: 2,
      max: 2,
      samples: 1,
    });
    expect(snapshot.renderWindow.presentationScaleX).toEqual({
      avg: 1,
      p95: 1,
      max: 1,
      samples: 1,
    });
  });

  it('uses a one second rolling window for authoring and render diagnostics', () => {
    const metrics = new AuthoringPerformanceMetrics();
    metrics.recordAckLatency(200, 100);
    metrics.recordAckLatency(12, 1_500);
    metrics.recordGpuUpload(100, 100);
    metrics.recordGpuUpload(4, 1_500);
    metrics.recordFrameLatency(80, 100);
    metrics.recordFrameLatency(16.666, 1_500);
    metrics.recordRenderDiagnostics({ gpuFrameTimeMs: 80, pendingDecodeFrames: 8 }, 100);
    metrics.recordRenderDiagnostics({ gpuFrameTimeMs: 10, pendingDecodeFrames: 1 }, 1_500);
    metrics.recordMemorySample({ jsHeapUsedBytes: 500 }, 100);
    metrics.recordMemorySample({ jsHeapUsedBytes: 100 }, 1_500);

    const snapshot = metrics.snapshot(1_600);
    expect(snapshot.ackP95Ms).toBe(12);
    expect(snapshot.gpuUploadMs).toBe(4);
    expect(snapshot.frameLatencyMs).toBe(16.666);
    expect(snapshot.renderWindow.gpuFrameTimeMs).toEqual({
      avg: 10,
      p95: 10,
      max: 10,
      samples: 1,
    });
    expect(snapshot.renderWindow.pendingDecodeFrames).toEqual({
      avg: 1,
      p95: 1,
      max: 1,
      samples: 1,
    });
    expect(snapshot.renderWindow.jsHeapUsedBytes).toEqual({
      avg: 100,
      p95: 100,
      max: 100,
      samples: 1,
    });
  });
});
