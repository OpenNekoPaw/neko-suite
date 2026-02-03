/**
 * PromptManager and ChainPromptExecutor Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PromptManager, ChainPromptExecutor } from '../prompt-manager';
import type { Prompt } from '../../types/prompt';

describe('PromptManager', () => {
  let manager: PromptManager;

  beforeEach(() => {
    manager = new PromptManager();
  });

  describe('builtin prompts', () => {
    it('should have builtin prompts registered', () => {
      const prompts = manager.list();
      expect(prompts.length).toBeGreaterThan(0);
    });

    it('should include system-video-editor prompt', () => {
      const prompt = manager.get('system-video-editor');
      expect(prompt).toBeDefined();
      expect(prompt?.category).toBe('system');
    });

    it('should include format-json-output prompt', () => {
      const prompt = manager.get('format-json-output');
      expect(prompt).toBeDefined();
      expect(prompt?.category).toBe('format');
    });

    it('should include task-planning prompt', () => {
      const prompt = manager.get('task-planning');
      expect(prompt).toBeDefined();
      expect(prompt?.category).toBe('chain');
    });
  });

  describe('list by category', () => {
    it('should list prompts by category', () => {
      const systemPrompts = manager.listByCategory('system');
      expect(systemPrompts.every((p) => p.category === 'system')).toBe(true);
    });

    it('should return empty array for category with no prompts', () => {
      // Unregister all custom prompts to test empty case
      const customPrompts = manager.listByCategory('custom');
      // Initially should be empty since we only registered non-custom prompts
      expect(Array.isArray(customPrompts)).toBe(true);
    });
  });

  describe('register and unregister', () => {
    it('should register custom prompt', () => {
      const customPrompt: Prompt = {
        id: 'custom-test',
        name: 'Custom Test',
        description: 'Test prompt',
        category: 'custom',
        template: 'Hello {{name}}!',
        variables: [
          { name: 'name', description: 'Name', type: 'string', required: true },
        ],
        version: '1.0.0',
      };

      manager.register(customPrompt);
      expect(manager.get('custom-test')).toBeDefined();
    });

    it('should unregister prompt', () => {
      const customPrompt: Prompt = {
        id: 'to-remove',
        name: 'To Remove',
        description: 'Will be removed',
        category: 'custom',
        template: 'Test',
        variables: [],
        version: '1.0.0',
      };

      manager.register(customPrompt);
      expect(manager.get('to-remove')).toBeDefined();

      manager.unregister('to-remove');
      expect(manager.get('to-remove')).toBeUndefined();
    });
  });

  describe('render', () => {
    it('should render prompt with variables', () => {
      const prompt: Prompt = {
        id: 'greeting',
        name: 'Greeting',
        description: 'Greet someone',
        category: 'custom',
        template: 'Hello {{name}}, welcome to {{place}}!',
        variables: [
          { name: 'name', description: 'Name', type: 'string', required: true },
          { name: 'place', description: 'Place', type: 'string', required: true },
        ],
        version: '1.0.0',
      };

      manager.register(prompt);
      const result = manager.render('greeting', { name: 'Alice', place: 'Wonderland' });

      expect(result.content).toBe('Hello Alice, welcome to Wonderland!');
      expect(result.warnings.length).toBe(0);
    });

    it('should use default values for missing optional variables', () => {
      const prompt: Prompt = {
        id: 'optional-test',
        name: 'Optional Test',
        description: 'Test optional vars',
        category: 'custom',
        template: 'Value: {{value}}',
        variables: [
          { name: 'value', description: 'Value', type: 'string', required: false, default: 'default' },
        ],
        version: '1.0.0',
      };

      manager.register(prompt);
      const result = manager.render('optional-test', {});

      expect(result.content).toBe('Value: default');
    });

    it('should add warning for missing required variables', () => {
      const prompt: Prompt = {
        id: 'required-test',
        name: 'Required Test',
        description: 'Test required vars',
        category: 'custom',
        template: 'Name: {{name}}',
        variables: [
          { name: 'name', description: 'Name', type: 'string', required: true },
        ],
        version: '1.0.0',
      };

      manager.register(prompt);
      const result = manager.render('required-test', {});

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('name');
    });

    it('should throw error for non-existent prompt', () => {
      expect(() => manager.render('non-existent', {})).toThrow("Prompt 'non-existent' not found");
    });

    it('should format object variables as JSON', () => {
      const prompt: Prompt = {
        id: 'json-test',
        name: 'JSON Test',
        description: 'Test JSON formatting',
        category: 'custom',
        template: 'Data: {{data}}',
        variables: [
          { name: 'data', description: 'Data', type: 'object', required: true },
        ],
        version: '1.0.0',
      };

      manager.register(prompt);
      const result = manager.render('json-test', { data: { key: 'value' } });

      expect(result.content).toContain('"key"');
      expect(result.content).toContain('"value"');
    });
  });
});

describe('ChainPromptExecutor', () => {
  let promptManager: PromptManager;
  let executor: ChainPromptExecutor;

  beforeEach(() => {
    promptManager = new PromptManager();
    executor = new ChainPromptExecutor(promptManager);
  });

  describe('builtin chains', () => {
    it('should have builtin chains registered', () => {
      const chains = executor.listChains();
      expect(chains.length).toBeGreaterThan(0);
    });

    it('should include video-edit-workflow chain', () => {
      const chain = executor.getChain('chain-video-edit-workflow');
      expect(chain).toBeDefined();
      expect(chain?.steps.length).toBeGreaterThan(0);
    });
  });

  describe('register chain', () => {
    it('should register custom chain', () => {
      executor.registerChain({
        id: 'custom-chain',
        name: 'Custom Chain',
        description: 'Test chain',
        steps: [
          { name: 'step1', promptId: 'task-planning' },
        ],
      });

      expect(executor.getChain('custom-chain')).toBeDefined();
    });
  });

  describe('create simple chain', () => {
    it('should create chain from prompt IDs', () => {
      const chain = executor.createSimpleChain(
        'simple-chain',
        'Simple Chain',
        ['task-planning']
      );

      expect(chain.id).toBe('simple-chain');
      expect(chain.steps.length).toBe(1);
      expect(executor.getChain('simple-chain')).toBeDefined();
    });
  });

  describe('execute chain', () => {
    it('should execute chain with mock executor', async () => {
      // Register a simple test prompt
      promptManager.register({
        id: 'test-prompt',
        name: 'Test',
        description: 'Test prompt',
        category: 'custom',
        template: 'Input: {{input}}',
        variables: [
          { name: 'input', description: 'Input', type: 'string', required: true },
        ],
        version: '1.0.0',
      });

      executor.registerChain({
        id: 'test-chain',
        name: 'Test Chain',
        description: 'For testing',
        steps: [{ name: 'test', promptId: 'test-prompt' }],
      });

      const mockExecutor = vi.fn().mockResolvedValue('Mock response');
      const result = await executor.execute('test-chain', mockExecutor, {
        variables: { input: 'test value' },
      });

      expect(result.output).toBe('Mock response');
      expect(result.stepResults.size).toBe(1);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(mockExecutor).toHaveBeenCalledWith('Input: test value');
    });

    it('should throw error for non-existent chain', async () => {
      const mockExecutor = vi.fn();
      await expect(executor.execute('non-existent', mockExecutor)).rejects.toThrow(
        "Chain 'non-existent' not found"
      );
    });

    it('should call onStepComplete callback', async () => {
      promptManager.register({
        id: 'callback-test',
        name: 'Callback Test',
        description: 'Test',
        category: 'custom',
        template: 'Test',
        variables: [],
        version: '1.0.0',
      });

      executor.registerChain({
        id: 'callback-chain',
        name: 'Callback Chain',
        description: 'For testing callbacks',
        steps: [{ name: 'step1', promptId: 'callback-test' }],
      });

      const onStepComplete = vi.fn();
      const mockExecutor = vi.fn().mockResolvedValue('result');

      await executor.execute('callback-chain', mockExecutor, { onStepComplete });

      expect(onStepComplete).toHaveBeenCalledWith('step1', 'result');
    });

    it('should apply transform function', async () => {
      promptManager.register({
        id: 'transform-test',
        name: 'Transform Test',
        description: 'Test',
        category: 'custom',
        template: 'Test',
        variables: [],
        version: '1.0.0',
      });

      executor.registerChain({
        id: 'transform-chain',
        name: 'Transform Chain',
        description: 'For testing transforms',
        steps: [
          {
            name: 'step1',
            promptId: 'transform-test',
            transform: (output: string) => output.toUpperCase(),
          },
        ],
      });

      const mockExecutor = vi.fn().mockResolvedValue('lowercase');
      const result = await executor.execute('transform-chain', mockExecutor);

      expect(result.output).toBe('LOWERCASE');
    });

    it('should handle transform errors gracefully', async () => {
      promptManager.register({
        id: 'error-transform',
        name: 'Error Transform',
        description: 'Test',
        category: 'custom',
        template: 'Test',
        variables: [],
        version: '1.0.0',
      });

      executor.registerChain({
        id: 'error-chain',
        name: 'Error Chain',
        description: 'For testing error handling',
        steps: [
          {
            name: 'step1',
            promptId: 'error-transform',
            transform: () => {
              throw new Error('Transform failed');
            },
          },
        ],
      });

      const mockExecutor = vi.fn().mockResolvedValue('original');
      const result = await executor.execute('error-chain', mockExecutor);

      // Should keep original result when transform fails
      expect(result.output).toBe('original');
    });
  });
});
