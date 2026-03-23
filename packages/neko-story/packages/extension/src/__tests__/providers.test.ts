import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parse } from '@neko-story/parser';
import type { FountainDocument } from '@neko-story/types';
import { FountainDocumentSymbolProvider } from '../providers/documentSymbol';
import { FountainDefinitionProvider, FountainReferenceProvider } from '../providers/definition';
import { FountainCompletionProvider } from '../providers/completion';
import { FountainHoverProvider } from '../providers/hover';
import { FountainWorkspaceSymbolProvider } from '../providers/workspaceSymbol';
import { FountainDocumentLinkProvider } from '../providers/documentLink';
import type { IWorkspaceIndex, SymbolLocation } from '../services/types';

// Mock vscode module
vi.mock('vscode', () => ({
  CompletionItem: class {
    label: string;
    kind: number;
    detail?: string;
    insertText?: string;
    sortText?: string;
    constructor(label: string, kind: number) {
      this.label = label;
      this.kind = kind;
    }
  },
  CompletionItemKind: {
    User: 0,
    Keyword: 1,
    Reference: 2,
    Constant: 3,
    Snippet: 4,
  },
  DocumentSymbol: class {
    name: string;
    detail: string;
    kind: number;
    range: any;
    selectionRange: any;
    children: any[];
    constructor(name: string, detail: string, kind: number, range: any, selectionRange: any) {
      this.name = name;
      this.detail = detail;
      this.kind = kind;
      this.range = range;
      this.selectionRange = selectionRange;
      this.children = [];
    }
  },
  SymbolKind: {
    Module: 0,
    Class: 1,
    Function: 2,
    Variable: 3,
    Namespace: 4,
    String: 5,
    Event: 6,
    Operator: 7,
  },
  SymbolInformation: class {
    name: string;
    kind: number;
    containerName: string;
    location: any;
    constructor(name: string, kind: number, containerName: string, location: any) {
      this.name = name;
      this.kind = kind;
      this.containerName = containerName;
      this.location = location;
    }
  },
  Range: class {
    start: any;
    end: any;
    constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
      this.start = { line: startLine, character: startChar };
      this.end = { line: endLine, character: endChar };
    }
  },
  Position: class {
    line: number;
    character: number;
    constructor(line: number, character: number) {
      this.line = line;
      this.character = character;
    }
  },
  Location: class {
    uri: any;
    range: any;
    constructor(uri: any, rangeOrPosition: any) {
      this.uri = uri;
      this.range = rangeOrPosition;
    }
  },
  Hover: class {
    contents: any;
    constructor(contents: any) {
      this.contents = contents;
    }
  },
  MarkdownString: class {
    value: string;
    constructor(value?: string) {
      this.value = value ?? '';
    }
    appendMarkdown(text: string) {
      this.value += text;
      return this;
    }
  },
  DocumentLink: class {
    range: any;
    target: any;
    tooltip?: string;
    constructor(range: any, target: any) {
      this.range = range;
      this.target = target;
    }
  },
  Uri: {
    file: (path: string) => ({ fsPath: path, toString: () => `file://${path}`, scheme: 'file' }),
    parse: (str: string) => ({
      fsPath: str.replace('file://', ''),
      toString: () => str,
      scheme: 'file',
    }),
  },
  EventEmitter: class {
    private _listeners: any[] = [];
    event = (listener: any) => {
      this._listeners.push(listener);
      return { dispose: () => {} };
    };
    fire(data: any) {
      this._listeners.forEach((l) => l(data));
    }
    dispose() {}
  },
}));

// -- Test Helpers --

function createMockDocument(text: string, uri = '/test.fountain') {
  const lines = text.split('\n');
  return {
    getText: (range?: any) => {
      if (!range) return text;
      // Simple range extraction for word ranges
      const line = lines[range.start.line] ?? '';
      return line.substring(range.start.character, range.end.character);
    },
    uri: { fsPath: uri, toString: () => `file://${uri}`, scheme: 'file' },
    lineAt: (line: number) => ({ text: lines[line] ?? '' }),
    positionAt: (offset: number) => {
      let remaining = offset;
      for (let i = 0; i < lines.length; i++) {
        const lineLen = (lines[i]?.length ?? 0) + 1; // +1 for newline
        if (remaining < lineLen) {
          return { line: i, character: remaining };
        }
        remaining -= lineLen;
      }
      return { line: lines.length - 1, character: 0 };
    },
    getWordRangeAtPosition: (position: any, regex?: RegExp) => {
      const line = lines[position.line] ?? '';
      if (!regex) return null;
      const match = regex.exec(line);
      if (!match) return null;
      return {
        start: { line: position.line, character: match.index },
        end: { line: position.line, character: match.index + match[0].length },
      };
    },
    languageId: 'nekostory',
  } as any;
}

/**
 * Creates a mock IWorkspaceIndex from a map of uri → fountain text.
 * Parses all files and builds character/scene/section indices.
 */
function createMockIndex(files: Record<string, string>): IWorkspaceIndex {
  // Inline mock constructors (vi.mock only intercepts ESM imports, not require)
  const MockRange = class {
    start: any;
    end: any;
    constructor(sl: number, sc: number, el: number, ec: number) {
      this.start = { line: sl, character: sc };
      this.end = { line: el, character: ec };
    }
  };
  const mockUri = (path: string) => ({
    fsPath: path,
    toString: () => `file://${path}`,
    scheme: 'file',
  });

  const parsedFiles = new Map<string, FountainDocument>();
  const characterIndex = new Map<string, SymbolLocation[]>();
  const sceneIndex = new Map<string, SymbolLocation[]>();
  const sectionIndex = new Map<string, SymbolLocation[]>();

  for (const [uriStr, content] of Object.entries(files)) {
    const doc = parse(content);
    parsedFiles.set(`file://${uriStr}`, doc);

    for (const element of doc.elements) {
      const range = new MockRange(
        element.range.start.line,
        element.range.start.character,
        element.range.end.line,
        element.range.end.character,
      );
      const uri = mockUri(uriStr);

      if (element.type === 'character') {
        const name = (element as any).name;
        if (!characterIndex.has(name)) characterIndex.set(name, []);
        characterIndex
          .get(name)!
          .push({ uri: uri as any, name, kind: 'character', range: range as any });
      } else if (element.type === 'scene_heading') {
        const location = (element as any).location;
        if (location) {
          if (!sceneIndex.has(location)) sceneIndex.set(location, []);
          sceneIndex
            .get(location)!
            .push({ uri: uri as any, name: location, kind: 'scene', range: range as any });
        }
      } else if (element.type === 'section') {
        const text = (element as any).text;
        if (!sectionIndex.has(text)) sectionIndex.set(text, []);
        sectionIndex
          .get(text)!
          .push({ uri: uri as any, name: text, kind: 'section', range: range as any });
      }
    }
  }

  const sortCurrentFirst = (
    locs: SymbolLocation[],
    currentUri?: any,
  ): readonly SymbolLocation[] => {
    if (!currentUri || locs.length === 0) return locs;
    const currentStr = currentUri.toString();
    const current = locs.filter((l) => l.uri.toString() === currentStr);
    const rest = locs.filter((l) => l.uri.toString() !== currentStr);
    return [...current, ...rest];
  };

  return {
    ensureInitialized: async () => {},
    getDocument: (uri: any) => parsedFiles.get(uri.toString()),
    findCharacterLocations: (name: string, currentUri?: any) =>
      sortCurrentFirst(characterIndex.get(name) ?? [], currentUri),
    findCharacterDefinition: (name: string, currentUri?: any) => {
      const sorted = sortCurrentFirst(characterIndex.get(name) ?? [], currentUri);
      return sorted[0];
    },
    findSceneLocations: (location: string, currentUri?: any) =>
      sortCurrentFirst(sceneIndex.get(location) ?? [], currentUri),
    findSectionLocations: (text: string, currentUri?: any) =>
      sortCurrentFirst(sectionIndex.get(text) ?? [], currentUri),
    searchSymbols: (query: string) => {
      const lowerQ = query.toLowerCase();
      const results: SymbolLocation[] = [];
      for (const [, locs] of characterIndex) {
        for (const l of locs) {
          if (l.name.toLowerCase().includes(lowerQ)) results.push(l);
        }
      }
      for (const [, locs] of sceneIndex) {
        for (const l of locs) {
          if (l.name.toLowerCase().includes(lowerQ)) results.push(l);
        }
      }
      for (const [, locs] of sectionIndex) {
        for (const l of locs) {
          if (l.name.toLowerCase().includes(lowerQ)) results.push(l);
        }
      }
      return results;
    },
    getAllCharacterNames: () => Array.from(characterIndex.keys()).sort(),
    getAllSceneLocations: () => Array.from(sceneIndex.keys()).sort(),
    onDidUpdateIndex: (() => ({ dispose: () => {} })) as any,
    dispose: () => {},
  };
}

// ============================================================
// Original Tests — Parser Integration
// ============================================================

describe('Parser Integration', () => {
  it('should parse scene headings correctly', () => {
    const text = `INT. COFFEE SHOP - DAY

JOHN walks in.`;

    const doc = parse(text);
    const scene = doc.elements[0];

    expect(scene?.type).toBe('scene_heading');
    if (scene?.type === 'scene_heading') {
      expect(scene.intExt).toBe('INT');
      expect(scene.location).toBe('COFFEE SHOP');
      expect(scene.time).toBe('DAY');
    }
  });

  it('should parse characters and dialogue', () => {
    const text = `INT. OFFICE - DAY

JOHN
Hello, world!

MARY (V.O.)
Hi there!`;

    const doc = parse(text);
    const characters = doc.elements.filter((e) => e.type === 'character');
    const dialogues = doc.elements.filter((e) => e.type === 'dialogue');

    expect(characters).toHaveLength(2);
    expect(dialogues).toHaveLength(2);

    if (characters[0]?.type === 'character') {
      expect(characters[0].name).toBe('JOHN');
    }
    if (characters[1]?.type === 'character') {
      expect(characters[1].name).toBe('MARY');
      expect(characters[1].extension).toBe('V.O.');
    }
  });

  it('should parse sections for outline', () => {
    const text = `# Act One

## Scene 1

INT. OFFICE - DAY

### Beat 1

JOHN enters.`;

    const doc = parse(text);
    const sections = doc.elements.filter((e) => e.type === 'section');

    expect(sections).toHaveLength(3);
    if (sections[0]?.type === 'section') {
      expect(sections[0].level).toBe(1);
      expect(sections[0].text).toBe('Act One');
    }
    if (sections[1]?.type === 'section') {
      expect(sections[1].level).toBe(2);
      expect(sections[1].text).toBe('Scene 1');
    }
    if (sections[2]?.type === 'section') {
      expect(sections[2].level).toBe(3);
      expect(sections[2].text).toBe('Beat 1');
    }
  });
});

describe('Character Collection', () => {
  it('should collect unique character names', () => {
    const text = `INT. OFFICE - DAY

JOHN
Hello!

MARY
Hi!

JOHN
How are you?`;

    const doc = parse(text);
    const characters = new Set<string>();

    for (const element of doc.elements) {
      if (element.type === 'character') {
        characters.add(element.name);
      }
    }

    expect(characters.size).toBe(2);
    expect(characters.has('JOHN')).toBe(true);
    expect(characters.has('MARY')).toBe(true);
  });
});

describe('Location Collection', () => {
  it('should collect unique locations', () => {
    const text = `INT. COFFEE SHOP - DAY

JOHN enters.

EXT. PARK - NIGHT

JOHN walks.

INT. COFFEE SHOP - NIGHT

JOHN returns.`;

    const doc = parse(text);
    const locations = new Set<string>();

    for (const element of doc.elements) {
      if (element.type === 'scene_heading' && element.location) {
        locations.add(element.location);
      }
    }

    expect(locations.size).toBe(2);
    expect(locations.has('COFFEE SHOP')).toBe(true);
    expect(locations.has('PARK')).toBe(true);
  });
});

describe('Range Tracking', () => {
  it('should track element positions', () => {
    const text = `INT. OFFICE - DAY

JOHN
Hello!`;

    const doc = parse(text);

    // Scene heading at line 0
    const scene = doc.elements[0];
    expect(scene?.range.start.line).toBe(0);

    // Character at line 2 (after blank line)
    const character = doc.elements.find((e) => e.type === 'character');
    expect(character?.range.start.line).toBe(2);

    // Dialogue at line 3
    const dialogue = doc.elements.find((e) => e.type === 'dialogue');
    expect(dialogue?.range.start.line).toBe(3);
  });
});

// ============================================================
// Document Symbol Provider — Enhanced Outline
// ============================================================

describe('Document Symbol Provider - Enhanced Outline', () => {
  it('should include characters under scene headings', () => {
    const text = `# Act One

INT. OFFICE - DAY

JOHN
Hello!

MARY
Hi there!`;

    const provider = new FountainDocumentSymbolProvider();
    const doc = createMockDocument(text);
    const symbols = provider.provideDocumentSymbols(doc, {} as any) as any[];

    // Root: Act One (section)
    expect(symbols).toHaveLength(1);
    const actOne = symbols[0];
    expect(actOne.name).toBe('Act One');

    // Act One > OFFICE (scene heading)
    const scene = actOne.children.find((c: any) => c.name === 'OFFICE');
    expect(scene).toBeDefined();

    // Scene > JOHN, MARY (characters)
    const charNames = scene.children.map((c: any) => c.name);
    expect(charNames).toContain('JOHN');
    expect(charNames).toContain('MARY');
  });

  it('should deduplicate characters within the same scene', () => {
    const text = `INT. OFFICE - DAY

JOHN
Hello!

MARY
Hi!

JOHN
How are you?`;

    const provider = new FountainDocumentSymbolProvider();
    const doc = createMockDocument(text);
    const symbols = provider.provideDocumentSymbols(doc, {} as any) as any[];

    const scene = symbols[0];
    expect(scene.name).toBe('OFFICE');

    const johns = scene.children.filter((c: any) => c.name === 'JOHN');
    expect(johns).toHaveLength(1);
  });

  it('should include transitions as Event symbols', () => {
    const text = `INT. OFFICE - DAY

JOHN
Hello!

CUT TO:

INT. PARK - DAY`;

    const provider = new FountainDocumentSymbolProvider();
    const doc = createMockDocument(text);
    const symbols = provider.provideDocumentSymbols(doc, {} as any) as any[];

    const allChildren = symbols.flatMap((s: any) => [s, ...s.children]);
    const transition = allChildren.find((c: any) => c.name === 'CUT TO:');
    expect(transition).toBeDefined();
    expect(transition.kind).toBe(6);
  });

  it('should include synopsis under section', () => {
    const text = `# Act One

= A brief summary of act one

INT. OFFICE - DAY`;

    const provider = new FountainDocumentSymbolProvider();
    const doc = createMockDocument(text);
    const symbols = provider.provideDocumentSymbols(doc, {} as any) as any[];

    const actOne = symbols[0];
    expect(actOne.name).toBe('Act One');

    const synopsis = actOne.children.find((c: any) => c.detail === 'synopsis');
    expect(synopsis).toBeDefined();
    expect(synopsis.name).toBe('A brief summary of act one');
  });

  it('should include page breaks as Operator symbols', () => {
    const text = `INT. OFFICE - DAY

JOHN
Hello!

===

INT. PARK - DAY`;

    const provider = new FountainDocumentSymbolProvider();
    const doc = createMockDocument(text);
    const symbols = provider.provideDocumentSymbols(doc, {} as any) as any[];

    const allSymbols = symbols.flatMap((s: any) => [s, ...s.children]);
    const pageBreak = allSymbols.find((c: any) => c.detail === 'page break');
    expect(pageBreak).toBeDefined();
    expect(pageBreak.name).toBe('\u2550\u2550\u2550');
    expect(pageBreak.kind).toBe(7);
  });

  it('should reset character dedup on new scene', () => {
    const text = `INT. OFFICE - DAY

JOHN
Hello!

INT. PARK - DAY

JOHN
Hi again!`;

    const provider = new FountainDocumentSymbolProvider();
    const doc = createMockDocument(text);
    const symbols = provider.provideDocumentSymbols(doc, {} as any) as any[];

    expect(symbols).toHaveLength(2);

    const scene1John = symbols[0].children.find((c: any) => c.name === 'JOHN');
    const scene2John = symbols[1].children.find((c: any) => c.name === 'JOHN');
    expect(scene1John).toBeDefined();
    expect(scene2John).toBeDefined();
  });

  it('should place child elements at root when no parent exists', () => {
    const text = `INT. OFFICE - DAY

JOHN
Hello!

CUT TO:`;

    const provider = new FountainDocumentSymbolProvider();
    const doc = createMockDocument(text);
    const symbols = provider.provideDocumentSymbols(doc, {} as any) as any[];

    expect(symbols.length).toBeGreaterThanOrEqual(1);
    const scene = symbols[0];
    expect(scene.name).toBe('OFFICE');
    const transition = scene.children.find((c: any) => c.name === 'CUT TO:');
    expect(transition).toBeDefined();
  });
});

// ============================================================
// Cross-File Tests — Mock Index
// ============================================================

const FILE_A = `# Act One

INT. OFFICE - DAY

JOHN
Hello!

MARY
Hi there!

INT. COFFEE SHOP - NIGHT

JOHN
Good evening.`;

const FILE_B = `# Act Two

EXT. PARK - DAY

JOHN
Walking around.

ALICE
Nice day!

INT. OFFICE - NIGHT

ALICE
Working late.`;

describe('Mock Index — Multi-file indexing', () => {
  let index: IWorkspaceIndex;

  beforeEach(() => {
    index = createMockIndex({
      '/project/a.fountain': FILE_A,
      '/project/b.fountain': FILE_B,
    });
  });

  it('should collect all character names across files', () => {
    const names = index.getAllCharacterNames();
    expect(names).toContain('JOHN');
    expect(names).toContain('MARY');
    expect(names).toContain('ALICE');
    expect(names).toHaveLength(3);
  });

  it('should collect all scene locations across files', () => {
    const locations = index.getAllSceneLocations();
    expect(locations).toContain('OFFICE');
    expect(locations).toContain('COFFEE SHOP');
    expect(locations).toContain('PARK');
    expect(locations).toHaveLength(3);
  });

  it('should find character locations across files', () => {
    const johnLocs = index.findCharacterLocations('JOHN');
    // JOHN appears 2 times in file A, 1 time in file B
    expect(johnLocs.length).toBe(3);

    const fileUris = johnLocs.map((l) => l.uri.fsPath);
    expect(fileUris.filter((f) => f === '/project/a.fountain')).toHaveLength(2);
    expect(fileUris.filter((f) => f === '/project/b.fountain')).toHaveLength(1);
  });

  it('should find character definition (first occurrence, current file preferred)', () => {
    const uriB = { toString: () => 'file:///project/b.fountain' } as any;
    const def = index.findCharacterDefinition('JOHN', uriB);
    expect(def).toBeDefined();
    // Should prefer file B since it's the current file
    expect(def!.uri.fsPath).toBe('/project/b.fountain');
  });

  it('should find scene locations across files', () => {
    const officeLocs = index.findSceneLocations('OFFICE');
    // OFFICE appears in both files
    expect(officeLocs.length).toBe(2);
    const files = new Set(officeLocs.map((l) => l.uri.fsPath));
    expect(files.has('/project/a.fountain')).toBe(true);
    expect(files.has('/project/b.fountain')).toBe(true);
  });

  it('should find section locations across files', () => {
    const actOneLocs = index.findSectionLocations('Act One');
    expect(actOneLocs.length).toBe(1);
    expect(actOneLocs[0]!.uri.fsPath).toBe('/project/a.fountain');

    const actTwoLocs = index.findSectionLocations('Act Two');
    expect(actTwoLocs.length).toBe(1);
    expect(actTwoLocs[0]!.uri.fsPath).toBe('/project/b.fountain');
  });

  it('should search symbols by query', () => {
    const results = index.searchSymbols('john');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.name === 'JOHN')).toBe(true);
  });

  it('should search symbols case-insensitively', () => {
    const results = index.searchSymbols('OFFICE');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.name === 'OFFICE')).toBe(true);
  });

  it('should return empty for unknown symbols', () => {
    expect(index.findCharacterLocations('UNKNOWN')).toHaveLength(0);
    expect(index.findSceneLocations('NOWHERE')).toHaveLength(0);
    expect(index.searchSymbols('zzzzz')).toHaveLength(0);
  });
});

// ============================================================
// Cross-File Provider Tests — Definition, Reference, Completion, Hover, WorkspaceSymbol, DocumentLink
// ============================================================

describe('DefinitionProvider — Cross-file', () => {
  it('should find character definition across files', async () => {
    const index = createMockIndex({
      '/project/a.fountain': FILE_A,
      '/project/b.fountain': FILE_B,
    });
    const provider = new FountainDefinitionProvider(index);
    const doc = createMockDocument(FILE_B, '/project/b.fountain');

    const result = await provider.provideDefinition(
      doc,
      { line: 4, character: 0 }, // JOHN line in file B
      {} as any,
    );

    expect(result).toBeDefined();
    // Should find JOHN — preferring current file B
    expect(result.uri.fsPath).toBe('/project/b.fountain');
  });

  it('should return null for non-character words', async () => {
    const index = createMockIndex({ '/test.fountain': FILE_A });
    const provider = new FountainDefinitionProvider(index);
    const doc = createMockDocument('hello world', '/test.fountain');

    const result = await provider.provideDefinition(doc, { line: 0, character: 0 }, {} as any);

    expect(result).toBeNull();
  });
});

describe('ReferenceProvider — Cross-file', () => {
  it('should find all character references across files', async () => {
    const index = createMockIndex({
      '/project/a.fountain': FILE_A,
      '/project/b.fountain': FILE_B,
    });
    const provider = new FountainReferenceProvider(index);
    const doc = createMockDocument(FILE_A, '/project/a.fountain');

    const results = await provider.provideReferences(
      doc,
      { line: 4, character: 0 }, // JOHN line in file A
      {} as any,
      {} as any,
    );

    // JOHN appears 2x in A, 1x in B = 3 total
    expect(results.length).toBe(3);
    const files = results.map((r: any) => r.uri.fsPath);
    expect(files.filter((f: string) => f === '/project/a.fountain')).toHaveLength(2);
    expect(files.filter((f: string) => f === '/project/b.fountain')).toHaveLength(1);
  });
});

describe('CompletionProvider — Cross-file', () => {
  it('should suggest characters from all files', async () => {
    const index = createMockIndex({
      '/project/a.fountain': FILE_A,
      '/project/b.fountain': FILE_B,
    });
    const provider = new FountainCompletionProvider(index);

    // Simulate typing after a blank line (character context)
    const text = `INT. NEW SCENE - DAY

J`;
    const doc = createMockDocument(text, '/project/c.fountain');

    const items = await provider.provideCompletionItems(
      doc,
      { line: 2, character: 1 },
      {} as any,
      {} as any,
    );

    const charItems = items.filter((i: any) => i.detail === 'Character');
    const names = charItems.map((i: any) => i.label);
    expect(names).toContain('JOHN');
    expect(names).toContain('MARY');
    expect(names).toContain('ALICE');
  });

  it('should suggest scene locations from all files', async () => {
    const index = createMockIndex({
      '/project/a.fountain': FILE_A,
      '/project/b.fountain': FILE_B,
    });
    const provider = new FountainCompletionProvider(index);

    const text = `INT. `;
    const doc = createMockDocument(text, '/project/c.fountain');

    const items = await provider.provideCompletionItems(
      doc,
      { line: 0, character: 5 },
      {} as any,
      {} as any,
    );

    const locationItems = items.filter((i: any) => i.detail === 'Previous location');
    const names = locationItems.map((i: any) => i.label);
    expect(names).toContain('OFFICE');
    expect(names).toContain('COFFEE SHOP');
    expect(names).toContain('PARK');
  });
});

describe('WorkspaceSymbolProvider — Cross-file', () => {
  it('should return matching symbols from all files', async () => {
    const index = createMockIndex({
      '/project/a.fountain': FILE_A,
      '/project/b.fountain': FILE_B,
    });
    const provider = new FountainWorkspaceSymbolProvider(index);

    const results = await provider.provideWorkspaceSymbols('Act', {} as any);

    expect(results.length).toBeGreaterThanOrEqual(2);
    const names = results.map((r: any) => r.name);
    expect(names).toContain('Act One');
    expect(names).toContain('Act Two');
  });

  it('should return character symbols matching query', async () => {
    const index = createMockIndex({
      '/project/a.fountain': FILE_A,
      '/project/b.fountain': FILE_B,
    });
    const provider = new FountainWorkspaceSymbolProvider(index);

    const results = await provider.provideWorkspaceSymbols('alice', {} as any);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r: any) => r.name === 'ALICE')).toBe(true);
  });

  it('should return empty for no match', async () => {
    const index = createMockIndex({ '/test.fountain': FILE_A });
    const provider = new FountainWorkspaceSymbolProvider(index);

    const results = await provider.provideWorkspaceSymbols('zzzzz', {} as any);
    expect(results).toHaveLength(0);
  });
});

describe('HoverProvider — Cross-file stats', () => {
  it('should show cross-file stats when character appears in multiple files', async () => {
    const index = createMockIndex({
      '/project/a.fountain': FILE_A,
      '/project/b.fountain': FILE_B,
    });
    const provider = new FountainHoverProvider(index);
    const doc = createMockDocument(FILE_A, '/project/a.fountain');

    // Hover over JOHN (line 4 in FILE_A)
    const result = await provider.provideHover(doc, { line: 4, character: 0 }, {} as any);

    expect(result).toBeDefined();
    const md = result.contents;
    // Should mention cross-file stats
    expect(md.value).toContain('JOHN');
    expect(md.value).toContain('2 files');
  });

  it('should not show cross-file line when character is in single file', async () => {
    const index = createMockIndex({
      '/project/a.fountain': FILE_A,
    });
    const provider = new FountainHoverProvider(index);
    const doc = createMockDocument(FILE_A, '/project/a.fountain');

    // Hover over MARY (line 7 in FILE_A)
    const result = await provider.provideHover(doc, { line: 7, character: 0 }, {} as any);

    expect(result).toBeDefined();
    const md = result.contents;
    expect(md.value).toContain('MARY');
    // Should NOT contain "files" since MARY is only in one file
    expect(md.value).not.toContain('files');
  });
});

describe('DocumentLinkProvider', () => {
  it('should detect [[see: file.fountain]] links', () => {
    const text = `INT. OFFICE - DAY

Check the other script: [[see: other-script.fountain]]

JOHN
Hello!`;

    const provider = new FountainDocumentLinkProvider();
    const doc = createMockDocument(text, '/project/main.fountain');

    const links = provider.provideDocumentLinks(doc, {} as any);

    expect(links).toHaveLength(1);
    expect(links[0].tooltip).toContain('other-script.fountain');
  });

  it('should detect multiple links in one document', () => {
    const text = `[[see: a.fountain]]
Some text
[[see: sub/b.fountain]]
More text
[[see: c.fountain]]`;

    const provider = new FountainDocumentLinkProvider();
    const doc = createMockDocument(text, '/project/main.fountain');

    const links = provider.provideDocumentLinks(doc, {} as any);

    expect(links).toHaveLength(3);
  });

  it('should not match non-fountain extensions', () => {
    const text = `[[see: readme.md]]
[[see: image.png]]`;

    const provider = new FountainDocumentLinkProvider();
    const doc = createMockDocument(text, '/project/main.fountain');

    const links = provider.provideDocumentLinks(doc, {} as any);
    expect(links).toHaveLength(0);
  });

  it('should handle [[see: ...]] with spaces around path', () => {
    const text = `[[see:   spaced.fountain  ]]`;

    const provider = new FountainDocumentLinkProvider();
    const doc = createMockDocument(text, '/project/main.fountain');

    const links = provider.provideDocumentLinks(doc, {} as any);
    expect(links).toHaveLength(1);
  });
});

import { checkSyntax, checkSemantics } from '../providers/diagnostics';

describe('checkSyntax', () => {
  it('detects unclosed inline note', () => {
    const text = 'This is [[unclosed note\nNext line';
    const diags = checkSyntax(text);
    expect(diags.some((d) => d.severity === 'error' && d.message.includes('[['))).toBe(true);
  });

  it('passes when note is closed on same line', () => {
    const text = 'This is [[a note]] and continues';
    const diags = checkSyntax(text);
    expect(diags.filter((d) => d.message.includes('[['))).toHaveLength(0);
  });

  it('detects unclosed boneyard', () => {
    const text = 'Normal line\n/* unclosed boneyard\nAnother line';
    const diags = checkSyntax(text);
    expect(diags.some((d) => d.severity === 'error' && d.message.includes('/*'))).toBe(true);
  });

  it('passes when boneyard is closed', () => {
    const text = '/* closed */ normal';
    const diags = checkSyntax(text);
    expect(diags.filter((d) => d.message.includes('/*'))).toHaveLength(0);
  });

  it('detects empty transition', () => {
    const text = 'INT. OFFICE - DAY\n\n>\n\nSome action';
    const diags = checkSyntax(text);
    expect(
      diags.some((d) => d.severity === 'warning' && d.message.toLowerCase().includes('transition')),
    ).toBe(true);
  });
});

describe('checkSemantics', () => {
  it('detects dialogue without preceding character', () => {
    const script = `INT. OFFICE - DAY

Hello there.

Some action.`;
    const doc = parse(script);
    const diags = checkSemantics(doc);
    expect(Array.isArray(diags)).toBe(true);
  });

  it('warns when character appears only once', () => {
    const script = `INT. OFFICE - DAY

ALICE
Hello world.

INT. PARK - DAY

BOB
Hi there.

BOB
How are you?`;
    const doc = parse(script);
    const diags = checkSemantics(doc);
    const aliceWarning = diags.find((d) => d.message.includes('ALICE'));
    expect(aliceWarning?.severity).toBe('warning');
    expect(diags.find((d) => d.message.includes('BOB'))).toBeUndefined();
  });
});
