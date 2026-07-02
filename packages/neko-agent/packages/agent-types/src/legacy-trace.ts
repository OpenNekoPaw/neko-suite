/**
 * Compatibility-only trace for pre-Agent-native workflow identifiers.
 *
 * This is not Agent creation identity and must not drive stage state,
 * approval, validation, or capability execution.
 */
export interface AgentLegacyCreationTrace {
  readonly workflowDefinitionId?: string;
  readonly workflowRunId?: string;
  readonly workflowNodeId?: string;
  readonly planMode?: boolean;
  readonly allowedToolNames?: readonly string[];
}
