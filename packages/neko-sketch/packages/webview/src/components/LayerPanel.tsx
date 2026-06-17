/**
 * LayerPanel - layer list with visibility/lock toggles.
 *
 * Domain layer operations stay in Sketch; row rendering and interaction chrome
 * use @neko/ui TreeView and primitives.
 */
import type React from 'react';
import { useMemo, useState } from 'react';
import { TreeView } from '@neko/ui/creative';
import type { ContextMenuItem } from '@neko/ui/primitives';
import { Button, ContextMenu, IconButton, Popover } from '@neko/ui/primitives';
import { toCodiconClassName, type CodiconName } from '@neko/ui/icons';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { LayerData } from '../types';
import { canMergeLayerPixels } from '../tools/layer-merge-tool';
import { getLayerIndex, mapSketchLayersToTreeViewItems } from './adapters/sharedSketchUiAdapter';

/** Adjustment layer types that map to FilterRegistry IDs */
const ADJUSTMENT_TYPES = [
  { id: 'brightness-contrast', labelKey: 'sketch.layer.adjustment.brightnessContrast' },
  { id: 'hue-saturation', labelKey: 'sketch.layer.adjustment.hueSaturation' },
  { id: 'exposure', labelKey: 'sketch.layer.adjustment.exposure' },
  { id: 'temperature', labelKey: 'sketch.layer.adjustment.temperature' },
] as const;

export function LayerPanel() {
  const { t } = useTranslation();
  const layers = useSketchStore((s) => s.layers);
  const activeLayerId = useSketchStore((s) => s.activeLayerId);
  const setActiveLayer = useSketchStore((s) => s.setActiveLayer);
  const addNewLayer = useSketchStore((s) => s.addNewLayer);
  const addVectorLayer = useSketchStore((s) => s.addVectorLayer);
  const addBackgroundLayer = useSketchStore((s) => s.addBackgroundLayer);
  const removeLayerById = useSketchStore((s) => s.removeLayerById);
  const updateLayerProps = useSketchStore((s) => s.updateLayerProps);
  const duplicateLayerById = useSketchStore((s) => s.duplicateLayerById);
  const moveLayerTo = useSketchStore((s) => s.moveLayerTo);
  const addAdjustmentLayer = useSketchStore((s) => s.addAdjustmentLayer);
  const requestMergeLayerDown = useSketchStore((s) => s.requestMergeLayerDown);
  const show = useSketchStore((s) => s.showLayerPanel);
  const [showAdjustmentMenu, setShowAdjustmentMenu] = useState(false);
  const [focusedLayerId, setFocusedLayerId] = useState<string | undefined>(
    activeLayerId ?? undefined,
  );

  const treeItems = useMemo(
    () =>
      mapSketchLayersToTreeViewItems(layers, activeLayerId, {
        removeLabel: t('sketch.layer.remove'),
        adjustmentBadgeLabel: t('sketch.layer.badge.adjustment'),
        adjustmentBadgeTitle: t('sketch.layer.badge.adjustmentTitle'),
        clippingMaskBadgeLabel: t('sketch.layer.badge.clippingMask'),
        clippingMaskBadgeTitle: t('sketch.layer.badge.clippingMaskTitle'),
        alphaLockBadgeLabel: t('sketch.layer.badge.alphaLock'),
        alphaLockBadgeTitle: t('sketch.layer.badge.alphaLockTitle'),
      }),
    [activeLayerId, layers, t],
  );

  if (!show) return null;

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.layers')}>
      <div className="sketch-panel-header">
        <h3 className="sketch-panel-title">{t('sketch.panel.layers')}</h3>
        <div className="relative flex gap-0.5">
          <IconButton
            icon={<Codicon name="add" />}
            label={t('sketch.layer.add')}
            onClick={() => addNewLayer()}
            size="xs"
            variant="ghost"
          />
          <IconButton
            icon={<Codicon name="symbol-structure" />}
            label={t('sketch.layer.addVector')}
            onClick={() => addVectorLayer()}
            size="xs"
            variant="ghost"
          />
          <IconButton
            icon={<Codicon name="symbol-color" />}
            label={t('sketch.layer.addBackground')}
            onClick={() => addBackgroundLayer()}
            size="xs"
            variant="ghost"
          />
          <Popover
            align="end"
            open={showAdjustmentMenu}
            onOpenChange={setShowAdjustmentMenu}
            trigger={
              <IconButton
                icon={<Codicon name="settings" />}
                label={t('sketch.layer.addAdjustment')}
                size="xs"
                variant="ghost"
              />
            }
          >
            <div className="grid gap-1">
              {ADJUSTMENT_TYPES.map((adjustment) => (
                <Button
                  key={adjustment.id}
                  className="justify-start"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    addAdjustmentLayer(adjustment.id, {});
                    setShowAdjustmentMenu(false);
                  }}
                >
                  {t(adjustment.labelKey)}
                </Button>
              ))}
            </div>
          </Popover>
        </div>
      </div>

      <ContextMenu
        items={createLayerContextMenuItems({
          activeLayerId,
          duplicateLayerById,
          layers,
          moveLayerTo,
          removeLayerById,
          requestMergeLayerDown,
          t,
          updateLayerProps,
        })}
        trigger={
          <TreeView
            className="border-0 bg-transparent"
            height={260}
            items={treeItems}
            label={t('sketch.panel.layers')}
            lockLabels={{ lock: t('sketch.layer.lock'), unlock: t('sketch.layer.unlock') }}
            focusedId={focusedLayerId}
            selectedIds={activeLayerId ? [activeLayerId] : []}
            visibilityLabels={{ hide: t('sketch.layer.hide'), show: t('sketch.layer.show') }}
            onAction={(layerId, actionId) => {
              if (actionId === 'remove') {
                removeLayerById(layerId);
              }
            }}
            onContextMenu={(layerId, event) => {
              event.preventDefault();
              setActiveLayer(layerId);
              setFocusedLayerId(layerId);
            }}
            onFocusItem={setFocusedLayerId}
            onSelect={(layerId) => {
              setActiveLayer(layerId);
              setFocusedLayerId(layerId);
            }}
            onToggleLock={(layerId, locked) => updateLayerProps(layerId, { locked })}
            onToggleVisibility={(layerId, visible) => updateLayerProps(layerId, { visible })}
          />
        }
      />
    </div>
  );
}

function createLayerContextMenuItems({
  activeLayerId,
  duplicateLayerById,
  layers,
  moveLayerTo,
  removeLayerById,
  requestMergeLayerDown,
  t,
  updateLayerProps,
}: {
  readonly activeLayerId: string | null;
  readonly duplicateLayerById: (id: string) => void;
  readonly layers: readonly LayerData[];
  readonly moveLayerTo: (id: string, index: number) => void;
  readonly removeLayerById: (id: string) => void;
  readonly requestMergeLayerDown: (id: string) => void;
  readonly t: (key: string) => string;
  readonly updateLayerProps: (id: string, updates: Partial<LayerData>) => void;
}): readonly ContextMenuItem[] {
  const layer = activeLayerId ? findLayerById(layers, activeLayerId) : null;
  const arrayIndex = activeLayerId ? getLayerIndex(layers, activeLayerId) : -1;
  const belowLayer = arrayIndex > 0 ? layers[arrayIndex - 1] : undefined;
  const disabled = !layer || arrayIndex < 0;

  return [
    {
      id: 'duplicate',
      label: t('sketch.layer.duplicate'),
      disabled,
      onSelect: () => {
        if (activeLayerId) duplicateLayerById(activeLayerId);
      },
    },
    { id: 'separator-move', type: 'separator' },
    {
      id: 'move-up',
      label: t('sketch.layer.moveUp'),
      disabled: disabled || arrayIndex >= layers.length - 1,
      onSelect: () => {
        if (activeLayerId) moveLayerTo(activeLayerId, arrayIndex + 1);
      },
    },
    {
      id: 'move-down',
      label: t('sketch.layer.moveDown'),
      disabled: disabled || arrayIndex <= 0,
      onSelect: () => {
        if (activeLayerId) moveLayerTo(activeLayerId, arrayIndex - 1);
      },
    },
    { id: 'separator-merge', type: 'separator' },
    {
      id: 'merge-down',
      label: t('sketch.layer.mergeDown'),
      disabled: disabled || !canMergeLayerPixels(layer, belowLayer),
      onSelect: () => {
        if (activeLayerId) requestMergeLayerDown(activeLayerId);
      },
    },
    { id: 'separator-mask', type: 'separator' },
    {
      id: 'clipping-mask',
      label: layer?.clippingMask
        ? t('sketch.layer.releaseClippingMask')
        : t('sketch.layer.createClippingMask'),
      disabled,
      onSelect: () => {
        if (layer) updateLayerProps(layer.id, { clippingMask: !layer.clippingMask });
      },
    },
    {
      id: 'alpha-lock',
      label: layer?.alphaLock ? t('sketch.layer.unlockAlpha') : t('sketch.layer.lockAlpha'),
      disabled,
      onSelect: () => {
        if (layer) updateLayerProps(layer.id, { alphaLock: !layer.alphaLock });
      },
    },
    { id: 'separator-delete', type: 'separator' },
    {
      id: 'delete',
      label: t('sketch.layer.delete'),
      danger: true,
      disabled,
      onSelect: () => {
        if (activeLayerId) removeLayerById(activeLayerId);
      },
    },
  ];
}

function Codicon({ name }: { readonly name: CodiconName }): React.ReactElement {
  return <span aria-hidden="true" className={toCodiconClassName(name)} />;
}

function findLayerById(layers: readonly LayerData[], layerId: string): LayerData | null {
  for (const layer of layers) {
    if (layer.id === layerId) return layer;
    const child = findLayerById(layer.children, layerId);
    if (child) return child;
  }
  return null;
}
