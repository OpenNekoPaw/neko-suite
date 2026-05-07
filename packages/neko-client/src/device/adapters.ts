import type {
  DeviceCapabilities,
  DeviceConnectionState,
  DeviceInfo,
  DevicePermissionState,
  DeviceType,
} from '@neko/shared';
import type { AudioInputDevice, CameraDevice, GamepadInfo, MidiPort } from '../engine/types';

export function audioInputToDeviceInfo(
  device: AudioInputDevice,
  permissionState: DevicePermissionState,
): DeviceInfo {
  return {
    id: device.id,
    type: 'audio-input',
    label: device.name,
    isDefault: device.isDefault,
    connectionState: 'available',
    permissionState,
    capabilities: compactCapabilities({
      sampleRates: device.sampleRates,
      channels: device.channels,
    }),
  };
}

export function cameraToDeviceInfo(
  device: CameraDevice,
  permissionState: DevicePermissionState,
): DeviceInfo {
  return {
    id: device.id,
    type: 'camera',
    label: device.name,
    isDefault: device.isDefault,
    connectionState: 'available',
    permissionState,
  };
}

export function midiPortToDeviceInfo(port: MidiPort): DeviceInfo {
  return {
    id: port.id,
    type: 'midi-input',
    label: port.name,
    connectionState: 'available',
    permissionState: 'granted',
  };
}

export function gamepadToDeviceInfo(gamepad: GamepadInfo): DeviceInfo {
  return {
    id: gamepad.id,
    type: 'gamepad',
    label: gamepad.name,
    connectionState: gamepad.connected ? 'connected' : 'disconnected',
    permissionState: 'granted',
  };
}

export function deviceKey(type: DeviceType, id: string): string {
  return `${type}:${id}`;
}

export function withConnectionState(
  device: DeviceInfo,
  connectionState: DeviceConnectionState,
): DeviceInfo {
  return { ...device, connectionState };
}

function compactCapabilities(capabilities: DeviceCapabilities): DeviceCapabilities | undefined {
  const entries = Object.entries(capabilities).filter(([, value]) => {
    return Array.isArray(value) ? value.length > 0 : value !== undefined;
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
