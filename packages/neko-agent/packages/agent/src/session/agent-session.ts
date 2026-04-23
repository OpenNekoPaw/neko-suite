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

import type { ChatMessage, Skill, Tool } from '@neko/shared';
import type { IdcStage, StageActivationDecision, IdcRun } from '@neko-agent/types';
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
import { createNekoPaths, createNdjsonEventSink } from '../workspace';
import {
  createArtifactObservationHooks,
  createArtifactWatcher,
  type ArtifactObservationHooks,
  type IArtifactWatcher,
} from '../artifact';
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
import { stepToEvents, recordStepInHistory, type StreamState } from './step-event-converter';

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
import type { MemoryProjectModule } from '../prompt/modules/memory/memory-project-module';
import type { MemoryGlobalModule } from '../prompt/modules/memory/memory-global-module';
import type { MemoryRecallModule } from '../prompt/modules/memory/memory-recall-module';
import type { CreativeVersionLogModule } from '../prompt/modules/ephemeral/creative-version-log-module';
import type { SkillInjectionModule } from '../prompt/modules/skill/skill-injection-module';
import type { AgentsMdModule } from '../prompt/modules/environment/agents-md-module';
import type { ArtifactSchemaModule } from '../prompt/modules/schema/artifact-schema-module';
import { getLogger } from '../utils/logger';
import {
  initializeSession,
  createConfiguredExecutor,
  DEFAULT_MAX_ITERATIONS,
} from './agent-session-initializer';

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
  private _memoryGlobalModule: MemoryGlobalModule;
  private _memoryRecallModule: MemoryRecallModule;
  private _creativeVersionLogModule: CreativeVersionLogModule;
  // PR3a: owns the format contract for skill-layer sections; consumed by
  // SkillInjectionCoordinator's Track A writes.
  private _skillInjectionModule: SkillInjectionModule;
  // PR3b: AGENTS.md overlay module (environment layer).
  private _agentsMdModule: AgentsMdModule;
  // PR3c: IDC artifact contract (L1 schema layer). Instance held here so
  // future session-level IdcRun transition wiring (PR3d) can toggle it.
  private _artifactSchemaModule: ArtifactSchemaModule;

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
  private _runnerHooks: import('@neko/shared').ExecutorHooks | null = null;

  // Typed event bus for creation.* / execution.* channels.
  private _eventBus: IEventBus | null = null;
  // `.neko/` directory resolver (only when workspace config is supplied).
  private _nekoPaths: import('../workspace').INekoPaths | null = null;
  // JSONL event sink persisting bus events to `.neko/logs/events.jsonl`.
  private _eventSink: import('../workspace').INdjsonEventSink | null = null;
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
  // ExecutorHooks that drain watcher-reported invalid artifacts into the
  // next think's context, so the AI can self-correct its frontmatter.
  private _artifactObservationHooks: ArtifactObservationHooks | null = null;
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
  private _isRunning = false;
  /** Circuit breaker state for auto-compact */
  private _compactState: AutoCompactState = createAutoCompactState();
  /** Creative version log for generation tracking */
  private _versionLog: CreativeVersionLog = createCreativeVersionLog();
  /** JSONL journal writer for session persistence */
  private _journalWriter: import('./journal-writer').JournalWriter | null = null;
  /** Journal sequence counter */
  private _journalSeq = 0;
  /** Tracks streaming state across step conversions */
  private _streamState: StreamState = { hasStreamedDeltas: false };
  private _pendingConfirmations = new Map<
    string,
    {
      request: ToolConfirmationRequest;
    }
  >();

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
    this._metaTools = components.metaTools;
    // PR2 prompt modules — Session drives the version-log one during
    // _syncSystemPrompt; the memory modules are event-driven from the
    // initializer. Held here so future work can re-inject them via the
    // orchestrator.
    this._memoryProjectModule = components.memoryProjectModule;
    this._memoryGlobalModule = components.memoryGlobalModule;
    this._memoryRecallModule = components.memoryRecallModule;
    this._creativeVersionLogModule = components.creativeVersionLogModule;
    this._skillInjectionModule = components.skillInjectionModule;
    this._agentsMdModule = components.agentsMdModule;
    this._artifactSchemaModule = components.artifactSchemaModule;

    // Journal writer for session persistence
    if (config.journalWriter) {
      this._journalWriter = config.journalWriter;
    }

    // SkillInjectionCoordinator requires closures over Session fields
    // (e.g. _permissionHooks changes on configure()), so created here
    this._skillCoordinator = new SkillInjectionCoordinator({
      promptComposer: this._promptComposer,
      getPermissionHooks: () => this._permissionHooks,
      syncSystemPrompt: () => this._syncSystemPrompt(),
      skillInjectionModule: this._skillInjectionModule,
    });

    // Stage tracking: when the caller supplies a skill registry + service,
    // spin up a StageTracker and auto-swap the persona Skill on each stage
    // transition. The initial persona sync is async; fire-and-forget here —
    // callers that need determinism should call syncInitialPersona() directly.
    if (config.stageTracking) {
      this._stageTracker = new StageTracker({ initialStage: config.stageTracking.initialStage });
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

        // ArtifactWatcher (Phase B) — fire-and-forget start. Silent on
        // platforms where fs.watch is unavailable; validator only reports
        // structured issues via the bus, never blocks the write.
        this._artifactWatcher = createArtifactWatcher({
          paths: this._nekoPaths,
          eventBus: this._eventBus,
          getRunId: () => this._runStore?.getActive()?.id ?? null,
        });
        void this._artifactWatcher.start();

        // Observation-loop closure (Phase B) — subscribes to
        // `artifact.invalid` and injects a system message before the next
        // think, so the AI sees validator issues and self-corrects.
        this._artifactObservationHooks = createArtifactObservationHooks({
          eventBus: this._eventBus,
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
        eventBus: this._eventBus,
        autohealChain: this._autohealChain,
      });
      this._reactRunnerState = state;

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

      // Chain the artifact-observation hook so `artifact.invalid` events
      // reach the AI via a `beforeThink` system message. Kept as a final
      // layer because it's a pure consumer of the bus; order among other
      // `beforeThink` hooks is not significant.
      const observationHooks = this._artifactObservationHooks;
      const composedHooks: import('@neko/shared').ExecutorHooks = observationHooks
        ? {
            ...withGuardian,
            name: `${withGuardian.name ?? 'react-loop'}+artifact-observation`,
            beforeThink: async (ctx) => {
              let next = ctx;
              if (withGuardian.beforeThink) {
                next = (await withGuardian.beforeThink(next)) || next;
              }
              if (observationHooks.beforeThink) {
                next = (await observationHooks.beforeThink(next)) || next;
              }
              return next;
            },
          }
        : withGuardian;

      this._runnerHooks = composedHooks;

      // Register on the already-built executor + on any re-builds after configure().
      if (this._executor) {
        this._executor.addHook(composedHooks);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  configure(config: Partial<AgentSessionConfig>): void {
    // Update config
    this._config = { ...this._config, ...config };

    // Update execution mode if changed
    if (config.executionMode !== undefined) {
      this._executionMode = config.executionMode;
    }

    // Update system prompt in history if changed
    if (config.systemPrompt !== undefined) {
      this._promptComposer.setBase(config.systemPrompt);
      this._syncSystemPrompt();
    }

    // Reinitialize executor with new config
    this._rebuildExecutor();
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

    try {
      // Execute UserPromptSubmit hooks (if configured)
      let processedInput = input;
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

      // Add user message to history first, then pass snapshot (including user message)
      // to executor with skipUserMessage flag so it doesn't duplicate
      this._history.push({ role: 'user', content: processedInput });

      // Creative version log: detect user evaluation keywords in input
      if (this._versionLog.size > 0) {
        const evalResult = detectEvaluation(processedInput);
        if (evalResult) {
          this._versionLog.evaluateLatest(evalResult.evaluation, evalResult.note);
        }
      }

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

        // Record history first (side effects), then emit events (pure)
        recordStepInHistory(step, iteration, this._history);

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
        }

        // Yield events and append to journal (skip high-frequency text_delta)
        for (const event of stepToEvents(step, iteration, maxIterations, this._streamState)) {
          yield event;
          if (this._journalWriter && event.type !== 'text_delta') {
            await this._journalWriter.appendEvent(++this._journalSeq, event);
          }
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
          if (compactResult.compressed && compactResult.newHistory) {
            this._history.length = 0;
            this._history.push(...compactResult.newHistory);
            this._syncSystemPrompt(); // Re-inject active Skills + ToolSet declarations
          }
        }
      }

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
      yield {
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
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
      if (pending.request.confirmationToken && this._permissionHooks) {
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

  addMessage(message: ChatMessage): void {
    this._history.push(message);
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
   * Begin a WorkflowRun — the ReAct-loop runner appends rounds into the
   * active run. Returns null if dual-flow is not configured. No-op if a
   * run is already active (the runner closes it on onExecuteEnd).
   */
  startWorkflowRun(workflowId: string, runId?: string): string | null {
    if (!this._runStore) return null;
    return this._runStore.startRun({ workflowId, runId });
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
    // Rebuild from composer to preserve current prompt composition
    this._history = [{ role: 'system', content: this._promptComposer.compose() }];
  }

  loadHistory(messages: ChatMessage[]): void {
    this._history = [...messages];
    // Ensure system prompt is present
    if (this._history.length === 0 || this._history[0].role !== 'system') {
      this._history.unshift({ role: 'system', content: this._config.systemPrompt });
    }
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
    this._history = result.messages.map((m) => m.message);
    const compressedTokens = this._compressor.estimateTokens(this._history);

    const ratio = originalTokens > 0 ? compressedTokens / originalTokens : 1;

    return { originalTokens, compressedTokens, ratio };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  dispose(): void {
    this.cancel();
    this._isRunning = false;
    // Flush journal writer
    void this._journalWriter?.dispose();
    // Stage tracking: unsubscribe binding listener + clear tracker listeners.
    this._stagePersonaBinding?.dispose();
    this._stageGuardian?.dispose();
    this._stageTracker?.dispose();
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
    // Drop the observation hook's bus subscription so it doesn't hold
    // references after the bus clears.
    this._artifactObservationHooks?.dispose();
    this._eventSink = null;
    this._auditsSink = null;
    this._stepsSink = null;
    this._artifactWatcher = null;
    this._artifactObservationHooks = null;
    this._nekoPaths = null;
    this._eventBus?.clear();
    this._eventBus = null;
    this._autohealChain = null;
    this._approvalEngine = null;
    // Reject all pending tool confirmations via permission hooks
    for (const pending of this._pendingConfirmations.values()) {
      if (pending.request.confirmationToken && this._permissionHooks) {
        this._permissionHooks.confirmTool(pending.request.confirmationToken, false);
      }
    }
    this._pendingConfirmations.clear();
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /** Sync the composed system prompt into _history[0] */
  private _syncSystemPrompt(): void {
    // Drive the CreativeVersionLogModule — owns the format contract for the
    // version-log ephemeral section. renderSync() preserves the synchronous
    // caller contract (this method is invoked from ask-snapshot paths where
    // async would introduce a microtask between prompt sync and snapshot).
    this._creativeVersionLogModule.setSummary(
      this._versionLog.size > 0 ? this._versionLog.toSummary() : null,
    );
    this._promptComposer.removeSection('creative-version-log');
    const versionSections = this._creativeVersionLogModule.renderSync();
    if (versionSections) {
      for (const s of versionSections) {
        this._promptComposer.setSection({
          id: s.sectionId,
          layer: s.layer,
          content: s.content,
          priority: s.priority,
          ...(s.cacheControl && { cacheControl: s.cacheControl }),
        });
      }
    }

    // Compose both flat text and structured sections
    const structured = this._promptComposer.composeStructured();
    if (this._history.length > 0 && this._history[0]?.role === 'system') {
      this._history[0].content = structured.text;
    }

    // Push cache-boundary sections to executor for provider-specific caching
    if (this._executor && structured.sections.length > 0) {
      this._executor.updateServiceOptions({
        systemPromptSections: structured.sections,
      });
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
    this._pendingConfirmations.set(toolCallId, { request });

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
