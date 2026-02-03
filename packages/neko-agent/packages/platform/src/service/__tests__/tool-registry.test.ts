/**
 * ToolRegistry Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from '../tool-registry';
import type { Tool, ToolCategory, ToolResult } from '../../types/tool';

// Create a mock tool
function createMockTool(name: string, category: ToolCategory = 'system'): Tool {
  return {
    name,
    description: `Mock tool: ${name}`,
    category,
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string' },
      },
      required: ['input'],
    },
    requiresConfirmation: false,
    execute: vi.fn().mockResolvedValue({ success: true, data: `Result from ${name}` }),
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('registration', () => {
    it('should register a tool', () => {
      const tool = createMockTool('test-tool');
      registry.register(tool);

      expect(registry.get('test-tool')).toBe(tool);
    });

    it('should unregister a tool', () => {
      const tool = createMockTool('test-tool');
      registry.register(tool);
      registry.unregister('test-tool');

      expect(registry.get('test-tool')).toBeUndefined();
    });

    it('should return undefined for non-existent tool', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });

    it('should replace tool with same name', () => {
      const tool1 = createMockTool('test-tool');
      const tool2 = createMockTool('test-tool');
      tool2.description = 'Updated description';

      registry.register(tool1);
      registry.register(tool2);

      expect(registry.get('test-tool')?.description).toBe('Updated description');
    });
  });

  describe('listing', () => {
    it('should list all registered tools', () => {
      registry.register(createMockTool('tool-1'));
      registry.register(createMockTool('tool-2'));
      registry.register(createMockTool('tool-3'));

      const tools = registry.list();
      expect(tools.length).toBe(3);
    });

    it('should list tools by category', () => {
      registry.register(createMockTool('timeline-tool', 'timeline'));
      registry.register(createMockTool('media-tool', 'media'));
      registry.register(createMockTool('system-tool', 'system'));

      const timelineTools = registry.listByCategory('timeline');
      expect(timelineTools.length).toBe(1);
      expect(timelineTools[0].name).toBe('timeline-tool');

      const mediaTools = registry.listByCategory('media');
      expect(mediaTools.length).toBe(1);
      expect(mediaTools[0].name).toBe('media-tool');
    });

    it('should return empty array for category with no tools', () => {
      registry.register(createMockTool('tool-1', 'timeline'));

      const tools = registry.listByCategory('media');
      expect(tools).toEqual([]);
    });
  });

  describe('execution config', () => {
    it('should set and get execution config', () => {
      const config = {
        timeout: 60000,
        retry: {
          maxRetries: 5,
          retryableErrors: ['TIMEOUT'],
        },
      };

      registry.setExecutionConfig('test-tool', config);
      const retrieved = registry.getExecutionConfig('test-tool');

      expect(retrieved).toEqual(config);
    });

    it('should return default config for tools without custom config', () => {
      const config = registry.getExecutionConfig('non-configured-tool');

      expect(config.timeout).toBe(30000);
      expect(config.retry.maxRetries).toBe(2);
    });

    it('should clear execution config on unregister', () => {
      const tool = createMockTool('test-tool');
      registry.register(tool);
      registry.setExecutionConfig('test-tool', {
        timeout: 60000,
        retry: { maxRetries: 5, retryableErrors: [] },
      });

      registry.unregister('test-tool');

      // After unregister, should return default config
      const config = registry.getExecutionConfig('test-tool');
      expect(config.timeout).toBe(30000);
    });
  });

  describe('execution', () => {
    it('should execute tool successfully', async () => {
      const tool = createMockTool('test-tool');
      registry.register(tool);

      const result = await registry.execute('test-tool', { input: 'test' });

      expect(result.success).toBe(true);
      expect(tool.execute).toHaveBeenCalledWith({ input: 'test' });
    });

    it('should return error for non-existent tool', async () => {
      const result = await registry.execute('non-existent', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should include duration in result', async () => {
      const tool = createMockTool('test-tool');
      registry.register(tool);

      const result = await registry.execute('test-tool', { input: 'test' });

      expect(result.duration).toBeDefined();
      expect(typeof result.duration).toBe('number');
    });

    it('should handle tool execution error', async () => {
      const tool = createMockTool('failing-tool');
      (tool.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Tool failed'));
      registry.register(tool);

      const result = await registry.execute('failing-tool', { input: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool failed');
    });
  });

  describe('tool definitions', () => {
    it('should convert tools to LLM definitions', () => {
      registry.register(createMockTool('tool-1'));
      registry.register(createMockTool('tool-2'));

      const definitions = registry.toToolDefinitions();

      expect(definitions.length).toBe(2);
      expect(definitions[0].type).toBe('function');
      expect(definitions[0].function.name).toBeDefined();
      expect(definitions[0].function.description).toBeDefined();
      expect(definitions[0].function.parameters).toBeDefined();
    });

    it('should return empty array when no tools registered', () => {
      const definitions = registry.toToolDefinitions();
      expect(definitions).toEqual([]);
    });
  });
});
