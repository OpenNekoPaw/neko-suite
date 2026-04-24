/**
 * Auto-Compact Circuit Breaker Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  autoCompactIfNeeded,
  createAutoCompactState,
  type AutoCompactState,
} from '../auto-compact';
import type {
  IConversationCompressor,
  ChatMessage,
  ConversationCompressionResult,
} from '@neko/shared';

// Mock logger
vi.mock('../../utils/logger', () => ({
  getLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// =============================================================================
// Helpers
// =============================================================================

function createMockCompressor(overrides?: {
  shouldCompress?: boolean;
  compressResult?: ConversationCompressionResult;
  compressError?: Error;
}): IConversationCompressor {
  const compressResult: ConversationCompressionResult = overrides?.compressResult ?? {
    messages: [
      {
        message: { role: 'system', content: 'compressed' },
        isSummary: true,
        compressedTokens: 100,
      },
    ],
    originalTokens: 5000,
    compressedTokens: 100,
    compressionRatio: 0.02,
    messagesRemoved: 20,
    summariesCreated: 1,
    timestamp: Date.now(),
  };

  return {
    shouldCompress: vi.fn().mockReturnValue(overrides?.shouldCompress ?? true),
    compress: overrides?.compressError
      ? vi.fn().mockRejectedValue(overrides.compressError)
      : vi.fn().mockResolvedValue(compressResult),
    estimateTokens: vi.fn().mockReturnValue(5000),
    configure: vi.fn(),
    getConfig: vi.fn().mockReturnValue({
      triggers: { tokenThreshold: 4000, turnThreshold: 20 },
    }),
    setSummarizer: vi.fn(),
    setClassifier: vi.fn(),
    getTurns: vi.fn().mockReturnValue([]),
    compressToolResult: vi.fn(),
  } as unknown as IConversationCompressor;
}

function createMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `Message ${i}`,
  }));
}

// =============================================================================
// Tests
// =============================================================================

describe('createAutoCompactState', () => {
  it('should create initial state with all counters at zero', () => {
    const state = createAutoCompactState();

    expect(state.consecutiveFailures).toBe(0);
    expect(state.lastCompactTimestamp).toBe(0);
    expect(state.isCircuitOpen).toBe(false);
    expect(state.circuitOpenedAt).toBe(0);
  });
});

describe('autoCompactIfNeeded', () => {
  let state: AutoCompactState;

  beforeEach(() => {
    state = createAutoCompactState();
  });

  it('should skip when threshold not reached', async () => {
    const compressor = createMockCompressor({ shouldCompress: false });

    const result = await autoCompactIfNeeded(compressor, createMessages(5), 1000, state);

    expect(result.compressed).toBe(false);
    expect(result.skipReason).toBe('threshold_not_reached');
    expect(compressor.compress).not.toHaveBeenCalled();
  });

  it('should compress when threshold is reached', async () => {
    const compressor = createMockCompressor({ shouldCompress: true });

    const result = await autoCompactIfNeeded(compressor, createMessages(50), 5000, state);

    expect(result.compressed).toBe(true);
    expect(result.newHistory).toBeDefined();
    expect(result.newHistory).toHaveLength(1);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lastCompactTimestamp).toBeGreaterThan(0);
  });

  it('should skip when called too soon after last compression', async () => {
    const compressor = createMockCompressor({ shouldCompress: true });
    state.lastCompactTimestamp = Date.now(); // Just compressed

    const result = await autoCompactIfNeeded(compressor, createMessages(50), 5000, state);

    expect(result.compressed).toBe(false);
    expect(result.skipReason).toBe('too_soon');
  });

  it('should increment failure count on compression error', async () => {
    const compressor = createMockCompressor({
      shouldCompress: true,
      compressError: new Error('Summarizer offline'),
    });

    const result = await autoCompactIfNeeded(compressor, createMessages(50), 5000, state);

    expect(result.compressed).toBe(false);
    expect(state.consecutiveFailures).toBe(1);
    expect(state.isCircuitOpen).toBe(false);
  });

  it('should open circuit after 3 consecutive failures', async () => {
    const compressor = createMockCompressor({
      shouldCompress: true,
      compressError: new Error('fail'),
    });

    // Fail 3 times
    await autoCompactIfNeeded(compressor, createMessages(50), 5000, state);
    state.lastCompactTimestamp = 0; // Reset interval
    await autoCompactIfNeeded(compressor, createMessages(50), 5000, state);
    state.lastCompactTimestamp = 0;
    await autoCompactIfNeeded(compressor, createMessages(50), 5000, state);

    expect(state.consecutiveFailures).toBe(3);
    expect(state.isCircuitOpen).toBe(true);
    expect(state.circuitOpenedAt).toBeGreaterThan(0);
  });

  it('should skip when circuit is open', async () => {
    const compressor = createMockCompressor({ shouldCompress: true });
    state.isCircuitOpen = true;
    state.circuitOpenedAt = Date.now(); // Recently opened

    const result = await autoCompactIfNeeded(compressor, createMessages(50), 5000, state);

    expect(result.compressed).toBe(false);
    expect(result.skipReason).toBe('circuit_open');
    expect(compressor.shouldCompress).not.toHaveBeenCalled();
  });

  it('should allow retry after cooldown (half-open)', async () => {
    const compressor = createMockCompressor({ shouldCompress: true });
    state.isCircuitOpen = true;
    state.circuitOpenedAt = Date.now() - 31 * 60 * 1000; // 31 minutes ago

    const result = await autoCompactIfNeeded(compressor, createMessages(50), 5000, state);

    expect(result.compressed).toBe(true);
    expect(state.isCircuitOpen).toBe(false); // Circuit reset
    expect(state.consecutiveFailures).toBe(0);
  });

  it('should reset failure count after successful compression', async () => {
    const compressor = createMockCompressor({ shouldCompress: true });
    state.consecutiveFailures = 2; // Two previous failures

    const result = await autoCompactIfNeeded(compressor, createMessages(50), 5000, state);

    expect(result.compressed).toBe(true);
    expect(state.consecutiveFailures).toBe(0);
  });
});
