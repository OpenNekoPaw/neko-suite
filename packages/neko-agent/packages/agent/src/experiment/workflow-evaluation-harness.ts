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
  };
}

function compareVariant(
  fixture: WorkflowEvaluationFixture,
  baseline: WorkflowEvaluationVariantInput,
  variant: WorkflowEvaluationVariantInput,
): WorkflowEvaluationComparison {
  return {
    variantName: variant.variantName,
    tokenDelta: variant.metrics.totalTokens.totalTokens - baseline.metrics.totalTokens.totalTokens,
    latencyDeltaMs: variant.metrics.totalLatencyMs - baseline.metrics.totalLatencyMs,
    toolCallDelta: variant.metrics.toolSummary.totalCalls - baseline.metrics.toolSummary.totalCalls,
    promptHashChanged:
      Boolean(variant.promptSnapshot?.promptHash) &&
      variant.promptSnapshot?.promptHash !== baseline.promptSnapshot?.promptHash,
    omittedCapabilities: readOmittedCapabilities(fixture, variant.toggles),
  };
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
