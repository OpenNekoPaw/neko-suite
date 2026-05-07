import * as vscode from 'vscode';
import type { DeviceInfo, DeviceSession, DeviceType, ILogger } from '@neko/shared';
import type { DeviceManager, EngineClient } from '@neko/neko-client';
import { RecordingService, type RecordingOptions, type RecordingResult } from './RecordingService';

export type LiveAvatarType = 'vrm' | 'puppet';
export type LiveDeviceRole = 'camera' | 'audio-input' | 'midi-input' | 'gamepad';

export interface LiveSceneSnapshot {
  readonly avatarUri?: string;
  readonly avatarType?: LiveAvatarType;
  readonly trackingMode?: string;
}

export interface LiveDeviceBinding {
  readonly role: LiveDeviceRole;
  readonly deviceId: string;
  readonly deviceType: DeviceType;
  readonly label: string;
  readonly sessionId?: string;
  readonly streamUrl?: string;
}

export interface LiveSessionSnapshot {
  readonly scene: LiveSceneSnapshot;
  readonly recording: {
    readonly active: boolean;
  };
  readonly deviceBindings: Partial<Record<LiveDeviceRole, LiveDeviceBinding>>;
}

export type LiveScenePatch = Partial<LiveSceneSnapshot>;

export type LiveSessionEvent =
  | { type: 'snapshot'; snapshot: LiveSessionSnapshot }
  | { type: 'recordingProgress'; elapsedMs: number }
  | { type: 'deviceBindingChanged'; role: LiveDeviceRole; binding?: LiveDeviceBinding };

export interface LiveSessionServiceConfig {
  readonly logger: ILogger;
  readonly getEngineClient: () => Promise<EngineClient | undefined>;
  readonly getDeviceManager: () => DeviceManager | undefined;
  readonly ensureDeviceManager: () => Promise<DeviceManager | undefined>;
}

const ROLE_DEVICE_TYPES: Record<LiveDeviceRole, DeviceType> = {
  camera: 'camera',
  'audio-input': 'audio-input',
  'midi-input': 'midi-input',
  gamepad: 'gamepad',
};

export class LiveSessionService implements vscode.Disposable {
  private recordingService: RecordingService | undefined;
  private readonly listeners = new Set<(event: LiveSessionEvent) => void>();
  private snapshot: LiveSessionSnapshot = {
    scene: {},
    recording: { active: false },
    deviceBindings: {},
  };

  constructor(private readonly config: LiveSessionServiceConfig) {}

  getSnapshot(): LiveSessionSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  updateScene(patch: LiveScenePatch): LiveSessionSnapshot {
    this.snapshot = {
      ...this.snapshot,
      scene: {
        ...this.snapshot.scene,
        ...patch,
      },
    };
    this.emit({ type: 'snapshot', snapshot: this.getSnapshot() });
    return this.getSnapshot();
  }

  async startRecording(options: RecordingOptions): Promise<void> {
    const client = await this.config.getEngineClient();
    this.recordingService?.dispose();
    this.recordingService = new RecordingService(
      client,
      (elapsedMs) => this.emit({ type: 'recordingProgress', elapsedMs }),
      this.config.logger,
    );
    await this.recordingService.start(options);
    this.snapshot = {
      ...this.snapshot,
      recording: { active: true },
    };
    this.emit({ type: 'snapshot', snapshot: this.getSnapshot() });
  }

  async stopRecording(): Promise<RecordingResult> {
    if (!this.recordingService) return {};

    const result = await this.recordingService.stop();
    this.recordingService = undefined;
    this.snapshot = {
      ...this.snapshot,
      recording: { active: false },
    };
    this.emit({ type: 'snapshot', snapshot: this.getSnapshot() });
    return result;
  }

  bindDevice(role: LiveDeviceRole, device: DeviceInfo, session?: DeviceSession): LiveDeviceBinding {
    this.assertRoleMatchesDevice(role, device);
    const binding: LiveDeviceBinding = {
      role,
      deviceId: device.id,
      deviceType: device.type,
      label: device.label,
      sessionId: session?.sessionId,
      streamUrl: session?.streamUrl,
    };
    this.snapshot = {
      ...this.snapshot,
      deviceBindings: {
        ...this.snapshot.deviceBindings,
        [role]: binding,
      },
    };
    this.emit({ type: 'deviceBindingChanged', role, binding });
    this.emit({ type: 'snapshot', snapshot: this.getSnapshot() });
    return binding;
  }

  async startDeviceStream(role: LiveDeviceRole, device: DeviceInfo): Promise<DeviceSession> {
    this.assertRoleMatchesDevice(role, device);
    await this.stopDeviceStream(role);
    const manager = await this.ensureDeviceManager();
    const session = await manager.connect(device.id);
    this.bindDevice(role, device, session);
    return session;
  }

  async stopDeviceStream(role: LiveDeviceRole): Promise<void> {
    const binding = this.snapshot.deviceBindings[role];
    if (binding?.sessionId) {
      const manager = this.requireDeviceManager();
      await manager.disconnect(binding.sessionId);
    }
    this.clearDeviceBinding(role);
  }

  onDidChange(listener: (event: LiveSessionEvent) => void): vscode.Disposable {
    this.listeners.add(listener);
    return new vscode.Disposable(() => {
      this.listeners.delete(listener);
    });
  }

  dispose(): void {
    this.recordingService?.dispose();
    this.recordingService = undefined;
    this.snapshot = {
      ...this.snapshot,
      recording: { active: false },
      deviceBindings: {},
    };
    this.listeners.clear();
  }

  private clearDeviceBinding(role: LiveDeviceRole): void {
    if (!this.snapshot.deviceBindings[role]) return;
    const deviceBindings = { ...this.snapshot.deviceBindings };
    delete deviceBindings[role];
    this.snapshot = { ...this.snapshot, deviceBindings };
    this.emit({ type: 'deviceBindingChanged', role });
    this.emit({ type: 'snapshot', snapshot: this.getSnapshot() });
  }

  private assertRoleMatchesDevice(role: LiveDeviceRole, device: DeviceInfo): void {
    const expected = ROLE_DEVICE_TYPES[role];
    if (device.type !== expected) {
      throw new Error(`Device role ${role} requires ${expected}, got ${device.type}`);
    }
  }

  private requireDeviceManager(): DeviceManager {
    const manager = this.config.getDeviceManager();
    if (!manager) {
      throw new Error('Device manager is not available');
    }
    return manager;
  }

  private async ensureDeviceManager(): Promise<DeviceManager> {
    const manager = await this.config.ensureDeviceManager();
    if (!manager) {
      throw new Error('Device manager is not available');
    }
    return manager;
  }

  private emit(event: LiveSessionEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function cloneSnapshot(snapshot: LiveSessionSnapshot): LiveSessionSnapshot {
  return {
    scene: { ...snapshot.scene },
    recording: { ...snapshot.recording },
    deviceBindings: { ...snapshot.deviceBindings },
  };
}
