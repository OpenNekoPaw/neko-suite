import { describe, expect, it } from 'vitest';
import {
  CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
  CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX,
  CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
  CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX,
  createGeneratedAssetRevisionRef,
  validateCanvasGeneratedDraftApplyResult,
  validateCanvasGeneratedDraftGroupProjection,
  validateCanvasGeneratedDraftPromotionRequest,
  validateCanvasGeneratedDraftPromotionResult,
  type CanvasGeneratedDraftGroupProjection,
  type CanvasGeneratedDraftPromotionRequest,
} from '..';

const target = {
  documentRef: { kind: 'workspace-path' as const, path: 'neko/boards/concept.nkc' },
  documentId: 'document:concept',
  canvasId: 'canvas:concept',
  revision: 'revision:1',
  conversationId: 'conversation:1',
  taskId: 'task:1',
  resolutionSource: 'conversation' as const,
  frozenAt: '2026-07-15T00:00:00.000Z',
};

const draft = createGeneratedAssetRevisionRef({
  assetId: 'generated-output:1',
  contentDigest: 'sha256:draft',
  mediaKind: 'image',
  mimeType: 'image/png',
  generation: { taskId: 'task:1', runId: 'run:1' },
});

function projection(): CanvasGeneratedDraftGroupProjection {
  return {
    version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
    projectionId: `${CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX}task:1`,
    taskId: 'task:1',
    runId: 'run:1',
    title: 'Concept candidates',
    target,
    position: { x: 80, y: 80 },
    size: { width: 760, height: 520 },
    collapsed: false,
    pinned: true,
    candidates: [
      {
        candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}generated-output:1`,
        title: 'Concept 1',
        mediaKind: 'image',
        mimeType: 'image/png',
        revision: draft.revision,
        contentDigest: draft.contentDigest,
        resourceRef: draft.resourceRef,
        state: 'unsaved',
        position: { x: 120, y: 160 },
        size: { width: 320, height: 180 },
      },
    ],
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  };
}

function promotionRequest(): CanvasGeneratedDraftPromotionRequest {
  return {
    version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
    requestId: 'promotion:1',
    projectionId: `${CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX}task:1`,
    target,
    selections: [
      {
        candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}generated-output:1`,
        revision: draft.revision,
        contentDigest: draft.contentDigest,
      },
    ],
    requestedAt: '2026-07-15T00:01:00.000Z',
  };
}

describe('Canvas generated draft Group contracts', () => {
  it('keeps unpromoted generated output identity separate from AssetLibrary identity', () => {
    expect(validateCanvasGeneratedDraftGroupProjection(projection())).toEqual([]);
    expect(projection().candidates[0]?.resourceRef.source.kind).toBe('generated-asset');
    expect('promotedAsset' in projection().candidates[0]!).toBe(false);

    const invalidResult = {
      version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
      requestId: 'promotion:1',
      projectionId: `${CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX}task:1`,
      status: 'saved',
      items: [
        {
          candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}generated-output:1`,
          status: 'saved',
          asset: {
            entityId: 'generated-output:1',
            path: '.neko/.cache/resources/generated-drafts/concept.png',
            mediaType: 'image',
          },
        },
      ],
    };
    expect(
      validateCanvasGeneratedDraftPromotionResult(invalidResult).map(({ code }) => code),
    ).toEqual(expect.arrayContaining(['missing-identity', 'invalid-asset-identity']));
  });

  it('requires revision and digest for every explicit Save to Assets selection', () => {
    expect(validateCanvasGeneratedDraftPromotionRequest(promotionRequest())).toEqual([]);
    const invalid = {
      ...promotionRequest(),
      selections: [
        {
          candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}generated-output:1`,
        },
      ],
    };
    expect(validateCanvasGeneratedDraftPromotionRequest(invalid).map(({ code }) => code)).toEqual(
      expect.arrayContaining(['missing-identity']),
    );
  });

  it('rejects unknown versions, duplicate candidates, and non-generated draft refs', () => {
    const duplicate = projection();
    const invalid = {
      ...duplicate,
      version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION + 1,
      candidates: [
        ...duplicate.candidates,
        {
          ...duplicate.candidates[0],
          resourceRef: {
            ...duplicate.candidates[0]!.resourceRef,
            kind: 'media',
            source: { kind: 'file', projectRelativePath: 'neko/assets/concept.png' },
          },
        },
      ],
    };
    expect(validateCanvasGeneratedDraftGroupProjection(invalid).map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'invalid-contract-version',
        'duplicate-candidate',
        'invalid-resource-ref',
      ]),
    );
  });

  it('accepts a promoted Asset identity only with stable entity, variant, file, and path', () => {
    const result = {
      version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
      requestId: 'promotion:1',
      projectionId: `${CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX}task:1`,
      status: 'saved',
      items: [
        {
          candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}generated-output:1`,
          status: 'saved',
          asset: {
            entityId: 'asset:entity:1',
            variantId: 'asset:variant:1',
            fileId: 'asset:file:1',
            path: 'neko/assets/concept.png',
            mediaType: 'image',
          },
        },
      ],
    };
    expect(validateCanvasGeneratedDraftPromotionResult(result)).toEqual([]);
  });

  it('keeps partial promotion status and failure diagnostics internally consistent', () => {
    const partial = {
      version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
      requestId: 'promotion:1',
      projectionId: `${CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX}task:1`,
      status: 'partial',
      items: [
        {
          candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}generated-output:1`,
          status: 'saved',
          asset: {
            entityId: 'asset:entity:1',
            variantId: 'asset:variant:1',
            fileId: 'asset:file:1',
            path: 'neko/assets/concept.png',
            mediaType: 'image',
          },
        },
        {
          candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}generated-output:2`,
          status: 'failed',
          diagnostic: {
            code: 'invalid-selection',
            severity: 'error',
            message: 'Candidate revision changed.',
          },
        },
      ],
    };
    expect(validateCanvasGeneratedDraftPromotionResult(partial)).toEqual([]);
    expect(
      validateCanvasGeneratedDraftPromotionResult({ ...partial, status: 'saved' }).map(
        ({ code }) => code,
      ),
    ).toContain('invalid-result-status');
    expect(
      validateCanvasGeneratedDraftPromotionResult({
        ...partial,
        items: [partial.items[1]],
      }).map(({ code }) => code),
    ).toContain('invalid-result-status');
  });

  it('rejects generated-output identity and generated-root paths as promoted Asset identity', () => {
    const invalid = {
      version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
      requestId: 'promotion:1',
      projectionId: `${CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX}task:1`,
      status: 'saved',
      items: [
        {
          candidateId: `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}generated-output:1`,
          status: 'saved',
          asset: {
            entityId: 'asset:entity:1',
            variantId: 'asset:variant:1',
            fileId: 'asset:file:1',
            path: 'neko/generated/image/concept.png',
            mediaType: 'image',
            resourceRef: draft.resourceRef,
          },
        },
      ],
    };
    expect(validateCanvasGeneratedDraftPromotionResult(invalid).map(({ code }) => code)).toEqual(
      expect.arrayContaining(['invalid-asset-identity', 'invalid-resource-ref']),
    );
  });

  it('forbids render/cache identities in promotion and durable Canvas apply results', () => {
    const invalidPromotion = {
      ...promotionRequest(),
      renderUri: 'vscode-webview://generated/concept',
      cachePath: '.neko/.cache/resources/concept.png',
    };
    expect(
      validateCanvasGeneratedDraftPromotionRequest(invalidPromotion).map(({ code }) => code),
    ).toEqual(expect.arrayContaining(['runtime-value-forbidden']));

    const invalidApply = {
      version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
      requestId: 'promotion:1',
      projectionId: `${CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX}task:1`,
      status: 'applied',
      target,
      revision: 'revision:2',
      groupId: 'group:1',
      nodeIds: ['media:1'],
      assetPath: '.neko/.cache/resources/concept.png',
      diagnostics: [],
    };
    expect(validateCanvasGeneratedDraftApplyResult(invalidApply).map(({ code }) => code)).toContain(
      'runtime-value-forbidden',
    );
  });

  it('does not reuse the Board routing version as an implicit generated Group version', () => {
    expect(CANVAS_BOARD_ROUTING_CONTRACT_VERSION).toBe(1);
    expect(CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION).toBe(1);
    expect(
      validateCanvasGeneratedDraftPromotionRequest({
        ...promotionRequest(),
        version: 2,
      }).map(({ code }) => code),
    ).toContain('invalid-contract-version');
  });
});
