import type { GeneratedAssetRevisionRef } from './generated-asset-lifecycle';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  QUALITY_EVALUATOR_CLASSES,
  validateQualityTarget,
  type QualityGatePolicy,
  type QualityGateVerdict,
  type QualityProjectRef,
  type QualityTarget,
} from './media-quality';
import {
  isRuntimeOnlyResourceIdentityValue,
  validateDurableResourceRef,
} from './durable-resource-ref';
import type { ResourceRef } from './resource-cache';
import type { NekoProjectAuthoringTarget } from '../project-authoring';
import { validateNekoProjectAuthoringTarget } from '../project-authoring';

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
  | 'stage-blocked'
  | 'missing-authoring-target'
  | 'authoring-capability-unavailable'
  | 'invalid-authoring-result'
  | 'missing-pre-export-plan'
  | 'invalid-quality-gate-result'
  | 'asset-not-approved';

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

export type MediaProductionWorkflowSourceRef =
  | {
      readonly kind: 'resource';
      readonly sourceId: string;
      readonly resourceRef: ResourceRef;
      readonly revision: string;
      readonly contentDigest?: string;
    }
  | {
      readonly kind: 'project';
      readonly sourceId: string;
      readonly projectRef: QualityProjectRef;
    };

export type MediaProductionProjectAuthoringDomain = 'canvas' | 'cut' | 'audio';

export interface MediaProductionProjectAuthoringHandoff {
  readonly handoffId: string;
  readonly domain: MediaProductionProjectAuthoringDomain;
  readonly sourceArtifactId: string;
  readonly outputProfileId: string;
  readonly target: NekoProjectAuthoringTarget;
  readonly mediaType?: 'image' | 'video' | 'audio';
}

export interface MediaProductionProjectAuthoringPlan {
  readonly version: 1;
  readonly handoffs: readonly MediaProductionProjectAuthoringHandoff[];
}

export interface MediaProductionPreExportPlan {
  readonly version: 1;
  readonly projectArtifactId: string;
  readonly requiredAssetArtifactIds: readonly string[];
  readonly outputProfileId: string;
  readonly policy: QualityGatePolicy;
}

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
  readonly sourceRefs: readonly MediaProductionWorkflowSourceRef[];
  readonly projectAuthoringPlan?: MediaProductionProjectAuthoringPlan;
  readonly preExportPlan?: MediaProductionPreExportPlan;
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
  readonly sourceRefs: readonly MediaProductionWorkflowSourceRef[];
  readonly createdAt: string;
}): MediaProductionWorkflowRunState {
  assertNonEmpty(input.workflowRunId, 'workflowRunId');
  assertNonEmpty(input.sourceProfileId, 'sourceProfileId');
  assertIsoTimestamp(input.createdAt, 'createdAt');
  const sourceDiagnostics = validateWorkflowSourceRefs(input.sourceRefs);
  if (sourceDiagnostics.length > 0) {
    throw new Error(sourceDiagnostics.map((diagnostic) => diagnostic.message).join(' '));
  }

  return {
    version: MEDIA_PRODUCTION_WORKFLOW_VERSION,
    workflowRunId: input.workflowRunId,
    sourceProfileId: input.sourceProfileId,
    sourceRefs: [...input.sourceRefs],
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

export function setMediaProductionProjectAuthoringPlan(input: {
  readonly state: MediaProductionWorkflowRunState;
  readonly plan: MediaProductionProjectAuthoringPlan;
  readonly updatedAt: string;
}): MediaProductionWorkflowRunState {
  assertIsoTimestamp(input.updatedAt, 'updatedAt');
  const diagnostics = validateProjectAuthoringPlan(input.plan);
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map((diagnostic) => diagnostic.message).join(' '));
  }
  const projectAuthoringStage = input.state.stages.find(
    (stage) => stage.stageId === 'project-authoring',
  );
  if (!projectAuthoringStage || projectAuthoringStage.status !== 'pending') {
    throw new Error('Project authoring plan can only be set while project-authoring is pending.');
  }
  const next: MediaProductionWorkflowRunState = {
    ...input.state,
    projectAuthoringPlan: {
      version: 1,
      handoffs: input.plan.handoffs.map((handoff) => ({
        ...handoff,
        target: { ...handoff.target },
      })),
    },
    updatedAt: input.updatedAt,
  };
  assertCanonicalState(next);
  return next;
}

export function setMediaProductionPreExportPlan(input: {
  readonly state: MediaProductionWorkflowRunState;
  readonly plan: MediaProductionPreExportPlan;
  readonly updatedAt: string;
}): MediaProductionWorkflowRunState {
  assertIsoTimestamp(input.updatedAt, 'updatedAt');
  const diagnostics = validatePreExportPlan(input.plan);
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map((diagnostic) => diagnostic.message).join(' '));
  }
  const stage = input.state.stages.find((candidate) => candidate.stageId === 'pre-export-gate');
  if (!stage || stage.status !== 'pending') {
    throw new Error('Pre-export plan can only be set while pre-export-gate is pending.');
  }
  const next: MediaProductionWorkflowRunState = {
    ...input.state,
    preExportPlan: {
      ...input.plan,
      requiredAssetArtifactIds: [...input.plan.requiredAssetArtifactIds],
      policy: {
        ...input.plan.policy,
        requiredProfiles: [...input.plan.policy.requiredProfiles],
        requiredEvaluatorClasses: [...input.plan.policy.requiredEvaluatorClasses],
        blockingSeverities: [...input.plan.policy.blockingSeverities],
      },
    },
    updatedAt: input.updatedAt,
  };
  assertCanonicalState(next);
  return next;
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

export type MediaProductionInterruptedStageRecovery =
  | {
      readonly disposition: 'retry';
      readonly stageId: MediaProductionStageId;
    }
  | {
      readonly disposition: 'complete';
      readonly stageId: MediaProductionStageId;
      readonly completedAt: string;
      readonly artifacts: readonly MediaProductionStageArtifactRef[];
      readonly diagnostics?: readonly MediaProductionWorkflowDiagnostic[];
    };

export function resumeMediaProductionWorkflow(input: {
  readonly state: MediaProductionWorkflowRunState;
  readonly resumedAt: string;
  readonly interruptedStageRecovery?: MediaProductionInterruptedStageRecovery;
}): MediaProductionWorkflowRunState {
  assertIsoTimestamp(input.resumedAt, 'resumedAt');
  assertCanonicalState(input.state);
  if (input.state.status === 'completed' || input.state.status === 'failed') {
    throw new Error(`Media production workflow ${input.state.workflowRunId} is terminal.`);
  }
  if (input.state.status === 'blocked') {
    throw new Error(
      `Media production workflow ${input.state.workflowRunId} requires explicit repair before resume.`,
    );
  }

  const interruptedStages = input.state.stages.filter(
    (stage) => stage.status === 'running' || stage.status === 'cancelled',
  );
  if (interruptedStages.length > 1) {
    throw new Error('Media production workflow contains multiple interrupted stages.');
  }
  const interruptedStage = interruptedStages[0];
  if (!interruptedStage) {
    if (input.interruptedStageRecovery) {
      throw new Error('Interrupted stage recovery was provided but no stage is interrupted.');
    }
    return {
      ...input.state,
      status: input.state.stages.every((stage) => stage.status === 'completed')
        ? 'completed'
        : 'running',
      updatedAt: input.resumedAt,
      diagnostics: [],
    };
  }

  const recovery = input.interruptedStageRecovery;
  if (!recovery || recovery.stageId !== interruptedStage.stageId) {
    throw new Error(
      `Media production stage ${interruptedStage.stageId} requires explicit reconciliation before resume.`,
    );
  }

  let recoveredStage: MediaProductionStageState;
  if (recovery.disposition === 'retry') {
    if (interruptedStage.artifacts.length > 0) {
      throw new Error(
        `Media production stage ${interruptedStage.stageId} has persisted artifacts and cannot be retried blindly.`,
      );
    }
    recoveredStage = {
      ...interruptedStage,
      status: 'pending',
      startedAt: undefined,
      completedAt: undefined,
      diagnostics: [],
    };
  } else {
    assertIsoTimestamp(recovery.completedAt, 'completedAt');
    assertStageArtifacts(recovery.stageId, recovery.artifacts);
    const diagnostics = recovery.diagnostics ?? [];
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      throw new Error('Recovered completed stage cannot contain error diagnostics.');
    }
    recoveredStage = {
      ...interruptedStage,
      status: 'completed',
      completedAt: recovery.completedAt,
      artifacts: [...recovery.artifacts],
      diagnostics: [...diagnostics],
    };
  }

  const stages = input.state.stages.map((stage) =>
    stage.stageId === interruptedStage.stageId ? recoveredStage : stage,
  );
  return {
    ...input.state,
    status: stages.every((stage) => stage.status === 'completed') ? 'completed' : 'running',
    stages,
    updatedAt: input.resumedAt,
    diagnostics: [],
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
  diagnostics.push(...validateWorkflowSourceRefs(state.sourceRefs));
  if (state.projectAuthoringPlan) {
    diagnostics.push(...validateProjectAuthoringPlan(state.projectAuthoringPlan));
  }
  if (state.preExportPlan) {
    diagnostics.push(...validatePreExportPlan(state.preExportPlan));
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

function validateProjectAuthoringPlan(
  plan: MediaProductionProjectAuthoringPlan,
): MediaProductionWorkflowDiagnostic[] {
  if (plan.version !== 1 || plan.handoffs.length === 0) {
    return [
      {
        code: 'invalid-workflow-state',
        severity: 'error',
        message: 'Project authoring plan requires version 1 and at least one handoff.',
        stageId: 'project-authoring',
        path: ['projectAuthoringPlan'],
      },
    ];
  }

  const diagnostics: MediaProductionWorkflowDiagnostic[] = [];
  const seen = new Set<string>();
  const extensionByDomain: Readonly<Record<MediaProductionProjectAuthoringDomain, string>> = {
    canvas: '.nkc',
    cut: '.nkv',
    audio: '.nka',
  };
  plan.handoffs.forEach((handoff, index) => {
    const path = ['projectAuthoringPlan', 'handoffs', index] as const;
    if (
      !handoff.handoffId.trim() ||
      seen.has(handoff.handoffId) ||
      !handoff.sourceArtifactId.trim() ||
      !ARTIFACT_PROFILE_ID_PATTERN.test(handoff.outputProfileId)
    ) {
      diagnostics.push({
        code: 'invalid-workflow-state',
        severity: 'error',
        message: 'Project authoring handoff identity, source, or output profile is invalid.',
        stageId: 'project-authoring',
        path,
      });
    }
    seen.add(handoff.handoffId);

    const targetValidation = validateNekoProjectAuthoringTarget(handoff.target, {
      createNewAllowed: true,
    });
    if (handoff.target.kind === 'active' || !targetValidation.ok) {
      diagnostics.push({
        code: 'missing-authoring-target',
        severity: 'error',
        message: 'Project authoring handoffs require an explicit file or new target.',
        stageId: 'project-authoring',
        path: [...path, 'target'],
      });
    }
    if (handoff.target.documentUri) {
      const cleanUri = handoff.target.documentUri.split(/[?#]/, 1)[0]?.toLowerCase() ?? '';
      if (!cleanUri.endsWith(extensionByDomain[handoff.domain])) {
        diagnostics.push({
          code: 'invalid-workflow-state',
          severity: 'error',
          message: `Project authoring target for ${handoff.domain} must use ${extensionByDomain[handoff.domain]}.`,
          stageId: 'project-authoring',
          path: [...path, 'target', 'documentUri'],
        });
      }
    }
  });
  return diagnostics;
}

function validatePreExportPlan(
  plan: MediaProductionPreExportPlan,
): MediaProductionWorkflowDiagnostic[] {
  const diagnostics: MediaProductionWorkflowDiagnostic[] = [];
  if (
    plan.version !== 1 ||
    !plan.projectArtifactId.trim() ||
    !ARTIFACT_PROFILE_ID_PATTERN.test(plan.outputProfileId)
  ) {
    diagnostics.push({
      code: 'invalid-workflow-state',
      severity: 'error',
      message: 'Pre-export plan requires version 1, a project artifact, and output profile.',
      stageId: 'pre-export-gate',
      path: ['preExportPlan'],
    });
  }
  const assetIds = new Set<string>();
  if (plan.requiredAssetArtifactIds.length === 0) {
    diagnostics.push({
      code: 'invalid-workflow-state',
      severity: 'error',
      message: 'Pre-export plan requires at least one required asset artifact id.',
      stageId: 'pre-export-gate',
      path: ['preExportPlan', 'requiredAssetArtifactIds'],
    });
  }
  plan.requiredAssetArtifactIds.forEach((artifactId, index) => {
    if (!artifactId.trim() || assetIds.has(artifactId)) {
      diagnostics.push({
        code: 'invalid-workflow-state',
        severity: 'error',
        message: 'Pre-export required asset ids must be non-empty and unique.',
        stageId: 'pre-export-gate',
        path: ['preExportPlan', 'requiredAssetArtifactIds', index],
      });
    }
    assetIds.add(artifactId);
  });
  const policy = plan.policy;
  const requiredProfiles = new Set<string>();
  const policyHasInvalidProfile = policy.requiredProfiles.some((profileId) => {
    const invalid = !ARTIFACT_PROFILE_ID_PATTERN.test(profileId) || requiredProfiles.has(profileId);
    requiredProfiles.add(profileId);
    return invalid;
  });
  const evaluatorClasses = new Set(policy.requiredEvaluatorClasses);
  const blockingSeverities = new Set(policy.blockingSeverities);
  const supportedSeverities = new Set(['info', 'warning', 'error', 'critical']);
  if (
    policy.version !== MEDIA_QUALITY_CONTRACT_VERSION ||
    !policy.policyId.trim() ||
    !policy.policyVersion.trim() ||
    policy.requiredProfiles.length === 0 ||
    policyHasInvalidProfile ||
    policy.requiredEvaluatorClasses.length === 0 ||
    evaluatorClasses.size !== policy.requiredEvaluatorClasses.length ||
    policy.requiredEvaluatorClasses.some(
      (evaluatorClass) => !QUALITY_EVALUATOR_CLASSES.includes(evaluatorClass),
    ) ||
    policy.blockingSeverities.length === 0 ||
    blockingSeverities.size !== policy.blockingSeverities.length ||
    policy.blockingSeverities.some((severity) => !supportedSeverities.has(severity)) ||
    (policy.minimumConfidence !== undefined &&
      (!Number.isFinite(policy.minimumConfidence) ||
        policy.minimumConfidence < 0 ||
        policy.minimumConfidence > 1))
  ) {
    diagnostics.push({
      code: 'invalid-workflow-state',
      severity: 'error',
      message: 'Pre-export plan requires a complete canonical versioned Quality Gate policy.',
      stageId: 'pre-export-gate',
      path: ['preExportPlan', 'policy'],
    });
  }
  return diagnostics;
}

function validateWorkflowSourceRefs(
  sourceRefs: readonly MediaProductionWorkflowSourceRef[],
): MediaProductionWorkflowDiagnostic[] {
  if (sourceRefs.length === 0) {
    return [
      {
        code: 'missing-stage-artifact',
        severity: 'error',
        message: 'Media production workflows require at least one stable source reference.',
        path: ['sourceRefs'],
      },
    ];
  }
  const diagnostics: MediaProductionWorkflowDiagnostic[] = [];
  const seen = new Set<string>();
  sourceRefs.forEach((source, index) => {
    const path = ['sourceRefs', index] as const;
    if (!source.sourceId.trim() || seen.has(source.sourceId)) {
      diagnostics.push({
        code: 'invalid-workflow-state',
        severity: 'error',
        message: 'Workflow source identity must be non-empty and unique.',
        path,
      });
    }
    seen.add(source.sourceId);
    if (source.kind === 'resource') {
      if (
        !source.revision.trim() ||
        !validateDurableResourceRef(source.resourceRef, [...path, 'resourceRef']).ok
      ) {
        diagnostics.push({
          code: 'unstable-stage-artifact',
          severity: 'error',
          message: 'Workflow resource sources require durable ResourceRef and revision identity.',
          path,
        });
      }
    } else if (
      !source.projectRef.documentUri.trim() ||
      !source.projectRef.projectRevision.trim() ||
      isRuntimeOnlyResourceIdentityValue(source.projectRef.documentUri)
    ) {
      diagnostics.push({
        code: 'unstable-stage-artifact',
        severity: 'error',
        message: 'Workflow project sources require durable document URI and project revision.',
        path,
      });
    }
  });
  return diagnostics;
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
