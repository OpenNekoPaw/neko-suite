import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DASHBOARD_TASK_CONTRACT_VERSION,
  type DashboardTask,
  type DashboardTaskEvent,
  type DashboardTaskSource,
} from '@neko/shared/types/dashboard-task';
import type { DashboardLogger } from './logging';
import { registerCommandHandler, vscodeCommandState } from './vscode-test-double';
import { TaskAggregator } from './taskAggregator';

const task: DashboardTask = {
  taskId: 'neko-agent:task-1',
  source: 'neko-agent',
  sourceTaskId: 'task-1',
  kind: 'generate-image',
  title: 'Generate image',
  status: 'running',
  progress: 10,
  actions: ['cancel'],
  startedAt: 1,
};

describe('TaskAggregator', () => {
  beforeEach(() => {
    vscodeCommandState.reset();
  });

  it('discovers valid sources and reads snapshots', async () => {
    registerCommandHandler('neko.agent.getDashboardTaskSource', () => createSource([task]));

    const aggregator = new TaskAggregator();
    await aggregator.refreshSources();

    expect(aggregator.getSnapshot()).toEqual([task]);
    aggregator.dispose();
  });

  it('ignores missing, throwing, and invalid sources', async () => {
    const logger = createLogger();
    registerCommandHandler('neko.agent.getDashboardTaskSource', () => {
      throw new Error('boom');
    });
    registerCommandHandler('neko.cut.getDashboardTaskSource', () => ({ source: 'bad' }));

    const aggregator = new TaskAggregator({
      logger,
      sourceCommands: ['neko.agent.getDashboardTaskSource', 'neko.cut.getDashboardTaskSource'],
    });
    await aggregator.refreshSources();

    expect(aggregator.getSnapshot()).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      'Dashboard task source discovery failed',
      expect.objectContaining({ command: 'neko.agent.getDashboardTaskSource' }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Ignoring invalid dashboard task source',
      expect.objectContaining({ candidate: { source: 'bad' } }),
    );
    aggregator.dispose();
  });

  it('replaces duplicate sources and disposes the previous subscription', async () => {
    const firstDispose = vi.fn();
    const secondTask = { ...task, sourceTaskId: 'task-2', taskId: 'neko-agent:task-2' };
    registerCommandHandler('neko.agent.getDashboardTaskSource', () =>
      createSource([task], firstDispose),
    );

    const aggregator = new TaskAggregator();
    await aggregator.refreshSources();

    registerCommandHandler('neko.agent.getDashboardTaskSource', () => createSource([secondTask]));
    await aggregator.refreshSources();

    expect(firstDispose).toHaveBeenCalledOnce();
    expect(aggregator.getSnapshot().map((item) => item.taskId)).toContain('neko-agent:task-2');
    aggregator.dispose();
  });

  it('merges task events idempotently', async () => {
    let listener: ((event: DashboardTaskEvent) => void) | undefined;
    registerCommandHandler('neko.agent.getDashboardTaskSource', () =>
      createSource([], undefined, (candidate) => {
        listener = candidate;
      }),
    );

    const aggregator = new TaskAggregator();
    await aggregator.refreshSources();

    listener?.({ type: 'added', task });
    listener?.({ type: 'updated', task: { ...task, progress: 90 } });
    expect(aggregator.getSnapshot()).toHaveLength(1);
    expect(aggregator.getTask(task.taskId)?.progress).toBe(90);

    listener?.({ type: 'removed', task });
    expect(aggregator.getSnapshot()).toEqual([]);
    aggregator.dispose();
  });

  it('keeps event updates when they arrive before the initial snapshot resolves', async () => {
    let listener: ((event: DashboardTaskEvent) => void) | undefined;
    let releaseSnapshot: ((snapshot: DashboardTask[]) => void) | undefined;
    const snapshotStarted = new Promise<void>((resolve) => {
      registerCommandHandler('neko.agent.getDashboardTaskSource', () =>
        createSource(
          [],
          undefined,
          (candidate) => {
            listener = candidate;
          },
          undefined,
          undefined,
          () => {
            resolve();
            return new Promise<DashboardTask[]>((snapshotResolve) => {
              releaseSnapshot = snapshotResolve;
            });
          },
        ),
      );
    });

    const aggregator = new TaskAggregator({
      sourceCommands: ['neko.agent.getDashboardTaskSource'],
    });
    const refresh = aggregator.refreshSources();
    await snapshotStarted;

    listener?.({ type: 'updated', task: { ...task, progress: 90, startedAt: 2 } });
    releaseSnapshot?.([{ ...task, progress: 10, startedAt: 1 }]);
    await refresh;

    expect(aggregator.getTask(task.taskId)?.progress).toBe(90);
    aggregator.dispose();
  });

  it('logs snapshot failures while keeping the source subscribed', async () => {
    const logger = createLogger();
    let listener: ((event: DashboardTaskEvent) => void) | undefined;
    registerCommandHandler('neko.agent.getDashboardTaskSource', () =>
      createSource(
        [],
        undefined,
        (candidate) => {
          listener = candidate;
        },
        undefined,
        undefined,
        async () => {
          throw new Error('snapshot failed');
        },
      ),
    );

    const aggregator = new TaskAggregator({
      logger,
      sourceCommands: ['neko.agent.getDashboardTaskSource'],
    });
    await aggregator.refreshSources();
    listener?.({ type: 'added', task });

    expect(logger.warn).toHaveBeenCalledWith(
      'Dashboard task source snapshot failed',
      expect.objectContaining({ source: 'neko-agent' }),
    );
    expect(aggregator.getSnapshot()).toEqual([task]);
    aggregator.dispose();
  });

  it('delegates cancel and retry through source task refs', async () => {
    const cancel = vi.fn(async () => {});
    const retry = vi.fn(async () => {});
    registerCommandHandler('neko.agent.getDashboardTaskSource', () =>
      createSource(
        [{ ...task, actions: ['cancel', 'retry'] }],
        undefined,
        undefined,
        cancel,
        retry,
      ),
    );

    const aggregator = new TaskAggregator();
    await aggregator.refreshSources();
    await aggregator.cancel(task.taskId);
    await aggregator.retry(task.taskId);

    expect(cancel).toHaveBeenCalledWith({ source: 'neko-agent', sourceTaskId: 'task-1' });
    expect(retry).toHaveBeenCalledWith({ source: 'neko-agent', sourceTaskId: 'task-1' });
    aggregator.dispose();
  });
});

function createSource(
  snapshot: DashboardTask[],
  dispose = vi.fn(),
  captureListener?: (listener: (event: DashboardTaskEvent) => void) => void,
  cancel?: DashboardTaskSource['cancel'],
  retry?: DashboardTaskSource['retry'],
  getSnapshot?: DashboardTaskSource['getSnapshot'],
): DashboardTaskSource {
  return {
    contractVersion: DASHBOARD_TASK_CONTRACT_VERSION,
    source: 'neko-agent',
    getSnapshot: getSnapshot ?? (async () => snapshot),
    onDidChangeTask(listener) {
      captureListener?.(listener);
      return { dispose };
    },
    cancel,
    retry,
  };
}

function createLogger(): DashboardLogger & { readonly warn: ReturnType<typeof vi.fn> } {
  const logger = {
    source: 'TaskAggregatorTest',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}
