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
    useModelStore.setState({
      authoringMetrics: new AuthoringPerformanceMetrics(),
      authoringMetricsSnapshot: {
        ackP50Ms: 2,
        ackP95Ms: 18,
        ackP99Ms: 30,
        patchBandwidthBytesPerSec: 2048,
        gpuUploadMs: 3.5,
        frameLatencyMs: 17.4,
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
          gpuFrameTimeMs: 12.25,
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
    expect(host.textContent).toContain('60.0 fps');
    expect(host.textContent).toContain('17.4 ms');
    expect(host.textContent).toContain('12.3 ms');
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
});
