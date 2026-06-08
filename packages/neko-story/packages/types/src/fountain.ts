/**
 * Position in a text document (0-based)
 */
export interface Position {
  line: number;
  character: number;
}

/**
 * Range in a text document
 */
export interface Range {
  start: Position;
  end: Position;
}

/**
 * Fountain element types
 */
export type ElementType =
  | 'title_page'
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'centered'
  | 'section'
  | 'synopsis'
  | 'note'
  | 'boneyard'
  | 'page_break'
  | 'line_break'
  | 'lyrics';

/**
 * Base interface for all Fountain elements
 */
export interface FountainElement {
  type: ElementType;
  range: Range;
  raw: string;
}

/**
 * Title page key-value pair
 */
export interface TitlePageEntry {
  key: string;
  value: string;
}

/**
 * Title page element
 */
export interface TitlePage extends FountainElement {
  type: 'title_page';
  entries: TitlePageEntry[];
}

/**
 * Scene heading (slugline)
 * e.g., "INT. COFFEE SHOP - DAY"
 */
export interface SceneHeading extends FountainElement {
  type: 'scene_heading';
  intExt: 'INT' | 'EXT' | 'INT/EXT' | 'I/E' | 'EST' | null;
  location: string;
  time: string | null;
  sceneNumber: string | null;
  forced: boolean;
}

/**
 * Action description
 */
export interface Action extends FountainElement {
  type: 'action';
  text: string;
  centered: boolean;
  forced: boolean;
}

/**
 * Character name (before dialogue)
 */
export interface Character extends FountainElement {
  type: 'character';
  name: string;
  extension: string | null; // V.O., O.S., CONT'D, etc.
  isDualDialogue: boolean;
  forced: boolean;
}

/**
 * Dialogue text
 */
export interface Dialogue extends FountainElement {
  type: 'dialogue';
  text: string;
}

/**
 * Parenthetical (actor direction)
 */
export interface Parenthetical extends FountainElement {
  type: 'parenthetical';
  text: string;
}

/**
 * Transition
 * e.g., "CUT TO:", "FADE OUT."
 */
export interface Transition extends FountainElement {
  type: 'transition';
  text: string;
  forced: boolean;
}

/**
 * Centered text
 * e.g., ">THE END<"
 */
export interface Centered extends FountainElement {
  type: 'centered';
  text: string;
}

/**
 * Section heading (for outline)
 * e.g., "# Act One", "## Scene 1"
 */
export interface Section extends FountainElement {
  type: 'section';
  level: number; // 1-6
  text: string;
}

/**
 * Synopsis (non-printing summary)
 * e.g., "= This scene introduces the hero"
 */
export interface Synopsis extends FountainElement {
  type: 'synopsis';
  text: string;
}

/**
 * Asset reference extracted from note
 * e.g., "[[IMAGE: diagram.png]]" or "[[ASSET: video://clip.mp4]]"
 */
export interface AssetReference {
  type: 'image' | 'video' | 'audio';
  path: string;
}

export type DirectiveCategory = 'asset' | 'metadata' | 'camera' | 'ai';

export interface Directive {
  category: DirectiveCategory;
  key: string;
  value: string;
}

export const DIRECTIVE_KEYS = {
  IMAGE: { category: 'asset' as const, label: 'Image embed' },
  VIDEO: { category: 'asset' as const, label: 'Video embed' },
  AUDIO: { category: 'asset' as const, label: 'Audio embed' },
  ASSET: { category: 'asset' as const, label: 'Asset embed (protocol)' },
  MOOD: { category: 'metadata' as const, label: 'Scene mood' },
  MUSIC: { category: 'metadata' as const, label: 'Music cue' },
  VFX: { category: 'metadata' as const, label: 'Visual effects' },
  SFX: { category: 'metadata' as const, label: 'Sound effects' },
  DURATION: { category: 'metadata' as const, label: 'Scene duration override' },
  SHOT: { category: 'camera' as const, label: 'Shot type' },
  ANGLE: { category: 'camera' as const, label: 'Camera angle' },
  MOVEMENT: { category: 'camera' as const, label: 'Camera movement' },
  PROMPT: { category: 'ai' as const, label: 'Generation prompt' },
  STYLE: { category: 'ai' as const, label: 'Visual style' },
  REF: { category: 'ai' as const, label: 'Reference image' },
} as const;

export type DirectiveKey = keyof typeof DIRECTIVE_KEYS;

/**
 * Note (inline or block)
 * e.g., "[[note text]]" or block comments
 */
export interface Note extends FountainElement {
  type: 'note';
  text: string;
  noteType: 'inline' | 'block' | 'line';
  assetRef?: AssetReference;
  directive?: Directive;
}

/**
 * Boneyard (commented out section)
 */
export interface Boneyard extends FountainElement {
  type: 'boneyard';
  text: string;
}

/**
 * Page break
 * e.g., "===" or "---"
 */
export interface PageBreak extends FountainElement {
  type: 'page_break';
}

/**
 * Line break (blank line)
 */
export interface LineBreak extends FountainElement {
  type: 'line_break';
}

/**
 * Lyrics
 * e.g., "~Singing in the rain"
 */
export interface Lyrics extends FountainElement {
  type: 'lyrics';
  text: string;
}

/**
 * Union type of all Fountain elements
 */
export type AnyFountainElement =
  | TitlePage
  | SceneHeading
  | Action
  | Character
  | Dialogue
  | Parenthetical
  | Transition
  | Centered
  | Section
  | Synopsis
  | Note
  | Boneyard
  | PageBreak
  | LineBreak
  | Lyrics;

/**
 * Parsed Fountain document
 */
export interface FountainDocument {
  titlePage: TitlePage | null;
  elements: AnyFountainElement[];
}

export type PlayDirectiveType =
  | 'scene-heading'
  | 'action'
  | 'dialogue'
  | 'transition'
  | 'note'
  | 'unsupported';

export interface PlaySourceRange {
  readonly range: Range;
  readonly raw: string;
}

export interface PlayRelativePathAssetRef {
  readonly kind: 'relative-path';
  readonly path: string;
}

export type PlayNarrativeAssetRef = PlayRelativePathAssetRef;

export interface PlayCharacterBinding {
  readonly name: string;
  readonly portraitRef?: PlayNarrativeAssetRef;
  readonly expressionRefs?: Readonly<Record<string, PlayNarrativeAssetRef>>;
  readonly expression?: string;
  readonly expressionRef?: PlayNarrativeAssetRef;
  readonly position?: 'left' | 'center' | 'right';
  readonly voiceRef?: PlayNarrativeAssetRef;
  readonly live2dRef?: PlayNarrativeAssetRef;
  readonly motionRefs?: Readonly<Record<string, PlayNarrativeAssetRef>>;
}

export interface PlayBackgroundBinding {
  readonly location: string;
  readonly variant: string;
  readonly ref: PlayNarrativeAssetRef;
}

export interface BasePlayDirective extends PlaySourceRange {
  readonly type: PlayDirectiveType;
}

export interface SceneHeadingPlayDirective extends BasePlayDirective {
  readonly type: 'scene-heading';
  readonly location: string;
  readonly time?: string;
  readonly intExt?: SceneHeading['intExt'];
  readonly sceneNumber?: string;
  readonly backgroundRef?: PlayNarrativeAssetRef;
}

export interface ActionPlayDirective extends BasePlayDirective {
  readonly type: 'action';
  readonly text: string;
}

export interface DialoguePlayDirective extends BasePlayDirective {
  readonly type: 'dialogue';
  readonly character: string;
  readonly extension?: string;
  readonly parenthetical?: string;
  readonly text: string;
  readonly characterRef?: PlayCharacterBinding;
}

export interface TransitionPlayDirective extends BasePlayDirective {
  readonly type: 'transition';
  readonly text: string;
}

export interface NotePlayDirective extends BasePlayDirective {
  readonly type: 'note';
  readonly text: string;
  readonly noteType: Note['noteType'];
  readonly assetRef?: AssetReference;
  readonly directive?: Directive;
}

export interface UnsupportedPlayDirective extends BasePlayDirective {
  readonly type: 'unsupported';
  readonly elementType: ElementType;
  readonly reason: string;
}

export type PlayDirective =
  | SceneHeadingPlayDirective
  | ActionPlayDirective
  | DialoguePlayDirective
  | TransitionPlayDirective
  | NotePlayDirective
  | UnsupportedPlayDirective;

export interface FountainPlayScene {
  readonly sourceRef: string;
  readonly title?: string;
  readonly directives: readonly PlayDirective[];
  readonly characterBindings: Readonly<Record<string, PlayCharacterBinding>>;
  readonly backgroundBindings: readonly PlayBackgroundBinding[];
  readonly diagnostics: readonly FountainPlayDiagnostic[];
}

export type FountainPlayDiagnosticCode =
  | 'scene-file-missing'
  | 'scene-file-unsupported-extension'
  | 'scene-content-empty'
  | 'characters-yaml-invalid'
  | 'characters-yaml-unsupported-entry'
  | 'unsupported-fountain-element';

export interface FountainPlayDiagnostic {
  readonly code: FountainPlayDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly path?: string;
  readonly range?: Range;
}

/**
 * Text emphasis types
 */
export interface TextEmphasis {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  range: Range;
}
