import { describe, expect, it } from 'vitest';
import {
  validateCompositeArtifact,
  type ArtifactProfileDescriptor,
  type CharacterObservation,
  type EntityMemoryContribution,
} from '@neko/shared';
import {
  buildCharacterMemoryReviewArtifact,
  buildEntityMemoryContribution,
  buildEntityMemoryContributionReviewArtifact,
} from '../character-memory-artifact';

const entityRef = { entityId: 'char-rin', entityKind: 'character' as const };
const characterMemoryArtifactProfile: ArtifactProfileDescriptor = {
  profileId: 'character-memory-artifact-review',
  protocol: 'CompositeArtifact',
  version: 1,
  source: 'skill-local',
  blockComposition: [
    { kind: 'text', required: true, minCount: 1 },
    { kind: 'table', required: true, minCount: 1 },
  ],
};
const characterMemoryReviewProfile: ArtifactProfileDescriptor = {
  profileId: 'character-memory-review',
  protocol: 'GenericTable',
  version: 1,
  source: 'skill-local',
  columns: [
    { columnId: 'observationId', cellType: 'string', required: true },
    { columnId: 'identity', cellType: 'string' },
    { columnId: 'reviewStatus', cellType: 'status', required: true },
    { columnId: 'dimensions', cellType: 'tags' },
    { columnId: 'traits', cellType: 'json' },
    { columnId: 'source', cellType: 'json' },
  ],
};
const entityMemoryContributionProfile: ArtifactProfileDescriptor = {
  profileId: 'entity-memory-contribution-review',
  protocol: 'CompositeArtifact',
  version: 1,
  source: 'skill-local',
  blockComposition: [
    { kind: 'text', required: true, minCount: 1 },
    { kind: 'table', required: false, minCount: 1 },
  ],
};
const mediaTextEvidenceProfile: ArtifactProfileDescriptor = {
  profileId: 'media-text-evidence-review',
  protocol: 'GenericTable',
  version: 1,
  source: 'skill-local',
  columns: [
    { columnId: 'segmentId', cellType: 'string', required: true },
    { columnId: 'kind', cellType: 'string', required: true },
    { columnId: 'text', cellType: 'string', required: true },
    { columnId: 'source', cellType: 'json' },
    { columnId: 'confidence', cellType: 'number' },
  ],
};

describe('buildCharacterMemoryReviewArtifact', () => {
  it('builds reviewable entity memory contributions from existing extraction output', () => {
    const contribution = buildEntityMemoryContribution({
      contributionId: 'contribution-page-1',
      sourcePackage: 'neko-agent',
      sourceRef: {
        kind: 'tool-result',
        toolCallId: 'readimage-current-result',
      },
      reviewPolicy: 'source-approved',
      characterObservations: [{ ...makeObservation(), reviewStatus: 'accepted' }],
      mediaTextSegments: [
        {
          segmentId: 'segment-p11-dialogue',
          kind: 'ocr',
          text: 'We have to go.',
          sourceRef: {
            kind: 'tool-result',
            toolCallId: 'readimage-current-result',
          },
          provenance: {
            providerId: 'ocr.local',
            sourceKind: 'comic',
          },
        },
      ],
    });

    expect(contribution.reviewPolicy).toBe('source-approved');
    expect(contribution.characterObservations?.[0]?.reviewStatus).toBe('needs-review');
  });

  it('projects draft observations and diagnostics into a review-only artifact', () => {
    const artifact = buildCharacterMemoryReviewArtifact({
      artifactId: 'character-memory-review-1',
      title: 'Character Memory Review',
      observations: [makeObservation()],
      diagnostics: [
        {
          severity: 'warning',
          code: 'missing-representation',
          path: ['participants', 0, 'voiceRepresentation'],
          message: 'Character char-rin is missing voice representation.',
          expected: 'voice',
          actual: 'char-rin',
        },
        {
          severity: 'error',
          code: 'invalid-dimension',
          path: ['observations', 0, 'dimensions', 0, 'dimension'],
          message: 'Character memory dimension must be known.',
          expected: 'appearance or neko.*',
          actual: 'apperance',
        },
      ],
      createdAt: '2026-06-06T00:00:00.000Z',
    });

    expect(
      validateCompositeArtifact(artifact, {
        persisted: true,
        profiles: [characterMemoryArtifactProfile, characterMemoryReviewProfile],
      }),
    ).toEqual({ ok: true, diagnostics: [] });
    expect(artifact.profile).toBe('character-memory-artifact-review');
    expect(artifact.blocks).toHaveLength(3);
    expect(artifact.diagnostics).toEqual([
      expect.objectContaining({
        code: 'missing-capability',
        message: expect.stringContaining('voice'),
      }),
      expect.objectContaining({
        code: 'invalid-profile',
        actual: 'apperance',
      }),
    ]);

    const tableBlock = artifact.blocks.find((block) => block.kind === 'table');
    expect(tableBlock?.kind).toBe('table');
    if (tableBlock?.kind !== 'table') return;
    expect(tableBlock.table.rows[0]).toMatchObject({
      rowId: 'obs-rin-panel-1',
      status: 'needs-review',
      cells: {
        identity: { type: 'string', value: 'char-rin' },
        reviewStatus: { type: 'status', value: 'draft' },
        source: {
          type: 'json',
          value: {
            source: 'comic',
            sourceRef: {
              kind: 'tool-result',
              toolCallId: 'readimage-current-result',
              assetIndex: 0,
              range: { panelId: 'P11' },
            },
            toolCallId: 'readimage-current-result',
          },
        },
      },
    });
    expect(tableBlock.table.rows[0]?.actions?.map((action) => action.metadata)).toEqual([
      expect.objectContaining({ reviewOperation: 'accept', delegatedLifecycle: true }),
      expect.objectContaining({ reviewOperation: 'reject', delegatedLifecycle: true }),
      expect.objectContaining({ reviewOperation: 'conflict', delegatedLifecycle: true }),
      expect.objectContaining({ reviewOperation: 'supersede', delegatedLifecycle: true }),
    ]);
  });

  it('projects entity memory contributions without auto-confirming source-approved evidence', () => {
    const contribution: EntityMemoryContribution = {
      contributionId: 'contribution-page-1',
      sourcePackage: 'neko-agent',
      sourceRef: {
        kind: 'tool-result',
        toolCallId: 'readimage-current-result',
      },
      reviewPolicy: 'source-approved',
      characterObservations: [makeObservation()],
      mediaTextSegments: [
        {
          segmentId: 'segment-p11-dialogue',
          kind: 'ocr',
          text: 'We have to go.',
          sourceRef: {
            kind: 'tool-result',
            toolCallId: 'readimage-current-result',
            assetIndex: 0,
            range: { panelId: 'P11' },
          },
          provenance: {
            providerId: 'ocr.local',
            sourceKind: 'comic',
            toolCallId: 'readimage-current-result',
          },
          confidence: 0.82,
        },
      ],
      diagnostics: [
        {
          severity: 'info',
          code: 'source-approved-fast-review',
          message: 'Source package marked this contribution for fast review.',
        },
      ],
    };

    const artifact = buildEntityMemoryContributionReviewArtifact({
      artifactId: 'entity-memory-contribution-1',
      title: 'Entity Memory Contribution',
      contribution,
    });

    expect(
      validateCompositeArtifact(artifact, {
        persisted: true,
        profiles: [
          entityMemoryContributionProfile,
          characterMemoryReviewProfile,
          mediaTextEvidenceProfile,
        ],
      }),
    ).toEqual({ ok: true, diagnostics: [] });
    expect(artifact.profile).toBe('entity-memory-contribution-review');
    expect(artifact.extensions?.['neko.entityMemoryContributionPayload']).toEqual(contribution);
    expect(artifact.blocks[0]).toMatchObject({
      kind: 'text',
      text: expect.stringContaining('does not confirm facts automatically'),
    });
    expect(artifact.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-required-field',
        details: {
          contributionDiagnosticCode: 'source-approved-fast-review',
        },
      }),
    ]);

    const observationBlock = artifact.blocks.find(
      (block) => block.kind === 'table' && block.table.profile === 'character-memory-review',
    );
    expect(observationBlock?.kind).toBe('table');
    if (observationBlock?.kind !== 'table') return;
    expect(observationBlock.table.rows[0]?.cells['reviewStatus']).toEqual({
      type: 'status',
      value: 'draft',
    });
    expect(observationBlock.table.rows[0]?.actions?.map((action) => action.kind)).toEqual([
      'review',
      'review',
      'review',
      'review',
    ]);
  });
});

function makeObservation(): CharacterObservation {
  return {
    observationId: 'obs-rin-panel-1',
    sourceRef: {
      kind: 'tool-result',
      toolCallId: 'readimage-current-result',
      assetIndex: 0,
      range: { panelId: 'P11' },
    },
    provenance: {
      source: 'comic',
      toolCallId: 'readimage-current-result',
      observedAt: '2026-06-06T00:00:00.000Z',
    },
    reviewStatus: 'draft',
    entityRef,
    dimensions: [
      {
        dimension: 'appearance',
        value: 'Short dark hair and hooded jacket',
        confidence: 0.8,
      },
      {
        dimension: 'voice',
        value: { delivery: 'urgent' },
        confidence: 0.6,
      },
    ],
    confidence: 0.75,
  };
}
