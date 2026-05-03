/**
 * Task Tools Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTaskTool, createTaskOutputTool, registerSubAgentTools } from '../task-tool';
import type { ISubAgentManager, SubAgentStatus, SubAgentResult } from '../types';

// =============================================================================
// Mocks
// =============================================================================

function createMockManager(): ISubAgentManager {
  const results = new Map<string, SubAgentResult>();
  const statuses = new Map<string, SubAgentStatus>();

  return {
    spawn: vi.fn().mockImplementation(async (_parentId, _convId, config) => {
      statuses.set(config.id, 'running');
      // Simulate completion
      setTimeout(() => {
        statuses.set(config.id, 'completed');
        results.set(config.id, {
          id: config.id,
          status: 'completed',
          response: 'Task completed',
          duration: 100,
          iterations: 2,
        });
      }, 10);
      return config.id;
    }),
    spawnBatch: vi.fn(),
    getStatus: vi.fn().mockImplementation((id) => statuses.get(id)),
    getResult: vi.fn().mockImplementation(async (id) => {
      // Wait for result to be available
      await new Promise((r) => setTimeout(r, 50));
      const result = results.get(id);
      if (!result) {
        throw new Error(`SubAgent not found: ${id}`);
      }
      return result;
    }),
    getResults: vi.fn(),
    cancel: vi.fn(),
    cancelAll: vi.fn(),
    listByParent: vi.fn().mockReturnValue([]),
    onEvent: vi.fn().mockReturnValue(() => {}),
    cleanup: vi.fn(),
  };
}

function executeWithRuntimeMetadata(
  tool: ReturnType<typeof createTaskTool>,
  args: Record<string, unknown>,
  metadata: Record<string, unknown> = { parentAgentId: 'parent-1', conversationId: 'conv-1' },
) {
  return tool.execute(args, { metadata });
}

// =============================================================================
// Tests
// =============================================================================

describe('createTaskTool', () => {
  let manager: ISubAgentManager;

  beforeEach(() => {
    manager = createMockManager();
  });

  describe('tool definition', () => {
    it('should create a tool with correct properties', () => {
      const tool = createTaskTool(manager);

      expect(tool.name).toBe('task');
      expect(tool.description).toContain('SubAgent');
      expect(tool.category).toBe('system');
      expect(tool.requiresConfirmation).toBe(false);
    });

    it('should have correct parameter schema', () => {
      const tool = createTaskTool(manager);
      const params = tool.parameters as unknown as Record<string, unknown>;

      expect(params.required).toContain('description');
      expect(params.required).toContain('prompt');
    });
  });

  describe('execute', () => {
    it('should spawn a SubAgent and return result in foreground mode', async () => {
      const tool = createTaskTool(manager);

      const result = await executeWithRuntimeMetadata(tool, {
        description: 'Test task',
        prompt: 'Do something',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as SubAgentResult).status).toBe('completed');
    });

    it('should return immediately in background mode', async () => {
      const tool = createTaskTool(manager);

      const result = await executeWithRuntimeMetadata(tool, {
        description: 'Test task',
        prompt: 'Do something',
        run_in_background: true,
      });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).status).toBe('running');
      expect((result.data as Record<string, unknown>).message).toContain('background');
    });

    it('should include rehydrate metadata in background results', async () => {
      const tool = createTaskTool(manager);

      const result = await tool.execute(
        {
          description: 'Test task',
          prompt: 'Do something',
          run_in_background: true,
          model: 'fast',
          subagent_type: 'code-search',
        },
        {
          metadata: {
            parentAgentId: 'parent-1',
            conversationId: 'conv-1',
            parentMessageId: 'msg-1',
            parentToolCallId: 'tool-1',
          },
        },
      );

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        parentAgentId: 'parent-1',
        description: 'Test task',
        subagentType: 'code-search',
        runMode: 'background',
        modelTier: 'fast',
        parentMessageId: 'msg-1',
        parentToolCallId: 'tool-1',
      });
    });

    it('should fail closed when conversationId metadata is missing', async () => {
      const tool = createTaskTool(manager);

      const result = await tool.execute(
        {
          description: 'Test task',
          prompt: 'Do something',
        },
        {
          metadata: { parentAgentId: 'parent-1' },
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing conversationId');
      expect(manager.spawn).not.toHaveBeenCalled();
    });

    it('should pass conversation and parent lineage into spawn config', async () => {
      const tool = createTaskTool(manager);

      await executeWithRuntimeMetadata(
        tool,
        {
          description: 'Test task',
          prompt: 'Do something',
          run_in_background: true,
        },
        {
          parentAgentId: 'parent-1',
          conversationId: 'conv-1',
          parentToolCallId: 'tool-1',
        },
      );

      expect(manager.spawn).toHaveBeenCalledWith(
        'parent-1',
        'conv-1',
        expect.objectContaining({
          parentToolCallId: 'tool-1',
        }),
      );
    });

    it('should handle resume for running SubAgent', async () => {
      const tool = createTaskTool(manager);

      // First, spawn a SubAgent
      await executeWithRuntimeMetadata(tool, {
        description: 'Test task',
        prompt: 'Do something',
        run_in_background: true,
      });

      // Get the spawned ID
      const spawnedId = (manager.spawn as ReturnType<typeof vi.fn>).mock.results[0]!.value;

      // Resume it
      const result = await tool.execute({
        description: '',
        prompt: '',
        resume: await spawnedId,
      });

      expect(result.success).toBe(true);
    });

    it('should return error for non-existent resume', async () => {
      const tool = createTaskTool(manager);

      const result = await tool.execute({
        description: '',
        prompt: '',
        resume: 'non-existent-id',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should use specialized agent type', async () => {
      const tool = createTaskTool(manager);

      await executeWithRuntimeMetadata(tool, {
        description: 'Search code',
        prompt: 'Find API endpoints',
        subagent_type: 'code-search',
      });

      expect(manager.spawn).toHaveBeenCalled();
      const config = (manager.spawn as ReturnType<typeof vi.fn>).mock.calls[0]![2];
      expect(config.type).toBe('code-search');
    });

    it('should use model tier', async () => {
      const tool = createTaskTool(manager);

      await executeWithRuntimeMetadata(tool, {
        description: 'Complex task',
        prompt: 'Do something complex',
        model: 'powerful',
      });

      const config = (manager.spawn as ReturnType<typeof vi.fn>).mock.calls[0]![2];
      expect(config.modelTier).toBe('powerful');
    });

    it('should return error for missing required args', async () => {
      const tool = createTaskTool(manager);

      const result = await tool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required');
    });
  });
});

describe('createTaskOutputTool', () => {
  let manager: ISubAgentManager;

  beforeEach(() => {
    manager = createMockManager();
  });

  describe('tool definition', () => {
    it('should create a tool with correct properties', () => {
      const tool = createTaskOutputTool(manager);

      expect(tool.name).toBe('task_output');
      expect(tool.description).toContain('background');
      expect(tool.category).toBe('system');
    });
  });

  describe('execute', () => {
    it('should return result for completed SubAgent', async () => {
      const tool = createTaskOutputTool(manager);

      // Setup a completed result
      (manager.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('completed');
      (manager.getResult as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'test-id',
        status: 'completed',
        response: 'Done',
      });

      const result = await tool.execute({ task_id: 'test-id' });

      expect(result.success).toBe(true);
      expect((result.data as SubAgentResult).status).toBe('completed');
    });

    it('should return status for running SubAgent in non-blocking mode', async () => {
      const tool = createTaskOutputTool(manager);

      (manager.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('running');

      const result = await tool.execute({ task_id: 'test-id', block: false });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).status).toBe('running');
    });

    it('should wait for result in blocking mode', async () => {
      const tool = createTaskOutputTool(manager);

      (manager.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('running');
      (manager.getResult as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'test-id',
        status: 'completed',
        response: 'Done after waiting',
      });

      const result = await tool.execute({ task_id: 'test-id', block: true });

      expect(result.success).toBe(true);
      expect((result.data as SubAgentResult).response).toBe('Done after waiting');
    });

    it('should return error for non-existent SubAgent', async () => {
      const tool = createTaskOutputTool(manager);

      (manager.getStatus as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const result = await tool.execute({ task_id: 'non-existent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error for missing task_id', async () => {
      const tool = createTaskOutputTool(manager);

      const result = await tool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required');
    });
  });
});

describe('registerSubAgentTools', () => {
  it('should register both task tools', () => {
    const manager = createMockManager();
    const registry = { register: vi.fn() };

    registerSubAgentTools(registry, manager);

    expect(registry.register).toHaveBeenCalledTimes(2);

    const registeredNames = (registry.register as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0].name,
    );
    expect(registeredNames).toContain('task');
    expect(registeredNames).toContain('task_output');
  });
});
