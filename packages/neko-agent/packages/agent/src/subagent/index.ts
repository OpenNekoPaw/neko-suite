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
  BuiltinSpecializedAgentType,
  SpecializedAgentType,
  ModelTier,
  AgentToolPolicy,
  ModelTierResolver,
  // Configuration
  SubAgentConfig,
  SpecializedAgentPreset,
  // Results
  SubAgentResult,
  // Events
  SubAgentEventType,
  SubAgentEvent,
  SubAgentEventListener,
  SubAgentModelTierResolverContext,
  // Manager interface
  SubAgentManagerDeps,
  SubAgentExecutor,
  SubAgentCreateAgentContext,
  SubAgentSkillContentProvider,
  ISubAgentManager,
  // Tool types
  SubAgentToolArgs,
  SubAgentOutputToolArgs,
  // Context bridge types
  ContextExtractionOptions,
  IContextBridge,
} from './types';

// =============================================================================
// Manager
// =============================================================================

export { SubAgentManager, SPECIALIZED_PRESETS } from './subagent-manager';

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

export { createSubAgentTool, createSubAgentOutputTool, registerSubAgentTools } from './task-tool';

// =============================================================================
// Coordinator
// =============================================================================

export {
  Coordinator,
  createCoordinator,
  TaskPool,
  createTaskPool,
  PermissionBridge,
  createPermissionBridge,
  createCoordinateTool,
} from './coordinator';

export type {
  CoordinatorPhase,
  CoordinatorConfig,
  CoordinatorDeps,
  CoordinatorEvent,
  CoordinatorEventType,
  CoordinateToolDeps,
  ICoordinator,
  TaskItem,
  TaskStatus,
  TaskNotification,
  TaskPoolProgress,
  PermissionBridgeConfig,
} from './coordinator';

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
 * // Use the manager with the complete child-run owner scope
 * const scope = await subagent.manager.spawn(childRunScope, config);
 * const result = await subagent.manager.getResult(scope);
 *
 * // Cleanup
 * subagent.dispose();
 * ```
 */
export function createSubAgentSystem(options: SubAgentSystemOptions): SubAgentSystem {
  const { registerTools = true, ...deps } = options;

  const manager = new SubAgentManager(deps);

  // Register task tools if requested
  if (registerTools) {
    registerSubAgentTools(deps.toolRegistry, manager);
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
