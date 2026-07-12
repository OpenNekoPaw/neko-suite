import { describe, expect, it, vi } from 'vitest';
import { createCoordinateTool } from '../coordinate-tool';
import type { CoordinateToolDeps } from '../types';
import { ToolRegistry } from '../../../tools';
import type { ChildRunScope } from '@neko-agent/types';

function createDeps(): CoordinateToolDeps {
  return {
    subAgentManager: {
      spawn: vi.fn(async (scope: ChildRunScope) => scope),
      spawnBatch: vi.fn(),
      getStatus: vi.fn(),
      getResult: vi.fn(async (scope: ChildRunScope) => ({
        scope,
        id: scope.childRunId,
        status: 'completed' as const,
        response: 'done',
      })),
      getResults: vi.fn(),
      cancel: vi.fn(),
      cancelRun: vi.fn(),
      listByRun: vi.fn(() => []),
      onEvent: vi.fn(() => () => {}),
      cleanupRun: vi.fn(),
    },
    contextBridge: {
      extractSummary: vi.fn(() => 'summary'),
      mergeResults: vi.fn(() => []),
    },
  };
}

describe('createCoordinateTool', () => {
  it('projects Chinese model-facing schema text through ToolRegistry', () => {
    const deps = createDeps();
    const registry = new ToolRegistry();
    registry.register(createCoordinateTool(deps));

    const definition = registry
      .toToolDefinitions(undefined, { locale: 'zh-CN' })
      .find((tool) => tool.function.name === 'coordinate')?.function;
    const parameters = definition?.parameters as
      { properties?: Record<string, { description?: string; items?: unknown }> } | undefined;

    expect(definition?.description).toContain('编排多个 SubAgent');
    expect(parameters?.properties?.description?.description).toBe('工作流描述。');
    expect(parameters?.properties?.tasks?.description).toBe('要协调的任务列表。');
    expect(definition?.description).not.toContain('Orchestrate multiple SubAgents');
  });

  it('fails closed when conversationId metadata is missing', async () => {
    const deps = createDeps();
    const tool = createCoordinateTool(deps);

    const result = await tool.execute(
      {
        description: 'Coordinate work',
        tasks: [{ id: 'task-1', description: 'Task 1', prompt: 'Do task 1' }],
      },
      {
        metadata: { parentAgentId: 'parent-1' },
      },
    );

    expect(result).toEqual({
      success: false,
      error: 'Missing or mismatched conversationId for coordinate tool',
    });
    expect(deps.subAgentManager.spawn).not.toHaveBeenCalled();
  });

  it('passes explicit conversation and parent agent IDs to worker subagents', async () => {
    const deps = createDeps();
    const tool = createCoordinateTool(deps);

    const result = await tool.execute(
      {
        description: 'Coordinate work',
        tasks: [{ id: 'task-1', description: 'Task 1', prompt: 'Do task 1' }],
        require_confirmation: false,
      },
      {
        metadata: {
          parentAgentId: 'parent-1',
          conversationId: 'conv-1',
          runId: 'run-1',
        },
      },
    );

    expect(result.success).toBe(true);
    expect(deps.subAgentManager.spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        runId: 'run-1',
        parentRunId: 'parent-1',
        childKind: 'subagent',
      }),
      expect.objectContaining({
        id: expect.stringContaining('task-1'),
      }),
    );
  });

  it('passes runtime locale metadata to coordinated worker subagents', async () => {
    const deps = createDeps();
    const tool = createCoordinateTool(deps);

    const result = await tool.execute(
      {
        description: 'Coordinate work',
        tasks: [{ id: 'task-1', description: 'Task 1', prompt: 'Do task 1' }],
        require_confirmation: false,
      },
      {
        metadata: {
          parentAgentId: 'parent-1',
          conversationId: 'conv-1',
          runId: 'run-1',
          locale: 'zh-CN',
        },
      },
    );

    expect(result.success).toBe(true);
    expect(deps.subAgentManager.spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        runId: 'run-1',
        parentRunId: 'parent-1',
        childKind: 'subagent',
      }),
      expect.objectContaining({
        locale: 'zh-CN',
      }),
    );
  });
});
