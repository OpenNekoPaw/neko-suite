import { describe, expect, it, vi } from 'vitest';
import { parseNekoApplicationHandoffRequest } from '@neko/host/application';
import { createHomeApplicationHandoffPort } from './application-handoff';

describe('Home application handoff', () => {
  it('opens the registered VSCode tool with stable workspace identity', async () => {
    const openExternal = vi.fn(async () => undefined);
    const port = createHomeApplicationHandoffPort({ openExternal });
    const request = parseNekoApplicationHandoffRequest({
      schemaVersion: 1,
      requestId: 'request-1',
      source: {
        schemaVersion: 1,
        applicationId: 'neko-home',
        instanceId: 'home-1',
        version: '0.0.1',
      },
      target: { toolId: 'neko-vscode', workspaceId: 'personal' },
    });
    await expect(port.handoff(request)).resolves.toEqual({ accepted: true, requestId: 'request-1' });
    expect(openExternal).toHaveBeenCalledWith(expect.stringContaining('workspaceId'));
  });

  it('rejects unregistered professional tools', async () => {
    const port = createHomeApplicationHandoffPort({ openExternal: vi.fn(async () => undefined) });
    const request = parseNekoApplicationHandoffRequest({
      schemaVersion: 1,
      requestId: 'request-2',
      source: {
        schemaVersion: 1,
        applicationId: 'neko-home',
        instanceId: 'home-1',
        version: '0.0.1',
      },
      target: { toolId: 'unknown-editor', workspaceId: 'personal' },
    });
    await expect(port.handoff(request)).rejects.toThrow('not registered');
  });
});
