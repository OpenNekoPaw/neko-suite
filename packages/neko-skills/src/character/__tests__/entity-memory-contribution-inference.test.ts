import { describe, expect, it } from 'vitest';
import { isEntityMemoryContribution } from '@neko/shared';
import {
  findProjectedEntityMemoryContribution,
  inferEntityMemoryContributionFromCharacterAnalysis,
  maybeAttachInferredEntityMemoryContribution,
} from '../entity-memory-contribution-inference';

describe('entity memory contribution inference', () => {
  it('builds a reviewable contribution from character analysis Markdown tables', () => {
    const contribution = inferEntityMemoryContributionFromCharacterAnalysis({
      template: 'storyboard-table',
      title: 'Opening',
      sections: [
        {
          heading: '主要角色观察',
          content: [
            '| 角色 | 当前证据支撑的观察 |',
            '| --- | --- |',
            '| 瑞德 | 红色围巾，面对门口时显得犹豫。 |',
            '| 众人 | 背景里围观，没有单一身份。 |',
          ].join('\n'),
        },
      ],
    });

    expect(isEntityMemoryContribution(contribution)).toBe(true);
    expect(contribution).toMatchObject({
      contributionId: 'character-analysis-opening',
      sourcePackage: 'neko-agent',
      sourceRef: { kind: 'manual', label: 'Agent character analysis: Opening' },
      reviewPolicy: 'requires-user-review',
      metadata: {
        inferredFrom: 'character-analysis-table',
        source: 'agent-runtime-composite-projection',
        rowCount: 2,
      },
      entityCandidates: [
        {
          id: 'candidate-character-analysis-mzi-iwn',
          kind: 'character',
          name: '瑞德',
          status: 'open',
          identityBasis: 'user-named',
          confidence: 0.62,
        },
      ],
      characterObservations: [
        {
          observationId: 'obs-character-analysis-mzi-iwn-1',
          reviewStatus: 'needs-review',
          candidateId: 'candidate-character-analysis-mzi-iwn',
          dimensions: [
            {
              dimension: 'appearance',
              value: '红色围巾，面对门口时显得犹豫。',
              confidence: 0.62,
            },
          ],
        },
      ],
      diagnostics: [
        {
          severity: 'warning',
          code: 'character-analysis-row-not-entity',
          details: { name: '众人', heading: '主要角色观察' },
        },
      ],
    });
  });

  it('keeps existing runtime or domain contribution projections intact', () => {
    const explicitContribution = {
      contributionId: 'explicit-contribution',
      sourcePackage: 'neko-agent',
      sourceRef: { kind: 'manual', label: 'explicit payload' },
      reviewPolicy: 'requires-user-review',
      metadata: { source: 'upstream' },
    };

    const composite = maybeAttachInferredEntityMemoryContribution({
      template: 'storyboard-table',
      title: 'Opening',
      extensions: {
        'neko.entityMemoryContributionPayload': explicitContribution,
      },
      sections: [
        {
          heading: '主要角色观察',
          content: ['| 角色 | 观察 |', '| --- | --- |', '| 瑞德 | 红色围巾。 |'].join('\n'),
        },
      ],
    });

    expect(findProjectedEntityMemoryContribution(composite)).toEqual(explicitContribution);
    expect(composite.extensions?.['neko.entityMemoryContributionPayload']).toEqual(
      explicitContribution,
    );
  });
});
