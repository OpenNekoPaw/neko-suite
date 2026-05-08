import { describe, expect, it } from 'vitest';
import type { GalleryCanvasNode } from '@neko/shared';
import { buildCanvasNode } from './nodeFactory';

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
