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
import { ConversationCompressor, MessageClassifier, CreativeSummarizer } from '../context';
import { createExecutorHooks } from '../hooks';
import { ToolGroupRegistry, registerBuiltinToolGroups } from '../skill';
import {
  ToolCategoryRegistry,
  ToolInjectionManager,
  createCoreMetaTools,
  DEFAULT_INJECTION_CONFIG,
  resolveToolGroupTier,
} from '../tools';
import { SystemPromptComposer } from '../prompt/system-prompt-composer';
import { MemoryProjectModule } from '../prompt/modules/memory/memory-project-module';
import { MemoryGlobalModule } from '../prompt/modules/memory/memory-global-module';
import { MemoryRecallModule } from '../prompt/modules/memory/memory-recall-module';
import { CreativeVersionLogModule } from '../prompt/modules/ephemeral/creative-version-log-module';
import type { PromptModuleSection } from '../prompt/registry/module-manifest';

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

  // PR2: Prompt-module infrastructure. Exposed for future runtime use
  // (SkillInjectionCoordinator migration, SelfEvaluation hooks, etc.)
  memoryProjectModule: MemoryProjectModule;
  memoryGlobalModule: MemoryGlobalModule;
  memoryRecallModule: MemoryRecallModule;
  creativeVersionLogModule: CreativeVersionLogModule;
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
  // When creative compression is enabled, inject MessageClassifier + CreativeSummarizer
  // so older turns are compressed with priority-based classification instead of bulk summary.
  const creativeOpt = config.creativeCompression;
  const classifier = creativeOpt
    ? new MessageClassifier(typeof creativeOpt === 'object' ? creativeOpt : undefined)
    : undefined;
  const creativeSummarizer = classifier
    ? new CreativeSummarizer(classifier, {
        service: config.service,
        creativeConfig: typeof creativeOpt === 'object' ? creativeOpt : undefined,
      })
    : undefined;

  const compressor = new ConversationCompressor(
    {
      triggers: {
        tokenThreshold: config.contextSettings?.maxTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
        turnThreshold: 20,
      },
    },
    creativeSummarizer ?? undefined,
    classifier ?? undefined,
  );

  // Step 2: Tool group registry
  const toolGroupRegistry =
    (config.toolGroupRegistry as ToolGroupRegistry) ?? new ToolGroupRegistry();
  if (!config.toolGroupRegistry) {
    registerBuiltinToolGroups(toolGroupRegistry);
  }

  // Step 3: Tool category registry — categorize tools by loading tier
  const toolCategoryRegistry =
    (config.toolCategoryRegistry as ToolCategoryRegistry) ?? new ToolCategoryRegistry();
  if (!config.toolCategoryRegistry) {
    for (const group of toolGroupRegistry.listEnabled()) {
      const tier = resolveToolGroupTier(group);
      if (tier === 'resident') {
        // Resident tools: always in LLM context (CORE_TOOLS forces 'always' layer)
        for (const toolName of group.tools) {
          toolCategoryRegistry.categorizeTool(toolName, 'system', 'always');
        }
      } else if (tier === 'eager') {
        // Eager tools: registered but not injected until ToolSet activation
        for (const toolName of group.tools) {
          toolCategoryRegistry.categorizeTool(toolName, 'system', 'dynamic');
        }
      }
      // Lazy tools: not registered in ToolCategoryRegistry at init.
      // Metadata stays in ToolGroupRegistry for AI discovery via GetContext.
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

  // Step 8: Prompt modules (PR2) — own the format contract for
  // environment/ephemeral sections that were previously written directly
  // with composer.setSection. The modules are stored on SessionComponents
  // so session-level callers (CreativeMemoryHooks, _syncSystemPrompt) can
  // drive them.
  const memoryProjectModule = new MemoryProjectModule();
  const memoryGlobalModule = new MemoryGlobalModule();
  const memoryRecallModule = new MemoryRecallModule();
  const creativeVersionLogModule = new CreativeVersionLogModule();

  // Inject project memory via MemoryProjectModule (renderSync for in-line
  // update: event handlers fire synchronously and the composer state must
  // be fresh before the next composer read).
  if (config.projectMemoryManager) {
    const injectProject = (content: string | null): void => {
      memoryProjectModule.setContent(content);
      writeModuleSectionsSync(promptComposer, 'memory:project', memoryProjectModule.renderSync());
    };
    injectProject(config.projectMemoryManager.getContent());
    config.projectMemoryManager.on('change', injectProject);
  }

  // Inject global memory via MemoryGlobalModule.
  if (config.globalMemoryManager) {
    const injectGlobal = (content: string | null): void => {
      memoryGlobalModule.setContent(content);
      writeModuleSectionsSync(promptComposer, 'memory:global', memoryGlobalModule.renderSync());
    };
    injectGlobal(config.globalMemoryManager.getContent());
    config.globalMemoryManager.on('change', injectGlobal);
  }

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
    memoryProjectModule,
    memoryGlobalModule,
    memoryRecallModule,
    creativeVersionLogModule,
  };
}

/**
 * Write the sections produced by a Module.renderSync() into the composer,
 * first clearing any stale section the module owned under `ownerId`. Keeps
 * the swap semantics consistent with ModuleOrchestrator while staying sync.
 */
function writeModuleSectionsSync(
  composer: SystemPromptComposer,
  ownerId: string,
  sections: readonly PromptModuleSection[] | null,
): void {
  composer.removeSection(ownerId);
  if (!sections) return;
  for (const s of sections) {
    composer.setSection({
      id: s.sectionId,
      layer: s.layer,
      content: s.content,
      priority: s.priority,
      ...(s.cacheControl && { cacheControl: s.cacheControl }),
    });
  }
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
    traitsRegistry: config.traitsRegistry,
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
