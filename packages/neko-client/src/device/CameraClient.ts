import type { DeviceInfo, DevicePermissionState, DeviceSession } from '@neko/shared';
import { cameraToDeviceInfo } from './adapters';
import type { DeviceEngineClient } from './types';

export class CameraClient {
  constructor(
    private readonly engine: Pick<
      DeviceEngineClient,
      'listCameraDevices' | 'startCameraCapture' | 'stopCameraCapture'
    >,
  ) {}

  async listDevices(permissionState: DevicePermissionState = 'unknown'): Promise<DeviceInfo[]> {
    const devices = await this.engine.listCameraDevices();
    return devices.map((device) => cameraToDeviceInfo(device, permissionState));
  }

  async startCapture(deviceId?: string): Promise<DeviceSession> {
    const result = await this.engine.startCameraCapture({ deviceId });
    return {
      sessionId: result.streamId,
      deviceId: deviceId ?? '',
      deviceType: 'camera',
      streamUrl: result.wsUrl,
    };
  }

  async stopCapture(sessionId: string): Promise<void> {
    await this.engine.stopCameraCapture(sessionId);
  }
}
