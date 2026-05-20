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

describe('nodeFactory gallery container', () => {
  it('creates gallery node without inline cells', () => {
    const node = buildCanvasNode({
      type: 'gallery',
      position: { x: 0, y: 0 },
      zIndex: 0,
      data: {
        preset: 'character-3view',
        rows: 1,
        cols: 3,
      },
    });

    expect(node.type).toBe('gallery');
    const galleryNode = node as GalleryCanvasNode;
    expect(galleryNode.data.preset).toBe('character-3view');
    expect(galleryNode.data.cols).toBe(3);
    expect(galleryNode.data.rows).toBe(1);
    expect(galleryNode.data.cells).toBeUndefined();
  });

  it('preserves characterProfile data', () => {
    const node = buildCanvasNode({
      type: 'gallery',
      position: { x: 0, y: 0 },
      zIndex: 0,
      data: {
        preset: 'character-3view',
        rows: 1,
        cols: 3,
        characterProfile: {
          description: 'A tall elf',
          tags: ['elf', 'tall'],
        },
      },
    });

    const galleryNode = node as GalleryCanvasNode;
    expect(galleryNode.data.characterProfile).toEqual({
      description: 'A tall elf',
      tags: ['elf', 'tall'],
    });
  });
});

describe('nodeFactory composable presets', () => {
  it('registers migrated core presets without legacy core escape hatches', () => {
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
    expect(getBuiltInCanvasNodePresetMetadata('shot.legacy')).toBeUndefined();
    expect(getBuiltInCanvasNodePresetMetadata('scene.legacy')).toBeUndefined();
    expect(getBuiltInCanvasNodePresetMetadata('gallery.legacy')).toBeUndefined();
    expect(getBuiltInCanvasNodePresetMetadata('media.legacy')).toBeUndefined();
    expect(CANVAS_AGENT_NODE_PRESETS).toContain('shot.basic');
    expect(CANVAS_AGENT_NODE_PRESETS).not.toContain('shot.legacy');
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

  it('rejects removed core legacy presets', () => {
    expect(() =>
      buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.legacy',
        data: { visualDescription: 'Legacy shot' },
      }),
    ).toThrow(/Unsupported preset/);
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

  it('applies the migrated gallery preset with childSlots and container metadata', () => {
    const node = buildCanvasNode({
      type: 'gallery',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'gallery.basic',
      data: {
        characterName: 'Mika',
        preset: 'character-3view',
        rows: 1,
        cols: 3,
      },
    });

    expect(node.type).toBe('gallery');
    expect(node.preset).toBe('gallery.basic');
    const contentSection = node.content?.sections?.find((s) => s.id === 'gallery-content');
    const childSlot = contentSection?.childSlots?.find((s) => s.id === 'gallery-children');
    expect(childSlot).toBeDefined();
    expect(childSlot?.layout).toBe('gallery');
    expect(node.container?.policy).toBe('gallery');
    expect(node.preview).toMatchObject({
      title: 'Mika',
      role: 'collection',
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
          preset: 'character-3view',
          rows: 1,
          cols: 3,
        },
      }),
      id: 'gallery-1',
      container: {
        policy: 'gallery',
        childIds: ['child-1', 'child-2'],
        layout: { mode: 'gallery' },
        acceptedChildren: { nodeTypes: ['media'] },
        deleteBehavior: 'delete-subtree',
      },
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
      title: 'Mika',
      role: 'collection',
    });
    expect(media.preview).toMatchObject({
      nodeId: 'media-1',
      title: 'ref.png',
      thumbnailVariantId: 'assets/thumb.png',
      role: 'image',
    });
    expect(JSON.stringify(media.preview)).not.toContain('blob:runtime');
  });

  it('keeps document-linked media references stable while carrying runtime preview paths', () => {
    const documentResourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' as const },
      entryPath: 'image/page-1.jpg',
      cachePath: '/tmp/neko_epub_1/0001_page-1.jpg',
      versionPolicy: 'versioned-export' as const,
    };

    const media = hydrateCanvasNodePreview({
      ...buildCanvasNode({
        type: 'media',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'media.basic',
        data: {
          assetPath: '',
          documentResourceRef,
          runtimeAssetPath:
            'https://file+.vscode-resource.vscode-cdn.net/tmp/neko_epub_1/0001_page-1.jpg',
          mediaType: 'image',
        },
      }),
      id: 'media-doc-entry',
    } as CanvasNode);

    expect(media.data).toMatchObject({
      assetPath: '',
      documentResourceRef,
      runtimeAssetPath:
        'https://file+.vscode-resource.vscode-cdn.net/tmp/neko_epub_1/0001_page-1.jpg',
    });
    expect(media.preview).toMatchObject({
      title: 'page-1.jpg',
      capabilities: [
        expect.objectContaining({
          kind: 'asset-identity',
          path: undefined,
          uri: 'image/page-1.jpg',
        }),
        expect.objectContaining({ kind: 'preview' }),
      ],
    });
    expect(JSON.stringify(media.preview)).not.toContain('vscode-resource.vscode-cdn.net');
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
      title: 'ref.png',
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
