// =============================================================================
// Character Registry Types — project-level stable identity source
// =============================================================================

export const CHARACTER_REGISTRY_VERSION = 1 as const;

export type CharacterStatus = 'confirmed' | 'candidate' | 'deprecated';

export interface CharacterRecordMetadata {
  role?: string;
  gender?: string;
  ageRange?: string;
  notes?: string;
}

export interface CharacterRecordDefaults {
  assetEntityId?: string;
  galleryNodeId?: string;
  voiceAssetId?: string;
}

export interface CharacterRecordBindings {
  assetEntityIds?: string[];
  galleryNodeIds?: string[];
  generatedAssetIds?: string[];
  scriptNames?: string[];
}

export interface CharacterRecord {
  id: string;
  canonicalName: string;
  displayName?: string;
  aliases: string[];
  status: CharacterStatus;
  metadata?: CharacterRecordMetadata;
  defaults?: CharacterRecordDefaults;
  bindings?: CharacterRecordBindings;
}

export interface CharacterRegistryFile {
  version: typeof CHARACTER_REGISTRY_VERSION;
  characters: CharacterRecord[];
}

export interface CharacterNameResolution {
  characterId: string;
  matchedBy: 'id' | 'canonicalName' | 'displayName' | 'alias' | 'scriptName';
  record: CharacterRecord;
}

export function createEmptyCharacterRegistry(): CharacterRegistryFile {
  return {
    version: CHARACTER_REGISTRY_VERSION,
    characters: [],
  };
}

export function normalizeCharacterLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isCharacterStatus(value: unknown): value is CharacterStatus {
  return value === 'confirmed' || value === 'candidate' || value === 'deprecated';
}

function isCharacterRecord(value: unknown): value is CharacterRecord {
  if (!isRecord(value)) return false;
  if (!isString(value['id'])) return false;
  if (!isString(value['canonicalName'])) return false;
  if (!isStringArray(value['aliases'])) return false;
  if (!isCharacterStatus(value['status'])) return false;

  if (value['displayName'] !== undefined && !isString(value['displayName'])) {
    return false;
  }

  const metadata = value['metadata'];
  if (metadata !== undefined && !isRecord(metadata)) {
    return false;
  }

  const defaults = value['defaults'];
  if (defaults !== undefined && !isRecord(defaults)) {
    return false;
  }

  const bindings = value['bindings'];
  if (bindings !== undefined) {
    if (!isRecord(bindings)) return false;
    if (bindings['assetEntityIds'] !== undefined && !isStringArray(bindings['assetEntityIds'])) {
      return false;
    }
    if (bindings['galleryNodeIds'] !== undefined && !isStringArray(bindings['galleryNodeIds'])) {
      return false;
    }
    if (
      bindings['generatedAssetIds'] !== undefined &&
      !isStringArray(bindings['generatedAssetIds'])
    ) {
      return false;
    }
    if (bindings['scriptNames'] !== undefined && !isStringArray(bindings['scriptNames'])) {
      return false;
    }
  }

  return true;
}

export function isCharacterRegistryFile(value: unknown): value is CharacterRegistryFile {
  if (!isRecord(value)) return false;
  if (value['version'] !== CHARACTER_REGISTRY_VERSION) return false;
  return Array.isArray(value['characters']) && value['characters'].every(isCharacterRecord);
}

