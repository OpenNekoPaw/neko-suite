import { describe, expect, it, vi } from 'vitest';
import {
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  type CanvasNode,
  type CreativeAiApplyRequest,
  type CreativeAiDocumentRef,
  type CreativeAiOutputRef,
  type CreativeAiTargetRef,
} from '@neko/shared';
import {
  buildCanvasGenerateExternalInvocation,
  buildCanvasGeneratedImageTargetRef,
  CanvasCreativeAiApplyAdapter,
  CANVAS_GENERATED_IMAGE_FIELD_PATH,
  createCanvasDocumentRevision,
  createCanvasTargetRevision,
} from '../creativeAiCanvasAdapter';

const documentRef: CreativeAiDocumentRef = {
  kind: 'nk-document',
  packageId: 'neko-canvas',
  documentId: 'canvas-document:doc-1',
  projectRelativePath: 'boards/intro.nkc',
  format: 'nkc',
  label: 'Intro',
};

function shotNode(
  id: string,
  overrides: Partial<CanvasNode> & { data?: Record<string, unknown> } = {},
): CanvasNode {
  return {
    id,
    type: 'shot',
    position: { x: 0, y: 0 },
    size: { width: 320, height: 180 },
    zIndex: 1,
    data: {
      shotNumber: 1,
      visualDescription: 'A quiet opening frame.',
      generatedImage: '',
      generationHistory: [],
      ...(overrides.data ?? {}),
    },
    ...overrides,
  } as unknown as CanvasNode;
}

function outputRef(overrides: Partial<CreativeAiOutputRef> = {}): CreativeAiOutputRef {
  return {
    kind: 'generated-asset',
    id: 'output-1',
    generatedAssetId: 'image/shot-1.png',
    mimeType: 'image/png',
    ...overrides,
  };
}

function applyRequest(
  targetRef: CreativeAiTargetRef,
  targetRevision: string,
  overrides: Partial<CreativeAiApplyRequest> = {},
): CreativeAiApplyRequest {
  return {
    schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
    requestId: 'apply-1',
    conversationId: 'conversation-1',
    runId: 'run-1',
    workItemId: 'work-1',
    sourcePackage: 'neko-canvas',
    targetRef,
    outputRefs: [outputRef()],
    writeback: {
      kind: 'mutating',
      atomicity: 'per-target',
      requiresRevisionMatch: true,
    },
    targetRevision,
    idempotencyKey: 'apply-key-1',
    ...overrides,
  };
}

describe('Canvas creative AI adapter', () => {
  it('builds external invocation envelopes with explicit source, target, revisions, mode, and intent', () => {
    const node = shotNode('shot-1', { data: { generatedImage: 'old.png' } });
    const invocation = buildCanvasGenerateExternalInvocation({
      document: {
        documentId: documentRef.documentId,
        projectRelativePath: documentRef.projectRelativePath,
        label: documentRef.label,
        revision: createCanvasDocumentRevision({ nodes: [node] }),
      },
      node,
      params: { prompt: 'New frame', blobPreview: 'blob:vscode/preview' },
      requestedAt: '2026-07-07T00:00:00.000Z',
    });

    expect(invocation.domain).toBe('external-creative-package');
    expect(invocation.sourcePackage).toBe('neko-canvas');
    expect(invocation.documentRef?.projectRelativePath).toBe('boards/intro.nkc');
    expect(invocation.sourceRef).toEqual(
      expect.objectContaining({
        kind: 'canvas-node',
        entityId: 'shot-1',
        revision: expect.stringMatching(/^canvas-node:/),
      }),
    );
    expect(invocation.targetRef).toEqual(
      expect.objectContaining({
        kind: 'canvas-field',
        entityId: 'shot-1',
        fieldPath: CANVAS_GENERATED_IMAGE_FIELD_PATH,
        revision: expect.stringMatching(/^canvas-target:/),
      }),
    );
    expect(invocation.mode).toBe('generate');
    expect(invocation.intent).toContain('stable image output');
    expect(invocation.routing?.associationKey).toBe('neko-canvas:document:boards/intro.nkc');
    expect(invocation.metadata?.['params']).toEqual({ prompt: 'New frame' });
  });

  it('builds one batch invocation with child source and target refs', () => {
    const first = shotNode('shot-1');
    const second = shotNode('shot-2');

    const invocation = buildCanvasGenerateExternalInvocation({
      document: {
        documentId: documentRef.documentId,
        projectRelativePath: documentRef.projectRelativePath,
        revision: createCanvasDocumentRevision({ nodes: [first, second] }),
      },
      node: first,
      batchNodes: [first, second],
      batchNodeIds: ['shot-1', 'shot-2'],
      mode: 'batch',
    });

    expect(invocation.mode).toBe('batch');
    expect(invocation.sourceRef.kind).toBe('selection');
    expect(invocation.sourceRef.childRefs?.map((ref) => ref.entityId)).toEqual([
      'shot-1',
      'shot-2',
    ]);
    expect(invocation.targetRef?.kind).toBe('batch');
    expect(invocation.targetRef?.childRefs?.map((ref) => ref.entityId)).toEqual([
      'shot-1',
      'shot-2',
    ]);
    expect(invocation.writeback.atomicity).toBe('per-target');
  });

  it('applies stable generated asset outputs through the Canvas node update port', async () => {
    const node = shotNode('shot-1');
    const targetRef = buildCanvasGeneratedImageTargetRef({ documentRef, node });
    const targetRevision = createCanvasTargetRevision(node, CANVAS_GENERATED_IMAGE_FIELD_PATH);
    const updateNode = vi.fn(async () => undefined);
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => node),
      updateNode,
    });

    const result = await adapter.apply(applyRequest(targetRef, targetRevision));

    expect(result.ok).toBe(true);
    expect(updateNode).toHaveBeenCalledWith('shot-1', {
      generatedImage: 'generated-assets/image/shot-1.png',
      generatedAsset: expect.objectContaining({
        id: 'image/shot-1.png',
        path: 'generated-assets/image/shot-1.png',
        mimeType: 'image/png',
      }),
    });
  });

  it('returns existing apply result for duplicate idempotency keys', async () => {
    const node = shotNode('shot-1');
    const targetRef = buildCanvasGeneratedImageTargetRef({ documentRef, node });
    const targetRevision = createCanvasTargetRevision(node, CANVAS_GENERATED_IMAGE_FIELD_PATH);
    const updateNode = vi.fn(async () => undefined);
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => node),
      updateNode,
    });

    await adapter.apply(applyRequest(targetRef, targetRevision));
    const duplicate = await adapter.apply(applyRequest(targetRef, targetRevision));

    expect(duplicate.ok).toBe(true);
    expect(updateNode).toHaveBeenCalledTimes(1);
  });

  it('rejects stale target revisions without mutating Canvas state', async () => {
    const node = shotNode('shot-1', { data: { generatedImage: 'newer.png' } });
    const staleNode = shotNode('shot-1', { data: { generatedImage: 'old.png' } });
    const targetRef = buildCanvasGeneratedImageTargetRef({ documentRef, node: staleNode });
    const staleRevision = createCanvasTargetRevision(staleNode, CANVAS_GENERATED_IMAGE_FIELD_PATH);
    const updateNode = vi.fn(async () => undefined);
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => node),
      updateNode,
    });

    const result = await adapter.apply(applyRequest(targetRef, staleRevision));

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'creative-ai-canvas-target-stale' }),
    ]);
    expect(updateNode).not.toHaveBeenCalled();
  });

  it('rejects deleted targets without affecting other batch targets', async () => {
    const node = shotNode('shot-1');
    const missing = shotNode('shot-2');
    const firstTarget = buildCanvasGeneratedImageTargetRef({ documentRef, node });
    const secondTarget = buildCanvasGeneratedImageTargetRef({ documentRef, node: missing });
    const updateNode = vi.fn(async () => undefined);
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async (nodeId: string) => (nodeId === 'shot-1' ? node : undefined)),
      updateNode,
    });

    const batch = await adapter.applyBatch([
      applyRequest(
        firstTarget,
        createCanvasTargetRevision(node, CANVAS_GENERATED_IMAGE_FIELD_PATH),
        {
          requestId: 'apply-1',
          idempotencyKey: 'apply-key-1',
        },
      ),
      applyRequest(
        secondTarget,
        createCanvasTargetRevision(missing, CANVAS_GENERATED_IMAGE_FIELD_PATH),
        {
          requestId: 'apply-2',
          idempotencyKey: 'apply-key-2',
        },
      ),
    ]);

    expect(batch.ok).toBe(false);
    expect(batch.atomic).toBe(false);
    expect(batch.results).toHaveLength(2);
    expect(batch.results[0]?.ok).toBe(true);
    expect(batch.results[1]?.ok).toBe(false);
    expect(batch.diagnostics).toEqual([
      expect.objectContaining({ code: 'creative-ai-canvas-target-deleted' }),
    ]);
    expect(updateNode).toHaveBeenCalledTimes(1);
  });

  it('stops atomic batch apply after the first failed target', async () => {
    const missing = shotNode('shot-1');
    const next = shotNode('shot-2');
    const missingTarget = buildCanvasGeneratedImageTargetRef({ documentRef, node: missing });
    const nextTarget = buildCanvasGeneratedImageTargetRef({ documentRef, node: next });
    const updateNode = vi.fn(async () => undefined);
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async (nodeId: string) => (nodeId === 'shot-2' ? next : undefined)),
      updateNode,
    });

    const batch = await adapter.applyBatch([
      applyRequest(
        missingTarget,
        createCanvasTargetRevision(missing, CANVAS_GENERATED_IMAGE_FIELD_PATH),
        {
          requestId: 'apply-1',
          idempotencyKey: 'apply-key-1',
          writeback: { kind: 'mutating', atomicity: 'atomic', requiresRevisionMatch: true },
        },
      ),
      applyRequest(
        nextTarget,
        createCanvasTargetRevision(next, CANVAS_GENERATED_IMAGE_FIELD_PATH),
        {
          requestId: 'apply-2',
          idempotencyKey: 'apply-key-2',
          writeback: { kind: 'mutating', atomicity: 'atomic', requiresRevisionMatch: true },
        },
      ),
    ]);

    expect(batch.atomic).toBe(true);
    expect(batch.results).toHaveLength(1);
    expect(updateNode).not.toHaveBeenCalled();
  });

  it('rejects target field conflicts before Canvas mutation', async () => {
    const node = shotNode('shot-1');
    const targetRef = {
      ...buildCanvasGeneratedImageTargetRef({ documentRef, node }),
      fieldPath: '/visualDescription',
      id: 'canvas-node:shot-1#/visualDescription',
    };
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => node),
      updateNode: vi.fn(async () => undefined),
    });

    const result = await adapter.apply(
      applyRequest(targetRef, createCanvasTargetRevision(node, '/visualDescription')),
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'creative-ai-canvas-target-field-conflict' }),
    ]);
  });

  it('keeps candidate-only output out of Canvas document state', async () => {
    const node = shotNode('shot-1');
    const candidateTargetRef = {
      ...buildCanvasGeneratedImageTargetRef({ documentRef, node }),
      kind: 'candidate-target',
      id: 'canvas-node:shot-1#candidate-generated-image',
      candidateOnly: true,
    } satisfies CreativeAiTargetRef;
    const updateNode = vi.fn(async () => undefined);
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => node),
      updateNode,
    });

    const result = await adapter.apply({
      ...applyRequest(
        buildCanvasGeneratedImageTargetRef({ documentRef, node }),
        createCanvasTargetRevision(node, CANVAS_GENERATED_IMAGE_FIELD_PATH),
      ),
      targetRef: undefined,
      candidateTargetRef,
      writeback: { kind: 'candidate', atomicity: 'per-target', requiresRevisionMatch: false },
      idempotencyKey: 'candidate-key',
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'creative-ai-canvas-candidate-output-ready' }),
    ]);
    expect(updateNode).not.toHaveBeenCalled();
  });

  it('rejects runtime-only output identities before apply', async () => {
    const node = shotNode('shot-1');
    const targetRef = buildCanvasGeneratedImageTargetRef({ documentRef, node });
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => node),
      updateNode: vi.fn(async () => undefined),
    });

    const result = await adapter.apply(
      applyRequest(targetRef, createCanvasTargetRevision(node, CANVAS_GENERATED_IMAGE_FIELD_PATH), {
        outputRefs: [
          outputRef({
            generatedAssetId: 'asset-1',
            metadata: { previewUrl: 'blob:vscode/preview' },
          }),
        ],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'creative-ai-canvas-runtime-only-identity' }),
    ]);
  });

  it('does not directly mutate Canvas Webview component state from the adapter', () => {
    const port = {
      getNode: vi.fn(async () => shotNode('shot-1')),
      updateNode: vi.fn(async () => undefined),
      webview: { postMessage: vi.fn() },
    };
    const adapter = new CanvasCreativeAiApplyAdapter(port);

    expect(adapter).toBeInstanceOf(CanvasCreativeAiApplyAdapter);
    expect(port.webview.postMessage).not.toHaveBeenCalled();
  });
});
