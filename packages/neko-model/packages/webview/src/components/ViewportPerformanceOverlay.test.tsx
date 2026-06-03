// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthoringPerformanceMetrics } from '../scene/AuthoringPerformanceMetrics';
import { useModelStore } from '../stores/modelStore';
import { ViewportPerformanceOverlay } from './ViewportPerformanceOverlay';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (key === 'performance.value.hostLimited') {
        return `${params?.fps ?? '-'} fps host-limited`;
      }
      if (key === 'performance.value.baselineMatched') {
        return `${params?.effective ?? '-'} matched`;
      }
      if (key === 'performance.value.baselineFallback') {
        return `${params?.effective ?? '-'} fallback`;
      }
      if (!params) return key;
      return Object.entries(params).reduce(
        (message, [name, value]) => message.replace(`{${name}}`, String(value)),
        key,
      );
    },
  }),
}));

describe('ViewportPerformanceOverlay', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const metrics = new AuthoringPerformanceMetrics();
    metrics.recordAckLatency(18, 1_000);
    metrics.recordPatchBytes(2048, 1_000);
    metrics.recordGpuUpload(3.5, 1_000);
    metrics.recordFrameLatency(17.4, 1_000);
    metrics.recordRenderDiagnostics(
      {
        presentFps: 59.8,
        gpuFrameTimeMs: 12.25,
        renderTimeMs: 8.25,
        convertTimeMs: 1.75,
        gpuWaitTimeMs: 0.5,
        producerFrameTimeMs: 15.75,
        encodeTimeMs: 4.5,
        streamSubmitTimeMs: 5.25,
        scheduleLagMs: 1.25,
        decodeSubmitToOutputMs: 21.2,
        packetToDecodeOutputMs: 24.4,
        decodeOutputToPresentedMs: 8.6,
        drawTimeMs: 2.1,
        queueDepth: 3,
        webcodecsDecodeQueueSize: 1,
        pendingDecodeFrames: 4,
        decodeOutputIntervalMs: 16.7,
        decodeOutputBurst: 2,
        droppedBeforeDecode: 4,
        decodedDroppedBeforePresent: 1,
        decodeOutputLagFrames: 1.5,
        streamWidth: 1488,
        streamHeight: 1080,
        codedWidth: 1504,
        codedHeight: 1088,
        scheduledWidth: 1920,
        scheduledHeight: 1080,
        scheduledFps: 60,
        gopSize: 1,
        transportBitrateBps: 25_712_640,
        codecString: 'avc1.64002a',
        codecProfile: 'high',
        codecLevel: '4.2',
        latencyMode: 'realtime',
        postProcessEnabled: true,
        helperPassesEnabled: false,
        droppedFramesSinceLast: 2,
        skippedIntervals: 1,
        iosurfaceCreations: 1,
        textureAllocations: 2,
      },
      1_000,
    );
    metrics.recordMemorySample(
      {
        jsHeapUsedBytes: 32 * 1024 * 1024,
        jsHeapTotalBytes: 64 * 1024 * 1024,
        jsHeapLimitBytes: 512 * 1024 * 1024,
        estimatedDecodedFrameBytes: 1488 * 1080 * 4,
        decodedFrameWidth: 1488,
        decodedFrameHeight: 1080,
        canvasCssWidth: 1488,
        canvasCssHeight: 1080,
        canvasPhysicalWidth: 2976,
        canvasPhysicalHeight: 2160,
        devicePixelRatio: 2,
        presentationScaleX: 1,
        presentationScaleY: 1,
      },
      1_000,
    );
    useModelStore.setState({
      authoringMetrics: metrics,
      authoringMetricsSnapshot: {
        ...metrics.snapshot(1_000),
        droppedPredictions: 1,
      },
      lastRenderFrameMeta: {
        streamId: 'stream-main',
        viewportId: 'main',
        frameId: 42,
        ptsUs: 0,
        durationUs: 16_666,
        isKeyframe: true,
        sceneRevision: 7,
        appliedSeq: 3,
        frameTimestamp: 0,
        viewTransform: [1, 0, 0, 1, 0, 0],
        diagnostics: {
          qualityTier: 'main-fps-reduced',
          gpuFrameTimeMs: 99,
          producerFrameTimeMs: 15.75,
          encodeTimeMs: 4.5,
          streamSubmitTimeMs: 5.25,
          scheduleLagMs: 1.25,
          decodeTimeMs: 99,
          decodeSubmitToOutputMs: 21.2,
          packetToDecodeOutputMs: 24.4,
          decodeOutputToPresentedMs: 8.6,
          decodedDroppedBeforePresent: 1,
          decodeOutputLagFrames: 1.5,
          streamWidth: 1488,
          streamHeight: 1080,
          codedWidth: 1504,
          codedHeight: 1088,
          scheduledWidth: 1920,
          scheduledHeight: 1080,
          scheduledFps: 60,
          gopSize: 1,
          transportBitrateBps: 25_712_640,
          codecString: 'avc1.64002a',
          codecProfile: 'high',
          codecLevel: '4.2',
          latencyMode: 'realtime',
          postProcessEnabled: true,
          helperPassesEnabled: false,
          presentFps: 59.8,
          presentationHostLimited: false,
          drawTimeMs: 2.1,
          queueDepth: 3,
          webcodecsDecodeQueueSize: 1,
          pendingDecodeFrames: 4,
          decodeOutputIntervalMs: 16.7,
          decodeOutputBurst: 2,
          droppedBeforeDecode: 4,
          droppedFramesSinceLast: 2,
          skippedIntervals: 1,
          renderPath: 'gpu-zero-copy',
        },
      },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders localized performance metrics from Engine frame metadata and authoring stats', () => {
    act(() => {
      root.render(<ViewportPerformanceOverlay />);
    });

    const overlay = host.querySelector<HTMLElement>('#model-performance-metrics');

    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('aria-label')).toBe('performance.aria.metrics');
    expect(overlay?.getAttribute('data-quality-tier')).toBe('main-fps-reduced');
    expect(host.textContent).toContain('performance.title');
    expect(host.textContent).toContain('1488x1080 @ 60.0 fps matched');
    expect(host.textContent).toContain('60.0 fps');
    expect(host.textContent).toContain('17.4 ms');
    expect(host.textContent).toContain('12.3 ms');
    expect(host.textContent).not.toContain('99.0 ms');
    expect(host.textContent).toContain('15.8 ms');
    expect(host.textContent).toContain('5.3 ms');
    expect(host.textContent).toContain('1.3 ms');
    expect(host.textContent).toContain('21.2 ms');
    expect(host.textContent).toContain('24.4 ms');
    expect(host.textContent).toContain('8.6 ms');
    expect(host.textContent).toContain('59.8 fps');
    expect(host.textContent).toContain('4');
    expect(host.textContent).not.toContain('99.0 ms');
    expect(host.textContent).toContain('2.0 KB/s');
    expect(host.textContent).toContain('32.0 MB');
    expect(host.textContent).toContain('64.0 MB');
    expect(host.textContent).toContain('512.0 MB');
    expect(host.textContent).toContain('6.1 MB');
    expect(host.textContent).toContain('1488x1080');
    expect(host.textContent).toContain('1504x1088');
    expect(host.textContent).toContain('1920x1080');
    expect(host.textContent).toContain('25.7 Mbps');
    expect(host.textContent).toContain('avc1.64002a');
    expect(host.textContent).toContain('high / 4.2');
    expect(host.textContent).toContain('realtime');
    expect(host.textContent).toContain('performance.value.enabled');
    expect(host.textContent).toContain('performance.value.disabled');
    expect(host.textContent).toContain('2976x2160');
    expect(host.textContent).toContain('2.00');
    expect(host.textContent).toContain('1.00x / 1.00x');
    expect(host.textContent).toContain('24.5 MB');
    expect(host.textContent).toContain('gpu-zero-copy');
    expect(host.textContent).toContain('performance.metric.preDecodeDrops');
    expect(host.textContent).toContain('performance.metric.prePresentDrops');
    expect(host.textContent).toContain('performance.metric.decodeLag');
    expect(host.textContent).toContain('performance.metric.webcodecsQueue');
    expect(host.textContent).toContain('performance.metric.pendingDecode');
    expect(host.textContent).toContain('performance.metric.decodeOutputInterval');
    expect(host.textContent).toContain('performance.metric.decodeOutputBurst');
    expect(host.textContent).toContain('performance.metric.skippedIntervals');
    expect(host.textContent).toContain('performance.value.frameRevision');
  });

  it('labels present FPS when the VSCode webview host limits presentation cadence', () => {
    useModelStore.setState((state) => ({
      lastRenderFrameMeta: state.lastRenderFrameMeta
        ? {
            ...state.lastRenderFrameMeta,
            diagnostics: {
              ...state.lastRenderFrameMeta.diagnostics,
              presentFps: 30.1,
              presentationHostLimited: true,
            },
          }
        : null,
    }));

    act(() => {
      root.render(<ViewportPerformanceOverlay />);
    });

    expect(host.textContent).toContain('30.1 fps host-limited');
  });

  it('surfaces explicit stream fallback when effective resolution or FPS misses 1080p60', () => {
    const metrics = new AuthoringPerformanceMetrics();
    metrics.recordRenderDiagnostics(
      {
        streamWidth: 1280,
        streamHeight: 720,
        scheduledWidth: 1280,
        scheduledHeight: 720,
        scheduledFps: 30,
        presentFps: 30,
      },
      2_000,
    );
    useModelStore.setState({
      authoringMetrics: metrics,
      authoringMetricsSnapshot: metrics.snapshot(2_000),
      lastRenderFrameMeta: {
        streamId: 'stream-main',
        viewportId: 'main',
        frameId: 43,
        ptsUs: 0,
        durationUs: 33_333,
        isKeyframe: true,
        sceneRevision: 7,
        appliedSeq: 3,
        frameTimestamp: 0,
        viewTransform: [1, 0, 0, 1, 0, 0],
        diagnostics: {
          streamWidth: 1280,
          streamHeight: 720,
          scheduledWidth: 1280,
          scheduledHeight: 720,
          scheduledFps: 30,
          presentFps: 30,
        },
      },
    });

    act(() => {
      root.render(<ViewportPerformanceOverlay />);
    });

    expect(host.textContent).toContain('1280x720 @ 30.0 fps fallback');
  });
});
