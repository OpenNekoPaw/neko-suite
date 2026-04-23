/**
 * Ablation Loop Integration — applyAblationToggles → initializer → factory
 *
 * Validates the end-to-end marker flow the initializer performs in
 * `createConfiguredExecutor`:
 *   1. applyAblationToggles(base, toggles) prepends an AblationMarkerHook
 *   2. extractAblationMarker pulls it out of config.hooks
 *   3. customHooks is filtered so the marker doesn't appear as a no-op
 *   4. createExecutorHooks receives disableHooks + disable* flags and
 *      filters the built-in chain accordingly
 *
 * Without this wiring, the 4 marker-dependent toggles (validation / retry /
 * compression / sessionMemory) silently have no effect.
 */

import { describe, it, expect, vi } from 'vitest';
import type { AgentSessionConfig } from '../../session/types';
import type { ExecutorHooks } from '@neko/shared';
import { applyAblationToggles, extractAblationMarker } from '../apply-toggles';
import { createExecutorHooks } from '../../hooks/executor-hooks-factory';

// =============================================================================
// Helpers
// =============================================================================

function makeBaseConfig(): AgentSessionConfig {
  return {
    service: {} as AgentSessionConfig['service'],
    toolRegistry: {} as AgentSessionConfig['toolRegistry'],
    systemPrompt: 'test',
  };
}

function makeMockCompressor() {
  return {
    compress: vi.fn().mockResolvedValue({ messages: [] }),
    estimateTokens: vi.fn().mockReturnValue(0),
  } as unknown as import('../../context').ConversationCompressor;
}

/**
 * Simulate the initializer's marker consumption step, then build the hooks
 * chain via the factory. Returns the final hooks array the executor would
 * see, which is what we assert on.
 */
function buildChainFromConfig(config: AgentSessionConfig): ExecutorHooks[] {
  const marker = extractAblationMarker(config.hooks);
  const customHooks = marker ? config.hooks?.filter((h) => h !== marker) : config.hooks;

  const { hooks } = createExecutorHooks({
    compressor: makeMockCompressor(),
    permissionMode: 'auto',
    ...(customHooks && { customHooks }),
    ...(marker && {
      disableHooks: marker.disableHooks,
      disableCompression: marker.disableCompression,
      disableSessionMemory: marker.disableSessionMemory,
    }),
  });
  return hooks;
}

// =============================================================================
// Tests
// =============================================================================

describe('applyAblationToggles → initializer → factory (integration)', () => {
  it('validation: false removes ValidationHooks from the final chain', () => {
    const config = applyAblationToggles(makeBaseConfig(), { validation: false });
    const names = buildChainFromConfig(config).map((h) => h.name);
    expect(names).not.toContain('validation');
    // Other built-ins must remain
    expect(names).toEqual(['memory', 'permission', 'retry']);
  });

  it('retry: false removes RetryHooks from the final chain', () => {
    const config = applyAblationToggles(makeBaseConfig(), { retry: false });
    const names = buildChainFromConfig(config).map((h) => h.name);
    expect(names).not.toContain('retry');
    expect(names).toEqual(['memory', 'validation', 'permission']);
  });

  it('empty toggles keeps all built-in hooks (control)', () => {
    const config = applyAblationToggles(makeBaseConfig(), {});
    const names = buildChainFromConfig(config).map((h) => h.name);
    expect(names).toEqual(['memory', 'validation', 'permission', 'retry']);
  });

  it('marker is stripped from customHooks (not present as no-op in final chain)', () => {
    const config = applyAblationToggles(makeBaseConfig(), { validation: false });
    const finalChain = buildChainFromConfig(config);

    // The marker carries name 'ablation-marker' and __ablation: true — if the
    // initializer failed to strip it, it would flow through customHooks and
    // show up at the tail of the chain.
    const ablationMarkers = finalChain.filter(
      (h) => (h as { __ablation?: boolean }).__ablation === true,
    );
    expect(ablationMarkers.length).toBe(0);

    const named = finalChain.find((h) => h.name === 'ablation-marker');
    expect(named).toBeUndefined();
  });

  it('multiple toggles compose: validation + retry both removed together', () => {
    const config = applyAblationToggles(makeBaseConfig(), {
      validation: false,
      retry: false,
    });
    const names = buildChainFromConfig(config).map((h) => h.name);
    expect(names).toEqual(['memory', 'permission']);
  });

  it('custom hooks supplied alongside toggles survive marker extraction', () => {
    const customHook: ExecutorHooks = { name: 'user-custom' };
    const base: AgentSessionConfig = { ...makeBaseConfig(), hooks: [customHook] };
    const config = applyAblationToggles(base, { validation: false });

    const finalChain = buildChainFromConfig(config);
    const names = finalChain.map((h) => h.name);

    expect(names).not.toContain('validation');
    expect(names).not.toContain('ablation-marker');
    expect(names).toContain('user-custom');
    // Custom hooks run after built-ins
    expect(names[names.length - 1]).toBe('user-custom');
  });
});
