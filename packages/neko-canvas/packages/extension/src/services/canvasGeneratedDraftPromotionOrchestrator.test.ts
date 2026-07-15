import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
  CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
  createGeneratedAssetRevisionRef,
  createResourceFingerprint,
  createResourceRef,
  type CanvasBoardDeliveryRequest,
  type CanvasGeneratedDraftPromotionRequest,
  type GeneratedAssetRevisionRef,
} from '@neko/shared';
import { CanvasGeneratedDraftProjectionService } from './canvasGeneratedDraftProjectionService';
import { CanvasGeneratedDraftPromotionOrchestrator } from './canvasGeneratedDraftPromotionOrchestrator';

describe('CanvasGeneratedDraftPromotionOrchestrator', () => {
  it('promotes then applies to the frozen Board once and replays idempotently', async () => {
    const lifecycle = generatedLifecycle();
    const drafts = await createDrafts(lifecycle);
    const projection = drafts.getProjection();
    const candidate = projection.candidates[0]!;
    const promoteGeneratedCandidates = vi.fn(async () => ({
      version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
      requestId: 'promotion:1',
      projectionId: projection.projectionId,
      status: 'saved' as const,
      items: [
        {
          candidateId: candidate.candidateId,
          status: 'saved' as const,
          asset: promotedAsset(),
        },
      ],
    }));
    const createCompositeAuthoringResult = vi.fn(async () => ({
      projectRef: { projectRevision: 'revision:2' },
      createCompositeResult: {
        containerId: 'asset-group:promotion-1',
        childIds: ['asset-node:promotion-1-candidate'],
      },
    }));
    const orchestrator = new CanvasGeneratedDraftPromotionOrchestrator({
      drafts: drafts.service,
      getAssetsApi: async () => ({ promoteGeneratedCandidates }),
      authoring: { createCompositeAuthoringResult },
      resolveDocumentUri: (relativePath) => `file:///workspace/${relativePath}`,
    });
    const request = promotionRequest(projection, candidate);

    const first = await orchestrator.promoteAndApply(request);
    const replayed = await orchestrator.promoteAndApply(request);

    expect(first.apply).toMatchObject({ status: 'applied', revision: 'revision:2' });
    expect(replayed).toEqual(first);
    expect(promoteGeneratedCandidates).toHaveBeenCalledOnce();
    expect(createCompositeAuthoringResult).toHaveBeenCalledOnce();
    expect(createCompositeAuthoringResult).toHaveBeenCalledWith(
      expect.objectContaining({
        target: {
          kind: 'file',
          documentUri: 'file:///workspace/neko/boards/story.nkc',
          expectedRevision: 'revision:1',
        },
        request: expect.objectContaining({
          containerType: 'group',
          children: [
            expect.objectContaining({
              type: 'media',
              data: expect.objectContaining({
                assetPath: 'neko/assets/files/image/concept.png',
                assetEntityId: 'asset:entity:1',
              }),
            }),
          ],
        }),
      }),
    );
    expect(JSON.stringify(createCompositeAuthoringResult.mock.calls)).not.toContain('.neko/.cache');
    expect(drafts.service.get(projection.projectionId)).toBeUndefined();
  });

  it('retains promoted Asset identity when the frozen Board revision conflicts', async () => {
    const lifecycle = generatedLifecycle();
    const drafts = await createDrafts(lifecycle);
    const projection = drafts.getProjection();
    const candidate = projection.candidates[0]!;
    const promoteGeneratedCandidates = vi.fn(async () => ({
      version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
      requestId: 'promotion:1',
      projectionId: projection.projectionId,
      status: 'saved' as const,
      items: [
        {
          candidateId: candidate.candidateId,
          status: 'saved' as const,
          asset: promotedAsset(),
        },
      ],
    }));
    const createCompositeAuthoringResult = vi
      .fn()
      .mockRejectedValueOnce(new Error('stale-board-target: expected revision:1'))
      .mockResolvedValueOnce({
        projectRef: { projectRevision: 'revision:3' },
        createCompositeResult: {
          containerId: 'asset-group:promotion-retry',
          childIds: ['asset-node:promotion-retry-candidate'],
        },
      });
    const orchestrator = new CanvasGeneratedDraftPromotionOrchestrator({
      drafts: drafts.service,
      getAssetsApi: async () => ({ promoteGeneratedCandidates }),
      authoring: { createCompositeAuthoringResult },
      resolveDocumentUri: (relativePath) => `file:///workspace/${relativePath}`,
    });

    const result = await orchestrator.promoteAndApply(promotionRequest(projection, candidate));

    expect(result.apply).toMatchObject({ status: 'conflict' });
    expect(drafts.service.get(projection.projectionId)?.candidates[0]).toMatchObject({
      state: 'saved-to-assets',
      promotedAsset: { entityId: 'asset:entity:1' },
      diagnostic: expect.stringContaining('stale-board-target'),
    });
    expect(createCompositeAuthoringResult).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ kind: 'file' }) }),
    );

    const retryRequest = {
      ...promotionRequest(projection, candidate),
      requestId: 'promotion:retry',
      target: { ...projection.target, revision: 'revision:2' },
    };
    const retry = await orchestrator.promoteAndApply(retryRequest);

    expect(retry.apply).toMatchObject({ status: 'applied', revision: 'revision:3' });
    expect(promoteGeneratedCandidates).toHaveBeenCalledOnce();
    expect(createCompositeAuthoringResult).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ expectedRevision: 'revision:2' }),
      }),
    );
  });

  it('returns candidates to a fail-visible retryable state when Asset promotion throws', async () => {
    const lifecycle = generatedLifecycle();
    const drafts = await createDrafts(lifecycle);
    const projection = drafts.getProjection();
    const candidate = projection.candidates[0]!;
    const orchestrator = new CanvasGeneratedDraftPromotionOrchestrator({
      drafts: drafts.service,
      getAssetsApi: async () => ({
        promoteGeneratedCandidates: vi.fn(async () => {
          throw new Error('AssetLibrary unavailable');
        }),
      }),
      authoring: {
        createCompositeAuthoringResult: vi.fn(async () => {
          throw new Error('Canvas authoring must not run');
        }),
      },
      resolveDocumentUri: (relativePath) => `file:///workspace/${relativePath}`,
    });

    await expect(
      orchestrator.promoteAndApply(promotionRequest(projection, candidate)),
    ).rejects.toThrow('AssetLibrary unavailable');
    expect(drafts.service.get(projection.projectionId)?.candidates[0]).toMatchObject({
      state: 'failed',
      diagnostic: 'AssetLibrary unavailable',
    });
  });
});

async function createDrafts(lifecycle: GeneratedAssetRevisionRef): Promise<{
  service: CanvasGeneratedDraftProjectionService;
  getProjection: () => NonNullable<ReturnType<CanvasGeneratedDraftProjectionService['get']>>;
}> {
  const service = new CanvasGeneratedDraftProjectionService({
    lifecycle: {
      resolve: vi.fn(async () => ({
        status: 'ready' as const,
        assetId: lifecycle.assetId,
        revision: lifecycle.revision,
        contentDigest: lifecycle.contentDigest,
        mediaKind: lifecycle.mediaKind,
        mimeType: lifecycle.mimeType,
        taskId: lifecycle.generation.taskId,
        runId: lifecycle.generation.runId,
        sourcePath: '/workspace/.neko/.cache/generated/image/concept.png',
      })),
      setReviewPin: vi.fn(async () => undefined),
    },
    publisher: { publish: vi.fn(async () => true), remove: vi.fn(async () => true) },
  });
  const projection = await service.upsertFromBoardDelivery(boardDelivery(lifecycle));
  return {
    service,
    getProjection: () => {
      const current = service.get(projection.projectionId);
      if (!current) throw new Error('Expected generated draft projection.');
      return current;
    },
  };
}

function generatedLifecycle(): GeneratedAssetRevisionRef {
  return createGeneratedAssetRevisionRef({
    assetId: 'generated-output:1',
    contentDigest: `sha256:${'a'.repeat(64)}`,
    mediaKind: 'image',
    mimeType: 'image/png',
    generation: { taskId: 'task:1', runId: 'run:1' },
  });
}

function promotedAsset() {
  return {
    entityId: 'asset:entity:1',
    variantId: 'asset:variant:1',
    fileId: 'asset:file:1',
    path: 'neko/assets/files/image/concept.png',
    mediaType: 'image' as const,
    resourceRef: createResourceRef({
      scope: 'project',
      provider: 'asset-library',
      kind: 'media',
      source: {
        kind: 'media-library',
        mediaLibraryId: 'asset:entity:1',
        projectRelativePath: 'neko/assets/files/image/concept.png',
      },
      locator: { kind: 'file', path: 'neko/assets/files/image/concept.png' },
      fingerprint: createResourceFingerprint({
        strategy: 'hash',
        value: `sha256:${'a'.repeat(64)}`,
      }),
    }),
  };
}

function promotionRequest(
  projection: NonNullable<ReturnType<CanvasGeneratedDraftProjectionService['get']>>,
  candidate: NonNullable<
    ReturnType<CanvasGeneratedDraftProjectionService['get']>
  >['candidates'][number],
): CanvasGeneratedDraftPromotionRequest {
  return {
    version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
    requestId: 'promotion:1',
    projectionId: projection.projectionId,
    target: projection.target,
    selections: [
      {
        candidateId: candidate.candidateId,
        revision: candidate.revision,
        contentDigest: candidate.contentDigest,
      },
    ],
    requestedAt: '2026-07-15T00:01:00.000Z',
  };
}

function boardDelivery(lifecycle: GeneratedAssetRevisionRef): CanvasBoardDeliveryRequest {
  return {
    version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
    target: {
      documentRef: { kind: 'workspace-path', path: 'neko/boards/story.nkc' },
      documentId: 'document:story',
      canvasId: 'canvas:story',
      revision: 'revision:1',
      conversationId: 'conversation:1',
      taskId: 'task:1',
      runId: 'run:1',
      resolutionSource: 'created',
      frozenAt: '2026-07-15T00:00:00.000Z',
    },
    provenance: {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      deliveryId: 'delivery:1',
      artifactId: 'artifact:1',
      kind: 'image',
      conversationId: 'conversation:1',
      taskId: 'task:1',
      runId: 'run:1',
      sourceId: 'assistant:1',
      createdAt: '2026-07-15T00:00:00.000Z',
    },
    artifact: {
      kind: 'image',
      title: 'Concept',
      mimeType: 'image/png',
      resourceRef: lifecycle.resourceRef,
    },
  };
}
