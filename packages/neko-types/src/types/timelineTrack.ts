// =============================================================================
// Tracks
// =============================================================================

import { TrackType } from './track';
import { TimelineElement } from './element';
import { BlendModeType } from './blendMode';
import { ElementTransition } from './transition';

export interface TimelineTrack {
  id: string;
  name: string;
  type: TrackType;
  elements: TimelineElement[];
  muted?: boolean;
  isMain?: boolean;      // Main track identifier

  // Extended track properties
  /** Whether track is locked (cannot be edited) */
  locked?: boolean;
  /** Solo mode (only this track is audible/visible) */
  solo?: boolean;
  /** Track opacity (0-1) */
  opacity?: number;
  /** Track blend mode */
  blendMode?: BlendModeType;
  /** Track color for UI display */
  color?: string;
  /** Track height in UI (pixels) */
  height?: number;
  /** Whether the track is hidden in preview */
  hidden?: boolean;
  /** Transitions between elements in this track */
  transitions?: ElementTransition[];
}
