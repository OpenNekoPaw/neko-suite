/**
 * Scene Slice - scene editing state
 *
 * Manages scenes, layers, objects, camera, and atmosphere configuration.
 */
import type { StateCreator } from 'zustand';
import type {
  Scene,
  SceneLayer,
  SceneObject,
  CameraConfig,
  AtmosphereConfig,
} from '../../types/scene';
import { DEFAULT_CAMERA, DEFAULT_ATMOSPHERE } from '../../types/scene';

let sceneCounter = 0;
let layerCounter = 0;
let objectCounter = 0;

export interface SceneSlice {
  // ── State ──
  scenes: Scene[];
  activeSceneId: string | null;

  // ── Actions ──
  createScene: (name: string) => void;
  deleteScene: (id: string) => void;
  setActiveScene: (id: string | null) => void;
  addSceneLayer: (sceneId: string, layer: Omit<SceneLayer, 'id'>) => void;
  removeSceneLayer: (sceneId: string, layerId: string) => void;
  updateSceneLayer: (sceneId: string, layerId: string, updates: Partial<SceneLayer>) => void;
  addSceneObject: (sceneId: string, layerId: string, obj: Omit<SceneObject, 'id'>) => void;
  removeSceneObject: (sceneId: string, layerId: string, objectId: string) => void;
  updateCamera: (sceneId: string, camera: Partial<CameraConfig>) => void;
  setAtmosphere: (sceneId: string, atmosphere: Partial<AtmosphereConfig>) => void;
  clearScenes: () => void;
}

export const createSceneSlice: StateCreator<SceneSlice> = (set) => ({
  scenes: [],
  activeSceneId: null,

  createScene: (name) => {
    const id = `scene-${++sceneCounter}-${Date.now()}`;
    const scene: Scene = {
      id,
      name,
      layers: [],
      camera: DEFAULT_CAMERA,
      atmosphere: DEFAULT_ATMOSPHERE,
    };
    set((s) => ({
      scenes: [...s.scenes, scene],
      activeSceneId: s.activeSceneId ?? id,
    }));
  },

  deleteScene: (id) =>
    set((s) => {
      const filtered = s.scenes.filter((sc) => sc.id !== id);
      return {
        scenes: filtered,
        activeSceneId: s.activeSceneId === id ? (filtered[0]?.id ?? null) : s.activeSceneId,
      };
    }),

  setActiveScene: (id) => set({ activeSceneId: id }),

  addSceneLayer: (sceneId, layerData) => {
    const id = `slayer-${++layerCounter}-${Date.now()}`;
    const layer: SceneLayer = { ...layerData, id } as SceneLayer;
    set((s) => ({
      scenes: s.scenes.map((sc) =>
        sc.id === sceneId ? { ...sc, layers: [...sc.layers, layer] } : sc,
      ),
    }));
  },

  removeSceneLayer: (sceneId, layerId) =>
    set((s) => ({
      scenes: s.scenes.map((sc) =>
        sc.id === sceneId ? { ...sc, layers: sc.layers.filter((l) => l.id !== layerId) } : sc,
      ),
    })),

  updateSceneLayer: (sceneId, layerId, updates) =>
    set((s) => ({
      scenes: s.scenes.map((sc) =>
        sc.id === sceneId
          ? {
              ...sc,
              layers: sc.layers.map((l) => (l.id === layerId ? { ...l, ...updates } : l)),
            }
          : sc,
      ),
    })),

  addSceneObject: (sceneId, layerId, objData) => {
    const id = `sobj-${++objectCounter}-${Date.now()}`;
    const obj: SceneObject = { ...objData, id } as SceneObject;
    set((s) => ({
      scenes: s.scenes.map((sc) =>
        sc.id === sceneId
          ? {
              ...sc,
              layers: sc.layers.map((l) =>
                l.id === layerId ? { ...l, objects: [...l.objects, obj] } : l,
              ),
            }
          : sc,
      ),
    }));
  },

  removeSceneObject: (sceneId, layerId, objectId) =>
    set((s) => ({
      scenes: s.scenes.map((sc) =>
        sc.id === sceneId
          ? {
              ...sc,
              layers: sc.layers.map((l) =>
                l.id === layerId
                  ? { ...l, objects: l.objects.filter((o) => o.id !== objectId) }
                  : l,
              ),
            }
          : sc,
      ),
    })),

  updateCamera: (sceneId, camera) =>
    set((s) => ({
      scenes: s.scenes.map((sc) =>
        sc.id === sceneId ? { ...sc, camera: { ...sc.camera, ...camera } } : sc,
      ),
    })),

  setAtmosphere: (sceneId, atmosphere) =>
    set((s) => ({
      scenes: s.scenes.map((sc) =>
        sc.id === sceneId ? { ...sc, atmosphere: { ...sc.atmosphere, ...atmosphere } } : sc,
      ),
    })),

  clearScenes: () => set({ scenes: [], activeSceneId: null }),
});
