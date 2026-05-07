import { describe, expect, it, vi } from 'vitest';
import type { ILogger, TrackingData } from '@neko/shared';
import { TrackingService, type TrackingReceiverFactory } from './TrackingService';

vi.mock('vscode', () => ({
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
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

class FakeReceiver {
  isRunning = false;
  fps = 0;
  readonly listeners = new Map<string, Array<(value?: unknown) => void>>();
  startCalls = 0;
  stopCalls = 0;

  on(event: string, listener: (value?: unknown) => void): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }

  async start(): Promise<void> {
    this.startCalls++;
    this.isRunning = true;
    this.emit('started');
  }

  stop(): void {
    this.stopCalls++;
    this.isRunning = false;
    this.emit('stopped');
  }

  emit(event: string, value?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(value);
    }
  }
}

describe('TrackingService', () => {
  it('starts VMC tracking idempotently and publishes status', async () => {
    const receiver = new FakeReceiver();
    const factory: TrackingReceiverFactory = () => receiver as never;
    const service = new TrackingService(createLogger(), 39539, factory);
    const statuses: unknown[] = [];
    service.onStatusChange((status) => statuses.push(status));

    await service.start({ source: 'vmc', port: 39539 });
    await service.start({ source: 'vmc', port: 39539 });

    expect(receiver.startCalls).toBe(1);
    expect(statuses).toContainEqual({ source: 'vmc', active: true, fps: 0, port: 39539 });
  });

  it('broadcasts tracking frames to multiple disposable listeners', async () => {
    const receiver = new FakeReceiver();
    const service = new TrackingService(createLogger(), 39539, () => receiver as never);
    const frame: TrackingData = { source: 'vmc', timestamp: 1, blendShapes: { jawOpen: 0.5 } };
    const first = vi.fn();
    const second = vi.fn();
    const firstDisposable = service.onTrackingData(first);
    service.onTrackingData(second);

    await service.start();
    receiver.emit('tracking', frame);
    firstDisposable.dispose();
    receiver.emit('tracking', frame);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('reports start failures as inactive status with error message', async () => {
    const receiver = new FakeReceiver();
    receiver.start = vi.fn(async () => {
      throw new Error('port in use');
    });
    const service = new TrackingService(createLogger(), 39539, () => receiver as never);

    const status = await service.start();

    expect(status).toEqual({
      source: 'vmc',
      active: false,
      fps: 0,
      port: 39539,
      errorMessage: 'port in use',
    });
  });
});
