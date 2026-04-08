import { describe, expect, it } from 'vitest';
import type { AssetEntity } from '@neko/shared';
import { resolveEntityMatch, suggestEntityMatches } from '../services/EntityMatchSuggester';

function createEntity(
  overrides: Partial<AssetEntity> & Pick<AssetEntity, 'id' | 'name' | 'category'>,
): AssetEntity {
  return {
    id: overrides.id,
    name: overrides.name,
    category: overrides.category,
    description: overrides.description,
    metadata: overrides.metadata ?? {},
    variants: overrides.variants ?? [],
    defaultVariantId: overrides.defaultVariantId,
    tags: overrides.tags ?? [],
    aliases: overrides.aliases ?? [],
    usageCount: overrides.usageCount ?? 0,
    lastUsedAt: overrides.lastUsedAt,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    ownership: overrides.ownership,
  };
}

describe('EntityMatchSuggester', () => {
  const entities: AssetEntity[] = [
    createEntity({
      id: 'character-1',
      name: 'Captain Nova',
      category: 'character',
      aliases: ['Nova'],
      tags: ['pilot'],
      usageCount: 8,
      updatedAt: 20,
    }),
    createEntity({
      id: 'object-1',
      name: 'Nova Blaster',
      category: 'object',
      aliases: ['Captain Sidearm'],
      tags: ['weapon'],
      usageCount: 3,
      updatedAt: 10,
    }),
    createEntity({
      id: 'environment-1',
      name: 'Hangar Deck',
      category: 'environment',
      aliases: ['Dock 7'],
      tags: ['nova'],
      usageCount: 5,
      updatedAt: 15,
    }),
  ];

  it('prioritizes exact name over alias and tag matches', () => {
    const suggestions = suggestEntityMatches('Captain Nova', entities);

    expect(suggestions[0]).toMatchObject({
      entity: expect.objectContaining({ id: 'character-1' }),
      confidence: 1,
      source: 'name',
      reason: ['exact-name'],
    });
  });

  it('returns alias and tag suggestions with deterministic confidence ordering', () => {
    const suggestions = suggestEntityMatches('Nova', entities);

    expect(suggestions.map((suggestion) => suggestion.entity.id)).toEqual([
      'character-1',
      'environment-1',
      'object-1',
    ]);
    expect(suggestions.map((suggestion) => suggestion.confidence)).toEqual([0.94, 0.78, 0.72]);
  });

  it('supports category filtering and confidence thresholds', () => {
    const suggestions = suggestEntityMatches('Nova', entities, {
      categories: ['object', 'vehicle'],
      minConfidence: 0.7,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.entity.id).toBe('object-1');
  });

  it('resolves only strong matches for direct lookup', () => {
    expect(resolveEntityMatch('Nova', entities)?.id).toBe('character-1');
    expect(resolveEntityMatch('Side', entities)).toBeNull();
  });
});
