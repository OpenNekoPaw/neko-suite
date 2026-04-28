import type { SceneCommandAck } from '@neko/shared';
import {
  MODEL_COMPONENT_SCHEMA_REGISTRY,
  type ComponentFieldSchema,
  type ComponentSchema,
} from './ComponentSchemaRegistry';
import type { SceneDocument } from './SceneDocument';
import type { EditableNodeTransform } from './SceneEditingTypes';

export type InspectorComponent = ComponentSchema['component'];

export interface InspectorNumberEdit {
  component: InspectorComponent;
  path: string;
  targetId: string;
  value: number;
  currentTransform?: EditableNodeTransform;
}

export interface CompiledInspectorCommand {
  type: ComponentFieldSchema['commandType'];
  payload: Record<string, unknown>;
  value: number;
}

export interface InspectorCommitHooks {
  onRejected?: (ack: SceneCommandAck, edit: InspectorNumberEdit) => void;
  onRollback?: (edit: InspectorNumberEdit) => void;
}

export async function commitInspectorNumberEdit(
  document: SceneDocument,
  edit: InspectorNumberEdit,
  hooks: InspectorCommitHooks = {},
): Promise<SceneCommandAck> {
  const command = compileInspectorNumberCommand(edit);
  const ack = await sendCompiledInspectorCommand(document, edit, command);

  if (ack.status !== 'applied') {
    hooks.onRejected?.(ack, edit);
    hooks.onRollback?.(edit);
  }

  return ack;
}

export function compileInspectorNumberCommand(edit: InspectorNumberEdit): CompiledInspectorCommand {
  const field = requireNumberField(edit.component, edit.path);
  const value = clampNumber(edit.value, field);

  switch (edit.component) {
    case 'transform':
      return {
        type: field.commandType,
        value,
        payload: {
          nodeId: edit.targetId,
          ...withPatchedTransform(edit, value),
        },
      };
    case 'material':
      return {
        type: field.commandType,
        value,
        payload: {
          materialId: edit.targetId,
          params: { [edit.path]: value },
        },
      };
    case 'light':
      return {
        type: field.commandType,
        value,
        payload: {
          nodeId: edit.targetId,
          params: { [edit.path]: value },
        },
      };
    case 'camera':
      return {
        type: field.commandType,
        value,
        payload: {
          cameraId: edit.targetId,
          [edit.path]: value,
        },
      };
    default:
      return assertNever(edit.component);
  }
}

export function clampNumber(value: number, schema: ComponentFieldSchema): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Inspector value for ${schema.path} must be finite`);
  }

  let next = value;
  if (typeof schema.min === 'number') {
    next = Math.max(schema.min, next);
  }
  if (typeof schema.max === 'number') {
    next = Math.min(schema.max, next);
  }
  return next;
}

function requireNumberField(component: InspectorComponent, path: string): ComponentFieldSchema {
  const field = MODEL_COMPONENT_SCHEMA_REGISTRY.getField(component, path);
  if (!field) {
    throw new Error(`No inspector schema registered for ${component}.${path}`);
  }
  if (field.kind !== 'number') {
    throw new Error(`Inspector schema ${component}.${path} is not numeric`);
  }
  return field;
}

function withPatchedTransform(edit: InspectorNumberEdit, value: number): EditableNodeTransform {
  if (!edit.currentTransform) {
    throw new Error('Transform inspector edits require currentTransform');
  }

  const [section, axis] = edit.path.split('.');
  if (!isTransformSection(section) || !isTransformAxis(axis)) {
    throw new Error(`Unsupported transform inspector path: ${edit.path}`);
  }

  return {
    ...edit.currentTransform,
    [section]: {
      ...edit.currentTransform[section],
      [axis]: value,
    },
  };
}

async function sendCompiledInspectorCommand(
  document: SceneDocument,
  edit: InspectorNumberEdit,
  command: CompiledInspectorCommand,
): Promise<SceneCommandAck> {
  switch (edit.component) {
    case 'transform':
      if (!isEditableNodeTransform(command.payload)) {
        throw new Error('Compiled transform inspector command is invalid');
      }
      return document.node(edit.targetId).setTransform(command.payload);
    case 'material':
      return document.material(edit.targetId).updateParams({ [edit.path]: command.value });
    case 'light':
      return document.light(edit.targetId).updateParams({ [edit.path]: command.value });
    case 'camera':
      return document.camera(edit.targetId).setFov(command.value);
    default:
      return assertNever(edit.component);
  }
}

function isTransformSection(value: string | undefined): value is keyof EditableNodeTransform {
  return value === 'position' || value === 'rotation' || value === 'scale';
}

function isTransformAxis(value: string | undefined): value is 'x' | 'y' | 'z' | 'w' {
  return value === 'x' || value === 'y' || value === 'z' || value === 'w';
}

function isEditableNodeTransform(value: unknown): value is EditableNodeTransform {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    isEditableVec3(record.position) &&
    isEditableQuat(record.rotation) &&
    isEditableVec3(record.scale)
  );
}

function isEditableVec3(value: unknown): value is EditableNodeTransform['position'] {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { x?: unknown }).x === 'number' &&
    typeof (value as { y?: unknown }).y === 'number' &&
    typeof (value as { z?: unknown }).z === 'number'
  );
}

function isEditableQuat(value: unknown): value is EditableNodeTransform['rotation'] {
  return isEditableVec3(value) && typeof (value as { w?: unknown }).w === 'number';
}

function assertNever(value: never): never {
  throw new Error(`Unsupported inspector component: ${String(value)}`);
}
