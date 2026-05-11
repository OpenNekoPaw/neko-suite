/**
 * Shared Utilities Index
 *
 * Re-exports all utility functions for convenient imports.
 */

// Color correction mapping (UI ↔ Engine)
export { mapBasicColorToEngine, mapEngineColorToBasic } from './colorCorrectionMapping';

// Media utilities (type detection, MIME mapping)
export {
  getFileExtension,
  detectMediaType,
  getMimeType,
  isMediaFile,
  isDocumentFile,
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

export {
  applyCanvasTimelineSyncToCanvas,
  buildStoryboardImportTimelineSyncPayload,
} from './canvasTimelineSync';
export {
  extractCanvasNodeGenerationLineage,
  type CanvasGenerationLineage,
} from './canvasGeneration';
export {
  buildEntityAssetRequirementsFromGeneratedMediaLineage,
  buildVisualIdentityDraftsFromGeneratedMediaLineage,
  type BuildEntityAssetRequirementsFromGeneratedMediaInput,
  type BuildVisualIdentityDraftsFromGeneratedMediaInput,
} from './creativeEntityLineage';
export {
  getContainerChildIds,
  getContainerChildReferences,
  getContainerPolicyName,
  getLegacyContainerChildIds,
  getNodeParentId,
  getNodeParentReferences,
  isContainerNode,
  type CanvasContainerChildReference,
  type CanvasContainerChildSource,
  type CanvasParentReference,
  type CanvasParentReferenceSource,
} from './canvasLayered';
export {
  isJsonPointerPath,
  parseJsonPointer,
  readFieldBinding,
  readJsonPointer,
  writeFieldBinding,
  writeJsonPointer,
  type FieldBindingReadResult,
  type FieldBindingWriteResult,
} from './fieldBinding';
export { createStoryboardPayload, applyStoryboardPayloadToCanvas } from './storyboardPlanner';
export {
  createCanvasStoryboardExecutionSummary,
  type CreateCanvasStoryboardExecutionSummaryInput,
} from './storyboardExecutionSummary';
