import type { IdcStage } from './stage';

export type AgentWorkflowStatus =
  | 'pending'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type AgentWorkflowNodeKind =
  | 'idc-stage'
  | 'prompt'
  | 'tool'
  | 'subagent'
  | 'media-task'
  | 'approval'
  | 'evaluator'
  | 'artifact';

export type AgentWorkflowStageProfile = 'idc-draft' | 'idc-plan' | 'idc-apply' | 'custom';

export interface AgentWorkflowIdentity {
  readonly workflowDefinitionId: string;
  readonly workflowRunId: string;
  readonly workflowNodeId?: string;
}

export interface AgentWorkflowNode {
  readonly id: string;
  readonly kind: AgentWorkflowNodeKind;
  readonly title: string;
  readonly status: AgentWorkflowStatus;
  readonly stage?: IdcStage;
  readonly profile?: AgentWorkflowStageProfile;
  readonly parentNodeId?: string;
  readonly requiredArtifactKinds?: readonly string[];
  readonly allowedToolGroups?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export interface AgentWorkflowTransition {
  readonly fromNodeId?: string;
  readonly toNodeId: string;
  readonly reason: string;
  readonly createdAt: number;
}

export interface AgentWorkflowDefinition {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly description?: string;
  readonly nodes: readonly AgentWorkflowNode[];
  readonly transitions?: readonly AgentWorkflowTransition[];
  readonly metadata?: Record<string, unknown>;
}

export interface AgentWorkflowRun {
  readonly id: string;
  readonly definitionId: string;
  readonly conversationId: string;
  readonly status: AgentWorkflowStatus;
  readonly activeNodeId?: string;
  readonly nodes: readonly AgentWorkflowNode[];
  readonly transitions: readonly AgentWorkflowTransition[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly cancelledAt?: number;
  readonly completedAt?: number;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
  readonly metadata?: Record<string, unknown>;
}

export interface AgentWorkflowProjection {
  readonly conversationId: string;
  readonly run: AgentWorkflowRun;
}
