import type {
  ArtifactDiagnostic,
  ArtifactDiagnosticCode,
  ArtifactJsonValue,
  CharacterMemoryDiagnostic,
  CharacterMemoryDiagnosticCode,
  CharacterObservation,
  CharacterMemoryReviewStatus,
  CompositeArtifact,
  CompositeArtifactBlock,
  EntityMemoryContribution,
  EntityMemoryContributionReviewPolicy,
  GenericTable,
  GenericTableCell,
  GenericTableRow,
  MediaTextSegment,
} from '@neko/shared';

export interface CharacterMemoryArtifactInput {
  readonly artifactId: string;
  readonly title: string;
  readonly artifactProfile?: string;
  readonly observations: readonly CharacterObservation[];
  readonly diagnostics?: readonly CharacterMemoryDiagnostic[];
  readonly createdAt?: string;
}

export interface EntityMemoryContributionArtifactInput {
  readonly artifactId: string;
  readonly title: string;
  readonly contribution: EntityMemoryContribution;
  readonly createdAt?: string;
}

export interface EntityMemoryContributionBuildInput {
  readonly contributionId: string;
  readonly sourcePackage: string;
  readonly sourceRef: EntityMemoryContribution['sourceRef'];
  readonly reviewPolicy: EntityMemoryContributionReviewPolicy;
  readonly characterObservations?: readonly CharacterObservation[];
  readonly mediaTextSegments?: readonly MediaTextSegment[];
  readonly semanticTags?: EntityMemoryContribution['semanticTags'];
  readonly diagnostics?: EntityMemoryContribution['diagnostics'];
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly metadata?: EntityMemoryContribution['metadata'];
  readonly defaultObservationReviewStatus?: Exclude<CharacterMemoryReviewStatus, 'accepted'>;
}

export function buildEntityMemoryContribution(
  input: EntityMemoryContributionBuildInput,
): EntityMemoryContribution {
  const defaultObservationReviewStatus =
    input.defaultObservationReviewStatus ?? defaultReviewStatusForPolicy(input.reviewPolicy);
  const characterObservations = input.characterObservations?.map((observation) =>
    normalizeContributionObservation(observation, defaultObservationReviewStatus),
  );
  return {
    contributionId: input.contributionId,
    sourcePackage: input.sourcePackage,
    sourceRef: input.sourceRef,
    reviewPolicy: input.reviewPolicy,
    ...(characterObservations && characterObservations.length > 0 ? { characterObservations } : {}),
    ...(input.mediaTextSegments && input.mediaTextSegments.length > 0
      ? { mediaTextSegments: input.mediaTextSegments }
      : {}),
    ...(input.semanticTags && input.semanticTags.length > 0
      ? { semanticTags: input.semanticTags }
      : {}),
    ...(input.diagnostics && input.diagnostics.length > 0
      ? { diagnostics: input.diagnostics }
      : {}),
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function buildCharacterMemoryReviewArtifact(
  input: CharacterMemoryArtifactInput,
): CompositeArtifact {
  const table = buildCharacterObservationTable(input.observations);
  const diagnostics = (input.diagnostics ?? []).map(projectCharacterMemoryDiagnostic);
  return {
    schemaVersion: 1,
    kind: 'composite-artifact',
    artifactId: input.artifactId,
    profile: input.artifactProfile ?? 'character-memory-artifact-review',
    title: input.title,
    blocks: [
      {
        blockId: 'character-memory-summary',
        kind: 'text',
        title: 'Character Memory Review',
        text:
          input.observations.length === 0
            ? 'No character observations were extracted.'
            : `Review ${input.observations.length} character observation(s) before accepting them into project memory.`,
        format: 'plain',
      },
      {
        blockId: 'character-observations',
        kind: 'table',
        title: 'Character Observations',
        table,
      },
      ...(diagnostics.length > 0
        ? [
            {
              blockId: 'character-memory-diagnostics',
              kind: 'diagnostic' as const,
              diagnostics,
            },
          ]
        : []),
    ],
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    provenance: {
      source: 'agent',
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
  };
}

export function buildEntityMemoryContributionReviewArtifact(
  input: EntityMemoryContributionArtifactInput,
): CompositeArtifact {
  const observations = input.contribution.characterObservations ?? [];
  const mediaTextSegments = input.contribution.mediaTextSegments ?? [];
  const diagnostics = (input.contribution.diagnostics ?? []).map(projectContributionDiagnostic);
  const blocks: CompositeArtifactBlock[] = [
    {
      blockId: 'entity-memory-contribution-summary',
      kind: 'text',
      title: 'Entity Memory Contribution',
      text:
        `Review contribution ${input.contribution.contributionId} from ${input.contribution.sourcePackage}. ` +
        `Policy ${input.contribution.reviewPolicy} does not confirm facts automatically.`,
      format: 'plain',
    },
  ];

  if (observations.length > 0) {
    blocks.push({
      blockId: 'character-observations',
      kind: 'table',
      title: 'Character Observations',
      table: buildCharacterObservationTable(observations),
    });
  }

  if (mediaTextSegments.length > 0) {
    blocks.push({
      blockId: 'media-text-segments',
      kind: 'table',
      title: 'Media Text Evidence',
      table: buildMediaTextSegmentTable(mediaTextSegments),
    });
  }

  if (diagnostics.length > 0) {
    blocks.push({
      blockId: 'entity-memory-contribution-diagnostics',
      kind: 'diagnostic',
      diagnostics,
    });
  }

  return {
    schemaVersion: 1,
    kind: 'composite-artifact',
    artifactId: input.artifactId,
    profile: 'entity-memory-contribution-review',
    title: input.title,
    blocks,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    provenance: {
      source: 'agent',
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
    extensions: {
      'neko.entityMemoryContribution': {
        contributionId: input.contribution.contributionId,
        sourcePackage: input.contribution.sourcePackage,
        sourceRef: toArtifactJsonValue(input.contribution.sourceRef),
        reviewPolicy: input.contribution.reviewPolicy,
      },
      'neko.entityMemoryContributionPayload': toArtifactJsonValue(input.contribution),
    },
  };
}

export function buildCharacterObservationTable(
  observations: readonly CharacterObservation[],
): GenericTable {
  return {
    schemaVersion: 1,
    kind: 'generic-table',
    tableId: 'character-observations',
    profile: 'character-memory-review',
    title: 'Character Observations',
    columns: [
      { columnId: 'observationId', label: 'Observation', cellType: 'string', required: true },
      { columnId: 'identity', label: 'Identity', cellType: 'string' },
      { columnId: 'reviewStatus', label: 'Review Status', cellType: 'status', required: true },
      { columnId: 'dimensions', label: 'Dimensions', cellType: 'tags' },
      { columnId: 'traits', label: 'Traits', cellType: 'json' },
      { columnId: 'source', label: 'Source', cellType: 'json' },
    ],
    rows: observations.map(projectObservationRow),
    actions: [
      {
        actionId: 'character-memory.review',
        kind: 'review',
        label: 'Review Character Memory',
        requiresApproval: true,
      },
    ],
  };
}

export function buildMediaTextSegmentTable(segments: readonly MediaTextSegment[]): GenericTable {
  return {
    schemaVersion: 1,
    kind: 'generic-table',
    tableId: 'media-text-segments',
    profile: 'media-text-evidence-review',
    title: 'Media Text Evidence',
    columns: [
      { columnId: 'segmentId', label: 'Segment', cellType: 'string', required: true },
      { columnId: 'kind', label: 'Kind', cellType: 'string', required: true },
      { columnId: 'text', label: 'Text', cellType: 'string', required: true },
      { columnId: 'source', label: 'Source', cellType: 'json' },
      { columnId: 'confidence', label: 'Confidence', cellType: 'number' },
    ],
    rows: segments.map(projectMediaTextSegmentRow),
    actions: [
      {
        actionId: 'entity-memory-contribution.review',
        kind: 'review',
        label: 'Review Evidence',
        requiresApproval: true,
      },
    ],
  };
}

function projectObservationRow(observation: CharacterObservation): GenericTableRow {
  const identity =
    observation.entityRef?.entityId ??
    observation.candidate?.name ??
    observation.mention?.text ??
    observation.candidateId ??
    'unresolved';
  return {
    rowId: observation.observationId,
    status:
      observation.reviewStatus === 'accepted'
        ? 'approved'
        : observation.reviewStatus === 'rejected'
          ? 'rejected'
          : observation.reviewStatus === 'conflict'
            ? 'blocked'
            : 'needs-review',
    cells: {
      observationId: { type: 'string', value: observation.observationId },
      identity: { type: 'string', value: identity },
      reviewStatus: { type: 'status', value: observation.reviewStatus },
      dimensions: {
        type: 'tags',
        value: observation.dimensions.map((dimension) => dimension.dimension),
      },
      traits: {
        type: 'json',
        value: {
          confidence: observation.confidence ?? null,
          traits: observation.dimensions.map((dimension) => ({
            dimension: dimension.dimension,
            value: dimension.value,
            confidence: dimension.confidence ?? null,
            note: dimension.note ?? null,
          })),
        },
      },
      source: {
        type: 'json',
        value: {
          source: observation.provenance.source,
          sourceRef: toArtifactJsonValue(observation.sourceRef),
          toolCallId: observation.provenance.toolCallId ?? null,
        },
      },
    },
    actions: [
      {
        actionId: `character-memory.accept.${observation.observationId}`,
        kind: 'review',
        label: 'Accept',
        capabilityId: 'character-memory.review.accept',
        targetPackageId: 'neko-agent',
        risk: 'medium',
        requiresApproval: true,
        metadata: {
          reviewOperation: 'accept',
          observationId: observation.observationId,
          delegatedLifecycle: true,
        },
      },
      {
        actionId: `character-memory.reject.${observation.observationId}`,
        kind: 'review',
        label: 'Reject',
        capabilityId: 'character-memory.review.reject',
        targetPackageId: 'neko-agent',
        risk: 'low',
        requiresApproval: true,
        metadata: {
          reviewOperation: 'reject',
          observationId: observation.observationId,
          delegatedLifecycle: true,
        },
      },
      {
        actionId: `character-memory.conflict.${observation.observationId}`,
        kind: 'review',
        label: 'Conflict',
        capabilityId: 'character-memory.review.conflict',
        targetPackageId: 'neko-agent',
        risk: 'medium',
        requiresApproval: true,
        metadata: {
          reviewOperation: 'conflict',
          observationId: observation.observationId,
          delegatedLifecycle: true,
        },
      },
      {
        actionId: `character-memory.supersede.${observation.observationId}`,
        kind: 'review',
        label: 'Supersede',
        capabilityId: 'character-memory.review.supersede',
        targetPackageId: 'neko-agent',
        risk: 'medium',
        requiresApproval: true,
        metadata: {
          reviewOperation: 'supersede',
          observationId: observation.observationId,
          delegatedLifecycle: true,
        },
      },
    ],
  };
}

function projectMediaTextSegmentRow(segment: MediaTextSegment): GenericTableRow {
  const cells: Record<string, GenericTableCell> = {
    segmentId: { type: 'string', value: segment.segmentId },
    kind: { type: 'string', value: segment.kind },
    text: { type: 'string', value: segment.text },
    source: {
      type: 'json',
      value: {
        sourceKind: segment.provenance.sourceKind,
        providerId: segment.provenance.providerId,
        sourceRef: toArtifactJsonValue(segment.sourceRef),
      },
    },
  };

  if (typeof segment.confidence === 'number') {
    cells.confidence = { type: 'number', value: segment.confidence };
  }

  return {
    rowId: segment.segmentId,
    status: 'needs-review',
    cells,
    actions: [
      {
        actionId: `media-text-evidence.review.${segment.segmentId}`,
        kind: 'review',
        label: 'Review',
        requiresApproval: true,
      },
    ],
  };
}

function toArtifactJsonValue(value: unknown): ArtifactJsonValue {
  if (isArtifactJsonPrimitive(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toArtifactJsonValue(item));
  }
  if (isRecord(value)) {
    const record: Record<string, ArtifactJsonValue> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      if (entryValue !== undefined) {
        record[key] = toArtifactJsonValue(entryValue);
      }
    }
    return record;
  }
  return null;
}

function isArtifactJsonPrimitive(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function projectCharacterMemoryDiagnostic(
  diagnostic: CharacterMemoryDiagnostic,
): ArtifactDiagnostic {
  return {
    severity: diagnostic.severity === 'info' ? 'info' : diagnostic.severity,
    code: mapCharacterMemoryDiagnosticCode(diagnostic.code),
    path: diagnostic.path,
    message: diagnostic.message,
    ...(diagnostic.expected ? { expected: diagnostic.expected } : {}),
    ...(diagnostic.actual !== undefined ? { actual: diagnostic.actual } : {}),
    ...(diagnostic.details ? { details: diagnostic.details } : {}),
  };
}

function projectContributionDiagnostic(
  diagnostic: NonNullable<EntityMemoryContribution['diagnostics']>[number],
): ArtifactDiagnostic {
  const details = {
    ...(diagnostic.details ?? {}),
    contributionDiagnosticCode: diagnostic.code,
  };
  return {
    severity: diagnostic.severity === 'info' ? 'info' : diagnostic.severity,
    code: mapContributionDiagnosticCode(diagnostic.code),
    path: diagnostic.path ?? [],
    message: diagnostic.message,
    details,
  };
}

function defaultReviewStatusForPolicy(
  reviewPolicy: EntityMemoryContributionReviewPolicy,
): Exclude<CharacterMemoryReviewStatus, 'accepted'> {
  return reviewPolicy === 'draft-only' ? 'draft' : 'needs-review';
}

function normalizeContributionObservation(
  observation: CharacterObservation,
  reviewStatus: Exclude<CharacterMemoryReviewStatus, 'accepted'>,
): CharacterObservation {
  if (observation.reviewStatus === reviewStatus) return observation;
  if (
    observation.reviewStatus === 'rejected' ||
    observation.reviewStatus === 'conflict' ||
    observation.reviewStatus === 'superseded'
  ) {
    return observation;
  }
  return {
    ...observation,
    reviewStatus,
  };
}

function mapCharacterMemoryDiagnosticCode(
  code: CharacterMemoryDiagnosticCode,
): ArtifactDiagnosticCode {
  switch (code) {
    case 'missing-representation':
      return 'missing-capability';
    case 'unsafe-runtime-handle':
      return 'unsafe-runtime-handle';
    case 'non-serializable-value':
      return 'non-serializable-value';
    case 'missing-required-field':
      return 'missing-required-field';
    case 'invalid-source-ref':
      return 'invalid-resource-ref';
    case 'invalid-dimension':
    case 'invalid-extension-namespace':
      return 'invalid-profile';
    case 'invalid-root':
    case 'invalid-version':
    case 'invalid-required-field':
    case 'invalid-review-status':
    case 'invalid-confidence':
    case 'invalid-entity-ref':
    case 'oversized-payload':
    case 'observation-conflict':
      return 'invalid-required-field';
  }
}

function mapContributionDiagnosticCode(code: string): ArtifactDiagnosticCode {
  switch (code) {
    case 'missing-capability':
    case 'provider-unavailable':
    case 'invalid-profile':
    case 'invalid-resource-ref':
    case 'unsafe-runtime-handle':
    case 'non-serializable-value':
    case 'missing-required-field':
    case 'invalid-required-field':
      return code;
    case 'invalid-source-ref':
      return 'invalid-resource-ref';
    case 'invalid-dimension':
    case 'invalid-extension-namespace':
      return 'invalid-profile';
    default:
      return 'invalid-required-field';
  }
}
