import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import { buildCanvasNode } from '../../utils/nodeFactory';
import {
  createBuiltInNodePropertiesRendererRegistry,
  enumerateComposablePropertyItems,
  writeComposablePropertyBinding,
  writeComposablePropertyPath,
} from './PropertyPanel';

describe('PropertyPanel node properties registry', () => {
  it('registers built-in node property renderers', () => {
    const registry = createBuiltInNodePropertiesRendererRegistry();

    expect(registry.annotation).toBeTypeOf('function');
    expect(registry.storyboard).toBeTypeOf('function');
    expect(registry.text).toBeTypeOf('function');
    expect(registry.group).toBeTypeOf('function');
    expect(registry.media).toBeTypeOf('function');
    expect(registry.shot).toBeTypeOf('function');
    expect(registry.scene).toBeTypeOf('function');
    expect(registry.gallery).toBeTypeOf('function');
  });

  it('enumerates migrated Shot bindings before legacy branches', () => {
    const node = createMigratedNode('shot', {
      shotNumber: 1,
      visualDescription: 'A quiet hallway',
      duration: 4,
      characters: ['Mika'],
      emotion: ['calm'],
    });

    const items = enumerateComposablePropertyItems(node);
    const fieldPaths = items
      .filter((item) => item.kind === 'field')
      .map((item) => item.binding.path);

    expect(fieldPaths).toContain('/visualDescription');
    expect(fieldPaths).toContain('/duration');
    expect(fieldPaths).toContain('/characters');
    expect(fieldPaths).toContain('/dialogue');
    expect(items.some((item) => item.kind === 'preview')).toBe(true);
  });

  it('writes migrated Shot scalar and tag bindings without replacing unrelated data', () => {
    const node = createMigratedNode('shot', {
      shotNumber: 2,
      visualDescription: 'Old',
      duration: 3,
      characters: ['Mika'],
      generationHistory: [
        { id: 'v1', dataUrl: 'asset.png', prompt: 'old', timestamp: 1, selected: true },
      ],
    });

    const nextData = writeComposablePropertyBinding(
      node,
      { path: '/visualDescription', valueType: 'string' },
      'New',
    );
    const withTags = writeComposablePropertyBinding(
      { ...node, data: nextData } as CanvasNode,
      { path: '/characters', valueType: 'array' },
      ['Mika', 'Ren'],
    );

    expect(withTags.visualDescription).toBe('New');
    expect(withTags.characters).toEqual(['Mika', 'Ren']);
    expect(withTags.generationHistory).toEqual(
      (node.data as Record<string, unknown>).generationHistory,
    );
  });

  it('edits migrated Gallery collection cells without replacing sibling cell data', () => {
    const node = createMigratedNode('gallery', {
      characterName: 'Mika',
      cells: [
        {
          id: 'front',
          label: 'front',
          prompt: 'old prompt',
          image: 'front.png',
          generationStatus: 'done',
          generationHistory: [
            { id: 'v1', dataUrl: 'front.png', prompt: 'old', timestamp: 1, selected: true },
          ],
        },
        {
          id: 'side',
          label: 'side',
          prompt: 'side prompt',
          image: 'side.png',
          generationStatus: 'idle',
        },
      ],
    });

    const items = enumerateComposablePropertyItems(node);
    expect(items.some((item) => item.kind === 'collection' && item.items.length === 2)).toBe(true);

    const nextData = writeComposablePropertyPath(node, '/cells/0/prompt', 'new prompt');

    expect((nextData.cells as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: 'front',
      label: 'front',
      prompt: 'new prompt',
      image: 'front.png',
      generationHistory: (
        (node.data as Record<string, unknown>).cells as Array<Record<string, unknown>>
      )[0]?.generationHistory,
    });
    expect((nextData.cells as Array<Record<string, unknown>>)[1]).toEqual(
      ((node.data as Record<string, unknown>).cells as Array<Record<string, unknown>>)[1],
    );
  });

  it('enumerates migrated Media preview metadata as read-only property context', () => {
    const node = createMigratedNode('media', {
      assetPath: 'assets/ref.png',
      mediaType: 'image',
      duration: 1,
    });

    const items = enumerateComposablePropertyItems(node);
    const fieldPaths = items
      .filter((item) => item.kind === 'field')
      .map((item) => item.binding.path);

    expect(fieldPaths).toContain('/assetPath');
    expect(items.some((item) => item.kind === 'preview' && item.role === 'asset-identity')).toBe(
      true,
    );
    expect(items.some((item) => item.kind === 'action' && item.action === 'open-media')).toBe(true);
  });

  it('enumerates migrated Scene actions and child count via composable metadata', () => {
    const node = {
      ...createMigratedNode('scene', {
        sceneTitle: 'Arrival',
        sceneNumber: 1,
        shotIds: ['shot-1'],
      }),
      container: { policy: 'scene', childIds: ['shot-1'] },
    } as CanvasNode;

    const items = enumerateComposablePropertyItems(node);
    const actions = items.filter((item) => item.kind === 'action').map((item) => item.action);

    expect(actions).toEqual(['assignSelectedShots', 'autoLayoutShots', 'batchGenerateShots']);
  });
});

function createMigratedNode(
  type: 'shot' | 'scene' | 'gallery' | 'media',
  data: Record<string, unknown>,
): CanvasNode {
  return {
    ...buildCanvasNode({
      type,
      position: { x: 0, y: 0 },
      zIndex: 1,
      preset: `${type}.basic`,
      data,
    }),
    id: `${type}-1`,
  } as CanvasNode;
}
