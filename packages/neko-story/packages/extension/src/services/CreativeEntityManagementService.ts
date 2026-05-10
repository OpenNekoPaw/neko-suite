import type {
  CreativeEntity,
  CreativeEntityRegistry,
  EntityAssetBinding,
  EntityAssetBindingRole,
  EntityAssetRequirement,
  EntityAssetRequirementStatus,
  MissingRepresentationAction,
  NekoAssetsAPI,
  RepresentationKind,
  ResolvedRepresentationFile,
  VisualFactSuggestion,
  VisualIdentityDraft,
  VisualIdentityDraftStatus,
} from '@neko/shared';
import type {
  CreativeEntityOccurrence,
  ICreativeEntityGraph,
  ICreativeEntityWorkspaceIndex,
} from './types';

export type ManageableEntityAssetBindingRole = Extract<
  EntityAssetBindingRole,
  'portrait' | 'reference' | 'live2d' | 'live3d' | 'voice' | 'motion'
>;

export const ENTITY_MANAGEMENT_BINDING_ROLES: readonly ManageableEntityAssetBindingRole[] = [
  'portrait',
  'reference',
  'live2d',
  'live3d',
  'voice',
  'motion',
] as const;

export interface EntityAssetBindingReader {
  list(): Promise<readonly EntityAssetBinding[]>;
}

export interface EntityAssetRequirementReader {
  list(): Promise<readonly EntityAssetRequirement[]>;
}

export interface VisualIdentityDraftReader {
  list(): Promise<readonly VisualIdentityDraft[]>;
}

export interface CreativeEntityManagementServiceOptions {
  readonly entities: CreativeEntityRegistry;
  readonly bindings: EntityAssetBindingReader;
  readonly requirements: EntityAssetRequirementReader;
  readonly drafts: VisualIdentityDraftReader;
  readonly workspaceIndex?: Pick<ICreativeEntityWorkspaceIndex, 'queryCharacter'>;
  readonly graph?: Pick<ICreativeEntityGraph, 'getEdgesForEntity'>;
}

export interface EntityOccurrenceSummary {
  readonly source: CreativeEntityOccurrence['source'];
  readonly role: CreativeEntityOccurrence['role'];
  readonly label: string;
  readonly location: string;
  readonly detail?: string;
}

export interface EntityRelationshipSummary {
  readonly from: string;
  readonly to: string;
  readonly type: string;
  readonly strength: string;
  readonly provenance: string;
  readonly confidence?: number;
}

export interface EntityBindingSummary {
  readonly id: string;
  readonly role: EntityAssetBindingRole;
  readonly assetRef: string;
  readonly status: EntityAssetBinding['status'];
  readonly source: EntityAssetBinding['source'];
  readonly isDefault: boolean;
  readonly confidence?: number;
  readonly updatedAt: string;
}

export interface CreativeEntityDetailView {
  readonly entity: CreativeEntity;
  readonly aliases: readonly string[];
  readonly status: CreativeEntity['status'];
  readonly relationships: readonly EntityRelationshipSummary[];
  readonly occurrences: readonly EntityOccurrenceSummary[];
  readonly bindings: readonly EntityBindingSummary[];
  readonly defaults: readonly EntityBindingSummary[];
  readonly missingRequirements: readonly EntityAssetRequirement[];
  readonly visualDrafts: readonly VisualIdentityDraft[];
}

export interface AssetBindingOption {
  readonly assetEntityId: string;
  readonly assetRef: string;
  readonly label: string;
  readonly description?: string;
  readonly suggestedRoles: readonly EntityAssetBindingRole[];
  readonly confidence: number;
  readonly reason: string;
}

export type RepresentationPackageDetail = NonNullable<
  Awaited<ReturnType<NekoAssetsAPI['getRepresentationPackageDetail']>>
>;

export interface RepresentationPackageView {
  readonly assetEntityId: string;
  readonly assetRef: string;
  readonly representationKinds: readonly RepresentationKind[];
  readonly capabilities: readonly string[];
  readonly files: readonly ResolvedRepresentationFile[];
  readonly missingRoles: readonly string[];
  readonly assignableRoles: readonly ManageableEntityAssetBindingRole[];
  readonly currentBindings: readonly EntityBindingSummary[];
}

export interface BuildDefaultBindingInput {
  readonly entity: CreativeEntity;
  readonly role: ManageableEntityAssetBindingRole;
  readonly assetRef: string;
  readonly confidence?: number;
  readonly now?: string;
}

export class CreativeEntityManagementService {
  constructor(private readonly options: CreativeEntityManagementServiceOptions) {}

  async listEntities(): Promise<readonly CreativeEntity[]> {
    const entities = await this.options.entities.list();
    return [...entities].sort(compareEntities);
  }

  async getEntityDetail(entityId: string): Promise<CreativeEntityDetailView | undefined> {
    const entity = await this.options.entities.get(entityId);
    if (!entity) {
      return undefined;
    }

    const [allBindings, allRequirements, allDrafts] = await Promise.all([
      this.options.bindings.list(),
      this.options.requirements.list(),
      this.options.drafts.list(),
    ]);

    const bindings = allBindings
      .filter((binding) => binding.entityId === entity.id && binding.entityKind === entity.kind)
      .map(toBindingSummary)
      .sort(compareBindingSummaries);

    return {
      entity,
      aliases: entity.aliases,
      status: entity.status,
      relationships: this.getRelationshipSummaries(entity.id),
      occurrences: this.getOccurrenceSummaries(entity),
      bindings,
      defaults: bindings.filter((binding) => binding.isDefault),
      missingRequirements: allRequirements
        .filter(
          (requirement) =>
            requirement.entityId === entity.id &&
            requirement.entityKind === entity.kind &&
            requirement.status !== 'dismissed' &&
            requirement.status !== 'bound',
        )
        .sort(compareRequirements),
      visualDrafts:
        entity.kind === 'character'
          ? allDrafts
              .filter((draft) => draft.characterId === entity.id && draft.status !== 'discarded')
              .sort(compareVisualDrafts)
          : [],
    };
  }

  async buildAssetBindingOptions(
    assetsApi: NekoAssetsAPI,
    role?: ManageableEntityAssetBindingRole,
  ): Promise<readonly AssetBindingOption[]> {
    const entities = await assetsApi.getAllEntities();
    const options = await Promise.all(
      entities.map(async (assetEntity): Promise<AssetBindingOption | undefined> => {
        const candidate = await assetsApi.getBindingCandidate(assetEntity.id);
        if (!candidate) {
          return undefined;
        }
        if (role && !candidate.suggestedRoles.includes(role)) {
          return undefined;
        }
        return {
          assetEntityId: candidate.assetEntityId,
          assetRef: candidate.assetRef,
          label: assetEntity.name,
          description: assetEntity.category,
          suggestedRoles: candidate.suggestedRoles,
          confidence: candidate.confidence,
          reason: candidate.reason,
        } satisfies AssetBindingOption;
      }),
    );

    return options
      .filter((option): option is AssetBindingOption => option !== undefined)
      .sort(compareAssetBindingOptions);
  }

  buildDefaultBinding(input: BuildDefaultBindingInput): EntityAssetBinding {
    return buildDefaultEntityAssetBinding(input);
  }

  buildDraftSelection(draft: VisualIdentityDraft, selectedAssetId: string): VisualIdentityDraft {
    return {
      ...draft,
      selectedAssetId,
      status: 'selected',
    };
  }

  buildDraftFactDecision(
    draft: VisualIdentityDraft,
    fact: VisualFactSuggestion,
    accepted: boolean,
  ): VisualIdentityDraft {
    return {
      ...draft,
      extractedVisualFacts: (draft.extractedVisualFacts ?? []).map((candidate) =>
        candidate.key === fact.key && candidate.value === fact.value
          ? { ...candidate, accepted }
          : candidate,
      ),
    };
  }

  buildDraftStatusUpdate(
    draft: VisualIdentityDraft,
    status: VisualIdentityDraftStatus,
  ): VisualIdentityDraft {
    return {
      ...draft,
      status,
    };
  }

  buildRequirementStatusUpdate(
    requirement: EntityAssetRequirement,
    status: EntityAssetRequirementStatus,
  ): EntityAssetRequirement {
    return {
      ...requirement,
      status,
    };
  }

  buildRepresentationPackageView(
    detail: RepresentationPackageDetail,
    bindings: readonly EntityAssetBinding[],
  ): RepresentationPackageView {
    const currentBindings = bindings
      .filter((binding) => binding.assetRef === detail.assetRef)
      .map(toBindingSummary)
      .sort(compareBindingSummaries);

    return {
      assetEntityId: detail.assetEntityId,
      assetRef: detail.assetRef,
      representationKinds: detail.representationKinds,
      capabilities: detail.capabilities,
      files: detail.files,
      missingRoles: detail.missingRoles,
      assignableRoles: detail.representationKinds
        .map(representationKindToBindingRole)
        .filter((role): role is ManageableEntityAssetBindingRole => role !== undefined),
      currentBindings,
    };
  }

  private getRelationshipSummaries(entityId: string): readonly EntityRelationshipSummary[] {
    return (
      this.options.graph
        ?.getEdgesForEntity(entityId)
        .map((edge) => ({
          from: edge.from,
          to: edge.to,
          type: edge.type,
          strength: edge.strength,
          provenance: edge.provenance ?? 'lineage',
          confidence: edge.confidence,
        }))
        .sort(compareRelationshipSummaries) ?? []
    );
  }

  private getOccurrenceSummaries(entity: CreativeEntity): readonly EntityOccurrenceSummary[] {
    if (entity.kind !== 'character') {
      return [];
    }

    const query = this.options.workspaceIndex?.queryCharacter(entity.canonicalName);
    return (
      query?.occurrences
        .map((occurrence) => ({
          source: occurrence.source,
          role: occurrence.role,
          label: occurrence.label,
          location: formatOccurrenceLocation(occurrence),
          detail: occurrence.detail,
        }))
        .sort(compareOccurrenceSummaries) ?? []
    );
  }
}

export function buildDefaultEntityAssetBinding(
  input: BuildDefaultBindingInput,
): EntityAssetBinding {
  return {
    id: buildBindingId(input.entity, input.role, input.assetRef),
    entityId: input.entity.id,
    entityKind: input.entity.kind,
    assetRef: input.assetRef,
    role: input.role,
    isDefault: true,
    status: 'confirmed',
    source: 'user',
    confidence: input.confidence,
    updatedAt: input.now ?? new Date().toISOString(),
  };
}

export function representationKindToBindingRole(
  kind: RepresentationKind,
): ManageableEntityAssetBindingRole | undefined {
  return ENTITY_MANAGEMENT_BINDING_ROLES.includes(kind as ManageableEntityAssetBindingRole)
    ? (kind as ManageableEntityAssetBindingRole)
    : undefined;
}

export function getRequirementActions(
  requirement: EntityAssetRequirement,
): readonly MissingRepresentationAction[] {
  if (requirement.status === 'dismissed' || requirement.status === 'bound') {
    return [];
  }
  return ['generate', 'import', 'bind-existing', 'dismiss'];
}

function toBindingSummary(binding: EntityAssetBinding): EntityBindingSummary {
  return {
    id: binding.id,
    role: binding.role,
    assetRef: binding.assetRef,
    status: binding.status,
    source: binding.source,
    isDefault: binding.isDefault === true,
    confidence: binding.confidence,
    updatedAt: binding.updatedAt,
  };
}

function formatOccurrenceLocation(occurrence: CreativeEntityOccurrence): string {
  const uri = occurrence.location.uri.toString();
  const start = readLocationStart(occurrence.location.range);
  return start ? `${uri}:${start.line + 1}` : uri;
}

function readLocationStart(rangeOrPosition: unknown): { readonly line: number } | undefined {
  if (!rangeOrPosition || typeof rangeOrPosition !== 'object') {
    return undefined;
  }

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

function buildBindingId(
  entity: CreativeEntity,
  role: ManageableEntityAssetBindingRole,
  assetRef: string,
): string {
  return `binding:${entity.kind}:${stableIdPart(entity.id)}:${role}:${stableIdPart(assetRef)}`;
}

function stableIdPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.:-]+/g, '-');
}

function compareEntities(a: CreativeEntity, b: CreativeEntity): number {
  return (
    a.kind.localeCompare(b.kind) ||
    (a.displayName ?? a.canonicalName).localeCompare(b.displayName ?? b.canonicalName) ||
    a.id.localeCompare(b.id)
  );
}

function compareBindingSummaries(a: EntityBindingSummary, b: EntityBindingSummary): number {
  return a.role.localeCompare(b.role) || a.id.localeCompare(b.id);
}

function compareRequirements(a: EntityAssetRequirement, b: EntityAssetRequirement): number {
  return (
    a.source.localeCompare(b.source) ||
    a.requiredKinds.join(',').localeCompare(b.requiredKinds.join(',')) ||
    a.id.localeCompare(b.id)
  );
}

function compareVisualDrafts(a: VisualIdentityDraft, b: VisualIdentityDraft): number {
  return a.status.localeCompare(b.status) || a.id.localeCompare(b.id);
}

function compareRelationshipSummaries(
  a: EntityRelationshipSummary,
  b: EntityRelationshipSummary,
): number {
  return a.type.localeCompare(b.type) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to);
}

function compareOccurrenceSummaries(
  a: EntityOccurrenceSummary,
  b: EntityOccurrenceSummary,
): number {
  return a.source.localeCompare(b.source) || a.location.localeCompare(b.location);
}

function compareAssetBindingOptions(a: AssetBindingOption, b: AssetBindingOption): number {
  return b.confidence - a.confidence || a.label.localeCompare(b.label);
}
