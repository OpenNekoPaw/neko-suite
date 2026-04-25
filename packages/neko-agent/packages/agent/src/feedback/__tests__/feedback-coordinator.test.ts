import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage, IProjectMemoryManager } from '@neko/shared';
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
