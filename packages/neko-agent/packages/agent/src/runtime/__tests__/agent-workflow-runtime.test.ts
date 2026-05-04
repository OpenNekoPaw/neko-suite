import { describe, expect, it, vi } from 'vitest';
import {
  buildWorkflowIdentity,
  createAgentWorkflowRuntime,
  createIdcWorkflowDefinition,
  createLegacyWorkflowUsageRecorder,
  selectIdcWorkflowEntryNode,
} from '../agent-workflow-runtime';
import { runAgentMediaTurnForWebview } from '../media-turn-webview-runtime';
import { createSubAgentEventRuntime } from '../subagent-event-runtime';

describe('AgentWorkflowRuntime', () => {
  it('runs IDC Draft, Plan, and Apply inside one workflow run', () => {
    let now = 100;
    const projections: unknown[] = [];
    const runtime = createAgentWorkflowRuntime({
      now: () => now++,
      generateRunId: () => 'run-1',
      onProjection: (projection) => projections.push(projection),
    });
    const definition = createIdcWorkflowDefinition();

    const run = runtime.createRun({
      definition,
      conversationId: 'conv-1',
      initialNodeId: 'draft',
    });
    const planned = runtime.transition({
      runId: run.id,
      fromNodeId: 'draft',
      toNodeId: 'plan',
      reason: 'draft-complete',
    });
    const applying = runtime.transition({
      runId: run.id,
      fromNodeId: 'plan',
      toNodeId: 'apply',
      reason: 'plan-complete',
    });
    const completed = runtime.complete(run.id);

    expect(planned.activeNodeId).toBe('plan');
    expect(applying.activeNodeId).toBe('apply');
    expect(completed.status).toBe('completed');
    expect(completed.nodes.map((node) => [node.id, node.status])).toEqual([
      ['draft', 'completed'],
      ['plan', 'completed'],
      ['apply', 'completed'],
    ]);
    expect(projections).toHaveLength(4);
  });

  it('selects IDC entry stages from PlanMode and AutoMode signals', () => {
    expect(selectIdcWorkflowEntryNode({ planMode: true, taskShape: 'single-write' })).toBe('draft');
    expect(
      selectIdcWorkflowEntryNode({ planMode: false, autoMode: true, taskShape: 'single-write' }),
    ).toBe('apply');
    expect(
      selectIdcWorkflowEntryNode({ planMode: false, autoMode: true, taskShape: 'multi-step' }),
    ).toBe('plan');
    expect(
      selectIdcWorkflowEntryNode({ planMode: false, autoMode: true, requestedStage: 'draft' }),
    ).toBe('draft');
  });

  it('cancels the active workflow node and keeps run identity available', () => {
    const runtime = createAgentWorkflowRuntime({
      now: () => 100,
      generateRunId: () => 'run-1',
    });
    const run = runtime.createRun({
      definition: createIdcWorkflowDefinition(),
      conversationId: 'conv-1',
      initialNodeId: 'apply',
    });

    const cancelled = runtime.cancel(run.id, 'user-cancelled');

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.nodes.find((node) => node.id === 'apply')?.status).toBe('cancelled');
    expect(runtime.toIdentity(run.id)).toEqual({
      workflowDefinitionId: 'neko.workflow.idc.v1',
      workflowRunId: 'run-1',
      workflowNodeId: 'apply',
    });
  });

  it('links media task projections to workflow identity', async () => {
    const postMessage = vi.fn();
    const workflow = buildWorkflowIdentity({
      definitionId: 'neko.workflow.idc.v1',
      runId: 'run-1',
      nodeId: 'apply',
    });

    await runAgentMediaTurnForWebview({
      conversationId: 'conv-1',
      prompt: 'Generate clip',
      workflow,
      mediaModel: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
      postMessage,
      executeMediaTurn: async ({ onTaskCreated }) => {
        await onTaskCreated({
          conversationId: 'conv-1',
          sourceTask: {},
          task: {
            id: 'media-1',
            type: 'video',
            status: 'processing',
            progress: 10,
            providerId: 'runway',
            modelId: 'gen-4',
            createdAt: '2026-05-04T00:00:00.000Z',
            updatedAt: '2026-05-04T00:00:01.000Z',
            request: { prompt: 'Generate clip' },
          },
        });
      },
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'mediaTaskCreated',
        workItem: expect.objectContaining({ workflow }),
      }),
    );
  });

  it('links subagent projections to workflow identity', () => {
    const workflow = buildWorkflowIdentity({
      definitionId: 'neko.workflow.idc.v1',
      runId: 'run-1',
      nodeId: 'apply',
    });
    const runtime = createSubAgentEventRuntime();

    expect(
      runtime.projectForConversation({
        conversationId: 'conv-1',
        workflow,
        event: {
          type: 'started',
          subAgentId: 'sub-1',
          parentAgentId: 'agent-1',
          conversationId: 'conv-1',
          timestamp: 100,
        },
      })?.workItem.workflow,
    ).toEqual(workflow);
  });

  it('records legacy workflow telemetry during the compatibility window', () => {
    const recorder = createLegacyWorkflowUsageRecorder();
    const telemetry = recorder.record({
      deprecation: {
        adapterId: 'legacy-prompt-chain-adapter',
        owner: 'neko-agent-runtime',
        introducedAt: '2026-05-04',
        sunsetMilestone: 'workflow-native-v1',
        workflowNativeReplacement: 'AgentWorkflowDefinition',
        allowedCompatibilityWindow: {
          startsAt: '2026-05-04',
          expiresAt: '2026-06-04',
        },
        severityAfterSunset: 'failure',
      },
      workflowDefinitionCandidate: createIdcWorkflowDefinition(),
      nodeMapping: [
        { legacyStepId: 'draft', workflowNodeId: 'draft' },
        { legacyStepId: 'legacy-review', missingMigrationReason: 'No evaluator node yet' },
      ],
      usedAt: 100,
    });

    expect(telemetry).toMatchObject({
      adapterId: 'legacy-prompt-chain-adapter',
      usageCount: 1,
      lastUsedAt: 100,
      unmappedStepIds: ['legacy-review'],
      missingMigrationReasons: ['No evaluator node yet'],
    });
    expect(recorder.get('legacy-prompt-chain-adapter')?.usageCount).toBe(1);
  });

  it('validates legacy workflow sunset metadata and approval policy', () => {
    const recorder = createLegacyWorkflowUsageRecorder();
    const expired = {
      adapterId: 'expired-adapter',
      owner: 'neko-agent-runtime',
      introducedAt: '2026-05-04',
      sunsetMilestone: 'workflow-native-v1',
      workflowNativeReplacement: 'AgentWorkflowDefinition',
      allowedCompatibilityWindow: {
        startsAt: '2026-05-04',
        expiresAt: '2026-05-05',
      },
      severityAfterSunset: 'failure' as const,
    };

    expect(recorder.validate({})).toEqual([
      expect.objectContaining({ code: 'missing-deprecation-metadata', severity: 'failure' }),
    ]);
    expect(
      recorder.validate({ deprecation: expired }, { now: Date.parse('2026-05-06T00:00:00.000Z') }),
    ).toEqual([expect.objectContaining({ code: 'legacy-adapter-expired' })]);
    expect(
      recorder.validate(
        { deprecation: expired },
        {
          now: Date.parse('2026-05-06T00:00:00.000Z'),
          compatibilityApprovalIds: ['expired-adapter'],
        },
      ),
    ).toEqual([]);
  });

  it('rejects new pipeline-only workflows after the sunset gate', () => {
    const recorder = createLegacyWorkflowUsageRecorder();
    const deprecation = {
      adapterId: 'pipeline-only',
      owner: 'neko-agent-runtime',
      introducedAt: '2026-05-04',
      sunsetMilestone: 'workflow-native-v1',
      workflowNativeReplacement: 'AgentWorkflowDefinition',
      allowedCompatibilityWindow: {
        startsAt: '2026-05-04',
        expiresAt: '2026-06-04',
      },
      severityAfterSunset: 'failure' as const,
    };

    expect(
      recorder.validate({ deprecation }, { sunsetGateEnabled: true, isNewWorkflow: true }),
    ).toEqual([expect.objectContaining({ code: 'new-pipeline-only-workflow' })]);
  });
});
