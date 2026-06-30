import { describe, expect, it } from 'vitest';
import {
  isEntityMemoryContribution,
  projectCompositeArtifactToCutStoryboardPayload,
  validateCompositeArtifact,
  type ArtifactProfileDescriptor,
  type CompositeArtifact,
  type CompositeArtifactBlock,
  type CompositeArtifactDomainBlock,
} from '@neko/shared';
import { createAgentCapabilityInjectionRuntime } from '../../../runtime/agent-capability-injection-runtime';
import sampleArtifact from '../samples/comic-to-animation-composite-artifact.json';

const profileDescriptors: readonly ArtifactProfileDescriptor[] = [
  {
    profileId: 'comic-to-animation-plan',
    protocol: 'CompositeArtifact',
    version: 1,
    source: 'skill-local',
    blockComposition: [
      { kind: 'gallery', required: true, minCount: 1 },
      { kind: 'table', required: true, minCount: 1 },
      { kind: 'diagnostic', required: true, minCount: 1 },
    ],
  },
  {
    profileId: 'comic-shot-asset-prep',
    protocol: 'GenericTable',
    version: 1,
    source: 'skill-local',
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
  },
];

describe('comic-to-animation composite artifact sample', () => {
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

  it('keeps suggested execution actions unavailable without provider registration', () => {
    const runtime = createAgentCapabilityInjectionRuntime();

    runtime.register({
      identity: {
        id: 'skill:comic-to-animation',
        source: 'builtin',
        sourceId: 'comic-to-animation',
        trustLevel: 'core',
      },
      metadata: {
        mediaWorkflow: {
          producedArtifacts: ['CompositeArtifact', 'GenericTable'],
          artifactProfiles: ['comic-shot-asset-prep', 'comic-to-animation-plan'],
          referencedCapabilities: ['canvas.ingestMarkdown', 'cut.importStoryboard'],
        },
      },
    });

    expect(
      runtime
        .getArtifactFacets()
        .lifecycleCapabilities?.find(
          (capability) => capability.capabilityId === 'canvas.ingestMarkdown',
        ),
    ).toBeUndefined();
    expect(sampleArtifact.suggestedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: 'canvas.ingestMarkdown',
          disabled: true,
          disabledReason: 'Provider unavailable',
        }),
      ]),
    );
  });

  it('projects the reviewed storyboard domain block for Cut while Canvas uses lifecycle review', () => {
    const runtime = createAgentCapabilityInjectionRuntime();
    runtime.registerMany([
      {
        identity: {
          id: 'provider:canvas',
          source: 'provider',
          sourceId: 'neko-canvas',
          trustLevel: 'core',
        },
        artifactFacets: {
          lifecycleCapabilities: [
            {
              capabilityId: 'canvas.ingestMarkdown',
              providerId: 'neko-canvas',
              displayName: 'Ingest Markdown into Canvas',
              description: 'Create a Canvas Markdown note, generic table, or creative table.',
              phases: ['review'],
              inputSchema: { id: 'canvas.markdown.input', version: 1 },
              resultSchema: { id: 'agent.capability.lifecycle.result', version: 1 },
              accepts: ['markdown', 'gfm-table'],
              produces: ['canvas.table', 'canvas.storyboard'],
              risk: 'medium',
              requiresApproval: true,
              safetyKind: 'confirmation-gated',
            },
          ],
        },
      },
      {
        identity: {
          id: 'provider:cut',
          source: 'provider',
          sourceId: 'neko-cut',
          trustLevel: 'core',
        },
        artifactFacets: {
          projectors: [
            {
              id: 'projector:storyboard-to-cut',
              accepts: ['StoryboardTable'],
              produces: ['CutStoryboardImportPayload'],
              profiles: ['manga-to-video'],
              lazy: true,
            },
          ],
          capabilities: [
            {
              capabilityId: 'cut.importStoryboard',
              packageId: 'neko-cut',
              accepts: ['CutStoryboardImportPayload'],
              produces: ['timeline-element-ref'],
              actions: ['cut.importStoryboard'],
              risk: 'medium',
              requiresApproval: true,
            },
          ],
        },
      },
    ]);

    expect(
      runtime
        .getArtifactFacets()
        .lifecycleCapabilities?.find(
          (capability) => capability.capabilityId === 'canvas.ingestMarkdown',
        ),
    ).toBeDefined();
    expect(runtime.findArtifactCapabilities('cut.importStoryboard')).toHaveLength(1);

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
