import * as vscode from 'vscode';
import { normalizeCharacterLookupKey } from '@neko/shared';
import { DIRECTIVE_KEYS, type DirectiveKey } from '@neko-story/types';
import type { ICharacterWorkspaceIndex, IWorkspaceIndex } from '../services/types';

// Scene heading prefix patterns: INT. / EXT. / INT./EXT. / EST. / I/E. / 内景 / 外景 / 内外景
const HEADING_PREFIX_RE =
  /^\s*(?:\.|\s*(?:INT|EXT|EST|I\/E)(?:\.\/?(?:EXT)?\.?)?\s*|(?:内景|內景|外景|内外景|內外景)\s*)$/i;
// Already typed a valid prefix followed by content: "INT. xxx" or ".xxx" or "内景 xxx"
const HEADING_LOCATION_RE =
  /^\s*(?:\.|(?:INT|EXT|EST|I\/E)(?:\.\/?(?:EXT)?\.?)?|(?:内景|內景|外景|内外景|內外景))\s+/i;
// After " - " or " — " separator for time-of-day
const HEADING_TIME_RE = /\s+[-—]\s+$/;

const TRANSITION_PREFIXES = [
  'CUT TO:',
  'FADE TO:',
  'FADE IN:',
  'FADE OUT.',
  'DISSOLVE TO:',
  'SMASH CUT TO:',
  'MATCH CUT TO:',
  'JUMP CUT TO:',
  'TIME CUT:',
  'INTERCUT:',
];

const CJK_TRANSITION_PREFIXES = [
  '切至：',
  '淡入：',
  '淡出：',
  '叠化：',
  '化入：',
  '化出：',
  '跳切：',
  '交叉剪辑：',
];

const TIMES_OF_DAY = [
  'DAY',
  'NIGHT',
  'MORNING',
  'EVENING',
  'DAWN',
  'DUSK',
  'LATER',
  'CONTINUOUS',
  'MOMENTS LATER',
  'SAME TIME',
  '日',
  '夜',
  '黄昏',
  '黎明',
  '清晨',
  '傍晚',
  '稍后',
  '连续',
];

const HEADING_PREFIXES = [
  { label: 'INT. ', detail: 'Interior scene' },
  { label: 'EXT. ', detail: 'Exterior scene' },
  { label: 'INT./EXT. ', detail: 'Interior/Exterior scene' },
  { label: 'EST. ', detail: 'Establishing shot' },
  { label: 'I/E. ', detail: 'Interior/Exterior (short)' },
  { label: '内景 ', detail: '内景（Interior scene）' },
  { label: '外景 ', detail: '外景（Exterior scene）' },
  { label: '内外景 ', detail: '内外景（Interior/Exterior scene）' },
];

/**
 * Provides context-aware auto-completion for Fountain screenplay files.
 *
 * Completion contexts:
 * - Character names: after a blank line + uppercase text, or `@` forced character
 * - Scene headings: three sub-phases (prefix → location → time-of-day)
 * - Transitions: only when line matches known transition prefix patterns
 */
export class FountainCompletionProvider implements vscode.CompletionItemProvider {
  constructor(
    private readonly index: IWorkspaceIndex,
    private readonly characterIndex?: ICharacterWorkspaceIndex,
  ) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext,
  ): Promise<vscode.CompletionItem[]> {
    const line = document.lineAt(position.line).text;
    const linePrefix = line.substring(0, position.character);

    await this.index.ensureInitialized();
    await this.characterIndex?.ensureInitialized();

    // [[KEY: value]] directive value completions (must check before key match)
    const directiveValueMatch = /\[\[([A-Z][A-Z0-9_]*)\s*:\s*(.*)$/i.exec(linePrefix);
    if (directiveValueMatch) {
      return this.getDirectiveValueCompletions(
        (directiveValueMatch[1] ?? '').toUpperCase(),
        directiveValueMatch[2] ?? '',
      );
    }

    // [[KEY directive key completions
    const directiveKeyMatch = /\[\[([A-Z]*)$/i.exec(linePrefix);
    if (directiveKeyMatch) {
      return this.getDirectiveKeyCompletions(directiveKeyMatch[1] ?? '');
    }

    // @-forced character: always takes priority
    if (linePrefix.startsWith('@')) {
      return this.getCharacterCompletions(linePrefix.slice(1), document.uri);
    }

    // Scene heading: three-phase detection
    if (HEADING_TIME_RE.test(linePrefix)) {
      // Phase C: after " - " → time-of-day
      return this.getTimeCompletions();
    }
    if (HEADING_LOCATION_RE.test(linePrefix)) {
      // Phase B: after prefix like "INT. " → locations + composite snippets
      return this.getLocationCompletions();
    }
    if (HEADING_PREFIX_RE.test(linePrefix)) {
      // Phase A: typing prefix → INT. / EXT. / etc.
      return this.getPrefixCompletions(linePrefix);
    }

    // Character name: blank line above + uppercase start
    if (this.isCharacterContext(document, position, linePrefix)) {
      return this.getCharacterCompletions(linePrefix.trim(), document.uri);
    }

    // Transition: blank line above + matches transition prefix
    if (this.isTransitionContext(document, position, linePrefix)) {
      return this.getTransitionCompletions(linePrefix);
    }

    return [];
  }

  // ---------------------------------------------------------------------------
  // Context detection
  // ---------------------------------------------------------------------------

  private isCharacterContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    linePrefix: string,
  ): boolean {
    if (position.line === 0) return false;
    const prevLine = document.lineAt(position.line - 1).text;
    // After blank line, starting with uppercase letter or CJK character
    return prevLine.trim() === '' && /^[A-Z\u4e00-\u9fff\u3400-\u4dbf]/.test(linePrefix.trim());
  }

  private isTransitionContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    linePrefix: string,
  ): boolean {
    if (position.line === 0) return false;
    const prevLine = document.lineAt(position.line - 1).text;
    if (prevLine.trim() !== '') return false;
    const trimmed = linePrefix.trim();
    // English transitions: prefix of known transition keywords
    const upper = trimmed.toUpperCase();
    if (upper.length >= 2 && TRANSITION_PREFIXES.some((t) => t.startsWith(upper))) {
      return true;
    }
    // CJK transitions: prefix of known CJK transition keywords
    return trimmed.length >= 1 && CJK_TRANSITION_PREFIXES.some((t) => t.startsWith(trimmed));
  }

  // ---------------------------------------------------------------------------
  // Completion generators
  // ---------------------------------------------------------------------------

  private getCharacterCompletions(typed: string, currentUri: vscode.Uri): vscode.CompletionItem[] {
    const names = mergeCharacterNames(
      this.characterIndex?.getAllCompletionNames(currentUri) ?? [],
      this.index.getAllCharacterNames(),
    );
    const upper = typed.toUpperCase();
    return names
      .filter((name) => !upper || name.toUpperCase().startsWith(upper))
      .map((name, i) => {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.User);
        item.detail = 'Character';
        item.sortText = String(i).padStart(4, '0');
        item.filterText = name;
        return item;
      });
  }

  private getPrefixCompletions(linePrefix: string): vscode.CompletionItem[] {
    const typed = linePrefix.trim().toUpperCase();
    const isForced = linePrefix.trim() === '.';

    return HEADING_PREFIXES.filter(
      (p) => isForced || typed === '' || p.label.toUpperCase().startsWith(typed),
    ).map((p, i) => {
      const item = new vscode.CompletionItem(p.label, vscode.CompletionItemKind.Keyword);
      item.detail = p.detail;
      item.sortText = String(i).padStart(2, '0');
      // For forced heading ".", replace the dot with full prefix
      if (isForced) {
        item.insertText = p.label.substring(1); // skip the leading dot since "." is already typed
      }
      return item;
    });
  }

  private getLocationCompletions(): vscode.CompletionItem[] {
    const locations = this.index.getAllSceneLocations();
    const items: vscode.CompletionItem[] = [];

    // Plain location names
    locations.forEach((loc, i) => {
      const item = new vscode.CompletionItem(loc, vscode.CompletionItemKind.Reference);
      item.detail = 'Previous location';
      item.sortText = `0${String(i).padStart(4, '0')}`;
      items.push(item);
    });

    // Composite snippets: "Location - DAY" with tab stop on time
    locations.forEach((loc, i) => {
      const snippet = new vscode.CompletionItem(`${loc} - DAY`, vscode.CompletionItemKind.Snippet);
      snippet.detail = 'Location + time';
      snippet.insertText = new vscode.SnippetString(`${loc} - \${1|${TIMES_OF_DAY.join(',')}|}`);
      snippet.sortText = `1${String(i).padStart(4, '0')}`;
      items.push(snippet);
    });

    return items;
  }

  private getTimeCompletions(): vscode.CompletionItem[] {
    return TIMES_OF_DAY.map((time, i) => {
      const item = new vscode.CompletionItem(time, vscode.CompletionItemKind.Constant);
      item.detail = 'Time of day';
      item.sortText = String(i).padStart(2, '0');
      return item;
    });
  }

  private getTransitionCompletions(linePrefix: string): vscode.CompletionItem[] {
    const trimmed = linePrefix.trim();
    const upper = trimmed.toUpperCase();
    const englishItems = TRANSITION_PREFIXES.filter((t) => t.startsWith(upper)).map((t, i) => {
      const item = new vscode.CompletionItem(t, vscode.CompletionItemKind.Snippet);
      item.detail = 'Transition';
      item.sortText = String(i).padStart(2, '0');
      return item;
    });
    const cjkItems = CJK_TRANSITION_PREFIXES.filter((t) => t.startsWith(trimmed)).map((t, i) => {
      const item = new vscode.CompletionItem(t, vscode.CompletionItemKind.Snippet);
      item.detail = 'Transition';
      item.sortText = String(TRANSITION_PREFIXES.length + i).padStart(2, '0');
      return item;
    });
    return [...englishItems, ...cjkItems];
  }

  private getDirectiveKeyCompletions(typed: string): vscode.CompletionItem[] {
    const upper = typed.toUpperCase();
    return (Object.keys(DIRECTIVE_KEYS) as DirectiveKey[])
      .filter((key) => !upper || key.startsWith(upper))
      .map((key, i) => {
        const info = DIRECTIVE_KEYS[key];
        const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Keyword);
        item.detail = info.label;
        item.insertText = `${key}: `;
        item.sortText = String(i).padStart(2, '0');
        item.command = {
          command: 'editor.action.triggerSuggest',
          title: 'Trigger value suggestions',
        };
        return item;
      });
  }

  private getDirectiveValueCompletions(key: string, typed: string): vscode.CompletionItem[] {
    const values = DIRECTIVE_VALUE_SUGGESTIONS[key];
    if (!values) return [];
    const upper = typed.toUpperCase();
    return values
      .filter((v) => !upper || v.toUpperCase().startsWith(upper))
      .map((v, i) => {
        const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.EnumMember);
        item.detail = key;
        item.sortText = String(i).padStart(2, '0');
        return item;
      });
  }
}

const DIRECTIVE_VALUE_SUGGESTIONS: Record<string, string[]> = {
  SHOT: [
    'wide',
    'medium',
    'close-up',
    'extreme-close-up',
    'over-the-shoulder',
    'POV',
    'aerial',
    'establishing',
    'insert',
    'two-shot',
    'OTS',
  ],
  ANGLE: ['eye-level', 'low', 'high', 'dutch', 'bird-eye', 'worm-eye'],
  MOVEMENT: [
    'static',
    'pan',
    'tilt',
    'dolly-in',
    'dolly-out',
    'tracking',
    'crane',
    'handheld',
    'steadicam',
    'zoom-in',
    'zoom-out',
  ],
  MOOD: [
    'tense',
    'calm',
    'melancholic',
    'joyful',
    'mysterious',
    'romantic',
    'comedic',
    'dramatic',
    'horror',
    'epic',
    'nostalgic',
  ],
  STYLE: [
    'noir',
    'cyberpunk',
    'pastoral',
    'documentary',
    'anime',
    'watercolor',
    'photorealistic',
    'minimalist',
    'surreal',
    'vintage',
  ],
  DURATION: ['5s', '10s', '15s', '30s', '45s', '1m', '1m30s', '2m'],
};

function mergeCharacterNames(
  preferredNames: readonly string[],
  secondaryNames: readonly string[],
): readonly string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const name of [...preferredNames, ...secondaryNames]) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      continue;
    }

    const key = normalizeCharacterLookupKey(name);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(name);
  }

  return merged;
}
