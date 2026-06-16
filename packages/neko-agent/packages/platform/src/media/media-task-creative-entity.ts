import type {
  EntityAssetBindingRole,
  EntityAssetRequirement,
  RepresentationKind,
  VisualIdentityDraft,
} from '@neko/shared';
import {
  buildEntityAssetRequirementsFromGeneratedMediaLineage,
  buildVisualIdentityDraftsFromGeneratedMediaLineage,
  type GeneratedAsset,
  type WebviewGeneratedAsset,
} from '@neko/shared';
import type { GeneratedMediaTaskType } from './media-generated-asset';
import type { MediaGenerationType, MediaTask } from './types';

export type MediaTaskCreativeEntityActionKind =
  | 'review-visual-draft'
  | 'confirm-binding'
  | 'generate-missing-representation'
  | 'bind-existing';

export interface MediaTaskCreativeEntityBindingCandidate {
  readonly entityId: string;
  readonly entityKind: 'character';
  readonly generatedAssetId: string;
  readonly roles: readonly EntityAssetBindingRole[];
  readonly sourceNodeId?: string;
}

export type MediaTaskCreativeEntityAction =
  | {
      readonly kind: 'review-visual-draft';
      readonly entityId: string;
      readonly draftId: string;
      readonly generatedAssetIds: readonly string[];
    }
  | {
      readonly kind: 'confirm-binding';
      readonly entityId: string;
      readonly entityKind: 'character';
      readonly generatedAssetId: string;
      readonly role: EntityAssetBindingRole;
    }
  | {
      readonly kind: 'generate-missing-representation' | 'bind-existing';
      readonly entityId: string;
      readonly entityKind: 'character';
      readonly requiredKinds: readonly RepresentationKind[];
    };

export interface MediaTaskCreativeEntityContext {
  readonly characterIds: readonly string[];
  readonly sourceNodeId?: string;
  readonly generatedAssetIds: readonly string[];
  readonly visualDrafts: readonly VisualIdentityDraft[];
  readonly requirements: readonly EntityAssetRequirement[];
  readonly bindingCandidates: readonly MediaTaskCreativeEntityBindingCandidate[];
  readonly actions: readonly MediaTaskCreativeEntityAction[];
}

export interface BuildMediaTaskCreativeEntityContextInput {
  readonly task: Pick<MediaTask, 'request'> & Partial<Pick<MediaTask, 'type' | 'outputs'>>;
  readonly taskType?: GeneratedMediaTaskType;
  readonly assets?: readonly (GeneratedAsset | WebviewGeneratedAsset)[];
}

export function buildMediaTaskCreativeEntityContext(
  input: BuildMediaTaskCreativeEntityContextInput,
): MediaTaskCreativeEntityContext | undefined {
  const assets = input.assets ?? [];
  const characterIds = collectCharacterIds(input.task.request.metadata, assets);
  const sourceNodeId = collectSourceNodeId(input.task.request.metadata, assets);
  const taskType =
    input.taskType ??
    inferGeneratedMediaTaskType(input.task.type) ??
    inferGeneratedMediaTaskTypeFromOutputs(input.task.outputs);

  if (characterIds.length === 0 && !sourceNodeId) {
    return undefined;
  }

  const generatedAssetIds = assets.map((asset) => asset.id);
  const visualDrafts = buildVisualIdentityDraftsFromGeneratedMediaLineage({
    assets,
    source: 'agent',
  });
  const requiredKinds = getRequiredKindsForTaskType(taskType);
  const requirements = buildEntityAssetRequirementsFromGeneratedMediaLineage({
    assets,
    source: 'agent',
    requiredKinds,
  });
  const bindingCandidates = buildBindingCandidates(assets, taskType);
  const actions = buildCreativeEntityActions({
    characterIds,
    visualDrafts,
    requirements,
    bindingCandidates,
    taskType,
  });

  return {
    characterIds,
    ...(sourceNodeId ? { sourceNodeId } : {}),
    generatedAssetIds,
    visualDrafts,
    requirements,
    bindingCandidates,
    actions,
  };
}

function inferGeneratedMediaTaskType(
  generationType: MediaGenerationType | undefined,
): GeneratedMediaTaskType | undefined {
  switch (generationType) {
    case 'text-to-video':
    case 'image-to-video':
    case 'video-to-video':
    case 'video-edit':
      return 'video';
    case 'text-to-audio':
    case 'text-to-music':
      return 'audio';
    case 'text-to-image':
    case 'image-to-image':
    case 'image-edit':
    case 'workflow':
      return 'image';
    default:
      return undefined;
  }
}

function inferGeneratedMediaTaskTypeFromOutputs(
  outputs: Pick<MediaTask, 'outputs'>['outputs'],
): GeneratedMediaTaskType | undefined {
  const outputType = outputs?.find((output) => output.url.length > 0)?.type;
  switch (outputType) {
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    default:
      return undefined;
  }
}

function collectCharacterIds(
  metadata: Record<string, unknown> | undefined,
  assets: readonly (GeneratedAsset | WebviewGeneratedAsset)[],
): readonly string[] {
  const ids = new Set<string>();
  const metadataIds = metadata?.['characterIds'];
  if (Array.isArray(metadataIds)) {
    for (const id of metadataIds) {
      if (typeof id === 'string' && id.length > 0) {
        ids.add(id);
      }
    }
  }

  for (const asset of assets) {
    for (const id of asset.characterIds ?? []) {
      if (id.length > 0) {
        ids.add(id);
      }
    }
  }

  return [...ids].sort();
}

function collectSourceNodeId(
  metadata: Record<string, unknown> | undefined,
  assets: readonly (GeneratedAsset | WebviewGeneratedAsset)[],
): string | undefined {
  const metadataSourceNodeId = metadata?.['sourceNodeId'];
  if (typeof metadataSourceNodeId === 'string' && metadataSourceNodeId.length > 0) {
    return metadataSourceNodeId;
  }

  return assets.find((asset) => asset.sourceNodeId)?.sourceNodeId;
}

function getRequiredKindsForTaskType(
  taskType: GeneratedMediaTaskType | undefined,
): readonly RepresentationKind[] {
  switch (taskType) {
    case 'image':
      return ['portrait', 'reference'];
    case 'audio':
      return ['voice'];
    case 'video':
      return ['motion'];
    default:
      return [];
  }
}

function getBindingRolesForTaskType(
  taskType: GeneratedMediaTaskType | undefined,
): readonly EntityAssetBindingRole[] {
  switch (taskType) {
    case 'image':
      return ['portrait', 'reference'];
    case 'audio':
      return ['voice'];
    case 'video':
      return ['motion'];
    default:
      return [];
  }
}

function buildBindingCandidates(
  assets: readonly (GeneratedAsset | WebviewGeneratedAsset)[],
  taskType: GeneratedMediaTaskType | undefined,
): readonly MediaTaskCreativeEntityBindingCandidate[] {
  const roles = getBindingRolesForTaskType(taskType);
  if (roles.length === 0) {
    return [];
  }

  const candidates: MediaTaskCreativeEntityBindingCandidate[] = [];
  for (const asset of assets) {
    for (const entityId of asset.characterIds ?? []) {
      candidates.push({
        entityId,
        entityKind: 'character',
        generatedAssetId: asset.id,
        roles,
        ...(asset.sourceNodeId ? { sourceNodeId: asset.sourceNodeId } : {}),
      });
    }
  }
  return candidates;
}

function buildCreativeEntityActions(input: {
  readonly characterIds: readonly string[];
  readonly visualDrafts: readonly VisualIdentityDraft[];
  readonly requirements: readonly EntityAssetRequirement[];
  readonly bindingCandidates: readonly MediaTaskCreativeEntityBindingCandidate[];
  readonly taskType?: GeneratedMediaTaskType;
}): readonly MediaTaskCreativeEntityAction[] {
  const reviewDraftActions: MediaTaskCreativeEntityAction[] = input.visualDrafts.map((draft) => ({
    kind: 'review-visual-draft',
    entityId: draft.characterId,
    draftId: draft.id,
    generatedAssetIds: draft.generatedAssetIds,
  }));

  const confirmBindingActions: MediaTaskCreativeEntityAction[] = input.bindingCandidates.flatMap(
    (candidate) =>
      candidate.roles.map((role) => ({
        kind: 'confirm-binding' as const,
        entityId: candidate.entityId,
        entityKind: candidate.entityKind,
        generatedAssetId: candidate.generatedAssetId,
        role,
      })),
  );

  const characterRequirements = input.requirements.filter(
    (requirement) => requirement.entityKind === 'character',
  );

  const requirementActions: MediaTaskCreativeEntityAction[] = characterRequirements.flatMap(
    (requirement) => [
      {
        kind: 'generate-missing-representation' as const,
        entityId: requirement.entityId,
        entityKind: 'character' as const,
        requiredKinds: requirement.requiredKinds,
      },
      {
        kind: 'bind-existing' as const,
        entityId: requirement.entityId,
        entityKind: 'character' as const,
        requiredKinds: requirement.requiredKinds,
      },
    ],
  );

  if (reviewDraftActions.length + confirmBindingActions.length + requirementActions.length > 0) {
    return [...reviewDraftActions, ...confirmBindingActions, ...requirementActions];
  }

  const requiredKinds = getRequiredKindsForTaskType(input.taskType);
  if (requiredKinds.length === 0) {
    return [];
  }

  return input.characterIds.flatMap((entityId) => [
    {
      kind: 'generate-missing-representation' as const,
      entityId,
      entityKind: 'character' as const,
      requiredKinds,
    },
    {
      kind: 'bind-existing' as const,
      entityId,
      entityKind: 'character' as const,
      requiredKinds,
    },
  ]);
}
