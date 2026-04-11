import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterRecord } from '@neko/shared';
import {
  FountainCharacterCodeActionProvider,
  FountainCharacterRenameProvider,
} from '../providers/rename';
import type { ICharacterWorkspaceIndex, IWorkspaceIndex, SymbolLocation } from '../services/types';

const vscodeState = vi.hoisted(() => {
  const openDocuments = new Map<string, string>();

  return {
    openDocuments,
  };
});

vi.mock('vscode', () => {
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

  class WorkspaceEdit {
    readonly entries: Array<{ uri: any; range: any; newText: string }> = [];

    replace(uri: any, range: any, newText: string) {
      this.entries.push({ uri, range, newText });
    }
  }

  class CodeAction {
    title: string;
    kind: string;
    command?: { title: string; command: string };
    isPreferred?: boolean;

    constructor(title: string, kind: string) {
      this.title = title;
      this.kind = kind;
    }
  }

  return {
    Position,
    Range,
    Location,
    WorkspaceEdit,
    CodeAction,
    CodeActionKind: {
      RefactorRewrite: 'refactor.rewrite',
    },
    Uri: {
      file: (filePath: string) => ({
        fsPath: filePath,
        scheme: 'file',
        toString: () => `file://${filePath}`,
      }),
    },
    workspace: {
      openTextDocument: vi.fn(async (uri: { fsPath: string }) => {
        const text = vscodeState.openDocuments.get(uri.fsPath);
        if (typeof text !== 'string') {
          throw new Error(`ENOENT: ${uri.fsPath}`);
        }

        const lines = text.split('\n');
        return {
          uri,
          lineCount: lines.length,
          lineAt: (line: number) => ({ text: lines[line] ?? '' }),
          getText: () => text,
        };
      }),
    },
    l10n: {
      t: (value: string) =>
        value === 'neko.story.renameCharacterIdentity.action'
          ? 'Rename character identity in registry'
          : value,
    },
  };
});

function createMockDocument(text: string, uri = '/project/story.fountain') {
  const lines = text.split('\n');
  return {
    uri: {
      fsPath: uri,
      scheme: 'file',
      toString: () => `file://${uri}`,
    },
    lineCount: lines.length,
    lineAt: (line: number) => ({ text: lines[line] ?? '' }),
    getText: (range?: any) => {
      if (!range) {
        return text;
      }

      const line = lines[range.start.line] ?? '';
      return line.slice(range.start.character, range.end.character);
    },
    getWordRangeAtPosition: (position: any, regex?: RegExp) => {
      const line = lines[position.line] ?? '';
      if (!regex) {
        return null;
      }

      const match = regex.exec(line);
      if (!match) {
        return null;
      }

      return {
        start: { line: position.line, character: match.index },
        end: { line: position.line, character: match.index + match[0].length },
      };
    },
  } as any;
}

function createMockIndex(files: Record<string, string>): IWorkspaceIndex {
  const mockUri = (path: string) => ({
    fsPath: path,
    scheme: 'file',
    toString: () => `file://${path}`,
  });

  const characterIndex = new Map<string, SymbolLocation[]>();

  for (const [uriStr, content] of Object.entries(files)) {
    const lines = content.split('\n');
    for (let line = 0; line < lines.length; line += 1) {
      const text = lines[line]?.trim() ?? '';
      if (!/^[A-Z][A-Z0-9 ._\-']+$/.test(text)) {
        continue;
      }

      const location = {
        uri: mockUri(uriStr) as any,
        name: text,
        kind: 'character' as const,
        range: {
          start: { line, character: 0 },
          end: { line, character: text.length },
        },
      };

      const list = characterIndex.get(text) ?? [];
      list.push(location);
      characterIndex.set(text, list);
    }
  }

  const sortCurrentFirst = (locations: readonly SymbolLocation[], currentUri?: any) => {
    if (!currentUri) {
      return locations;
    }

    const current = locations.filter(
      (location) => location.uri.toString() === currentUri.toString(),
    );
    const rest = locations.filter((location) => location.uri.toString() !== currentUri.toString());
    return [...current, ...rest];
  };

  return {
    ensureInitialized: async () => {},
    getDocument: () => undefined,
    findCharacterLocations: (name: string, currentUri?: any) =>
      sortCurrentFirst(characterIndex.get(name) ?? [], currentUri),
    findCharacterDefinition: (name: string, currentUri?: any) =>
      sortCurrentFirst(characterIndex.get(name) ?? [], currentUri)[0],
    findSceneLocations: () => [],
    findSectionLocations: () => [],
    searchSymbols: () => [],
    getAllCharacterNames: () => [],
    getAllSceneLocations: () => [],
    getScriptIndex: () => undefined,
    onDidUpdateIndex: (() => ({ dispose: () => {} })) as any,
    dispose: () => {},
  };
}

function createMockCharacterIndex(
  records: readonly CharacterRecord[],
  registryPath = '/project/characters.json',
): ICharacterWorkspaceIndex {
  const registry = {
    version: 1 as const,
    characters: records,
  };
  const byKey = new Map<
    string,
    {
      record: CharacterRecord;
      matchedName: string;
      matchSource: 'canonicalName' | 'displayName' | 'alias' | 'scriptName';
    }
  >();

  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

  for (const record of records) {
    for (const entry of [
      { value: record.canonicalName, source: 'canonicalName' as const },
      { value: record.displayName, source: 'displayName' as const },
      ...record.aliases.map((value) => ({ value, source: 'alias' as const })),
      ...(record.bindings?.scriptNames ?? []).map((value) => ({
        value,
        source: 'scriptName' as const,
      })),
    ]) {
      if (!entry.value || entry.value.trim().length === 0) {
        continue;
      }

      const key = normalize(entry.value);
      if (!byKey.has(key)) {
        byKey.set(key, {
          record,
          matchedName: entry.value,
          matchSource: entry.source,
        });
      }
    }
  }

  return {
    ensureInitialized: async () => {},
    getRegistry: () => registry,
    resolveCharacter: (name: string) => byKey.get(normalize(name)),
    getDefinition: (name: string) => {
      const resolved = byKey.get(normalize(name));
      if (!resolved) {
        return undefined;
      }

      return {
        uri: {
          fsPath: registryPath,
          scheme: 'file',
          toString: () => `file://${registryPath}`,
        },
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: resolved.record.id.length },
        },
      } as any;
    },
    getReferenceNames: (name: string) => {
      const resolved = byKey.get(normalize(name));
      return resolved
        ? Array.from(
            new Set([
              resolved.record.canonicalName,
              ...resolved.record.aliases,
              ...(resolved.record.bindings?.scriptNames ?? []),
            ]),
          )
        : [];
    },
    getAllCompletionNames: () => [],
    searchCharacters: () => [],
    dispose: () => {},
  };
}

const ALICE_RECORD: CharacterRecord = {
  id: 'char_alice',
  canonicalName: 'ALICE',
  displayName: 'Alice',
  aliases: ['ALLY'],
  status: 'confirmed',
  bindings: {
    scriptNames: ['ALICE', 'ALLY'],
  },
};

describe('FountainCharacterRenameProvider', () => {
  beforeEach(() => {
    vscodeState.openDocuments.clear();
  });

  it('prepares rename from a registry-backed script alias', async () => {
    const index = createMockIndex({
      '/project/story.fountain': `EXT. PARK - NIGHT\n\nALLY\nHello!`,
    });
    const characterIndex = createMockCharacterIndex([ALICE_RECORD]);
    const provider = new FountainCharacterRenameProvider(index, characterIndex);
    const document = createMockDocument(`EXT. PARK - NIGHT\n\nALLY\nHello!`);

    const result = await provider.prepareRename(
      document,
      { line: 2, character: 0 } as any,
      {} as any,
    );

    expect(result).toEqual({
      range: {
        start: { line: 2, character: 0 },
        end: { line: 2, character: 4 },
      },
      placeholder: 'ALICE',
    });
  });

  it('returns a workspace edit that updates only characters.json', async () => {
    const index = createMockIndex({
      '/project/story.fountain': `EXT. PARK - NIGHT\n\nALLY\nHello!`,
    });
    const characterIndex = createMockCharacterIndex([ALICE_RECORD]);
    const provider = new FountainCharacterRenameProvider(index, characterIndex);
    const document = createMockDocument(`EXT. PARK - NIGHT\n\nALLY\nHello!`);

    vscodeState.openDocuments.set(
      '/project/characters.json',
      JSON.stringify(
        {
          version: 1,
          characters: [ALICE_RECORD],
        },
        null,
        2,
      ),
    );

    const edit = await provider.provideRenameEdits(
      document,
      { line: 2, character: 0 } as any,
      'EVE',
      {} as any,
    );

    expect(edit).toBeDefined();
    const entries = (edit as any).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.uri.fsPath).toBe('/project/characters.json');

    const nextRegistry = JSON.parse(entries[0]?.newText ?? '{}');
    expect(nextRegistry.characters[0]?.canonicalName).toBe('EVE');
    expect(nextRegistry.characters[0]?.bindings?.scriptNames).toEqual(['ALICE', 'ALLY']);
  });
});

describe('FountainCharacterCodeActionProvider', () => {
  it('offers an explicit registry rename action for registry-backed characters', async () => {
    const index = createMockIndex({
      '/project/story.fountain': `EXT. PARK - NIGHT\n\nALLY\nHello!`,
    });
    const characterIndex = createMockCharacterIndex([ALICE_RECORD]);
    const provider = new FountainCharacterCodeActionProvider(index, characterIndex);
    const document = createMockDocument(`EXT. PARK - NIGHT\n\nALLY\nHello!`);

    const actions = await provider.provideCodeActions(
      document,
      {
        start: { line: 2, character: 0 },
        end: { line: 2, character: 4 },
      } as any,
      {} as any,
      {} as any,
    );

    expect(actions).toHaveLength(1);
    expect(actions[0]?.title).toBe('Rename character identity in registry');
    expect(actions[0]?.command?.command).toBe('editor.action.rename');
  });

  it('does not offer registry rename when the character has no registry binding', async () => {
    const index = createMockIndex({
      '/project/story.fountain': `EXT. PARK - NIGHT\n\nJOHN\nHello!`,
    });
    const characterIndex = createMockCharacterIndex([]);
    const provider = new FountainCharacterCodeActionProvider(index, characterIndex);
    const document = createMockDocument(`EXT. PARK - NIGHT\n\nJOHN\nHello!`);

    const actions = await provider.provideCodeActions(
      document,
      {
        start: { line: 2, character: 0 },
        end: { line: 2, character: 4 },
      } as any,
      {} as any,
      {} as any,
    );

    expect(actions).toEqual([]);
  });
});
