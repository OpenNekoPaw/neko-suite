import * as vscode from 'vscode';
import type { ICreativeEntityWorkspaceIndex, IWorkspaceIndex } from '../services/types';
import { serializeLocationKey } from '../services/locationKey';
import { getCharacterWordRange } from './characterRange';

/**
 * Provides go-to-definition for Fountain files.
 * Supports cross-file navigation via IWorkspaceIndex.
 */
export class FountainDefinitionProvider implements vscode.DefinitionProvider {
  constructor(
    private readonly index: IWorkspaceIndex,
    private readonly creativeEntityIndex?: ICreativeEntityWorkspaceIndex,
  ) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Definition | null> {
    await this.index.ensureInitialized();
    await this.creativeEntityIndex?.ensureInitialized();

    const match = getCharacterWordRange(document, position, this.index);
    if (!match) return null;
    const word = match.name;

    const characterQuery = this.creativeEntityIndex?.queryCharacter(word, document.uri);
    if (characterQuery?.registryDefinition) {
      return characterQuery.registryDefinition;
    }
    if (characterQuery?.scriptDefinition) {
      return characterQuery.scriptDefinition;
    }

    // Try character definition (first occurrence, current file preferred)
    const charDef = this.index.findCharacterDefinition(word, document.uri);
    if (charDef) {
      return new vscode.Location(charDef.uri, charDef.range.start);
    }

    // Try scene definition via creative entity index (sceneId-aware)
    const sceneQuery = this.creativeEntityIndex?.queryScene(word, document.uri);
    if (sceneQuery?.scriptDefinition) {
      return sceneQuery.scriptDefinition;
    }

    // Fallback: location-name-based scene lookup
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
    private readonly creativeEntityIndex?: ICreativeEntityWorkspaceIndex,
  ) {}

  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Location[]> {
    await this.index.ensureInitialized();
    await this.creativeEntityIndex?.ensureInitialized();

    const match = getCharacterWordRange(document, position, this.index);
    if (!match) return [];
    const word = match.name;

    const characterQuery = this.creativeEntityIndex?.queryCharacter(word, document.uri);
    if (characterQuery) {
      const scriptRefs =
        context.includeDeclaration && characterQuery.registryDefinition
          ? dedupeLocations([characterQuery.registryDefinition, ...characterQuery.scriptReferences])
          : [...characterQuery.scriptReferences];

      // Append cross-modal occurrences (canvas/asset/generated) if available
      const crossModalRefs = characterQuery.occurrences
        .filter((occ) => occ.source !== 'registry' && occ.source !== 'script')
        .map((occ) => occ.location);

      const references =
        crossModalRefs.length > 0
          ? dedupeLocations([...scriptRefs, ...crossModalRefs])
          : scriptRefs;

      if (references.length > 0) {
        return references;
      }
    }

    // Collect all character references across workspace
    const charLocs = this.index.findCharacterLocations(word, document.uri);
    if (charLocs.length > 0) {
      return charLocs.map((loc) => new vscode.Location(loc.uri, loc.range));
    }

    // Try scene query via creative entity index (includes canvas occurrences)
    const sceneQuery = this.creativeEntityIndex?.queryScene(word, document.uri);
    if (sceneQuery) {
      const sceneRefs = [...sceneQuery.scriptReferences];
      const sceneCrossModal = sceneQuery.occurrences
        .filter((occ) => occ.source !== 'script')
        .map((occ) => occ.location);
      if (sceneCrossModal.length > 0) {
        return dedupeLocations([...sceneRefs, ...sceneCrossModal]);
      }
      if (sceneRefs.length > 0) {
        return sceneRefs;
      }
    }

    // Fallback: location-name-based scene lookup
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

function dedupeLocations(locations: readonly vscode.Location[]): vscode.Location[] {
  const deduped = new Map<string, vscode.Location>();

  for (const location of locations) {
    const key = serializeLocationKey(location.uri, location.range);
    if (!deduped.has(key)) {
      deduped.set(key, location);
    }
  }

  return Array.from(deduped.values());
}
