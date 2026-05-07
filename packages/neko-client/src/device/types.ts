import type {
  DeviceConnectionState,
  DeviceEvent,
  DeviceInfo,
  DevicePermissionRequest,
  DevicePermissionState,
  DeviceSession,
  DeviceType,
  DisposableLike,
} from '@neko/shared';
import type {
  AudioInputDevice,
  CameraCaptureOptions,
  CameraDevice,
  GamepadConnectResult,
  GamepadInfo,
  MidiConnectResult,
  MidiPort,
  RecordStartResult,
  StreamHandle,
} from '../engine/types';

export type {
  DeviceConnectionState,
  DeviceEvent,
  DeviceInfo,
  DevicePermissionRequest,
  DevicePermissionState,
  DeviceSession,
  DeviceType,
  DisposableLike,
};

export interface DeviceEngineClient {
  listInputDevices(): Promise<AudioInputDevice[]>;
  recordStart(options: {
    outputPath: string;
    deviceId?: string;
    sampleRate?: number;
    channels?: number;
  }): Promise<RecordStartResult>;
  recordStop(streamId: string): Promise<unknown>;
  listCameraDevices(): Promise<CameraDevice[]>;
  startCameraCapture(options?: CameraCaptureOptions): Promise<StreamHandle>;
  stopCameraCapture(streamId: string): Promise<void>;
  listMidiPorts(): Promise<MidiPort[]>;
  connectMidi(portId: string): Promise<MidiConnectResult>;
  disconnectMidi(streamId: string): Promise<void>;
  listGamepads(): Promise<GamepadInfo[]>;
  connectGamepad(gamepadId: string): Promise<GamepadConnectResult>;
  disconnectGamepad(streamId: string): Promise<void>;
}

export interface DevicePermissionPolicy {
  getPermission(request: DevicePermissionRequest): Promise<DevicePermissionState>;
  requestPermission(request: DevicePermissionRequest): Promise<DevicePermissionState>;
}

export interface DeviceManagerConfig {
  engine: DeviceEngineClient;
  permissionPolicy?: DevicePermissionPolicy;
}

export interface DeviceConnectOptions {
  outputPath?: string;
  sampleRate?: number;
  channels?: number;
  resolutionWidth?: number;
  resolutionHeight?: number;
  fps?: number;
}

export interface DeviceManager {
  refresh(signal?: AbortSignal): Promise<readonly DeviceInfo[]>;
  list(type?: DeviceType): readonly DeviceInfo[];
  requestPermission(type: DeviceType, deviceId?: string): Promise<DevicePermissionState>;
  connect(deviceId: string, options?: DeviceConnectOptions): Promise<DeviceSession>;
  disconnect(sessionId: string): Promise<void>;
  onDeviceChange(listener: (event: DeviceEvent) => void): DisposableLike;
  dispose(): void;
}

export interface DeviceSnapshotDelta {
  added: DeviceInfo[];
  changed: DeviceInfo[];
  removed: Array<{ deviceId: string; deviceType: DeviceType }>;
}

export interface DeviceWebSocketLike {
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  close(code?: number, reason?: string): void;
}

export type DeviceWebSocketFactory = (url: string) => DeviceWebSocketLike;

export interface DeviceStreamClientConfig<TEvent> {
  url: string;
  webSocketFactory?: DeviceWebSocketFactory;
  onEvent?: (event: TEvent) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export interface MidiEvent {
  timestampUs: number;
  kind: string;
  channel: number;
  data1: number;
  data2: number;
  status: number;
}

export interface GamepadEvent {
  timestampUs: number;
  gamepadId: string;
  kind: string;
  button?: string;
  axis?: string;
  value: number;
}
