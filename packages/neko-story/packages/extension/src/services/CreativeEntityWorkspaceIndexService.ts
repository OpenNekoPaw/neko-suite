import * as vscode from 'vscode';
import type {
  CharacterEntityQuery,
  CreativeEntityOccurrence,
  ICharacterWorkspaceIndex,
  ICreativeEntityWorkspaceIndex,
  IWorkspaceIndex,
  SymbolLocation,
} from './types';

/**
 * Character-first creative entity facade.
 *
 * Phase 1 keeps the implementation deliberately small: it composes the
 * registry-backed character index with script occurrences so providers can
 * consume a single query surface. Graph / canvas / asset occurrences can be
 * attached here in later phases without rewriting provider logic again.
 */
export class CreativeEntityWorkspaceIndexService implements ICreativeEntityWorkspaceIndex {
  constructor(
    private readonly workspaceIndex: IWorkspaceIndex,
    private readonly characterIndex: ICharacterWorkspaceIndex,
  ) {}

  async ensureInitialized(): Promise<void> {
    await Promise.all([
      this.workspaceIndex.ensureInitialized(),
      this.characterIndex.ensureInitialized(),
    ]);
  }

  queryCharacter(name: string, currentUri?: vscode.Uri): CharacterEntityQuery | undefined {
    const query = name.trim();
    if (query.length === 0) {
      return undefined;
    }

    const resolved = this.characterIndex.resolveCharacter(query, currentUri);
    const referenceNames = this.characterIndex.getReferenceNames(query, currentUri);
    const searchNames = referenceNames.length > 0 ? referenceNames : [query];
    const scriptOccurrences = collectCharacterLocations(
      this.workspaceIndex,
      searchNames,
      currentUri,
    );
    const registryDefinition = resolved
      ? this.characterIndex.getDefinition(query, currentUri)
      : undefined;
    const scriptDefinition = pickCharacterDefinition(
      this.workspaceIndex,
      searchNames,
      currentUri,
      scriptOccurrences,
    );

    if (!resolved && !registryDefinition && scriptOccurrences.length === 0) {
      return undefined;
    }

    const entityId = resolved?.record.id;
    const scriptReferences = scriptOccurrences.map(
      (occurrence) => new vscode.Location(occurrence.uri, occurrence.range),
    );
    const occurrences: CreativeEntityOccurrence[] = [];

    if (registryDefinition) {
      occurrences.push({
        entityKind: 'character',
        entityId,
        source: 'registry',
        role: 'definition',
        label: resolved?.record.displayName ?? resolved?.record.canonicalName ?? query,
        location: registryDefinition,
      });
    }

    for (const occurrence of scriptOccurrences) {
      occurrences.push({
        entityKind: 'character',
        entityId,
        source: 'script',
        role: 'reference',
        label: occurrence.name,
        location: new vscode.Location(occurrence.uri, occurrence.range),
        detail: occurrence.detail,
      });
    }

    return {
      kind: 'character',
      query,
      resolved,
      referenceNames: searchNames,
      registryDefinition,
      scriptDefinition,
      scriptReferences,
      occurrences,
      stats: {
        totalScriptReferences: scriptReferences.length,
        fileCount: countDistinctFiles(scriptOccurrences),
      },
    };
  }

  dispose(): void {}
}

function pickCharacterDefinition(
  workspaceIndex: IWorkspaceIndex,
  names: readonly string[],
  currentUri: vscode.Uri | undefined,
  occurrences: readonly SymbolLocation[],
): vscode.Location | undefined {
  for (const name of names) {
    const definition = workspaceIndex.findCharacterDefinition(name, currentUri);
    if (definition) {
      return new vscode.Location(definition.uri, definition.range.start);
    }
  }

  const firstOccurrence = occurrences[0];
  if (!firstOccurrence) {
    return undefined;
  }

  return new vscode.Location(firstOccurrence.uri, firstOccurrence.range.start);
}

function collectCharacterLocations(
  workspaceIndex: IWorkspaceIndex,
  names: readonly string[],
  currentUri?: vscode.Uri,
): readonly SymbolLocation[] {
  const deduped = new Map<string, SymbolLocation>();

  for (const name of names) {
    for (const location of workspaceIndex.findCharacterLocations(name, currentUri)) {
      const key = serializeLocation(location.uri, location.range);
      if (!deduped.has(key)) {
        deduped.set(key, location);
      }
    }
  }

  return Array.from(deduped.values());
}

function countDistinctFiles(locations: readonly SymbolLocation[]): number {
  const files = new Set<string>();

  for (const location of locations) {
    files.add(location.uri.toString());
  }

  return files.size;
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
