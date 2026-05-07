import { describe, expect, it } from 'vitest';
import type {
  DeviceEvent,
  DeviceInfo,
  DevicePermissionState,
  DeviceSession,
  DisposableLike,
  TrackingData,
  TrackingServiceApi,
  TrackingStatus,
} from '../../index';

function expectJsonSerializable(value: unknown): void {
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
}

describe('device and tracking shared contracts', () => {
  it('models normalized device information without platform objects', () => {
    const permission: DevicePermissionState = 'granted';
    const device: DeviceInfo = {
      id: 'camera:default',
      type: 'camera',
      label: 'Default Camera',
      isDefault: true,
      connectionState: 'available',
      permissionState: permission,
      capabilities: {
        resolutions: [{ width: 1280, height: 720, fps: [30, 60] }],
      },
    };
    const session: DeviceSession = {
      sessionId: 'session-camera-default',
      deviceId: device.id,
      deviceType: device.type,
      streamUrl: 'ws://127.0.0.1:3000/v1/streams/camera-default',
    };
    const event: DeviceEvent = { type: 'changed', device };

    expect(device.permissionState).toBe('granted');
    expect(session.deviceType).toBe('camera');
    expect(event.type).toBe('changed');
    expectJsonSerializable(device);
    expectJsonSerializable(session);
    expectJsonSerializable(event);
  });

  it('models tracking data and service API through disposable-like handles', async () => {
    const frame: TrackingData = {
      source: 'vmc',
      timestamp: 1,
      blendShapes: { jawOpen: 0.4 },
      headRotation: [0, 0, 0, 1],
      boneTransforms: {
        Head: { rotation: [0, 0, 0, 1], position: [0, 1, 0] },
      },
    };
    const inactive: TrackingStatus = { source: 'vmc', active: false, fps: 0 };
    let disposed = false;
    const disposable: DisposableLike = {
      dispose: () => {
        disposed = true;
      },
    };
    const api: TrackingServiceApi = {
      start: async () => ({ source: 'vmc', active: true, fps: 60, port: 39539 }),
      stop: async () => inactive,
      status: async () => inactive,
      onTrackingData: () => disposable,
      onStatusChange: () => disposable,
    };

    expectJsonSerializable(frame);
    expect(await api.status('vmc')).toEqual(inactive);
    api.onTrackingData(() => undefined).dispose();
    expect(disposed).toBe(true);
  });
});
