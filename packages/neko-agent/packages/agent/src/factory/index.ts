/**
 * Agent Factory Module
 *
 * Provides unified factory for creating configured AgentExecutor instances.
 * This encapsulates the complex configuration logic, allowing extension layer
 * to focus on VSCode integration.
 */

export {
  createConfiguredAgent,
  estimateTokenCount,
  type ExecutionMode,
  type AgentFactoryConfig,
  type AgentFactoryResult,
} from './agent-factory';
