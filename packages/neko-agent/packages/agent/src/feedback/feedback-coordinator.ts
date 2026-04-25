import type { AgentContext, ChatMessage, ExecutorHooks, IProjectMemoryManager } from '@neko/shared';
import type { ArtifactKind, ExecutionArtifactInvalidEvent, IdcStage } from '@neko-agent/types';
import { EXECUTION_CHANNELS } from '@neko-agent/types';
import type { IEventBus } from '../events';
import type { StageTracker } from '../skill/stage-tracker';
import { createArtifactObservationHooks } from '../artifact/artifact-observation-hooks';
import { SelfEvaluationHooks } from '../evaluation/self-evaluation-hooks';
import { KeyFactExtractor } from '../memory/keyfact-extractor';
import { ProjectMemoryRouter } from '../memory/project-memory-router';

// =============================================================================
// Types
// =============================================================================

export interface FeedbackCoordinatorConfig {
  readonly eventBus?: IEventBus | null;
  readonly stageTracker?: StageTracker | null;
  readonly projectMemoryManager?: IProjectMemoryManager;
  readonly autoMemoryExtraction?: boolean;
  readonly journalAsSSOT?: boolean;
  readonly evaluators?: readonly IFeedbackEvaluator[];
  readonly arbiter?: IFeedbackArbiter;
  readonly controlPolicy?: FeedbackControlPolicy;
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
      readonly toolName: 'QualityCheck';
      readonly totalScenes: number;
      readonly passed: number;
      readonly failed: number;
      readonly failingSceneIndexes: readonly number[];
      readonly remediationCount: number;
      readonly runId?: string;
    }
  | {
      readonly kind: 'memory-extraction';
      readonly observedAt: number;
      readonly extraction: FeedbackMemoryExtractionResult;
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
      readonly toolName: 'QualityCheck';
      readonly totalScenes: number;
      readonly failed: number;
      readonly failingSceneIndexes: readonly number[];
      readonly remediationCount: number;
      readonly runId?: string;
    }
  | {
      readonly action: 'continue';
      readonly signalKind: 'quality-check';
      readonly toolCallId: string;
      readonly toolName: 'QualityCheck';
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
      readonly reason: 'no-actionable-signal';
    };

export interface FeedbackControlPolicy {
  /**
   * Number of repeated repair-class feedback observations before the control
   * layer stops silently suggesting self-repair and instead tells the agent to
   * escalate the issue back to the user.
   */
  readonly escalationThreshold?: number;
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

class FeedbackCoordinator implements IFeedbackCoordinator {
  private readonly _beforeThinkHooks: readonly ExecutorHooks[];
  private readonly _keyFactExtractor: KeyFactExtractor | null;
  private readonly _projectMemoryRouter: ProjectMemoryRouter | null;
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
    this._evaluators =
      config.evaluators && config.evaluators.length > 0
        ? [...config.evaluators]
        : [createDefaultFeedbackEvaluator()];
    this._arbiter = config.arbiter ?? createDefaultFeedbackArbiter(config.controlPolicy);
    this._artifactInvalidUnsubscribe =
      config.eventBus?.on(EXECUTION_CHANNELS.ARTIFACT_INVALID, (event) => {
        this.observe(feedbackSignalFromArtifactInvalidEvent(event));
      }) ?? null;

    if (
      config.projectMemoryManager &&
      config.autoMemoryExtraction !== false &&
      config.journalAsSSOT !== false
    ) {
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
                totalScenes: signal.totalScenes,
                failed: signal.failed,
                failingSceneIndexes: [...signal.failingSceneIndexes],
                remediationCount: signal.remediationCount,
                ...(signal.runId ? { runId: signal.runId } : {}),
              });
              break;
            }
            decisions.push({
              action: 'continue',
              signalKind: signal.kind,
              toolCallId: signal.toolCallId,
              toolName: signal.toolName,
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
            guidanceBlocks.push(
              `Repair the failing quality-check result. ` +
                `Focus on scene(s) ${decision.failingSceneIndexes.join(', ')} and apply ` +
                `${decision.remediationCount} suggested remediation step(s) as needed.`,
            );
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
