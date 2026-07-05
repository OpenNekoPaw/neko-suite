import { describe, expect, it, vi } from 'vitest';
import type { SerializableTask } from '@neko/shared';
import { TaskManager } from '../task-manager';

describe('TaskManager terminal task events', () => {
  it('notifies terminal task subscribers when an external task becomes terminal', async () => {
    const manager = new TaskManager({ cleanupIntervalMs: 0 });
    const listener = vi.fn();
    manager.onTerminalTask(listener);

    await manager.upsertExternalTask(createTask({ status: 'completed' }));

    expect(listener).toHaveBeenCalledWith({
      task: expect.objectContaining({ id: 'task-1' }),
      lease: {
        conversationId: 'conv-1',
        runId: 'run-1',
        runStartedAt: 101,
      },
    });
    await manager.dispose();
  });

  it('replays existing terminal tasks when requested', async () => {
    const manager = new TaskManager({ cleanupIntervalMs: 0 });
    await manager.upsertExternalTask(createTask({ status: 'failed', error: 'boom' }));
    const listener = vi.fn();

    manager.onTerminalTask(listener, { replayExisting: true });

    expect(listener).toHaveBeenCalledWith({
      task: expect.objectContaining({ id: 'task-1', status: 'failed' }),
      lease: {
        conversationId: 'conv-1',
        runId: 'run-1',
        runStartedAt: 101,
      },
    });
    await manager.dispose();
  });

  it('does not notify terminal task subscribers when the run lease is missing', async () => {
    const manager = new TaskManager({ cleanupIntervalMs: 0 });
    const listener = vi.fn();
    manager.onTerminalTask(listener);

    await manager.upsertExternalTask(
      createTask({
        status: 'completed',
        lifecycle: {
          ownerConversationId: 'conv-1',
          runMode: 'background',
          costPhase: 'idle',
          interruptPolicy: 'detach-and-continue',
          recoverPolicy: 'snapshot-only',
        },
      }),
    );

    expect(listener).not.toHaveBeenCalled();
    await manager.dispose();
  });
});

function createTask(overrides: Partial<SerializableTask> = {}): SerializableTask {
  return {
    id: 'task-1',
    type: 'image_generation',
    status: 'completed',
    input: {
      type: 'image_generation',
      payload: {},
    },
    progress: 100,
    createdAt: 10,
    updatedAt: 20,
    lifecycle: {
      ownerConversationId: 'conv-1',
      ownerRunId: 'run-1',
      ownerRunStartedAt: 101,
      runMode: 'background',
      costPhase: 'idle',
      interruptPolicy: 'detach-and-continue',
      recoverPolicy: 'snapshot-only',
    },
    ...overrides,
  };
}
