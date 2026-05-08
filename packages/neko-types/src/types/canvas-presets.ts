import type { CanvasNodeType } from './canvas';
import type { ContainerPolicyName } from './canvas-layered';

export type CanvasPresetCreationMode = 'legacy' | 'composable';

export interface CanvasNodePresetMetadata {
  readonly name: string;
  readonly nodeType: CanvasNodeType;
  readonly creationMode: CanvasPresetCreationMode;
  readonly label: string;
  readonly description?: string;
  readonly containerPolicy?: ContainerPolicyName;
  readonly deriveTargets: readonly string[];
}

export const BUILT_IN_CANVAS_NODE_PRESETS = [
  {
    name: 'annotation.legacy',
    nodeType: 'annotation',
    creationMode: 'legacy',
    label: 'Annotation',
    deriveTargets: ['annotation.legacy', 'annotation.basic', 'text.basic'],
  },
  {
    name: 'annotation.basic',
    nodeType: 'annotation',
    creationMode: 'composable',
    label: 'Annotation Basic',
    deriveTargets: ['annotation.basic', 'text.basic'],
  },
  {
    name: 'text.legacy',
    nodeType: 'text',
    creationMode: 'legacy',
    label: 'Text',
    deriveTargets: ['text.legacy', 'text.basic', 'annotation.basic'],
  },
  {
    name: 'text.basic',
    nodeType: 'text',
    creationMode: 'composable',
    label: 'Text Basic',
    deriveTargets: ['text.basic', 'annotation.basic'],
  },
  {
    name: 'shot.legacy',
    nodeType: 'shot',
    creationMode: 'legacy',
    label: 'Shot',
    deriveTargets: ['shot.legacy', 'gallery.legacy', 'annotation.basic', 'text.basic'],
  },
  {
    name: 'scene.legacy',
    nodeType: 'scene',
    creationMode: 'legacy',
    label: 'Scene',
    containerPolicy: 'scene',
    deriveTargets: [
      'scene.legacy',
      'shot.legacy',
      'gallery.legacy',
      'annotation.basic',
      'text.basic',
    ],
  },
  {
    name: 'gallery.legacy',
    nodeType: 'gallery',
    creationMode: 'legacy',
    label: 'Gallery',
    deriveTargets: ['gallery.legacy', 'shot.legacy', 'annotation.basic', 'text.basic'],
  },
  {
    name: 'media.legacy',
    nodeType: 'media',
    creationMode: 'legacy',
    label: 'Media',
    deriveTargets: ['media.legacy', 'annotation.basic', 'text.basic'],
  },
  {
    name: 'storyboard.legacy',
    nodeType: 'storyboard',
    creationMode: 'legacy',
    label: 'Storyboard',
    deriveTargets: ['storyboard.legacy', 'shot.legacy', 'annotation.basic', 'text.basic'],
  },
  {
    name: 'group.container',
    nodeType: 'group',
    creationMode: 'legacy',
    label: 'Group',
    containerPolicy: 'group',
    deriveTargets: ['group.container', 'annotation.basic', 'text.basic'],
  },
  {
    name: 'artboard.container',
    nodeType: 'artboard',
    creationMode: 'legacy',
    label: 'Artboard',
    containerPolicy: 'artboard',
    deriveTargets: ['artboard.container', 'annotation.basic', 'text.basic'],
  },
  {
    name: 'script.legacy',
    nodeType: 'script',
    creationMode: 'legacy',
    label: 'Script',
    deriveTargets: ['script.legacy', 'scene.legacy', 'shot.legacy', 'annotation.basic'],
  },
  {
    name: 'document.legacy',
    nodeType: 'document',
    creationMode: 'legacy',
    label: 'Document',
    deriveTargets: ['document.legacy', 'annotation.basic', 'text.basic'],
  },
  {
    name: 'model.legacy',
    nodeType: 'model',
    creationMode: 'legacy',
    label: 'Model',
    deriveTargets: ['model.legacy', 'annotation.basic', 'text.basic'],
  },
  {
    name: 'canvas-embed.legacy',
    nodeType: 'canvas-embed',
    creationMode: 'legacy',
    label: 'Canvas Embed',
    deriveTargets: ['canvas-embed.legacy', 'annotation.basic', 'text.basic'],
  },
] as const satisfies readonly CanvasNodePresetMetadata[];

const CANVAS_NODE_PRESET_NAMES = BUILT_IN_CANVAS_NODE_PRESETS.map((preset) => preset.name);

export const CANVAS_AGENT_CREATE_NODE_TYPES = uniqueStrings(
  BUILT_IN_CANVAS_NODE_PRESETS.map((preset) => preset.nodeType),
) as readonly CanvasNodeType[];

export const CANVAS_AGENT_NODE_PRESETS = CANVAS_NODE_PRESET_NAMES;

export const CANVAS_AGENT_DERIVE_TARGET_PRESETS = uniqueStrings(
  BUILT_IN_CANVAS_NODE_PRESETS.flatMap((preset) => preset.deriveTargets),
);

export const CANVAS_AGENT_CONTAINER_PRESETS = BUILT_IN_CANVAS_NODE_PRESETS.filter((preset) =>
  hasContainerPolicy(preset),
).map((preset) => preset.name);

export const CANVAS_AGENT_CHILD_PRESETS = CANVAS_NODE_PRESET_NAMES;

export function getBuiltInCanvasNodePresetMetadata(
  name: string | undefined,
): CanvasNodePresetMetadata | undefined {
  return name ? BUILT_IN_CANVAS_NODE_PRESETS.find((preset) => preset.name === name) : undefined;
}

export function getDefaultCanvasNodePresetName(nodeType: CanvasNodeType): string | undefined {
  return BUILT_IN_CANVAS_NODE_PRESETS.find(
    (preset) => preset.nodeType === nodeType && preset.creationMode === 'legacy',
  )?.name;
}

export function isBuiltInCanvasNodePresetName(name: string): boolean {
  return getBuiltInCanvasNodePresetMetadata(name) !== undefined;
}

function uniqueStrings<T extends string>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function hasContainerPolicy(preset: object): preset is { containerPolicy: ContainerPolicyName } {
  return 'containerPolicy' in preset;
}
