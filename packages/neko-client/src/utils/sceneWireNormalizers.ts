import type {
  CharacterRegionBinding,
  CharacterRegionBindingKind,
  CharacterRegionDescriptor,
  CharacterRegionDescriptorSet,
  SceneSelectionKind,
  SelectionHit,
  SelectionQueryResult,
  SelectionTarget,
} from '@neko/shared';
import { isRecord, readFiniteNumber, readString, readStringArray } from './wireReaders';

const CHARACTER_REGION_BINDING_KINDS: readonly CharacterRegionBindingKind[] = [
  'morphControl',
  'materialSlot',
  'bone',
  'submesh',
  'primitive',
  'mask',
];

const SELECTION_KINDS: readonly SceneSelectionKind[] = [
  'node',
  'bone',
  'materialSlot',
  'submesh',
  'primitive',
  'characterRegion',
  'morphControl',
  'environment',
];

export function readCharacterRegionDescriptorSet(
  value: unknown,
): CharacterRegionDescriptorSet | undefined {
  if (!isRecord(value)) return undefined;
  const schemaVersion = readFiniteNumber(value.schemaVersion ?? value.schema_version);
  if (schemaVersion === undefined || !Number.isInteger(schemaVersion)) return undefined;

  const regions = Array.isArray(value.regions)
    ? value.regions
        .map(readCharacterRegionDescriptor)
        .filter((region): region is CharacterRegionDescriptor => region !== null)
    : [];

  return { schemaVersion, regions };
}

export function normalizeSelectionQueryResult(value: unknown): SelectionQueryResult {
  if (!isRecord(value)) {
    throw new Error('selectionQuery returned invalid result');
  }

  const viewportId = readString(value.viewportId ?? value.viewport_id);
  const revision = readFiniteNumber(value.revision);
  if (viewportId === undefined || revision === undefined) {
    throw new Error('selectionQuery returned result without viewportId or revision');
  }

  return {
    viewportId,
    revision,
    candidates: readSelectionTargets(value.candidates),
  };
}

function readCharacterRegionDescriptor(value: unknown): CharacterRegionDescriptor | null {
  if (!isRecord(value)) return null;
  const regionId = readString(value.regionId ?? value.region_id);
  if (!regionId) return null;

  const schemaVersion = readFiniteNumber(value.schemaVersion ?? value.schema_version);
  const bindings = Array.isArray(value.bindings)
    ? value.bindings
        .map(readCharacterRegionBinding)
        .filter((binding): binding is CharacterRegionBinding => binding !== null)
    : [];

  return {
    regionId,
    displayName: readString(value.displayName ?? value.display_name) ?? regionId,
    schemaVersion:
      schemaVersion !== undefined && Number.isInteger(schemaVersion) ? schemaVersion : 0,
    bindings,
    tags: readStringArray(value.tags),
  };
}

function readCharacterRegionBinding(value: unknown): CharacterRegionBinding | null {
  if (!isRecord(value)) return null;
  const kind = readCharacterRegionBindingKind(value.kind);
  const targetId = readString(value.targetId ?? value.target_id);
  if (kind === undefined || !targetId) return null;

  const binding: CharacterRegionBinding = { kind, targetId };
  const weight = readFiniteNumber(value.weight);
  if (weight !== undefined) {
    binding.weight = weight;
  }
  return binding;
}

function readSelectionTargets(value: unknown): SelectionTarget[] {
  return Array.isArray(value)
    ? value.map(readSelectionTarget).filter((target): target is SelectionTarget => target !== null)
    : [];
}

function readSelectionTarget(value: unknown): SelectionTarget | null {
  if (!isRecord(value)) return null;
  const kind = readSelectionKind(value.kind);
  if (kind === undefined) return null;

  const target: SelectionTarget = { kind };
  const nodeId = readString(value.nodeId ?? value.node_id);
  if (nodeId !== undefined) target.nodeId = nodeId;
  const characterId = readString(value.characterId ?? value.character_id);
  if (characterId !== undefined) target.characterId = characterId;
  const boneId = readString(value.boneId ?? value.bone_id);
  if (boneId !== undefined) target.boneId = boneId;
  const materialSlotId = readString(value.materialSlotId ?? value.material_slot_id);
  if (materialSlotId !== undefined) target.materialSlotId = materialSlotId;
  const submeshId = readString(value.submeshId ?? value.submesh_id);
  if (submeshId !== undefined) target.submeshId = submeshId;
  const primitiveId = readString(value.primitiveId ?? value.primitive_id);
  if (primitiveId !== undefined) target.primitiveId = primitiveId;
  const regionId = readString(value.regionId ?? value.region_id);
  if (regionId !== undefined) target.regionId = regionId;
  const morphId = readString(value.morphId ?? value.morph_id);
  if (morphId !== undefined) target.morphId = morphId;
  const environmentId = readString(value.environmentId ?? value.environment_id);
  if (environmentId !== undefined) target.environmentId = environmentId;

  const hit = readSelectionHit(value.hit);
  if (hit !== undefined) {
    target.hit = hit;
  }

  return target;
}

function readSelectionHit(value: unknown): SelectionHit | undefined {
  if (!isRecord(value)) return undefined;
  const hit: SelectionHit = {};
  const worldPosition = readVec3(value.worldPosition ?? value.world_position);
  if (worldPosition !== undefined) {
    hit.worldPosition = worldPosition;
  }
  const worldNormal = readVec3(value.worldNormal ?? value.world_normal);
  if (worldNormal !== undefined) {
    hit.worldNormal = worldNormal;
  }
  const depth = readFiniteNumber(value.depth);
  if (depth !== undefined) {
    hit.depth = depth;
  }
  return hit;
}

function readVec3(value: unknown): { x: number; y: number; z: number } | undefined {
  if (Array.isArray(value)) {
    const x = readFiniteNumber(value[0]);
    const y = readFiniteNumber(value[1]);
    const z = readFiniteNumber(value[2]);
    return x === undefined || y === undefined || z === undefined ? undefined : { x, y, z };
  }
  if (!isRecord(value)) return undefined;
  const x = readFiniteNumber(value.x);
  const y = readFiniteNumber(value.y);
  const z = readFiniteNumber(value.z);
  return x === undefined || y === undefined || z === undefined ? undefined : { x, y, z };
}

function readCharacterRegionBindingKind(value: unknown): CharacterRegionBindingKind | undefined {
  return CHARACTER_REGION_BINDING_KINDS.find((kind) => kind === value);
}

function readSelectionKind(value: unknown): SceneSelectionKind | undefined {
  return SELECTION_KINDS.find((kind) => kind === value);
}
