import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findFiles,
  readFile,
  createFileSystemWatcher,
  onDidChangeTextDocument,
  onDidOpenTextDocument,
} = vi.hoisted(() => ({
  findFiles: vi.fn(),
  readFile: vi.fn(),
  createFileSystemWatcher: vi.fn(() => ({
    onDidCreate: vi.fn(),
    onDidChange: vi.fn(),
    onDidDelete: vi.fn(),
    dispose: vi.fn(),
  })),
  onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  onDidOpenTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
}));

vi.mock('vscode', () => {
  class EventEmitter<T> {
    private listeners: Array<(value: T) => void> = [];
    readonly event = (listener: (value: T) => void) => {
      this.listeners.push(listener);
      return { dispose: vi.fn() };
    };
    fire(value: T) {
      for (const listener of this.listeners) {
        listener(value);
      }
    }
    dispose() {
      this.listeners = [];
    }
  }

  class Range {
    start: { line: number; character: number };
    end: { line: number; character: number };
    constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
      this.start = { line: startLine, character: startChar };
      this.end = { line: endLine, character: endChar };
    }
  }

  const createUri = (fsPath: string) => ({
    fsPath,
    scheme: 'file',
    toString: () => `file://${fsPath}`,
  });

  return {
    EventEmitter,
    Range,
    Uri: {
      file: createUri,
      parse: (value: string) => createUri(value.replace('file://', '')),
    },
    workspace: {
      textDocuments: [],
      fs: { readFile },
      findFiles,
      createFileSystemWatcher,
      onDidChangeTextDocument,
      onDidOpenTextDocument,
    },
  };
});

import { WorkspaceIndexService } from '../services/WorkspaceIndexService';

describe('WorkspaceIndexService occurrence projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFiles.mockResolvedValue([
      { fsPath: '/workspace/test.fountain', toString: () => 'file:///workspace/test.fountain' },
    ]);
    readFile.mockResolvedValue(
      Buffer.from(
        `INT. OFFICE - DAY

JOHN
Hello.

MARY
Hi.

JOHN
Back again.`,
      ),
    );
  });

  it('projects script occurrences for a resolved character id', async () => {
    const service = new WorkspaceIndexService({
      ensureInitialized: async () => {},
      getRegistry: () => ({ version: 1, characters: [] }),
      getRegistryUri: () => undefined,
      reload: async () => {},
      save: async () => {},
      findById: () => undefined,
      getDefinitionLocation: () => undefined,
      resolveCharacter: (name: string) =>
        name === 'JOHN'
          ? {
              characterId: 'char_john',
              matchedBy: 'canonicalName' as const,
              record: {
                id: 'char_john',
                canonicalName: 'JOHN',
                aliases: [],
                status: 'confirmed' as const,
              },
            }
          : undefined,
      dispose: () => {},
    });

    await service.ensureInitialized();

    expect(service.listOccurrencesByCharacterId('char_john')).toEqual([
      {
        entity: {
          kind: 'character',
          id: 'char_john',
          label: 'JOHN',
        },
        source: 'script',
        sourceId: 'file:///workspace/test.fountain:2:0',
        strength: 'confirmed',
        provenance: 'rule',
        locator: {
          uri: 'file:///workspace/test.fountain',
          lineStart: 2,
          lineEnd: 2,
        },
      },
      {
        entity: {
          kind: 'character',
          id: 'char_john',
          label: 'JOHN',
        },
        source: 'script',
        sourceId: 'file:///workspace/test.fountain:8:0',
        strength: 'confirmed',
        provenance: 'rule',
        locator: {
          uri: 'file:///workspace/test.fountain',
          lineStart: 8,
          lineEnd: 8,
        },
      },
    ]);

    service.dispose();
  });
});
