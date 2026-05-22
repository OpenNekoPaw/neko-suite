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
  AgentTraceContext,
  ChatMessage,
  CompressedMessage,
  ConversationCompressionResult,
  PromptFragment,
  Skill,
  SubagentReviewResult,
  ToolName,
  Tool,
} from '@neko/shared';
import {
  createAgentTraceContext,
  createAgentTurnId,
  deriveAgentTraceContext,
  withAgentTrace,
} from '@neko/shared';
import {
  CREATION_CHANNELS,
  EXECUTION_CHANNELS,
  type Draft,
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
  ToolResultPatchResult,
} from './types';

import type { ToolConfirmationRequest } from '../permission/types';
import { PLAN_MODE_SYSTEM_REMINDER } from '../permission/types';

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
  createQualityReviewEvidence,
  type IFeedbackCoordinator,
} from '../feedback';
import {
  CHARACTER_INCONSISTENCY_FAIL_SCORE,
  STYLE_DRIFT_COLOR_POP_THRESHOLD,
  type QualityEvidenceSceneTimeRange,
  type QualityEvidenceTimeRange,
} from '../validation/quality-evidence-normalizer';
import { createDefaultControlPlane, type StageTransitionGuidance } from '../control-plane';
import {
  applyToolResultBackfillToChatHistory,
  projectPersistedEventsToWorkingMemory,
  type PersistedAgentEvent,
} from './working-memory';
import { getLogger } from '../utils/logger';
import { toSerializableErrorCause } from '../utils/serializable-error';
import {
  initializeSession,
  createConfiguredExecutor,
  DEFAULT_MAX_ITERATIONS,
} from './agent-session-initializer';
import { SessionPersistence } from './session-persistence';
import { IdcRunLifecycle } from './idc-run-lifecycle';
import { SessionArtifactFacade } from './session-artifact-facade';
import { FeedbackRuntimeBridge } from './feedback-runtime-bridge';
import { PromptRuntimeFacade } from './prompt-runtime-facade';
import {
  createWorkspaceArtifactService,
  type AnyArtifactRecord,
  toIdcRunArtifactBinding,
  type ArtifactRecord,
  type IArtifactService,
} from '../runtime/artifact-service';
import { createAgentObservationRecorder } from '../runtime/agent-observation-recorder';
import {
  classifyIdcEntrySignal,
  classifyIdcTaskShape,
  resolveIdcRunKind,
  type IdcTurnPlanningContext,
} from './idc-turn-planning';

const logger = getLogger('AgentSession');

function getAgentSessionLogger() {
  return getLogger('AgentSession');
}

// =============================================================================
// Constants
// =============================================================================

const MAX_PERSISTED_STAGE_TRANSITIONS = 32;
const MAX_FEEDBACK_CYCLES = 32;
const IDC_RUNTIME_STATE_DEBOUNCE_MS = 200;

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
  // stage is reached.
  private _stageTracker: StageTracker | null = null;
  private _stagePersonaBinding: IStagePersonaBinding | null = null;
  /** Non-blocking inspector that rides alongside the tracker (ADR §6.5). */
  private _stageGuardian: IStageGuardian | null = null;

  // ReAct-loop stage-activation orchestrator.
  private _runStore: IIdcRunStore | null = null;
  private _idcRunLifecycle: IdcRunLifecycle;
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
  private _sessionPersistence: SessionPersistence;
  private _artifactFacade: SessionArtifactFacade;
  private _feedbackRuntime: FeedbackRuntimeBridge;
  private _promptRuntime!: PromptRuntimeFacade;
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
  private _controlPlane: import('../control-plane').IControlPlane | null = null;
  private _operationToolAdapterRegistry:
    | import('@neko/shared').IOperationToolAdapterRegistry
    | null = null;
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

  /**
   * Ablation marker (set when the session was constructed via
   * applyAblationToggles). Session-side consumers: SkillInjectionCoordinator
   * gate (via enableInjection) and dispose-time SkillService restore.
   */
  private _ablationMarker?: import('../experiment/apply-toggles').AblationMarkerHook;

  constructor(config: AgentSessionConfig) {
    this._config = config;
    this._executionMode = config.executionMode ?? 'auto';
    this._sessionPersistence = new SessionPersistence({
      debounceMs: IDC_RUNTIME_STATE_DEBOUNCE_MS,
      buildSnapshot: () => this._buildIdcRuntimeStateSnapshot(),
      onWarn: (message, data) => logger.warn(message, data),
    });
    this._artifactFacade = new SessionArtifactFacade({
      ports: {
        run: {
          getActiveRun: () => this._runStore?.getActive() ?? null,
          getCompletedRuns: () => this._runStore?.listCompleted() ?? [],
          setDraft: (draft, binding) => this._runStore?.setDraft(draft, binding),
          setPlan: (plan, binding) => this._runStore?.setPlan(plan, binding),
          setTask: (task, binding) => this._runStore?.setTask(task, binding),
          bindArtifact: (binding) => this._runStore?.bindArtifact(binding),
        },
        workspace: {
          getWorkspaceReadFile: () => {
            const readFile = this._config.workspace?.fsOps.readFile;
            return readFile
              ? (path: string) => readFile.call(this._config.workspace!.fsOps, path, 'utf-8')
              : null;
          },
          isDisposed: () => this._disposed,
        },
        persistence: {
          onPersist: () => this._persistIdcRuntimeState(),
          onWarn: (message, data) => logger.warn(message, data),
        },
      },
    });
    this._feedbackRuntime = new FeedbackRuntimeBridge({
      maxCycles: MAX_FEEDBACK_CYCLES,
      ports: {
        feedback: {
          getCoordinator: () => this._feedbackCoordinator,
          isRecoveryGuidanceDisabled: () =>
            this._ablationMarker?.disableAgentFirstRecoveryGuidance === true,
        },
        control: {
          getControlPlane: () => this._controlPlane,
          getCurrentStage: () => this._stageTracker?.current ?? null,
          getActiveRun: () => this._runStore?.getActive() ?? null,
          recordStageTransition: (input) => this._recordFeedbackStageTransition(input),
        },
        prompt: {
          setGuidanceContent: (content) => this._promptRuntime.setFeedbackGuidanceContent(content),
          syncSystemPrompt: () => this._syncSystemPrompt(),
        },
        diagnostics: {
          debug: (message, data) => logger.debug(message, data),
        },
      },
    });
    this._idcRunLifecycle = new IdcRunLifecycle({
      maxPersistedStageTransitions: MAX_PERSISTED_STAGE_TRANSITIONS,
      ports: {
        runtime: {
          getRunStore: () => this._runStore,
          getStageTracker: () => this._stageTracker,
          getStageGuardian: () => this._stageGuardian,
          onPersist: () => this._persistIdcRuntimeState(),
        },
        artifacts: {
          hasArtifactService: () => this._artifactFacade.hasArtifactService,
          listArtifactsByRunId: (runId) => this._artifactFacade.getRecordsForRun(runId),
          hydrateRunArtifacts: (runId) => this._artifactFacade.hydrateRunArtifacts(runId),
          queueTaskProjectionClear: (runId, runStartedAt) =>
            this._artifactFacade.queueTaskProjectionClear(runId, runStartedAt),
          replayRestoredTaskProjection: (run) =>
            this._artifactFacade.replayRestoredTaskProjection(run),
        },
        restore: {
          restoreRunFromSnapshot: restoreIdcRunFromSnapshot,
          isActiveRunStatus,
          isTerminalRunStatus,
        },
      },
    });

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
    this._promptRuntime = new PromptRuntimeFacade({
      ports: {
        composer: {
          promptComposer: this._promptComposer,
          promptModuleOrchestrator: this._promptModuleOrchestrator,
          promptContextProvider: this._promptContextProvider,
        },
        modules: {
          artifactSchemaModule: this._artifactSchemaModule,
          feedbackGuidanceModule: this._feedbackGuidanceModule,
          memoryRecallModule: this._memoryRecallModule,
          creativeVersionLogModule: this._creativeVersionLogModule,
          subpackageFragmentsModule: this._subpackageFragmentsModule,
        },
        executor: {
          getExecutor: () => this._executor,
          getCreativeVersionSummary: () =>
            this._versionLog.size > 0 ? this._versionLog.toSummary() : null,
        },
        diagnostics: {
          debug: (message, data) => getAgentSessionLogger().debug(message, data),
        },
      },
    });
    this._refreshMemoryRuntime();
    if (components.ablationMarker) {
      this._ablationMarker = components.ablationMarker;
    }

    // Journal writer for session persistence
    if (config.journalWriter) {
      this._journalWriter = config.journalWriter;
    }
    this._controlPlane = config.controlPlane ?? createDefaultControlPlane();
    this._operationToolAdapterRegistry = config.operationToolAdapterRegistry ?? null;

    this._artifactFacade.setArtifactService(resolveArtifactService(config));
    this._artifactFacade.setTaskProjection(config.idcTaskProjection ?? null);
    this._artifactFacade.scheduleRestore();

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
      // Fallback keeps the workspace-backed watcher alive.
      this._artifactWatcher = this._createConfiguredArtifactWatcher();
      void this._artifactWatcher?.start();

      if (
        this._nekoPaths &&
        config.workspace &&
        typeof config.workspace.fsOps.writeFile === 'function'
      ) {
        this._sessionPersistence.setStore(
          createIdcRuntimeStateStore({
            filePath: this._nekoPaths.state('idcRuntime'),
            fsOps: {
              mkdir: config.workspace.fsOps.mkdir,
              writeFile: config.workspace.fsOps.writeFile.bind(config.workspace.fsOps),
            },
          }),
        );
      }

      if (
        this._nekoPaths &&
        config.workspace &&
        typeof config.workspace.fsOps.readFile === 'function'
      ) {
        const runtimeStateRead = readIdcRuntimeState({
          filePath: this._nekoPaths.state('idcRuntime'),
          fsOps: {
            readFile: config.workspace.fsOps.readFile.bind(config.workspace.fsOps),
          },
        });
        this._sessionPersistence.restoreFrom(
          Promise.all([this._artifactFacade.whenRestoreReady(), runtimeStateRead]).then(
            ([, restored]) => restored,
          ),
          (restored) => {
            if (!this._disposed) {
              this._restoreIdcRuntimeState(restored);
            }
          },
          () => !this._disposed,
        );
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
    this._config = { ...this._config, ...config };
    if (config.artifactService !== undefined || config.workspace !== undefined) {
      this._artifactFacade.setArtifactService(resolveArtifactService(this._config));
      this._artifactFacade.scheduleRestore();
    }
    if (config.idcTaskProjection !== undefined) {
      this._artifactFacade.setTaskProjection(config.idcTaskProjection ?? null);
    }
    if (config.controlPlane !== undefined) {
      this._controlPlane = config.controlPlane ?? null;
    }
    if (config.operationToolAdapterRegistry !== undefined) {
      this._operationToolAdapterRegistry = config.operationToolAdapterRegistry ?? null;
    }

    // Update execution mode if changed
    if (config.executionMode !== undefined) {
      this._executionMode = config.executionMode;
    }

    // Update system prompt in history if changed
    if (config.systemPrompt !== undefined) {
      this._promptRuntime.setBasePrompt(config.systemPrompt);
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
    this._promptRuntime.setPromptFragments(fragments);
    this._syncSystemPrompt();
  }

  getArtifactsForRun(runId?: string): readonly ArtifactRecord[] {
    const targetRunId = runId ?? this._runStore?.getActive()?.id ?? null;
    if (!targetRunId) {
      return [];
    }

    return this._artifactFacade.getRecordsForRun(targetRunId);
  }

  listArtifactRunIds(): readonly string[] {
    return this._artifactFacade.listRunIds();
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
    return this._feedbackRuntime.cycles;
  }

  getOperationToolAdapterRegistry(): import('@neko/shared').IOperationToolAdapterRegistry | null {
    return this._operationToolAdapterRegistry;
  }

  async recordSubagentReviewResult(result: SubagentReviewResult): Promise<void> {
    if (!this._feedbackCoordinator) {
      return;
    }

    const activeRun = this._runStore?.getActive() ?? null;
    this._feedbackCoordinator.observe({
      kind: 'subagent-review',
      observedAt: result.createdAt,
      review: result,
      ...(activeRun?.id ? { runId: activeRun.id } : {}),
    });

    if (!this._ablationMarker?.disableAgentFirstToolEvidence) {
      await Promise.all(result.evidence.map((evidence) => this._recordAgentEvidence(evidence)));
    }

    await this._captureFeedbackCycle();
  }

  writeDraftArtifact(draft: Draft, options?: { runId?: string }): Promise<ArtifactRecord<'draft'>> {
    return this._artifactFacade.writeDraft(draft, options?.runId);
  }

  writePlanArtifact(
    plan: ExecutionPlan,
    options?: { runId?: string },
  ): Promise<ArtifactRecord<'plan'>> {
    return this._artifactFacade.writePlan(plan, options?.runId);
  }

  writeTaskArtifact(task: Task, options?: { runId?: string }): Promise<ArtifactRecord<'task'>> {
    return this._artifactFacade.writeTask(task, options?.runId);
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
    const turnStartedAt = Date.now();
    let runCompletionStatus: 'completed' | 'failed' = 'completed';
    let runCompletionError: IdcRun['error'] | undefined;
    let trace = createAgentTraceContext({
      conversationId: this._config.conversationId,
      turnId: createAgentTurnId(this._config.conversationId ?? 'unknown', turnStartedAt),
      phase: 'session',
    });
    let iteration = 0;
    const hadPendingFeedbackGuidance = this._feedbackRuntime.hasGuidance();
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
      trace = deriveAgentTraceContext(trace, {
        runId: this._runStore?.getActive()?.id ?? null,
        phase: 'session',
      });
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

      feedbackGuidanceAdjustedThisTurn =
        (await this._captureFeedbackCycle(trace)) || feedbackGuidanceAdjustedThisTurn;
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
          conversationId: trace.conversationId,
          runId: trace.runId,
          turnId: trace.turnId,
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

          this._observeToolFeedback(step, trace);
          feedbackGuidanceAdjustedThisTurn =
            (await this._captureFeedbackCycle(trace)) || feedbackGuidanceAdjustedThisTurn;
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
          const compactionTrace = deriveAgentTraceContext(trace, { phase: 'compaction' });
          logger.debug(
            'neko.agent.context_compaction.check',
            withAgentTrace(compactionTrace, {
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
          if (
            compactResult.compressed &&
            compactResult.compressionResult &&
            compactResult.trigger
          ) {
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
                trigger: compactResult.trigger,
                skipReason: compactResult.skipReason,
                tokens,
                consecutiveFailures: this._compactState.consecutiveFailures,
                circuitOpen: this._compactState.isCircuitOpen,
              }),
            );
          }
        }
      }

      await this._extractProjectMemory(turnPersistedEvents);
      feedbackGuidanceAdjustedThisTurn =
        (await this._captureFeedbackCycle(trace)) || feedbackGuidanceAdjustedThisTurn;

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
      yield errorEvent;
      await this._persistTerminalJournalEvent(errorEvent);
    } finally {
      this._closeActiveRun(runCompletionStatus, runCompletionError);
      this._currentTurnPlanningContext = null;
      this._promptRuntime.setMemoryRecallContent(null);
      if (!feedbackGuidanceAdjustedThisTurn && hadPendingFeedbackGuidance) {
        this._feedbackRuntime.clearGuidance();
      }
      this._syncSystemPrompt();
      this._persistIdcRuntimeState();
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
    return this._idcRunLifecycle.startRun(runKind, runId);
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
    await this._artifactFacade.whenRestoreReady();
    await this._sessionPersistence.whenRestoreReady();
    this._sessionPersistence.flushPending();
    await Promise.all([
      this._eventSink ? this._eventSink.flush() : Promise.resolve(),
      this._sessionPersistence.flush(),
      this._auditsSink ? this._auditsSink.flush() : Promise.resolve(),
      this._stepsSink ? this._stepsSink.flush() : Promise.resolve(),
      this._artifactFacade.flush(),
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
    this._feedbackRuntime.reset();
    this._promptRuntime.setMemoryRecallContent(null);
    this._syncSystemPrompt();
    // Rebuild from composer to preserve current prompt composition
    this._history = [{ role: 'system', content: this._promptRuntime.composeText() }];
    this._historyEventIds = [[]];
    this._persistIdcRuntimeState();
  }

  loadHistory(messages: ChatMessage[], messageEventIds?: readonly (readonly string[])[]): void {
    this._history = [...messages];
    this._historyEventIds = normalizeMessageEventIds(this._history, messageEventIds);
    this._processedMemoryEventIds = new Set();
    this._feedbackRuntime.reset();
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
    const trace = createAgentTraceContext({
      conversationId: this._config.conversationId,
      runId: this._runStore?.getActive()?.id ?? null,
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
    this._sessionPersistence.flushPending();
    this._sessionPersistence.dispose();
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
    this._controlPlane = null;
    this._operationToolAdapterRegistry = null;
    this._nekoPaths = null;
    this._eventBus?.clear();
    this._eventBus = null;
    this._autohealChain = null;
    this._approvalEngine = null;
    this._reactLoopBaseHooks = null;
    this._artifactFacade.dispose();
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private _closeActiveRun(
    status: 'completed' | 'failed' | 'aborted',
    error?: IdcRun['error'],
  ): void {
    this._idcRunLifecycle.closeActiveRun(status, error);
  }

  private async _persistTerminalJournalEvent(event: AgentEvent): Promise<void> {
    if (!this._journalWriter) {
      return;
    }

    try {
      await this._journalWriter.appendEvent(++this._journalSeq, event);
      await this._journalWriter.appendSnapshot(++this._journalSeq, {
        historyLength: this._history.length,
        executionMode: this._executionMode,
        versionLogSize: this._versionLog.size,
      });
      await this._journalWriter.flush();
    } catch (error) {
      logger.warn('Failed to persist terminal session journal event', {
        eventType: event.type,
        error,
      });
    }
  }

  private _installRuntimeStatePersistence(): void {
    const shouldPersistRuntimeState = this._sessionPersistence.hasStore;

    if (this._stageTracker && shouldPersistRuntimeState) {
      this._sessionPersistence.addUnsubscriber(
        this._stageTracker.onEntered((event) => {
          this._idcRunLifecycle.recordStageTransition(event);
        }),
      );
    }

    if (this._eventBus) {
      this._sessionPersistence.addUnsubscriber(
        this._eventBus.on(EXECUTION_CHANNELS.ARTIFACT_WRITTEN, (event) => {
          this._artifactFacade.queueObservedArtifactSync(event);
        }),
      );
      if (shouldPersistRuntimeState) {
        this._sessionPersistence.addUnsubscriber(
          this._eventBus.on(EXECUTION_CHANNELS.ROUND_ACTIVATION_DECIDED, () => {
            this._persistIdcRuntimeState();
          }),
        );
        this._sessionPersistence.addUnsubscriber(
          this._eventBus.on(CREATION_CHANNELS.RUN_ENDED, () => {
            this._persistIdcRuntimeState();
          }),
        );
      }
    }

    if (shouldPersistRuntimeState && !this._sessionPersistence.isRestorePending) {
      this._persistIdcRuntimeState();
    }
  }

  private _persistIdcRuntimeState(): void {
    this._sessionPersistence.schedule();
  }

  private _buildIdcRuntimeStateSnapshot(): import('../workspace').IdcRuntimeStateInput | null {
    const activeRun = this._runStore?.getActive() ?? null;
    const completedRuns = this._runStore?.listCompleted() ?? [];
    const lastCompletedRun =
      completedRuns.length > 0 ? (completedRuns[completedRuns.length - 1] ?? null) : null;

    return {
      ...(this._config.conversationId ? { conversationId: this._config.conversationId } : {}),
      stage: {
        current: this._stageTracker?.current ?? null,
        ...(this._stageTracker?.current ? { enteredAt: this._stageTracker.enteredAt } : {}),
        transitions: [...this._idcRunLifecycle.stageTransitions],
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
        pendingGuidance: this._feedbackRuntime.guidanceSnapshot,
      },
    };
  }

  private _restoreIdcRuntimeState(state: import('../workspace').IdcRuntimeRestoreState): void {
    this._idcRunLifecycle.restore(state);
    this._restorePendingApprovals(state.approval);
    this._feedbackRuntime.restore(state.feedback);
    if (this._stagePersonaBinding) {
      void this._stagePersonaBinding.syncCurrent();
    }
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
    const providerCardProject = this._ablationMarker?.disableProviderCardAutoEvolve
      ? undefined
      : createProviderCardProjectConfig(this._config.workspace);
    this._feedbackCoordinator =
      this._config.feedbackCoordinator ??
      createFeedbackCoordinator({
        eventBus: this._eventBus,
        stageTracker: this._stageTracker,
        projectMemoryManager: this._config.projectMemoryManager,
        autoMemoryExtraction: this._config.autoMemoryExtraction,
        ...(this._config.feedbackControlPolicy
          ? { controlPolicy: this._config.feedbackControlPolicy }
          : {}),
        ...(providerCardProject ? { providerCardProject } : {}),
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

  private _observeToolFeedback(step: AgentStep, trace?: AgentTraceContext): void {
    if (!this._feedbackCoordinator || step.type !== 'act' || !step.toolResults) {
      return;
    }

    const activeRunId = this._runStore?.getActive()?.id ?? null;
    const feedbackTrace = deriveAgentTraceContext(trace, {
      ...(activeRunId ? { runId: activeRunId } : {}),
      phase: 'feedback',
    });
    let failureSignals = 0;
    let qualitySignals = 0;
    let providerExpressionSignals = 0;
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
        failureSignals += 1;
        continue;
      }

      const qualityCheckSignal = toQualityCheckFeedbackSignal({
        result,
        toolArguments: toolCall?.arguments,
        toolCallId,
        toolName,
        observedAt: step.timestamp,
        ...(activeRunId ? { runId: activeRunId } : {}),
      });
      if (qualityCheckSignal) {
        this._feedbackCoordinator.observe(qualityCheckSignal);
        qualitySignals += 1;
        if (
          'evidence' in qualityCheckSignal &&
          qualityCheckSignal.evidence &&
          !this._ablationMarker?.disableAgentFirstToolEvidence
        ) {
          void this._recordAgentEvidence(qualityCheckSignal.evidence);
        }
      }

      const providerExpressionSignal = toProviderExpressionFeedbackSignal({
        result,
        toolCallId,
        toolName,
        observedAt: step.timestamp,
        ...(activeRunId ? { runId: activeRunId } : {}),
      });
      if (providerExpressionSignal) {
        this._feedbackCoordinator.observe(providerExpressionSignal);
        providerExpressionSignals += 1;
      }
    }

    logger.debug(
      'neko.agent.feedback.observe.summary',
      withAgentTrace(feedbackTrace, {
        toolResultCount: step.toolResults.length,
        failureSignals,
        qualitySignals,
        providerExpressionSignals,
      }),
    );
  }

  private async _recordAgentEvidence(
    evidence: import('@neko/shared').PerceptionEvidence,
  ): Promise<void> {
    if (!this._journalWriter || this._ablationMarker?.disableAgentFirst) {
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
    const packet = this._currentTurnPlanningContext?.metadata?.['multimodalContextPacket'];
    if (!isRecord(packet)) {
      return undefined;
    }

    const id = packet['id'];
    return typeof id === 'string' ? id : undefined;
  }

  private async _captureFeedbackCycle(trace?: AgentTraceContext): Promise<boolean> {
    return this._feedbackRuntime.captureCycle(trace);
  }

  private async _recordFeedbackStageTransition(input: {
    readonly cycle: import('../feedback').FeedbackCycle;
    readonly decision: import('../feedback').FeedbackDecision;
    readonly guidance: StageTransitionGuidance;
    readonly timestamp: number;
  }): Promise<void> {
    if (!this._journalWriter) {
      return;
    }

    try {
      await this._journalWriter.appendEvent(++this._journalSeq, {
        type: 'feedback.stage_transition_requested',
        feedbackStageTransition: {
          timestamp: input.timestamp,
          ...(input.cycle.activeRunId ? { activeRunId: input.cycle.activeRunId } : {}),
          ...(input.cycle.currentStage ? { currentStageId: input.cycle.currentStage } : {}),
          decision: input.decision,
          guidance: input.guidance,
        },
      });
    } catch (error) {
      logger.warn('Failed to record ControlPlane feedback transition', { error });
    }
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
    const trace = deriveAgentTraceContext(request.toolCall.trace, {
      phase: 'approval',
      parentRequestId: request.confirmationToken,
    });

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
        logger.warn('Approval engine threw; falling back to user onConfirmTool', {
          error: err,
        });
      }
    }

    // Fallback: existing user callback path.
    if (!this._config.onConfirmTool) {
      // No user prompt + no decisive engine answer → safe default: reject.
      logger.debug(
        'neko.agent.approval.confirmation.fallback',
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
        'neko.agent.approval.confirmation.fallback',
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
  const runKind = snapshot.runKind;
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

function createProviderCardProjectConfig(
  workspace: AgentSessionConfig['workspace'] | undefined,
): import('../feedback').FeedbackCoordinatorConfig['providerCardProject'] | undefined {
  if (!workspace || typeof workspace.fsOps.writeFile !== 'function') {
    return undefined;
  }

  return {
    workspaceRoot: workspace.root,
    fsOps: {
      mkdir: workspace.fsOps.mkdir.bind(workspace.fsOps),
      writeFile: workspace.fsOps.writeFile.bind(workspace.fsOps),
      ...(typeof workspace.fsOps.readFile === 'function'
        ? { readFile: workspace.fsOps.readFile.bind(workspace.fsOps) }
        : {}),
    },
  };
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
  readonly metadata?: Record<string, unknown>;
}

type QualityCheckEvaluationSummary = import('../feedback').QualityReviewEvaluationSummary;

type QualityCheckFeedbackPayload = import('../feedback').QualityReviewFeedbackPayload;

type QualityConsistencyReport = import('../validation/qa-types').ConsistencyReport;

function resolveObservedToolName(result: ObservedToolResult, fallbackName?: string): string {
  return result.name ?? fallbackName ?? 'unknown-tool';
}

function toQualityCheckFeedbackSignal(input: {
  readonly result: ObservedToolResult;
  readonly toolArguments?: Record<string, unknown>;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly observedAt: number;
  readonly runId?: string;
}): import('../feedback').FeedbackSignal | null {
  const sceneTimeRanges = readSceneTimeRangesFromToolArguments(input.toolArguments);

  if (input.toolName === 'QualityCheck' || input.toolName === 'QualityRepairCheck') {
    if (!isQualityCheckFeedbackPayload(input.result.data)) {
      return null;
    }

    const mode = input.toolName === 'QualityRepairCheck' ? 'repair' : 'analysis';
    const qualityReview = createQualityReviewEvidence({
      payload: input.result.data,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      mode,
      observedAt: input.observedAt,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(sceneTimeRanges.length > 0 ? { sceneTimeRanges } : {}),
    });

    return {
      kind: 'quality-check',
      observedAt: input.observedAt,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      mode,
      totalScenes: qualityReview.summary.totalScenes,
      passed: qualityReview.summary.passed,
      failed: qualityReview.summary.failed,
      failingSceneIndexes: qualityReview.summary.failingSceneIndexes,
      remediationCount: qualityReview.summary.remediationCount,
      ...(input.runId ? { runId: input.runId } : {}),
      evidence: qualityReview.evidence,
    };
  }

  if (input.toolName !== 'QualityCheckConsistency' || !isConsistencyReportLike(input.result.data)) {
    return null;
  }

  const { report: consistencyReport, diagnostics: adapterDiagnostics } =
    normalizeConsistencyReportForFeedback(input.result.data);
  const payload = createQualityReviewPayloadFromConsistencyReport(
    consistencyReport,
    input.toolArguments,
  );
  const qualityReview = createQualityReviewEvidence({
    payload,
    consistencyReport,
    toolCallId: input.toolCallId,
    toolName: 'QualityCheckConsistency',
    mode: 'consistency',
    observedAt: input.observedAt,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(sceneTimeRanges.length > 0 ? { sceneTimeRanges } : {}),
    ...(adapterDiagnostics.length > 0 ? { adapterDiagnostics } : {}),
  });

  return {
    kind: 'quality-check',
    observedAt: input.observedAt,
    toolCallId: input.toolCallId,
    toolName: 'QualityCheckConsistency',
    mode: 'consistency',
    totalScenes: qualityReview.summary.totalScenes,
    passed: qualityReview.summary.passed,
    failed: qualityReview.summary.failed,
    failingSceneIndexes: qualityReview.summary.failingSceneIndexes,
    remediationCount: qualityReview.summary.remediationCount,
    ...(input.runId ? { runId: input.runId } : {}),
    evidence: qualityReview.evidence,
  };
}

function toProviderExpressionFeedbackSignal(input: {
  readonly result: ObservedToolResult;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly observedAt: number;
  readonly runId?: string;
  readonly attachEvidence?: boolean;
}): import('../feedback').FeedbackSignal | null {
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
  conceptDecisions: readonly import('../feedback').ProviderExpressionConceptDecision[];
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
  conceptDecisions: readonly import('../feedback').ProviderExpressionConceptDecision[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function isConsistencyReportLike(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return isFiniteNumber(value['overallConsistency']) && Array.isArray(value['styleDrift']);
}

function normalizeConsistencyReportForFeedback(value: Record<string, unknown>): {
  readonly report: QualityConsistencyReport;
  readonly diagnostics: readonly string[];
} {
  const diagnostics: string[] = [];
  const overallConsistency =
    typeof value['overallConsistency'] === 'number' ? value['overallConsistency'] : 0;
  const characterConsistency = Array.isArray(value['characterConsistency'])
    ? value['characterConsistency']
    : [];
  if (!Array.isArray(value['characterConsistency'])) {
    diagnostics.push('missing-characterConsistency');
  }

  const aestheticScore = isFiniteNumber(value['aestheticScore']) ? value['aestheticScore'] : 0;
  if (!isFiniteNumber(value['aestheticScore'])) {
    diagnostics.push('missing-aestheticScore');
  }

  const recommendations = Array.isArray(value['recommendations'])
    ? value['recommendations'].filter((entry): entry is string => typeof entry === 'string')
    : [];
  if (!Array.isArray(value['recommendations'])) {
    diagnostics.push('missing-recommendations');
  }

  return {
    report: {
      overallConsistency,
      styleDrift: value['styleDrift'] as QualityConsistencyReport['styleDrift'],
      characterConsistency:
        characterConsistency as QualityConsistencyReport['characterConsistency'],
      aestheticScore,
      recommendations,
    },
    diagnostics,
  };
}

function createQualityReviewPayloadFromConsistencyReport(
  report: QualityConsistencyReport,
  toolArguments: Record<string, unknown> | undefined,
): QualityCheckFeedbackPayload {
  const sceneIndexes = readSceneIndexesFromToolArguments(toolArguments);
  const failedSceneIndexes = new Set<number>();
  for (const drift of report.styleDrift) {
    if (drift.driftScore > STYLE_DRIFT_COLOR_POP_THRESHOLD) {
      failedSceneIndexes.add(drift.fromScene);
      failedSceneIndexes.add(drift.toScene);
    }
  }
  for (const character of report.characterConsistency ?? []) {
    for (const appearance of character.appearances) {
      if (appearance.score < CHARACTER_INCONSISTENCY_FAIL_SCORE) {
        failedSceneIndexes.add(appearance.sceneIndex);
      }
    }
  }

  const indexes =
    sceneIndexes.length > 0
      ? sceneIndexes
      : [...failedSceneIndexes].sort((left, right) => left - right);
  const evaluations = indexes.map((index) => ({
    index,
    passed: !failedSceneIndexes.has(index),
    finalScore: report.overallConsistency,
    remediations:
      failedSceneIndexes.has(index) && report.recommendations.length > 0
        ? report.recommendations
        : undefined,
  }));

  const failed = evaluations.filter((evaluation) => !evaluation.passed).length;
  return {
    totalScenes: evaluations.length,
    passed: evaluations.length - failed,
    failed,
    evaluations,
  };
}

function readSceneTimeRangesFromToolArguments(
  toolArguments: Record<string, unknown> | undefined,
): import('../validation/quality-evidence-normalizer').QualityEvidenceSceneTimeRange[] {
  if (!toolArguments) return [];
  const scenes = toolArguments['scenes'];
  if (!Array.isArray(scenes)) return [];

  const ranges: import('../validation/quality-evidence-normalizer').QualityEvidenceSceneTimeRange[] =
    [];
  for (let index = 0; index < scenes.length; index++) {
    const scene = scenes[index];
    if (!isRecord(scene)) continue;
    const sceneIndex = readSceneIndex(scene, index);
    const timeRange = readToolArgumentTimeRange(scene);
    if (sceneIndex !== null && timeRange) {
      ranges.push({ sceneIndex, timeRange });
    }
  }
  return ranges;
}

function readSceneIndexesFromToolArguments(
  toolArguments: Record<string, unknown> | undefined,
): number[] {
  if (!toolArguments) return [];
  const scenes = toolArguments['scenes'];
  if (!Array.isArray(scenes)) return [];
  return scenes
    .map((scene, index) => (isRecord(scene) ? readSceneIndex(scene, index) : null))
    .filter((sceneIndex): sceneIndex is number => sceneIndex !== null);
}

function readSceneIndex(scene: Record<string, unknown>, fallback: number): number | null {
  const explicit = scene['index'] ?? scene['sceneIndex'];
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return Math.floor(explicit);
  return fallback;
}

function readToolArgumentTimeRange(
  scene: Record<string, unknown>,
): import('../validation/quality-evidence-normalizer').QualityEvidenceTimeRange | null {
  const direct = readTimeRangeLike(scene['timeRange']);
  if (direct) return direct;
  const start = scene['start'] ?? scene['startTime'];
  const end = scene['end'] ?? scene['endTime'];
  const fromScalar = readTimeRangeScalars(start, end);
  if (fromScalar) return fromScalar;
  const duration = scene['duration'];
  if (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0) {
    return { start: 0, end: duration };
  }
  return null;
}

function readTimeRangeLike(
  value: unknown,
): import('../validation/quality-evidence-normalizer').QualityEvidenceTimeRange | null {
  if (!isRecord(value)) return null;
  return readTimeRangeScalars(value['start'], value['end']);
}

function readTimeRangeScalars(
  start: unknown,
  end: unknown,
): import('../validation/quality-evidence-normalizer').QualityEvidenceTimeRange | null {
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start
  ) {
    return null;
  }
  return { start, end };
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
