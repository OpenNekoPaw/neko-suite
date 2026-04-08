import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from '../canvasStore';
import { useHistoryStore } from '../historyStore';
import type { CanvasData } from '@neko/shared';

function createCanvasData(): CanvasData {
  return {
    version: '1.0.0',
    name: 'Test Canvas',
    nodes: [
      {
        id: 'shot-1',
        type: 'shot',
        position: { x: 100, y: 120 },
        size: { width: 220, height: 200 },
        zIndex: 10,
        data: {
          shotNumber: 1,
          duration: 3,
          visualDescription: '',
          characters: [{ characterName: 'ALICE', characterId: 'char_alice' }],
          shotScale: 'MS',
          characterAction: '',
          emotion: ['happy'],
          sceneTags: [],
          generationStatus: 'idle',
          generationHistory: [],
        },
      },
      {
        id: 'gallery-1',
        type: 'gallery',
        position: { x: 200, y: 120 },
        size: { width: 320, height: 260 },
        zIndex: 20,
        data: {
          preset: 'character-3view',
          rows: 1,
          cols: 3,
          characterId: 'char_alice',
          characterName: 'ALICE',
          cells: [],
        },
      },
    ],
    connections: [],
    viewport: {
      pan: { x: 0, y: 0 },
      zoom: 1,
    },
  };
}

describe('canvasStore deriveSuccessorNode', () => {
  beforeEach(() => {
    useHistoryStore.setState({ past: [], future: [] });
    useCanvasStore.setState({
      canvasData: createCanvasData(),
      selection: { nodeIds: [], connectionIds: [] },
      isConnecting: false,
      pendingConnectionSource: null,
      activePlayingNodeId: null,
      generationPanelState: { visible: false, nodeId: null, cellId: null },
    });
  });

  it('preserves shot character bindings when deriving a successor shot', () => {
    const newNodeId = useCanvasStore.getState().deriveSuccessorNode('shot-1', 'shot');
    expect(newNodeId).toBeTruthy();

    const newNode = useCanvasStore
      .getState()
      .canvasData?.nodes.find((node) => node.id === newNodeId && node.type === 'shot');

    expect(newNode).toBeDefined();
    expect((newNode?.data as { characters: Array<{ characterId?: string }> }).characters).toEqual([
      { characterName: 'ALICE', characterId: 'char_alice' },
    ]);
  });

  it('preserves gallery character identity when deriving a successor gallery', () => {
    const newNodeId = useCanvasStore.getState().deriveSuccessorNode('gallery-1', 'gallery');
    expect(newNodeId).toBeTruthy();

    const newNode = useCanvasStore
      .getState()
      .canvasData?.nodes.find((node) => node.id === newNodeId && node.type === 'gallery');

    expect(newNode).toBeDefined();
    expect(
      newNode?.data as {
        characterId?: string;
        characterName?: string;
      },
    ).toMatchObject({
      characterId: 'char_alice',
      characterName: 'ALICE',
    });
  });
});
