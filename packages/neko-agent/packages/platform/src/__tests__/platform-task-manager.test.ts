import { describe, expect, it, vi } from 'vitest';
import type {
  IToolRegistry,
  Task,
  Tool,
  ToolCategory,
  ToolDefinition,
  ToolResult,
} from '@neko/shared';
import { createPlatform, type PlatformOptions } from '../index';

describe('platform task manager startup', () => {
  it('registers media executors before initializing and resuming persisted tasks', async () => {
    const calls: string[] = [];
    const taskManager = createTaskManager(calls);
    const platform = createPlatform({
      toolRegistry: createToolRegistry(),
      taskManager,
    });

    await Promise.resolve();
    await Promise.resolve();

    const firstRegisterIndex = calls.findIndex((call) => call.startsWith('register:'));
    expect(firstRegisterIndex).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('initialize')).toBeGreaterThan(firstRegisterIndex);
    expect(calls.indexOf('resume')).toBeGreaterThan(calls.indexOf('initialize'));

    platform.dispose();
  });
});

function createTaskManager(calls: string[]): NonNullable<PlatformOptions['taskManager']> {
  return {
    submit: vi.fn(async () => 'task-1'),
    get: vi.fn(async () => undefined),
    cancel: vi.fn(async () => false),
    delete: vi.fn(async () => false),
    waitForCompletion: vi.fn(async (): Promise<Task> => {
      throw new Error('not used');
    }),
    list: vi.fn(async () => []),
    onProgress: vi.fn(() => () => undefined),
    registerExecutor: vi.fn((type: string) => {
      calls.push(`register:${type}`);
    }),
    initialize: vi.fn(async () => {
      calls.push('initialize');
    }),
    resumePendingTasks: vi.fn(async () => {
      calls.push('resume');
      return [];
    }),
    dispose: vi.fn(),
  };
}

function createToolRegistry(): IToolRegistry {
  const tools = new Map<string, Tool>();
  return {
    register: (tool) => {
      tools.set(tool.name, tool);
    },
    unregister: (name) => {
      tools.delete(name);
    },
    get: (name) => tools.get(name),
    has: (name) => tools.has(name),
    list: () => Array.from(tools.values()),
    listByCategory: (_category: ToolCategory) => [],
    execute: async (): Promise<ToolResult> => ({ data: null }),
    toToolDefinitions: (): ToolDefinition[] => [],
  };
}
