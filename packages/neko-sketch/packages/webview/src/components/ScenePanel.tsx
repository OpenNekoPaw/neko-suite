/**
 * ScenePanel - scene management UI
 *
 * Create/delete scenes, manage layers with parallax settings, and camera controls.
 */
import { useCallback } from 'react';
import { useSketchStore } from '../stores';
import type { SceneLayerType } from '../types/scene';
import { SCENE_TEMPLATES } from '../data/scene-templates';

export function ScenePanel() {
  const scenes = useSketchStore((s) => s.scenes);
  const activeSceneId = useSketchStore((s) => s.activeSceneId);
  const createScene = useSketchStore((s) => s.createScene);
  const deleteScene = useSketchStore((s) => s.deleteScene);
  const setActiveScene = useSketchStore((s) => s.setActiveScene);
  const addSceneLayer = useSketchStore((s) => s.addSceneLayer);
  const removeSceneLayer = useSketchStore((s) => s.removeSceneLayer);
  const updateSceneLayer = useSketchStore((s) => s.updateSceneLayer);
  const updateCamera = useSketchStore((s) => s.updateCamera);

  const activeScene = scenes.find((s) => s.id === activeSceneId);

  const handleCreate = useCallback(() => {
    createScene(`Scene ${scenes.length + 1}`);
  }, [createScene, scenes.length]);

  const handleCreateFromTemplate = useCallback(
    (templateId: string) => {
      const tpl = SCENE_TEMPLATES.find((t) => t.id === templateId);
      if (!tpl) return;
      createScene(tpl.name);
      // Add template layers to the newly created scene
      const state = useSketchStore.getState();
      const newScene = state.scenes[state.scenes.length - 1];
      if (!newScene) return;
      for (const layer of tpl.layers) {
        addSceneLayer(newScene.id, layer);
      }
    },
    [createScene, addSceneLayer],
  );

  const handleAddLayer = useCallback(() => {
    if (!activeSceneId) return;
    const count = activeScene?.layers.length ?? 0;
    addSceneLayer(activeSceneId, {
      name: `Layer ${count + 1}`,
      type: 'parallax' as SceneLayerType,
      zIndex: count,
      parallaxFactor: [1, 1],
      objects: [],
      visible: true,
    });
  }, [activeSceneId, activeScene, addSceneLayer]);

  return (
    <div className="sketch-panel" role="region" aria-label="Scene">
      <h3 className="sketch-panel-title m-0 mb-1">Scene</h3>

      {/* Scene selector */}
      <div className="flex items-center gap-1 mb-1">
        <select
          className="flex-1 text-xs bg-transparent border border-[var(--vscode-input-border)] rounded px-1 py-0.5"
          value={activeSceneId ?? ''}
          onChange={(e) => setActiveScene(e.target.value || null)}
          aria-label="Active scene"
        >
          <option value="" disabled>
            Select scene...
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
          title="New scene"
          aria-label="Create scene"
        >
          +
        </button>
      </div>

      {/* Templates */}
      {scenes.length === 0 && (
        <div className="mb-1">
          <p className="text-[10px] opacity-50 m-0 mb-0.5">Or use a template:</p>
          {SCENE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              className="block w-full text-left text-xs py-0.5 px-1 rounded hover:bg-[var(--vscode-list-hoverBackground)]"
              onClick={() => handleCreateFromTemplate(tpl.id)}
            >
              {tpl.name}
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
              <span className="opacity-60 w-10">Zoom</span>
              <input
                type="range"
                min={0.1}
                max={5}
                step={0.1}
                value={activeScene.camera.zoom}
                onChange={(e) => updateCamera(activeScene.id, { zoom: parseFloat(e.target.value) })}
                className="flex-1 h-3"
                aria-label="Camera zoom"
              />
              <span className="w-8 text-right tabular-nums">
                {activeScene.camera.zoom.toFixed(1)}x
              </span>
            </div>
          </div>

          {/* Layers */}
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-xs opacity-60 flex-1">Layers</span>
            <button
              className="text-xs px-1 rounded border border-[var(--vscode-button-border)]"
              onClick={handleAddLayer}
              aria-label="Add scene layer"
            >
              +
            </button>
          </div>

          {activeScene.layers.map((layer) => (
            <div
              key={layer.id}
              className="flex items-center gap-1 text-[10px] mb-0.5 px-1 py-0.5 rounded border border-[var(--vscode-input-border)]"
            >
              <span className="flex-1 truncate">{layer.name}</span>
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
                className="w-12 h-2"
                title="Parallax X"
                aria-label={`${layer.name} parallax X`}
              />
              <button
                className="text-red-400 text-[10px] px-0.5"
                onClick={() => removeSceneLayer(activeScene.id, layer.id)}
                aria-label={`Remove ${layer.name}`}
              >
                ✕
              </button>
            </div>
          ))}

          {/* Delete scene */}
          <button
            className="mt-1 text-xs text-red-400 hover:text-red-300"
            onClick={() => deleteScene(activeScene.id)}
          >
            Delete scene
          </button>
        </>
      )}
    </div>
  );
}
