/**
 * Executor Hooks Factory — Composable hook chain construction
 *
 * Responsibility: Create and compose the executor hooks chain from configuration.
 * Extracted from AgentSession._initializeExecutor() to follow OCP — new hook types
 * can be added without modifying AgentSession.
 *
 * Hook execution order: Memory → Validation → Permission → Custom hooks
 */

import type { AgentOutputValidationAdapter, ExecutorHooks } from '@neko/shared';
import type { ConversationCompressor } from '../context';
import type { IPermissionManager } from '../permission/permission-manager-types';
import type { PermissionMode, PermissionRules } from '../permission/types';
import type { ToolConfirmationRequest } from '../permission/types';
import { DEFAULT_READ_ONLY_TOOLS } from '../permission/types';
import type { ToolTraitsRegistry } from '../permission/tool-traits-registry';
import type { ValidationWarning, ValidationError } from '../validation/types';
import type { SettingsHookLoader } from '../hook-loader/settings-hook-loader';

import { MemoryHooks, RetryHooks } from './hooks';
import { createValidationHooks } from '../validation';
import { createPermissionHooks } from '../permission';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for the executor hooks factory
 */
export interface ExecutorHooksFactoryConfig {
  /** Conversation compressor for memory hooks */
  compressor: ConversationCompressor;

  /** Permission mode (derived from execution mode) */
  permissionMode: PermissionMode;

  /** Initial permission rules */
  permissionRules?: PermissionRules;

  /** Additional read-only tools supplied by registered capability providers. */
  readOnlyTools?: readonly string[];

  /** Callback when a tool requires user confirmation */
  onToolAskStarted?: (request: ToolConfirmationRequest) => void;

  /** Shell hook loader for PreToolUse / UserPromptSubmit hooks */
  settingsHookLoader?: SettingsHookLoader;

  /** Additional user-provided hooks (appended after built-in hooks) */
  customHooks?: ExecutorHooks[];

  /** Image validation constraints */
  imageConstraints?: {
    maxSizeBytes?: number;
    allowedFormats?: string[];
  };

  /** Output validation constraints */
  outputConstraints?: {
    mermaidPreValidate?: boolean;
    onValidationFail?: 'warn' | 'error' | 'retry' | 'silent';
  };

  /** Domain output validators supplied by owning capability packages. */
  outputValidationAdapters?: readonly AgentOutputValidationAdapter[];

  /** Validation warning callback */
  onValidationWarning?: (warning: ValidationWarning) => void;

  /** Validation error callback */
  onValidationError?: (error: ValidationError) => void;

  /** Tool traits registry for conditional auto mode (creative scenarios) */
  traitsRegistry?: ToolTraitsRegistry;

  /** Pre-built creative memory hooks (recall + extraction). Inserted after MemoryHooks. */
  creativeMemoryHooks?: ExecutorHooks;
}

/**
 * Result of creating the executor hooks chain
 */
export interface ExecutorHooksFactoryResult {
  /** Composed hooks array (ordered: memory → validation → permission → custom) */
  hooks: ExecutorHooks[];

  /** Reference to permission manager for runtime state management (add/remove rules, set mode) */
  permissionHooks: IPermissionManager;
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a composed executor hooks chain from configuration.
 *
 * Hook execution order:
 * 1. MemoryHooks — context compression
 * 2. ValidationHooks — input/output validation
 * 3. PermissionHooks — permission checking, tool confirmation
 * 4. RetryHooks — tool call retry with exponential backoff
 * 5. Custom hooks — user-provided extensions
 */
export function createExecutorHooks(
  config: ExecutorHooksFactoryConfig,
): ExecutorHooksFactoryResult {
  const memoryHooks = new MemoryHooks({
    compressor: config.compressor,
  });

  // 2. Validation hooks
  const validationHooks = createValidationHooks({
    imageConstraints: config.imageConstraints ?? {
      maxSizeBytes: 5 * 1024 * 1024,
      allowedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    },
    outputConstraints: config.outputConstraints ?? {
      mermaidPreValidate: true,
      onValidationFail: 'retry',
    },
    outputValidationAdapters: config.outputValidationAdapters,
    onValidationWarning: config.onValidationWarning,
    onValidationError: config.onValidationError,
  });

  // 3. Permission hooks (with creative plan tools and optional traits/budget)
  const permissionHooks = createPermissionHooks({
    config: {
      mode: config.permissionMode,
      rules: config.permissionRules ?? {},
      readOnlyTools: mergeReadOnlyTools(config.readOnlyTools),
    },
    onToolAskStarted: config.onToolAskStarted,
    settingsHookLoader: config.settingsHookLoader,
    traitsRegistry: config.traitsRegistry,
  });

  // 4. Retry hooks — auto-retry failed tool calls for transient errors
  const retryHooks = new RetryHooks({
    toolRetryPolicy: {
      maxRetries: 5,
      backoffStrategy: {
        type: 'exponential',
        initialDelayMs: 1000,
        multiplier: 2,
        maxDelayMs: 30000,
      },
      retryableCategories: ['timeout', 'rate_limit', 'server', 'network'],
    },
  });

  // 5. Compose built-in hooks and custom hooks.
  const builtinHooks: ExecutorHooks[] = [memoryHooks];
  if (config.creativeMemoryHooks) builtinHooks.push(config.creativeMemoryHooks);
  builtinHooks.push(validationHooks, permissionHooks, retryHooks);
  const hooks: ExecutorHooks[] = [...builtinHooks, ...(config.customHooks ?? [])];

  return { hooks, permissionHooks };
}

function mergeReadOnlyTools(extraTools: readonly string[] | undefined): string[] {
  return Array.from(new Set([...DEFAULT_READ_ONLY_TOOLS, ...(extraTools ?? [])]));
}
