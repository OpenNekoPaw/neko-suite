import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { ProjectData } from '@neko/shared';
import { PreviewPanel } from './PreviewPanel';
import { useEditorStore } from '../../stores/editor-store';
import { postMessage } from '../../utils/vscodeApi';
import { publishFrameServerMessage } from '../../services/frameServerMessages';

type MockStoreState = {
  project: ProjectData | null;
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  previewQuality: 'low' | 'medium' | 'high';
  previewVolume: number;
  previewMuted: boolean;
  showFpsCounter: boolean;
  currentFps: number;
  performanceStats: unknown;
  setCurrentFps: (fps: number) => void;
  setPerformanceStats: (stats: unknown) => void;
  setIsPiPActive: (active: boolean) => void;
};

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const storeMock = vi.hoisted(() => {
  let state: MockStoreState;
  const subscribers = new Set<() => void>();
  const notify = () => {
    for (const subscriber of subscribers) subscriber();
  };
  return {
    getState: () => state,
    replaceState: (next: MockStoreState) => {
      state = next;
      notify();
    },
    setState: (partial: Partial<MockStoreState>) => {
      state = { ...state, ...partial };
      notify();
    },
    subscribe: (subscriber: () => void) => {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  };
});

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../stores/editor-store', async () => {
  const ReactModule = await import('react');

  function useEditorStore<T>(selector?: (state: MockStoreState) => T): T | MockStoreState {
    const [, forceRender] = ReactModule.useReducer((count: number) => count + 1, 0);
    ReactModule.useEffect(() => {
      const unsubscribe = storeMock.subscribe(forceRender);
      return () => {
        unsubscribe();
      };
    }, []);
    const state = storeMock.getState();
    return selector ? selector(state) : state;
  }
  useEditorStore.setState = storeMock.setState;

  return { useEditorStore };
});

vi.mock('../../hooks/useMediaInfoCache', () => ({
  useMediaInfoCache: () => ({ bitrate: '', codec: '', resolution: '' }),
}));

vi.mock('../../utils/vscodeApi', () => ({
  postMessage: vi.fn(),
}));

vi.mock('../../services/mediaProxyFactory', () => ({
  getMediaProxy: () => ({
    renderCompositeFrame: vi.fn(),
    getStreamStats: vi.fn(() => Promise.resolve(null)),
  }),
}));

vi.mock('@neko/neko-client', () => {
  const h264Connect = vi.fn();

  class H264StreamClient {
    connect = h264Connect;
    dispose = vi.fn();
    resetDecoder = vi.fn();
    getStats = vi.fn(() => ({
      framesDecoded: 1,
      framesDropped: 0,
      avgDecodeTimeMs: 0,
      avgLatencyMs: 0,
      hardwareAcceleration: false,
    }));
  }

  class AudioStreamClient {
    isClockReady = false;
    connect = vi.fn();
    dispose = vi.fn();
    pause = vi.fn();
    resume = vi.fn();
    setVolume = vi.fn();
    resetClock = vi.fn();
    getCurrentTime = vi.fn(() => 0);
  }

  class FrameScheduler {
    enqueue = vi.fn();
    schedule = vi.fn(() => ({ action: 'wait', skipped: 0, deltaUs: 0 }));
    flush = vi.fn();
    dispose = vi.fn();
    switchClock = vi.fn();
    getStats = vi.fn(() => ({ queueLength: 0, skipped: 0, backpressure: 0 }));
  }

  class PlaybackPerformanceMonitor {
    reset = vi.fn();
    recordFrame = vi.fn();
    recordRenderTime = vi.fn();
    recordPacketSize = vi.fn();
    recordDroppedFrames = vi.fn();
    getSnapshot = vi.fn(() => ({
      droppedFrames: 0,
      avgRenderTimeMs: 0,
      frameTimeP50: 0,
      frameTimeP95: 0,
      frameTimeP99: 0,
      measuredFps: 0,
      bitrateKbps: 0,
      memoryUsedMB: 0,
    }));
  }

  return {
    H264StreamClient,
    AudioStreamClient,
    FrameScheduler,
    PlaybackPerformanceMonitor,
    __h264Connect: h264Connect,
  };
});

const baseProject: ProjectData = {
  version: '1.0',
  name: 'Preview test',
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  tracks: [],
};

async function renderPreview(): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<PreviewPanel />);
    await Promise.resolve();
  });
  return { root, container };
}

describe('PreviewPanel playback controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        observe(): void {}
        disconnect(): void {}
      },
    );
    vi.stubGlobal(
      'AudioContext',
      class AudioContext {
        state: AudioContextState = 'running';
        resume(): Promise<void> {
          return Promise.resolve();
        }
        close(): Promise<void> {
          this.state = 'closed';
          return Promise.resolve();
        }
      },
    );
    storeMock.replaceState({
      project: baseProject,
      currentTime: 0,
      isPlaying: false,
      playbackSpeed: 1,
      previewQuality: 'medium',
      previewVolume: 1,
      previewMuted: false,
      showFpsCounter: false,
      currentFps: 0,
      performanceStats: null,
      setCurrentFps: vi.fn(),
      setPerformanceStats: vi.fn(),
      setIsPiPActive: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    useEditorStore.setState({
      project: null,
      currentTime: 0,
      isPlaying: false,
      playbackSpeed: 1,
    });
  });

  it('sends only speed control when playback speed changes during playback', async () => {
    const { root } = await renderPreview();

    await act(async () => {
      publishFrameServerMessage({ type: 'frameServer:config', port: 39001 });
      await Promise.resolve();
    });

    const mockedPostMessage = vi.mocked(postMessage);
    await act(async () => {
      useEditorStore.setState({ isPlaying: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
    });
    mockedPostMessage.mockClear();

    await act(async () => {
      useEditorStore.setState({ playbackSpeed: 2 });
      await Promise.resolve();
    });

    const messageTypes = mockedPostMessage.mock.calls.map((call) => {
      const message = call[0] as { type?: unknown };
      return message.type;
    });
    expect(messageTypes).toContain('media:frameServer:projectPlayback:speed');
    expect(messageTypes).not.toContain('media:frameServer:projectPlayback:pause');
    expect(messageTypes).not.toContain('media:frameServer:projectPlayback:resume');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('connects to cached frame server stream when streamCreated arrives before mount', async () => {
    publishFrameServerMessage({
      type: 'frameServer:config',
      port: 39001,
    });
    publishFrameServerMessage({
      type: 'frameServer:streamCreated',
      streamId: 'strm_editor-v_cached',
      wsUrl: 'ws://127.0.0.1:39001/v1/streams/strm_editor-v_cached',
      audioStreamId: null,
      audioWsUrl: null,
    });

    const { root } = await renderPreview();
    const clientModule = await import('@neko/neko-client');
    const h264Connect = (
      clientModule as typeof clientModule & { __h264Connect: ReturnType<typeof vi.fn> }
    ).__h264Connect;

    expect(h264Connect).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });
});
