import { describe, it, expect, vi } from 'vitest';
import { parse } from '@neko-story/parser';

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
    constructor(uri: any, range: any) {
      this.uri = uri;
      this.range = range;
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
}));

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
    const characters = doc.elements.filter(e => e.type === 'character');
    const dialogues = doc.elements.filter(e => e.type === 'dialogue');

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
    const sections = doc.elements.filter(e => e.type === 'section');

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
    const character = doc.elements.find(e => e.type === 'character');
    expect(character?.range.start.line).toBe(2);

    // Dialogue at line 3
    const dialogue = doc.elements.find(e => e.type === 'dialogue');
    expect(dialogue?.range.start.line).toBe(3);
  });
});
