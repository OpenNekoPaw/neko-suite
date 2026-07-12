import { describe, expect, it, vi } from 'vitest';
import type {
  NkmProjectData,
  ProjectFileOps,
  ProjectQualityRequest,
  ResourceRef,
} from '@neko/shared';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  PROJECT_QUALITY_CONTRACT_VERSION,
  createDefaultNkmProject,
  createResourceRef,
} from '@neko/shared';
import { createNkmProjectRef, ModelProjectQualityFacade } from './ModelProjectQualityFacade';

describe('ModelProjectQualityFacade', () => {
  it('validates a saved project headlessly and returns a durable snapshot after reopen', async () => {
    const document = createDefaultNkmProject('Scene');
    const project = createNkmProjectRef('file:///workspace/scene.nkm', document);
    const { fileOps } = createMemoryFileOps({ '/workspace/scene.nkm': JSON.stringify(document) });
    const facade = new ModelProjectQualityFacade({
      fileOps,
      now: () => new Date('2026-07-12T00:00:00.000Z'),
    });

    expect(await facade.validateProject(createRequest(project))).toMatchObject({
      ok: true,
      data: { revision: project.projectRevision, projectRef: project },
    });
    expect(await facade.getProjectSnapshot(createRequest(project))).toMatchObject({
      ok: true,
      data: {
        project,
        createdAt: '2026-07-12T00:00:00.000Z',
        snapshotRef: {
          provider: 'neko-model',
          kind: 'document',
          fingerprint: { strategy: 'hash', value: project.contentDigest },
        },
      },
    });
  });

  it('rejects stale revisions before invoking render adapters', async () => {
    const original = createDefaultNkmProject('Original');
    const project = createNkmProjectRef('file:///workspace/stale.nkm', original);
    const changed = { ...original, name: 'Changed' };
    const previewRenderer = { renderPreview: vi.fn(async () => ({ previewRef: previewRef('x') })) };
    const { fileOps } = createMemoryFileOps({ '/workspace/stale.nkm': JSON.stringify(changed) });
    const facade = new ModelProjectQualityFacade({ fileOps, previewRenderer });

    const result = await facade.renderPreview(createRequest(project));

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'stale-quality-evidence' })],
    });
    expect(previewRenderer.renderPreview).not.toHaveBeenCalled();
  });

  it('fails visibly for future schemas, missing/cache sources, profile corruption, and invalid timelines', async () => {
    const invalidTimeline: NkmProjectData = {
      ...createDefaultNkmProject('Animated'),
      customClips: [
        {
          name: 'clip',
          duration: 1,
          channels: [
            {
              targetNode: 'Body',
              property: 'position',
              keyframes: [
                { id: 'late', timestamp: 0.8, values: [0, 0, 0], easing: 'linear' },
                { id: 'early', timestamp: 0.2, values: [0, 0, 0], easing: 'linear' },
              ],
            },
          ],
        },
      ],
    };
    const cases: readonly [string, NkmProjectData, string][] = [
      ['future.nkm', { ...createDefaultNkmProject('Future'), version: 99 }, 'newer than supported'],
      ['missing.nkm', createDefaultNkmProject('Missing', 'assets/missing.glb'), 'is missing'],
      ['cache.nkm', createDefaultNkmProject('Cache', '.neko/cache/model.glb'), 'cache'],
      [
        'profile.nkm',
        { ...createDefaultNkmProject('Profile', null, '2d'), live: { actors: [], routes: [] } },
        'another scene profile',
      ],
      ['timeline.nkm', invalidTimeline, 'invalid keyframe sequence'],
    ];

    for (const [name, document, message] of cases) {
      const project = createNkmProjectRef(`file:///workspace/${name}`, document);
      const { fileOps } = createMemoryFileOps({ [`/workspace/${name}`]: JSON.stringify(document) });
      const result = await new ModelProjectQualityFacade({ fileOps }).validateProject(
        createRequest(project),
      );
      expect(result.ok).toBe(false);
      expect(result.diagnostics.some((item) => item.message.includes(message))).toBe(true);
    }
  });

  it('reports unavailable owning adapters and accepts injected profile adapters', async () => {
    const document = createDefaultNkmProject('Scene');
    const project = createNkmProjectRef('file:///workspace/adapters.nkm', document);
    const { fileOps } = createMemoryFileOps({
      '/workspace/adapters.nkm': JSON.stringify(document),
    });
    const unavailable = new ModelProjectQualityFacade({ fileOps });

    expect(await unavailable.renderPreview(createRequest(project))).toMatchObject({ ok: false });
    expect(await unavailable.probeRuntime(createRequest(project))).toMatchObject({
      ok: true,
      data: { available: false, profileId: '3d' },
    });
    expect(await unavailable.checkExportReadiness(createRequest(project))).toMatchObject({
      ok: true,
      data: { ready: false },
    });

    const durablePreview = previewRef(project.contentDigest!);
    const facade = new ModelProjectQualityFacade({
      fileOps,
      previewRenderer: { renderPreview: vi.fn(async () => ({ previewRef: durablePreview })) },
      runtimeProbe: { probe: vi.fn(async () => ({ available: true, profileId: '3d' })) },
      exportReadinessProbe: { check: vi.fn(async () => ({ ready: true })) },
    });

    expect(await facade.renderPreview(createRequest(project))).toMatchObject({
      ok: true,
      data: { previewRef: durablePreview },
    });
    expect(await facade.probeRuntime(createRequest(project))).toMatchObject({
      ok: true,
      data: { available: true },
    });
  });
});

function createRequest(project: ReturnType<typeof createNkmProjectRef>): ProjectQualityRequest {
  return {
    version: PROJECT_QUALITY_CONTRACT_VERSION,
    requestId: 'model-quality-1',
    project,
    target: {
      version: MEDIA_QUALITY_CONTRACT_VERSION,
      targetId: 'model-project',
      kind: 'project-artifact',
      projectRef: project,
      revision: project.projectRevision,
      contentDigest: project.contentDigest,
    },
  };
}

function previewRef(digest: string): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'neko-model-preview',
    kind: 'preview',
    source: { kind: 'preview-asset', previewAssetId: `model-${digest}` },
    fingerprint: { strategy: 'hash', value: digest },
  });
}

function createMemoryFileOps(initial: Readonly<Record<string, string>>): {
  readonly fileOps: ProjectFileOps;
} {
  const files = new Map(Object.entries(initial));
  const encoder = new TextEncoder();
  return {
    fileOps: {
      async readFile(filePath) {
        const content = files.get(filePath);
        if (content === undefined) throw new Error(`Missing file: ${filePath}`);
        return encoder.encode(content);
      },
      async writeFile(filePath, content) {
        files.set(filePath, new TextDecoder().decode(content));
      },
    },
  };
}
