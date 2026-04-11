import * as vscode from 'vscode';
import type { ICharacterWorkspaceIndex, IWorkspaceIndex, SymbolLocation } from '../services/types';

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

    const characterDefinition = this.characterIndex?.getDefinition(word, document.uri);
    if (characterDefinition) {
      return characterDefinition;
    }

    const referenceNames = this.characterIndex?.getReferenceNames(word, document.uri) ?? [];
    const resolvedCharacterDefinition = findFirstCharacterDefinition(
      this.index,
      referenceNames,
      document.uri,
    );
    if (resolvedCharacterDefinition) {
      return new vscode.Location(
        resolvedCharacterDefinition.uri,
        resolvedCharacterDefinition.range.start,
      );
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
    context: vscode.ReferenceContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Location[]> {
    const wordRange = document.getWordRangeAtPosition(position, /[A-Z][A-Z0-9 ._\-']+/);
    if (!wordRange) return [];

    const word = document.getText(wordRange).trim();
    await this.index.ensureInitialized();
    await this.characterIndex?.ensureInitialized();

    const referenceNames = this.characterIndex?.getReferenceNames(word, document.uri) ?? [];
    if (referenceNames.length > 0) {
      const locations = collectCharacterReferenceLocations(
        this.index,
        referenceNames,
        document.uri,
      );
      const registryDefinition = context.includeDeclaration
        ? this.characterIndex?.getDefinition(word, document.uri)
        : undefined;

      if (locations.length > 0 || registryDefinition) {
        const references = locations.map(
          (location) => new vscode.Location(location.uri, location.range),
        );
        return registryDefinition
          ? dedupeLocations([registryDefinition, ...references])
          : references;
      }
    }

    // Collect all character references across workspace
    const charLocs = this.index.findCharacterLocations(word, document.uri);
    if (charLocs.length > 0) {
      return charLocs.map((loc) => new vscode.Location(loc.uri, loc.range));
    }

    // Try scene locations
    const sceneLocs = this.index.findSceneLocations(word, document.uri);
    if (sceneLocs.length > 0) {
      return sceneLocs.map((loc) => new vscode.Location(loc.uri, loc.range));
    }

    // Try sections
    const sectionLocs = this.index.findSectionLocations(word, document.uri);
    if (sectionLocs.length > 0) {
      return sectionLocs.map((loc) => new vscode.Location(loc.uri, loc.range));
    }

    return [];
  }
}

function findFirstCharacterDefinition(
  index: IWorkspaceIndex,
  names: readonly string[],
  currentUri: vscode.Uri,
): SymbolLocation | undefined {
  for (const name of names) {
    const definition = index.findCharacterDefinition(name, currentUri);
    if (definition) {
      return definition;
    }
  }

  return undefined;
}

function collectCharacterReferenceLocations(
  index: IWorkspaceIndex,
  names: readonly string[],
  currentUri: vscode.Uri,
): readonly SymbolLocation[] {
  const deduped = new Map<string, SymbolLocation>();

  for (const name of names) {
    for (const location of index.findCharacterLocations(name, currentUri)) {
      const key = serializeLocation(location.uri, location.range);
      if (!deduped.has(key)) {
        deduped.set(key, location);
      }
    }
  }

  return Array.from(deduped.values());
}

function dedupeLocations(locations: readonly vscode.Location[]): vscode.Location[] {
  const deduped = new Map<string, vscode.Location>();

  for (const location of locations) {
    const key = serializeLocation(location.uri, location.range);
    if (!deduped.has(key)) {
      deduped.set(key, location);
    }
  }

  return Array.from(deduped.values());
}

function serializeLocation(uri: vscode.Uri, range: vscode.Range): string {
  return [
    uri.toString(),
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  ].join(':');
}
