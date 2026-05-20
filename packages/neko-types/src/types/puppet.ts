// =============================================================================
// Puppet Project Types — .nkp file format
//
// Lightweight JSON wrapper referencing an external .moc3 file or a Live2D
// bundle-backed source. Legacy .inp references remain readable for compatibility.
// Stores parameter overrides and viewport state.
// =============================================================================

import type { BundleEntryLocator } from './bundle-locator';

/** Supported puppet binary formats */
export type PuppetFormat = 'inp' | 'moc3';

export interface NkpLive2dBundleReference {
  /** Path to the source ZIP, stored as relative path or ${VAR}/path. */
  path: string;
  /** Entry locator for the model3.json manifest. */
  manifest: BundleEntryLocator;
  /** Entry locator for the referenced .moc3 file. */
  moc: BundleEntryLocator;
  /** Bundle content hash when available. */
  contentHash?: string;
}

export interface NkpBundleMotionIndexEntry {
  name: string;
  group: string;
  locator: BundleEntryLocator;
  fadeInTime?: number;
  fadeOutTime?: number;
}

export interface NkpBundleExpressionIndexEntry {
  name: string;
  locator: BundleEntryLocator;
}

export interface NkpBundleTextureIndexEntry {
  index: number;
  locator: BundleEntryLocator;
  name?: string;
}

export interface PuppetExternalTextureData {
  /** MOC3 texture slot index used by mesh `texture_index` values. */
  readonly index: number;
  /** Base64-encoded PNG bytes, optionally as a `data:image/png;base64,...` URL. */
  readonly data: string;
  /** Runtime texture channel currently supports Live2D PNG textures. */
  readonly mimeType?: 'image/png';
  /** Optional user/model-facing texture name from model3.json. */
  readonly name?: string;
  /** Optional metadata locator; renderers must consume `data`, not this path. */
  readonly locator?: BundleEntryLocator;
}

export interface PuppetAuxiliaryJsonData {
  /** Expression tuples passed to the engine as `[name, exp3Json]`. */
  readonly expressions?: readonly (readonly [string, string])[];
  /** Motion tuples passed to the engine as `[name, motion3Json]`. */
  readonly motions?: readonly (readonly [string, string])[];
  /** Optional physics3.json content. */
  readonly physics?: string;
}

export interface NkpBundleIndex {
  storageMode: 'bundle-memory';
  manifest: BundleEntryLocator;
  moc: BundleEntryLocator;
  textures: readonly NkpBundleTextureIndexEntry[];
  motions: readonly NkpBundleMotionIndexEntry[];
  expressions: readonly NkpBundleExpressionIndexEntry[];
  physics?: BundleEntryLocator;
  parameterIds?: readonly string[];
  generatedAt?: string;
}

/** .nkp project data */
export interface NkpProjectData {
  version: string;
  name: string;
  puppet: {
    src: string | null;
    /** Binary format (auto-detected from file extension if omitted) */
    format?: PuppetFormat;
    /** Live2D ZIP bundle source when the model is loaded from bundle memory. */
    bundle?: NkpLive2dBundleReference;
  };
  /** Lightweight index for search/discovery without reparsing ZIP bytes. */
  bundleIndex?: NkpBundleIndex;
  parameters: Record<string, number>;
  /** Standard face parameter values (subset matching PUPPET_FACE_PARAMETERS) */
  faceParameters?: Record<string, number>;
  viewport: { zoom: number };
}
