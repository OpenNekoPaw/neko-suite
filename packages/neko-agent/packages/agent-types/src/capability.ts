import type {
  AgentCapabilityHost,
  AgentCapabilityHostRequirement,
  AgentCapabilityTrustLevel,
  PromptFragment,
} from '@neko/shared';

export type AgentCapabilitySource = 'builtin' | 'market' | 'local' | 'plugin' | 'mcp' | 'provider';

export type AgentCapabilityContributionKind =
  | 'skill'
  | 'tool'
  | 'toolGroup'
  | 'slashCommand'
  | 'promptFragment'
  | 'workflowFragment'
  | 'artifactProtocol'
  | 'artifactProfile'
  | 'artifactRenderer'
  | 'artifactProjector'
  | 'artifactCapability';

export type AgentCapabilityPermissionMode = 'read' | 'write' | 'execute' | 'irreversible';

export interface AgentCapabilityPermissionRequirement {
  readonly scope: string;
  readonly mode?: AgentCapabilityPermissionMode;
  readonly approvalRequired?: boolean;
}

export interface AgentCapabilityWorkflowNodeRequirement {
  readonly nodeIds?: readonly string[];
  readonly nodeKinds?: readonly string[];
  readonly stages?: readonly string[];
}

export interface AgentCapabilityContributionIdentity {
  readonly id: string;
  readonly source: AgentCapabilitySource;
  readonly sourceId: string;
  readonly version?: string;
  readonly trustLevel: AgentCapabilityTrustLevel;
}

export interface AgentCapabilitySlashCommandContribution {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly skillId?: string;
}

export interface AgentCapabilityWorkflowFragmentContribution {
  readonly id: string;
  readonly title?: string;
  readonly nodeIds?: readonly string[];
}

export type AgentArtifactCapabilityRisk = 'low' | 'medium' | 'high' | 'destructive';

export interface AgentArtifactProtocolContribution {
  readonly id: string;
  readonly artifactKind: string;
  readonly profile?: string;
  readonly schemaVersion: number;
  readonly validatorId: string;
  readonly rendererIds?: readonly string[];
  readonly projectorIds?: readonly string[];
}

export interface AgentArtifactProfileContribution {
  readonly id: string;
  readonly profileId: string;
  readonly protocol: string;
  readonly version: number;
  readonly descriptorRef?: string;
}

export interface AgentArtifactRendererContribution {
  readonly id: string;
  readonly accepts: readonly string[];
  readonly profiles?: readonly string[];
  readonly lazy?: boolean;
}

export interface AgentArtifactProjectorContribution {
  readonly id: string;
  readonly accepts: readonly string[];
  readonly produces: readonly string[];
  readonly profiles?: readonly string[];
  readonly lazy?: boolean;
}

export interface AgentArtifactExecutionCapabilityContribution {
  readonly capabilityId: string;
  readonly packageId: string;
  readonly accepts: readonly string[];
  readonly produces?: readonly string[];
  readonly actions: readonly string[];
  readonly risk: AgentArtifactCapabilityRisk;
  readonly requiresApproval: boolean;
  readonly minVersion?: string;
}

export interface AgentArtifactFacetsContribution {
  readonly protocols?: readonly AgentArtifactProtocolContribution[];
  readonly profiles?: readonly AgentArtifactProfileContribution[];
  readonly renderers?: readonly AgentArtifactRendererContribution[];
  readonly projectors?: readonly AgentArtifactProjectorContribution[];
  readonly capabilities?: readonly AgentArtifactExecutionCapabilityContribution[];
}

export interface AgentCapabilityContribution {
  readonly identity: AgentCapabilityContributionIdentity;
  readonly displayName?: string;
  readonly description?: string;
  readonly hostRequirements?: readonly AgentCapabilityHostRequirement[];
  readonly permissionRequirements?: readonly AgentCapabilityPermissionRequirement[];
  readonly workflowNodeRequirements?: readonly AgentCapabilityWorkflowNodeRequirement[];
  readonly promptFragments?: readonly PromptFragment[];
  readonly allowedTools?: readonly string[];
  readonly slashCommands?: readonly AgentCapabilitySlashCommandContribution[];
  readonly workflowFragments?: readonly AgentCapabilityWorkflowFragmentContribution[];
  readonly toolNames?: readonly string[];
  readonly toolGroupNames?: readonly string[];
  readonly artifactFacets?: AgentArtifactFacetsContribution;
  readonly metadata?: Record<string, unknown>;
}

export type AgentCapabilityDiagnosticPhase = 'registration' | 'injection';

export interface AgentCapabilityDiagnostic {
  readonly phase: AgentCapabilityDiagnosticPhase;
  readonly code: string;
  readonly contributionId?: string;
  readonly reason: string;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentCapabilityInjectionContext {
  readonly host: AgentCapabilityHost;
  readonly activeSkillId?: string;
  readonly workflowNodeId?: string;
  readonly workflowNodeKind?: string;
  readonly workflowStage?: string;
  readonly allowedTrustLevels?: readonly AgentCapabilityTrustLevel[];
  readonly toolBudget?: number;
  readonly disabledContributionIds?: readonly string[];
  readonly permissionPolicy?: {
    readonly allowedScopes?: readonly string[];
    readonly allowIrreversible?: boolean;
    readonly approvedContributionIds?: readonly string[];
  };
  readonly ablation?: {
    readonly disableCapabilityInjection?: boolean;
    readonly disableSkillInjection?: boolean;
    readonly disableToolInjection?: boolean;
    readonly disablePromptFragments?: boolean;
  };
}

export interface AgentInjectedCapabilitySet {
  readonly contributions: readonly AgentCapabilityContribution[];
  readonly promptFragments: readonly PromptFragment[];
  readonly allowedTools: readonly string[];
  readonly slashCommands: readonly AgentCapabilitySlashCommandContribution[];
  readonly workflowFragments: readonly AgentCapabilityWorkflowFragmentContribution[];
  readonly diagnostics: readonly AgentCapabilityDiagnostic[];
}

export interface AgentCapabilityRegistryProjection {
  readonly contributions: readonly AgentCapabilityContribution[];
  readonly diagnostics: readonly AgentCapabilityDiagnostic[];
  readonly artifactFacets?: AgentArtifactFacetsContribution;
}

export type AgentCapabilityTelemetryReason =
  | 'used'
  | 'unknown-field'
  | 'unsupported-field'
  | 'withheld-field'
  | 'policy-skipped'
  | 'ablation-skipped';

export type AgentCapabilityTelemetryEventKind =
  | 'field-utilization'
  | 'skill-install'
  | 'skill-update'
  | 'skill-remove'
  | 'prompt-fragment-change'
  | 'schema-change'
  | 'workflow-fragment-change'
  | 'provider-card-change';

export interface AgentCapabilityTelemetryEvent {
  readonly id: string;
  readonly kind: AgentCapabilityTelemetryEventKind;
  readonly contributionId: string;
  readonly source: AgentCapabilitySource;
  readonly sourceId: string;
  readonly version?: string;
  readonly field?: string;
  readonly reason: AgentCapabilityTelemetryReason;
  readonly hash?: string;
  readonly createdAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AgentCapabilityTelemetrySnapshot {
  readonly events: readonly AgentCapabilityTelemetryEvent[];
  readonly fieldCounts: Readonly<Record<AgentCapabilityTelemetryReason, number>>;
  readonly updatedAt: number;
}
