/**
 * Skill Lifecycle Contracts
 *
 * Host-agnostic DTOs for representing active Skill records and projecting them
 * into Agent turn prompt/tool/model state. These contracts intentionally live
 * below the Agent runtime so Extension, Webview, CLI, and tests can share the
 * same lifecycle vocabulary without importing runtime internals.
 */

import type { RelatedSkill, SkillInjection, SkillMediaWorkflowHint } from './skill';

export type SkillLifecycleSlot =
  'stagePersona' | 'domainSkill' | 'referenceSkill' | 'ephemeralSkill' | 'workflowSkill';

export type SkillLifecycleOwner = 'user' | 'agent' | 'idc' | 'runtime';

export type SkillLifecycleRecordStatus = 'active' | 'expiring' | 'expired' | 'blocked';

export type SkillLifecycleActivationSource =
  'explicit-user' | 'explicit-agent' | 'idc-stage' | 'runtime-expiry';

export type SkillLifecycleDeactivationActor = 'user' | 'agent' | 'runtime';

export type SkillLifecycleDeactivationReason =
  | 'explicit-clear'
  | 'turn-ended'
  | 'stage-exited'
  | 'workflow-ended'
  | 'inactive'
  | 'conflict-resolution';

export type SkillLifecycleConflictStrategy = 'replace' | 'merge' | 'reject' | 'ask';

export type SkillLifecycleToolPolicyMode =
  'unrestricted' | 'allowlist' | 'intersection' | 'conflict';

export type SkillLifecycleModelOverrideSource =
  'stagePersona' | 'domainSkill' | 'workflowSkill' | 'runtime';

export type SkillLifecycleDiagnosticCode =
  | 'unknown-slot'
  | 'missing-skill-injection'
  | 'missing-skill-content'
  | 'unknown-record'
  | 'no-active-record'
  | 'ambiguous-deactivation'
  | 'locked-deactivation'
  | 'skill-activation-rejected'
  | 'skill-conflict'
  | 'tool-policy-conflict'
  | 'model-override-conflict'
  | 'single-injection-slot-blocked'
  | 'expired-record'
  | 'stale-record';

/**
 * Local mirror of the IDC stages used by @neko-agent/types. Kept in Layer 0 as
 * a structural union to avoid a shared -> agent-types dependency.
 */
export type SkillLifecycleIdcStage = 'draft' | 'plan' | 'apply';

export interface SkillLifecycleTurnLifetime {
  readonly kind: 'turn';
  readonly turnId: string;
}

export interface SkillLifecycleConversationLifetime {
  readonly kind: 'conversation';
  readonly untilCleared: true;
}

export interface SkillLifecycleIdcStageLifetime {
  readonly kind: 'idc-stage';
  readonly runId: string;
  readonly stage: SkillLifecycleIdcStage;
}

export interface SkillLifecycleWorkflowLifetime {
  readonly kind: 'workflow';
  readonly runId: string;
}

export interface SkillLifecycleInactivityLifetime {
  readonly kind: 'inactivity';
  readonly maxIdleTurns: number;
}

export type SkillLifecycleLifetime =
  | SkillLifecycleTurnLifetime
  | SkillLifecycleConversationLifetime
  | SkillLifecycleIdcStageLifetime
  | SkillLifecycleWorkflowLifetime
  | SkillLifecycleInactivityLifetime;

export interface SkillLifecycleDeactivationPolicy {
  readonly clearableByUser: boolean;
  readonly clearableByAgent: boolean;
  readonly clearableByRuntime: boolean;
  readonly lockedReason?: string;
}

export interface SkillLifecycleSkillSummary {
  readonly name: string;
  readonly description: string;
  readonly domain?: string;
  readonly relatedSkills?: readonly RelatedSkill[];
  readonly mediaWorkflow?: SkillMediaWorkflowHint;
}

export interface SkillLifecycleRecord {
  readonly id: string;
  readonly conversationId: string;
  readonly skillName: string;
  readonly slot: SkillLifecycleSlot;
  readonly owner: SkillLifecycleOwner;
  readonly lifetime: SkillLifecycleLifetime;
  readonly injection: SkillInjection;
  readonly skillSummary: SkillLifecycleSkillSummary;
  readonly status: SkillLifecycleRecordStatus;
  readonly deactivation: SkillLifecycleDeactivationPolicy;
  readonly createdAt: number;
  readonly lastUsedTurn: number;
  readonly source: SkillLifecycleActivationSource;
}

export interface SkillLifecycleActivationRequest {
  readonly conversationId: string;
  readonly skillName: string;
  readonly slot: SkillLifecycleSlot;
  readonly owner: SkillLifecycleOwner;
  readonly lifetime: SkillLifecycleLifetime;
  readonly source: SkillLifecycleActivationSource;
  readonly args?: string;
  readonly now?: number;
  readonly turnCount?: number;
}

export interface SkillLifecycleDeactivationRequest {
  readonly conversationId: string;
  readonly recordId?: string;
  readonly slot?: SkillLifecycleSlot;
  readonly skillName?: string;
  readonly actor: SkillLifecycleDeactivationActor;
  readonly reason: SkillLifecycleDeactivationReason;
}

export interface SkillLifecycleDiagnostic {
  readonly code: SkillLifecycleDiagnosticCode;
  readonly message: string;
  readonly conversationId?: string;
  readonly recordId?: string;
  readonly skillName?: string;
  readonly slot?: SkillLifecycleSlot;
  readonly details?: Record<string, unknown>;
}

export interface SkillLifecycleActivationResult {
  readonly ok: boolean;
  readonly record?: SkillLifecycleRecord;
  readonly replacedRecordIds?: readonly string[];
  readonly diagnostics: readonly SkillLifecycleDiagnostic[];
}

export interface SkillLifecycleDeactivationResult {
  readonly ok: boolean;
  readonly removedRecordIds: readonly string[];
  readonly diagnostics: readonly SkillLifecycleDiagnostic[];
}

export interface SkillLifecyclePromptSectionProjection {
  readonly id: string;
  readonly layer: 'skill';
  readonly content: string;
  readonly priority: number;
  readonly recordId: string;
  readonly slot: SkillLifecycleSlot;
  readonly skillName: string;
}

export interface SkillLifecycleToolPolicyProjection {
  readonly mode: SkillLifecycleToolPolicyMode;
  readonly allowedTools?: readonly string[];
  readonly contributingRecordIds: readonly string[];
  readonly diagnostics: readonly SkillLifecycleDiagnostic[];
}

export interface SkillLifecycleModelOverrideProjection {
  readonly model: string;
  readonly source: SkillLifecycleModelOverrideSource;
  readonly recordId: string;
  readonly skillName: string;
}

export interface ActiveSkillLifecycleRecordProjection {
  readonly id: string;
  readonly skillName: string;
  readonly slot: SkillLifecycleSlot;
  readonly owner: SkillLifecycleOwner;
  readonly clearable: boolean;
  readonly lockedReason?: string;
  readonly expires?: string;
  readonly status: SkillLifecycleRecordStatus;
}

export interface ActiveSkillLifecycleProjection {
  readonly conversationId: string;
  readonly records: readonly ActiveSkillLifecycleRecordProjection[];
  readonly diagnostics: readonly SkillLifecycleDiagnostic[];
}

export interface SkillLifecycleProjection {
  readonly promptSections: readonly SkillLifecyclePromptSectionProjection[];
  readonly toolPolicy: SkillLifecycleToolPolicyProjection;
  readonly modelOverride?: SkillLifecycleModelOverrideProjection;
  readonly diagnostics: readonly SkillLifecycleDiagnostic[];
  readonly visibleIndicators: readonly ActiveSkillLifecycleRecordProjection[];
}

export interface SkillLifecycleConflict {
  readonly requestedSkillName: string;
  readonly requestedSlot: SkillLifecycleSlot;
  readonly conflictingRecordIds: readonly string[];
  readonly strategy: SkillLifecycleConflictStrategy;
  readonly diagnostic: SkillLifecycleDiagnostic;
}
