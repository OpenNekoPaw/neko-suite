import { describe, expect, it, vi } from 'vitest';
import { LLMRouter } from '../llm-router';
import type { LLMChatFn } from '../llm-router';
import { ROUTER_TOOL_NAMES } from '../llm-router-tools';
import type { ChatResponse, LLMToolCall } from '../../../types/adapter';
import type { FastProbeResult, ProbeContext, RawInput } from '../../types';

// =============================================================================
// Helpers
// =============================================================================

const INPUT: RawInput = { kind: 'prompt', text: 'Write a short video about a cat' };
const CTX: ProbeContext = { inputType: 'prompt', textLength: 30, raw: INPUT };
const FAST: FastProbeResult = {
  confidence: 0.55,
  route: 'L1',
  skipStages: [],
  reason: 'ambiguous',
};

function commitCall(args: {
  level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  reason: string;
  skipStages?: string[];
}): LLMToolCall {
  return {
    id: 'call_commit',
    type: 'function',
    function: { name: ROUTER_TOOL_NAMES.commitRoute, arguments: JSON.stringify(args) },
  };
}

function analyzeCall(args: { excerpt: string }): LLMToolCall {
  return {
    id: 'call_analyze',
    type: 'function',
    function: {
      name: ROUTER_TOOL_NAMES.analyzeTextStructure,
      arguments: JSON.stringify(args),
    },
  };
}

function makeResponse(calls: LLMToolCall[]): ChatResponse {
  return {
    id: 'r1',
    model: 'test',
    finishReason: calls.length > 0 ? 'tool_calls' : 'stop',
    message: {
      role: 'assistant',
      content: '',
      toolCalls: calls,
    },
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('LLMRouter — happy paths', () => {
  it('commits on the first turn', async () => {
    const chat: LLMChatFn = vi.fn(async () =>
      makeResponse([commitCall({ level: 'L1', reason: 'short prompt, batch ok' })]),
    );
    const router = new LLMRouter({ chat });
    const r = await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    expect(r?.level).toBe('L1');
    expect(r?.reason).toBe('short prompt, batch ok');
    expect(r?.iterations).toBe(1);
    expect(chat).toHaveBeenCalledOnce();
  });

  it('walks one tool call then commits', async () => {
    let turn = 0;
    const chat: LLMChatFn = vi.fn(async () => {
      turn++;
      if (turn === 1) return makeResponse([analyzeCall({ excerpt: 'line1\nline2' })]);
      return makeResponse([commitCall({ level: 'L2', reason: 'after analyze' })]);
    });
    const router = new LLMRouter({ chat });
    const r = await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    expect(r?.level).toBe('L2');
    expect(r?.iterations).toBe(2);
    expect(chat).toHaveBeenCalledTimes(2);
  });
});

describe('LLMRouter — cache', () => {
  it('serves a second identical input from cache', async () => {
    const chat: LLMChatFn = vi.fn(async () =>
      makeResponse([commitCall({ level: 'L1', reason: 'cached' })]),
    );
    const router = new LLMRouter({ chat });
    const first = await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    const second = await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    expect(first?.fromCache).toBe(false);
    expect(second?.fromCache).toBe(true);
    expect(chat).toHaveBeenCalledOnce();
  });

  it('clearCache forces a re-query', async () => {
    const chat: LLMChatFn = vi.fn(async () =>
      makeResponse([commitCall({ level: 'L1', reason: 'again' })]),
    );
    const router = new LLMRouter({ chat });
    await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    router.clearCache();
    await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    expect(chat).toHaveBeenCalledTimes(2);
  });
});

describe('LLMRouter — failure modes', () => {
  it('returns undefined when the model stops without committing', async () => {
    const chat: LLMChatFn = vi.fn(async () => makeResponse([]));
    const router = new LLMRouter({ chat });
    const r = await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    expect(r).toBeUndefined();
  });

  it('returns undefined when the chat throws', async () => {
    const chat: LLMChatFn = vi.fn(async () => {
      throw new Error('network');
    });
    const router = new LLMRouter({ chat });
    const r = await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    expect(r).toBeUndefined();
  });

  it('gives up after maxIterations without commit', async () => {
    const chat: LLMChatFn = vi.fn(async () => makeResponse([analyzeCall({ excerpt: 'loop' })]));
    const router = new LLMRouter({ chat, maxIterations: 3 });
    const r = await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    expect(r).toBeUndefined();
    expect(chat).toHaveBeenCalledTimes(3);
  });

  // ---------------------------------------------------------------------------
  // Phase 3 D2 — routing.md §5 Fallback matrix coverage
  // ---------------------------------------------------------------------------

  it('rejects a hallucinated route level (commit with L5)', async () => {
    // The model calls commit_route but with a level outside {L0..L4}.
    // Build a raw tool call so we can escape the type-level guard.
    const invalidCommit: LLMToolCall = {
      id: 'call_bad',
      type: 'function',
      function: {
        name: ROUTER_TOOL_NAMES.commitRoute,
        arguments: JSON.stringify({ level: 'L5', reason: 'way too excited' }),
      },
    };
    const chat: LLMChatFn = vi.fn(async () => makeResponse([invalidCommit]));
    const router = new LLMRouter({ chat });
    const r = await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    // Validator treats invalid level as "no commit" → undefined so the
    // facade can fall back to FastProbe.
    expect(r).toBeUndefined();
  });

  it('rejects lowercase level (l2) — validator is case-sensitive', async () => {
    const invalidCommit: LLMToolCall = {
      id: 'call_lower',
      type: 'function',
      function: {
        name: ROUTER_TOOL_NAMES.commitRoute,
        arguments: JSON.stringify({ level: 'l2', reason: 'casing slipped' }),
      },
    };
    const chat: LLMChatFn = vi.fn(async () => makeResponse([invalidCommit]));
    const router = new LLMRouter({ chat });
    const r = await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    expect(r).toBeUndefined();
  });

  it('rejects commit with empty reason (schema violation)', async () => {
    const invalidCommit: LLMToolCall = {
      id: 'call_noreason',
      type: 'function',
      function: {
        name: ROUTER_TOOL_NAMES.commitRoute,
        arguments: JSON.stringify({ level: 'L1', reason: '' }),
      },
    };
    const chat: LLMChatFn = vi.fn(async () => makeResponse([invalidCommit]));
    const router = new LLMRouter({ chat });
    const r = await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    expect(r).toBeUndefined();
  });

  it('rejects commit with wrong-typed skipStages (non-array)', async () => {
    const invalidCommit: LLMToolCall = {
      id: 'call_badskip',
      type: 'function',
      function: {
        name: ROUTER_TOOL_NAMES.commitRoute,
        arguments: JSON.stringify({
          level: 'L2',
          reason: 'wants to skip stages but as a string',
          skipStages: 'readDocument',
        }),
      },
    };
    const chat: LLMChatFn = vi.fn(async () => makeResponse([invalidCommit]));
    const router = new LLMRouter({ chat });
    const r = await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    expect(r).toBeUndefined();
  });

  it('returns undefined immediately when the caller signal is pre-aborted', async () => {
    // Simulates "budget already exhausted" / upstream cancellation: the
    // first signal check in runLoop() aborts before chat() is called.
    const chat: LLMChatFn = vi.fn(async () =>
      makeResponse([commitCall({ level: 'L1', reason: 'would-be commit' })]),
    );
    const controller = new AbortController();
    controller.abort();
    const router = new LLMRouter({ chat });
    const r = await router.decide({
      input: INPUT,
      ctx: CTX,
      fastHint: FAST,
      signal: controller.signal,
    });
    expect(r).toBeUndefined();
    // chat() is skipped when the loop's initial abort check trips.
    expect(chat).not.toHaveBeenCalled();
  });
});

describe('LLMRouter — ask_user dismissed via status (not throw)', () => {
  it('surfaces explicit { status: "dismissed" } to the LLM and lets it continue', async () => {
    function askCall(args: { question: string }): LLMToolCall {
      return {
        id: 'call_ask',
        type: 'function',
        function: { name: ROUTER_TOOL_NAMES.askUser, arguments: JSON.stringify(args) },
      };
    }
    let turn = 0;
    const chat: LLMChatFn = vi.fn(async () => {
      turn++;
      if (turn === 1) return makeResponse([askCall({ question: 'L1 or L3?' })]);
      // After seeing "dismissed", model falls back to a conservative L1.
      return makeResponse([commitCall({ level: 'L1', reason: 'user skipped; going safe' })]);
    });
    // Broker returns the dismissed status natively (60s timeout in prod).
    const brokerAsk = vi.fn(async () => ({
      status: 'dismissed' as const,
      note: 'user idle 60s',
    }));
    const router = new LLMRouter({
      chat,
      askBroker: { ask: brokerAsk },
    });
    const r = await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    expect(r?.level).toBe('L1');
    expect(brokerAsk).toHaveBeenCalledOnce();
  });
});

describe('LLMRouter — ask_user broker', () => {
  function askCall(args: { question: string; options?: string[] }): LLMToolCall {
    return {
      id: 'call_ask',
      type: 'function',
      function: { name: ROUTER_TOOL_NAMES.askUser, arguments: JSON.stringify(args) },
    };
  }

  it('routes ask_user through the broker and feeds the answer back to the LLM', async () => {
    let turn = 0;
    const chat: LLMChatFn = vi.fn(async () => {
      turn++;
      if (turn === 1) return makeResponse([askCall({ question: 'L1 or L3?' })]);
      return makeResponse([commitCall({ level: 'L3', reason: 'user picked L3' })]);
    });
    const brokerAsk = vi.fn(async () => ({
      status: 'answered' as const,
      choice: 'L3',
    }));
    const router = new LLMRouter({
      chat,
      askBroker: { ask: brokerAsk },
      // Large enough that ask doesn't eat the budget
      budgetMs: 100_000,
      askTimeoutMs: 5_000,
    });
    const r = await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    expect(r?.level).toBe('L3');
    expect(brokerAsk).toHaveBeenCalledOnce();
  });

  it('falls back gracefully when the broker throws', async () => {
    let turn = 0;
    const chat: LLMChatFn = vi.fn(async () => {
      turn++;
      if (turn === 1) return makeResponse([askCall({ question: 'Which?' })]);
      return makeResponse([commitCall({ level: 'L0', reason: 'gave up asking' })]);
    });
    const router = new LLMRouter({
      chat,
      askBroker: {
        ask: async () => {
          throw new Error('user dismissed');
        },
      },
    });
    const r = await router.decide({ input: INPUT, ctx: CTX, fastHint: FAST });
    // The router still commits — broker failures are surfaced to the LLM
    // as `dismissed`, not rethrown.
    expect(r?.level).toBe('L0');
  });
});

describe('LLMRouter — memory persistence', () => {
  it('records the committed route to memory', async () => {
    const chat: LLMChatFn = vi.fn(async () =>
      makeResponse([commitCall({ level: 'L3', reason: 'long story' })]),
    );
    const recorded: unknown[] = [];
    const router = new LLMRouter({
      chat,
      memory: {
        record: async (entry: unknown) => {
          recorded.push(entry);
        },
        // Unused in commit path — minimal stub
        lookup: () => undefined,
        listRecent: () => [],
      } as never,
    });
    const r = await router.decide({
      input: INPUT,
      ctx: { ...CTX, textLength: 3000 },
      fastHint: FAST,
    });
    expect(r?.level).toBe('L3');
    // Memory write is fire-and-forget — give the microtask queue a beat
    await Promise.resolve();
    await Promise.resolve();
    expect(recorded).toHaveLength(1);
    const entry = recorded[0] as { level: string; source: string; textLength: number };
    expect(entry.level).toBe('L3');
    expect(entry.source).toBe('llm');
    expect(entry.textLength).toBe(3000);
  });
});
