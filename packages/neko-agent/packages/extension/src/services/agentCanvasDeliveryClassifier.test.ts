import { describe, expect, it } from 'vitest';
import { classifyAgentCanvasDelivery } from './agentCanvasDeliveryClassifier';

const resourceRef = { id: 'generated:image:1' } as never;

describe('classifyAgentCanvasDelivery', () => {
  it('selects creator-useful Markdown and reviewable generated media', () => {
    expect(
      classifyAgentCanvasDelivery({
        kind: 'markdown',
        artifactId: 'artifact:markdown',
        title: 'Storyboard Notes',
        markdown: '# Notes',
        creatorUseful: true,
      }),
    ).toMatchObject({ eligible: true, artifact: { kind: 'markdown' } });
    expect(
      classifyAgentCanvasDelivery({
        kind: 'generated-output',
        artifactId: 'artifact:image',
        title: 'Variant',
        mediaKind: 'image',
        reviewable: true,
        resourceRef,
      }),
    ).toMatchObject({ eligible: true, artifact: { kind: 'image', resourceRef } });
  });

  it.each([
    'ordinary-prose',
    'reasoning',
    'log',
    'scratch',
    'unselected-search-result',
    'runtime-handle',
    'failed-result',
  ] as const)('excludes %s', (kind) => {
    expect(classifyAgentCanvasDelivery({ kind })).toEqual({
      eligible: false,
      reason: 'not-creator-content',
    });
  });

  it('excludes unselected refs, non-reviewable variants, and missing stable refs', () => {
    expect(
      classifyAgentCanvasDelivery({
        kind: 'selected-reference',
        artifactId: 'reference:1',
        title: 'Reference',
        selected: false,
        resourceRef,
      }),
    ).toEqual({ eligible: false, reason: 'not-selected' });
    expect(
      classifyAgentCanvasDelivery({
        kind: 'generated-output',
        artifactId: 'image:1',
        title: 'Candidate',
        mediaKind: 'image',
        reviewable: false,
        resourceRef,
      }),
    ).toEqual({ eligible: false, reason: 'not-reviewable' });
    expect(
      classifyAgentCanvasDelivery({
        kind: 'generated-output',
        artifactId: 'image:2',
        title: 'Candidate',
        mediaKind: 'image',
        reviewable: true,
      }),
    ).toEqual({ eligible: false, reason: 'missing-stable-reference' });
  });
});
