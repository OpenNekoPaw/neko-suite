import { describe, expect, it, vi } from 'vitest';
import type {
  CreativeEntity,
  CreativeRelationEdge,
  EntityAssetBinding,
  EntityAssetRequirement,
  NekoAssetsAPI,
  VisualIdentityDraft,
} from '@neko/shared';
import type { CharacterEntityQuery } from '../services/types';
import {
  CreativeEntityManagementService,
  buildDefaultEntityAssetBinding,
  getRequirementActions,
} from '../services/CreativeEntityManagementService';

const ENTITY: CreativeEntity = {
  id: 'char_linxia',
  kind: 'character',
  canonicalName: '林夏',
  displayName: 'Lin Xia',
  aliases: ['小夏'],
  status: 'confirmed',
};

const BINDINGS: readonly EntityAssetBinding[] = [
  {
    id: 'bind-live2d',
    entityId: 'char_linxia',
    entityKind: 'character',
    assetRef: 'project://assets/linxia-live2d',
    role: 'live2d',
    isDefault: true,
    status: 'confirmed',
    source: 'user',
    updatedAt: '2026-05-10T00:00:00.000Z',
  },
  {
    id: 'bind-bob',
    entityId: 'char_bob',
    entityKind: 'character',
    assetRef: 'project://assets/bob',
    role: 'portrait',
    status: 'confirmed',
    source: 'user',
    updatedAt: '2026-05-10T00:00:00.000Z',
  },
];

const REQUIREMENTS: readonly EntityAssetRequirement[] = [
  {
    id: 'req-portrait',
    entityId: 'char_linxia',
    entityKind: 'character',
    source: 'story',
    sourceRef: 'story://demo#10',
    requiredKinds: ['portrait', 'reference'],
    status: 'missing',
  },
  {
    id: 'req-bound',
    entityId: 'char_linxia',
    entityKind: 'character',
    source: 'live',
    sourceRef: 'live://current',
    requiredKinds: ['live2d'],
    status: 'bound',
  },
];

const DRAFTS: readonly VisualIdentityDraft[] = [
  {
    id: 'draft-1',
    characterId: 'char_linxia',
    source: 'agent',
    prompt: 'black hair portrait',
    generatedAssetIds: ['gen-1', 'gen-2'],
    extractedVisualFacts: [{ key: 'hair', value: 'black', confidence: 0.8 }],
    status: 'drafting',
  },
];

describe('CreativeEntityManagementService', () => {
  it('projects an entity detail view with occurrences, defaults, drafts, and missing requirements', async () => {
    const service = new CreativeEntityManagementService({
      entities: {
        list: async () => [ENTITY],
        get: async (id) => (id === ENTITY.id ? ENTITY : undefined),
        resolveByName: async () => undefined,
      },
      bindings: { list: async () => BINDINGS },
      requirements: { list: async () => REQUIREMENTS },
      drafts: { list: async () => DRAFTS },
      workspaceIndex: {
        queryCharacter: vi.fn(
          (): CharacterEntityQuery => ({
            kind: 'character',
            query: '林夏',
            referenceNames: ['林夏'],
            scriptReferences: [],
            occurrences: [
              {
                entityKind: 'character',
                entityId: 'char_linxia',
                source: 'canvas-text',
                role: 'reference',
                label: '林夏',
                location: {
                  uri: { toString: () => 'file:///story.fountain' },
                  range: { start: { line: 12 } },
                },
              },
            ],
            stats: { totalScriptReferences: 0, fileCount: 0 },
          }),
        ),
      },
      graph: {
        getEdgesForEntity: vi.fn((): readonly CreativeRelationEdge[] => [
          {
            from: 'char_linxia',
            to: 'asset-ref:project://assets/linxia-live2d',
            type: 'bound-to-representation',
            strength: 'confirmed',
            provenance: 'user',
          },
        ]),
      },
    });

    await expect(service.getEntityDetail('char_linxia')).resolves.toEqual(
      expect.objectContaining({
        entity: ENTITY,
        aliases: ['小夏'],
        defaults: [expect.objectContaining({ id: 'bind-live2d', role: 'live2d' })],
        missingRequirements: [expect.objectContaining({ id: 'req-portrait' })],
        visualDrafts: [expect.objectContaining({ id: 'draft-1' })],
        occurrences: [
          expect.objectContaining({ source: 'canvas-text', location: 'file:///story.fountain:13' }),
        ],
        relationships: [
          expect.objectContaining({
            type: 'bound-to-representation',
            to: 'asset-ref:project://assets/linxia-live2d',
          }),
        ],
      }),
    );
  });

  it('builds a default binding plan owned by user confirmation', () => {
    expect(
      buildDefaultEntityAssetBinding({
        entity: ENTITY,
        role: 'portrait',
        assetRef: 'project://assets/linxia-portrait',
        confidence: 0.7,
        now: '2026-05-10T00:00:00.000Z',
      }),
    ).toEqual({
      id: 'binding:character:char_linxia:portrait:project:-assets-linxia-portrait',
      entityId: 'char_linxia',
      entityKind: 'character',
      assetRef: 'project://assets/linxia-portrait',
      role: 'portrait',
      isDefault: true,
      status: 'confirmed',
      source: 'user',
      confidence: 0.7,
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
  });

  it('lists role-matching asset binding options through the Assets API contract', async () => {
    const api = {
      getAllEntities: vi.fn(async () => [
        {
          id: 'asset-live2d',
          name: '林夏 Live2D',
          category: 'character',
          metadata: {},
          variants: [],
          tags: [],
          usageCount: 0,
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
      getBindingCandidate: vi.fn(async () => ({
        assetEntityId: 'asset-live2d',
        assetRef: 'project://assets/asset-live2d',
        suggestedRoles: ['live2d'],
        confidence: 0.8,
        reason: 'Matches live2d representation signals',
      })),
    } as unknown as NekoAssetsAPI;

    const service = new CreativeEntityManagementService({
      entities: {
        list: async () => [],
        get: async () => undefined,
        resolveByName: async () => undefined,
      },
      bindings: { list: async () => [] },
      requirements: { list: async () => [] },
      drafts: { list: async () => [] },
    });

    await expect(service.buildAssetBindingOptions(api, 'live2d')).resolves.toEqual([
      expect.objectContaining({
        assetEntityId: 'asset-live2d',
        assetRef: 'project://assets/asset-live2d',
        suggestedRoles: ['live2d'],
      }),
    ]);
  });

  it('projects representation package details into default assignment roles', () => {
    const service = new CreativeEntityManagementService({
      entities: {
        list: async () => [],
        get: async () => undefined,
        resolveByName: async () => undefined,
      },
      bindings: { list: async () => [] },
      requirements: { list: async () => [] },
      drafts: { list: async () => [] },
    });

    expect(
      service.buildRepresentationPackageView(
        {
          assetEntityId: 'asset-live',
          assetRef: 'project://assets/asset-live',
          representationKinds: ['live2d', 'video'],
          files: [{ role: 'model', assetRef: 'project://assets/asset-live', mediaType: 'live2d' }],
          capabilities: ['live2d-runtime'],
          missingRoles: ['texture'],
        },
        BINDINGS,
      ),
    ).toEqual(
      expect.objectContaining({
        assignableRoles: ['live2d'],
        missingRoles: ['texture'],
      }),
    );
  });

  it('keeps missing material actions actionable until dismissed or bound', () => {
    expect(getRequirementActions(REQUIREMENTS[0]!)).toEqual([
      'generate',
      'import',
      'bind-existing',
      'dismiss',
    ]);
    expect(getRequirementActions(REQUIREMENTS[1]!)).toEqual([]);
  });
});
