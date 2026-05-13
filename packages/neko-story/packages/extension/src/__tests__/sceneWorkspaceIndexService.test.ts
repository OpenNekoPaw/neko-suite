import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SceneWorkspaceIndexService } from '../services/SceneWorkspaceIndexService';
import type { IWorkspaceIndex, ScriptIndex } from '../services/types';
import type { StorySceneStateStore } from '../services/storySceneStateStore';

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
      return new Uri('file', s.replace('file://', ''));
    }
    toString() {
      return `file://${this.fsPath}`;
    }
  }

  class Position {
    constructor(
      public line: number,
      public character: number,
    ) {}
  }

  class Range {
    constructor(
      public startLine: number,
      public startChar: number,
      public endLine: number,
      public endChar: number,
    ) {}
    get start() {
      return new Position(this.startLine, this.startChar);
    }
    get end() {
      return new Position(this.endLine, this.endChar);
    }
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

  return { Uri, Position, Range, Location, EventEmitter };
});

vi.mock('vscode', () => mockVscode);

// -- Helpers --

function createScriptIndex(
  uri: string,
  scenes: Array<{
    sceneId: string;
    heading: string;
    location: string;
    intExt?: string;
    timeOfDay?: string;
    sceneCharacters?: string[];
    line_start?: number;
    line_end?: number;
  }>,
): ScriptIndex {
  return {
    uri,
    total_lines: 100,
    characters: [],
    scenes: scenes.map((s, i) => ({
      id: s.sceneId,
      sceneId: s.sceneId,
      heading: s.heading,
      sceneTitle: s.heading,
      intExt: s.intExt ?? null,
      timeOfDay: s.timeOfDay ?? null,
      location: s.location,
      time: s.timeOfDay ?? null,
      sceneNumber: null,
      sceneCharacters: s.sceneCharacters ?? [],
      actionSummary: '',
      estimatedDuration: 30,
      directives: [],
      line_start: s.line_start ?? i * 20,
      line_end: s.line_end ?? (i + 1) * 20 - 1,
    })),
  };
}

function createMockWorkspaceIndex(scriptIndices: ScriptIndex[]): IWorkspaceIndex {
  const emitter = new mockVscode.EventEmitter();

  const findSceneLocations = vi.fn((location: string) => {
    const results: Array<{ uri: any; name: string; kind: 'scene'; range: any }> = [];
    for (const si of scriptIndices) {
      for (const scene of si.scenes) {
        if (scene.location.toLowerCase() === location.toLowerCase()) {
          results.push({
            uri: mockVscode.Uri.parse(si.uri),
            name: scene.heading,
            kind: 'scene',
            range: new mockVscode.Range(scene.line_start, 0, scene.line_end, 0),
          });
        }
      }
    }
    return results;
  });

  return {
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    getDocument: vi.fn(),
    findCharacterLocations: vi.fn().mockReturnValue([]),
    findCharacterDefinition: vi.fn(),
    findSceneLocations,
    findSectionLocations: vi.fn().mockReturnValue([]),
    searchSymbols: vi.fn().mockReturnValue([]),
    getAllCharacterNames: vi.fn().mockReturnValue([]),
    getAllSceneLocations: vi.fn().mockReturnValue([]),
    getScriptIndex: vi.fn(),
    getAllScriptIndices: vi.fn().mockReturnValue(scriptIndices),
    onDidUpdateIndex: emitter.event,
    dispose: vi.fn(),
  } as unknown as IWorkspaceIndex;
}

function createMockSceneStateStore(
  bindings: Record<string, { canvasSceneNodeId: string; shotIds: string[] }> = {},
): StorySceneStateStore {
  return {
    getCanvasBinding: vi.fn((sceneId: string) => bindings[sceneId] ?? undefined),
    onDidChange: new mockVscode.EventEmitter().event,
    dispose: vi.fn(),
  } as unknown as StorySceneStateStore;
}

// -- Tests --

describe('SceneWorkspaceIndexService', () => {
  const scriptIndex1 = createScriptIndex('file:///project/script.fountain', [
    {
      sceneId: 'scene-1',
      heading: 'INT. COFFEE SHOP - DAY',
      location: 'COFFEE SHOP',
      intExt: 'INT',
      timeOfDay: 'DAY',
      sceneCharacters: ['ALICE', 'BOB'],
    },
    {
      sceneId: 'scene-2',
      heading: 'EXT. PARK - NIGHT',
      location: 'PARK',
      intExt: 'EXT',
      timeOfDay: 'NIGHT',
      sceneCharacters: ['ALICE'],
      line_start: 30,
      line_end: 49,
    },
  ]);

  const scriptIndex2 = createScriptIndex('file:///project/script2.fountain', [
    {
      sceneId: 'scene-3',
      heading: 'INT. COFFEE SHOP - NIGHT',
      location: 'COFFEE SHOP',
      intExt: 'INT',
      timeOfDay: 'NIGHT',
      sceneCharacters: ['BOB'],
    },
  ]);

  describe('resolveScene', () => {
    let service: SceneWorkspaceIndexService;

    beforeEach(async () => {
      service = new SceneWorkspaceIndexService(
        createMockWorkspaceIndex([scriptIndex1, scriptIndex2]),
        createMockSceneStateStore(),
      );
      await service.ensureInitialized();
    });

    it('resolves by sceneId', () => {
      const result = service.resolveScene('scene-1');
      expect(result).toBeDefined();
      expect(result?.matchedBy).toBe('sceneId');
      expect(result?.entry.location).toBe('COFFEE SHOP');
    });

    it('resolves by heading text', () => {
      const result = service.resolveScene('INT. COFFEE SHOP - DAY');
      expect(result).toBeDefined();
      expect(result?.matchedBy).toBe('heading');
      expect(result?.entry.sceneId).toBe('scene-1');
    });

    it('resolves by location name', () => {
      const result = service.resolveScene('COFFEE SHOP');
      expect(result).toBeDefined();
      expect(result?.matchedBy).toBe('location');
    });

    it('returns undefined for unknown query', () => {
      expect(service.resolveScene('UNKNOWN PLACE')).toBeUndefined();
    });

    it('returns undefined for empty query', () => {
      expect(service.resolveScene('  ')).toBeUndefined();
    });
  });

  describe('getDefinition', () => {
    it('returns location for known sceneId', async () => {
      const service = new SceneWorkspaceIndexService(
        createMockWorkspaceIndex([scriptIndex1]),
        createMockSceneStateStore(),
      );
      await service.ensureInitialized();

      const def = service.getDefinition('scene-1');
      expect(def).toBeDefined();
    });

    it('returns undefined for unknown sceneId', async () => {
      const service = new SceneWorkspaceIndexService(
        createMockWorkspaceIndex([scriptIndex1]),
        createMockSceneStateStore(),
      );
      await service.ensureInitialized();

      expect(service.getDefinition('nonexistent')).toBeUndefined();
    });
  });

  describe('getCanvasBinding', () => {
    it('returns binding from state store', async () => {
      const service = new SceneWorkspaceIndexService(
        createMockWorkspaceIndex([scriptIndex1]),
        createMockSceneStateStore({
          'scene-1': { canvasSceneNodeId: 'canvas-node-1', shotIds: ['shot-1', 'shot-2'] },
        }),
      );
      await service.ensureInitialized();

      const binding = service.getCanvasBinding('scene-1');
      expect(binding?.canvasSceneNodeId).toBe('canvas-node-1');
      expect(binding?.shotIds).toEqual(['shot-1', 'shot-2']);
    });

    it('returns undefined when no binding', async () => {
      const service = new SceneWorkspaceIndexService(
        createMockWorkspaceIndex([scriptIndex1]),
        createMockSceneStateStore(),
      );
      await service.ensureInitialized();

      expect(service.getCanvasBinding('scene-1')).toBeUndefined();
    });
  });

  describe('getAllSceneIds', () => {
    it('returns all scene IDs across files', async () => {
      const service = new SceneWorkspaceIndexService(
        createMockWorkspaceIndex([scriptIndex1, scriptIndex2]),
        createMockSceneStateStore(),
      );
      await service.ensureInitialized();

      const ids = service.getAllSceneIds();
      expect(ids).toContain('scene-1');
      expect(ids).toContain('scene-2');
      expect(ids).toContain('scene-3');
      expect(ids).toHaveLength(3);
    });
  });

  describe('getLocationReferences', () => {
    it('delegates to workspace index and returns locations', async () => {
      const service = new SceneWorkspaceIndexService(
        createMockWorkspaceIndex([scriptIndex1, scriptIndex2]),
        createMockSceneStateStore(),
      );
      await service.ensureInitialized();

      const refs = service.getLocationReferences('COFFEE SHOP');
      expect(refs).toHaveLength(2); // script1 + script2
    });
  });
});
