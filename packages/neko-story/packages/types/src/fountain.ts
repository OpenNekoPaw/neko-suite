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
 * Note (inline or block)
 * e.g., "[[note text]]" or block comments
 */
export interface Note extends FountainElement {
  type: 'note';
  text: string;
  noteType: 'inline' | 'block' | 'line';
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

/**
 * Text emphasis types
 */
export interface TextEmphasis {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  range: Range;
}
