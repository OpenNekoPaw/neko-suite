/**
 * Session Handlers Tests
 *
 * Tests for session command handlers: new, resume, compact, plan
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleNew, handleResume, handleCompact, handlePlan } from '../session-handlers';
import type { CommandContext } from '../../types';

// Mock context factory
function createMockContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    conversations: {
      create: vi.fn(),
      getActiveId: vi.fn().mockReturnValue('conv-123'),
      list: vi.fn().mockReturnValue([
        { id: 'conv-1', title: 'Conversation 1' },
        { id: 'conv-2', title: 'Conversation 2' },
        { id: 'conv-3', title: 'Conversation 3' },
      ]),
    },
    contextManager: {
      compress: vi.fn().mockResolvedValue(undefined),
    },
    planMode: {
      toggle: vi.fn().mockReturnValue(true),
      isEnabled: vi.fn().mockReturnValue(false),
    },
    ...overrides,
  } as unknown as CommandContext;
}

describe('handleNew', () => {
  it('should create new conversation', () => {
    const context = createMockContext();
    const result = handleNew([], context);

    expect(result.handled).toBe(true);
    expect(result.continueExecution).toBe(true);
    expect(result.output).toBe('New conversation created');
    expect(result.action).toBe('newConversation');
    expect(context.conversations?.create).toHaveBeenCalled();
  });

  it('should work without conversations service', () => {
    const context = createMockContext({ conversations: undefined });
    const result = handleNew([], context);

    expect(result.handled).toBe(true);
    expect(result.output).toBe('New conversation created');
  });

  it('should work with empty context', () => {
    const result = handleNew([], {} as CommandContext);

    expect(result.handled).toBe(true);
  });
});

describe('handleResume', () => {
  it('should return recent conversations', () => {
    const context = createMockContext();
    const result = handleResume([], context);

    expect(result.handled).toBe(true);
    expect(result.continueExecution).toBe(true);
    expect(result.action).toBe('resumeConversation');
    expect(result.data?.conversations).toHaveLength(3);
  });

  it('should limit to 5 conversations', () => {
    const context = createMockContext();
    context.conversations!.list = vi.fn().mockReturnValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: `conv-${i}`,
        title: `Conversation ${i}`,
      })),
    );

    const result = handleResume([], context);

    expect(result.data?.conversations).toHaveLength(5);
  });

  it('should include conversation id and title', () => {
    const context = createMockContext();
    const result = handleResume([], context);

    const firstConv = result.data?.conversations[0];
    expect(firstConv).toHaveProperty('id');
    expect(firstConv).toHaveProperty('title');
  });

  it('should handle empty conversation list', () => {
    const context = createMockContext();
    context.conversations!.list = vi.fn().mockReturnValue([]);

    const result = handleResume([], context);

    expect(result.data?.conversations).toEqual([]);
  });

  it('should work without conversations service', () => {
    const context = createMockContext({ conversations: undefined });
    const result = handleResume([], context);

    expect(result.handled).toBe(true);
    expect(result.data?.conversations).toEqual([]);
  });
});

describe('handleCompact', () => {
  it('should compress context for active conversation', async () => {
    const context = createMockContext();
    const result = await handleCompact([], context);

    expect(result.handled).toBe(true);
    expect(result.continueExecution).toBe(true);
    expect(result.output).toBe('Context compression initiated');
    expect(result.action).toBe('compressContext');
    expect(context.contextManager?.compress).toHaveBeenCalledWith('conv-123');
  });

  it('should work without active conversation', async () => {
    const context = createMockContext();
    context.conversations!.getActiveId = vi.fn().mockReturnValue(null);

    const result = await handleCompact([], context);

    expect(result.handled).toBe(true);
    expect(context.contextManager?.compress).not.toHaveBeenCalled();
  });

  it('should work without context manager', async () => {
    const context = createMockContext({ contextManager: undefined });

    const result = await handleCompact([], context);

    expect(result.handled).toBe(true);
  });

  it('should work without conversations service', async () => {
    const context = createMockContext({ conversations: undefined });

    const result = await handleCompact([], context);

    expect(result.handled).toBe(true);
  });

  it('should handle compression errors gracefully', async () => {
    const context = createMockContext();
    context.contextManager!.compress = vi.fn().mockRejectedValue(new Error('Compression failed'));

    await expect(handleCompact([], context)).rejects.toThrow('Compression failed');
  });
});

describe('handlePlan', () => {
  it('should toggle plan mode on', () => {
    const context = createMockContext();
    const result = handlePlan([], context);

    expect(result.handled).toBe(true);
    expect(result.continueExecution).toBe(true);
    expect(result.output).toBe('Plan mode enabled');
    expect(result.action).toBe('togglePlanMode');
    expect(result.data?.planMode).toBe(true);
    expect(context.planMode?.toggle).toHaveBeenCalled();
  });

  it('should toggle plan mode off', () => {
    const context = createMockContext();
    context.planMode!.toggle = vi.fn().mockReturnValue(false);

    const result = handlePlan([], context);

    expect(result.output).toBe('Plan mode disabled');
    expect(result.data?.planMode).toBe(false);
  });

  it('should work without plan mode service', () => {
    const context = createMockContext({ planMode: undefined });

    const result = handlePlan([], context);

    expect(result.handled).toBe(true);
    expect(result.output).toBe('Plan mode disabled');
    expect(result.data?.planMode).toBe(false);
  });

  it('should work with empty context', () => {
    const result = handlePlan([], {} as CommandContext);

    expect(result.handled).toBe(true);
    expect(result.data?.planMode).toBe(false);
  });
});
