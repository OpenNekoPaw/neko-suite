// =============================================================================
// Apply Track Operations — 轨道操作的 apply 实现
// =============================================================================

import type { ProjectData } from '../types/project';
import type { TrackOperation } from './types';
import { findTrack, arrayMove } from './helpers';
import { OperationError } from './errors';

export function applyTrackOperation(project: ProjectData, op: TrackOperation): ProjectData {
  switch (op.type) {
    case 'track.add': {
      const { track, index } = op.payload;
      const newTracks = [...project.tracks];
      if (index !== undefined) {
        newTracks.splice(index, 0, track);
      } else {
        newTracks.push(track);
      }
      return { ...project, tracks: newTracks };
    }

    case 'track.remove': {
      const { trackId } = op.payload;
      findTrack(project, trackId); // validate existence
      return { ...project, tracks: project.tracks.filter(t => t.id !== trackId) };
    }

    case 'track.update': {
      const { trackId, updates } = op.payload;
      const { index } = findTrack(project, trackId);
      const newTracks = [...project.tracks];
      newTracks[index] = { ...newTracks[index]!, ...updates };
      return { ...project, tracks: newTracks };
    }

    case 'track.reorder': {
      const { fromIndex, toIndex } = op.payload;
      if (fromIndex < 0 || fromIndex >= project.tracks.length) {
        throw OperationError.invalidIndex(fromIndex, project.tracks.length - 1);
      }
      if (toIndex < 0 || toIndex >= project.tracks.length) {
        throw OperationError.invalidIndex(toIndex, project.tracks.length - 1);
      }
      if (fromIndex === toIndex) return project;
      return { ...project, tracks: arrayMove(project.tracks, fromIndex, toIndex) };
    }

    case 'track.toggle': {
      const { trackId, field } = op.payload;
      const { index } = findTrack(project, trackId);
      const newTracks = [...project.tracks];
      newTracks[index] = { ...newTracks[index]!, [field]: !newTracks[index]![field] };
      return { ...project, tracks: newTracks };
    }
  }
}
