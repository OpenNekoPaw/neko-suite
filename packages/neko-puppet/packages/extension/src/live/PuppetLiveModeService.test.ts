import { describe, expect, it, vi } from 'vitest';
import type { ILogger, TrackingData, TrackingServiceApi } from '@neko/shared';
import { PuppetLiveModeService } from './PuppetLiveModeService';

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

describe('PuppetLiveModeService', () => {
  it('subscribes to tracking data and applies mapped puppet params without persisting', async () => {
    const tracking = createTrackingService();
    const setFaceParams = vi.fn(async () => undefined);
    const service = new PuppetLiveModeService({
      logger: createLogger(),
      getTrackingService: async () => tracking.service,
      editorProvider: {
        getAvailableFaceParamNames: () => ['ParamMouthOpenY', 'ParamEyeLOpen'],
        setFaceParams,
      } as never,
    });

    await service.start();
    tracking.emit({
      source: 'vmc',
      timestamp: 1,
      blendShapes: { jawOpen: 0.7, eyeBlinkLeft: 0.25 },
    });

    expect(tracking.service.start).toHaveBeenCalledWith({ source: 'vmc' });
    expect(setFaceParams).toHaveBeenCalledWith(
      { ParamMouthOpenY: 0.7, ParamEyeLOpen: 0.75 },
      { persist: false },
    );
  });

  it('disposes the tracking subscription on stop', async () => {
    const tracking = createTrackingService();
    const service = new PuppetLiveModeService({
      logger: createLogger(),
      getTrackingService: async () => tracking.service,
      editorProvider: {
        getAvailableFaceParamNames: () => [],
        setFaceParams: vi.fn(),
      } as never,
    });

    await service.start();
    expect(tracking.hasListener()).toBe(true);

    await service.stop();

    expect(tracking.hasListener()).toBe(false);
    expect(service.isActive()).toBe(false);
  });
});
