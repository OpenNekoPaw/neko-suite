import type { BasicQualityIssue } from './quality-evidence-normalizer';
import {
  createContinuityEdgeId,
  stableHashString,
  stableStringify,
} from './quality-evidence-normalizer';

// P0 ownership: VideoContentIndex is currently Agent-local because no Cut or
// shared package consumer exists yet. Keep this as a composition/validation
// contract until an implementation needs cross-package sharing.

export type VideoContentSourceKind = 'asset' | 'timeline-render' | 'clip-range';

export type VideoSegmentBasis =
  | 'shot'
  | 'scene'
  | 'speech'
  | 'silence'
  | 'music'
  | 'action'
  | 'uniform-window';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface VideoTimeRange {
  readonly start: number;
  readonly end: number;
}

export interface VideoSegment {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly basis: VideoSegmentBasis;
  readonly summary: string;
  readonly entities: readonly string[];
  readonly actions: readonly string[];
  readonly transcriptRefs?: readonly string[];
  readonly confidence: ConfidenceLevel;
  readonly evidenceIds: readonly string[];
}

export interface TemporalProfile {
  readonly time: number;
  readonly segmentId?: string;
  readonly color: {
    readonly brightness: number;
    readonly saturation: number;
    readonly warmth: number;
    readonly contrast: number;
  };
  readonly motion: {
    readonly intensity: number;
    readonly stability: number;
  };
  readonly audio: {
    readonly loudness: number;
    readonly silence: boolean;
    readonly musicEnergy?: number;
  };
  readonly semantic: {
    readonly subjects: readonly string[];
    readonly action?: string;
    readonly location?: string;
  };
  readonly emotion?: {
    readonly valence: number;
    readonly arousal: number;
    readonly tension: number;
  };
  readonly evidenceIds: readonly string[];
}

export type ContinuityIssue =
  | 'jump-cut'
  | 'action-discontinuity'
  | 'identity-drift'
  | 'color-pop'
  | 'audio-pop'
  | 'emotion-break'
  | 'rhythm-break';

export interface ContinuityEdge {
  readonly id: string;
  readonly fromSegmentId?: string;
  readonly toSegmentId?: string;
  readonly fromTime: number;
  readonly toTime: number;
  readonly visualDelta: number;
  readonly semanticDelta: number;
  readonly emotionDelta: number;
  readonly audioDelta: number;
  readonly rhythmDelta: number;
  readonly issue?: ContinuityIssue;
  readonly interpretation: string;
  readonly intentionality: 'likely-intended' | 'likely-accidental' | 'unknown';
  readonly evidenceIds: readonly string[];
}

export interface AestheticEmotionProfile {
  readonly segmentId: string;
  readonly start: number;
  readonly end: number;
  readonly aesthetics: {
    readonly composition: string;
    readonly lighting: string;
    readonly colorTone: string;
    readonly motion: string;
    readonly rhythm: string;
    readonly visualQuality: string;
  };
  readonly emotion: {
    readonly mood: readonly string[];
    readonly valence: number;
    readonly arousal: number;
    readonly tension: number;
    readonly intimacy: number;
  };
  readonly confidence: ConfidenceLevel;
  readonly evidenceIds: readonly string[];
}

export interface VideoContentIndex {
  readonly id: string;
  readonly source: string;
  readonly sourceKind: VideoContentSourceKind;
  readonly range?: VideoTimeRange;
  readonly duration: number;
  readonly segments: readonly VideoSegment[];
  readonly temporalProfiles: readonly TemporalProfile[];
  readonly continuityEdges: readonly ContinuityEdge[];
  readonly qualityIssues: readonly BasicQualityIssue[];
  readonly aestheticEmotionProfiles: readonly AestheticEmotionProfile[];
  readonly evidenceIds: readonly string[];
  readonly createdAt: number;
}

export interface VideoContentIndexInput {
  readonly source: string;
  readonly sourceKind: VideoContentSourceKind;
  readonly duration: number;
  readonly range?: VideoTimeRange;
  readonly segments?: readonly VideoSegmentInput[];
  readonly temporalProfiles?: readonly TemporalProfile[];
  readonly continuityEdges?: readonly ContinuityEdgeInput[];
  readonly qualityIssues?: readonly BasicQualityIssue[];
  readonly aestheticEmotionProfiles?: readonly AestheticEmotionProfile[];
  readonly evidenceIds?: readonly string[];
  readonly createdAt?: number;
}

export type VideoSegmentInput = Omit<VideoSegment, 'id'> & { readonly id?: string };
export type ContinuityEdgeInput = Omit<ContinuityEdge, 'id'> & { readonly id?: string };

export interface VideoContentIndexValidationError {
  readonly path: string;
  readonly code:
    | 'invalid-duration'
    | 'invalid-time-range'
    | 'missing-evidence'
    | 'invalid-source'
    | 'segment-order';
  readonly message: string;
}

export interface VideoContentIndexValidationResult {
  readonly valid: boolean;
  readonly errors: readonly VideoContentIndexValidationError[];
}

export interface VideoContentIndexBuildResult {
  readonly index: VideoContentIndex;
  readonly validation: VideoContentIndexValidationResult;
}

export interface VideoContentAnalyzerPlaceholder {
  readonly name: string;
  readonly capability:
    | 'probe'
    | 'inspect-frames'
    | 'detect-shots'
    | 'detect-freeze'
    | 'analyze-flicker'
    | 'analyze-loudness'
    | 'detect-silence';
}

// P0 only records the Engine analyzer capability names that a future stage can
// bind to. buildVideoContentIndex() does not invoke analyzers or infer output.
export const VIDEO_CONTENT_ANALYZER_PLACEHOLDERS: readonly VideoContentAnalyzerPlaceholder[] = [
  { name: 'probeDetailed', capability: 'probe' },
  { name: 'inspectFrames', capability: 'inspect-frames' },
  { name: 'detectShots', capability: 'detect-shots' },
  { name: 'detectFreeze', capability: 'detect-freeze' },
  { name: 'analyzeFlicker', capability: 'analyze-flicker' },
  { name: 'analyzeLoudness', capability: 'analyze-loudness' },
  { name: 'detectSilence', capability: 'detect-silence' },
] as const;

export function buildVideoContentIndex(
  input: VideoContentIndexInput,
): VideoContentIndexBuildResult {
  const segments = (input.segments ?? []).map((segment, index) =>
    normalizeSegment(segment, index, input.source),
  );
  const continuityEdges = (input.continuityEdges ?? []).map((edge) =>
    normalizeContinuityEdge(edge),
  );
  const evidenceIds = [...new Set(input.evidenceIds ?? collectEvidenceIds(input))].sort();
  const index: VideoContentIndex = {
    id: createVideoContentIndexId({
      source: input.source,
      sourceKind: input.sourceKind,
      range: input.range,
      duration: input.duration,
      segmentIds: segments.map((segment) => segment.id),
      qualityIssueIds: (input.qualityIssues ?? []).map((issue) => issue.id),
      continuityEdgeIds: continuityEdges.map((edge) => edge.id),
      evidenceIds,
    }),
    source: input.source,
    sourceKind: input.sourceKind,
    ...(input.range ? { range: input.range } : {}),
    duration: input.duration,
    segments,
    temporalProfiles: input.temporalProfiles ?? [],
    continuityEdges,
    qualityIssues: input.qualityIssues ?? [],
    aestheticEmotionProfiles: input.aestheticEmotionProfiles ?? [],
    evidenceIds,
    createdAt: input.createdAt ?? Date.now(),
  };
  return { index, validation: validateVideoContentIndex(index) };
}

export function validateVideoContentIndex(
  index: VideoContentIndex,
): VideoContentIndexValidationResult {
  const errors: VideoContentIndexValidationError[] = [];

  if (!index.source.trim()) {
    errors.push({
      path: 'source',
      code: 'invalid-source',
      message: 'VideoContentIndex source must be non-empty.',
    });
  }
  if (!isVideoContentSourceKind(index.sourceKind)) {
    errors.push({
      path: 'sourceKind',
      code: 'invalid-source',
      message: 'VideoContentIndex sourceKind must be asset, timeline-render, or clip-range.',
    });
  }
  if (!Number.isFinite(index.duration) || index.duration < 0) {
    errors.push({
      path: 'duration',
      code: 'invalid-duration',
      message: 'VideoContentIndex duration must be a finite non-negative number.',
    });
  }
  if (index.range) {
    validateRange(index.range, index.duration, 'range', errors);
  }

  let previousEnd = 0;
  index.segments.forEach((segment, i) => {
    validateRange(segment, index.duration, `segments[${i}]`, errors);
    if (segment.start < previousEnd) {
      errors.push({
        path: `segments[${i}]`,
        code: 'segment-order',
        message: 'VideoContentIndex segments must be ordered and non-overlapping.',
      });
    }
    if (segment.evidenceIds.length === 0) {
      errors.push({
        path: `segments[${i}].evidenceIds`,
        code: 'missing-evidence',
        message: 'VideoSegment requires at least one evidence id.',
      });
    }
    previousEnd = segment.end;
  });

  index.qualityIssues.forEach((issue, i) => {
    validateRange(issue, index.duration, `qualityIssues[${i}]`, errors);
    if (issue.evidenceIds.length === 0) {
      errors.push({
        path: `qualityIssues[${i}].evidenceIds`,
        code: 'missing-evidence',
        message: 'BasicQualityIssue requires at least one evidence id.',
      });
    }
  });

  index.continuityEdges.forEach((edge, i) => {
    validatePoint(edge.fromTime, index.duration, `continuityEdges[${i}].fromTime`, errors);
    validatePoint(edge.toTime, index.duration, `continuityEdges[${i}].toTime`, errors);
    if (edge.evidenceIds.length === 0) {
      errors.push({
        path: `continuityEdges[${i}].evidenceIds`,
        code: 'missing-evidence',
        message: 'ContinuityEdge requires at least one evidence id.',
      });
    }
  });

  index.temporalProfiles.forEach((profile, i) => {
    validatePoint(profile.time, index.duration, `temporalProfiles[${i}].time`, errors);
    if (profile.evidenceIds.length === 0) {
      errors.push({
        path: `temporalProfiles[${i}].evidenceIds`,
        code: 'missing-evidence',
        message: 'TemporalProfile requires at least one evidence id.',
      });
    }
  });

  index.aestheticEmotionProfiles.forEach((profile, i) => {
    validateRange(profile, index.duration, `aestheticEmotionProfiles[${i}]`, errors);
    if (profile.evidenceIds.length === 0) {
      errors.push({
        path: `aestheticEmotionProfiles[${i}].evidenceIds`,
        code: 'missing-evidence',
        message: 'AestheticEmotionProfile requires at least one evidence id.',
      });
    }
  });

  return { valid: errors.length === 0, errors };
}

export function createVideoContentIndexId(input: {
  readonly source: string;
  readonly sourceKind: VideoContentSourceKind;
  readonly duration: number;
  readonly range?: VideoTimeRange;
  readonly segmentIds: readonly string[];
  readonly qualityIssueIds: readonly string[];
  readonly continuityEdgeIds: readonly string[];
  readonly evidenceIds: readonly string[];
}): string {
  return `video-content-index:${stableHashString(stableStringify(input))}`;
}

export function createVideoSegmentId(input: {
  readonly source: string;
  readonly start: number;
  readonly end: number;
  readonly basis: VideoSegmentBasis;
  readonly evidenceIds: readonly string[];
}): string {
  return `video-segment:${stableHashString(stableStringify(input))}`;
}

function normalizeSegment(segment: VideoSegmentInput, index: number, source: string): VideoSegment {
  return {
    ...segment,
    id:
      segment.id ??
      createVideoSegmentId({
        source: `${source}#segment-${index}`,
        start: segment.start,
        end: segment.end,
        basis: segment.basis,
        evidenceIds: segment.evidenceIds,
      }),
  };
}

function normalizeContinuityEdge(edge: ContinuityEdgeInput): ContinuityEdge {
  return {
    ...edge,
    id:
      edge.id ??
      createContinuityEdgeId({
        evidenceIds: edge.evidenceIds,
        fromSegmentId: edge.fromSegmentId,
        toSegmentId: edge.toSegmentId,
        fromTime: edge.fromTime,
        toTime: edge.toTime,
        issue: edge.issue,
      }),
  };
}

function collectEvidenceIds(input: VideoContentIndexInput): readonly string[] {
  return [
    ...(input.qualityIssues ?? []).flatMap((issue) => issue.evidenceIds),
    ...(input.continuityEdges ?? []).flatMap((edge) => edge.evidenceIds),
    ...(input.temporalProfiles ?? []).flatMap((profile) => profile.evidenceIds),
    ...(input.aestheticEmotionProfiles ?? []).flatMap((profile) => profile.evidenceIds),
    ...(input.segments ?? []).flatMap((segment) => segment.evidenceIds),
  ];
}

function isVideoContentSourceKind(value: string): value is VideoContentSourceKind {
  return value === 'asset' || value === 'timeline-render' || value === 'clip-range';
}

function validateRange(
  range: { readonly start: number; readonly end: number },
  duration: number,
  path: string,
  errors: VideoContentIndexValidationError[],
): void {
  if (
    !Number.isFinite(range.start) ||
    !Number.isFinite(range.end) ||
    range.start < 0 ||
    range.end < range.start ||
    range.end > duration
  ) {
    errors.push({
      path,
      code: 'invalid-time-range',
      message: `${path} must be within the indexed duration and have end >= start.`,
    });
  }
}

function validatePoint(
  time: number,
  duration: number,
  path: string,
  errors: VideoContentIndexValidationError[],
): void {
  if (!Number.isFinite(time) || time < 0 || time > duration) {
    errors.push({
      path,
      code: 'invalid-time-range',
      message: `${path} must be within the indexed duration.`,
    });
  }
}
