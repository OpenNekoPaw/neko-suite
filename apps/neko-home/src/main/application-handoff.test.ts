import { describe, expect, it, vi } from 'vitest';
import { parseNekoApplicationHandoffRequest } from '@neko/host/application';
import {
  createHomeAigcProfessionalToolHandoffRequest,
  createHomeApplicationHandoffPort,
} from './application-handoff';
import type { HomeAigcGeneratedOutput } from './home-aigc-lifecycle';

describe('Home application handoff', () => {
  it('opens the registered VSCode tool with stable workspace identity', async () => {
    const openExternal = vi.fn(async (_uri: string) => undefined);
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

  it('hands off stable Resource/Artifact/Task identity without a cache path', async () => {
    const openExternal = vi.fn(async (_uri: string) => undefined);
    const port = createHomeApplicationHandoffPort({ openExternal });
    const request = createHomeAigcProfessionalToolHandoffRequest({
      requestId: 'request-output-1',
      source: {
        schemaVersion: 1,
        applicationId: 'neko-home',
        instanceId: 'home-1',
        version: '0.0.1',
      },
      workspaceId: 'personal',
      editorId: 'neko-canvas',
      output: createOutput(),
    });
    await port.handoff(request);

    const uri = String(openExternal.mock.calls[0]?.[0]);
    const payload = JSON.parse(decodeURIComponent(uri.split('handoff=')[1] ?? ''));
    expect(payload).toMatchObject({
      resourceId: 'resource-output-1',
      artifactId: 'artifact-output-1',
      taskId: 'task-1',
      editorId: 'neko-canvas',
    });
    expect(uri).not.toContain('.neko/cache');
    expect(uri).not.toContain('vscode-webview');
  });

  it('rejects runtime-only handoff identity', async () => {
    const port = createHomeApplicationHandoffPort({ openExternal: vi.fn(async () => undefined) });
    const request = parseNekoApplicationHandoffRequest({
      schemaVersion: 1,
      requestId: 'request-runtime-ref',
      source: {
        schemaVersion: 1,
        applicationId: 'neko-home',
        instanceId: 'home-1',
        version: '0.0.1',
      },
      target: {
        toolId: 'neko-vscode',
        workspaceId: 'personal',
        resourceId: 'preview://session-output',
      },
    });
    await expect(port.handoff(request)).rejects.toThrow('runtime projection');
  });
});

function createOutput(): HomeAigcGeneratedOutput {
  return {
    outputId: 'output-1',
    taskId: 'task-1',
    runId: 'run-1',
    resourceRef: {
      id: 'resource-output-1',
      scope: 'project',
      provider: 'generated-output',
      kind: 'generated',
      source: { kind: 'generated-asset', generatedAssetId: 'generated-output-1' },
      fingerprint: { strategy: 'hash', value: 'sha256:output-1' },
    },
    artifact: {
      schemaVersion: 1,
      kind: 'composite-artifact',
      artifactId: 'artifact-output-1',
      title: 'Output',
      blocks: [],
      provenance: { source: 'tool', taskId: 'task-1' },
    },
    validation: { ok: true, diagnostics: [] },
  };
}
