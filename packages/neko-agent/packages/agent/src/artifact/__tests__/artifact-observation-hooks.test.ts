import { describe, it, expect } from 'vitest';
import type { AgentContext, ChatMessage } from '@neko/shared';
import { EXECUTION_CHANNELS } from '@neko-agent/types';
import type { ExecutionArtifactInvalidEvent } from '@neko-agent/types';
import { createEventBus } from '../../events/event-bus';
import { createArtifactObservationHooks } from '../artifact-observation-hooks';

function makeContext(): AgentContext {
  return {
    messages: [{ role: 'user', content: 'hello' } as ChatMessage],
    state: { status: 'thinking' } as AgentContext['state'],
    iteration: 0,
    toolResults: [],
    metadata: {},
  };
}

function invalid(
  event: Partial<ExecutionArtifactInvalidEvent> = {},
): ExecutionArtifactInvalidEvent {
  return {
    channel: EXECUTION_CHANNELS.ARTIFACT_INVALID,
    runId: 'run-1',
    kind: 'draft',
    path: '/tmp/neko/creations/xyz/brief.md',
    issues: [
      {
        code: 'invalid-status',
        field: 'status',
        message:
          '"status" must be one of draft | pending_review | approved | refined | rejected (got "foo")',
      },
    ],
    at: 1_700_000_000_000,
    ...event,
  };
}

describe('ArtifactObservationHooks', () => {
  it('no-op when no invalid events have fired', async () => {
    const bus = createEventBus();
    const hooks = createArtifactObservationHooks({ eventBus: bus });
    const ctx = makeContext();
    const result = await hooks.beforeThink(ctx);
    expect(result).toBeUndefined();
  });

  it('drains a single invalid event into a system message on beforeThink', async () => {
    const bus = createEventBus();
    const hooks = createArtifactObservationHooks({ eventBus: bus });
    bus.emit(invalid());
    const result = (await hooks.beforeThink(makeContext())) as AgentContext;
    expect(result).toBeDefined();
    expect(result.messages).toHaveLength(2);
    const injected = result.messages[1];
    expect(injected?.role).toBe('system');
    expect(String(injected?.content)).toContain('ArtifactWatcher reported validation issues');
    expect(String(injected?.content)).toContain('draft-xyz.md');
    expect(String(injected?.content)).toContain('invalid-status');
    expect(String(injected?.content)).toContain('status');
  });

  it('second beforeThink after drain returns no-op when bus is quiet', async () => {
    const bus = createEventBus();
    const hooks = createArtifactObservationHooks({ eventBus: bus });
    bus.emit(invalid());
    await hooks.beforeThink(makeContext());
    const second = await hooks.beforeThink(makeContext());
    expect(second).toBeUndefined();
  });

  it('buffers multiple events and renders them in order', async () => {
    const bus = createEventBus();
    const hooks = createArtifactObservationHooks({ eventBus: bus });
    bus.emit(invalid({ path: '/a/draft-first.md' }));
    bus.emit(invalid({ path: '/a/draft-second.md', kind: 'plan' }));
    const result = (await hooks.beforeThink(makeContext())) as AgentContext;
    const content = String(result.messages[1]?.content);
    const firstIdx = content.indexOf('draft-first.md');
    const secondIdx = content.indexOf('draft-second.md');
    expect(firstIdx).toBeGreaterThan(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });

  it('renders all issues for a single entry (not just the first)', async () => {
    const bus = createEventBus();
    const hooks = createArtifactObservationHooks({ eventBus: bus });
    bus.emit(
      invalid({
        issues: [
          { code: 'missing-field', field: 'domain', message: 'domain missing' },
          { code: 'invalid-timestamp', field: 'updatedAt', message: 'bad ts' },
        ],
      }),
    );
    const result = (await hooks.beforeThink(makeContext())) as AgentContext;
    const content = String(result.messages[1]?.content);
    expect(content).toContain('missing-field');
    expect(content).toContain('invalid-timestamp');
    expect(content).toContain('domain');
    expect(content).toContain('updatedAt');
  });

  it('caps buffered events at maxBuffered + reports overflow', async () => {
    const bus = createEventBus();
    const hooks = createArtifactObservationHooks({ eventBus: bus, maxBuffered: 2 });
    for (let i = 0; i < 5; i++) bus.emit(invalid({ path: `/a/draft-${i}.md` }));
    const result = (await hooks.beforeThink(makeContext())) as AgentContext;
    const content = String(result.messages[1]?.content);
    expect(content).toContain('draft-0.md');
    expect(content).toContain('draft-1.md');
    expect(content).not.toContain('draft-4.md');
    expect(content).toContain('3 more issues dropped');
  });

  it('dispose drops the bus subscription (no hook fires after dispose)', async () => {
    const bus = createEventBus();
    const hooks = createArtifactObservationHooks({ eventBus: bus });
    hooks.dispose();
    bus.emit(invalid());
    const result = await hooks.beforeThink(makeContext());
    expect(result).toBeUndefined();
  });

  it('null eventBus is a valid no-op', async () => {
    const hooks = createArtifactObservationHooks({ eventBus: null });
    const result = await hooks.beforeThink(makeContext());
    expect(result).toBeUndefined();
    hooks.dispose(); // must not throw
  });
});
