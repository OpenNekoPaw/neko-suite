/**
 * Scene system types
 *
 * Defines scene structure with layers, objects, camera, and atmosphere.
 */
import type { LightProperties, AmbientLightConfig } from './light';
import { DEFAULT_AMBIENT_LIGHT } from './light';

// ─── Scene Objects ───

export type SceneObjectType = 'sprite' | 'emitter' | 'light' | 'trigger';

export interface SceneObject {
  readonly id: string;
  readonly type: SceneObjectType;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly properties: Record<string, unknown>;
}

/** Strongly-typed light scene object */
export interface LightSceneObject {
  readonly id: string;
  readonly type: 'light';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly properties: LightProperties;
}

/** Type guard for light scene objects */
export function isLightObject(obj: SceneObject): obj is SceneObject & LightSceneObject {
  return obj.type === 'light';
}

// ─── Scene Layers ───

export type SceneLayerType = 'sprite' | 'tilemap' | 'parallax' | 'effect';

export interface SceneLayer {
  readonly id: string;
  readonly name: string;
  readonly type: SceneLayerType;
  readonly zIndex: number;
  readonly parallaxFactor: readonly [number, number];
  readonly objects: readonly SceneObject[];
  readonly visible: boolean;
  /** Links this scene layer to a canvas LayerData by id for parallax rendering */
  readonly canvasLayerId: string | null;
}

// ─── Camera ───

export interface CameraBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface CameraConfig {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly bounds: CameraBounds | null;
}

// ─── Atmosphere ───

export type AtmospherePreset = 'none' | 'fog' | 'rain' | 'snow' | 'fireflies' | 'dust';

export interface AtmosphereConfig {
  readonly preset: AtmospherePreset;
  readonly intensity: number;
  readonly color: readonly [number, number, number, number];
  readonly wind: readonly [number, number];
}

export const DEFAULT_ATMOSPHERE: AtmosphereConfig = {
  preset: 'none',
  intensity: 0.5,
  color: [1, 1, 1, 0.3],
  wind: [10, 0],
};

// ─── Scene ───

export interface Scene {
  readonly id: string;
  readonly name: string;
  readonly layers: readonly SceneLayer[];
  readonly camera: CameraConfig;
  readonly atmosphere: AtmosphereConfig;
  /** Global ambient light configuration */
  readonly ambientLight: AmbientLightConfig;
  /** Whether the lighting system is active for this scene */
  readonly lightingEnabled: boolean;
}

export { DEFAULT_AMBIENT_LIGHT };

export const DEFAULT_CAMERA: CameraConfig = {
  x: 0,
  y: 0,
  zoom: 1,
  bounds: null,
};
