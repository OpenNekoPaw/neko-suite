import type {
  AgentContext,
  AgentFeedbackArbiter as IValidationArbiter,
  AgentFeedbackControlPolicy as ValidationPolicy,
  AgentFeedbackCoordinator as IValidationCoordinator,
  AgentFeedbackCoordinatorFactory as AgentValidationCoordinatorFactory,
  AgentFeedbackCycle as ValidationCycle,
  AgentFeedbackDecision as ValidationDecision,
  AgentFeedbackEvaluationContext as ValidationEvaluationContext,
  AgentFeedbackEvaluator as IValidationEvaluator,
  AgentFeedbackFlowAction as ValidationFlowAction,
  AgentFeedbackMemoryExtractionInput as ValidationMemoryExtractionInput,
  AgentFeedbackMemoryExtractionOutcome as ValidationMemoryExtractionOutcome,
  AgentFeedbackMemoryExtractionResult as ValidationMemoryExtractionResult,
  AgentFeedbackMemoryExtractionSkipped as ValidationMemoryExtractionSkipped,
  AgentFeedbackSignal as ValidationSignal,
  AgentObservation,
  AgentProviderExpressionConceptDecision as ProviderExpressionConceptDecision,
  DecisionRationale,
  ExecutorHooks,
  IProjectMemoryManager,
} from '@neko/shared';
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
    signal: Extract<ValidationSignal, { kind: 'provider-card-observation' }>,
  ): Promise<unknown>;
}

export interface ValidationLogger {
  warn(message: string, metadata?: Record<string, unknown>): void;
}

export interface ValidationCoordinatorConfig {
  readonly projectMemoryManager?: IProjectMemoryManager;
  readonly autoMemoryExtraction?: boolean;
  readonly evaluators?: readonly IValidationEvaluator[];
  readonly arbiter?: IValidationArbiter;
  readonly validationPolicy?: ValidationPolicy;
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
  readonly logger?: ValidationLogger;
  readonly now?: () => number;
}

export interface ValidationCoordinatorFactoryConfig extends Omit<
  ValidationCoordinatorConfig,
  'projectMemoryManager' | 'autoMemoryExtraction'
> {}

export type {
  ValidationPolicy,
  ValidationCycle,
  ValidationDecision,
  ValidationEvaluationContext,
  ValidationFlowAction,
  ValidationMemoryExtractionInput,
  ValidationMemoryExtractionOutcome,
  ValidationMemoryExtractionResult,
  ValidationMemoryExtractionSkipped,
  ValidationSignal,
  IValidationArbiter,
  IValidationCoordinator,
  IValidationEvaluator,
  ProviderExpressionConceptDecision,
};

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

class ValidationCoordinator implements IValidationCoordinator {
  private readonly _beforeThinkHooks: readonly ExecutorHooks[];
  private readonly _keyFactExtractor: KeyFactExtractor | null;
  private readonly _projectMemoryRouter: ProjectMemoryRouter | null;
  private readonly _providerCardProjectRouter: IProviderCardProjectRouter | null;
  private readonly _logger: ValidationLogger | null;
  private readonly _evaluators: readonly IValidationEvaluator[];
  private readonly _arbiter: IValidationArbiter;
  private readonly _now: () => number;
  private readonly _pendingSignals: ValidationSignal[] = [];
  private readonly _signalHistory: ValidationSignal[] = [];
  private readonly _signalCounts = new Map<string, number>();
  private readonly _decisionHistory: ValidationDecision[] = [];
  private readonly _actionHistory: ValidationFlowAction[] = [];
  constructor(config: ValidationCoordinatorConfig) {
    this._beforeThinkHooks = [];
    this._now = config.now ?? (() => Date.now());
    this._logger = config.logger ?? null;
    this._evaluators =
      config.evaluators && config.evaluators.length > 0
        ? [...config.evaluators]
        : [createDefaultValidationEvaluator()];
    this._arbiter = config.arbiter ?? createDefaultValidationArbiter(config.validationPolicy);
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

  observe(signal: ValidationSignal): void {
    this._pendingSignals.push(signal);
    this._signalHistory.push(signal);
    incrementSignalCount(this._signalCounts, signalSignature(signal));
    for (const evicted of trimHistory(this._signalHistory)) {
      decrementSignalCount(this._signalCounts, signalSignature(evicted));
    }
  }

  evaluatePending(context: ValidationEvaluationContext = {}): ValidationCycle | null {
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
      ...(context.activeRunId !== undefined ? { activeRunId: context.activeRunId } : {}),
    };
  }

  private async _writeProviderCardObservations(
    signals: readonly ValidationSignal[],
  ): Promise<void> {
    if (!this._providerCardProjectRouter) {
      return;
    }

    for (const signal of signals) {
      if (signal.kind === 'provider-card-observation') {
        await this._providerCardProjectRouter.writeObservation(signal);
      }
    }
  }

  getSignalHistory(): readonly ValidationSignal[] {
    return this._signalHistory;
  }

  getDecisionHistory(): readonly ValidationDecision[] {
    return this._decisionHistory;
  }

  getActionHistory(): readonly ValidationFlowAction[] {
    return this._actionHistory;
  }

  async extractMemory(
    input: ValidationMemoryExtractionInput,
  ): Promise<ValidationMemoryExtractionOutcome> {
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
    const extraction: ValidationMemoryExtractionResult = {
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
    // The coordinator owns no external subscriptions.
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createValidationCoordinator(
  config: ValidationCoordinatorConfig,
): IValidationCoordinator {
  return new ValidationCoordinator(config);
}

export function createValidationCoordinatorFactory(
  config: ValidationCoordinatorFactoryConfig = {},
): AgentValidationCoordinatorFactory {
  const configuredProviderCardProject = config.providerCardProject;
  return (runtime) =>
    createValidationCoordinator({
      ...config,
      providerCardProject:
        configuredProviderCardProject ??
        (runtime.workspace
          ? {
              workspaceRoot: runtime.workspace.root,
              fsOps: runtime.workspace.fsOps,
            }
          : undefined),
      projectMemoryManager: runtime.projectMemoryManager,
      autoMemoryExtraction: runtime.autoMemoryExtraction,
      validationPolicy: runtime.controlPolicy ?? config.validationPolicy,
    });
}

// =============================================================================
// Hook composition helper
// =============================================================================

export function composeBeforeThinkHooks(
  base: ExecutorHooks,
  validationHooks: readonly ExecutorHooks[],
): ExecutorHooks {
  const beforeThinkChain: Array<(ctx: AgentContext) => Promise<AgentContext | void>> = [];
  if (base.beforeThink) {
    beforeThinkChain.push((ctx) => base.beforeThink!(ctx));
  }
  for (const hook of validationHooks) {
    if (hook.beforeThink) {
      beforeThinkChain.push((ctx) => hook.beforeThink!(ctx));
    }
  }

  if (beforeThinkChain.length <= 1) {
    return base;
  }

  const nameSuffix = validationHooks
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

const VALIDATION_HISTORY_CAP = 64;

function trimHistory<T>(history: T[]): readonly T[] {
  if (history.length > VALIDATION_HISTORY_CAP) {
    return history.splice(0, history.length - VALIDATION_HISTORY_CAP);
  }

  return [];
}

const DEFAULT_VALIDATION_POLICY: Required<ValidationPolicy> = {
  escalationThreshold: 2,
  agentObservationRequired: false,
  toolEvidenceMode: 'optional',
};

function createDefaultValidationEvaluator(): IValidationEvaluator {
  return {
    id: 'default-validation-evaluator',
    evaluate: ({ signals }) => {
      const decisions: ValidationDecision[] = [];

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
          case 'tool-review':
            if (signal.status === 'failed') {
              decisions.push({
                action: 'repair',
                signalKind: signal.kind,
                toolCallId: signal.toolCallId,
                toolName: signal.toolName,
                summary: signal.summary,
                ...(signal.repairGuidance ? { repairGuidance: signal.repairGuidance } : {}),
                ...(signal.escalationMessage
                  ? { escalationMessage: signal.escalationMessage }
                  : {}),
                ...(signal.repeatKey ? { repeatKey: signal.repeatKey } : {}),
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
              summary: signal.summary,
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

function createDefaultValidationArbiter(policy: ValidationPolicy | undefined): IValidationArbiter {
  const effectivePolicy = {
    ...DEFAULT_VALIDATION_POLICY,
    ...(policy ?? {}),
  };

  return {
    id: 'default-validation-arbiter',
    decide: ({ signals, decisions, signalHistory, countSignals }) => {
      const guidanceBlocks: string[] = [];
      const guidanceKinds = new Set<ValidationSignal['kind']>();
      const actions: ValidationFlowAction[] = [];

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
                  `Diagnose the error "${decision.error}" and choose a safer substitute if needed.`,
              );
              break;
            }

            const repeatCount = getRepeatCount(signalHistory, countSignals, {
              kind: 'tool-review',
              observedAt: 0,
              toolCallId: decision.toolCallId,
              toolName: decision.toolName,
              status: 'failed',
              summary: decision.summary,
              ...(decision.repairGuidance ? { repairGuidance: decision.repairGuidance } : {}),
              ...(decision.escalationMessage
                ? { escalationMessage: decision.escalationMessage }
                : {}),
              ...(decision.repeatKey ? { repeatKey: decision.repeatKey } : {}),
              ...(decision.runId ? { runId: decision.runId } : {}),
            });
            if (repeatCount >= effectivePolicy.escalationThreshold) {
              actions.push({
                kind: 'escalate-user',
                message:
                  decision.escalationMessage ??
                  `Tool review for ${decision.toolName} failed ${repeatCount} time(s). ` +
                    'Ask the user whether to accept the current output or change strategy.',
                signalKind: decision.signalKind,
                repeatCount,
                ...(decision.runId ? { runId: decision.runId } : {}),
              });
              break;
            }

            guidanceKinds.add(decision.signalKind);
            guidanceBlocks.push(
              decision.repairGuidance ??
                `Review the failed result from ${decision.toolName}: ${decision.summary}`,
            );
            break;
          }
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
  decision: Extract<ValidationDecision, { action: 'continue' }>,
  policy: Required<ValidationPolicy>,
  guidanceBlocks: string[],
  guidanceKinds: Set<ValidationSignal['kind']>,
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
  readonly policy: Required<ValidationPolicy>;
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
  history: readonly ValidationSignal[],
  countSignals: ((signal: ValidationSignal) => number) | undefined,
  signal: ValidationSignal,
): number {
  if (countSignals) {
    return countSignals(signal);
  }

  const signature = signalSignature(signal);
  return countMatchingSignals(history, (entry) => signalSignature(entry) === signature);
}

function countMatchingSignals(
  history: readonly ValidationSignal[],
  predicate: (signal: ValidationSignal) => boolean,
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

function signalSignature(signal: ValidationSignal): string {
  switch (signal.kind) {
    case 'artifact-invalid':
      return `artifact-invalid|${signal.runId}|${signal.path}`;
    case 'tool-failure':
      return `tool-failure|${signal.runId ?? ''}|${signal.toolName}`;
    case 'tool-review':
      return `tool-review|${signal.runId ?? ''}|${signal.repeatKey ?? signal.toolName}`;
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
  decisions: readonly ValidationDecision[],
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
