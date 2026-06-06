import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ContentIngestRequest, ContentIngestResult } from '@neko/shared';
import { sendGeneratedAssetToPlugin, type PluginTransferBridgeDeps } from './pluginTransferBridge';

vi.mock('vscode', async () => await import('../__mocks__/vscode'));

describe('PluginTransferBridge', () => {
  it('promotes legacy assetPath Canvas transfers into stable single-asset payloads', async () => {
    const executeCommand = vi.fn().mockResolvedValue(undefined);

    await sendGeneratedAssetToPlugin(
      'canvas',
      '/tmp/legacy-frame.png',
      'image',
      undefined,
      createDeps({
        ingest: async (request) =>
          createGeneratedIngestResult(request, {
            outputPath: '/workspace/.neko/.cache/generated/image/legacy-frame.png',
            contractedPath: '${WORKSPACE}/.neko/.cache/generated/image/legacy-frame.png',
          }),
        executeCommand,
      }),
    );

    expect(executeCommand).toHaveBeenCalledWith(
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/.neko/.cache/generated/image/legacy-frame.png',
        type: 'image',
        resourceRef: expect.objectContaining({
          source: expect.objectContaining({
            filePath: '${WORKSPACE}/.neko/.cache/generated/image/legacy-frame.png',
          }),
        }),
      }),
    );
  });

  it('promotes Agent generated images before sending them to Canvas', async () => {
    const ingestCalls: ContentIngestRequest[] = [];
    const executeCommand = vi.fn().mockResolvedValue({ ok: true });

    const result = await sendGeneratedAssetToPlugin(
      'canvas',
      undefined,
      undefined,
      {
        kind: 'singleAsset',
        asset: {
          path: '/tmp/agent-private/shot.png',
          mediaType: 'image',
          name: 'shot.png',
        },
      },
      createDeps({
        ingest: async (request) => {
          ingestCalls.push(request);
          return createGeneratedIngestResult(request, {
            outputPath: '/workspace/.neko/.cache/generated/image/shot.png',
            contractedPath: '${WORKSPACE}/.neko/.cache/generated/image/shot.png',
          });
        },
        executeCommand,
      }),
    );

    expect(result.success).toBe(true);
    expect(ingestCalls).toHaveLength(1);
    expect(ingestCalls[0]).toMatchObject({
      mode: 'generated-output',
      sourcePath: '/tmp/agent-private/shot.png',
      destination: {
        kind: 'generated-assets',
        directory: '/workspace/.neko/.cache/generated/image',
      },
      fileName: 'shot.png',
      mimeType: 'image/png',
    });
    expect(executeCommand).toHaveBeenCalledWith(
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/.neko/.cache/generated/image/shot.png',
        resourceRef: expect.objectContaining({
          provider: 'generated-asset',
          kind: 'generated',
          source: expect.objectContaining({
            kind: 'generated-asset',
            filePath: '${WORKSPACE}/.neko/.cache/generated/image/shot.png',
          }),
        }),
      }),
    );
  });

  it('promotes every selected asset in a Canvas batch transfer independently', async () => {
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const promotedPaths: string[] = [];

    await sendGeneratedAssetToPlugin(
      'canvas',
      undefined,
      undefined,
      {
        kind: 'assetBatch',
        assets: [
          { path: '/tmp/shot-1.png', mediaType: 'image', name: 'shot-1.png' },
          { path: '/tmp/shot-2.png', mediaType: 'image', name: 'shot-2.png' },
        ],
      },
      createDeps({
        ingest: async (request) => {
          const outputPath = `/workspace/.neko/.cache/generated/image/${request.fileName}`;
          promotedPaths.push(outputPath);
          return createGeneratedIngestResult(request, {
            outputPath,
            contractedPath: `\${WORKSPACE}/.neko/.cache/generated/image/${request.fileName}`,
          });
        },
        executeCommand,
      }),
    );

    expect(promotedPaths).toEqual([
      '/workspace/.neko/.cache/generated/image/shot-1.png',
      '/workspace/.neko/.cache/generated/image/shot-2.png',
    ]);
    expect(executeCommand).toHaveBeenCalledTimes(2);
    expect(executeCommand).toHaveBeenNthCalledWith(
      1,
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/.neko/.cache/generated/image/shot-1.png',
        resourceRef: expect.objectContaining({
          source: expect.objectContaining({
            filePath: '${WORKSPACE}/.neko/.cache/generated/image/shot-1.png',
          }),
        }),
      }),
    );
    expect(executeCommand).toHaveBeenNthCalledWith(
      2,
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/.neko/.cache/generated/image/shot-2.png',
        resourceRef: expect.objectContaining({
          source: expect.objectContaining({
            filePath: '${WORKSPACE}/.neko/.cache/generated/image/shot-2.png',
          }),
        }),
      }),
    );
  });

  it('keeps existing stable refs without re-promoting', async () => {
    const ingest = vi.fn();
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const existingResourceRef = {
      id: 'res_existing',
      scope: 'project' as const,
      provider: 'generated-asset',
      kind: 'generated',
      source: {
        kind: 'generated-asset' as const,
        generatedAssetId: 'asset-existing',
        filePath: '${WORKSPACE}/.neko/.cache/generated/image/existing.png',
      },
      fingerprint: {
        strategy: 'provider' as const,
        value: 'asset-existing',
      },
    };

    await sendGeneratedAssetToPlugin(
      'canvas',
      undefined,
      undefined,
      {
        kind: 'singleAsset',
        asset: {
          path: '/workspace/.neko/.cache/generated/image/existing.png',
          mediaType: 'image',
          resourceRef: existingResourceRef,
        },
      },
      createDeps({ ingest, executeCommand }),
    );

    expect(ingest).not.toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledWith(
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/.neko/.cache/generated/image/existing.png',
        resourceRef: existingResourceRef,
      }),
    );
  });
});

function createDeps(input: {
  readonly ingest: (request: ContentIngestRequest) => Promise<ContentIngestResult>;
  readonly executeCommand: typeof vscode.commands.executeCommand;
}): PluginTransferBridgeDeps {
  return {
    workspaceRoot: '/workspace',
    ingestService: {
      registerProvider: vi.fn(),
      ingest: input.ingest,
    },
    executeCommand: input.executeCommand,
  };
}

function createGeneratedIngestResult(
  request: ContentIngestRequest,
  paths: { readonly outputPath: string; readonly contractedPath: string },
): ContentIngestResult {
  const assetId = String(request.metadata?.['assetId'] ?? 'asset');
  return {
    status: 'ready',
    request,
    providerId: 'generated-output-content-ingest',
    source: {
      kind: 'generated-asset',
      assetId,
      path: paths.contractedPath,
      promoted: true,
    },
    outputPath: paths.outputPath,
    contractedPath: paths.contractedPath,
  };
}
