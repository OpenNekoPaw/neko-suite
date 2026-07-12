import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createGeneratedAssetRevisionRef,
  scanNekoProjectAuthoringStaticGuards,
  type MediaProductionProjectAuthoringHandoff,
  type MediaProductionResourceArtifactRef,
} from '@neko/shared';
import { createMediaProductionProjectAuthoringPorts } from '../mediaProductionProjectAuthoringResolver';

function createAsset(): MediaProductionResourceArtifactRef {
  const lifecycle = createGeneratedAssetRevisionRef({
    assetId: 'approved-clip',
    contentDigest: 'sha256:approved-clip',
    mediaKind: 'video',
    mimeType: 'video/mp4',
    generation: { taskId: 'task-1' },
  });
  return {
    kind: 'resource',
    artifactId: lifecycle.assetId,
    profileId: 'media-production.generated-video',
    createdAt: '2026-07-12T00:00:00.000Z',
    producerStageId: 'media-generation',
    sourceArtifactIds: [],
    resourceRef: lifecycle.resourceRef,
    revision: lifecycle.revision,
    contentDigest: lifecycle.contentDigest,
  };
}

function createHandoff(
  domain: MediaProductionProjectAuthoringHandoff['domain'],
  documentUri: string,
): MediaProductionProjectAuthoringHandoff {
  return {
    handoffId: `${domain}-handoff`,
    domain,
    sourceArtifactId: 'approved-clip',
    outputProfileId: `media-production.${domain}-project`,
    target: { kind: 'file', documentUri },
    mediaType: domain === 'audio' ? 'audio' : 'video',
  };
}

describe('media production owning authoring resolver', () => {
  it('keeps Agent authoring on shared APIs and poisons legacy UI-bound routes', () => {
    const sources = [
      readFileSync(
        new URL('../mediaProductionProjectAuthoringResolver.ts', import.meta.url),
        'utf8',
      ),
      readFileSync(
        new URL(
          '../../../../agent/src/media-production/project-authoring-orchestrator.ts',
          import.meta.url,
        ),
        'utf8',
      ),
    ];
    const forbiddenDependencyRules = [
      {
        id: 'feature-package-cross-import',
        pattern: /from\s+['"]@neko(?:\/|-)(?:canvas|cut|audio)(?:\/|['"])/,
        code: 'authoring-ui-bound-route' as const,
        message: 'Agent project authoring must use shared public extension APIs.',
      },
      {
        id: 'command-dispatch',
        pattern: /commands\.executeCommand|executeCommand\(/,
        code: 'authoring-ui-bound-route' as const,
        message: 'Agent project authoring must not dispatch UI commands.',
      },
      {
        id: 'webview-dependency',
        pattern: /postMessage\(|WebviewPanel|requestWebviewProjectSnapshot/,
        code: 'authoring-ui-bound-route' as const,
        message: 'Agent project authoring must not depend on Webview state.',
      },
    ];

    for (const source of sources) {
      expect(scanNekoProjectAuthoringStaticGuards(source)).toEqual({
        ok: true,
        diagnostics: [],
      });
      expect(scanNekoProjectAuthoringStaticGuards(source, forbiddenDependencyRules)).toEqual({
        ok: true,
        diagnostics: [],
      });
    }
  });

  it('routes Cut through its exported authoring API without commands or Webview state', async () => {
    const importGeneratedClip = vi.fn(async () => ({
      version: 1 as const,
      ok: true,
      documentUri: 'file:///workspace/final.nkv',
      projectRef: {
        domain: 'cut' as const,
        documentUri: 'file:///workspace/final.nkv',
        projectRevision: 'nkv:revision-2',
      },
      diagnostics: [],
    }));
    const resolveDurableSourcePath = vi.fn(async () => '/workspace/assets/approved.mp4');
    const ports = createMediaProductionProjectAuthoringPorts({
      getExtension: (extensionId) =>
        extensionId === 'neko.neko-cut'
          ? {
              isActive: true,
              exports: { authoring: { importGeneratedClip } },
              activate: vi.fn(),
            }
          : undefined,
      resolveDurableSourcePath,
    });

    const result = await ports.cut.author({
      workflowRunId: 'workflow-1',
      handoff: createHandoff('cut', 'file:///workspace/final.nkv'),
      approvedAsset: createAsset(),
    });

    expect(resolveDurableSourcePath).toHaveBeenCalledWith(createAsset().resourceRef);
    expect(importGeneratedClip).toHaveBeenCalledWith({
      target: { kind: 'file', documentUri: 'file:///workspace/final.nkv' },
      sourcePath: '/workspace/assets/approved.mp4',
      mediaType: 'video',
      requestId: 'cut-handoff',
    });
    expect(result.projectRef?.projectRevision).toBe('nkv:revision-2');
  });

  it('passes Canvas a stable ResourceRef and never materializes a path', async () => {
    const importAsset = vi.fn(async () => ({
      documentUri: 'file:///workspace/board.nkc',
      nodeId: 'node-1',
      mediaType: 'video' as const,
      projectRef: {
        domain: 'canvas' as const,
        documentUri: 'file:///workspace/board.nkc',
        projectRevision: 'nkc:revision-2',
      },
    }));
    const resolveDurableSourcePath = vi.fn();
    const ports = createMediaProductionProjectAuthoringPorts({
      getExtension: (extensionId) =>
        extensionId === 'neko.neko-canvas'
          ? {
              isActive: true,
              exports: { authoring: { importAsset } },
              activate: vi.fn(),
            }
          : undefined,
      resolveDurableSourcePath,
    });
    const asset = createAsset();

    const result = await ports.canvas.author({
      workflowRunId: 'workflow-1',
      handoff: createHandoff('canvas', 'file:///workspace/board.nkc'),
      approvedAsset: asset,
    });

    expect(resolveDurableSourcePath).not.toHaveBeenCalled();
    expect(importAsset).toHaveBeenCalledWith({
      target: { kind: 'file', documentUri: 'file:///workspace/board.nkc' },
      asset: { resourceRef: asset.resourceRef, type: 'video' },
    });
    expect(result.projectRef?.projectRevision).toBe('nkc:revision-2');
  });

  it('fails visibly when the owning extension or authoring namespace is unavailable', async () => {
    const ports = createMediaProductionProjectAuthoringPorts({
      getExtension: () => undefined,
      resolveDurableSourcePath: vi.fn(),
    });

    await expect(
      ports.audio.author({
        workflowRunId: 'workflow-1',
        handoff: createHandoff('audio', 'file:///workspace/mix.nka'),
        approvedAsset: createAsset(),
      }),
    ).rejects.toThrow('authoring-capability-unavailable');
  });
});
