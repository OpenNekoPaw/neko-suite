import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readFile, writeFile, fileWatcher } = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  fileWatcher: {
    onDidCreate: vi.fn(),
    onDidChange: vi.fn(),
    onDidDelete: vi.fn(),
    dispose: vi.fn(),
  },
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

  return {
    EventEmitter,
    Range: class {
      start: { line: number; character: number };
      end: { line: number; character: number };
      constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
        this.start = { line: startLine, character: startChar };
        this.end = { line: endLine, character: endChar };
      }
    },
    Location: class {
      constructor(
        public readonly uri: unknown,
        public readonly range: unknown,
      ) {}
    },
    Uri: {
      joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
        fsPath: `${base.fsPath}/${parts.join('/')}`,
      }),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
      fs: {
        readFile,
        writeFile,
      },
      createFileSystemWatcher: vi.fn(() => fileWatcher),
    },
  };
});

import { CharacterWorkspaceIndexService } from '../services/CharacterWorkspaceIndexService';

describe('CharacterWorkspaceIndexService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFile.mockResolvedValue(
      Buffer.from(
        JSON.stringify({
          version: 1,
          characters: [
            {
              id: 'char_alice',
              canonicalName: 'ALICE',
              displayName: 'Alice',
              aliases: ['艾丽丝'],
              status: 'confirmed',
              bindings: {
                scriptNames: ['ALICE (V.O.)'],
              },
            },
          ],
        }),
      ),
    );
  });

  it('loads characters.json and resolves names to stable ids', async () => {
    const service = new CharacterWorkspaceIndexService();
    await service.ensureInitialized();

    expect(service.resolveCharacter('ALICE')?.characterId).toBe('char_alice');
    expect(service.resolveCharacter('Alice')?.matchedBy).toBe('canonicalName');
    expect(service.resolveCharacter('ALICE (V.O.)')?.matchedBy).toBe('scriptName');

    service.dispose();
  });

  it('writes a validated registry payload back to workspace', async () => {
    const service = new CharacterWorkspaceIndexService();

    await service.save({
      version: 1,
      characters: [
        {
          id: 'char_bob',
          canonicalName: 'BOB',
          aliases: [],
          status: 'confirmed',
        },
      ],
    });

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(service.findById('char_bob')?.canonicalName).toBe('BOB');

    service.dispose();
  });
});
