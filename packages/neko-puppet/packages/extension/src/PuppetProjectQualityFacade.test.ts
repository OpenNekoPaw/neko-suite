import { describe, expect, it, vi } from 'vitest';
import type {
  NkpProjectData,
  ProjectFileOps,
  ProjectQualityRequest,
  ResourceRef,
} from '@neko/shared';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  PROJECT_QUALITY_CONTRACT_VERSION,
  createResourceRef,
} from '@neko/shared';
import { createNkpProjectRef, PuppetProjectQualityFacade } from './PuppetProjectQualityFacade';

describe('PuppetProjectQualityFacade', () => {
  it('validates a saved project headlessly and returns a durable snapshot after reopen', async () => {
    const document = createProject();
    const project = createNkpProjectRef('file:///workspace/hero.nkp', document);
    const { fileOps } = createMemoryFileOps({ '/workspace/hero.nkp': JSON.stringify(document) });
    const facade = new PuppetProjectQualityFacade({
      fileOps,
      now: () => new Date('2026-07-12T00:00:00.000Z'),
    });

    const validated = await facade.validateProject(createRequest(project));
    const snapshot = await facade.getProjectSnapshot(createRequest(project));

    expect(validated).toMatchObject({
      ok: true,
      data: {
        revision: project.projectRevision,
        contentDigest: project.contentDigest,
        projectRef: project,
      },
    });
    expect(snapshot).toMatchObject({
      ok: true,
      data: {
        project,
        createdAt: '2026-07-12T00:00:00.000Z',
        snapshotRef: {
          provider: 'neko-puppet',
          kind: 'document',
          fingerprint: { strategy: 'hash', value: project.contentDigest },
        },
      },
    });
  });

  it('rejects a stale saved revision before owning adapters execute', async () => {
    const original = createProject();
    const project = createNkpProjectRef('file:///workspace/stale.nkp', original);
    const changed = { ...original, name: 'Changed' };
    const previewRenderer = { renderPreview: vi.fn(async () => ({ previewRef: previewRef('x') })) };
    const { fileOps } = createMemoryFileOps({ '/workspace/stale.nkp': JSON.stringify(changed) });
    const facade = new PuppetProjectQualityFacade({ fileOps, previewRenderer });

    const result = await facade.renderPreview(createRequest(project));

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'stale-quality-evidence' })],
    });
    expect(previewRenderer.renderPreview).not.toHaveBeenCalled();
  });

  it('fails visibly for future schemas, missing sources, runtime identities, and corrupt skeletons', async () => {
    const corrupt = createProject({
      puppet: { src: null, format: 'native', animationModel: 'bone-blendshape' },
      layers: [],
      skeleton: {
        bones: [
          { id: 'root', name: 'Root', parent: 'child', position: [0, 0], rotation: 0, length: 1 },
          { id: 'child', name: 'Child', parent: 'root', position: [0, 0], rotation: 0, length: 1 },
        ],
      },
      blendShapes: { implemented: [], shapes: [] },
      controlDrivers: [],
      expressions: {},
      animations: [],
    });
    const cases: readonly [string, NkpProjectData, string][] = [
      ['future.nkp', { ...createProject(), version: '9.0' }, 'Unsupported .nkp schema version'],
      ['missing.nkp', createProject({ puppet: { src: 'assets/missing.moc3' } }), 'is missing'],
      ['runtime.nkp', createProject({ puppet: { src: 'blob:preview' } }), 'runtime-only'],
      ['corrupt.nkp', corrupt, 'parent cycle'],
    ];

    for (const [name, document, message] of cases) {
      const project = createNkpProjectRef(`file:///workspace/${name}`, document);
      const { fileOps } = createMemoryFileOps({ [`/workspace/${name}`]: JSON.stringify(document) });
      const result = await new PuppetProjectQualityFacade({ fileOps }).validateProject(
        createRequest(project),
      );
      expect(result.ok).toBe(false);
      expect(result.diagnostics.some((item) => item.message.includes(message))).toBe(true);
    }
  });

  it('reports unavailable owning adapters and accepts durable preview output from injected adapters', async () => {
    const document = createProject();
    const project = createNkpProjectRef('file:///workspace/adapters.nkp', document);
    const { fileOps } = createMemoryFileOps({
      '/workspace/adapters.nkp': JSON.stringify(document),
    });
    const unavailable = new PuppetProjectQualityFacade({ fileOps });

    expect(await unavailable.renderPreview(createRequest(project))).toMatchObject({ ok: false });
    expect(await unavailable.probeRuntime(createRequest(project))).toMatchObject({
      ok: true,
      data: { available: false },
    });
    expect(await unavailable.checkExportReadiness(createRequest(project))).toMatchObject({
      ok: true,
      data: { ready: false },
    });

    const durablePreview = previewRef(project.contentDigest!);
    const facade = new PuppetProjectQualityFacade({
      fileOps,
      previewRenderer: {
        renderPreview: vi.fn(async () => ({
          previewRef: durablePreview,
          sessionRenderUri: 'vscode-webview-resource://session/hero.png',
        })),
      },
      runtimeProbe: { probe: vi.fn(async () => ({ available: true, profileId: 'native' })) },
      exportReadinessProbe: { check: vi.fn(async () => ({ ready: true })) },
    });

    expect(await facade.renderPreview(createRequest(project))).toMatchObject({
      ok: true,
      data: { previewRef: durablePreview },
    });
    expect(await facade.probeRuntime(createRequest(project))).toMatchObject({
      ok: true,
      data: { available: true, profileId: 'native' },
    });
    expect(await facade.checkExportReadiness(createRequest(project))).toMatchObject({
      ok: true,
      data: { ready: true },
    });
  });

  it('rejects runtime-only preview identities returned by an owning renderer', async () => {
    const document = createProject();
    const project = createNkpProjectRef('file:///workspace/preview.nkp', document);
    const { fileOps } = createMemoryFileOps({ '/workspace/preview.nkp': JSON.stringify(document) });
    const facade = new PuppetProjectQualityFacade({
      fileOps,
      previewRenderer: {
        renderPreview: vi.fn(async () => ({
          previewRef: createResourceRef({
            scope: 'project',
            provider: 'neko-puppet-preview',
            kind: 'preview',
            source: { kind: 'uri', uri: 'blob:runtime-preview' },
          }),
        })),
      },
    });

    const result = await facade.renderPreview(createRequest(project));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((item) => item.message.includes('preview ResourceRef'))).toBe(
      true,
    );
  });
});

function createProject(overrides: Partial<NkpProjectData> = {}): NkpProjectData {
  return {
    version: '2.0',
    name: 'Hero',
    puppet: { src: null },
    parameters: {},
    viewport: { zoom: 1 },
    ...overrides,
  };
}

function createRequest(project: ReturnType<typeof createNkpProjectRef>): ProjectQualityRequest {
  return {
    version: PROJECT_QUALITY_CONTRACT_VERSION,
    requestId: 'puppet-quality-1',
    project,
    target: {
      version: MEDIA_QUALITY_CONTRACT_VERSION,
      targetId: 'puppet-project',
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
    provider: 'neko-puppet-preview',
    kind: 'preview',
    source: { kind: 'preview-asset', previewAssetId: `puppet-${digest}` },
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
