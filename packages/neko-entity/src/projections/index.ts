import type {
  CreativeEntity,
  CreativeEntityCandidate,
  ProjectSearchAdapter,
  ProjectSearchItem,
  ProjectSearchQuery,
  ProjectSearchQueryContext,
} from '@neko/shared';
import type { CreativeEntityService } from '../core/CreativeEntityService';

export interface EntitySearchAdapterOptions {
  readonly projectRoot: string;
  readonly service: Pick<CreativeEntityService, 'list' | 'listCandidates'>;
  readonly providerId?: string;
}

export function createEntitySearchAdapter(
  options: EntitySearchAdapterOptions,
): ProjectSearchAdapter {
  return new EntitySearchAdapter(options);
}

class EntitySearchAdapter implements ProjectSearchAdapter {
  readonly partition = 'creative-entities' as const;

  constructor(private readonly options: EntitySearchAdapterOptions) {}

  async ensureInitialized(): Promise<void> {
    return undefined;
  }

  async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    const projectRoot = query.projectRoot ?? context.projectRoot ?? this.options.projectRoot;
    if (projectRoot !== this.options.projectRoot) {
      return [];
    }
    if (query.partitions && !query.partitions.includes('creative-entities')) {
      return [];
    }

    const [entities, candidates] = await Promise.all([
      this.options.service.list(),
      this.options.service.listCandidates('open'),
    ]);
    const items = [
      ...entities.map((entity) => entityToSearchItem(entity, this.options.projectRoot)),
      ...candidates.map((candidate) => candidateToSearchItem(candidate, this.options.projectRoot)),
    ];
    const allowedKinds = query.kinds ? new Set(query.kinds) : undefined;
    const text = query.text.trim().toLocaleLowerCase();
    return items
      .filter((item) => !allowedKinds || allowedKinds.has(item.kind))
      .filter((item) => !text || item.searchText.toLocaleLowerCase().includes(text))
      .slice(0, query.limit ?? items.length);
  }

  getStatus() {
    return {
      partition: this.partition,
      status: 'ready',
      freshness: 'fresh',
      provider: {
        providerId: this.options.providerId ?? 'neko-entity',
        modes: ['mention', 'global', 'entity-picker', 'agent-tool'],
        itemKinds: ['creative-entity', 'entity-candidate'],
        partitions: ['creative-entities'],
      },
    } satisfies ReturnType<ProjectSearchAdapter['getStatus']>;
  }
}

function entityToSearchItem(entity: CreativeEntity, projectRoot: string): ProjectSearchItem {
  const label = entity.displayName ?? entity.canonicalName;
  return {
    id: `entity:${entity.kind}:${entity.id}`,
    kind: 'creative-entity',
    label,
    description: `${entity.kind} · ${entity.status}`,
    source: {
      partition: 'creative-entities',
      sourceId: 'neko-entity',
      sourceKind: 'registry',
      refId: entity.id,
      metadata: { entityKind: entity.kind, status: entity.status },
    },
    projectRoot,
    canonicalName: entity.canonicalName,
    aliases: entity.aliases,
    searchText: [label, entity.canonicalName, ...entity.aliases, entity.kind, entity.status].join(
      ' ',
    ),
    navigationData: { entityId: entity.id, kind: entity.kind, source: 'neko-entity' },
    freshness: 'fresh',
    metadata: entity.metadata,
  };
}

function candidateToSearchItem(
  candidate: CreativeEntityCandidate,
  projectRoot: string,
): ProjectSearchItem {
  return {
    id: `candidate:${candidate.kind}:${candidate.id}`,
    kind: 'entity-candidate',
    label: candidate.name,
    description: `${candidate.kind} candidate`,
    source: {
      partition: 'creative-entities',
      sourceId: 'neko-entity',
      sourceKind: 'candidate',
      refId: candidate.id,
      metadata: { entityKind: candidate.kind, status: candidate.status },
    },
    projectRoot,
    canonicalName: candidate.name,
    aliases: candidate.aliases,
    searchText: [
      candidate.name,
      ...(candidate.aliases ?? []),
      candidate.kind,
      candidate.status,
      ...candidate.sourceRefs,
    ].join(' '),
    navigationData: { candidateId: candidate.id, kind: candidate.kind, source: 'neko-entity' },
    freshness: 'fresh',
    metadata: candidate.metadata,
  };
}
