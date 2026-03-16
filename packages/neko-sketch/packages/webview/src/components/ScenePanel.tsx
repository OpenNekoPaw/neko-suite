/**
 * ScenePanel - scene management UI
 *
 * Create/delete scenes, manage layers with parallax settings, and camera controls.
 */
import { useCallback } from 'react';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { SceneLayerType } from '../types/scene';
import { SCENE_TEMPLATES } from '../data/scene-templates';
import type { LayerData } from '../types';

export function ScenePanel() {
  const { t } = useTranslation();
  const scenes = useSketchStore((s) => s.scenes);
  const activeSceneId = useSketchStore((s) => s.activeSceneId);
  const createScene = useSketchStore((s) => s.createScene);
  const deleteScene = useSketchStore((s) => s.deleteScene);
  const setActiveScene = useSketchStore((s) => s.setActiveScene);
  const addSceneLayer = useSketchStore((s) => s.addSceneLayer);
  const removeSceneLayer = useSketchStore((s) => s.removeSceneLayer);
  const updateSceneLayer = useSketchStore((s) => s.updateSceneLayer);
  const updateCamera = useSketchStore((s) => s.updateCamera);
  const canvasLayers: readonly LayerData[] = useSketchStore((s) => s.layers);

  const activeScene = scenes.find((s) => s.id === activeSceneId);

  const handleCreate = useCallback(() => {
    createScene(t('sketch.scene.defaultName', { index: scenes.length + 1 }));
  }, [createScene, scenes.length, t]);

  const handleCreateFromTemplate = useCallback(
    (templateId: string) => {
      const tpl = SCENE_TEMPLATES.find((tp) => tp.id === templateId);
      if (!tpl) return;
      createScene(t(tpl.nameKey));
      // Add template layers to the newly created scene
      const state = useSketchStore.getState();
      const newScene = state.scenes[state.scenes.length - 1];
      if (!newScene) return;
      for (const layer of tpl.layers) {
        addSceneLayer(newScene.id, { ...layer, name: t(layer.nameKey), canvasLayerId: null });
      }
    },
    [createScene, addSceneLayer, t],
  );

  const handleAddLayer = useCallback(() => {
    if (!activeSceneId) return;
    const count = activeScene?.layers.length ?? 0;
    addSceneLayer(activeSceneId, {
      name: t('sketch.scene.defaultLayerName', { index: count + 1 }),
      type: 'parallax' as SceneLayerType,
      zIndex: count,
      parallaxFactor: [1, 1],
      objects: [],
      visible: true,
      canvasLayerId: null,
    });
  }, [activeSceneId, activeScene, addSceneLayer, t]);

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.scene')}>
      <h3 className="sketch-panel-title m-0 mb-1">{t('sketch.panel.scene')}</h3>

      {/* Scene selector */}
      <div className="flex items-center gap-1 mb-1">
        <select
          className="flex-1 text-xs bg-transparent border border-[var(--vscode-input-border)] rounded px-1 py-0.5"
          value={activeSceneId ?? ''}
          onChange={(e) => setActiveScene(e.target.value || null)}
          aria-label={t('sketch.scene.activeScene')}
        >
          <option value="" disabled>
            {t('sketch.scene.selectScene')}
          </option>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          className="text-xs px-1.5 py-0.5 rounded border border-[var(--vscode-button-border)]"
          onClick={handleCreate}
          title={t('sketch.scene.newScene')}
          aria-label={t('sketch.scene.createScene')}
        >
          +
        </button>
      </div>

      {/* Templates */}
      {scenes.length === 0 && (
        <div className="mb-1">
          <p className="text-[10px] opacity-50 m-0 mb-0.5">{t('sketch.scene.useTemplate')}</p>
          {SCENE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              className="block w-full text-left text-xs py-0.5 px-1 rounded hover:bg-[var(--vscode-list-hoverBackground)]"
              onClick={() => handleCreateFromTemplate(tpl.id)}
            >
              {t(tpl.nameKey)}
            </button>
          ))}
        </div>
      )}

      {/* Active scene details */}
      {activeScene && (
        <>
          {/* Camera controls */}
          <div className="text-[10px] mb-1">
            <div className="flex items-center gap-1">
              <span className="opacity-60 w-10">{t('sketch.scene.zoom')}</span>
              <input
                type="range"
                min={0.1}
                max={5}
                step={0.1}
                value={activeScene.camera.zoom}
                onChange={(e) => updateCamera(activeScene.id, { zoom: parseFloat(e.target.value) })}
                className="flex-1 h-3"
                aria-label={t('sketch.scene.cameraZoom')}
              />
              <span className="w-8 text-right tabular-nums">
                {activeScene.camera.zoom.toFixed(1)}x
              </span>
            </div>
          </div>

          {/* Layers */}
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-xs opacity-60 flex-1">{t('sketch.scene.layers')}</span>
            <button
              className="text-xs px-1 rounded border border-[var(--vscode-button-border)]"
              onClick={handleAddLayer}
              aria-label={t('sketch.scene.addLayer')}
            >
              +
            </button>
          </div>

          {activeScene.layers.map((layer) => (
            <div
              key={layer.id}
              className="flex flex-col gap-0.5 text-[10px] mb-0.5 px-1 py-0.5 rounded border border-[var(--vscode-input-border)]"
            >
              <div className="flex items-center gap-1">
                <span className="flex-1 truncate">{layer.name}</span>
                <button
                  className="text-red-400 text-[10px] px-0.5"
                  onClick={() => removeSceneLayer(activeScene.id, layer.id)}
                  aria-label={t('sketch.scene.removeLayer', { name: layer.name })}
                >
                  ✕
                </button>
              </div>
              {/* Canvas layer binding */}
              <div className="flex items-center gap-1">
                <span className="opacity-60 w-10">{t('sketch.scene.canvasLayer')}</span>
                <select
                  className="flex-1 text-[10px] bg-transparent border border-[var(--vscode-input-border)] rounded px-0.5"
                  value={layer.canvasLayerId ?? ''}
                  onChange={(e) =>
                    updateSceneLayer(activeScene.id, layer.id, {
                      canvasLayerId: e.target.value || null,
                    })
                  }
                  aria-label={`${layer.name} ${t('sketch.scene.canvasLayer')}`}
                >
                  <option value="">{t('sketch.scene.canvasLayerNone')}</option>
                  {canvasLayers.map((cl) => (
                    <option key={cl.id} value={cl.id}>
                      {cl.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* Parallax factor */}
              <div className="flex items-center gap-1">
                <span className="opacity-40 text-[9px]">
                  {layer.parallaxFactor[0].toFixed(1)}/{layer.parallaxFactor[1].toFixed(1)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={layer.parallaxFactor[0]}
                  onChange={(e) =>
                    updateSceneLayer(activeScene.id, layer.id, {
                      parallaxFactor: [parseFloat(e.target.value), layer.parallaxFactor[1]],
                    })
                  }
                  className="flex-1 h-2"
                  title={t('sketch.scene.parallaxX')}
                  aria-label={`${layer.name} ${t('sketch.scene.parallaxX')}`}
                />
              </div>
            </div>
          ))}

          {/* Delete scene */}
          <button
            className="mt-1 text-xs text-red-400 hover:text-red-300"
            onClick={() => deleteScene(activeScene.id)}
          >
            {t('sketch.scene.deleteScene')}
          </button>
        </>
      )}
    </div>
  );
}
