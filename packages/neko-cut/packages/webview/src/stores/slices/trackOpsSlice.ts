/**
 * Track Operations Slice
 * 管理轨道的增删改操作
 */

import { StateCreator } from 'zustand';
import type { ProjectData, TimelineTrack, TrackType } from '../../types';
import { generateId } from '../../utils';

// 需要依赖的其他 Slices 接口
interface ProjectDependency {
  project: ProjectData | null;
}

interface HistoryDependency {
  pushHistory: (project: ProjectData) => void;
}

export interface TrackOpsSlice {
  // Actions
  addTrack: (type: TrackType, name?: string) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<TimelineTrack>) => void;
  reorderTracks: (sourceIndex: number, targetIndex: number) => void;
  reorderTrack: (trackId: string, newIndex: number) => void;
  moveTrackUp: (trackId: string) => void;
  moveTrackDown: (trackId: string) => void;
  toggleTrackLocked: (trackId: string) => void;
  toggleTrackHidden: (trackId: string) => void;
}

export const createTrackOpsSlice: StateCreator<
  TrackOpsSlice & ProjectDependency & HistoryDependency,
  [],
  [],
  TrackOpsSlice
> = (set, get) => ({
  // Actions
  addTrack: (type, name) => {
    const { project, pushHistory } = get();
    if (!project) return '';

    pushHistory(project);

    const trackId = generateId();
    const defaultNames: Record<TrackType, string> = {
      media: 'Media Track',
      text: 'Text Track',
      audio: 'Audio Track',
      subtitle: 'Subtitle Track',
      shape: 'Shape Track',
    };
    const trackName = name || defaultNames[type] || 'Track';
    const newTrack: TimelineTrack = {
      id: trackId,
      name: trackName,
      type,
      elements: [],
      muted: false,
    };

    set({
      project: {
        ...project,
        tracks: [...project.tracks, newTrack],
      },
    });

    return trackId;
  },

  removeTrack: (trackId) => {
    const { project, pushHistory } = get();
    if (!project) return;

    pushHistory(project);

    set({
      project: {
        ...project,
        tracks: project.tracks.filter((t) => t.id !== trackId),
      },
    });
  },

  updateTrack: (trackId, updates) => {
    const { project, pushHistory } = get();
    if (!project) return;

    pushHistory(project);

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId ? { ...t, ...updates } : t
        ),
      },
    });
  },

  reorderTracks: (sourceIndex, targetIndex) => {
    const { project, pushHistory } = get();
    if (!project) return;

    if (sourceIndex === targetIndex) return;

    pushHistory(project);

    const tracks = [...project.tracks];
    const [movedTrack] = tracks.splice(sourceIndex, 1);
    tracks.splice(targetIndex, 0, movedTrack);

    set({
      project: {
        ...project,
        tracks,
      },
    });
  },

  reorderTrack: (trackId, newIndex) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const currentIndex = project.tracks.findIndex((t) => t.id === trackId);
    if (currentIndex === -1) return;
    if (currentIndex === newIndex) return; // No change needed

    // Clamp newIndex to valid range
    const clampedIndex = Math.max(0, Math.min(newIndex, project.tracks.length - 1));
    if (currentIndex === clampedIndex) return;

    pushHistory(project);

    const newTracks = [...project.tracks];
    const [removed] = newTracks.splice(currentIndex, 1);
    newTracks.splice(clampedIndex, 0, removed);

    set({
      project: {
        ...project,
        tracks: newTracks,
      },
    });
  },

  moveTrackUp: (trackId) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const index = project.tracks.findIndex((t) => t.id === trackId);
    if (index <= 0) return; // Already at top or not found

    pushHistory(project);

    const newTracks = [...project.tracks];
    [newTracks[index - 1], newTracks[index]] = [newTracks[index], newTracks[index - 1]];

    set({
      project: {
        ...project,
        tracks: newTracks,
      },
    });
  },

  moveTrackDown: (trackId) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const index = project.tracks.findIndex((t) => t.id === trackId);
    if (index === -1 || index >= project.tracks.length - 1) return; // Already at bottom or not found

    pushHistory(project);

    const newTracks = [...project.tracks];
    [newTracks[index], newTracks[index + 1]] = [newTracks[index + 1], newTracks[index]];

    set({
      project: {
        ...project,
        tracks: newTracks,
      },
    });
  },

  toggleTrackLocked: (trackId) => {
    const { project, pushHistory } = get();
    if (!project) return;

    pushHistory(project);

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId ? { ...t, locked: !t.locked } : t
        ),
      },
    });
  },

  toggleTrackHidden: (trackId) => {
    const { project, pushHistory } = get();
    if (!project) return;

    pushHistory(project);

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId ? { ...t, hidden: !t.hidden } : t
        ),
      },
    });
  },
});
