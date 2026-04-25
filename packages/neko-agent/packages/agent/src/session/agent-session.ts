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
  AgentStep,
  ChatMessage,
  CompressedMessage,
  ConversationCompressionResult,
  PromptFragment,
  Skill,
  ToolName,
  Tool,
} from '@neko/shared';
import {
  CREATION_CHANNELS,
  EXECUTION_CHANNELS,
  type Draft,
  type ExecutionArtifactWrittenEvent,
  type ExecutionPlan,
  type IdcStage,
  type StageActivationDecision,
  type IdcRun,
  type Task,
} from '@neko-agent/types';
import type { SkillInjection, IStagePersonaBinding, IStageGuardian } from '../skill';
import {
  SkillInjectionCoordinator,
  StageTracker,
  createStagePersonaBinding,
  createStageGuardian,
} from '../skill';
import type { StageMode } from '../skill/activation/stage-activation-matrix';
import type { IIdcRunStore, ReActLoopRunnerState } from '../executor';
import { createReActLoopRunner, createIdcRunStore } from '../executor';
import type { IEventBus } from '../events';
import { createEventBus } from '../events';
import {
  createIdcRuntimeStateStore,
  createNekoPaths,
  createNdjsonEventSink,
  readIdcRuntimeState,
} from '../workspace';
import { createArtifactWatcher, type IArtifactWatcher } from '../artifact';
import type { IAutohealChain } from '../autoheal';
import { createAutohealChain } from '../autoheal';
import type { IApprovalEngine } from '../approval';
import {
  createApprovalEngine,
  executionStrategyPack,
  creationStrategyPack,
  createPreferencesStrategyPacks,
} from '../approval';
import { loadPreferences } from '../workspace';
import type { ISkillProvider } from '../tools/core/meta-tools';
import { ActivateSkillTool, DeactivateSkillTool, GetContextTool } from '../tools/core/meta-tools';
import { stepToEvents, type StreamState } from './step-event-converter';

import type {
  IAgentSession,
  AgentSessionConfig,
  AgentEvent,
  ExecutionMode,
  ExecutionContext,
  CompressionResult,
} from './types';

import type { ToolConfirmationRequest } from '../permission/types';

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
import type { PromptModule } from '../prompt/registry/module-manifest';
import type { MemoryProjectModule } from '../prompt/modules/memory/memory-project-module';
import type { MemoryRecallModule } from '../prompt/modules/memory/memory-recall-module';
import type { CreativeVersionLogModule } from '../prompt/modules/ephemeral/creative-version-log-module';
import type { FeedbackGuidanceModule } from '../prompt/modules/ephemeral/feedback-guidance-module';
import type { SkillInjectionModule } from '../prompt/modules/skill/skill-injection-module';
import type { AgentsMdModule } from '../prompt/modules/environment/agents-md-module';
import type { ArtifactSchemaModule } from '../prompt/modules/schema/artifact-schema-module';
import type { SubpackageFragmentsModule } from '../prompt/modules/environment/subpackage-fragments-module';
import { createPromptContextProvider } from '../prompt/context';
import { MemoryRecall } from '../memory/memory-recall';
import {
  composeBeforeThinkHooks,
  createFeedbackCoordinator,
  type IFeedbackCoordinator,
} from '../feedback';
import { projectPersistedEventsToWorkingMemory, type PersistedAgentEvent } from './working-memory';
import { getLogger } from '../utils/logger';
import { toSerializableErrorCause } from '../utils/serializable-error';
import type { IdcProjectedTaskArtifactBinding } from '../task/idc-projected-task';
import {
  initializeSession,
  createConfiguredExecutor,
  DEFAULT_MAX_ITERATIONS,
} from './agent-session-initializer';
import {
  createWorkspaceArtifactService,
  type AnyArtifactRecord,
  toIdcRunArtifactBinding,
  type ArtifactRecord,
  type IArtifactService,
} from '../runtime/artifact-service';
import {
  classifyIdcEntrySignal,
  classifyIdcTaskShape,
  resolveIdcRunKind,
  type IdcTurnPlanningContext,
} from './idc-turn-planning';

const logger = getLogger('AgentSession');

// =============================================================================
// Constants
// =============================================================================

/** Plan mode system reminder injected into user input */
export const PLAN_MODE_SYSTEM_REMINDER = `
[PLAN MODE ACTIVE]
You are in planning mode. Generate a detailed implementation plan but DO NOT execute any tools.
Describe what tools you would use and in what order, but do not call them.
`;

const MAX_PERSISTED_STAGE_TRANSITIONS = 32;
const MAX_FEEDBACK_CYCLES = 32;
const IDC_RUNTIME_STATE_DEBOUNCE_MS = 200;

type PersistedFeedbackGuidanceSnapshot = import('../workspace').PersistedFeedbackGuidanceSnapshot;

// =============================================================================
// AgentSession Implementation
// =============================================================================

/**
 * Agent Session - Unified session management
 */
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

  // Prompt composition
  private _promptComposer: SystemPromptComposer;

  // PR2 prompt modules — own the format contract for environment/ephemeral
  // sections previously written directly via composer.setSection calls.
  private _memoryProjectModule: MemoryProjectModule;
  private _memoryRecallModule: MemoryRecallModule;
  private _creativeVersionLogModule: CreativeVersionLogModule;
  private _feedbackGuidanceModule: FeedbackGuidanceModule;
  private _promptModuleOrchestrator: ModuleOrchestrator;
  private readonly _promptContextProvider: ReturnType<typeof createPromptContextProvider>;
  // PR3a: owns the format contract for skill-layer sections; consumed by
  // SkillInjectionCoordinator's Track A writes.
  private _skillInjectionModule: SkillInjectionModule;
  // PR3b: AGENTS.md overlay module (environment layer).
  private _agentsMdModule: AgentsMdModule;
  // PR3c: IDC artifact contract (L1 schema layer). Instance held here so
  // future session-level IdcRun transition wiring (PR3d) can toggle it.
  private _artifactSchemaModule: ArtifactSchemaModule;
  // PR3e: sub-package prompt fragments (environment layer priority 70).
  // Instance held for future re-sync passes when provider set changes.
  private _subpackageFragmentsModule: SubpackageFragmentsModule;

  // Skill injection (3-track coordinator)
  private _skillCoordinator!: SkillInjectionCoordinator;

  // IDC stage tracking: StageTracker emits stage.entered events;
  // StagePersonaBinding subscribes and swaps the persona Skill when a new
  // stage is reached. Replaces the legacy FlowSwitcher/FlowBinding pair.
  private _stageTracker: StageTracker | null = null;
  private _stagePersonaBinding: IStagePersonaBinding | null = null;
  /** Non-blocking inspector that rides alongside the tracker (ADR §6.5). */
  private _stageGuardian: IStageGuardian | null = null;

  // ReAct-loop stage-activation orchestrator.
  private _runStore: IIdcRunStore | null = null;
  private _reactRunnerState: Readonly<ReActLoopRunnerState> | null = null;
  private _reactLoopBaseHooks: import('@neko/shared').ExecutorHooks | null = null;
  private _runnerHooks: import('@neko/shared').ExecutorHooks | null = null;

  // Typed event bus for creation.* / execution.* channels.
  private _eventBus: IEventBus | null = null;
  // `.neko/` directory resolver (only when workspace config is supplied).
  private _nekoPaths: import('../workspace').INekoPaths | null = null;
  // JSONL event sink persisting bus events to `.neko/logs/events.jsonl`.
  private _eventSink: import('../workspace').INdjsonEventSink | null = null;
  // Mutable workspace snapshot for active IDC runtime state.
  private _runtimeStateStore: import('../workspace').IIdcRuntimeStateStore | null = null;
  // JSONL audits sink persisting approve.decided events to
  // `.neko/logs/audits.jsonl`. Filter-predicated sibling of _eventSink.
  private _auditsSink: import('../workspace').INdjsonEventSink | null = null;
  // JSONL steps sink persisting step.completed events to
  // `.neko/logs/steps.jsonl`. Third filter view on the bus.
  private _stepsSink: import('../workspace').INdjsonEventSink | null = null;
  // Post-write validator + fs.watch for draft/plan/task artifacts (Phase B,
  // ADR §6.5). Replaces the dedicated Write tools with a non-blocking
  // validator that emits artifact.* events onto the EventBus.
  private _artifactWatcher: IArtifactWatcher | null = null;
  // Unified feedback runtime: owns artifact observation, self-evaluation
  // guidance, and project-memory extraction as a single session-level
  // dependency rather than three ad hoc code paths.
  private _feedbackCoordinator: IFeedbackCoordinator | null = null;
  private _feedbackCycles: import('../feedback').FeedbackCycle[] = [];
  private _feedbackGuidanceState: PersistedFeedbackGuidanceSnapshot | null = null;
  // Loaded user preferences (ADR §9.3). null when workspace.fsOps
  // didn't provide readFile, or when both layers are absent.
  private _preferencesReady: Promise<void> | null = null;
  private _preferencesWarnings: readonly string[] = [];
  private _stageTransitions: import('../workspace').IdcRuntimeStageTransition[] = [];
  private _runtimeStateUnsubscribers: Array<() => void> = [];
  private _runtimeStatePersistTimer: ReturnType<typeof setTimeout> | null = null;
  private _runtimeStatePersistScheduled = false;

  // 5-level autoheal chain fed by afterAct.
  private _autohealChain: IAutohealChain | null = null;

  // Unified approval engine — permission channel consults it before
  // delegating to the user onConfirmTool callback.
  private _approvalEngine: IApprovalEngine | null = null;

  // Meta tools (for ISkillProvider wiring)
  private _metaTools: Tool[] = [];

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
  /** Tracks streaming state across step conversions */
  private _streamState: StreamState = { hasStreamedDeltas: false };
  /** Current turn's IDC planning hints (input, active skill, external metadata). */
  private _currentTurnPlanningContext: IdcTurnPlanningContext | null = null;
  private _memoryRecall: MemoryRecall | null = null;
  private _pendingConfirmations = new Map<
    string,
    {
      source: 'live' | 'restored';
      request: ToolConfirmationRequest;
    }
  >();
  private _runtimeStateRestoreReady: Promise<void> | null = null;
  private _runtimeStateRestorePending = false;
  private _artifactService: IArtifactService | null = null;
  private _artifactRestoreReady: Promise<void> | null = null;
  private _artifactSyncPending: Promise<void> = Promise.resolve();
  private _idcTaskProjection: import('../task').IIdcTaskProjection | null = null;
  private _idcTaskProjectionPending: Promise<void> = Promise.resolve();

  /**
   * Ablation marker (set when the session was constructed via
   * applyAblationToggles). Session-side consumers: SkillInjectionCoordinator
   * gate (via enableInjection) and dispose-time SkillService restore.
   */
  private _ablationMarker?: import('../experiment/apply-toggles').AblationMarkerHook;

  constructor(config: AgentSessionConfig) {
    this._config = config;
    this._executionMode = config.executionMode ?? 'auto';

    // Delegate component creation to initializer (SRP: init logic separate from runtime)
    const components = initializeSession(config, {
      onToolConfirmation: (request) => this._handleToolConfirmation(request),
    });

    // Assign initialized components
    this._compressor = components.compressor;
    this._toolGroupRegistry = components.toolGroupRegistry;
    this._toolInjectionManager = components.toolInjectionManager;
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
    this._feedbackGuidanceModule = components.feedbackGuidanceModule;
    this._promptModuleOrchestrator = components.promptModuleOrchestrator;
    this._skillInjectionModule = components.skillInjectionModule;
    this._agentsMdModule = components.agentsMdModule;
    this._artifactSchemaModule = components.artifactSchemaModule;
    this._subpackageFragmentsModule = components.subpackageFragmentsModule;
    this._promptContextProvider = createPromptContextProvider({
      getRunId: () => this._runStore?.getActive()?.id ?? null,
      getStage: () => this._stageTracker?.current ?? null,
      getActiveSkillName: () => this.getActiveSkill()?.name ?? null,
      getActiveTools: () => collectInjectedToolNames(this._toolInjectionManager),
      getLocale: () => 'en',
      getProjectPath: () => this._config.workspace?.root ?? '',
    });
    this._refreshMemoryRuntime();
    if (components.ablationMarker) {
      this._ablationMarker = components.ablationMarker;
    }

    // Journal writer for session persistence
    if (config.journalWriter) {
      this._journalWriter = config.journalWriter;
    }

    this._artifactService = resolveArtifactService(config);
    this._idcTaskProjection = config.idcTaskProjection ?? null;
    this._scheduleArtifactRestore();

    // SkillInjectionCoordinator requires closures over Session fields
    // (e.g. _permissionHooks changes on configure()), so created here.
    // Ablation: when marker.disableSkillInjection is true, the coordinator's
    // apply() short-circuits — discovery still works, injection does not.
    this._skillCoordinator = new SkillInjectionCoordinator({
      promptComposer: this._promptComposer,
      getPermissionHooks: () => this._permissionHooks,
      syncSystemPrompt: () => this._syncSystemPrompt(),
      skillInjectionModule: this._skillInjectionModule,
      ...(this._ablationMarker && {
        enableInjection: !this._ablationMarker.disableSkillInjection,
      }),
    });

    // Stage tracking: when the caller supplies a skill registry + service,
    // spin up a StageTracker and auto-swap the persona Skill on each stage
    // transition. The initial persona sync is async; fire-and-forget here —
    // callers that need determinism should call syncInitialPersona() directly.
    if (config.stageTracking) {
      this._stageTracker = new StageTracker({ initialStage: config.stageTracking.initialStage });
      if (config.stageTracking.skillRegistry && config.stageTracking.skillService) {
        this._stagePersonaBinding = createStagePersonaBinding({
          stageTracker: this._stageTracker,
          skillRegistry: config.stageTracking.skillRegistry,
          skillService: config.stageTracking.skillService,
          coordinator: this._skillCoordinator,
          // Resolve `{runId}` in creation-persona's artifact-file contract
          // lazily so re-applies after a new IdcRun pick up the fresh id.
          getRunId: () => this._runStore?.getActive()?.id ?? null,
        });
        void this._stagePersonaBinding.syncCurrent();
      }

      // Install the ReAct-loop stage-activation runner and its companions:
      //   - EventBus: typed channel for compacted round / milestone events.
      //   - Autoheal chain: routes tool errors through L1-L5; emits
      //     execution.autoheal.* on the same bus.
      //   - Approval engine: pre-filters ask-mode tool calls via the
      //     declarative + imperative strategy packs.
      this._runStore = createIdcRunStore();
      this._eventBus = createEventBus();

      // Workspace persistence (ADR §7.4). When a project root is
      // supplied, persist every bus event to `<root>/.neko/logs/events.jsonl`.
      // No-op otherwise — the session still runs, just without disk
      // telemetry. Audits / steps sinks can be added later as
      // filter-predicated siblings.
      if (config.workspace) {
        this._nekoPaths = createNekoPaths(config.workspace.root);
        this._eventSink = createNdjsonEventSink({
          filePath: this._nekoPaths.log('events'),
          fsOps: config.workspace.fsOps,
        });
        this._eventSink.attach(this._eventBus);
      }

      // ArtifactWatcher (Phase B) — fire-and-forget start. Prefer the
      // runtime artifact-plane factory when one is supplied so host
      // bootstraps control how Draft/Plan/Task watch/validate is wired.
      // Fallback keeps the legacy workspace-backed watcher alive.
      this._artifactWatcher = this._createConfiguredArtifactWatcher();
      void this._artifactWatcher?.start();

      if (
        this._nekoPaths &&
        config.workspace &&
        typeof config.workspace.fsOps.writeFile === 'function'
      ) {
        this._runtimeStateStore = createIdcRuntimeStateStore({
          filePath: this._nekoPaths.state('idcRuntime'),
          fsOps: {
            mkdir: config.workspace.fsOps.mkdir,
            writeFile: config.workspace.fsOps.writeFile.bind(config.workspace.fsOps),
          },
        });
      }

      if (
        this._nekoPaths &&
        config.workspace &&
        typeof config.workspace.fsOps.readFile === 'function'
      ) {
        this._runtimeStateRestorePending = true;
        const runtimeStateRead = readIdcRuntimeState({
          filePath: this._nekoPaths.state('idcRuntime'),
          fsOps: {
            readFile: config.workspace.fsOps.readFile.bind(config.workspace.fsOps),
          },
        });
        this._runtimeStateRestoreReady = Promise.all([
          this._artifactRestoreReady ?? Promise.resolve(),
          runtimeStateRead,
        ])
          .then(([, restored]) => {
            if (this._disposed || !restored) {
              return;
            }
            this._restoreIdcRuntimeState(restored);
          })
          .then(() => undefined)
          .finally(() => {
            this._runtimeStateRestorePending = false;
            if (!this._disposed) {
              this._persistIdcRuntimeState();
            }
          });
      }

      this._autohealChain = createAutohealChain({ eventBus: this._eventBus });
      this._approvalEngine = createApprovalEngine({
        strategyPacks: [creationStrategyPack, executionStrategyPack],
      });

      // User preferences (ADR §9.3). When workspace.fsOps provides
      // `readFile`, load `.neko/preferences.md` + optional global
      // counterpart and prepend a preferences strategy pack so user
      // rules short-circuit the default packs. Async — callers that
      // need determinism await `whenPreferencesReady()`.
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
          // Register prepended so preferences evaluate before defaults.
          // registerPriority prepends; call in reverse order so the
          // declarative pack ends up before the imperative pack (both
          // before the built-in packs).
          const packs = createPreferencesStrategyPacks(merged.effective);
          for (let i = packs.length - 1; i >= 0; i--) {
            engine.registerPriority(packs[i]!);
          }
        });
      }

      // ApprovalEngine → bus bridge. Every finalised decision lands on
      // `execution.approve.decided` so audit sinks (ADR §7.4) can
      // consume the stream without peeking into the engine directly.
      // Independent of StageGuardian wiring — callers without a guardian
      // still get audit coverage.
      {
        const bus = this._eventBus;
        const getRunId = (): string | undefined => this._runStore?.getActive()?.id;
        this._approvalEngine.onDecision((request, response) => {
          const runId = getRunId();
          if (!runId) return; // No active run — skip (pre-execute engine use).
          bus.emit({
            channel: 'execution.approve.decided',
            runId,
            subject: request.subject.kind,
            decision: _approvalResolutionToDecision(response.resolution),
            at: response.decidedAt,
          });
        });
      }

      // Workspace audits sink — captures every approve.decided event
      // to `<root>/.neko/logs/audits.jsonl`. Filter-predicated sibling
      // of the events sink so ApprovalEngine decisions are separable
      // from the general event stream for compliance reads.
      if (this._nekoPaths && config.workspace) {
        this._auditsSink = createNdjsonEventSink({
          filePath: this._nekoPaths.log('audits'),
          fsOps: config.workspace.fsOps,
          filter: (e: { channel: string }) => e.channel === 'execution.approve.decided',
        });
        this._auditsSink.attach(this._eventBus);

        // Workspace steps sink — per-round step records land in
        // `<root>/.neko/logs/steps.jsonl`. Third filter view on the
        // same bus; forms the ADR §7.4 logs/ triptych alongside
        // events.jsonl (everything) and audits.jsonl (approvals).
        this._stepsSink = createNdjsonEventSink({
          filePath: this._nekoPaths.log('steps'),
          fsOps: config.workspace.fsOps,
          filter: (e: { channel: string }) => e.channel === 'execution.step.completed',
        });
        this._stepsSink.attach(this._eventBus);
      }

      const { hooks: runnerHooks, state } = createReActLoopRunner({
        stageTracker: this._stageTracker,
        runStore: this._runStore,
        getMode: () => this._executionMode as StageMode,
        classifyTaskShape: (signals) =>
          classifyIdcTaskShape(signals, this._currentTurnPlanningContext),
        classifyEntrySignal: (signals) =>
          classifyIdcEntrySignal(signals, this._currentTurnPlanningContext),
        eventBus: this._eventBus,
        autohealChain: this._autohealChain,
      });
      this._reactRunnerState = state;
      this._installRuntimeStatePersistence();

      // StageGuardian — non-blocking inspector alongside the tracker.
      // Opted out by setting `stageTracking.guardian = false`; otherwise
      // we build it with the caller's config (or defaults). Issues stay
      // on the guardian itself; consumers subscribe via
      // `session.onStageGuardianIssue()` or read `getStageGuardianIssues()`.
      // The typed EventBus is reserved for creation.*/execution.* payloads.
      if (config.stageTracking.guardian !== false) {
        const guardianConfig =
          typeof config.stageTracking.guardian === 'object'
            ? config.stageTracking.guardian
            : undefined;
        this._stageGuardian = createStageGuardian(this._stageTracker, guardianConfig);

        // Wire ApprovalEngine.onDecision → guardian.noteApproval so the
        // `approval-skipped` rule has a record of every gate that fired.
        // Any resolution counts as "the gate was consulted" — what we're
        // catching is Apply calls that bypass the engine entirely.
        const guardian = this._stageGuardian;
        if (this._approvalEngine) {
          this._approvalEngine.onDecision((request) => {
            if (request.subject?.kind) {
              guardian.noteApproval(request.subject.kind);
            }
          });
        }
        // Wire execution.apply.committed → guardian.noteApply. The runner
        // emits this event with `kind` = tool name; we feed the same key
        // to the guardian so approval ↔ apply pairing works.
        if (this._eventBus) {
          this._eventBus.on('execution.apply.committed', (event) => {
            guardian.noteApply(event.kind);
          });
        }
      }

      this._rebuildFeedbackCoordinator();

      // Compose runner hooks with the guardian's tick. Keep runner hooks
      // in a single ExecutorHooks object so the executor's addHook call
      // stays idempotent across configure() rebuilds.
      const guardian = this._stageGuardian;
      const withGuardian: import('@neko/shared').ExecutorHooks = guardian
        ? {
            ...runnerHooks,
            name: runnerHooks.name ?? 'react-loop+stage-guardian',
            afterAct: async (results) => {
              if (runnerHooks.afterAct) await runnerHooks.afterAct(results);
              // Tick drives the stage-timeout check without an internal
              // timer — sampled on tool-batch boundaries is enough for
              // long-running generate / render calls to surface.
              guardian.tick();
            },
          }
        : runnerHooks;

      this._reactLoopBaseHooks = withGuardian;
      this._runnerHooks = this._composeRunnerHooks(withGuardian);

      // Register on the already-built executor + on any re-builds after configure().
      if (this._executor) {
        this._executor.addHook(this._runnerHooks);
      }
    }

    if (!config.stageTracking) {
      this._rebuildFeedbackCoordinator();
    }
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  configure(config: Partial<AgentSessionConfig>): void {
    // Update config
    const previousArtifactService = this._artifactService;
    this._config = { ...this._config, ...config };
    if (config.artifactService !== undefined || config.workspace !== undefined) {
      this._artifactService = resolveArtifactService(this._config);
      if (previousArtifactService && previousArtifactService !== this._artifactService) {
        void previousArtifactService.dispose?.();
      }
      this._scheduleArtifactRestore();
    }
    if (config.idcTaskProjection !== undefined) {
      this._idcTaskProjection = config.idcTaskProjection ?? null;
    }

    // Update execution mode if changed
    if (config.executionMode !== undefined) {
      this._executionMode = config.executionMode;
    }

    // Update system prompt in history if changed
    if (config.systemPrompt !== undefined) {
      this._promptComposer.setBase(config.systemPrompt);
    }

    this._rebuildFeedbackCoordinator();
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
   * Wire an ISkillProvider into the meta tools (GetContext, ActivateSkill, DeactivateSkill).
   * Called by the extension layer after the skill system is initialized.
   */
  setSkillProvider(provider: ISkillProvider): void {
    for (const tool of this._metaTools) {
      if (tool instanceof GetContextTool) {
        tool.setSkillProvider(provider);
      } else if (tool instanceof ActivateSkillTool) {
        tool.setSkillProvider(provider);
      } else if (tool instanceof DeactivateSkillTool) {
        tool.setSkillProvider(provider);
      }
    }
  }

  setPromptFragments(fragments: readonly PromptFragment[] | undefined): void {
    this._config.promptFragments = fragments ? [...fragments] : undefined;
    this._subpackageFragmentsModule.setFragments(fragments);
    this._applyPromptModuleSync(this._subpackageFragmentsModule);
    this._syncSystemPrompt();
  }

  getArtifactsForRun(runId?: string): readonly ArtifactRecord[] {
    if (!this._artifactService) {
      return [];
    }

    const targetRunId = runId ?? this._runStore?.getActive()?.id ?? null;
    if (!targetRunId) {
      return [];
    }

    return this._artifactService.listByRunId(targetRunId);
  }

  listArtifactRunIds(): readonly string[] {
    return this._artifactService?.listRunIds() ?? [];
  }

  getIdcRun(runId: string): IdcRun | null {
    if (!runId || !this._runStore) {
      return null;
    }

    const active = this._runStore.getActive();
    if (active?.id === runId) {
      return active;
    }

    return this._runStore.listCompleted().find((run) => run.id === runId) ?? null;
  }

  listIdcRuns(): readonly IdcRun[] {
    if (!this._runStore) {
      return [];
    }

    const active = this._runStore.getActive();
    const completed = [...this._runStore.listCompleted()].reverse();
    return active ? [active, ...completed] : completed;
  }

  getFeedbackCycles(): readonly import('../feedback').FeedbackCycle[] {
    return this._feedbackCycles;
  }

  writeDraftArtifact(draft: Draft, options?: { runId?: string }): Promise<ArtifactRecord<'draft'>> {
    return this._writeDraftArtifact(draft, options?.runId);
  }

  writePlanArtifact(
    plan: ExecutionPlan,
    options?: { runId?: string },
  ): Promise<ArtifactRecord<'plan'>> {
    return this._writePlanArtifact(plan, options?.runId);
  }

  writeTaskArtifact(task: Task, options?: { runId?: string }): Promise<ArtifactRecord<'task'>> {
    return this._writeTaskArtifact(task, options?.runId);
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
    let runCompletionStatus: 'completed' | 'failed' = 'completed';
    let runCompletionError: IdcRun['error'] | undefined;
    const hadPendingFeedbackGuidance = this._feedbackGuidanceState !== null;
    let feedbackGuidanceAdjustedThisTurn = false;

    try {
      this._currentTurnPlanningContext = {
        input,
        executionMode: this._executionMode,
        activeSkill: this.getActiveSkill(),
        metadata: context?.metadata,
      };

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
      let iteration = 0;

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

      if (this._runStore && !this._runStore.getActive()) {
        this.startIdcRun(resolveIdcRunKind(this._currentTurnPlanningContext));
      }

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

      feedbackGuidanceAdjustedThisTurn =
        this._captureFeedbackCycle() || feedbackGuidanceAdjustedThisTurn;
      await this._updateMemoryRecall(memoryQueryInput);
      this._syncSystemPrompt(); // Ensure system prompt is fresh before snapshot
      const messagesSnapshot = [...this._history];

      for await (const step of this._executor.executeStream(processedInput, {
        messages: messagesSnapshot,
        skipUserMessage: true,
        metadata: {
          workspaceRoot: context?.workspaceRoot,
          projectType: context?.projectType,
          activeFile: context?.activeFile,
          ...context?.metadata,
        },
      })) {
        ++iteration;

        // Accumulate token usage from think steps
        if (step.usage) {
          totalUsage.promptTokens += step.usage.promptTokens;
          totalUsage.completionTokens += step.usage.completionTokens;
          totalUsage.totalTokens += step.usage.totalTokens;
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

          this._observeToolFeedback(step);
          feedbackGuidanceAdjustedThisTurn =
            this._captureFeedbackCycle() || feedbackGuidanceAdjustedThisTurn;
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

        // Auto-compact: check if context compression is needed after each step
        if (this._compressor) {
          const tokens = this._compressor.estimateTokens(this._history);
          const compactResult = await autoCompactIfNeeded(
            this._compressor,
            this._history,
            tokens,
            this._compactState,
          );
          if (
            compactResult.compressed &&
            compactResult.compressionResult &&
            compactResult.trigger
          ) {
            await this._applyCompressionResult(
              compactResult.compressionResult,
              compactResult.trigger,
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
            );
          }
        }
      }

      await this._extractProjectMemory(turnPersistedEvents);
      feedbackGuidanceAdjustedThisTurn =
        this._captureFeedbackCycle() || feedbackGuidanceAdjustedThisTurn;

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

      // Write state snapshot and flush journal
      if (this._journalWriter) {
        await this._journalWriter.appendEvent(++this._journalSeq, doneEvent);
        await this._journalWriter.appendSnapshot(++this._journalSeq, {
          historyLength: this._history.length,
          executionMode: this._executionMode,
          versionLogSize: this._versionLog.size,
        });
        await this._journalWriter.flush();
      }
    } catch (error) {
      runCompletionStatus = 'failed';
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      runCompletionError = {
        code: 'execute_failed',
        message: normalizedError.message,
        cause: toSerializableErrorCause(normalizedError),
      };
      yield {
        type: 'error',
        error: normalizedError,
      };
    } finally {
      this._closeActiveRun(runCompletionStatus, runCompletionError);
      this._currentTurnPlanningContext = null;
      this._memoryRecallModule.setContent(null);
      if (!feedbackGuidanceAdjustedThisTurn && hadPendingFeedbackGuidance) {
        this._setFeedbackGuidanceContent(null);
      }
      this._syncSystemPrompt();
      this._persistIdcRuntimeState();
      this._isRunning = false;
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
      this._persistIdcRuntimeState();
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

  /**
   * Apply a skill injection to the active session.
   * Delegates to SkillInjectionCoordinator for atomic multi-track injection.
   *
   * @param injection The injection payload
   * @param skill Optional full Skill object for active skill tracking + Track D (ToolSets)
   */
  applySkillInjection(injection: SkillInjection, skill?: Skill): void {
    this._skillCoordinator.apply(injection, skill);
  }

  /**
   * Remove a previously injected skill prompt (reversible injection).
   * Delegates to SkillInjectionCoordinator for atomic 3-track cleanup.
   */
  removeSkillInjection(name: string): void {
    this._skillCoordinator.remove(name);
  }

  /**
   * Get the currently active skill (if any).
   * Delegates to SkillInjectionCoordinator — the sole state owner.
   */
  getActiveSkill(): Skill | undefined {
    return this._skillCoordinator.getActiveSkill();
  }

  /**
   * Clear the active skill — reverses all injection tracks (prompt, permissions, ToolSets).
   * Delegates to SkillInjectionCoordinator.clearActive().
   */
  clearActiveSkill(): void {
    this._skillCoordinator.clearActive();
  }

  /**
   * Check if a tool is allowed by the active skill.
   * Uses ToolGuard pattern matching via Coordinator.
   * Returns true if no skill restrictions are active.
   */
  isToolAllowed(toolName: string): boolean {
    return this._skillCoordinator.isToolAllowed(toolName);
  }

  // ---------------------------------------------------------------------------
  // IDC stage tracking
  // ---------------------------------------------------------------------------

  /**
   * Current IDC stage the agent is operating in, or null if stage tracking
   * is not configured.
   */
  getCurrentStage(): IdcStage | null {
    return this._stageTracker?.current ?? null;
  }

  /**
   * Explicitly apply the persona Skill for the current stage. Useful for
   * tests and for callers that need deterministic initialization (the
   * constructor fires the initial sync as a background task).
   */
  async syncStagePersona(): Promise<void> {
    if (this._stagePersonaBinding) {
      await this._stagePersonaBinding.syncCurrent();
    }
  }

  /**
   * Manually enter a stage. Normally the ReAct-loop runner drives this
   * automatically from planner decisions; call sites that want to override
   * (e.g. restoring a saved session) can trigger the transition explicitly.
   * Returns true iff the stage actually changed.
   */
  enterStage(stage: IdcStage): boolean {
    if (!this._stageTracker) return false;
    return this._stageTracker.enter(stage);
  }

  /**
   * Begin an IdcRun — the ReAct-loop runner appends rounds into the
   * active run. Returns null if dual-flow is not configured. No-op if a
   * run is already active (the runner closes it on onExecuteEnd).
   */
  startIdcRun(runKind: string, runId?: string): string | null {
    if (!this._runStore) return null;
    const nextRunId = this._runStore.startRun({ runKind, runId });
    this._hydrateRunArtifacts(nextRunId);
    this._persistIdcRuntimeState();
    return nextRunId;
  }

  /**
   * Legacy compatibility wrapper for the old workflowId terminology.
   * New code should call startIdcRun().
   */
  startWorkflowRun(workflowId: string, runId?: string): string | null {
    return this.startIdcRun(workflowId, runId);
  }

  /**
   * Snapshot of the active IdcRun (or null if none).
   */
  getActiveIdcRun(): IdcRun | null {
    return this._runStore?.getActive() ?? null;
  }

  /**
   * Last IDC stage-activation decision made by the runner.
   */
  getLastActivationDecision(): StageActivationDecision | null {
    return this._reactRunnerState?.lastDecision ?? null;
  }

  /**
   * Snapshot of StageGuardian issues raised during this session
   * (ADR §6.5). Empty array when the guardian is disabled or has not
   * fired. Bounded by the guardian's internal history cap.
   */
  getStageGuardianIssues(): readonly import('../skill').StageGuardianIssue[] {
    return this._stageGuardian?.getHistory() ?? [];
  }

  /**
   * Subscribe to StageGuardian issues as they are raised. Returns an
   * unsubscribe function; no-op unsubscribe when the guardian is
   * disabled (so callers don't need to null-check).
   */
  onStageGuardianIssue(
    listener: (issue: import('../skill').StageGuardianIssue) => void,
  ): () => void {
    if (!this._stageGuardian) return () => {};
    return this._stageGuardian.onIssue(listener);
  }

  /**
   * Typed EventBus for dual-flow channels (creation.* / execution.*).
   * Returns null if dual-flow is not configured.
   */
  getEventBus(): IEventBus | null {
    return this._eventBus;
  }

  /**
   * Shared ApprovalEngine — permission, plan-review, and quality-gate
   * channels consult it. Callers may register custom strategy packs
   * or set a user prompt. Returns null if dual-flow is not configured.
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
    if (this._artifactRestoreReady) {
      await this._artifactRestoreReady;
    }
    if (this._runtimeStateRestoreReady) {
      await this._runtimeStateRestoreReady;
    }
    await this._artifactSyncPending;
    await this._idcTaskProjectionPending;
    this._flushPendingRuntimeStatePersist();
    await Promise.all([
      this._eventSink ? this._eventSink.flush() : Promise.resolve(),
      this._runtimeStateStore ? this._runtimeStateStore.flush() : Promise.resolve(),
      this._auditsSink ? this._auditsSink.flush() : Promise.resolve(),
      this._stepsSink ? this._stepsSink.flush() : Promise.resolve(),
      this._artifactService?.flush?.() ?? Promise.resolve(),
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
    this._feedbackCycles = [];
    this._setFeedbackGuidanceContent(null);
    this._memoryRecallModule.setContent(null);
    this._syncSystemPrompt();
    // Rebuild from composer to preserve current prompt composition
    this._history = [{ role: 'system', content: this._promptComposer.compose() }];
    this._historyEventIds = [[]];
    this._persistIdcRuntimeState();
  }

  loadHistory(messages: ChatMessage[], messageEventIds?: readonly (readonly string[])[]): void {
    this._history = [...messages];
    this._historyEventIds = normalizeMessageEventIds(this._history, messageEventIds);
    this._processedMemoryEventIds = new Set();
    this._feedbackCycles = [];
    this._setFeedbackGuidanceContent(null);
    this._markMessageEventIdsAsProcessed(this._historyEventIds);
    // Ensure system prompt is present
    if (this._history.length === 0 || this._history[0].role !== 'system') {
      this._history.unshift({ role: 'system', content: this._config.systemPrompt });
      this._historyEventIds.unshift([]);
    } else {
      this._historyEventIds[0] = [];
    }
    this._persistIdcRuntimeState();
  }

  // ---------------------------------------------------------------------------
  // Context Management
  // ---------------------------------------------------------------------------

  getTokenCount(): number {
    return this._compressor.estimateTokens(this._history);
  }

  async compressContext(): Promise<CompressionResult> {
    const originalTokens = this.getTokenCount();

    const result = await this._compressor.compress(this._history);
    await this._applyCompressionResult(result, 'manual');
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
    this._closeActiveRun('aborted');
    this._isRunning = false;
    // Ablation: restore SkillService discovery state if this session disabled
    // it. SkillService is externally owned so we must un-flip to avoid leaking
    // ablation state across sessions. Other ablation-driven state (ToolInjectionManager
    // config, coordinator enableInjection flag) is session-local and dies with dispose.
    if (this._ablationMarker?.disableSkillDiscovery && this._config.skillService) {
      this._config.skillService.setDiscoveryEnabled(true);
    }
    // Flush journal writer
    void this._journalWriter?.dispose();
    // Stage tracking: unsubscribe binding listener + clear tracker listeners.
    this._stagePersonaBinding?.dispose();
    this._stageGuardian?.dispose();
    this._stageTracker?.dispose();
    // Reject all pending tool confirmations via permission hooks
    for (const pending of this._pendingConfirmations.values()) {
      if (pending.source === 'live' && pending.request.confirmationToken && this._permissionHooks) {
        this._permissionHooks.confirmTool(pending.request.confirmationToken, false);
      }
    }
    this._pendingConfirmations.clear();
    this._persistIdcRuntimeState();
    this._flushPendingRuntimeStatePersist();
    for (const unsubscribe of this._runtimeStateUnsubscribers) {
      unsubscribe();
    }
    this._runtimeStateUnsubscribers = [];
    this._stagePersonaBinding = null;
    this._stageGuardian = null;
    this._stageTracker = null;
    this._runStore = null;
    this._reactRunnerState = null;
    this._runnerHooks = null;
    // Flush all JSONL sinks before clearing the bus so in-flight
    // writes still reach disk. Fire-and-forget — dispose is synchronous
    // by contract; each sink's _pending queue tracks outstanding I/O.
    void this._eventSink?.dispose();
    void this._auditsSink?.dispose();
    void this._stepsSink?.dispose();
    // Close fs.watch handles + drop pending debounces before the bus goes away
    // so any last emit on settle has somewhere to land. Fire-and-forget.
    void this._artifactWatcher?.dispose();
    this._feedbackCoordinator?.dispose();
    this._eventSink = null;
    this._auditsSink = null;
    this._stepsSink = null;
    this._artifactWatcher = null;
    this._feedbackCoordinator = null;
    this._nekoPaths = null;
    this._eventBus?.clear();
    this._eventBus = null;
    this._autohealChain = null;
    this._approvalEngine = null;
    this._reactLoopBaseHooks = null;
    void this._artifactService?.dispose?.();
    this._artifactService = null;
    this._artifactRestoreReady = null;
    this._artifactSyncPending = Promise.resolve();
    this._idcTaskProjection = null;
    this._idcTaskProjectionPending = Promise.resolve();
    const runtimeStateStore = this._runtimeStateStore;
    if (runtimeStateStore) {
      void runtimeStateStore.dispose().catch((error) => {
        logger.warn('Failed to dispose IDC runtime state store', { error });
      });
    }
    this._runtimeStateStore = null;
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private _closeActiveRun(
    status: 'completed' | 'failed' | 'aborted',
    error?: IdcRun['error'],
  ): void {
    const activeRun = this._runStore?.getActive();
    if (!activeRun) return;
    this._runStore?.endRun(status, error);
    this._queueIdcTaskProjectionClear(activeRun.id, activeRun.startedAt);
  }

  private _scheduleArtifactRestore(): void {
    const readFile = this._config.workspace?.fsOps.readFile;
    const artifactService = this._artifactService;
    if (!readFile || !artifactService?.restore) {
      this._artifactRestoreReady = null;
      return;
    }

    this._artifactRestoreReady = artifactService
      .restore()
      .then((records) => {
        if (this._disposed || this._artifactService !== artifactService) {
          return;
        }
        for (const record of records) {
          this._attachArtifactRecord(record);
        }
      })
      .catch((error) => {
        logger.warn('Failed to restore artifacts from workspace', { error });
      });
  }

  private async _writeDraftArtifact(
    draft: Draft,
    runId?: string,
  ): Promise<ArtifactRecord<'draft'>> {
    const { artifactService, targetRunId } = this._resolveArtifactWriteContext(runId);
    const record = await artifactService.writeDraft(targetRunId, draft);
    this._attachArtifactRecord(record);
    this._persistIdcRuntimeState();
    return record;
  }

  private async _writePlanArtifact(
    plan: ExecutionPlan,
    runId?: string,
  ): Promise<ArtifactRecord<'plan'>> {
    const { artifactService, targetRunId } = this._resolveArtifactWriteContext(runId);
    const record = await artifactService.writePlan(targetRunId, plan);
    this._attachArtifactRecord(record);
    this._persistIdcRuntimeState();
    return record;
  }

  private async _writeTaskArtifact(task: Task, runId?: string): Promise<ArtifactRecord<'task'>> {
    const { artifactService, targetRunId } = this._resolveArtifactWriteContext(runId);
    const record = await artifactService.writeTask(targetRunId, task);
    this._attachArtifactRecord(record);
    this._persistIdcRuntimeState();
    return record;
  }

  private _resolveArtifactWriteContext(runId?: string): {
    artifactService: IArtifactService;
    targetRunId: string;
  } {
    const artifactService = this._artifactService;
    if (!artifactService) {
      throw new Error('ArtifactService is not configured for this session');
    }

    const targetRunId = runId ?? this._runStore?.getActive()?.id ?? null;
    if (!targetRunId) {
      throw new Error('writeArtifact requires an active IDC run or an explicit runId');
    }

    return { artifactService, targetRunId };
  }

  private _attachArtifactRecord(record: AnyArtifactRecord): void {
    const binding = toIdcRunArtifactBinding(record);

    if (record.kind === 'task') {
      this._queueIdcTaskProjection(
        record.runId,
        record.value,
        {
          kind: 'task',
          artifactId: binding.artifactId,
          path: binding.path,
          updatedAt: binding.updatedAt,
        },
        this._getKnownRunStartedAt(record.runId),
      );
    }

    const activeRun = this._runStore?.getActive();
    if (!activeRun || activeRun.id !== record.runId) {
      return;
    }

    switch (record.kind) {
      case 'draft':
        this._runStore?.setDraft(record.value, binding);
        return;
      case 'plan':
        this._runStore?.setPlan(record.value, binding);
        return;
      case 'task':
        this._runStore?.setTask(record.value, binding);
        return;
    }
  }

  private _hydrateRunArtifacts(runId: string): void {
    if (!this._artifactService) {
      return;
    }

    for (const record of this._artifactService.listByRunId(runId)) {
      this._attachArtifactRecord(record);
    }
  }

  private _getKnownRunStartedAt(runId: string): number | undefined {
    const activeRun = this._runStore?.getActive();
    if (activeRun?.id === runId) {
      return activeRun.startedAt;
    }

    const completedRun = this._runStore?.listCompleted().find((run) => run.id === runId);
    return completedRun?.startedAt;
  }

  private _queueArtifactSync(event: ExecutionArtifactWrittenEvent): void {
    this._artifactSyncPending = this._artifactSyncPending
      .then(async () => {
        await this._syncObservedArtifact(event);
      })
      .catch((error) => {
        logger.warn(`artifact sync failed for ${event.path}: ${String(error)}`);
      });
  }

  private _queueIdcTaskProjection(
    runId: string,
    task: Task,
    artifact?: IdcProjectedTaskArtifactBinding,
    runStartedAt?: number,
  ): void {
    const projection = this._idcTaskProjection;
    if (!projection) {
      return;
    }

    this._idcTaskProjectionPending = this._idcTaskProjectionPending
      .then(async () => {
        await projection.syncTask({
          runId,
          ...(runStartedAt !== undefined ? { runStartedAt } : {}),
          task,
          ...(artifact ? { artifact } : {}),
        });
      })
      .catch((error) => {
        logger.warn(`IDC task projection failed for ${runId}: ${String(error)}`);
      });
  }

  private _queueIdcTaskProjectionClear(runId: string, runStartedAt?: number): void {
    const projection = this._idcTaskProjection;
    if (!projection) {
      return;
    }

    this._idcTaskProjectionPending = this._idcTaskProjectionPending
      .then(async () => {
        await projection.clearRun(runId, runStartedAt);
      })
      .catch((error) => {
        logger.warn(`IDC task projection cleanup failed for ${runId}: ${String(error)}`);
      });
  }

  private async _syncObservedArtifact(event: ExecutionArtifactWrittenEvent): Promise<void> {
    if (this._disposed || event.runId === 'unknown') {
      return;
    }

    const artifactService = this._artifactService;
    const existing =
      artifactService === null
        ? null
        : event.kind === 'draft'
          ? artifactService.getByRunId(event.runId, 'draft')
          : event.kind === 'plan'
            ? artifactService.getByRunId(event.runId, 'plan')
            : artifactService.getByRunId(event.runId, 'task');
    const binding = {
      kind: event.kind,
      artifactId: event.artifactId,
      path: event.path,
      updatedAt: existing && existing.path === event.path ? existing.updatedAt : event.at,
    } as const;
    this._runStore?.bindArtifact(binding);

    const workspace = this._config.workspace;
    if (!workspace || typeof workspace.fsOps.readFile !== 'function' || !artifactService) {
      this._persistIdcRuntimeState();
      return;
    }

    const content = await workspace.fsOps.readFile(event.path, 'utf-8');
    if (existing && existing.path === event.path && existing.content === content) {
      this._persistIdcRuntimeState();
      return;
    }

    const record =
      event.kind === 'draft'
        ? artifactService.ingestObservedArtifact({
            kind: 'draft',
            runId: event.runId,
            path: event.path,
            content,
          })
        : event.kind === 'plan'
          ? artifactService.ingestObservedArtifact({
              kind: 'plan',
              runId: event.runId,
              path: event.path,
              content,
            })
          : artifactService.ingestObservedArtifact({
              kind: 'task',
              runId: event.runId,
              path: event.path,
              content,
            });
    this._attachArtifactRecord(record);
    this._persistIdcRuntimeState();
  }

  private _installRuntimeStatePersistence(): void {
    const shouldPersistRuntimeState = this._runtimeStateStore !== null;

    if (this._stageTracker && shouldPersistRuntimeState) {
      this._runtimeStateUnsubscribers.push(
        this._stageTracker.onEntered((event) => {
          this._stageTransitions.push({
            from: event.previous,
            to: event.stage,
            at: event.at,
          });
          if (this._stageTransitions.length > MAX_PERSISTED_STAGE_TRANSITIONS) {
            this._stageTransitions.splice(
              0,
              this._stageTransitions.length - MAX_PERSISTED_STAGE_TRANSITIONS,
            );
          }
          this._persistIdcRuntimeState();
        }),
      );
    }

    if (this._eventBus) {
      this._runtimeStateUnsubscribers.push(
        this._eventBus.on(EXECUTION_CHANNELS.ARTIFACT_WRITTEN, (event) => {
          this._queueArtifactSync(event);
        }),
      );
      if (shouldPersistRuntimeState) {
        this._runtimeStateUnsubscribers.push(
          this._eventBus.on(EXECUTION_CHANNELS.ROUND_ACTIVATION_DECIDED, () => {
            this._persistIdcRuntimeState();
          }),
        );
        this._runtimeStateUnsubscribers.push(
          this._eventBus.on(CREATION_CHANNELS.RUN_ENDED, () => {
            this._persistIdcRuntimeState();
          }),
        );
      }
    }

    if (shouldPersistRuntimeState && !this._runtimeStateRestorePending) {
      this._persistIdcRuntimeState();
    }
  }

  private _persistIdcRuntimeState(): void {
    if (!this._runtimeStateStore) return;
    if (this._runtimeStateRestorePending) return;
    if (this._runtimeStatePersistScheduled) return;

    this._runtimeStatePersistScheduled = true;
    this._runtimeStatePersistTimer = setTimeout(() => {
      this._runtimeStatePersistTimer = null;
      this._runtimeStatePersistScheduled = false;
      this._persistIdcRuntimeStateNow();
    }, IDC_RUNTIME_STATE_DEBOUNCE_MS);
  }

  private _flushPendingRuntimeStatePersist(): void {
    if (!this._runtimeStatePersistScheduled) return;

    if (this._runtimeStatePersistTimer) {
      clearTimeout(this._runtimeStatePersistTimer);
      this._runtimeStatePersistTimer = null;
    }
    this._runtimeStatePersistScheduled = false;
    this._persistIdcRuntimeStateNow();
  }

  private _persistIdcRuntimeStateNow(): void {
    if (!this._runtimeStateStore) return;
    if (this._runtimeStateRestorePending) return;

    const activeRun = this._runStore?.getActive() ?? null;
    const completedRuns = this._runStore?.listCompleted() ?? [];
    const lastCompletedRun =
      completedRuns.length > 0 ? (completedRuns[completedRuns.length - 1] ?? null) : null;

    this._runtimeStateStore.update({
      ...(this._config.conversationId ? { conversationId: this._config.conversationId } : {}),
      stage: {
        current: this._stageTracker?.current ?? null,
        ...(this._stageTracker?.current ? { enteredAt: this._stageTracker.enteredAt } : {}),
        transitions: [...this._stageTransitions],
      },
      run: {
        ...(activeRun ? { active: snapshotIdcRun(activeRun) } : {}),
        ...(lastCompletedRun ? { lastCompleted: snapshotIdcRun(lastCompletedRun) } : {}),
      },
      approval: {
        pending: Array.from(this._pendingConfirmations.values()).map(({ request }) =>
          snapshotPendingApproval(request),
        ),
      },
      feedback: {
        pendingGuidance: this._feedbackGuidanceState ? { ...this._feedbackGuidanceState } : null,
      },
    });
  }

  private _restoreIdcRuntimeState(state: import('../workspace').IdcRuntimeRestoreState): void {
    this._restoreStageRuntimeState(state.stage);
    this._restoreRunState(state.run);
    this._restorePendingApprovals(state.approval);
    this._restoreFeedbackRuntimeState(state.feedback);
    if (this._stagePersonaBinding) {
      void this._stagePersonaBinding.syncCurrent();
    }
  }

  private _restoreStageRuntimeState(
    state: import('../workspace').IdcRuntimeRestoreState['stage'],
  ): void {
    if (!this._stageTracker) {
      return;
    }
    if (
      this._stageTransitions.length > 0 ||
      this._runStore?.getActive() ||
      (this._runStore?.listCompleted().length ?? 0) > 0
    ) {
      return;
    }

    this._stageTransitions = [...state.transitions].slice(-MAX_PERSISTED_STAGE_TRANSITIONS);
    this._stageTracker.restore({
      current: state.current,
      ...(state.enteredAt !== undefined ? { enteredAt: state.enteredAt } : {}),
    });
    this._stageGuardian?.restore({
      current: state.current,
      ...(state.enteredAt !== undefined ? { enteredAt: state.enteredAt } : {}),
      visitedStages: collectVisitedStages(state.transitions, state.current),
    });
  }

  private _restoreRunState(state: import('../workspace').IdcRuntimeRestoreState['run']): void {
    if (!this._runStore) {
      return;
    }
    if (this._runStore.getActive() || this._runStore.listCompleted().length > 0) {
      return;
    }

    const activeCandidate = restoreIdcRunFromSnapshot(
      state.active,
      state.active ? (this._artifactService?.listByRunId(state.active.id) ?? []) : [],
      { markMissingArtifactsStale: Boolean(this._artifactService) },
    );
    const lastCompletedCandidate = restoreIdcRunFromSnapshot(
      state.lastCompleted,
      state.lastCompleted ? (this._artifactService?.listByRunId(state.lastCompleted.id) ?? []) : [],
      { markMissingArtifactsStale: Boolean(this._artifactService) },
    );

    this._runStore.restore({
      ...(activeCandidate && isActiveRunStatus(activeCandidate.status)
        ? { active: activeCandidate }
        : {}),
      completed: [
        ...(lastCompletedCandidate && isTerminalRunStatus(lastCompletedCandidate.status)
          ? [lastCompletedCandidate]
          : []),
        ...(!lastCompletedCandidate &&
        activeCandidate &&
        isTerminalRunStatus(activeCandidate.status)
          ? [activeCandidate]
          : []),
      ],
    });

    this._replayRestoredTaskProjection(activeCandidate);
    this._replayRestoredTaskProjection(lastCompletedCandidate);

    if (lastCompletedCandidate && isTerminalRunStatus(lastCompletedCandidate.status)) {
      this._queueIdcTaskProjectionClear(
        lastCompletedCandidate.id,
        lastCompletedCandidate.startedAt,
      );
    } else if (activeCandidate && isTerminalRunStatus(activeCandidate.status)) {
      this._queueIdcTaskProjectionClear(activeCandidate.id, activeCandidate.startedAt);
    }
  }

  private _restoreFeedbackRuntimeState(
    state: import('../workspace').IdcRuntimeRestoreState['feedback'],
  ): void {
    const activeRun = this._runStore?.getActive() ?? null;
    if (!shouldRestorePersistedFeedbackGuidance(state.pendingGuidance, activeRun)) {
      this._applyFeedbackGuidanceSnapshot(null);
      this._syncSystemPrompt();
      return;
    }

    this._applyFeedbackGuidanceSnapshot(state.pendingGuidance);
    this._syncSystemPrompt();
  }

  private _applyFeedbackGuidanceSnapshot(snapshot: PersistedFeedbackGuidanceSnapshot | null): void {
    this._feedbackGuidanceState = snapshot ? { ...snapshot } : null;
    this._feedbackGuidanceModule.setContent(snapshot?.content ?? null);
  }

  private _setFeedbackGuidanceContent(
    content: string | null,
    sourceRun?: Pick<IdcRun, 'id' | 'startedAt'> | null,
  ): void {
    const trimmed = content?.trim();
    if (!trimmed) {
      this._applyFeedbackGuidanceSnapshot(null);
      return;
    }

    this._applyFeedbackGuidanceSnapshot({
      content: trimmed,
      ...(sourceRun?.id ? { sourceRunId: sourceRun.id } : {}),
      ...(sourceRun?.startedAt !== undefined ? { sourceRunStartedAt: sourceRun.startedAt } : {}),
    });
  }

  private _replayRestoredTaskProjection(run: IdcRun | null): void {
    if (!run?.task) {
      return;
    }

    const artifactBinding = run.artifactBindings?.find((binding) => binding.kind === 'task');
    this._queueIdcTaskProjection(
      run.id,
      run.task,
      artifactBinding
        ? {
            kind: 'task',
            artifactId: artifactBinding.artifactId,
            path: artifactBinding.path,
            updatedAt: artifactBinding.updatedAt,
          }
        : undefined,
      run.startedAt,
    );
  }

  private _restorePendingApprovals(
    state: import('../workspace').PendingApprovalRestoreState,
  ): void {
    for (const pending of state.pending) {
      if (this._pendingConfirmations.has(pending.toolCallId)) {
        continue;
      }

      const restoredDetails = {
        ...pending.details,
        restoredFromRuntimeState: true,
        ...(state.updatedAt !== undefined ? { restoredSnapshotUpdatedAt: state.updatedAt } : {}),
      };

      this._pendingConfirmations.set(pending.toolCallId, {
        source: 'restored',
        request: {
          toolCall: {
            id: pending.toolCallId,
            name: pending.toolName,
            arguments: getRestoredToolArguments(pending.details),
            index: 0,
          },
          action: pending.action,
          description: pending.description,
          details: restoredDetails,
          confirmationToken: pending.confirmationToken,
        },
      });
    }
  }

  private _rebuildFeedbackCoordinator(): void {
    const previous = this._feedbackCoordinator;
    this._feedbackCoordinator =
      this._config.feedbackCoordinator ??
      createFeedbackCoordinator({
        eventBus: this._eventBus,
        stageTracker: this._stageTracker,
        projectMemoryManager: this._config.projectMemoryManager,
        autoMemoryExtraction: this._config.autoMemoryExtraction,
        journalAsSSOT: this._config.journalAsSSOT,
      });

    if (previous && previous !== this._feedbackCoordinator) {
      previous.dispose();
    }
  }

  private _createConfiguredArtifactWatcher(): IArtifactWatcher | null {
    if (!this._eventBus) {
      return null;
    }

    const getRunId = (): string | null => this._runStore?.getActive()?.id ?? null;
    if (this._config.artifactWatcherFactory) {
      return this._config.artifactWatcherFactory({
        eventBus: this._eventBus,
        getRunId,
      });
    }

    if (!this._nekoPaths) {
      return null;
    }

    return createArtifactWatcher({
      paths: this._nekoPaths,
      eventBus: this._eventBus,
      getRunId,
    });
  }

  private _composeRunnerHooks(
    baseHooks: import('@neko/shared').ExecutorHooks,
  ): import('@neko/shared').ExecutorHooks {
    const feedbackHooks = this._feedbackCoordinator?.getBeforeThinkHooks() ?? [];
    return composeBeforeThinkHooks(baseHooks, feedbackHooks);
  }

  private _refreshMemoryRuntime(): void {
    const projectMemory = this._config.projectMemoryManager;
    this._memoryRecall =
      projectMemory && this._config.memoryRecall !== false
        ? new MemoryRecall({ projectMemory })
        : null;
    this._memoryRecallModule.setContent(null);
  }

  private async _updateMemoryRecall(query: string): Promise<void> {
    if (!this._memoryRecall) {
      this._memoryRecallModule.setContent(null);
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

      this._memoryRecallModule.setContent(body);
    } catch (error) {
      this._memoryRecallModule.setContent(null);
      logger.warn('Failed to update memory recall', { error });
    }
  }

  private async _extractProjectMemory(entries: readonly PersistedAgentEvent[]): Promise<void> {
    if (!this._feedbackCoordinator) {
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
      const extraction = await this._feedbackCoordinator.extractMemory({
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

  private _observeToolFeedback(step: AgentStep): void {
    if (!this._feedbackCoordinator || step.type !== 'act' || !step.toolResults) {
      return;
    }

    const activeRunId = this._runStore?.getActive()?.id ?? null;
    for (let i = 0; i < step.toolResults.length; i++) {
      const result = step.toolResults[i] as ObservedToolResult;
      const toolCall = step.toolCalls?.find((candidate) => candidate.id === result.callId);
      const toolCallId = result.callId ?? toolCall?.id ?? `tool-call-${i}`;
      const toolName = resolveObservedToolName(result, toolCall?.name);
      if (!result.success) {
        this._feedbackCoordinator.observe({
          kind: 'tool-failure',
          observedAt: step.timestamp,
          toolCallId,
          toolName,
          error: result.error ?? 'Tool execution failed',
          ...(activeRunId ? { runId: activeRunId } : {}),
        });
        continue;
      }

      const qualityCheckSignal = toQualityCheckFeedbackSignal({
        result,
        toolCallId,
        toolName,
        observedAt: step.timestamp,
        ...(activeRunId ? { runId: activeRunId } : {}),
      });
      if (qualityCheckSignal) {
        this._feedbackCoordinator.observe(qualityCheckSignal);
      }
    }
  }

  private _captureFeedbackCycle(): boolean {
    if (!this._feedbackCoordinator) {
      return false;
    }

    const cycle = this._feedbackCoordinator.evaluatePending({
      currentStage: this._stageTracker?.current ?? null,
      activeRunId: this._runStore?.getActive()?.id ?? null,
    });
    if (!cycle) {
      return false;
    }

    this._feedbackCycles.push(cycle);
    if (this._feedbackCycles.length > MAX_FEEDBACK_CYCLES) {
      this._feedbackCycles.splice(0, this._feedbackCycles.length - MAX_FEEDBACK_CYCLES);
    }
    this._applyFeedbackFlowActions(cycle.actions);
    return cycle.actions.length > 0;
  }

  private _markProcessedMemoryEventIds(eventIds: readonly string[]): void {
    for (const eventId of eventIds) {
      this._processedMemoryEventIds.add(eventId);
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
    this._applyPromptModuleSync(this._artifactSchemaModule);
    this._applyPromptModuleSync(this._feedbackGuidanceModule);
    this._applyPromptModuleSync(this._memoryRecallModule);

    this._creativeVersionLogModule.setSummary(
      this._versionLog.size > 0 ? this._versionLog.toSummary() : null,
    );
    this._applyPromptModuleSync(this._creativeVersionLogModule);

    // Compose both flat text and structured sections
    const structured = this._promptComposer.composeStructured();
    if (this._history.length > 0 && this._history[0]?.role === 'system') {
      this._history[0].content = structured.text;
      if (this._historyEventIds.length === 0) {
        this._historyEventIds = this._history.map(() => []);
      }
      this._historyEventIds[0] = [];
    }

    // Push cache-boundary sections to executor for provider-specific caching
    if (this._executor && structured.sections.length > 0) {
      this._executor.updateServiceOptions({
        systemPromptSections: structured.sections,
      });
    }
  }

  private _applyPromptModuleSync(module: PromptModule): void {
    this._promptModuleOrchestrator.applyOneSync(module, this._promptContextProvider());
  }

  private _applyFeedbackFlowActions(
    actions: readonly import('../feedback').FeedbackFlowAction[],
  ): void {
    if (actions.length === 0) {
      return;
    }

    const activeRun = this._runStore?.getActive() ?? null;
    const guidanceBlocks: string[] = [];
    let requestedClear = false;
    for (const action of actions) {
      if (action.kind === 'set-guidance') {
        guidanceBlocks.push(action.guidance);
        continue;
      }
      if (action.kind === 'escalate-user') {
        guidanceBlocks.push(
          `- Escalate to the user: ${action.message} ` + `(repeat count: ${action.repeatCount}).`,
        );
        continue;
      }
      if (action.kind === 'clear-guidance') {
        requestedClear = true;
      }
    }

    if (guidanceBlocks.length > 0) {
      this._setFeedbackGuidanceContent(guidanceBlocks.join('\n'), activeRun);
    } else if (requestedClear) {
      this._setFeedbackGuidanceContent(null);
    }
  }

  private _rebuildExecutor(): void {
    const permissionMode: PermissionMode =
      this._executionMode === 'plan' ? 'plan' : this._executionMode === 'auto' ? 'auto' : 'ask';

    const { executor, permissionHooks } = createConfiguredExecutor({
      config: this._config,
      permissionMode,
      compressor: this._compressor,
      toolGroupRegistry: this._toolGroupRegistry,
      toolInjectionManager: this._toolInjectionManager,
      onToolConfirmation: (request) => this._handleToolConfirmation(request),
    });

    this._permissionHooks = permissionHooks;
    this._executor = executor;

    // Dual-flow: re-register the ReAct-loop runner on the fresh executor.
    if (this._runnerHooks) {
      this._executor.addHook(this._runnerHooks);
    }
  }

  private _handleToolConfirmation(request: ToolConfirmationRequest): void {
    const toolCallId = request.toolCall.id;
    // Store pending confirmation (resolve is handled by onConfirmTool callback)
    this._pendingConfirmations.set(toolCallId, { source: 'live', request });
    this._persistIdcRuntimeState();

    void this._resolveToolConfirmation(request);
  }

  /**
   * Resolve a tool confirmation request. When the approval engine is
   * live (stageTracking configured), consult it first; only fall through to
   * the user's onConfirmTool callback on 'escalate' or no-decision
   * cases where a user prompt is still warranted.
   */
  private async _resolveToolConfirmation(request: ToolConfirmationRequest): Promise<void> {
    const toolCallId = request.toolCall.id;

    // Consult the approval engine if wired. Permission-channel requests
    // always belong to the imperative paradigm (Implement-stage tool calls).
    if (this._approvalEngine && this._stageTracker) {
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
        logger.warn('Approval engine threw; falling back to user onConfirmTool', {
          error: err,
        });
      }
    }

    // Fallback: existing user callback path.
    if (!this._config.onConfirmTool) {
      // No user prompt + no decisive engine answer → safe default: reject.
      this.confirmTool(toolCallId, false);
      return;
    }
    try {
      const approved = await this._config.onConfirmTool(request);
      this.confirmTool(toolCallId, approved);
    } catch (err) {
      this.confirmTool(toolCallId, false);
      logger.error('Tool confirmation failed', { error: err });
    }
  }

  private async _applyCompressionResult(
    result: ConversationCompressionResult,
    trigger: 'token_threshold' | 'turn_threshold' | 'manual',
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
            strategy: this._config.creativeCompression ? 'creative-priority' : 'basic',
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
  }

  private async _logCompactionFailure(
    trigger: 'token_threshold' | 'turn_threshold' | 'manual',
    reason: string,
    failureCount: number,
  ): Promise<void> {
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
    return this._config.journalAsSSOT !== false && this._config.compactLogging !== false;
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

function snapshotIdcRun(run: IdcRun): import('../workspace').PersistedIdcRunSnapshot {
  const lastRound = run.rounds.length > 0 ? run.rounds[run.rounds.length - 1] : undefined;

  return {
    id: run.id,
    runKind: run.runKind,
    workflowId: run.workflowId,
    status: run.status,
    createdAt: run.createdAt,
    ...(run.startedAt !== undefined ? { startedAt: run.startedAt } : {}),
    ...(run.endedAt !== undefined ? { endedAt: run.endedAt } : {}),
    roundCount: run.rounds.length,
    ...(run.rounds.length > 0 ? { rounds: [...run.rounds] } : {}),
    ...(lastRound ? { lastRound } : {}),
    ...(run.artifactBindings && run.artifactBindings.length > 0
      ? {
          artifacts: run.artifactBindings.map((binding) => ({
            kind: binding.kind,
            artifactId: binding.artifactId,
            path: binding.path,
            updatedAt: binding.updatedAt,
            ...(binding.stale === true ? { stale: true } : {}),
          })),
        }
      : {}),
    ...(run.task
      ? {
          task: {
            id: run.task.id,
            counts: countTaskStatuses(run.task.items),
          },
        }
      : {}),
    ...(run.error
      ? {
          error: {
            code: run.error.code,
            message: run.error.message,
            ...(run.error.cause !== undefined
              ? { cause: toSerializableErrorCause(run.error.cause) }
              : {}),
          },
        }
      : {}),
  };
}

function snapshotPendingApproval(
  request: ToolConfirmationRequest,
): import('../workspace').PendingApprovalSnapshot {
  return {
    channel: 'permission',
    confirmationToken: request.confirmationToken,
    toolCallId: request.toolCall.id,
    toolName: request.toolCall.name,
    action: request.action,
    description: request.description,
    details: stripRestoredPendingApprovalDetails(request.details),
  };
}

function getRestoredToolArguments(details: Record<string, unknown>): Record<string, unknown> {
  const raw = details['arguments'];
  return typeof raw === 'object' && raw !== null ? { ...(raw as Record<string, unknown>) } : {};
}

function stripRestoredPendingApprovalDetails(
  details: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...details };
  delete next['restoredFromRuntimeState'];
  delete next['restoredSnapshotUpdatedAt'];
  return next;
}

function shouldRestorePersistedFeedbackGuidance(
  guidance: PersistedFeedbackGuidanceSnapshot | null,
  activeRun: Pick<IdcRun, 'id' | 'startedAt'> | null,
): boolean {
  if (!guidance) {
    return false;
  }
  if (!guidance.sourceRunId) {
    return true;
  }
  if (!activeRun || activeRun.id !== guidance.sourceRunId) {
    return false;
  }
  if (guidance.sourceRunStartedAt === undefined) {
    return true;
  }

  return activeRun.startedAt === guidance.sourceRunStartedAt;
}

function restoreIdcRunFromSnapshot(
  snapshot: import('../workspace').PersistedIdcRunSnapshot | undefined,
  records: readonly AnyArtifactRecord[],
  options: {
    markMissingArtifactsStale?: boolean;
  } = {},
): IdcRun | null {
  if (!snapshot) {
    return null;
  }
  const runKind = snapshot.runKind ?? snapshot.workflowId;
  if (!runKind) {
    return null;
  }

  const artifactBindings = mergeRestoredArtifactBindings(snapshot.artifacts, records, options);
  const draftRecord = records.find((record) => record.kind === 'draft');
  const planRecord = records.find((record) => record.kind === 'plan');
  const taskRecord = records.find((record) => record.kind === 'task');

  return {
    id: snapshot.id,
    runKind,
    workflowId: snapshot.workflowId ?? runKind,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    ...(snapshot.startedAt !== undefined ? { startedAt: snapshot.startedAt } : {}),
    ...(snapshot.endedAt !== undefined ? { endedAt: snapshot.endedAt } : {}),
    rounds:
      snapshot.rounds && snapshot.rounds.length > 0
        ? [...snapshot.rounds]
        : snapshot.lastRound
          ? [snapshot.lastRound]
          : [],
    ...(artifactBindings.length > 0 ? { artifactBindings } : {}),
    ...(draftRecord?.kind === 'draft' ? { draft: draftRecord.value } : {}),
    ...(planRecord?.kind === 'plan' ? { plan: planRecord.value } : {}),
    ...(taskRecord?.kind === 'task' ? { task: taskRecord.value } : {}),
    ...(snapshot.error ? { error: { ...snapshot.error } } : {}),
  };
}

function mergeRestoredArtifactBindings(
  snapshotBindings: import('../workspace').PersistedIdcRunSnapshot['artifacts'] | undefined,
  records: readonly AnyArtifactRecord[],
  options: {
    markMissingArtifactsStale?: boolean;
  } = {},
): readonly NonNullable<IdcRun['artifactBindings']>[number][] {
  const merged: NonNullable<IdcRun['artifactBindings']>[number][] = [];
  const recordKinds = new Set(records.map((record) => record.kind));

  for (const binding of snapshotBindings ?? []) {
    upsertRestoredArtifactBinding(
      merged,
      options.markMissingArtifactsStale === true && !recordKinds.has(binding.kind)
        ? { ...binding, stale: true }
        : binding,
    );
  }
  for (const record of records) {
    upsertRestoredArtifactBinding(merged, toIdcRunArtifactBinding(record));
  }

  return merged;
}

function upsertRestoredArtifactBinding(
  target: NonNullable<IdcRun['artifactBindings']>[number][],
  binding: NonNullable<IdcRun['artifactBindings']>[number],
): void {
  const existingIndex = target.findIndex((entry) => entry.kind === binding.kind);
  if (existingIndex >= 0) {
    target.splice(existingIndex, 1, binding);
  } else {
    target.push(binding);
  }

  target.sort(
    (left, right) => restoredArtifactKindOrder(left.kind) - restoredArtifactKindOrder(right.kind),
  );
}

function restoredArtifactKindOrder(
  kind: NonNullable<IdcRun['artifactBindings']>[number]['kind'],
): number {
  switch (kind) {
    case 'draft':
      return 0;
    case 'plan':
      return 1;
    case 'task':
      return 2;
  }
}

function collectVisitedStages(
  transitions: readonly import('../workspace').IdcRuntimeStageTransition[],
  current: IdcStage | null,
): readonly IdcStage[] {
  const visited: IdcStage[] = [];
  const push = (stage: IdcStage | null) => {
    if (!stage || visited.includes(stage)) {
      return;
    }
    visited.push(stage);
  };

  for (const transition of transitions) {
    push(transition.from);
    push(transition.to);
  }
  push(current);

  return visited;
}

function isActiveRunStatus(status: IdcRun['status']): status is 'pending' | 'running' {
  return status === 'pending' || status === 'running';
}

function isTerminalRunStatus(
  status: IdcRun['status'],
): status is 'completed' | 'aborted' | 'failed' {
  return status === 'completed' || status === 'aborted' || status === 'failed';
}

function countTaskStatuses(
  items: NonNullable<IdcRun['task']>['items'],
): NonNullable<import('../workspace').PersistedIdcRunSnapshot['task']>['counts'] {
  const counts = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    failed: 0,
  };

  for (const item of items) {
    switch (item.status) {
      case 'pending':
        counts.pending += 1;
        break;
      case 'in_progress':
        counts.in_progress += 1;
        break;
      case 'completed':
        counts.completed += 1;
        break;
      case 'failed':
        counts.failed += 1;
        break;
    }
  }

  return counts;
}

function resolveArtifactService(config: AgentSessionConfig): IArtifactService | null {
  if (config.artifactService) {
    return config.artifactService;
  }

  const workspace = config.workspace;
  if (!workspace || typeof workspace.fsOps.writeFile !== 'function') {
    return null;
  }

  return createWorkspaceArtifactService({
    workspaceRoot: workspace.root,
    fsOps: {
      mkdir: workspace.fsOps.mkdir.bind(workspace.fsOps),
      writeFile: workspace.fsOps.writeFile.bind(workspace.fsOps),
    },
  });
}

interface ObservedToolResult {
  readonly callId?: string;
  readonly name?: string;
  readonly success: boolean;
  readonly data?: unknown;
  readonly error?: string;
}

interface QualityCheckEvaluationSummary {
  readonly index: number;
  readonly passed: boolean;
  readonly finalScore: number;
  readonly remediations?: readonly unknown[];
}

interface QualityCheckFeedbackPayload {
  readonly totalScenes: number;
  readonly passed: number;
  readonly failed: number;
  readonly evaluations: readonly QualityCheckEvaluationSummary[];
}

function resolveObservedToolName(result: ObservedToolResult, fallbackName?: string): string {
  return result.name ?? fallbackName ?? 'unknown-tool';
}

function toQualityCheckFeedbackSignal(input: {
  readonly result: ObservedToolResult;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly observedAt: number;
  readonly runId?: string;
}): import('../feedback').FeedbackSignal | null {
  if (input.toolName !== 'QualityCheck' || !isQualityCheckFeedbackPayload(input.result.data)) {
    return null;
  }

  const failingSceneIndexes = input.result.data.evaluations
    .filter((evaluation) => !evaluation.passed)
    .map((evaluation) => evaluation.index);
  const remediationCount = input.result.data.evaluations.reduce((count, evaluation) => {
    return count + (evaluation.remediations?.length ?? 0);
  }, 0);

  return {
    kind: 'quality-check',
    observedAt: input.observedAt,
    toolCallId: input.toolCallId,
    toolName: 'QualityCheck',
    totalScenes: input.result.data.totalScenes,
    passed: input.result.data.passed,
    failed: input.result.data.failed,
    failingSceneIndexes,
    remediationCount,
    ...(input.runId ? { runId: input.runId } : {}),
  };
}

function isQualityCheckFeedbackPayload(value: unknown): value is QualityCheckFeedbackPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    isFiniteNumber(candidate['totalScenes']) &&
    isFiniteNumber(candidate['passed']) &&
    isFiniteNumber(candidate['failed']) &&
    Array.isArray(candidate['evaluations']) &&
    candidate['evaluations'].every(isQualityCheckEvaluationSummary)
  );
}

function isQualityCheckEvaluationSummary(value: unknown): value is QualityCheckEvaluationSummary {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    isFiniteNumber(candidate['index']) &&
    typeof candidate['passed'] === 'boolean' &&
    isFiniteNumber(candidate['finalScore']) &&
    (candidate['remediations'] === undefined || Array.isArray(candidate['remediations']))
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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
