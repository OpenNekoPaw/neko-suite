// =============================================================================
// Character Registry Types — git-tracked project identity source
// =============================================================================

export type CharacterRecordStatus = 'confirmed' | 'candidate' | 'deprecated';

export interface CharacterDefaults {
  readonly assetEntityId?: string;
  readonly galleryNodeId?: string;
  readonly voiceAssetId?: string;
}

export interface CharacterBindings {
  readonly assetEntityIds?: readonly string[];
  readonly galleryNodeIds?: readonly string[];
  readonly generatedAssetIds?: readonly string[];
  readonly scriptNames?: readonly string[];
}

export interface CharacterRecordMetadata {
  readonly role?: string;
  readonly gender?: string;
  readonly ageRange?: string;
  readonly notes?: string;
}

export interface CharacterRecord {
  readonly id: string;
  readonly canonicalName: string;
  readonly displayName?: string;
  readonly aliases: readonly string[];
  readonly status: CharacterRecordStatus;
  readonly metadata?: CharacterRecordMetadata;
  readonly defaults?: CharacterDefaults;
  readonly bindings?: CharacterBindings;
}

export interface CharacterRegistryFile {
  readonly version: 1;
  readonly characters: readonly CharacterRecord[];
}

export interface CharacterBindingMatch {
  readonly record: Pick<CharacterRecord, 'id'>;
}

export interface CharacterBindingResolver {
  resolveCharacter(name: string, uriOrPath?: string): CharacterBindingMatch | undefined;
}

export interface ResolveCharacterBindingsOptions {
  readonly uriOrPath?: string;
  readonly characterResolver?: CharacterBindingResolver;
  readonly fallbackLoader?: (names: readonly string[]) => Promise<Record<string, string>>;
}

const CHARACTER_REGISTRY_VERSION = 1 as const;

export function createEmptyCharacterRegistryFile(): CharacterRegistryFile {
  return {
    version: CHARACTER_REGISTRY_VERSION,
    characters: [],
  };
}

export function normalizeCharacterLookupKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function collectCharacterLookupKeys(record: CharacterRecord): string[] {
  const keys = [
    record.canonicalName,
    record.displayName,
    ...record.aliases,
    ...(record.bindings?.scriptNames ?? []),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(normalizeCharacterLookupKey);

  return Array.from(new Set(keys));
}

function isReadonlyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isCharacterRecordStatus(value: unknown): value is CharacterRecordStatus {
  return value === 'confirmed' || value === 'candidate' || value === 'deprecated';
}

export function isCharacterRecord(value: unknown): value is CharacterRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const aliases = candidate['aliases'];

  return (
    typeof candidate['id'] === 'string' &&
    typeof candidate['canonicalName'] === 'string' &&
    isReadonlyStringArray(aliases) &&
    isCharacterRecordStatus(candidate['status'])
  );
}

export function isCharacterRegistryFile(value: unknown): value is CharacterRegistryFile {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate['version'] === CHARACTER_REGISTRY_VERSION &&
    Array.isArray(candidate['characters']) &&
    candidate['characters'].every((record) => isCharacterRecord(record))
  );
}

export async function resolveCharacterBindingsForNames(
  names: readonly string[],
  options: ResolveCharacterBindingsOptions = {},
): Promise<Record<string, string>> {
  if (names.length === 0) {
    return {};
  }

  const resolved: Record<string, string> = {};
  const unresolved = new Set<string>();

  for (const name of names) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      continue;
    }

    if (resolved[name]) {
      continue;
    }

    const match = options.characterResolver?.resolveCharacter(name, options.uriOrPath);
    const characterId = match?.record.id;
    if (typeof characterId === 'string' && characterId.length > 0) {
      resolved[name] = characterId;
      continue;
    }

    unresolved.add(name);
  }

  if (unresolved.size === 0 || !options.fallbackLoader) {
    return resolved;
  }

  const fallback = await options.fallbackLoader([...unresolved]);
  return {
    ...fallback,
    ...resolved,
  };
}
