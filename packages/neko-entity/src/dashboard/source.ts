import type {
  CreativeEntity,
  CreativeEntityCandidate,
  DashboardCreativeEntityActionRequest,
  DashboardCreativeEntityActionResult,
  DashboardCreativeEntityDetail,
  DashboardCreativeEntityEvent,
  DashboardCreativeEntityRef,
  DashboardCreativeEntityRow,
  DashboardCreativeEntitySnapshot,
  DashboardCreativeEntitySource,
  EntityAssetBinding,
  EntityAssetRequirement,
  VisualIdentityDraft,
} from '@neko/shared';
import {
  isNpcTestMode,
  NEKO_AGENT_TEST_NPC_COMMAND,
  type NpcTestBenchLaunchRequest,
} from '@neko/shared/types/npc-test-bench';
import { DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION } from '@neko/shared/types/dashboard-creative-entity';
import type { CreativeEntityService } from '../core/CreativeEntityService';
import type { EntityDisposable } from '../core/ports';

export interface EntityDashboardSourceOptions {
  readonly projectRoot: string;
  readonly service: Pick<
    CreativeEntityService,
    | 'list'
    | 'get'
    | 'listCandidates'
    | 'confirmCandidate'
    | 'rejectCandidate'
    | 'dismissCandidate'
    | 'mergeCandidateIntoExisting'
    | 'renameEntity'
    | 'addAlias'
    | 'removeAlias'
    | 'deprecateEntity'
    | 'reactivateEntity'
    | 'bindings'
    | 'requirements'
    | 'drafts'
  >;
  readonly subscribe?: (
    listener: (event: DashboardCreativeEntityEvent) => void,
  ) => EntityDisposable;
  readonly executeCommand?: (command: string, ...args: unknown[]) => Promise<unknown>;
  readonly now?: () => string;
}

export class EntityDashboardCreativeEntitySource implements DashboardCreativeEntitySource {
  readonly contractVersion = DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION;
  readonly source = 'neko-entity';
  readonly sourceDisplayName = 'Neko Entity';
  readonly capabilities = {
    detail: true,
    syncSuggestions: true,
    actions: [
      'show-detail',
      'confirm-candidate',
      'edit-aliases',
      'bind-existing',
      'review-drafts',
      'handle-requirement',
      'generate-material',
      'import-material',
      'dismiss-requirement',
      'test-npc',
      'refresh',
    ],
  } satisfies DashboardCreativeEntitySource['capabilities'];

  constructor(private readonly options: EntityDashboardSourceOptions) {}

  async getSnapshot(): Promise<DashboardCreativeEntitySnapshot> {
    const [entities, candidates, bindings, requirements, drafts] = await Promise.all([
      this.options.service.list(),
      this.options.service.listCandidates('open'),
      this.options.service.bindings.list(),
      this.options.service.requirements.list(),
      this.options.service.drafts.list(),
    ]);
    const rows = [
      ...entities.map((entity) => projectEntityRow(entity, bindings, requirements, drafts)),
      ...candidates.map(projectCandidateRow),
    ].sort(compareRows);
    const updatedAt = this.now();
    return {
      source: this.source,
      sourceDisplayName: this.sourceDisplayName,
      status: {
        source: this.source,
        sourceDisplayName: this.sourceDisplayName,
        available: true,
        freshness: 'fresh',
        entityCount: rows.length,
        updatedAt,
      },
      rows,
      freshness: 'fresh',
      updatedAt,
    };
  }

  async getDetail(
    ref: DashboardCreativeEntityRef,
  ): Promise<DashboardCreativeEntityDetail | undefined> {
    if (ref.source !== this.source) return undefined;
    if (ref.sourceEntityId.startsWith('candidate:')) {
      const candidate = (await this.options.service.listCandidates()).find(
        (item) => item.id === ref.sourceEntityId,
      );
      return candidate ? projectCandidateDetail(candidate) : undefined;
    }

    const entityId = ref.entityId ?? ref.sourceEntityId.replace(/^entity:/, '');
    const entity = await this.options.service.get(entityId);
    if (!entity) return undefined;
    const [bindings, requirements, drafts] = await Promise.all([
      this.options.service.bindings.list(),
      this.options.service.requirements.list(),
      this.options.service.drafts.list(),
    ]);
    return projectEntityDetail(entity, bindings, requirements, drafts);
  }

  async executeAction(
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    if (request.source !== this.source) {
      return { ok: false, message: `Unsupported source: ${request.source}`, ref: request.ref };
    }
    const candidateId = request.ref?.sourceEntityId.startsWith('candidate:')
      ? request.ref.sourceEntityId
      : undefined;
    const entityId = request.ref?.entityId ?? request.ref?.sourceEntityId.replace(/^entity:/, '');

    try {
      switch (request.action) {
        case 'refresh':
        case 'show-detail':
          return { ok: true, refresh: true, ref: request.ref };
        case 'test-npc':
          return this.executeNpcTestAction(entityId, request);
        case 'confirm-candidate':
          if (!candidateId) return { ok: false, message: 'No candidate ref is available.' };
          await this.options.service.confirmCandidate({ candidateId });
          return { ok: true, refresh: true, ref: request.ref };
        case 'edit-aliases':
          return this.executeAliasAction(entityId, request);
        case 'dismiss-requirement':
          if (!candidateId) return { ok: false, message: 'No candidate ref is available.' };
          await this.options.service.dismissCandidate(candidateId);
          return { ok: true, refresh: true, ref: request.ref };
        default:
          return {
            ok: false,
            message: `Unsupported action: ${request.action}`,
            ref: request.ref,
          };
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        ref: request.ref,
      };
    }
  }

  private async executeNpcTestAction(
    entityId: string | undefined,
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    if (!request.ref) {
      return { ok: false, message: 'No creative entity ref is available.' };
    }
    if (request.ref.entityKind !== 'character') {
      return {
        ok: false,
        message: 'Only character entities can be tested as NPCs.',
        ref: request.ref,
      };
    }
    if (!entityId) {
      return { ok: false, message: 'No character entity ref is available.', ref: request.ref };
    }
    if (!this.options.executeCommand) {
      return { ok: false, message: 'No command executor is available.', ref: request.ref };
    }

    const mode = readNpcMode(request.payload);
    const launchRequest: NpcTestBenchLaunchRequest = {
      entityRef: {
        entityId,
        entityKind: 'character',
        projectRoot: this.options.projectRoot,
        source: this.source,
      },
      dashboardRef: request.ref,
      source: 'dashboard',
      projectRoot: this.options.projectRoot,
      ...(mode ? { mode } : {}),
    };

    await this.options.executeCommand(NEKO_AGENT_TEST_NPC_COMMAND, launchRequest);
    return { ok: true, refresh: false, ref: request.ref };
  }

  onDidChangeEntity(listener: (event: DashboardCreativeEntityEvent) => void): EntityDisposable {
    return this.options.subscribe?.(listener) ?? { dispose: () => undefined };
  }

  private async executeAliasAction(
    entityId: string | undefined,
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    if (!entityId) return { ok: false, message: 'No entity ref is available.', ref: request.ref };
    const alias = typeof request.payload?.['alias'] === 'string' ? request.payload['alias'] : '';
    if (!alias.trim()) {
      return { ok: false, message: 'Alias is required.', ref: request.ref };
    }
    const remove = request.payload?.['remove'] === true;
    if (remove) {
      await this.options.service.removeAlias(entityId, alias);
    } else {
      await this.options.service.addAlias(entityId, alias);
    }
    return { ok: true, refresh: true, ref: request.ref };
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }
}

function projectEntityRow(
  entity: CreativeEntity,
  bindings: readonly EntityAssetBinding[],
  requirements: readonly EntityAssetRequirement[],
  drafts: readonly VisualIdentityDraft[],
): DashboardCreativeEntityRow {
  const entityBindings = bindings.filter(
    (binding) => binding.entityId === entity.id && binding.entityKind === entity.kind,
  );
  const entityRequirements = requirements.filter(
    (requirement) =>
      requirement.entityId === entity.id &&
      requirement.entityKind === entity.kind &&
      requirement.status !== 'bound' &&
      requirement.status !== 'dismissed',
  );
  const entityDrafts =
    entity.kind === 'character'
      ? drafts.filter((draft) => draft.characterId === entity.id && draft.status !== 'discarded')
      : [];
  const label = entity.displayName ?? entity.canonicalName;
  return {
    ref: entityRef(entity),
    label,
    kind: entity.kind,
    status: entity.status,
    sourceKind: 'registry',
    aliases: entity.aliases,
    defaultBindingRoles: entityBindings
      .filter((binding) => binding.isDefault)
      .map((binding) => binding.role),
    missingRepresentationKinds: Array.from(
      new Set(entityRequirements.flatMap((requirement) => requirement.requiredKinds)),
    ).sort(),
    visualDraftCount: entityDrafts.length,
    freshness: 'fresh',
    actions: entityActions(entity.kind),
    searchText: [label, entity.canonicalName, ...entity.aliases, entity.kind, entity.status].join(
      ' ',
    ),
  };
}

function projectCandidateRow(candidate: CreativeEntityCandidate): DashboardCreativeEntityRow {
  return {
    ref: candidateRef(candidate),
    label: candidate.name,
    kind: candidate.kind,
    status: 'candidate',
    sourceKind: 'script',
    aliases: candidate.aliases ?? [],
    summary: 'Creative entity candidate',
    occurrenceCount: candidate.sourceRefs.length,
    freshness: 'fresh',
    actions: candidateActions(candidate.kind),
    searchText: [candidate.name, ...(candidate.aliases ?? []), candidate.kind, 'candidate'].join(
      ' ',
    ),
  };
}

function projectEntityDetail(
  entity: CreativeEntity,
  bindings: readonly EntityAssetBinding[],
  requirements: readonly EntityAssetRequirement[],
  drafts: readonly VisualIdentityDraft[],
): DashboardCreativeEntityDetail {
  const ref = entityRef(entity);
  const bindingSummaries = bindings
    .filter((binding) => binding.entityId === entity.id && binding.entityKind === entity.kind)
    .map((binding) => ({
      id: binding.id,
      role: binding.role,
      assetRef: binding.assetRef,
      status: binding.status,
      source: binding.source,
      isDefault: binding.isDefault === true,
      confidence: binding.confidence,
      updatedAt: binding.updatedAt,
    }));
  return {
    ref,
    label: entity.displayName ?? entity.canonicalName,
    kind: entity.kind,
    status: entity.status,
    sourceKind: 'registry',
    aliases: entity.aliases,
    metadata: entity.metadata,
    relationships: [],
    occurrences: [],
    bindings: bindingSummaries,
    defaults: bindingSummaries.filter((binding) => binding.isDefault),
    requirements: requirements
      .filter(
        (requirement) =>
          requirement.entityId === entity.id && requirement.entityKind === entity.kind,
      )
      .map((requirement) => ({
        id: requirement.id,
        entityId: requirement.entityId,
        entityKind: requirement.entityKind,
        source: requirement.source,
        sourceRef: requirement.sourceRef,
        requiredKinds: requirement.requiredKinds,
        status: requirement.status,
        actions: ['generate', 'import', 'bind-existing', 'dismiss'],
      })),
    visualDrafts:
      entity.kind === 'character'
        ? drafts
            .filter((draft) => draft.characterId === entity.id)
            .map((draft) => ({
              id: draft.id,
              characterId: draft.characterId,
              source: draft.source,
              prompt: draft.prompt,
              generatedAssetIds: draft.generatedAssetIds,
              selectedAssetId: draft.selectedAssetId,
              status: draft.status,
              factCount: draft.extractedVisualFacts?.length ?? 0,
            }))
        : [],
    syncSuggestions: [],
    freshness: 'fresh',
    actions: entityActions(entity.kind),
  };
}

function projectCandidateDetail(candidate: CreativeEntityCandidate): DashboardCreativeEntityDetail {
  return {
    ref: candidateRef(candidate),
    label: candidate.name,
    kind: candidate.kind,
    status: 'candidate',
    sourceKind: 'script',
    aliases: candidate.aliases ?? [],
    metadata: candidate.metadata,
    relationships: [],
    occurrences: candidate.sourceRefs.map((sourceRef) => ({
      source: 'script',
      role: 'reference',
      label: candidate.name,
      location: sourceRef,
    })),
    bindings: [],
    defaults: [],
    requirements:
      candidate.suggestedRequirements?.map((requirement) => ({
        id: requirement.id,
        entityId: requirement.entityId,
        entityKind: requirement.entityKind,
        source: requirement.source,
        sourceRef: requirement.sourceRef,
        requiredKinds: requirement.requiredKinds,
        status: requirement.status,
        actions: ['generate', 'import', 'bind-existing', 'dismiss'],
      })) ?? [],
    visualDrafts: [],
    syncSuggestions: [],
    freshness: 'fresh',
    actions: candidateActions(candidate.kind),
  };
}

function entityRef(entity: CreativeEntity): DashboardCreativeEntityRef {
  return {
    source: 'neko-entity',
    sourceEntityId: `entity:${entity.id}`,
    entityId: entity.id,
    entityKind: entity.kind,
  };
}

function candidateRef(candidate: CreativeEntityCandidate): DashboardCreativeEntityRef {
  return {
    source: 'neko-entity',
    sourceEntityId: candidate.id,
    entityId: candidate.id,
    entityKind: candidate.kind,
  };
}

function entityActions(kind: CreativeEntity['kind']): DashboardCreativeEntityRow['actions'] {
  const actions: DashboardCreativeEntityRow['actions'] = [
    { id: 'show-detail', label: 'Show detail' },
    { id: 'edit-aliases', label: 'Edit aliases' },
    { id: 'bind-existing', label: 'Bind asset' },
    { id: 'refresh', label: 'Refresh' },
  ];
  return kind === 'character'
    ? [actions[0], { id: 'test-npc', label: 'Test NPC' }, ...actions.slice(1)].filter(
        (action): action is DashboardCreativeEntityRow['actions'][number] => action !== undefined,
      )
    : actions;
}

function candidateActions(
  kind: CreativeEntityCandidate['kind'],
): DashboardCreativeEntityRow['actions'] {
  return [
    { id: 'show-detail', label: 'Show detail' },
    {
      id: 'test-npc',
      label: 'Test NPC',
      disabled: kind !== 'character',
      ...(kind !== 'character'
        ? { reason: 'Only character candidates can be tested as NPCs.' }
        : {}),
    },
    { id: 'confirm-candidate', label: 'Confirm candidate' },
    { id: 'dismiss-requirement', label: 'Dismiss' },
  ];
}

function readNpcMode(payload: DashboardCreativeEntityActionRequest['payload']) {
  const mode = payload?.['mode'];
  return isNpcTestMode(mode) ? mode : undefined;
}

function compareRows(a: DashboardCreativeEntityRow, b: DashboardCreativeEntityRow): number {
  return (
    statusRank(a.status) - statusRank(b.status) ||
    a.kind.localeCompare(b.kind) ||
    a.label.localeCompare(b.label)
  );
}

function statusRank(status: DashboardCreativeEntityRow['status']): number {
  switch (status) {
    case 'candidate':
      return 0;
    case 'confirmed':
      return 1;
    case 'deprecated':
      return 2;
    case 'merged':
      return 3;
    case 'unknown':
      return 4;
  }
}
