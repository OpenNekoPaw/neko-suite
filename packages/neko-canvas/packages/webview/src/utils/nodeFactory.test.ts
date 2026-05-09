import { describe, expect, it } from 'vitest';
import type { CanvasNode, GalleryCanvasNode } from '@neko/shared';
import {
  CANVAS_AGENT_CHILD_PRESETS,
  CANVAS_AGENT_CONTAINER_PRESETS,
  CANVAS_AGENT_NODE_PRESETS,
  getBuiltInCanvasNodePresetMetadata,
} from '@neko/shared';
import { buildCanvasNode } from './nodeFactory';
import { hydrateCanvasNodePreview, refreshCanvasNodePreview } from './canvasPresetRegistry';

describe('nodeFactory gallery normalization', () => {
  it('restores gallery cell generation history and selected candidate image', () => {
    const node = buildCanvasNode({
      type: 'gallery',
      position: { x: 0, y: 0 },
      zIndex: 0,
      data: {
        preset: 'character-3view',
        rows: 1,
        cols: 1,
        cells: [
          {
            id: 'cell-1',
            label: 'front',
            generationStatus: 'done',
            generationHistory: [
              {
                id: 'v-1',
                dataUrl: 'data:image/png;base64,aaa',
                prompt: 'first',
                timestamp: 1,
                selected: false,
              },
              {
                id: 'v-2',
                dataUrl: 'data:image/png;base64,bbb',
                prompt: 'second',
                timestamp: 2,
                selected: true,
              },
            ],
          },
        ],
      },
    });

    expect(node.type).toBe('gallery');
    if (node.type !== 'gallery') {
      throw new Error('Expected gallery node');
    }
    const galleryNode = node as GalleryCanvasNode;

    expect(galleryNode.data.cells[0]?.generationHistory).toHaveLength(2);
    expect(galleryNode.data.cells[0]?.image).toBe('data:image/png;base64,bbb');
    expect(galleryNode.data.cells[0]?.generationHistory?.[1]?.selected).toBe(true);
  });
});

describe('nodeFactory composable presets', () => {
  it('registers migrated core presets while keeping legacy presets available', () => {
    expect(getBuiltInCanvasNodePresetMetadata('shot.basic')).toMatchObject({
      nodeType: 'shot',
      creationMode: 'composable',
    });
    expect(getBuiltInCanvasNodePresetMetadata('scene.basic')).toMatchObject({
      nodeType: 'scene',
      containerPolicy: 'scene',
    });
    expect(getBuiltInCanvasNodePresetMetadata('gallery.basic')).toMatchObject({
      nodeType: 'gallery',
      creationMode: 'composable',
    });
    expect(getBuiltInCanvasNodePresetMetadata('media.basic')).toMatchObject({
      nodeType: 'media',
      creationMode: 'composable',
    });
    expect(getBuiltInCanvasNodePresetMetadata('shot.legacy')).toMatchObject({
      nodeType: 'shot',
      creationMode: 'legacy',
    });
    expect(CANVAS_AGENT_NODE_PRESETS).toContain('shot.basic');
    expect(CANVAS_AGENT_CHILD_PRESETS).toContain('gallery.basic');
    expect(CANVAS_AGENT_CONTAINER_PRESETS).toContain('scene.basic');
  });

  it('adds composable content for the low-risk annotation preset', () => {
    const node = buildCanvasNode({
      type: 'annotation',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'annotation.basic',
      data: { content: 'Draft note' },
    });

    expect(node.type).toBe('annotation');
    expect(node.preset).toBe('annotation.basic');
    expect(node.content?.blocks?.[0]?.binding?.path).toBe('/content');
  });

  it('keeps explicit legacy presets on the legacy rendering path', () => {
    const node = buildCanvasNode({
      type: 'shot',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'shot.legacy',
      data: { visualDescription: 'Legacy shot' },
    });

    expect(node.type).toBe('shot');
    expect(node.preset).toBeUndefined();
    expect(node.content).toBeUndefined();
    expect(node.preview).toBeUndefined();
    if (node.type !== 'shot') {
      throw new Error('Expected shot node');
    }
    expect(node.data.visualDescription).toBe('Legacy shot');
  });

  it('allows rollback to explicit legacy defaults without corrupting existing composable data', () => {
    const composable = buildCanvasNode({
      type: 'shot',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'shot.basic',
      data: {
        shotNumber: 9,
        visualDescription: 'Composable shot',
        generationHistory: [
          {
            id: 'candidate-1',
            dataUrl: 'assets/shot.png',
            prompt: 'shot',
            timestamp: 1,
            selected: true,
          },
        ],
      },
    });
    const rollbackDefault = buildCanvasNode({
      type: 'shot',
      position: { x: 260, y: 0 },
      zIndex: 1,
      preset: 'shot.legacy',
      data: {
        shotNumber: 10,
        visualDescription: 'Legacy rollback shot',
      },
    });

    expect(composable.preset).toBe('shot.basic');
    expect(composable.content).toBeDefined();
    expect(composable.preview?.thumbnailVariantId).toBe('candidate-1');
    expect(rollbackDefault.preset).toBeUndefined();
    expect(rollbackDefault.content).toBeUndefined();
    expect(rollbackDefault.preview).toBeUndefined();
    expect(rollbackDefault.type === 'shot' ? rollbackDefault.data.visualDescription : '').toBe(
      'Legacy rollback shot',
    );
  });

  it('applies the migrated shot preset without moving authored data out of node.data', () => {
    const node = buildCanvasNode({
      type: 'shot',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'shot.basic',
      data: {
        shotNumber: 7,
        visualDescription: 'A bright doorway',
        generatedImage: 'assets/shot-7.png',
        generationHistory: [
          {
            id: 'candidate-1',
            dataUrl: 'assets/shot-7.png',
            prompt: 'doorway',
            timestamp: 1,
            selected: true,
          },
        ],
      },
    });

    expect(node.type).toBe('shot');
    expect(node.preset).toBe('shot.basic');
    expect(node.content?.sections?.some((section) => section.id === 'shot-controls')).toBe(true);
    expect(node.content?.sections?.some((section) => section.id === 'shot-preview')).toBe(true);
    expect(node.preview).toMatchObject({
      title: 'Shot 7',
      subtitle: 'A bright doorway',
      role: 'generation-candidate',
      thumbnailVariantId: 'candidate-1',
      metadata: {
        selectedAssetId: undefined,
      },
    });
    expect(node.preview?.nodeId).toBe('');
    expect(node.ports?.[0]?.id).toBe('img-out');
    if (node.type !== 'shot') {
      throw new Error('Expected shot node');
    }
    expect(node.data.visualDescription).toBe('A bright doorway');
  });

  it('applies the migrated scene preset with container capability and child slot content', () => {
    const node = buildCanvasNode({
      type: 'scene',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'scene.basic',
      data: {
        sceneTitle: 'Arrival',
        sceneNumber: 2,
        location: 'Station',
        timeOfDay: 'Night',
        shotIds: ['shot-1'],
      },
    });

    expect(node.type).toBe('scene');
    expect(node.preset).toBe('scene.basic');
    expect(node.container).toMatchObject({
      policy: 'scene',
      childIds: [],
      layout: { mode: 'sequence' },
    });
    expect(node.content?.childSlots?.[0]).toMatchObject({
      id: 'scene-children',
      summaryRole: 'node-summary',
    });
    expect(node.preview).toMatchObject({
      title: 'Arrival',
      subtitle: 'Station · Night',
      role: 'node-summary',
    });
  });

  it('applies the migrated gallery preset with collection binding metadata', () => {
    const node = buildCanvasNode({
      type: 'gallery',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'gallery.basic',
      data: {
        characterName: 'Mika',
        cells: [
          {
            id: 'front',
            label: 'front',
            image: 'assets/front.png',
            generationStatus: 'done',
          },
        ],
      },
    });

    expect(node.type).toBe('gallery');
    expect(node.preset).toBe('gallery.basic');
    const cellsBlock = node.content?.sections
      ?.find((section) => section.id === 'gallery-cells')
      ?.blocks?.find((block) => block.id === 'gallery-cell-collection');
    expect(cellsBlock?.collection?.source.path).toBe('/cells');
    expect(node.preview).toMatchObject({
      title: 'Mika',
      role: 'collection',
      thumbnailVariantId: 'front',
    });
  });

  it('refreshes migrated preview descriptors from authoritative node data', () => {
    const node = hydrateCanvasNodePreview({
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 3,
          visualDescription: 'Initial',
          generationHistory: [
            {
              id: 'candidate-1',
              dataUrl: 'blob:runtime-url',
              prompt: 'initial',
              timestamp: 1,
              selected: true,
              assetId: 'asset-1',
            },
          ],
        },
      }),
      id: 'shot-3',
    } as CanvasNode);

    const refreshed = refreshCanvasNodePreview({
      ...node,
      data: {
        ...node.data,
        visualDescription: 'Updated',
        generationHistory: [
          {
            id: 'candidate-2',
            dataUrl: 'blob:runtime-url-2',
            prompt: 'updated',
            timestamp: 2,
            selected: true,
            assetId: 'asset-2',
          },
        ],
      },
    } as CanvasNode);

    expect(refreshed.preview).toMatchObject({
      nodeId: 'shot-3',
      title: 'Shot 3',
      subtitle: 'Updated',
      thumbnailVariantId: 'candidate-2',
      metadata: {
        selectedAssetId: 'asset-2',
      },
    });
    expect(JSON.stringify(refreshed.preview)).not.toContain('blob:runtime-url');
  });

  it('keeps Gallery and Media previews stable without runtime URLs', () => {
    const gallery = hydrateCanvasNodePreview({
      ...buildCanvasNode({
        type: 'gallery',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'gallery.basic',
        data: {
          characterName: 'Mika',
          cells: [
            {
              id: 'front',
              label: 'front',
              image: 'blob:runtime-cell',
              generationHistory: [
                {
                  id: 'front-v2',
                  dataUrl: 'blob:runtime-candidate',
                  prompt: 'front',
                  timestamp: 2,
                  selected: true,
                  assetId: 'asset-front',
                },
              ],
              generationStatus: 'done',
            },
          ],
        },
      }),
      id: 'gallery-1',
    } as CanvasNode);
    const media = hydrateCanvasNodePreview({
      ...buildCanvasNode({
        type: 'media',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'media.basic',
        data: {
          assetPath: 'assets/ref.png',
          thumbnailPath: 'assets/thumb.png',
          mediaType: 'image',
        },
      }),
      id: 'media-1',
    } as CanvasNode);

    expect(gallery.preview).toMatchObject({
      nodeId: 'gallery-1',
      thumbnailVariantId: 'front-v2',
      metadata: {
        selectedCellId: 'front',
        selectedAssetId: 'asset-front',
      },
    });
    expect(media.preview).toMatchObject({
      nodeId: 'media-1',
      title: 'assets/ref.png',
      thumbnailVariantId: 'assets/thumb.png',
      role: 'image',
    });
    expect(JSON.stringify(gallery.preview)).not.toContain('blob:runtime');
    expect(JSON.stringify(media.preview)).not.toContain('blob:runtime');
  });

  it('applies the migrated media preset with asset preview capability', () => {
    const node = buildCanvasNode({
      type: 'media',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'media.basic',
      data: {
        assetPath: 'assets/ref.png',
        mediaType: 'image',
      },
    });

    expect(node.type).toBe('media');
    expect(node.preset).toBe('media.basic');
    expect(node.content?.sections?.[0]?.blocks?.[0]).toMatchObject({
      id: 'media-asset-preview',
      kind: 'asset-preview',
      binding: { path: '/assetPath' },
    });
    expect(node.preview).toMatchObject({
      title: 'assets/ref.png',
      subtitle: 'image',
      role: 'image',
    });
  });

  it('hydrates preset preview descriptors with the real node id at creation boundary', () => {
    const node = buildCanvasNode({
      type: 'media',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'media.basic',
      data: { assetPath: 'assets/ref.png', mediaType: 'image' },
    });

    const hydrated = hydrateCanvasNodePreview({ ...node, id: 'media-1' } as CanvasNode);

    expect(hydrated.preview?.nodeId).toBe('media-1');
  });

  it('rejects unknown presets so API callers get typed failures', () => {
    expect(() =>
      buildCanvasNode({
        type: 'annotation',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'unknown.preset',
        data: { content: 'Legacy note' },
      }),
    ).toThrow(/Unsupported preset/);
  });
});
