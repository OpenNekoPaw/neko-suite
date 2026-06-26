import { describe, expect, it, vi } from 'vitest';
import {
  buildWorkflowIdentity,
  createAgentWorkflowRuntime,
  createIdcWorkflowDefinition,
  selectIdcWorkflowEntryNode,
} from '../agent-workflow-runtime';
import { runAgentMediaTurn } from '../media-turn-runtime';
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

  it('validates workflow transitions and closes the active source node by default', () => {
    const runtime = createAgentWorkflowRuntime({
      now: () => 100,
      generateRunId: () => 'run-1',
    });
    const run = runtime.createRun({
      definition: createIdcWorkflowDefinition(),
      conversationId: 'conv-1',
      initialNodeId: 'draft',
    });

    expect(() => runtime.transition({ runId: run.id, toNodeId: 'apply' })).toThrow(
      'Workflow transition is not allowed: draft -> apply',
    );

    const planned = runtime.transition({
      runId: run.id,
      toNodeId: 'plan',
      reason: 'draft-complete',
    });

    expect(planned.nodes.map((node) => [node.id, node.status])).toEqual([
      ['draft', 'completed'],
      ['plan', 'running'],
      ['apply', 'pending'],
    ]);
    expect(() => runtime.transition({ runId: run.id, toNodeId: 'plan' })).toThrow(
      'Workflow transition target is already active: plan',
    );
    expect(() =>
      runtime.transition({
        runId: run.id,
        fromNodeId: 'draft',
        toNodeId: 'apply',
      }),
    ).toThrow('Workflow transition source is not active: draft');
    expect(() => runtime.transition({ runId: run.id, toNodeId: 'apply' })).not.toThrow();
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

    await runAgentMediaTurn({
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
});
