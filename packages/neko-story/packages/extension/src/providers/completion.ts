import * as vscode from 'vscode';
import { parse } from '@neko-story/parser';
import type { Character, SceneHeading } from '@neko-story/types';

/**
 * Provides auto-completion for Fountain files
 */
export class FountainCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const line = document.lineAt(position.line).text;
    const linePrefix = line.substring(0, position.character);

    // Check context for appropriate completions
    const items: vscode.CompletionItem[] = [];

    // Character name completion (after blank line, typing uppercase)
    if (this.isCharacterContext(document, position, linePrefix)) {
      items.push(...this.getCharacterCompletions(document));
    }

    // Scene heading completion
    if (this.isSceneHeadingContext(linePrefix)) {
      items.push(...this.getSceneHeadingCompletions(document, linePrefix));
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

  private getCharacterCompletions(document: vscode.TextDocument): vscode.CompletionItem[] {
    const characters = this.collectCharacters(document);
    return characters.map(name => {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.User);
      item.detail = 'Character';
      item.insertText = name;
      return item;
    });
  }

  private getSceneHeadingCompletions(
    document: vscode.TextDocument,
    linePrefix: string
  ): vscode.CompletionItem[] {
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

    // Collect existing locations for suggestions
    const locations = this.collectLocations(document);
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

  private collectCharacters(document: vscode.TextDocument): string[] {
    const text = document.getText();
    const fountainDoc = parse(text);
    const characters = new Set<string>();

    for (const element of fountainDoc.elements) {
      if (element.type === 'character') {
        const char = element as Character;
        characters.add(char.name);
      }
    }

    return Array.from(characters).sort();
  }

  private collectLocations(document: vscode.TextDocument): string[] {
    const text = document.getText();
    const fountainDoc = parse(text);
    const locations = new Set<string>();

    for (const element of fountainDoc.elements) {
      if (element.type === 'scene_heading') {
        const scene = element as SceneHeading;
        if (scene.location) {
          locations.add(scene.location);
        }
      }
    }

    return Array.from(locations).sort();
  }
}
