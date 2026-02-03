/**
 * Shape Operations Slice
 * 管理形状图层的增删改操作
 *
 * 职责:
 * - 形状实例 CRUD (add, update, remove, duplicate)
 * - 形状属性操作 (style, visibility, locking)
 * - 形状排序 (z-index)
 * - 形状变换 (transform)
 */

import { StateCreator } from 'zustand';
import type { ProjectData, ShapeElement, TimelineTrack } from '../../types';
import type {
  Shape,
  ShapeInstance,
  ShapeStyle,
  ShapeType,
} from '../../types/shape';
import {
  createShapeInstance,
  cloneShapeInstance,
  createRectangleShape,
  createEllipseShape,
  createPolygonShape,
  createStarShape,
  createLineShape,
  createBezierShape,
  createDefaultShapeStyle,
} from '../../types/shape';
import { generateId } from '../../utils';

// =============================================================================
// 依赖接口
// =============================================================================

interface ProjectDependency {
  project: ProjectData | null;
}

interface HistoryDependency {
  pushHistory: (project: ProjectData) => void;
}

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 根据形状类型创建默认形状
 */
function createShapeByType(shapeType: ShapeType): Shape {
  switch (shapeType) {
    case 'rectangle':
      return createRectangleShape();
    case 'ellipse':
      return createEllipseShape();
    case 'polygon':
      return createPolygonShape(6); // 六边形
    case 'star':
      return createStarShape();
    case 'line':
      return createLineShape();
    case 'bezier':
      return createBezierShape();
    default:
      return createRectangleShape();
  }
}

/**
 * 查找包含指定形状的元素和轨道
 */
function findShapeLocation(
  project: ProjectData,
  shapeId: string
): { track: TimelineTrack; element: ShapeElement; shapeIndex: number } | null {
  for (const track of project.tracks) {
    if (track.type !== 'shape') continue;

    for (const element of track.elements) {
      // Type guard for ShapeElement
      if (!('shapes' in element)) continue;

      const shapeElement = element as unknown as ShapeElement;
      const shapeIndex = shapeElement.shapes.findIndex((s) => s.id === shapeId);
      if (shapeIndex !== -1) {
        return { track, element: shapeElement, shapeIndex };
      }
    }
  }
  return null;
}

/**
 * 查找形状元素
 */
function findShapeElement(
  project: ProjectData,
  trackId: string,
  elementId: string
): ShapeElement | null {
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track || track.type !== 'shape') return null;

  const element = track.elements.find((e) => e.id === elementId);
  if (!element || !('shapes' in element)) return null;

  return element as unknown as ShapeElement;
}

// =============================================================================
// Slice 接口
// =============================================================================

export interface ShapeOpsSlice {
  // 形状元素操作
  /** 添加形状元素到轨道 */
  addShapeElement: (
    trackId: string,
    startTime?: number,
    duration?: number
  ) => string;

  // 形状实例操作
  /** 添加形状到元素 */
  addShape: (
    trackId: string,
    elementId: string,
    shapeType: ShapeType,
    name?: string
  ) => string;
  /** 删除形状 */
  removeShape: (trackId: string, elementId: string, shapeId: string) => void;
  /** 复制形状 */
  duplicateShape: (
    trackId: string,
    elementId: string,
    shapeId: string
  ) => string | null;
  /** 更新形状属性 */
  updateShape: (
    trackId: string,
    elementId: string,
    shapeId: string,
    updates: Partial<ShapeInstance>
  ) => void;
  /** 更新形状几何 */
  updateShapeGeometry: (
    trackId: string,
    elementId: string,
    shapeId: string,
    shape: Partial<Shape>
  ) => void;
  /** 更新形状样式 */
  updateShapeStyle: (
    trackId: string,
    elementId: string,
    shapeId: string,
    style: Partial<ShapeStyle>
  ) => void;

  // 形状可见性和锁定
  /** 切换形状可见性 */
  toggleShapeVisibility: (
    trackId: string,
    elementId: string,
    shapeId: string
  ) => void;
  /** 切换形状锁定状态 */
  toggleShapeLocked: (
    trackId: string,
    elementId: string,
    shapeId: string
  ) => void;

  // 形状排序
  /** 移动形状到指定层级 */
  moveShapeToIndex: (
    trackId: string,
    elementId: string,
    shapeId: string,
    newIndex: number
  ) => void;
  /** 上移形状 */
  moveShapeUp: (trackId: string, elementId: string, shapeId: string) => void;
  /** 下移形状 */
  moveShapeDown: (trackId: string, elementId: string, shapeId: string) => void;
  /** 移到顶层 */
  moveShapeToTop: (trackId: string, elementId: string, shapeId: string) => void;
  /** 移到底层 */
  moveShapeToBottom: (
    trackId: string,
    elementId: string,
    shapeId: string
  ) => void;

  // 快捷操作
  /** 通过形状ID查找并更新 */
  updateShapeById: (shapeId: string, updates: Partial<ShapeInstance>) => void;
  /** 通过形状ID删除 */
  removeShapeById: (shapeId: string) => void;
}

// =============================================================================
// Slice 创建器
// =============================================================================

export const createShapeOpsSlice: StateCreator<
  ShapeOpsSlice & ProjectDependency & HistoryDependency,
  [],
  [],
  ShapeOpsSlice
> = (set, get) => ({
  addShapeElement: (trackId, startTime = 0, duration = 5) => {
    const { project, pushHistory } = get();
    if (!project) return '';

    pushHistory(project);

    const elementId = generateId();
    const shapeElement: ShapeElement = {
      id: elementId,
      type: 'shape',
      name: 'Shape Layer',
      startTime,
      duration,
      trimStart: 0,
      trimEnd: 0,
      shapes: [],
    };

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                elements: [...t.elements, shapeElement as unknown as TimelineTrack['elements'][0]],
              }
            : t
        ),
      },
    });

    return elementId;
  },

  addShape: (trackId, elementId, shapeType, name) => {
    const { project, pushHistory } = get();
    if (!project) return '';

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return '';

    pushHistory(project);

    const shape = createShapeByType(shapeType);
    const shapeInstance = createShapeInstance(
      shape,
      name || `${shapeType.charAt(0).toUpperCase() + shapeType.slice(1)}`,
      createDefaultShapeStyle()
    );

    // 设置 zIndex 为当前最高层级 + 1
    const maxZIndex = shapeElement.shapes.reduce(
      (max, s) => Math.max(max, s.zIndex),
      -1
    );
    shapeInstance.zIndex = maxZIndex + 1;

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                elements: t.elements.map((e) =>
                  e.id === elementId && 'shapes' in e
                    ? {
                        ...e,
                        shapes: [...(e as unknown as ShapeElement).shapes, shapeInstance],
                      }
                    : e
                ),
              }
            : t
        ),
      },
    });

    return shapeInstance.id;
  },

  removeShape: (trackId, elementId, shapeId) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    pushHistory(project);

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                elements: t.elements.map((e) =>
                  e.id === elementId && 'shapes' in e
                    ? {
                        ...e,
                        shapes: (e as unknown as ShapeElement).shapes.filter(
                          (s) => s.id !== shapeId
                        ),
                      }
                    : e
                ),
              }
            : t
        ),
      },
    });
  },

  duplicateShape: (trackId, elementId, shapeId) => {
    const { project, pushHistory } = get();
    if (!project) return null;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return null;

    const originalShape = shapeElement.shapes.find((s) => s.id === shapeId);
    if (!originalShape) return null;

    pushHistory(project);

    const clonedShape = cloneShapeInstance(originalShape);
    clonedShape.name = `${originalShape.name} (Copy)`;
    // 偏移位置
    if ('centerX' in clonedShape.shape) {
      (clonedShape.shape as { centerX: number }).centerX += 5;
      (clonedShape.shape as { centerY: number }).centerY += 5;
    }

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                elements: t.elements.map((e) =>
                  e.id === elementId && 'shapes' in e
                    ? {
                        ...e,
                        shapes: [...(e as unknown as ShapeElement).shapes, clonedShape],
                      }
                    : e
                ),
              }
            : t
        ),
      },
    });

    return clonedShape.id;
  },

  updateShape: (trackId, elementId, shapeId, updates) => {
    const { project, pushHistory } = get();
    if (!project) return;

    pushHistory(project);

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                elements: t.elements.map((e) =>
                  e.id === elementId && 'shapes' in e
                    ? {
                        ...e,
                        shapes: (e as unknown as ShapeElement).shapes.map((s) =>
                          s.id === shapeId ? { ...s, ...updates } : s
                        ),
                      }
                    : e
                ),
              }
            : t
        ),
      },
    });
  },

  updateShapeGeometry: (trackId, elementId, shapeId, shapeUpdates) => {
    const { project, pushHistory } = get();
    if (!project) return;

    pushHistory(project);

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                elements: t.elements.map((e) =>
                  e.id === elementId && 'shapes' in e
                    ? {
                        ...e,
                        shapes: (e as unknown as ShapeElement).shapes.map((s) =>
                          s.id === shapeId
                            ? { ...s, shape: { ...s.shape, ...shapeUpdates } as Shape }
                            : s
                        ),
                      }
                    : e
                ),
              }
            : t
        ),
      },
    });
  },

  updateShapeStyle: (trackId, elementId, shapeId, styleUpdates) => {
    const { project, pushHistory } = get();
    if (!project) return;

    pushHistory(project);

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                elements: t.elements.map((e) =>
                  e.id === elementId && 'shapes' in e
                    ? {
                        ...e,
                        shapes: (e as unknown as ShapeElement).shapes.map((s) =>
                          s.id === shapeId
                            ? {
                                ...s,
                                style: {
                                  ...s.style,
                                  ...styleUpdates,
                                  fill: styleUpdates.fill
                                    ? { ...s.style.fill, ...styleUpdates.fill }
                                    : s.style.fill,
                                  stroke: styleUpdates.stroke
                                    ? { ...s.style.stroke, ...styleUpdates.stroke }
                                    : s.style.stroke,
                                  shadow: styleUpdates.shadow
                                    ? { ...s.style.shadow, ...styleUpdates.shadow }
                                    : s.style.shadow,
                                },
                              }
                            : s
                        ),
                      }
                    : e
                ),
              }
            : t
        ),
      },
    });
  },

  toggleShapeVisibility: (trackId, elementId, shapeId) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    const shape = shapeElement.shapes.find((s) => s.id === shapeId);
    if (!shape) return;

    pushHistory(project);

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                elements: t.elements.map((e) =>
                  e.id === elementId && 'shapes' in e
                    ? {
                        ...e,
                        shapes: (e as unknown as ShapeElement).shapes.map((s) =>
                          s.id === shapeId ? { ...s, visible: !s.visible } : s
                        ),
                      }
                    : e
                ),
              }
            : t
        ),
      },
    });
  },

  toggleShapeLocked: (trackId, elementId, shapeId) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    const shape = shapeElement.shapes.find((s) => s.id === shapeId);
    if (!shape) return;

    pushHistory(project);

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                elements: t.elements.map((e) =>
                  e.id === elementId && 'shapes' in e
                    ? {
                        ...e,
                        shapes: (e as unknown as ShapeElement).shapes.map((s) =>
                          s.id === shapeId ? { ...s, locked: !s.locked } : s
                        ),
                      }
                    : e
                ),
              }
            : t
        ),
      },
    });
  },

  moveShapeToIndex: (trackId, elementId, shapeId, newIndex) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    const currentIndex = shapeElement.shapes.findIndex((s) => s.id === shapeId);
    if (currentIndex === -1 || currentIndex === newIndex) return;

    pushHistory(project);

    const shapes = [...shapeElement.shapes];
    const [movedShape] = shapes.splice(currentIndex, 1);
    shapes.splice(newIndex, 0, movedShape);

    // 更新所有形状的 zIndex
    const updatedShapes = shapes.map((s, i) => ({ ...s, zIndex: i }));

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                elements: t.elements.map((e) =>
                  e.id === elementId && 'shapes' in e
                    ? { ...e, shapes: updatedShapes }
                    : e
                ),
              }
            : t
        ),
      },
    });
  },

  moveShapeUp: (trackId, elementId, shapeId) => {
    const { project } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    const currentIndex = shapeElement.shapes.findIndex((s) => s.id === shapeId);
    if (currentIndex === -1 || currentIndex >= shapeElement.shapes.length - 1) return;

    get().moveShapeToIndex(trackId, elementId, shapeId, currentIndex + 1);
  },

  moveShapeDown: (trackId, elementId, shapeId) => {
    const { project } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    const currentIndex = shapeElement.shapes.findIndex((s) => s.id === shapeId);
    if (currentIndex <= 0) return;

    get().moveShapeToIndex(trackId, elementId, shapeId, currentIndex - 1);
  },

  moveShapeToTop: (trackId, elementId, shapeId) => {
    const { project } = get();
    if (!project) return;

    const shapeElement = findShapeElement(project, trackId, elementId);
    if (!shapeElement) return;

    get().moveShapeToIndex(
      trackId,
      elementId,
      shapeId,
      shapeElement.shapes.length - 1
    );
  },

  moveShapeToBottom: (trackId, elementId, shapeId) => {
    get().moveShapeToIndex(trackId, elementId, shapeId, 0);
  },

  updateShapeById: (shapeId, updates) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const location = findShapeLocation(project, shapeId);
    if (!location) return;

    pushHistory(project);

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === location.track.id
            ? {
                ...t,
                elements: t.elements.map((e) =>
                  e.id === location.element.id && 'shapes' in e
                    ? {
                        ...e,
                        shapes: (e as unknown as ShapeElement).shapes.map((s) =>
                          s.id === shapeId ? { ...s, ...updates } : s
                        ),
                      }
                    : e
                ),
              }
            : t
        ),
      },
    });
  },

  removeShapeById: (shapeId) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const location = findShapeLocation(project, shapeId);
    if (!location) return;

    pushHistory(project);

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === location.track.id
            ? {
                ...t,
                elements: t.elements.map((e) =>
                  e.id === location.element.id && 'shapes' in e
                    ? {
                        ...e,
                        shapes: (e as unknown as ShapeElement).shapes.filter(
                          (s) => s.id !== shapeId
                        ),
                      }
                    : e
                ),
              }
            : t
        ),
      },
    });
  },
});
