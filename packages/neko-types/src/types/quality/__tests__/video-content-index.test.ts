import { describe, expect, it, vi } from 'vitest';
import {
  VIDEO_CONTENT_ANALYZER_PLACEHOLDERS,
  buildVideoContentIndex,
  type BasicQualityIssue,
  type ContinuityEdgeInput,
} from '..';

function createQualityIssue(overrides: Partial<BasicQualityIssue> = {}): BasicQualityIssue {
  return {
    id: 'quality-issue:stable',
    start: 1,
    end: 2,
    category: 'stutter',
    severity: 'major',
    metrics: { finalScore: 42 },
    source: {
      toolName: 'QualityCheck',
      sourceCategory: 'stuttering',
      sceneIndex: 0,
    },
    evidenceIds: ['quality-review:run:call'],
    suggestedFixes: ['Interpolate dropped frames'],
    ...overrides,
  };
}

function createContinuityEdge(overrides: Partial<ContinuityEdgeInput> = {}): ContinuityEdgeInput {
  return {
    fromSegmentId: 'segment-a',
    toSegmentId: 'segment-b',
    fromTime: 2,
    toTime: 2,
    visualDelta: 0.6,
    semanticDelta: 0.2,
    emotionDelta: 0.1,
    audioDelta: 0,
    rhythmDelta: 0.3,
    issue: 'color-pop',
    interpretation: 'style drift between adjacent scenes',
    intentionality: 'unknown',
    evidenceIds: ['quality-review:run:call'],
    ...overrides,
  };
}

describe('video content index foundation', () => {
  it('builds a deterministic index for identical inputs and supplied timestamp', () => {
    const input = {
      source: 'assets/clip.mp4',
      sourceKind: 'asset' as const,
      duration: 8,
      createdAt: 123,
      range: { start: 0, end: 8 },
      segments: [
        {
          start: 0,
          end: 4,
          basis: 'scene' as const,
          summary: 'Opening scene',
          entities: ['lead'],
          actions: ['walks'],
          confidence: 'medium' as const,
          evidenceIds: ['shot-evidence'],
        },
      ],
      qualityIssues: [createQualityIssue()],
      continuityEdges: [createContinuityEdge()],
    };

    const first = buildVideoContentIndex(input);
    const second = buildVideoContentIndex(input);

    expect(first.validation.valid).toBe(true);
    expect(first.index).toEqual(second.index);
    expect(first.index.id).toMatch(/^video-content-index:/);
    expect(first.index.segments[0]!.id).toMatch(/^video-segment:/);
    expect(first.index.continuityEdges[0]!.id).toMatch(/^continuity-edge:/);
    expect(first.index.evidenceIds).toEqual(['quality-review:run:call', 'shot-evidence']);
  });

  it('rejects invalid time ranges and missing evidence ids', () => {
    const result = buildVideoContentIndex({
      source: 'assets/clip.mp4',
      sourceKind: 'clip-range',
      duration: 5,
      createdAt: 123,
      range: { start: -1, end: 6 },
      segments: [
        {
          start: 4,
          end: 3,
          basis: 'scene',
          summary: 'bad range',
          entities: [],
          actions: [],
          confidence: 'low',
          evidenceIds: [],
        },
      ],
      qualityIssues: [createQualityIssue({ start: 4, end: 7, evidenceIds: [] })],
      continuityEdges: [createContinuityEdge({ toTime: 6, evidenceIds: [] })],
    });

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['invalid-time-range', 'missing-evidence']),
    );
  });

  it('flags unordered overlapping segments', () => {
    const result = buildVideoContentIndex({
      source: 'timeline/render.mp4',
      sourceKind: 'timeline-render',
      duration: 10,
      createdAt: 123,
      segments: [
        {
          start: 0,
          end: 6,
          basis: 'uniform-window',
          summary: '',
          entities: [],
          actions: [],
          confidence: 'low',
          evidenceIds: ['evidence-a'],
        },
        {
          start: 5,
          end: 8,
          basis: 'uniform-window',
          summary: '',
          entities: [],
          actions: [],
          confidence: 'low',
          evidenceIds: ['evidence-b'],
        },
      ],
    });

    expect(result.validation.errors).toEqual([
      expect.objectContaining({ code: 'segment-order', path: 'segments[1]' }),
    ]);
  });

  it('keeps optional analyzer placeholders without binding to FFmpeg commands', () => {
    expect(VIDEO_CONTENT_ANALYZER_PLACEHOLDERS.map((placeholder) => placeholder.name)).toEqual([
      'probeDetailed',
      'inspectFrames',
      'detectShots',
      'detectFreeze',
      'analyzeFlicker',
      'analyzeLoudness',
      'detectSilence',
    ]);
  });

  it('does not mutate caller input or invoke generation during construction', () => {
    const generate = vi.fn();
    const qualityIssue = createQualityIssue({ severity: 'critical' });
    const segments = [
      {
        start: 0,
        end: 5,
        basis: 'scene' as const,
        summary: 'Critical issue remains evidence only',
        entities: [],
        actions: [],
        confidence: 'high' as const,
        evidenceIds: ['segment-evidence'],
      },
    ];

    const result = buildVideoContentIndex({
      source: 'assets/critical.mp4',
      sourceKind: 'asset',
      duration: 5,
      createdAt: 123,
      segments,
      qualityIssues: [qualityIssue],
      evidenceIds: ['manual-evidence'],
    });

    expect(generate).not.toHaveBeenCalled();
    expect(segments[0]).not.toHaveProperty('id');
    expect(result.index.qualityIssues[0]).toBe(qualityIssue);
    expect(result.index.evidenceIds).toEqual(['manual-evidence']);
  });
});
