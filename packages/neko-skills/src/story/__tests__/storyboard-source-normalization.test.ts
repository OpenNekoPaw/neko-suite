import { describe, expect, it, vi } from 'vitest';
import {
  normalizeStoryboardSource,
  type StoryboardComicPerceptionPort,
  type StoryboardDocumentExtractionPort,
  type StoryboardStoryPlanningPort,
} from '../storyboard-source-normalization';
import type {
  DocumentArchiveResourceRef,
  NekoStoryScriptIndex,
  ResourceRef,
  StoryScenePlan,
  StoryboardTable,
} from '@neko/shared';

const NOW = '2026-07-11T00:00:00.000Z';

function resource(id: string, kind: ResourceRef['kind'] = 'media'): ResourceRef {
  return {
    id,
    scope: 'project',
    provider: 'fixture',
    kind,
    source: {
      kind:
        kind === 'generated'
          ? 'generated-asset'
          : kind === 'document'
            ? 'document'
            : 'media-library',
      ...(kind === 'generated' ? { generatedAssetId: id } : { mediaLibraryId: id }),
      identity: { hash: `hash-${id}` },
    },
    ...(kind === 'generated' ? { locator: { kind: 'generated-asset' as const, assetId: id } } : {}),
    fingerprint: { strategy: 'hash', value: `hash-${id}` },
  };
}

const documentRef: DocumentArchiveResourceRef = {
  kind: 'document-entry',
  source: {
    filePath: '${PROJECT}/source/story.pdf',
    format: 'pdf',
    fileId: 'story-pdf',
    identity: { fileId: 'story-pdf', hash: 'pdf-hash' },
  },
  locator: { kind: 'page', pageNumber: 1, pageIndex: 0 },
  versionPolicy: 'read-only-source',
};

const plans: readonly StoryScenePlan[] = [
  {
    sceneId: 'scene-1',
    sceneTitle: 'Arrival',
    summary: 'A traveler arrives.',
    shotPlans: [
      {
        shotId: 'shot-1',
        visualDescription: 'Wide view of the station.',
        characterAction: 'The traveler steps onto the platform.',
        dialogue: 'TRAVELER: I am here.',
        duration: 4,
      },
    ],
  },
];

const planner: StoryboardStoryPlanningPort = {
  planText: vi.fn(async () => plans),
  planScript: vi.fn(async () => plans),
};

const ports = { storyPlanner: planner, now: () => NOW };

function scriptIndex(): NekoStoryScriptIndex {
  return {
    uri: '${PROJECT}/story/main.fountain',
    total_lines: 6,
    characters: [{ name: 'TRAVELER', first_line: 1, scene_ids: ['scene-1'] }],
    scenes: [
      {
        id: 'scene-1',
        sceneId: 'scene-1',
        heading: 'EXT. STATION - NIGHT',
        sceneTitle: 'EXT. STATION - NIGHT',
        intExt: 'EXT',
        timeOfDay: 'NIGHT',
        location: 'STATION',
        time: 'NIGHT',
        sceneNumber: '1',
        sceneCharacters: ['TRAVELER'],
        actionSummary: 'A traveler arrives.',
        estimatedDuration: 10,
        directives: [],
        line_start: 0,
        line_end: 5,
      },
    ],
  };
}

describe('Storyboard source normalization', () => {
  it.each([
    ['from-prompt' as const, 'A lonely astronaut finds a garden.'],
    ['from-text' as const, 'The traveler arrives at a silent station.'],
  ])('normalizes %s through the Story planning port', async (profile, text) => {
    const result = await normalizeStoryboardSource(
      { profile, title: 'Arrival', text, sourceRef: resource(`${profile}-source`, 'document') },
      ports,
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.table).toMatchObject({
      contractVersion: 1,
      sourceProfile: profile,
      revision: { sequence: 1, createdAt: NOW },
      scenes: [{ sceneId: 'scene-1', shots: [{ shotId: 'shot-1' }] }],
    });
  });

  it('preserves screenplay scene order, boundaries, dialogue context, and source trace', async () => {
    const result = await normalizeStoryboardSource(
      {
        profile: 'from-script',
        title: 'Station',
        scriptIndex: scriptIndex(),
        lines: ['EXT. STATION - NIGHT', 'TRAVELER', '  I am here.', '', 'Rain falls.', 'CUT TO:'],
        sourceRef: resource('script-source', 'document'),
      },
      ports,
    );

    expect(result.table?.scenes[0]).toMatchObject({
      sceneId: 'scene-1',
      sceneNumber: 1,
      location: 'STATION',
      timeOfDay: 'NIGHT',
      sourceTrace: [
        {
          sourceSceneId: 'scene-1',
          sourceRegion: { startOffset: 0, endOffset: 5 },
        },
      ],
      shots: [{ dialogue: 'TRAVELER: I am here.' }],
    });
  });

  it('routes PDF prose through Content extraction without treating archive path as media', async () => {
    const extractor: StoryboardDocumentExtractionPort = {
      extract: vi.fn(async () => ({ route: 'text', title: 'PDF Story', text: 'A city wakes.' })),
    };
    const result = await normalizeStoryboardSource(
      { profile: 'from-document', sourceDocumentRef: documentRef },
      { ...ports, documentExtractor: extractor },
    );

    expect(result.documentRoute).toBe('text');
    expect(result.table?.sourceProfile).toBe('from-document');
    expect(result.table?.sourceTrace?.[0]).toMatchObject({ sourceDocumentRef: documentRef });
    expect(result.table?.scenes[0]?.shots[0]?.sourceMediaRefs).toBeUndefined();
  });

  it('routes mixed documents through text planning and stable extracted image refs', async () => {
    const image = resource('document-image');
    const extractor: StoryboardDocumentExtractionPort = {
      extract: vi.fn(async () => ({
        route: 'mixed',
        text: 'A map reveals the route.',
        images: [image],
      })),
    };
    const result = await normalizeStoryboardSource(
      { profile: 'from-document', sourceDocumentRef: documentRef },
      { ...ports, documentExtractor: extractor },
    );

    expect(result.documentRoute).toBe('mixed');
    expect(result.table?.scenes[0]?.shots[0]?.sourceMediaRefs?.[0]?.resourceRef).toEqual(image);
  });

  it('keeps webtoon panel order, OCR bubbles, regions, and continuity in the comic profile only', async () => {
    const perception: StoryboardComicPerceptionPort = {
      analyze: vi.fn(async () => [
        {
          panelId: 'panel-2',
          page: 1,
          order: 2,
          imageRef: resource('panel-2'),
          visualDescription: 'Close reaction.',
          continuityNotes: 'Maintain wet coat.',
          bubbles: [{ bubbleId: 'b2', order: 2, text: 'Wait!', speaker: 'Mina' }],
          region: { x: 0, y: 500, width: 1000, height: 400 },
        },
        {
          panelId: 'panel-1',
          page: 1,
          order: 1,
          imageRef: resource('panel-1'),
          visualDescription: 'Mina runs through rain.',
          bubbles: [{ bubbleId: 'b1', order: 1, text: 'Stop!', speaker: 'Kai' }],
          region: { x: 0, y: 0, width: 1000, height: 450 },
        },
      ]),
    };
    const result = await normalizeStoryboardSource(
      {
        profile: 'from-comic',
        title: 'Rain',
        layout: 'vertical-webtoon',
        documentRef,
      },
      { comicPerception: perception, now: () => NOW },
    );

    expect(result.table?.sourceProfile).toBe('from-comic');
    expect(result.table?.scenes[0]?.shots.map((shot) => shot.shotId)).toEqual([
      'panel-1',
      'panel-2',
    ]);
    expect(result.table?.scenes[0]?.shots[1]).toMatchObject({
      dialogue: 'Mina: Wait!',
      sourceTrace: [{ sourceRegion: { page: 1, y: 500 } }],
      extensions: { 'neko.comic': { panelOrder: 2, continuityNotes: 'Maintain wet coat.' } },
    });
  });

  it('normalizes an ordered image sequence with stable refs', async () => {
    const images = [resource('image-a'), resource('image-b')];
    const result = await normalizeStoryboardSource(
      { profile: 'from-image-sequence', title: 'Sequence', images, durationPerImage: 2 },
      { now: () => NOW },
    );

    expect(
      result.table?.scenes[0]?.shots.map((shot) => shot.sourceMediaRefs?.[0]?.resourceRef?.id),
    ).toEqual(['image-a', 'image-b']);
    expect(result.table?.scenes[0]?.shots.map((shot) => shot.duration)).toEqual([2, 2]);
  });

  it('creates a new revision for existing Storyboard refinement and invalidates old projections', async () => {
    const initial = await normalizeStoryboardSource(
      {
        profile: 'from-image-sequence',
        title: 'Sequence',
        images: [resource('image-a'), resource('image-b')],
      },
      { now: () => NOW },
    );
    const storyboard: StoryboardTable = {
      ...initial.table!,
      projections: [
        {
          target: 'canvas',
          storyboardRevisionId: initial.table!.revision!.revisionId,
          mode: 'read-only-projection',
          createdAt: NOW,
        },
      ],
    };
    const result = await normalizeStoryboardSource(
      {
        profile: 'from-existing-storyboard',
        storyboard,
        operations: [
          {
            kind: 'reorder-shots',
            sceneId: 'image-sequence',
            shotIds: ['image-image-b-2', 'image-image-a-1'],
          },
        ],
      },
      { now: () => '2026-07-11T01:00:00.000Z' },
    );

    expect(result.table?.revision).toMatchObject({
      sequence: 2,
      parentRevisionId: storyboard.revision?.revisionId,
    });
    expect(result.table?.revision?.revisionId).not.toBe(storyboard.revision?.revisionId);
    expect(result.table?.projections).toEqual([]);
    expect(result.table?.scenes[0]?.shots.map((shot) => shot.shotId)).toEqual([
      'image-image-b-2',
      'image-image-a-1',
    ]);
  });

  it('fails visibly when a durable source or owning capability is missing', async () => {
    const result = await normalizeStoryboardSource(
      {
        profile: 'from-prompt',
        title: 'Invalid',
        text: 'Prompt',
        sourceRef: {
          ...resource('preview'),
          kind: 'preview',
          source: { kind: 'preview-asset', previewAssetId: 'preview' },
        },
      },
      {},
    );

    expect(result.table).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('invalid-resource-ref');
  });
});
