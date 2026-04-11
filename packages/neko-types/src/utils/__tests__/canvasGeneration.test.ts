import { describe, expect, it } from 'vitest';
import { extractCanvasNodeGenerationLineage } from '../canvasGeneration';
import type { GalleryCanvasNode, ShotCanvasNode, TextCanvasNode } from '../../types/canvas';

describe('extractCanvasNodeGenerationLineage', () => {
  it('extracts unique character ids from shot nodes', () => {
    const node: ShotCanvasNode = {
      id: 'shot-1',
      type: 'shot',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
      zIndex: 1,
      data: {
        shotNumber: 1,
        duration: 3,
        visualDescription: 'Alice enters the room',
        characters: [
          { characterId: 'char_alice', characterName: 'ALICE' },
          { characterId: 'char_alice', characterName: 'Alice' },
          { characterId: 'char_bob', characterName: 'BOB' },
        ],
        shotScale: 'MS',
        characterAction: 'Walks in',
        emotion: [],
        sceneTags: [],
        generationStatus: 'idle',
        generationHistory: [],
      },
    };

    expect(extractCanvasNodeGenerationLineage(node)).toEqual({
      sourceNodeId: 'shot-1',
      characterIds: ['char_alice', 'char_bob'],
    });
  });

  it('extracts gallery character ids', () => {
    const node: GalleryCanvasNode = {
      id: 'gallery-1',
      type: 'gallery',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
      zIndex: 1,
      data: {
        preset: 'character-3view',
        rows: 1,
        cols: 1,
        cells: [],
        characterId: 'char_alice',
        characterName: 'Alice',
      },
    };

    expect(extractCanvasNodeGenerationLineage(node)).toEqual({
      sourceNodeId: 'gallery-1',
      characterIds: ['char_alice'],
    });
  });

  it('still preserves source node id for non-character nodes', () => {
    const node: TextCanvasNode = {
      id: 'text-1',
      type: 'text',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
      zIndex: 1,
      data: {
        content: 'note',
      },
    };

    expect(extractCanvasNodeGenerationLineage(node)).toEqual({
      sourceNodeId: 'text-1',
    });
  });
});
