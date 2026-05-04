import type {
  AblationToggles,
  CapabilityEvolutionEvent,
  ExperimentMetrics,
  PromptSchemaSnapshotRef,
  WorkflowEvaluationComparison,
  WorkflowEvaluationFixture,
  WorkflowEvaluationHarnessInput,
  WorkflowEvaluationHarnessResult,
  WorkflowEvaluationVariantInput,
  WorkflowEvaluatorInput,
  WorkflowEvaluatorProviderIdentity,
  WorkflowEvaluatorResult,
  WorkflowEvaluatorRunner,
  WorkflowJudgeAdapter,
  WorkflowMetricSnapshot,
} from './types';

export const IDC_CREATION_FIXTURE: WorkflowEvaluationFixture = {
  name: 'idc-creation',
  prompt: 'Create a short launch video with draft, plan, and apply stages.',
  workflowRunId: 'fixture-idc-run',
  workflowNodeId: 'draft',
  expectedCapabilities: ['idcWorkflow', 'promptSchemaGenerator'],
  expectedModalities: ['text'],
};

export const SKILL_INJECTION_FIXTURE: WorkflowEvaluationFixture = {
  name: 'skill-injection',
  prompt: 'Use the storyboard skill to design a shot sequence.',
  workflowRunId: 'fixture-skill-run',
  workflowNodeId: 'plan',
  expectedCapabilities: ['skillInjection', 'capabilityProtocol'],
  expectedModalities: ['text'],
};

export const PROMPT_CHAIN_WORKFLOW_FIXTURE: WorkflowEvaluationFixture = {
  name: 'workflow-prompt-chain',
  prompt: 'Run a prompt-chain workflow for story ideation and revision.',
  workflowRunId: 'fixture-chain-run',
  workflowNodeId: 'prompt-chain',
  expectedCapabilities: ['promptSchemaGenerator', 'idcWorkflow'],
  expectedModalities: ['text'],
};

export const SUBAGENT_TASK_FIXTURE: WorkflowEvaluationFixture = {
  name: 'subagent-task',
  prompt: 'Ask a reviewer subagent to check the plan before applying.',
  workflowRunId: 'fixture-subagent-run',
  workflowNodeId: 'review',
  expectedCapabilities: ['subagentOrchestration'],
  expectedModalities: ['text'],
};

export const MULTIMODAL_TOOL_CALL_FIXTURE: WorkflowEvaluationFixture = {
  name: 'multimodal-tool-call',
  prompt: 'Analyze this image and timeline selection before generating repair tasks.',
  workflowRunId: 'fixture-mm-run',
  workflowNodeId: 'evidence',
  expectedCapabilities: ['multimodalContext', 'dynamicToolSets'],
  expectedModalities: ['image', 'video'],
};

export function createUnifiedWorkflowEvaluationFixtures(): readonly WorkflowEvaluationFixture[] {
  return [
    IDC_CREATION_FIXTURE,
    SKILL_INJECTION_FIXTURE,
    PROMPT_CHAIN_WORKFLOW_FIXTURE,
    SUBAGENT_TASK_FIXTURE,
    MULTIMODAL_TOOL_CALL_FIXTURE,
  ];
}

export function createWorkflowMetricSnapshot(input: {
  readonly workflowRunId?: string;
  readonly workflowNodeId?: string;
  readonly metrics: ExperimentMetrics;
  readonly nodeCompletions?: number;
  readonly taskCompletions?: number;
  readonly approvalInterruptions?: number;
  readonly generatedArtifacts?: number;
  readonly retries?: number;
}): WorkflowMetricSnapshot {
  return {
    workflowRunId: input.workflowRunId,
    workflowNodeId: input.workflowNodeId,
    nodeCompletions: input.nodeCompletions ?? 0,
    taskCompletions: input.taskCompletions ?? 0,
    approvalInterruptions: input.approvalInterruptions ?? 0,
    generatedArtifacts: input.generatedArtifacts ?? 0,
    retries: input.retries ?? 0,
    latencyMs: input.metrics.totalLatencyMs,
    toolCalls: input.metrics.toolSummary.totalCalls,
    evaluatorOutcomes: readEvaluatorOutcomes(input.metrics),
  };
}

export function createPromptSchemaSnapshotRef(
  input: PromptSchemaSnapshotRef,
): PromptSchemaSnapshotRef {
  return { ...input };
}

export function createCapabilityEvolutionEvent(
  input: Omit<CapabilityEvolutionEvent, 'id' | 'createdAt'> & {
    readonly id?: string;
    readonly createdAt?: number;
  },
): CapabilityEvolutionEvent {
  return {
    id: input.id ?? `${input.kind}:${input.capabilityId ?? 'global'}:${input.version ?? 'next'}`,
    kind: input.kind,
    summary: input.summary,
    createdAt: input.createdAt ?? Date.now(),
    ...(input.capabilityId ? { capabilityId: input.capabilityId } : {}),
    ...(input.version ? { version: input.version } : {}),
  };
}

export function runWorkflowEvaluationHarness(
  input: WorkflowEvaluationHarnessInput,
): WorkflowEvaluationHarnessResult {
  const baselineEvaluatorResults = input.baseline.evaluatorResults ?? [];
  const variantEvaluatorResults = input.variants.flatMap(
    (variant) => variant.evaluatorResults ?? [],
  );
  const comparisons = input.variants.map((variant) =>
    compareVariant(input.fixture, input.baseline, variant),
  );
  return {
    fixture: input.fixture,
    baseline: input.baseline,
    variants: input.variants,
    comparisons,
    evolutionEvents: [
      ...(input.baseline.evolutionEvents ?? []),
      ...input.variants.flatMap((variant) => variant.evolutionEvents ?? []),
    ],
    evaluatorResults: [...baselineEvaluatorResults, ...variantEvaluatorResults],
  };
}

export async function runWorkflowEvaluationHarnessWithEvaluators(
  input: WorkflowEvaluationHarnessInput,
): Promise<WorkflowEvaluationHarnessResult> {
  const baselineEvaluatorResults = await runEvaluatorsForVariant(input, input.baseline);
  const variants = await Promise.all(
    input.variants.map(async (variant) => ({
      ...variant,
      evaluatorResults: [
        ...(variant.evaluatorResults ?? []),
        ...(await runEvaluatorsForVariant(input, variant)),
      ],
    })),
  );
  return runWorkflowEvaluationHarness({
    ...input,
    baseline: {
      ...input.baseline,
      evaluatorResults: [...(input.baseline.evaluatorResults ?? []), ...baselineEvaluatorResults],
    },
    variants,
  });
}

export function createDeterministicAssetComplianceEvaluator(
  options: {
    readonly id?: string;
    readonly requiredArtifactTypes?: readonly string[];
    readonly minGeneratedArtifacts?: number;
    readonly minScore?: number;
  } = {},
): WorkflowEvaluatorRunner {
  const evaluatorId = options.id ?? 'deterministic-asset-compliance';
  return {
    id: evaluatorId,
    evaluate(input) {
      const requiredArtifactTypes =
        options.requiredArtifactTypes && options.requiredArtifactTypes.length > 0
          ? options.requiredArtifactTypes
          : (input.fixture.expectedModalities ?? []);
      const generatedArtifacts = input.variant.metrics.toolSummary.successCount;
      const missingTypes = requiredArtifactTypes.filter(
        (type) => !input.artifacts?.some((artifact) => artifact.type === type),
      );
      const hasEnoughArtifacts = generatedArtifacts >= (options.minGeneratedArtifacts ?? 1);
      const passed = missingTypes.length === 0 && hasEnoughArtifacts;
      const score = passed ? 1 : missingTypes.length > 0 ? 0.4 : 0.7;
      return createWorkflowEvaluatorResult({
        id: `${evaluatorId}:${input.variant.variantName}`,
        evaluatorId,
        kind: 'deterministic',
        score,
        passed: score >= (options.minScore ?? 0.8) && passed,
        reasons: [
          missingTypes.length > 0
            ? `Missing artifact types: ${missingTypes.join(', ')}`
            : 'Required artifact types present.',
          hasEnoughArtifacts
            ? 'Generated artifact count satisfies fixture expectation.'
            : 'Generated artifact count is below fixture expectation.',
        ],
        evidenceRefs: input.evidenceRefs ?? [],
        metrics: {
          generatedArtifacts,
          missingTypeCount: missingTypes.length,
        },
        workflowRunId: input.fixture.workflowRunId,
        workflowNodeId: input.fixture.workflowNodeId,
        promptSnapshot: input.promptSnapshot,
      });
    },
  };
}

export function createMockLlmJudgeAdapter(
  options: {
    readonly id?: string;
    readonly provider?: WorkflowEvaluatorProviderIdentity;
    readonly score?: number;
    readonly passed?: boolean;
    readonly reason?: string;
  } = {},
): WorkflowJudgeAdapter {
  const adapterId = options.id ?? 'mock-llm-judge';
  return {
    id: adapterId,
    judge(input) {
      const score = options.score ?? 0.86;
      const passed = options.passed ?? score >= 0.8;
      return createWorkflowEvaluatorResult({
        id: `${adapterId}:${input.variant.variantName}`,
        evaluatorId: adapterId,
        kind: 'llm-judge',
        score,
        passed,
        reasons: [options.reason ?? 'Mock judge result from schema-bound adapter.'],
        evidenceRefs: input.evidenceRefs ?? [],
        metrics: { score },
        provider: options.provider ?? {
          providerId: 'mock-provider',
          modelId: 'mock-judge-model',
          variantId: input.variant.variantName,
        },
        workflowRunId: input.fixture.workflowRunId,
        workflowNodeId: input.fixture.workflowNodeId,
        promptSnapshot: input.promptSnapshot,
      });
    },
  };
}

export function createJudgeEvaluatorRunner(adapter: WorkflowJudgeAdapter): WorkflowEvaluatorRunner {
  return {
    id: adapter.id,
    evaluate: (input) => adapter.judge(input),
  };
}

function compareVariant(
  fixture: WorkflowEvaluationFixture,
  baseline: WorkflowEvaluationVariantInput,
  variant: WorkflowEvaluationVariantInput,
): WorkflowEvaluationComparison {
  const baselineQuality = averageEvaluatorScore(baseline.evaluatorResults);
  const variantQuality = averageEvaluatorScore(variant.evaluatorResults);
  const qualityDelta =
    baselineQuality !== undefined && variantQuality !== undefined
      ? roundMetric(variantQuality - baselineQuality)
      : undefined;
  const correctionHints = (variant.evaluatorResults ?? []).flatMap(
    (result) => result.correctionHints,
  );
  const recoverySignals = (variant.evaluatorResults ?? []).flatMap(
    (result) => result.recoverySignals,
  );
  return {
    variantName: variant.variantName,
    tokenDelta: variant.metrics.totalTokens.totalTokens - baseline.metrics.totalTokens.totalTokens,
    latencyDeltaMs: variant.metrics.totalLatencyMs - baseline.metrics.totalLatencyMs,
    toolCallDelta: variant.metrics.toolSummary.totalCalls - baseline.metrics.toolSummary.totalCalls,
    promptHashChanged:
      Boolean(variant.promptSnapshot?.promptHash) &&
      variant.promptSnapshot?.promptHash !== baseline.promptSnapshot?.promptHash,
    omittedCapabilities: readOmittedCapabilities(fixture, variant.toggles),
    ...(qualityDelta !== undefined ? { qualityDelta } : {}),
    ...(correctionHints.length > 0 ? { correctionHints } : {}),
    ...(recoverySignals.length > 0 ? { recoverySignals } : {}),
  };
}

async function runEvaluatorsForVariant(
  input: WorkflowEvaluationHarnessInput,
  variant: WorkflowEvaluationVariantInput,
): Promise<readonly WorkflowEvaluatorResult[]> {
  if (!input.evaluators || input.evaluators.length === 0) {
    return [];
  }
  const evaluatorInput: WorkflowEvaluatorInput = {
    fixture: input.fixture,
    variant,
    promptSnapshot: variant.promptSnapshot,
  };
  return Promise.all(input.evaluators.map((evaluator) => evaluator.evaluate(evaluatorInput)));
}

function createWorkflowEvaluatorResult(input: {
  readonly id: string;
  readonly evaluatorId: string;
  readonly kind: WorkflowEvaluatorResult['kind'];
  readonly score: number;
  readonly passed: boolean;
  readonly reasons: readonly string[];
  readonly evidenceRefs: WorkflowEvaluatorResult['evidenceRefs'];
  readonly metrics: WorkflowEvaluatorResult['metrics'];
  readonly workflowRunId?: string;
  readonly workflowNodeId?: string;
  readonly provider?: WorkflowEvaluatorProviderIdentity;
  readonly promptSnapshot?: WorkflowEvaluatorInput['promptSnapshot'];
}): WorkflowEvaluatorResult {
  const correctionHints = input.passed
    ? []
    : [
        {
          id: `${input.id}:hint`,
          message: input.reasons[0] ?? 'Evaluator reported a quality issue.',
          ...(input.workflowNodeId ? { targetNodeId: input.workflowNodeId } : {}),
          severity: 'warning' as const,
        },
      ];
  const recoverySignals = input.passed
    ? []
    : [
        {
          id: `${input.id}:recovery`,
          action: 'retry-node' as const,
          reason: correctionHints[0]?.message ?? 'Retry node after evaluator failure.',
          ...(input.workflowNodeId ? { targetNodeId: input.workflowNodeId } : {}),
          correctionHintIds: correctionHints.map((hint) => hint.id),
          workflow: {
            workflowDefinitionId: 'evaluation',
            workflowRunId: input.workflowRunId ?? 'unknown-run',
            workflowNodeId: input.workflowNodeId ?? 'unknown-node',
          },
        },
      ];

  return {
    id: input.id,
    evaluatorId: input.evaluatorId,
    kind: input.kind,
    score: input.score,
    passed: input.passed,
    reason: input.reasons.join(' '),
    reasons: input.reasons,
    evidenceRefs: input.evidenceRefs,
    metrics: input.metrics,
    correctionHints,
    recoverySignals,
    ...(input.workflowRunId || input.workflowNodeId
      ? {
          workflow: {
            workflowDefinitionId: 'evaluation',
            workflowRunId: input.workflowRunId ?? 'unknown-run',
            workflowNodeId: input.workflowNodeId ?? 'unknown-node',
          },
        }
      : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.promptSnapshot
      ? {
          promptSnapshot: {
            promptHash: input.promptSnapshot.promptHash,
            schemaHash: input.promptSnapshot.schemaHash,
            snapshotRef: input.promptSnapshot.snapshotRef,
          },
        }
      : {}),
  };
}

function averageEvaluatorScore(
  results: readonly WorkflowEvaluatorResult[] | undefined,
): number | undefined {
  if (!results || results.length === 0) {
    return undefined;
  }
  return results.reduce((sum, result) => sum + result.score, 0) / results.length;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function readOmittedCapabilities(
  fixture: WorkflowEvaluationFixture,
  toggles: AblationToggles,
): readonly string[] {
  return (fixture.expectedCapabilities ?? []).filter((capability) => {
    switch (capability) {
      case 'skillInjection':
        return toggles.skillInjection === false;
      case 'dynamicToolSets':
        return toggles.dynamicToolSets === false;
      case 'idcWorkflow':
        return toggles.idcWorkflow === false;
      case 'capabilityProtocol':
        return toggles.capabilityProtocol === false;
      case 'promptSchemaGenerator':
        return toggles.promptSchemaGenerator === false;
      case 'subagentOrchestration':
        return toggles.subagentOrchestration === false;
      case 'multimodalContext':
        return toggles.multimodalContext === false;
      default:
        return false;
    }
  });
}

function readEvaluatorOutcomes(metrics: ExperimentMetrics) {
  const evaluation = metrics.custom['evaluation'];
  if (Array.isArray(evaluation)) {
    return evaluation;
  }
  return evaluation && typeof evaluation === 'object' ? [evaluation] : [];
}
