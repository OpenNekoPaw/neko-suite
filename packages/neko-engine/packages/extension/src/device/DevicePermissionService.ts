import * as vscode from 'vscode';
import { DevicePermissionError } from '@neko/shared';
import type {
  DevicePermissionRequest,
  DevicePermissionState,
  DeviceType,
  DisposableLike,
} from '@neko/shared';

const GLOBAL_KEY = 'neko.devices.permissions.global';
const WORKSPACE_KEY = 'neko.devices.permissions.workspace';

export interface DevicePermissionChangeEvent {
  readonly deviceType: DeviceType;
  readonly deviceId?: string;
  readonly state: DevicePermissionState;
}

export type DevicePermissionPersistenceScope = 'workspace' | 'global';

export interface DevicePermissionDecision {
  readonly state: DevicePermissionState;
  readonly scope?: DevicePermissionPersistenceScope;
}

export interface DevicePermissionStore {
  getGlobal(): Record<string, DevicePermissionState> | undefined;
  updateGlobal(value: Record<string, DevicePermissionState>): Thenable<void>;
  getWorkspace(): Record<string, DevicePermissionState> | undefined;
  updateWorkspace(value: Record<string, DevicePermissionState>): Thenable<void>;
}

export interface DevicePermissionPrompt {
  ask(request: DevicePermissionRequest): Promise<DevicePermissionState | DevicePermissionDecision>;
}

export class VSCodeDevicePermissionStore implements DevicePermissionStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getGlobal(): Record<string, DevicePermissionState> | undefined {
    return this.context.globalState.get<Record<string, DevicePermissionState>>(GLOBAL_KEY);
  }

  updateGlobal(value: Record<string, DevicePermissionState>): Thenable<void> {
    return this.context.globalState.update(GLOBAL_KEY, value);
  }

  getWorkspace(): Record<string, DevicePermissionState> | undefined {
    return this.context.workspaceState.get<Record<string, DevicePermissionState>>(WORKSPACE_KEY);
  }

  updateWorkspace(value: Record<string, DevicePermissionState>): Thenable<void> {
    return this.context.workspaceState.update(WORKSPACE_KEY, value);
  }
}

export class VSCodeDevicePermissionPrompt implements DevicePermissionPrompt {
  async ask(request: DevicePermissionRequest): Promise<DevicePermissionDecision> {
    const label = request.deviceId
      ? `${request.deviceType} (${request.deviceId})`
      : request.deviceType;
    const allow = 'Allow';
    const deny = 'Deny';
    const remember = 'Allow and Remember';
    const picked = await vscode.window.showWarningMessage(
      `Allow Neko Suite to use ${label}?`,
      { modal: true },
      allow,
      remember,
      deny,
    );
    if (picked === allow) {
      return { state: 'granted', scope: 'workspace' };
    }
    if (picked === remember) {
      return { state: 'granted', scope: 'global' };
    }
    if (picked === deny) {
      return { state: 'denied', scope: 'workspace' };
    }
    return { state: 'denied', scope: 'workspace' };
  }
}

export class DevicePermissionService {
  private readonly listeners = new Set<(event: DevicePermissionChangeEvent) => void>();

  constructor(
    private readonly store: DevicePermissionStore,
    private readonly prompt: DevicePermissionPrompt,
  ) {}

  async getPermission(request: DevicePermissionRequest): Promise<DevicePermissionState> {
    return (
      this.lookup(this.store.getWorkspace(), request) ??
      this.lookup(this.store.getGlobal(), request) ??
      defaultPermissionForType(request.deviceType)
    );
  }

  async requestPermission(request: DevicePermissionRequest): Promise<DevicePermissionState> {
    const current = await this.getPermission(request);
    if (current === 'granted' || current === 'denied') {
      return current;
    }
    const decision = normalizeDecision(await this.prompt.ask(request));
    if (decision.scope === 'global') {
      await this.setGlobalPermission(request, decision.state);
    } else {
      await this.setWorkspacePermission(request, decision.state);
    }
    return decision.state;
  }

  async requirePermission(request: DevicePermissionRequest): Promise<void> {
    const state = await this.requestPermission(request);
    if (state !== 'granted') {
      throw new DevicePermissionError(request.deviceType, request.deviceId);
    }
  }

  async revoke(deviceType: DeviceType, deviceId?: string): Promise<void> {
    await this.setWorkspacePermission({ deviceType, deviceId }, 'denied');
  }

  onDidChange(listener: (event: DevicePermissionChangeEvent) => void): DisposableLike {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  dispose(): void {
    this.listeners.clear();
  }

  private async setWorkspacePermission(
    request: DevicePermissionRequest,
    state: DevicePermissionState,
  ): Promise<void> {
    const next = { ...(this.store.getWorkspace() ?? {}) };
    next[permissionKey(request.deviceType, request.deviceId)] = state;
    await this.store.updateWorkspace(next);
    this.emit({ deviceType: request.deviceType, deviceId: request.deviceId, state });
  }

  private async setGlobalPermission(
    request: DevicePermissionRequest,
    state: DevicePermissionState,
  ): Promise<void> {
    const next = { ...(this.store.getGlobal() ?? {}) };
    next[permissionKey(request.deviceType, request.deviceId)] = state;
    await this.store.updateGlobal(next);
    this.emit({ deviceType: request.deviceType, deviceId: request.deviceId, state });
  }

  private lookup(
    entries: Record<string, DevicePermissionState> | undefined,
    request: DevicePermissionRequest,
  ): DevicePermissionState | undefined {
    if (!entries) return undefined;
    return (
      entries[permissionKey(request.deviceType, request.deviceId)] ?? entries[request.deviceType]
    );
  }

  private emit(event: DevicePermissionChangeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export function permissionKey(deviceType: DeviceType, deviceId?: string): string {
  return deviceId ? `${deviceType}:${deviceId}` : deviceType;
}

function normalizeDecision(
  decision: DevicePermissionState | DevicePermissionDecision,
): Required<DevicePermissionDecision> {
  if (typeof decision === 'string') {
    return { state: decision, scope: 'workspace' };
  }
  return { state: decision.state, scope: decision.scope ?? 'workspace' };
}

function defaultPermissionForType(deviceType: DeviceType): DevicePermissionState {
  return deviceType === 'audio-input' || deviceType === 'camera' || deviceType === 'xr'
    ? 'unknown'
    : 'granted';
}
