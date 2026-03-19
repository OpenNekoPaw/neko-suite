/**
 * Agent Session Initializer — Constructor logic extraction
 *
 * Responsibility: Create and wire all components needed by AgentSession.
 * Extracted from the 9-step AgentSession constructor to follow SRP —
 * initialization logic is separate from runtime session management.
 *
 * Note: SkillInjectionCoordinator is NOT created here because it requires
 * closures over Session fields that change on configure() (e.g., _permissionHooks).
 * Session creates the coordinator itself after initialization.
 */

import type { ChatMessage } from '@neko/shared';
import type { AgentSessionConfig } from './types';
import type { IPermissionManager } from '../permission/permission-manager-types';
import type { PermissionMode } from '../permission/types';
import type { ToolConfirmationRequest } from '../permission/types';

import { AgentExecutor } from '../executor';
import type { Tool } from '@neko/shared';
import { ConversationCompressor } from '../context';
import { createExecutorHooks } from '../hooks';
import { ToolGroupRegistry, registerBuiltinToolGroups } from '../skill';
import {
  ToolCategoryRegistry,
  ToolInjectionManager,
  createCoreMetaTools,
  DEFAULT_INJECTION_CONFIG,
} from '../tools';
import { SystemPromptComposer } from '../prompt/system-prompt-composer';

// =============================================================================
// Constants (re-exported for Session's _rebuildExecutor)
// =============================================================================

/** Default max context tokens */
export const DEFAULT_MAX_CONTEXT_TOKENS = 100000;

/** Default max iterations */
export const DEFAULT_MAX_ITERATIONS = 50;

// =============================================================================
// Types
// =============================================================================

/**
 * All components created during session initialization.
 * SkillInjectionCoordinator is excluded — Session creates it with field closures.
 */
export interface SessionComponents {
  compressor: ConversationCompressor;
  toolGroupRegistry: ToolGroupRegistry;
  toolCategoryRegistry: ToolCategoryRegistry;
  toolInjectionManager: ToolInjectionManager;
  promptComposer: SystemPromptComposer;
  executor: AgentExecutor;
  permissionHooks: IPermissionManager;
  history: ChatMessage[];
  metaTools: Tool[];
}

/**
 * Callbacks that the initializer needs from the session (to break circular dependency)
 */
export interface SessionCallbacks {
  onToolConfirmation: (request: ToolConfirmationRequest) => void;
}

// =============================================================================
// Initializer
// =============================================================================

/**
 * Initialize all session components from config.
 *
 * Steps:
 * 1. Create ConversationCompressor
 * 2. Create/configure ToolGroupRegistry
 * 3. Create/configure ToolCategoryRegistry
 * 4. Create ToolInjectionManager
 * 5. Register core meta tools
 * 6. Create executor with hooks chain
 * 7. Create SystemPromptComposer + initial history
 */
export function initializeSession(
  config: AgentSessionConfig,
  callbacks: SessionCallbacks,
): SessionComponents {
  // Step 1: Conversation compressor
  const compressor = new ConversationCompressor({
    triggers: {
      tokenThreshold: config.contextSettings?.maxTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
      turnThreshold: 20,
    },
  });

  // Step 2: Tool group registry
  const toolGroupRegistry =
    (config.toolGroupRegistry as ToolGroupRegistry) ?? new ToolGroupRegistry();
  if (!config.toolGroupRegistry) {
    registerBuiltinToolGroups(toolGroupRegistry);
  }

  // Step 3: Tool category registry
  const toolCategoryRegistry =
    (config.toolCategoryRegistry as ToolCategoryRegistry) ?? new ToolCategoryRegistry();
  if (!config.toolCategoryRegistry) {
    const defaultActiveGroups = toolGroupRegistry.list().filter((g) => g.alwaysActive);
    for (const group of defaultActiveGroups) {
      for (const toolName of group.tools) {
        toolCategoryRegistry.categorizeTool(toolName, 'system', 'dynamic');
      }
    }
  }

  // Step 4: Tool injection manager
  const toolInjectionManager = new ToolInjectionManager(
    toolCategoryRegistry,
    toolGroupRegistry,
    DEFAULT_INJECTION_CONFIG,
  );

  // Step 5: Register core meta tools
  const metaTools = createCoreMetaTools(
    toolCategoryRegistry,
    toolInjectionManager,
    toolGroupRegistry,
  );
  for (const tool of metaTools) {
    config.toolRegistry.register(tool);
    toolCategoryRegistry.categorizeTool(tool.name, 'system', 'always');
  }

  // Step 6: Create executor with hooks chain
  const executionMode = config.executionMode ?? 'auto';
  const permissionMode: PermissionMode =
    executionMode === 'plan' ? 'plan' : executionMode === 'auto' ? 'auto' : 'ask';

  const { executor, permissionHooks } = createConfiguredExecutor({
    config,
    permissionMode,
    compressor,
    toolGroupRegistry,
    toolInjectionManager,
    onToolConfirmation: (request) => callbacks.onToolConfirmation(request),
  });

  // Step 7: System prompt composer + initial history
  const promptComposer = new SystemPromptComposer();
  promptComposer.setBase(config.systemPrompt);
  const history: ChatMessage[] = [{ role: 'system', content: promptComposer.compose() }];

  return {
    compressor,
    toolGroupRegistry,
    toolCategoryRegistry,
    toolInjectionManager,
    promptComposer,
    executor,
    permissionHooks,
    history,
    metaTools,
  };
}

// =============================================================================
// Executor Factory (shared by initializeSession + AgentSession._rebuildExecutor)
// =============================================================================

/**
 * Dependencies for creating a configured executor
 */
export interface CreateExecutorDeps {
  config: AgentSessionConfig;
  permissionMode: PermissionMode;
  compressor: ConversationCompressor;
  toolGroupRegistry: ToolGroupRegistry;
  toolInjectionManager: ToolInjectionManager;
  onToolConfirmation: (request: ToolConfirmationRequest) => void;
}

/**
 * Create an executor with hooks chain. Shared by initializeSession and
 * AgentSession._rebuildExecutor to eliminate duplication.
 */
export function createConfiguredExecutor(deps: CreateExecutorDeps): {
  executor: AgentExecutor;
  permissionHooks: IPermissionManager;
} {
  const {
    config,
    permissionMode,
    compressor,
    toolGroupRegistry,
    toolInjectionManager,
    onToolConfirmation,
  } = deps;

  const { hooks, permissionHooks } = createExecutorHooks({
    compressor,
    permissionMode,
    onToolAskStarted: onToolConfirmation,
    settingsHookLoader: config.settingsHookLoader,
    customHooks: config.hooks,
    onValidationWarning: config.onValidationWarning,
    onValidationError: config.onValidationError,
  });

  const executor = new AgentExecutor({
    service: config.service,
    toolRegistry: config.toolRegistry,
    config: {
      name: 'agent-session',
      systemPrompt: config.systemPrompt,
      tools: config.toolRegistry.toToolDefinitions(),
      maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      primaryModel: config.modelId,
      serviceOptions: {
        modelId: config.modelId,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        thinkingBudget: config.thinkingBudget,
      },
    },
    hooks,
    toolSkillRegistry: toolGroupRegistry,
    toolInjectionManager,
  });

  return { executor, permissionHooks };
}
