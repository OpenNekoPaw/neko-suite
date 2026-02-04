import * as vscode from 'vscode';
import { parse } from '@neko-story/parser';
import type { Character } from '@neko-story/types';

/**
 * Provides go-to-definition for Fountain files
 */
export class FountainDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition> {
    const wordRange = document.getWordRangeAtPosition(position, /[A-Z][A-Z0-9 ._\-']+/);
    if (!wordRange) return null;

    const word = document.getText(wordRange).trim();
    const text = document.getText();
    const fountainDoc = parse(text);

    // Find first occurrence of character
    for (const element of fountainDoc.elements) {
      if (element.type === 'character') {
        const char = element as Character;
        if (char.name === word) {
          return new vscode.Location(
            document.uri,
            new vscode.Position(element.range.start.line, element.range.start.character)
          );
        }
      }
    }

    return null;
  }
}

/**
 * Provides find-all-references for Fountain files
 */
export class FountainReferenceProvider implements vscode.ReferenceProvider {
  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.ReferenceContext,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Location[]> {
    const wordRange = document.getWordRangeAtPosition(position, /[A-Z][A-Z0-9 ._\-']+/);
    if (!wordRange) return null;

    const word = document.getText(wordRange).trim();
    const text = document.getText();
    const fountainDoc = parse(text);
    const locations: vscode.Location[] = [];

    // Find all occurrences of character
    for (const element of fountainDoc.elements) {
      if (element.type === 'character') {
        const char = element as Character;
        if (char.name === word) {
          locations.push(
            new vscode.Location(
              document.uri,
              new vscode.Position(element.range.start.line, element.range.start.character)
            )
          );
        }
      }
    }

    return locations;
  }
}
