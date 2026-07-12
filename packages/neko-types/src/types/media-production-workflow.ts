import type { GeneratedAssetRevisionRef } from './generated-asset-lifecycle';
import {
  validateQualityTarget,
  type QualityGateVerdict,
  type QualityProjectRef,
  type QualityTarget,
} from './media-quality';
import {
  isRuntimeOnlyResourceIdentityValue,
  validateDurableResourceRef,
} from './durable-resource-ref';
import type { ResourceRef } from './resource-cache';

export const MEDIA_PRODUCTION_WORKFLOW_VERSION = 1 as const;

const ARTIFACT_PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/;

export const MEDIA_PRODUCTION_STAGE_IDS = [
  'source-normalization',
  'storyboard-validation',
  'shot-generation-planning',
  'media-generation',
  'asset-quality-gate',
  'project-authoring',
  'pre-export-gate',
  'export',
  'deliverable-verification',
] as const;

export type MediaProductionStageId = (typeof MEDIA_PRODUCTION_STAGE_IDS)[number];
export type MediaProductionRunStatus =
  'pending' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled';
export type MediaProductionStageStatus =
  'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type MediaProductionWorkflowDiagnosticCode =
  | 'invalid-workflow-state'
  | 'invalid-stage-transition'
  | 'missing-stage-artifact'
  | 'unstable-stage-artifact'
  | 'stale-stage-artifact'
  | 'stage-blocked';

export interface MediaProductionWorkflowDiagnostic {
  readonly code: MediaProductionWorkflowDiagnosticCode;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly stageId?: MediaProductionStageId;
  readonly path?: readonly (string | number)[];
}

interface MediaProductionStageArtifactBase {
  readonly artifactId: string;
  readonly profileId: string;
  readonly createdAt: string;
  readonly producerStageId: MediaProductionStageId;
  readonly sourceArtifactIds: readonly string[];
}

export interface MediaProductionResourceArtifactRef extends MediaProductionStageArtifactBase {
  readonly kind: 'resource';
  readonly resourceRef: ResourceRef;
  readonly revision: string;
  readonly contentDigest?: string;
}

export interface MediaProductionProjectArtifactRef extends MediaProductionStageArtifactBase {
  readonly kind: 'project';
  readonly projectRef: QualityProjectRef;
}

export interface MediaProductionQualityGateArtifactRef extends MediaProductionStageArtifactBase {
  readonly kind: 'quality-gate';
  readonly gateResultId: string;
  readonly target: QualityTarget;
  readonly verdict: QualityGateVerdict;
}

export type MediaProductionStageArtifactRef =
  | MediaProductionResourceArtifactRef
  | MediaProductionProjectArtifactRef
  | MediaProductionQualityGateArtifactRef;

export interface MediaProductionStageState {
  readonly stageId: MediaProductionStageId;
  readonly status: MediaProductionStageStatus;
  readonly attempt: number;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly artifacts: readonly MediaProductionStageArtifactRef[];
  readonly diagnostics: readonly MediaProductionWorkflowDiagnostic[];
}

export interface MediaProductionWorkflowRunState {
  readonly version: typeof MEDIA_PRODUCTION_WORKFLOW_VERSION;
  readonly workflowRunId: string;
  readonly sourceProfileId: string;
  readonly status: MediaProductionRunStatus;
  readonly stages: readonly MediaProductionStageState[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly diagnostics: readonly MediaProductionWorkflowDiagnostic[];
}

export interface MediaProductionWorkflowValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly MediaProductionWorkflowDiagnostic[];
}

export function createMediaProductionWorkflowRun(input: {
  readonly workflowRunId: string;
  readonly sourceProfileId: string;
  readonly createdAt: string;
}): MediaProductionWorkflowRunState {
  assertNonEmpty(input.workflowRunId, 'workflowRunId');
  assertNonEmpty(input.sourceProfileId, 'sourceProfileId');
  assertIsoTimestamp(input.createdAt, 'createdAt');

  return {
    version: MEDIA_PRODUCTION_WORKFLOW_VERSION,
    workflowRunId: input.workflowRunId,
    sourceProfileId: input.sourceProfileId,
    status: 'pending',
    stages: MEDIA_PRODUCTION_STAGE_IDS.map((stageId) => ({
      stageId,
      status: 'pending',
      attempt: 0,
      artifacts: [],
      diagnostics: [],
    })),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    diagnostics: [],
  };
}

export function createGeneratedAssetStageArtifactRef(input: {
  readonly lifecycle: GeneratedAssetRevisionRef;
  readonly profileId: string;
  readonly producerStageId: MediaProductionStageId;
  readonly createdAt: string;
  readonly sourceArtifactIds?: readonly string[];
}): MediaProductionResourceArtifactRef {
  return {
    kind: 'resource',
    artifactId: input.lifecycle.assetId,
    profileId: input.profileId,
    createdAt: input.createdAt,
    producerStageId: input.producerStageId,
    sourceArtifactIds: input.sourceArtifactIds ?? [],
    resourceRef: input.lifecycle.resourceRef,
    revision: input.lifecycle.revision,
    contentDigest: input.lifecycle.contentDigest,
  };
}

export function startMediaProductionStage(input: {
  readonly state: MediaProductionWorkflowRunState;
  readonly stageId: MediaProductionStageId;
  readonly startedAt: string;
}): MediaProductionWorkflowRunState {
  assertIsoTimestamp(input.startedAt, 'startedAt');
  const stageIndex = getStageIndex(input.stageId);
  const stage = input.state.stages[stageIndex];
  assertCanonicalState(input.state);
  if (!stage || stage.status !== 'pending') {
    throw new Error(`Media production stage ${input.stageId} is not pending.`);
  }
  const incompleteDependency = input.state.stages
    .slice(0, stageIndex)
    .find((candidate) => candidate.status !== 'completed');
  if (incompleteDependency) {
    throw new Error(
      `Media production stage ${input.stageId} cannot start before ${incompleteDependency.stageId} completes.`,
    );
  }

  return replaceStage(
    input.state,
    stageIndex,
    {
      ...stage,
      status: 'running',
      attempt: stage.attempt + 1,
      startedAt: input.startedAt,
      completedAt: undefined,
      diagnostics: [],
    },
    input.startedAt,
    'running',
  );
}

export function completeMediaProductionStage(input: {
  readonly state: MediaProductionWorkflowRunState;
  readonly stageId: MediaProductionStageId;
  readonly completedAt: string;
  readonly artifacts: readonly MediaProductionStageArtifactRef[];
  readonly diagnostics?: readonly MediaProductionWorkflowDiagnostic[];
}): MediaProductionWorkflowRunState {
  assertIsoTimestamp(input.completedAt, 'completedAt');
  const stageIndex = getStageIndex(input.stageId);
  const stage = input.state.stages[stageIndex];
  assertCanonicalState(input.state);
  if (!stage || stage.status !== 'running') {
    throw new Error(`Media production stage ${input.stageId} is not running.`);
  }
  assertStageArtifacts(input.stageId, input.artifacts);
  const diagnostics = input.diagnostics ?? [];
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new Error(`Completed media production stage ${input.stageId} cannot contain errors.`);
  }
  const isFinalStage = stageIndex === MEDIA_PRODUCTION_STAGE_IDS.length - 1;

  return replaceStage(
    input.state,
    stageIndex,
    {
      ...stage,
      status: 'completed',
      completedAt: input.completedAt,
      artifacts: [...input.artifacts],
      diagnostics: [...diagnostics],
    },
    input.completedAt,
    isFinalStage ? 'completed' : 'running',
  );
}

export function failMediaProductionStage(input: {
  readonly state: MediaProductionWorkflowRunState;
  readonly stageId: MediaProductionStageId;
  readonly failedAt: string;
  readonly diagnostics: readonly MediaProductionWorkflowDiagnostic[];
}): MediaProductionWorkflowRunState {
  assertIsoTimestamp(input.failedAt, 'failedAt');
  const stageIndex = getStageIndex(input.stageId);
  const stage = input.state.stages[stageIndex];
  assertCanonicalState(input.state);
  if (!stage || stage.status !== 'running') {
    throw new Error(`Media production stage ${input.stageId} is not running.`);
  }
  if (!input.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new Error(`Failed media production stage ${input.stageId} requires an error diagnostic.`);
  }

  return replaceStage(
    input.state,
    stageIndex,
    {
      ...stage,
      status: 'failed',
      completedAt: input.failedAt,
      diagnostics: [...input.diagnostics],
    },
    input.failedAt,
    'blocked',
    input.diagnostics,
  );
}

export function cancelMediaProductionWorkflow(input: {
  readonly state: MediaProductionWorkflowRunState;
  readonly cancelledAt: string;
}): MediaProductionWorkflowRunState {
  assertIsoTimestamp(input.cancelledAt, 'cancelledAt');
  assertCanonicalState(input.state);
  if (input.state.status === 'completed' || input.state.status === 'failed') {
    throw new Error(`Media production workflow ${input.state.workflowRunId} is terminal.`);
  }

  return {
    ...input.state,
    status: 'cancelled',
    stages: input.state.stages.map((stage) =>
      stage.status === 'running'
        ? { ...stage, status: 'cancelled', completedAt: input.cancelledAt }
        : stage,
    ),
    updatedAt: input.cancelledAt,
  };
}

export function getNextMediaProductionStage(
  state: MediaProductionWorkflowRunState,
): MediaProductionStageState | undefined {
  assertCanonicalState(state);
  return state.stages.find((stage) => stage.status === 'pending');
}

export function validateMediaProductionWorkflowRun(
  state: MediaProductionWorkflowRunState,
): MediaProductionWorkflowValidationResult {
  const diagnostics: MediaProductionWorkflowDiagnostic[] = [];
  if (
    state.version !== MEDIA_PRODUCTION_WORKFLOW_VERSION ||
    !state.workflowRunId.trim() ||
    !state.sourceProfileId.trim() ||
    !isIsoTimestamp(state.createdAt) ||
    !isIsoTimestamp(state.updatedAt)
  ) {
    diagnostics.push({
      code: 'invalid-workflow-state',
      severity: 'error',
      message: 'Media production workflow has invalid identity, version, profile, or timestamps.',
    });
  }
  if (state.stages.length !== MEDIA_PRODUCTION_STAGE_IDS.length) {
    diagnostics.push({
      code: 'invalid-workflow-state',
      severity: 'error',
      message: 'Media production workflow must contain the canonical stage set.',
      path: ['stages'],
    });
  }

  state.stages.forEach((stage, index) => {
    if (stage.stageId !== MEDIA_PRODUCTION_STAGE_IDS[index] || stage.attempt < 0) {
      diagnostics.push({
        code: 'invalid-workflow-state',
        severity: 'error',
        message: 'Media production workflow stages are missing, duplicated, or out of order.',
        path: ['stages', index],
      });
    }
    diagnostics.push(...validateStageArtifacts(stage));
  });

  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    diagnostics,
  };
}

function validateStageArtifacts(
  stage: MediaProductionStageState,
): MediaProductionWorkflowDiagnostic[] {
  const diagnostics: MediaProductionWorkflowDiagnostic[] = [];
  if (stage.status === 'completed' && stage.artifacts.length === 0) {
    diagnostics.push({
      code: 'missing-stage-artifact',
      severity: 'error',
      message: 'Completed media production stages require at least one typed artifact reference.',
      stageId: stage.stageId,
      path: ['stages', getStageIndex(stage.stageId), 'artifacts'],
    });
  }
  const seen = new Set<string>();
  stage.artifacts.forEach((artifact, artifactIndex) => {
    const path = ['stages', getStageIndex(stage.stageId), 'artifacts', artifactIndex] as const;
    if (
      !artifact.artifactId.trim() ||
      !ARTIFACT_PROFILE_ID_PATTERN.test(artifact.profileId) ||
      artifact.producerStageId !== stage.stageId ||
      !isIsoTimestamp(artifact.createdAt) ||
      seen.has(artifact.artifactId)
    ) {
      diagnostics.push({
        code: 'invalid-workflow-state',
        severity: 'error',
        message: 'Stage artifact identity, producer, timestamp, or uniqueness is invalid.',
        stageId: stage.stageId,
        path,
      });
    }
    seen.add(artifact.artifactId);

    if (artifact.kind === 'resource') {
      const durable = validateDurableResourceRef(artifact.resourceRef, [...path, 'resourceRef']);
      if (!artifact.revision.trim() || durable.diagnostics.length > 0) {
        diagnostics.push({
          code: 'unstable-stage-artifact',
          severity: 'error',
          message: 'Resource stage artifacts require durable ResourceRef and revision identity.',
          stageId: stage.stageId,
          path,
        });
      }
    } else if (artifact.kind === 'project') {
      if (
        !artifact.projectRef.documentUri.trim() ||
        !artifact.projectRef.projectRevision.trim() ||
        isRuntimeOnlyResourceIdentityValue(artifact.projectRef.documentUri)
      ) {
        diagnostics.push({
          code: 'unstable-stage-artifact',
          severity: 'error',
          message: 'Project stage artifacts require a durable document URI and project revision.',
          stageId: stage.stageId,
          path,
        });
      }
    } else {
      const targetValidation = validateQualityTarget(artifact.target);
      if (!artifact.gateResultId.trim() || !targetValidation.ok) {
        diagnostics.push({
          code: 'unstable-stage-artifact',
          severity: 'error',
          message:
            'Quality Gate stage artifacts require a valid result id and revision-bound target.',
          stageId: stage.stageId,
          path,
        });
      }
    }
  });
  return diagnostics;
}

function assertStageArtifacts(
  stageId: MediaProductionStageId,
  artifacts: readonly MediaProductionStageArtifactRef[],
): void {
  const validation = validateStageArtifacts({
    stageId,
    status: 'completed',
    attempt: 1,
    artifacts,
    diagnostics: [],
  });
  if (!validation.length) return;
  throw new Error(validation.map((diagnostic) => diagnostic.message).join(' '));
}

function replaceStage(
  state: MediaProductionWorkflowRunState,
  stageIndex: number,
  stage: MediaProductionStageState,
  updatedAt: string,
  status: MediaProductionRunStatus,
  diagnostics: readonly MediaProductionWorkflowDiagnostic[] = state.diagnostics,
): MediaProductionWorkflowRunState {
  return {
    ...state,
    status,
    stages: state.stages.map((candidate, index) => (index === stageIndex ? stage : candidate)),
    updatedAt,
    diagnostics: [...diagnostics],
  };
}

function assertCanonicalState(state: MediaProductionWorkflowRunState): void {
  const validation = validateMediaProductionWorkflowRun(state);
  if (!validation.ok) {
    throw new Error(validation.diagnostics.map((diagnostic) => diagnostic.message).join(' '));
  }
}

function getStageIndex(stageId: MediaProductionStageId): number {
  const index = MEDIA_PRODUCTION_STAGE_IDS.indexOf(stageId);
  if (index < 0) throw new Error(`Unknown media production stage: ${stageId}`);
  return index;
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} must not be empty.`);
}

function assertIsoTimestamp(value: string, field: string): void {
  if (!isIsoTimestamp(value)) throw new Error(`${field} must be an ISO timestamp.`);
}

function isIsoTimestamp(value: string): boolean {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}
