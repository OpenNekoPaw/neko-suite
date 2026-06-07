import type {
  ArtifactDiagnostic,
  ArtifactJsonValue,
  CompositeArtifact,
  DeriveShotImagePrepPlansInput,
  DeriveShotImagePrepPlansResult,
  ShotImagePrepDiagnostic,
  ShotImagePrepPlan,
  StoryboardTable,
} from '@neko/shared';
import {
  buildComicShotAssetPrepTable,
  deriveShotImagePrepPlansFromStoryboard,
  validateShotImagePrepPlans,
} from '@neko/shared';

export interface ShotImagePrepArtifactInput {
  readonly artifactId: string;
  readonly title: string;
  readonly plans: readonly ShotImagePrepPlan[];
  readonly diagnostics?: readonly ShotImagePrepDiagnostic[];
  readonly storyboardId?: string;
  readonly sourceArtifactIds?: readonly string[];
  readonly createdAt?: string;
}

export interface StoryboardShotImagePrepArtifactInput extends Omit<
  ShotImagePrepArtifactInput,
  'plans' | 'diagnostics'
> {
  readonly table: StoryboardTable;
  readonly requirePerceptionForSourceBacked?: boolean;
  readonly providerDiagnostics?: readonly ShotImagePrepDiagnostic[];
}

export interface StoryboardShotImagePrepArtifactResult extends DeriveShotImagePrepPlansResult {
  readonly artifact: CompositeArtifact;
}

export function buildShotImagePrepReviewArtifact(
  input: ShotImagePrepArtifactInput,
): CompositeArtifact {
  const validation = validateShotImagePrepPlans(input.plans, {
    requirePerceptionForSourceBacked: false,
  });
  const diagnostics = [...(input.diagnostics ?? []), ...validation.diagnostics].map(
    projectShotImagePrepDiagnostic,
  );
  const table = buildComicShotAssetPrepTable(input.plans, {
    tableId: `${input.artifactId}-table`,
    title: input.title,
    includeProfileVersion: true,
  });

  return {
    schemaVersion: 1,
    kind: 'composite-artifact',
    artifactId: input.artifactId,
    profile: 'comic-shot-image-prep-review',
    profileVersion: 1,
    title: input.title,
    blocks: [
      {
        blockId: 'shot-image-prep-summary',
        kind: 'text',
        title: 'Shot Image Prep',
        text: summaryText(input.plans),
        format: 'plain',
      },
      {
        blockId: 'comic-shot-asset-prep',
        kind: 'table',
        title: 'Comic Shot Asset Prep',
        table,
      },
      ...(diagnostics.length > 0
        ? [
            {
              blockId: 'shot-image-prep-diagnostics',
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
      ...(input.sourceArtifactIds ? { sourceArtifactIds: input.sourceArtifactIds } : {}),
    },
    extensions: {
      'neko.shotImagePrep': {
        ...(input.storyboardId ? { storyboardId: input.storyboardId } : {}),
        planIds: input.plans.map((plan) => plan.planId),
        planCount: input.plans.length,
      },
      'neko.shotImagePrepPayload': input.plans.map((plan) => toArtifactJsonValue(plan)),
    },
  };
}

export function buildStoryboardShotImagePrepReviewArtifact(
  input: StoryboardShotImagePrepArtifactInput,
): StoryboardShotImagePrepArtifactResult {
  const derivationInput: DeriveShotImagePrepPlansInput = {
    table: input.table,
    ...(input.storyboardId ? { storyboardId: input.storyboardId } : {}),
    ...(input.requirePerceptionForSourceBacked !== undefined
      ? { requirePerceptionForSourceBacked: input.requirePerceptionForSourceBacked }
      : {}),
  };
  const result = deriveShotImagePrepPlansFromStoryboard(derivationInput);
  const diagnostics = [...result.diagnostics, ...(input.providerDiagnostics ?? [])];
  return {
    plans: result.plans,
    diagnostics,
    artifact: buildShotImagePrepReviewArtifact({
      artifactId: input.artifactId,
      title: input.title,
      plans: result.plans,
      diagnostics,
      ...(input.storyboardId ? { storyboardId: input.storyboardId } : {}),
      ...(input.sourceArtifactIds ? { sourceArtifactIds: input.sourceArtifactIds } : {}),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    }),
  };
}

function summaryText(plans: readonly ShotImagePrepPlan[]): string {
  if (plans.length === 0) return 'No shot image prep plans were derived.';
  const counts = plans.reduce<Record<string, number>>((acc, plan) => {
    acc[plan.status] = (acc[plan.status] ?? 0) + 1;
    return acc;
  }, {});
  const statusSummary = Object.entries(counts)
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ');
  return `Review ${plans.length} shot image prep plan(s) before executing generation or transform actions. ${statusSummary}.`;
}

function projectShotImagePrepDiagnostic(diagnostic: ShotImagePrepDiagnostic): ArtifactDiagnostic {
  return {
    severity: diagnostic.severity,
    code: mapDiagnosticCode(diagnostic.code),
    path: diagnostic.path,
    message: diagnostic.message,
    ...(diagnostic.expected ? { expected: diagnostic.expected } : {}),
    ...(diagnostic.actual !== undefined ? { actual: diagnostic.actual } : {}),
    ...(diagnostic.details ? { details: diagnostic.details } : {}),
  };
}

function mapDiagnosticCode(code: ShotImagePrepDiagnostic['code']): ArtifactDiagnostic['code'] {
  switch (code) {
    case 'invalid-root':
      return 'invalid-root';
    case 'invalid-schema-version':
      return 'invalid-schema-version';
    case 'invalid-kind':
      return 'invalid-kind';
    case 'missing-required-field':
      return 'missing-required-field';
    case 'unsafe-runtime-handle':
      return 'unsafe-runtime-handle';
    case 'invalid-source-ref':
      return 'invalid-resource-ref';
    case 'non-serializable-value':
    case 'oversized-payload':
      return 'non-serializable-value';
    case 'missing-capability':
      return 'missing-capability';
    case 'provider-unavailable':
      return 'provider-unavailable';
    case 'missing-cost-estimate':
      return 'missing-required-field';
    case 'budget-exceeded':
      return 'invalid-required-field';
    case 'invalid-image-strategy':
    case 'invalid-operation':
    case 'invalid-status':
    case 'invalid-required-field':
    case 'invalid-entity-ref':
    case 'missing-perception-card':
      return 'invalid-required-field';
  }
}

function toArtifactJsonValue(value: unknown): ArtifactJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toArtifactJsonValue(item));
  }
  if (isRecord(value)) {
    const record: Record<string, ArtifactJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) record[key] = toArtifactJsonValue(item);
    }
    return record;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
