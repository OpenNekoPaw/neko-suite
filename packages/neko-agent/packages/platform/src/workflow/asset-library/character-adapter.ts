/**
 * CharacterAdapter — read-only wrapper around CharacterRegistryFile.
 *
 * Translates neko-types CharacterRecord → workflow-module Entity.
 * See docs/architecture/asset-knowledge-graph.md §4.
 */

import type { CharacterRegistryFile, CharacterRecord } from '@neko/shared';
import { collectCharacterLookupKeys, normalizeCharacterLookupKey } from '@neko/shared';
import type { Entity, EntityKind } from './types';

export interface CharacterIndex {
  /** All entities indexed by id */
  readonly byId: ReadonlyMap<string, Entity>;
  /** Normalized name/alias → entity id */
  readonly byLookupKey: ReadonlyMap<string, string>;
  /** Access the backing records (read-only) for bindings/defaults lookups */
  readonly records: ReadonlyMap<string, CharacterRecord>;
}

export function indexCharacterRegistry(
  registry: CharacterRegistryFile | undefined,
): CharacterIndex {
  const byId = new Map<string, Entity>();
  const byLookupKey = new Map<string, string>();
  const records = new Map<string, CharacterRecord>();

  if (!registry) return { byId, byLookupKey, records };

  for (const record of registry.characters) {
    if (record.status === 'deprecated') continue;
    const entity = toEntity(record);
    byId.set(record.id, entity);
    records.set(record.id, record);
    for (const key of collectCharacterLookupKeys(record)) {
      // first-come-wins if there's a collision (shouldn't happen with well-formed data)
      if (!byLookupKey.has(key)) byLookupKey.set(key, record.id);
    }
  }

  return { byId, byLookupKey, records };
}

export function lookupEntityByName(index: CharacterIndex, name: string): Entity | undefined {
  const key = normalizeCharacterLookupKey(name);
  if (!key) return undefined;
  const id = index.byLookupKey.get(key);
  if (id === undefined) return undefined;
  return index.byId.get(id);
}

// =============================================================================
// Translation: CharacterRecord → Entity
// =============================================================================

function toEntity(record: CharacterRecord): Entity {
  const kind: EntityKind = 'character';
  const attrs: Record<string, string | number | boolean> = {};
  if (record.metadata?.role) attrs.role = record.metadata.role;
  if (record.metadata?.gender) attrs.gender = record.metadata.gender;
  if (record.metadata?.ageRange) attrs.ageRange = record.metadata.ageRange;

  return {
    id: record.id,
    kind,
    canonicalName: record.canonicalName,
    aliases: record.aliases ?? [],
    ...(Object.keys(attrs).length > 0 && { attributes: attrs }),
  };
}
