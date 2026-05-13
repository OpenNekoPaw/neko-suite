import * as vscode from 'vscode';
import type { ICharacterWorkspaceIndex, IWorkspaceIndex } from '../services/types';

/**
 * Provides LLM-powered ghost text (inline completions) for Fountain screenplay files.
 *
 * Triggers automatically at the end of a line after a 400 ms idle period.
 * Delegates to `neko.agent.internalChat` — the shared LLM bridge registered by
 * neko-agent — so this provider has zero direct dependency on @neko/platform.
 *
 * Acceptance: Tab key (VSCode default)
 * Rejection:  Esc or simply continue typing
 */
export class FountainInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  /** Minimum non-whitespace characters on the current line before triggering */
  private static readonly MIN_LINE_LENGTH = 3;

  /** Context window (characters) sent to the LLM — keep small for latency */
  private static readonly MAX_CONTEXT_CHARS = 1500;

  /** Max tokens the LLM may emit for a single ghost-text suggestion */
  private static readonly MAX_COMPLETION_TOKENS = 120;

  /** Debounce delay in milliseconds */
  private static readonly DEBOUNCE_MS = 400;

  constructor(
    private readonly index?: IWorkspaceIndex,
    private readonly characterIndex?: ICharacterWorkspaceIndex,
  ) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[] | null> {
    // Only trigger at the end of a line
    const lineText = document.lineAt(position.line).text;
    if (position.character < lineText.length) return null;

    // Skip very short lines (avoid triggering on blank lines or short prefixes)
    if (lineText.trim().length < FountainInlineCompletionProvider.MIN_LINE_LENGTH) return null;

    // 400 ms debounce: wait before calling the LLM, bail out if canceled
    await delay(FountainInlineCompletionProvider.DEBOUNCE_MS);
    if (token.isCancellationRequested) return null;

    // Build a short excerpt of the screenplay before the cursor
    const textBefore = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    const contextText =
      textBefore.length > FountainInlineCompletionProvider.MAX_CONTEXT_CHARS
        ? textBefore.slice(-FountainInlineCompletionProvider.MAX_CONTEXT_CHARS)
        : textBefore;

    try {
      const preamble = this.buildContextPreamble(document, position);
      const userContent = preamble ? `${preamble}\n\n${contextText}` : contextText;

      const completion = await vscode.commands.executeCommand<string | null>(
        'neko.agent.internalChat',
        [
          {
            role: 'system',
            content:
              'You are a Fountain screenplay completion assistant for neko-story. ' +
              'Continue the screenplay from exactly where it leaves off. ' +
              'Output ONLY the continuation text — no explanations, no markdown fences, no leading/trailing blank lines. ' +
              'Keep it concise: 1–3 Fountain elements (action, dialogue, scene heading, or transition). ' +
              'Preserve correct Fountain formatting. ' +
              'CJK names are valid character cues. CJK scene prefixes: 内景/外景/内外景. ' +
              'You may use [[KEY: value]] directives: MOOD, MUSIC, VFX, SFX, DURATION, SHOT, ANGLE, MOVEMENT, PROMPT, STYLE, REF. ' +
              'Asset embeds: [[IMAGE: path]], [[VIDEO: path]], [[AUDIO: path]].',
          },
          {
            role: 'user',
            content: userContent,
          },
        ],
        { maxTokens: FountainInlineCompletionProvider.MAX_COMPLETION_TOKENS },
      );

      if (token.isCancellationRequested || !completion?.trim()) return null;

      const insertText = '\n' + completion.trim();
      const item = new vscode.InlineCompletionItem(
        insertText,
        new vscode.Range(position, position),
      );

      return [item];
    } catch {
      // neko-agent not available or LLM error — silently skip
      return null;
    }
  }

  private buildContextPreamble(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): string | null {
    const parts: string[] = [];

    const lineText = document.lineAt(position.line).text.trimStart();
    const prevLine = position.line > 0 ? document.lineAt(position.line - 1).text.trim() : '';
    const isPrevBlank = prevLine === '';

    if (
      /^(INT|EXT|EST|I\/E|内景|內景|外景|内外景|內外景)[.\s\u3000]/i.test(lineText) ||
      lineText.startsWith('.')
    ) {
      parts.push('[Context: scene heading]');
    } else if (/^\(|^（/.test(lineText)) {
      parts.push('[Context: parenthetical]');
    } else if (isPrevBlank && /^[A-Z][A-Z0-9 ._\-']+$/.test(lineText)) {
      parts.push('[Context: character cue]');
    } else if (isPrevBlank && /^[一-鿿㐀-䶿][一-鿿㐀-䶿·]{0,9}$/.test(lineText)) {
      parts.push('[Context: character cue]');
    } else if (/^\[\[/.test(lineText)) {
      parts.push('[Context: directive/note]');
    } else if (isPrevBlank) {
      parts.push('[Context: action]');
    } else {
      parts.push('[Context: dialogue]');
    }

    const characters = this.index?.getAllCharacterNames().slice(0, 10) ?? [];
    if (characters.length > 0) {
      parts.push(`[Characters: ${characters.join(', ')}]`);
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
