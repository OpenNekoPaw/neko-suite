/**
 * Filter Preset Types
 *
 * Defines the data model for saveable filter presets ("Looks") and LUT import.
 * Presets encapsulate a stack of filters with parameters, applicable to
 * documents, layers, or adjustment layers.
 */
import type { AppliedFilter } from './filter';

// ─── Filter Preset (Look) ───

export interface FilterPreset {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  /** Ordered filter stack with parameter overrides */
  readonly filters: readonly AppliedFilter[];
  /** Thumbnail preview (base64 PNG, optional) */
  readonly thumbnail?: string;
  /** Creation timestamp */
  readonly createdAt: number;
}

// ─── LUT (Look-Up Table) ───

export type LUTFormat = 'cube' | 'png';

export interface LUTAsset {
  readonly id: string;
  readonly name: string;
  readonly format: LUTFormat;
  /** For .cube: raw text content; for .png: base64 PNG data */
  readonly data: string;
  /** 3D LUT dimension (typically 16, 32, or 64) */
  readonly size: number;
}

// ─── Filter Scope ───

/** Where a filter stack is applied */
export type FilterScope =
  | { type: 'document' }
  | { type: 'layer'; layerId: string }
  | { type: 'adjustment'; layerId: string };

// ─── Preset Library ───

export interface FilterPresetLibrary {
  readonly presets: readonly FilterPreset[];
  readonly luts: readonly LUTAsset[];
}

// ─── Default Presets ───

export const BUILTIN_PRESETS: readonly FilterPreset[] = [
  {
    id: 'warm-sunset',
    name: 'Warm Sunset',
    category: 'color',
    filters: [
      { id: 'p1', filterId: 'temperature', params: { u_temperature: 0.4 }, enabled: true },
      { id: 'p2', filterId: 'exposure', params: { u_exposure: 0.2 }, enabled: true },
      { id: 'p3', filterId: 'vignette', params: { u_radius: 0.6, u_softness: 0.4 }, enabled: true },
    ],
    createdAt: 0,
  },
  {
    id: 'cool-blue',
    name: 'Cool Blue',
    category: 'color',
    filters: [
      { id: 'p1', filterId: 'temperature', params: { u_temperature: -0.3 }, enabled: true },
      {
        id: 'p2',
        filterId: 'brightness-contrast',
        params: { u_brightness: -0.05, u_contrast: 0.15 },
        enabled: true,
      },
    ],
    createdAt: 0,
  },
  {
    id: 'vintage-film',
    name: 'Vintage Film',
    category: 'stylize',
    filters: [
      {
        id: 'p1',
        filterId: 'hue-saturation',
        params: { u_hue: 0, u_saturation: -0.3, u_lightness: 0 },
        enabled: true,
      },
      { id: 'p2', filterId: 'film-grain', params: { u_amount: 0.12 }, enabled: true },
      { id: 'p3', filterId: 'vignette', params: { u_radius: 0.5, u_softness: 0.5 }, enabled: true },
    ],
    createdAt: 0,
  },
  {
    id: 'high-contrast-bw',
    name: 'High Contrast B&W',
    category: 'color',
    filters: [
      {
        id: 'p1',
        filterId: 'hue-saturation',
        params: { u_hue: 0, u_saturation: -1.0, u_lightness: 0 },
        enabled: true,
      },
      {
        id: 'p2',
        filterId: 'brightness-contrast',
        params: { u_brightness: 0, u_contrast: 0.5 },
        enabled: true,
      },
    ],
    createdAt: 0,
  },
];
