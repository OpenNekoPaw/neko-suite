/**
 * Task Tools Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSubAgentTool, createSubAgentOutputTool, registerSubAgentTools } from '../task-tool';
import type { ISubAgentManager, SubAgentStatus, SubAgentResult } from '../types';
import { formatChildRunScope, type ChildRunScope } from '@neko-agent/types';
import { ToolRegistry } from '../../tools';

// =============================================================================
// Mocks
// =============================================================================

function createMockManager(): ISubAgentManager {
  const results = new Map<string, SubAgentResult>();
  const statuses = new Map<string, SubAgentStatus>();

  return {
    spawn: vi.fn().mockImplementation(async (scope: ChildRunScope, config: { id: string }) => {
      const key = formatChildRunScope(scope);
      statuses.set(key, 'running');
      setTimeout(() => {
        statuses.set(key, 'completed');
        results.set(key, {
          scope,
          id: config.id,
          status: 'completed',
          response: 'Task completed',
          duration: 100,
          iterations: 2,
        });
      }, 10);
      return scope;
    }),
    spawnBatch: vi.fn(),
    getStatus: vi
      .fn()
      .mockImplementation((scope: ChildRunScope) => statuses.get(formatChildRunScope(scope))),
    getResult: vi.fn().mockImplementation(async (scope: ChildRunScope) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const result = results.get(formatChildRunScope(scope));
      if (!result) throw new Error(`SubAgent not found: ${formatChildRunScope(scope)}`);
      return result;
    }),
    getResults: vi.fn(),
    cancel: vi.fn(),
    cancelRun: vi.fn(),
    listByRun: vi.fn().mockReturnValue([]),
    onEvent: vi.fn().mockReturnValue(() => {}),
    cleanupRun: vi.fn(),
  };
}

function executeWithRuntimeMetadata(
  tool: ReturnType<typeof createSubAgentTool>,
  args: Record<string, unknown>,
  metadata: Record<string, unknown> = {
    parentAgentId: 'parent-1',
    conversationId: 'conv-1',
    runId: 'run-1',
  },
) {
  return tool.execute(args, { metadata });
}

// =============================================================================
// Tests
// =============================================================================

describe('createSubAgentTool', () => {
  let manager: ISubAgentManager;

  beforeEach(() => {
    manager = createMockManager();
  });

  describe('tool definition', () => {
    it('should create a tool with correct properties', () => {
      const tool = createSubAgentTool(manager);

      expect(tool.name).toBe('subagent');
      expect(tool.description).toContain('SubAgent');
      expect(tool.category).toBe('system');
      expect(tool.requiresConfirmation).toBe(false);
    });

    it('should have correct parameter schema', () => {
      const tool = createSubAgentTool(manager);
      const params = tool.parameters as unknown as Record<string, unknown>;

      expect(params.required).toContain('description');
      expect(params.required).toContain('prompt');
    });

    it('should allow host-contributed SubAgent types without a fixed domain enum', () => {
      const tool = createSubAgentTool(manager);
      const params = tool.parameters as {
        readonly properties: Record<
          string,
          { readonly enum?: readonly string[]; readonly type: string }
        >;
      };

      expect(params.properties.subagent_type).toEqual(
        expect.objectContaining({
          type: 'string',
        }),
      );
      expect(params.properties.subagent_type.enum).toBeUndefined();
      expect(params.properties.quality_tier).toBeUndefined();
    });

    it('should project Chinese model-facing schema text through ToolRegistry', () => {
      const registry = new ToolRegistry();
      registry.register(createSubAgentTool(manager));
      registry.register(createSubAgentOutputTool(manager));

      const definitions = registry.toToolDefinitions(undefined, { locale: 'zh-CN' });
      const byName = new Map(definitions.map((tool) => [tool.function.name, tool.function]));
      const task = byName.get('subagent');
      const taskOutput = byName.get('subagent_output');
      const taskParameters = task?.parameters as
        { properties?: Record<string, { description?: string }> } | undefined;
      const outputParameters = taskOutput?.parameters as
        { properties?: Record<string, { description?: string }> } | undefined;

      expect(task?.description).toContain('启动一个 SubAgent');
      expect(taskParameters?.properties?.prompt?.description).toBe('给 SubAgent 的详细任务说明。');
      expect(taskOutput?.description).toContain('获取后台 SubAgent 任务的输出');
      expect(outputParameters?.properties?.subagent_id?.description).toBe('SubAgent ID。');
      expect(outputParameters?.properties?.task_id).toBeUndefined();
      expect(byName.has('task')).toBe(false);
      expect(byName.has('task_output')).toBe(false);
      expect(task?.description).not.toContain('Launch a SubAgent');
      expect(taskParameters?.properties?.prompt?.description).not.toContain(
        'Detailed task instructions',
      );
    });
  });

  describe('execute', () => {
    it('should reject a Task ID passed as a SubAgent resume identity', async () => {
      const tool = createSubAgentTool(manager);

      const result = await executeWithRuntimeMetadata(tool, {
        description: 'Resume task',
        prompt: 'Resume work',
        resume: 'task_1784011924806_30',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Expected a SubAgent ID');
      expect(manager.getStatus).not.toHaveBeenCalled();
    });

    it('should spawn a SubAgent and return result in foreground mode', async () => {
      const tool = createSubAgentTool(manager);

      const result = await executeWithRuntimeMetadata(tool, {
        description: 'Test task',
        prompt: 'Do something',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as SubAgentResult).status).toBe('completed');
      expect((result.data as Record<string, unknown>).continuation).toMatchObject({
        source: 'subagent-result-continuation',
        status: 'completed',
      });
    });

    it('should return immediately in background mode', async () => {
      const tool = createSubAgentTool(manager);

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
      const tool = createSubAgentTool(manager);

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
            runId: 'run-1',
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

    it('should pass parent runtime locale into spawned SubAgent config', async () => {
      const tool = createSubAgentTool(manager);

      await tool.execute(
        {
          description: '中文分镜检查',
          prompt: '检查分镜提示词语言',
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

      expect(manager.spawn).toHaveBeenCalledWith(
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

    it('should fail closed when conversationId metadata is missing', async () => {
      const tool = createSubAgentTool(manager);

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
      expect(result.error).toBe('Tool execution requires conversationId ownership.');
      expect(manager.spawn).not.toHaveBeenCalled();
    });

    it('should pass conversation and parent lineage into spawn config', async () => {
      const tool = createSubAgentTool(manager);

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
          runId: 'run-1',
          parentToolCallId: 'tool-1',
        },
      );

      expect(manager.spawn).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          runId: 'run-1',
          parentRunId: 'parent-1',
          childKind: 'subagent',
        }),
        expect.objectContaining({
          parentToolCallId: 'tool-1',
        }),
      );
    });

    it('should handle resume for running SubAgent', async () => {
      const tool = createSubAgentTool(manager);

      // First, spawn a SubAgent
      await executeWithRuntimeMetadata(tool, {
        description: 'Test task',
        prompt: 'Do something',
        run_in_background: true,
      });

      // Get the spawned ID
      const spawnedScope = (await (manager.spawn as ReturnType<typeof vi.fn>).mock.results[0]!
        .value) as ChildRunScope;

      // Resume it
      const result = await executeWithRuntimeMetadata(tool, {
        description: '',
        prompt: '',
        resume: spawnedScope.childRunId,
      });

      expect(result.success).toBe(true);
    });

    it('should return error for non-existent resume', async () => {
      const tool = createSubAgentTool(manager);

      const result = await executeWithRuntimeMetadata(tool, {
        description: '',
        prompt: '',
        resume: 'subagent-non-existent-id',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('fails visibly when metadata and trace owners disagree', async () => {
      const tool = createSubAgentTool(manager);

      const conversationMismatch = await tool.execute(
        { description: 'Test task', prompt: 'Do something' },
        {
          metadata: { parentAgentId: 'parent-1', conversationId: 'conv-a', runId: 'run-a' },
          trace: { conversationId: 'conv-b', runId: 'run-a' },
        },
      );
      const runMismatch = await tool.execute(
        { description: 'Test task', prompt: 'Do something' },
        {
          metadata: { parentAgentId: 'parent-1', conversationId: 'conv-a', runId: 'run-a' },
          trace: { conversationId: 'conv-a', runId: 'run-b' },
        },
      );

      expect(conversationMismatch).toMatchObject({ success: false });
      expect(conversationMismatch.error).toContain('owner mismatch');
      expect(runMismatch).toMatchObject({ success: false });
      expect(runMismatch.error).toContain('owner mismatch');
      expect(manager.spawn).not.toHaveBeenCalled();
    });

    it('requires run and parent owner metadata', async () => {
      const tool = createSubAgentTool(manager);

      const missingRun = await tool.execute(
        { description: 'Test task', prompt: 'Do something' },
        { metadata: { parentAgentId: 'parent-1', conversationId: 'conv-1' } },
      );
      const missingParent = await tool.execute(
        { description: 'Test task', prompt: 'Do something' },
        { metadata: { conversationId: 'conv-1', runId: 'run-1' } },
      );

      expect(missingRun.error).toBe('Tool execution requires runId ownership.');
      expect(missingParent.error).toContain('Missing parentAgentId');
      expect(manager.spawn).not.toHaveBeenCalled();
    });

    it('should use specialized agent type', async () => {
      const tool = createSubAgentTool(manager);

      await executeWithRuntimeMetadata(tool, {
        description: 'Search code',
        prompt: 'Find API endpoints',
        subagent_type: 'code-search',
      });

      expect(manager.spawn).toHaveBeenCalled();
      const config = (manager.spawn as ReturnType<typeof vi.fn>).mock.calls[0]![1];
      expect(config.type).toBe('code-search');
    });

    it('should use model tier', async () => {
      const tool = createSubAgentTool(manager);

      await executeWithRuntimeMetadata(tool, {
        description: 'Complex task',
        prompt: 'Do something complex',
        model: 'powerful',
      });

      const config = (manager.spawn as ReturnType<typeof vi.fn>).mock.calls[0]![1];
      expect(config.modelTier).toBe('powerful');
    });

    it('should return error for missing required args', async () => {
      const tool = createSubAgentTool(manager);

      const result = await executeWithRuntimeMetadata(tool, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required');
    });
  });
});

describe('createSubAgentOutputTool', () => {
  let manager: ISubAgentManager;

  beforeEach(() => {
    manager = createMockManager();
  });

  describe('tool definition', () => {
    it('should create a tool with correct properties', () => {
      const tool = createSubAgentOutputTool(manager);

      expect(tool.name).toBe('subagent_output');
      expect(tool.description).toContain('background');
      expect(tool.category).toBe('system');
    });
  });

  describe('execute', () => {
    it('should return result for completed SubAgent', async () => {
      const tool = createSubAgentOutputTool(manager);

      // Setup a completed result
      (manager.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('completed');
      (manager.getResult as ReturnType<typeof vi.fn>).mockResolvedValue({
        scope: {
          conversationId: 'conv-1',
          runId: 'run-1',
          parentRunId: 'parent-1',
          childRunId: 'subagent-test-id',
          childKind: 'subagent',
        },
        id: 'subagent-test-id',
        status: 'completed',
        response: 'Done',
      });

      const result = await tool.execute(
        { subagent_id: 'subagent-test-id' },
        { metadata: { parentAgentId: 'parent-1', conversationId: 'conv-1', runId: 'run-1' } },
      );

      expect(result.success).toBe(true);
      expect((result.data as SubAgentResult).status).toBe('completed');
      expect((result.data as Record<string, unknown>).continuation).toMatchObject({
        source: 'subagent-result-continuation',
        subagentId: 'subagent-test-id',
        summary: 'Done',
      });
    });

    it('should return status for running SubAgent in non-blocking mode', async () => {
      const tool = createSubAgentOutputTool(manager);

      (manager.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('running');

      const result = await tool.execute(
        { subagent_id: 'subagent-test-id', block: false },
        { metadata: { parentAgentId: 'parent-1', conversationId: 'conv-1', runId: 'run-1' } },
      );

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).status).toBe('running');
      expect(manager.getStatus).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        runId: 'run-1',
        parentRunId: 'parent-1',
        childRunId: 'subagent-test-id',
        childKind: 'subagent',
      });
    });

    it('should wait for result in blocking mode', async () => {
      const tool = createSubAgentOutputTool(manager);

      (manager.getStatus as ReturnType<typeof vi.fn>).mockReturnValue('running');
      (manager.getResult as ReturnType<typeof vi.fn>).mockResolvedValue({
        scope: {
          conversationId: 'conv-1',
          runId: 'run-1',
          parentRunId: 'parent-1',
          childRunId: 'subagent-test-id',
          childKind: 'subagent',
        },
        id: 'subagent-test-id',
        status: 'completed',
        response: 'Done after waiting',
      });

      const result = await tool.execute(
        { subagent_id: 'subagent-test-id', block: true },
        { metadata: { parentAgentId: 'parent-1', conversationId: 'conv-1', runId: 'run-1' } },
      );

      expect(result.success).toBe(true);
      expect((result.data as SubAgentResult).response).toBe('Done after waiting');
    });

    it('should return error for non-existent SubAgent', async () => {
      const tool = createSubAgentOutputTool(manager);

      (manager.getStatus as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const result = await tool.execute(
        { subagent_id: 'subagent-non-existent' },
        { metadata: { parentAgentId: 'parent-1', conversationId: 'conv-1', runId: 'run-1' } },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error for missing subagent_id', async () => {
      const tool = createSubAgentOutputTool(manager);

      const result = await tool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('subagent_id');
    });

    it('should reject Task IDs before querying the SubAgent manager', async () => {
      const tool = createSubAgentOutputTool(manager);

      const result = await tool.execute({ subagent_id: 'task_1784011924806_30' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Expected a SubAgent ID');
      expect(result.error).toContain('Host task observation path');
      expect(manager.getStatus).not.toHaveBeenCalled();
      expect(manager.getResult).not.toHaveBeenCalled();
    });
  });
});

describe('registerSubAgentTools', () => {
  it('should register only canonical SubAgent tools', () => {
    const manager = createMockManager();
    const registry = { register: vi.fn() };

    registerSubAgentTools(registry, manager);

    expect(registry.register).toHaveBeenCalledTimes(2);

    const registeredNames = (registry.register as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0].name,
    );
    expect(registeredNames).toContain('subagent');
    expect(registeredNames).toContain('subagent_output');
    expect(registeredNames).not.toContain('task');
    expect(registeredNames).not.toContain('task_output');
  });
});
