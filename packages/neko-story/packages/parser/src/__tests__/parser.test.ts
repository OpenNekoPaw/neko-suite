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
      const character = doc.elements.find((e) => e.type === 'character');

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
      const character = doc.elements.find((e) => e.type === 'character');

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
      const dialogue = doc.elements.find((e) => e.type === 'dialogue');

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
      const paren = doc.elements.find((e) => e.type === 'parenthetical');

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
        (e) => e.type === 'character' && (e as any).isDualDialogue,
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
      const action = doc.elements.find((e) => e.type === 'action');

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
      const transition = doc.elements.find((e) => e.type === 'transition');

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

      const types = doc.elements.map((e) => e.type);
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

  describe('Asset References', () => {
    it('should parse IMAGE asset reference from note', () => {
      const text = `INT. LAB - NIGHT

[[IMAGE: diagram.png]]

The scientist points at the screen.`;

      const doc = parse(text);
      const note = doc.elements.find((e) => e.type === 'note');

      expect(note?.type).toBe('note');
      if (note?.type === 'note') {
        expect(note.assetRef).toBeDefined();
        expect(note.assetRef?.type).toBe('image');
        expect(note.assetRef?.path).toBe('diagram.png');
      }
    });

    it('should parse VIDEO asset reference from note', () => {
      const text = `INT. OFFICE - DAY

[[VIDEO: establishing-shot.mp4]]

John enters the room.`;

      const doc = parse(text);
      const note = doc.elements.find((e) => e.type === 'note');

      expect(note?.type).toBe('note');
      if (note?.type === 'note') {
        expect(note.assetRef).toBeDefined();
        expect(note.assetRef?.type).toBe('video');
        expect(note.assetRef?.path).toBe('establishing-shot.mp4');
      }
    });

    it('should parse AUDIO asset reference from note', () => {
      const text = `INT. STUDIO - DAY

[[AUDIO: background-music.wav]]

Recording in progress.`;

      const doc = parse(text);
      const note = doc.elements.find((e) => e.type === 'note');

      expect(note?.type).toBe('note');
      if (note?.type === 'note') {
        expect(note.assetRef).toBeDefined();
        expect(note.assetRef?.type).toBe('audio');
        expect(note.assetRef?.path).toBe('background-music.wav');
      }
    });

    it('should parse ASSET with protocol prefix', () => {
      const text = `INT. LAB - NIGHT

[[ASSET: image://path/to/diagram.png]]

Complex diagram appears.`;

      const doc = parse(text);
      const note = doc.elements.find((e) => e.type === 'note');

      expect(note?.type).toBe('note');
      if (note?.type === 'note') {
        expect(note.assetRef).toBeDefined();
        expect(note.assetRef?.type).toBe('image');
        expect(note.assetRef?.path).toBe('path/to/diagram.png');
      }
    });

    it('should handle note without asset reference', () => {
      const text = `INT. OFFICE - DAY

[[This is just a regular note]]

John walks in.`;

      const doc = parse(text);
      const note = doc.elements.find((e) => e.type === 'note');

      expect(note?.type).toBe('note');
      if (note?.type === 'note') {
        expect(note.assetRef).toBeUndefined();
        expect(note.text).toBe('This is just a regular note');
      }
    });

    it('should parse multiple asset references in a scene', () => {
      const text = `INT. LAB - NIGHT

[[IMAGE: slide_01.png]]

The first slide appears.

[[IMAGE: slide_02.png]]

The second slide appears.`;

      const doc = parse(text);
      const notes = doc.elements.filter((e) => e.type === 'note');

      expect(notes).toHaveLength(2);
      expect(notes[0]?.type === 'note' && notes[0].assetRef?.path).toBe('slide_01.png');
      expect(notes[1]?.type === 'note' && notes[1].assetRef?.path).toBe('slide_02.png');
    });
  });

  describe('CJK Support', () => {
    describe('CJK Scene Headings', () => {
      it('should parse simplified 内景 as INT', () => {
        const doc = parse('内景 咖啡厅 - 日');
        const scene = doc.elements[0];

        expect(scene?.type).toBe('scene_heading');
        if (scene?.type === 'scene_heading') {
          expect(scene.intExt).toBe('INT');
          expect(scene.location).toBe('咖啡厅');
          expect(scene.time).toBe('日');
        }
      });

      it('should parse traditional 內景 as INT', () => {
        const doc = parse('內景 咖啡廳 - 日');
        const scene = doc.elements[0];

        expect(scene?.type).toBe('scene_heading');
        if (scene?.type === 'scene_heading') {
          expect(scene.intExt).toBe('INT');
          expect(scene.location).toBe('咖啡廳');
          expect(scene.time).toBe('日');
        }
      });

      it('should parse 外景 as EXT', () => {
        const doc = parse('外景 公园 - 夜');
        const scene = doc.elements[0];

        expect(scene?.type).toBe('scene_heading');
        if (scene?.type === 'scene_heading') {
          expect(scene.intExt).toBe('EXT');
          expect(scene.location).toBe('公园');
          expect(scene.time).toBe('夜');
        }
      });

      it('should parse 内外景 as INT/EXT', () => {
        const doc = parse('内外景 汽车 - 行驶中');
        const scene = doc.elements[0];

        expect(scene?.type).toBe('scene_heading');
        if (scene?.type === 'scene_heading') {
          expect(scene.intExt).toBe('INT/EXT');
          expect(scene.location).toBe('汽车');
          expect(scene.time).toBe('行驶中');
        }
      });

      it('should parse CJK scene heading with scene number', () => {
        const doc = parse('内景 办公室 - 日 #3#');
        const scene = doc.elements[0];

        expect(scene?.type).toBe('scene_heading');
        if (scene?.type === 'scene_heading') {
          expect(scene.sceneNumber).toBe('3');
        }
      });

      it('should parse CJK scene heading with em dash separator', () => {
        const doc = parse('外景 街道—夜');
        const scene = doc.elements[0];

        expect(scene?.type).toBe('scene_heading');
        if (scene?.type === 'scene_heading') {
          expect(scene.intExt).toBe('EXT');
          expect(scene.location).toBe('街道');
          expect(scene.time).toBe('夜');
        }
      });
    });

    describe('CJK Character Names', () => {
      it('should detect CJK character name followed by dialogue', () => {
        const text = `内景 办公室 - 日\n\n李明\n你好！`;
        const doc = parse(text);
        const character = doc.elements.find((e) => e.type === 'character');

        expect(character?.type).toBe('character');
        if (character?.type === 'character') {
          expect(character.name).toBe('李明');
          expect(character.forced).toBe(false);
        }
      });

      it('should detect CJK character with full-width paren extension', () => {
        const text = `内景 办公室 - 日\n\n张三丰（画外音）\n在这里等着。`;
        const doc = parse(text);
        const character = doc.elements.find((e) => e.type === 'character');

        expect(character?.type).toBe('character');
        if (character?.type === 'character') {
          expect(character.name).toBe('张三丰');
          expect(character.extension).toBe('画外音');
        }
      });

      it('should detect CJK character with ASCII paren extension', () => {
        const text = `内景 办公室 - 日\n\n李明 (V.O.)\n一段独白。`;
        const doc = parse(text);
        const character = doc.elements.find((e) => e.type === 'character');

        expect(character?.type).toBe('character');
        if (character?.type === 'character') {
          expect(character.name).toBe('李明');
          expect(character.extension).toBe('V.O.');
        }
      });

      it('should detect CJK dual dialogue', () => {
        const text = `内景 办公室 - 日\n\n李明\n你好！\n\n王芳 ^\n嗨！`;
        const doc = parse(text);
        const dualChar = doc.elements.find(
          (e) => e.type === 'character' && (e as any).isDualDialogue,
        );

        expect(dualChar).toBeDefined();
        if (dualChar?.type === 'character') {
          expect(dualChar.name).toBe('王芳');
          expect(dualChar.isDualDialogue).toBe(true);
        }
      });

      it('should detect single CJK character name', () => {
        const text = `内景 宫殿 - 日\n\n玉\n陛下万安。`;
        const doc = parse(text);
        const character = doc.elements.find((e) => e.type === 'character');

        expect(character?.type).toBe('character');
        if (character?.type === 'character') {
          expect(character.name).toBe('玉');
        }
      });

      it('should detect name with middot for minority/foreign names', () => {
        const text = `内景 客厅 - 日\n\n阿凡达·杰克\n你好。`;
        const doc = parse(text);
        const character = doc.elements.find((e) => e.type === 'character');

        expect(character?.type).toBe('character');
        if (character?.type === 'character') {
          expect(character.name).toBe('阿凡达·杰克');
        }
      });

      it('should NOT detect CJK text with sentence-ending punctuation as character', () => {
        const text = `内景 办公室 - 日\n\n大雨。\n人们纷纷跑开。`;
        const doc = parse(text);
        const types = doc.elements.map((e) => e.type);
        expect(types).not.toContain('character');
      });

      it('should NOT detect CJK text with comma as character', () => {
        const text = `内景 办公室 - 日\n\n天气不错，走吧\n好的。`;
        const doc = parse(text);
        const types = doc.elements.map((e) => e.type);
        expect(types).not.toContain('character');
      });

      it('should NOT detect short CJK line without following dialogue', () => {
        const text = `内景 办公室 - 日\n\n大雨\n`;
        const doc = parse(text);
        const character = doc.elements.find((e) => e.type === 'character');
        expect(character).toBeUndefined();
      });

      it('should NOT detect CJK line exceeding 10 characters as character', () => {
        const text = `内景 办公室 - 日\n\n这是一个非常长的名字超过了十个字\n对白。`;
        const doc = parse(text);
        const character = doc.elements.find((e) => e.type === 'character');
        expect(character).toBeUndefined();
      });
    });

    describe('CJK Parentheticals', () => {
      it('should detect full-width parenthetical in dialogue', () => {
        const text = `内景 办公室 - 日\n\n李明\n（低声地）\n你好。`;
        const doc = parse(text);
        const paren = doc.elements.find((e) => e.type === 'parenthetical');

        expect(paren?.type).toBe('parenthetical');
        if (paren?.type === 'parenthetical') {
          expect(paren.text).toBe('低声地');
        }
      });
    });

    describe('CJK Transitions', () => {
      it('should detect 切至：as transition', () => {
        const text = `内景 办公室 - 日\n\n切至：`;
        const doc = parse(text);
        const transition = doc.elements.find((e) => e.type === 'transition');

        expect(transition?.type).toBe('transition');
        if (transition?.type === 'transition') {
          expect(transition.text).toBe('切至');
        }
      });

      it('should detect 淡出：as transition', () => {
        const text = `内景 办公室 - 日\n\n淡出：`;
        const doc = parse(text);
        const transition = doc.elements.find((e) => e.type === 'transition');

        expect(transition?.type).toBe('transition');
        if (transition?.type === 'transition') {
          expect(transition.text).toBe('淡出');
        }
      });

      it('should detect CJK transition with ASCII colon', () => {
        const text = `内景 办公室 - 日\n\n叠化:`;
        const doc = parse(text);
        const transition = doc.elements.find((e) => e.type === 'transition');

        expect(transition?.type).toBe('transition');
      });
    });

    describe('CJK Title Page', () => {
      it('should parse CJK title page keys with full-width colon', () => {
        const text = `标题：我的剧本\n作者：张三\n\n内景 办公室 - 日`;
        const doc = parse(text);

        expect(doc.titlePage).not.toBeNull();
        expect(doc.titlePage?.entries).toHaveLength(2);
        expect(doc.titlePage?.entries[0]).toEqual({ key: '标题', value: '我的剧本' });
        expect(doc.titlePage?.entries[1]).toEqual({ key: '作者', value: '张三' });
      });

      it('should parse CJK title page keys with ASCII colon', () => {
        const text = `标题: 测试剧本\n\n内景 办公室 - 日`;
        const doc = parse(text);

        expect(doc.titlePage).not.toBeNull();
        expect(doc.titlePage?.entries[0]).toEqual({ key: '标题', value: '测试剧本' });
      });
    });

    describe('Mixed CJK and English', () => {
      it('should parse document with both CJK and English elements', () => {
        const text = `Title: 混合剧本
Author: 张三

# 第一幕

INT. OFFICE - DAY

JOHN
Hello!

内景 咖啡厅 - 日

李明
你好！

CUT TO:

外景 公园 - 夜

切至：

>THE END<`;

        const doc = parse(text);

        expect(doc.titlePage).not.toBeNull();

        const scenes = doc.elements.filter((e) => e.type === 'scene_heading');
        expect(scenes).toHaveLength(3);

        const characters = doc.elements.filter((e) => e.type === 'character');
        expect(characters).toHaveLength(2);
        if (characters[0]?.type === 'character') expect(characters[0].name).toBe('JOHN');
        if (characters[1]?.type === 'character') expect(characters[1].name).toBe('李明');

        const transitions = doc.elements.filter((e) => e.type === 'transition');
        expect(transitions).toHaveLength(2);
      });
    });
  });
});
