import { describe, expect, it, vi } from 'vitest';
import type { CanvasNode, GalleryCanvasNode, ShotCanvasNode } from '@neko/shared';
import { CreativeEntityGraphService } from '../services/CreativeEntityGraphService';
import type {
  CrossModalDataProvider,
  CrossModalDataSnapshot,
} from '../services/CrossModalDataProvider';
import type { ICharacterWorkspaceIndex } from '../services/types';

const mockVscode = vi.hoisted(() => {
  class Uri {
    constructor(
      public scheme: string,
      public fsPath: string,
    ) {}
    static file(p: string) {
      return new Uri('file', p);
    }
    static parse(s: string) {
      return new Uri('parsed', s);
    }
    toString() {
      return `${this.scheme}://${this.fsPath}`;
    }
  }

  class EventEmitter {
    private listeners: Array<(...args: any[]) => void> = [];
    event = (fn: (...args: any[]) => void) => {
      this.listeners.push(fn);
      return { dispose: () => {} };
    };
    fire(...args: any[]) {
      for (const fn of this.listeners) fn(...args);
    }
    dispose() {
      this.listeners = [];
    }
  }

  return {
    Uri,
    EventEmitter,
    workspace: {
      fs: {
        readFile: vi.fn().mockRejectedValue(new Error('not found')),
        writeFile: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
});

vi.mock('vscode', () => mockVscode);

// -- Helpers --

function createMockCharacterIndex(
  characters: Array<{
    id: string;
    canonicalName: string;
    defaults?: { galleryNodeId?: string };
    bindings?: { assetEntityIds?: string[] };
  }> = [],
): ICharacterWorkspaceIndex {
  return {
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    getRegistry: vi.fn().mockReturnValue({ version: 1, characters }),
    resolveCharacter: vi.fn(),
    getDefinition: vi.fn(),
    getReferenceNames: vi.fn().mockReturnValue([]),
    getAllCompletionNames: vi.fn().mockReturnValue([]),
    searchCharacters: vi.fn().mockReturnValue([]),
    dispose: vi.fn(),
  } as unknown as ICharacterWorkspaceIndex;
}

function createMockDataProvider(snapshot: CrossModalDataSnapshot): CrossModalDataProvider {
  const emitter = new mockVscode.EventEmitter();
  return {
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    getSnapshot: vi.fn().mockReturnValue(snapshot),
    onDidUpdate: emitter.event,
    dispose: vi.fn(),
  } as unknown as CrossModalDataProvider;
}

function createGalleryNode(id: string, characterId?: string): CanvasNode {
  return {
    id,
    type: 'gallery',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 },
    data: { preset: 'character-3view', characterId, cells: [] },
  } as unknown as GalleryCanvasNode;
}

function createShotNode(
  id: string,
  characters: Array<{ characterId?: string; characterName: string }>,
  sceneGroupId?: string,
): CanvasNode {
  return {
    id,
    type: 'shot',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 },
    data: {
      shotNumber: 1,
      duration: 3,
      characters,
      sceneGroupId,
      shotScale: 'MS',
      generationStatus: 'idle',
      generationHistory: [],
    },
  } as unknown as ShotCanvasNode;
}

const EMPTY_SNAPSHOT: CrossModalDataSnapshot = {
  canvasNodes: [],
  assetEntities: [],
  generatedAssets: [],
};

// -- Tests --

describe('CreativeEntityGraphService', () => {
  describe('registry edges', () => {
    it('creates default-visual-for edge from registry defaults.galleryNodeId', async () => {
      const charIndex = createMockCharacterIndex([
        { id: 'char_alice', canonicalName: 'ALICE', defaults: { galleryNodeId: 'gallery-1' } },
      ]);
      const service = new CreativeEntityGraphService(
        createMockDataProvider(EMPTY_SNAPSHOT),
        charIndex,
      );
      await service.ensureInitialized();

      const edges = service.getEdgesForEntity('char_alice');
      const defaultVisual = edges.find((e) => e.type === 'default-visual-for');
      expect(defaultVisual).toBeDefined();
      expect(defaultVisual?.to).toBe('canvas:gallery-1');
    });

    it('creates depicts-character edges from registry bindings.assetEntityIds', async () => {
      const charIndex = createMockCharacterIndex([
        {
          id: 'char_alice',
          canonicalName: 'ALICE',
          bindings: { assetEntityIds: ['asset-1', 'asset-2'] },
        },
      ]);
      const service = new CreativeEntityGraphService(
        createMockDataProvider(EMPTY_SNAPSHOT),
        charIndex,
      );
      await service.ensureInitialized();

      const edges = service.getEdgesForEntity('char_alice');
      const depictsEdges = edges.filter((e) => e.type === 'depicts-character');
      expect(depictsEdges).toHaveLength(2);
    });
  });

  describe('canvas edges', () => {
    it('creates depicts-character edge for gallery with characterId', async () => {
      const charIndex = createMockCharacterIndex([{ id: 'char_alice', canonicalName: 'ALICE' }]);
      const snapshot: CrossModalDataSnapshot = {
        canvasNodes: [createGalleryNode('gallery-1', 'char_alice')],
        assetEntities: [],
        generatedAssets: [],
      };
      const service = new CreativeEntityGraphService(createMockDataProvider(snapshot), charIndex);
      await service.ensureInitialized();

      const edges = service.getEdgesForEntity('char_alice');
      const depictsEdge = edges.find(
        (e) => e.type === 'depicts-character' && e.from === 'canvas:gallery-1',
      );
      expect(depictsEdge).toBeDefined();
      expect(depictsEdge?.strength).toBe('confirmed');
      expect(depictsEdge?.provenance).toBe('lineage');
    });

    it('creates appears-in-shot and appears-in-scene edges for shot', async () => {
      const charIndex = createMockCharacterIndex([{ id: 'char_alice', canonicalName: 'ALICE' }]);
      const snapshot: CrossModalDataSnapshot = {
        canvasNodes: [
          createShotNode(
            'shot-1',
            [{ characterId: 'char_alice', characterName: 'Alice' }],
            'scene-group-1',
          ),
        ],
        assetEntities: [],
        generatedAssets: [],
      };
      const service = new CreativeEntityGraphService(createMockDataProvider(snapshot), charIndex);
      await service.ensureInitialized();

      const aliceEdges = service.getEdgesForEntity('char_alice');
      expect(aliceEdges.find((e) => e.type === 'appears-in-shot')).toBeDefined();

      const shotEdges = service.getEdgesForEntity('canvas:shot-1');
      expect(shotEdges.find((e) => e.type === 'appears-in-scene')).toBeDefined();
    });
  });

  describe('generated asset edges', () => {
    it('creates depicts-character and generated-from edges', async () => {
      const charIndex = createMockCharacterIndex([{ id: 'char_alice', canonicalName: 'ALICE' }]);
      const snapshot: CrossModalDataSnapshot = {
        canvasNodes: [],
        assetEntities: [],
        generatedAssets: [
          {
            id: 'gen-1',
            type: 'generated-image',
            path: '/gen/gen-1.png',
            mimeType: 'image/png',
            generatedAt: new Date().toISOString(),
            characterIds: ['char_alice'],
            sourceNodeId: 'shot-1',
            width: 512,
            height: 512,
            ratio: '1:1',
          } as any,
        ],
      };
      const service = new CreativeEntityGraphService(createMockDataProvider(snapshot), charIndex);
      await service.ensureInitialized();

      const genEdges = service.getEdgesForEntity('generated:gen-1');
      expect(genEdges.find((e) => e.type === 'depicts-character')).toBeDefined();
      expect(genEdges.find((e) => e.type === 'generated-from')).toBeDefined();
    });
  });

  describe('getNodesByKind', () => {
    it('returns all nodes of the specified kind', async () => {
      const charIndex = createMockCharacterIndex([{ id: 'char_alice', canonicalName: 'ALICE' }]);
      const snapshot: CrossModalDataSnapshot = {
        canvasNodes: [createGalleryNode('gallery-1', 'char_alice')],
        assetEntities: [],
        generatedAssets: [],
      };
      const service = new CreativeEntityGraphService(createMockDataProvider(snapshot), charIndex);
      await service.ensureInitialized();

      expect(service.getNodesByKind('entity')).toHaveLength(1);
      expect(service.getNodesByKind('entity')[0]?.label).toBe('ALICE');
      expect(service.getNodesByKind('canvas-node')).toHaveLength(1);
    });
  });

  describe('edge queries', () => {
    it('getEdgesForEntity returns edges in both directions', async () => {
      const charIndex = createMockCharacterIndex([{ id: 'char_alice', canonicalName: 'ALICE' }]);
      const snapshot: CrossModalDataSnapshot = {
        canvasNodes: [createGalleryNode('gallery-1', 'char_alice')],
        assetEntities: [],
        generatedAssets: [],
      };
      const service = new CreativeEntityGraphService(createMockDataProvider(snapshot), charIndex);
      await service.ensureInitialized();

      // char_alice is 'to' of canvas depicts-character edge
      const edges = service.getEdgesForEntity('char_alice');
      expect(edges.length).toBeGreaterThan(0);
    });

    it('returns empty for unknown entity', async () => {
      const service = new CreativeEntityGraphService(
        createMockDataProvider(EMPTY_SNAPSHOT),
        createMockCharacterIndex(),
      );
      await service.ensureInitialized();

      expect(service.getEdgesForEntity('nonexistent')).toHaveLength(0);
    });
  });
});
