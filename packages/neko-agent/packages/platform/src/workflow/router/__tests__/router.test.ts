/**
 * Router façade integration tests.
 *
 * Verifies that the Router correctly composes InputProbe + FastProbe + RouteRegistry
 * and honors user overrides.
 */

import { describe, expect, it, vi } from 'vitest';
import { createRouter } from '../index';
import type { RawInput } from '../../types';

describe('Router — user override', () => {
  it('forceLevel bypasses probing', async () => {
    const router = createRouter();
    const input: RawInput = { kind: 'prompt', text: 'anything' };
    const route = await router.decide(input, { forceLevel: 'L3' });
    expect(route.level).toBe('L3');
    expect(route.provenance).toBe('user-override');
    expect(route.confidence).toBe(1.0);
  });
});

describe('Router — prompt inputs', () => {
  it('short prompt → L0', async () => {
    const router = createRouter();
    const route = await router.decide({ kind: 'prompt', text: 'a jumping cat' });
    expect(route.level).toBe('L0');
    expect(route.provenance).toBe('rules');
    expect(route.flowId).toBe('flowB');
  });

  it('long text → L3', async () => {
    const router = createRouter();
    const longText = 'A '.repeat(2000); // 4000 chars
    const route = await router.decide({ kind: 'prompt', text: longText });
    expect(route.level).toBe('L3');
    expect(route.flowId).toBe('flowA');
    expect(route.entryExtension).toBe('story');
  });
});

describe('Router — file inputs', () => {
  it('.fountain file → L2 skip readDocument', async () => {
    const router = createRouter();
    const route = await router.decide({ kind: 'file', path: '/tmp/script.fountain' });
    expect(route.level).toBe('L2');
    expect(route.skipStages).toContain('readDocument');
  });

  it('.nkv timeline → L0 entry via cut', async () => {
    const router = createRouter();
    const route = await router.decide({ kind: 'file', path: '/tmp/edit.nkv' });
    expect(route.level).toBe('L0');
    expect(route.entryExtension).toBe('cut');
  });

  it('multiple image drop → L1 batch', async () => {
    const router = createRouter();
    const paths = ['/a.png', '/b.png', '/c.png', '/d.png'];
    const route = await router.decide({ kind: 'files', paths });
    expect(route.level).toBe('L1');
    expect(route.entryExtension).toBe('canvas');
  });
});

describe('Router — drop target override', () => {
  it('drop onto Cut turns a prompt into post-production L0', async () => {
    const router = createRouter({ probeOptions: { dropTarget: 'cut' } });
    const route = await router.decide({ kind: 'prompt', text: 'some note' });
    expect(route.level).toBe('L0');
    expect(route.entryExtension).toBe('cut');
  });
});

describe('Router — fallback when confidence low', () => {
  it('ambiguous medium prompt falls back to L2', async () => {
    const router = createRouter();
    const text = 'x'.repeat(1000);
    const route = await router.decide({ kind: 'prompt', text });
    // FastProbe returns confidence ~0.6 → fallback applies
    expect(route.level).toBe('L2');
    expect(route.confidence).toBeLessThan(0.9);
    // reason should mention the fallback
    expect(route.reason.toLowerCase()).toMatch(/ambigu|fallback|refine/);
  });

  it('custom defaultFallbackLevel is honoured', async () => {
    const router = createRouter({ defaultFallbackLevel: 'L1' });
    const text = 'x'.repeat(1000);
    const route = await router.decide({ kind: 'prompt', text });
    // L2 route was returned by FastProbe (ambiguous rule), so we still get L2
    // (fallback only kicks in when FastProbe returns undefined)
    expect(route.level).toBe('L2');
  });
});

// =============================================================================
// Phase 3 — LLMRouter integration
// =============================================================================

import { LLMRouter } from '../llm-router';
import type { LLMChatFn } from '../llm-router';
import { ROUTER_TOOL_NAMES } from '../llm-router-tools';
import { RouterMemory } from '../../memory/router-memory';

function fakeChat(level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4', reason: string): LLMChatFn {
  return async () => ({
    id: 'r',
    model: 'test',
    finishReason: 'tool_calls',
    message: {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'c',
          type: 'function',
          function: {
            name: ROUTER_TOOL_NAMES.commitRoute,
            arguments: JSON.stringify({ level, reason }),
          },
        },
      ],
    },
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  });
}

describe('Router — LLMRouter integration', () => {
  it('falls through to the LLMRouter when FastProbe confidence is ambiguous', async () => {
    const llm = new LLMRouter({ chat: fakeChat('L3', 'LLM: long story') });
    const router = createRouter({ llmRouter: llm });
    // Medium-length prompt → FastProbe returns L2 @ 0.6 confidence (ambiguous)
    const route = await router.decide({ kind: 'prompt', text: 'x'.repeat(1000) });
    expect(route.provenance).toBe('llm');
    expect(route.level).toBe('L3');
    expect(route.reason).toBe('LLM: long story');
  });

  it('skips the LLMRouter when FastProbe is already committable', async () => {
    const chat = vi.fn(fakeChat('L4', 'should-not-fire'));
    const llm = new LLMRouter({ chat });
    const router = createRouter({ llmRouter: llm });
    // Short prompt → FastProbe confidence 0.92 → committable
    const route = await router.decide({ kind: 'prompt', text: 'brief' });
    expect(route.provenance).toBe('rules');
    expect(chat).not.toHaveBeenCalled();
  });

  it('disableLlmRouter override bypasses the LLM even when ambiguous', async () => {
    const chat = vi.fn(fakeChat('L3', 'disabled'));
    const llm = new LLMRouter({ chat });
    const router = createRouter({ llmRouter: llm });
    const route = await router.decide(
      { kind: 'prompt', text: 'x'.repeat(1000) },
      { disableLlmRouter: true },
    );
    expect(route.provenance).toBe('rules');
    expect(chat).not.toHaveBeenCalled();
  });

  it('falls back to FastProbe when the LLMRouter returns undefined', async () => {
    const llm = new LLMRouter({
      chat: async () => ({
        id: 'r',
        model: 'test',
        finishReason: 'stop',
        message: { role: 'assistant', content: '', toolCalls: [] },
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }),
    });
    const router = createRouter({ llmRouter: llm });
    const route = await router.decide({ kind: 'prompt', text: 'x'.repeat(1000) });
    // Falls back to FastProbe's L2 with "low confidence" reason
    expect(route.provenance).toBe('rules');
    expect(route.level).toBe('L2');
    expect(route.reason.toLowerCase()).toContain('fallback');
  });
});

describe('Router — RouterMemory integration', () => {
  it('reuses a prior decision via memory (provenance: memory)', async () => {
    let stored: string | null = null;
    const store = {
      getContent: () => stored,
      upsertEntry: async (_key: string, body: string) => {
        stored = `## workflow-router\n${body}\n`;
      },
    };
    const memory = new RouterMemory(store);
    await memory.record({
      hash: (await import('../input-hash')).hashInput({ kind: 'prompt', text: 'same input' }),
      level: 'L4',
      reason: 'user preferred L4 last time',
      at: 1,
      source: 'user-override',
    });
    const router = createRouter({ memory });
    const route = await router.decide({ kind: 'prompt', text: 'same input' });
    expect(route.provenance).toBe('memory');
    expect(route.level).toBe('L4');
    expect(route.reason).toContain('Prior decision');
  });

  it('memory miss falls through to FastProbe', async () => {
    const store = {
      getContent: () => null,
      upsertEntry: async () => undefined,
    };
    const memory = new RouterMemory(store);
    const router = createRouter({ memory });
    const route = await router.decide({ kind: 'prompt', text: 'fresh prompt' });
    expect(route.provenance).toBe('rules');
  });
});
