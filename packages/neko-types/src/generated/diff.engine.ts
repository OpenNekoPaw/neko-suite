// =============================================================================
// AUTO-GENERATED — DO NOT EDIT
//
// Source: packages/neko-proto/diff.proto
// Generated: 2026-02-26T08:16:32.115Z
// Command: node scripts/proto-gen-ts.mjs
// =============================================================================

// =============================================================================
// Enums
// =============================================================================

export type EngineDiffCategory =
  | 'image'
  | 'audio'
  | 'video'
  | 'timeline'
  | 'canvas'
  | 'model';

export type EngineTimelineChangeType =
  | 'added'
  | 'removed'
  | 'modified'
  | 'moved'
  | 'unchanged';

// =============================================================================
// Messages
// =============================================================================

export interface EngineMediaInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  format: string;
  bitrate?: number;
  hasAudio: boolean;
  audioCodec?: string;
  audioSampleRate?: number;
  audioChannels?: number;
  audioBitrate?: number;
  hasSubtitles: boolean;
  subtitleStreams: EngineSubtitleStream[];
}

export interface EngineSubtitleStream {
  index: number;
  codec: string;
  language?: string;
  title?: string;
  isDefault: boolean;
  isForced: boolean;
}

export interface EngineFieldDiff {
  field: string;
  valueA: string;
  valueB: string;
  changed: boolean;
}

export interface EngineImageContentDiff {
  ssim: number;
  psnr: number;
  mse: number;
  diffPixelPercent: number;
  diffPixelCount: number;
  totalPixels: number;
  widthA: number;
  heightA: number;
  widthB: number;
  heightB: number;
  heatmap: string;
  heatmapWidth: number;
  heatmapHeight: number;
}

export interface EngineAudioDiffRegion {
  start: number;
  end: number;
  snr: number;
  rmsDiff: number;
}

export interface EngineAudioContentDiff {
  snr: number;
  durationA: number;
  durationB: number;
  compareSampleRate: number;
  totalSamples: number;
  diffSegmentCount: number;
  totalSegments: number;
  diffPercent: number;
  diffRegions: EngineAudioDiffRegion[];
}

export interface EngineFrameMetric {
  frame: number;
  timestamp: number;
  ssim: number;
  psnr: number;
}

export interface EngineVideoDiffRegion {
  start: number;
  end: number;
  avgSsim: number;
  minSsim: number;
  frameCount: number;
}

export interface EngineVideoContentDiff {
  avgSsim: number;
  minSsim: number;
  avgPsnr: number;
  minPsnr: number;
  durationA: number;
  durationB: number;
  fpsA: number;
  fpsB: number;
  widthA: number;
  heightA: number;
  widthB: number;
  heightB: number;
  totalFramesCompared: number;
  diffFrameCount: number;
  diffFramePercent: number;
  frameMetrics: EngineFrameMetric[];
  diffRegions: EngineVideoDiffRegion[];
  audioDiff?: EngineAudioContentDiff;
  diffVideoPath?: string;
}

export interface EnginePropertyChange {
  property: string;
  previous: string;
  current: string;
}

export interface EngineElementChange {
  elementId: string;
  elementName: string;
  elementType: string;
  changeType: EngineTimelineChangeType;
  propertyChanges: EnginePropertyChange[];
  src?: string;
  previousSrc?: string;
  startTime?: number;
  duration?: number;
}

export interface EngineTrackChange {
  trackId: string;
  trackName: string;
  trackType: string;
  changeType: EngineTimelineChangeType;
  propertyChanges: EnginePropertyChange[];
  elementChanges: EngineElementChange[];
}

export interface EngineTimelineDiffSummary {
  tracksAdded: number;
  tracksRemoved: number;
  tracksModified: number;
  elementsAdded: number;
  elementsRemoved: number;
  elementsModified: number;
  mediaSourceChanges: number;
}

export interface EngineTimelineProjectMeta {
  name: string;
  resolutionWidth: number;
  resolutionHeight: number;
  fps: number;
}

export interface EngineTimelineContentDiff {
  currentProject?: EngineTimelineProjectMeta;
  previousProject?: EngineTimelineProjectMeta;
  trackChanges: EngineTrackChange[];
  summary?: EngineTimelineDiffSummary;
  durationCurrent: number;
  durationPrevious: number;
}

export interface EngineDiffResult {
  sourceA: string;
  sourceB: string;
  category: EngineDiffCategory;
  identical: boolean;
  diffCount: number;
  totalFields: number;
  fields: EngineFieldDiff[];
  infoA: string;
  infoB: string;
  imageDiff?: EngineImageContentDiff;
  audioDiff?: EngineAudioContentDiff;
  videoDiff?: EngineVideoContentDiff;
  timelineDiff?: EngineTimelineContentDiff;
}

