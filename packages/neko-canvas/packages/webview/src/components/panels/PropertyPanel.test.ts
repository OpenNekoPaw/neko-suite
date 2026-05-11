import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import { buildCanvasNode } from '../../utils/nodeFactory';
import {
  createBuiltInNodePropertiesRendererRegistry,
  enumerateComposablePropertyItems,
  writeComposablePropertyBinding,
} from './PropertyPanel';

describe('PropertyPanel node properties registry', () => {
  it('registers built-in node property renderers', () => {
    const registry = createBuiltInNodePropertiesRendererRegistry();

    expect(registry.annotation).toBeTypeOf('function');
    expect(registry.storyboard).toBeTypeOf('function');
    expect(registry.text).toBeTypeOf('function');
    expect(registry.group).toBeTypeOf('function');
    expect(registry.media).toBeUndefined();
    expect(registry.shot).toBeUndefined();
    expect(registry.scene).toBeUndefined();
    expect(registry.gallery).toBeUndefined();
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

  it('enumerates migrated Gallery as container without cells collection', () => {
    const node = createMigratedNode('gallery', {
      characterName: 'Mika',
      preset: 'character-3view',
      rows: 1,
      cols: 3,
    });

    const items = enumerateComposablePropertyItems(node);
    const hasCollection = items.some((item) => item.kind === 'collection');
    expect(hasCollection).toBe(false);
    const hasPresetField = items.some(
      (item) => item.kind === 'field' && item.blockId === 'gallery-preset',
    );
    expect(hasPresetField).toBe(true);
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
