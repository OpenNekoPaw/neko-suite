import { describe, expect, it, vi } from 'vitest';
import type { ConversationRecord } from '../conversation-record';
import {
  ConversationPersistenceCoordinator,
  type ConversationPersistenceStoragePort,
} from '../conversation-persistence-coordinator';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function record(conversationId: string, content: string, updatedAt: number): ConversationRecord {
  return {
    id: conversationId,
    version: 2,
    title: conversationId,
    workDir: '/repo',
    source: 'extension',
    createdAt: 1,
    updatedAt,
    messages: [{ role: 'assistant', content }],
  };
}

function recordContent(value: ConversationRecord): string {
  const content = value.messages[0]?.content;
  return typeof content === 'string' ? content : '';
}

describe('ConversationPersistenceCoordinator', () => {
  it('serializes storage mutations and supersedes pending partial B with C while A writes', async () => {
    const firstWrite = deferred<void>();
    const saved: ConversationRecord[] = [];
    let active = 0;
    let maximumActive = 0;
    const storage: ConversationPersistenceStoragePort = {
      save: vi.fn(async (value) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        saved.push(value);
        if (saved.length === 1) await firstWrite.promise;
        active -= 1;
      }),
      delete: vi.fn(async () => undefined),
    };
    const coordinator = new ConversationPersistenceCoordinator({ storage });

    const a = coordinator.enqueuePartial(record('conv-1', 'A', 1));
    const b = coordinator.enqueuePartial(record('conv-1', 'B', 2));
    const c = coordinator.enqueuePartial(record('conv-1', 'C', 3));
    if (!a.accepted || !b.accepted || !c.accepted) throw new Error('Expected admission.');

    await expect(b.completion).resolves.toMatchObject({
      kind: 'superseded',
      supersededByRevision: c.revision,
    });
    firstWrite.resolve();
    await expect(coordinator.flush()).resolves.toMatchObject({ durable: true });

    expect(saved.map(recordContent)).toEqual(['A', 'C']);
    expect(maximumActive).toBe(1);
    expect(coordinator.metrics()).toMatchObject({
      enqueuedPartials: 3,
      supersededPartials: 1,
      writtenPartials: 2,
      maximumActiveMutations: 1,
    });
  });

  it('retains the latest pending state for each conversation on one storage authority', async () => {
    const firstWrite = deferred<void>();
    const saved: ConversationRecord[] = [];
    const storage: ConversationPersistenceStoragePort = {
      save: vi.fn(async (value) => {
        saved.push(value);
        if (saved.length === 1) await firstWrite.promise;
      }),
      delete: vi.fn(async () => undefined),
    };
    const coordinator = new ConversationPersistenceCoordinator({ storage });

    coordinator.enqueuePartial(record('conv-a', 'A1', 1));
    coordinator.enqueuePartial(record('conv-b', 'B1', 2));
    coordinator.enqueuePartial(record('conv-a', 'A2', 3));
    coordinator.enqueuePartial(record('conv-b', 'B2', 4));
    firstWrite.resolve();
    await coordinator.flush();

    expect(saved.map((value) => [value.id, recordContent(value)])).toEqual([
      ['conv-a', 'A1'],
      ['conv-a', 'A2'],
      ['conv-b', 'B2'],
    ]);
  });

  it('captures immutable records when they are admitted', async () => {
    const gate = deferred<void>();
    const saved: ConversationRecord[] = [];
    const storage: ConversationPersistenceStoragePort = {
      save: vi.fn(async (value) => {
        await gate.promise;
        saved.push(value);
      }),
      delete: vi.fn(async () => undefined),
    };
    const coordinator = new ConversationPersistenceCoordinator({ storage });
    const source = record('conv-1', 'original', 1);

    coordinator.enqueuePartial(source);
    source.messages[0]!.content = 'mutated';
    gate.resolve();
    await coordinator.flush();

    expect(saved.map(recordContent)).toEqual(['original']);
  });

  it('orders terminal saves and deletes after the active mutation and makes both awaitable', async () => {
    const firstWrite = deferred<void>();
    const order: string[] = [];
    const storage: ConversationPersistenceStoragePort = {
      save: vi.fn(async (value) => {
        order.push(`save:${recordContent(value)}`);
        if (order.length === 1) await firstWrite.promise;
      }),
      delete: vi.fn(async (conversationId) => {
        order.push(`delete:${conversationId}`);
      }),
      flush: vi.fn(async () => {
        order.push('flush');
      }),
    };
    const coordinator = new ConversationPersistenceCoordinator({ storage });

    coordinator.enqueuePartial(record('conv-1', 'partial', 1));
    const terminal = coordinator.enqueueTerminal(record('conv-1', 'terminal', 2));
    const deletion = coordinator.enqueueDelete('conv-1');
    if (!terminal.accepted || !deletion.accepted) throw new Error('Expected admission.');
    firstWrite.resolve();

    await expect(terminal.completion).resolves.toMatchObject({
      kind: 'written',
      operation: 'terminal',
    });
    await expect(deletion.completion).resolves.toMatchObject({
      kind: 'written',
      operation: 'delete',
    });
    expect(order).toEqual([
      'save:partial',
      'flush',
      'save:terminal',
      'flush',
      'delete:conv-1',
      'flush',
    ]);
  });

  it('flush waits only through its call-boundary watermark', async () => {
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    let writeCount = 0;
    const storage: ConversationPersistenceStoragePort = {
      save: vi.fn(async () => {
        writeCount += 1;
        if (writeCount === 1) await firstWrite.promise;
        if (writeCount === 2) await secondWrite.promise;
      }),
      delete: vi.fn(async () => undefined),
    };
    const coordinator = new ConversationPersistenceCoordinator({ storage });

    coordinator.enqueuePartial(record('conv-a', 'A', 1));
    const flush = coordinator.flush();
    coordinator.enqueuePartial(record('conv-b', 'B', 2));
    firstWrite.resolve();

    await expect(flush).resolves.toMatchObject({ watermark: 1, durable: true });
    expect(writeCount).toBe(2);
    secondWrite.resolve();
    await coordinator.flush();
  });

  it('dispose drains admitted work, disposes storage, and rejects later partials visibly', async () => {
    const gate = deferred<void>();
    const storage: ConversationPersistenceStoragePort = {
      save: vi.fn(async () => gate.promise),
      delete: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
    };
    const coordinator = new ConversationPersistenceCoordinator({ storage });
    coordinator.enqueueTerminal(record('conv-1', 'terminal', 1));

    const disposal = coordinator.dispose();
    expect(coordinator.metrics()).toMatchObject({
      pendingDepth: 0,
      activeMutations: 1,
      disposalCompleted: false,
    });
    const late = coordinator.enqueuePartial(record('conv-1', 'late', 2));
    expect(late.accepted).toBe(false);
    await expect(late.completion).resolves.toMatchObject({
      kind: 'rejected',
      diagnostic: { code: 'disposed' },
    });
    gate.resolve();

    await expect(disposal).resolves.toMatchObject({ disposed: true, durable: true });
    expect(storage.dispose).toHaveBeenCalledTimes(1);
    expect(coordinator.metrics()).toMatchObject({
      pendingDepth: 0,
      activeMutations: 0,
      maximumActiveMutations: 1,
      disposalCompleted: true,
    });
  });

  it('keeps external stale-writer conflicts fail-visible without retry', async () => {
    const conflict = Object.assign(new Error('external writer advanced revision'), {
      code: 'stale-json-file-write',
    });
    const onDiagnostic = vi.fn();
    const storage: ConversationPersistenceStoragePort = {
      save: vi.fn(async () => {
        throw conflict;
      }),
      delete: vi.fn(async () => undefined),
    };
    const coordinator = new ConversationPersistenceCoordinator({ storage, onDiagnostic });
    const terminal = coordinator.enqueueTerminal(record('conv-1', 'terminal', 1));
    if (!terminal.accepted) throw new Error('Expected admission.');

    await expect(terminal.completion).resolves.toMatchObject({
      kind: 'failed',
      diagnostic: { code: 'external-conflict', error: conflict },
    });
    await expect(coordinator.flush()).resolves.toMatchObject({
      durable: false,
      diagnostics: [expect.objectContaining({ code: 'external-conflict' })],
    });
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(onDiagnostic).toHaveBeenCalledTimes(1);
    expect(coordinator.metrics()).toMatchObject({ externalConflicts: 1, failedOperations: 1 });
  });

  it('classifies storage flush failures separately from mutation failures', async () => {
    const flushError = new Error('metadata flush failed');
    const storage: ConversationPersistenceStoragePort = {
      save: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      flush: vi.fn(async () => {
        throw flushError;
      }),
    };
    const coordinator = new ConversationPersistenceCoordinator({ storage });
    const terminal = coordinator.enqueueTerminal(record('conv-1', 'terminal', 1));
    if (!terminal.accepted) throw new Error('Expected admission.');

    await expect(terminal.completion).resolves.toMatchObject({
      kind: 'failed',
      diagnostic: { code: 'flush-failed', error: flushError },
    });
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.flush).toHaveBeenCalledTimes(1);
    expect(coordinator.metrics()).toMatchObject({ failedOperations: 1, writtenTerminals: 0 });
  });

  it('classifies stale conflicts raised by storage flush without retrying', async () => {
    const conflict = Object.assign(new Error('flush observed an external writer'), {
      code: 'stale-json-file-write',
    });
    const storage: ConversationPersistenceStoragePort = {
      save: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      flush: vi.fn(async () => {
        throw conflict;
      }),
    };
    const coordinator = new ConversationPersistenceCoordinator({ storage });
    const terminal = coordinator.enqueueTerminal(record('conv-1', 'terminal', 1));
    if (!terminal.accepted) throw new Error('Expected admission.');

    await expect(terminal.completion).resolves.toMatchObject({
      kind: 'failed',
      diagnostic: { code: 'external-conflict', error: conflict },
    });
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.flush).toHaveBeenCalledTimes(1);
    expect(coordinator.metrics()).toMatchObject({ failedOperations: 1, externalConflicts: 1 });
  });

  it('reports storage disposal failures through diagnostics and metrics', async () => {
    const disposeError = new Error('storage close failed');
    const onDiagnostic = vi.fn();
    const storage: ConversationPersistenceStoragePort = {
      save: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      dispose: vi.fn(async () => {
        throw disposeError;
      }),
    };
    const coordinator = new ConversationPersistenceCoordinator({ storage, onDiagnostic });

    await expect(coordinator.dispose()).resolves.toMatchObject({
      disposed: true,
      durable: false,
      diagnostics: [expect.objectContaining({ code: 'flush-failed', error: disposeError })],
    });
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'flush-failed', error: disposeError }),
    );
    expect(coordinator.metrics()).toMatchObject({ failedOperations: 1, disposalCompleted: true });
  });
});
