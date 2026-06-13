import { describe, expect, it, vi } from 'vitest';
import type { DeviceInfo, DeviceSession, ILogger } from '@neko/shared';
import type { DeviceManager } from '@neko/neko-client/device';
import { LiveSessionService } from './LiveSessionService';

vi.mock('vscode', () => ({
  Disposable: class {
    constructor(private readonly callback: () => void) {}
    dispose(): void {
      this.callback();
    }
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    joinPath: (_base: { fsPath: string }, child: string) => ({ fsPath: child }),
  },
  workspace: {
    workspaceFolders: undefined,
    fs: {
      createDirectory: vi.fn(async () => undefined),
    },
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

function cameraDevice(): DeviceInfo {
  return {
    id: 'cam-1',
    type: 'camera',
    label: 'Camera',
    connectionState: 'available',
    permissionState: 'granted',
  };
}

describe('LiveSessionService', () => {
  it('updates scene snapshots and notifies listeners', () => {
    const service = new LiveSessionService({
      logger: createLogger(),
      getEngineClient: async () => undefined,
      getDeviceManager: () => undefined,
      ensureDeviceManager: async () => undefined,
    });
    const events: unknown[] = [];
    service.onDidChange((event) => events.push(event));

    service.updateScene({ avatarType: 'vrm', avatarUri: 'file:///avatar.vrm' });

    expect(service.getSnapshot().scene).toEqual({
      avatarType: 'vrm',
      avatarUri: 'file:///avatar.vrm',
    });
    expect(events).toContainEqual({
      type: 'snapshot',
      snapshot: service.getSnapshot(),
    });
  });

  it('binds camera role to a device session and disconnects it on stop', async () => {
    const manager: Pick<DeviceManager, 'connect' | 'disconnect'> = {
      connect: vi.fn(
        async (): Promise<DeviceSession> => ({
          sessionId: 'camera-session',
          deviceId: 'cam-1',
          deviceType: 'camera',
          streamUrl: 'ws://camera',
        }),
      ),
      disconnect: vi.fn(async () => undefined),
    };
    const service = new LiveSessionService({
      logger: createLogger(),
      getEngineClient: async () => undefined,
      getDeviceManager: () => manager as DeviceManager,
      ensureDeviceManager: async () => manager as DeviceManager,
    });

    await service.startDeviceStream('camera', cameraDevice());
    expect(service.getSnapshot().deviceBindings.camera).toMatchObject({
      role: 'camera',
      deviceId: 'cam-1',
      sessionId: 'camera-session',
      compositorSourceRef: {
        sourceId: 'source-camera-camera-session',
        kind: 'camera',
        deviceSessionRef: 'camera-session',
        metadata: {
          authorized: true,
          deviceId: 'cam-1',
          role: 'camera',
        },
      },
    });
    expect(service.getSnapshot().deviceBindings.camera?.streamUrl).toBeUndefined();

    await service.stopDeviceStream('camera');

    expect(manager.disconnect).toHaveBeenCalledWith('camera-session');
    expect(service.getSnapshot().deviceBindings.camera).toBeUndefined();
  });

  it('rejects device role mismatches', () => {
    const service = new LiveSessionService({
      logger: createLogger(),
      getEngineClient: async () => undefined,
      getDeviceManager: () => undefined,
      ensureDeviceManager: async () => undefined,
    });

    expect(() =>
      service.bindDevice('camera', {
        id: 'pad-1',
        type: 'gamepad',
        label: 'Pad',
        connectionState: 'connected',
        permissionState: 'granted',
      }),
    ).toThrow('Device role camera requires camera');
  });

  it('labels webview canvas recording as local preview diagnostics', async () => {
    const service = new LiveSessionService({
      logger: createLogger(),
      getEngineClient: async () => undefined,
      getDeviceManager: () => undefined,
      ensureDeviceManager: async () => undefined,
    });

    await service.startRecording({ includeAudio: false, authority: 'local-preview' });

    expect(service.getSnapshot().recording).toMatchObject({
      active: true,
      authority: 'local-preview',
      diagnostics: [
        expect.objectContaining({
          code: 'preview-non-authoritative',
          severity: 'warning',
        }),
      ],
    });

    const result = await service.stopRecording();

    expect(result).toMatchObject({
      authority: 'local-preview',
      diagnostics: ['preview-non-authoritative'],
    });
  });
});
