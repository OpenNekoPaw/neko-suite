import { describe, expect, it, vi } from 'vitest';
import type { AssetEntity } from '@neko/shared';
import { AssetLinkingService } from '../services/AssetLinkingService';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

function createEntity(
  overrides: Partial<AssetEntity> & Pick<AssetEntity, 'id' | 'name' | 'category'>,
): AssetEntity {
  const now = Date.now();
  return {
    id: overrides.id,
    name: overrides.name,
    category: overrides.category,
    description: overrides.description,
    metadata: overrides.metadata ?? {},
    variants: overrides.variants ?? [
      {
        id: `${overrides.id}-variant`,
        entityId: overrides.id,
        name: `${overrides.name} Default`,
        attributes: {},
        files: [
          {
            id: `${overrides.id}-file`,
            variantId: `${overrides.id}-variant`,
            name: `${overrides.name}.png`,
            path: `assets/${overrides.name}.png`,
            mediaType: 'image',
            metadata: {
              fileSize: 1,
              mimeType: 'image/png',
            },
            purpose: 'main',
            createdAt: now,
          },
        ],
        createdAt: now,
      },
    ],
    defaultVariantId: overrides.defaultVariantId ?? `${overrides.id}-variant`,
    tags: overrides.tags ?? [],
    aliases: overrides.aliases,
    usageCount: overrides.usageCount ?? 0,
    lastUsedAt: overrides.lastUsedAt,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ownership: overrides.ownership,
  };
}

describe('AssetLinkingService', () => {
  it('prefers registryId matches for character assets', async () => {
    const service = new AssetLinkingService({
      loadEntities: async () => [
        createEntity({
          id: 'asset-alice',
          name: 'Alice Concept',
          category: 'character',
          metadata: {
            character: {
              registryId: 'char_alice',
            },
          },
          aliases: ['ALLY'],
        }),
      ],
    });

    await expect(
      service.linkCharacter('ALICE', {
        characterId: 'char_alice',
        aliases: ['ALLY'],
      }),
    ).resolves.toMatchObject({
      matchedBy: 'registryId',
      entity: { id: 'asset-alice' },
      reference: {
        type: 'image',
        path: 'assets/Alice Concept.png',
      },
    });
  });

  it('falls back to aliases when registryId is unavailable', async () => {
    const service = new AssetLinkingService({
      loadEntities: async () => [
        createEntity({
          id: 'asset-bob',
          name: 'Robert Turnaround',
          category: 'character',
          aliases: ['BOB'],
        }),
      ],
    });

    await expect(service.linkCharacter('BOB')).resolves.toMatchObject({
      matchedBy: 'alias',
      entity: { id: 'asset-bob' },
    });
  });

  it('links locations against environment tags', async () => {
    const service = new AssetLinkingService({
      loadEntities: async () => [
        createEntity({
          id: 'asset-cafe',
          name: 'Coffee Shop Exterior',
          category: 'environment',
          tags: ['cafe', 'day'],
        }),
      ],
    });

    await expect(service.linkLocation('CAFE')).resolves.toMatchObject({
      matchedBy: 'tag',
      entity: { id: 'asset-cafe' },
    });
  });
});
