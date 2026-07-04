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
 * Without this wiring, the marker-dependent toggles (validation / retry /
 * compression) silently have no effect.
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

  it('autoMemoryExtraction: false writes the session config override directly', () => {
    const config = applyAblationToggles(makeBaseConfig(), { autoMemoryExtraction: false });
    expect(config.autoMemoryExtraction).toBe(false);
  });

  it('compactLogging: false writes the session config override directly', () => {
    const config = applyAblationToggles(makeBaseConfig(), { compactLogging: false });
    expect(config.compactLogging).toBe(false);
  });

  it('memoryRecall: false writes the session config override directly', () => {
    const config = applyAblationToggles(makeBaseConfig(), { memoryRecall: false });
    expect(config.memoryRecall).toBe(false);
  });
});

// =============================================================================
// Marker population tests — verify the 4 skill/tool toggles (P1-A) get written
// into the marker. Enforcement is exercised by per-component unit tests.
// =============================================================================

describe('applyAblationToggles — skill/tool marker fields (P1-A)', () => {
  it('skillDiscovery: false sets marker.disableSkillDiscovery', () => {
    const config = applyAblationToggles(makeBaseConfig(), { skillDiscovery: false });
    const marker = extractAblationMarker(config.hooks)!;
    expect(marker.disableSkillDiscovery).toBe(true);
    expect(marker.disableSkillInjection).toBe(false);
    expect(marker.disableDynamicToolSets).toBe(false);
    expect(marker.toolInjectionMode).toBeUndefined();
  });

  it('skillInjection: false sets marker.disableSkillInjection', () => {
    const config = applyAblationToggles(makeBaseConfig(), { skillInjection: false });
    const marker = extractAblationMarker(config.hooks)!;
    expect(marker.disableSkillInjection).toBe(true);
    expect(marker.disableSkillDiscovery).toBe(false);
  });

  it('dynamicToolSets: false sets marker.disableDynamicToolSets', () => {
    const config = applyAblationToggles(makeBaseConfig(), { dynamicToolSets: false });
    const marker = extractAblationMarker(config.hooks)!;
    expect(marker.disableDynamicToolSets).toBe(true);
  });

  it('toolInjection: "always-only" threads through marker.toolInjectionMode', () => {
    const config = applyAblationToggles(makeBaseConfig(), { toolInjection: 'always-only' });
    const marker = extractAblationMarker(config.hooks)!;
    expect(marker.toolInjectionMode).toBe('always-only');
  });

  it('toolInjection: "always+dynamic" is also captured (not only the false-like value)', () => {
    const config = applyAblationToggles(makeBaseConfig(), { toolInjection: 'always+dynamic' });
    const marker = extractAblationMarker(config.hooks)!;
    expect(marker.toolInjectionMode).toBe('always+dynamic');
  });

  it('all 4 skill/tool toggles compose into a single marker', () => {
    const config = applyAblationToggles(makeBaseConfig(), {
      skillDiscovery: false,
      skillInjection: false,
      dynamicToolSets: false,
      toolInjection: 'always-only',
    });
    const marker = extractAblationMarker(config.hooks)!;
    expect(marker.disableSkillDiscovery).toBe(true);
    expect(marker.disableSkillInjection).toBe(true);
    expect(marker.disableDynamicToolSets).toBe(true);
    expect(marker.toolInjectionMode).toBe('always-only');
  });

  it('providerCardAutoEvolve: false sets marker.disableProviderCardAutoEvolve', () => {
    const config = applyAblationToggles(makeBaseConfig(), { providerCardAutoEvolve: false });
    const marker = extractAblationMarker(config.hooks)!;
    expect(marker.disableProviderCardAutoEvolve).toBe(true);
  });

  it('empty toggles yield a marker with all skill/tool flags off', () => {
    const config = applyAblationToggles(makeBaseConfig(), {});
    const marker = extractAblationMarker(config.hooks)!;
    expect(marker.disableSkillDiscovery).toBe(false);
    expect(marker.disableSkillInjection).toBe(false);
    expect(marker.disableDynamicToolSets).toBe(false);
    expect(marker.toolInjectionMode).toBeUndefined();
  });
});

describe('applyAblationToggles — Canvas narrative marker fields', () => {
  it('empty toggles expose default narrative Preview feature flags', () => {
    const config = applyAblationToggles(makeBaseConfig(), {});
    const marker = extractAblationMarker(config.hooks)!;

    expect(marker.narrative).toEqual({
      preview: true,
      typewriterEffect: true,
      autoExpressionMatch: true,
      showLockedChoices: true,
      previewAutoSync: true,
      live2dPerformance: false,
    });
  });

  it('normalizes all six narrative feature flags into the marker', () => {
    const config = applyAblationToggles(makeBaseConfig(), {
      narrative: {
        preview: false,
        typewriterEffect: false,
        autoExpressionMatch: false,
        showLockedChoices: false,
        previewAutoSync: false,
        live2dPerformance: true,
      },
    });
    const marker = extractAblationMarker(config.hooks)!;

    expect(marker.narrative).toEqual({
      preview: false,
      typewriterEffect: false,
      autoExpressionMatch: false,
      showLockedChoices: false,
      previewAutoSync: false,
      live2dPerformance: true,
    });
  });
});

describe('applyAblationToggles — Agent-first marker fields', () => {
  it('agentFirst.enabled: false disables all Agent-first marker fields and tool evidence policy', () => {
    const config = applyAblationToggles(makeBaseConfig(), {
      agentFirst: { enabled: false },
    });
    const marker = extractAblationMarker(config.hooks)!;

    expect(marker.disableAgentFirst).toBe(true);
    expect(marker.disableAgentFirstObservation).toBe(true);
    expect(marker.disableAgentFirstToolEvidence).toBe(true);
    expect(marker.disableAgentFirstRecoveryGuidance).toBe(true);
    expect(config.validationControlPolicy).toEqual({ toolEvidenceMode: 'off' });
  });

  it('agentFirst.toolEvidenceMode threads through validation control policy and marker', () => {
    const config = applyAblationToggles(makeBaseConfig(), {
      agentFirst: { toolEvidenceMode: 'required-for-low-confidence' },
    });
    const marker = extractAblationMarker(config.hooks)!;

    expect(marker.agentFirstToolEvidenceMode).toBe('required-for-low-confidence');
    expect(marker.disableAgentFirst).toBe(false);
    expect(config.validationControlPolicy).toEqual({
      toolEvidenceMode: 'required-for-low-confidence',
    });
  });

  it('agentFirst.toolEvidence: false disables tool evidence guidance without disabling observation', () => {
    const config = applyAblationToggles(makeBaseConfig(), {
      agentFirst: { toolEvidence: false },
    });
    const marker = extractAblationMarker(config.hooks)!;

    expect(marker.disableAgentFirst).toBe(false);
    expect(marker.disableAgentFirstObservation).toBe(false);
    expect(marker.disableAgentFirstToolEvidence).toBe(true);
    expect(config.validationControlPolicy).toEqual({ toolEvidenceMode: 'off' });
  });
});
