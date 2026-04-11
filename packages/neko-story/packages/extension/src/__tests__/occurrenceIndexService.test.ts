import { describe, expect, it, vi, beforeEach } from 'vitest';
import type {
  CanvasNode,
  GalleryCanvasNode,
  ShotCanvasNode,
  AssetEntity,
  GeneratedAsset,
} from '@neko/shared';
import { OccurrenceIndexService } from '../services/OccurrenceIndexService';
import type {
  CrossModalDataProvider,
  CrossModalDataSnapshot,
} from '../services/CrossModalDataProvider';

const mockVscode = vi.hoisted(() => {
  const emitters: Array<{ fire: (...args: any[]) => void }> = [];

  class Uri {
    constructor(
      public scheme: string,
      public fsPath: string,
    ) {}
    static file(p: string) {
      return new Uri('file', p);
    }
    static parse(s: string) {
      const idx = s.indexOf('://');
      return idx >= 0 ? new Uri(s.slice(0, idx), s.slice(idx + 3)) : new Uri('unknown', s);
    }
    toString() {
      return `${this.scheme}://${this.fsPath}`;
    }
  }

  class Position {
    constructor(
      public line: number,
      public character: number,
    ) {}
  }

  class Location {
    constructor(
      public uri: any,
      public range: any,
    ) {}
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

  return { Uri, Position, Location, EventEmitter, emitters };
});

vi.mock('vscode', () => mockVscode);

// -- Test helpers --

function createGalleryNode(id: string, characterId?: string, characterName?: string): CanvasNode {
  return {
    id,
    type: 'gallery',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 },
    data: { preset: 'character-3view', characterId, characterName, cells: [] },
  } as unknown as GalleryCanvasNode;
}

function createShotNode(
  id: string,
  characters: Array<{ characterId?: string; characterName: string }>,
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
      shotScale: 'MS',
      generationStatus: 'idle',
      generationHistory: [],
    },
  } as unknown as ShotCanvasNode;
}

function createAssetEntity(id: string, name: string, registryId?: string): AssetEntity {
  const now = Date.now();
  return {
    id,
    name,
    category: 'character',
    metadata: registryId ? { character: { registryId } } : {},
    variants: [],
    tags: [],
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  } as AssetEntity;
}

function createGeneratedAsset(
  id: string,
  characterIds?: string[],
  sourceNodeId?: string,
): GeneratedAsset {
  return {
    id,
    type: 'generated-image',
    path: `/generated/${id}.png`,
    mimeType: 'image/png',
    generatedAt: new Date().toISOString(),
    characterIds,
    sourceNodeId,
    width: 512,
    height: 512,
    ratio: '1:1',
  } as GeneratedAsset;
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

// -- Tests --

describe('OccurrenceIndexService', () => {
  describe('with canvas nodes', () => {
    let service: OccurrenceIndexService;

    beforeEach(async () => {
      const snapshot: CrossModalDataSnapshot = {
        canvasNodes: [
          createGalleryNode('gallery-1', 'char_alice', 'Alice'),
          createShotNode('shot-1', [
            { characterId: 'char_alice', characterName: 'Alice' },
            { characterId: 'char_bob', characterName: 'Bob' },
          ]),
          createShotNode('shot-2', [{ characterName: 'Unknown' }]),
        ],
        assetEntities: [],
        generatedAssets: [],
      };
      service = new OccurrenceIndexService(createMockDataProvider(snapshot));
      await service.ensureInitialized();
    });

    it('returns gallery and shot occurrences for a character', () => {
      const occurrences = service.queryOccurrences('character', 'char_alice');
      expect(occurrences).toHaveLength(2);
      expect(occurrences.map((o) => o.source)).toEqual(['canvas', 'canvas']);
    });

    it('returns only shot occurrence for char_bob', () => {
      const occurrences = service.queryOccurrences('character', 'char_bob');
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0]?.detail).toContain('Bob');
    });

    it('returns empty for unknown character', () => {
      expect(service.queryOccurrences('character', 'char_nobody')).toHaveLength(0);
    });

    it('counts by source correctly', () => {
      const counts = service.countBySource('character', 'char_alice');
      expect(counts['canvas']).toBe(2);
    });
  });

  describe('with asset entities', () => {
    let service: OccurrenceIndexService;

    beforeEach(async () => {
      const snapshot: CrossModalDataSnapshot = {
        canvasNodes: [],
        assetEntities: [
          createAssetEntity('asset-1', 'Alice Portrait', 'char_alice'),
          createAssetEntity('asset-2', 'Some Prop'),
        ],
        generatedAssets: [],
      };
      service = new OccurrenceIndexService(createMockDataProvider(snapshot));
      await service.ensureInitialized();
    });

    it('returns asset occurrence for character with registryId', () => {
      const occurrences = service.queryOccurrences('character', 'char_alice');
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0]?.source).toBe('asset');
      expect(occurrences[0]?.label).toBe('Alice Portrait');
    });

    it('counts asset source', () => {
      const counts = service.countBySource('character', 'char_alice');
      expect(counts['asset']).toBe(1);
    });
  });

  describe('with generated assets', () => {
    let service: OccurrenceIndexService;

    beforeEach(async () => {
      const snapshot: CrossModalDataSnapshot = {
        canvasNodes: [],
        assetEntities: [],
        generatedAssets: [
          createGeneratedAsset('gen-1', ['char_alice', 'char_bob'], 'shot-1'),
          createGeneratedAsset('gen-2', ['char_alice']),
          createGeneratedAsset('gen-3'),
        ],
      };
      service = new OccurrenceIndexService(createMockDataProvider(snapshot));
      await service.ensureInitialized();
    });

    it('returns generated occurrences for char_alice', () => {
      const occurrences = service.queryOccurrences('character', 'char_alice');
      expect(occurrences).toHaveLength(2);
      expect(occurrences.every((o) => o.source === 'generated-asset')).toBe(true);
    });

    it('returns generated occurrence for char_bob', () => {
      expect(service.queryOccurrences('character', 'char_bob')).toHaveLength(1);
    });

    it('counts generated-asset source', () => {
      const counts = service.countBySource('character', 'char_alice');
      expect(counts['generated-asset']).toBe(2);
    });
  });

  describe('source filtering', () => {
    let service: OccurrenceIndexService;

    beforeEach(async () => {
      const snapshot: CrossModalDataSnapshot = {
        canvasNodes: [createGalleryNode('g1', 'char_alice', 'Alice')],
        assetEntities: [createAssetEntity('a1', 'Alice', 'char_alice')],
        generatedAssets: [createGeneratedAsset('gen1', ['char_alice'])],
      };
      service = new OccurrenceIndexService(createMockDataProvider(snapshot));
      await service.ensureInitialized();
    });

    it('filters by specific sources', () => {
      const canvasOnly = service.queryOccurrences('character', 'char_alice', {
        sources: ['canvas'],
      });
      expect(canvasOnly).toHaveLength(1);
      expect(canvasOnly[0]?.source).toBe('canvas');
    });

    it('returns multiple sources when requested', () => {
      const multi = service.queryOccurrences('character', 'char_alice', {
        sources: ['asset', 'generated-asset'],
      });
      expect(multi).toHaveLength(2);
    });

    it('returns all sources when no filter', () => {
      expect(service.queryOccurrences('character', 'char_alice')).toHaveLength(3);
    });
  });
});
