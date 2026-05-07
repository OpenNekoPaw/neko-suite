import { describe, expect, it, vi } from 'vitest';
import { DevicePermissionError, type DevicePermissionState, type DeviceType } from '@neko/shared';
import { EngineDeviceManager } from '../DeviceManager';
import type { DeviceEngineClient, DevicePermissionPolicy } from '../types';

function createEngine(): DeviceEngineClient {
  return {
    listInputDevices: vi.fn(async () => [
      {
        id: 'mic-1',
        name: 'Studio Mic',
        sampleRates: [48000],
        channels: [1, 2],
        isDefault: true,
      },
    ]),
    recordStart: vi.fn(async () => ({ streamId: 'audio-session-1', monitorUrl: '/v1/monitor/1' })),
    recordStop: vi.fn(async () => ({})),
    listCameraDevices: vi.fn(async () => [{ id: 'cam-1', name: 'Camera', isDefault: true }]),
    startCameraCapture: vi.fn(async () => ({ streamId: 'camera-session-1', wsUrl: 'ws://camera' })),
    stopCameraCapture: vi.fn(async () => undefined),
    listMidiPorts: vi.fn(async () => [{ id: 'midi-1', name: 'MIDI Port' }]),
    connectMidi: vi.fn(async () => ({ streamId: 'midi-session-1', wsUrl: 'ws://midi' })),
    disconnectMidi: vi.fn(async () => undefined),
    listGamepads: vi.fn(async () => [{ id: 'gamepad-1', name: 'Pad', connected: true }]),
    connectGamepad: vi.fn(async () => ({ streamId: 'gamepad-session-1', wsUrl: 'ws://gamepad' })),
    disconnectGamepad: vi.fn(async () => undefined),
  };
}

function createPermissionPolicy(
  stateFor: (type: DeviceType, deviceId?: string) => DevicePermissionState,
): DevicePermissionPolicy {
  return {
    getPermission: vi.fn(async ({ deviceType, deviceId }) => stateFor(deviceType, deviceId)),
    requestPermission: vi.fn(async ({ deviceType, deviceId }) => stateFor(deviceType, deviceId)),
  };
}

describe('EngineDeviceManager', () => {
  it('normalizes engine device DTOs and lists cached devices by type', async () => {
    const engine = createEngine();
    const manager = new EngineDeviceManager({
      engine,
      permissionPolicy: createPermissionPolicy((type) =>
        type === 'audio-input' || type === 'camera' ? 'unknown' : 'granted',
      ),
    });

    const devices = await manager.refresh();

    expect(devices).toHaveLength(4);
    expect(manager.list('audio-input')).toEqual([
      {
        id: 'mic-1',
        type: 'audio-input',
        label: 'Studio Mic',
        isDefault: true,
        connectionState: 'available',
        permissionState: 'unknown',
        capabilities: { sampleRates: [48000], channels: [1, 2] },
      },
    ]);
    expect(engine.listInputDevices).toHaveBeenCalledTimes(1);

    manager.list('audio-input');
    expect(engine.listInputDevices).toHaveBeenCalledTimes(1);
  });

  it('blocks sensitive device connection when permission is denied', async () => {
    const engine = createEngine();
    const manager = new EngineDeviceManager({
      engine,
      permissionPolicy: createPermissionPolicy((type) =>
        type === 'camera' ? 'denied' : 'granted',
      ),
    });
    await manager.refresh();

    await expect(manager.connect('cam-1')).rejects.toBeInstanceOf(DevicePermissionError);
    expect(engine.startCameraCapture).not.toHaveBeenCalled();
  });

  it('connects and disconnects sessions while notifying listeners', async () => {
    const engine = createEngine();
    const manager = new EngineDeviceManager({
      engine,
      permissionPolicy: createPermissionPolicy(() => 'granted'),
    });
    const listener = vi.fn();
    const disposable = manager.onDeviceChange(listener);
    await manager.refresh();

    const session = await manager.connect('midi-1');
    expect(session).toEqual({
      sessionId: 'midi-session-1',
      deviceId: 'midi-1',
      deviceType: 'midi-input',
      streamUrl: 'ws://midi',
    });
    expect(manager.list('midi-input')[0]?.connectionState).toBe('connected');

    await manager.disconnect(session.sessionId);
    expect(engine.disconnectMidi).toHaveBeenCalledWith('midi-session-1');
    expect(manager.list('midi-input')[0]?.connectionState).toBe('available');

    const callsBeforeDispose = listener.mock.calls.length;
    disposable.dispose();
    await manager.refresh();
    expect(listener).toHaveBeenCalledTimes(callsBeforeDispose);
  });

  it('does not emit changed events for identical devices with differently ordered keys', async () => {
    const engine = createEngine();
    const manager = new EngineDeviceManager({
      engine,
      permissionPolicy: createPermissionPolicy(() => 'granted'),
    });
    await manager.refresh();
    const audioDevice = manager.list('audio-input')[0];
    if (!audioDevice) {
      throw new Error('Expected audio input device');
    }
    const label = audioDevice.label;
    Reflect.deleteProperty(audioDevice, 'label');
    Object.assign(audioDevice, { label });
    const listener = vi.fn();
    manager.onDeviceChange(listener);

    await manager.refresh();

    expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'changed' }));
  });
});
