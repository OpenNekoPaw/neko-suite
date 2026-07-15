import {
  CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX,
  CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
  CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX,
  isResourceRef,
  validateCanvasGeneratedDraftGroupProjection,
  validateCanvasGeneratedDraftPromotionResult,
  type CanvasBoardDeliveryRequest,
  type CanvasGeneratedDraftCandidateProjection,
  type CanvasGeneratedDraftGroupProjection,
  type CanvasGeneratedDraftPromotionResult,
  type NekoAgentGeneratedOutputResolution,
  type ResourceRef,
} from '@neko/shared';

export interface CanvasGeneratedDraftLifecyclePort {
  readonly resolve: (resourceRef: ResourceRef) => Promise<NekoAgentGeneratedOutputResolution>;
  readonly setReviewPin: (
    resourceRef: ResourceRef,
    input: { readonly pinned: boolean; readonly ownerId: string },
  ) => Promise<void>;
}

export interface CanvasGeneratedDraftProjectionPublisher {
  readonly publish: (projection: CanvasGeneratedDraftGroupProjection) => Promise<boolean>;
  readonly remove: (projectionId: string, targetPath: string) => Promise<boolean>;
}

export interface CanvasGeneratedDraftProjectionServiceOptions {
  readonly lifecycle: CanvasGeneratedDraftLifecyclePort;
  readonly publisher: CanvasGeneratedDraftProjectionPublisher;
  readonly now?: () => string;
}

interface RuntimeProjectionRecord {
  projection: CanvasGeneratedDraftGroupProjection;
  sources: Map<string, ResolvedCandidateSource>;
}

export interface ResolvedCandidateSource {
  readonly candidateId: string;
  readonly sourcePath: string;
  readonly taskId: string;
  readonly runId?: string;
  readonly revision: string;
  readonly contentDigest: string;
  readonly mimeType: string;
  readonly mediaKind: 'image' | 'audio' | 'video';
  readonly title: string;
  readonly resourceRef: ResourceRef;
}

export class CanvasGeneratedDraftProjectionService {
  private readonly records = new Map<string, RuntimeProjectionRecord>();
  private readonly now: () => string;

  constructor(private readonly options: CanvasGeneratedDraftProjectionServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async upsertFromBoardDelivery(
    request: CanvasBoardDeliveryRequest,
  ): Promise<CanvasGeneratedDraftGroupProjection> {
    const artifact = request.artifact;
    if (artifact.kind !== 'image' && artifact.kind !== 'audio' && artifact.kind !== 'video') {
      throw new Error('Generated draft projection requires image, audio, or video delivery.');
    }
    if (!artifact.resourceRef || !isResourceRef(artifact.resourceRef)) {
      throw new Error('Generated draft projection requires a valid generated-output ResourceRef.');
    }
    if (
      artifact.resourceRef.kind !== 'generated' ||
      artifact.resourceRef.source.kind !== 'generated-asset'
    ) {
      throw new Error('Generated draft projection rejects durable Asset and file ResourceRefs.');
    }

    const taskId = request.provenance.taskId ?? request.target.taskId;
    if (!taskId) {
      throw new Error('Generated draft projection requires frozen task identity.');
    }
    const runId = request.provenance.runId ?? request.target.runId;
    const projectionId = `${CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX}${taskId}${runId ? `:${runId}` : ''}`;
    const candidateAssetId =
      artifact.resourceRef.source.generatedAssetId ??
      (artifact.resourceRef.locator?.kind === 'generated-asset'
        ? artifact.resourceRef.locator.assetId
        : undefined);
    if (!candidateAssetId) {
      throw new Error('Generated draft projection requires generated-output asset identity.');
    }
    const candidateId = `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}${candidateAssetId}`;
    const resolved = await this.options.lifecycle.resolve(artifact.resourceRef);
    const previous = this.records.get(projectionId);
    if (previous && !sameTarget(previous.projection.target, request.target)) {
      throw new Error(
        'Generated draft projection cannot retarget an existing frozen Board review.',
      );
    }

    const position = previous?.projection.position ?? initialGroupPosition(taskId);
    const existingCandidate = previous?.projection.candidates.find(
      (candidate) => candidate.candidateId === candidateId,
    );
    const candidate = createCandidateProjection({
      candidateId,
      title: artifact.title,
      mediaKind: artifact.kind,
      mimeType: artifact.mimeType,
      resourceRef: artifact.resourceRef,
      resolved,
      position:
        existingCandidate?.position ??
        initialCandidatePosition(position, previous?.projection.candidates.length ?? 0),
      previous: existingCandidate,
    });
    const candidates = previous
      ? [
          ...previous.projection.candidates.filter((item) => item.candidateId !== candidateId),
          candidate,
        ]
      : [candidate];
    const timestamp = this.now();
    const projection: CanvasGeneratedDraftGroupProjection = {
      version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
      projectionId,
      taskId,
      ...(runId ? { runId } : {}),
      title: `Generated candidates · ${taskId}`,
      target: request.target,
      position,
      size: groupSizeForCandidates(candidates.length),
      collapsed: previous?.projection.collapsed ?? false,
      pinned: resolved.status === 'ready' || previous?.projection.pinned === true,
      candidates,
      createdAt: previous?.projection.createdAt ?? request.provenance.createdAt,
      updatedAt: timestamp,
    };
    assertValidProjection(projection);

    const sources = new Map(previous?.sources ?? []);
    if (resolved.status === 'ready') {
      if (
        resolved.taskId !== taskId ||
        resolved.mediaKind !== artifact.kind ||
        resolved.assetId !== candidateAssetId
      ) {
        throw new Error('Generated output lifecycle does not match Board delivery identity.');
      }
      await this.options.lifecycle.setReviewPin(artifact.resourceRef, {
        pinned: true,
        ownerId: projectionId,
      });
      sources.set(candidateId, {
        candidateId,
        sourcePath: resolved.sourcePath,
        taskId: resolved.taskId,
        ...(resolved.runId ? { runId: resolved.runId } : {}),
        revision: resolved.revision,
        contentDigest: resolved.contentDigest,
        mimeType: resolved.mimeType,
        mediaKind: artifact.kind,
        title: artifact.title,
        resourceRef: artifact.resourceRef,
      });
    }
    this.records.set(projectionId, { projection, sources });
    await this.options.publisher.publish(projection);
    return projection;
  }

  get(projectionId: string): CanvasGeneratedDraftGroupProjection | undefined {
    return this.records.get(projectionId)?.projection;
  }

  listForBoardPath(targetPath: string): readonly CanvasGeneratedDraftGroupProjection[] {
    return [...this.records.values()]
      .map((record) => record.projection)
      .filter((projection) => projection.target.documentRef.path === targetPath);
  }

  getResolvedSources(
    projectionId: string,
    candidateIds: readonly string[],
  ): readonly ResolvedCandidateSource[] {
    const record = this.records.get(projectionId);
    if (!record) throw new Error(`Generated draft projection not found: ${projectionId}`);
    return candidateIds.map((candidateId) => {
      const source = record.sources.get(candidateId);
      if (!source) throw new Error(`Generated draft candidate source unavailable: ${candidateId}`);
      return source;
    });
  }

  async rebindTargetForRetry(
    projectionId: string,
    target: CanvasGeneratedDraftGroupProjection['target'],
  ): Promise<void> {
    const record = this.records.get(projectionId);
    if (!record) throw new Error(`Generated draft projection not found: ${projectionId}`);
    const current = record.projection.target;
    if (
      current.documentRef.path !== target.documentRef.path ||
      current.documentId !== target.documentId ||
      current.canvasId !== target.canvasId ||
      current.conversationId !== target.conversationId
    ) {
      throw new Error('Generated draft retry cannot retarget a different Board identity.');
    }
    const projection = { ...record.projection, target, updatedAt: this.now() };
    assertValidProjection(projection);
    this.records.set(projectionId, { ...record, projection });
    await this.options.publisher.publish(projection);
  }

  async beginPromotion(projectionId: string, candidateIds: readonly string[]): Promise<void> {
    await this.updateCandidates(projectionId, candidateIds, (candidate) =>
      candidate.state === 'saved-to-assets' || candidate.state === 'added-to-board'
        ? candidate
        : { ...candidate, state: 'promoting', diagnostic: undefined },
    );
  }

  async applyPromotionResult(result: CanvasGeneratedDraftPromotionResult): Promise<void> {
    const diagnostics = validateCanvasGeneratedDraftPromotionResult(result);
    if (diagnostics.length > 0) {
      throw new Error(
        `Invalid generated draft promotion result: ${diagnostics.map(({ code }) => code).join(', ')}`,
      );
    }
    const resultByCandidate = new Map(result.items.map((item) => [item.candidateId, item]));
    await this.updateCandidates(
      result.projectionId,
      result.items.map((item) => item.candidateId),
      (candidate) => {
        const item = resultByCandidate.get(candidate.candidateId);
        if (!item) return candidate;
        return item.status === 'saved'
          ? {
              ...candidate,
              state: 'saved-to-assets',
              promotedAsset: item.asset,
              diagnostic: undefined,
            }
          : {
              ...candidate,
              state: 'failed',
              diagnostic: item.diagnostic.message,
              promotedAsset: undefined,
            };
      },
    );
  }

  async markBoardApplyConflict(
    projectionId: string,
    candidateIds: readonly string[],
    diagnostic: string,
  ): Promise<void> {
    await this.markPromotionFailure(projectionId, candidateIds, diagnostic);
  }

  async markPromotionFailure(
    projectionId: string,
    candidateIds: readonly string[],
    diagnostic: string,
  ): Promise<void> {
    await this.updateCandidates(projectionId, candidateIds, (candidate) => ({
      ...candidate,
      state: candidate.promotedAsset ? 'saved-to-assets' : 'failed',
      diagnostic,
    }));
  }

  async acknowledgeBoardApply(
    projectionId: string,
    candidateIds: readonly string[],
  ): Promise<void> {
    const record = this.records.get(projectionId);
    if (!record) throw new Error(`Generated draft projection not found: ${projectionId}`);
    const selected = new Set(candidateIds);
    const acknowledged: CanvasGeneratedDraftGroupProjection = {
      ...record.projection,
      candidates: record.projection.candidates.map((candidate) =>
        selected.has(candidate.candidateId)
          ? { ...candidate, state: 'added-to-board' as const, diagnostic: undefined }
          : candidate,
      ),
      updatedAt: this.now(),
    };
    assertValidProjection(acknowledged);
    await this.options.publisher.publish(acknowledged);
    await Promise.all(
      acknowledged.candidates
        .filter((candidate) => selected.has(candidate.candidateId))
        .map((candidate) =>
          this.options.lifecycle.setReviewPin(candidate.resourceRef, {
            pinned: false,
            ownerId: projectionId,
          }),
        ),
    );

    const remainingCandidates = acknowledged.candidates.filter(
      (candidate) => !selected.has(candidate.candidateId),
    );
    if (remainingCandidates.length === 0) {
      this.records.delete(projectionId);
      await this.options.publisher.remove(projectionId, acknowledged.target.documentRef.path);
      return;
    }
    const sources = new Map(record.sources);
    for (const candidateId of selected) sources.delete(candidateId);
    const projection = {
      ...acknowledged,
      candidates: remainingCandidates,
      size: groupSizeForCandidates(remainingCandidates.length),
      updatedAt: this.now(),
    };
    assertValidProjection(projection);
    this.records.set(projectionId, { projection, sources });
    await this.options.publisher.publish(projection);
  }

  async disposeProjection(projectionId: string, discardUnsaved: boolean): Promise<void> {
    const record = this.records.get(projectionId);
    if (!record) throw new Error(`Generated draft projection not found: ${projectionId}`);
    const promoting = record.projection.candidates.filter(
      (candidate) => candidate.state === 'promoting',
    );
    if (promoting.length > 0) {
      throw new Error('Generated draft promotion is in progress and cannot be discarded.');
    }
    const unsaved = record.projection.candidates.filter(
      (candidate) => candidate.state !== 'saved-to-assets' && candidate.state !== 'added-to-board',
    );
    if (unsaved.length > 0 && !discardUnsaved) {
      throw new Error('Generated draft projection still contains unsaved candidates.');
    }
    await Promise.all(
      record.projection.candidates.map((candidate) =>
        this.options.lifecycle.setReviewPin(candidate.resourceRef, {
          pinned: false,
          ownerId: projectionId,
        }),
      ),
    );
    this.records.delete(projectionId);
    await this.options.publisher.remove(projectionId, record.projection.target.documentRef.path);
  }

  private async updateCandidates(
    projectionId: string,
    candidateIds: readonly string[],
    update: (
      candidate: CanvasGeneratedDraftCandidateProjection,
    ) => CanvasGeneratedDraftCandidateProjection,
  ): Promise<void> {
    const record = this.records.get(projectionId);
    if (!record) throw new Error(`Generated draft projection not found: ${projectionId}`);
    const selected = new Set(candidateIds);
    if (selected.size !== candidateIds.length) {
      throw new Error('Generated draft candidate selection contains duplicates.');
    }
    for (const candidateId of selected) {
      if (
        !record.projection.candidates.some((candidate) => candidate.candidateId === candidateId)
      ) {
        throw new Error(`Generated draft candidate not found: ${candidateId}`);
      }
    }
    const projection = {
      ...record.projection,
      candidates: record.projection.candidates.map((candidate) =>
        selected.has(candidate.candidateId) ? update(candidate) : candidate,
      ),
      updatedAt: this.now(),
    };
    assertValidProjection(projection);
    this.records.set(projectionId, { ...record, projection });
    await this.options.publisher.publish(projection);
  }
}

function createCandidateProjection(input: {
  readonly candidateId: string;
  readonly title: string;
  readonly mediaKind: 'image' | 'audio' | 'video';
  readonly mimeType?: string;
  readonly resourceRef: ResourceRef;
  readonly resolved: NekoAgentGeneratedOutputResolution;
  readonly position: { readonly x: number; readonly y: number };
  readonly previous?: CanvasGeneratedDraftCandidateProjection;
}): CanvasGeneratedDraftCandidateProjection {
  if (input.resolved.status === 'unavailable') {
    return {
      candidateId: input.candidateId,
      title: input.title,
      mediaKind: input.mediaKind,
      mimeType:
        input.mimeType ??
        readResourceMetadata(input.resourceRef, 'mimeType') ??
        'application/octet-stream',
      revision: readResourceMetadata(input.resourceRef, 'revision') ?? 'unavailable',
      contentDigest:
        readResourceMetadata(input.resourceRef, 'contentDigest') ??
        input.resourceRef.fingerprint.value,
      resourceRef: input.resourceRef,
      state: 'unavailable',
      diagnostic: input.resolved.diagnostic,
      position: input.position,
      size: candidateSize(input.mediaKind),
    };
  }
  return {
    candidateId: input.candidateId,
    title: input.title,
    mediaKind: input.mediaKind,
    mimeType: input.resolved.mimeType,
    revision: input.resolved.revision,
    contentDigest: input.resolved.contentDigest,
    resourceRef: input.resourceRef,
    state: input.previous?.state ?? 'unsaved',
    position: input.position,
    size: input.previous?.size ?? candidateSize(input.mediaKind),
    ...(input.previous?.promotedAsset ? { promotedAsset: input.previous.promotedAsset } : {}),
    ...(input.previous?.diagnostic ? { diagnostic: input.previous.diagnostic } : {}),
  };
}

function initialGroupPosition(taskId: string): { x: number; y: number } {
  let hash = 0;
  for (const character of taskId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return { x: 80 + (hash % 3) * 80, y: 80 + (Math.floor(hash / 3) % 3) * 60 };
}

function initialCandidatePosition(
  groupPosition: { readonly x: number; readonly y: number },
  index: number,
): { x: number; y: number } {
  return {
    x: groupPosition.x + 28 + (index % 2) * 340,
    y: groupPosition.y + 72 + Math.floor(index / 2) * 240,
  };
}

function groupSizeForCandidates(count: number): { width: number; height: number } {
  return {
    width: count > 1 ? 716 : 376,
    height: 100 + Math.max(1, Math.ceil(count / 2)) * 240,
  };
}

function candidateSize(mediaKind: 'image' | 'audio' | 'video'): { width: number; height: number } {
  return mediaKind === 'audio' ? { width: 312, height: 96 } : { width: 312, height: 200 };
}

function readResourceMetadata(resourceRef: ResourceRef, key: string): string | undefined {
  const value = resourceRef.source.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function sameTarget(
  left: CanvasGeneratedDraftGroupProjection['target'],
  right: CanvasGeneratedDraftGroupProjection['target'],
): boolean {
  return (
    left.documentRef.path === right.documentRef.path &&
    left.documentId === right.documentId &&
    left.canvasId === right.canvasId &&
    left.revision === right.revision
  );
}

function assertValidProjection(projection: CanvasGeneratedDraftGroupProjection): void {
  const diagnostics = validateCanvasGeneratedDraftGroupProjection(projection);
  if (diagnostics.length > 0) {
    throw new Error(
      `Invalid generated draft projection: ${diagnostics.map((diagnostic) => diagnostic.code).join(', ')}`,
    );
  }
}
