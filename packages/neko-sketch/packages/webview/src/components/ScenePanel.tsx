/**
 * ScenePanel - scene management UI
 *
 * Create/delete scenes, manage layers with parallax settings, and camera controls.
 */
import { useCallback, useState } from 'react';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type {
  SceneLayerType,
  AtmospherePreset,
  AtmosphereConfig,
  SceneObject,
} from '../types/scene';
import { isLightObject } from '../types/scene';
import type { AmbientLightConfig, LightType } from '../types/light';
import { DEFAULT_LIGHT_PROPERTIES } from '../types/light';
import { SCENE_TEMPLATES } from '../data/scene-templates';
import type { LayerData } from '../types';
import { LightPanel } from './LightPanel';

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
  const setAtmosphere = useSketchStore((s) => s.setAtmosphere);
  const updateAmbientLight = useSketchStore((s) => s.updateAmbientLight);
  const toggleLighting = useSketchStore((s) => s.toggleLighting);
  const addSceneObject = useSketchStore((s) => s.addSceneObject);
  const removeSceneObject = useSketchStore((s) => s.removeSceneObject);
  const updateSceneObject = useSketchStore((s) => s.updateSceneObject);
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

          {/* Atmosphere — inline sub-section */}
          <AtmosphereSection
            sceneId={activeScene.id}
            atmosphere={activeScene.atmosphere}
            setAtmosphere={setAtmosphere}
          />

          {/* Lighting — inline sub-section */}
          <LightingSection
            sceneId={activeScene.id}
            lightingEnabled={activeScene.lightingEnabled}
            ambientLight={activeScene.ambientLight}
            sceneLayers={activeScene.layers}
            toggleLighting={toggleLighting}
            updateAmbientLight={updateAmbientLight}
            addSceneLayer={addSceneLayer}
            addSceneObject={addSceneObject}
            removeSceneObject={removeSceneObject}
            updateSceneObject={updateSceneObject}
          />

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

/* ── Atmosphere sub-section (previously a standalone panel) ─────────── */

const ATMOSPHERE_PRESETS: { value: AtmospherePreset; key: string }[] = [
  { value: 'none', key: 'sketch.atmosphere.preset.none' },
  { value: 'fog', key: 'sketch.atmosphere.preset.fog' },
  { value: 'rain', key: 'sketch.atmosphere.preset.rain' },
  { value: 'snow', key: 'sketch.atmosphere.preset.snow' },
  { value: 'fireflies', key: 'sketch.atmosphere.preset.fireflies' },
  { value: 'dust', key: 'sketch.atmosphere.preset.dust' },
];

/* ── Lighting sub-section ─────────────────────────────────── */

interface LightingSectionProps {
  sceneId: string;
  lightingEnabled: boolean;
  ambientLight: AmbientLightConfig;
  sceneLayers: readonly import('../types/scene').SceneLayer[];
  toggleLighting: (sceneId: string) => void;
  updateAmbientLight: (sceneId: string, config: Partial<AmbientLightConfig>) => void;
  addSceneLayer: (sceneId: string, layer: Omit<import('../types/scene').SceneLayer, 'id'>) => void;
  addSceneObject: (sceneId: string, layerId: string, obj: Omit<SceneObject, 'id'>) => void;
  removeSceneObject: (sceneId: string, layerId: string, objectId: string) => void;
  updateSceneObject: (
    sceneId: string,
    layerId: string,
    objectId: string,
    updates: Partial<SceneObject>,
  ) => void;
}

function LightingSection(props: LightingSectionProps) {
  const { t } = useTranslation();
  const {
    sceneId,
    lightingEnabled,
    ambientLight,
    sceneLayers,
    toggleLighting,
    updateAmbientLight,
    addSceneLayer,
    addSceneObject,
    removeSceneObject,
    updateSceneObject,
  } = props;

  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);

  // Collect all light objects across scene layers
  const lightEntries: { layerId: string; light: import('../types/scene').LightSceneObject }[] = [];
  for (const sl of sceneLayers) {
    for (const obj of sl.objects) {
      if (isLightObject(obj)) {
        lightEntries.push({ layerId: sl.id, light: obj });
      }
    }
  }

  const handleAddLight = useCallback(
    (lightType: LightType) => {
      // Ensure at least one scene layer exists for lights
      let targetLayerId: string | undefined;
      if (sceneLayers.length === 0) {
        addSceneLayer(sceneId, {
          name: 'Lights',
          type: 'effect' as import('../types/scene').SceneLayerType,
          zIndex: 0,
          parallaxFactor: [1, 1],
          objects: [],
          visible: true,
          canvasLayerId: null,
        });
        // Get the newly created layer
        const state = useSketchStore.getState();
        const sc = state.scenes.find((s) => s.id === sceneId);
        targetLayerId = sc?.layers[sc.layers.length - 1]?.id;
      } else {
        targetLayerId = sceneLayers[0]?.id;
      }
      if (!targetLayerId) return;

      addSceneObject(sceneId, targetLayerId, {
        type: 'light',
        x: 400,
        y: 300,
        width: 0,
        height: 0,
        rotation: 0,
        properties: { ...DEFAULT_LIGHT_PROPERTIES, lightType },
      });
    },
    [sceneId, sceneLayers, addSceneLayer, addSceneObject],
  );

  const selectedEntry = lightEntries.find((e) => e.light.id === selectedLightId);

  return (
    <div className="mt-1 pt-1" style={{ borderTop: '1px solid var(--sketch-divider)' }}>
      <div className="flex items-center gap-1 mb-1">
        <p className="sketch-panel-title m-0 flex-1">Lighting</p>
        <label className="flex items-center gap-0.5 text-[10px]">
          <input
            type="checkbox"
            checked={lightingEnabled}
            onChange={() => toggleLighting(sceneId)}
          />
          {t('sketch.common.enabled')}
        </label>
      </div>

      {lightingEnabled && (
        <>
          {/* Ambient light */}
          <div className="flex items-center gap-1 text-[10px] mb-0.5">
            <span className="w-14 opacity-60">Ambient</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={ambientLight.intensity}
              onChange={(e) =>
                updateAmbientLight(sceneId, { intensity: parseFloat(e.target.value) })
              }
              className="sketch-slider flex-1"
              aria-label="Ambient intensity"
            />
            <span className="w-8 text-right tabular-nums">{ambientLight.intensity.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] mb-1">
            <span className="w-14 opacity-60">Color</span>
            <input
              type="color"
              value={rgbToHex(ambientLight.color)}
              onChange={(e) => updateAmbientLight(sceneId, { color: hexToRgb(e.target.value) })}
              className="w-6 h-4 p-0 border-0 cursor-pointer"
              aria-label="Ambient color"
            />
          </div>

          {/* Light list */}
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-xs opacity-60 flex-1">Lights</span>
            <button
              className="text-xs px-1 rounded border border-[var(--vscode-button-border)]"
              onClick={() => handleAddLight('point')}
              aria-label="Add point light"
            >
              P
            </button>
            <button
              className="text-xs px-1 rounded border border-[var(--vscode-button-border)]"
              onClick={() => handleAddLight('directional')}
              aria-label="Add directional light"
            >
              D
            </button>
            <button
              className="text-xs px-1 rounded border border-[var(--vscode-button-border)]"
              onClick={() => handleAddLight('spot')}
              aria-label="Add spot light"
            >
              S
            </button>
          </div>

          {lightEntries.map(({ layerId, light }) => (
            <div
              key={light.id}
              className={`flex items-center gap-1 text-[10px] px-1 py-0.5 rounded cursor-pointer ${
                selectedLightId === light.id
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
                  : 'hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
              onClick={() => setSelectedLightId(light.id)}
            >
              <span className="opacity-40">&#9728;</span>
              <span className="flex-1 truncate">{light.properties.lightType}</span>
              <span className="opacity-40 tabular-nums">
                ({Math.round(light.x)}, {Math.round(light.y)})
              </span>
              <button
                className="text-red-400 text-[10px] px-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  removeSceneObject(sceneId, layerId, light.id);
                  if (selectedLightId === light.id) setSelectedLightId(null);
                }}
                aria-label="Remove light"
              >
                ✕
              </button>
            </div>
          ))}

          {/* Light property inspector */}
          {selectedEntry && (
            <LightPanel
              sceneId={sceneId}
              layerId={selectedEntry.layerId}
              light={selectedEntry.light}
              updateSceneObject={updateSceneObject}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ── Color conversion helpers ──────────────────────────────── */

function rgbToHex(color: readonly [number, number, number]): string {
  const r = Math.round(color[0] * 255)
    .toString(16)
    .padStart(2, '0');
  const g = Math.round(color[1] * 255)
    .toString(16)
    .padStart(2, '0');
  const b = Math.round(color[2] * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`;
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b] as const;
}

/* ── Atmosphere sub-section (previously a standalone panel) ─────────── */

function AtmosphereSection(props: {
  sceneId: string;
  atmosphere: AtmosphereConfig;
  setAtmosphere: (id: string, updates: Partial<AtmosphereConfig>) => void;
}) {
  const { t } = useTranslation();
  const { sceneId, atmosphere: atm, setAtmosphere } = props;

  return (
    <div className="mt-1 pt-1" style={{ borderTop: '1px solid var(--sketch-divider)' }}>
      <p className="sketch-panel-title mb-1">{t('sketch.panel.atmosphere')}</p>

      {/* Preset selector */}
      <div className="flex items-center gap-1 text-[10px] mb-0.5">
        <span className="w-14 opacity-60">{t('sketch.atmosphere.preset')}</span>
        <select
          className="sketch-select flex-1 text-[10px]"
          value={atm.preset}
          onChange={(e) => setAtmosphere(sceneId, { preset: e.target.value as AtmospherePreset })}
          aria-label={t('sketch.atmosphere.presetLabel')}
        >
          {ATMOSPHERE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {t(p.key)}
            </option>
          ))}
        </select>
      </div>

      {atm.preset !== 'none' && (
        <>
          {/* Intensity */}
          <div className="flex items-center gap-1 text-[10px] mb-0.5">
            <span className="w-14 opacity-60">{t('sketch.atmosphere.intensity')}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={atm.intensity}
              onChange={(e) => setAtmosphere(sceneId, { intensity: parseFloat(e.target.value) })}
              className="sketch-slider flex-1"
              aria-label={t('sketch.atmosphere.intensity')}
            />
            <span className="w-8 text-right tabular-nums">{atm.intensity.toFixed(2)}</span>
          </div>

          {/* Wind X */}
          <div className="flex items-center gap-1 text-[10px]">
            <span className="w-14 opacity-60">{t('sketch.atmosphere.windX')}</span>
            <input
              type="range"
              min={-100}
              max={100}
              step={5}
              value={atm.wind[0]}
              onChange={(e) =>
                setAtmosphere(sceneId, { wind: [parseFloat(e.target.value), atm.wind[1]] })
              }
              className="sketch-slider flex-1"
              aria-label={t('sketch.atmosphere.windX')}
            />
            <span className="w-8 text-right tabular-nums">{atm.wind[0]}</span>
          </div>
        </>
      )}
    </div>
  );
}
