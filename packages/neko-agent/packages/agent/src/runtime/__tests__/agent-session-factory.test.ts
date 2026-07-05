import { describe, expect, it } from 'vitest';
import type { ProviderCard } from '@neko/shared';
import { createProviderCardRegistry } from '../../provider';
import { resolveAgentRuntimePromptFragments } from '../session/agent-session-factory';

function createProviderCard(): ProviderCard {
  return {
    providerId: 'flux',
    displayName: 'Flux.1',
    version: '1.0.0',
    capabilities: ['image.generate'],
    sourceLayer: 'builtin',
    syntaxProfile: {
      supportsNegativePrompt: false,
      notes: [],
    },
    conceptCoverage: {
      entries: [{ concept: 'cluttercore', status: 'unknown' }],
    },
    trainingProfile: {
      styleAffinities: { photorealistic: 3 },
      antiBiasStrategies: [],
    },
  };
}

describe('resolveAgentRuntimePromptFragments', () => {
  it('passes runtime locale to provider expression fragments', () => {
    const fragments = resolveAgentRuntimePromptFragments({
      locale: 'zh',
      capabilityRuntime: {
        providerCardRegistry: createProviderCardRegistry([createProviderCard()]),
      },
    });

    expect(fragments).toEqual([
      expect.objectContaining({
        id: 'provider:expression-context',
        content: expect.stringContaining('## 供应方表达上下文'),
      }),
    ]);
    expect(fragments?.[0]?.content).not.toContain('## Provider Expression Context');
  });
});
