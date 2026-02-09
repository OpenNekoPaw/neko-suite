import * as vscode from 'vscode';
import type { IWorkspaceIndex } from '../services/types';

/**
 * Provides auto-completion for Fountain files.
 * Uses IWorkspaceIndex for cross-file character and location suggestions.
 */
export class FountainCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly index: IWorkspaceIndex) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    const line = document.lineAt(position.line).text;
    const linePrefix = line.substring(0, position.character);

    await this.index.ensureInitialized();

    const items: vscode.CompletionItem[] = [];

    // Character name completion (after blank line, typing uppercase)
    if (this.isCharacterContext(document, position, linePrefix)) {
      items.push(...this.getCharacterCompletions());
    }

    // Scene heading completion
    if (this.isSceneHeadingContext(linePrefix)) {
      items.push(...this.getSceneHeadingCompletions(linePrefix));
    }

    // Transition completion
    if (this.isTransitionContext(linePrefix)) {
      items.push(...this.getTransitionCompletions());
    }

    return items;
  }

  private isCharacterContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    linePrefix: string
  ): boolean {
    // Check if previous line is blank and current line starts with uppercase
    if (position.line === 0) return false;
    const prevLine = document.lineAt(position.line - 1).text;
    return prevLine.trim() === '' && /^[A-Z]/.test(linePrefix);
  }

  private isSceneHeadingContext(linePrefix: string): boolean {
    // Starting to type INT, EXT, etc. or forced scene heading with .
    return /^(\.|\s*(?:INT|EXT|EST|I\/E)?\.?\s*)$/i.test(linePrefix);
  }

  private isTransitionContext(linePrefix: string): boolean {
    // Starting to type a transition
    return /^[A-Z\s]*$/.test(linePrefix) && linePrefix.length > 0;
  }

  private getCharacterCompletions(): vscode.CompletionItem[] {
    const names = this.index.getAllCharacterNames();
    return names.map(name => {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.User);
      item.detail = 'Character';
      item.insertText = name;
      return item;
    });
  }

  private getSceneHeadingCompletions(linePrefix: string): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    // Scene heading prefixes
    const prefixes = [
      { label: 'INT. ', detail: 'Interior scene' },
      { label: 'EXT. ', detail: 'Exterior scene' },
      { label: 'INT./EXT. ', detail: 'Interior/Exterior scene' },
      { label: 'EST. ', detail: 'Establishing shot' },
    ];

    for (const prefix of prefixes) {
      if (prefix.label.toUpperCase().startsWith(linePrefix.toUpperCase()) || linePrefix === '.') {
        const item = new vscode.CompletionItem(prefix.label, vscode.CompletionItemKind.Keyword);
        item.detail = prefix.detail;
        item.insertText = linePrefix === '.' ? prefix.label.substring(1) : prefix.label;
        items.push(item);
      }
    }

    // Collect existing locations from workspace index
    const locations = this.index.getAllSceneLocations();
    for (const location of locations) {
      const item = new vscode.CompletionItem(location, vscode.CompletionItemKind.Reference);
      item.detail = 'Previous location';
      items.push(item);
    }

    // Time of day suggestions
    const times = ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'LATER', 'CONTINUOUS', 'MOMENTS LATER'];
    for (const time of times) {
      const item = new vscode.CompletionItem(time, vscode.CompletionItemKind.Constant);
      item.detail = 'Time of day';
      item.sortText = 'z' + time; // Sort after locations
      items.push(item);
    }

    return items;
  }

  private getTransitionCompletions(): vscode.CompletionItem[] {
    const transitions = [
      'CUT TO:',
      'FADE TO:',
      'FADE IN:',
      'FADE OUT.',
      'DISSOLVE TO:',
      'SMASH CUT TO:',
      'MATCH CUT TO:',
      'JUMP CUT TO:',
      'TIME CUT:',
    ];

    return transitions.map(t => {
      const item = new vscode.CompletionItem(t, vscode.CompletionItemKind.Snippet);
      item.detail = 'Transition';
      return item;
    });
  }
}
