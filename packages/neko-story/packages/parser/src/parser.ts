import type {
  Position,
  Range,
  FountainDocument,
  AnyFountainElement,
  TitlePage,
  TitlePageEntry,
  SceneHeading,
  Action,
  Character,
  Dialogue,
  Parenthetical,
  Transition,
  Centered,
  Section,
  Synopsis,
  Note,
  PageBreak,
  Lyrics,
} from '@neko-story/types';

// Regex patterns for Fountain elements
const PATTERNS = {
  // Scene heading: INT./EXT./etc. or forced with leading period
  sceneHeading: /^(\.(?!\.)|(?:INT|EXT|EST|INT\.?\/EXT|I\.?\/E)[\.\s])/i,
  sceneHeadingFull:
    /^(INT|EXT|EST|INT\.?\/EXT|I\.?\/E)[\.\s]+(.+?)(?:\s*-\s*(.+?))?(?:\s*#([^#]+)#)?$/i,
  forcedSceneHeading: /^\.(.+?)(?:\s*#([^#]+)#)?$/,

  // Character: all caps, may have extension in parens
  character: /^([A-Z][A-Z0-9 ._\-']+)(?:\s*\(([^)]+)\))?(\s*\^)?$/,
  forcedCharacter: /^@(.+)$/,

  // Transition: ends with TO: or forced with >
  transition: /^[A-Z ]+TO:$/,
  forcedTransition: /^>(?!<)(.+)$/,

  // Centered: >text<
  centered: /^>(.+)<$/,

  // Section: # heading
  section: /^(#{1,6})\s*(.+)$/,

  // Synopsis: = text
  synopsis: /^=\s*(.+)$/,

  // Note: [[text]] or /* text */
  inlineNote: /\[\[([^\]]+)\]\]/g,
  blockNote: /\/\*[\s\S]*?\*\//g,
  lineNote: /^\/\/\s*(.*)$/,

  // Page break: === or ---
  pageBreak: /^(===|---)$/,

  // Lyrics: ~text
  lyrics: /^~(.+)$/,

  // Parenthetical: (text)
  parenthetical: /^\((.+)\)$/,

  // Title page: Key: Value
  titlePageEntry: /^([A-Za-z ]+):\s*(.*)$/,

  // Blank line
  blankLine: /^\s*$/,
};

/**
 * Create a Position object
 */
function pos(line: number, character: number): Position {
  return { line, character };
}

/**
 * Create a Range object
 */
function range(startLine: number, startChar: number, endLine: number, endChar: number): Range {
  return {
    start: pos(startLine, startChar),
    end: pos(endLine, endChar),
  };
}

/**
 * Parser state
 */
interface ParserState {
  lines: string[];
  currentLine: number;
  lastCharacter: string | null;
  inDialogue: boolean;
  inTitlePage: boolean;
}

/**
 * Parse a Fountain document
 */
export function parse(text: string): FountainDocument {
  const lines = text.split(/\r?\n/);
  const state: ParserState = {
    lines,
    currentLine: 0,
    lastCharacter: null,
    inDialogue: false,
    inTitlePage: true,
  };

  const elements: AnyFountainElement[] = [];
  let titlePage: TitlePage | null = null;

  // Try to parse title page first
  const titlePageResult = parseTitlePage(state);
  if (titlePageResult) {
    titlePage = titlePageResult;
  }

  // Parse remaining elements
  while (state.currentLine < state.lines.length) {
    const element = parseElement(state);
    if (element) {
      elements.push(element);
    } else {
      state.currentLine++;
    }
  }

  return { titlePage, elements };
}

/**
 * Parse title page at the beginning of the document
 */
function parseTitlePage(state: ParserState): TitlePage | null {
  const entries: TitlePageEntry[] = [];
  const startLine = state.currentLine;
  let currentKey: string | null = null;
  let currentValue: string[] = [];

  while (state.currentLine < state.lines.length) {
    const line = state.lines[state.currentLine] ?? '';

    // Check for title page entry
    const match = PATTERNS.titlePageEntry.exec(line);
    if (match) {
      // Save previous entry
      if (currentKey) {
        entries.push({ key: currentKey, value: currentValue.join('\n').trim() });
      }
      currentKey = match[1]?.trim() ?? '';
      currentValue = [match[2] ?? ''];
      state.currentLine++;
      continue;
    }

    // Check for continuation (indented line)
    if (currentKey && (line.startsWith('   ') || line.startsWith('\t'))) {
      currentValue.push(line.trim());
      state.currentLine++;
      continue;
    }

    // Blank line ends title page if we have entries
    if (PATTERNS.blankLine.test(line)) {
      if (entries.length > 0 || currentKey) {
        if (currentKey) {
          entries.push({ key: currentKey, value: currentValue.join('\n').trim() });
        }
        state.currentLine++;
        break;
      }
    }

    // Non-title-page content
    if (!match && !PATTERNS.blankLine.test(line) && !currentKey) {
      break;
    }

    break;
  }

  if (entries.length === 0) {
    state.currentLine = startLine;
    return null;
  }

  return {
    type: 'title_page',
    entries,
    range: range(startLine, 0, state.currentLine - 1, 0),
    raw: state.lines.slice(startLine, state.currentLine).join('\n'),
  };
}

/**
 * Parse a single element
 */
function parseElement(state: ParserState): AnyFountainElement | null {
  const line = state.lines[state.currentLine] ?? '';
  const lineNum = state.currentLine;

  // Skip blank lines but track them for context
  if (PATTERNS.blankLine.test(line)) {
    state.inDialogue = false;
    state.lastCharacter = null;
    return null;
  }

  // Page break
  if (PATTERNS.pageBreak.test(line)) {
    state.currentLine++;
    return createPageBreak(lineNum, line);
  }

  // Section
  const sectionMatch = PATTERNS.section.exec(line);
  if (sectionMatch) {
    state.currentLine++;
    return createSection(lineNum, line, sectionMatch);
  }

  // Synopsis
  const synopsisMatch = PATTERNS.synopsis.exec(line);
  if (synopsisMatch) {
    state.currentLine++;
    return createSynopsis(lineNum, line, synopsisMatch);
  }

  // Lyrics
  const lyricsMatch = PATTERNS.lyrics.exec(line);
  if (lyricsMatch) {
    state.currentLine++;
    return createLyrics(lineNum, line, lyricsMatch);
  }

  // Centered text
  const centeredMatch = PATTERNS.centered.exec(line);
  if (centeredMatch) {
    state.currentLine++;
    return createCentered(lineNum, line, centeredMatch);
  }

  // Line note
  const lineNoteMatch = PATTERNS.lineNote.exec(line);
  if (lineNoteMatch) {
    state.currentLine++;
    return createNote(lineNum, line, lineNoteMatch[1] ?? '', 'line');
  }

  // Scene heading
  if (PATTERNS.sceneHeading.test(line)) {
    state.currentLine++;
    state.inDialogue = false;
    state.lastCharacter = null;
    return createSceneHeading(lineNum, line);
  }

  // Forced transition
  const forcedTransMatch = PATTERNS.forcedTransition.exec(line);
  if (forcedTransMatch && !PATTERNS.centered.test(line)) {
    state.currentLine++;
    state.inDialogue = false;
    return createTransition(lineNum, line, forcedTransMatch[1] ?? '', true);
  }

  // Transition (must be preceded by blank line - check previous)
  if (PATTERNS.transition.test(line)) {
    const prevLine = state.lines[lineNum - 1];
    if (prevLine !== undefined && PATTERNS.blankLine.test(prevLine)) {
      state.currentLine++;
      state.inDialogue = false;
      return createTransition(lineNum, line, line, false);
    }
  }

  // Parenthetical (only in dialogue context)
  const parenMatch = PATTERNS.parenthetical.exec(line);
  if (parenMatch && state.inDialogue) {
    state.currentLine++;
    return createParenthetical(lineNum, line, parenMatch);
  }

  // Character (check if followed by dialogue)
  const prevLine = state.lines[lineNum - 1];
  const nextLine = state.lines[lineNum + 1];
  const isPrevBlank = prevLine === undefined || PATTERNS.blankLine.test(prevLine);

  // Forced character
  const forcedCharMatch = PATTERNS.forcedCharacter.exec(line);
  if (forcedCharMatch && isPrevBlank) {
    state.currentLine++;
    state.inDialogue = true;
    state.lastCharacter = forcedCharMatch[1]?.trim() ?? '';
    return createCharacter(lineNum, line, state.lastCharacter, null, false, true);
  }

  // Regular character
  const charMatch = PATTERNS.character.exec(line);
  if (charMatch && isPrevBlank && nextLine !== undefined && !PATTERNS.blankLine.test(nextLine)) {
    state.currentLine++;
    state.inDialogue = true;
    const name = charMatch[1]?.trim() ?? '';
    const extension = charMatch[2]?.trim() ?? null;
    const isDual = !!charMatch[3];
    state.lastCharacter = name;
    return createCharacter(lineNum, line, name, extension, isDual, false);
  }

  // Dialogue (if in dialogue context)
  if (state.inDialogue && state.lastCharacter) {
    state.currentLine++;
    return createDialogue(lineNum, line);
  }

  // Default: Action
  state.currentLine++;
  state.inDialogue = false;
  return createAction(lineNum, line);
}

// Element creators
function createSceneHeading(lineNum: number, raw: string): SceneHeading {
  const forced = raw.startsWith('.');
  let intExt: SceneHeading['intExt'] = null;
  let location = '';
  let time: string | null = null;
  let sceneNumber: string | null = null;

  if (forced) {
    const match = PATTERNS.forcedSceneHeading.exec(raw);
    if (match) {
      location = match[1]?.trim() ?? '';
      sceneNumber = match[2]?.trim() ?? null;
    }
  } else {
    const match = PATTERNS.sceneHeadingFull.exec(raw);
    if (match) {
      const prefix = (match[1] ?? '').toUpperCase().replace(/\./g, '').replace(/\s/g, '');
      if (prefix === 'INT' || prefix === 'EXT' || prefix === 'EST') {
        intExt = prefix as 'INT' | 'EXT' | 'EST';
      } else if (prefix.includes('INT') && prefix.includes('EXT')) {
        intExt = 'INT/EXT';
      } else if (prefix === 'IE' || prefix === 'I/E') {
        intExt = 'I/E';
      }
      location = match[2]?.trim() ?? '';
      time = match[3]?.trim() ?? null;
      sceneNumber = match[4]?.trim() ?? null;
    }
  }

  return {
    type: 'scene_heading',
    intExt,
    location,
    time,
    sceneNumber,
    forced,
    range: range(lineNum, 0, lineNum, raw.length),
    raw,
  };
}

function createAction(lineNum: number, raw: string): Action {
  const forced = raw.startsWith('!');
  const text = forced ? raw.slice(1) : raw;
  return {
    type: 'action',
    text,
    centered: false,
    forced,
    range: range(lineNum, 0, lineNum, raw.length),
    raw,
  };
}

function createCharacter(
  lineNum: number,
  raw: string,
  name: string,
  extension: string | null,
  isDualDialogue: boolean,
  forced: boolean,
): Character {
  return {
    type: 'character',
    name,
    extension,
    isDualDialogue,
    forced,
    range: range(lineNum, 0, lineNum, raw.length),
    raw,
  };
}

function createDialogue(lineNum: number, raw: string): Dialogue {
  return {
    type: 'dialogue',
    text: raw,
    range: range(lineNum, 0, lineNum, raw.length),
    raw,
  };
}

function createParenthetical(lineNum: number, raw: string, match: RegExpExecArray): Parenthetical {
  return {
    type: 'parenthetical',
    text: match[1] ?? '',
    range: range(lineNum, 0, lineNum, raw.length),
    raw,
  };
}

function createTransition(lineNum: number, raw: string, text: string, forced: boolean): Transition {
  return {
    type: 'transition',
    text: text.trim(),
    forced,
    range: range(lineNum, 0, lineNum, raw.length),
    raw,
  };
}

function createCentered(lineNum: number, raw: string, match: RegExpExecArray): Centered {
  return {
    type: 'centered',
    text: match[1] ?? '',
    range: range(lineNum, 0, lineNum, raw.length),
    raw,
  };
}

function createSection(lineNum: number, raw: string, match: RegExpExecArray): Section {
  return {
    type: 'section',
    level: (match[1] ?? '#').length,
    text: match[2] ?? '',
    range: range(lineNum, 0, lineNum, raw.length),
    raw,
  };
}

function createSynopsis(lineNum: number, raw: string, match: RegExpExecArray): Synopsis {
  return {
    type: 'synopsis',
    text: match[1] ?? '',
    range: range(lineNum, 0, lineNum, raw.length),
    raw,
  };
}

function createNote(lineNum: number, raw: string, text: string, noteType: Note['noteType']): Note {
  return {
    type: 'note',
    text,
    noteType,
    range: range(lineNum, 0, lineNum, raw.length),
    raw,
  };
}

function createPageBreak(lineNum: number, raw: string): PageBreak {
  return {
    type: 'page_break',
    range: range(lineNum, 0, lineNum, raw.length),
    raw,
  };
}

function createLyrics(lineNum: number, raw: string, match: RegExpExecArray): Lyrics {
  return {
    type: 'lyrics',
    text: match[1] ?? '',
    range: range(lineNum, 0, lineNum, raw.length),
    raw,
  };
}
