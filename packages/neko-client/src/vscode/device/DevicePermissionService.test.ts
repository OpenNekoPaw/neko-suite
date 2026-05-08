import { describe, expect, it, vi } from 'vitest';
import type { DevicePermissionState } from '@neko/shared';

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: vi.fn(),
  },
  l10n: {
    t: vi.fn((key: string, ...args: unknown[]) => {
      const messages: Record<string, string> = {
        'neko.devices.permission.allow': 'Allow',
        'neko.devices.permission.deny': 'Deny',
        'neko.devices.permission.allowRemember': 'Allow and Remember',
        'neko.devices.permission.prompt': `Allow Neko Suite to use ${String(args[0])}?`,
      };
      return messages[key] ?? key;
    }),
  },
}));

import {
  DevicePermissionService,
  VSCodeDevicePermissionPrompt,
  permissionKey,
  type DevicePermissionDecision,
  type DevicePermissionPrompt,
  type DevicePermissionStore,
} from './DevicePermissionService';
import { window } from 'vscode';

function createStore(
  workspace: Record<string, DevicePermissionState> = {},
  global: Record<string, DevicePermissionState> = {},
): DevicePermissionStore {
  return {
    getGlobal: () => global,
    updateGlobal: vi.fn(async (value) => {
      global = value;
    }),
    getWorkspace: () => workspace,
    updateWorkspace: vi.fn(async (value) => {
      workspace = value;
    }),
  };
}

describe('DevicePermissionService', () => {
  it('uses workspace permission before global permission', async () => {
    const service = new DevicePermissionService(
      createStore({ [permissionKey('camera', 'cam-1')]: 'denied' }, { camera: 'granted' }),
      { ask: vi.fn(async () => 'granted') },
    );

    await expect(service.getPermission({ deviceType: 'camera', deviceId: 'cam-1' })).resolves.toBe(
      'denied',
    );
  });

  it('prompts and persists unknown sensitive permissions', async () => {
    const store = createStore();
    const prompt: DevicePermissionPrompt = { ask: vi.fn(async () => 'granted') };
    const service = new DevicePermissionService(store, prompt);
    const listener = vi.fn();
    service.onDidChange(listener);

    await expect(
      service.requestPermission({ deviceType: 'audio-input', deviceId: 'mic-1' }),
    ).resolves.toBe('granted');

    expect(prompt.ask).toHaveBeenCalledWith({ deviceType: 'audio-input', deviceId: 'mic-1' });
    expect(store.updateWorkspace).toHaveBeenCalledWith({ 'audio-input:mic-1': 'granted' });
    expect(listener).toHaveBeenCalledWith({
      deviceType: 'audio-input',
      deviceId: 'mic-1',
      state: 'granted',
    });
  });

  it('persists remembered permissions globally', async () => {
    const store = createStore();
    const prompt: DevicePermissionPrompt = {
      ask: vi.fn(
        async (): Promise<DevicePermissionDecision> => ({ state: 'granted', scope: 'global' }),
      ),
    };
    const service = new DevicePermissionService(store, prompt);
    const listener = vi.fn();
    service.onDidChange(listener);

    await expect(
      service.requestPermission({ deviceType: 'camera', deviceId: 'cam-1' }),
    ).resolves.toBe('granted');

    expect(store.updateGlobal).toHaveBeenCalledWith({ 'camera:cam-1': 'granted' });
    expect(store.updateWorkspace).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith({
      deviceType: 'camera',
      deviceId: 'cam-1',
      state: 'granted',
    });
  });

  it('revokes by writing denied and notifying listeners', async () => {
    const store = createStore({ 'camera:cam-1': 'granted' });
    const service = new DevicePermissionService(store, { ask: vi.fn(async () => 'granted') });
    const listener = vi.fn();
    service.onDidChange(listener);

    await service.revoke('camera', 'cam-1');

    expect(store.updateWorkspace).toHaveBeenCalledWith({ 'camera:cam-1': 'denied' });
    expect(listener).toHaveBeenCalledWith({
      deviceType: 'camera',
      deviceId: 'cam-1',
      state: 'denied',
    });
  });
});

describe('VSCodeDevicePermissionPrompt', () => {
  it('maps Allow and Remember to global persistence', async () => {
    vi.mocked(window.showWarningMessage).mockResolvedValueOnce('Allow and Remember' as never);
    const prompt = new VSCodeDevicePermissionPrompt();

    await expect(prompt.ask({ deviceType: 'camera', deviceId: 'cam-1' })).resolves.toEqual({
      state: 'granted',
      scope: 'global',
    });
  });

  it('maps Allow to workspace persistence', async () => {
    vi.mocked(window.showWarningMessage).mockResolvedValueOnce('Allow' as never);
    const prompt = new VSCodeDevicePermissionPrompt();

    await expect(prompt.ask({ deviceType: 'audio-input', deviceId: 'mic-1' })).resolves.toEqual({
      state: 'granted',
      scope: 'workspace',
    });
  });
});
