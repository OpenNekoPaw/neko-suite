import type {
  AgentContext,
  AgentObservation,
  ChatMessage,
  DecisionRationale,
  ExecutorHooks,
  IProjectMemoryManager,
  PerceptionEvidence,
  SubagentReviewResult,
} from '@neko/shared';
import type { ArtifactKind, ExecutionArtifactInvalidEvent, IdcStage } from '@neko-agent/types';
import { EXECUTION_CHANNELS } from '@neko-agent/types';
import type { IEventBus } from '../events';
import type { StageTracker } from '../skill/stage-tracker';
import { createArtifactObservationHooks } from '../artifact/artifact-observation-hooks';
import { SelfEvaluationHooks } from '../evaluation/self-evaluation-hooks';
import { KeyFactExtractor } from '../memory/keyfact-extractor';
import { ProjectMemoryRouter } from '../memory/project-memory-router';
import {
  ProviderCardProjectRouter,
  type ProviderCardProjectFsOps,
  type ProviderCardProjectReviewMode,
} from '../memory/provider-card-project-router';

// =============================================================================
// Types
// =============================================================================

export interface IProviderCardProjectRouter {
  writeObservation(
    signal: Extract<FeedbackSignal, { kind: 'provider-card-observation' }>,
  ): Promise<unknown>;
}

export interface FeedbackLogger {
  warn(message: string, metadata?: Record<string, unknown>): void;
}

export interface FeedbackCoordinatorConfig {
  readonly eventBus?: IEventBus | null;
  readonly stageTracker?: StageTracker | null;
  readonly projectMemoryManager?: IProjectMemoryManager;
  readonly autoMemoryExtraction?: boolean;
  readonly evaluators?: readonly IFeedbackEvaluator[];
  readonly arbiter?: IFeedbackArbiter;
  readonly controlPolicy?: FeedbackControlPolicy;
  readonly providerCardProject?: {
    readonly workspaceRoot: string;
    readonly fsOps: ProviderCardProjectFsOps;
    readonly reviewMode?: ProviderCardProjectReviewMode;
  };
  readonly providerCardProjectRouterFactory?: (config: {
    readonly workspaceRoot: string;
    readonly fsOps: ProviderCardProjectFsOps;
    readonly reviewMode?: ProviderCardProjectReviewMode;
    readonly now: () => number;
  }) => IProviderCardProjectRouter;
  readonly logger?: FeedbackLogger;
  readonly now?: () => number;
}

export interface FeedbackMemoryExtractionInput {
  readonly messages: readonly ChatMessage[];
  readonly sourceEventIds?: readonly string[];
}

export interface FeedbackMemoryExtractionSkipped {
  readonly kind: 'skipped';
  readonly timestamp: number;
  readonly sourceEventIds: string[];
  readonly reason: 'disabled' | 'no-facts';
}

export interface FeedbackMemoryExtractionResult {
  readonly kind: 'extracted';
  readonly timestamp: number;
  readonly sourceEventIds: string[];
  readonly facts: Array<{
    id: string;
    content: string;
    category: 'preference' | 'decision' | 'context' | 'action';
    confidence: number;
    destination: 'project';
  }>;
  /**
   * Mirrors the journal/session event contract even though the current
   * coordinator implementation only emits `written` or `dedup`.
   */
  readonly writeStatus: 'pending' | 'written' | 'rejected-by-user' | 'dedup';
}

export type FeedbackMemoryExtractionOutcome =
  | FeedbackMemoryExtractionSkipped
  | FeedbackMemoryExtractionResult;

export interface ProviderExpressionConceptDecision {
  readonly concept: string;
  readonly status: string;
  readonly output?: string;
  readonly reason?: string;
}

export type FeedbackSignal =
  | {
      readonly kind: 'artifact-invalid';
      readonly observedAt: number;
      readonly runId: string;
      readonly artifactKind: ArtifactKind;
      readonly path: string;
      readonly issues: ExecutionArtifactInvalidEvent['issues'];
    }
  | {
      readonly kind: 'self-evaluation-requested';
      readonly observedAt: number;
      readonly stage: 'apply';
    }
  | {
      readonly kind: 'tool-failure';
      readonly observedAt: number;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly error: string;
      readonly runId?: string;
    }
  | {
      readonly kind: 'quality-check';
      readonly observedAt: number;
      readonly toolCallId: string;
      readonly toolName: 'QualityCheck' | 'QualityRepairCheck' | 'QualityCheckConsistency';
      readonly mode?: 'analysis' | 'repair' | 'consistency';
      readonly totalScenes: number;
      readonly passed: number;
      readonly failed: number;
      readonly failingSceneIndexes: readonly number[];
      readonly remediationCount: number;
      readonly runId?: string;
      readonly evidence?: PerceptionEvidence;
    }
  | {
      readonly kind: 'memory-extraction';
      readonly observedAt: number;
      readonly extraction: FeedbackMemoryExtractionResult;
    }
  | {
      readonly kind: 'provider-card-observation';
      readonly observedAt: number;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly mode: 'agentic' | 'fallback' | 'native';
      readonly providerId?: string;
      readonly reason?: string;
      readonly styleFamily?: string;
      readonly concepts?: readonly string[];
      readonly conceptDecisions?: readonly ProviderExpressionConceptDecision[];
      readonly runId?: string;
      readonly metadata: Record<string, unknown>;
    }
  | {
      readonly kind: 'agent-observation';
      readonly observedAt: number;
      readonly observation: AgentObservation;
      readonly runId?: string;
    }
  | {
      readonly kind: 'decision-rationale';
      readonly observedAt: number;
      readonly rationale: DecisionRationale;
      readonly runId?: string;
    }
  | {
      readonly kind: 'subagent-review';
      readonly observedAt: number;
      readonly review: SubagentReviewResult;
      readonly runId?: string;
    };

export type FeedbackDecision =
  | {
      readonly action: 'repair';
      readonly signalKind: 'artifact-invalid';
      readonly runId: string;
      readonly artifactKind: ArtifactKind;
      readonly path: string;
      readonly issueCount: number;
    }
  | {
      readonly action: 'self-evaluate';
      readonly signalKind: 'self-evaluation-requested';
      readonly stage: 'apply';
    }
  | {
      readonly action: 'repair';
      readonly signalKind: 'tool-failure';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly error: string;
      readonly runId?: string;
    }
  | {
      readonly action: 'repair';
      readonly signalKind: 'quality-check';
      readonly toolCallId: string;
      readonly toolName: 'QualityCheck' | 'QualityRepairCheck' | 'QualityCheckConsistency';
      readonly mode?: 'analysis' | 'repair' | 'consistency';
      readonly totalScenes: number;
      readonly failed: number;
      readonly failingSceneIndexes: readonly number[];
      readonly remediationCount: number;
      readonly runId?: string;
      readonly evidenceId?: string;
    }
  | {
      readonly action: 'continue';
      readonly signalKind: 'quality-check';
      readonly toolCallId: string;
      readonly toolName: 'QualityCheck' | 'QualityRepairCheck' | 'QualityCheckConsistency';
      readonly mode?: 'analysis' | 'repair' | 'consistency';
      readonly totalScenes: number;
      readonly passed: number;
    }
  | {
      readonly action: 'memorize';
      readonly signalKind: 'memory-extraction';
      readonly factCount: number;
      readonly writeStatus: FeedbackMemoryExtractionResult['writeStatus'];
    }
  | {
      readonly action: 'continue';
      readonly signalKind: 'provider-card-observation';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly mode: 'agentic' | 'fallback' | 'native';
      readonly providerId?: string;
      readonly reason?: string;
      readonly styleFamily?: string;
    }
  | {
      readonly action: 'continue';
      readonly signalKind: 'agent-observation';
      readonly observationId: string;
      readonly confidence: AgentObservation['confidence'];
      readonly evidenceIds: readonly string[];
    }
  | {
      readonly action: 'continue';
      readonly signalKind: 'decision-rationale';
      readonly rationaleId: string;
      readonly confidence: DecisionRationale['confidence'];
      readonly observationIds: readonly string[];
      readonly evidenceIds: readonly string[];
      readonly riskLevel?: NonNullable<DecisionRationale['risk']>['level'];
    }
  | {
      readonly action: 'continue';
      readonly signalKind: 'subagent-review';
      readonly requestId: string;
      readonly reviewerId: string;
      readonly evidenceIds: readonly string[];
      readonly recommendationIds: readonly string[];
      readonly runId?: string;
    }
  | {
      readonly action: 'continue';
      readonly reason: 'no-actionable-signal';
    };

export interface FeedbackControlPolicy {
  /**
   * Number of repeated repair-class feedback observations before the control
   * layer stops silently suggesting self-repair and instead tells the agent to
   * escalate the issue back to the user.
   */
  readonly escalationThreshold?: number;
  /**
   * When true, low-confidence rationale without an AgentObservation receives
   * guidance instead of silently clearing feedback state.
   */
  readonly agentObservationRequired?: boolean;
  /**
   * Controls only guidance wording. The arbiter never invokes tools directly;
   * the Agent remains responsible for choosing whether to attach evidence.
   */
  readonly toolEvidenceMode?: 'off' | 'optional' | 'required-for-low-confidence';
}

export type FeedbackFlowAction =
  | {
      readonly kind: 'set-guidance';
      readonly guidance: string;
      readonly signalKinds: ReadonlyArray<FeedbackSignal['kind']>;
    }
  | {
      readonly kind: 'clear-guidance';
      readonly reason: 'no-actionable-signal' | 'continue' | 'memorize';
    }
  | {
      readonly kind: 'escalate-user';
      readonly message: string;
      readonly signalKind: 'artifact-invalid' | 'tool-failure' | 'quality-check';
      readonly repeatCount: number;
      readonly runId?: string;
    };

export interface FeedbackEvaluationContext {
  readonly currentStage?: IdcStage | null;
  readonly activeRunId?: string | null;
}

export interface FeedbackCycle {
  readonly timestamp: number;
  readonly signals: readonly FeedbackSignal[];
  readonly decisions: readonly FeedbackDecision[];
  readonly actions: readonly FeedbackFlowAction[];
  readonly currentStage?: IdcStage | null;
  readonly activeRunId?: string | null;
}

export interface IFeedbackEvaluator {
  readonly id: string;
  evaluate(input: {
    readonly signals: readonly FeedbackSignal[];
    readonly context: FeedbackEvaluationContext;
  }): readonly FeedbackDecision[];
}

export interface IFeedbackArbiter {
  readonly id: string;
  decide(input: {
    readonly signals: readonly FeedbackSignal[];
    readonly decisions: readonly FeedbackDecision[];
    readonly context: FeedbackEvaluationContext;
    readonly signalHistory: readonly FeedbackSignal[];
    readonly countSignals?: (signal: FeedbackSignal) => number;
  }): readonly FeedbackFlowAction[];
}

export interface IFeedbackCoordinator {
  getBeforeThinkHooks(): readonly ExecutorHooks[];
  observe(signal: FeedbackSignal): void;
  evaluatePending(context?: FeedbackEvaluationContext): FeedbackCycle | null;
  getSignalHistory(): readonly FeedbackSignal[];
  getDecisionHistory(): readonly FeedbackDecision[];
  getActionHistory(): readonly FeedbackFlowAction[];
  extractMemory(input: FeedbackMemoryExtractionInput): Promise<FeedbackMemoryExtractionOutcome>;
  dispose(): void;
}

// =============================================================================
// Implementation
// =============================================================================

function createDefaultProviderCardProjectRouter(config: {
  readonly workspaceRoot: string;
  readonly fsOps: ProviderCardProjectFsOps;
  readonly reviewMode?: ProviderCardProjectReviewMode;
  readonly now: () => number;
}): IProviderCardProjectRouter {
  return new ProviderCardProjectRouter(config);
}

class FeedbackCoordinator implements IFeedbackCoordinator {
  private readonly _beforeThinkHooks: readonly ExecutorHooks[];
  private readonly _keyFactExtractor: KeyFactExtractor | null;
  private readonly _projectMemoryRouter: ProjectMemoryRouter | null;
  private readonly _providerCardProjectRouter: IProviderCardProjectRouter | null;
  private readonly _logger: FeedbackLogger | null;
  private readonly _evaluators: readonly IFeedbackEvaluator[];
  private readonly _arbiter: IFeedbackArbiter;
  private readonly _now: () => number;
  private readonly _pendingSignals: FeedbackSignal[] = [];
  private readonly _signalHistory: FeedbackSignal[] = [];
  private readonly _signalCounts = new Map<string, number>();
  private readonly _decisionHistory: FeedbackDecision[] = [];
  private readonly _actionHistory: FeedbackFlowAction[] = [];
  private readonly _artifactInvalidUnsubscribe: (() => void) | null;

  constructor(config: FeedbackCoordinatorConfig) {
    const observationHook = config.eventBus
      ? createArtifactObservationHooks({
          eventBus: config.eventBus,
        })
      : null;
    const selfEvaluationHook = config.stageTracker
      ? new SelfEvaluationHooks({
          stageTracker: config.stageTracker,
          onGuidanceRequested: () => {
            this.observe({
              kind: 'self-evaluation-requested',
              observedAt: this._now(),
              stage: 'apply',
            });
          },
        })
      : null;

    const beforeThinkHooks: ExecutorHooks[] = [];
    if (observationHook) {
      beforeThinkHooks.push(observationHook);
    }
    if (selfEvaluationHook) {
      beforeThinkHooks.push(selfEvaluationHook);
    }
    this._beforeThinkHooks = beforeThinkHooks;
    this._now = config.now ?? (() => Date.now());
    this._logger = config.logger ?? null;
    this._evaluators =
      config.evaluators && config.evaluators.length > 0
        ? [...config.evaluators]
        : [createDefaultFeedbackEvaluator()];
    this._arbiter = config.arbiter ?? createDefaultFeedbackArbiter(config.controlPolicy);
    this._artifactInvalidUnsubscribe =
      config.eventBus?.on(EXECUTION_CHANNELS.ARTIFACT_INVALID, (event) => {
        this.observe(feedbackSignalFromArtifactInvalidEvent(event));
      }) ?? null;
    this._providerCardProjectRouter = config.providerCardProject
      ? (config.providerCardProjectRouterFactory ?? createDefaultProviderCardProjectRouter)({
          ...config.providerCardProject,
          now: this._now,
        })
      : null;

    if (config.projectMemoryManager && config.autoMemoryExtraction !== false) {
      this._keyFactExtractor = new KeyFactExtractor();
      this._projectMemoryRouter = new ProjectMemoryRouter(config.projectMemoryManager);
      return;
    }

    this._keyFactExtractor = null;
    this._projectMemoryRouter = null;
  }

  getBeforeThinkHooks(): readonly ExecutorHooks[] {
    return this._beforeThinkHooks;
  }

  observe(signal: FeedbackSignal): void {
    this._pendingSignals.push(signal);
    this._signalHistory.push(signal);
    incrementSignalCount(this._signalCounts, signalSignature(signal));
    for (const evicted of trimHistory(this._signalHistory)) {
      decrementSignalCount(this._signalCounts, signalSignature(evicted));
    }
  }

  evaluatePending(context: FeedbackEvaluationContext = {}): FeedbackCycle | null {
    if (this._pendingSignals.length === 0) {
      return null;
    }

    const signals = this._pendingSignals.splice(0, this._pendingSignals.length);
    const decisions = this._evaluators.flatMap((evaluator) =>
      evaluator.evaluate({ signals, context }),
    );
    const normalizedDecisions =
      decisions.length > 0
        ? decisions
        : [{ action: 'continue', reason: 'no-actionable-signal' } as const];
    void this._writeProviderCardObservations(signals).catch((error: unknown) => {
      this._logger?.warn('provider-card observation write failed', { error });
    });

    const actions = this._arbiter.decide({
      signals,
      decisions: normalizedDecisions,
      context,
      signalHistory: this._signalHistory,
      countSignals: (signal) => this._signalCounts.get(signalSignature(signal)) ?? 0,
    });

    this._decisionHistory.push(...normalizedDecisions);
    trimHistory(this._decisionHistory);
    this._actionHistory.push(...actions);
    trimHistory(this._actionHistory);

    return {
      timestamp: this._now(),
      signals,
      decisions: normalizedDecisions,
      actions,
      ...(context.currentStage !== undefined ? { currentStage: context.currentStage } : {}),
      ...(context.activeRunId !== undefined ? { activeRunId: context.activeRunId } : {}),
    };
  }

  private async _writeProviderCardObservations(signals: readonly FeedbackSignal[]): Promise<void> {
    if (!this._providerCardProjectRouter) {
      return;
    }

    for (const signal of signals) {
      if (signal.kind === 'provider-card-observation') {
        await this._providerCardProjectRouter.writeObservation(signal);
      }
    }
  }

  getSignalHistory(): readonly FeedbackSignal[] {
    return this._signalHistory;
  }

  getDecisionHistory(): readonly FeedbackDecision[] {
    return this._decisionHistory;
  }

  getActionHistory(): readonly FeedbackFlowAction[] {
    return this._actionHistory;
  }

  async extractMemory(
    input: FeedbackMemoryExtractionInput,
  ): Promise<FeedbackMemoryExtractionOutcome> {
    const sourceEventIds = [...(input.sourceEventIds ?? [])];
    if (!this._keyFactExtractor || !this._projectMemoryRouter) {
      return {
        kind: 'skipped',
        timestamp: this._now(),
        sourceEventIds,
        reason: 'disabled',
      };
    }

    const facts = this._keyFactExtractor.extract([...input.messages]);
    if (facts.length === 0) {
      return {
        kind: 'skipped',
        timestamp: this._now(),
        sourceEventIds,
        reason: 'no-facts',
      };
    }

    const routing = await this._projectMemoryRouter.writeFacts(facts);
    const extraction: FeedbackMemoryExtractionResult = {
      kind: 'extracted',
      timestamp: this._now(),
      sourceEventIds,
      facts: routing.facts.map((fact) => ({
        id: fact.id,
        content: fact.content,
        category: fact.category,
        confidence: fact.confidence,
        destination: fact.destination,
      })),
      writeStatus: routing.writtenFacts.length > 0 ? 'written' : 'dedup',
    };
    this.observe({
      kind: 'memory-extraction',
      observedAt: extraction.timestamp,
      extraction,
    });
    return extraction;
  }

  dispose(): void {
    this._artifactInvalidUnsubscribe?.();
    for (const hook of this._beforeThinkHooks) {
      if (typeof (hook as { dispose?: () => void }).dispose === 'function') {
        (hook as { dispose: () => void }).dispose();
      }
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createFeedbackCoordinator(config: FeedbackCoordinatorConfig): IFeedbackCoordinator {
  return new FeedbackCoordinator(config);
}

// =============================================================================
// Hook composition helper
// =============================================================================

export function composeBeforeThinkHooks(
  base: ExecutorHooks,
  feedbackHooks: readonly ExecutorHooks[],
): ExecutorHooks {
  const beforeThinkChain: Array<(ctx: AgentContext) => Promise<AgentContext | void>> = [];
  if (base.beforeThink) {
    beforeThinkChain.push((ctx) => base.beforeThink!(ctx));
  }
  for (const hook of feedbackHooks) {
    if (hook.beforeThink) {
      beforeThinkChain.push((ctx) => hook.beforeThink!(ctx));
    }
  }

  if (beforeThinkChain.length <= 1) {
    return base;
  }

  const nameSuffix = feedbackHooks
    .map((hook) => hook.name ?? null)
    .filter((name): name is string => Boolean(name))
    .join('+');

  return {
    ...base,
    name: nameSuffix ? `${base.name ?? 'react-loop'}+${nameSuffix}` : (base.name ?? 'react-loop'),
    beforeThink: async (ctx) => {
      let next = ctx;
      for (const step of beforeThinkChain) {
        next = (await step(next)) || next;
      }
      return next;
    },
  };
}

const FEEDBACK_HISTORY_CAP = 64;

function trimHistory<T>(history: T[]): readonly T[] {
  if (history.length > FEEDBACK_HISTORY_CAP) {
    return history.splice(0, history.length - FEEDBACK_HISTORY_CAP);
  }

  return [];
}

const DEFAULT_CONTROL_POLICY: Required<FeedbackControlPolicy> = {
  escalationThreshold: 2,
  agentObservationRequired: false,
  toolEvidenceMode: 'optional',
};

function feedbackSignalFromArtifactInvalidEvent(
  event: ExecutionArtifactInvalidEvent,
): FeedbackSignal {
  return {
    kind: 'artifact-invalid',
    observedAt: event.at,
    runId: event.runId,
    artifactKind: event.kind,
    path: event.path,
    issues: [...event.issues],
  };
}

function createDefaultFeedbackEvaluator(): IFeedbackEvaluator {
  return {
    id: 'default-feedback-evaluator',
    evaluate: ({ signals }) => {
      const decisions: FeedbackDecision[] = [];

      for (const signal of signals) {
        switch (signal.kind) {
          case 'artifact-invalid':
            decisions.push({
              action: 'repair',
              signalKind: signal.kind,
              runId: signal.runId,
              artifactKind: signal.artifactKind,
              path: signal.path,
              issueCount: signal.issues.length,
            });
            break;
          case 'self-evaluation-requested':
            decisions.push({
              action: 'self-evaluate',
              signalKind: signal.kind,
              stage: signal.stage,
            });
            break;
          case 'tool-failure':
            decisions.push({
              action: 'repair',
              signalKind: signal.kind,
              toolCallId: signal.toolCallId,
              toolName: signal.toolName,
              error: signal.error,
              ...(signal.runId ? { runId: signal.runId } : {}),
            });
            break;
          case 'quality-check':
            if (signal.failed > 0) {
              decisions.push({
                action: 'repair',
                signalKind: signal.kind,
                toolCallId: signal.toolCallId,
                toolName: signal.toolName,
                ...(signal.mode ? { mode: signal.mode } : {}),
                totalScenes: signal.totalScenes,
                failed: signal.failed,
                failingSceneIndexes: [...signal.failingSceneIndexes],
                remediationCount: signal.remediationCount,
                ...(signal.runId ? { runId: signal.runId } : {}),
                ...(signal.evidence ? { evidenceId: signal.evidence.id } : {}),
              });
              break;
            }
            decisions.push({
              action: 'continue',
              signalKind: signal.kind,
              toolCallId: signal.toolCallId,
              toolName: signal.toolName,
              ...(signal.mode ? { mode: signal.mode } : {}),
              totalScenes: signal.totalScenes,
              passed: signal.passed,
            });
            break;
          case 'memory-extraction':
            decisions.push({
              action: 'memorize',
              signalKind: signal.kind,
              factCount: signal.extraction.facts.length,
              writeStatus: signal.extraction.writeStatus,
            });
            break;
          case 'provider-card-observation':
            decisions.push({
              action: 'continue',
              signalKind: signal.kind,
              toolCallId: signal.toolCallId,
              toolName: signal.toolName,
              mode: signal.mode,
              ...(signal.providerId ? { providerId: signal.providerId } : {}),
              ...(signal.reason ? { reason: signal.reason } : {}),
              ...(signal.styleFamily ? { styleFamily: signal.styleFamily } : {}),
            });
            break;
          case 'agent-observation':
            decisions.push({
              action: 'continue',
              signalKind: signal.kind,
              observationId: signal.observation.id,
              confidence: signal.observation.confidence,
              evidenceIds: [...signal.observation.evidenceIds],
            });
            break;
          case 'decision-rationale':
            decisions.push({
              action: 'continue',
              signalKind: signal.kind,
              rationaleId: signal.rationale.id,
              confidence: signal.rationale.confidence,
              observationIds: [...signal.rationale.observationIds],
              evidenceIds: [...signal.rationale.evidenceIds],
              ...(signal.rationale.risk ? { riskLevel: signal.rationale.risk.level } : {}),
            });
            break;
          case 'subagent-review':
            decisions.push({
              action: 'continue',
              signalKind: signal.kind,
              requestId: signal.review.requestId,
              reviewerId: signal.review.reviewerId,
              evidenceIds: signal.review.evidence.map((evidence) => evidence.id),
              recommendationIds: signal.review.recommendations.map(
                (recommendation) => recommendation.id,
              ),
              ...(signal.runId ? { runId: signal.runId } : {}),
            });
            break;
        }
      }

      return decisions;
    },
  };
}

function createDefaultFeedbackArbiter(policy: FeedbackControlPolicy | undefined): IFeedbackArbiter {
  const effectivePolicy = {
    ...DEFAULT_CONTROL_POLICY,
    ...(policy ?? {}),
  };

  return {
    id: 'default-feedback-arbiter',
    decide: ({ signals, decisions, signalHistory, countSignals }) => {
      const guidanceBlocks: string[] = [];
      const guidanceKinds = new Set<FeedbackSignal['kind']>();
      const actions: FeedbackFlowAction[] = [];

      for (const decision of decisions) {
        switch (decision.action) {
          case 'repair': {
            if (decision.signalKind === 'artifact-invalid') {
              const repeatCount = getRepeatCount(signalHistory, countSignals, {
                kind: 'artifact-invalid',
                observedAt: 0,
                runId: decision.runId,
                artifactKind: decision.artifactKind,
                path: decision.path,
                issues: [],
              });
              if (repeatCount >= effectivePolicy.escalationThreshold) {
                actions.push({
                  kind: 'escalate-user',
                  message:
                    `Artifact ${decision.artifactKind} at ${decision.path} ` +
                    `failed validation ${repeatCount} times. Ask the user to review ` +
                    'the artifact requirements or provide missing information before rewriting.',
                  signalKind: decision.signalKind,
                  repeatCount,
                  runId: decision.runId,
                });
                break;
              }

              guidanceKinds.add(decision.signalKind);
              guidanceBlocks.push(
                `Repair the ${decision.artifactKind} artifact at ${decision.path}. ` +
                  `Resolve ${decision.issueCount} validation issue(s) before the next write.`,
              );
              break;
            }

            if (decision.signalKind === 'tool-failure') {
              const repeatCount = getRepeatCount(signalHistory, countSignals, {
                kind: 'tool-failure',
                observedAt: 0,
                toolCallId: decision.toolCallId,
                toolName: decision.toolName,
                error: decision.error,
                ...(decision.runId ? { runId: decision.runId } : {}),
              });
              if (repeatCount >= effectivePolicy.escalationThreshold) {
                actions.push({
                  kind: 'escalate-user',
                  message:
                    `Tool ${decision.toolName} failed ${repeatCount} times with "${decision.error}". ` +
                    'Ask the user whether to change strategy, grant permission, or adjust inputs.',
                  signalKind: decision.signalKind,
                  repeatCount,
                  ...(decision.runId ? { runId: decision.runId } : {}),
                });
                break;
              }

              guidanceKinds.add(decision.signalKind);
              guidanceBlocks.push(
                `Repair the failed tool step for ${decision.toolName}. ` +
                  `Diagnose the error "${decision.error}" and choose a safer fallback if needed.`,
              );
              break;
            }

            const repeatCount = getRepeatCount(signalHistory, countSignals, {
              kind: 'quality-check',
              observedAt: 0,
              toolCallId: decision.toolCallId,
              toolName: decision.toolName,
              ...(decision.mode ? { mode: decision.mode } : {}),
              totalScenes: decision.totalScenes,
              passed: Math.max(decision.totalScenes - decision.failed, 0),
              failed: decision.failed,
              failingSceneIndexes: decision.failingSceneIndexes,
              remediationCount: decision.remediationCount,
              ...(decision.runId ? { runId: decision.runId } : {}),
            });
            if (repeatCount >= effectivePolicy.escalationThreshold) {
              actions.push({
                kind: 'escalate-user',
                message:
                  `Quality check keeps failing for run ${decision.runId ?? 'unknown-run'} ` +
                  `(${repeatCount} time(s)). Ask the user whether to accept the current output ` +
                  'or revise the target quality bar.',
                signalKind: decision.signalKind,
                repeatCount,
                ...(decision.runId ? { runId: decision.runId } : {}),
              });
              break;
            }

            guidanceKinds.add(decision.signalKind);
            if (decision.mode === 'repair') {
              guidanceBlocks.push(
                `Review the quality repair attempt from ${decision.toolName}. ` +
                  `Focus on scene(s) ${decision.failingSceneIndexes.join(', ')} and verify ` +
                  `${decision.remediationCount} suggested remediation step(s) before any further repair.`,
              );
            } else {
              guidanceBlocks.push(
                `Repair the failing quality-check result. ` +
                  `Focus on scene(s) ${decision.failingSceneIndexes.join(', ')} and apply ` +
                  `${decision.remediationCount} suggested remediation step(s) as needed.`,
              );
            }
            break;
          }
          case 'self-evaluate':
            guidanceKinds.add(decision.signalKind);
            guidanceBlocks.push(
              'Before the next Apply step, perform a short self-evaluation: summarize what changed, ' +
                'what is still risky, and whether user confirmation is needed.',
            );
            break;
          case 'memorize':
            break;
          case 'continue':
            appendAgentFirstContinueGuidance(
              decision,
              effectivePolicy,
              guidanceBlocks,
              guidanceKinds,
            );
            break;
        }
      }

      if (guidanceBlocks.length > 0) {
        actions.unshift({
          kind: 'set-guidance',
          guidance: guidanceBlocks.map((block) => `- ${block}`).join('\n'),
          signalKinds: [...guidanceKinds],
        });
        return actions;
      }

      if (actions.length > 0) {
        return actions;
      }

      return [
        {
          kind: 'clear-guidance',
          reason: classifyClearReason(decisions),
        },
      ];
    },
  };
}

function appendAgentFirstContinueGuidance(
  decision: Extract<FeedbackDecision, { action: 'continue' }>,
  policy: Required<FeedbackControlPolicy>,
  guidanceBlocks: string[],
  guidanceKinds: Set<FeedbackSignal['kind']>,
): void {
  if (!('signalKind' in decision)) {
    return;
  }

  if (decision.signalKind === 'agent-observation') {
    const guidance = buildLowConfidenceEvidenceGuidance({
      subject: `AgentObservation ${decision.observationId}`,
      confidence: decision.confidence,
      evidenceCount: decision.evidenceIds.length,
      policy,
      requiresObservation: false,
    });
    if (guidance) {
      guidanceKinds.add(decision.signalKind);
      guidanceBlocks.push(guidance);
    }
    return;
  }

  if (decision.signalKind === 'subagent-review') {
    if (decision.recommendationIds.length > 0) {
      guidanceKinds.add(decision.signalKind);
      guidanceBlocks.push(
        `Subagent reviewer ${decision.reviewerId} returned ${decision.evidenceIds.length} evidence item(s) ` +
          `and ${decision.recommendationIds.length} recommendation(s) for request ${decision.requestId}. ` +
          'Treat them as review evidence only; the main Agent must form the final rationale before acting.',
      );
    }
    return;
  }

  if (decision.signalKind === 'decision-rationale') {
    const guidance = buildLowConfidenceEvidenceGuidance({
      subject: `DecisionRationale ${decision.rationaleId}`,
      confidence: decision.confidence,
      evidenceCount: decision.evidenceIds.length,
      policy,
      requiresObservation: policy.agentObservationRequired && decision.observationIds.length === 0,
      riskLevel: decision.riskLevel,
    });
    if (guidance) {
      guidanceKinds.add(decision.signalKind);
      guidanceBlocks.push(guidance);
    }
  }
}

function buildLowConfidenceEvidenceGuidance(input: {
  readonly subject: string;
  readonly confidence: AgentObservation['confidence'];
  readonly evidenceCount: number;
  readonly policy: Required<FeedbackControlPolicy>;
  readonly requiresObservation: boolean;
  readonly riskLevel?: NonNullable<DecisionRationale['risk']>['level'];
}): string | null {
  const needsEvidence =
    input.confidence === 'low' || input.confidence === 'unknown' || input.requiresObservation;
  if (!needsEvidence) {
    return null;
  }

  const riskPrefix =
    input.riskLevel === 'high'
      ? 'Do not perform high-risk or irreversible project-state mutation yet. '
      : '';
  const observationClause = input.requiresObservation
    ? 'Attach an AgentObservation before relying on this rationale. '
    : '';

  switch (input.policy.toolEvidenceMode) {
    case 'off':
      return (
        `${riskPrefix}${observationClause}${input.subject} has ${input.confidence} confidence. ` +
        'State the uncertainty and ask the user for clarification before risky mutation.'
      );
    case 'required-for-low-confidence':
      return (
        `${riskPrefix}${observationClause}${input.subject} has ${input.confidence} confidence ` +
        `with ${input.evidenceCount} attached evidence item(s). The arbiter is guidance-only: ` +
        'the Agent should attach evidence or obtain user confirmation before unsafe mutation.'
      );
    case 'optional':
      return (
        `${riskPrefix}${observationClause}${input.subject} has ${input.confidence} confidence. ` +
        'The Agent may attach optional tool, memory, subagent, or user evidence before proceeding.'
      );
  }
}

function getRepeatCount(
  history: readonly FeedbackSignal[],
  countSignals: ((signal: FeedbackSignal) => number) | undefined,
  signal: FeedbackSignal,
): number {
  if (countSignals) {
    return countSignals(signal);
  }

  const signature = signalSignature(signal);
  return countMatchingSignals(history, (entry) => signalSignature(entry) === signature);
}

function countMatchingSignals(
  history: readonly FeedbackSignal[],
  predicate: (signal: FeedbackSignal) => boolean,
): number {
  let count = 0;
  for (const signal of history) {
    if (predicate(signal)) {
      count += 1;
    }
  }
  return count;
}

function incrementSignalCount(counts: Map<string, number>, signature: string): void {
  counts.set(signature, (counts.get(signature) ?? 0) + 1);
}

function decrementSignalCount(counts: Map<string, number>, signature: string): void {
  const current = counts.get(signature);
  if (current === undefined) {
    return;
  }
  if (current <= 1) {
    counts.delete(signature);
    return;
  }
  counts.set(signature, current - 1);
}

function signalSignature(signal: FeedbackSignal): string {
  switch (signal.kind) {
    case 'artifact-invalid':
      return `artifact-invalid|${signal.runId}|${signal.path}`;
    case 'self-evaluation-requested':
      return `self-evaluation-requested|${signal.stage}`;
    case 'tool-failure':
      return `tool-failure|${signal.runId ?? ''}|${signal.toolName}`;
    case 'quality-check':
      return `quality-check|${signal.runId ?? ''}|${signal.toolCallId}`;
    case 'memory-extraction':
      return `memory-extraction|${signal.extraction.sourceEventIds.join(',')}|${signal.observedAt}`;
    case 'provider-card-observation':
      return `provider-card-observation|${signal.runId ?? ''}|${signal.toolCallId}|${signal.mode}|${signal.providerId ?? ''}|${signal.reason ?? ''}`;
    case 'agent-observation':
      return `agent-observation|${signal.runId ?? ''}|${signal.observation.id}`;
    case 'decision-rationale':
      return `decision-rationale|${signal.runId ?? ''}|${signal.rationale.id}`;
    case 'subagent-review':
      return `subagent-review|${signal.runId ?? ''}|${signal.review.requestId}|${signal.review.reviewerId}`;
  }
}

function classifyClearReason(
  decisions: readonly FeedbackDecision[],
): 'no-actionable-signal' | 'continue' | 'memorize' {
  if (decisions.every((decision) => decision.action === 'memorize')) {
    return 'memorize';
  }
  if (
    decisions.every((decision) => decision.action === 'continue' || decision.action === 'memorize')
  ) {
    return 'continue';
  }
  return 'no-actionable-signal';
}
