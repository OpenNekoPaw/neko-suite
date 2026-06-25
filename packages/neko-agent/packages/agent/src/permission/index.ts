/**
 * Permission Module - Tool execution permission management
 *
 * Implements Claude Code compatible permission model:
 * - deny/allow/ask rules with pattern matching
 * - plan/ask/auto execution modes
 * - Integration with AgentExecutor via hooks
 */

// Types
export type {
  PermissionMode,
  PermissionDecision,
  PermissionRules,
  PermissionConfig,
  PermissionCheckResult,
  ToolConfirmationRequest,
  ToolConfirmationResponse,
  ConfirmToolCallback,
  PlanFileResult,
} from './types';

// Constants
export {
  DEFAULT_READ_ONLY_TOOLS,
  READ_ONLY_MCP_PREFIXES,
  DEFAULT_PERMISSION_CONFIG,
  PLAN_MODE_SYSTEM_REMINDER,
  PLAN_FILE_PATH,
  CREATIVE_PLAN_TOOLS,
} from './types';

// Tool Traits Registry
export { ToolTraitsRegistry, DEFAULT_CREATIVE_TOOL_TRAITS } from './tool-traits-registry';

// Rule Matcher
export {
  PermissionRuleMatcher,
  createPermissionRuleMatcher,
  normalizeToolCall,
  matchesPattern,
  isInPatternList,
  isReadOnlyTool,
  isPlanFileWrite,
} from './rule-matcher';

// Permission Manager Interface
export type { IPermissionManager } from './permission-manager-types';

// Permission Hooks
export {
  PermissionHooks,
  createPermissionHooks,
  isPersistentShellAllowRuleForbidden,
  type PermissionHooksOptions,
} from './permission-hooks';
