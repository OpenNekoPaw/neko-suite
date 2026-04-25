import { describe, expect, it } from 'vitest';
import { createIdcRuntimeStateStore } from '../idc-runtime-state-store';

describe('IdcRuntimeStateStore', () => {
  it('writes formatted snapshots to the canonical state file', async () => {
    const writes: Array<{ path: string; data: string; encoding: string }> = [];
    const dirs: string[] = [];
    const store = createIdcRuntimeStateStore({
      filePath: '/r/.neko/state/idc-runtime.json',
      now: () => 42,
      fsOps: {
        async mkdir(path: string): Promise<void> {
          dirs.push(path);
        },
        async writeFile(path: string, data: string, encoding: 'utf-8'): Promise<void> {
          writes.push({ path, data, encoding });
        },
      },
    });

    store.update({
      conversationId: 'conv-1',
      stage: { current: 'plan', enteredAt: 21, transitions: [] },
      run: {},
      approval: { pending: [] },
      feedback: { pendingGuidance: null },
    });
    await store.flush();

    expect(dirs).toEqual(['/r/.neko/state']);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(
      expect.objectContaining({
        path: '/r/.neko/state/idc-runtime.json',
        encoding: 'utf-8',
      }),
    );

    const parsed = JSON.parse(writes[0]!.data) as {
      schemaVersion: number;
      updatedAt: number;
      stage: { current: string | null };
    };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.updatedAt).toBe(42);
    expect(parsed.stage.current).toBe('plan');
  });

  it('keeps the last queued snapshot on disk order', async () => {
    const writes: string[] = [];
    const store = createIdcRuntimeStateStore({
      filePath: '/r/.neko/state/idc-runtime.json',
      fsOps: {
        async mkdir(): Promise<void> {},
        async writeFile(_path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          writes.push(data);
        },
      },
    });

    store.update({
      stage: { current: 'draft', transitions: [] },
      run: {},
      approval: { pending: [] },
      feedback: { pendingGuidance: null },
    });
    store.update({
      stage: { current: 'apply', transitions: [{ from: 'draft', to: 'apply', at: 1 }] },
      run: {},
      approval: { pending: [] },
      feedback: {
        pendingGuidance: {
          content: 'Retry the failing artifact write.',
          sourceRunId: 'run-1',
          sourceRunStartedAt: 123,
        },
      },
    });
    await store.flush();

    expect(writes).toHaveLength(2);
    const last = JSON.parse(writes[1]!) as {
      stage: { current: string };
      feedback: {
        pendingGuidance: {
          content: string;
          sourceRunId?: string;
          sourceRunStartedAt?: number;
        } | null;
      };
    };
    expect(last.stage.current).toBe('apply');
    expect(last.feedback.pendingGuidance).toEqual({
      content: 'Retry the failing artifact write.',
      sourceRunId: 'run-1',
      sourceRunStartedAt: 123,
    });
  });

  it('rethrows the last write failure on flush and recovers after a later successful write', async () => {
    const writes: string[] = [];
    let failWrite = true;
    const store = createIdcRuntimeStateStore({
      filePath: '/r/.neko/state/idc-runtime.json',
      fsOps: {
        async mkdir(): Promise<void> {},
        async writeFile(_path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          if (failWrite) {
            throw new Error('disk full');
          }
          writes.push(data);
        },
      },
    });

    store.update({
      stage: { current: 'draft', transitions: [] },
      run: {},
      approval: { pending: [] },
      feedback: { pendingGuidance: null },
    });
    await expect(store.flush()).rejects.toThrow('disk full');

    failWrite = false;
    store.update({
      stage: { current: 'apply', transitions: [] },
      run: {},
      approval: { pending: [] },
      feedback: { pendingGuidance: null },
    });
    await expect(store.flush()).resolves.toBeUndefined();

    expect(writes).toHaveLength(1);
    const recovered = JSON.parse(writes[0]!) as {
      stage: { current: string | null };
    };
    expect(recovered.stage.current).toBe('apply');
  });
});
