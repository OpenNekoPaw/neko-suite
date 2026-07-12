import { describe, expect, it, vi } from 'vitest';
import { handleCompact, handleNew, handlePlan, handleResume } from '../session-handlers';
import type { CommandContext, CommandResult } from '../../types';

function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    conversations: {
      list: () => [
        { id: 'conv-1', title: 'First' },
        { id: 'conv-2', title: 'Second' },
      ],
      getActiveId: () => 'conv-1',
      create: vi.fn(() => 'conv-new'),
      clearCurrent: vi.fn(),
    },
    planMode: {
      isEnabled: () => false,
      toggle: vi.fn(() => true),
    },
    contextManager: {
      getTokenCount: () => 100,
      compress: vi.fn(async () => undefined),
    },
    ...overrides,
  };
}

async function resolve(result: CommandResult | Promise<CommandResult>): Promise<CommandResult> {
  return result;
}

describe('session command handlers', () => {
  it('creates a conversation and returns new-session semantics', async () => {
    const context = createContext();
    const result = await resolve(handleNew([], context));

    expect(context.conversations?.create).toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'newConversation',
      semantic: { family: 'session', result: { kind: 'new-created' } },
    });
    expect(result).not.toHaveProperty('output');
  });

  it('remains semantic-only without a conversation service', async () => {
    const result = await resolve(handleNew([], createContext({ conversations: undefined })));

    expect(result.semantic).toEqual({ family: 'session', result: { kind: 'new-created' } });
  });

  it('returns at most five recent conversations as action data', async () => {
    const conversations = Array.from({ length: 8 }, (_, index) => ({
      id: `conv-${index}`,
      title: `Conversation ${index}`,
    }));
    const context = createContext({
      conversations: {
        list: () => conversations,
        getActiveId: () => 'conv-0',
        create: () => 'conv-new',
        clearCurrent: () => undefined,
      },
    });
    const result = await resolve(handleResume([], context));

    expect(result.action).toBe('resumeConversation');
    expect(result.data?.['conversations']).toEqual(conversations.slice(0, 5));
    expect(result.semantic).toBeUndefined();
  });

  it('compresses the active conversation and returns compact semantics', async () => {
    const context = createContext();
    const result = await resolve(handleCompact([], context));

    expect(context.contextManager?.compress).toHaveBeenCalledWith('conv-1');
    expect(result).toMatchObject({
      action: 'compressContext',
      semantic: { family: 'session', result: { kind: 'compact-started' } },
    });
  });

  it('propagates compression failures instead of hiding them', async () => {
    const context = createContext({
      contextManager: {
        getTokenCount: () => 100,
        compress: vi.fn(async () => {
          throw new Error('Compression failed');
        }),
      },
    });

    await expect(handleCompact([], context)).rejects.toThrow('Compression failed');
  });

  it.each([
    [true, 'plan-changed'],
    [false, 'plan-changed'],
  ] as const)('returns the actual plan mode state (%s)', async (enabled, kind) => {
    const context = createContext({
      planMode: { isEnabled: () => !enabled, toggle: vi.fn(() => enabled) },
    });
    const result = await resolve(handlePlan([], context));

    expect(result).toMatchObject({
      action: 'togglePlanMode',
      data: { planMode: enabled },
      semantic: { family: 'session', result: { kind, enabled } },
    });
  });

  it('uses disabled state when the plan service is unavailable', async () => {
    const result = await resolve(handlePlan([], createContext({ planMode: undefined })));

    expect(result.data).toEqual({ planMode: false });
    expect(result.semantic).toEqual({
      family: 'session',
      result: { kind: 'plan-changed', enabled: false },
    });
  });
});
