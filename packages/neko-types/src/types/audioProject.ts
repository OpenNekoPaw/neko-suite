// =============================================================================
// Audio Project Types — .nka file format
//
// Multi-track audio project. Reuses TimelineTrack from the timeline system.
// =============================================================================

import type { TimelineTrack } from './timelineTrack';
import type { AudioEffectSnapshot, AudioMarkerSnapshot } from '../operations/types';

/** Audio project data — .nka file format */
export interface AudioProjectData {
  version: string;
  name: string;
  /** Project sample rate (default 48000) */
  sampleRate: number;
  /** Project channels (default 2) */
  channels: number;
  /** Timeline tracks (reuses from neko-types) */
  tracks: TimelineTrack[];
  /** Master bus effects chain */
  masterEffectsChain: AudioEffectSnapshot[];
  /** Project-level markers */
  markers: AudioMarkerSnapshot[];
}
