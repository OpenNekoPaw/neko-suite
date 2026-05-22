import { describe, expect, it, vi } from 'vitest';
import type { ConversationRecord } from '../conversation-record';
import {
  ConversationPersistenceRuntime,
  type ConversationPersistenceRuntimeStorage,
} from '../conversation-persistence-runtime';

describe('ConversationPersistenceRuntime', () => {
  it('persists a projected conversation record through injected storage', async () => {
    const saved: ConversationRecord[] = [];
    const storage: ConversationPersistenceRuntimeStorage = {
      save: vi.fn(async (record) => {
        saved.push(record);
      }),
      delete: vi.fn(async () => undefined),
    };

    const runtime = new ConversationPersistenceRuntime({
      workDir: '/repo',
      storage,
      getConversation: () => ({
        id: 'conv-1',
        title: 'Task',
        createdAt: 100,
        updatedAt: 200,
        messages: [{ id: 'msg-1', role: 'user', content: 'hello', timestamp: 1 }],
      }),
    });

    await expect(runtime.persistConversation('conv-1')).resolves.toEqual({
      kind: 'saved',
      conversationId: 'conv-1',
    });
    expect(saved).toEqual([
      expect.objectContaining({
        id: 'conv-1',
        title: 'Task',
        workDir: '/repo',
        source: 'extension',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ]);
  });

  it('skips when persistence prerequisites are missing', async () => {
    const storage: ConversationPersistenceRuntimeStorage = {
      save: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const runtime = new ConversationPersistenceRuntime({
      workDir: null,
      storage,
      getConversation: () => ({
        id: 'conv-1',
        title: 'Task',
        createdAt: 100,
        updatedAt: 200,
        messages: [{ id: 'msg-1', role: 'user', content: 'hello', timestamp: 1 }],
      }),
    });

    await expect(runtime.persistConversation('conv-1')).resolves.toEqual({
      kind: 'skip',
      conversationId: 'conv-1',
      reason: 'missing-work-dir',
    });
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('reports queued save failures without throwing synchronously', async () => {
    const error = new Error('disk full');
    const onWarning = vi.fn();
    const runtime = new ConversationPersistenceRuntime({
      workDir: '/repo',
      storage: {
        save: vi.fn(async () => {
          throw error;
        }),
        delete: vi.fn(async () => undefined),
      },
      getConversation: () => ({
        id: 'conv-1',
        title: 'Task',
        createdAt: 100,
        updatedAt: 200,
        messages: [{ id: 'msg-1', role: 'user', content: 'hello', timestamp: 1 }],
      }),
      onWarning,
    });

    expect(runtime.queueConversationSync('conv-1')).toEqual({
      kind: 'save-queued',
      conversationId: 'conv-1',
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(onWarning).toHaveBeenCalledWith({
      code: 'save-failed',
      conversationId: 'conv-1',
      error,
    });
  });

  it('flushes queued saves after metadata is written', async () => {
    const storage: ConversationPersistenceRuntimeStorage = {
      save: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      flush: vi.fn(async () => undefined),
    };
    const runtime = new ConversationPersistenceRuntime({
      workDir: '/repo',
      storage,
      getConversation: () => ({
        id: 'conv-1',
        title: 'Task',
        createdAt: 100,
        updatedAt: 200,
        messages: [{ id: 'msg-1', role: 'user', content: 'hello', timestamp: 1 }],
      }),
    });

    expect(runtime.queueConversationSync('conv-1')).toEqual({
      kind: 'save-queued',
      conversationId: 'conv-1',
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.flush).toHaveBeenCalledTimes(1);
  });

  it('deletes stale persisted record when a conversation becomes empty', async () => {
    const storage: ConversationPersistenceRuntimeStorage = {
      save: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const runtime = new ConversationPersistenceRuntime({
      workDir: '/repo',
      storage,
      getConversation: () => ({
        id: 'conv-1',
        title: 'Task',
        createdAt: 100,
        updatedAt: 200,
        messages: [],
      }),
    });

    await expect(runtime.persistConversation('conv-1')).resolves.toEqual({
      kind: 'deleted',
      conversationId: 'conv-1',
    });
    expect(storage.save).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith('conv-1');
  });

  it('queues explicit deletes for removed conversations', async () => {
    const storage: ConversationPersistenceRuntimeStorage = {
      save: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const runtime = new ConversationPersistenceRuntime({
      workDir: '/repo',
      storage,
      getConversation: () => undefined,
    });

    expect(runtime.queueConversationDelete('conv-1')).toEqual({
      kind: 'delete-queued',
      conversationId: 'conv-1',
    });
    await Promise.resolve();

    expect(storage.delete).toHaveBeenCalledWith('conv-1');
  });

  it('flushes queued deletes after metadata is removed', async () => {
    const storage: ConversationPersistenceRuntimeStorage = {
      save: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      flush: vi.fn(async () => undefined),
    };
    const runtime = new ConversationPersistenceRuntime({
      workDir: '/repo',
      storage,
      getConversation: () => undefined,
    });

    expect(runtime.queueConversationDelete('conv-1')).toEqual({
      kind: 'delete-queued',
      conversationId: 'conv-1',
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(storage.delete).toHaveBeenCalledWith('conv-1');
    expect(storage.flush).toHaveBeenCalledTimes(1);
  });
});
