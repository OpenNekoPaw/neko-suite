import {
  CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
  validateCanvasGeneratedDraftApplyResult,
  validateCanvasGeneratedDraftPromotionRequest,
  validateCanvasGeneratedDraftPromotionResult,
  type CanvasGeneratedDraftApplyResult,
  type CanvasGeneratedDraftGroupDiagnostic,
  type CanvasGeneratedDraftPromotionItemResult,
  type CanvasGeneratedDraftPromotionRequest,
  type CanvasGeneratedDraftPromotionResult,
  type CanvasCreateCompositeRequest,
  type CanvasCreateCompositeResult,
  type CanvasHeadlessAuthoringTarget,
  type NekoAssetsAPI,
  type NekoAssetsGeneratedCandidateSource,
} from '@neko/shared';
import type { CanvasGeneratedDraftProjectionService } from './canvasGeneratedDraftProjectionService';

export interface CanvasGeneratedDraftCompositeAuthoringPort {
  readonly createCompositeAuthoringResult: (input: {
    readonly target: CanvasHeadlessAuthoringTarget;
    readonly request: CanvasCreateCompositeRequest;
  }) => Promise<{
    readonly projectRef?: { readonly projectRevision: string };
    readonly createCompositeResult?: CanvasCreateCompositeResult;
  }>;
}

export interface CanvasGeneratedDraftPromotionOrchestratorOptions {
  readonly drafts: Pick<
    CanvasGeneratedDraftProjectionService,
    | 'get'
    | 'getResolvedSources'
    | 'beginPromotion'
    | 'applyPromotionResult'
    | 'markPromotionFailure'
    | 'markBoardApplyConflict'
    | 'acknowledgeBoardApply'
    | 'rebindTargetForRetry'
  >;
  readonly getAssetsApi: () => Promise<Pick<NekoAssetsAPI, 'promoteGeneratedCandidates'>>;
  readonly authoring: CanvasGeneratedDraftCompositeAuthoringPort;
  readonly resolveDocumentUri: (workspaceRelativePath: string) => string;
}

export interface CanvasGeneratedDraftPromotionOrchestrationResult {
  readonly promotion: CanvasGeneratedDraftPromotionResult;
  readonly apply: CanvasGeneratedDraftApplyResult;
}

export class CanvasGeneratedDraftPromotionOrchestrator {
  private readonly completed = new Map<
    string,
    {
      readonly request: CanvasGeneratedDraftPromotionRequest;
      readonly result: CanvasGeneratedDraftPromotionOrchestrationResult;
    }
  >();

  constructor(private readonly options: CanvasGeneratedDraftPromotionOrchestratorOptions) {}

  async promoteAndApply(
    request: CanvasGeneratedDraftPromotionRequest,
  ): Promise<CanvasGeneratedDraftPromotionOrchestrationResult> {
    const requestDiagnostics = validateCanvasGeneratedDraftPromotionRequest(request);
    if (requestDiagnostics.length > 0) {
      throw new Error(
        `Invalid generated draft promotion request: ${requestDiagnostics.map(({ code }) => code).join(', ')}`,
      );
    }
    const completed = this.completed.get(request.requestId);
    if (completed) {
      if (!samePromotionRequest(completed.request, request)) {
        throw new Error('Generated draft promotion request id was reused with different content.');
      }
      return completed.result;
    }
    let projection = this.options.drafts.get(request.projectionId);
    if (!projection)
      throw new Error(`Generated draft projection not found: ${request.projectionId}`);
    const selected = request.selections.map((selection) => {
      const candidate = projection.candidates.find(
        (item) => item.candidateId === selection.candidateId,
      );
      if (!candidate)
        throw new Error(`Generated draft candidate not found: ${selection.candidateId}`);
      if (
        candidate.revision !== selection.revision ||
        candidate.contentDigest !== selection.contentDigest
      ) {
        throw new Error(`Generated draft candidate changed: ${selection.candidateId}`);
      }
      if (candidate.state === 'added-to-board') {
        throw new Error(
          `Generated draft candidate is already on the Board: ${selection.candidateId}`,
        );
      }
      return candidate;
    });
    if (!sameTarget(projection.target, request.target)) {
      if (
        sameIntendedBoard(projection.target, request.target) &&
        selected.every(
          (candidate) => candidate.state === 'saved-to-assets' && candidate.promotedAsset,
        )
      ) {
        await this.options.drafts.rebindTargetForRetry(request.projectionId, request.target);
        const rebound = this.options.drafts.get(request.projectionId);
        if (!rebound)
          throw new Error('Generated draft projection disappeared during retry rebind.');
        projection = rebound;
      } else {
        throw new Error('Generated draft promotion target does not match the frozen Board target.');
      }
    }

    await this.options.drafts.beginPromotion(
      request.projectionId,
      selected.map((candidate) => candidate.candidateId),
    );
    const unresolved = selected.filter((candidate) => !candidate.promotedAsset);
    let promotion: CanvasGeneratedDraftPromotionResult;
    try {
      if (unresolved.length > 0) {
        const sources = this.options.drafts.getResolvedSources(
          request.projectionId,
          unresolved.map((candidate) => candidate.candidateId),
        );
        const assetsApi = await this.options.getAssetsApi();
        const promoted = await assetsApi.promoteGeneratedCandidates({
          request: {
            ...request,
            selections: request.selections.filter((selection) =>
              unresolved.some((candidate) => candidate.candidateId === selection.candidateId),
            ),
          },
          sources: sources.map((source): NekoAssetsGeneratedCandidateSource => ({
            candidateId: source.candidateId,
            title: source.title,
            mediaKind: source.mediaKind,
            mimeType: source.mimeType,
            revision: source.revision,
            contentDigest: source.contentDigest,
            sourcePath: source.sourcePath,
            taskId: source.taskId,
            ...(source.runId ? { runId: source.runId } : {}),
          })),
        });
        const retained = selected.flatMap((candidate): CanvasGeneratedDraftPromotionItemResult[] =>
          candidate.promotedAsset
            ? [
                {
                  candidateId: candidate.candidateId,
                  status: 'saved',
                  asset: candidate.promotedAsset,
                },
              ]
            : [],
        );
        const items = [...retained, ...promoted.items];
        const savedCount = items.filter((item) => item.status === 'saved').length;
        promotion = {
          ...promoted,
          status: savedCount === items.length ? 'saved' : savedCount === 0 ? 'failed' : 'partial',
          items,
        };
      } else {
        promotion = {
          version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
          requestId: request.requestId,
          projectionId: request.projectionId,
          status: 'saved',
          items: selected.flatMap((candidate): CanvasGeneratedDraftPromotionItemResult[] =>
            candidate.promotedAsset
              ? [
                  {
                    candidateId: candidate.candidateId,
                    status: 'saved',
                    asset: candidate.promotedAsset,
                  },
                ]
              : [],
          ),
        };
      }
      const promotionDiagnostics = validateCanvasGeneratedDraftPromotionResult(promotion);
      if (promotionDiagnostics.length > 0) {
        throw new Error(
          `Invalid generated draft promotion result: ${promotionDiagnostics.map(({ code }) => code).join(', ')}`,
        );
      }
      await this.options.drafts.applyPromotionResult(promotion);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.options.drafts.markPromotionFailure(
        request.projectionId,
        selected.map((candidate) => candidate.candidateId),
        message,
      );
      throw error;
    }

    const promotedCandidates = promotion.items.filter(
      (item): item is Extract<CanvasGeneratedDraftPromotionItemResult, { status: 'saved' }> =>
        item.status === 'saved',
    );
    if (promotedCandidates.length === 0) {
      const result = {
        promotion,
        apply: validApplyResult({
          version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
          requestId: request.requestId,
          projectionId: request.projectionId,
          status: 'blocked',
          target: request.target,
          diagnostics: [diagnostic('asset-storage-failed', 'No generated candidates were saved.')],
        }),
      };
      return result;
    }

    const groupId = stableCanvasId('asset-group', request.requestId);
    const promotedWithNodeIds = promotedCandidates.map((item) => ({
      item,
      nodeId: stableCanvasId('asset-node', `${request.requestId}:${item.candidateId}`),
    }));
    const nodeIds = promotedWithNodeIds.map(({ nodeId }) => nodeId);
    const promotedByCandidate = new Map(
      promotedWithNodeIds.map(({ item, nodeId }) => [item.candidateId, { item, nodeId }]),
    );
    const currentProjection = this.options.drafts.get(request.projectionId);
    if (!currentProjection) throw new Error('Generated draft projection disappeared before apply.');

    try {
      const authored = await this.options.authoring.createCompositeAuthoringResult({
        target: {
          kind: 'file',
          documentUri: this.options.resolveDocumentUri(request.target.documentRef.path),
          expectedRevision: request.target.revision,
        },
        request: {
          containerId: groupId,
          containerType: 'group',
          position: currentProjection.position,
          data: {
            label: currentProjection.title,
            taskId: currentProjection.taskId,
            promotionRequestId: request.requestId,
          },
          children: currentProjection.candidates.flatMap((candidate) => {
            const promoted = promotedByCandidate.get(candidate.candidateId);
            if (!promoted) return [];
            return [
              {
                id: promoted.nodeId,
                type: 'media' as const,
                preset: 'media.basic',
                position: candidate.position,
                size: candidate.size,
                data: {
                  title: candidate.title,
                  mediaType: candidate.mediaKind,
                  assetPath: promoted.item.asset.path,
                  ...(promoted.item.asset.resourceRef
                    ? { resourceRef: promoted.item.asset.resourceRef }
                    : {}),
                  assetEntityId: promoted.item.asset.entityId,
                  assetVariantId: promoted.item.asset.variantId,
                  assetFileId: promoted.item.asset.fileId,
                },
              },
            ];
          }),
          autoLayout: false,
        },
      });
      const revision = authored.projectRef?.projectRevision;
      if (!revision || !authored.createCompositeResult) {
        throw new Error(
          'Canvas composite apply did not return durable revision and node identity.',
        );
      }
      await this.options.drafts.acknowledgeBoardApply(
        request.projectionId,
        promotedCandidates.map((item) => item.candidateId),
      );
      const result = {
        promotion,
        apply: validApplyResult({
          version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
          requestId: request.requestId,
          projectionId: request.projectionId,
          status: 'applied',
          target: request.target,
          revision,
          groupId,
          nodeIds,
          diagnostics: [],
        }),
      };
      this.completed.set(request.requestId, { request, result });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.options.drafts.markBoardApplyConflict(
        request.projectionId,
        promotedCandidates.map((item) => item.candidateId),
        message,
      );
      return {
        promotion,
        apply: validApplyResult({
          version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
          requestId: request.requestId,
          projectionId: request.projectionId,
          status: 'conflict',
          target: request.target,
          diagnostics: [diagnostic('invalid-target', message)],
        }),
      };
    }
  }
}

function stableCanvasId(prefix: string, value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  if (!normalized) throw new Error(`Cannot derive stable ${prefix} identity.`);
  return `${prefix}:${normalized}`;
}

function sameTarget(
  left: CanvasGeneratedDraftPromotionRequest['target'],
  right: CanvasGeneratedDraftPromotionRequest['target'],
): boolean {
  return (
    left.documentRef.path === right.documentRef.path &&
    left.documentId === right.documentId &&
    left.canvasId === right.canvasId &&
    left.revision === right.revision &&
    left.conversationId === right.conversationId
  );
}

function samePromotionRequest(
  left: CanvasGeneratedDraftPromotionRequest,
  right: CanvasGeneratedDraftPromotionRequest,
): boolean {
  return (
    left.projectionId === right.projectionId &&
    sameTarget(left.target, right.target) &&
    left.selections.length === right.selections.length &&
    left.selections.every((selection, index) => {
      const other = right.selections[index];
      return (
        other?.candidateId === selection.candidateId &&
        other.revision === selection.revision &&
        other.contentDigest === selection.contentDigest
      );
    })
  );
}

function sameIntendedBoard(
  left: CanvasGeneratedDraftPromotionRequest['target'],
  right: CanvasGeneratedDraftPromotionRequest['target'],
): boolean {
  return (
    left.documentRef.path === right.documentRef.path &&
    left.documentId === right.documentId &&
    left.canvasId === right.canvasId &&
    left.conversationId === right.conversationId
  );
}

function diagnostic(
  code: CanvasGeneratedDraftGroupDiagnostic['code'],
  message: string,
): CanvasGeneratedDraftGroupDiagnostic {
  return { code, severity: 'error', message };
}

function validApplyResult(
  result: CanvasGeneratedDraftApplyResult,
): CanvasGeneratedDraftApplyResult {
  const diagnostics = validateCanvasGeneratedDraftApplyResult(result);
  if (diagnostics.length > 0) {
    throw new Error(
      `Invalid generated draft Canvas apply result: ${diagnostics.map(({ code }) => code).join(', ')}`,
    );
  }
  return result;
}
