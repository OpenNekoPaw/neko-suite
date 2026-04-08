import { describe, expect, it } from 'vitest';
import type { CanvasNode, NekoStoryScriptIndex } from '@neko/shared';
import {
  buildShotCharactersForScene,
  extractCharacterIdsFromCanvasNode,
  parseGeneratedAssetBindingMetadata,
} from '../../utils/entityBinding';

describe('entityBinding helpers', () => {
  it('builds shot characters for a scene from script index bindings', () => {
    const index: NekoStoryScriptIndex = {
      uri: 'file:///story.fountain',
      total_lines: 10,
      scenes: [
        {
          id: 'S1',
          heading: 'INT. ROOM - DAY',
          intExt: 'INT',
          location: 'ROOM',
          time: 'DAY',
          line_start: 0,
          line_end: 9,
        },
      ],
      characters: [
        {
          name: 'ALICE',
          characterId: 'char_alice',
          first_line: 1,
          scene_ids: ['S1'],
        },
      ],
    };

    expect(buildShotCharactersForScene(index, 'S1')).toEqual([
      { characterName: 'ALICE', characterId: 'char_alice' },
    ]);
  });

  it('extracts bound character ids from supported canvas nodes', () => {
    const shotNode = {
      type: 'shot',
      data: {
        characters: [
          { characterName: 'ALICE', characterId: 'char_alice' },
          { characterName: 'BOB' },
        ],
      },
    } as CanvasNode;

    const galleryNode = {
      type: 'gallery',
      data: {
        characterId: 'char_alice',
      },
    } as CanvasNode;

    expect(extractCharacterIdsFromCanvasNode(shotNode)).toEqual(['char_alice']);
    expect(extractCharacterIdsFromCanvasNode(galleryNode)).toEqual(['char_alice']);
  });

  it('parses generated asset binding metadata defensively', () => {
    expect(
      parseGeneratedAssetBindingMetadata({
        sourceNodeId: 'node-1',
        characterIds: ['char_alice', 42, 'char_bob'],
      }),
    ).toEqual({
      sourceNodeId: 'node-1',
      characterIds: ['char_alice', 'char_bob'],
    });
  });
});
