/**
 * Workflow Module Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowManager, WorkflowExecutor, WorkflowExecutionContext } from '../workflow-manager';
import { BuiltinWorkflowExecutor } from '../builtin-executor';
import { WorkflowTool, createWorkflowTools } from '../workflow-tool';
import type { Workflow, WorkflowInput, WorkflowResult } from '../../types/workflow';
import type { ProviderRegistry } from '../../provider/provider-registry';
import type { ConfigManager } from '../../config/config-manager';
import type { Provider } from '../../types/provider';

// Helper to create mock workflow
function createMockWorkflow(overrides?: Partial<Workflow>): Workflow {
  return {
    id: 'test-workflow',
    name: 'Test Workflow',
    description: 'A test workflow',
    type: 'builtin',
    inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
    outputSchema: { type: 'object' },
    config: {},
    ...overrides,
  };
}

// Helper to create mock executor
function createMockExecutor(): WorkflowExecutor & { execute: ReturnType<typeof vi.fn> } {
  return {
    execute: vi.fn().mockResolvedValue({
      executionId: 'exec-1',
      workflowId: 'test-workflow',
      status: 'completed',
      output: { result: 'success' },
    }),
  };
}

// Helper to create mock provider registry
function createMockProviderRegistry(providers: Map<string, Provider>): ProviderRegistry {
  return {
    getProvider: (id: string) => providers.get(id),
  } as ProviderRegistry;
}

function createMockConfigManager(providers: Map<string, Provider>): ConfigManager {
  return {
    getProvider: (id: string) => providers.get(id),
  } as ConfigManager;
}

describe('WorkflowManager', () => {
  let manager: WorkflowManager;

  beforeEach(() => {
    manager = new WorkflowManager();
  });

  describe('register/unregister', () => {
    it('should register a workflow', async () => {
      const workflow = createMockWorkflow();
      manager.register(workflow);

      const result = await manager.get('test-workflow');
      expect(result).toBeDefined();
      expect(result?.name).toBe('Test Workflow');
    });

    it('should unregister a workflow', async () => {
      manager.register(createMockWorkflow());
      manager.unregister('test-workflow');

      const result = await manager.get('test-workflow');
      expect(result).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should return empty array initially', async () => {
      const workflows = await manager.list();
      expect(workflows).toEqual([]);
    });

    it('should return all registered workflows', async () => {
      manager.register(createMockWorkflow({ id: 'workflow1' }));
      manager.register(createMockWorkflow({ id: 'workflow2' }));

      const workflows = await manager.list();
      expect(workflows).toHaveLength(2);
    });
  });

  describe('get', () => {
    it('should return workflow by ID', async () => {
      manager.register(createMockWorkflow({ id: 'my-workflow' }));

      const workflow = await manager.get('my-workflow');
      expect(workflow?.id).toBe('my-workflow');
    });

    it('should return undefined for non-existent workflow', async () => {
      const workflow = await manager.get('non-existent');
      expect(workflow).toBeUndefined();
    });
  });

  describe('execute', () => {
    it('should throw for non-existent workflow', async () => {
      await expect(
        manager.execute({ workflowId: 'non-existent', data: {} })
      ).rejects.toThrow('not found');
    });

    it('should throw for workflow without executor', async () => {
      manager.register(createMockWorkflow());

      await expect(
        manager.execute({ workflowId: 'test-workflow', data: {} })
      ).rejects.toThrow('No executor');
    });

    it('should execute workflow with registered executor', async () => {
      const workflow = createMockWorkflow();
      const executor = createMockExecutor();

      manager.register(workflow);
      manager.registerExecutor('builtin', executor);

      const result = await manager.execute({
        workflowId: 'test-workflow',
        data: { input: 'test' },
      });

      expect(result.status).toBe('completed');
      expect(executor.execute).toHaveBeenCalled();
    });

    it('should include execution ID', async () => {
      const workflow = createMockWorkflow();
      const executor = createMockExecutor();

      manager.register(workflow);
      manager.registerExecutor('builtin', executor);

      const result = await manager.execute({
        workflowId: 'test-workflow',
        data: {},
      });

      expect(result.executionId).toMatch(/^exec_\d+_\d+$/);
    });

    it('should include timing information', async () => {
      const workflow = createMockWorkflow();
      const executor = createMockExecutor();

      manager.register(workflow);
      manager.registerExecutor('builtin', executor);

      const result = await manager.execute({
        workflowId: 'test-workflow',
        data: {},
      });

      expect(result.timing).toBeDefined();
      expect(result.timing?.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle executor errors', async () => {
      const workflow = createMockWorkflow();
      const executor = createMockExecutor();
      executor.execute.mockRejectedValue(new Error('Execution failed'));

      manager.register(workflow);
      manager.registerExecutor('builtin', executor);

      const result = await manager.execute({
        workflowId: 'test-workflow',
        data: {},
      });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Execution failed');
    });

    it('should respect timeout option', async () => {
      const workflow = createMockWorkflow();
      const executor = createMockExecutor();
      executor.execute.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      manager.register(workflow);
      manager.registerExecutor('builtin', executor);

      const result = await manager.execute({
        workflowId: 'test-workflow',
        data: {},
        options: { timeout: 100 },
      });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('timed out');
    });

    it('should pass provider context to executor when providerId is set', async () => {
      // Create workflow with providerId in config
      const workflow = createMockWorkflow({
        config: { providerId: 'my-provider' },
      });

      // Create mock provider
      const mockProvider: Provider = {
        id: 'my-provider',
        name: 'My Provider',
        type: 'n8n',
        apiUrl: 'https://n8n.example.com',
        apiKey: 'provider-api-key',
        enabled: true,
      };

      const providers = new Map<string, Provider>([['my-provider', mockProvider]]);
      const mockConfigManager = createMockConfigManager(providers);

      // Create executor that captures context
      let capturedContext: WorkflowExecutionContext | undefined;
      const executor: WorkflowExecutor = {
        execute: vi.fn().mockImplementation(async (_workflow, _input, context) => {
          capturedContext = context;
          return {
            executionId: 'exec-1',
            workflowId: workflow.id,
            status: 'completed',
            output: {},
          };
        }),
      };

      manager.setConfigManager(mockConfigManager);
      manager.register(workflow);
      manager.registerExecutor('builtin', executor);

      await manager.execute({
        workflowId: 'test-workflow',
        data: {},
      });

      expect(capturedContext).toBeDefined();
      expect(capturedContext?.provider).toBeDefined();
      expect(capturedContext?.provider?.apiKey).toBe('provider-api-key');
      expect(capturedContext?.provider?.apiUrl).toBe('https://n8n.example.com');
    });

    it('should not include provider in context when providerId is not set', async () => {
      const workflow = createMockWorkflow(); // No providerId

      let capturedContext: WorkflowExecutionContext | undefined;
      const executor: WorkflowExecutor = {
        execute: vi.fn().mockImplementation(async (_workflow, _input, context) => {
          capturedContext = context;
          return {
            executionId: 'exec-1',
            workflowId: workflow.id,
            status: 'completed',
            output: {},
          };
        }),
      };

      manager.register(workflow);
      manager.registerExecutor('builtin', executor);

      await manager.execute({
        workflowId: 'test-workflow',
        data: {},
      });

      expect(capturedContext).toBeDefined();
      expect(capturedContext?.provider).toBeUndefined();
    });

    it('should not include provider when provider registry is not set', async () => {
      const workflow = createMockWorkflow({
        config: { providerId: 'my-provider' },
      });

      let capturedContext: WorkflowExecutionContext | undefined;
      const executor: WorkflowExecutor = {
        execute: vi.fn().mockImplementation(async (_workflow, _input, context) => {
          capturedContext = context;
          return {
            executionId: 'exec-1',
            workflowId: workflow.id,
            status: 'completed',
            output: {},
          };
        }),
      };

      // Don't set provider registry
      manager.register(workflow);
      manager.registerExecutor('builtin', executor);

      await manager.execute({
        workflowId: 'test-workflow',
        data: {},
      });

      expect(capturedContext).toBeDefined();
      expect(capturedContext?.provider).toBeUndefined();
    });
  });

  describe('getExecution', () => {
    it('should return undefined for non-existent execution', async () => {
      const result = await manager.getExecution('non-existent');
      expect(result).toBeUndefined();
    });

    it('should return execution state', async () => {
      const workflow = createMockWorkflow();
      const executor = createMockExecutor();

      manager.register(workflow);
      manager.registerExecutor('builtin', executor);

      const execResult = await manager.execute({
        workflowId: 'test-workflow',
        data: {},
      });

      const state = await manager.getExecution(execResult.executionId);
      expect(state?.status).toBe('completed');
    });
  });

  describe('cancelExecution', () => {
    it('should return false for non-existent execution', async () => {
      const result = await manager.cancelExecution('non-existent');
      expect(result).toBe(false);
    });

    it('should return false for completed execution', async () => {
      const workflow = createMockWorkflow();
      const executor = createMockExecutor();

      manager.register(workflow);
      manager.registerExecutor('builtin', executor);

      const execResult = await manager.execute({
        workflowId: 'test-workflow',
        data: {},
      });

      const cancelled = await manager.cancelExecution(execResult.executionId);
      expect(cancelled).toBe(false);
    });
  });
});

describe('BuiltinWorkflowExecutor', () => {
  let executor: BuiltinWorkflowExecutor;

  beforeEach(() => {
    executor = new BuiltinWorkflowExecutor();
  });

  describe('registerHandler', () => {
    it('should register and execute handler', async () => {
      const handler = vi.fn().mockResolvedValue({ result: 'done' });
      executor.registerHandler('my-workflow', handler);

      const result = await executor.execute(
        createMockWorkflow({ id: 'my-workflow' }),
        { workflowId: 'my-workflow', data: { input: 'test' } }
      );

      expect(result.status).toBe('completed');
      expect(result.output).toEqual({ result: 'done' });
      expect(handler).toHaveBeenCalledWith({ input: 'test' });
    });
  });

  describe('execute', () => {
    it('should fail for unregistered handler', async () => {
      const result = await executor.execute(
        createMockWorkflow({ id: 'unknown' }),
        { workflowId: 'unknown', data: {} }
      );

      expect(result.status).toBe('failed');
      expect(result.error).toContain('No handler');
    });

    it('should handle handler errors', async () => {
      executor.registerHandler('failing', async () => {
        throw new Error('Handler error');
      });

      const result = await executor.execute(
        createMockWorkflow({ id: 'failing' }),
        { workflowId: 'failing', data: {} }
      );

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Handler error');
    });
  });

  describe('unregisterHandler', () => {
    it('should unregister handler', async () => {
      executor.registerHandler('temp', async () => ({ done: true }));
      executor.unregisterHandler('temp');

      const result = await executor.execute(
        createMockWorkflow({ id: 'temp' }),
        { workflowId: 'temp', data: {} }
      );

      expect(result.status).toBe('failed');
    });
  });
});

describe('WorkflowTool', () => {
  let manager: WorkflowManager;

  beforeEach(() => {
    manager = new WorkflowManager();
    const executor = createMockExecutor();
    manager.registerExecutor('builtin', executor);
  });

  describe('constructor', () => {
    it('should create tool with prefixed name', () => {
      const workflow = createMockWorkflow({ id: 'my-workflow', type: 'builtin' });
      manager.register(workflow);

      const tool = new WorkflowTool(manager, workflow);

      expect(tool.name).toBe('workflow_builtin_my-workflow');
    });

    it('should use workflow description', () => {
      const workflow = createMockWorkflow({ description: 'My description' });
      manager.register(workflow);

      const tool = new WorkflowTool(manager, workflow);

      expect(tool.description).toBe('My description');
    });
  });

  describe('execute', () => {
    it('should execute workflow and return result', async () => {
      const workflow = createMockWorkflow();
      manager.register(workflow);

      const tool = new WorkflowTool(manager, workflow);
      const result = await tool.execute({ input: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'success' });
    });

    it('should handle execution errors', async () => {
      const workflow = createMockWorkflow({ type: 'custom' });
      manager.register(workflow);

      const tool = new WorkflowTool(manager, workflow);
      const result = await tool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('No executor');
    });
  });

  describe('toDefinition', () => {
    it('should return tool definition', () => {
      const workflow = createMockWorkflow({
        id: 'my-workflow',
        description: 'My workflow',
        inputSchema: { type: 'object', properties: { x: { type: 'number' } } },
      });
      manager.register(workflow);

      const tool = new WorkflowTool(manager, workflow);
      const def = tool.toDefinition();

      expect(def.type).toBe('function');
      expect(def.function.name).toBe('workflow_builtin_my-workflow');
      expect(def.function.description).toBe('My workflow');
    });
  });
});

describe('createWorkflowTools', () => {
  it('should create tools for all workflows', async () => {
    const manager = new WorkflowManager();
    manager.register(createMockWorkflow({ id: 'workflow1' }));
    manager.register(createMockWorkflow({ id: 'workflow2' }));

    const tools = await createWorkflowTools(manager);

    expect(tools).toHaveLength(2);
    expect(tools[0].name).toContain('workflow1');
    expect(tools[1].name).toContain('workflow2');
  });

  it('should return empty array for no workflows', async () => {
    const manager = new WorkflowManager();
    const tools = await createWorkflowTools(manager);

    expect(tools).toEqual([]);
  });
});
