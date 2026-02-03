/**
 * Agent Factory - Unified factory for creating configured AgentExecutor instances
 *
 * This factory encapsulates the complex configuration logic that was previously
 * scattered in extension/AgentRunner, providing:
 * - ToolSkill/ToolGroup registry setup
 * - ToolCategoryRegistry and ToolInjectionManager initialization
 * - Hooks composition (Memory, Validation, Permission)
 * - Core meta tools registration
 *
 * Extension layer only needs to:
 * - Provide platform instance and VSCode-specific callbacks
 * - Handle VSCode events and lifecycle
 */

import type {
  AgentConfig,
  ExecutorHooks,
  IService,
  IToolRegistry,
  ChatMessage,
  IToolSkillRegistry,
  IToolInjectionManager,
  IToolCategoryRegistry,
} from '@neko/shared';

import type {
  ToolConfirmationRequest,
} from '../permission/types';
import type {
  ValidationWarning,
  ValidationError,
} from '../validation/types';

import { AgentExecutor, type AgentExecutorOptions } from '../executor';
import { MemoryHooks } from '../hooks';
import { createValidationHooks } from '../validation';
import {
  createPermissionHooks,
  type PermissionHooks,
  type PermissionMode,
} from '../permission';
import { ContextManager, SimpleTokenCounter } from '../memory';
import {
  ToolSkillRegistry,
  registerBuiltinToolSkills,
} from '../skill';
import {
  ToolCategoryRegistry,
  ToolInjectionManager,
  createCoreMetaTools,
  DEFAULT_INJECTION_CONFIG,
} from '../tools';

// =============================================================================
// Types
// =============================================================================

/**
 * Execution mode for agent
 */
export type ExecutionMode = 'plan' | 'ask' | 'auto';

/**
 * Agent factory configuration
 */
export interface AgentFactoryConfig {
  /** Service instance for LLM calls */
  service: IService;

  /** Tool registry with available tools */
  toolRegistry: IToolRegistry;

  /** System prompt */
  systemPrompt: string;

  /** Agent name */
  name?: string;

  /** Max iterations (default: Infinity) */
  maxIterations?: number;

  /** Primary model ID */
  modelId?: string;

  /** Temperature */
  temperature?: number;

  /** Max tokens */
  maxTokens?: number;

  /** Extended thinking budget (Claude only) */
  thinkingBudget?: number;

  /** Execution mode */
  executionMode?: ExecutionMode;

  /** Additional hooks to compose */
  additionalHooks?: ExecutorHooks[];

  /** Context compression settings */
  contextSettings?: {
    maxTokens?: number;
    reservedTokens?: number;
  };

  /** Validation settings */
  validationSettings?: {
    maxImageSizeBytes?: number;
    allowedImageFormats?: string[];
    mermaidPreValidate?: boolean;
    onValidationFail?: 'retry' | 'warn' | 'error' | 'silent';
  };

  /** Permission callbacks */
  permissionCallbacks?: {
    onToolAskStarted?: (request: ToolConfirmationRequest) => void;
  };

  /** Validation callbacks */
  validationCallbacks?: {
    onValidationWarning?: (warning: ValidationWarning) => void;
    onValidationError?: (error: ValidationError) => void;
  };

  /** External ToolCategoryRegistry (optional, will create if not provided) */
  toolCategoryRegistry?: IToolCategoryRegistry;

  /** External ToolSkillRegistry (optional, will create if not provided) */
  toolSkillRegistry?: IToolSkillRegistry;
}

/**
 * Result from agent factory
 */
export interface AgentFactoryResult {
  /** Configured agent executor */
  executor: AgentExecutor;

  /** Context manager for compression */
  contextManager: ContextManager;

  /** Permission hooks for tool confirmation */
  permissionHooks: PermissionHooks;

  /** ToolSkill registry */
  toolSkillRegistry: IToolSkillRegistry;

  /** ToolCategory registry */
  toolCategoryRegistry: IToolCategoryRegistry;

  /** ToolInjection manager */
  toolInjectionManager: IToolInjectionManager;
}

// =============================================================================
// Constants
// =============================================================================

/** Default max context tokens */
const DEFAULT_MAX_CONTEXT_TOKENS = 100000;

/** Default reserved tokens for response */
const DEFAULT_RESERVED_TOKENS = 4000;

/** Default image constraints */
const DEFAULT_IMAGE_CONSTRAINTS = {
  maxSizeBytes: 5 * 1024 * 1024, // 5MB (Claude limit)
  allowedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
};

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a fully configured AgentExecutor with all necessary components
 *
 * This factory handles:
 * 1. ContextManager setup for automatic context compression
 * 2. MemoryHooks for context management
 * 3. ValidationHooks for input/output validation
 * 4. PermissionHooks for tool confirmation (ask/auto/plan mode)
 * 5. ToolSkillRegistry and ToolCategoryRegistry initialization
 * 6. ToolInjectionManager for three-layer tool injection
 * 7. Core meta tools registration (searchTools, activateSkill, etc.)
 *
 * @param config Factory configuration
 * @returns Configured executor and supporting components
 */
export function createConfiguredAgent(config: AgentFactoryConfig): AgentFactoryResult {
  // -------------------------------------------------------------------------
  // 1. Create ContextManager for automatic context compression
  // -------------------------------------------------------------------------
  const tokenCounter = new SimpleTokenCounter();
  const contextManager = new ContextManager({
    maxTokens: config.contextSettings?.maxTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
    reservedTokens: config.contextSettings?.reservedTokens ?? DEFAULT_RESERVED_TOKENS,
    strategy: 'sliding_window',
    tokenCounter,
  });

  // -------------------------------------------------------------------------
  // 2. Create MemoryHooks
  // -------------------------------------------------------------------------
  const memoryHooks = new MemoryHooks({
    contextManager,
  });

  // -------------------------------------------------------------------------
  // 3. Create ValidationHooks
  // -------------------------------------------------------------------------
  const validationHooks = createValidationHooks({
    imageConstraints: {
      maxSizeBytes: config.validationSettings?.maxImageSizeBytes ?? DEFAULT_IMAGE_CONSTRAINTS.maxSizeBytes,
      allowedFormats: config.validationSettings?.allowedImageFormats ?? DEFAULT_IMAGE_CONSTRAINTS.allowedFormats,
    },
    outputConstraints: {
      mermaidPreValidate: config.validationSettings?.mermaidPreValidate ?? true,
      onValidationFail: config.validationSettings?.onValidationFail ?? 'retry',
    },
    onValidationWarning: config.validationCallbacks?.onValidationWarning,
    onValidationError: config.validationCallbacks?.onValidationError,
  });

  // -------------------------------------------------------------------------
  // 4. Create PermissionHooks
  // -------------------------------------------------------------------------
  const permissionMode: PermissionMode = config.executionMode === 'plan' ? 'plan'
    : config.executionMode === 'auto' ? 'auto' : 'ask';

  const permissionHooks = createPermissionHooks({
    config: {
      mode: permissionMode,
      rules: {},
    },
    onToolAskStarted: config.permissionCallbacks?.onToolAskStarted,
  });

  // -------------------------------------------------------------------------
  // 5. Initialize ToolSkillRegistry
  // -------------------------------------------------------------------------
  const toolSkillRegistry = config.toolSkillRegistry ?? new ToolSkillRegistry();
  if (!config.toolSkillRegistry) {
    registerBuiltinToolSkills(toolSkillRegistry as ToolSkillRegistry);
  }

  // -------------------------------------------------------------------------
  // 6. Initialize ToolCategoryRegistry
  // -------------------------------------------------------------------------
  const toolCategoryRegistry = config.toolCategoryRegistry ?? new ToolCategoryRegistry();
  if (!config.toolCategoryRegistry) {
    // Populate with tool categories from ToolSkillRegistry
    const defaultActiveSkills = (toolSkillRegistry as ToolSkillRegistry).list().filter(s => s.defaultActive);
    for (const skill of defaultActiveSkills) {
      for (const toolName of skill.tools) {
        (toolCategoryRegistry as ToolCategoryRegistry).categorizeTool(toolName, 'system', 'skill');
      }
    }
  }

  // -------------------------------------------------------------------------
  // 7. Initialize ToolInjectionManager
  // -------------------------------------------------------------------------
  const toolInjectionManager = new ToolInjectionManager(
    toolCategoryRegistry as ToolCategoryRegistry,
    toolSkillRegistry as ToolSkillRegistry,
    DEFAULT_INJECTION_CONFIG
  );

  // -------------------------------------------------------------------------
  // 8. Register core meta tools
  // -------------------------------------------------------------------------
  const metaTools = createCoreMetaTools(
    toolCategoryRegistry as ToolCategoryRegistry,
    toolInjectionManager,
    toolSkillRegistry as ToolSkillRegistry
  );
  for (const tool of metaTools) {
    config.toolRegistry.register(tool);
    (toolCategoryRegistry as ToolCategoryRegistry).categorizeTool(tool.name, 'system', 'core');
  }

  // -------------------------------------------------------------------------
  // 9. Compose all hooks
  // -------------------------------------------------------------------------
  const hooks: ExecutorHooks[] = [
    memoryHooks,
    validationHooks,
    permissionHooks,
    ...(config.additionalHooks ?? []),
  ];

  // -------------------------------------------------------------------------
  // 10. Create AgentConfig
  // -------------------------------------------------------------------------
  const agentConfig: AgentConfig = {
    name: config.name ?? 'agent',
    systemPrompt: config.systemPrompt,
    tools: config.toolRegistry.toToolDefinitions(),
    maxIterations: config.maxIterations ?? Infinity,
    primaryModel: config.modelId,
    serviceOptions: {
      model: config.modelId,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      thinkingBudget: config.thinkingBudget,
    },
  };

  // -------------------------------------------------------------------------
  // 11. Create AgentExecutor
  // -------------------------------------------------------------------------
  const executorOptions: AgentExecutorOptions = {
    service: config.service,
    toolRegistry: config.toolRegistry,
    config: agentConfig,
    hooks,
    toolSkillRegistry,
    toolInjectionManager,
  };

  const executor = new AgentExecutor(executorOptions);

  return {
    executor,
    contextManager,
    permissionHooks,
    toolSkillRegistry,
    toolCategoryRegistry,
    toolInjectionManager,
  };
}

/**
 * Helper to estimate token count for messages
 */
export function estimateTokenCount(messages: ChatMessage[]): number {
  const tokenCounter = new SimpleTokenCounter();
  return tokenCounter.countMessages(messages);
}
