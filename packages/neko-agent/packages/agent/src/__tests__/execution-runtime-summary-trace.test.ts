import { describe, expect, it, vi } from 'vitest';
import {
  CapturedLogTransport,
  ConsoleLogger,
  LogLevel,
  createAgentTraceContext,
  type AgentContext,
} from '@neko/shared';

describe('agent runtime summary trace logs', () => {
  it('logs IDC stage activation, approval decisions, and subagent lifecycle summaries with trace', async () => {
    const transport = new CapturedLogTransport();
    const { setRootLogger } = await import('../utils/logger');
    setRootLogger(new ConsoleLogger('Agent', LogLevel.Debug, [transport]));

    const trace = createAgentTraceContext({
      conversationId: 'conv-runtime-summary',
      runId: 'run-runtime-summary',
      turnId: 'turn-runtime-summary',
      iteration: 1,
    });

    const { createIdcRunStore, createReActLoopRunner } = await import('../executor');
    const runStore = createIdcRunStore({ now: () => 100, nextId: () => 'run-runtime-summary' });
    runStore.startRun({ runKind: 'test', runId: 'run-runtime-summary' });
    const { hooks } = createReActLoopRunner({
      runStore,
      getMode: () => 'ask',
      now: () => 100,
    });

    await hooks.beforeThink?.({
      iteration: 1,
      messages: [],
      metadata: {},
      trace,
    } as AgentContext);

    const { createApprovalEngine } = await import('../approval');
    const approvalEngine = createApprovalEngine({
      strategyPacks: [
        {
          name: 'accept-read',
          scope: 'imperative',
          evaluate: (request) => ({
            requestId: request.id,
            resolution: 'auto-accept',
            reason: 'test-allow',
            decidedAt: 101,
          }),
        },
      ],
    });
    await approvalEngine.evaluate({
      channel: 'permission',
      paradigm: 'imperative',
      subject: { label: 'Read file', kind: 'tool:ReadFile' },
      id: 'approval-1',
      at: 100,
      trace,
    });

    const { createTaskTool } = await import('../subagent/task-tool');
    const subAgentManager = {
      spawn: vi.fn(async () => 'subagent-1'),
      spawnBatch: vi.fn(async () => ['subagent-1']),
      getResult: vi.fn(async () => ({
        id: 'subagent-1',
        status: 'completed' as const,
        response: 'ok',
        duration: 12,
        iterations: 2,
      })),
      getStatus: vi.fn(() => 'completed' as const),
      getResults: vi.fn(),
      cancel: vi.fn(),
      cancelAll: vi.fn(),
      listByParent: vi.fn(() => []),
      cleanup: vi.fn(),
      onEvent: vi.fn(() => () => {}),
    };
    const taskTool = createTaskTool(subAgentManager);
    await taskTool.execute(
      {
        description: 'review plan',
        prompt: 'Review the plan',
        subagent_type: 'general',
      },
      {
        metadata: {
          conversationId: 'conv-runtime-summary',
          parentAgentId: 'agent-parent',
        },
        trace,
      },
    );

    expect(transport.findByMessage('neko.agent.workflow.stage_activation.decided')?.data).toEqual(
      expect.objectContaining({
        trace: expect.objectContaining({
          conversationId: 'conv-runtime-summary',
          runId: 'run-runtime-summary',
          phase: 'workflow',
        }),
        activatedStages: expect.any(Array),
        terminalStage: expect.any(String),
      }),
    );
    expect(transport.findByMessage('neko.agent.approval.decision')?.data).toEqual(
      expect.objectContaining({
        trace: expect.objectContaining({
          conversationId: 'conv-runtime-summary',
          phase: 'approval',
        }),
        requestId: 'approval-1',
        resolution: 'auto-accept',
        strategyPack: 'accept-read',
      }),
    );
    expect(transport.findByMessage('neko.agent.subagent.spawned')?.data).toEqual(
      expect.objectContaining({
        trace: expect.objectContaining({
          conversationId: 'conv-runtime-summary',
          phase: 'subagent',
        }),
        parentAgentId: 'agent-parent',
        subAgentId: 'subagent-1',
      }),
    );
    expect(transport.findByMessage('neko.agent.subagent.completed')?.data).toEqual(
      expect.objectContaining({
        subAgentId: 'subagent-1',
        status: 'completed',
        duration: 12,
        iterations: 2,
      }),
    );
  });
});
