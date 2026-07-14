import { describe, expect, it, vi } from 'vitest';
import {
  CapturedLogTransport,
  ConsoleLogger,
  LogLevel,
  createAgentTraceContext,
  type AgentContext,
} from '@neko/shared';
import type { ChildRunScope } from '@neko-agent/types';

describe('agent runtime summary trace logs', () => {
  it('logs built-in creation stage activation, approval decisions, and subagent lifecycle summaries with trace', async () => {
    const transport = new CapturedLogTransport();
    const { setRootLogger } = await import('../utils/logger');
    setRootLogger(new ConsoleLogger('Agent', LogLevel.Debug, [transport]));

    const trace = createAgentTraceContext({
      conversationId: 'conv-runtime-summary',
      runId: 'run-runtime-summary',
      turnId: 'turn-runtime-summary',
      iteration: 1,
    });

    const { createReActLoopRunner } = await import('../executor');
    const { hooks } = createReActLoopRunner({
      creation: {
        getActive: () => ({
          creationId: 'run-runtime-summary',
          profileId: 'idc.default',
        }),
        recordRound: vi.fn(),
        recordStageTransition: vi.fn(),
        close: vi.fn(),
      },
      getRunContext: () => ({
        runId: 'run-runtime-summary',
        creationKind: 'idc.default',
      }),
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

    const { createSubAgentTool } = await import('../subagent/task-tool');
    const subAgentManager = {
      spawn: vi.fn(async (scope: ChildRunScope) => scope),
      spawnBatch: vi.fn(async (entries: readonly { scope: ChildRunScope }[]) =>
        entries.map((entry) => entry.scope),
      ),
      getResult: vi.fn(async (scope: ChildRunScope) => ({
        scope,
        id: scope.childRunId,
        status: 'completed' as const,
        response: 'ok',
        duration: 12,
        iterations: 2,
      })),
      getStatus: vi.fn(() => 'completed' as const),
      getResults: vi.fn(),
      cancel: vi.fn(),
      cancelRun: vi.fn(),
      listByRun: vi.fn(() => []),
      cleanupRun: vi.fn(),
      onEvent: vi.fn(() => () => {}),
    };
    const taskTool = createSubAgentTool(subAgentManager);
    await taskTool.execute(
      {
        description: 'review plan',
        prompt: 'Review the plan',
        subagent_type: 'general',
      },
      {
        metadata: {
          conversationId: 'conv-runtime-summary',
          runId: 'run-runtime-summary',
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
          phase: 'creation',
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
        subAgentId: expect.stringMatching(/^subagent-/),
      }),
    );
    expect(transport.findByMessage('neko.agent.subagent.completed')?.data).toEqual(
      expect.objectContaining({
        subAgentId: expect.stringMatching(/^subagent-/),
        status: 'completed',
        duration: 12,
        iterations: 2,
      }),
    );
  });
});
