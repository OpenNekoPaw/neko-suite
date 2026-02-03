/**
 * Element Split Slice
 * 管理元素分割操作
 *
 * 从 ElementOpsSlice 拆分出来，专注于分割相关操作
 * 依赖: Project, History, Playback, ElementOps
 */

import { StateCreator } from 'zustand';
import type { ProjectData, TimelineElement } from '../../types';

// =============================================================================
// 依赖接口
// =============================================================================

interface ProjectDependency {
  project: ProjectData | null;
}

interface HistoryDependency {
  pushHistory: (project: ProjectData) => void;
}

interface PlaybackDependency {
  currentTime: number;
}

interface ElementOpsDependency {
  updateElement: (trackId: string, elementId: string, updates: Partial<TimelineElement>) => void;
  addElement: (trackId: string, element: Omit<TimelineElement, 'id'>) => string;
}

// =============================================================================
// Slice 接口
// =============================================================================

export interface ElementSplitSlice {
  /** 在播放头位置分割元素，生成两个元素 */
  splitAtPlayhead: (trackId: string, elementId: string) => void;
  /** 在播放头位置分割，只保留左侧部分 */
  splitAndKeepLeft: (trackId: string, elementId: string) => void;
  /** 在播放头位置分割，只保留右侧部分 */
  splitAndKeepRight: (trackId: string, elementId: string) => void;
}

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 查找元素并计算有效时长
 */
function findElementWithDuration(
  project: ProjectData,
  trackId: string,
  elementId: string
): { element: TimelineElement; effectiveDuration: number; elementEnd: number } | null {
  const track = project.tracks.find(t => t.id === trackId);
  const element = track?.elements.find(e => e.id === elementId);
  if (!element) return null;

  const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
  const elementEnd = element.startTime + effectiveDuration;

  return { element, effectiveDuration, elementEnd };
}

/**
 * 检查播放头是否在元素范围内
 */
function isPlayheadInElement(
  currentTime: number,
  elementStart: number,
  elementEnd: number
): boolean {
  return currentTime > elementStart && currentTime < elementEnd;
}

/**
 * 计算分割点（相对于元素原始时长）
 */
function calculateSplitPoint(
  currentTime: number,
  elementStart: number,
  trimStart: number
): number {
  return currentTime - elementStart + trimStart;
}

// =============================================================================
// Slice 创建器
// =============================================================================

export const createElementSplitSlice: StateCreator<
  ElementSplitSlice & ProjectDependency & HistoryDependency & PlaybackDependency & ElementOpsDependency,
  [],
  [],
  ElementSplitSlice
> = (_set, get) => ({
  splitAtPlayhead: (trackId, elementId) => {
    const { project, currentTime, updateElement, addElement, pushHistory } = get();
    if (!project) return;

    const result = findElementWithDuration(project, trackId, elementId);
    if (!result) return;

    const { element, elementEnd } = result;

    // 检查播放头是否在元素范围内
    if (!isPlayheadInElement(currentTime, element.startTime, elementEnd)) {
      return;
    }

    pushHistory(project);
    const splitPoint = calculateSplitPoint(currentTime, element.startTime, element.trimStart);

    // 更新原元素（左半部分）：设置新的 trimEnd
    updateElement(trackId, elementId, {
      trimEnd: element.duration - splitPoint,
    });

    // 创建新元素（右半部分）：从分割点开始
    addElement(trackId, {
      ...element,
      startTime: currentTime,
      trimStart: splitPoint,
      trimEnd: element.trimEnd,
      name: `${element.name} (split)`,
    } as Omit<TimelineElement, 'id'>);
  },

  splitAndKeepLeft: (trackId, elementId) => {
    const { project, currentTime, updateElement, pushHistory } = get();
    if (!project) return;

    const result = findElementWithDuration(project, trackId, elementId);
    if (!result) return;

    const { element, elementEnd } = result;

    // 检查播放头是否在元素范围内
    if (!isPlayheadInElement(currentTime, element.startTime, elementEnd)) {
      return;
    }

    pushHistory(project);
    const splitPoint = calculateSplitPoint(currentTime, element.startTime, element.trimStart);

    // 更新元素：只保留左半部分
    updateElement(trackId, elementId, {
      trimEnd: element.duration - splitPoint,
      name: `${element.name} (left)`,
    });
  },

  splitAndKeepRight: (trackId, elementId) => {
    const { project, currentTime, updateElement, pushHistory } = get();
    if (!project) return;

    const result = findElementWithDuration(project, trackId, elementId);
    if (!result) return;

    const { element, elementEnd } = result;

    // 检查播放头是否在元素范围内
    if (!isPlayheadInElement(currentTime, element.startTime, elementEnd)) {
      return;
    }

    pushHistory(project);
    const splitPoint = calculateSplitPoint(currentTime, element.startTime, element.trimStart);

    // 更新元素：只保留右半部分
    updateElement(trackId, elementId, {
      startTime: currentTime,
      trimStart: splitPoint,
      name: `${element.name} (right)`,
    });
  },
});
