/**
 * Light system types
 *
 * Defines light source properties, ambient light configuration,
 * and type guards for the 2D lighting system.
 */

// ─── Light Types ───

export type LightType = 'point' | 'directional' | 'spot';

export interface LightProperties {
  /** Light source type */
  readonly lightType: LightType;
  /** Light color RGB [0-1] */
  readonly color: readonly [number, number, number];
  /** Light intensity [0-10] */
  readonly intensity: number;
  /** Attenuation radius in pixels, point / spot only */
  readonly radius: number;
  /** Simulated Z-axis height, affects normal-map lighting angle [0-500] */
  readonly height: number;
  /** Direction angle in radians, directional / spot only */
  readonly direction: number;
  /** Spotlight cone angle in radians, spot only */
  readonly coneAngle: number;
  /** Spotlight edge softness [0-1], spot only */
  readonly coneSoftness: number;
  /** Per-light ambient component [0-1] */
  readonly ambient: number;
}

// ─── Ambient Light ───

export interface AmbientLightConfig {
  readonly color: readonly [number, number, number];
  /** Global ambient intensity [0-1], default 0.3 */
  readonly intensity: number;
}

// ─── Defaults ───

export const DEFAULT_AMBIENT_LIGHT: AmbientLightConfig = {
  color: [1, 1, 1],
  intensity: 0.3,
};

export const DEFAULT_LIGHT_PROPERTIES: LightProperties = {
  lightType: 'point',
  color: [1, 1, 1],
  intensity: 1.0,
  radius: 300,
  height: 200,
  direction: 0,
  coneAngle: Math.PI / 4,
  coneSoftness: 0.3,
  ambient: 0,
};
