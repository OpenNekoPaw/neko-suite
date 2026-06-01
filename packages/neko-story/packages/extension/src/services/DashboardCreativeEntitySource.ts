import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CreativeEntity,
  CreativeEntityKind,
  CreativeEntityRegistry,
  EntityAssetBinding,
  EntityAssetBindingRole,
  EntityAssetRequirement,
  MissingRepresentationAction,
  RepresentationKind,
  VisualIdentityDraft,
} from '@neko/shared';
import {
  isNpcTestMode,
  NEKO_AGENT_TEST_NPC_COMMAND,
  type NpcTestBenchLaunchRequest,
} from '@neko/shared';
import type {
  DashboardCreativeEntityAction,
  DashboardCreativeEntityActionDescriptor,
  DashboardCreativeEntityActionRequest,
  DashboardCreativeEntityActionResult,
  DashboardCreativeEntityBindingSummary,
  DashboardCreativeEntityDetail,
  DashboardCreativeEntityEvent,
  DashboardCreativeEntityOccurrenceRef,
  DashboardCreativeEntityRef,
  DashboardCreativeEntityRequirementSummary,
  DashboardCreativeEntityRow,
  DashboardCreativeEntitySnapshot,
  DashboardCreativeEntitySource,
  DashboardCreativeEntitySyncSuggestion,
  DashboardCreativeEntityVisualDraftSummary,
} from '@neko/shared/types/dashboard-creative-entity';
import {
  DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION,
  isSafeDashboardAssetRef,
  isSafeDashboardEntityRef,
  normalizeDashboardEntityLocalRef,
} from '@neko/shared/types/dashboard-creative-entity';
import type {
  EntityBindingSummary,
  EntityOccurrenceSummary,
  EntityRelationshipSummary,
} from './CreativeEntityManagementService';
import {
  CreativeEntityManagementService,
  getRequirementActions,
} from './CreativeEntityManagementService';
import type {
  CharacterEntityQuery,
  CreativeEntityOccurrence,
  ICreativeEntityGraph,
  ICreativeEntityWorkspaceIndex,
  IWorkspaceIndex,
} from './types';

export interface DashboardEntityBindingStore {
  list(): Promise<readonly EntityAssetBinding[]>;
}

export interface DashboardEntityRequirementStore {
  list(): Promise<readonly EntityAssetRequirement[]>;
  upsert(requirement: EntityAssetRequirement): Promise<unknown>;
}

export interface DashboardEntityDraftStore {
  list(): Promise<readonly VisualIdentityDraft[]>;
}

export interface StoryDashboardCreativeEntitySourceOptions {
  readonly workspaceRoot: string;
  readonly workspaceIndex: Pick<
    IWorkspaceIndex,
    'ensureInitialized' | 'getAllCharacterNames' | 'onDidUpdateIndex'
  > &
    Partial<Pick<IWorkspaceIndex, 'getAllScriptIndices'>>;
  readonly creativeEntityIndex: Pick<
    ICreativeEntityWorkspaceIndex,
    'ensureInitialized' | 'queryCharacter'
  >;
  readonly entityGraph: Pick<ICreativeEntityGraph, 'ensureInitialized' | 'onDidUpdate'>;
  readonly registry: CreativeEntityRegistry;
  readonly bindings: DashboardEntityBindingStore;
  readonly requirements: DashboardEntityRequirementStore;
  readonly drafts: DashboardEntityDraftStore;
  readonly management: CreativeEntityManagementService;
  readonly executeCommand?: (command: string, ...args: unknown[]) => Promise<unknown>;
  readonly openLocation?: (location: DashboardCreativeEntitySourceLocation) => Promise<unknown>;
  readonly now?: () => string;
}

type DashboardCreativeEntitySourceLocation = NonNullable<
  CharacterEntityQuery['registryDefinition'] | CharacterEntityQuery['scriptDefinition']
>;

export class StoryDashboardCreativeEntitySource implements DashboardCreativeEntitySource {
  readonly contractVersion = DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION;
  readonly source = 'neko-story';
  readonly sourceDisplayName = 'Neko Story';
  readonly capabilities = {
    detail: true,
    syncSuggestions: true,
    actions: [
      'open-source',
      'show-detail',
      'bind-existing',
      'review-drafts',
      'handle-requirement',
      'generate-material',
      'import-material',
      'dismiss-requirement',
      'show-representation-package',
      'apply-sync-suggestion',
      'ignore-sync-suggestion',
      'test-npc',
      'refresh',
    ],
  } satisfies DashboardCreativeEntitySource['capabilities'];

  constructor(private readonly options: StoryDashboardCreativeEntitySourceOptions) {}

  async getSnapshot(): Promise<DashboardCreativeEntitySnapshot> {
    await Promise.all([
      this.options.workspaceIndex.ensureInitialized(),
      this.options.creativeEntityIndex.ensureInitialized(),
      this.options.entityGraph.ensureInitialized(),
    ]);

    const [entities, requirements, drafts] = await Promise.all([
      this.options.management.listEntities(),
      this.options.requirements.list(),
      this.options.drafts.list(),
    ]);
    const confirmedRows = await Promise.all(
      entities.map(async (entity) =>
        this.projectEntityRow(entity, await this.options.management.getEntityDetail(entity.id)),
      ),
    );
    const candidateRows = await this.projectCandidateRows(entities, requirements, drafts);
    const rows = [...confirmedRows, ...candidateRows].sort(compareRows);
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
    if (ref.sourceEntityId.startsWith('candidate:character:')) {
      return this.getCandidateDetail(ref);
    }

    const entityId = ref.entityId ?? readPrefixedId(ref.sourceEntityId, 'entity:');
    if (!entityId) return undefined;
    const detail = await this.options.management.getEntityDetail(entityId);
    return detail ? this.projectEntityDetail(detail.entity, detail) : undefined;
  }

  async executeAction(
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    if (request.source !== this.source) {
      return { ok: false, message: `Unsupported source: ${request.source}` };
    }

    const entityId =
      request.ref?.entityId ?? readPrefixedId(request.ref?.sourceEntityId, 'entity:');
    const action = request.action;

    if (action === 'open-source') return this.executeOpenSourceAction(request);
    if (action === 'test-npc') return this.executeNpcTestAction(request);
    if (action === 'refresh') return { ok: true, refresh: true, ref: request.ref };
    if (action === 'ignore-sync-suggestion') {
      return { ok: true, message: 'Sync suggestion ignored.', refresh: true, ref: request.ref };
    }
    if (action === 'apply-sync-suggestion') {
      return {
        ok: false,
        message: 'Typed asset metadata sync is not available yet. No asset metadata was changed.',
        refresh: false,
        ref: request.ref,
      };
    }
    if (action === 'confirm-candidate') {
      return {
        ok: false,
        message: 'Candidate confirmation is not implemented in the Story source yet.',
        refresh: false,
        ref: request.ref,
      };
    }

    return this.executeDelegatedCommand(action, entityId, request);
  }

  onDidChangeEntity(listener: (event: DashboardCreativeEntityEvent) => void) {
    const disposables = [
      this.options.workspaceIndex.onDidUpdateIndex(() =>
        listener({
          type: 'refreshed',
          source: this.source,
          freshness: 'stale',
        }),
      ),
      this.options.entityGraph.onDidUpdate(() =>
        listener({
          type: 'refreshed',
          source: this.source,
          freshness: 'stale',
        }),
      ),
    ];
    return {
      dispose() {
        for (const disposable of disposables) {
          disposable.dispose();
        }
      },
    };
  }

  private async projectCandidateRows(
    entities: readonly CreativeEntity[],
    requirements: readonly EntityAssetRequirement[],
    drafts: readonly VisualIdentityDraft[],
  ): Promise<DashboardCreativeEntityRow[]> {
    const names = this.getProjectCharacterNames();
    const rows: DashboardCreativeEntityRow[] = [];

    for (const name of names) {
      const resolved = await this.options.registry.resolveByName(name, 'character');
      if (resolved || entityNameMatches(entities, name)) continue;
      const query = this.options.creativeEntityIndex.queryCharacter(name);
      rows.push(this.projectCandidateRow(name, query, requirements, drafts));
    }

    return rows;
  }

  private async projectEntityRow(
    entity: CreativeEntity,
    detail: Awaited<ReturnType<CreativeEntityManagementService['getEntityDetail']>>,
  ): Promise<DashboardCreativeEntityRow> {
    const syncSuggestions = detail ? this.buildSyncSuggestions(entity, detail) : [];
    const label = formatEntityName(entity);
    return {
      ref: this.toEntityRef(entity),
      label,
      kind: entity.kind,
      status: entity.status,
      sourceKind: 'registry',
      aliases: entity.aliases,
      summary: `${entity.kind} · ${entity.status}`,
      occurrenceCount: detail?.occurrences.length ?? 0,
      defaultBindingRoles: detail?.defaults.map((binding) => binding.role),
      missingRepresentationKinds: collectMissingKinds(detail?.missingRequirements ?? []),
      visualDraftCount: detail?.visualDrafts.length ?? 0,
      syncSuggestionCount: syncSuggestions.length,
      freshness: 'fresh',
      actions: entityActions(
        entity.kind,
        detail?.missingRequirements.length ?? 0,
        detail?.visualDrafts.length ?? 0,
      ),
      searchText: [
        label,
        entity.canonicalName,
        ...entity.aliases,
        entity.kind,
        entity.status,
        ...(detail?.bindings.map((binding) => binding.assetRef) ?? []),
      ].join(' '),
      updatedAt: latestBindingUpdate(detail?.bindings ?? []),
    };
  }

  private projectCandidateRow(
    name: string,
    query: CharacterEntityQuery | undefined,
    requirements: readonly EntityAssetRequirement[],
    drafts: readonly VisualIdentityDraft[],
  ): DashboardCreativeEntityRow {
    const matchingRequirements = requirements.filter(
      (requirement) => requirement.entityId === name,
    );
    return {
      ref: this.toCandidateRef(name),
      label: name,
      kind: 'character',
      status: 'candidate',
      sourceKind: 'script',
      summary: 'Script character candidate',
      occurrenceCount: query?.occurrences.length ?? query?.stats.totalScriptReferences ?? 0,
      missingRepresentationKinds:
        matchingRequirements.length > 0
          ? collectMissingKinds(matchingRequirements)
          : ['portrait', 'reference'],
      visualDraftCount: drafts.filter((draft) => draft.characterId === name).length,
      freshness: 'fresh',
      actions: candidateActions(),
      searchText: [name, 'candidate', 'script', 'portrait', 'reference'].join(' '),
    };
  }

  private async getCandidateDetail(
    ref: DashboardCreativeEntityRef,
  ): Promise<DashboardCreativeEntityDetail> {
    const name = ref.sourceEntityId.slice('candidate:character:'.length);
    const [requirements, drafts] = await Promise.all([
      this.options.requirements.list(),
      this.options.drafts.list(),
    ]);
    const query = this.options.creativeEntityIndex.queryCharacter(name);
    const matchingRequirements = requirements.filter(
      (requirement) => requirement.entityId === name,
    );
    const generatedRequirements =
      matchingRequirements.length > 0
        ? matchingRequirements
        : [
            {
              id: `candidate-requirement:${stableIdPart(name)}:portrait`,
              entityId: name,
              entityKind: 'character' as const,
              source: 'story' as const,
              sourceRef: query?.scriptDefinition
                ? (this.sanitizeLocation(formatLocation(query.scriptDefinition)) ?? name)
                : name,
              requiredKinds: ['portrait', 'reference'] as const,
              status: 'missing' as const,
            },
          ];

    return {
      ref,
      label: name,
      kind: 'character',
      status: 'candidate',
      sourceKind: 'script',
      aliases: [],
      description: 'Script-derived character candidate without confirmed registry identity.',
      relationships: [],
      occurrences: projectOccurrences(query?.occurrences ?? [], (location) =>
        this.sanitizeLocation(location),
      ),
      bindings: [],
      defaults: [],
      requirements: generatedRequirements
        .map((requirement) =>
          projectRequirement(requirement, (location) => this.sanitizeLocation(location)),
        )
        .filter((requirement): requirement is DashboardCreativeEntityRequirementSummary =>
          Boolean(requirement),
        ),
      visualDrafts: drafts.filter((draft) => draft.characterId === name).map(projectVisualDraft),
      syncSuggestions: [],
      freshness: 'fresh',
      actions: candidateActions(),
    };
  }

  private projectEntityDetail(
    entity: CreativeEntity,
    detail: NonNullable<Awaited<ReturnType<CreativeEntityManagementService['getEntityDetail']>>>,
  ): DashboardCreativeEntityDetail {
    const bindings = detail.bindings.map(projectBinding);
    const defaults = detail.defaults.map(projectBinding);
    return {
      ref: this.toEntityRef(entity),
      label: formatEntityName(entity),
      kind: entity.kind,
      status: entity.status,
      sourceKind: 'registry',
      aliases: detail.aliases,
      metadata: entity.metadata,
      relationships: detail.relationships.map(projectRelationship),
      occurrences: detail.occurrences
        .map((occurrence) => this.projectManagementOccurrence(occurrence))
        .filter((occurrence): occurrence is DashboardCreativeEntityOccurrenceRef =>
          Boolean(occurrence),
        ),
      bindings,
      defaults,
      requirements: detail.missingRequirements
        .map((requirement) =>
          projectRequirement(requirement, (location) => this.sanitizeLocation(location)),
        )
        .filter((requirement): requirement is DashboardCreativeEntityRequirementSummary =>
          Boolean(requirement),
        ),
      visualDrafts: detail.visualDrafts.map(projectVisualDraft),
      syncSuggestions: this.buildSyncSuggestions(entity, detail),
      freshness: 'fresh',
      actions: entityActions(
        entity.kind,
        detail.missingRequirements.length,
        detail.visualDrafts.length,
      ),
    };
  }

  private projectManagementOccurrence(
    occurrence: EntityOccurrenceSummary,
  ): DashboardCreativeEntityOccurrenceRef | undefined {
    const location = this.sanitizeLocation(occurrence.location);
    if (!location) return undefined;
    return {
      source: occurrence.source,
      role: occurrence.role,
      label: occurrence.label,
      location,
      ...(occurrence.detail !== undefined ? { detail: occurrence.detail } : {}),
    };
  }

  private buildSyncSuggestions(
    entity: CreativeEntity,
    detail: NonNullable<Awaited<ReturnType<CreativeEntityManagementService['getEntityDetail']>>>,
  ): DashboardCreativeEntitySyncSuggestion[] {
    const label = formatEntityName(entity);
    const suggestions: DashboardCreativeEntitySyncSuggestion[] = [];
    const defaultRoles = new Set(detail.defaults.map((binding) => binding.role));

    for (const binding of detail.bindings) {
      if (!binding.isDefault || !isSafeDashboardAssetRef(binding.assetRef)) continue;
      suggestions.push({
        id: `sync:${stableIdPart(entity.id)}:${stableIdPart(binding.role)}:${stableIdPart(binding.assetRef)}`,
        kind: 'asset-metadata',
        status: isReadonlyAssetRef(binding.assetRef) ? 'unavailable' : 'suggested',
        entityRef: this.toEntityRef(entity),
        targetRef: binding.assetRef,
        fields: ['label', 'tags', 'description'],
        reason: `Review whether asset metadata should mention ${label}.`,
        ownerSource: this.source,
        readonlyTarget: isReadonlyAssetRef(binding.assetRef),
      });
    }

    for (const draft of detail.visualDrafts) {
      const generatedAssetId = draft.selectedAssetId ?? draft.generatedAssetIds[0];
      if (!generatedAssetId || draft.status === 'discarded') continue;
      suggestions.push({
        id: `sync:${stableIdPart(entity.id)}:generated:${stableIdPart(generatedAssetId)}`,
        kind: 'generated-asset-registration',
        status: draft.status === 'applied' ? 'applied' : 'suggested',
        entityRef: this.toEntityRef(entity),
        targetRef: `generated://${stableIdPart(generatedAssetId)}`,
        fields: ['assetRef', 'role', 'entityId'],
        reason: `Generated asset ${generatedAssetId} can be reviewed for ${label}.`,
        ownerSource: this.source,
      });
    }

    for (const requirement of detail.missingRequirements) {
      const missingKindsWithoutDefault = requirement.requiredKinds.filter(
        (kind) => !defaultRoles.has(representationKindToBindingRoleName(kind)),
      );
      if (missingKindsWithoutDefault.length === 0) continue;
      suggestions.push({
        id: `sync:${stableIdPart(entity.id)}:requirement:${stableIdPart(requirement.id)}`,
        kind: 'binding-mismatch',
        status: 'suggested',
        entityRef: this.toEntityRef(entity),
        targetRef: `requirement:${stableIdPart(requirement.id)}`,
        fields: ['defaultBindingRoles', 'missingRepresentationKinds'],
        reason: `${label} still needs ${missingKindsWithoutDefault.join(', ')} material bindings.`,
        ownerSource: this.source,
      });
    }

    return suggestions.sort((a, b) => a.id.localeCompare(b.id));
  }

  private async executeDelegatedCommand(
    action: DashboardCreativeEntityAction,
    entityId: string | undefined,
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    const executeCommand = this.options.executeCommand;
    if (!executeCommand) {
      return { ok: false, message: 'No command executor is available.', ref: request.ref };
    }

    const args = entityId ? { entityId, role: request.role } : request.payload;
    const command = commandForAction(action);
    if (!command) {
      return { ok: false, message: `Unsupported action: ${action}`, ref: request.ref };
    }

    await executeCommand(command, args);
    return { ok: true, refresh: true, ref: request.ref };
  }

  private async executeNpcTestAction(
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

    const executeCommand = this.options.executeCommand;
    if (!executeCommand) {
      return { ok: false, message: 'No command executor is available.', ref: request.ref };
    }

    const entityId =
      request.ref.entityId ??
      readPrefixedId(request.ref.sourceEntityId, 'entity:') ??
      readPrefixedId(request.ref.sourceEntityId, 'candidate:character:');
    if (!entityId) {
      return { ok: false, message: 'No character entity ref is available.', ref: request.ref };
    }

    const mode = readNpcMode(request.payload);
    const launchRequest: NpcTestBenchLaunchRequest = {
      entityRef: {
        entityId,
        entityKind: 'character',
        projectRoot: this.options.workspaceRoot,
        source: this.source,
      },
      dashboardRef: request.ref,
      source: 'dashboard',
      projectRoot: this.options.workspaceRoot,
      ...(mode ? { mode } : {}),
    };

    await executeCommand(NEKO_AGENT_TEST_NPC_COMMAND, launchRequest);
    return { ok: true, refresh: false, ref: request.ref };
  }

  private async executeOpenSourceAction(
    request: DashboardCreativeEntityActionRequest,
  ): Promise<DashboardCreativeEntityActionResult> {
    if (!request.ref) {
      return { ok: false, message: 'No creative entity ref is available.' };
    }

    const openLocation = this.options.openLocation;
    if (!openLocation) {
      return { ok: false, message: 'No source opener is available.', ref: request.ref };
    }

    const location = await this.resolveSourceLocation(request.ref);
    if (!location) {
      return { ok: false, message: 'No source location was found.', ref: request.ref };
    }

    await openLocation(location);
    return { ok: true, refresh: false, ref: request.ref };
  }

  private async resolveSourceLocation(
    ref: DashboardCreativeEntityRef,
  ): Promise<DashboardCreativeEntitySourceLocation | undefined> {
    if (ref.source !== this.source) return undefined;

    const candidateName = readPrefixedId(ref.sourceEntityId, 'candidate:character:');
    if (candidateName) {
      const query = this.options.creativeEntityIndex.queryCharacter(candidateName);
      return query?.scriptDefinition ?? query?.scriptReferences[0];
    }

    const entityId = ref.entityId ?? readPrefixedId(ref.sourceEntityId, 'entity:');
    if (!entityId) return undefined;

    const entity = await this.options.registry.get(entityId);
    if (!entity || entity.kind !== 'character') return undefined;

    for (const name of collectEntityLookupNames(entity)) {
      const query = this.options.creativeEntityIndex.queryCharacter(name);
      const location =
        query?.registryDefinition ?? query?.scriptDefinition ?? query?.scriptReferences[0];
      if (location) return location;
    }

    return undefined;
  }

  private toEntityRef(entity: CreativeEntity): DashboardCreativeEntityRef {
    return {
      source: this.source,
      sourceEntityId: `entity:${entity.id}`,
      entityId: entity.id,
      entityKind: entity.kind,
      workspaceFolder: path.basename(this.options.workspaceRoot) || 'workspace',
    };
  }

  private toCandidateRef(name: string): DashboardCreativeEntityRef {
    return {
      source: this.source,
      sourceEntityId: `candidate:character:${name}`,
      entityId: name,
      entityKind: 'character',
      workspaceFolder: path.basename(this.options.workspaceRoot) || 'workspace',
    };
  }

  private getProjectCharacterNames(): readonly string[] {
    const scriptIndices = this.options.workspaceIndex.getAllScriptIndices?.();
    if (!scriptIndices) {
      return this.options.workspaceIndex.getAllCharacterNames();
    }

    const names = new Set<string>();
    for (const index of scriptIndices) {
      const filePath = uriToFsPath(index.uri);
      if (!filePath || !isPathInside(filePath, this.options.workspaceRoot)) continue;
      for (const character of index.characters) {
        names.add(character.name);
      }
    }
    if (names.size > 0) {
      return [...names].sort();
    }
    return this.options.workspaceIndex.getAllCharacterNames();
  }

  private sanitizeLocation(location: string): string | undefined {
    const candidate: unknown = location;
    if (isSafeDashboardEntityRef(candidate)) {
      return location;
    }
    const fileUriPrefix = 'file://';
    const raw = location.startsWith(fileUriPrefix)
      ? location.slice(fileUriPrefix.length)
      : location;
    const match = /^(.*):(\d+)$/.exec(raw);
    const filePath = match?.[1] ?? raw;
    const lineSuffix = match?.[2] ? `:${match[2]}` : '';
    const normalizedFile =
      path.isAbsolute(filePath) && filePath.startsWith(this.options.workspaceRoot)
        ? path.relative(this.options.workspaceRoot, filePath)
        : filePath;
    const normalized = normalizeDashboardEntityLocalRef(
      `${normalizedFile.replace(/\\/g, '/')}${lineSuffix}`,
    );
    return normalized;
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }
}

function uriToFsPath(uri: string): string | undefined {
  try {
    const parsed = new URL(uri);
    return parsed.protocol === 'file:' ? fileURLToPath(parsed) : undefined;
  } catch {
    return path.isAbsolute(uri) ? uri : undefined;
  }
}

function isPathInside(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function projectOccurrences(
  occurrences: readonly CreativeEntityOccurrence[],
  sanitizeLocation: (location: string) => string | undefined,
): readonly DashboardCreativeEntityOccurrenceRef[] {
  return occurrences
    .map((occurrence) => {
      const location = sanitizeLocation(formatOccurrenceLocation(occurrence));
      if (!location) return undefined;
      return {
        source: occurrence.source,
        role: occurrence.role,
        label: occurrence.label,
        location,
        ...(occurrence.detail !== undefined ? { detail: occurrence.detail } : {}),
      } satisfies DashboardCreativeEntityOccurrenceRef;
    })
    .filter((occurrence): occurrence is DashboardCreativeEntityOccurrenceRef =>
      Boolean(occurrence),
    );
}

function projectRelationship(
  relationship: EntityRelationshipSummary,
): DashboardCreativeEntityDetail['relationships'][number] {
  return { ...relationship };
}

function projectBinding(binding: EntityBindingSummary): DashboardCreativeEntityBindingSummary {
  return { ...binding };
}

function projectRequirement(
  requirement: EntityAssetRequirement,
  sanitizeLocation: (location: string) => string | undefined,
): DashboardCreativeEntityRequirementSummary | undefined {
  const sourceRef =
    sanitizeLocation(requirement.sourceRef) ?? `requirement:${stableIdPart(requirement.id)}`;
  return {
    id: requirement.id,
    entityId: requirement.entityId,
    entityKind: requirement.entityKind,
    source: requirement.source,
    sourceRef,
    requiredKinds: requirement.requiredKinds,
    status: requirement.status,
    actions: getRequirementActions(requirement),
  };
}

function projectVisualDraft(draft: VisualIdentityDraft): DashboardCreativeEntityVisualDraftSummary {
  return {
    id: draft.id,
    characterId: draft.characterId,
    source: draft.source,
    prompt: draft.prompt,
    generatedAssetIds: draft.generatedAssetIds,
    selectedAssetId: draft.selectedAssetId,
    status: draft.status,
    factCount: draft.extractedVisualFacts?.length ?? 0,
  };
}

function entityActions(
  kind: CreativeEntityKind,
  requirementCount: number,
  draftCount: number,
): DashboardCreativeEntityRow['actions'] {
  const actions: DashboardCreativeEntityRow['actions'] = [
    { id: 'show-detail', label: 'Show detail' },
    { id: 'bind-existing', label: 'Bind asset' },
    { id: 'review-drafts', label: 'Review drafts', disabled: draftCount === 0 },
    {
      id: 'handle-requirement',
      label: 'Missing materials',
      disabled: requirementCount === 0,
    },
    { id: 'refresh', label: 'Refresh' },
  ];
  return kind === 'character'
    ? [actions[0], { id: 'test-npc', label: 'Test NPC' }, ...actions.slice(1)].filter(
        (action): action is DashboardCreativeEntityActionDescriptor => action !== undefined,
      )
    : actions;
}

function candidateActions(): DashboardCreativeEntityRow['actions'] {
  return [
    { id: 'show-detail', label: 'Show detail' },
    { id: 'test-npc', label: 'Test NPC' },
    {
      id: 'confirm-candidate',
      label: 'Confirm candidate',
      disabled: true,
      reason: 'Candidate confirmation is not implemented yet.',
    },
    { id: 'generate-material', label: 'Generate material' },
    { id: 'bind-existing', label: 'Bind asset' },
  ];
}

function commandForAction(action: DashboardCreativeEntityAction): string | undefined {
  switch (action) {
    case 'show-detail':
      return 'neko.story.showCreativeEntityDetail';
    case 'bind-existing':
      return 'neko.story.setCreativeEntityDefaultBinding';
    case 'review-drafts':
      return 'neko.story.reviewVisualDrafts';
    case 'handle-requirement':
    case 'generate-material':
    case 'import-material':
    case 'dismiss-requirement':
      return 'neko.story.showMissingMaterialQueue';
    case 'show-representation-package':
      return 'neko.story.showRepresentationPackageDetail';
    default:
      return undefined;
  }
}

function readNpcMode(payload: DashboardCreativeEntityActionRequest['payload']) {
  const mode = payload?.['mode'];
  return isNpcTestMode(mode) ? mode : undefined;
}

function collectMissingKinds(
  requirements: readonly Pick<EntityAssetRequirement, 'requiredKinds'>[],
): RepresentationKind[] {
  return Array.from(
    new Set(requirements.flatMap((requirement) => requirement.requiredKinds)),
  ).sort();
}

function representationKindToBindingRoleName(kind: RepresentationKind): EntityAssetBindingRole {
  switch (kind) {
    case 'portrait':
    case 'puppet-bone':
      return 'motion';
    case 'reference':
    case 'live2d':
    case 'live3d':
    case 'voice':
    case 'motion':
      return kind;
    case 'video':
      return 'motion';
  }
}

function latestBindingUpdate(bindings: readonly EntityBindingSummary[]): string | undefined {
  return [...bindings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.updatedAt;
}

function formatEntityName(entity: CreativeEntity): string {
  return entity.displayName ?? entity.canonicalName;
}

function collectEntityLookupNames(entity: CreativeEntity): readonly string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [entity.canonicalName, entity.displayName, ...entity.aliases]) {
    if (!candidate) continue;
    const normalized = normalizeName(candidate);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(candidate);
  }
  return names;
}

function entityNameMatches(entities: readonly CreativeEntity[], name: string): boolean {
  const normalized = normalizeName(name);
  return entities.some(
    (entity) =>
      normalizeName(entity.canonicalName) === normalized ||
      normalizeName(entity.displayName ?? '') === normalized ||
      entity.aliases.some((alias) => normalizeName(alias) === normalized),
  );
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function readPrefixedId(value: string | undefined, prefix: string): string | undefined {
  return value?.startsWith(prefix) ? value.slice(prefix.length) : undefined;
}

function formatOccurrenceLocation(occurrence: CreativeEntityOccurrence): string {
  return formatLocation(occurrence.location);
}

function formatLocation(location: CreativeEntityOccurrence['location']): string {
  const uri = location.uri.toString();
  const start = readLocationStart(location.range);
  return start ? `${uri}:${start.line + 1}` : uri;
}

function readLocationStart(rangeOrPosition: unknown): { readonly line: number } | undefined {
  if (!rangeOrPosition || typeof rangeOrPosition !== 'object') return undefined;
  if ('start' in rangeOrPosition) {
    const start = Reflect.get(rangeOrPosition, 'start');
    if (start && typeof start === 'object') {
      const line = Reflect.get(start, 'line');
      return typeof line === 'number' ? { line } : undefined;
    }
  }
  const line = Reflect.get(rangeOrPosition, 'line');
  return typeof line === 'number' ? { line } : undefined;
}

function isReadonlyAssetRef(assetRef: string): boolean {
  return assetRef.startsWith('market://') || assetRef.startsWith('shared://');
}

function stableIdPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.:-]+/g, '-');
}

function compareRows(a: DashboardCreativeEntityRow, b: DashboardCreativeEntityRow): number {
  return (
    statusRank(a.status) - statusRank(b.status) ||
    a.kind.localeCompare(b.kind) ||
    a.label.localeCompare(b.label) ||
    a.ref.sourceEntityId.localeCompare(b.ref.sourceEntityId)
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
