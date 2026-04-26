import { describe, expect, it, vi } from 'vitest';
import {
  createSubagentReviewEvidence,
  type AgentObservation,
  type ChatMessage,
  type DecisionRationale,
  type IProjectMemoryManager,
  type PerceptionEvidence,
} from '@neko/shared';
import { EXECUTION_CHANNELS } from '@neko-agent/types';
import { createEventBus } from '../../events';
import { createStageTracker } from '../../skill';
import { createFeedbackCoordinator } from '../feedback-coordinator';

function createMockProjectMemory(initialContent: string | null = null): IProjectMemoryManager {
  let content = initialContent;

  return {
    load: vi.fn().mockResolvedValue(undefined),
    getContent: vi.fn(() => content),
    upsertEntry: vi.fn(async (key: string, body: string) => {
      const sections = parseSections(content);
      const next = new Map(sections.map((section) => [section.key, section.body]));
      next.set(key, body);
      content = Array.from(next.entries())
        .map(([sectionKey, sectionBody]) =>
          sectionBody.trim().length > 0
            ? `## ${sectionKey}\n${sectionBody.trimEnd()}`
            : `## ${sectionKey}`,
        )
        .join('\n\n');
      if (content) {
        content += '\n';
      }
    }),
    removeEntry: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
  };
}

function parseSections(content: string | null): Array<{ key: string; body: string }> {
  if (!content) return [];

  const lines = content.split('\n');
  const sections: Array<{ key: string; body: string }> = [];
  let currentKey: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentKey !== null) {
        sections.push({ key: currentKey, body: currentLines.join('\n') });
      }
      currentKey = line.slice(3).trim();
      currentLines = [];
    } else if (currentKey !== null) {
      currentLines.push(line);
    }
  }

  if (currentKey !== null) {
    sections.push({ key: currentKey, body: currentLines.join('\n') });
  }

  return sections;
}

describe('FeedbackCoordinator', () => {
  it('assembles artifact observation and self-evaluation hooks from runtime deps', () => {
    const coordinator = createFeedbackCoordinator({
      eventBus: createEventBus(),
      stageTracker: createStageTracker({ initialStage: 'apply' }),
    });

    expect(coordinator.getBeforeThinkHooks().map((hook) => hook.name)).toEqual([
      'artifact-observation',
      'self-evaluation',
    ]);
  });

  it('observes artifact invalidation events and evaluates them into repair decisions', () => {
    const eventBus = createEventBus();
    const coordinator = createFeedbackCoordinator({
      eventBus,
      now: () => 9,
    });

    eventBus.emit({
      channel: EXECUTION_CHANNELS.ARTIFACT_INVALID,
      runId: 'run-1',
      kind: 'plan',
      path: '/tmp/proj/.neko/plans/plan-run-1.md',
      issues: [
        {
          code: 'missing-field',
          field: 'title',
          message: 'title is required',
        },
      ],
      at: 7,
    });

    const cycle = coordinator.evaluatePending({
      currentStage: 'plan',
      activeRunId: 'run-1',
    });

    expect(cycle).toEqual({
      timestamp: 9,
      currentStage: 'plan',
      activeRunId: 'run-1',
      signals: [
        {
          kind: 'artifact-invalid',
          observedAt: 7,
          runId: 'run-1',
          artifactKind: 'plan',
          path: '/tmp/proj/.neko/plans/plan-run-1.md',
          issues: [
            {
              code: 'missing-field',
              field: 'title',
              message: 'title is required',
            },
          ],
        },
      ],
      decisions: [
        {
          action: 'repair',
          signalKind: 'artifact-invalid',
          runId: 'run-1',
          artifactKind: 'plan',
          path: '/tmp/proj/.neko/plans/plan-run-1.md',
          issueCount: 1,
        },
      ],
      actions: [
        {
          kind: 'set-guidance',
          guidance:
            '- Repair the plan artifact at /tmp/proj/.neko/plans/plan-run-1.md. ' +
            'Resolve 1 validation issue(s) before the next write.',
          signalKinds: ['artifact-invalid'],
        },
      ],
    });
    expect(coordinator.getSignalHistory()).toHaveLength(1);
    expect(coordinator.getDecisionHistory()).toHaveLength(1);
  });

  it('records provider expression observations as continue decisions for evaluator consumers', () => {
    const coordinator = createFeedbackCoordinator({ now: () => 12 });

    coordinator.observe({
      kind: 'provider-card-observation',
      observedAt: 10,
      toolCallId: 'call-img',
      toolName: 'GenerateImage',
      mode: 'agentic',
      providerId: 'sdxl',
      styleFamily: 'anime',
      metadata: { mode: 'agentic', selection: { primary: 'sdxl' } },
    });

    const cycle = coordinator.evaluatePending();

    expect(cycle).toEqual(
      expect.objectContaining({
        signals: [
          expect.objectContaining({
            kind: 'provider-card-observation',
            toolCallId: 'call-img',
            providerId: 'sdxl',
          }),
        ],
        decisions: [
          {
            action: 'continue',
            signalKind: 'provider-card-observation',
            toolCallId: 'call-img',
            toolName: 'GenerateImage',
            mode: 'agentic',
            providerId: 'sdxl',
            styleFamily: 'anime',
          },
        ],
        actions: [
          {
            kind: 'clear-guidance',
            reason: 'continue',
          },
        ],
      }),
    );
  });

  it('keeps high-confidence Agent observations on the fast continue path', () => {
    const observation: AgentObservation = {
      id: 'obs-high',
      modality: 'image',
      summary: 'The frame already matches the requested composition.',
      confidence: 'high',
      evidenceIds: [],
      createdAt: 11,
    };
    const coordinator = createFeedbackCoordinator({ now: () => 13 });

    coordinator.observe({
      kind: 'agent-observation',
      observedAt: 11,
      observation,
      runId: 'run-observe',
    });

    expect(coordinator.evaluatePending({ activeRunId: 'run-observe' })).toEqual({
      timestamp: 13,
      activeRunId: 'run-observe',
      signals: [
        {
          kind: 'agent-observation',
          observedAt: 11,
          observation,
          runId: 'run-observe',
        },
      ],
      decisions: [
        {
          action: 'continue',
          signalKind: 'agent-observation',
          observationId: 'obs-high',
          confidence: 'high',
          evidenceIds: [],
        },
      ],
      actions: [
        {
          kind: 'clear-guidance',
          reason: 'continue',
        },
      ],
    });
  });

  it('guides low-confidence Agent observations to optional evidence without invoking tools', () => {
    const observation: AgentObservation = {
      id: 'obs-low',
      modality: 'video',
      summary: 'The motion may stutter near the cut point.',
      confidence: 'low',
      evidenceIds: [],
      createdAt: 14,
    };
    const coordinator = createFeedbackCoordinator({
      controlPolicy: { toolEvidenceMode: 'optional' },
      now: () => 16,
    });

    coordinator.observe({
      kind: 'agent-observation',
      observedAt: 14,
      observation,
    });

    expect(coordinator.evaluatePending()).toEqual({
      timestamp: 16,
      signals: [
        {
          kind: 'agent-observation',
          observedAt: 14,
          observation,
        },
      ],
      decisions: [
        {
          action: 'continue',
          signalKind: 'agent-observation',
          observationId: 'obs-low',
          confidence: 'low',
          evidenceIds: [],
        },
      ],
      actions: [
        {
          kind: 'set-guidance',
          guidance:
            '- AgentObservation obs-low has low confidence. The Agent may attach optional tool, memory, subagent, or user evidence before proceeding.',
          signalKinds: ['agent-observation'],
        },
      ],
    });
  });

  it('routes subagent review results as reviewer-only guidance', () => {
    const evidence = createSubagentReviewEvidence({
      id: 'evidence-subagent-shot-3',
      reviewerId: 'reviewer-style-consistency',
      requestId: 'review-request-shot-3',
      summary: 'Reviewer confirms shot 3 style drift.',
      observationId: 'obs-shot-3-style-drift',
      createdAt: 18,
    });
    const coordinator = createFeedbackCoordinator({ now: () => 20 });

    coordinator.observe({
      kind: 'subagent-review',
      observedAt: 18,
      review: {
        requestId: 'review-request-shot-3',
        reviewerId: 'reviewer-style-consistency',
        summary: 'Recommend minimal prompt adjustment.',
        evidence: [evidence],
        recommendations: [
          {
            id: 'guidance-shot-3-minimal-prompt-adjustment',
            rationaleId: 'rat-shot-3-recovery-guidance',
            kind: 'adjust-prompt',
            summary: 'Regenerate only shot 3 with a tighter style prompt.',
            recommendedNextStep: 'Adjust the shot 3 prompt before any generation tool call.',
            evidenceIds: ['evidence-subagent-shot-3'],
            createdAt: 19,
          },
        ],
        createdAt: 18,
      },
      runId: 'run-review',
    });

    expect(coordinator.evaluatePending({ activeRunId: 'run-review' })).toEqual({
      timestamp: 20,
      activeRunId: 'run-review',
      signals: [
        {
          kind: 'subagent-review',
          observedAt: 18,
          review: {
            requestId: 'review-request-shot-3',
            reviewerId: 'reviewer-style-consistency',
            summary: 'Recommend minimal prompt adjustment.',
            evidence: [evidence],
            recommendations: [
              {
                id: 'guidance-shot-3-minimal-prompt-adjustment',
                rationaleId: 'rat-shot-3-recovery-guidance',
                kind: 'adjust-prompt',
                summary: 'Regenerate only shot 3 with a tighter style prompt.',
                recommendedNextStep: 'Adjust the shot 3 prompt before any generation tool call.',
                evidenceIds: ['evidence-subagent-shot-3'],
                createdAt: 19,
              },
            ],
            createdAt: 18,
          },
          runId: 'run-review',
        },
      ],
      decisions: [
        {
          action: 'continue',
          signalKind: 'subagent-review',
          requestId: 'review-request-shot-3',
          reviewerId: 'reviewer-style-consistency',
          evidenceIds: ['evidence-subagent-shot-3'],
          recommendationIds: ['guidance-shot-3-minimal-prompt-adjustment'],
          runId: 'run-review',
        },
      ],
      actions: [
        {
          kind: 'set-guidance',
          guidance:
            '- Subagent reviewer reviewer-style-consistency returned 1 evidence item(s) and 1 recommendation(s) for request review-request-shot-3. Treat them as review evidence only; the main Agent must form the final rationale before acting.',
          signalKinds: ['subagent-review'],
        },
      ],
    });
  });

  it('keeps required tool evidence mode guidance-only for low-confidence rationale', () => {
    const rationale: DecisionRationale = {
      id: 'rat-low-risky',
      decision: 'recovery-guidance-shot',
      reason: 'The previous shot render may not match the storyboard intent.',
      confidence: 'low',
      observationIds: [],
      evidenceIds: [],
      risk: {
        level: 'high',
        impactScope: 'medium',
        reversibility: 'low',
        budgetCost: 'medium',
        userVisibility: 'high',
      },
      createdAt: 17,
    };
    const coordinator = createFeedbackCoordinator({
      controlPolicy: {
        agentObservationRequired: true,
        toolEvidenceMode: 'required-for-low-confidence',
      },
      now: () => 19,
    });

    coordinator.observe({
      kind: 'decision-rationale',
      observedAt: 17,
      rationale,
      runId: 'run-rationale',
    });

    expect(coordinator.evaluatePending({ activeRunId: 'run-rationale' })).toEqual({
      timestamp: 19,
      activeRunId: 'run-rationale',
      signals: [
        {
          kind: 'decision-rationale',
          observedAt: 17,
          rationale,
          runId: 'run-rationale',
        },
      ],
      decisions: [
        {
          action: 'continue',
          signalKind: 'decision-rationale',
          rationaleId: 'rat-low-risky',
          confidence: 'low',
          observationIds: [],
          evidenceIds: [],
          riskLevel: 'high',
        },
      ],
      actions: [
        {
          kind: 'set-guidance',
          guidance:
            '- Do not perform high-risk or irreversible project-state mutation yet. Attach an AgentObservation before relying on this rationale. DecisionRationale rat-low-risky has low confidence with 0 attached evidence item(s). The arbiter is guidance-only: the Agent should attach evidence or obtain user confirmation before unsafe mutation.',
          signalKinds: ['decision-rationale'],
        },
      ],
    });
  });

  it('keeps toolEvidenceMode off guidance user-facing without suggesting tool evidence', () => {
    const observation: AgentObservation = {
      id: 'obs-low-off',
      modality: 'image',
      summary: 'The subject identity is unclear.',
      confidence: 'low',
      evidenceIds: [],
      createdAt: 21,
    };
    const coordinator = createFeedbackCoordinator({
      controlPolicy: { toolEvidenceMode: 'off' },
      now: () => 22,
    });

    coordinator.observe({
      kind: 'agent-observation',
      observedAt: 21,
      observation,
    });

    const cycle = coordinator.evaluatePending();
    expect(cycle?.actions).toEqual([
      {
        kind: 'set-guidance',
        guidance:
          '- AgentObservation obs-low-off has low confidence. State the uncertainty and ask the user for clarification before risky mutation.',
        signalKinds: ['agent-observation'],
      },
    ]);
    expect(
      cycle?.actions[0]?.kind === 'set-guidance' ? cycle.actions[0].guidance : '',
    ).not.toContain('attach optional tool');
  });

  it('routes provider expression observations into project provider-card overrides when configured', async () => {
    const writes: Array<{ path: string; data: string }> = [];
    const coordinator = createFeedbackCoordinator({
      providerCardProject: {
        workspaceRoot: '/workspace/demo',
        fsOps: {
          mkdir: vi.fn(async () => undefined),
          writeFile: vi.fn(async (path: string, data: string) => {
            writes.push({ path, data });
          }),
        },
      },
      now: () => 0,
    });

    coordinator.observe({
      kind: 'provider-card-observation',
      observedAt: 0,
      toolCallId: 'call-img',
      toolName: 'GenerateImage',
      mode: 'fallback',
      providerId: 'sdxl',
      reason: 'provider-card-not-found',
      styleFamily: 'anime',
      metadata: { mode: 'fallback' },
    });

    coordinator.evaluatePending();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe('/workspace/demo/.neko/providers/sdxl.card.md');
    expect(writes[0]?.data).toContain('"type":"provider-card-observation"');
    expect(writes[0]?.data).toContain('"mode":"fallback"');
  });

  it('logs provider-card project write failures from fire-and-forget writes', async () => {
    const logger = { warn: vi.fn() };
    const coordinator = createFeedbackCoordinator({
      providerCardProject: {
        workspaceRoot: '/workspace/demo',
        fsOps: {
          mkdir: vi.fn(async () => undefined),
          writeFile: vi.fn(async () => undefined),
        },
      },
      providerCardProjectRouterFactory: () => ({
        writeObservation: vi.fn(async () => {
          throw new Error('disk full');
        }),
      }),
      logger,
      now: () => 0,
    });

    coordinator.observe({
      kind: 'provider-card-observation',
      observedAt: 0,
      toolCallId: 'call-img',
      toolName: 'GenerateImage',
      mode: 'agentic',
      providerId: 'sdxl',
      metadata: { mode: 'agentic' },
    });

    coordinator.evaluatePending();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(logger.warn).toHaveBeenCalledWith(
      'provider-card observation write failed',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('records apply-exit self-evaluation requests as feedback signals', () => {
    const tracker = createStageTracker({ now: () => 0 });
    const coordinator = createFeedbackCoordinator({
      stageTracker: tracker,
      now: () => 11,
    });

    tracker.enter('draft');
    tracker.enter('apply');
    tracker.enter('plan');

    const cycle = coordinator.evaluatePending({ currentStage: 'plan' });

    expect(cycle).toEqual({
      timestamp: 11,
      currentStage: 'plan',
      signals: [
        {
          kind: 'self-evaluation-requested',
          observedAt: 11,
          stage: 'apply',
        },
      ],
      decisions: [
        {
          action: 'self-evaluate',
          signalKind: 'self-evaluation-requested',
          stage: 'apply',
        },
      ],
      actions: [
        {
          kind: 'set-guidance',
          guidance:
            '- Before the next Apply step, perform a short self-evaluation: summarize what changed, ' +
            'what is still risky, and whether user confirmation is needed.',
          signalKinds: ['self-evaluation-requested'],
        },
      ],
    });
  });

  it('writes extracted facts into project memory and returns a journal-ready payload', async () => {
    const projectMemory = createMockProjectMemory();
    const coordinator = createFeedbackCoordinator({
      projectMemoryManager: projectMemory,
      now: () => 42,
    });

    const result = await coordinator.extractMemory({
      messages: [{ role: 'user', content: '我喜欢中文说明，避免英文模板。' } satisfies ChatMessage],
      sourceEventIds: ['evt-1'],
    });

    expect(projectMemory.upsertEntry).toHaveBeenCalledWith(
      'User Preferences',
      expect.stringContaining('我喜欢中文说明，避免英文模板。'),
    );
    expect(result).toEqual(
      expect.objectContaining({
        kind: 'extracted',
        timestamp: 42,
        sourceEventIds: ['evt-1'],
        writeStatus: 'written',
        facts: [
          expect.objectContaining({
            category: 'preference',
            destination: 'project',
          }),
        ],
      }),
    );
    expect(coordinator.evaluatePending()).toEqual({
      timestamp: 42,
      signals: [
        {
          kind: 'memory-extraction',
          observedAt: 42,
          extraction: expect.objectContaining({
            writeStatus: 'written',
            facts: [
              expect.objectContaining({
                category: 'preference',
              }),
            ],
          }),
        },
      ],
      decisions: [
        {
          action: 'memorize',
          signalKind: 'memory-extraction',
          factCount: 1,
          writeStatus: 'written',
        },
      ],
      actions: [
        {
          kind: 'clear-guidance',
          reason: 'memorize',
        },
      ],
    });
  });

  it('evaluates tool failure signals into repair decisions', () => {
    const coordinator = createFeedbackCoordinator({
      now: () => 18,
    });

    coordinator.observe({
      kind: 'tool-failure',
      observedAt: 15,
      toolCallId: 'call-1',
      toolName: 'Write',
      error: 'permission denied',
      runId: 'run-tools',
    });

    expect(
      coordinator.evaluatePending({
        currentStage: 'apply',
        activeRunId: 'run-tools',
      }),
    ).toEqual({
      timestamp: 18,
      currentStage: 'apply',
      activeRunId: 'run-tools',
      signals: [
        {
          kind: 'tool-failure',
          observedAt: 15,
          toolCallId: 'call-1',
          toolName: 'Write',
          error: 'permission denied',
          runId: 'run-tools',
        },
      ],
      decisions: [
        {
          action: 'repair',
          signalKind: 'tool-failure',
          toolCallId: 'call-1',
          toolName: 'Write',
          error: 'permission denied',
          runId: 'run-tools',
        },
      ],
      actions: [
        {
          kind: 'set-guidance',
          guidance:
            '- Repair the failed tool step for Write. Diagnose the error "permission denied" ' +
            'and choose a safer fallback if needed.',
          signalKinds: ['tool-failure'],
        },
      ],
    });
  });

  it('turns failing quality-check signals into repair decisions', () => {
    const coordinator = createFeedbackCoordinator({
      now: () => 25,
    });
    const evidence: PerceptionEvidence = {
      id: 'quality-review:run-quality:call-qc',
      source: 'tool',
      summary: 'QualityReview failed 1/2 scene(s): scene(s) 2; 3 remediation hint(s) available.',
      confidence: 0.5,
      toolName: 'QualityCheck',
      createdAt: 20,
      status: 'active',
    };

    coordinator.observe({
      kind: 'quality-check',
      observedAt: 20,
      toolCallId: 'call-qc',
      toolName: 'QualityCheck',
      totalScenes: 2,
      passed: 1,
      failed: 1,
      failingSceneIndexes: [2],
      remediationCount: 3,
      runId: 'run-quality',
      evidence,
    });

    expect(coordinator.evaluatePending({ activeRunId: 'run-quality' })).toEqual({
      timestamp: 25,
      activeRunId: 'run-quality',
      signals: [
        {
          kind: 'quality-check',
          observedAt: 20,
          toolCallId: 'call-qc',
          toolName: 'QualityCheck',
          totalScenes: 2,
          passed: 1,
          failed: 1,
          failingSceneIndexes: [2],
          remediationCount: 3,
          runId: 'run-quality',
          evidence,
        },
      ],
      decisions: [
        {
          action: 'repair',
          signalKind: 'quality-check',
          toolCallId: 'call-qc',
          toolName: 'QualityCheck',
          totalScenes: 2,
          failed: 1,
          failingSceneIndexes: [2],
          remediationCount: 3,
          runId: 'run-quality',
          evidenceId: 'quality-review:run-quality:call-qc',
        },
      ],
      actions: [
        {
          kind: 'set-guidance',
          guidance:
            '- Repair the failing quality-check result. Focus on scene(s) 2 and apply 3 suggested remediation step(s) as needed.',
          signalKinds: ['quality-check'],
        },
      ],
    });
  });

  it('turns passing quality-check signals into continue decisions', () => {
    const coordinator = createFeedbackCoordinator({
      now: () => 31,
    });

    coordinator.observe({
      kind: 'quality-check',
      observedAt: 30,
      toolCallId: 'call-qc-pass',
      toolName: 'QualityCheck',
      totalScenes: 1,
      passed: 1,
      failed: 0,
      failingSceneIndexes: [],
      remediationCount: 0,
    });

    expect(coordinator.evaluatePending()).toEqual({
      timestamp: 31,
      signals: [
        {
          kind: 'quality-check',
          observedAt: 30,
          toolCallId: 'call-qc-pass',
          toolName: 'QualityCheck',
          totalScenes: 1,
          passed: 1,
          failed: 0,
          failingSceneIndexes: [],
          remediationCount: 0,
        },
      ],
      decisions: [
        {
          action: 'continue',
          signalKind: 'quality-check',
          toolCallId: 'call-qc-pass',
          toolName: 'QualityCheck',
          totalScenes: 1,
          passed: 1,
        },
      ],
      actions: [
        {
          kind: 'clear-guidance',
          reason: 'continue',
        },
      ],
    });
  });

  it('escalates repeated tool failures into explicit user-escalation flow actions', () => {
    const coordinator = createFeedbackCoordinator({
      now: (() => {
        let tick = 40;
        return () => ++tick;
      })(),
    });

    coordinator.observe({
      kind: 'tool-failure',
      observedAt: 40,
      toolCallId: 'call-1',
      toolName: 'Write',
      error: 'permission denied',
      runId: 'run-repeat',
    });
    coordinator.evaluatePending({ activeRunId: 'run-repeat' });

    coordinator.observe({
      kind: 'tool-failure',
      observedAt: 41,
      toolCallId: 'call-2',
      toolName: 'Write',
      error: 'permission denied',
      runId: 'run-repeat',
    });

    expect(coordinator.evaluatePending({ activeRunId: 'run-repeat' })).toEqual({
      timestamp: 42,
      activeRunId: 'run-repeat',
      signals: [
        {
          kind: 'tool-failure',
          observedAt: 41,
          toolCallId: 'call-2',
          toolName: 'Write',
          error: 'permission denied',
          runId: 'run-repeat',
        },
      ],
      decisions: [
        {
          action: 'repair',
          signalKind: 'tool-failure',
          toolCallId: 'call-2',
          toolName: 'Write',
          error: 'permission denied',
          runId: 'run-repeat',
        },
      ],
      actions: [
        {
          kind: 'escalate-user',
          message:
            'Tool Write failed 2 times with "permission denied". Ask the user whether to change strategy, grant permission, or adjust inputs.',
          signalKind: 'tool-failure',
          repeatCount: 2,
          runId: 'run-repeat',
        },
      ],
    });
  });

  it('keeps repeated-signal counts aligned with the capped history window', () => {
    let tick = 0;
    const coordinator = createFeedbackCoordinator({
      controlPolicy: { escalationThreshold: 65 },
      now: () => ++tick,
    });

    for (let index = 0; index < 65; index += 1) {
      coordinator.observe({
        kind: 'tool-failure',
        observedAt: index,
        toolCallId: `call-${index}`,
        toolName: 'Write',
        error: 'permission denied',
        runId: 'run-cap',
      });

      expect(coordinator.evaluatePending({ activeRunId: 'run-cap' })).toEqual(
        expect.objectContaining({
          actions: [
            expect.objectContaining({
              kind: 'set-guidance',
            }),
          ],
        }),
      );
    }

    expect(coordinator.getSignalHistory()).toHaveLength(64);
  });

  it('returns dedup when the extracted fact already exists in project memory', async () => {
    const projectMemory = createMockProjectMemory(
      '## User Preferences\n- 我喜欢中文说明，避免英文模板。\n',
    );
    const coordinator = createFeedbackCoordinator({
      projectMemoryManager: projectMemory,
      now: () => 7,
    });

    const result = await coordinator.extractMemory({
      messages: [{ role: 'user', content: '我喜欢中文说明，避免英文模板。' }],
      sourceEventIds: ['evt-2'],
    });

    expect(projectMemory.upsertEntry).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        kind: 'extracted',
        timestamp: 7,
        sourceEventIds: ['evt-2'],
        writeStatus: 'dedup',
      }),
    );
  });

  it('returns an explicit skipped result when no fact matches the extraction heuristic', async () => {
    const coordinator = createFeedbackCoordinator({
      projectMemoryManager: createMockProjectMemory(),
    });

    const result = await coordinator.extractMemory({
      messages: [{ role: 'assistant', content: 'plain assistant text without user facts' }],
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'skipped',
        reason: 'no-facts',
      }),
    );
  });

  it('returns an explicit skipped result when project memory extraction is disabled', async () => {
    const coordinator = createFeedbackCoordinator({});

    const result = await coordinator.extractMemory({
      messages: [{ role: 'user', content: '记住我喜欢中文说明。' }],
      sourceEventIds: ['evt-disabled'],
    });

    expect(result).toEqual({
      kind: 'skipped',
      timestamp: expect.any(Number),
      sourceEventIds: ['evt-disabled'],
      reason: 'disabled',
    });
  });
});
