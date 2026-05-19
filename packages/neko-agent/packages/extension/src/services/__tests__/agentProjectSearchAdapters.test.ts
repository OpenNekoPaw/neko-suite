import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSearchAdapter, ProjectSearchItem } from '@neko/shared';
import {
  DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION,
  type DashboardCreativeEntitySource,
} from '@neko/shared/types/dashboard-creative-entity';
import { createAgentProjectSearchAdapters } from '../agentProjectSearchAdapters';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

const tempRoots: string[] = [];

describe('createAgentProjectSearchAdapters', () => {
  afterEach(async () => {
    for (const root of tempRoots.splice(0)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('merges compatibility creative entities with unified entity projections', async () => {
    const projectRoot = await createProjectRootWithUnifiedEntity({
      id: 'scene-narration',
      kind: 'scene',
      canonicalName: '讲述',
      aliases: ['旁白段落'],
    });
    const adapters = createAgentProjectSearchAdapters(
      {},
      {
        createCompatibilityAdapters: () => [
          createCompatibilityStoryAdapter(),
          createCompatibilityCreativeEntityAdapter(projectRoot),
        ],
      },
    );
    const creativeEntities = adapters.find((adapter) => adapter.partition === 'creative-entities');

    expect(creativeEntities).toBeDefined();

    const items = await creativeEntities?.query(
      { text: '讲述', mode: 'mention', kinds: ['creative-entity'] },
      { projectRoot },
    );

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'creative-entity',
          label: '讲述',
          source: expect.objectContaining({ sourceId: 'neko-entity' }),
        }),
      ]),
    );

    const allItems = await creativeEntities?.query(
      { text: '', mode: 'mention', kinds: ['creative-entity'] },
      { projectRoot },
    );

    expect(allItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'legacy:mentor', label: '猫妈妈' }),
        expect.objectContaining({ id: 'entity:scene:scene-narration', label: '讲述' }),
      ]),
    );
  });

  it('keeps non-creative compatibility adapters unchanged', () => {
    const storyAdapter = createCompatibilityStoryAdapter();
    const adapters = createAgentProjectSearchAdapters(
      {},
      {
        createCompatibilityAdapters: () => [
          storyAdapter,
          createCompatibilityCreativeEntityAdapter('/workspace'),
        ],
      },
    );

    expect(adapters).toContain(storyAdapter);
  });

  it('coalesces multiple creative entity compatibility adapters into one partition adapter', async () => {
    const projectRoot = await createProjectRootWithUnifiedEntity({
      id: 'scene-narration',
      kind: 'scene',
      canonicalName: '讲述',
      aliases: [],
    });
    const extraItem = {
      id: 'legacy:other',
      kind: 'creative-entity',
      label: '另一条旧实体',
      source: {
        partition: 'creative-entities',
        sourceId: 'legacy-other',
        sourceKind: 'character',
      },
      projectRoot,
      canonicalName: '另一条旧实体',
      searchText: '另一条旧实体',
      freshness: 'fresh',
    } satisfies ProjectSearchItem;

    const adapters = createAgentProjectSearchAdapters(
      {},
      {
        createCompatibilityAdapters: () => [
          createCompatibilityCreativeEntityAdapter(projectRoot),
          createStaticCreativeEntityAdapter(extraItem),
        ],
      },
    );
    const creativeAdapters = adapters.filter(
      (adapter) => adapter.partition === 'creative-entities',
    );

    expect(creativeAdapters).toHaveLength(1);

    const items = await creativeAdapters[0]?.query({ text: '', mode: 'mention' }, { projectRoot });

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'legacy:mentor' }),
        expect.objectContaining({ id: 'legacy:other' }),
        expect.objectContaining({ id: 'entity:scene:scene-narration' }),
      ]),
    );
  });

  it('keeps same-name entity candidates distinct', async () => {
    const projectRoot = await createProjectRootWithUnifiedEntity({
      id: 'scene-narration',
      kind: 'scene',
      canonicalName: '讲述',
      aliases: [],
    });
    const firstCandidate = createEntityCandidateItem(projectRoot, 'candidate:a', '讲述');
    const secondCandidate = createEntityCandidateItem(projectRoot, 'candidate:b', '讲述');
    const adapters = createAgentProjectSearchAdapters(
      {},
      {
        createCompatibilityAdapters: () => [
          createStaticCreativeEntityAdapter(firstCandidate),
          createStaticCreativeEntityAdapter(secondCandidate),
        ],
      },
    );
    const creativeEntities = adapters.find((adapter) => adapter.partition === 'creative-entities');

    const items = await creativeEntities?.query(
      { text: '讲述', mode: 'mention', kinds: ['entity-candidate'] },
      { projectRoot },
    );

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'candidate:a' }),
        expect.objectContaining({ id: 'candidate:b' }),
      ]),
    );
  });

  it('projects dashboard story candidates without persisted entity files', async () => {
    const projectRoot = await createEmptyProjectRoot();
    const source = createDashboardSource(projectRoot, {
      label: '小橘',
      sourceEntityId: 'candidate:character:小橘',
      status: 'candidate',
    });
    const adapters = createAgentProjectSearchAdapters(
      {},
      {
        createCompatibilityAdapters: () => [],
        loadDashboardCreativeEntitySources: async () => [source],
      },
    );
    const creativeEntities = adapters.find((adapter) => adapter.partition === 'creative-entities');

    const items = await creativeEntities?.query(
      { text: '小橘', mode: 'mention', kinds: ['entity-candidate'] },
      { projectRoot },
    );

    expect(items).toEqual([
      expect.objectContaining({
        kind: 'entity-candidate',
        label: '小橘',
        source: expect.objectContaining({
          sourceId: 'neko-story',
          metadata: expect.objectContaining({ entityKind: 'character' }),
        }),
        navigationData: expect.objectContaining({
          source: 'neko-story',
          sourceEntityId: 'candidate:character:小橘',
        }),
      }),
    ]);
  });

  it('extracts context script character candidates when dashboard sources are empty', async () => {
    const projectRoot = await createEmptyProjectRoot();
    const filePath = join(projectRoot, 'cases', 'test.fountain');
    const script = [
      'EXT. 猫猫家门口 - 清晨',
      '',
      '@小橘',
      '今天是上学第一天！',
      '',
      '@猫妈妈',
    ].join('\n');
    const adapters = createAgentProjectSearchAdapters(
      {},
      {
        createCompatibilityAdapters: () => [],
        loadDashboardCreativeEntitySources: async () => [],
        readTextFile: async () => script,
      },
    );
    const creativeEntities = adapters.find((adapter) => adapter.partition === 'creative-entities');

    const items = await creativeEntities?.query(
      { text: '小橘', mode: 'mention', kinds: ['entity-candidate'] },
      {
        projectRoot,
        resolvedContextFilePath: filePath,
      },
    );

    expect(items).toEqual([
      expect.objectContaining({
        kind: 'entity-candidate',
        label: '小橘',
        filePath,
        source: expect.objectContaining({
          sourceId: 'agent-context-script',
          sourceKind: 'script',
          metadata: expect.objectContaining({ entityKind: 'character' }),
        }),
        navigationData: expect.objectContaining({
          entityKind: 'character',
          line: 2,
        }),
      }),
    ]);
  });
});

async function createEmptyProjectRoot(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'neko-agent-entity-search-'));
  tempRoots.push(projectRoot);
  return projectRoot;
}

async function createProjectRootWithUnifiedEntity(entity: {
  readonly id: string;
  readonly kind: 'scene';
  readonly canonicalName: string;
  readonly aliases: readonly string[];
}): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'neko-agent-entity-search-'));
  tempRoots.push(projectRoot);
  const entityDir = join(projectRoot, 'neko', 'entities');
  await mkdir(entityDir, { recursive: true });
  await writeFile(
    join(entityDir, 'scenes.json'),
    `${JSON.stringify(
      {
        version: 1,
        kind: 'scene',
        entities: [
          {
            id: entity.id,
            kind: entity.kind,
            canonicalName: entity.canonicalName,
            aliases: entity.aliases,
            status: 'confirmed',
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return projectRoot;
}

function createCompatibilityStoryAdapter(): ProjectSearchAdapter {
  return {
    partition: 'story-symbols',
    ensureInitialized: async () => undefined,
    query: async () => [],
    getStatus: () => ({ partition: 'story-symbols', status: 'ready', freshness: 'fresh' }),
  };
}

function createCompatibilityCreativeEntityAdapter(projectRoot: string): ProjectSearchAdapter {
  const item: ProjectSearchItem = {
    id: 'legacy:mentor',
    kind: 'creative-entity',
    label: '猫妈妈',
    source: {
      partition: 'creative-entities',
      sourceId: 'legacy-mentor',
      sourceKind: 'character',
    },
    projectRoot,
    canonicalName: '猫妈妈',
    searchText: '猫妈妈 character',
    freshness: 'fresh',
    metadata: { entityType: 'character' },
  };

  return {
    partition: 'creative-entities',
    ensureInitialized: async () => undefined,
    query: async (query) => {
      if (query.text && !item.searchText.includes(query.text)) return [];
      return [item];
    },
    getStatus: () => ({
      partition: 'creative-entities',
      status: 'ready',
      freshness: 'fresh',
      itemCount: 1,
    }),
  };
}

function createStaticCreativeEntityAdapter(item: ProjectSearchItem): ProjectSearchAdapter {
  return {
    partition: 'creative-entities',
    ensureInitialized: async () => undefined,
    query: async () => [item],
    getStatus: () => ({
      partition: 'creative-entities',
      status: 'ready',
      freshness: 'fresh',
      itemCount: 1,
    }),
  };
}

function createEntityCandidateItem(
  projectRoot: string,
  id: string,
  label: string,
): ProjectSearchItem {
  return {
    id,
    kind: 'entity-candidate',
    label,
    source: {
      partition: 'creative-entities',
      sourceId: id,
      sourceKind: 'candidate',
    },
    projectRoot,
    searchText: label,
    freshness: 'fresh',
  };
}

function createDashboardSource(
  projectRoot: string,
  row: {
    readonly label: string;
    readonly sourceEntityId: string;
    readonly status: 'candidate' | 'confirmed';
  },
): DashboardCreativeEntitySource {
  return {
    contractVersion: DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION,
    source: 'neko-story',
    sourceDisplayName: 'Neko Story',
    getSnapshot: async () => ({
      source: 'neko-story',
      sourceDisplayName: 'Neko Story',
      status: {
        source: 'neko-story',
        sourceDisplayName: 'Neko Story',
        available: true,
        freshness: 'fresh',
        entityCount: 1,
        updatedAt: '2026-05-19T00:00:00.000Z',
      },
      rows: [
        {
          ref: {
            source: 'neko-story',
            sourceEntityId: row.sourceEntityId,
            entityId: row.label,
            entityKind: 'character',
          },
          label: row.label,
          kind: 'character',
          status: row.status,
          sourceKind: row.status === 'candidate' ? 'script' : 'registry',
          summary: 'Script character candidate',
          occurrenceCount: 3,
          freshness: 'fresh',
          actions: [],
          searchText: `${row.label} character script candidate`,
        },
      ],
      freshness: 'fresh',
      updatedAt: '2026-05-19T00:00:00.000Z',
    }),
    getDetail: async () => undefined,
    executeAction: async () => ({ ok: true }),
    onDidChangeEntity: () => ({ dispose: vi.fn() }),
  };
}
