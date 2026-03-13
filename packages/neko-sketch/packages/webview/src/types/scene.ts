/**
 * Scene system types
 *
 * Defines scene structure with layers, objects, camera, and atmosphere.
 */

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
}

export const DEFAULT_CAMERA: CameraConfig = {
  x: 0,
  y: 0,
  zoom: 1,
  bounds: null,
};
