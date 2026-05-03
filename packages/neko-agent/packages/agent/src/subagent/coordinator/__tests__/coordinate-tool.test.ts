import { describe, expect, it, vi } from 'vitest';
import { createCoordinateTool } from '../coordinate-tool';
import type { CoordinateToolDeps } from '../types';

function createDeps(): CoordinateToolDeps {
  return {
    subAgentManager: {
      spawn: vi.fn(async (_parentId: string, _conversationId: string, config: { id: string }) => {
        return config.id;
      }),
      spawnBatch: vi.fn(),
      getStatus: vi.fn(),
      getResult: vi.fn(async (subAgentId: string) => ({
        id: subAgentId,
        status: 'completed',
        response: 'done',
      })),
      getResults: vi.fn(),
      cancel: vi.fn(),
      cancelAll: vi.fn(),
      listByParent: vi.fn(() => []),
      onEvent: vi.fn(() => () => {}),
      cleanup: vi.fn(),
    },
    contextBridge: {
      extractSummary: vi.fn(() => 'summary'),
      mergeResults: vi.fn(() => []),
    },
  };
}

describe('createCoordinateTool', () => {
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
      error: 'Missing conversationId for coordinate tool',
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
        },
      },
    );

    expect(result.success).toBe(true);
    expect(deps.subAgentManager.spawn).toHaveBeenCalledWith(
      'parent-1',
      'conv-1',
      expect.objectContaining({
        id: expect.stringContaining('task-1'),
      }),
    );
  });
});
