import { describe, expect, it, vi } from 'vitest';
import { ConversationManager, type ConversationStorage } from '../conversation-manager';

function createMemoryStorage(): ConversationStorage & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    get: vi.fn(<T>(key: string): T | undefined => store.get(key) as T | undefined),
    update: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
    }),
  };
}

describe('ConversationManager', () => {
  it('creates conversations with generated ids and active state', () => {
    const manager = new ConversationManager(undefined, undefined, { generateId: () => 'conv-1' });

    expect(manager.create()).toBe('conv-1');
    expect(manager.getActiveId()).toBe('conv-1');
    expect(manager.getActive()).toEqual(
      expect.objectContaining({ id: 'conv-1', title: 'New Chat', messages: [] }),
    );
  });

  it('adds messages, generates title, and updates token estimate', () => {
    const manager = new ConversationManager(undefined, undefined, { generateId: () => 'conv-1' });
    const id = manager.create();

    manager.addMessage(id, {
      id: 'msg-1',
      role: 'user',
      content: 'Create a short animation plan for the intro scene',
      timestamp: 1,
    });

    expect(manager.get(id)).toEqual(
      expect.objectContaining({
        title: 'Create a short animation plan for the intro scene',
        tokenCount: 13,
      }),
    );
  });

  it('marks conversations resumable when assistant tool calls are unfinished', () => {
    const manager = new ConversationManager(undefined, undefined, { generateId: () => 'conv-1' });
    const id = manager.create();

    manager.addMessage(id, {
      id: 'msg-1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      contentBlocks: [
        {
          id: 'block-tool-1',
          type: 'tool_call',
          timestamp: 1,
          toolCall: { id: 'tool-1', name: 'read_file', arguments: {} },
        },
      ],
    });

    expect(manager.get(id)?.resumable).toBe(true);
    expect(manager.getResumable().map((conversation) => conversation.id)).toEqual(['conv-1']);
  });

  it('projects messages to agent history with tool calls and results', () => {
    const manager = new ConversationManager(undefined, undefined, { generateId: () => 'conv-1' });
    const id = manager.create();

    manager.addMessage(id, {
      id: 'msg-1',
      role: 'assistant',
      content: 'I read the file.',
      timestamp: 1,
      contentBlocks: [
        {
          id: 'block-tool-1',
          type: 'tool_call',
          timestamp: 1,
          toolCall: {
            id: 'tool-1',
            name: 'read_file',
            arguments: { path: '/tmp/a.ts' },
            result: { success: true, data: 'content' },
          },
        },
      ],
    });

    expect(manager.toAgentHistory(id)).toEqual([
      {
        role: 'assistant',
        content: 'I read the file.',
        toolCalls: [{ id: 'tool-1', name: 'read_file', arguments: { path: '/tmp/a.ts' } }],
        toolResults: [{ callId: 'tool-1', success: true, data: 'content' }],
      },
    ]);
  });

  it('persists non-empty conversations and active id on flush', () => {
    const storage = createMemoryStorage();
    const manager = new ConversationManager(storage, undefined, { generateId: () => 'conv-1' });
    const id = manager.create();
    manager.addMessage(id, {
      id: 'msg-1',
      role: 'user',
      content: 'hello',
      timestamp: 1,
    });

    manager.flush();

    expect(storage.update).toHaveBeenCalledWith(
      'conversations',
      expect.objectContaining({
        conversations: expect.arrayContaining([[id, expect.objectContaining({ id })]]),
        activeId: id,
      }),
    );
  });

  it('cleans up empty conversations and switches active id', () => {
    let count = 0;
    const manager = new ConversationManager(undefined, undefined, {
      generateId: () => `conv-${++count}`,
    });
    const emptyId = manager.create();
    const keptId = manager.create();
    manager.addMessage(keptId, {
      id: 'msg-1',
      role: 'user',
      content: 'keep',
      timestamp: 1,
    });
    manager.setActive(emptyId);

    expect(manager.cleanupEmpty()).toBe(1);
    expect(manager.get(emptyId)).toBeUndefined();
    expect(manager.getActiveId()).toBe(keptId);
  });
});
