import { DevicePermissionError } from '@neko/shared';
import type {
  DeviceEvent,
  DeviceCapabilities,
  DeviceInfo,
  DeviceResolutionCapability,
  DevicePermissionRequest,
  DevicePermissionState,
  DeviceSession,
  DeviceType,
  DisposableLike,
} from '@neko/shared';
import {
  audioInputToDeviceInfo,
  cameraToDeviceInfo,
  deviceKey,
  gamepadToDeviceInfo,
  midiPortToDeviceInfo,
  withConnectionState,
} from './adapters';
import type {
  DeviceConnectOptions,
  DeviceEngineClient,
  DeviceManager,
  DeviceManagerConfig,
  DevicePermissionPolicy,
  DeviceSnapshotDelta,
} from './types';

const DEFAULT_PERMISSION_POLICY: DevicePermissionPolicy = {
  getPermission: async ({ deviceType }) => defaultPermissionForType(deviceType),
  requestPermission: async ({ deviceType }) => defaultPermissionForType(deviceType),
};

export class EngineDeviceManager implements DeviceManager {
  private readonly engine: DeviceEngineClient;
  private readonly permissionPolicy: DevicePermissionPolicy;
  private readonly devices = new Map<string, DeviceInfo>();
  private readonly sessions = new Map<string, DeviceSession>();
  private readonly listeners = new Set<(event: DeviceEvent) => void>();

  constructor(config: DeviceManagerConfig) {
    this.engine = config.engine;
    this.permissionPolicy = config.permissionPolicy ?? DEFAULT_PERMISSION_POLICY;
  }

  async refresh(signal?: AbortSignal): Promise<readonly DeviceInfo[]> {
    signal?.throwIfAborted();
    const next = new Map<string, DeviceInfo>();

    await Promise.all([
      this.addAudioInputs(next, signal),
      this.addCameras(next, signal),
      this.addMidiPorts(next, signal),
      this.addGamepads(next, signal),
    ]);

    const delta = diffSnapshots(this.devices, next);
    this.devices.clear();
    for (const [key, value] of next.entries()) {
      this.devices.set(key, value);
    }
    this.emitDelta(delta);
    return this.list();
  }

  list(type?: DeviceType): readonly DeviceInfo[] {
    const devices = [...this.devices.values()];
    return type ? devices.filter((device) => device.type === type) : devices;
  }

  async requestPermission(type: DeviceType, deviceId?: string): Promise<DevicePermissionState> {
    const state = await this.permissionPolicy.requestPermission({ deviceType: type, deviceId });
    if (deviceId) {
      this.updatePermissionState(type, deviceId, state);
    }
    return state;
  }

  async connect(deviceId: string, options: DeviceConnectOptions = {}): Promise<DeviceSession> {
    const device = this.findDevice(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    await this.ensureGranted({ deviceType: device.type, deviceId: device.id });

    switch (device.type) {
      case 'audio-input':
        return this.connectAudioInput(device, options);
      case 'camera':
        return this.connectCamera(device, options);
      case 'midi-input':
        return this.connectMidi(device);
      case 'gamepad':
        return this.connectGamepad(device);
      case 'xr':
        throw new Error('XR device sessions are not implemented');
      default:
        return assertNeverDevice(device.type);
    }
  }

  async disconnect(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    switch (session.deviceType) {
      case 'audio-input':
        await this.engine.recordStop(session.sessionId);
        break;
      case 'camera':
        await this.engine.stopCameraCapture(session.sessionId);
        break;
      case 'midi-input':
        await this.engine.disconnectMidi(session.sessionId);
        break;
      case 'gamepad':
        await this.engine.disconnectGamepad(session.sessionId);
        break;
      case 'xr':
        break;
      default:
        assertNeverDevice(session.deviceType);
    }

    this.sessions.delete(sessionId);
    this.updateConnectionState(session.deviceType, session.deviceId, 'available');
  }

  onDeviceChange(listener: (event: DeviceEvent) => void): DisposableLike {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  dispose(): void {
    this.listeners.clear();
    this.devices.clear();
    this.sessions.clear();
  }

  private async addAudioInputs(
    target: Map<string, DeviceInfo>,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const devices = await this.engine.listInputDevices();
    signal?.throwIfAborted();
    await Promise.all(
      devices.map(async (device) => {
        const permissionState = await this.permissionPolicy.getPermission({
          deviceType: 'audio-input',
          deviceId: device.id,
        });
        target.set(
          deviceKey('audio-input', device.id),
          audioInputToDeviceInfo(device, permissionState),
        );
      }),
    );
  }

  private async addCameras(
    target: Map<string, DeviceInfo>,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const devices = await this.engine.listCameraDevices();
    signal?.throwIfAborted();
    await Promise.all(
      devices.map(async (device) => {
        const permissionState = await this.permissionPolicy.getPermission({
          deviceType: 'camera',
          deviceId: device.id,
        });
        target.set(deviceKey('camera', device.id), cameraToDeviceInfo(device, permissionState));
      }),
    );
  }

  private async addMidiPorts(
    target: Map<string, DeviceInfo>,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const ports = await this.engine.listMidiPorts();
    signal?.throwIfAborted();
    for (const port of ports) {
      target.set(deviceKey('midi-input', port.id), midiPortToDeviceInfo(port));
    }
  }

  private async addGamepads(
    target: Map<string, DeviceInfo>,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const gamepads = await this.engine.listGamepads();
    signal?.throwIfAborted();
    for (const gamepad of gamepads) {
      target.set(deviceKey('gamepad', gamepad.id), gamepadToDeviceInfo(gamepad));
    }
  }

  private async ensureGranted(request: DevicePermissionRequest): Promise<void> {
    let state = await this.permissionPolicy.getPermission(request);
    if (state === 'unknown') {
      state = await this.permissionPolicy.requestPermission(request);
    }
    if (state !== 'granted') {
      throw new DevicePermissionError(request.deviceType, request.deviceId);
    }
    if (request.deviceId) {
      this.updatePermissionState(request.deviceType, request.deviceId, state);
    }
  }

  private async connectAudioInput(
    device: DeviceInfo,
    options: DeviceConnectOptions,
  ): Promise<DeviceSession> {
    if (!options.outputPath) {
      throw new Error('outputPath is required to start an audio input session');
    }
    const result = await this.engine.recordStart({
      outputPath: options.outputPath,
      deviceId: device.id,
      sampleRate: options.sampleRate,
      channels: options.channels,
    });
    return this.registerSession(device, result.streamId, result.monitorUrl);
  }

  private async connectCamera(
    device: DeviceInfo,
    options: DeviceConnectOptions,
  ): Promise<DeviceSession> {
    const result = await this.engine.startCameraCapture({
      deviceId: device.id,
      resolutionWidth: options.resolutionWidth,
      resolutionHeight: options.resolutionHeight,
      fps: options.fps,
    });
    return this.registerSession(device, result.streamId, result.wsUrl);
  }

  private async connectMidi(device: DeviceInfo): Promise<DeviceSession> {
    const result = await this.engine.connectMidi(device.id);
    return this.registerSession(device, result.streamId, result.wsUrl);
  }

  private async connectGamepad(device: DeviceInfo): Promise<DeviceSession> {
    const result = await this.engine.connectGamepad(device.id);
    return this.registerSession(device, result.streamId, result.wsUrl);
  }

  private registerSession(
    device: DeviceInfo,
    sessionId: string,
    streamUrl?: string,
  ): DeviceSession {
    const session: DeviceSession = {
      sessionId,
      deviceId: device.id,
      deviceType: device.type,
      streamUrl,
    };
    this.sessions.set(sessionId, session);
    this.updateConnectionState(device.type, device.id, 'connected');
    return session;
  }

  private findDevice(deviceId: string): DeviceInfo | undefined {
    const exact = [...this.devices.values()].filter((device) => device.id === deviceId);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) {
      throw new Error(`Device id is ambiguous across device types: ${deviceId}`);
    }
    return undefined;
  }

  private updatePermissionState(
    type: DeviceType,
    deviceId: string,
    state: DevicePermissionState,
  ): void {
    const key = deviceKey(type, deviceId);
    const device = this.devices.get(key);
    if (!device) return;
    const next = { ...device, permissionState: state };
    this.devices.set(key, next);
    this.emit({ type: 'permissionChanged', deviceId, state });
    this.emit({ type: 'changed', device: next });
  }

  private updateConnectionState(
    type: DeviceType,
    deviceId: string,
    connectionState: DeviceInfo['connectionState'],
  ): void {
    const key = deviceKey(type, deviceId);
    const device = this.devices.get(key);
    if (!device) return;
    const next = withConnectionState(device, connectionState);
    this.devices.set(key, next);
    this.emit({ type: 'changed', device: next });
  }

  private emitDelta(delta: DeviceSnapshotDelta): void {
    for (const device of delta.added) {
      this.emit({ type: 'added', device });
    }
    for (const device of delta.changed) {
      this.emit({ type: 'changed', device });
    }
    for (const removed of delta.removed) {
      this.emit({ type: 'removed', ...removed });
    }
  }

  private emit(event: DeviceEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function defaultPermissionForType(type: DeviceType): DevicePermissionState {
  return type === 'audio-input' || type === 'camera' || type === 'xr' ? 'unknown' : 'granted';
}

function diffSnapshots(
  current: ReadonlyMap<string, DeviceInfo>,
  next: ReadonlyMap<string, DeviceInfo>,
): DeviceSnapshotDelta {
  const added: DeviceInfo[] = [];
  const changed: DeviceInfo[] = [];
  const removed: Array<{ deviceId: string; deviceType: DeviceType }> = [];

  for (const [key, nextDevice] of next.entries()) {
    const currentDevice = current.get(key);
    if (!currentDevice) {
      added.push(nextDevice);
    } else if (!deviceEquals(currentDevice, nextDevice)) {
      changed.push(nextDevice);
    }
  }

  for (const [key, currentDevice] of current.entries()) {
    if (!next.has(key)) {
      removed.push({ deviceId: currentDevice.id, deviceType: currentDevice.type });
    }
  }

  return { added, changed, removed };
}

function deviceEquals(left: DeviceInfo, right: DeviceInfo): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.label === right.label &&
    left.connectionState === right.connectionState &&
    left.permissionState === right.permissionState &&
    left.isDefault === right.isDefault &&
    left.errorMessage === right.errorMessage &&
    capabilitiesEquals(left.capabilities, right.capabilities)
  );
}

function capabilitiesEquals(
  left: DeviceCapabilities | undefined,
  right: DeviceCapabilities | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    arrayEquals(left.sampleRates, right.sampleRates, numberEquals) &&
    arrayEquals(left.channels, right.channels, numberEquals) &&
    arrayEquals(left.controls, right.controls, stringEquals) &&
    arrayEquals(left.resolutions, right.resolutions, resolutionEquals)
  );
}

function resolutionEquals(
  left: DeviceResolutionCapability,
  right: DeviceResolutionCapability,
): boolean {
  return (
    left.width === right.width &&
    left.height === right.height &&
    arrayEquals(left.fps, right.fps, numberEquals)
  );
}

function arrayEquals<T>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined,
  itemEquals: (left: T, right: T) => boolean,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  for (const [index, leftItem] of left.entries()) {
    const rightItem = right[index];
    if (rightItem === undefined || !itemEquals(leftItem, rightItem)) {
      return false;
    }
  }
  return true;
}

function numberEquals(left: number, right: number): boolean {
  return left === right;
}

function stringEquals(left: string, right: string): boolean {
  return left === right;
}

function assertNeverDevice(value: never): never {
  throw new Error(`Unsupported device type: ${String(value)}`);
}
