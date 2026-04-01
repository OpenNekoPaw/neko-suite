/**
 * Tests for partitionToolCalls — split tool calls by concurrency safety
 */

import { describe, it, expect } from 'vitest';
import { partitionToolCalls } from '../partition-tool-calls';
import type { IToolRegistry, ToolCallInfo, Tool } from '@neko/shared';

// Helper to create a minimal mock tool
function mockTool(name: string, opts: Partial<Tool> = {}): Tool {
  return {
    name,
    description: '',
    parameters: { type: 'object', properties: {} },
    category: 'system',
    execute: async () => ({ success: true }),
    ...opts,
  };
}

// Helper to create a minimal mock registry
function mockRegistry(tools: Tool[]): IToolRegistry {
  const map = new Map(tools.map((t) => [t.name, t]));
  return {
    register: () => {},
    unregister: () => {},
    get: (name: string) => map.get(name),
    list: () => [...map.values()],
    listByCategory: () => [],
    execute: async () => ({ success: true }),
    toToolDefinitions: () => [],
  };
}

function callInfo(name: string, index: number): ToolCallInfo {
  return { id: `call_${index}`, name, arguments: {}, index };
}

describe('partitionToolCalls', () => {
  it('should put concurrency-safe tools in concurrent batch', () => {
    const registry = mockRegistry([
      mockTool('GenerateImage', { isConcurrencySafe: true }),
      mockTool('GenerateVideo', { isConcurrencySafe: true }),
    ]);

    const calls = [callInfo('GenerateImage', 0), callInfo('GenerateVideo', 1)];
    const result = partitionToolCalls(calls, registry);

    expect(result.concurrent).toHaveLength(2);
    expect(result.serial).toHaveLength(0);
  });

  it('should put unsafe tools in serial batch', () => {
    const registry = mockRegistry([
      mockTool('WriteTool', { isConcurrencySafe: false }),
      mockTool('DeleteElement', { isDestructive: true }),
    ]);

    const calls = [callInfo('WriteTool', 0), callInfo('DeleteElement', 1)];
    const result = partitionToolCalls(calls, registry);

    expect(result.concurrent).toHaveLength(0);
    expect(result.serial).toHaveLength(2);
  });

  it('should partition mixed tool calls correctly', () => {
    const registry = mockRegistry([
      mockTool('GenerateImage', { isConcurrencySafe: true }),
      mockTool('Read', { isConcurrencySafe: true, isReadOnly: true }),
      mockTool('Write', { isConcurrencySafe: false, isDestructive: true }),
    ]);

    const calls = [callInfo('GenerateImage', 0), callInfo('Write', 1), callInfo('Read', 2)];
    const result = partitionToolCalls(calls, registry);

    expect(result.concurrent).toHaveLength(2);
    expect(result.concurrent.map((c) => c.name)).toEqual(['GenerateImage', 'Read']);
    expect(result.serial).toHaveLength(1);
    expect(result.serial[0]!.name).toBe('Write');
  });

  it('should default unknown tools to serial (Fail-Closed)', () => {
    const registry = mockRegistry([]);

    const calls = [callInfo('UnknownTool', 0)];
    const result = partitionToolCalls(calls, registry);

    expect(result.concurrent).toHaveLength(0);
    expect(result.serial).toHaveLength(1);
  });

  it('should default tools without isConcurrencySafe to serial', () => {
    const registry = mockRegistry([mockTool('SomeTool')]); // no flag set

    const calls = [callInfo('SomeTool', 0)];
    const result = partitionToolCalls(calls, registry);

    expect(result.concurrent).toHaveLength(0);
    expect(result.serial).toHaveLength(1);
  });

  it('should handle empty tool calls', () => {
    const registry = mockRegistry([]);
    const result = partitionToolCalls([], registry);

    expect(result.concurrent).toHaveLength(0);
    expect(result.serial).toHaveLength(0);
  });

  it('should handle all tools being concurrent', () => {
    const registry = mockRegistry([
      mockTool('A', { isConcurrencySafe: true }),
      mockTool('B', { isConcurrencySafe: true }),
      mockTool('C', { isConcurrencySafe: true }),
    ]);

    const calls = [callInfo('A', 0), callInfo('B', 1), callInfo('C', 2)];
    const result = partitionToolCalls(calls, registry);

    expect(result.concurrent).toHaveLength(3);
    expect(result.serial).toHaveLength(0);
  });
});
