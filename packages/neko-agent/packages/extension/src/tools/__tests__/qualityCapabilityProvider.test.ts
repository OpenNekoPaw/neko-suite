import { describe, expect, it, vi } from 'vitest';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  TOOL_NAMES_QUALITY,
  type AgentCapabilityContext,
  type ResourceRef,
} from '@neko/shared';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import { createQualityCapabilityProvider } from '../qualityCapabilityProvider';

const resourceRef: ResourceRef = {
  id: 'asset:image:cat',
  scope: 'project',
  provider: 'project',
  kind: 'media',
  source: { kind: 'file', projectRelativePath: 'neko/generated/image/cat.png' },
  fingerprint: { strategy: 'hash', value: 'sha256:cat-v1' },
};

const context: AgentCapabilityContext = { extensionContext: {} };

function contentAccessRuntime(
  loadProviderAsset: AgentContentAccessRuntime['loadProviderAsset'],
): AgentContentAccessRuntime {
  return {
    resolve: vi.fn(),
    resolveImageMetadata: vi.fn(),
    resolveDocumentContent: vi.fn(),
    loadProviderAsset,
    projectResource: vi.fn(),
  };
}

function target() {
  return {
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    targetId: 'asset-cat',
    kind: 'image',
    resourceRef,
    revision: 'rev-1',
    contentDigest: 'sha256:cat-v1',
    expectedIntent: { prompt: 'A playful orange cat.' },
  };
}

describe('QualityCapabilityProvider', () => {
  it('routes image review through the configured image understanding model and stable ref materializer', async () => {
    const chat = vi.fn().mockResolvedValue({
      message: {
        content: JSON.stringify({
          score: 91,
          issues: [
            {
              category: 'composition',
              severity: 'warning',
              message: 'The subject is slightly centered.',
            },
          ],
        }),
      },
    });
    const loadProviderAsset = vi.fn().mockResolvedValue({
      status: 'ready',
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      diagnostics: [],
    });
    const resolveModelForPurpose = vi.fn().mockReturnValue({
      providerId: 'google',
      modelId: 'gemini-image-review',
    });
    const provider = createQualityCapabilityProvider({
      createService: () => ({ chat }),
      getContentAccessRuntime: () => contentAccessRuntime(loadProviderAsset),
      resolveModelForPurpose,
    });
    const tool = provider
      .getTools(context)
      .find((candidate) => candidate.name === TOOL_NAMES_QUALITY.QUALITY_CHECK);

    const result = await tool?.execute({ target: target() });

    expect(result).toMatchObject({
      success: true,
      data: {
        verdict: 'pass',
        target: { targetId: 'asset-cat', resourceRef },
        missingEvaluatorClasses: [],
      },
    });
    expect(resolveModelForPurpose).toHaveBeenCalledWith('image.understand');
    expect(loadProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'quality-review',
        source: resourceRef,
        preferredTarget: 'bytes',
      }),
    );
    expect(chat).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
      expect.objectContaining({ providerId: 'google', modelId: 'gemini-image-review' }),
    );
  });

  it('returns manual-review instead of fabricating perception success when no model is configured', async () => {
    const provider = createQualityCapabilityProvider({
      createService: vi.fn(),
      getContentAccessRuntime: vi.fn(),
      resolveModelForPurpose: vi.fn().mockReturnValue(undefined),
    });
    const tool = provider
      .getTools(context)
      .find((candidate) => candidate.name === TOOL_NAMES_QUALITY.QUALITY_CHECK);

    await expect(tool?.execute({ target: target() })).resolves.toMatchObject({
      success: true,
      data: {
        verdict: 'manual-review',
        missingEvaluatorClasses: ['perception'],
      },
    });
  });

  it('never invokes content access for a path-only legacy request', async () => {
    const loadProviderAsset = vi.fn();
    const provider = createQualityCapabilityProvider({
      createService: vi.fn(),
      getContentAccessRuntime: () => contentAccessRuntime(loadProviderAsset),
      resolveModelForPurpose: vi.fn(),
    });
    const tool = provider
      .getTools(context)
      .find((candidate) => candidate.name === TOOL_NAMES_QUALITY.QUALITY_CHECK);

    await expect(tool?.execute({ target: target(), mediaPath: '/tmp/cat.png' })).rejects.toThrow(
      'legacy-path-target-rejected',
    );
    expect(loadProviderAsset).not.toHaveBeenCalled();
  });
});
