import { parse as parseYaml } from 'yaml';
import type {
  Action,
  AnyFountainElement,
  Character,
  Dialogue,
  FountainDocument,
  FountainPlayDiagnostic,
  FountainPlayScene,
  Note,
  Parenthetical,
  PlayBackgroundBinding,
  PlayCharacterBinding,
  PlayDirective,
  PlayNarrativeAssetRef,
  Range,
  SceneHeading,
  Transition,
} from '@neko-story/types';
import { parse } from './parser';

const SUPPORTED_SCENE_EXTENSION = '.fountain';
const DEFAULT_BACKGROUND_VARIANT = 'default';
const TIME_VARIANT_ALIASES: Readonly<Record<string, string>> = {
  day: 'day',
  daytime: 'day',
  morning: 'day',
  afternoon: 'day',
  日: 'day',
  白天: 'day',
  昼: 'day',
  night: 'night',
  evening: 'night',
  dusk: 'night',
  夜: 'night',
  夜晚: 'night',
  黄昏: 'night',
  dawn: 'dawn',
  黎明: 'dawn',
};

export interface FountainPlayParserOptions {
  readonly charactersYaml?: string;
}

export interface FountainPlaySceneLoadOptions extends FountainPlayParserOptions {
  readonly readFile: (sourceRef: string) => Promise<string | undefined> | string | undefined;
}

export interface NarrativeCharacterBindings {
  readonly characters: Readonly<Record<string, PlayCharacterBinding>>;
  readonly backgrounds: Readonly<Record<string, Readonly<Record<string, PlayNarrativeAssetRef>>>>;
  readonly diagnostics: readonly FountainPlayDiagnostic[];
}

export class FountainPlayParser {
  private readonly bindings: NarrativeCharacterBindings;

  constructor(options: FountainPlayParserOptions = {}) {
    this.bindings = normalizeNarrativeCharacterBindings(options.charactersYaml);
  }

  parse(text: string): readonly PlayDirective[] {
    return this.parseDocument(parse(text));
  }

  parseDocument(document: FountainDocument): readonly PlayDirective[] {
    const directives: PlayDirective[] = [];
    let pendingCharacter: Character | undefined;
    let pendingParenthetical: Parenthetical | undefined;
    let pendingDialogueLines: Dialogue[] = [];

    const flushDialogue = (): void => {
      if (!pendingCharacter || pendingDialogueLines.length === 0) {
        pendingCharacter = undefined;
        pendingParenthetical = undefined;
        pendingDialogueLines = [];
        return;
      }

      directives.push(
        this.toDialogueDirective(pendingCharacter, pendingParenthetical, pendingDialogueLines),
      );
      pendingCharacter = undefined;
      pendingParenthetical = undefined;
      pendingDialogueLines = [];
    };

    for (const element of document.elements) {
      switch (element.type) {
        case 'character':
          flushDialogue();
          pendingCharacter = element;
          break;
        case 'parenthetical':
          if (pendingCharacter && pendingDialogueLines.length === 0) {
            pendingParenthetical = element;
          } else {
            flushDialogue();
            directives.push(toUnsupportedDirective(element, 'Parenthetical is outside dialogue.'));
          }
          break;
        case 'dialogue':
          if (pendingCharacter) {
            pendingDialogueLines.push(element);
          } else {
            directives.push(toUnsupportedDirective(element, 'Dialogue has no character cue.'));
          }
          break;
        case 'scene_heading':
          flushDialogue();
          directives.push(this.toSceneHeadingDirective(element));
          break;
        case 'action':
          flushDialogue();
          directives.push(toActionDirective(element));
          break;
        case 'transition':
          flushDialogue();
          directives.push(toTransitionDirective(element));
          break;
        case 'note':
          flushDialogue();
          directives.push(toNoteDirective(element));
          break;
        case 'centered':
        case 'section':
        case 'synopsis':
        case 'page_break':
        case 'lyrics':
        case 'title_page':
        case 'boneyard':
        case 'line_break':
          flushDialogue();
          directives.push(
            toUnsupportedDirective(element, `Unsupported play element: ${element.type}.`),
          );
          break;
      }
    }

    flushDialogue();
    return directives;
  }

  parseScene(sourceRef: string, text: string): FountainPlayScene {
    const directives = this.parse(text);
    const diagnostics = [...this.bindings.diagnostics];
    if (text.trim().length === 0) {
      diagnostics.push({
        code: 'scene-content-empty',
        severity: 'warning',
        message: 'Fountain scene content is empty.',
        path: sourceRef,
      });
    }

    return {
      sourceRef,
      title: findSceneTitle(directives),
      directives,
      characterBindings: this.bindings.characters,
      backgroundBindings: collectBackgroundBindings(this.bindings.backgrounds),
      diagnostics,
    };
  }

  private toSceneHeadingDirective(element: SceneHeading): PlayDirective {
    const backgroundRef = resolveBackgroundRef(
      this.bindings.backgrounds,
      element.location,
      element.time,
    );
    return {
      type: 'scene-heading',
      location: element.location,
      ...(element.time ? { time: element.time } : {}),
      ...(element.intExt ? { intExt: element.intExt } : {}),
      ...(element.sceneNumber ? { sceneNumber: element.sceneNumber } : {}),
      ...(backgroundRef ? { backgroundRef } : {}),
      range: element.range,
      raw: element.raw,
    };
  }

  private toDialogueDirective(
    character: Character,
    parenthetical: Parenthetical | undefined,
    dialogueLines: readonly Dialogue[],
  ): PlayDirective {
    const characterRef = resolveCharacterBinding(
      this.bindings.characters,
      character.name,
      parenthetical?.text,
    );

    return {
      type: 'dialogue',
      character: character.name,
      ...(character.extension ? { extension: character.extension } : {}),
      ...(parenthetical ? { parenthetical: parenthetical.text } : {}),
      text: dialogueLines.map((line) => line.text).join('\n'),
      ...(characterRef ? { characterRef } : {}),
      range: mergeRanges([character, parenthetical, ...dialogueLines].filter(isSourceElement)),
      raw: [character.raw, parenthetical?.raw, ...dialogueLines.map((line) => line.raw)]
        .filter((line): line is string => typeof line === 'string')
        .join('\n'),
    };
  }
}

export async function loadFountainPlayScene(
  sourceRef: string,
  options: FountainPlaySceneLoadOptions,
): Promise<FountainPlayScene> {
  const extensionDiagnostic = validateSceneRef(sourceRef);
  if (extensionDiagnostic) {
    return createUnavailableScene(sourceRef, [extensionDiagnostic]);
  }

  const content = await options.readFile(sourceRef);
  if (content === undefined) {
    return createUnavailableScene(sourceRef, [
      {
        code: 'scene-file-missing',
        severity: 'error',
        message: 'Fountain scene file is missing.',
        path: sourceRef,
      },
    ]);
  }

  return new FountainPlayParser(options).parseScene(sourceRef, content);
}

export function normalizeNarrativeCharacterBindings(
  charactersYaml: string | undefined,
): NarrativeCharacterBindings {
  if (!charactersYaml || charactersYaml.trim().length === 0) {
    return { characters: {}, backgrounds: {}, diagnostics: [] };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(charactersYaml);
  } catch (error) {
    return {
      characters: {},
      backgrounds: {},
      diagnostics: [
        {
          code: 'characters-yaml-invalid',
          severity: 'error',
          message: `characters.yaml could not be parsed: ${formatError(error)}`,
        },
      ],
    };
  }

  if (!isRecord(parsed)) {
    return {
      characters: {},
      backgrounds: {},
      diagnostics: [
        {
          code: 'characters-yaml-invalid',
          severity: 'error',
          message: 'characters.yaml must contain a mapping object.',
        },
      ],
    };
  }

  const diagnostics: FountainPlayDiagnostic[] = [];
  return {
    characters: readCharacterBindings(parsed['characters'], diagnostics),
    backgrounds: readBackgroundBindings(parsed['backgrounds'], diagnostics),
    diagnostics,
  };
}

function toActionDirective(element: Action): PlayDirective {
  return {
    type: 'action',
    text: element.text,
    range: element.range,
    raw: element.raw,
  };
}

function toTransitionDirective(element: Transition): PlayDirective {
  return {
    type: 'transition',
    text: element.text,
    range: element.range,
    raw: element.raw,
  };
}

function toNoteDirective(element: Note): PlayDirective {
  return {
    type: 'note',
    text: element.text,
    noteType: element.noteType,
    ...(element.assetRef ? { assetRef: element.assetRef } : {}),
    ...(element.directive ? { directive: element.directive } : {}),
    range: element.range,
    raw: element.raw,
  };
}

function toUnsupportedDirective(element: AnyFountainElement, reason: string): PlayDirective {
  return {
    type: 'unsupported',
    elementType: element.type,
    reason,
    range: element.range,
    raw: element.raw,
  };
}

function readCharacterBindings(
  value: unknown,
  diagnostics: FountainPlayDiagnostic[],
): Readonly<Record<string, PlayCharacterBinding>> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    diagnostics.push({
      code: 'characters-yaml-invalid',
      severity: 'error',
      message: 'characters.yaml characters must be a mapping object.',
    });
    return {};
  }

  const bindings: Record<string, PlayCharacterBinding> = {};
  for (const [name, entry] of Object.entries(value)) {
    const binding = readCharacterBinding(name, entry, diagnostics);
    if (binding) {
      bindings[name] = binding;
    }
  }
  return bindings;
}

function readCharacterBinding(
  name: string,
  value: unknown,
  diagnostics: FountainPlayDiagnostic[],
): PlayCharacterBinding | undefined {
  if (typeof value === 'string') {
    return { name, portraitRef: createRelativePathRef(value) };
  }

  if (!isRecord(value)) {
    diagnostics.push({
      code: 'characters-yaml-unsupported-entry',
      severity: 'warning',
      message: `Character "${name}" must be a path string or mapping object.`,
    });
    return undefined;
  }

  return {
    name,
    ...readPathField(value, 'portrait', 'portraitRef'),
    ...readPathField(value, 'voice', 'voiceRef'),
    ...readPathField(value, 'live2d', 'live2dRef'),
    ...readPositionField(value['position']),
    ...readPathMapField(value, 'expressions', 'expressionRefs'),
    ...readPathMapField(value, 'motions', 'motionRefs'),
  };
}

function readBackgroundBindings(
  value: unknown,
  diagnostics: FountainPlayDiagnostic[],
): Readonly<Record<string, Readonly<Record<string, PlayNarrativeAssetRef>>>> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    diagnostics.push({
      code: 'characters-yaml-invalid',
      severity: 'error',
      message: 'characters.yaml backgrounds must be a mapping object.',
    });
    return {};
  }

  const backgrounds: Record<string, Readonly<Record<string, PlayNarrativeAssetRef>>> = {};
  for (const [location, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      backgrounds[location] = { [DEFAULT_BACKGROUND_VARIANT]: createRelativePathRef(entry) };
      continue;
    }
    if (!isRecord(entry)) {
      diagnostics.push({
        code: 'characters-yaml-unsupported-entry',
        severity: 'warning',
        message: `Background "${location}" must be a path string or mapping object.`,
      });
      continue;
    }
    const variants: Record<string, PlayNarrativeAssetRef> = {};
    for (const [variant, path] of Object.entries(entry)) {
      if (typeof path === 'string') {
        variants[normalizeLookupKey(variant)] = createRelativePathRef(path);
      }
    }
    backgrounds[location] = variants;
  }
  return backgrounds;
}

function resolveCharacterBinding(
  bindings: Readonly<Record<string, PlayCharacterBinding>>,
  characterName: string,
  parenthetical: string | undefined,
): PlayCharacterBinding | undefined {
  const binding = findBindingByName(bindings, characterName);
  if (!binding) return undefined;

  const expression = resolveExpressionName(binding.expressionRefs, parenthetical);
  if (!expression) return binding;

  return {
    ...binding,
    expression,
    expressionRef: binding.expressionRefs?.[expression],
  };
}

function findBindingByName(
  bindings: Readonly<Record<string, PlayCharacterBinding>>,
  name: string,
): PlayCharacterBinding | undefined {
  const direct = bindings[name];
  if (direct) return direct;
  const target = normalizeLookupKey(name);
  return Object.entries(bindings).find(([key]) => normalizeLookupKey(key) === target)?.[1];
}

function resolveExpressionName(
  refs: Readonly<Record<string, PlayNarrativeAssetRef>> | undefined,
  parenthetical: string | undefined,
): string | undefined {
  if (!refs) return undefined;
  if (!parenthetical) {
    return refs['default'] ? 'default' : undefined;
  }

  const normalizedHint = normalizeLookupKey(parenthetical);
  const match = Object.keys(refs).find((name) => normalizedHint.includes(normalizeLookupKey(name)));
  if (match) return match;
  return refs['default'] ? 'default' : undefined;
}

function resolveBackgroundRef(
  backgrounds: Readonly<Record<string, Readonly<Record<string, PlayNarrativeAssetRef>>>>,
  location: string,
  time: string | null,
): PlayNarrativeAssetRef | undefined {
  const variants = Object.entries(backgrounds).find(
    ([key]) => normalizeLookupKey(key) === normalizeLookupKey(location),
  )?.[1];
  if (!variants) return undefined;

  const timeVariant = time ? TIME_VARIANT_ALIASES[normalizeLookupKey(time)] : undefined;
  if (timeVariant && variants[timeVariant]) return variants[timeVariant];
  if (time) {
    const rawTimeVariant = variants[normalizeLookupKey(time)];
    if (rawTimeVariant) return rawTimeVariant;
  }
  return variants[DEFAULT_BACKGROUND_VARIANT];
}

function collectBackgroundBindings(
  backgrounds: Readonly<Record<string, Readonly<Record<string, PlayNarrativeAssetRef>>>>,
): readonly PlayBackgroundBinding[] {
  return Object.entries(backgrounds).flatMap(([location, variants]) =>
    Object.entries(variants).map(([variant, ref]) => ({ location, variant, ref })),
  );
}

function readPathField<TField extends string>(
  record: Readonly<Record<string, unknown>>,
  inputField: string,
  outputField: TField,
): Partial<Record<TField, PlayNarrativeAssetRef>> {
  const value = record[inputField];
  return typeof value === 'string'
    ? ({ [outputField]: createRelativePathRef(value) } as Partial<
        Record<TField, PlayNarrativeAssetRef>
      >)
    : {};
}

function readPathMapField<TField extends string>(
  record: Readonly<Record<string, unknown>>,
  inputField: string,
  outputField: TField,
): Partial<Record<TField, Readonly<Record<string, PlayNarrativeAssetRef>>>> {
  const value = record[inputField];
  if (!isRecord(value)) return {};
  const refs: Record<string, PlayNarrativeAssetRef> = {};
  for (const [key, path] of Object.entries(value)) {
    if (typeof path === 'string') {
      refs[normalizeLookupKey(key)] = createRelativePathRef(path);
    }
  }
  return Object.keys(refs).length > 0
    ? ({ [outputField]: refs } as Partial<
        Record<TField, Readonly<Record<string, PlayNarrativeAssetRef>>>
      >)
    : {};
}

function readPositionField(value: unknown): Partial<Pick<PlayCharacterBinding, 'position'>> {
  return value === 'left' || value === 'center' || value === 'right' ? { position: value } : {};
}

function createRelativePathRef(path: string): PlayNarrativeAssetRef {
  return { kind: 'relative-path', path: path.trim() };
}

function validateSceneRef(sourceRef: string): FountainPlayDiagnostic | undefined {
  const normalized = sourceRef.trim().toLowerCase();
  if (!normalized.endsWith(SUPPORTED_SCENE_EXTENSION)) {
    return {
      code: 'scene-file-unsupported-extension',
      severity: 'error',
      message: 'Narrative scene refs must point to standard .fountain files.',
      path: sourceRef,
    };
  }
  return undefined;
}

function createUnavailableScene(
  sourceRef: string,
  diagnostics: readonly FountainPlayDiagnostic[],
): FountainPlayScene {
  return {
    sourceRef,
    directives: [],
    characterBindings: {},
    backgroundBindings: [],
    diagnostics,
  };
}

function findSceneTitle(directives: readonly PlayDirective[]): string | undefined {
  const heading = directives.find((directive) => directive.type === 'scene-heading');
  return heading?.type === 'scene-heading'
    ? [heading.location, heading.time].filter(Boolean).join(' - ')
    : undefined;
}

function mergeRanges(elements: readonly { readonly range: Range }[]): Range {
  const first = elements[0]?.range;
  const last = elements[elements.length - 1]?.range;
  return {
    start: first?.start ?? { line: 0, character: 0 },
    end: last?.end ?? first?.end ?? { line: 0, character: 0 },
  };
}

function isSourceElement(
  value: Character | Parenthetical | Dialogue | undefined,
): value is Character | Parenthetical | Dialogue {
  return value !== undefined;
}

function normalizeLookupKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
