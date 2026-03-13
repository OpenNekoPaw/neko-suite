/**
 * LayerPanel - layer list with visibility/lock toggles
 */
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { LayerData } from '../types';

export function LayerPanel() {
  const { t } = useTranslation();
  const layers = useSketchStore((s) => s.layers);
  const activeLayerId = useSketchStore((s) => s.activeLayerId);
  const setActiveLayer = useSketchStore((s) => s.setActiveLayer);
  const addNewLayer = useSketchStore((s) => s.addNewLayer);
  const removeLayerById = useSketchStore((s) => s.removeLayerById);
  const updateLayerProps = useSketchStore((s) => s.updateLayerProps);
  const show = useSketchStore((s) => s.showLayerPanel);

  if (!show) return null;

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.layers')}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="sketch-panel-title m-0">{t('sketch.panel.layers')}</h3>
        <button
          aria-label={t('sketch.layer.add')}
          className="text-xs px-1"
          onClick={() => addNewLayer()}
        >
          +
        </button>
      </div>

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
          />
        ))}
      </div>
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
}) {
  const { t } = useTranslation();
  const { layer, isActive, onSelect, onToggleVisible, onToggleLock, onRemove } = props;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={isActive}
      className={`flex items-center gap-1 px-1 py-0.5 text-xs rounded cursor-pointer ${
        isActive ? 'bg-[var(--vscode-list-activeSelectionBackground)]' : ''
      }`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect();
      }}
    >
      <button
        aria-label={layer.visible ? t('sketch.layer.hide') : t('sketch.layer.show')}
        className="opacity-60 hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisible();
        }}
      >
        {layer.visible ? 'V' : '-'}
      </button>
      <button
        aria-label={layer.locked ? t('sketch.layer.unlock') : t('sketch.layer.lock')}
        className="opacity-60 hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onToggleLock();
        }}
      >
        {layer.locked ? 'L' : 'U'}
      </button>
      <span className="flex-1 truncate">{layer.name}</span>
      <button
        aria-label={t('sketch.layer.remove')}
        className="opacity-40 hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        x
      </button>
    </div>
  );
}
