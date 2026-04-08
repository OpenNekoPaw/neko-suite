import * as vscode from 'vscode';
import type { IWorkspaceIndex } from '../services/types';
import type { ICharacterWorkspaceIndex } from '../services/CharacterWorkspaceIndexService';

/**
 * Provides go-to-definition for Fountain files.
 * Supports cross-file navigation via IWorkspaceIndex.
 */
export class FountainDefinitionProvider implements vscode.DefinitionProvider {
  constructor(
    private readonly index: IWorkspaceIndex,
    private readonly characterIndex?: ICharacterWorkspaceIndex,
  ) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Definition | null> {
    const wordRange = document.getWordRangeAtPosition(position, /[A-Z][A-Z0-9 ._\-']+/);
    if (!wordRange) return null;

    const word = document.getText(wordRange).trim();
    await this.index.ensureInitialized();
    await this.characterIndex?.ensureInitialized();

    const characterResolution = this.characterIndex?.resolveCharacter(word);
    if (characterResolution) {
      const definition = this.characterIndex?.getDefinitionLocation(characterResolution.characterId);
      if (definition) {
        return definition;
      }
    }

    // Try character definition (first occurrence, current file preferred)
    const charDef = this.index.findCharacterDefinition(word, document.uri);
    if (charDef) {
      return new vscode.Location(charDef.uri, charDef.range.start);
    }

    // Try scene location
    const sceneLocs = this.index.findSceneLocations(word, document.uri);
    if (sceneLocs.length > 0) {
      const first = sceneLocs[0]!;
      return new vscode.Location(first.uri, first.range.start);
    }

    // Try section
    const sectionLocs = this.index.findSectionLocations(word, document.uri);
    if (sectionLocs.length > 0) {
      const first = sectionLocs[0]!;
      return new vscode.Location(first.uri, first.range.start);
    }

    return null;
  }
}

/**
 * Provides find-all-references for Fountain files.
 * Returns cross-file results via IWorkspaceIndex.
 */
export class FountainReferenceProvider implements vscode.ReferenceProvider {
  constructor(
    private readonly index: IWorkspaceIndex,
    private readonly characterIndex?: ICharacterWorkspaceIndex,
  ) {}

  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.ReferenceContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Location[]> {
    const wordRange = document.getWordRangeAtPosition(position, /[A-Z][A-Z0-9 ._\-']+/);
    if (!wordRange) return [];

    const word = document.getText(wordRange).trim();
    await this.index.ensureInitialized();
    await this.characterIndex?.ensureInitialized();

    const results: vscode.Location[] = [];
    const seen = new Set<string>();
    const pushLocation = (location: vscode.Location) => {
      const key = `${location.uri.toString()}:${location.range.start.line}:${location.range.start.character}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push(location);
    };

    const characterResolution = this.characterIndex?.resolveCharacter(word);
    if (characterResolution) {
      const definition = this.characterIndex?.getDefinitionLocation(characterResolution.characterId);
      if (definition) {
        pushLocation(definition);
      }
    }

    // Collect all character references across workspace
    const charLocs = this.index.findCharacterLocations(word, document.uri);
    if (charLocs.length > 0) {
      for (const loc of charLocs) {
        pushLocation(new vscode.Location(loc.uri, loc.range));
      }
      return results;
    }

    // Try scene locations
    const sceneLocs = this.index.findSceneLocations(word, document.uri);
    if (sceneLocs.length > 0) {
      for (const loc of sceneLocs) {
        pushLocation(new vscode.Location(loc.uri, loc.range));
      }
      return results;
    }

    // Try sections
    const sectionLocs = this.index.findSectionLocations(word, document.uri);
    if (sectionLocs.length > 0) {
      for (const loc of sectionLocs) {
        pushLocation(new vscode.Location(loc.uri, loc.range));
      }
      return results;
    }

    return results;
  }
}
