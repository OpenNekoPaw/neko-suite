import type { TreeViewAction, TreeViewBadge, TreeViewItem } from '@neko/ui/creative';
import { toCodiconClassName } from '@neko/ui/icons';
import { createElement } from 'react';
import type { LayerData } from '../../types';

export interface SketchLayerAdapterOptions {
  readonly removeLabel?: string;
  readonly adjustmentBadgeLabel?: string;
  readonly adjustmentBadgeTitle?: string;
  readonly clippingMaskBadgeLabel?: string;
  readonly clippingMaskBadgeTitle?: string;
  readonly alphaLockBadgeLabel?: string;
  readonly alphaLockBadgeTitle?: string;
}

/**
 * Sketch layer projection remains in this adapter because TreeViewItem is a shared visual DTO.
 * Fixed brush controls are owned by BrushPanel and use typed composition primitives directly.
 */
export function mapSketchLayersToTreeViewItems(
  layers: readonly LayerData[],
  activeLayerId: string | null,
  options: SketchLayerAdapterOptions = {},
): readonly TreeViewItem[] {
  return [...layers]
    .reverse()
    .map((layer) => mapSketchLayerToTreeViewItem(layer, activeLayerId, options));
}

export function getLayerIndex(layers: readonly LayerData[], layerId: string): number {
  return layers.findIndex((layer) => layer.id === layerId);
}

function mapSketchLayerToTreeViewItem(
  layer: LayerData,
  activeLayerId: string | null,
  options: SketchLayerAdapterOptions,
): TreeViewItem {
  return {
    id: layer.id,
    label: layer.name,
    children: layer.children.map((child) =>
      mapSketchLayerToTreeViewItem(child, activeLayerId, options),
    ),
    expanded: true,
    selected: layer.id === activeLayerId,
    visible: layer.visible,
    locked: layer.locked,
    badges: createLayerBadges(layer, options),
    actions: [createRemoveLayerAction(options.removeLabel)],
    metadata: {
      type: layer.type,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      clippingMask: layer.clippingMask,
      alphaLock: layer.alphaLock,
    },
  };
}

function createLayerBadges(
  layer: LayerData,
  options: SketchLayerAdapterOptions,
): readonly TreeViewBadge[] {
  const badges: TreeViewBadge[] = [];
  if (layer.type === 'adjustment') {
    badges.push({
      id: 'adjustment',
      label: options.adjustmentBadgeLabel ?? 'ADJ',
      title: options.adjustmentBadgeTitle,
    });
  }
  if (layer.clippingMask) {
    badges.push({
      id: 'clipping-mask',
      label: options.clippingMaskBadgeLabel ?? 'Clip',
      title: options.clippingMaskBadgeTitle ?? 'Clipping mask',
    });
  }
  if (layer.alphaLock) {
    badges.push({
      id: 'alpha-lock',
      label: options.alphaLockBadgeLabel ?? 'Alpha',
      title: options.alphaLockBadgeTitle ?? 'Alpha lock',
    });
  }
  return badges;
}

function createRemoveLayerAction(label = 'Remove layer'): TreeViewAction {
  return {
    id: 'remove',
    label,
    icon: createElement('span', { 'aria-hidden': 'true', className: toCodiconClassName('close') }),
    danger: true,
  };
}
