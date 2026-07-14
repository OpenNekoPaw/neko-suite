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

import type { ChatMessage, IToolRegistry, ToolName } from '@neko/shared';
import type { AgentSessionConfig } from './types';
import type { IPermissionManager } from '../permission/permission-manager-types';
import type { PermissionMode } from '../permission/types';
import type { ToolConfirmationRequest } from '../permission/types';

import { AgentExecutor } from '../executor';
import type { Tool } from '@neko/shared';
import { ConversationCompressor, MessageClassifier, CreativeSummarizer } from '../context';
import { createExecutorHooks } from '../hooks';
import { ToolGroupRegistry } from '../skill';
import {
  ToolCategoryRegistry,
  ToolInjectionManager,
  createCoreMetaTools,
  createPerceptionTools,
  resolveToolGroupTier,
} from '../tools';
import { PerceiveTool } from '../perception';
import { SystemPromptComposer } from '../prompt/system-prompt-composer';
import { MemoryProjectModule } from '../prompt/modules/memory/memory-project-module';
import { MemoryRecallModule } from '../prompt/modules/memory/memory-recall-module';
import { CreativeVersionLogModule } from '../prompt/modules/ephemeral/creative-version-log-module';
import { ValidationGuidanceModule } from '../prompt/modules/ephemeral/validation-guidance-module';
import { SkillInjectionModule } from '../prompt/modules/skill/skill-injection-module';
import { AgentsMdModule } from '../prompt/modules/environment/agents-md-module';
import { SubpackageFragmentsModule } from '../prompt/modules/environment/subpackage-fragments-module';
import { ModuleOrchestrator } from '../prompt/composer/module-orchestrator';
import { PromptModuleRegistry } from '../prompt/registry/module-registry';
import { PromptSectionCache } from '../prompt/registry/section-cache';
import { freezePromptContext, type PromptContext } from '../prompt/context';
import { createSessionToolRegistryView } from './session-tool-registry-view';

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
  executionToolRegistry: IToolRegistry;
  promptComposer: SystemPromptComposer;
  executor: AgentExecutor;
  permissionHooks: IPermissionManager;
  history: ChatMessage[];
  metaTools: Tool[];

  // PR2: Prompt-module infrastructure. Exposed for future runtime use
  // (SelfEvaluation hooks, etc.)
  memoryProjectModule: MemoryProjectModule;
  memoryRecallModule: MemoryRecallModule;
  creativeVersionLogModule: CreativeVersionLogModule;
  validationGuidanceModule: ValidationGuidanceModule;
  promptModuleOrchestrator: ModuleOrchestrator;
  // PR3a: SkillInjectionCoordinator consumes this to route Track A writes
  // through the module.
  skillInjectionModule: SkillInjectionModule;

  // PR3b: AGENTS.md overlay projected into the environment layer instead
  // of replacing the base prompt.
  agentsMdModule: AgentsMdModule;

  // PR3e: sub-package prompt fragments projected into the L3 environment
  // layer (priority 70). Populated from config.promptFragments at init.
  subpackageFragmentsModule: SubpackageFragmentsModule;
}

/**
 * Callbacks that the initializer needs from the session (to break circular dependency)
 */
export interface SessionCallbacks {
  onToolConfirmation: (request: ToolConfirmationRequest) => void;
  getActiveArtifactValidationRequirements?: () => readonly string[] | undefined;
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
        locale: config.locale,
        summarizerConfig: {
          provider: config.providerId,
          model: config.modelId,
        },
      })
    : undefined;

  const compressor = new ConversationCompressor(
    {
      locale: config.locale ?? 'en',
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

  if (config.perceptionPipeline) {
    const perceiveTool = new PerceiveTool({ pipeline: config.perceptionPipeline });
    if (!config.toolRegistry.get(perceiveTool.name)) {
      config.toolRegistry.register(perceiveTool);
    }
    toolCategoryRegistry.categorizeTool(perceiveTool.name, 'analysis', 'always');
  }

  const toolInjectionManager = new ToolInjectionManager(toolCategoryRegistry, toolGroupRegistry);

  // Step 5: Register core meta tools (idempotent — shared registry survives across sessions)
  const metaTools = createCoreMetaTools(
    toolCategoryRegistry,
    toolInjectionManager,
    toolGroupRegistry,
  );
  for (const tool of metaTools) {
    if (!config.toolRegistry.get(tool.name)) {
      config.toolRegistry.register(tool);
    }
    toolCategoryRegistry.categorizeTool(tool.name, 'system', 'always');
  }
  const executionToolRegistry = createSessionToolRegistryView(config.toolRegistry, metaTools);

  for (const tool of createPerceptionTools({
    ...(config.perceptionClients?.transcribe && {
      transcribeClient: config.perceptionClients.transcribe,
    }),
    ...(config.perceptionClients?.similarity && {
      similarityClient: config.perceptionClients.similarity,
    }),
    ...(config.perceptionClients?.classify && {
      classifyClient: config.perceptionClients.classify,
    }),
    ...(config.perceptionClients?.detectShots && {
      detectShotsClient: config.perceptionClients.detectShots,
    }),
  })) {
    if (!config.toolRegistry.get(tool.name)) {
      config.toolRegistry.register(tool);
    }
  }

  // Step 6: Create executor with hooks chain
  const executionMode = config.executionMode ?? 'auto';
  const permissionMode: PermissionMode =
    executionMode === 'plan' ? 'plan' : executionMode === 'auto' ? 'auto' : 'ask';

  const { executor, permissionHooks } = createConfiguredExecutor({
    config,
    toolRegistry: executionToolRegistry,
    permissionMode,
    compressor,
    toolGroupRegistry,
    toolInjectionManager,
    onToolConfirmation: (request) => callbacks.onToolConfirmation(request),
    ...(callbacks.getActiveArtifactValidationRequirements
      ? {
          getActiveArtifactValidationRequirements:
            callbacks.getActiveArtifactValidationRequirements,
        }
      : {}),
  });

  // Step 7: System prompt composer + initial history
  const promptComposer = new SystemPromptComposer();
  promptComposer.setBase(config.systemPrompt);

  // Step 8: Prompt modules (PR2) — own the format contract for
  // environment/ephemeral sections that were previously written directly
  // with composer.setSection. The modules are stored on SessionComponents
  // so session-level callers like _syncSystemPrompt can drive them.
  const memoryProjectModule = new MemoryProjectModule();
  const memoryRecallModule = new MemoryRecallModule();
  const creativeVersionLogModule = new CreativeVersionLogModule();
  const validationGuidanceModule = new ValidationGuidanceModule();
  const skillInjectionModule = new SkillInjectionModule();
  const agentsMdModule = new AgentsMdModule();
  const subpackageFragmentsModule = new SubpackageFragmentsModule();
  const promptModuleRegistry = new PromptModuleRegistry();
  for (const module of [
    memoryRecallModule,
    agentsMdModule,
    creativeVersionLogModule,
    subpackageFragmentsModule,
    validationGuidanceModule,
    memoryProjectModule,
  ]) {
    promptModuleRegistry.register(module);
  }
  const promptModuleOrchestrator = new ModuleOrchestrator(
    promptModuleRegistry,
    promptComposer,
    new PromptSectionCache(),
  );
  const initialPromptContext = (): PromptContext =>
    buildInitializerPromptContext(config, toolInjectionManager);

  // PR3b: AGENTS.md overlay — when the caller supplies agentsOverride
  // content we project it through the module into the environment layer
  // at priority 80. Happens before the memory subscriptions below so the
  // final prompt interleaves correctly.
  agentsMdModule.setContent(config.agentsOverride ?? null);

  // PR3e: sub-package prompt fragments — one composer section per
  // fragment at ids `fragment:${f.id}`. Uses removeSectionsByPrefix to
  // clear any prior `fragment:*` sections in one sweep (cheap, and keeps
  // the initializer idempotent if it were ever called twice).
  subpackageFragmentsModule.setFragments(config.promptFragments);

  // Inject project memory via MemoryProjectModule (renderSync for in-line
  // update: event handlers fire synchronously and the composer state must
  // be fresh before the next composer read).
  if (config.projectMemoryManager) {
    const injectProject = (content: string | null): void => {
      memoryProjectModule.setContent(content);
      promptModuleOrchestrator.applyOneSync(memoryProjectModule, initialPromptContext());
    };
    memoryProjectModule.setContent(config.projectMemoryManager.getContent());
    config.projectMemoryManager.on('change', injectProject);
  }

  promptModuleOrchestrator.applyAllSync(initialPromptContext());

  const history: ChatMessage[] = [{ role: 'system', content: promptComposer.compose() }];

  return {
    compressor,
    toolGroupRegistry,
    toolCategoryRegistry,
    toolInjectionManager,
    executionToolRegistry,
    promptComposer,
    executor,
    permissionHooks,
    history,
    metaTools,
    memoryProjectModule,
    memoryRecallModule,
    creativeVersionLogModule,
    validationGuidanceModule,
    promptModuleOrchestrator,
    skillInjectionModule,
    agentsMdModule,
    subpackageFragmentsModule,
  };
}

function buildInitializerPromptContext(
  config: AgentSessionConfig,
  toolInjectionManager: ToolInjectionManager,
): PromptContext {
  const state = toolInjectionManager.getState();
  return freezePromptContext({
    locale: config.locale ?? 'en',
    projectPath: config.workspace?.root ?? '',
    activeSkillName: null,
    activeTools: [
      ...(state.injectedTools.get('always') ?? []),
      ...(state.injectedTools.get('dynamic') ?? []),
    ] as readonly ToolName[],
  });
}

// =============================================================================
// Executor Factory (shared by initializeSession + AgentSession._rebuildExecutor)
// =============================================================================

/**
 * Dependencies for creating a configured executor
 */
export interface CreateExecutorDeps {
  config: AgentSessionConfig;
  toolRegistry: IToolRegistry;
  permissionMode: PermissionMode;
  compressor: ConversationCompressor;
  toolGroupRegistry: ToolGroupRegistry;
  toolInjectionManager: ToolInjectionManager;
  onToolConfirmation: (request: ToolConfirmationRequest) => void;
  getActiveArtifactValidationRequirements?: () => readonly string[] | undefined;
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
    toolRegistry,
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
    readOnlyTools: collectRegisteredReadOnlyToolNames(toolRegistry),
  });

  const executor = new AgentExecutor({
    service: config.service,
    toolRegistry,
    config: {
      name: 'agent-session',
      systemPrompt: config.systemPrompt,
      tools: toolRegistry.toToolDefinitions(),
      maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      primaryModel: config.modelId,
      serviceOptions: {
        providerId: config.providerId,
        modelId: config.modelId,
        modelCapabilities: config.modelCapabilities,
        temperature: config.temperature,
        topP: config.topP,
        maxTokens: config.maxTokens,
        thinkingBudget: config.thinkingBudget,
        providerOptions: config.providerOptions,
      },
    },
    hooks,
    ...(deps.getActiveArtifactValidationRequirements
      ? { getActiveArtifactValidationRequirements: deps.getActiveArtifactValidationRequirements }
      : {}),
    toolSkillRegistry: toolGroupRegistry,
    toolInjectionManager,
  });

  return { executor, permissionHooks };
}

function collectRegisteredReadOnlyToolNames(toolRegistry: IToolRegistry): string[] {
  return toolRegistry
    .list()
    .filter((tool) => tool.isReadOnly)
    .map((tool) => tool.name);
}
