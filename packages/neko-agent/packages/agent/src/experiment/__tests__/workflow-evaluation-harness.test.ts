import { describe, expect, it } from 'vitest';
import type { ExperimentMetrics } from '../types';
import {
  MULTIMODAL_TOOL_CALL_FIXTURE,
  SKILL_INJECTION_FIXTURE,
  SUBAGENT_TASK_FIXTURE,
  createCapabilityEvolutionEvent,
  createPromptSchemaSnapshotRef,
  createUnifiedWorkflowEvaluationFixtures,
  createWorkflowMetricSnapshot,
  runWorkflowEvaluationHarness,
} from '../workflow-evaluation-harness';

function metrics(overrides: Partial<ExperimentMetrics> = {}): ExperimentMetrics {
  return {
    totalTokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    turns: [],
    iterations: 1,
    totalLatencyMs: 1000,
    toolSummary: {
      totalCalls: 2,
      successCount: 2,
      failureCount: 0,
      byTool: {},
    },
    custom: {},
    ...overrides,
  };
}

describe('workflow-evaluation-harness', () => {
  it('provides baseline fixtures for IDC, skill injection, prompt-chain, subagent, and multimodal tool calls', () => {
    expect(createUnifiedWorkflowEvaluationFixtures().map((fixture) => fixture.name)).toEqual([
      'idc-creation',
      'skill-injection',
      'workflow-prompt-chain',
      'subagent-task',
      'multimodal-tool-call',
    ]);
  });

  it('compares baseline against no-skill, no-subagent, no-multimodal, and no-dynamic-schema variants without Webview', () => {
    const baseline = {
      variantName: 'baseline',
      toggles: {},
      metrics: metrics(),
      promptSnapshot: createPromptSchemaSnapshotRef({
        variantName: 'baseline',
        promptHash: 'prompt-a',
        schemaHash: 'schema-a',
      }),
      evolutionEvents: [
        createCapabilityEvolutionEvent({
          kind: 'skill-install',
          capabilityId: 'skill:storyboard',
          version: '1.0.0',
          summary: 'Installed storyboard skill',
          createdAt: 1,
        }),
      ],
    };

    const result = runWorkflowEvaluationHarness({
      fixture: SKILL_INJECTION_FIXTURE,
      baseline,
      variants: [
        {
          variantName: 'no-skill-injection',
          toggles: { skillInjection: false },
          metrics: metrics({
            totalTokens: { promptTokens: 80, completionTokens: 45, totalTokens: 125 },
          }),
          promptSnapshot: createPromptSchemaSnapshotRef({
            variantName: 'no-skill-injection',
            promptHash: 'prompt-b',
            schemaHash: 'schema-a',
          }),
        },
        {
          variantName: 'no-dynamic-schema',
          toggles: { promptSchemaGenerator: false },
          metrics: metrics({
            toolSummary: { totalCalls: 1, successCount: 1, failureCount: 0, byTool: {} },
          }),
          promptSnapshot: createPromptSchemaSnapshotRef({
            variantName: 'no-dynamic-schema',
            promptHash: 'prompt-a',
            schemaHash: 'schema-b',
          }),
        },
      ],
    });

    expect(result.comparisons).toEqual([
      {
        variantName: 'no-skill-injection',
        tokenDelta: -25,
        latencyDeltaMs: 0,
        toolCallDelta: 0,
        promptHashChanged: true,
        omittedCapabilities: ['skillInjection'],
      },
      {
        variantName: 'no-dynamic-schema',
        tokenDelta: 0,
        latencyDeltaMs: 0,
        toolCallDelta: -1,
        promptHashChanged: false,
        omittedCapabilities: [],
      },
    ]);
    expect(result.evolutionEvents).toHaveLength(1);
  });

  it('records workflow metrics and evaluator outcomes', () => {
    const snapshot = createWorkflowMetricSnapshot({
      workflowRunId: 'run-1',
      workflowNodeId: 'node-1',
      nodeCompletions: 2,
      taskCompletions: 1,
      approvalInterruptions: 1,
      generatedArtifacts: 3,
      retries: 1,
      metrics: metrics({
        totalLatencyMs: 2500,
        custom: {
          evaluation: {
            score: 0.8,
            passed: true,
            reason: 'ok',
          },
        },
      }),
    });

    expect(snapshot).toMatchObject({
      workflowRunId: 'run-1',
      workflowNodeId: 'node-1',
      nodeCompletions: 2,
      taskCompletions: 1,
      approvalInterruptions: 1,
      generatedArtifacts: 3,
      retries: 1,
      latencyMs: 2500,
      toolCalls: 2,
      evaluatorOutcomes: [{ score: 0.8, passed: true, reason: 'ok' }],
    });
  });

  it('identifies omitted subagent and multimodal capabilities per fixture', () => {
    expect(
      runWorkflowEvaluationHarness({
        fixture: SUBAGENT_TASK_FIXTURE,
        baseline: { variantName: 'baseline', toggles: {}, metrics: metrics() },
        variants: [
          {
            variantName: 'no-subagent',
            toggles: { subagentOrchestration: false },
            metrics: metrics(),
          },
        ],
      }).comparisons[0]?.omittedCapabilities,
    ).toEqual(['subagentOrchestration']);

    expect(
      runWorkflowEvaluationHarness({
        fixture: MULTIMODAL_TOOL_CALL_FIXTURE,
        baseline: { variantName: 'baseline', toggles: {}, metrics: metrics() },
        variants: [
          {
            variantName: 'no-multimodal-context',
            toggles: { multimodalContext: false },
            metrics: metrics(),
          },
        ],
      }).comparisons[0]?.omittedCapabilities,
    ).toEqual(['multimodalContext']);
  });
});
