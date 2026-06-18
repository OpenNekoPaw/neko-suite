import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import type { IAssetClassifier } from '@neko/asset';
import { LLMClassifier } from './LLMClassifier';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

function createFallbackClassifier(): IAssetClassifier {
  return {
    analyze: vi.fn(async () => ({
      suggestedCategory: 'object',
      confidence: 0.5,
      detectedAttributes: {},
      description: 'Rule result',
      suggestedName: 'hero prop',
      suggestedTags: ['hero'],
    })),
    suggestVariantAttributes: vi.fn(async () => ({})),
    suggestTags: vi.fn(async () => []),
    findSimilarEntities: vi.fn(async () => []),
  };
}

describe('LLMClassifier provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks LLM classification results as non-degraded', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(
      JSON.stringify({
        category: 'character',
        name: 'Rin',
        description: 'Character portrait',
        tags: ['portrait'],
        attributes: {},
        confidence: 0.9,
      }),
    );
    const classifier = new LLMClassifier(createFallbackClassifier());

    const result = await classifier.analyze('/workspace/rin.png');

    expect(result.source).toBe('llm');
    expect(result.degraded).toBe(false);
  });

  it('marks fallback classifier results as degraded', async () => {
    vi.mocked(vscode.commands.executeCommand).mockRejectedValue(new Error('agent unavailable'));
    const fallback = createFallbackClassifier();
    const classifier = new LLMClassifier(fallback);

    const result = await classifier.analyze('/workspace/hero-prop.png');

    expect(result.source).toBe('fallback');
    expect(result.degraded).toBe(true);
    expect(fallback.analyze).toHaveBeenCalledWith('/workspace/hero-prop.png', undefined);
  });
});
