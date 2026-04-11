import * as vscode from 'vscode';
import type {
  CharacterEntityQuery,
  CreativeEntityOccurrence,
  ICharacterWorkspaceIndex,
  ICreativeEntityGraph,
  ICreativeEntityWorkspaceIndex,
  IOccurrenceIndex,
  ISceneWorkspaceIndex,
  IWorkspaceIndex,
  SceneEntityQuery,
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
    private readonly sceneIndex?: ISceneWorkspaceIndex,
  ) {}

  async ensureInitialized(): Promise<void> {
    await Promise.all([
      this.workspaceIndex.ensureInitialized(),
      this.characterIndex.ensureInitialized(),
      this.occurrenceIndex?.ensureInitialized(),
      this.entityGraph?.ensureInitialized(),
      this.sceneIndex?.ensureInitialized(),
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

  queryScene(query: string, currentUri?: vscode.Uri): SceneEntityQuery | undefined {
    const trimmed = query.trim();
    if (trimmed.length === 0 || !this.sceneIndex) {
      return undefined;
    }

    const resolved = this.sceneIndex.resolveScene(trimmed, currentUri);
    if (!resolved) {
      return undefined;
    }

    const { entry, scriptUri } = resolved;
    const sceneId = entry.sceneId;

    const scriptDefinition = new vscode.Location(
      scriptUri,
      new vscode.Range(entry.line_start, 0, entry.line_start, entry.heading.length),
    );

    const scriptReferences = this.sceneIndex.getLocationReferences(entry.location, currentUri);
    const canvasBinding = this.sceneIndex.getCanvasBinding(sceneId, scriptUri);

    const occurrences: CreativeEntityOccurrence[] = [
      {
        entityKind: 'scene',
        entityId: sceneId,
        source: 'script',
        role: 'definition',
        label: entry.heading,
        location: scriptDefinition,
        detail: `${entry.intExt ?? ''} ${entry.location} - ${entry.timeOfDay ?? ''}`.trim(),
      },
    ];

    if (this.occurrenceIndex) {
      for (const occ of this.occurrenceIndex.queryOccurrences('scene', sceneId)) {
        occurrences.push(occ);
      }
    }

    const crossModalCounts = this.occurrenceIndex?.countBySource('scene', sceneId);

    return {
      kind: 'scene',
      query: trimmed,
      sceneId,
      heading: entry.heading,
      location: entry.location,
      intExt: entry.intExt,
      timeOfDay: entry.timeOfDay,
      sceneCharacters: entry.sceneCharacters,
      scriptDefinition,
      scriptReferences,
      occurrences,
      canvasSceneNodeId: canvasBinding?.canvasSceneNodeId,
      stats: {
        totalScriptOccurrences: scriptReferences.length,
        fileCount: countDistinctLocations(scriptReferences),
        canvasNodeCount: crossModalCounts?.['canvas'] ?? undefined,
        shotCount: canvasBinding?.shotIds.length ?? undefined,
        characterCount: entry.sceneCharacters.length,
        estimatedDuration: entry.estimatedDuration,
      },
    };
  }

  dispose(): void {
    // No subscriptions owned. Keep Disposable symmetry so backing services
    // can attach cleanup here without changing provider call sites.
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

function countDistinctLocations(locations: readonly vscode.Location[]): number {
  const files = new Set<string>();

  for (const location of locations) {
    files.add(location.uri.toString());
  }

  return files.size;
}
