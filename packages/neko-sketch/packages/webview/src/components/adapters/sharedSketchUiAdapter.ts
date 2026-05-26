import type {
  PropertyDefinition,
  PropertyGroupDefinition,
  PropertyOption,
  PropertyValue,
  TreeViewAction,
  TreeViewBadge,
  TreeViewItem,
} from '@neko/ui/creative';
import { toCodiconClassName } from '@neko/ui/icons';
import { createElement } from 'react';
import type {
  BrushSettings,
  BrushType,
  LayerData,
  SymmetryConfig,
  SymmetryMode,
  TextureStampAsset,
  TextureStampPattern,
} from '../../types';
import { TEXTURE_STAMP_PATTERNS, getTextureStampPatternLabelKey } from '../../brush/texture-stamp';

export interface SketchBrushAdapterOptions {
  readonly activeTool: string;
  readonly brushSettings: BrushSettings;
  readonly symmetry: SymmetryConfig;
  readonly textureStampAssets: readonly TextureStampAsset[];
  readonly translate: (key: string, params?: Record<string, string | number>) => string;
}

export interface SketchBrushAdapterResult {
  readonly properties: readonly PropertyDefinition[];
  readonly groups: readonly PropertyGroupDefinition[];
}

export type SketchBrushPropertyId =
  | 'brush.type'
  | 'brush.size'
  | 'brush.opacity'
  | 'brush.hardness'
  | 'brush.stampTexture'
  | 'brush.spacing'
  | 'brush.color'
  | 'symmetry.mode';

export interface SketchBrushPropertyPatch {
  readonly brushType?: BrushType;
  readonly brushSettings?: Partial<BrushSettings>;
  readonly brushSize?: number;
  readonly brushOpacity?: number;
  readonly brushColor?: string;
  readonly symmetry?: Partial<SymmetryConfig>;
}

export function mapSketchBrushToProperties({
  activeTool,
  brushSettings,
  symmetry,
  textureStampAssets,
  translate,
}: SketchBrushAdapterOptions): SketchBrushAdapterResult {
  const isEraser = activeTool === 'eraser';
  const isStamp = brushSettings.type === 'stamp';
  const properties: PropertyDefinition[] = [];
  const brushPropertyIds: SketchBrushPropertyId[] = [];

  const pushBrushProperty = (
    property: PropertyDefinition & { id: SketchBrushPropertyId },
  ): void => {
    properties.push(property);
    brushPropertyIds.push(property.id);
  };

  if (!isEraser) {
    pushBrushProperty({
      id: 'brush.type',
      kind: 'select',
      label: translate('sketch.brush.type'),
      value: brushSettings.type,
      options: BRUSH_TYPE_OPTIONS.map((option) => ({
        value: option.type,
        label: translate(option.key),
      })),
    });
  }

  pushBrushProperty({
    id: 'brush.size',
    kind: 'slider',
    label: translate('sketch.brush.size', { size: brushSettings.size }),
    value: brushSettings.size,
    min: 1,
    max: 500,
    step: 1,
    unit: 'px',
  });

  pushBrushProperty({
    id: 'brush.opacity',
    kind: 'slider',
    label: translate('sketch.brush.opacity', {
      opacity: Math.round(brushSettings.opacity * 100),
    }),
    value: Math.round(brushSettings.opacity * 100),
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
  });

  if (!isEraser) {
    pushBrushProperty({
      id: 'brush.hardness',
      kind: 'slider',
      label: translate('sketch.brush.hardness', {
        hardness: Math.round(brushSettings.hardness * 100),
      }),
      value: Math.round(brushSettings.hardness * 100),
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
    });
  }

  if (!isEraser && isStamp) {
    pushBrushProperty({
      id: 'brush.stampTexture',
      kind: 'select',
      label: translate('sketch.brush.stampPattern'),
      value: getStampTextureValue(brushSettings),
      options: createStampTextureOptions(textureStampAssets, translate),
    });
    pushBrushProperty({
      id: 'brush.spacing',
      kind: 'slider',
      label: translate('sketch.brush.spacing', {
        spacing: Math.round((brushSettings.spacing ?? 0.65) * 100),
      }),
      value: Math.round((brushSettings.spacing ?? 0.65) * 100),
      min: 10,
      max: 200,
      step: 5,
      unit: '%',
    });
  }

  if (!isEraser) {
    pushBrushProperty({
      id: 'symmetry.mode',
      kind: 'select',
      label: 'Symmetry',
      value: symmetry.mode,
      options: SYMMETRY_OPTIONS,
    });
    pushBrushProperty({
      id: 'brush.color',
      kind: 'color',
      label: translate('sketch.color.brushColor'),
      value: brushSettings.color,
    });
  }

  return {
    properties,
    groups: [
      {
        id: isEraser ? 'eraser' : 'brush',
        label: isEraser ? translate('sketch.tool.eraser') : translate('sketch.panel.brush'),
        propertyIds: brushPropertyIds,
      },
    ],
  };
}

export function mapSketchBrushPropertyCommit(
  id: string,
  value: PropertyValue,
): SketchBrushPropertyPatch {
  switch (id as SketchBrushPropertyId) {
    case 'brush.type':
      return typeof value === 'string' ? { brushType: value as BrushType } : {};
    case 'brush.size':
      return typeof value === 'number' ? { brushSize: value } : {};
    case 'brush.opacity':
      return typeof value === 'number' ? { brushOpacity: value / 100 } : {};
    case 'brush.hardness':
      return typeof value === 'number' ? { brushSettings: { hardness: value / 100 } } : {};
    case 'brush.stampTexture':
      return typeof value === 'string' ? mapStampTextureValueToPatch(value) : {};
    case 'brush.spacing':
      return typeof value === 'number' ? { brushSettings: { spacing: value / 100 } } : {};
    case 'symmetry.mode':
      return typeof value === 'string' ? { symmetry: { mode: value as SymmetryMode } } : {};
    case 'brush.color':
      return typeof value === 'string' ? { brushColor: value } : {};
    default:
      return {};
  }
}

export function mapSketchLayersToTreeViewItems(
  layers: readonly LayerData[],
  activeLayerId: string | null,
): readonly TreeViewItem[] {
  return [...layers].reverse().map((layer) => mapSketchLayerToTreeViewItem(layer, activeLayerId));
}

export function getLayerIndex(layers: readonly LayerData[], layerId: string): number {
  return layers.findIndex((layer) => layer.id === layerId);
}

function mapSketchLayerToTreeViewItem(
  layer: LayerData,
  activeLayerId: string | null,
): TreeViewItem {
  return {
    id: layer.id,
    label: layer.name,
    children: layer.children.map((child) => mapSketchLayerToTreeViewItem(child, activeLayerId)),
    expanded: true,
    selected: layer.id === activeLayerId,
    visible: layer.visible,
    locked: layer.locked,
    badges: createLayerBadges(layer),
    actions: [REMOVE_LAYER_ACTION],
    metadata: {
      type: layer.type,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      clippingMask: layer.clippingMask,
      alphaLock: layer.alphaLock,
    },
  };
}

function createLayerBadges(layer: LayerData): readonly TreeViewBadge[] {
  const badges: TreeViewBadge[] = [];
  if (layer.type === 'adjustment') {
    badges.push({ id: 'adjustment', label: 'ADJ' });
  }
  if (layer.clippingMask) {
    badges.push({ id: 'clipping-mask', label: 'Clip', title: 'Clipping mask' });
  }
  if (layer.alphaLock) {
    badges.push({ id: 'alpha-lock', label: 'Alpha', title: 'Alpha lock' });
  }
  return badges;
}

function getStampTextureValue(brushSettings: BrushSettings): string {
  return brushSettings.stampAssetId
    ? `asset:${brushSettings.stampAssetId}`
    : `builtin:${brushSettings.stampPattern ?? 'grain'}`;
}

function createStampTextureOptions(
  textureStampAssets: readonly TextureStampAsset[],
  translate: SketchBrushAdapterOptions['translate'],
): readonly PropertyOption[] {
  return [
    ...TEXTURE_STAMP_PATTERNS.map((pattern) => ({
      value: `builtin:${pattern}`,
      label: translate(getTextureStampPatternLabelKey(pattern)),
    })),
    ...textureStampAssets.map((asset) => ({
      value: `asset:${asset.id}`,
      label: asset.name,
    })),
  ];
}

function mapStampTextureValueToPatch(value: string): SketchBrushPropertyPatch {
  if (value.startsWith('asset:')) {
    return { brushSettings: { stampAssetId: value.slice('asset:'.length) } };
  }
  return {
    brushSettings: {
      stampAssetId: null,
      stampPattern: value.slice('builtin:'.length) as TextureStampPattern,
    },
  };
}

const BRUSH_TYPE_OPTIONS: readonly { type: BrushType; key: string }[] = [
  { type: 'pencil', key: 'sketch.brush.pencil' },
  { type: 'pen', key: 'sketch.brush.pen' },
  { type: 'watercolor', key: 'sketch.brush.watercolor' },
  { type: 'airbrush', key: 'sketch.brush.airbrush' },
  { type: 'marker', key: 'sketch.brush.marker' },
  { type: 'pixel', key: 'sketch.brush.pixel' },
  { type: 'stamp', key: 'sketch.brush.stamp' },
];

const SYMMETRY_OPTIONS: readonly PropertyOption[] = [
  { value: 'none', label: 'Off' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'both', label: 'Both' },
  { value: 'radial', label: 'Radial' },
];

const REMOVE_LAYER_ACTION: TreeViewAction = {
  id: 'remove',
  label: 'Remove layer',
  icon: createElement('span', { 'aria-hidden': 'true', className: toCodiconClassName('close') }),
  danger: true,
};
