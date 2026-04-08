import type { AssetEntity, EntityCategory } from './asset';

/**
 * Entity categories that participate in the unified identity matching flow.
 */
export type MatchableAssetEntityCategory = Extract<
  EntityCategory,
  'character' | 'object' | 'vehicle' | 'environment' | 'effect'
>;

/**
 * Match evidence source for deterministic and inferred suggestions.
 */
export type CreativeEntityMatchSource =
  | 'name'
  | 'alias'
  | 'tag'
  | 'rule'
  | 'lineage'
  | 'semantic'
  | 'visual';

/**
 * Shared suggestion shape for unified entity identity matching.
 */
export interface CreativeEntityMatchSuggestion<TEntity = AssetEntity> {
  readonly entity: TEntity;
  readonly confidence: number;
  readonly reason: readonly string[];
  readonly source: CreativeEntityMatchSource;
}

/**
 * Common query options for deterministic entity match suggestion providers.
 */
export interface CreativeEntityMatchOptions {
  readonly categories?: readonly MatchableAssetEntityCategory[];
  readonly limit?: number;
  readonly minConfidence?: number;
}
