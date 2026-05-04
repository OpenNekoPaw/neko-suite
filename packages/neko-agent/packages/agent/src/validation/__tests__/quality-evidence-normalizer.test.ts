import { describe, expect, it } from 'vitest';
import {
  mapQualityIssueCategory,
  normalizeQualityConsistencyPayload,
  normalizeQualityReviewPayload,
  stableHashString,
  validateBasicQualityIssue,
  type BasicQualityIssue,
} from '../quality-evidence-normalizer';

describe('quality evidence normalizer', () => {
  it('maps explicit technical QA categories into editing categories', () => {
    expect(mapQualityIssueCategory({ category: 'tearing', description: 'scanline tear' })).toBe(
      'tearing',
    );
    expect(mapQualityIssueCategory({ category: 'stuttering', description: 'frame drops' })).toBe(
      'stutter',
    );
    expect(mapQualityIssueCategory({ category: 'jitter', description: 'brightness flicker' })).toBe(
      'flicker',
    );
    expect(mapQualityIssueCategory({ category: 'jitter', description: 'color drift' })).toBeNull();
    expect(mapQualityIssueCategory({ category: 'audio-clipping', description: 'peak clips' })).toBe(
      'audio-clipping',
    );
    expect(mapQualityIssueCategory({ category: 'loudness-off', description: 'LUFS low' })).toBe(
      'loudness-off',
    );
  });

  it('keeps semantic and ambiguous artifact issues as source evidence only', () => {
    const result = normalizeQualityReviewPayload({
      evidenceId: 'quality-review:run:call',
      toolName: 'QualityCheck',
      toolCallId: 'call',
      runId: 'run',
      payload: {
        evaluations: [
          {
            index: 0,
            passed: false,
            finalScore: 44,
            timeRange: { start: 0, end: 4 },
            issues: [
              {
                category: 'prompt-mismatch',
                severity: 'major',
                description: 'subject differs from prompt',
              },
              {
                category: 'artifact',
                severity: 'major',
                description: 'visual problem',
              },
            ],
          },
        ],
      },
    });

    expect(result.issues).toHaveLength(0);
    expect(result.sourceIssues).toHaveLength(2);
    expect(result.diagnostics.map((diagnostic) => diagnostic.reason)).toEqual([
      'semantic-category',
      'ambiguous-artifact',
    ]);
  });

  it('maps artifact and color distortion only when descriptions disambiguate', () => {
    const result = normalizeQualityReviewPayload({
      evidenceId: 'quality-review:run:call',
      toolName: 'QualityCheck',
      payload: {
        evaluations: [
          {
            index: 0,
            passed: false,
            finalScore: 50,
            timeRange: { start: 1, end: 3 },
            issues: [
              { category: 'artifact', severity: 'major', description: 'soft blurry focus' },
              { category: 'artifact', severity: 'minor', description: 'macroblock banding' },
              { category: 'color-distortion', severity: 'major', description: 'overexposed sky' },
              { category: 'color-distortion', severity: 'minor', description: 'green tint' },
            ],
          },
        ],
      },
    });

    expect(result.issues.map((issue) => issue.category)).toEqual([
      'blur',
      'compression',
      'exposure',
      'color-shift',
    ]);
  });

  it('diagnoses jitter that lacks flicker timing evidence as ambiguous', () => {
    const result = normalizeQualityReviewPayload({
      evidenceId: 'quality-review:run:call',
      toolName: 'QualityCheck',
      payload: {
        evaluations: [
          {
            index: 0,
            passed: false,
            finalScore: 50,
            timeRange: { start: 1, end: 3 },
            issues: [{ category: 'jitter', severity: 'major', description: 'color drift' }],
          },
        ],
      },
    });

    expect(result.issues).toHaveLength(0);
    expect(result.diagnostics[0]).toMatchObject({
      sourceCategory: 'jitter',
      reason: 'ambiguous-jitter',
    });
  });

  it('uses fallback scene ranges, propagates source metadata, and dedupes deterministic ids', () => {
    const input = {
      evidenceId: 'quality-review:run:call',
      toolName: 'QualityCheck',
      toolCallId: 'call',
      runId: 'run',
      sceneTimeRanges: [{ sceneIndex: 2, timeRange: { start: 10, end: 16 } }],
      payload: {
        evaluations: [
          {
            index: 2,
            passed: false,
            finalScore: 31,
            videoMetrics: { duration: 6, fps: 24, width: 1280, height: 720, framesSampled: 4 },
            issues: [
              { category: 'tearing', severity: 'critical', description: 'horizontal tearing' },
              { category: 'tearing', severity: 'critical', description: 'horizontal tearing' },
            ],
            remediations: [{ description: 'Regenerate damaged frames' }],
          },
        ],
      },
    } as const;

    const first = normalizeQualityReviewPayload(input);
    const second = normalizeQualityReviewPayload(input);

    expect(first.issues).toHaveLength(1);
    expect(first.issues[0]).toMatchObject({
      start: 10,
      end: 16,
      category: 'tearing',
      severity: 'critical',
      suggestedFixes: ['Regenerate damaged frames'],
      source: {
        toolName: 'QualityCheck',
        toolCallId: 'call',
        runId: 'run',
        sceneIndex: 2,
        sourceCategory: 'tearing',
        sourceTimeRange: { start: 10, end: 16 },
      },
      evidenceIds: ['quality-review:run:call'],
    });
    expect(first.issues[0]!.id).toBe(second.issues[0]!.id);
    expect(first.sourceIssues).toHaveLength(2);
    expect(first.sourceIssues.every((issue) => issue.mappedIssueId === first.issues[0]!.id)).toBe(
      true,
    );
  });

  it('generates different ids for different time ranges', () => {
    const makeResult = (start: number, end: number) =>
      normalizeQualityReviewPayload({
        evidenceId: 'quality-review:run:call',
        toolName: 'QualityCheck',
        payload: {
          evaluations: [
            {
              index: 0,
              passed: false,
              finalScore: 50,
              timeRange: { start, end },
              issues: [{ category: 'stuttering', severity: 'major', description: 'frame drops' }],
            },
          ],
        },
      });

    expect(makeResult(0, 2).issues[0]!.id).not.toBe(makeResult(2, 4).issues[0]!.id);
  });

  it('includes input length in stable hashes to reduce large-index id collision risk', () => {
    const hash = stableHashString('quality-evidence');

    expect(hash).toMatch(/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
    expect(hash.endsWith(`-${'quality-evidence'.length.toString(36)}`)).toBe(true);
    expect(hash).toBe(stableHashString('quality-evidence'));
    expect(hash).not.toBe(stableHashString('quality evidence'));
  });

  it('requires time ranges before emitting BasicQualityIssue', () => {
    const result = normalizeQualityReviewPayload({
      evidenceId: 'quality-review:run:call',
      toolName: 'QualityCheck',
      payload: {
        evaluations: [
          {
            index: 0,
            passed: false,
            finalScore: 50,
            issues: [{ category: 'audio-clipping', severity: 'major', description: 'clipping' }],
          },
        ],
      },
    });

    expect(result.issues).toHaveLength(0);
    expect(result.diagnostics[0]).toMatchObject({
      sourceCategory: 'audio-clipping',
      reason: 'missing-time-range',
    });
  });

  it('creates continuity edge candidates only with adjacent scene references', () => {
    const withRanges = normalizeQualityConsistencyPayload({
      evidenceId: 'quality-review:run:consistency',
      toolName: 'QualityCheckConsistency',
      toolCallId: 'consistency',
      report: {
        styleDrift: [{ fromScene: 1, toScene: 2, driftScore: 65, description: 'large color pop' }],
      },
      sceneTimeRanges: [
        { sceneIndex: 1, timeRange: { start: 0, end: 3 } },
        { sceneIndex: 2, timeRange: { start: 3, end: 6 } },
      ],
    });

    const withoutAdjacent = normalizeQualityConsistencyPayload({
      evidenceId: 'quality-review:run:consistency',
      toolName: 'QualityCheckConsistency',
      report: {
        styleDrift: [{ fromScene: 1, toScene: 3, driftScore: 65, description: 'skipped scene' }],
      },
      sceneTimeRanges: [
        { sceneIndex: 1, timeRange: { start: 0, end: 3 } },
        { sceneIndex: 3, timeRange: { start: 6, end: 9 } },
      ],
    });

    expect(withRanges.continuityEdgeCandidates).toHaveLength(1);
    expect(withRanges.continuityEdgeCandidates[0]).toMatchObject({
      fromSceneIndex: 1,
      toSceneIndex: 2,
      fromTime: 3,
      toTime: 3,
      visualDelta: 0.65,
      issue: 'color-pop',
      evidenceIds: ['quality-review:run:consistency'],
    });
    expect(withoutAdjacent.continuityEdgeCandidates).toHaveLength(0);
    expect(withoutAdjacent.diagnostics[0]?.reason).toBe('non-adjacent-scenes');
  });

  it('marks style drift color-pop only above the configured threshold', () => {
    const result = normalizeQualityConsistencyPayload({
      evidenceId: 'quality-review:run:consistency',
      toolName: 'QualityCheckConsistency',
      report: {
        styleDrift: [
          { fromScene: 1, toScene: 2, driftScore: 40, description: 'threshold drift' },
          { fromScene: 2, toScene: 3, driftScore: 41, description: 'above threshold drift' },
        ],
      },
      sceneTimeRanges: [
        { sceneIndex: 1, timeRange: { start: 0, end: 3 } },
        { sceneIndex: 2, timeRange: { start: 3, end: 6 } },
        { sceneIndex: 3, timeRange: { start: 6, end: 9 } },
      ],
    });

    expect(result.continuityEdgeCandidates).toHaveLength(2);
    expect('issue' in result.continuityEdgeCandidates[0]!).toBe(false);
    expect(result.continuityEdgeCandidates[1]?.issue).toBe('color-pop');
  });

  it('validates normalized quality issues', () => {
    const issue: BasicQualityIssue = {
      id: 'issue',
      start: 0,
      end: 2,
      category: 'flicker',
      severity: 'major',
      metrics: {},
      source: { toolName: 'QualityCheck' },
      evidenceIds: ['evidence'],
      suggestedFixes: [],
    };

    expect(validateBasicQualityIssue(issue).valid).toBe(true);
    expect(validateBasicQualityIssue({ ...issue, evidenceIds: [] }).errors).toEqual([
      expect.objectContaining({ code: 'missing-evidence' }),
    ]);
  });
});
