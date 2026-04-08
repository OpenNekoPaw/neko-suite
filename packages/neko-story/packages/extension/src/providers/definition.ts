import * as vscode from 'vscode';
import { isTrustedOccurrenceEntry } from '@neko/shared';
import type { CreativeEntityMatchSuggestion, OccurrenceIndexEntry } from '@neko/shared';
import type { IWorkspaceIndex } from '../services/types';
import type { ICharacterWorkspaceIndex } from '../services/CharacterWorkspaceIndexService';
import type { AssetEntity, CharacterRecord, CreativeEntityRef } from '@neko/shared';

export interface IEntityOccurrenceLookup {
  findCharacterOccurrences(characterId: string): Promise<OccurrenceIndexEntry[]>;
  findOccurrences(entity: CreativeEntityRef): Promise<OccurrenceIndexEntry[]>;
}

export interface IAssetEntityLookup {
  resolveObject(name: string): Promise<AssetEntity | null>;
  suggestObjects(name: string): Promise<CreativeEntityMatchSuggestion<AssetEntity>[]>;
  getDefinitionLocation(id: string): Promise<vscode.Location | null>;
}

const NAVIGATION_SUGGESTION_THRESHOLD = 0.9;

/**
 * Provides go-to-definition for Fountain files.
 * Supports cross-file navigation via IWorkspaceIndex.
 */
export class FountainDefinitionProvider implements vscode.DefinitionProvider {
  constructor(
    private readonly index: IWorkspaceIndex,
    private readonly characterIndex?: ICharacterWorkspaceIndex,
    private readonly assetLookup?: IAssetEntityLookup,
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
      const definition = this.characterIndex?.getDefinitionLocation(
        characterResolution.characterId,
      );
      if (definition) {
        return definition;
      }
    }

    const characterSuggestion = this.pickSuggestedCharacter(
      this.characterIndex?.suggestCharacters(word),
    );
    if (characterSuggestion) {
      const definition = this.characterIndex?.getDefinitionLocation(characterSuggestion.entity.id);
      if (definition) {
        return definition;
      }
    }

    const objectEntity = await this.assetLookup?.resolveObject(word);
    if (objectEntity) {
      const definition = await this.assetLookup?.getDefinitionLocation(objectEntity.id);
      if (definition) {
        return definition;
      }
    }

    const objectSuggestion = this.pickSuggestedAsset(await this.assetLookup?.suggestObjects(word));
    if (objectSuggestion) {
      const definition = await this.assetLookup?.getDefinitionLocation(objectSuggestion.entity.id);
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

  private pickSuggestedCharacter(
    suggestions: CreativeEntityMatchSuggestion<CharacterRecord>[] | undefined,
  ): CreativeEntityMatchSuggestion<CharacterRecord> | undefined {
    return suggestions?.find(
      (suggestion) => suggestion.confidence >= NAVIGATION_SUGGESTION_THRESHOLD,
    );
  }

  private pickSuggestedAsset(
    suggestions: CreativeEntityMatchSuggestion<AssetEntity>[] | undefined,
  ): CreativeEntityMatchSuggestion<AssetEntity> | undefined {
    return suggestions?.find(
      (suggestion) => suggestion.confidence >= NAVIGATION_SUGGESTION_THRESHOLD,
    );
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
    private readonly occurrenceLookup?: IEntityOccurrenceLookup,
    private readonly assetLookup?: IAssetEntityLookup,
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
    const characterMatch =
      characterResolution ??
      this.pickSuggestedCharacter(this.characterIndex?.suggestCharacters(word));
    if (characterMatch) {
      const characterId =
        'characterId' in characterMatch ? characterMatch.characterId : characterMatch.entity.id;
      const definition = this.characterIndex?.getDefinitionLocation(characterId);
      if (definition) {
        pushLocation(definition);
      }

      const occurrences = await this.occurrenceLookup?.findCharacterOccurrences(characterId);
      for (const occurrence of occurrences ?? []) {
        if (!isTrustedOccurrenceEntry(occurrence)) {
          continue;
        }
        const location = occurrenceToLocation(occurrence);
        if (location) {
          pushLocation(location);
        }
      }
    }

    const objectEntity =
      (await this.assetLookup?.resolveObject(word)) ??
      this.pickSuggestedAsset(await this.assetLookup?.suggestObjects(word))?.entity;
    if (objectEntity) {
      const definition = await this.assetLookup?.getDefinitionLocation(objectEntity.id);
      if (definition) {
        pushLocation(definition);
      }

      const occurrences = await this.occurrenceLookup?.findOccurrences({
        kind: 'object',
        id: objectEntity.id,
        label: objectEntity.name,
      });
      for (const occurrence of occurrences ?? []) {
        if (!isTrustedOccurrenceEntry(occurrence)) {
          continue;
        }
        const location = occurrenceToLocation(occurrence);
        if (location) {
          pushLocation(location);
        }
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

    if (results.length > 0) {
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

  private pickSuggestedCharacter(
    suggestions: CreativeEntityMatchSuggestion<CharacterRecord>[] | undefined,
  ): CreativeEntityMatchSuggestion<CharacterRecord> | undefined {
    return suggestions?.find(
      (suggestion) => suggestion.confidence >= NAVIGATION_SUGGESTION_THRESHOLD,
    );
  }

  private pickSuggestedAsset(
    suggestions: CreativeEntityMatchSuggestion<AssetEntity>[] | undefined,
  ): CreativeEntityMatchSuggestion<AssetEntity> | undefined {
    return suggestions?.find(
      (suggestion) => suggestion.confidence >= NAVIGATION_SUGGESTION_THRESHOLD,
    );
  }
}

function occurrenceToLocation(entry: OccurrenceIndexEntry): vscode.Location | undefined {
  const uriValue = entry.locator.uri;
  if (!uriValue) {
    return undefined;
  }

  const uri = uriValue.includes('://') ? vscode.Uri.parse(uriValue) : vscode.Uri.file(uriValue);
  const line = entry.locator.lineStart ?? 0;
  return new vscode.Location(uri, new vscode.Range(line, 0, line, 0));
}
