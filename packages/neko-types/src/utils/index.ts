/**
 * Shared Utilities Index
 *
 * Re-exports all utility functions for convenient imports.
 */

// Animation utilities
export {
  easingFunctions,
  applyEasing,
  cubicBezier,
  getAnimatedValue,
  getComputedTransform,
  hasKeyframes,
} from './animation';

// Color correction mapping (UI ↔ Engine)
export { mapBasicColorToEngine, mapEngineColorToBasic } from './colorCorrectionMapping';

// Media utilities (type detection, MIME mapping)
export {
  getFileExtension,
  detectMediaType,
  getMimeType,
  isMediaFile,
  isImageSequence,
  isSubtitleFile,
  getExtensionsForType,
} from './media';

// Diff utilities (LCS-based line diff, zero dependencies)
export {
  computeDiff,
  computeDiffStats,
  type DiffLine,
  type DiffLineType,
  type DiffStats,
} from './diff';
