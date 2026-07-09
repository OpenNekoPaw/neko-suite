import { describe, expect, it } from 'vitest';
import {
  COMIC_SHOT_ASSET_PREP_PROFILE,
  validateCompositeArtifact,
  type ArtifactProfileDescriptor,
  type ShotImagePrepPlan,
  type StoryboardMediaRef,
  type StoryboardTable,
} from '@neko/shared';
import {
  buildShotImagePrepReviewArtifact,
  buildStoryboardShotImagePrepReviewArtifact,
} from '../shot-image-prep-artifact';

const prepArtifactProfile: ArtifactProfileDescriptor = {
  profileId: 'comic-shot-image-prep-review',
  kind: 'artifact',
  protocol: 'CompositeArtifact',
  version: 1,
  source: 'package',
  blockComposition: [
    { kind: 'text', required: true, minCount: 1 },
    { kind: 'table', required: true, minCount: 1 },
  ],
};

describe('shot image prep artifact projection', () => {
  it('derives storyboard prep plans into a reviewable composite artifact', () => {
    const result = buildStoryboardShotImagePrepReviewArtifact({
      artifactId: 'prep-artifact-1',
      title: 'Comic Shot Prep',
      table: storyboardTable(),
      storyboardId: 'storyboard-1',
      requirePerceptionForSourceBacked: true,
      createdAt: '2026-06-07T00:00:00.000Z',
    });

    expect(result.plans).toHaveLength(2);
    expect(result.plans[0]).toMatchObject({
      storyboardId: 'storyboard-1',
      sceneId: 'scene-1',
      shotId: 'shot-transform',
      imageStrategy: 'transform-original',
      operationPlan: ['crop-panel', 'remove-text', 'inpaint'],
      perceptionCardRefs: [{ assetId: 'asset-panel-1', cacheKey: 'panel-v1' }],
    });
    expect(result.plans[1]).toMatchObject({
      shotId: 'shot-generate',
      imageStrategy: 'generate-new',
      operationPlan: ['generate-keyframe'],
      sourceMediaRefs: [],
    });
    expect(
      validateCompositeArtifact(result.artifact, {
        persisted: true,
        profiles: [prepArtifactProfile, COMIC_SHOT_ASSET_PREP_PROFILE],
        resolvedSchemaRefs: [
          'neko.shot-image-prep.image-audit',
          'neko.shot-image-prep.mask-refs',
          'neko.shot-image-prep.reference-bundle',
        ],
      }),
    ).toEqual({ ok: true, diagnostics: [] });
    expect(result.artifact.extensions?.['neko.shotImagePrep']).toEqual({
      storyboardId: 'storyboard-1',
      planIds: ['shot-transform-image-prep', 'shot-generate-image-prep'],
      planCount: 2,
    });
  });

  it('keeps provider unavailable diagnostics visible without fabricating outputs', () => {
    const result = buildStoryboardShotImagePrepReviewArtifact({
      artifactId: 'prep-artifact-transform',
      title: 'Transform Prep',
      table: storyboardTable({ onlyTransform: true }),
      providerDiagnostics: [
        {
          severity: 'warning',
          code: 'provider-unavailable',
          path: ['availableTools', 'TransformImage'],
          message: 'TransformImage provider is unavailable.',
        },
      ],
    });

    expect(result.plans[0]?.outputMediaRefs).toBeUndefined();
    expect(result.artifact.diagnostics).toEqual([
      expect.objectContaining({
        code: 'provider-unavailable',
        message: expect.stringContaining('TransformImage'),
      }),
    ]);
    const tableBlock = result.artifact.blocks.find((block) => block.kind === 'table');
    expect(tableBlock?.kind).toBe('table');
    if (tableBlock?.kind !== 'table') return;
    expect(tableBlock.table.rows[0]?.cells['output']).toBeUndefined();
  });

  it('projects failed prep plans without fake generated refs', () => {
    const artifact = buildShotImagePrepReviewArtifact({
      artifactId: 'prep-artifact-failed',
      title: 'Failed Prep',
      plans: [
        makePlan({
          status: 'failed',
          diagnostics: [
            {
              severity: 'warning',
              code: 'provider-unavailable',
              path: ['providerId'],
              message: 'Provider failed before producing stable refs.',
            },
          ],
        }),
      ],
    });

    const tableBlock = artifact.blocks.find((block) => block.kind === 'table');
    expect(tableBlock?.kind).toBe('table');
    if (tableBlock?.kind !== 'table') return;
    expect(tableBlock.table.rows[0]?.cells['status']).toEqual({
      type: 'status',
      value: 'failed',
    });
    expect(tableBlock.table.rows[0]?.cells['output']).toBeUndefined();
  });
});

function storyboardTable(options: { readonly onlyTransform?: boolean } = {}): StoryboardTable {
  const transformShot: StoryboardTable['scenes'][number]['shots'][number] = {
    shotId: 'shot-transform',
    shotNumber: 1,
    duration: 3,
    visualDescription: 'Clean and colorize the source panel.',
    characterAction: 'Rin turns back.',
    imageStrategy: 'transform-original',
    sourceMediaRefs: [sourceRef],
    generationPrompt: 'clean anime keyframe',
    characters: [
      {
        name: 'Rin',
        entityRef: { entityId: 'char-rin', entityKind: 'character' },
      },
    ],
    extensions: {
      'neko.perception': {
        perceptionCardRefs: [{ assetId: 'asset-panel-1', cacheKey: 'panel-v1' }],
      },
    },
  };
  return {
    schemaVersion: 1,
    kind: 'storyboard-table',
    title: 'Comic Storyboard',
    scenes: [
      {
        sceneId: 'scene-1',
        sceneTitle: 'Scene',
        shots: options.onlyTransform
          ? [transformShot]
          : [
              transformShot,
              {
                shotId: 'shot-generate',
                shotNumber: 2,
                duration: 2,
                visualDescription: 'A new establishing shot.',
                characterAction: 'The city appears.',
                imageStrategy: 'generate-new',
                generationPrompt: 'wide city establishing shot',
              },
            ],
      },
    ],
  };
}

function makePlan(overrides: Partial<ShotImagePrepPlan> = {}): ShotImagePrepPlan {
  return {
    schemaVersion: 1,
    kind: 'shot-image-prep-plan',
    planId: 'shot-1-image-prep',
    sceneId: 'scene-1',
    shotId: 'shot-1',
    sourceMediaRefs: [sourceRef],
    imageStrategy: 'transform-original',
    operationPlan: ['crop-panel', 'remove-text', 'inpaint'],
    status: 'planned',
    ...overrides,
  };
}

const sourceRef: StoryboardMediaRef = {
  refId: 'source-panel-1',
  role: 'source',
  locator: {
    type: 'tool-result',
    toolCallId: 'read-comic',
    assetIndex: 0,
  },
  label: 'Panel 1',
  mimeType: 'image/png',
};
