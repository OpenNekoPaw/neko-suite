import type {
  CharacterCommand,
  LayeredCharacterDescription,
  MaterialSlot,
  SceneCommandEnvelope,
} from '@neko/shared';
import {
  MODEL_COMPONENT_SCHEMA_REGISTRY,
  type ComponentSchemaRegistry,
} from './ComponentSchemaRegistry';

export interface CharacterCommandEnvelopeInput {
  seq: number;
  baseRevision: number;
  command: CharacterCommand;
  coalesceKey?: string;
}

export interface MorphSliderControl {
  morphId: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  coalesceKey: string;
}

export interface MaterialLayerField {
  slotId: string;
  path: string;
  label: string;
  value: unknown;
  commandType: 'material-layer-set';
  readOnly: boolean;
}

export interface CharacterInspectorField {
  component: 'character' | string;
  path: string;
  label: string;
  value: unknown;
  commandType?: CharacterCommand['type'];
  readOnly: boolean;
}

export interface CharacterUndoRecord {
  characterId: string;
  morphId: string;
  topologyVersion: number;
  previousWeight: number;
  nextWeight: number;
}

const MATERIAL_LAYER_FIELDS = [
  ['baseColor', 'Base Color'],
  ['metallic', 'Metallic'],
  ['roughness', 'Roughness'],
  ['normal', 'Normal'],
  ['ao', 'AO'],
  ['emissive', 'Emissive'],
  ['texture', 'Texture'],
] as const;

export function createCharacterCommandEnvelope({
  seq,
  baseRevision,
  command,
  coalesceKey,
}: CharacterCommandEnvelopeInput): SceneCommandEnvelope {
  return {
    seq,
    baseRevision,
    coalesceKey,
    command: {
      type: 'character',
      payloadJson: '{}',
      topologyVersion: command.topologyVersion,
      characterCommand: command,
    },
  };
}

export function compileMorphSetCommand(
  characterId: string,
  topologyVersion: number,
  morphId: string,
  weight: number,
): CharacterCommand {
  return {
    type: 'morph-set',
    characterId,
    topologyVersion,
    morphSet: { morphId, weight },
  };
}

export function compileMaterialLayerCommand(
  characterId: string,
  topologyVersion: number,
  slotId: string,
  params: Record<string, unknown>,
): CharacterCommand {
  return {
    type: 'material-layer-set',
    characterId,
    topologyVersion,
    materialLayer: {
      slotId,
      paramsJson: JSON.stringify(params),
    },
  };
}

export function compileBonePoseCommand(
  characterId: string,
  topologyVersion: number,
  boneId: string,
  rotation: [number, number, number, number],
): CharacterCommand {
  return {
    type: 'bone-pose-set',
    characterId,
    topologyVersion,
    bonePose: {
      boneId,
      space: 'local',
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] },
        scale: { x: 1, y: 1, z: 1 },
      },
    },
  };
}

export function buildMorphSliderControls(
  character: LayeredCharacterDescription,
  currentWeights: Record<string, number> = {},
): MorphSliderControl[] {
  const characterId = character.descriptor?.characterId ?? 'character';
  const controls = character.definition?.controls?.length
    ? character.definition.controls
    : (character.geometry?.morphLibrary ?? []);

  return controls.map((control) => ({
    morphId: control.morphId,
    label: control.displayName || control.morphId,
    min: control.min ?? 0,
    max: control.max ?? 1,
    step: 0.01,
    value: currentWeights[control.morphId] ?? control.defaultWeight,
    coalesceKey: `character:${characterId}:morph:${control.morphId}`,
  }));
}

export function buildMaterialLayerInspector(
  slot: MaterialSlot,
  currentParams: Record<string, unknown> = {},
): MaterialLayerField[] {
  return MATERIAL_LAYER_FIELDS.map(([path, label]) => ({
    slotId: slot.slotId,
    path,
    label,
    value: currentParams[path] ?? null,
    commandType: 'material-layer-set',
    readOnly: false,
  }));
}

export function compileExpressionPresetCommands(
  character: LayeredCharacterDescription,
  characterId: string,
  topologyVersion: number,
  presetId: string,
): CharacterCommand[] {
  const preset = character.definition?.expressionPresets.find(
    (candidate) => candidate.presetId === presetId,
  );
  if (!preset) {
    return [
      {
        type: 'expression-preset-apply',
        characterId,
        topologyVersion,
        expressionPreset: { presetId, weight: 1 },
      },
    ];
  }

  return preset.morphWeights.map((entry) =>
    compileMorphSetCommand(characterId, topologyVersion, entry.name, entry.weight),
  );
}

export function buildCharacterInspectorSchema(
  character: LayeredCharacterDescription,
  registry: ComponentSchemaRegistry = MODEL_COMPONENT_SCHEMA_REGISTRY,
): CharacterInspectorField[] {
  const fields: CharacterInspectorField[] = [];
  for (const control of buildMorphSliderControls(character)) {
    fields.push({
      component: 'character',
      path: `morph.${control.morphId}`,
      label: control.label,
      value: control.value,
      commandType: 'morph-set',
      readOnly: false,
    });
  }
  for (const slot of character.materialSlots ?? []) {
    for (const field of buildMaterialLayerInspector(slot)) {
      fields.push({
        component: 'character',
        path: `material.${slot.slotId}.${field.path}`,
        label: `${slot.name}.${field.label}`,
        value: field.value,
        commandType: field.commandType,
        readOnly: false,
      });
    }
  }
  for (const schema of registry.list()) {
    for (const field of schema.fields) {
      fields.push({
        component: schema.component,
        path: field.path,
        label: field.label,
        value: null,
        commandType: undefined,
        readOnly: field.commandType === undefined,
      });
    }
  }
  return fields;
}

export class CharacterCommandHistory {
  private readonly undoStack: CharacterUndoRecord[] = [];
  private readonly redoStack: CharacterUndoRecord[] = [];

  recordMorphEdit(record: CharacterUndoRecord): void {
    this.undoStack.push(record);
    this.redoStack.length = 0;
  }

  undo(seq: number, baseRevision: number): SceneCommandEnvelope | null {
    const record = this.undoStack.pop();
    if (!record) return null;
    this.redoStack.push(record);
    return createCharacterCommandEnvelope({
      seq,
      baseRevision,
      coalesceKey: `character:${record.characterId}:undo:${record.morphId}`,
      command: compileMorphSetCommand(
        record.characterId,
        record.topologyVersion,
        record.morphId,
        record.previousWeight,
      ),
    });
  }

  redo(seq: number, baseRevision: number): SceneCommandEnvelope | null {
    const record = this.redoStack.pop();
    if (!record) return null;
    this.undoStack.push(record);
    return createCharacterCommandEnvelope({
      seq,
      baseRevision,
      coalesceKey: `character:${record.characterId}:redo:${record.morphId}`,
      command: compileMorphSetCommand(
        record.characterId,
        record.topologyVersion,
        record.morphId,
        record.nextWeight,
      ),
    });
  }
}
