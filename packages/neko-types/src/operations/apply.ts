// =============================================================================
// applyOperation — 操作应用入口
// =============================================================================

import type { ProjectData } from '../types/project';
import type { EditOperation, ClipboardPasteOperation, ProjectUpdateOperation, BatchOperation } from './types';
import { applyTrackOperation } from './apply-track';
import { applyElementOperation, applyElementSplitOperation } from './apply-element';
import { applyShapeOperation } from './apply-shape';
import { applyKeyframeOperation } from './apply-keyframe';
import { updateTrackInProject } from './helpers';
import { OperationError } from './errors';

/**
 * 将 EditOperation 应用到 ProjectData，返回新的 ProjectData（不可变）
 *
 * @throws OperationError 当目标不存在或操作无效时
 */
export function applyOperation(project: ProjectData, op: EditOperation): ProjectData {
  switch (op.type) {
    // Track operations
    case 'track.add':
    case 'track.remove':
    case 'track.update':
    case 'track.reorder':
    case 'track.toggle':
      return applyTrackOperation(project, op);

    // Element operations
    case 'element.add':
    case 'element.remove':
    case 'element.update':
    case 'element.move':
    case 'element.toggle':
    case 'element.linkAudio':
    case 'element.unlinkAudio':
      return applyElementOperation(project, op);

    // Element split operations
    case 'element.splitAt':
    case 'element.splitKeepLeft':
    case 'element.splitKeepRight':
      return applyElementSplitOperation(project, op);

    // Shape operations
    case 'shape.addElement':
    case 'shape.add':
    case 'shape.remove':
    case 'shape.duplicate':
    case 'shape.update':
    case 'shape.updateGeometry':
    case 'shape.updateStyle':
    case 'shape.toggle':
    case 'shape.reorder':
      return applyShapeOperation(project, op);

    // Keyframe operations
    case 'keyframe.add':
    case 'keyframe.remove':
    case 'keyframe.update':
      return applyKeyframeOperation(project, op);

    // Clipboard paste
    case 'clipboard.paste':
      return applyClipboardPaste(project, op);

    // Project update
    case 'project.update':
      return applyProjectUpdate(project, op);

    // Batch
    case 'batch':
      return applyBatch(project, op);

    default:
      throw OperationError.invalidOperation(`Unknown operation type: ${(op as any).type}`);
  }
}

function applyClipboardPaste(project: ProjectData, op: ClipboardPasteOperation): ProjectData {
  let result = project;
  for (const item of op.payload.items) {
    // 如果需要创建新 track
    if (item.newTrack) {
      result = { ...result, tracks: [...result.tracks, item.newTrack] };
    }
    // 添加元素到 track
    result = updateTrackInProject(result, item.trackId, track => ({
      ...track,
      elements: [...track.elements, item.element],
    }));
  }
  return result;
}

function applyProjectUpdate(project: ProjectData, op: ProjectUpdateOperation): ProjectData {
  return { ...project, ...op.payload.updates };
}

function applyBatch(project: ProjectData, op: BatchOperation): ProjectData {
  return op.payload.operations.reduce(
    (proj, childOp) => applyOperation(proj, childOp),
    project,
  );
}
