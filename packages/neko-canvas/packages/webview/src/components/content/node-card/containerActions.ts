import type { CanvasNode } from '@neko/shared';
import type { ContainerActionDescriptor, ContainerActionDescriptorContext } from './types';

export type ContainerActionDescriptorRegistry = Partial<
  Record<CanvasNode['type'], readonly ContainerActionDescriptor[]>
>;

const SCENE_ACTIONS: readonly ContainerActionDescriptor[] = [];

const GALLERY_ACTIONS: readonly ContainerActionDescriptor[] = [
  {
    id: 'batch-generate',
    label: 'preset.gallery.generateAll',
    visibleWhen: 'has-children',
    enabledWhen: 'not-generating',
  },
];

const TABLE_ACTIONS: readonly ContainerActionDescriptor[] = [
  {
    id: 'add-row',
    label: 'preset.table.addRow',
    visibleWhen: 'always',
  },
  {
    id: 'add-column',
    label: 'preset.table.addColumn',
    visibleWhen: 'always',
  },
  {
    id: 'remove-row',
    label: 'preset.table.removeRow',
    visibleWhen: 'always',
  },
  {
    id: 'remove-column',
    label: 'preset.table.removeColumn',
    visibleWhen: 'always',
  },
];

function createBuiltInContainerActionRegistry(): ContainerActionDescriptorRegistry {
  return {
    scene: SCENE_ACTIONS,
    gallery: GALLERY_ACTIONS,
    table: TABLE_ACTIONS,
  };
}

const BUILT_IN_CONTAINER_ACTION_REGISTRY = createBuiltInContainerActionRegistry();
export function getContainerActionDescriptors(
  node: CanvasNode,
  registry: ContainerActionDescriptorRegistry = BUILT_IN_CONTAINER_ACTION_REGISTRY,
): readonly ContainerActionDescriptor[] {
  return registry[node.type] ?? [];
}

export function isContainerActionVisible(
  action: ContainerActionDescriptor,
  ctx: ContainerActionDescriptorContext,
): boolean {
  switch (action.visibleWhen) {
    case 'always':
      return true;
    case 'selected':
      return ctx.isSelected;
    case 'has-children':
      return ctx.childNodes.length > 0;
    case 'empty':
      return ctx.childNodes.length === 0;
  }
}
