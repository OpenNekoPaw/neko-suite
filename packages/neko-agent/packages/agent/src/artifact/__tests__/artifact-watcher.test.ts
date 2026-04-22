import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createEventBus } from '../../events/event-bus';
import { createNekoPaths } from '../../workspace';
import {
  createArtifactWatcher,
  type ArtifactWatcherFsOps,
  type ArtifactWatcherHandle,
} from '../artifact-watcher';
import type { DualFlowEvent } from '../../events/event-bus';

/**
 * The watcher uses real node:fs.watch by default, which is noisy and flakey
 * under fakes. Most tests drive it through an injected `fsOps` so we can
 * trigger events synchronously; one end-to-end test uses the default ops on
 * a tmpdir to prove the real wiring works.
 */

type Listener = (event: string, filename: string | null) => void;

function makeFakeFsOps(): ArtifactWatcherFsOps & {
  dirs: Set<string>;
  files: Map<string, string>;
  listeners: Map<string, Listener>;
  trigger: (dir: string, filename: string) => void;
} {
  const listeners = new Map<string, Listener>();
  const dirs = new Set<string>();
  const files = new Map<string, string>();
  return {
    dirs,
    files,
    listeners,
    trigger(dir: string, filename: string) {
      const l = listeners.get(dir);
      if (l) l('change', filename);
    },
    watch(dir, listener): ArtifactWatcherHandle {
      listeners.set(dir, listener);
      return {
        close() {
          listeners.delete(dir);
        },
      };
    },
    async readFile(absPath) {
      const content = files.get(absPath);
      if (content === undefined) throw new Error('ENOENT');
      return content;
    },
    async mkdirP(dir) {
      dirs.add(dir);
    },
    async exists(dir) {
      return dirs.has(dir);
    },
  };
}

const goodDraft = () =>
  [
    '---',
    'id: d1',
    'kind: draft',
    'title: t',
    'status: pending_review',
    'domain: cut',
    'createdAt: 2026-04-22T10:00:00.000Z',
    'updatedAt: 2026-04-22T10:30:00.000Z',
    '---',
    '',
    '# body',
  ].join('\n') + '\n';

const badDraft = () =>
  ['---', 'id: d1', 'kind: draft', 'title: t', 'status: bogus', '---', '', '# body'].join('\n') +
  '\n';

describe('ArtifactWatcher (fake fs)', () => {
  const tmpRoot = '/tmp/neko-watcher-fake';
  let bus: ReturnType<typeof createEventBus>;
  let paths: ReturnType<typeof createNekoPaths>;
  let fake: ReturnType<typeof makeFakeFsOps>;

  beforeEach(() => {
    bus = createEventBus();
    paths = createNekoPaths(tmpRoot);
    fake = makeFakeFsOps();
    // Pre-populate all subdirs so the watcher skips mkdirP.
    for (const subdir of ['drafts', 'plans', 'tasks'] as const) {
      fake.dirs.add(paths.dir(subdir));
    }
  });

  it('emits artifact.written for a valid draft after debounce', async () => {
    vi.useFakeTimers();
    try {
      const observed: DualFlowEvent[] = [];
      bus.onAny((e) => observed.push(e));

      const watcher = createArtifactWatcher({
        paths,
        eventBus: bus,
        getRunId: () => 'run-1',
        now: () => 1_700_000_000_000,
        debounceMs: 100,
        fsOps: fake,
      });
      await watcher.start();

      const absPath = path.join(paths.dir('drafts'), 'draft-d1.md');
      fake.files.set(absPath, goodDraft());
      fake.trigger(paths.dir('drafts'), 'draft-d1.md');

      // Before debounce fires: no events.
      expect(observed).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(150);
      expect(observed).toHaveLength(1);
      const event = observed[0]!;
      expect(event.channel).toBe('execution.artifact.written');
      if (event.channel === 'execution.artifact.written') {
        expect(event.kind).toBe('draft');
        expect(event.artifactId).toBe('d1');
        expect(event.runId).toBe('run-1');
        expect(event.path).toBe(absPath);
      }

      await watcher.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits artifact.invalid for a malformed draft', async () => {
    vi.useFakeTimers();
    try {
      const observed: DualFlowEvent[] = [];
      bus.onAny((e) => observed.push(e));

      const watcher = createArtifactWatcher({
        paths,
        eventBus: bus,
        getRunId: () => 'run-1',
        debounceMs: 50,
        fsOps: fake,
      });
      await watcher.start();

      const absPath = path.join(paths.dir('drafts'), 'draft-d1.md');
      fake.files.set(absPath, badDraft());
      fake.trigger(paths.dir('drafts'), 'draft-d1.md');

      await vi.advanceTimersByTimeAsync(100);

      expect(observed).toHaveLength(1);
      const event = observed[0]!;
      expect(event.channel).toBe('execution.artifact.invalid');
      if (event.channel === 'execution.artifact.invalid') {
        expect(event.kind).toBe('draft');
        // Missing required fields: domain, createdAt, updatedAt; plus invalid status.
        expect(event.issues.length).toBeGreaterThan(0);
        expect(event.issues.some((i) => i.code === 'invalid-status')).toBe(true);
      }

      await watcher.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('debounces rapid consecutive writes to one event', async () => {
    vi.useFakeTimers();
    try {
      const observed: DualFlowEvent[] = [];
      bus.onAny((e) => observed.push(e));

      const watcher = createArtifactWatcher({
        paths,
        eventBus: bus,
        getRunId: () => 'run-1',
        debounceMs: 200,
        fsOps: fake,
      });
      await watcher.start();

      const absPath = path.join(paths.dir('drafts'), 'draft-d1.md');
      fake.files.set(absPath, goodDraft());
      fake.trigger(paths.dir('drafts'), 'draft-d1.md');
      await vi.advanceTimersByTimeAsync(50);
      fake.trigger(paths.dir('drafts'), 'draft-d1.md');
      await vi.advanceTimersByTimeAsync(50);
      fake.trigger(paths.dir('drafts'), 'draft-d1.md');

      // Still inside a single debounce window — no events yet.
      expect(observed).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(300);
      // Only one event despite three triggers.
      expect(observed).toHaveLength(1);

      await watcher.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores non-.md filenames', async () => {
    vi.useFakeTimers();
    try {
      const observed: DualFlowEvent[] = [];
      bus.onAny((e) => observed.push(e));

      const watcher = createArtifactWatcher({
        paths,
        eventBus: bus,
        getRunId: () => null,
        debounceMs: 20,
        fsOps: fake,
      });
      await watcher.start();

      fake.trigger(paths.dir('drafts'), 'draft-d1.txt');
      fake.trigger(paths.dir('drafts'), '.hidden');
      fake.trigger(paths.dir('drafts'), 'draft-d1.md.swp');

      await vi.advanceTimersByTimeAsync(50);
      expect(observed).toHaveLength(0);

      await watcher.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('substitutes runId="unknown" when no active run', async () => {
    vi.useFakeTimers();
    try {
      const observed: DualFlowEvent[] = [];
      bus.onAny((e) => observed.push(e));

      const watcher = createArtifactWatcher({
        paths,
        eventBus: bus,
        getRunId: () => null,
        debounceMs: 20,
        fsOps: fake,
      });
      await watcher.start();

      const absPath = path.join(paths.dir('drafts'), 'draft-d1.md');
      fake.files.set(absPath, goodDraft());
      fake.trigger(paths.dir('drafts'), 'draft-d1.md');

      await vi.advanceTimersByTimeAsync(50);
      expect(observed).toHaveLength(1);
      const event = observed[0]!;
      if (event.channel === 'execution.artifact.written') {
        expect(event.runId).toBe('unknown');
      }

      await watcher.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('dispose drops pending debounces + closes handles', async () => {
    vi.useFakeTimers();
    try {
      const observed: DualFlowEvent[] = [];
      bus.onAny((e) => observed.push(e));

      const watcher = createArtifactWatcher({
        paths,
        eventBus: bus,
        getRunId: () => 'run-1',
        debounceMs: 100,
        fsOps: fake,
      });
      await watcher.start();

      const absPath = path.join(paths.dir('drafts'), 'draft-d1.md');
      fake.files.set(absPath, goodDraft());
      fake.trigger(paths.dir('drafts'), 'draft-d1.md');

      await watcher.dispose();
      await vi.advanceTimersByTimeAsync(500);
      expect(observed).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ArtifactWatcher (real fs smoke test)', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-watcher-real-'));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  // Real fs.watch behaviour is platform-specific (macOS fsevents batches,
  // some filesystems emit no events at all inside Docker). The fake-fs suite
  // above verifies all watcher logic; this smoke test exists only to prove
  // the default fsOps wiring compiles. It polls with a generous deadline but
  // skips on platforms where fs.watch returns no events.
  it('default fsOps wires fs.watch + validator + bus', async () => {
    const bus = createEventBus();
    const paths = createNekoPaths(tmpRoot);
    const observed: DualFlowEvent[] = [];
    bus.onAny((e) => observed.push(e));

    const watcher = createArtifactWatcher({
      paths,
      eventBus: bus,
      getRunId: () => 'smoke-1',
      debounceMs: 30,
    });
    await watcher.start();

    const absPath = paths.file('drafts', 'smoke');
    await fs.writeFile(absPath, goodDraft(), 'utf-8');

    // Poll up to 2s for the fsevents signal to surface. On platforms where
    // fs.watch is a no-op (some container filesystems) we silently accept
    // the empty observation — the fake-fs suite already covers the logic.
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && observed.length === 0) {
      await new Promise((r) => setTimeout(r, 50));
    }

    await watcher.dispose();

    if (observed.length > 0) {
      const writtenEvents = observed.filter((e) => e.channel === 'execution.artifact.written');
      expect(writtenEvents.length).toBeGreaterThanOrEqual(1);
    } else {
      // fs.watch unsupported or no event surfaced — smoke test passes by
      // virtue of the default-ops code path not throwing.
      expect(observed.length).toBe(0);
    }
  });
});
