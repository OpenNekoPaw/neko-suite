/**
 * Application-level device contracts.
 *
 * These types describe normalized device state shared across extension,
 * client, and webview layers. Low-level engine wire DTOs remain in
 * @neko/neko-client and are adapted into these contracts.
 */

export type DeviceType = 'audio-input' | 'camera' | 'midi-input' | 'gamepad' | 'xr';

export type DeviceConnectionState = 'available' | 'connected' | 'busy' | 'disconnected' | 'error';

export type DevicePermissionState = 'unknown' | 'granted' | 'denied';

export interface DisposableLike {
  dispose(): void;
}

export interface DeviceResolutionCapability {
  width: number;
  height: number;
  fps: number[];
}

export interface DeviceCapabilities {
  sampleRates?: number[];
  channels?: number[];
  resolutions?: DeviceResolutionCapability[];
  controls?: string[];
}

export interface DeviceInfo {
  id: string;
  type: DeviceType;
  label: string;
  connectionState: DeviceConnectionState;
  permissionState: DevicePermissionState;
  isDefault?: boolean;
  capabilities?: DeviceCapabilities;
  errorMessage?: string;
}

export interface DeviceSession {
  sessionId: string;
  deviceId: string;
  deviceType: DeviceType;
  streamUrl?: string;
}

export type DeviceEvent =
  | { type: 'added'; device: DeviceInfo }
  | { type: 'removed'; deviceId: string; deviceType: DeviceType }
  | { type: 'changed'; device: DeviceInfo }
  | { type: 'permissionChanged'; deviceId: string; state: DevicePermissionState }
  | { type: 'error'; deviceId?: string; deviceType?: DeviceType; message: string };

export interface DevicePermissionRequest {
  deviceType: DeviceType;
  deviceId?: string;
  reason?: string;
}

export class DevicePermissionError extends Error {
  public override readonly name = 'DevicePermissionError';

  constructor(
    public readonly deviceType: DeviceType,
    public readonly deviceId?: string,
  ) {
    super(`Permission denied for ${deviceType}${deviceId ? ` device ${deviceId}` : ''}`);
  }
}
