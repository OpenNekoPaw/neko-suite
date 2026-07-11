import { describe, expect, it, vi } from 'vitest';
import type {
  NksDocument,
  NksLayerData,
  ProjectFileOps,
  ProjectQualityRequest,
  ResourceRef,
} from '@neko/shared';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  PROJECT_QUALITY_CONTRACT_VERSION,
  createDefaultNksDocument,
  createResourceRef,
} from '@neko/shared';
import { createNksProjectRef, SketchProjectQualityFacade } from './SketchProjectQualityFacade';

describe('SketchProjectQualityFacade', () => {
  it('validates the current .nks revision and returns a stable snapshot', async () => {
    const document = createDocument([createLayer('layer-1')]);
    const project = createNksProjectRef('file:///project/scene.nks', document);
    const facade = new SketchProjectQualityFacade({
      fileOps: createMemoryFileOps({ '/project/scene.nks': JSON.stringify(document) }),
      now: () => new Date('2026-07-11T00:00:00.000Z'),
    });

    const validated = await facade.validateProject(createRequest(project));
    const snapshot = await facade.getProjectSnapshot(createRequest(project));

    expect(validated).toMatchObject({
      ok: true,
      operation: 'validate-project',
      data: {
        revision: project.projectRevision,
        contentDigest: project.contentDigest,
        projectRef: project,
      },
    });
    expect(snapshot).toMatchObject({
      ok: true,
      operation: 'get-project-snapshot',
      data: {
        project,
        createdAt: '2026-07-11T00:00:00.000Z',
        snapshotRef: {
          provider: 'neko-sketch',
          kind: 'document',
          fingerprint: { strategy: 'hash', value: project.contentDigest },
        },
      },
    });
  });

  it('rejects stale revisions before preview or export adapters can run', async () => {
    const document = createDocument([createLayer('layer-current')]);
    const current = createNksProjectRef('file:///project/stale.nks', document);
    const stale = { ...current, projectRevision: 'nks:stale', contentDigest: 'stale' };
    const previewRenderer = { renderPreview: vi.fn() };
    const exportReadinessProbe = { check: vi.fn() };
    const facade = new SketchProjectQualityFacade({
      fileOps: createMemoryFileOps({ '/project/stale.nks': JSON.stringify(document) }),
      previewRenderer,
      exportReadinessProbe,
    });

    const preview = await facade.renderPreview(createRequest(stale));
    const readiness = await facade.checkExportReadiness(createRequest(stale));

    expect(preview).toMatchObject({
      ok: false,
      operation: 'render-preview',
      diagnostics: [expect.objectContaining({ code: 'stale-quality-evidence' })],
    });
    expect(readiness).toMatchObject({ ok: false, operation: 'check-export-readiness' });
    expect(previewRenderer.renderPreview).not.toHaveBeenCalled();
    expect(exportReadinessProbe.check).not.toHaveBeenCalled();
  });

  it('rejects unknown schema versions, invalid layers, runtime refs, and missing resources', async () => {
    const cases: readonly [string, unknown, string][] = [
      ['future.nks', { ...createDocument([]), version: '9.0' }, 'Unsupported .nks schema version'],
      ['missing-canvas.nks', { ...createDocument([]), canvas: null }, 'canvas must persist'],
      [
        'invalid-layer.nks',
        createDocument([{ ...createLayer('invalid'), type: 'unknown' as never }]),
        'persisted layer contract',
      ],
      [
        'duplicate.nks',
        createDocument([createLayer('same'), createLayer('same')]),
        'layer ids must be non-empty and unique',
      ],
      [
        'runtime.nks',
        createDocument([createLayer('runtime', { sourcePath: 'blob:preview' })]),
        'runtime-only handle',
      ],
      [
        'missing.nks',
        createDocument([createLayer('missing', { sourcePath: 'assets/missing.png' })]),
        'is missing',
      ],
    ];

    for (const [name, raw, message] of cases) {
      const project = createNksProjectRef(`file:///project/${name}`, createDocument([]));
      const facade = new SketchProjectQualityFacade({
        fileOps: createMemoryFileOps({ [`/project/${name}`]: JSON.stringify(raw) }),
      });

      const result = await facade.validateProject(createRequest(project));

      expect(result.ok).toBe(false);
      expect(result.diagnostics.some((item) => item.message.includes(message))).toBe(true);
    }
  });

  it('uses owning preview/runtime/export adapters and keeps render URIs display-only', async () => {
    const document = createDocument([createLayer('layer-1')]);
    const project = createNksProjectRef('file:///project/render.nks', document);
    const previewRef = createPreviewRef(project.contentDigest!);
    const previewRenderer = {
      renderPreview: vi.fn(async () => ({
        previewRef,
        sessionRenderUri: 'vscode-webview-resource://preview/render.png',
      })),
    };
    const runtimeProbe = {
      probe: vi.fn(async () => ({ available: true, profileId: 'sketch-webgl2' })),
    };
    const exportReadinessProbe = {
      check: vi.fn(async () => ({ ready: true, requiredEvidenceIds: ['evidence-structural'] })),
    };
    const facade = new SketchProjectQualityFacade({
      fileOps: createMemoryFileOps({ '/project/render.nks': JSON.stringify(document) }),
      previewRenderer,
      runtimeProbe,
      exportReadinessProbe,
    });

    const preview = await facade.renderPreview(createRequest(project));
    const runtime = await facade.probeRuntime(createRequest(project));
    const readiness = await facade.checkExportReadiness(createRequest(project));

    expect(preview).toMatchObject({ ok: true, data: { previewRef, project } });
    expect(runtime).toMatchObject({
      ok: true,
      data: { available: true, profileId: 'sketch-webgl2' },
    });
    expect(readiness).toMatchObject({
      ok: true,
      data: { ready: true, requiredEvidenceIds: ['evidence-structural'] },
    });
    expect(previewRenderer.renderPreview).toHaveBeenCalledWith(
      expect.objectContaining({ project, revision: project.projectRevision }),
    );
  });

  it('fails visibly when preview/export adapters are absent or frame animation is requested', async () => {
    const document = createDocument([createLayer('layer-1')]);
    const project = createNksProjectRef('file:///project/no-adapter.nks', document);
    const facade = new SketchProjectQualityFacade({
      fileOps: createMemoryFileOps({ '/project/no-adapter.nks': JSON.stringify(document) }),
    });

    const preview = await facade.renderPreview(createRequest(project));
    const readiness = await facade.checkExportReadiness(
      createRequest(project, { requiresFrameAnimation: true }),
    );

    expect(preview).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ message: expect.stringContaining('no owning preview') }),
      ],
    });
    expect(readiness).toMatchObject({
      ok: true,
      data: {
        ready: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('does not persist frame') }),
          expect.objectContaining({ message: expect.stringContaining('no owning export') }),
        ]),
      },
    });
  });
});

function createRequest(
  project: ReturnType<typeof createNksProjectRef>,
  expectedIntent?: Readonly<Record<string, unknown>>,
): ProjectQualityRequest {
  return {
    version: PROJECT_QUALITY_CONTRACT_VERSION,
    requestId: 'quality-request-1',
    project,
    target: {
      version: MEDIA_QUALITY_CONTRACT_VERSION,
      targetId: 'sketch-project-target',
      kind: 'project-artifact',
      projectRef: project,
      revision: project.projectRevision,
      contentDigest: project.contentDigest,
      ...(expectedIntent ? { expectedIntent } : {}),
    },
  };
}

function createDocument(layers: readonly NksLayerData[]): NksDocument {
  return { ...createDefaultNksDocument(), layers: [...layers] };
}

function createLayer(id: string, options: { readonly sourcePath?: string } = {}): NksLayerData {
  return {
    id,
    name: id,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 32,
    height: 32,
    offsetX: 0,
    offsetY: 0,
    clippingMask: false,
    maskLayerId: null,
    children: [],
    data: 'pixels',
    ...(options.sourcePath
      ? { source: { kind: 'file' as const, path: options.sourcePath, role: 'image' as const } }
      : {}),
  };
}

function createPreviewRef(digest: string): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'neko-sketch-preview',
    kind: 'preview',
    source: { kind: 'preview-asset', previewAssetId: `sketch-preview-${digest}` },
    fingerprint: { strategy: 'hash', value: digest },
  });
}

function createMemoryFileOps(initial: Readonly<Record<string, string>>): ProjectFileOps {
  const files = new Map(Object.entries(initial));
  const encoder = new TextEncoder();
  return {
    async readFile(filePath) {
      const content = files.get(filePath);
      if (content === undefined) throw new Error(`Missing file: ${filePath}`);
      return encoder.encode(content);
    },
    async writeFile(filePath, content) {
      files.set(filePath, new TextDecoder().decode(content));
    },
  };
}
