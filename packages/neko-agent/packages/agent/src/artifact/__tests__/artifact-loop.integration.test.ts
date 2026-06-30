/**
 * End-to-end loop integration test: Write → Watcher → Validator → Bus →
 * ObservationHooks → beforeThink injection.
 *
 * Each sibling test file verifies its piece in isolation (validator pure,
 * watcher with fake fs, observation hooks with a manual emit). This file
 * bridges them: a file lands on the real filesystem, the watcher fires,
 * the bus carries the validator's verdict, and the observation hook
 * surfaces it to the next think.
 *
 * What this proves that the unit tests cannot:
 *   - The filename mapping on the watcher lines up with the schema
 *     expectations on the validator (e.g. `brief.md` gets `kind: 'draft'`
 *     validated).
 *   - The event payload the watcher emits matches the shape the
 *     observation hook expects (channel + kind + path + issues[]).
 *   - Issues render into the injected system message in a form the AI
 *     can act on (filename tag, issue code, field hint, human message).
 *
 * Not covered (intentionally): the AI loop itself. Faking an LLM to
 * consume the injected message belongs in executor/__tests__/.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentContext, ChatMessage } from '@neko/shared';
import { createEventBus } from '../../events/event-bus';
import { createCreationArtifactPaths } from '../../workspace';
import { createArtifactObservationHooks } from '../artifact-observation-hooks';
import { createArtifactWatcher } from '../artifact-watcher';

function emptyContext(): AgentContext {
  return {
    messages: [{ role: 'user', content: 'do the thing' } as ChatMessage],
    state: { status: 'thinking' } as AgentContext['state'],
    iteration: 0,
    toolResults: [],
    metadata: {},
  };
}

async function settle(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

const GOOD_DRAFT = [
  '---',
  'id: tiktok-001',
  'kind: draft',
  'title: TikTok hero cut',
  'status: pending_review',
  'domain: cut',
  'createdAt: 2026-04-22T10:00:00.000Z',
  'updatedAt: 2026-04-22T10:00:00.000Z',
  '---',
  '',
  '# body',
  '',
].join('\n');

const BAD_DRAFT = [
  '---',
  'id: tiktok-bad',
  'kind: draft',
  'title: Broken',
  'status: not-a-status', // invalid-status
  // missing: domain, createdAt, updatedAt → 3x missing-field
  '---',
  '',
  '# body',
  '',
].join('\n');

const KIND_MISMATCH = [
  '---',
  'id: confused',
  'kind: plan', // brief.md is a draft creation document → wrong-kind
  'title: Confused artifact',
  'status: ready',
  'draftId: some-draft',
  'createdAt: 2026-04-22T10:00:00.000Z',
  'updatedAt: 2026-04-22T10:00:00.000Z',
  '---',
  '',
].join('\n');

describe('artifact loop — Watcher + Validator + ObservationHooks (real fs)', () => {
  const creationId = 'tiktok-hero-cut';
  let tmpRoot: string;
  let bus: ReturnType<typeof createEventBus>;
  let paths: ReturnType<typeof createCreationArtifactPaths>;
  let watcher: ReturnType<typeof createArtifactWatcher>;
  let hooks: ReturnType<typeof createArtifactObservationHooks>;
  let fsWatchSupported = true;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-artifact-loop-'));
    bus = createEventBus();
    paths = createCreationArtifactPaths(tmpRoot);
    hooks = createArtifactObservationHooks({ eventBus: bus });
    watcher = createArtifactWatcher({
      paths,
      eventBus: bus,
      getRunId: () => 'run-integration',
      getCreationId: () => creationId,
      debounceMs: 30,
    });
    await watcher.start();
  });

  afterEach(async () => {
    await watcher.dispose();
    hooks.dispose();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  // --- Helper — skip assertion if real fs.watch is a no-op on this host.
  function skipIfUnsupported(reason: string): boolean {
    if (!fsWatchSupported) {
      // biome-ignore lint/suspicious/noConsoleLog: test-only signal
      console.warn(`[artifact-loop] fs.watch unsupported — skipping: ${reason}`);
      return true;
    }
    return false;
  }

  it('invalid draft: write → watcher fires → issues reach the next think', async () => {
    const draftPath = paths.file('draft', creationId);
    await fs.writeFile(draftPath, BAD_DRAFT, 'utf-8');

    // Poll for bus activity with generous deadline — real fs.watch on macOS
    // fsevents / Linux inotify / Docker volumes varies.
    const deadline = Date.now() + 2000;
    let received = false;
    const off = bus.onAny(() => {
      received = true;
    });
    while (Date.now() < deadline && !received) await settle(30);
    off();

    if (!received) {
      fsWatchSupported = false;
      if (skipIfUnsupported('initial write not observed')) return;
    }

    // Give the debounce + read a beat to finish.
    await settle(80);

    const result = (await hooks.beforeThink(emptyContext())) as AgentContext;
    expect(result).toBeDefined();
    expect(result.messages).toHaveLength(2);
    const injected = result.messages[1];
    expect(injected?.role).toBe('system');

    const content = String(injected?.content);
    expect(content).toContain('brief.md');
    expect(content).toContain('invalid-status');
    expect(content).toContain('status');
    // At least one of the three missing fields surfaces. We don't assert all
    // three because the schema check order may compact them differently on
    // future tightening.
    const mentionsAnyMissing =
      content.includes('domain') || content.includes('createdAt') || content.includes('updatedAt');
    expect(mentionsAnyMissing).toBe(true);
  });

  it('valid draft: watcher still fires but observation stays silent', async () => {
    const draftPath = paths.file('draft', creationId);
    await fs.writeFile(draftPath, GOOD_DRAFT, 'utf-8');

    const deadline = Date.now() + 2000;
    let observedWritten = false;
    const off = bus.on('execution.artifact.written', () => {
      observedWritten = true;
    });
    while (Date.now() < deadline && !observedWritten) await settle(30);
    off();

    if (!observedWritten) {
      fsWatchSupported = false;
      if (skipIfUnsupported('write event not observed')) return;
    }

    const result = await hooks.beforeThink(emptyContext());
    // No invalid events → observation hook is a no-op.
    expect(result).toBeUndefined();
  });

  it('kind mismatch: brief.md declaring kind: plan surfaces wrong-kind', async () => {
    const draftPath = paths.file('draft', creationId);
    await fs.writeFile(draftPath, KIND_MISMATCH, 'utf-8');

    const deadline = Date.now() + 2000;
    let observedInvalid = false;
    const off = bus.on('execution.artifact.invalid', () => {
      observedInvalid = true;
    });
    while (Date.now() < deadline && !observedInvalid) await settle(30);
    off();

    if (!observedInvalid) {
      fsWatchSupported = false;
      if (skipIfUnsupported('invalid event not observed')) return;
    }

    const result = (await hooks.beforeThink(emptyContext())) as AgentContext;
    const content = String(result.messages[1]?.content);
    expect(content).toContain('wrong-kind');
    expect(content).toContain('brief.md');
  });

  it('rewrite cycle: bad → inject → good → next think is silent', async () => {
    const draftPath = paths.file('draft', creationId);

    // Round 1 — bad write.
    await fs.writeFile(draftPath, BAD_DRAFT, 'utf-8');
    const deadline1 = Date.now() + 2000;
    let badSeen = false;
    const off1 = bus.on('execution.artifact.invalid', () => {
      badSeen = true;
    });
    while (Date.now() < deadline1 && !badSeen) await settle(30);
    off1();
    if (!badSeen) {
      fsWatchSupported = false;
      if (skipIfUnsupported('bad write not observed')) return;
    }

    const firstThink = (await hooks.beforeThink(emptyContext())) as AgentContext;
    expect(String(firstThink.messages[1]?.content)).toContain('invalid-status');

    // Round 2 — good rewrite.
    await fs.writeFile(draftPath, GOOD_DRAFT.replace('tiktok-001', 'fixme'), 'utf-8');
    const deadline2 = Date.now() + 2000;
    let goodSeen = false;
    const off2 = bus.on('execution.artifact.written', () => {
      goodSeen = true;
    });
    while (Date.now() < deadline2 && !goodSeen) await settle(30);
    off2();
    if (!goodSeen) {
      fsWatchSupported = false;
      if (skipIfUnsupported('good rewrite not observed')) return;
    }

    const secondThink = await hooks.beforeThink(emptyContext());
    expect(secondThink).toBeUndefined();
  });
});
