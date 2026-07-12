import { describe, expect, it } from 'vitest';
import type { ProviderCard, ProviderExpressionProfileDescriptor } from '@neko/shared';
import { ProviderExpressionProfileRegistry } from '../../profile';
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
      promptLocale: 'zh-cn',
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

  it('projects selected provider expression profiles during prompt fragment assembly', () => {
    const registry = new ProviderExpressionProfileRegistry();
    registry.register(createProviderExpressionProfile());

    const fragments = resolveAgentRuntimePromptFragments({
      promptLocale: 'en',
      providerExpressionTargets: [
        {
          capability: 'image.generate',
          providerId: 'flux',
          modelId: 'flux-pro',
          providerExpressionProfileId: 'provider-expression:flux:flux-pro',
        },
      ],
      capabilityRuntime: {
        providerCardRegistry: createProviderCardRegistry([createProviderCard()]),
        providerExpressionProfileRegistry: registry,
      },
    });

    expect(fragments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'provider:expression-profile:provider-expression:flux:flux-pro:image.generate',
          content: expect.stringContaining(
            'Provider expression profile resolved: provider-expression:flux:flux-pro@1.0.0.',
          ),
        }),
      ]),
    );
  });

  it('emits diagnostic fragments for missing provider expression profile references', () => {
    const fragments = resolveAgentRuntimePromptFragments({
      promptLocale: 'en',
      providerExpressionTargets: [
        {
          capability: 'image.generate',
          providerId: 'flux',
          modelId: 'flux-pro',
          providerExpressionProfileId: 'provider-expression:missing',
        },
      ],
      capabilityRuntime: {
        providerCardRegistry: createProviderCardRegistry([createProviderCard()]),
        providerExpressionProfileRegistry: new ProviderExpressionProfileRegistry(),
      },
    });

    expect(fragments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'provider:expression-profile:diagnostic:provider-expression:missing',
          content: expect.stringContaining('Reason: missing-profile-descriptor.'),
        }),
      ]),
    );
  });

  it('emits diagnostic fragments for incompatible provider expression profile references', () => {
    const registry = new ProviderExpressionProfileRegistry();
    registry.register(createProviderExpressionProfile());

    const fragments = resolveAgentRuntimePromptFragments({
      promptLocale: 'en',
      providerExpressionTargets: [
        {
          capability: 'image.generate',
          providerId: 'runway',
          modelId: 'gen-4',
          providerExpressionProfileId: 'provider-expression:flux:flux-pro',
        },
      ],
      capabilityRuntime: {
        providerExpressionProfileRegistry: registry,
      },
    });

    expect(fragments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'provider:expression-profile:diagnostic:provider-expression:flux:flux-pro',
          content: expect.stringContaining('Reason: incompatible-profile-target.'),
        }),
      ]),
    );
  });
});

function createProviderExpressionProfile(): ProviderExpressionProfileDescriptor {
  return {
    profileId: 'provider-expression:flux:flux-pro',
    kind: 'provider-expression',
    source: 'package',
    providerId: 'flux',
    modelId: 'flux-pro',
    displayName: 'Flux Pro',
    version: '1.0.0',
    sourceLayer: 'market',
    capabilities: ['image.generate'],
    syntaxProfile: { notes: ['Prefer concise visual prompts.'] },
    conceptCoverage: { entries: [] },
    trainingProfile: { styleAffinities: { photorealistic: 3 }, antiBiasStrategies: [] },
  };
}
