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
            outputPath: '/workspace/neko/generated/image/legacy-frame.png',
            contractedPath: '${WORKSPACE}/neko/generated/image/legacy-frame.png',
          }),
        executeCommand,
      }),
    );

    expect(executeCommand).toHaveBeenCalledWith(
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/neko/generated/image/legacy-frame.png',
        type: 'image',
        resourceRef: expect.objectContaining({
          source: expect.objectContaining({
            filePath: '${WORKSPACE}/neko/generated/image/legacy-frame.png',
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
            outputPath: '/workspace/neko/generated/image/shot.png',
            contractedPath: '${WORKSPACE}/neko/generated/image/shot.png',
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
        directory: '/workspace/neko/generated/image',
      },
      fileName: 'shot.png',
      mimeType: 'image/png',
    });
    expect(executeCommand).toHaveBeenCalledWith(
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/neko/generated/image/shot.png',
        resourceRef: expect.objectContaining({
          provider: 'generated-asset',
          kind: 'generated',
          source: expect.objectContaining({
            kind: 'generated-asset',
            filePath: '${WORKSPACE}/neko/generated/image/shot.png',
          }),
        }),
      }),
    );
  });

  it('fails closed when Canvas transfer cannot promote a generated draft', async () => {
    const executeCommand = vi.fn().mockResolvedValue(undefined);

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
        ingest: async (request) => ({
          status: 'unsupported-destination',
          request,
          providerId: 'generated-output-content-ingest',
          error: 'Generated asset output path must be contracted before promotion.',
        }),
        executeCommand,
      }),
    );

    expect(result).toMatchObject({
      success: false,
      executed: 0,
      error: expect.stringContaining('generated-draft-requires-promotion'),
    });
    expect(executeCommand).not.toHaveBeenCalled();
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
          const outputPath = `/workspace/neko/generated/image/${request.fileName}`;
          promotedPaths.push(outputPath);
          return createGeneratedIngestResult(request, {
            outputPath,
            contractedPath: `\${WORKSPACE}/neko/generated/image/${request.fileName}`,
          });
        },
        executeCommand,
      }),
    );

    expect(promotedPaths).toEqual([
      '/workspace/neko/generated/image/shot-1.png',
      '/workspace/neko/generated/image/shot-2.png',
    ]);
    expect(executeCommand).toHaveBeenCalledTimes(2);
    expect(executeCommand).toHaveBeenNthCalledWith(
      1,
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/neko/generated/image/shot-1.png',
        resourceRef: expect.objectContaining({
          source: expect.objectContaining({
            filePath: '${WORKSPACE}/neko/generated/image/shot-1.png',
          }),
        }),
      }),
    );
    expect(executeCommand).toHaveBeenNthCalledWith(
      2,
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/neko/generated/image/shot-2.png',
        resourceRef: expect.objectContaining({
          source: expect.objectContaining({
            filePath: '${WORKSPACE}/neko/generated/image/shot-2.png',
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
        filePath: '${WORKSPACE}/neko/generated/image/existing.png',
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
          path: '/workspace/neko/generated/image/existing.png',
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
        path: '/workspace/neko/generated/image/existing.png',
        resourceRef: existingResourceRef,
      }),
    );
  });

  it('does not treat cache-backed generated resource refs as promoted Canvas inputs', async () => {
    const ingest = vi.fn(async (request: ContentIngestRequest) =>
      createGeneratedIngestResult(request, {
        outputPath: '/workspace/neko/generated/image/existing.png',
        contractedPath: '${WORKSPACE}/neko/generated/image/existing.png',
      }),
    );
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const cacheResourceRef = {
      id: 'res_cache',
      scope: 'project' as const,
      provider: 'generated-asset',
      kind: 'generated',
      source: {
        kind: 'generated-asset' as const,
        generatedAssetId: 'asset-existing',
        filePath: '/workspace/.neko/.cache/generated/image/existing.png',
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
          resourceRef: cacheResourceRef,
        },
      },
      createDeps({ ingest, executeCommand }),
    );

    expect(ingest).toHaveBeenCalledOnce();
    expect(executeCommand).toHaveBeenCalledWith(
      'neko.canvas.importAsset',
      expect.objectContaining({
        path: '/workspace/neko/generated/image/existing.png',
        resourceRef: expect.objectContaining({
          source: expect.objectContaining({
            filePath: '${WORKSPACE}/neko/generated/image/existing.png',
          }),
        }),
      }),
    );
  });

  it('sends generated clips to the Cut timeline command without requiring Canvas promotion', async () => {
    const ingest = vi.fn();
    const executeCommand = vi.fn().mockResolvedValue(undefined);

    const result = await sendGeneratedAssetToPlugin(
      'cut',
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
      createDeps({ ingest, executeCommand }),
    );

    expect(result.success).toBe(true);
    expect(ingest).not.toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledWith('neko.cut.importGeneratedClip', {
      assetPath: '/tmp/agent-private/shot.png',
      mediaType: 'image',
      name: 'shot.png',
    });
  });

  it('sends generated image assets to the Sketch import command', async () => {
    const ingest = vi.fn();
    const executeCommand = vi.fn().mockResolvedValue(undefined);

    const result = await sendGeneratedAssetToPlugin(
      'sketch',
      undefined,
      undefined,
      {
        kind: 'singleAsset',
        asset: {
          path: '/tmp/agent-private/frame.png',
          mediaType: 'image',
          name: 'frame.png',
        },
      },
      createDeps({ ingest, executeCommand }),
    );

    expect(result.success).toBe(true);
    expect(ingest).not.toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledWith('neko.sketch.importAsset', {
      path: '/tmp/agent-private/frame.png',
      name: 'frame.png',
    });
  });

  it('processes storyboard entity contribution before Canvas import', async () => {
    const executeCommand = vi.fn().mockResolvedValue({ ok: true });
    const processContribution = vi.fn().mockResolvedValue({
      contributionId: 'contribution-1',
      decisions: [
        {
          kind: 'created-candidate',
          name: 'Rin',
          candidateId: 'candidate:character:rin',
          storyboardCharacterId: 'story-char-rin',
        },
      ],
    });

    await sendGeneratedAssetToPlugin(
      'canvas',
      undefined,
      undefined,
      {
        kind: 'canvasStoryboard',
        storyboard: {
          mode: 'semantic',
          sourceScriptUri: 'agent://storyboard-table',
          scenes: [
            {
              sceneId: 'scene-1',
              sceneTitle: 'Opening',
              sceneNumber: 1,
              shotPlans: [
                {
                  shotNumber: 1,
                  duration: 3,
                  visualDescription: 'Rin enters.',
                  characters: [{ characterId: 'story-char-rin', characterName: 'Rin' }],
                  shotScale: 'MS',
                  characterAction: 'Rin enters.',
                  emotion: [],
                  sceneTags: [],
                },
              ],
            },
          ],
        },
        entityMemoryContribution: {
          contributionId: 'contribution-1',
          sourcePackage: 'neko-agent',
          sourceRef: { kind: 'tool-result', toolCallId: 'tool-1' },
          reviewPolicy: 'source-approved',
        },
      },
      {
        workspaceRoot: '/workspace',
        executeCommand,
        entityMemoryContributionAutomation: { processContribution },
      },
    );

    expect(processContribution).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith(
      'neko.canvas.importStoryboard',
      expect.objectContaining({
        scenes: [
          expect.objectContaining({
            shotPlans: [
              expect.objectContaining({
                characters: [
                  expect.objectContaining({
                    candidateId: 'candidate:character:rin',
                  }),
                ],
              }),
            ],
          }),
        ],
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
