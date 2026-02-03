/**
 * SubAgent Module - Parent-child agent orchestration
 *
 * Provides SubAgent mechanism for:
 * - Spawning specialized child agents for parallel task execution
 * - Managing SubAgent lifecycle (spawn, cancel, cleanup)
 * - Context passing between parent and child agents
 * - Task tools for agent invocation
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Core types
  SubAgentRunMode,
  SubAgentStatus,
  SpecializedAgentType,
  ModelTier,
  // Configuration
  SubAgentConfig,
  SpecializedAgentPreset,
  // Results
  SubAgentResult,
  // Events
  SubAgentEventType,
  SubAgentEvent,
  SubAgentEventListener,
  // Manager interface
  SubAgentManagerDeps,
  SubAgentExecutor,
  ISubAgentManager,
  // Tool types
  TaskToolArgs,
  TaskOutputToolArgs,
  // Context bridge types
  ContextExtractionOptions,
  IContextBridge,
} from './types';

// =============================================================================
// Manager
// =============================================================================

export {
  SubAgentManager,
  SPECIALIZED_PRESETS,
} from './subagent-manager';

// =============================================================================
// Context Bridge
// =============================================================================

export {
  ContextBridge,
  createContextBridge,
  estimateTokens,
  createContextSummaryForSubAgent,
} from './context-bridge';

// =============================================================================
// Tools
// =============================================================================

export {
  createTaskTool,
  createTaskOutputTool,
  registerSubAgentTools,
} from './task-tool';

// =============================================================================
// Factory Function
// =============================================================================

import type { SubAgentManagerDeps, ISubAgentManager } from './types';
import { SubAgentManager } from './subagent-manager';
import { registerSubAgentTools } from './task-tool';

/**
 * Options for creating SubAgent system
 */
export interface SubAgentSystemOptions extends SubAgentManagerDeps {
  /** Whether to auto-register task tools */
  registerTools?: boolean;
}

/**
 * SubAgent system instance
 */
export interface SubAgentSystem {
  /** SubAgent manager */
  manager: ISubAgentManager;
  /** Dispose resources */
  dispose: () => void;
}

/**
 * Create a complete SubAgent system
 *
 * @example
 * ```typescript
 * const subagent = createSubAgentSystem({
 *   createService,
 *   createAgent,
 *   toolRegistry,
 *   registerTools: true,
 * });
 *
 * // Use the manager
 * const id = await subagent.manager.spawn(parentId, convId, config);
 * const result = await subagent.manager.getResult(id);
 *
 * // Cleanup
 * subagent.dispose();
 * ```
 */
export function createSubAgentSystem(options: SubAgentSystemOptions): SubAgentSystem {
  const { createService, createAgent, toolRegistry, registerTools = true } = options;

  const manager = new SubAgentManager({
    createService,
    createAgent,
    toolRegistry,
  });

  // Register task tools if requested
  if (registerTools) {
    registerSubAgentTools(toolRegistry, manager);
  }

  return {
    manager,
    dispose: () => {
      // Cancel all running SubAgents
      // Note: In production, we might want to track all parent IDs
      // For now, cleanup is handled by the parent agent lifecycle
    },
  };
}
