import { describe, it, expect } from 'vitest';
import { parse } from '../parser';

describe('FountainParser', () => {
  describe('Title Page', () => {
    it('should parse title page entries', () => {
      const text = `Title: My Script
Author: John Doe
Draft date: 2024-01-01

INT. OFFICE - DAY`;

      const doc = parse(text);

      expect(doc.titlePage).not.toBeNull();
      expect(doc.titlePage?.entries).toHaveLength(3);
      expect(doc.titlePage?.entries[0]).toEqual({ key: 'Title', value: 'My Script' });
      expect(doc.titlePage?.entries[1]).toEqual({ key: 'Author', value: 'John Doe' });
      expect(doc.titlePage?.entries[2]).toEqual({ key: 'Draft date', value: '2024-01-01' });
    });

    it('should handle document without title page', () => {
      const text = `INT. OFFICE - DAY

JOHN walks in.`;

      const doc = parse(text);

      expect(doc.titlePage).toBeNull();
      expect(doc.elements.length).toBeGreaterThan(0);
    });
  });

  describe('Scene Headings', () => {
    it('should parse INT scene heading', () => {
      const text = `INT. COFFEE SHOP - DAY`;

      const doc = parse(text);
      const scene = doc.elements[0];

      expect(scene?.type).toBe('scene_heading');
      if (scene?.type === 'scene_heading') {
        expect(scene.intExt).toBe('INT');
        expect(scene.location).toBe('COFFEE SHOP');
        expect(scene.time).toBe('DAY');
      }
    });

    it('should parse EXT scene heading', () => {
      const text = `EXT. PARK - NIGHT`;

      const doc = parse(text);
      const scene = doc.elements[0];

      expect(scene?.type).toBe('scene_heading');
      if (scene?.type === 'scene_heading') {
        expect(scene.intExt).toBe('EXT');
        expect(scene.location).toBe('PARK');
        expect(scene.time).toBe('NIGHT');
      }
    });

    it('should parse INT/EXT scene heading', () => {
      const text = `INT/EXT. CAR - MOVING`;

      const doc = parse(text);
      const scene = doc.elements[0];

      expect(scene?.type).toBe('scene_heading');
      if (scene?.type === 'scene_heading') {
        expect(scene.intExt).toBe('INT/EXT');
        expect(scene.location).toBe('CAR');
        expect(scene.time).toBe('MOVING');
      }
    });

    it('should parse forced scene heading', () => {
      const text = `.FLASHBACK`;

      const doc = parse(text);
      const scene = doc.elements[0];

      expect(scene?.type).toBe('scene_heading');
      if (scene?.type === 'scene_heading') {
        expect(scene.forced).toBe(true);
        expect(scene.location).toBe('FLASHBACK');
      }
    });

    it('should parse scene number', () => {
      const text = `INT. OFFICE - DAY #1#`;

      const doc = parse(text);
      const scene = doc.elements[0];

      expect(scene?.type).toBe('scene_heading');
      if (scene?.type === 'scene_heading') {
        expect(scene.sceneNumber).toBe('1');
      }
    });
  });

  describe('Characters and Dialogue', () => {
    it('should parse character name', () => {
      const text = `INT. OFFICE - DAY

JOHN
Hello, world!`;

      const doc = parse(text);
      const character = doc.elements.find(e => e.type === 'character');

      expect(character?.type).toBe('character');
      if (character?.type === 'character') {
        expect(character.name).toBe('JOHN');
        expect(character.extension).toBeNull();
      }
    });

    it('should parse character with extension', () => {
      const text = `INT. OFFICE - DAY

JOHN (V.O.)
Hello, world!`;

      const doc = parse(text);
      const character = doc.elements.find(e => e.type === 'character');

      expect(character?.type).toBe('character');
      if (character?.type === 'character') {
        expect(character.name).toBe('JOHN');
        expect(character.extension).toBe('V.O.');
      }
    });

    it('should parse dialogue', () => {
      const text = `INT. OFFICE - DAY

JOHN
Hello, world!`;

      const doc = parse(text);
      const dialogue = doc.elements.find(e => e.type === 'dialogue');

      expect(dialogue?.type).toBe('dialogue');
      if (dialogue?.type === 'dialogue') {
        expect(dialogue.text).toBe('Hello, world!');
      }
    });

    it('should parse parenthetical', () => {
      const text = `INT. OFFICE - DAY

JOHN
(whispering)
Hello, world!`;

      const doc = parse(text);
      const paren = doc.elements.find(e => e.type === 'parenthetical');

      expect(paren?.type).toBe('parenthetical');
      if (paren?.type === 'parenthetical') {
        expect(paren.text).toBe('whispering');
      }
    });

    it('should parse dual dialogue', () => {
      const text = `INT. OFFICE - DAY

JOHN
Hello!

MARY ^
Hi there!`;

      const doc = parse(text);
      const dualChar = doc.elements.find(
        e => e.type === 'character' && (e as any).isDualDialogue
      );

      expect(dualChar).toBeDefined();
      if (dualChar?.type === 'character') {
        expect(dualChar.isDualDialogue).toBe(true);
      }
    });
  });

  describe('Action', () => {
    it('should parse action text', () => {
      const text = `INT. OFFICE - DAY

John walks into the room and looks around.`;

      const doc = parse(text);
      const action = doc.elements.find(e => e.type === 'action');

      expect(action?.type).toBe('action');
      if (action?.type === 'action') {
        expect(action.text).toBe('John walks into the room and looks around.');
      }
    });

    it('should parse forced action', () => {
      const text = `!JOHN walks in.`;

      const doc = parse(text);
      const action = doc.elements[0];

      expect(action?.type).toBe('action');
      if (action?.type === 'action') {
        expect(action.forced).toBe(true);
        expect(action.text).toBe('JOHN walks in.');
      }
    });
  });

  describe('Transitions', () => {
    it('should parse transition ending with TO:', () => {
      const text = `INT. OFFICE - DAY

CUT TO:`;

      const doc = parse(text);
      const transition = doc.elements.find(e => e.type === 'transition');

      expect(transition?.type).toBe('transition');
      if (transition?.type === 'transition') {
        expect(transition.text).toBe('CUT TO:');
      }
    });

    it('should parse forced transition', () => {
      const text = `>FADE OUT.`;

      const doc = parse(text);
      const transition = doc.elements[0];

      expect(transition?.type).toBe('transition');
      if (transition?.type === 'transition') {
        expect(transition.forced).toBe(true);
        expect(transition.text).toBe('FADE OUT.');
      }
    });
  });

  describe('Sections and Synopsis', () => {
    it('should parse section heading', () => {
      const text = `# Act One`;

      const doc = parse(text);
      const section = doc.elements[0];

      expect(section?.type).toBe('section');
      if (section?.type === 'section') {
        expect(section.level).toBe(1);
        expect(section.text).toBe('Act One');
      }
    });

    it('should parse nested section', () => {
      const text = `## Scene 1`;

      const doc = parse(text);
      const section = doc.elements[0];

      expect(section?.type).toBe('section');
      if (section?.type === 'section') {
        expect(section.level).toBe(2);
        expect(section.text).toBe('Scene 1');
      }
    });

    it('should parse synopsis', () => {
      const text = `= John meets Mary for the first time.`;

      const doc = parse(text);
      const synopsis = doc.elements[0];

      expect(synopsis?.type).toBe('synopsis');
      if (synopsis?.type === 'synopsis') {
        expect(synopsis.text).toBe('John meets Mary for the first time.');
      }
    });
  });

  describe('Other Elements', () => {
    it('should parse centered text', () => {
      const text = `>THE END<`;

      const doc = parse(text);
      const centered = doc.elements[0];

      expect(centered?.type).toBe('centered');
      if (centered?.type === 'centered') {
        expect(centered.text).toBe('THE END');
      }
    });

    it('should parse page break', () => {
      const text = `===`;

      const doc = parse(text);
      const pageBreak = doc.elements[0];

      expect(pageBreak?.type).toBe('page_break');
    });

    it('should parse lyrics', () => {
      const text = `~Singing in the rain`;

      const doc = parse(text);
      const lyrics = doc.elements[0];

      expect(lyrics?.type).toBe('lyrics');
      if (lyrics?.type === 'lyrics') {
        expect(lyrics.text).toBe('Singing in the rain');
      }
    });

    it('should parse line note', () => {
      const text = `// This is a note`;

      const doc = parse(text);
      const note = doc.elements[0];

      expect(note?.type).toBe('note');
      if (note?.type === 'note') {
        expect(note.text).toBe('This is a note');
        expect(note.noteType).toBe('line');
      }
    });
  });

  describe('Range Information', () => {
    it('should include correct range for elements', () => {
      const text = `INT. OFFICE - DAY

JOHN
Hello!`;

      const doc = parse(text);
      const scene = doc.elements[0];

      expect(scene?.range.start.line).toBe(0);
      expect(scene?.range.start.character).toBe(0);
    });
  });

  describe('Complex Document', () => {
    it('should parse a complete screenplay', () => {
      const text = `Title: Test Script
Author: Test Author

# Act One

INT. COFFEE SHOP - DAY

= John meets Mary.

JOHN
(nervously)
Hi, I'm John.

MARY
Nice to meet you.

CUT TO:

EXT. PARK - NIGHT

They walk together.

>THE END<`;

      const doc = parse(text);

      expect(doc.titlePage).not.toBeNull();
      expect(doc.elements.length).toBeGreaterThan(5);

      const types = doc.elements.map(e => e.type);
      expect(types).toContain('section');
      expect(types).toContain('scene_heading');
      expect(types).toContain('synopsis');
      expect(types).toContain('character');
      expect(types).toContain('parenthetical');
      expect(types).toContain('dialogue');
      expect(types).toContain('transition');
      expect(types).toContain('action');
      expect(types).toContain('centered');
    });
  });
});
