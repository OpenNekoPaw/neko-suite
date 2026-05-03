import { describe, it, expect, beforeEach } from 'vitest';
import { createNdjsonEventSink, type NdjsonFsOps } from '../ndjson-event-sink';
import { createEventBus, CREATION_CHANNELS, EXECUTION_CHANNELS } from '../../events';

/**
 * In-memory fsOps for tests. Records mkdir calls and accumulates
 * appendFile writes per path so assertions can reconstruct the JSONL.
 */
function memFs(): NdjsonFsOps & {
  files: Map<string, string>;
  dirs: string[];
  failNextAppend?: boolean;
} {
  const files = new Map<string, string>();
  const dirs: string[] = [];
  const fs = {
    files,
    dirs,
    failNextAppend: false as boolean | undefined,
    async mkdir(path: string): Promise<void> {
      dirs.push(path);
    },
    async appendFile(path: string, data: string): Promise<void> {
      if (fs.failNextAppend) {
        fs.failNextAppend = false;
        throw new Error('simulated write failure');
      }
      files.set(path, (files.get(path) ?? '') + data);
    },
  };
  return fs;
}

function parseLines(blob: string): Array<Record<string, unknown>> {
  return blob
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('NdjsonEventSink', () => {
  let now = 0;
  beforeEach(() => {
    now = 100;
  });

  it('writes every event as a JSONL line with monotonic seq', async () => {
    const fs = memFs();
    const sink = createNdjsonEventSink({
      filePath: '/r/.neko/logs/events.jsonl',
      fsOps: fs,
      now: () => now++,
    });
    const bus = createEventBus();
    sink.attach(bus);

    bus.emit({
      channel: CREATION_CHANNELS.RUN_STARTED,
      runId: 'run-1',
      runKind: 'w-1',
      at: 0,
    });
    bus.emit({
      channel: EXECUTION_CHANNELS.APPLY_COMMITTED,
      runId: 'run-1',
      kind: 'tool:x',
      at: 0,
    });
    await sink.flush();

    const lines = parseLines(fs.files.get('/r/.neko/logs/events.jsonl') ?? '');
    expect(lines).toHaveLength(2);
    expect(lines[0]!.seq).toBe(1);
    expect(lines[1]!.seq).toBe(2);
    expect((lines[0]!.event as { channel: string }).channel).toBe('creation.run.started');
    expect((lines[1]!.event as { channel: string }).channel).toBe('execution.apply.committed');
  });

  it('ensureDir runs exactly once regardless of event volume', async () => {
    const fs = memFs();
    const sink = createNdjsonEventSink({
      filePath: '/r/.neko/logs/events.jsonl',
      fsOps: fs,
    });
    const bus = createEventBus();
    sink.attach(bus);

    for (let i = 0; i < 5; i++) {
      bus.emit({
        channel: CREATION_CHANNELS.MILESTONE,
        runId: 'r',
        label: `m${i}`,
        at: 0,
      });
    }
    await sink.flush();

    expect(fs.dirs).toEqual(['/r/.neko/logs']);
  });

  it('filter predicate routes only matching events onto disk', async () => {
    const fs = memFs();
    const sink = createNdjsonEventSink({
      filePath: '/r/.neko/logs/audits.jsonl',
      fsOps: fs,
      filter: (e) => e.channel.startsWith('execution.autoheal.'),
    });
    const bus = createEventBus();
    sink.attach(bus);

    bus.emit({
      channel: CREATION_CHANNELS.MILESTONE,
      runId: 'r',
      label: 'boring',
      at: 0,
    });
    bus.emit({
      channel: EXECUTION_CHANNELS.AUTOHEAL_L5_ESCALATED,
      runId: 'r',
      trigger: { subject: 'tool:x', errorCode: 'OOM' },
      reason: 'retry-exhausted',
      at: 0,
    });
    await sink.flush();

    const lines = parseLines(fs.files.get('/r/.neko/logs/audits.jsonl') ?? '');
    expect(lines).toHaveLength(1);
    expect((lines[0]!.event as { channel: string }).channel).toBe(
      'execution.autoheal.l5.escalated',
    );
  });

  it('dispose flushes, detaches, and silences further emits', async () => {
    const fs = memFs();
    const sink = createNdjsonEventSink({
      filePath: '/r/.neko/logs/events.jsonl',
      fsOps: fs,
    });
    const bus = createEventBus();
    sink.attach(bus);

    bus.emit({
      channel: CREATION_CHANNELS.RUN_STARTED,
      runId: 'r',
      runKind: 'w',
      at: 0,
    });
    await sink.dispose();
    const before = fs.files.get('/r/.neko/logs/events.jsonl') ?? '';

    bus.emit({
      channel: CREATION_CHANNELS.RUN_ENDED,
      runId: 'r',
      status: 'completed',
      at: 0,
    });
    await sink.flush();

    expect(fs.files.get('/r/.neko/logs/events.jsonl')).toBe(before);
  });

  it('write failures are logged, chain keeps accepting events', async () => {
    const fs = memFs();
    const sink = createNdjsonEventSink({
      filePath: '/r/.neko/logs/events.jsonl',
      fsOps: fs,
    });
    const bus = createEventBus();
    sink.attach(bus);

    fs.failNextAppend = true;
    bus.emit({
      channel: CREATION_CHANNELS.RUN_STARTED,
      runId: 'r',
      runKind: 'w',
      at: 0,
    });
    // A second event must still land even though the first failed.
    bus.emit({
      channel: CREATION_CHANNELS.RUN_ENDED,
      runId: 'r',
      status: 'completed',
      at: 0,
    });
    await sink.flush();

    const lines = parseLines(fs.files.get('/r/.neko/logs/events.jsonl') ?? '');
    expect(lines).toHaveLength(1);
    expect((lines[0]!.event as { channel: string }).channel).toBe('creation.run.ended');
  });

  it('attach while already attached returns the existing unsubscriber (no double-write)', async () => {
    const fs = memFs();
    const sink = createNdjsonEventSink({
      filePath: '/r/.neko/logs/events.jsonl',
      fsOps: fs,
    });
    const bus = createEventBus();
    sink.attach(bus);
    sink.attach(bus); // second attach is a noop

    bus.emit({
      channel: CREATION_CHANNELS.RUN_STARTED,
      runId: 'r',
      runKind: 'w',
      at: 0,
    });
    await sink.flush();

    const lines = parseLines(fs.files.get('/r/.neko/logs/events.jsonl') ?? '');
    expect(lines).toHaveLength(1);
  });

  it('filePath is required', () => {
    expect(() => createNdjsonEventSink({ filePath: '', fsOps: memFs() })).toThrow(/filePath/);
  });
});
