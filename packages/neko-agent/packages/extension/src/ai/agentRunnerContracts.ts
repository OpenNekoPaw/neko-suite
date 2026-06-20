import type { EngineClient } from '@neko/neko-client/EngineClient';
import type { Platform } from '@neko/platform';
import type { IOperationToolAdapterRegistry } from '@neko/shared';
import type { ProviderExpressionTargetConfig } from '@neko/agent/runtime';
import type { ExecutionMode, IRuntimeTaskManager, ToolCategoryRegistry } from '@neko/agent';

export type { ExecutionMode, AgentEvent, AgentEventType } from '@neko/agent';

/**
 * Agent configuration consumed by the Extension runner adapter.
 *
 * The Extension owns host resources such as Platform, hook sources, engine
 * clients, and workspace paths. Runtime code receives these through typed
 * adapters instead of importing VSCode directly.
 */
export interface IAgentConfig {
  /** Platform instance */
  platform: Platform;

  /** System prompt */
  systemPrompt?: string;

  /** Max iterations (prevent infinite loops) */
  maxIterations?: number;

  /** Whether to auto execute tools */
  autoExecuteTools?: boolean;

  /** Temperature */
  temperature?: number;

  /** Top P sampling */
  topP?: number;

  /** Max tokens */
  maxTokens?: number;

  /** Model ID */
  modelId?: string;

  /** Selected media generation provider/model targets for ProviderCard expression context. */
  providerExpressionTargets?: readonly ProviderExpressionTargetConfig[];

  /**
   * Optional pre-created EngineClient. When omitted, AgentRunner lazily connects
   * to neko-engine via host-provided engine client bindings.
   */
  engineClient?: EngineClient;

  /**
   * Extended thinking budget tokens (Claude only)
   * Set to enable extended thinking. Recommended: 10000-50000
   */
  thinkingBudget?: number;

  /**
   * Tool execution mode
   * - plan: Only generate plan, don't execute
   * - ask: Require user confirmation for each operation
   * - auto: Auto execute
   */
  executionMode?: ExecutionMode;

  /**
   * Tool category registry for three-layer injection.
   * If not provided, a new one will be created.
   */
  toolCategoryRegistry?: ToolCategoryRegistry;

  /**
   * Workspace root path for AGENTS.md loading.
   */
  workspaceRoot?: string;

  /**
   * Shared task plane owned by the host runtime.
   * Used to project IDC checklist artifacts into the same task surface that
   * powers UI task views and persistence.
   */
  taskManager?: IRuntimeTaskManager;

  /**
   * Stable conversation ID used for journal persistence.
   */
  conversationId?: string;

  /**
   * Optional operation adapter registry override. When omitted, extension
   * runtime installs the default timeline/canvas/model adapters.
   */
  operationToolAdapterRegistry?: IOperationToolAdapterRegistry;

  /**
   * Locale for system prompt (en/zh).
   */
  locale?: 'en' | 'zh';
}
