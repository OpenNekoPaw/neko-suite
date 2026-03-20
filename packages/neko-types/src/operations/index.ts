// =============================================================================
// Operations — 统一导出
// =============================================================================

export * from './types';
export * from './errors';
export { applyOperation } from './apply';
export { invertOperation } from './invert';
export { applyCanvasOperation } from './apply-canvas';
export { applySketchOperation, type SketchDocumentData } from './apply-sketch';
export { applyAudioOperation, type AudioProjectData } from './apply-audio';
export {
  findTrack,
  findElement,
  findShape,
  updateTrackInProject,
  updateElementInProject,
  updateShapeInProject,
  getShapes,
  setShapes,
  pickKeys,
  arrayMove,
  createMeta,
  type HasTracks,
} from './helpers';
