/**
 * Element Operations Slice
 * 管理元素的基础增删改操作
 *
 * 重构后职责:
 * - 基础 CRUD 操作 (add, update, remove, move)
 * - 元素属性切换 (hidden, muted)
 * - 视频音频分离操作
 *
 * 分割操作已移至 ElementSplitSlice
 */

import { StateCreator } from 'zustand';
import type { ProjectData, TimelineElement, TrackType, MediaElement, AudioElement } from '../../types';
import { generateId } from '../../utils';
import { getMediaProxy } from '../../services/mediaProxyFactory';
import { createDefaultSubtitleStyle } from '../../types/subtitle';

/**
 * Detect if video file has audio track via Extension FFmpeg probe
 */
async function detectVideoHasAudio(src: string): Promise<boolean> {
  try {
    const mediaInfo = await getMediaProxy().probeMediaInfo(src);
    return mediaInfo?.hasAudio ?? false;
  } catch (error) {
    console.warn('[detectVideoHasAudio] Failed to detect audio:', error);
    return false;
  }
}

// =============================================================================
// 依赖接口
// =============================================================================

interface ProjectDependency {
  project: ProjectData | null;
}

interface HistoryDependency {
  pushHistory: (project: ProjectData) => void;
}

interface UIStateDependency {
  rippleEditingEnabled: boolean;
}

interface TrackOpsDependency {
  addTrack: (type: TrackType, name?: string) => string;
}

// =============================================================================
// 音频分离类型
// =============================================================================

/** 音频分离结果 */
export interface SeparateAudioResult {
  /** 是否成功 */
  success: boolean;
  /** 创建的音频元素 ID */
  audioElementId?: string;
  /** 使用的音频轨道 ID */
  audioTrackId?: string;
  /** 是否创建了新轨道 */
  createdNewTrack?: boolean;
  /** 错误信息（如果失败） */
  error?: string;
}

// =============================================================================
// 扩展元素类型（添加关联字段）
// =============================================================================

/** 带关联的媒体元素 */
export interface LinkedMediaElement extends MediaElement {
  /** 关联的音频元素 ID（如果已分离） */
  linkedAudioId?: string;
}

/** 带关联的音频元素 */
export interface LinkedAudioElement extends AudioElement {
  /** 关联的视频元素 ID（如果是从视频分离出来的） */
  linkedVideoId?: string;
}

// =============================================================================
// 涟纹编辑工具函数
// =============================================================================

/**
 * 计算涟纹删除后的元素列表
 * 纯函数：删除指定元素并调整后续元素的开始时间
 */
function calculateRippleDelete(
  elements: TimelineElement[],
  elementId: string
): TimelineElement[] {
  const elementToRemove = elements.find(e => e.id === elementId);
  if (!elementToRemove) {
    return elements.filter(e => e.id !== elementId);
  }

  // 计算被删除元素的有效时长
  const removedDuration = elementToRemove.duration - elementToRemove.trimStart - elementToRemove.trimEnd;
  const removedEnd = elementToRemove.startTime + removedDuration;

  return elements
    .filter(e => e.id !== elementId)
    .map(e => {
      // 将开始时间在被删除元素结束时间之后的元素向前移动
      if (e.startTime >= removedEnd) {
        return { ...e, startTime: e.startTime - removedDuration };
      }
      return e;
    });
}

/**
 * 普通删除：直接过滤掉指定元素
 */
function calculateNormalDelete(
  elements: TimelineElement[],
  elementId: string
): TimelineElement[] {
  return elements.filter(e => e.id !== elementId);
}

// =============================================================================
// Slice 接口
// =============================================================================

/** 添加媒体元素并自动检测音频的结果 */
export interface AddMediaWithAudioResult {
  /** 视频元素 ID */
  videoElementId: string;
  /** 音频元素 ID（如果检测到音轨） */
  audioElementId?: string;
  /** 音频轨道 ID（如果创建了音频元素） */
  audioTrackId?: string;
  /** 是否创建了新的音频轨道 */
  createdNewAudioTrack?: boolean;
}

export interface ElementOpsSlice {
  // 基础 CRUD 操作
  /** 添加元素到轨道（不记录历史） */
  addElement: (trackId: string, element: Omit<TimelineElement, 'id'>) => string;
  /** 添加媒体元素（记录历史，自动创建轨道） */
  addMediaElement: (trackId: string | null, src: string, name: string, duration: number, startTime?: number) => string;
  /** 添加媒体元素并自动检测音频（视频文件专用） */
  addMediaElementWithAudio: (
    trackId: string | null,
    src: string,
    name: string,
    duration: number,
    startTime?: number
  ) => Promise<AddMediaWithAudioResult>;
  /** 删除元素（支持涟纹编辑） */
  removeElement: (trackId: string, elementId: string) => void;
  /** 更新元素属性（不记录历史） */
  updateElement: (trackId: string, elementId: string, updates: Partial<TimelineElement>) => void;
  /** 移动元素到另一轨道 */
  moveElement: (fromTrackId: string, toTrackId: string, elementId: string) => void;

  // 元素属性切换
  /** 切换元素隐藏状态 */
  toggleElementHidden: (trackId: string, elementId: string) => void;
  /** 切换元素静音状态 */
  toggleElementMuted: (trackId: string, elementId: string) => void;

  // 视频音频分离
  /** 分离视频音频 */
  separateVideoAudio: (trackId: string, elementId: string) => Promise<SeparateAudioResult>;
  /** 取消分离（删除关联的音频元素） */
  unseparateVideoAudio: (trackId: string, elementId: string) => void;
}

// =============================================================================
// Slice 创建器
// =============================================================================

export const createElementOpsSlice: StateCreator<
  ElementOpsSlice & ProjectDependency & HistoryDependency & UIStateDependency & TrackOpsDependency,
  [],
  [],
  ElementOpsSlice
> = (set, get) => ({
  addElement: (trackId, elementData) => {
    const { project } = get();
    if (!project) return '';

    const elementId = generateId();
    const newElement = { ...elementData, id: elementId } as TimelineElement;

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? { ...t, elements: [...t.elements, newElement] }
            : t
        ),
      },
    });

    return elementId;
  },

  addMediaElement: (trackId, src, name, duration, startTime = 0) => {
    const { project, pushHistory, addElement, addTrack } = get();
    if (!project) return '';

    pushHistory(project);

    // 查找或创建目标轨道
    let targetTrackId = trackId;
    if (!targetTrackId) {
      const mediaTrack = project.tracks.find((t) => t.type === 'media');
      if (mediaTrack) {
        targetTrackId = mediaTrack.id;
      } else {
        targetTrackId = addTrack('media');
      }
    }

    return addElement(targetTrackId, {
      type: 'media',
      src,
      name,
      duration,
      startTime,
      trimStart: 0,
      trimEnd: 0,
    } as Omit<TimelineElement, 'id'>);
  },

  addMediaElementWithAudio: async (trackId, src, name, duration, startTime = 0) => {
    const { project, pushHistory, addElement, addTrack, updateElement } = get();
    if (!project) return { videoElementId: '' };

    pushHistory(project);

    // 1. 查找或创建视频轨道
    let videoTrackId = trackId;
    let videoTrackIndex = -1;
    if (!videoTrackId) {
      const mediaTrack = project.tracks.find((t) => t.type === 'media');
      if (mediaTrack) {
        videoTrackId = mediaTrack.id;
        videoTrackIndex = project.tracks.findIndex(t => t.id === mediaTrack.id);
      } else {
        videoTrackId = addTrack('media');
        // 新创建的轨道在末尾
        videoTrackIndex = get().project!.tracks.length - 1;
      }
    } else {
      videoTrackIndex = project.tracks.findIndex(t => t.id === videoTrackId);
    }

    // 2. 创建视频元素
    const videoElementId = addElement(videoTrackId, {
      type: 'media',
      src,
      name,
      duration,
      startTime,
      trimStart: 0,
      trimEnd: 0,
    } as Omit<TimelineElement, 'id'>);

    // 3. 异步检测音频（不阻塞主流程）
    const detectAndCreateAudio = async (): Promise<Omit<AddMediaWithAudioResult, 'videoElementId'>> => {
      try {
        // 使用 FFmpeg probe 检测是否有音轨（直接使用文件路径，不需要 webview URI）
        const hasAudio = await detectVideoHasAudio(src);
        if (!hasAudio) {
          return {};
        }

        // 4. 查找或创建音频轨道（复用 separateVideoAudio 的逻辑）
        const currentProject = get().project;
        if (!currentProject) return {};

        let audioTrackId: string | null = null;
        let createdNewAudioTrack = false;

        // 查找视频轨道正下方的音频轨道
        for (let i = videoTrackIndex + 1; i < currentProject.tracks.length; i++) {
          const candidateTrack = currentProject.tracks[i];
          if (candidateTrack?.type === 'audio') {
            // 检查该位置是否有冲突的元素
            const hasConflict = candidateTrack.elements.some(e => {
              const eStart = e.startTime;
              const eEnd = e.startTime + e.duration - e.trimStart - e.trimEnd;
              const newStart = startTime;
              const newEnd = startTime + duration;
              return !(newEnd <= eStart || newStart >= eEnd);
            });
            if (!hasConflict) {
              audioTrackId = candidateTrack.id;
              break;
            }
          }
        }

        // 如果没有找到合适的轨道，创建新轨道
        if (!audioTrackId) {
          const videoTrack = currentProject.tracks[videoTrackIndex];
          const videoTrackName = videoTrack?.name || 'V1';
          const trackNumber = videoTrackName.match(/\d+/)?.[0] || '1';
          const audioTrackName = `A${trackNumber}`;

          audioTrackId = addTrack('audio', audioTrackName);
          createdNewAudioTrack = true;
        }

        // 5. 创建音频元素
        const audioElementId = addElement(audioTrackId, {
          type: 'audio',
          name: name,
          src: src,
          startTime: startTime,
          duration: duration,
          trimStart: 0,
          trimEnd: 0,
          audio: {
            volume: { baseValue: 1.0 },
            pan: { baseValue: 0 },
            muted: false,
          },
          linkedVideoId: videoElementId,
        } as Partial<LinkedAudioElement> as Omit<TimelineElement, 'id'>);

        // 6. 建立双向关联
        updateElement(videoTrackId, videoElementId, {
          linkedAudioId: audioElementId,
        } as Partial<LinkedMediaElement>);

        return {
          audioElementId,
          audioTrackId,
          createdNewAudioTrack,
        };
      } catch (error) {
        console.error('[addMediaElementWithAudio] Audio detection/creation failed:', error);
        return {};
      }
    };

    const audioResult = await detectAndCreateAudio();

    // 4. 异步检测字幕（不阻塞主流程）
    const detectAndCreateSubtitles = async (): Promise<void> => {
      try {
        // 提取字幕轨道
        const subtitleTracks = await getMediaProxy().extractSubtitles(src);
        if (!subtitleTracks || subtitleTracks.length === 0) {
          return;
        }

        console.log(`[addMediaElementWithAudio] Detected ${subtitleTracks.length} subtitle tracks`);

        const currentProject = get().project;
        if (!currentProject) return;

        // 为每个字幕轨道创建时间线轨道
        for (const extractedTrack of subtitleTracks) {
          const trackName = extractedTrack.title || `Subtitle ${extractedTrack.language || 'Unknown'}`;
          const subtitleTrackId = addTrack('subtitle', trackName);

          // 将每个 cue 添加为字幕元素
          for (const cue of extractedTrack.cues) {
            addElement(subtitleTrackId, {
              type: 'subtitle',
              name: `${cue.text.substring(0, 30)}${cue.text.length > 30 ? '...' : ''}`,
              duration: cue.endTime - cue.startTime,
              startTime: cue.startTime,
              trimStart: 0,
              trimEnd: 0,
              cues: [cue],
              style: createDefaultSubtitleStyle(),
              language: extractedTrack.language || 'unknown',
              isDefault: extractedTrack.isDefault,
            } as Omit<TimelineElement, 'id'>);
          }
        }
      } catch (error) {
        console.error('[addMediaElementWithAudio] Subtitle detection failed:', error);
      }
    };

    // 在返回之前调用（不等待，异步执行）
    detectAndCreateSubtitles().catch(err => {
      console.error('[addMediaElementWithAudio] Subtitle detection error:', err);
    });

    return {
      videoElementId,
      ...audioResult,
    };
  },

  removeElement: (trackId, elementId) => {
    const { project, rippleEditingEnabled, pushHistory } = get();
    if (!project) return;

    pushHistory(project);

    // 使用工具函数计算删除后的元素列表
    const deleteFunction = rippleEditingEnabled ? calculateRippleDelete : calculateNormalDelete;

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? { ...t, elements: deleteFunction(t.elements, elementId) }
            : t
        ),
      },
    });
  },

  updateElement: (trackId, elementId, updates) => {
    const { project } = get();
    if (!project) return;

    // 如果更新 duration，确保 trimStart 和 trimEnd 有效
    if (updates.duration !== undefined) {
      const track = project.tracks.find(t => t.id === trackId);
      const element = track?.elements.find(e => e.id === elementId);
      if (element) {
        const newDuration = updates.duration;
        const minEffectiveDuration = 0.1;

        let trimStart = updates.trimStart ?? element.trimStart;
        let trimEnd = updates.trimEnd ?? element.trimEnd;

        // 如果 trimStart + trimEnd >= newDuration，重置它们
        if (trimStart + trimEnd >= newDuration - minEffectiveDuration) {
          updates.trimStart = 0;
          updates.trimEnd = 0;
        }
      }
    }

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                elements: t.elements.map((e) =>
                  e.id === elementId ? ({ ...e, ...updates } as TimelineElement) : e
                ),
              }
            : t
        ),
      },
    });
  },

  moveElement: (fromTrackId, toTrackId, elementId) => {
    const { project, pushHistory } = get();
    if (!project) return;

    pushHistory(project);

    const fromTrack = project.tracks.find((t) => t.id === fromTrackId);
    const element = fromTrack?.elements.find((e) => e.id === elementId);
    if (!element) return;

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) => {
          if (t.id === fromTrackId) {
            return { ...t, elements: t.elements.filter((e) => e.id !== elementId) };
          }
          if (t.id === toTrackId) {
            return { ...t, elements: [...t.elements, element] };
          }
          return t;
        }),
      },
    });
  },

  toggleElementHidden: (trackId, elementId) => {
    const { project, updateElement, pushHistory } = get();
    if (!project) return;

    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId);
    if (!element) return;

    pushHistory(project);
    updateElement(trackId, elementId, {
      hidden: !element.hidden,
    });
  },

  toggleElementMuted: (trackId, elementId) => {
    const { project, updateElement, pushHistory } = get();
    if (!project) return;

    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId);
    if (!element) return;

    pushHistory(project);
    updateElement(trackId, elementId, {
      muted: !element.muted,
    });
  },

  separateVideoAudio: async (trackId, elementId) => {
    const { project, addTrack, addElement, updateElement, pushHistory } = get();
    if (!project) {
      return { success: false, error: 'No project loaded' };
    }

    // 1. 查找视频元素
    const trackIndex = project.tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) {
      return { success: false, error: 'Invalid track' };
    }

    const track = project.tracks[trackIndex];
    if (track.type !== 'media') {
      return { success: false, error: 'Track is not a media track' };
    }

    const element = track.elements.find(e => e.id === elementId);
    if (!element || element.type !== 'media') {
      return { success: false, error: 'Invalid element' };
    }

    const mediaElement = element as LinkedMediaElement;

    // 2. 检测是否已经分离
    if (mediaElement.linkedAudioId) {
      return { success: false, error: 'Audio already separated' };
    }

    // 3. 检测视频是否有音轨
    try {
      // 使用 FFmpeg probe 检测是否有音轨（直接使用文件路径）
      const hasAudio = await detectVideoHasAudio(mediaElement.src);
      if (!hasAudio) {
        return { success: false, error: 'Video has no audio track' };
      }
    } catch (error) {
      console.error('[separateVideoAudio] Audio detection failed:', error);
      return { success: false, error: 'Failed to detect audio' };
    }

    // 4. 查找或创建音频轨道
    let audioTrackId: string | null = null;
    let createdNewTrack = false;

    // 查找正下方的音频轨道
    for (let i = trackIndex + 1; i < project.tracks.length; i++) {
      const candidateTrack = project.tracks[i];
      if (candidateTrack.type === 'audio') {
        // 检查是否有元素（避免冲突）
        if (candidateTrack.elements.length === 0) {
          audioTrackId = candidateTrack.id;
          break;
        }
      }
    }

    // 如果没有找到合适的轨道，创建新轨道
    if (!audioTrackId) {
      // 生成轨道名称（匹配视频轨道编号）
      const videoTrackName = track.name; // e.g., "V2"
      const trackNumber = videoTrackName.match(/\d+/)?.[0] || '1';
      const audioTrackName = `A${trackNumber}`;

      audioTrackId = addTrack('audio', audioTrackName);
      createdNewTrack = true;
    }

    // 5. 创建音频元素
    const audioElementId = addElement(audioTrackId, {
      type: 'audio',
      name: `${mediaElement.name}`,
      src: mediaElement.src,
      startTime: mediaElement.startTime,
      duration: mediaElement.duration,
      trimStart: mediaElement.trimStart,
      trimEnd: mediaElement.trimEnd,
      audio: mediaElement.audio || {
        volume: { baseValue: 1.0 },
        pan: { baseValue: 0 },
        muted: false,
      },
      linkedVideoId: elementId, // 建立反向关联
    } as Partial<LinkedAudioElement> as Omit<TimelineElement, 'id'>);

    // 6. 建立正向关联
    updateElement(trackId, elementId, {
      linkedAudioId: audioElementId,
    } as Partial<LinkedMediaElement>);

    // 7. 记录历史
    pushHistory(get().project!);

    return {
      success: true,
      audioElementId,
      audioTrackId,
      createdNewTrack,
    };
  },

  unseparateVideoAudio: (trackId, elementId) => {
    const { project, removeElement, updateElement, pushHistory } = get();
    if (!project) return;

    // 查找视频元素
    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId);
    if (!element || element.type !== 'media') return;

    const mediaElement = element as LinkedMediaElement;
    const linkedAudioId = mediaElement.linkedAudioId;

    if (!linkedAudioId) {
      console.warn('[unseparateVideoAudio] No linked audio found');
      return;
    }

    // 查找关联的音频元素
    let audioTrackId: string | null = null;
    for (const t of project.tracks) {
      if (t.type === 'audio') {
        const audioElement = t.elements.find(e => e.id === linkedAudioId);
        if (audioElement) {
          audioTrackId = t.id;
          break;
        }
      }
    }

    if (!audioTrackId) {
      console.warn('[unseparateVideoAudio] Linked audio track not found');
      return;
    }

    pushHistory(project);

    // 删除音频元素
    removeElement(audioTrackId, linkedAudioId);

    // 移除关联
    updateElement(trackId, elementId, {
      linkedAudioId: undefined,
    } as Partial<LinkedMediaElement>);
  },
});
