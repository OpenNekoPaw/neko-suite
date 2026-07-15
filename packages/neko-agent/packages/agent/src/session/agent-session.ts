/**
 * Agent Session - Unified session management for CLI and Extension
 *
 * This class provides a unified interface for agent execution across different
 * entry points (CLI, Extension, etc.). It encapsulates:
 * - Execution mode management (plan/ask/auto)
 * - Extended thinking support (Claude)
 * - Context compression
 * - History management
 * - Tool confirmation flow
 *
 * Architecture:
 * - AgentSession wraps AgentExecutor and provides session-level state
 * - Uses hooks composition for Memory, Validation, Permission
 * - Converts AgentStep to AgentEvent for unified event streaming
 */

import type {
  AgentCapabilityActivationDiagnostic,
  AgentCapabilityActivationAction,
  AgentCapabilityActivationIntent,
  AgentCapabilityActivationProgressEvent,
  AgentCapabilityActivationTarget,
  AutohealEventEmitterPort,
  AgentValidationCoordinator as IValidationCoordinator,
  AgentValidationCycle,
  AgentValidationSignal,
  IAutohealChain,
  AgentProviderExpressionConceptDecision,
  AgentObservedToolResult,
  AgentStep,
  AgentTraceContext,
  ChatMessage,
  CompressedMessage,
  ConversationCompressionResult,
  PromptFragment,
  Skill,
  SkillLifecycleProjection,
  SubagentReviewResult,
  ToolName,
  Tool,
  IToolRegistry,
} from '@neko/shared';
import {
  createAgentCapabilityActivationIntent,
  createAgentCapabilityActivationProgressEvent,
  createAgentTraceContext,
  createAgentTurnId,
  deriveAgentTraceContext,
  withAgentTrace,
} from '@neko/shared';
import type { SkillInjection, IToolGuard, SkillPromptEntry } from '../skill';
import { buildSkillAwareSystemPrompt, createToolGuard, SkillInjectionCoordinator } from '../skill';
import { createReActLoopRunner } from '../executor';
import type { AgentEventBusEvent, IEventBus } from '../events';
import { AGENT_RUNTIME_CHANNELS, createEventBus } from '../events';
import type { NdjsonLoggedEvent } from '../workspace';
import { createNekoPaths, createNdjsonEventSink } from '../workspace';
import type { IApprovalEngine } from '../approval';
import {
  createApprovalEngine,
  executionStrategyPack,
  creationStrategyPack,
  createPreferencesStrategyPacks,
} from '../approval';
import { loadPreferences } from '../workspace';
import type { ISkillProvider } from '../tools/core/meta-tools';
import {
  ActivateSkillTool,
  DeactivateSkillTool,
  CreateSkillTool,
  GetContextTool,
  SetExecutionModeTool,
} from '../tools/core/meta-tools';
import { projectMediaModelToolsFromMetadata } from '../tools/media-generation-tool-selection';
import { stepToEvents, type StreamState } from './step-event-converter';
import { classifyAgentStepSemantics } from './agent-step-semantics';
import { backfillReadImagePerceptionResults } from './read-image-perception-backfill';

import type {
  IAgentSession,
  AgentSessionConfig,
  AgentEvent,
  ExecutionMode,
  ExecutionContext,
  CompressionResult,
  ToolResultPatchResult,
} from './types';

import type { ToolConfirmationRequest } from '../permission/types';
import { PLAN_MODE_SYSTEM_REMINDER } from '../permission/types';
import { isPersistentShellAllowRuleForbidden } from '../permission/permission-hooks';

import { AgentExecutor } from '../executor';
import { type ConversationCompressor } from '../context';
import {
  autoCompactIfNeeded,
  createAutoCompactState,
  type AutoCompactState,
} from '../context/auto-compact';
import {
  CreativeVersionLog,
  createCreativeVersionLog,
  isGenerationTool,
  detectEvaluation,
} from '../context/creative-version-log';
import { type IPermissionManager, type PermissionMode } from '../permission';
import { type ToolGroupRegistry } from '../skill';
import { type ToolInjectionManager } from '../tools';
import { type SystemPromptComposer } from '../prompt/system-prompt-composer';
import { ModuleOrchestrator } from '../prompt/composer/module-orchestrator';
import type { MemoryProjectModule } from '../prompt/modules/memory/memory-project-module';
import type { MemoryRecallModule } from '../prompt/modules/memory/memory-recall-module';
import type { CreativeVersionLogModule } from '../prompt/modules/ephemeral/creative-version-log-module';
import type { ValidationGuidanceModule } from '../prompt/modules/ephemeral/validation-guidance-module';
import type { SkillInjectionModule } from '../prompt/modules/skill/skill-injection-module';
import type { AgentsMdModule } from '../prompt/modules/environment/agents-md-module';
import type { SubpackageFragmentsModule } from '../prompt/modules/environment/subpackage-fragments-module';
import { createPromptContextProvider } from '../prompt/context';
import { MemoryRecall } from '../memory/memory-recall';
import {
  applyToolResultBackfillToChatHistory,
  projectPersistedEventsToWorkingMemory,
  type PersistedAgentEvent,
} from './working-memory';
import {
  createSessionTaskResultObservationRecorder,
  createTaskResultObservationJournalEntries,
  type TaskResultObservationJournalEntry,
} from './task-result-observation-recorder';
import { getLogger } from '../utils/logger';
import { toSerializableErrorCause } from '../utils/serializable-error';
import {
  initializeSession,
  createConfiguredExecutor,
  DEFAULT_MAX_CONTEXT_TOKENS,
  DEFAULT_MAX_ITERATIONS,
} from './agent-session-initializer';
import { ValidationRuntimeBridge } from './validation-runtime-bridge';
import { PromptRuntimeFacade } from './prompt-runtime-facade';
import { createAgentObservationRecorder } from '../runtime/agent-observation-recorder';

const logger = getLogger('AgentSession');
const SESSION_SYSTEM_PROMPT_REFRESH_HOOK_NAME = 'session-system-prompt-refresh';
const SESSION_READ_IMAGE_PERCEPTION_BACKFILL_HOOK_NAME = 'session-read-image-perception-backfill';

function getAgentSessionLogger() {
  return getLogger('AgentSession');
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

// =============================================================================
// Constants
// =============================================================================

const MAX_VALIDATION_CYCLES = 32;

// =============================================================================
// AgentSession Implementation
// =============================================================================

/**
 * Agent Session - Unified session management
 */
interface AgentTurnSemanticPathMetrics {
  providerFragments: number;
  semanticSteps: number;
  workingMemoryMutations: number;
  compactionChecks: number;
}

export class AgentSession implements IAgentSession {
  // Configuration
  private _config: AgentSessionConfig;
  private _executionMode: ExecutionMode;

  // Core components
  private _executor: AgentExecutor | null = null;
  private _compressor: ConversationCompressor;
  private _permissionHooks: IPermissionManager | null = null;

  // Registries (used by _rebuildExecutor on configure())
  private _toolGroupRegistry: ToolGroupRegistry;
  private _toolInjectionManager: ToolInjectionManager;
  private _executionToolRegistry: IToolRegistry;

  // Prompt composition
  private _promptComposer: SystemPromptComposer;

  // PR2 prompt modules — own the format contract for environment/ephemeral
  // sections previously written directly via composer.setSection calls.
  private _memoryProjectModule: MemoryProjectModule;
  private _memoryRecallModule: MemoryRecallModule;
  private _creativeVersionLogModule: CreativeVersionLogModule;
  private _validationGuidanceModule: ValidationGuidanceModule;
  private _promptModuleOrchestrator: ModuleOrchestrator;
  private readonly _promptContextProvider: ReturnType<typeof createPromptContextProvider>;
  // PR3a: owns the format contract for skill-layer sections; consumed by
  // SkillInjectionCoordinator's Track A writes.
  private _skillInjectionModule: SkillInjectionModule;
  // PR3b: AGENTS.md overlay module (environment layer).
  private _agentsMdModule: AgentsMdModule;
  // PR3c: creation artifact contract (L1 schema layer). Instance held here so
  // Agent-native creation projection can toggle it.
  // PR3e: sub-package prompt fragments (environment layer priority 70).
  // Instance held for future re-sync passes when provider set changes.
  private _subpackageFragmentsModule: SubpackageFragmentsModule;

  // Skill injection (3-track coordinator)
  private _skillCoordinator!: SkillInjectionCoordinator;
  private readonly _lifecycleProjectionSectionIds = new Set<string>();
  private _lifecycleProjectionAllowRules: string[] = [];
  private _lifecycleProjectionToolGuard: IToolGuard | null = null;
  private _lifecycleProjectionActivatedToolSets: string[] = [];

  private _reactLoopBaseHooks: import('@neko/shared').ExecutorHooks | null = null;
  private _runnerHooks: import('@neko/shared').ExecutorHooks | null = null;

  // Typed event bus for creation.* / execution.* channels.
  private _eventBus: IEventBus | null = null;
  // `.neko/` directory resolver (only when workspace config is supplied).
  private _nekoPaths: import('../workspace').INekoPaths | null = null;
  // JSONL event sink persisting bus events to a conversation-owned log.
  private _eventSink: import('../workspace').INdjsonEventSink | null = null;
  private _validationRuntime: ValidationRuntimeBridge;
  private _promptRuntime!: PromptRuntimeFacade;
  // JSONL audits sink persisting approve.decided events to
  // `.neko/logs/audits.jsonl`. Filter-predicated sibling of _eventSink.
  private _auditsSink: import('../workspace').INdjsonEventSink | null = null;
  // JSONL steps sink persisting step.completed events to
  // `.neko/logs/steps.jsonl`. Third filter view on the bus.
  private _stepsSink: import('../workspace').INdjsonEventSink | null = null;
  // Skill/host-injected validation coordinator. Agent core owns the generic
  // runtime ports and delegates concrete observation/evaluation policies.
  private _validationCoordinator: IValidationCoordinator | null = null;
  private _operationToolAdapterRegistry:
    import('@neko/shared').IOperationToolAdapterRegistry | null = null;
  // Loaded user preferences (ADR §9.3). null when workspace.fsOps
  // didn't provide readFile, or when both layers are absent.
  private _preferencesReady: Promise<void> | null = null;
  private _preferencesWarnings: readonly string[] = [];

  // 5-level autoheal chain fed by afterAct.
  private _autohealChain: IAutohealChain | null = null;

  // Unified approval engine — permission channel consults it before
  // delegating to the user onConfirmTool callback.
  private _approvalEngine: IApprovalEngine | null = null;

  // Meta tools (for ISkillProvider wiring)
  private _metaTools: Tool[] = [];
  private _skillPromptEntries: readonly SkillPromptEntry[] = [];
  private _skillCatalogProjectionVersion = 0;

  // State
  private _history: ChatMessage[] = [];
  private _historyEventIds: string[][] = [];
  private _processedMemoryEventIds = new Set<string>();
  private _isRunning = false;
  private _disposed = false;
  /** Circuit breaker state for auto-compact */
  private _compactState: AutoCompactState = createAutoCompactState();
  /** Creative version log for generation tracking */
  private _versionLog: CreativeVersionLog = createCreativeVersionLog();
  /** JSONL journal writer for session persistence */
  private _journalWriter: import('./types').IJournalWriter | null = null;
  /** Journal sequence counter */
  private _journalSeq = 0;
  private _taskResultObservationEntries: TaskResultObservationJournalEntry[] = [];
  /** Tracks streaming state across step conversions */
  private _streamState: StreamState = { hasStreamedDeltas: false };
  /** Current turn metadata used by perception and evidence projection. */
  private _currentTurnContext: { readonly metadata?: Record<string, unknown> } | null = null;
  /** Current chat turn identity for model/tool/timeline trace correlation. */
  private _activeTurnId: string | null = null;
  private _memoryRecall: MemoryRecall | null = null;
  private _pendingConfirmations = new Map<
    string,
    {
      source: 'live' | 'restored';
      request: ToolConfirmationRequest;
    }
  >();

  constructor(config: AgentSessionConfig) {
    this._config = config;
    this._executionMode = config.executionMode ?? 'auto';
    this._validationRuntime = new ValidationRuntimeBridge({
      maxCycles: MAX_VALIDATION_CYCLES,
      ports: {
        validation: {
          getCoordinator: () => this._validationCoordinator,
        },
        prompt: {
          setGuidanceContent: (content) =>
            this._promptRuntime.setValidationGuidanceContent(content),
          syncSystemPrompt: () => this._syncSystemPrompt(),
        },
        diagnostics: {
          debug: (message, data) => logger.debug(message, data),
        },
      },
    });
    // Delegate component creation to initializer (SRP: init logic separate from runtime)
    const components = initializeSession(config, {
      onToolConfirmation: (request) => this._handleToolConfirmation(request),
      getActiveArtifactValidationRequirements: () =>
        this.getActiveSkill()?.mediaWorkflow?.validationRequirements,
    });

    // Assign initialized components
    this._compressor = components.compressor;
    this._toolGroupRegistry = components.toolGroupRegistry;
    this._toolInjectionManager = components.toolInjectionManager;
    this._executionToolRegistry = components.executionToolRegistry;
    this._promptComposer = components.promptComposer;
    this._executor = components.executor;
    this._permissionHooks = components.permissionHooks;
    this._history = components.history;
    this._historyEventIds = components.history.map(() => []);
    this._metaTools = components.metaTools;
    // PR2 prompt modules — Session drives the version-log one during
    // _syncSystemPrompt; the memory modules are event-driven from the
    // initializer. Held here so future work can re-inject them via the
    // orchestrator.
    this._memoryProjectModule = components.memoryProjectModule;
    this._memoryRecallModule = components.memoryRecallModule;
    this._creativeVersionLogModule = components.creativeVersionLogModule;
    this._validationGuidanceModule = components.validationGuidanceModule;
    this._promptModuleOrchestrator = components.promptModuleOrchestrator;
    this._skillInjectionModule = components.skillInjectionModule;
    this._agentsMdModule = components.agentsMdModule;
    this._subpackageFragmentsModule = components.subpackageFragmentsModule;
    this._promptContextProvider = createPromptContextProvider({
      getActiveSkillName: () => this.getActiveSkill()?.name ?? null,
      getActiveTools: () => collectInjectedToolNames(this._toolInjectionManager),
      getLocale: () => this._config.locale ?? 'en',
      getProjectPath: () => this._config.workspace?.root ?? '',
    });
    this._promptRuntime = new PromptRuntimeFacade({
      ports: {
        composer: {
          promptComposer: this._promptComposer,
          promptModuleOrchestrator: this._promptModuleOrchestrator,
          promptContextProvider: this._promptContextProvider,
        },
        modules: {
          validationGuidanceModule: this._validationGuidanceModule,
          memoryRecallModule: this._memoryRecallModule,
          creativeVersionLogModule: this._creativeVersionLogModule,
          subpackageFragmentsModule: this._subpackageFragmentsModule,
        },
        executor: {
          getExecutor: () => this._executor,
          getCreativeVersionSummary: () =>
            this._versionLog.size > 0
              ? this._versionLog.toSummary(5, this._config.locale ?? 'en')
              : null,
        },
        diagnostics: {
          debug: (message, data) => getAgentSessionLogger().debug(message, data),
        },
      },
    });
    this._refreshMemoryRuntime();

    // Journal writer for session persistence
    if (config.journalWriter) {
      this._journalWriter = config.journalWriter;
    }
    this._operationToolAdapterRegistry = config.operationToolAdapterRegistry ?? null;

    // SkillInjectionCoordinator requires closures over Session fields
    // (e.g. _permissionHooks changes on configure()), so created here.
    this._skillCoordinator = new SkillInjectionCoordinator({
      promptComposer: this._promptComposer,
      getPermissionHooks: () => this._permissionHooks,
      syncSystemPrompt: () => this._syncSystemPrompt(),
      toolSetActivator: this._toolInjectionManager,
      skillInjectionModule: this._skillInjectionModule,
      getLocale: () => this._config.locale ?? 'en',
    });
    this._installSessionSystemPromptRefreshHook();
    this._installReadImagePerceptionBackfillHook();

    this._eventBus = createEventBus();

    const mapWorkspaceLogEvent = (event: AgentEventBusEvent): NdjsonLoggedEvent =>
      this._mapWorkspaceLogEvent(event);
    if (config.workspace) {
      this._nekoPaths = createNekoPaths(config.workspace.root);
      const logConversationId = normalizeWorkspaceLogConversationId(config.conversationId);
      this._eventSink = createNdjsonEventSink({
        filePath: this._nekoPaths.conversationLog('events', logConversationId),
        fsOps: config.workspace.fsOps,
        mapEvent: mapWorkspaceLogEvent,
      });
      this._eventSink.attach(this._eventBus);
    }

    this._autohealChain =
      config.autohealChainFactory?.({
        eventBus: createAutohealEventEmitterPort(this._eventBus),
        diagnostics: {
          warn: (message, details) => logger.warn(message, details),
          info: (message, details) => logger.info(message, details),
        },
      }) ?? null;
    this._approvalEngine = createApprovalEngine({
      strategyPacks: [creationStrategyPack, executionStrategyPack],
    });

    if (
      config.workspace &&
      this._nekoPaths &&
      typeof config.workspace.fsOps.readFile === 'function'
    ) {
      const engine = this._approvalEngine;
      const paths = this._nekoPaths;
      const fsOps = config.workspace.fsOps as import('../workspace').PreferencesFsOps;
      const globalPath = config.workspace.globalPreferencesPath;
      this._preferencesReady = loadPreferences({
        paths,
        ...(globalPath ? { globalPath } : {}),
        fsOps,
      }).then(({ merged, warnings }) => {
        this._preferencesWarnings = warnings;
        const packs = createPreferencesStrategyPacks(merged.effective);
        for (let i = packs.length - 1; i >= 0; i--) {
          engine.registerPriority(packs[i]!);
        }
      });
    }

    {
      const bus = this._eventBus;
      this._approvalEngine.onDecision((request, response) => {
        bus.emit({
          channel: AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED,
          subject: request.subject.kind,
          decision: _approvalResolutionToDecision(response.resolution),
          at: response.decidedAt,
        });
      });
    }

    if (this._nekoPaths && config.workspace) {
      const logConversationId = normalizeWorkspaceLogConversationId(config.conversationId);
      this._auditsSink = createNdjsonEventSink({
        filePath: this._nekoPaths.conversationLog('audits', logConversationId),
        fsOps: config.workspace.fsOps,
        mapEvent: mapWorkspaceLogEvent,
        filter: (event) => event.channel === AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED,
      });
      this._auditsSink.attach(this._eventBus);
      this._stepsSink = createNdjsonEventSink({
        filePath: this._nekoPaths.conversationLog('steps', logConversationId),
        fsOps: config.workspace.fsOps,
        mapEvent: mapWorkspaceLogEvent,
        filter: (event) => event.channel === AGENT_RUNTIME_CHANNELS.STEP_COMPLETED,
      });
      this._stepsSink.attach(this._eventBus);
    }

    const { hooks: runnerHooks } = createReActLoopRunner({
      eventBus: this._eventBus,
      ...(this._autohealChain ? { autohealChain: this._autohealChain } : {}),
    });
    this._rebuildValidationCoordinator();
    this._reactLoopBaseHooks = runnerHooks;
    this._runnerHooks = this._composeRunnerHooks(runnerHooks);
    this._executor.addHook(this._runnerHooks);

    this._wireMetaToolCapabilityProvider(
      this._createCapabilityProvider(createEmptySkillProvider()),
    );
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  configure(config: Partial<AgentSessionConfig>): void {
    // Update config
    this._config = { ...this._config, ...config };
    if (config.operationToolAdapterRegistry !== undefined) {
      this._operationToolAdapterRegistry = config.operationToolAdapterRegistry ?? null;
    }
    if ('journalWriter' in config) {
      const previousJournalWriter = this._journalWriter;
      this._journalWriter = config.journalWriter ?? null;
      this._journalSeq = 0;
      if (previousJournalWriter && previousJournalWriter !== this._journalWriter) {
        void previousJournalWriter.dispose().catch((error: unknown) => {
          logger.warn('Failed to dispose previous session journal writer', { error });
        });
      }
    }

    // Update execution mode if changed
    if (config.executionMode !== undefined) {
      this._executionMode = config.executionMode;
    }

    if ('contextSettings' in config) {
      this._compressor.configure({
        triggers: {
          tokenThreshold: config.contextSettings?.maxTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
          turnThreshold: 20,
        },
      });
    }
    if (config.locale !== undefined) {
      this._compressor.configure({ locale: config.locale });
    }

    // Update system prompt in history if changed
    if (config.systemPrompt !== undefined || config.locale !== undefined) {
      this._promptRuntime.setBasePrompt(this._buildSkillAwareBasePrompt());
    }

    this._rebuildValidationCoordinator();
    this._refreshMemoryRuntime();
    if (this._reactLoopBaseHooks) {
      this._runnerHooks = this._composeRunnerHooks(this._reactLoopBaseHooks);
    }

    // Reinitialize executor with new config
    this._rebuildExecutor();
    this._syncSystemPrompt();
  }

  getExecutionMode(): ExecutionMode {
    return this._executionMode;
  }

  /**
   * Wire an ISkillProvider into the meta tools (context, creation, lifecycle, execution mode).
   * Called by the extension layer after the skill system is initialized.
   */
  setSkillProvider(provider: ISkillProvider): void {
    this._wireMetaToolCapabilityProvider(this._createCapabilityProvider(provider));
    this._projectSkillCatalogPrompt(provider);
  }

  private _projectSkillCatalogPrompt(provider: ISkillProvider): void {
    const projectionVersion = ++this._skillCatalogProjectionVersion;
    const skills = provider.listSkills();
    if (isPromiseLike(skills)) {
      void skills
        .then((resolved) => this._applySkillCatalogPrompt(resolved, projectionVersion))
        .catch((error: unknown) => {
          logger.error('Failed to project Skill catalog into the AgentSession prompt', { error });
        });
      return;
    }
    this._applySkillCatalogPrompt(skills, projectionVersion);
  }

  private _applySkillCatalogPrompt(
    skills: readonly import('../tools/core/meta-tools').SkillContextSummary[],
    projectionVersion: number,
  ): void {
    if (this._disposed || projectionVersion !== this._skillCatalogProjectionVersion) return;
    this._skillPromptEntries = skills.map((skill) => ({
      name: skill.name,
      ...(skill.description ? { description: skill.description } : {}),
    }));
    for (const tool of this._metaTools) {
      if (tool instanceof ActivateSkillTool) {
        tool.setRegisteredSkillNames(this._skillPromptEntries.map((skill) => skill.name));
      }
    }
    this._promptRuntime.setBasePrompt(this._buildSkillAwareBasePrompt());
    this._syncSystemPrompt();
  }

  private _buildSkillAwareBasePrompt(): string {
    return buildSkillAwareSystemPrompt({
      basePrompt: this._config.systemPrompt,
      skills: this._skillPromptEntries,
      locale: this._config.locale,
    });
  }

  private _wireMetaToolCapabilityProvider(provider: ISkillProvider): void {
    for (const tool of this._metaTools) {
      if (tool instanceof GetContextTool) {
        tool.setSkillProvider(provider);
      } else if (tool instanceof ActivateSkillTool) {
        tool.setSkillProvider(provider);
      } else if (tool instanceof DeactivateSkillTool) {
        tool.setSkillProvider(provider);
      } else if (tool instanceof CreateSkillTool) {
        tool.setSkillProvider(provider);
      } else if (tool instanceof SetExecutionModeTool) {
        tool.setSkillProvider(provider);
      }
    }
  }

  private _createCapabilityProvider(provider: ISkillProvider): ISkillProvider {
    return {
      ...provider,
      setExecutionMode: (input) => {
        const previousMode = this.getExecutionMode();
        const intent = createAgentCapabilityActivationIntent({
          conversationId: this._config.conversationId ?? 'unknown',
          source: 'agent-tool',
          target: 'execution-mode',
          action: 'set',
          name: input.mode,
          requestedBy: 'agent',
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
          createdAt: Date.now(),
        });
        this.setExecutionModeWithIntent(input.mode, intent);
        const effectiveMode = this.getExecutionMode();
        return {
          success: true,
          changed: previousMode !== effectiveMode,
          requestedMode: input.mode,
          effectiveMode,
        };
      },
    };
  }

  setPromptFragments(fragments: readonly PromptFragment[] | undefined): void {
    this._config.promptFragments = fragments ? [...fragments] : undefined;
    this._promptRuntime.setPromptFragments(fragments);
    this._syncSystemPrompt();
  }

  getPromptCompositionProjection(): readonly import('../prompt').PromptCompositionFragmentProjection[] {
    return this._promptComposer.projectComposition();
  }

  getValidationCycles(): readonly AgentValidationCycle[] {
    return this._validationRuntime.cycles;
  }

  getOperationToolAdapterRegistry(): import('@neko/shared').IOperationToolAdapterRegistry | null {
    return this._operationToolAdapterRegistry;
  }

  async recordSubagentReviewResult(result: SubagentReviewResult): Promise<void> {
    if (!this._validationCoordinator) {
      return;
    }

    this._validationCoordinator.observe({
      kind: 'subagent-review',
      observedAt: result.createdAt,
      review: result,
    });

    await Promise.all(result.evidence.map((evidence) => this._recordAgentEvidence(evidence)));

    await this._captureValidationCycle();
  }

  setExecutionMode(mode: ExecutionMode): void {
    this._executionMode = mode;
    // Only update permission hooks mode instead of rebuilding entire executor
    if (this._permissionHooks) {
      const permissionMode: PermissionMode =
        mode === 'plan' ? 'plan' : mode === 'auto' ? 'auto' : 'ask';
      this._permissionHooks.setMode(permissionMode);
    }
  }

  setExecutionModeWithIntent(mode: ExecutionMode, intent: AgentCapabilityActivationIntent): void {
    const events: AgentCapabilityActivationProgressEvent[] = [];
    const emit = this._createActivationEmitter(intent, events);
    if (!this._isExpectedActivationIntent(intent, 'execution-mode', 'set')) {
      emit('failed', 'failed', {
        diagnostics: [
          {
            severity: 'error',
            code: 'invalid-execution-mode-activation-intent',
            message: 'Execution mode changes require an execution-mode set activation intent.',
          },
        ],
      });
      return;
    }

    emit('requested', 'succeeded');
    emit('validated', 'succeeded');
    this.setExecutionMode(mode);
    emit('projected', 'succeeded', { metadata: { mode } });
    emit('active', 'succeeded', { metadata: { mode } });
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  async *execute(input: string, context?: ExecutionContext): AsyncIterable<AgentEvent> {
    if (!this._executor) {
      yield { type: 'error', error: new Error('Session not initialized') };
      return;
    }

    if (this._isRunning) {
      yield { type: 'error', error: new Error('Session is already running') };
      return;
    }

    this._isRunning = true;
    const turnStartedAt = Date.now();
    let runCompletionStatus: 'completed' | 'failed' = 'completed';
    let runCompletionError:
      { readonly code: string; readonly message: string; readonly cause?: unknown } | undefined;
    let turnActivatedToolSets: readonly string[] = [];
    const turnId = createAgentTurnId(this._config.conversationId ?? 'unknown', turnStartedAt);
    let trace = createAgentTraceContext({
      conversationId: this._config.conversationId,
      runId: turnId,
      turnId,
      phase: 'session',
    });
    this._activeTurnId = turnId;
    let iteration = 0;
    const hadPendingValidationGuidance = this._validationRuntime.hasGuidance();
    let validationGuidanceAdjustedThisTurn = false;

    try {
      this._currentTurnContext = { metadata: context?.metadata };
      turnActivatedToolSets = this._activateTurnMediaToolSets(context?.metadata);

      // Execute UserPromptSubmit hooks (if configured)
      let processedInput = input;
      const memoryQueryInput = input;
      if (this._config.settingsHookLoader) {
        const hookResult = await this._config.settingsHookLoader.executeUserPromptSubmit(input);
        if (hookResult.blocked) {
          yield {
            type: 'error',
            error: new Error(hookResult.reason ?? 'Message blocked by UserPromptSubmit hook'),
          };
          return;
        }
        // Append hook stdout as additional context
        if (hookResult.stdout?.trim()) {
          processedInput = `${input}\n\n[Context from hooks]\n${hookResult.stdout.trim()}`;
        }
      }

      // Prepare input (inject plan mode reminder if needed)
      if (this._executionMode === 'plan') {
        processedInput = `${PLAN_MODE_SYSTEM_REMINDER}\n\n${processedInput}`;
      }

      const maxIterations = this._config.maxIterations ?? DEFAULT_MAX_ITERATIONS;

      // Accumulate real token usage from LLM API responses
      const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      const userMessageEventId = this._journalWriter
        ? await this._journalWriter.appendEvent(++this._journalSeq, {
            type: 'user_message',
            content: processedInput,
          })
        : undefined;
      const turnPersistedEvents: PersistedAgentEvent[] = [
        {
          event: { type: 'user_message', content: memoryQueryInput },
          ...(userMessageEventId ? { eventId: userMessageEventId } : {}),
        },
      ];

      trace = deriveAgentTraceContext(trace, { phase: 'session' });
      logger.debug(
        'neko.agent.session.execute.start',
        withAgentTrace(trace, {
          executionMode: this._executionMode,
          inputLength: input.length,
          processedInputLength: processedInput.length,
          hasSettingsHookLoader: this._config.settingsHookLoader !== undefined,
        }),
      );

      // Add user message to history first, then pass snapshot (including user message)
      // to executor with skipUserMessage flag so it doesn't duplicate
      this.addMessage(
        { role: 'user', content: processedInput },
        userMessageEventId ? [userMessageEventId] : undefined,
      );

      // Creative version log: detect user evaluation keywords in input
      if (this._versionLog.size > 0) {
        const evalResult = detectEvaluation(processedInput);
        if (evalResult) {
          this._versionLog.evaluateLatest(evalResult.evaluation, evalResult.note);
        }
      }

      validationGuidanceAdjustedThisTurn =
        (await this._captureValidationCycle(trace)) || validationGuidanceAdjustedThisTurn;
      await this._updateMemoryRecall(memoryQueryInput);
      const semanticPathMetrics: AgentTurnSemanticPathMetrics = {
        providerFragments: 0,
        semanticSteps: 0,
        workingMemoryMutations: 0,
        compactionChecks: 0,
      };
      await this._autoCompactAtBoundary(trace, semanticPathMetrics, 'pre-model');
      this._syncSystemPrompt(); // Ensure system prompt is fresh before snapshot
      const messagesSnapshot = [...this._history];
      const activeSkill = this.getActiveSkill();

      for await (const step of this._executor.executeStream(processedInput, {
        messages: messagesSnapshot,
        skipUserMessage: true,
        metadata: {
          workspaceRoot: context?.workspaceRoot,
          projectType: context?.projectType,
          activeFile: context?.activeFile,
          ...context?.metadata,
          locale: context?.metadata?.['locale'] ?? this._config.locale,
          conversationId: trace.conversationId,
          runId: trace.runId,
          turnId: trace.turnId,
          ...(activeSkill
            ? {
                activeSkillName: activeSkill.name,
                artifactValidationRequirements:
                  activeSkill.mediaWorkflow?.validationRequirements ?? [],
              }
            : {}),
        },
        trace,
      })) {
        ++iteration;

        // Accumulate token usage from think steps
        if (step.usage) {
          totalUsage.promptTokens += step.usage.promptTokens;
          totalUsage.completionTokens += step.usage.completionTokens;
          totalUsage.totalTokens += step.usage.totalTokens;
        }

        const semanticClassification = classifyAgentStepSemantics(step);
        if (semanticClassification.class === 'transport-fragment') {
          semanticPathMetrics.providerFragments += 1;
        } else {
          semanticPathMetrics.semanticSteps += 1;
        }

        // Creative version log: record generation tool results
        if (step.type === 'act' && step.toolResults) {
          for (const result of step.toolResults) {
            if ('name' in result && isGenerationTool(result.name as string)) {
              const toolCall = step.toolCalls?.find(
                (tc) => tc.id === (result as { callId?: string }).callId,
              );
              const entry = this._versionLog.record({
                toolName: result.name as string,
                toolCallId: (result as { callId?: string }).callId ?? '',
                parameters: toolCall?.arguments ?? {},
                resultPath: result.attachments?.[0]?.path,
                resultSuccess: result.success,
                timestamp: Date.now(),
              });
              yield { type: 'version_recorded', versionEntry: entry };
            }
          }

          this._observeToolValidation(step, trace);
          validationGuidanceAdjustedThisTurn =
            (await this._captureValidationCycle(trace)) || validationGuidanceAdjustedThisTurn;
        }

        const yieldedEvents = Array.from(
          stepToEvents(step, iteration, maxIterations, this._streamState),
        );
        const persistedEvents = createPersistedStepEvents(step, yieldedEvents);
        const eventIdByEvent = new Map<AgentEvent, string>();

        for (const event of persistedEvents) {
          if (this._journalWriter) {
            const eventId = await this._journalWriter.appendEvent(++this._journalSeq, event);
            eventIdByEvent.set(event, eventId);
          }
        }

        for (const event of yieldedEvents) {
          yield event;
        }

        for (const event of persistedEvents) {
          turnPersistedEvents.push({
            event,
            eventId: eventIdByEvent.get(event),
          });
        }

        const projectedStepHistory = projectPersistedEventsToWorkingMemory(
          persistedEvents.map((event) => ({
            event,
            eventId: eventIdByEvent.get(event),
          })),
        );
        for (const entry of projectedStepHistory) {
          this.addMessage(entry.message, entry.sourceEventIds);
        }

        if (projectedStepHistory.length > 0) {
          semanticPathMetrics.workingMemoryMutations += projectedStepHistory.length;
          await this._autoCompactAtBoundary(trace, semanticPathMetrics, 'working-memory-mutation');
        }
      }

      await this._extractProjectMemory(turnPersistedEvents);
      validationGuidanceAdjustedThisTurn =
        (await this._captureValidationCycle(trace)) || validationGuidanceAdjustedThisTurn;

      // Emit done event with real accumulated usage
      const doneEvent = {
        type: 'done' as const,
        usage: {
          inputTokens: totalUsage.promptTokens,
          outputTokens: totalUsage.completionTokens,
          totalTokens: totalUsage.totalTokens,
        },
      };
      yield doneEvent;
      logger.debug(
        'neko.agent.session.execute.done',
        withAgentTrace(trace, {
          iterations: iteration,
          inputTokens: totalUsage.promptTokens,
          outputTokens: totalUsage.completionTokens,
          totalTokens: totalUsage.totalTokens,
          providerFragments: semanticPathMetrics.providerFragments,
          semanticSteps: semanticPathMetrics.semanticSteps,
          workingMemoryMutations: semanticPathMetrics.workingMemoryMutations,
          compactionChecks: semanticPathMetrics.compactionChecks,
        }),
      );

      // Write state snapshot and flush journal
      if (this._journalWriter) {
        await this._persistTerminalJournalEvent(doneEvent);
      }
    } catch (error) {
      runCompletionStatus = 'failed';
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      runCompletionError = {
        code: 'execute_failed',
        message: normalizedError.message,
        cause: toSerializableErrorCause(normalizedError),
      };
      logger.debug(
        'neko.agent.session.execute.error',
        withAgentTrace(trace, {
          message: normalizedError.message,
          iterations: iteration,
        }),
      );
      const errorEvent: AgentEvent = {
        type: 'error',
        error: normalizedError,
      };
      const errorEventId = await this._appendTerminalJournalEvent(errorEvent);
      this.addMessage(
        { role: 'assistant', content: normalizedError.message },
        errorEventId ? [errorEventId] : undefined,
      );
      if (errorEventId) {
        await this._persistTerminalJournalSnapshot(errorEvent.type);
      }
      yield errorEvent;
    } finally {
      for (const toolSetName of turnActivatedToolSets) {
        this.deactivateToolSet(toolSetName);
      }
      void runCompletionStatus;
      void runCompletionError;
      this._currentTurnContext = null;
      this._activeTurnId = null;
      this._promptRuntime.setMemoryRecallContent(null);
      if (!validationGuidanceAdjustedThisTurn && hadPendingValidationGuidance) {
        this._validationRuntime.clearGuidance();
      }
      this._syncSystemPrompt();
      this._isRunning = false;
      logger.debug(
        'neko.agent.session.execute.end',
        withAgentTrace(trace, {
          status: runCompletionStatus,
          durationMs: Date.now() - turnStartedAt,
        }),
      );
    }
  }

  cancel(): void {
    this._executor?.abort();
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  // ---------------------------------------------------------------------------
  // Tool Confirmation
  // ---------------------------------------------------------------------------

  confirmTool(toolCallId: string, approved: boolean): void {
    const pending = this._pendingConfirmations.get(toolCallId);
    if (pending) {
      if (pending.source === 'live' && pending.request.confirmationToken && this._permissionHooks) {
        this._permissionHooks.confirmTool(pending.request.confirmationToken, approved);
      }
      this._pendingConfirmations.delete(toolCallId);
    }
  }

  getPendingConfirmations(): ToolConfirmationRequest[] {
    return Array.from(this._pendingConfirmations.values()).map((p) => p.request);
  }

  // ---------------------------------------------------------------------------
  // History Management
  // ---------------------------------------------------------------------------

  getHistory(): ChatMessage[] {
    return [...this._history];
  }

  addMessage(message: ChatMessage, sourceEventIds?: readonly string[]): void {
    this._history.push(message);
    this._historyEventIds.push(sourceEventIds ? [...sourceEventIds] : []);
  }

  async recordTaskResultObservation(
    input: import('./types').RecordSessionTaskResultObservationInput,
  ): Promise<import('./task-result-observation-recorder').RecordAgentTaskResultObservationResult> {
    if (!this._journalWriter) {
      throw new Error('Cannot record task result observation without a session journal writer');
    }

    const recorder = createSessionTaskResultObservationRecorder({
      journalWriter: this._journalWriter,
      nextSeq: () => ++this._journalSeq,
    });
    const recordInput = {
      ...input,
      existingEntries: [...this._taskResultObservationEntries, ...(input.existingEntries ?? [])],
    };
    const result = await recorder.record(recordInput);
    this._taskResultObservationEntries.push(
      ...createTaskResultObservationJournalEntries({
        recordInput,
        recordResult: result,
      }),
    );
    return result;
  }

  async patchToolResult(
    payload: import('@neko/shared').ToolResultBackfillPayload,
  ): Promise<ToolResultPatchResult> {
    const event: AgentEvent = {
      type: 'tool_result_backfill',
      toolResultBackfill: payload,
    };
    const eventId = this._journalWriter
      ? await this._journalWriter.appendEvent(++this._journalSeq, event)
      : undefined;
    const patched = applyToolResultBackfillToChatHistory(this._history, payload);

    if (patched && eventId) {
      this._appendSourceEventIdToLastToolMessage(payload.toolCallId, eventId);
    }

    if (this._journalWriter) {
      await this._journalWriter.flush();
    }

    return { patched, ...(eventId ? { eventId } : {}) };
  }

  /**
   * Apply lifecycle projection directly to session prompt and tool-policy state.
   * Lifecycle records are the canonical source; this path intentionally does
   * not route through the legacy single Skill injection bridge.
   */
  applySkillLifecycleProjection(projection: SkillLifecycleProjection): void {
    const startTime = Date.now();
    logger.debug('neko.agent.skill.lifecycle.projection.apply.request', {
      promptSectionCount: projection.promptSections.length,
      toolPolicyMode: projection.toolPolicy.mode,
      allowedToolCount: projection.toolPolicy.allowedTools?.length ?? 0,
      modelOverride: projection.modelOverride?.model,
      diagnostics: projection.diagnostics,
    });

    this._clearSkillLifecycleProjectionState();
    this._skillCoordinator.clearActive();

    const allowRules: string[] = [];
    const activatedToolSets: string[] = [];
    try {
      for (const section of projection.promptSections) {
        this._promptComposer.setSection({
          id: section.id,
          layer: section.layer,
          content: section.content,
          source: 'skill-lifecycle',
          ...(section.version !== undefined ? { version: section.version } : {}),
          priority: section.priority,
        });
        this._lifecycleProjectionSectionIds.add(section.id);
      }

      const lifecycleGuardAllowedTools = projection.toolPolicy.allowedTools
        ? [...projection.toolPolicy.allowedTools]
        : undefined;
      const effectiveAllowRuleTools = filterLifecycleProjectionAllowedTools(
        projection.toolPolicy.allowedTools,
      );
      const effectiveActivationTools = filterLifecycleProjectionAllowedTools(
        projection.toolPolicy.activationTools,
      );
      if (effectiveAllowRuleTools && effectiveAllowRuleTools.length > 0) {
        for (const tool of effectiveAllowRuleTools) {
          this._permissionHooks?.addAllowRule(tool);
          allowRules.push(tool);
        }
      }
      if (effectiveActivationTools && effectiveActivationTools.length > 0) {
        activatedToolSets.push(
          ...this._toolInjectionManager.activateToolSetsForTools(effectiveActivationTools),
        );
      }

      this._lifecycleProjectionAllowRules = allowRules;
      this._lifecycleProjectionActivatedToolSets = activatedToolSets;
      this._lifecycleProjectionToolGuard = createToolGuard(
        lifecycleGuardAllowedTools,
        'skill-lifecycle-projection',
      );
      this._syncSystemPrompt();

      logger.debug('neko.agent.skill.lifecycle.projection.applied', {
        durationMs: Date.now() - startTime,
        promptSectionCount: projection.promptSections.length,
        allowRuleCount: allowRules.length,
        activatedToolSetCount: activatedToolSets.length,
      });
    } catch (error) {
      this._clearSkillLifecycleProjectionState();
      this._syncSystemPrompt();
      logger.warn('neko.agent.skill.lifecycle.projection.failed', {
        durationMs: Date.now() - startTime,
        error:
          error instanceof Error ? { name: error.name, message: error.message } : String(error),
      });
      throw error;
    }
  }

  /**
   * Apply a skill injection to the active session.
   * Request-time projection adapter for callers that provide a single
   * projected Skill payload.
   *
   * @param injection The injection payload
   * @param skill Optional full Skill object for active skill tracking + Track D (ToolSets)
   */
  applySkillInjection(injection: SkillInjection, skill?: Skill): void {
    this._skillCoordinator.apply(injection, skill);
  }

  activateToolSetsForTools(toolNames: readonly string[]): readonly string[] {
    return this._toolInjectionManager.activateToolSetsForTools([...toolNames]);
  }

  deactivateToolSet(toolSetName: string): void {
    this._toolInjectionManager.deactivateToolSet(toolSetName);
  }

  private _activateTurnMediaToolSets(
    metadata: Record<string, unknown> | undefined,
  ): readonly string[] {
    const mediaTools = projectMediaModelToolsFromMetadata(metadata);
    if (mediaTools.length === 0) {
      return [];
    }

    return this.activateToolSetsForTools(mediaTools);
  }

  /**
   * Remove a previously injected skill prompt (reversible injection).
   * Request-time projection adapter cleanup for callers that provide a single
   * projected Skill payload.
   */
  removeSkillInjection(name: string): void {
    this._skillCoordinator.remove(name);
  }

  /**
   * Get the currently projected Skill adapter payload, if any.
   * Canonical active Skill records live in SkillLifecycleRuntime.
   */
  getActiveSkill(): Skill | undefined {
    return this._skillCoordinator.getActiveSkill();
  }

  /**
   * Clear the projected Skill adapter payload.
   * Canonical deactivation must go through SkillLifecycleRuntime.
   */
  clearActiveSkill(): void {
    this._skillCoordinator.clearActive();
  }

  /**
   * Check if a tool is allowed by the current projected Skill adapter payload.
   * Uses ToolGuard pattern matching via Coordinator.
   * Returns true if no skill restrictions are active.
   */
  isToolAllowed(toolName: string): boolean {
    const lifecycleResult = this._lifecycleProjectionToolGuard?.check({ name: toolName });
    if (lifecycleResult && !lifecycleResult.allowed) {
      return false;
    }
    return this._skillCoordinator.isToolAllowed(toolName);
  }

  /** Session-owned event stream for approval, Tool, step and recovery logs. */
  getEventBus(): IEventBus | null {
    return this._eventBus;
  }

  /**
   * Shared ApprovalEngine for ordinary Tool and creator authorization.
   */
  getApprovalEngine(): IApprovalEngine | null {
    return this._approvalEngine;
  }

  /**
   * `.neko/` directory resolver (ADR §7.4). Returns null when the
   * session was constructed without a `workspace` config block.
   */
  getNekoPaths(): import('../workspace').INekoPaths | null {
    return this._nekoPaths;
  }

  /**
   * Flush the workspace events / audits / steps sinks. Callers that
   * want to observe JSONL landing before reading the files should
   * await this between logical operations. No-op when sinks are
   * disabled.
   */
  async flushWorkspaceSink(): Promise<void> {
    await Promise.all([
      this._eventSink ? this._eventSink.flush() : Promise.resolve(),
      this._auditsSink ? this._auditsSink.flush() : Promise.resolve(),
      this._stepsSink ? this._stepsSink.flush() : Promise.resolve(),
    ]);
  }

  /**
   * Await preferences.md load completion (ADR §9.3). Resolves when
   * both layers have been read and the preferences strategy pack is
   * registered on the ApprovalEngine. Returns immediately when the
   * session was constructed without workspace readFile support.
   *
   * Tests and deterministic UI flows should await this before
   * issuing approval requests that rely on user rules; production
   * code can fire-and-forget since the defaults handle the pre-load
   * window correctly (ADR §9.4 preferences can only strengthen, not
   * downgrade — pre-load defaults are safe).
   */
  async whenPreferencesReady(): Promise<void> {
    if (this._preferencesReady) await this._preferencesReady;
  }

  /**
   * Diagnostics from the preferences parser (both layers). Useful for
   * surfacing "invalid bullet" / "unknown section" warnings in the UI.
   */
  getPreferencesWarnings(): readonly string[] {
    return this._preferencesWarnings;
  }

  clearHistory(): void {
    this._processedMemoryEventIds.clear();
    this._validationRuntime.reset();
    this._promptRuntime.setMemoryRecallContent(null);
    this._syncSystemPrompt();
    // Rebuild from composer to preserve current prompt composition
    this._history = [{ role: 'system', content: this._promptRuntime.composeText() }];
    this._historyEventIds = [[]];
  }

  loadHistory(messages: ChatMessage[], messageEventIds?: readonly (readonly string[])[]): void {
    this._history = [...messages];
    this._historyEventIds = normalizeMessageEventIds(this._history, messageEventIds);
    this._processedMemoryEventIds = new Set();
    this._validationRuntime.reset();
    this._markMessageEventIdsAsProcessed(this._historyEventIds);
    // Ensure system prompt is present
    if (this._history.length === 0 || this._history[0]?.role !== 'system') {
      this._history.unshift({ role: 'system', content: this._config.systemPrompt });
      this._historyEventIds.unshift([]);
    } else {
      this._historyEventIds[0] = [];
    }
  }

  // ---------------------------------------------------------------------------
  // Context Management
  // ---------------------------------------------------------------------------

  private async _autoCompactAtBoundary(
    trace: AgentTraceContext,
    metrics: AgentTurnSemanticPathMetrics,
    boundary: 'pre-model' | 'working-memory-mutation',
  ): Promise<void> {
    const tokens = this._compressor.estimateTokens(this._history);
    metrics.compactionChecks += 1;
    const compactionTrace = deriveAgentTraceContext(trace, { phase: 'compaction' });
    logger.debug(
      'neko.agent.context_compaction.check',
      withAgentTrace(compactionTrace, {
        boundary,
        tokens,
        historyLength: this._history.length,
        consecutiveFailures: this._compactState.consecutiveFailures,
        circuitOpen: this._compactState.isCircuitOpen,
      }),
    );
    const compactResult = await autoCompactIfNeeded(
      this._compressor,
      this._history,
      tokens,
      this._compactState,
    );
    if (compactResult.compressed && compactResult.compressionResult && compactResult.trigger) {
      await this._applyCompressionResult(
        compactResult.compressionResult,
        compactResult.trigger,
        compactionTrace,
      );
    } else if (
      compactResult.trigger &&
      (compactResult.skipReason === 'compression_failed' ||
        compactResult.skipReason === 'circuit_opened')
    ) {
      await this._logCompactionFailure(
        compactResult.trigger,
        compactResult.errorMessage ?? compactResult.skipReason,
        compactResult.failureCount ?? this._compactState.consecutiveFailures,
        compactionTrace,
      );
    } else if (compactResult.trigger) {
      logger.debug(
        'neko.agent.context_compaction.skipped',
        withAgentTrace(compactionTrace, {
          boundary,
          trigger: compactResult.trigger,
          skipReason: compactResult.skipReason,
          tokens,
          consecutiveFailures: this._compactState.consecutiveFailures,
          circuitOpen: this._compactState.isCircuitOpen,
        }),
      );
    }
  }

  getTokenCount(): number {
    return this._compressor.estimateTokens(this._history);
  }

  async compressContext(): Promise<CompressionResult> {
    const originalTokens = this.getTokenCount();
    const trace = createAgentTraceContext({
      conversationId: this._config.conversationId,
      turnId: createAgentTurnId(this._config.conversationId ?? 'unknown'),
      phase: 'compaction',
    });
    logger.debug(
      'neko.agent.context_compaction.manual.start',
      withAgentTrace(trace, {
        originalTokens,
        historyLength: this._history.length,
      }),
    );

    const result = await this._compressor.compress(this._history);
    await this._applyCompressionResult(result, 'manual', trace);
    const compressedTokens = this._compressor.estimateTokens(this._history);

    const ratio = originalTokens > 0 ? compressedTokens / originalTokens : 1;

    return { originalTokens, compressedTokens, ratio };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.cancel();
    this._isRunning = false;
    // Flush journal writer
    void this._journalWriter?.dispose();
    // Reject all pending tool confirmations via permission hooks
    for (const pending of this._pendingConfirmations.values()) {
      if (pending.source === 'live' && pending.request.confirmationToken && this._permissionHooks) {
        this._permissionHooks.confirmTool(pending.request.confirmationToken, false);
      }
    }
    this._pendingConfirmations.clear();
    this._runnerHooks = null;
    // Flush all JSONL sinks before clearing the bus so in-flight
    // writes still reach disk. Fire-and-forget — dispose is synchronous
    // by contract; each sink's _pending queue tracks outstanding I/O.
    void this._eventSink?.dispose();
    void this._auditsSink?.dispose();
    void this._stepsSink?.dispose();
    this._validationCoordinator?.dispose();
    this._eventSink = null;
    this._auditsSink = null;
    this._stepsSink = null;
    this._validationCoordinator = null;
    this._operationToolAdapterRegistry = null;
    this._nekoPaths = null;
    this._eventBus?.clear();
    this._eventBus = null;
    this._autohealChain = null;
    this._approvalEngine = null;
    this._reactLoopBaseHooks = null;
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private _mapWorkspaceLogEvent(event: AgentEventBusEvent): NdjsonLoggedEvent {
    const conversationId = normalizeWorkspaceLogConversationId(this._config.conversationId);
    const eventRecord: unknown = event;
    const eventConversationId =
      isRecord(eventRecord) && typeof eventRecord['conversationId'] === 'string'
        ? eventRecord['conversationId'].trim()
        : '';
    const eventTurnId =
      isRecord(eventRecord) && typeof eventRecord['turnId'] === 'string'
        ? eventRecord['turnId'].trim()
        : '';

    if (eventConversationId.length > 0 && eventConversationId !== conversationId) {
      throw new Error(
        `AgentSession workspace log conversation mismatch: expected ${conversationId}, received ${eventConversationId}`,
      );
    }

    if (
      eventTurnId.length > 0 &&
      this._activeTurnId !== null &&
      eventTurnId !== this._activeTurnId
    ) {
      throw new Error(
        `AgentSession workspace log turn mismatch: expected ${this._activeTurnId}, received ${eventTurnId}`,
      );
    }

    return {
      ...event,
      conversationId,
      ...(eventTurnId.length > 0
        ? { turnId: eventTurnId }
        : this._activeTurnId !== null
          ? { turnId: this._activeTurnId }
          : {}),
    };
  }

  private async _persistTerminalJournalEvent(event: AgentEvent): Promise<string | undefined> {
    const eventId = await this._appendTerminalJournalEvent(event);
    if (eventId) {
      await this._persistTerminalJournalSnapshot(event.type);
    }
    return eventId;
  }

  private async _appendTerminalJournalEvent(event: AgentEvent): Promise<string | undefined> {
    if (!this._journalWriter) {
      return undefined;
    }

    try {
      const eventId = await this._journalWriter.appendEvent(++this._journalSeq, event);
      return eventId;
    } catch (error) {
      logger.warn('Failed to persist terminal session journal event', {
        eventType: event.type,
        error,
      });
      return undefined;
    }
  }

  private async _persistTerminalJournalSnapshot(eventType: AgentEvent['type']): Promise<void> {
    if (!this._journalWriter) {
      return;
    }

    try {
      await this._journalWriter.appendSnapshot(++this._journalSeq, {
        historyLength: this._history.length,
        executionMode: this._executionMode,
        versionLogSize: this._versionLog.size,
      });
      await this._journalWriter.flush();
    } catch (error) {
      logger.warn('Failed to persist terminal session journal snapshot', {
        eventType,
        error,
      });
    }
  }

  private _createActivationEmitter(
    intent: AgentCapabilityActivationIntent,
    sink: AgentCapabilityActivationProgressEvent[],
  ): (
    step: Parameters<typeof createAgentCapabilityActivationProgressEvent>[0]['step'],
    status: Parameters<typeof createAgentCapabilityActivationProgressEvent>[0]['status'],
    extra?: Partial<Parameters<typeof createAgentCapabilityActivationProgressEvent>[0]>,
  ) => void {
    return (step, status, extra = {}) => {
      const event = createAgentCapabilityActivationProgressEvent({
        intent,
        step,
        status,
        at: Date.now(),
        ...(extra.recordId !== undefined ? { recordId: extra.recordId } : {}),
        ...(extra.diagnostics !== undefined ? { diagnostics: extra.diagnostics } : {}),
        ...(extra.metadata !== undefined ? { metadata: extra.metadata } : {}),
      });
      sink.push(event);
      this._emitActivationProgress(intent.conversationId, [event]);
    };
  }

  private _emitActivationProgress(
    conversationId: string,
    events: readonly AgentCapabilityActivationProgressEvent[],
  ): void {
    if (events.length === 0) return;
    this._config.onActivationProgress?.(conversationId, events);
  }

  private _isExpectedActivationIntent(
    intent: AgentCapabilityActivationIntent,
    target: AgentCapabilityActivationTarget,
    action?: AgentCapabilityActivationAction,
  ): boolean {
    if (intent.target !== target) return false;
    if (action && intent.action !== action) return false;
    return intent.source === 'user-explicit' || intent.source === 'agent-tool';
  }

  private _rebuildValidationCoordinator(): void {
    const previous = this._validationCoordinator;
    this._validationCoordinator =
      this._config.validationCoordinator ??
      this._config.validationCoordinatorFactory?.({
        workspace: createValidationWorkspacePort(this._config.workspace),
        projectMemoryManager: this._config.projectMemoryManager,
        autoMemoryExtraction: this._config.autoMemoryExtraction,
        controlPolicy: this._config.validationControlPolicy,
      }) ??
      null;

    if (previous && previous !== this._validationCoordinator) {
      previous.dispose();
    }
  }

  private _composeRunnerHooks(
    baseHooks: import('@neko/shared').ExecutorHooks,
  ): import('@neko/shared').ExecutorHooks {
    const validationHooks = this._validationCoordinator?.getBeforeThinkHooks() ?? [];
    const withValidation = composeBeforeThinkHooks(baseHooks, validationHooks);
    return {
      ...withValidation,
      name: withValidation.name ?? 'session-runner-hooks',
      afterAct: async (results) => withValidation.afterAct?.(results),
    };
  }

  private _refreshMemoryRuntime(): void {
    const projectMemory = this._config.projectMemoryManager;
    this._memoryRecall =
      projectMemory && this._config.memoryRecall !== false
        ? new MemoryRecall({ projectMemory })
        : null;
    this._promptRuntime.setMemoryRecallContent(null);
  }

  private async _updateMemoryRecall(query: string): Promise<void> {
    if (!this._memoryRecall) {
      this._promptRuntime.setMemoryRecallContent(null);
      return;
    }

    try {
      const recalled = await this._memoryRecall.recall(query, 5);
      const body =
        recalled.length === 0
          ? null
          : recalled
              .map((memory) => {
                return `- [${memory.source}] ${memory.content} (relevance: ${memory.relevance.toFixed(2)})`;
              })
              .join('\n');

      this._promptRuntime.setMemoryRecallContent(body);
    } catch (error) {
      this._promptRuntime.setMemoryRecallContent(null);
      logger.warn('Failed to update memory recall', { error });
    }
  }

  private async _extractProjectMemory(entries: readonly PersistedAgentEvent[]): Promise<void> {
    if (!this._validationCoordinator) {
      return;
    }

    const unprocessedEntries = entries.filter(
      (entry) => !entry.eventId || !this._processedMemoryEventIds.has(entry.eventId),
    );
    if (unprocessedEntries.length === 0) {
      return;
    }

    const sourceEventIds = collectPersistedEventIds(unprocessedEntries);

    try {
      const turnMessages = projectPersistedEventsToWorkingMemory(unprocessedEntries).map(
        (entry) => entry.message,
      );
      const extraction = await this._validationCoordinator.extractMemory({
        messages: turnMessages,
        sourceEventIds,
      });
      if (extraction.kind === 'skipped') {
        this._markProcessedMemoryEventIds(sourceEventIds);
        return;
      }

      if (sourceEventIds.length > 0 && this._journalWriter) {
        await this._journalWriter.appendEvent(++this._journalSeq, {
          type: 'memory_extraction',
          memoryExtraction: extraction,
        });
      }

      this._markProcessedMemoryEventIds(sourceEventIds);
    } catch (error) {
      logger.warn('Failed to extract project memory', { error });
    }
  }

  private _observeToolValidation(step: AgentStep, trace?: AgentTraceContext): void {
    if (!this._validationCoordinator || step.type !== 'act' || !step.toolResults) {
      return;
    }

    const validationTrace = deriveAgentTraceContext(trace, { phase: 'validation' });
    let failureSignals = 0;
    let toolReviewSignals = 0;
    let providerExpressionSignals = 0;
    for (let i = 0; i < step.toolResults.length; i++) {
      const result = step.toolResults[i] as ObservedToolResult;
      const toolCall = step.toolCalls?.find((candidate) => candidate.id === result.callId);
      const toolCallId = result.callId ?? toolCall?.id ?? `tool-call-${i}`;
      const toolName = resolveObservedToolName(result, toolCall?.name);
      if (!result.success) {
        this._validationCoordinator.observe({
          kind: 'tool-failure',
          observedAt: step.timestamp,
          toolCallId,
          toolName,
          error: result.error ?? 'Tool execution failed',
        });
        failureSignals += 1;
        continue;
      }

      const toolReviewSignal = toToolReviewValidationSignal({
        adapters: this._config.toolResultValidationAdapters,
        result,
        toolArguments: toolCall?.arguments,
        toolCallId,
        toolName,
        observedAt: step.timestamp,
        ...(this._config.locale ? { locale: this._config.locale } : {}),
      });
      if (toolReviewSignal) {
        this._validationCoordinator.observe(toolReviewSignal);
        toolReviewSignals += 1;
        if ('evidence' in toolReviewSignal && toolReviewSignal.evidence) {
          void this._recordAgentEvidence(toolReviewSignal.evidence);
        }
      }

      const providerExpressionSignal = toProviderExpressionValidationSignal({
        result,
        toolCallId,
        toolName,
        observedAt: step.timestamp,
      });
      if (providerExpressionSignal) {
        this._validationCoordinator.observe(providerExpressionSignal);
        providerExpressionSignals += 1;
      }
    }

    logger.debug(
      'neko.agent.validation.observe.summary',
      withAgentTrace(validationTrace, {
        toolResultCount: step.toolResults.length,
        failureSignals,
        toolReviewSignals,
        providerExpressionSignals,
      }),
    );
  }

  private async _recordAgentEvidence(
    evidence: import('@neko/shared').PerceptionEvidence,
  ): Promise<void> {
    if (!this._journalWriter) {
      return;
    }

    const contextPacketId = this._getCurrentContextPacketId();
    if (!contextPacketId) {
      logger.warn('Skipping Agent-first evidence without contextPacketId', {
        evidenceId: evidence.id,
      });
      return;
    }

    try {
      const recorder = createAgentObservationRecorder({
        journalWriter: this._journalWriter,
        nextSeq: () => ++this._journalSeq,
        contextPacketId,
      });
      await recorder.attachEvidence(evidence);
    } catch (error) {
      logger.warn('Failed to record Agent-first evidence', { error });
    }
  }

  private _getCurrentContextPacketId(): string | undefined {
    const packet = this._currentTurnContext?.metadata?.['multimodalContextPacket'];
    if (!isRecord(packet)) {
      return undefined;
    }

    const id = packet['id'];
    return typeof id === 'string' ? id : undefined;
  }

  private async _captureValidationCycle(trace?: AgentTraceContext): Promise<boolean> {
    return this._validationRuntime.captureCycle(trace);
  }

  private _markProcessedMemoryEventIds(eventIds: readonly string[]): void {
    for (const eventId of eventIds) {
      this._processedMemoryEventIds.add(eventId);
    }
  }

  private _appendSourceEventIdToLastToolMessage(toolCallId: string, eventId: string): void {
    for (let index = this._history.length - 1; index >= 0; index--) {
      const message = this._history[index];
      if (message?.role !== 'tool' || message.toolCallId !== toolCallId) {
        continue;
      }

      const existing = this._historyEventIds[index] ?? [];
      if (!existing.includes(eventId)) {
        this._historyEventIds[index] = [...existing, eventId];
      }
      return;
    }
  }

  private _markMessageEventIdsAsProcessed(messageEventIds?: readonly (readonly string[])[]): void {
    if (!messageEventIds) {
      return;
    }

    for (const eventIds of messageEventIds) {
      this._markProcessedMemoryEventIds(eventIds);
    }
  }

  /** Sync the composed system prompt into _history[0] */
  private _syncSystemPrompt(): void {
    this._historyEventIds = this._promptRuntime.syncSystemPrompt({
      history: this._history,
      historyEventIds: this._historyEventIds,
    });
  }

  private _clearSkillLifecycleProjectionState(): void {
    for (const sectionId of this._lifecycleProjectionSectionIds) {
      this._promptComposer.removeSection(sectionId);
    }
    this._lifecycleProjectionSectionIds.clear();

    if (this._permissionHooks) {
      for (const rule of this._lifecycleProjectionAllowRules) {
        this._permissionHooks.removeAllowRule(rule);
      }
    }
    this._lifecycleProjectionAllowRules = [];

    for (const toolSetName of this._lifecycleProjectionActivatedToolSets) {
      this._toolInjectionManager.deactivateToolSet(toolSetName);
    }
    this._lifecycleProjectionActivatedToolSets = [];
    this._lifecycleProjectionToolGuard = null;
  }

  private _rebuildExecutor(): void {
    const permissionMode: PermissionMode =
      this._executionMode === 'plan' ? 'plan' : this._executionMode === 'auto' ? 'auto' : 'ask';

    const { executor, permissionHooks } = createConfiguredExecutor({
      config: this._config,
      toolRegistry: this._executionToolRegistry,
      permissionMode,
      compressor: this._compressor,
      toolGroupRegistry: this._toolGroupRegistry,
      toolInjectionManager: this._toolInjectionManager,
      onToolConfirmation: (request) => this._handleToolConfirmation(request),
      getActiveArtifactValidationRequirements: () =>
        this.getActiveSkill()?.mediaWorkflow?.validationRequirements,
    });

    this._permissionHooks = permissionHooks;
    this._executor = executor;
    this._installSessionSystemPromptRefreshHook();
    this._installReadImagePerceptionBackfillHook();

    // Dual-flow: re-register the ReAct-loop runner on the fresh executor.
    if (this._runnerHooks) {
      this._executor.addHook(this._runnerHooks);
    }
  }

  private _installSessionSystemPromptRefreshHook(): void {
    if (!this._executor) {
      return;
    }

    this._executor.removeHook(SESSION_SYSTEM_PROMPT_REFRESH_HOOK_NAME);
    this._executor.addHook({
      name: SESSION_SYSTEM_PROMPT_REFRESH_HOOK_NAME,
      beforeThink: async (context) => {
        this._refreshExecutorContextSystemPrompt(context);
        return context;
      },
    });
  }

  private _installReadImagePerceptionBackfillHook(): void {
    if (!this._executor) {
      return;
    }

    this._executor.removeHook(SESSION_READ_IMAGE_PERCEPTION_BACKFILL_HOOK_NAME);
    this._executor.addHook({
      name: SESSION_READ_IMAGE_PERCEPTION_BACKFILL_HOOK_NAME,
      afterAct: async (results) =>
        backfillReadImagePerceptionResults({
          results,
          perceptionPipeline: this._config.perceptionPipeline,
          metadata: this._currentTurnContext?.metadata,
          chatModel:
            this._config.providerId && this._config.modelId
              ? { providerId: this._config.providerId, modelId: this._config.modelId }
              : undefined,
        }),
    });
  }

  private _refreshExecutorContextSystemPrompt(context: import('@neko/shared').AgentContext): void {
    this._syncSystemPrompt();
    const systemMessage = this._history[0];
    if (!systemMessage || systemMessage.role !== 'system') {
      throw new Error('AgentSession system prompt is missing from history');
    }
    if (typeof systemMessage.content !== 'string') {
      throw new Error('AgentSession system prompt must be text content');
    }

    const refreshedSystemMessage: ChatMessage = {
      role: 'system',
      content: systemMessage.content,
    };
    const systemIndex = context.messages.findIndex((message) => message.role === 'system');
    if (systemIndex >= 0) {
      context.messages[systemIndex] = refreshedSystemMessage;
      return;
    }
    context.messages.unshift(refreshedSystemMessage);
  }

  private _handleToolConfirmation(request: ToolConfirmationRequest): void {
    const toolCallId = request.toolCall.id;
    logger.debug(
      'neko.agent.approval.confirmation.requested',
      withAgentTrace(deriveAgentTraceContext(request.toolCall.trace, { phase: 'approval' }), {
        toolCallId,
        toolName: request.toolCall.name,
        confirmationToken: request.confirmationToken,
      }),
    );
    // Store pending confirmation (resolve is handled by onConfirmTool callback)
    this._pendingConfirmations.set(toolCallId, { source: 'live', request });

    void this._resolveToolConfirmation(request);
  }

  /** Resolve a tool confirmation through the session-owned ApprovalEngine. */
  private async _resolveToolConfirmation(request: ToolConfirmationRequest): Promise<void> {
    const toolCallId = request.toolCall.id;
    const trace = deriveAgentTraceContext(request.toolCall.trace, {
      phase: 'approval',
      parentRequestId: request.confirmationToken,
    });

    if (this._approvalEngine) {
      try {
        const decision = await this._approvalEngine.evaluate({
          channel: 'permission',
          paradigm: 'imperative',
          subject: {
            label: request.description ?? request.toolCall.name,
            kind: `tool:${request.toolCall.name}`,
          },
          context: {
            arguments: request.toolCall.arguments,
            toolCallId,
          },
          id: request.confirmationToken ?? `${toolCallId}-${Date.now()}`,
          at: Date.now(),
          trace,
        });
        if (decision.resolution === 'auto-accept' || decision.resolution === 'user-accept') {
          this.confirmTool(toolCallId, true);
          return;
        }
        if (decision.resolution === 'auto-reject' || decision.resolution === 'user-reject') {
          // 'no-decision' lands here. Skip the user prompt — the engine's
          // contract is that no-decision = reject. Sites that want the
          // user asked anyway can wire an onConfirmTool AND register a
          // pack that escalates explicitly.
          if (decision.reason !== 'no-decision') {
            this.confirmTool(toolCallId, false);
            return;
          }
          // Fall through to user prompt when no pack decided — safer
          // default than a silent auto-reject for destructive operations.
        }
        // 'escalate' → user prompt.
      } catch (err) {
        logger.warn('Approval engine threw; delegating to user onConfirmTool', {
          error: err,
        });
      }
    }

    // Host callback path for explicit user confirmation.
    if (!this._config.onConfirmTool) {
      // No user prompt + no decisive engine answer → safe default: reject.
      logger.debug(
        'neko.agent.approval.confirmation.host-callback',
        withAgentTrace(trace, {
          toolCallId,
          toolName: request.toolCall.name,
          decision: 'reject',
          reason: 'missing-user-callback',
        }),
      );
      this.confirmTool(toolCallId, false);
      return;
    }
    try {
      const approved = await this._config.onConfirmTool(request);
      logger.debug(
        'neko.agent.approval.confirmation.host-callback',
        withAgentTrace(trace, {
          toolCallId,
          toolName: request.toolCall.name,
          decision: approved ? 'accept' : 'reject',
          reason: 'user-callback',
        }),
      );
      this.confirmTool(toolCallId, approved);
    } catch (err) {
      this.confirmTool(toolCallId, false);
      logger.error('Tool confirmation failed', { error: err });
    }
  }

  private async _applyCompressionResult(
    result: ConversationCompressionResult,
    trigger: 'token_threshold' | 'turn_threshold' | 'manual',
    trace?: AgentTraceContext,
  ): Promise<void> {
    const summaryMessages = result.messages.filter((message) => message.isSummary);
    let compactionEventId: string | undefined;
    let replacedEventIds: string[] = [];
    let summaryContent = '';
    let summaryMessageRole: 'system' | 'user' = 'system';

    if (summaryMessages.length > 0) {
      const summaryMessage = summaryMessages[0]!;
      replacedEventIds = collectCompressedMessageSourceEventIds(
        summaryMessage,
        this._historyEventIds,
      );
      summaryContent = getChatMessageContent(summaryMessage.message);
      summaryMessageRole = summaryMessage.message.role === 'user' ? 'user' : 'system';

      if (this._shouldLogCompaction() && this._journalWriter && summaryContent.length > 0) {
        const compactionTimestamp = Date.now();
        compactionEventId = await this._journalWriter.appendEvent(++this._journalSeq, {
          type: 'compaction',
          compaction: {
            timestamp: compactionTimestamp,
            trigger,
            replacedEventIds,
            summaryContent,
            summaryMessageRole,
            tokenProfile: {
              before: result.originalTokens,
              after: result.compressedTokens,
            },
            strategy: 'basic',
          },
        });
      }
    }

    const nextHistory: ChatMessage[] = [];
    const nextHistoryEventIds: string[][] = [];

    for (const message of result.messages) {
      nextHistory.push(message.message);
      if (message.isSummary) {
        nextHistoryEventIds.push(compactionEventId ? [compactionEventId] : [...replacedEventIds]);
        continue;
      }

      nextHistoryEventIds.push(
        collectCompressedMessageSourceEventIds(message, this._historyEventIds),
      );
    }

    this._history = nextHistory;
    this._historyEventIds = nextHistoryEventIds;
    this._syncSystemPrompt();
    logger.debug(
      'neko.agent.context_compaction.completed',
      withAgentTrace(deriveAgentTraceContext(trace, { phase: 'compaction' }), {
        trigger,
        originalTokens: result.originalTokens,
        compressedTokens: result.compressedTokens,
        compressionRatio: result.compressionRatio,
        messagesRemoved: result.messagesRemoved,
        summaryMessageCount: summaryMessages.length,
        replacedEventCount: replacedEventIds.length,
        circuitOpen: this._compactState.isCircuitOpen,
        consecutiveFailures: this._compactState.consecutiveFailures,
      }),
    );
  }

  private async _logCompactionFailure(
    trigger: 'token_threshold' | 'turn_threshold' | 'manual',
    reason: string,
    failureCount: number,
    trace?: AgentTraceContext,
  ): Promise<void> {
    logger.debug(
      'neko.agent.context_compaction.failed',
      withAgentTrace(deriveAgentTraceContext(trace, { phase: 'compaction' }), {
        trigger,
        reason,
        failureCount,
        circuitOpen: this._compactState.isCircuitOpen,
      }),
    );
    if (!this._journalWriter || !this._shouldLogCompaction()) {
      return;
    }

    await this._journalWriter.appendEvent(++this._journalSeq, {
      type: 'compaction_failed',
      compactionFailed: {
        trigger,
        reason,
        failureCount,
        circuitOpen: this._compactState.isCircuitOpen,
      },
    });
  }

  private _shouldLogCompaction(): boolean {
    return this._config.compactLogging !== false;
  }
}

/**
 * Map an ApprovalResponse resolution to the wire `decision` field on
 * `execution.approve.decided`. The event schema intentionally collapses
 * the richer engine vocabulary into three values the audit stream cares
 * about:
 *   - 'auto-approved' — strategy pack decided (no user ask)
 *   - 'accept'        — user said yes
 *   - 'reject'        — auto-reject OR user said no
 *
 * `escalate` is a transient state the engine resolves internally before
 * the onDecision listener fires; it's mapped to 'accept' defensively so
 * even if it leaks through the audit row is still meaningful.
 */
function _approvalResolutionToDecision(
  resolution: import('../approval/approval-types').ApprovalResolution,
): 'accept' | 'reject' | 'auto-approved' {
  switch (resolution) {
    case 'auto-accept':
      return 'auto-approved';
    case 'user-accept':
    case 'escalate':
      return 'accept';
    case 'auto-reject':
    case 'user-reject':
      return 'reject';
  }
}

function createEmptySkillProvider(): ISkillProvider {
  return {
    listSkills: () => [],
    getActiveSkill: () => null,
    activateSkill: () => ({
      success: false,
      code: 'skill-system-unavailable',
    }),
    deactivateSkill: () => ({
      success: false,
      code: 'skill-system-unavailable',
    }),
  };
}

function createAutohealEventEmitterPort(
  eventBus: IEventBus | null,
): AutohealEventEmitterPort | undefined {
  if (!eventBus) {
    return undefined;
  }

  return {
    emit(event) {
      eventBus.emit(event);
    },
  };
}

function createValidationWorkspacePort(
  workspace: AgentSessionConfig['workspace'] | undefined,
): import('@neko/shared').AgentValidationWorkspacePort | undefined {
  if (!workspace || !hasWorkspaceWriteFileFsOps(workspace.fsOps)) {
    return undefined;
  }

  const fsOps = workspace.fsOps;
  return {
    root: workspace.root,
    fsOps: {
      mkdir: fsOps.mkdir.bind(fsOps),
      writeFile: fsOps.writeFile.bind(fsOps),
      ...(typeof fsOps.readFile === 'function' ? { readFile: fsOps.readFile.bind(fsOps) } : {}),
    },
  };
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an agent session
 */
export function createAgentSession(config: AgentSessionConfig): AgentSession {
  return new AgentSession(config);
}

function createPersistedStepEvents(
  step: AgentStep,
  yieldedEvents: readonly AgentEvent[],
): AgentEvent[] {
  const persistedEvents = yieldedEvents.filter((event) => event.type !== 'text_delta');

  if ((step.type === 'think' || step.type === 'respond') && step.content) {
    const hasPersistedText = persistedEvents.some((event) => event.type === 'text');
    if (!hasPersistedText) {
      const syntheticText: AgentEvent = { type: 'text', content: step.content };
      if (step.type === 'think') {
        const firstToolCallIndex = persistedEvents.findIndex((event) => event.type === 'tool_call');
        if (firstToolCallIndex >= 0) {
          persistedEvents.splice(firstToolCallIndex, 0, syntheticText);
        } else {
          persistedEvents.push(syntheticText);
        }
      } else {
        persistedEvents.push(syntheticText);
      }
    }
  }

  return persistedEvents;
}

function normalizeMessageEventIds(
  messages: readonly ChatMessage[],
  messageEventIds?: readonly (readonly string[])[],
): string[][] {
  return messages.map((message, index) => {
    if (message.role === 'system') {
      return [];
    }
    const sourceEventIds = messageEventIds?.[index];
    return sourceEventIds ? [...sourceEventIds] : [];
  });
}

function collectPersistedEventIds(entries: readonly PersistedAgentEvent[]): string[] {
  const eventIds: string[] = [];
  for (const entry of entries) {
    if (entry.eventId && !eventIds.includes(entry.eventId)) {
      eventIds.push(entry.eventId);
    }
  }
  return eventIds;
}

function composeBeforeThinkHooks(
  base: import('@neko/shared').ExecutorHooks,
  hooks: readonly import('@neko/shared').ExecutorHooks[],
): import('@neko/shared').ExecutorHooks {
  const beforeThinkChain: Array<
    (
      context: import('@neko/shared').AgentContext,
    ) => Promise<import('@neko/shared').AgentContext | void>
  > = [];
  if (base.beforeThink) {
    beforeThinkChain.push((context) => base.beforeThink!(context));
  }
  for (const hook of hooks) {
    if (hook.beforeThink) {
      beforeThinkChain.push((context) => hook.beforeThink!(context));
    }
  }

  if (beforeThinkChain.length <= 1) {
    return base;
  }

  const nameSuffix = hooks
    .map((hook) => hook.name ?? null)
    .filter((name): name is string => Boolean(name))
    .join('+');

  return {
    ...base,
    name: nameSuffix ? `${base.name ?? 'react-loop'}+${nameSuffix}` : (base.name ?? 'react-loop'),
    beforeThink: async (context) => {
      let next = context;
      for (const step of beforeThinkChain) {
        next = (await step(next)) || next;
      }
      return next;
    },
  };
}

function collectCompressedMessageSourceEventIds(
  message: CompressedMessage,
  historyEventIds: readonly string[][],
): string[] {
  const sourceIndexes = message.sourceIndexes ?? [];
  const collected: string[] = [];

  for (const sourceIndex of sourceIndexes) {
    const eventIds = historyEventIds[sourceIndex];
    if (!eventIds) {
      continue;
    }
    for (const eventId of eventIds) {
      if (!collected.includes(eventId)) {
        collected.push(eventId);
      }
    }
  }

  return collected;
}

function getChatMessageContent(message: ChatMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  return message.content
    .flatMap((part) => ('text' in part && typeof part.text === 'string' ? [part.text] : []))
    .join('\n');
}

type WorkspaceFsOps = NonNullable<AgentSessionConfig['workspace']>['fsOps'];

interface WorkspaceWriteFileFsOps extends WorkspaceFsOps {
  writeFile(path: string, data: string, encoding: 'utf-8'): Promise<void>;
}

function hasWorkspaceWriteFileFsOps(fsOps: WorkspaceFsOps): fsOps is WorkspaceWriteFileFsOps {
  return 'writeFile' in fsOps && typeof fsOps.writeFile === 'function';
}

type ObservedToolResult = AgentObservedToolResult;

function resolveObservedToolName(result: ObservedToolResult, toolNameHint?: string): string {
  return result.name ?? toolNameHint ?? 'unknown-tool';
}

function toToolReviewValidationSignal(input: {
  readonly adapters: AgentSessionConfig['toolResultValidationAdapters'];
  readonly result: ObservedToolResult;
  readonly toolArguments?: Record<string, unknown>;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly observedAt: number;
  readonly locale?: string;
  readonly runId?: string;
}): import('@neko/shared').AgentToolReviewValidationSignal | null {
  for (const adapter of input.adapters ?? []) {
    const signal = adapter.createSignal(input);
    if (signal) {
      return signal;
    }
  }
  return null;
}

function toProviderExpressionValidationSignal(input: {
  readonly result: ObservedToolResult;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly observedAt: number;
  readonly runId?: string;
  readonly attachEvidence?: boolean;
}): AgentValidationSignal | null {
  const metadata = extractProviderExpressionMetadata(input.result);
  if (!metadata) {
    return null;
  }

  return {
    kind: 'provider-card-observation',
    observedAt: input.observedAt,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    mode: metadata.mode,
    ...(metadata.providerId ? { providerId: metadata.providerId } : {}),
    ...(metadata.reason ? { reason: metadata.reason } : {}),
    ...(metadata.styleFamily ? { styleFamily: metadata.styleFamily } : {}),
    ...(metadata.concepts.length > 0 ? { concepts: metadata.concepts } : {}),
    ...(metadata.conceptDecisions.length > 0
      ? { conceptDecisions: metadata.conceptDecisions }
      : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    metadata: metadata.raw,
  };
}

function extractProviderExpressionMetadata(result: ObservedToolResult): {
  mode: 'agentic' | 'fallback' | 'native';
  providerId?: string;
  reason?: string;
  styleFamily?: string;
  concepts: readonly string[];
  conceptDecisions: readonly AgentProviderExpressionConceptDecision[];
  raw: Record<string, unknown>;
} | null {
  const adaptation = getProviderAdaptationCandidate(result);
  if (isRecord(adaptation)) {
    return extractProviderAdaptationMetadata(adaptation);
  }

  return null;
}

function extractProviderAdaptationMetadata(metadata: Record<string, unknown>): {
  mode: 'agentic' | 'fallback' | 'native';
  providerId?: string;
  reason?: string;
  styleFamily?: string;
  concepts: readonly string[];
  conceptDecisions: readonly AgentProviderExpressionConceptDecision[];
  raw: Record<string, unknown>;
} | null {
  const mode =
    metadata['mode'] === 'agentic' ? 'agentic' : metadata['mode'] === 'native' ? 'native' : null;
  if (!mode) return null;

  const intent = metadata['extractedIntent'];
  const adaptationMetadata = metadata['adaptationMetadata'];
  return {
    mode,
    ...(readProviderId(metadata) ? { providerId: readProviderId(metadata) } : {}),
    ...(readAdaptationReason(adaptationMetadata)
      ? { reason: readAdaptationReason(adaptationMetadata) }
      : {}),
    ...(isRecord(intent) && typeof intent['styleFamily'] === 'string'
      ? { styleFamily: intent['styleFamily'] }
      : {}),
    concepts: readIntentConcepts(intent),
    conceptDecisions: [],
    raw: metadata,
  };
}

function readAdaptationReason(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value['riskFlags'])) return undefined;
  return value['riskFlags'].find((entry): entry is string => typeof entry === 'string');
}

function readIntentConcepts(value: unknown): readonly string[] {
  if (!isRecord(value)) return [];
  const concepts = [
    ...(Array.isArray(value['style']) ? value['style'] : []),
    ...(Array.isArray(value['mustInclude']) ? value['mustInclude'] : []),
    ...(Array.isArray(value['mood']) ? value['mood'] : []),
  ];
  return concepts
    .filter((concept): concept is string => typeof concept === 'string')
    .map((concept) => concept.trim())
    .filter(Boolean);
}

function getProviderAdaptationCandidate(result: ObservedToolResult): unknown {
  const direct = result.metadata?.['providerAdaptation'];
  if (direct) return direct;
  if (isRecord(result.data)) return result.data['providerAdaptation'];
  return undefined;
}

function readProviderId(metadata: Record<string, unknown>): string | undefined {
  if (typeof metadata['providerId'] === 'string') {
    return metadata['providerId'];
  }

  const providerHints = metadata['providerHints'];
  if (isRecord(providerHints) && typeof providerHints['providerId'] === 'string') {
    return providerHints['providerId'];
  }

  const selection = metadata['selection'];
  if (isRecord(selection) && typeof selection['primary'] === 'string') {
    return selection['primary'];
  }

  return undefined;
}

function normalizeWorkspaceLogConversationId(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectInjectedToolNames(toolInjectionManager: ToolInjectionManager): readonly ToolName[] {
  const state = toolInjectionManager.getState();
  return [
    ...new Set([
      ...(state.injectedTools.get('always') ?? []),
      ...(state.injectedTools.get('dynamic') ?? []),
    ]),
  ] as readonly ToolName[];
}

function filterLifecycleProjectionAllowedTools(
  allowedTools: readonly string[] | undefined,
): string[] | undefined {
  if (!allowedTools) return undefined;
  return allowedTools.filter((tool) => !isPersistentShellAllowRuleForbidden(tool));
}
