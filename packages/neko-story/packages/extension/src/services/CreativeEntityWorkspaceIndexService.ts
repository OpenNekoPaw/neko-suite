import * as vscode from 'vscode';
import type {
  CharacterEntityQuery,
  CreativeEntityOccurrence,
  ICharacterWorkspaceIndex,
  ICreativeEntityGraph,
  ICreativeEntityWorkspaceIndex,
  IOccurrenceIndex,
  IWorkspaceIndex,
  SymbolLocation,
} from './types';
import { serializeLocationKey } from './locationKey';

/**
 * Creative entity query facade composing registry, script index, cross-modal
 * occurrence index, and relationship graph into a single query surface.
 *
 * Providers consume this interface without caring about the backing services.
 * Phase 3 adds IOccurrenceIndex and ICreativeEntityGraph; they are optional
 * so existing callers continue to work without them.
 */
export class CreativeEntityWorkspaceIndexService implements ICreativeEntityWorkspaceIndex {
  constructor(
    private readonly workspaceIndex: IWorkspaceIndex,
    private readonly characterIndex: ICharacterWorkspaceIndex,
    private readonly occurrenceIndex?: IOccurrenceIndex,
    private readonly entityGraph?: ICreativeEntityGraph,
  ) {}

  async ensureInitialized(): Promise<void> {
    await Promise.all([
      this.workspaceIndex.ensureInitialized(),
      this.characterIndex.ensureInitialized(),
      this.occurrenceIndex?.ensureInitialized(),
      this.entityGraph?.ensureInitialized(),
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

    // Merge cross-modal occurrences from the occurrence index (canvas/asset/generated)
    if (entityId && this.occurrenceIndex) {
      const crossModalOccurrences = this.occurrenceIndex.queryOccurrences('character', entityId);
      for (const occ of crossModalOccurrences) {
        occurrences.push(occ);
      }
    }

    const crossModalCounts =
      entityId && this.occurrenceIndex
        ? this.occurrenceIndex.countBySource('character', entityId)
        : undefined;

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
        canvasNodeCount: crossModalCounts?.['canvas'] ?? undefined,
        assetCount: crossModalCounts?.['asset'] ?? undefined,
        generatedAssetCount: crossModalCounts?.['generated-asset'] ?? undefined,
      },
    };
  }

  dispose(): void {
    // No subscriptions yet. Keep Disposable symmetry so future graph / occurrence
    // backends can attach cleanup here without changing provider call sites.
  }
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
      const key = serializeLocationKey(location.uri, location.range);
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
