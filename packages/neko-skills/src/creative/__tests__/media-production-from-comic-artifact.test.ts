import { describe, expect, it } from 'vitest';
import {
  isEntityMemoryContribution,
  MEDIA_PRODUCTION_ANIMATION_PLAN_PROFILE_ID,
  MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID,
  projectCompositeArtifactToCutStoryboardPayload,
  validateCompositeArtifact,
  type ArtifactProfileDescriptor,
  type CompositeArtifact,
  type CompositeArtifactBlock,
  type CompositeArtifactDomainBlock,
} from '@neko/shared';
import sampleArtifact from '../__fixtures__/media-production-from-comic-artifact.json';

const profileDescriptors: readonly ArtifactProfileDescriptor[] = [
  {
    profileId: MEDIA_PRODUCTION_ANIMATION_PLAN_PROFILE_ID,
    kind: 'artifact',
    protocol: 'CompositeArtifact',
    version: 1,
    source: 'package',
    blockComposition: [
      { kind: 'gallery', required: true, minCount: 1 },
      { kind: 'table', required: true, minCount: 1 },
      { kind: 'diagnostic', required: true, minCount: 1 },
    ],
  },
  {
    profileId: MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID,
    kind: 'artifact',
    protocol: 'GenericTable',
    version: 1,
    source: 'package',
    fieldDefinitions: [
      { columnId: 'shotId', cellType: 'string', required: true },
      {
        columnId: 'sourcePanel',
        cellType: 'media-preview',
        required: true,
        resourceMediaTypes: ['image'],
      },
      {
        columnId: 'motionPlan',
        cellType: 'json',
        required: false,
        schemaRef: 'neko.motion-plan.v1',
      },
    ],
    fieldGroups: [
      { groupId: 'shot-core', fieldIds: ['shotId', 'sourcePanel'] },
      { groupId: 'generation-prep', fieldIds: ['motionPlan'] },
    ],
    includeFieldGroups: ['shot-core', 'generation-prep'],
    columns: [
      {
        columnId: 'motionPlan',
        cellType: 'json',
        required: true,
        schemaRef: 'neko.motion-plan.v1',
        shape: {
          requiredKeys: ['layer', 'durationMs', 'assetRef'],
          fieldTypes: { layer: 'string', durationMs: 'number', assetRef: 'string' },
        },
      },
    ],
  },
  {
    profileId: 'character-memory-review',
    kind: 'artifact',
    protocol: 'GenericTable',
    version: 1,
    source: 'package',
    columns: [
      { columnId: 'observationId', cellType: 'string', required: true },
      { columnId: 'identity', cellType: 'string' },
      { columnId: 'reviewStatus', cellType: 'status', required: true },
      { columnId: 'dimensions', cellType: 'tags' },
      { columnId: 'traits', cellType: 'json' },
      { columnId: 'source', cellType: 'json' },
    ],
  },
];

describe('media-production/from-comic composite artifact sample', () => {
  it('validates the review-only sample with Skill-local profile descriptors', () => {
    const result = validateCompositeArtifact(sampleArtifact, {
      profiles: profileDescriptors,
      persisted: true,
      resolvedSchemaRefs: ['neko.motion-plan.v1'],
    });

    expect(result).toEqual({ ok: true, diagnostics: [] });
  });

  it('keeps machine-readable entity contribution mapped to storyboard characters', () => {
    const artifact = sampleArtifact as CompositeArtifact;
    const contribution = artifact.extensions?.['neko.entityMemoryContributionPayload'];

    expect(isEntityMemoryContribution(contribution)).toBe(true);
    if (!isEntityMemoryContribution(contribution)) return;

    const storyboardBlock = artifact.blocks.find(isStoryboardTableDomainBlock);
    expect(storyboardBlock).toBeDefined();
    const storyboardPayload = storyboardBlock?.payload;
    expect(isStoryboardTablePayload(storyboardPayload)).toBe(true);
    if (!isStoryboardTablePayload(storyboardPayload)) return;
    const storyboardCharacter = storyboardPayload.scenes[0]?.shots?.[0]?.characters?.[0];

    expect(storyboardCharacter).toMatchObject({
      characterId: 'char-rin',
      name: 'Rin',
    });
    expect(contribution.entityCandidates?.[0]).toMatchObject({
      id: 'candidate-char-rin',
      identityBasis: 'user-named',
      metadata: expect.objectContaining({
        storyboardCharacterId: 'char-rin',
        characterId: 'char-rin',
      }),
    });
    expect(contribution.characterObservations?.[0]).toMatchObject({
      candidateId: 'candidate-char-rin',
      provenance: {
        metadata: expect.objectContaining({
          storyboardCharacterId: 'char-rin',
          shotId: 'shot-1',
          shotNumber: 1,
          characterIndex: 0,
        }),
      },
      extensions: {
        'neko.storyboardEntityMapping': expect.objectContaining({
          storyboardCharacterId: 'char-rin',
          shotId: 'shot-1',
        }),
      },
    });
  });

  it('keeps provider-dependent suggested execution actions disabled in the review sample', () => {
    expect(sampleArtifact.suggestedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: 'canvas.authoring',
          disabled: true,
          disabledReason: 'Provider unavailable',
        }),
      ]),
    );
  });

  it('projects the reviewed storyboard domain block for Cut payload import', () => {
    const artifact = sampleArtifact as CompositeArtifact;
    const cutProjection = projectCompositeArtifactToCutStoryboardPayload({
      artifact,
      options: {
        resolveImagePath: () => '${WORKSPACE}/comic/panel-1.png',
      },
    });

    expect(cutProjection.diagnostics).toEqual([]);
    expect(cutProjection.payload?.shots[0]).toMatchObject({
      id: 'shot-1',
      imagePath: '${WORKSPACE}/comic/panel-1.png',
      voiceCues: [
        expect.objectContaining({
          cueId: 'shot-1-dialogue-1',
          speakerName: 'Rin',
          speakerCharacterId: 'char-rin',
        }),
      ],
    });
  });
});

function isStoryboardTableDomainBlock(
  block: CompositeArtifactBlock,
): block is CompositeArtifactDomainBlock {
  return block.kind === 'domain' && block.domainKind === 'StoryboardTable';
}

function isStoryboardTablePayload(value: unknown): value is {
  readonly scenes: readonly {
    readonly shots?: readonly {
      readonly characters?: readonly {
        readonly characterId?: string;
        readonly name?: string;
      }[];
    }[];
  }[];
} {
  if (!isRecord(value) || !Array.isArray(value['scenes'])) return false;
  return true;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
