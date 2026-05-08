import type { CanvasNode, ContainerSection } from '@neko/shared';

export interface CanvasNodePreset {
  name: string;
  nodeType: CanvasNode['type'];
  createContent: () => ContainerSection;
}

export type CanvasNodePresetRegistry = ReadonlyMap<string, CanvasNodePreset>;

const BUILT_IN_CONTENT_PRESETS: CanvasNodePreset[] = [
  {
    name: 'annotation.basic',
    nodeType: 'annotation',
    createContent: () => ({
      id: 'annotation-root',
      layout: 'stack',
      blocks: [
        {
          id: 'annotation-content',
          kind: 'textarea',
          label: 'Note',
          binding: { path: '/content', valueType: 'string' },
        },
      ],
    }),
  },
  {
    name: 'text.basic',
    nodeType: 'text',
    createContent: () => ({
      id: 'text-root',
      layout: 'stack',
      blocks: [
        {
          id: 'text-content',
          kind: 'textarea',
          label: 'Text',
          binding: { path: '/content', valueType: 'string' },
        },
      ],
    }),
  },
];

export function createBuiltInCanvasNodePresetRegistry(): CanvasNodePresetRegistry {
  return new Map(BUILT_IN_CONTENT_PRESETS.map((preset) => [preset.name, preset]));
}

export function getCanvasNodePreset(
  registry: CanvasNodePresetRegistry,
  name: string | undefined,
): CanvasNodePreset | undefined {
  return name ? registry.get(name) : undefined;
}

export function applyCanvasNodePreset(
  node: Omit<CanvasNode, 'id'>,
  preset: CanvasNodePreset | undefined,
): Omit<CanvasNode, 'id'> {
  if (!preset || node.type !== preset.nodeType) {
    return node;
  }

  return {
    ...node,
    preset: preset.name,
    content: preset.createContent(),
  } as Omit<CanvasNode, 'id'>;
}
