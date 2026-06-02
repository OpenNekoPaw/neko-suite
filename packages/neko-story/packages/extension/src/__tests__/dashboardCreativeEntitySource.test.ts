import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { NEKO_AGENT_TEST_NPC_COMMAND, NEKO_AGENT_VALIDATE_CHARACTER_COMMAND } from '@neko/shared';
import type {
  CreativeEntity,
  CreativeEntityRegistry,
  EntityAssetBinding,
  EntityAssetRequirement,
  VisualIdentityDraft,
} from '@neko/shared';
import { isDashboardCreativeEntityDetail } from '@neko/shared/types/dashboard-creative-entity';
import { CreativeEntityManagementService } from '../services/CreativeEntityManagementService';
import { StoryDashboardCreativeEntitySource } from '../services/DashboardCreativeEntitySource';
import type { CharacterEntityQuery, CreativeEntityOccurrence } from '../services/types';

const workspaceRoot = '/workspace/neko-test';
const now = '2026-05-18T00:00:00.000Z';

const xiaoju: CreativeEntity = {
  id: 'char_xiaoju',
  kind: 'character',
  canonicalName: '小橘',
  displayName: '小橘',
  aliases: ['Xiaoju'],
  status: 'confirmed',
};

const noAsset: CreativeEntity = {
  id: 'char_no_asset',
  kind: 'character',
  canonicalName: '无素材角色',
  aliases: [],
  status: 'confirmed',
};

const bindings: readonly EntityAssetBinding[] = [
  {
    id: 'binding-xiaoju-portrait',
    entityId: 'char_xiaoju',
    entityKind: 'character',
    assetRef: 'project://assets/xiaoju-portrait',
    role: 'portrait',
    isDefault: true,
    status: 'confirmed',
    source: 'user',
    updatedAt: now,
  },
  {
    id: 'binding-xiaoju-market',
    entityId: 'char_xiaoju',
    entityKind: 'character',
    assetRef: 'market://pack/xiaoju-ref',
    role: 'reference',
    isDefault: true,
    status: 'confirmed',
    source: 'matcher',
    updatedAt: now,
  },
];

const requirements: readonly EntityAssetRequirement[] = [
  {
    id: 'requirement-xiaoju-live2d',
    entityId: 'char_xiaoju',
    entityKind: 'character',
    source: 'story',
    sourceRef: 'story://test.fountain#12',
    requiredKinds: ['live2d'],
    status: 'missing',
  },
  {
    id: 'requirement-no-asset',
    entityId: 'char_no_asset',
    entityKind: 'character',
    source: 'story',
    sourceRef: '/workspace/neko-test/.neko/.cache/entity.json',
    requiredKinds: ['portrait', 'reference'],
    status: 'missing',
  },
];

const drafts: readonly VisualIdentityDraft[] = [
  {
    id: 'draft-xiaoju',
    characterId: 'char_xiaoju',
    source: 'agent',
    prompt: 'orange coat, warm expression',
    generatedAssetIds: ['generated-xiaoju-1'],
    selectedAssetId: 'generated-xiaoju-1',
    extractedVisualFacts: [{ key: 'outfit', value: 'orange coat', confidence: 0.8 }],
    status: 'selected',
  },
];

describe('StoryDashboardCreativeEntitySource', () => {
  it('projects confirmed entities, candidates, bindings, requirements, drafts, and suggestions', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const source = createSource({
      executeCommand,
      characterNames: ['小橘', '阿灰'],
    });

    const snapshot = await source.getSnapshot();

    expect(snapshot.rows.map((row) => row.label)).toEqual(['阿灰', '小橘', '无素材角色']);
    expect(snapshot.rows.find((row) => row.label === '小橘')).toEqual(
      expect.objectContaining({
        status: 'confirmed',
        defaultBindingRoles: ['portrait', 'reference'],
        missingRepresentationKinds: ['live2d'],
        visualDraftCount: 1,
        syncSuggestionCount: 4,
        actions: expect.arrayContaining([expect.objectContaining({ id: 'test-npc' })]),
      }),
    );
    expect(snapshot.rows.find((row) => row.label === '小橘')?.actions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'validate-character' })]),
    );
    expect(snapshot.rows.find((row) => row.label === '阿灰')).toEqual(
      expect.objectContaining({
        status: 'candidate',
        sourceKind: 'script',
        missingRepresentationKinds: ['portrait', 'reference'],
        actions: expect.arrayContaining([
          expect.objectContaining({ id: 'test-npc' }),
          expect.objectContaining({ id: 'validate-character', disabled: true }),
        ]),
      }),
    );

    const detail = await source.getDetail({
      source: 'neko-story',
      sourceEntityId: 'entity:char_xiaoju',
      entityId: 'char_xiaoju',
      entityKind: 'character',
      workspaceFolder: 'neko-test',
    });

    expect(detail).toEqual(
      expect.objectContaining({
        label: '小橘',
        defaults: [
          expect.objectContaining({ role: 'portrait' }),
          expect.objectContaining({ role: 'reference' }),
        ],
        requirements: [expect.objectContaining({ sourceRef: 'story://test.fountain#12' })],
        visualDrafts: [expect.objectContaining({ id: 'draft-xiaoju', factCount: 1 })],
        syncSuggestions: expect.arrayContaining([
          expect.objectContaining({ kind: 'binding-mismatch' }),
          expect.objectContaining({
            kind: 'generated-asset-registration',
            targetRef: 'generated://generated-xiaoju-1',
          }),
          expect.objectContaining({ targetRef: 'project://assets/xiaoju-portrait' }),
          expect.objectContaining({ targetRef: 'market://pack/xiaoju-ref', readonlyTarget: true }),
        ]),
        actions: expect.arrayContaining([
          expect.objectContaining({ id: 'character-perspective' }),
          expect.objectContaining({ id: 'validate-character' }),
          expect.objectContaining({ id: 'improve-character' }),
        ]),
      }),
    );
    expect(isDashboardCreativeEntityDetail(detail)).toBe(true);

    await expect(
      source.executeAction({
        source: 'neko-story',
        ref: detail?.ref,
        action: 'bind-existing',
        role: 'portrait',
      }),
    ).resolves.toEqual(expect.objectContaining({ ok: true, refresh: true }));
    expect(executeCommand).toHaveBeenCalledWith('neko.story.setCreativeEntityDefaultBinding', {
      entityId: 'char_xiaoju',
      role: 'portrait',
    });
  });

  it('delegates Dashboard NPC Agent workflows to Agent-owned commands', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const source = createSource({
      executeCommand,
      characterNames: ['小橘'],
    });
    const detail = await source.getDetail({
      source: 'neko-story',
      sourceEntityId: 'entity:char_xiaoju',
      entityId: 'char_xiaoju',
      entityKind: 'character',
      workspaceFolder: 'neko-test',
    });

    await expect(
      source.executeAction({
        source: 'neko-story',
        ref: detail?.ref,
        action: 'validate-character',
        payload: {
          scopes: [{ kind: 'occurrence', source: 'neko-story', ref: 'cases/test.fountain:8' }],
          prompt: 'Check branching dialogue.',
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        refresh: false,
        npcWorkflow: { kind: 'delegated-command', command: NEKO_AGENT_VALIDATE_CHARACTER_COMMAND },
      }),
    );

    expect(executeCommand).toHaveBeenCalledWith(
      NEKO_AGENT_VALIDATE_CHARACTER_COMMAND,
      expect.objectContaining({
        workflow: 'validate-character',
        entityRef: {
          entityId: 'char_xiaoju',
          entityKind: 'character',
          projectRoot: workspaceRoot,
          source: 'neko-story',
        },
        dashboardRef: detail?.ref,
        scopes: [{ kind: 'occurrence', source: 'neko-story', ref: 'cases/test.fountain:8' }],
        prompt: 'Check branching dialogue.',
        source: 'dashboard',
        projectRoot: workspaceRoot,
      }),
    );
  });

  it('delegates Dashboard NPC tests to the Agent-owned launch command', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const source = createSource({
      executeCommand,
      characterNames: ['小橘', '阿灰'],
    });
    const detail = await source.getDetail({
      source: 'neko-story',
      sourceEntityId: 'entity:char_xiaoju',
      entityId: 'char_xiaoju',
      entityKind: 'character',
      workspaceFolder: 'neko-test',
    });

    await expect(
      source.executeAction({
        source: 'neko-story',
        ref: detail?.ref,
        action: 'test-npc',
        payload: { mode: 'consult' },
      }),
    ).resolves.toEqual(expect.objectContaining({ ok: true, refresh: false, ref: detail?.ref }));

    expect(executeCommand).toHaveBeenCalledWith(
      NEKO_AGENT_TEST_NPC_COMMAND,
      expect.objectContaining({
        entityRef: {
          entityId: 'char_xiaoju',
          entityKind: 'character',
          projectRoot: workspaceRoot,
          source: 'neko-story',
        },
        dashboardRef: detail?.ref,
        source: 'dashboard',
        projectRoot: workspaceRoot,
        mode: 'consult',
      }),
    );

    const candidateRef = {
      source: 'neko-story',
      sourceEntityId: 'candidate:character:阿灰',
      entityId: '阿灰',
      entityKind: 'character' as const,
      workspaceFolder: 'neko-test',
    };
    await expect(
      source.executeAction({
        source: 'neko-story',
        ref: candidateRef,
        action: 'test-npc',
      }),
    ).resolves.toEqual(expect.objectContaining({ ok: true, refresh: false, ref: candidateRef }));

    expect(executeCommand).toHaveBeenLastCalledWith(
      NEKO_AGENT_TEST_NPC_COMMAND,
      expect.objectContaining({
        entityRef: expect.objectContaining({ entityId: '阿灰', entityKind: 'character' }),
        dashboardRef: candidateRef,
        source: 'dashboard',
        projectRoot: workspaceRoot,
      }),
    );
  });

  it('keeps entities without assets visible and sanitizes unsafe requirement refs', async () => {
    const source = createSource({ characterNames: ['小橘'] });

    const detail = await source.getDetail({
      source: 'neko-story',
      sourceEntityId: 'entity:char_no_asset',
      entityId: 'char_no_asset',
      entityKind: 'character',
      workspaceFolder: 'neko-test',
    });

    expect(detail).toEqual(
      expect.objectContaining({
        label: '无素材角色',
        bindings: [],
        defaults: [],
        requirements: [
          expect.objectContaining({
            sourceRef: 'requirement:requirement-no-asset',
            requiredKinds: ['portrait', 'reference'],
          }),
        ],
      }),
    );
    expect(JSON.stringify(detail)).not.toContain('/workspace/neko-test');
    expect(JSON.stringify(detail)).not.toContain('.neko/.cache');
    expect(isDashboardCreativeEntityDetail(detail)).toBe(true);
  });

  it('builds candidate details from script occurrences without absolute paths', async () => {
    const source = createSource({ characterNames: ['小橘', '阿灰'] });

    const detail = await source.getDetail({
      source: 'neko-story',
      sourceEntityId: 'candidate:character:阿灰',
      entityId: '阿灰',
      entityKind: 'character',
      workspaceFolder: 'neko-test',
    });

    expect(detail).toEqual(
      expect.objectContaining({
        label: '阿灰',
        status: 'candidate',
        occurrences: [expect.objectContaining({ location: 'cases/test.fountain:8' })],
        requirements: [
          expect.objectContaining({
            sourceRef: 'cases/test.fountain:8',
            requiredKinds: ['portrait', 'reference'],
          }),
        ],
      }),
    );
    expect(JSON.stringify(detail)).not.toContain('/workspace/neko-test');
    expect(isDashboardCreativeEntityDetail(detail)).toBe(true);
  });

  it('emits stale refresh events from workspace and graph updates', () => {
    const workspaceListeners: Array<() => void> = [];
    const graphListeners: Array<() => void> = [];
    const source = createSource({ workspaceListeners, graphListeners });
    const listener = vi.fn();

    const disposable = source.onDidChangeEntity(listener);
    workspaceListeners[0]?.();
    graphListeners[0]?.();
    disposable.dispose();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith({
      type: 'refreshed',
      source: 'neko-story',
      freshness: 'stale',
    });
  });

  it('limits script candidates to the requested workspace root', async () => {
    const source = createSource({
      characterNames: ['小橘'],
      externalCharacterNames: ['隔壁角色'],
    });

    const snapshot = await source.getSnapshot();

    expect(snapshot.rows.map((row) => row.label)).toContain('小橘');
    expect(snapshot.rows.map((row) => row.label)).not.toContain('隔壁角色');
  });

  it('does not mutate asset metadata when applying unavailable sync suggestions', async () => {
    const source = createSource({ characterNames: ['小橘'] });

    await expect(
      source.executeAction({
        source: 'neko-story',
        action: 'apply-sync-suggestion',
        suggestionId: 'sync-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        refresh: false,
        message: expect.stringContaining('No asset metadata was changed'),
      }),
    );
  });

  it('keeps renamed entity facts as suggestions without mutating asset library data', async () => {
    const mutatedAssets: unknown[] = [];
    const renamedEntity: CreativeEntity = {
      ...xiaoju,
      canonicalName: '小橘二号',
      displayName: '小橘二号',
      aliases: ['小橘', 'Xiaoju'],
    };
    const source = createSource({
      entities: [renamedEntity],
      executeCommand: async (command, args) => {
        mutatedAssets.push({ command, args });
      },
    });

    const detail = await source.getDetail({
      source: 'neko-story',
      sourceEntityId: 'entity:char_xiaoju',
      entityId: 'char_xiaoju',
      entityKind: 'character',
      workspaceFolder: 'neko-test',
    });

    expect(detail?.label).toBe('小橘二号');
    expect(detail?.syncSuggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'asset-metadata',
          targetRef: 'project://assets/xiaoju-portrait',
          fields: ['label', 'tags', 'description'],
        }),
      ]),
    );
    expect(mutatedAssets).toEqual([]);

    await source.executeAction({
      source: 'neko-story',
      ref: detail?.ref,
      action: 'ignore-sync-suggestion',
      suggestionId: 'sync-ignored',
    });
    expect(mutatedAssets).toEqual([]);
  });

  it('opens the source location for confirmed and candidate entities', async () => {
    const openedLocations: vscode.Location[] = [];
    const openLocation = vi.fn(async (location: vscode.Location) => {
      openedLocations.push(location);
    });
    const source = createSource({ characterNames: ['小橘', '阿灰'], openLocation });

    await expect(
      source.executeAction({
        source: 'neko-story',
        ref: {
          source: 'neko-story',
          sourceEntityId: 'entity:char_xiaoju',
          entityId: 'char_xiaoju',
          entityKind: 'character',
          workspaceFolder: 'neko-test',
        },
        action: 'open-source',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        refresh: false,
      }),
    );

    const confirmedLocation = openedLocations[0];
    expect(confirmedLocation?.uri.toString()).toBe('file:///workspace/neko-test/characters.json');
    expect(confirmedLocation?.range.start.line).toBe(4);

    await expect(
      source.executeAction({
        source: 'neko-story',
        ref: {
          source: 'neko-story',
          sourceEntityId: 'candidate:character:阿灰',
          entityId: '阿灰',
          entityKind: 'character',
          workspaceFolder: 'neko-test',
        },
        action: 'open-source',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        refresh: false,
      }),
    );

    const candidateLocation = openedLocations[1];
    expect(candidateLocation?.uri.toString()).toBe(
      'file:///workspace/neko-test/cases/test.fountain',
    );
    expect(candidateLocation?.range.start.line).toBe(7);
  });
});

interface CreateSourceOptions {
  readonly entities?: readonly CreativeEntity[];
  readonly characterNames?: readonly string[];
  readonly externalCharacterNames?: readonly string[];
  readonly executeCommand?: (command: string, ...args: unknown[]) => Promise<unknown>;
  readonly openLocation?: (location: vscode.Location) => Promise<unknown>;
  readonly workspaceListeners?: Array<() => void>;
  readonly graphListeners?: Array<() => void>;
}

function createSource(options: CreateSourceOptions = {}): StoryDashboardCreativeEntitySource {
  const registry = createRegistry(options.entities ?? [xiaoju, noAsset]);
  const onDidUpdateIndex: vscode.Event<vscode.Uri[]> = (listener) => {
    options.workspaceListeners?.push(() => listener([]));
    return { dispose() {} };
  };
  const creativeEntityIndex = {
    ensureInitialized: vi.fn(async () => undefined),
    queryCharacter: vi.fn((name: string) => createCharacterQuery(name)),
  };
  const entityGraph = {
    ensureInitialized: vi.fn(async () => undefined),
    getEdgesForEntity: vi.fn(() => []),
    onDidUpdate: (listener: () => void) => {
      options.graphListeners?.push(listener);
      return { dispose() {} };
    },
  };
  const management = new CreativeEntityManagementService({
    entities: registry,
    bindings: { list: async () => bindings },
    requirements: { list: async () => requirements },
    drafts: { list: async () => drafts },
    workspaceIndex: creativeEntityIndex,
    graph: entityGraph,
  });

  return new StoryDashboardCreativeEntitySource({
    workspaceRoot,
    workspaceIndex: {
      ensureInitialized: vi.fn(async () => undefined),
      getAllCharacterNames: vi.fn(() => options.characterNames ?? ['小橘']),
      getAllScriptIndices: vi.fn(() => {
        const projectNames = options.characterNames ?? ['小橘'];
        const externalNames = options.externalCharacterNames ?? [];
        return [
          ...(projectNames.length > 0
            ? [
                {
                  uri: `file://${workspaceRoot}/cases/test.fountain`,
                  total_lines: 10,
                  scenes: [],
                  characters: projectNames.map((name, index) => ({
                    name,
                    first_line: index,
                    scene_ids: [],
                  })),
                },
              ]
            : []),
          ...(externalNames.length > 0
            ? [
                {
                  uri: 'file:///workspace/other/cases/test.fountain',
                  total_lines: 10,
                  scenes: [],
                  characters: externalNames.map((name, index) => ({
                    name,
                    first_line: index,
                    scene_ids: [],
                  })),
                },
              ]
            : []),
        ];
      }),
      onDidUpdateIndex,
    },
    creativeEntityIndex,
    entityGraph,
    registry,
    bindings: { list: async () => bindings },
    requirements: {
      list: async () => requirements,
      upsert: vi.fn(async () => undefined),
    },
    drafts: { list: async () => drafts },
    management,
    executeCommand: options.executeCommand,
    openLocation: options.openLocation,
    now: () => now,
  });
}

function createRegistry(entities: readonly CreativeEntity[]): CreativeEntityRegistry {
  return {
    list: async () => entities,
    get: async (id) => entities.find((entity) => entity.id === id),
    resolveByName: async (name, kind) =>
      entities.find(
        (entity) =>
          (!kind || entity.kind === kind) &&
          (entity.canonicalName === name ||
            entity.displayName === name ||
            entity.aliases.includes(name)),
      ),
  };
}

function createCharacterQuery(name: string): CharacterEntityQuery | undefined {
  if (name === '小橘') {
    return {
      kind: 'character',
      query: name,
      referenceNames: ['小橘', 'Xiaoju'],
      registryDefinition: createLocation('file:///workspace/neko-test/characters.json', 4),
      scriptReferences: [],
      occurrences: [createOccurrence('小橘', 2)],
      stats: { totalScriptReferences: 1, fileCount: 1 },
    };
  }
  if (name === '阿灰') {
    const occurrence = createOccurrence('阿灰', 7);
    return {
      kind: 'character',
      query: name,
      candidate: true,
      referenceNames: ['阿灰'],
      scriptDefinition: occurrence.location,
      scriptReferences: [occurrence.location],
      occurrences: [occurrence],
      stats: { totalScriptReferences: 1, fileCount: 1 },
    };
  }
  return undefined;
}

function createLocation(uri: string, line: number): vscode.Location {
  return {
    uri: { toString: () => uri },
    range: { start: { line }, end: { line } },
  } as unknown as vscode.Location;
}

function createOccurrence(label: string, line: number): CreativeEntityOccurrence {
  return {
    entityKind: 'character',
    source: 'script',
    role: 'reference',
    label,
    location: createLocation('file:///workspace/neko-test/cases/test.fountain', line),
  };
}
