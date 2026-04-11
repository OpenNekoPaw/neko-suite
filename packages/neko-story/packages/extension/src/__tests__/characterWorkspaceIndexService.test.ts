import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterWorkspaceIndexService } from '../services/CharacterWorkspaceIndexService';

const vscodeState = vi.hoisted(() => {
  type Handler<T> = (value: T) => void;

  const fileContents = new Map<string, Uint8Array>();
  const textDocuments: any[] = [];
  const watcherHandlers = {
    create: [] as Handler<any>[],
    change: [] as Handler<any>[],
    delete: [] as Handler<any>[],
  };
  const openHandlers: Handler<any>[] = [];
  const textChangeHandlers: Handler<any>[] = [];

  const workspaceFolders = [
    {
      name: 'project',
      uri: {
        fsPath: '/project',
        scheme: 'file',
        toString: () => 'file:///project',
      },
    },
  ];

  return {
    fileContents,
    textDocuments,
    watcherHandlers,
    openHandlers,
    textChangeHandlers,
    workspaceFolders,
  };
});

vi.mock('vscode', () => {
  function createDisposable(list: Array<(value: any) => void>, handler: (value: any) => void) {
    list.push(handler);
    return {
      dispose: () => {
        const index = list.indexOf(handler);
        if (index >= 0) {
          list.splice(index, 1);
        }
      },
    };
  }

  class Position {
    line: number;
    character: number;

    constructor(line: number, character: number) {
      this.line = line;
      this.character = character;
    }
  }

  class Range {
    start: Position;
    end: Position;

    constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
      this.start = new Position(startLine, startChar);
      this.end = new Position(endLine, endChar);
    }
  }

  class Location {
    uri: any;
    range: any;

    constructor(uri: any, range: any) {
      this.uri = uri;
      this.range = range;
    }
  }

  return {
    Position,
    Range,
    Location,
    Uri: {
      file: (filePath: string) => ({
        fsPath: filePath,
        scheme: 'file',
        toString: () => `file://${filePath}`,
      }),
    },
    workspace: {
      workspaceFolders: vscodeState.workspaceFolders,
      textDocuments: vscodeState.textDocuments,
      fs: {
        readFile: vi.fn(async (uri: { fsPath: string }) => {
          const content = vscodeState.fileContents.get(uri.fsPath);
          if (!content) {
            throw new Error(`ENOENT: ${uri.fsPath}`);
          }
          return content;
        }),
      },
      createFileSystemWatcher: vi.fn(() => ({
        onDidCreate: (handler: (uri: unknown) => void) =>
          createDisposable(vscodeState.watcherHandlers.create, handler),
        onDidChange: (handler: (uri: unknown) => void) =>
          createDisposable(vscodeState.watcherHandlers.change, handler),
        onDidDelete: (handler: (uri: unknown) => void) =>
          createDisposable(vscodeState.watcherHandlers.delete, handler),
        dispose: () => {},
      })),
      onDidOpenTextDocument: vi.fn((handler: (document: unknown) => void) =>
        createDisposable(vscodeState.openHandlers, handler),
      ),
      onDidChangeTextDocument: vi.fn((handler: (event: unknown) => void) =>
        createDisposable(vscodeState.textChangeHandlers, handler),
      ),
      getWorkspaceFolder: vi.fn((uri: { fsPath: string }) =>
        uri.fsPath.startsWith('/project') ? vscodeState.workspaceFolders[0] : undefined,
      ),
    },
  };
});

function createUri(filePath: string) {
  return {
    fsPath: filePath,
    scheme: 'file',
    toString: () => `file://${filePath}`,
  };
}

function setFileText(filePath: string, text: string): void {
  vscodeState.fileContents.set(filePath, new TextEncoder().encode(text));
}

function fireWatcherChange(filePath: string): void {
  const uri = createUri(filePath);
  for (const handler of [...vscodeState.watcherHandlers.change]) {
    handler(uri);
  }
}

function flushAsyncWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('CharacterWorkspaceIndexService', () => {
  beforeEach(() => {
    vscodeState.fileContents.clear();
    vscodeState.textDocuments.length = 0;
    vscodeState.watcherHandlers.create.length = 0;
    vscodeState.watcherHandlers.change.length = 0;
    vscodeState.watcherHandlers.delete.length = 0;
    vscodeState.openHandlers.length = 0;
    vscodeState.textChangeHandlers.length = 0;
  });

  it('loads characters.json and resolves aliases to registry definitions', async () => {
    setFileText(
      '/project/characters.json',
      JSON.stringify(
        {
          version: 1,
          characters: [
            {
              id: 'char_alice',
              canonicalName: 'ALICE',
              displayName: 'Alice',
              aliases: ['ALLY'],
              status: 'confirmed',
              bindings: {
                scriptNames: ['ALICE', 'ALLY'],
              },
            },
          ],
        },
        null,
        2,
      ),
    );

    const service = new CharacterWorkspaceIndexService();
    await service.ensureInitialized();

    const scriptUri = createUri('/project/story.fountain') as any;
    const resolved = service.resolveCharacter('ALLY', scriptUri);
    const definition = service.getDefinition('ALICE', scriptUri);
    const registry = service.getRegistry(scriptUri);
    const symbols = service.searchCharacters('ally', scriptUri);

    expect(resolved?.record.id).toBe('char_alice');
    expect(registry?.characters).toHaveLength(1);
    expect(service.getReferenceNames('ALLY', scriptUri)).toEqual(['ALICE', 'ALLY']);
    expect(service.getAllCompletionNames(scriptUri)).toContain('ALLY');
    expect(symbols[0]?.label).toBe('Alice');
    expect(symbols[0]?.location.uri.fsPath).toBe('/project/characters.json');
    expect(definition?.uri.fsPath).toBe('/project/characters.json');
    expect(definition?.range.start.line).toBeGreaterThanOrEqual(0);

    service.dispose();
  });

  it('reloads workspace state when characters.json changes', async () => {
    setFileText(
      '/project/characters.json',
      JSON.stringify(
        {
          version: 1,
          characters: [
            {
              id: 'char_alice',
              canonicalName: 'ALICE',
              aliases: ['ALLY'],
              status: 'confirmed',
            },
          ],
        },
        null,
        2,
      ),
    );

    const service = new CharacterWorkspaceIndexService();
    await service.ensureInitialized();

    setFileText(
      '/project/characters.json',
      JSON.stringify(
        {
          version: 1,
          characters: [
            {
              id: 'char_bob',
              canonicalName: 'BOB',
              aliases: [],
              status: 'confirmed',
            },
          ],
        },
        null,
        2,
      ),
    );

    fireWatcherChange('/project/characters.json');
    await flushAsyncWork();

    const scriptUri = createUri('/project/story.fountain') as any;
    expect(service.resolveCharacter('ALICE', scriptUri)).toBeUndefined();
    expect(service.resolveCharacter('BOB', scriptUri)?.record.id).toBe('char_bob');

    service.dispose();
  });
});
