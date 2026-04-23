/**
 * Tests for SelfEvaluationHooks — ADR §11.6.9 "AI self-evaluation" guidance
 * piece operationalised as a hook that reacts to Apply-stage exits.
 */
import { describe, it, expect } from 'vitest';
import type { AgentContext, ChatMessage } from '@neko/shared';
import { SelfEvaluationHooks, SELF_EVAL_GUIDANCE } from '../self-evaluation-hooks';
import { StageTracker } from '../../skill/stage-tracker';

function makeContext(messages: ChatMessage[] = []): AgentContext {
  return {
    messages,
    iteration: 0,
    maxIterations: 10,
  } as AgentContext;
}

describe('SelfEvaluationHooks', () => {
  it('no-op when constructed without a StageTracker', async () => {
    const hook = new SelfEvaluationHooks({ stageTracker: null });
    expect(hook.isPending()).toBe(false);
    const ctx = makeContext();
    expect(await hook.beforeThink(ctx)).toBeUndefined();
    hook.dispose(); // must not throw
  });

  it('buffers a flag when the Apply stage exits', () => {
    const tracker = new StageTracker({ initialStage: 'apply' });
    const hook = new SelfEvaluationHooks({ stageTracker: tracker });
    expect(hook.isPending()).toBe(false);
    tracker.enter('draft'); // triggers onExited(stage='apply')
    expect(hook.isPending()).toBe(true);
  });

  it('does not buffer on non-Apply stage exits', () => {
    const tracker = new StageTracker({ initialStage: 'draft' });
    const hook = new SelfEvaluationHooks({ stageTracker: tracker });
    tracker.enter('plan'); // exits 'draft'
    expect(hook.isPending()).toBe(false);
    tracker.enter('apply'); // exits 'plan'
    expect(hook.isPending()).toBe(false);
    tracker.enter('draft'); // exits 'apply' — now we flag
    expect(hook.isPending()).toBe(true);
  });

  it('beforeThink injects a guidance system message and clears the flag', async () => {
    const tracker = new StageTracker({ initialStage: 'apply' });
    const hook = new SelfEvaluationHooks({ stageTracker: tracker });
    tracker.enter('draft');

    const ctx = makeContext([{ role: 'user', content: 'hi' }]);
    const result = await hook.beforeThink(ctx);
    expect(result).toBeDefined();
    const injected = result!.messages.at(-1);
    expect(injected?.role).toBe('system');
    expect(injected?.content).toBe(SELF_EVAL_GUIDANCE);
    expect(hook.isPending()).toBe(false);
  });

  it('only injects once per Apply-exit signal', async () => {
    const tracker = new StageTracker({ initialStage: 'apply' });
    const hook = new SelfEvaluationHooks({ stageTracker: tracker });
    tracker.enter('draft');

    const first = await hook.beforeThink(makeContext());
    expect(first).toBeDefined();
    const second = await hook.beforeThink(makeContext());
    expect(second).toBeUndefined();
  });

  it('fires again after a subsequent Apply exit', async () => {
    const tracker = new StageTracker({ initialStage: 'apply' });
    const hook = new SelfEvaluationHooks({ stageTracker: tracker });

    // First Apply → Draft cycle
    tracker.enter('draft');
    expect(await hook.beforeThink(makeContext())).toBeDefined();
    expect(await hook.beforeThink(makeContext())).toBeUndefined();

    // Another Apply → Draft cycle
    tracker.enter('apply');
    tracker.enter('draft');
    expect(await hook.beforeThink(makeContext())).toBeDefined();
  });

  it('dispose unsubscribes from the tracker', () => {
    const tracker = new StageTracker({ initialStage: 'apply' });
    const hook = new SelfEvaluationHooks({ stageTracker: tracker });

    hook.dispose();
    tracker.enter('draft'); // would previously have flagged
    expect(hook.isPending()).toBe(false);
  });

  it('dispose is idempotent', () => {
    const tracker = new StageTracker({ initialStage: 'apply' });
    const hook = new SelfEvaluationHooks({ stageTracker: tracker });
    expect(() => {
      hook.dispose();
      hook.dispose();
    }).not.toThrow();
  });

  it('hook name matches the contract', () => {
    const hook = new SelfEvaluationHooks({ stageTracker: null });
    expect(hook.name).toBe('self-evaluation');
  });
});
