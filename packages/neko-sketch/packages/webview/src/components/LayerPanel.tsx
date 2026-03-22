/**
 * LayerPanel - layer list with visibility/lock toggles
 *
 * macOS source-list style: rows use .sketch-item-row for hover/selected states,
 * action buttons use .sketch-icon-button with danger variant for remove.
 */
import { useState, useCallback } from 'react';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import { ContextMenu } from '@neko/shared/components';
import type { MenuItem } from '@neko/shared/components';
import type { LayerData } from '../types';

export function LayerPanel() {
  const { t } = useTranslation();
  const layers              = useSketchStore((s) => s.layers);
  const activeLayerId       = useSketchStore((s) => s.activeLayerId);
  const setActiveLayer      = useSketchStore((s) => s.setActiveLayer);
  const addNewLayer         = useSketchStore((s) => s.addNewLayer);
  const removeLayerById     = useSketchStore((s) => s.removeLayerById);
  const updateLayerProps    = useSketchStore((s) => s.updateLayerProps);
  const duplicateLayerById  = useSketchStore((s) => s.duplicateLayerById);
  const moveLayerTo         = useSketchStore((s) => s.moveLayerTo);
  const show                = useSketchStore((s) => s.showLayerPanel);

  const [layerMenu, setLayerMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const handleLayerContextMenu = useCallback(
    (e: React.MouseEvent, layer: LayerData) => {
      e.preventDefault();
      e.stopPropagation();
      const arrayIndex = layers.findIndex((l) => l.id === layer.id);
      const items: MenuItem[] = [
        {
          label: t('sketch.layer.duplicate'),
          onClick: () => duplicateLayerById(layer.id),
        },
        { separator: true },
        {
          label: t('sketch.layer.moveUp'),
          disabled: arrayIndex >= layers.length - 1,
          onClick: () => moveLayerTo(layer.id, arrayIndex + 1),
        },
        {
          label: t('sketch.layer.moveDown'),
          disabled: arrayIndex <= 0,
          onClick: () => moveLayerTo(layer.id, arrayIndex - 1),
        },
        { separator: true },
        {
          label: t('sketch.layer.mergeDown'),
          disabled: true,
          onClick: () => { /* not implemented */ },
        },
        { separator: true },
        {
          label: t('sketch.layer.delete'),
          danger: true,
          onClick: () => removeLayerById(layer.id),
        },
      ];
      setLayerMenu({ x: e.clientX, y: e.clientY, items });
    },
    [layers, t, duplicateLayerById, moveLayerTo, removeLayerById],
  );

  if (!show) return null;

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.layers')}>
      {/* Header */}
      <div className="sketch-panel-header">
        <h3 className="sketch-panel-title">{t('sketch.panel.layers')}</h3>
        <button
          aria-label={t('sketch.layer.add')}
          className="sketch-icon-button"
          onClick={() => addNewLayer()}
          title={t('sketch.layer.add')}
        >
          <PlusIcon />
        </button>
      </div>

      {/* Layer list */}
      <div className="flex flex-col gap-0.5">
        {[...layers].reverse().map((layer) => (
          <LayerItem
            key={layer.id}
            layer={layer}
            isActive={layer.id === activeLayerId}
            onSelect={() => setActiveLayer(layer.id)}
            onToggleVisible={() => updateLayerProps(layer.id, { visible: !layer.visible })}
            onToggleLock={() => updateLayerProps(layer.id, { locked: !layer.locked })}
            onRemove={() => removeLayerById(layer.id)}
            onContextMenu={(e) => handleLayerContextMenu(e, layer)}
          />
        ))}
      </div>

      {layerMenu && (
        <ContextMenu
          x={layerMenu.x}
          y={layerMenu.y}
          items={layerMenu.items}
          onClose={() => setLayerMenu(null)}
        />
      )}
    </div>
  );
}

function LayerItem(props: {
  layer: LayerData;
  isActive: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onRemove: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  const { layer, isActive, onSelect, onToggleVisible, onToggleLock, onRemove, onContextMenu } = props;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={isActive}
      className={`sketch-item-row${isActive ? ' active' : ''}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect();
      }}
    >
      {/* Visibility */}
      <button
        aria-label={layer.visible ? t('sketch.layer.hide') : t('sketch.layer.show')}
        className="sketch-icon-button"
        style={{ opacity: layer.visible ? 1 : 0.35 }}
        onClick={(e) => { e.stopPropagation(); onToggleVisible(); }}
        title={layer.visible ? t('sketch.layer.hide') : t('sketch.layer.show')}
      >
        {layer.visible ? <EyeOnIcon /> : <EyeOffIcon />}
      </button>

      {/* Lock */}
      <button
        aria-label={layer.locked ? t('sketch.layer.unlock') : t('sketch.layer.lock')}
        className="sketch-icon-button"
        style={{ opacity: layer.locked ? 1 : 0.35 }}
        onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
        title={layer.locked ? t('sketch.layer.unlock') : t('sketch.layer.lock')}
      >
        {layer.locked ? <LockClosedIcon /> : <LockOpenIcon />}
      </button>

      {/* Name */}
      <span
        className="flex-1 truncate text-xs"
        style={{
          color: isActive
            ? 'var(--sketch-text-primary)'
            : 'var(--sketch-text-secondary)',
          fontWeight: isActive ? 500 : 400,
        }}
      >
        {layer.name}
      </span>

      {/* Remove */}
      <button
        aria-label={t('sketch.layer.remove')}
        className="sketch-icon-button danger"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title={t('sketch.layer.remove')}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────── */

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M6 2v8M2 6h8" />
    </svg>
  );
}

function EyeOnIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6.5C2.5 3.5 5 2 6.5 2s4 1.5 5.5 4.5C10.5 9.5 8 11 6.5 11S2.5 9.5 1 6.5z" />
      <circle cx="6.5" cy="6.5" r="1.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2l9 9" />
      <path d="M5 3.5C5.6 3.2 6 3 6.5 3c1.5 0 3.5 1.5 5 3.5-.5.8-1.1 1.5-1.8 2" />
      <path d="M9.5 9.8C8.5 10.5 7.5 11 6.5 11c-1.5 0-3.5-1.5-5-4 .5-.9 1.2-1.7 2-2.3" />
    </svg>
  );
}

function LockClosedIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="8" height="6" rx="1" />
      <path d="M4 5V4a2 2 0 014 0v1" />
    </svg>
  );
}

function LockOpenIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="8" height="6" rx="1" />
      <path d="M4 5V4a2 2 0 014 0" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 2l6 6M8 2L2 8" />
    </svg>
  );
}
