import { describe, expect, it } from 'vitest';
import {
  FountainPlayParser,
  loadFountainPlayScene,
  normalizeNarrativeCharacterBindings,
} from '../play';

const CHARACTER_BINDINGS_YAML = `characters:
  小红:
    portrait: assets/characters/xiaohong/default.png
    expressions:
      default: assets/characters/xiaohong/default.png
      surprised: assets/characters/xiaohong/surprised.png
    position: right
  JOHN:
    portrait: assets/characters/john/default.png
    expressions:
      nervous: assets/characters/john/nervous.png
    position: left

backgrounds:
  咖啡馆:
    day: assets/backgrounds/cafe-day.jpg
    night: assets/backgrounds/cafe-night.jpg
  OFFICE:
    default: assets/backgrounds/office.png
`;

describe('FountainPlayParser', () => {
  it('emits ordered directives for English Fountain scene content', () => {
    const parser = new FountainPlayParser({ charactersYaml: CHARACTER_BINDINGS_YAML });
    const directives = parser.parse(`INT. OFFICE - DAY

John checks the clock.

JOHN
(nervous)
I should have left earlier.

CUT TO:

[[MOOD: tense]]`);

    expect(directives.map((directive) => directive.type)).toEqual([
      'scene-heading',
      'action',
      'dialogue',
      'transition',
      'note',
    ]);
    expect(directives[0]).toMatchObject({
      type: 'scene-heading',
      location: 'OFFICE',
      backgroundRef: { kind: 'relative-path', path: 'assets/backgrounds/office.png' },
    });
    expect(directives[2]).toMatchObject({
      type: 'dialogue',
      character: 'JOHN',
      parenthetical: 'nervous',
      text: 'I should have left earlier.',
      characterRef: {
        portraitRef: { kind: 'relative-path', path: 'assets/characters/john/default.png' },
        expression: 'nervous',
        expressionRef: { kind: 'relative-path', path: 'assets/characters/john/nervous.png' },
      },
    });
    expect(directives[4]).toMatchObject({
      type: 'note',
      directive: { category: 'metadata', key: 'MOOD', value: 'tense' },
    });
  });

  it('emits Chinese scene directives and parenthetical expression hints', () => {
    const parser = new FountainPlayParser({ charactersYaml: CHARACTER_BINDINGS_YAML });
    const directives = parser.parse(`内景 咖啡馆 - 日

小红推门进来。

小红
（surprised 地）
你居然在这里？`);

    expect(directives.map((directive) => directive.type)).toEqual([
      'scene-heading',
      'action',
      'dialogue',
    ]);
    expect(directives[0]).toMatchObject({
      type: 'scene-heading',
      location: '咖啡馆',
      time: '日',
      backgroundRef: { kind: 'relative-path', path: 'assets/backgrounds/cafe-day.jpg' },
    });
    expect(directives[2]).toMatchObject({
      type: 'dialogue',
      character: '小红',
      parenthetical: 'surprised 地',
      text: '你居然在这里？',
      characterRef: {
        position: 'right',
        expression: 'surprised',
        expressionRef: { kind: 'relative-path', path: 'assets/characters/xiaohong/surprised.png' },
      },
    });
  });

  it('keeps branch, choice, and variable semantics out of Fountain parsing', () => {
    const directives = new FountainPlayParser().parse(`INT. OFFICE - DAY

[[CHOICE: Ask why -> branch-a]]
[[VAR: trust += 1]]
@if trust > 2`);

    expect(directives).toEqual([
      expect.objectContaining({
        type: 'scene-heading',
      }),
      expect.objectContaining({
        type: 'note',
        text: 'CHOICE: Ask why -> branch-a',
        directive: { category: 'metadata', key: 'CHOICE', value: 'Ask why -> branch-a' },
      }),
      expect.objectContaining({
        type: 'note',
        text: 'VAR: trust += 1',
        directive: { category: 'metadata', key: 'VAR', value: 'trust += 1' },
      }),
      expect.objectContaining({
        type: 'action',
        text: '@if trust > 2',
      }),
    ]);
  });

  it('normalizes character and background shorthand into durable relative refs', () => {
    const bindings = normalizeNarrativeCharacterBindings(`characters:
  ALICE: assets/alice/default.png
  BOB:
    portrait: assets/bob/default.png
    voice: audio/bob.ogg
    live2d: assets/bob/model.moc3
    motions:
      idle: assets/bob/idle.motion3.json

backgrounds:
  FOREST: assets/bg/forest.png
  TOWN:
    night: assets/bg/town-night.png
`);

    expect(bindings.diagnostics).toEqual([]);
    expect(bindings.characters['ALICE']).toMatchObject({
      portraitRef: { kind: 'relative-path', path: 'assets/alice/default.png' },
    });
    expect(bindings.characters['BOB']).toMatchObject({
      voiceRef: { kind: 'relative-path', path: 'audio/bob.ogg' },
      live2dRef: { kind: 'relative-path', path: 'assets/bob/model.moc3' },
      motionRefs: {
        idle: { kind: 'relative-path', path: 'assets/bob/idle.motion3.json' },
      },
    });
    expect(bindings.backgrounds['FOREST']?.default).toEqual({
      kind: 'relative-path',
      path: 'assets/bg/forest.png',
    });
    expect(bindings.backgrounds['TOWN']?.night).toEqual({
      kind: 'relative-path',
      path: 'assets/bg/town-night.png',
    });
  });

  it('loads Fountain scenes and reports missing or unsupported scene refs', async () => {
    await expect(
      loadFountainPlayScene('scenes/cafe.fountain', {
        readFile: (sourceRef) =>
          sourceRef === 'scenes/cafe.fountain' ? 'INT. CAFE - DAY' : undefined,
      }),
    ).resolves.toMatchObject({
      sourceRef: 'scenes/cafe.fountain',
      title: 'CAFE - DAY',
      diagnostics: [],
    });

    await expect(
      loadFountainPlayScene('scenes/missing.fountain', {
        readFile: () => undefined,
      }),
    ).resolves.toMatchObject({
      sourceRef: 'scenes/missing.fountain',
      directives: [],
      diagnostics: [{ code: 'scene-file-missing', severity: 'error' }],
    });

    await expect(
      loadFountainPlayScene('scenes/legacy.story', {
        readFile: () => 'INT. OFFICE - DAY',
      }),
    ).resolves.toMatchObject({
      directives: [],
      diagnostics: [{ code: 'scene-file-unsupported-extension', severity: 'error' }],
    });
  });

  it('reports unsupported Fountain content as explicit diagnostics-friendly directives', () => {
    const directives = new FountainPlayParser().parse(`# Act One

= Internal summary

INT. OFFICE - DAY`);

    expect(directives).toEqual([
      expect.objectContaining({ type: 'unsupported', elementType: 'section' }),
      expect.objectContaining({ type: 'unsupported', elementType: 'synopsis' }),
      expect.objectContaining({ type: 'scene-heading' }),
    ]);
  });

  it('reports invalid characters.yaml instead of throwing', () => {
    const bindings = normalizeNarrativeCharacterBindings('characters: [');

    expect(bindings.characters).toEqual({});
    expect(bindings.backgrounds).toEqual({});
    expect(bindings.diagnostics).toEqual([
      expect.objectContaining({
        code: 'characters-yaml-invalid',
        severity: 'error',
      }),
    ]);
  });
});
