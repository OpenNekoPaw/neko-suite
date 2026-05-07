import { describe, expect, it, vi } from 'vitest';
import type { ILogger, TrackingData, TrackingServiceApi } from '@neko/shared';
import { ModelLiveModeService } from './ModelLiveModeService';

vi.mock('vscode', () => ({
  Disposable: class {
    constructor(private readonly callback: () => void) {}
    dispose(): void {
      this.callback();
    }
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

function createLogger(): ILogger {
  return {
    source: 'test',
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => createLogger()),
    setLevel: vi.fn(),
  };
}

function createTrackingService() {
  let listener: ((data: TrackingData) => void) | undefined;
  const service: TrackingServiceApi = {
    start: vi.fn(async () => ({ source: 'vmc' as const, active: true, fps: 0 })),
    stop: vi.fn(async () => ({ source: 'vmc' as const, active: false, fps: 0 })),
    status: vi.fn(async () => ({ source: 'vmc' as const, active: true, fps: 0 })),
    onTrackingData: vi.fn((nextListener) => {
      listener = nextListener;
      return {
        dispose: () => {
          listener = undefined;
        },
      };
    }),
    onStatusChange: vi.fn(() => ({ dispose: vi.fn() })),
  };

  return {
    service,
    emit: (data: TrackingData) => listener?.(data),
    hasListener: () => listener !== undefined,
  };
}

describe('ModelLiveModeService', () => {
  it('subscribes to tracking data and posts mapped VRM expressions to the model editor', async () => {
    const tracking = createTrackingService();
    const applyLiveExpressions = vi.fn();
    const service = new ModelLiveModeService({
      logger: createLogger(),
      getTrackingService: async () => tracking.service,
      editorProvider: { applyLiveExpressions } as never,
    });

    await service.start();
    tracking.emit({
      source: 'vmc',
      timestamp: 1,
      blendShapes: { jawOpen: 0.5, mouthSmileLeft: 0.2, mouthSmileRight: 0.8 },
    });

    expect(tracking.service.start).toHaveBeenCalledWith({ source: 'vmc' });
    const expressions = applyLiveExpressions.mock.calls[0]?.[0] as Record<string, number>;
    expect(expressions.aa).toBeCloseTo(0.4, 5);
    expect(expressions.happy).toBeCloseTo(0.64, 5);
    expect(expressions.surprised).toBeCloseTo(0.25, 5);
  });

  it('disposes the tracking subscription on stop', async () => {
    const tracking = createTrackingService();
    const service = new ModelLiveModeService({
      logger: createLogger(),
      getTrackingService: async () => tracking.service,
      editorProvider: { applyLiveExpressions: vi.fn() } as never,
    });

    await service.start();
    expect(tracking.hasListener()).toBe(true);

    await service.stop();

    expect(tracking.hasListener()).toBe(false);
    expect(service.isActive()).toBe(false);
  });
});
