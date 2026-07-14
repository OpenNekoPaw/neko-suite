import type { AgentProfileIdentity } from './agent-profile';
import {
  createAgentProfileDiagnostic,
  toAgentProfileValidationResult,
  validateAgentProfileIdentity,
  type AgentProfileDiagnostic,
  type AgentProfileValidationResult,
} from './agent-profile';

export const CREATION_PROFILE_APPROVAL_POLICIES = [
  'none',
  'stage-entry',
  'before-side-effect',
  'before-persist',
] as const;

export const CREATION_PROFILE_REVIEW_POLICIES = [
  'none',
  'on-stage-exit',
  'before-apply',
  'before-publish',
] as const;

export const CREATION_PROFILE_RECOVERY_POLICIES = [
  'none',
  'retry-stage',
  'revise-previous-stage',
  'ask-user',
] as const;

export type CreationProfileApprovalPolicy = (typeof CREATION_PROFILE_APPROVAL_POLICIES)[number];

export type CreationProfileReviewPolicy = (typeof CREATION_PROFILE_REVIEW_POLICIES)[number];

export type CreationProfileRecoveryPolicy = (typeof CREATION_PROFILE_RECOVERY_POLICIES)[number];

export interface CreationProfileDescriptor extends AgentProfileIdentity<'creation', string> {
  readonly title?: string;
  readonly description?: string;
  readonly defaultStageId: string;
  readonly stages: readonly CreationProfileStageDescriptor[];
  readonly transitions?: readonly CreationProfileTransitionDescriptor[];
  readonly approvalPolicy?: CreationProfileApprovalPolicyDescriptor;
  readonly reviewPolicy?: CreationProfileReviewPolicyDescriptor;
  readonly recoveryPolicy?: CreationProfileRecoveryPolicyDescriptor;
  readonly lifecycleConstraints?: readonly CreationProfileLifecycleConstraint[];
  readonly promptGuidance?: readonly CreationProfilePromptGuidance[];
  readonly schemaRefs?: readonly CreationProfileSchemaRef[];
}

export interface CreationProfileStageDescriptor {
  readonly stageId: string;
  readonly title?: string;
  readonly purpose: string;
  readonly expectedOutputs?: readonly string[];
  readonly allowedProfileIds?: readonly string[];
  readonly toolPolicyId?: string;
}

export interface CreationProfileTransitionDescriptor {
  readonly fromStageId: string;
  readonly toStageId: string;
  readonly condition?: 'automatic' | 'user-approved' | 'review-passed' | 'manual';
  readonly description?: string;
}

export interface CreationProfileApprovalPolicyDescriptor {
  readonly policy: CreationProfileApprovalPolicy;
  readonly stageIds?: readonly string[];
  readonly requiredCapabilityIds?: readonly string[];
}

export interface CreationProfileReviewPolicyDescriptor {
  readonly policy: CreationProfileReviewPolicy;
  readonly stageIds?: readonly string[];
  readonly validatorIds?: readonly string[];
}

export interface CreationProfileRecoveryPolicyDescriptor {
  readonly policy: CreationProfileRecoveryPolicy;
  readonly maxAttempts?: number;
  readonly stageIds?: readonly string[];
}

export interface CreationProfileLifecycleConstraint {
  readonly constraintId: string;
  readonly stageIds?: readonly string[];
  readonly kind:
    'requires-approval' | 'requires-review' | 'requires-user-input' | 'blocks-side-effects';
  readonly message?: string;
}

export interface CreationProfilePromptGuidance {
  readonly stageId?: string;
  readonly text: string;
}

export interface CreationProfileSchemaRef {
  readonly schemaId: string;
  readonly version?: string | number;
  readonly stageIds?: readonly string[];
}

export type ICreationProfileRegistry =
  import('./agent-profile').IAgentProfileRegistry<CreationProfileDescriptor>;

export function validateCreationProfileDescriptor(
  descriptor: unknown,
): AgentProfileValidationResult {
  const diagnostics: AgentProfileDiagnostic[] = [
    ...validateAgentProfileIdentity(descriptor, {
      expectedKind: 'creation',
    }).diagnostics,
  ];

  if (!isRecord(descriptor)) {
    return toAgentProfileValidationResult(diagnostics);
  }

  if (
    typeof descriptor['defaultStageId'] !== 'string' ||
    descriptor['defaultStageId'].length === 0
  ) {
    diagnostics.push(
      createAgentProfileDiagnostic({
        severity: 'error',
        code: 'malformed-profile-descriptor',
        path: ['defaultStageId'],
        profileId: readProfileId(descriptor),
        kind: 'creation',
        message: 'Creation profile must declare defaultStageId.',
      }),
    );
  }

  if (!Array.isArray(descriptor['stages']) || descriptor['stages'].length === 0) {
    diagnostics.push(
      createAgentProfileDiagnostic({
        severity: 'error',
        code: 'malformed-profile-descriptor',
        path: ['stages'],
        profileId: readProfileId(descriptor),
        kind: 'creation',
        message: 'Creation profile must declare at least one stage.',
      }),
    );
    return toAgentProfileValidationResult(diagnostics);
  }

  const stageIds = new Set<string>();
  descriptor['stages'].forEach((stage, index) => {
    if (!isRecord(stage) || typeof stage['stageId'] !== 'string' || stage['stageId'].length === 0) {
      diagnostics.push(
        createAgentProfileDiagnostic({
          severity: 'error',
          code: 'malformed-profile-descriptor',
          path: ['stages', index, 'stageId'],
          profileId: readProfileId(descriptor),
          kind: 'creation',
          message: 'Creation profile stage must declare stageId.',
        }),
      );
      return;
    }
    if (stageIds.has(stage['stageId'])) {
      diagnostics.push(
        createAgentProfileDiagnostic({
          severity: 'error',
          code: 'malformed-profile-descriptor',
          path: ['stages', index, 'stageId'],
          profileId: readProfileId(descriptor),
          kind: 'creation',
          message: 'Creation profile stage ids must be unique.',
          actual: stage['stageId'],
        }),
      );
    }
    stageIds.add(stage['stageId']);
    if (typeof stage['purpose'] !== 'string' || stage['purpose'].trim().length === 0) {
      diagnostics.push(
        createAgentProfileDiagnostic({
          severity: 'error',
          code: 'malformed-profile-descriptor',
          path: ['stages', index, 'purpose'],
          profileId: readProfileId(descriptor),
          kind: 'creation',
          message: 'Creation profile stage must declare purpose.',
        }),
      );
    }
  });

  const defaultStageId = descriptor['defaultStageId'];
  if (typeof defaultStageId === 'string' && stageIds.size > 0 && !stageIds.has(defaultStageId)) {
    diagnostics.push(
      createAgentProfileDiagnostic({
        severity: 'error',
        code: 'malformed-profile-descriptor',
        path: ['defaultStageId'],
        profileId: readProfileId(descriptor),
        kind: 'creation',
        message: 'Creation profile defaultStageId must reference a declared stage.',
        actual: defaultStageId,
      }),
    );
  }

  validateStageReferences(
    descriptor,
    'transitions',
    ['fromStageId', 'toStageId'],
    stageIds,
    diagnostics,
  );

  return toAgentProfileValidationResult(diagnostics);
}

function validateStageReferences(
  descriptor: Record<string, unknown>,
  fieldName: string,
  stageRefFields: readonly string[],
  stageIds: ReadonlySet<string>,
  diagnostics: AgentProfileDiagnostic[],
): void {
  const values = descriptor[fieldName];
  if (values === undefined) return;
  if (!Array.isArray(values)) {
    diagnostics.push(
      createAgentProfileDiagnostic({
        severity: 'error',
        code: 'malformed-profile-descriptor',
        path: [fieldName],
        profileId: readProfileId(descriptor),
        kind: 'creation',
        message: `Creation profile ${fieldName} must be an array.`,
      }),
    );
    return;
  }
  values.forEach((value, index) => {
    if (!isRecord(value)) {
      diagnostics.push(
        createAgentProfileDiagnostic({
          severity: 'error',
          code: 'malformed-profile-descriptor',
          path: [fieldName, index],
          profileId: readProfileId(descriptor),
          kind: 'creation',
          message: `Creation profile ${fieldName}[${index}] must be an object.`,
        }),
      );
      return;
    }
    for (const stageRefField of stageRefFields) {
      const stageId = value[stageRefField];
      if (typeof stageId === 'string' && !stageIds.has(stageId)) {
        diagnostics.push(
          createAgentProfileDiagnostic({
            severity: 'error',
            code: 'malformed-profile-descriptor',
            path: [fieldName, index, stageRefField],
            profileId: readProfileId(descriptor),
            kind: 'creation',
            message: `Creation profile ${fieldName} references an unknown stage.`,
            actual: stageId,
          }),
        );
      }
    }
  });
}

function readProfileId(descriptor: Record<string, unknown>): string | undefined {
  return typeof descriptor['profileId'] === 'string' ? descriptor['profileId'] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
