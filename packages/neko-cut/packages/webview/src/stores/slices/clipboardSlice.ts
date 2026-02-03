/**
 * Clipboard Slice
 * 管理剪贴板操作(复制/粘贴)
 *
 * 使用 timelineUtils 提供的工具函数进行碰撞检测
 */

import { StateCreator } from 'zustand';
import type { ProjectData, TimelineElement, TrackType } from '../../types';
import {
  rangesOverlap,
  calculateEffectiveDuration,
  type TimeRange,
} from '../../utils/timelineUtils';

// =============================================================================
// 依赖接口
// =============================================================================

interface ProjectDependency {
  project: ProjectData | null;
}

interface SelectionDependency {
  selectedElements: Array<{ trackId: string; elementId: string }>;
}

interface HistoryDependency {
  pushHistory: (project: ProjectData) => void;
}

interface ElementOpsDependency {
  addElement: (trackId: string, element: Omit<TimelineElement, 'id'>) => string;
}

interface TrackOpsDependency {
  addTrack: (type: TrackType, name?: string) => string;
}

// =============================================================================
// Slice 接口
// =============================================================================

export interface ClipboardSlice {
  // State
  clipboard: { items: Array<{ trackType: TrackType; element: Omit<TimelineElement, 'id'> }> } | null;

  // Actions
  /** 复制选中的元素到剪贴板 */
  copySelected: () => void;
  /** 在指定时间粘贴剪贴板内容 */
  pasteAtTime: (time: number) => void;
  /** 清空剪贴板 */
  clearClipboard: () => void;
}

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 在轨道上找到不重叠的位置
 * 使用 timelineUtils 的碰撞检测函数
 */
function findNonOverlappingPositionOnTrack(
  existingElements: TimeRange[],
  pendingElements: TimeRange[],
  desiredStart: number,
  duration: number
): number {
  // 合并所有元素并排序
  const allElements = [...existingElements, ...pendingElements]
    .sort((a, b) => a.startTime - b.startTime);

  let startTime = desiredStart;

  // 检查重叠并调整位置
  for (const elem of allElements) {
    const elemEnd = elem.startTime + elem.duration;

    if (rangesOverlap(startTime, startTime + duration, elem.startTime, elemEnd)) {
      // 将开始时间移动到该元素之后
      startTime = elemEnd;
    }
  }

  return startTime;
}

/**
 * 将轨道元素转换为 TimeRange 格式
 */
function elementToTimeRange(element: TimelineElement): TimeRange {
  return {
    startTime: element.startTime,
    duration: calculateEffectiveDuration(
      element.duration,
      element.trimStart,
      element.trimEnd
    ),
  };
}

// =============================================================================
// Slice 创建器
// =============================================================================

export const createClipboardSlice: StateCreator<
  ClipboardSlice & ProjectDependency & SelectionDependency & HistoryDependency & ElementOpsDependency & TrackOpsDependency,
  [],
  [],
  ClipboardSlice
> = (set, get) => ({
  // Initial state
  clipboard: null,

  // Actions
  copySelected: () => {
    const { project, selectedElements } = get();
    if (!project || selectedElements.length === 0) return;

    const items: Array<{ trackType: TrackType; element: Omit<TimelineElement, 'id'> }> = [];
    for (const { trackId, elementId } of selectedElements) {
      const track = project.tracks.find((t) => t.id === trackId);
      const element = track?.elements.find((e) => e.id === elementId);
      if (track && element) {
        const { id, ...rest } = element;
        items.push({ trackType: track.type, element: rest });
      }
    }
    set({ clipboard: { items } });
  },

  pasteAtTime: (time) => {
    const { clipboard, project, addElement, addTrack, pushHistory } = get();
    if (!clipboard || clipboard.items.length === 0 || !project) return;

    pushHistory(project);

    const minStart = Math.min(...clipboard.items.map((x) => x.element.startTime));

    // 追踪将要添加的元素（避免与已添加的元素重叠）
    const pendingElements: Map<string, TimeRange[]> = new Map();

    for (const item of clipboard.items) {
      let targetTrack = project.tracks.find((t) => t.type === item.trackType);
      let trackId: string;

      if (!targetTrack) {
        trackId = addTrack(item.trackType);
        // 重新获取项目数据
        const updatedProject = get().project;
        if (updatedProject) {
          targetTrack = updatedProject.tracks.find((t) => t.id === trackId);
        }
      } else {
        trackId = targetTrack.id;
      }

      const relativeOffset = item.element.startTime - minStart;
      const desiredStartTime = Math.max(0, time + relativeOffset);
      const elementDuration = calculateEffectiveDuration(
        item.element.duration,
        item.element.trimStart,
        item.element.trimEnd
      );

      // 获取轨道上已有的元素
      const existingElements: TimeRange[] = targetTrack
        ? targetTrack.elements.map(elementToTimeRange)
        : [];

      // 获取待添加的元素
      const pending = pendingElements.get(trackId) || [];

      // 找到不重叠的位置
      const actualStartTime = findNonOverlappingPositionOnTrack(
        existingElements,
        pending,
        desiredStartTime,
        elementDuration
      );

      // 记录待添加的元素
      if (!pendingElements.has(trackId)) {
        pendingElements.set(trackId, []);
      }
      pendingElements.get(trackId)!.push({
        startTime: actualStartTime,
        duration: elementDuration,
      });

      addElement(trackId, {
        ...item.element,
        startTime: actualStartTime,
      });
    }
  },

  clearClipboard: () => set({ clipboard: null }),
});
