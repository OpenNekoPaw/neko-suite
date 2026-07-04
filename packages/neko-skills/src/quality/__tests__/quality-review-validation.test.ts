import { describe, expect, it } from 'vitest';
import {
  createQualityReviewEvidence,
  createQualityReviewValidationAdapter,
} from '../quality-review-validation';

describe('createQualityReviewEvidence', () => {
  it('wraps failing QualityReview output as perception evidence', () => {
    const result = createQualityReviewEvidence({
      payload: {
        totalScenes: 3,
        passed: 1,
        failed: 2,
        evaluations: [
          { index: 1, passed: true, finalScore: 0.92 },
          {
            index: 2,
            passed: false,
            finalScore: 0.44,
            remediations: [{ action: 'Regenerate with steadier motion' }],
          },
          {
            index: 3,
            passed: false,
            finalScore: 0.35,
            remediations: [
              { recommendedNextStep: 'Trim the jump cut by 6 frames' },
              'Stabilize camera drift before accepting the shot',
            ],
          },
        ],
      },
      toolCallId: 'call-qc',
      toolName: 'QualityCheck',
      observedAt: 20,
      runId: 'run-quality',
    });

    expect(result.summary).toEqual({
      totalScenes: 3,
      passed: 1,
      failed: 2,
      failingSceneIndexes: [2, 3],
      remediationCount: 3,
      recommendations: [
        {
          sceneIndex: 2,
          text: 'Regenerate with steadier motion',
          source: 'remediation',
        },
        {
          sceneIndex: 3,
          text: 'Trim the jump cut by 6 frames',
          source: 'remediation',
        },
        {
          sceneIndex: 3,
          text: 'Stabilize camera drift before accepting the shot',
          source: 'remediation',
        },
      ],
    });
    expect(result.evidence).toEqual({
      id: 'quality-review:run-quality:call-qc',
      source: 'tool',
      summary: 'QualityReview failed 2/3 scene(s): scene(s) 2, 3; 3 remediation hint(s) available.',
      confidence: 1 / 3,
      toolName: 'QualityCheck',
      data: createLegacyQualityReviewData(),
      createdAt: 20,
      status: 'active',
    });
  });

  it('enriches QualityReview evidence with normalized issues and source diagnostics', () => {
    const result = createQualityReviewEvidence({
      payload: {
        totalScenes: 1,
        passed: 0,
        failed: 1,
        evaluations: [
          {
            index: 4,
            passed: false,
            finalScore: 34,
            timeRange: { start: 12, end: 15 },
            issues: [
              {
                category: 'stuttering',
                severity: 'major',
                description: 'Frame drops produce uneven motion',
              },
              {
                category: 'prompt-mismatch',
                severity: 'minor',
                description: 'Subject differs from prompt',
              },
            ],
            remediations: [{ description: 'Interpolate dropped frames' }],
            videoMetrics: {
              duration: 3,
              fps: 24,
              width: 1920,
              height: 1080,
              framesSampled: 4,
            },
          },
        ],
      },
      toolCallId: 'call-qc',
      toolName: 'QualityCheck',
      observedAt: 40,
      runId: 'run-quality',
    });

    expect(result.summary).toEqual({
      totalScenes: 1,
      passed: 0,
      failed: 1,
      failingSceneIndexes: [4],
      remediationCount: 1,
      recommendations: [
        {
          sceneIndex: 4,
          text: 'Interpolate dropped frames',
          source: 'remediation',
        },
      ],
    });
    expect(result.evidence.data).toEqual(
      expect.objectContaining({
        kind: 'quality-review',
        normalizedIssueIds: [expect.stringMatching(/^quality-issue:/)],
        normalizedIssues: [
          expect.objectContaining({
            category: 'stutter',
            start: 12,
            end: 15,
            evidenceIds: ['quality-review:run-quality:call-qc'],
            suggestedFixes: ['Interpolate dropped frames'],
            source: expect.objectContaining({
              toolName: 'QualityCheck',
              sourceCategory: 'stuttering',
              sceneIndex: 4,
              toolCallId: 'call-qc',
              runId: 'run-quality',
            }),
          }),
        ],
        sourceIssues: [
          expect.objectContaining({
            sceneIndex: 4,
            category: 'stuttering',
            mappedIssueId: expect.stringMatching(/^quality-issue:/),
          }),
          expect.objectContaining({
            sceneIndex: 4,
            category: 'prompt-mismatch',
          }),
        ],
        normalizationDiagnostics: [
          expect.objectContaining({
            sourceCategory: 'prompt-mismatch',
            reason: 'semantic-category',
          }),
        ],
      }),
    );
  });

  it('adds continuity edge candidates only when consistency references adjacent scenes', () => {
    const result = createQualityReviewEvidence({
      payload: {
        totalScenes: 2,
        passed: 0,
        failed: 2,
        evaluations: [
          { index: 1, passed: false, finalScore: 0.5 },
          { index: 2, passed: false, finalScore: 0.4 },
        ],
      },
      consistencyReport: {
        styleDrift: [
          { fromScene: 1, toScene: 2, driftScore: 70, description: 'Strong color shift' },
          { fromScene: 1, toScene: 3, driftScore: 80, description: 'Non-adjacent drift' },
        ],
      },
      sceneTimeRanges: [
        { sceneIndex: 1, timeRange: { start: 0, end: 5 } },
        { sceneIndex: 2, timeRange: { start: 5, end: 10 } },
        { sceneIndex: 3, timeRange: { start: 10, end: 15 } },
      ],
      toolCallId: 'call-consistency',
      toolName: 'QualityCheckConsistency',
      observedAt: 50,
      runId: 'run-quality',
    });

    expect(result.evidence.data).toEqual(
      expect.objectContaining({
        continuityEdgeCandidateIds: [expect.stringMatching(/^continuity-edge:/)],
        continuityEdgeCandidates: [
          expect.objectContaining({
            fromSceneIndex: 1,
            toSceneIndex: 2,
            fromTime: 5,
            toTime: 5,
            issue: 'color-pop',
            evidenceIds: ['quality-review:run-quality:call-consistency'],
          }),
        ],
        normalizationDiagnostics: [
          expect.objectContaining({
            sourceCategory: 'style-drift',
            reason: 'non-adjacent-scenes',
          }),
        ],
      }),
    );
  });

  it('preserves the existing QualityReview summary data fields for current consumers', () => {
    const result = createQualityReviewEvidence({
      payload: {
        totalScenes: 3,
        passed: 1,
        failed: 2,
        evaluations: [
          { index: 1, passed: true, finalScore: 0.92 },
          {
            index: 2,
            passed: false,
            finalScore: 0.44,
            remediations: [{ action: 'Regenerate with steadier motion' }],
          },
          {
            index: 3,
            passed: false,
            finalScore: 0.35,
            remediations: [
              { recommendedNextStep: 'Trim the jump cut by 6 frames' },
              'Stabilize camera drift before accepting the shot',
            ],
          },
        ],
      },
      toolCallId: 'call-qc',
      toolName: 'QualityCheck',
      observedAt: 20,
      runId: 'run-quality',
    });

    expect(result).toEqual({
      summary: {
        totalScenes: 3,
        passed: 1,
        failed: 2,
        failingSceneIndexes: [2, 3],
        remediationCount: 3,
        recommendations: [
          {
            sceneIndex: 2,
            text: 'Regenerate with steadier motion',
            source: 'remediation',
          },
          {
            sceneIndex: 3,
            text: 'Trim the jump cut by 6 frames',
            source: 'remediation',
          },
          {
            sceneIndex: 3,
            text: 'Stabilize camera drift before accepting the shot',
            source: 'remediation',
          },
        ],
      },
      evidence: {
        id: 'quality-review:run-quality:call-qc',
        source: 'tool',
        summary:
          'QualityReview failed 2/3 scene(s): scene(s) 2, 3; 3 remediation hint(s) available.',
        confidence: 1 / 3,
        toolName: 'QualityCheck',
        data: createLegacyQualityReviewData(),
        createdAt: 20,
        status: 'active',
      },
    });
  });

  it('keeps passing QualityReview output as non-blocking evidence', () => {
    const result = createQualityReviewEvidence({
      payload: {
        totalScenes: 1,
        passed: 1,
        failed: 0,
        evaluations: [{ index: 1, passed: true, finalScore: 0.95 }],
      },
      toolCallId: 'call-pass',
      toolName: 'QualityCheckConsistency',
      observedAt: 30,
      observationId: 'obs-1',
    });

    expect(result.summary).toEqual({
      totalScenes: 1,
      passed: 1,
      failed: 0,
      failingSceneIndexes: [],
      remediationCount: 0,
      recommendations: [],
    });
    expect(result.evidence).toEqual(
      expect.objectContaining({
        id: 'quality-review:runless:call-pass',
        source: 'tool',
        summary: 'QualityReview passed 1/1 scene(s).',
        confidence: 1,
        toolName: 'QualityCheckConsistency',
        observationId: 'obs-1',
        createdAt: 30,
      }),
    );
  });
});

describe('createQualityReviewValidationAdapter', () => {
  it('turns failing QualityCheck output into a generic tool-review signal', () => {
    const adapter = createQualityReviewValidationAdapter();

    const signal = adapter.createSignal({
      result: {
        callId: 'call-qc',
        name: 'QualityCheck',
        success: true,
        data: {
          totalScenes: 2,
          passed: 1,
          failed: 1,
          evaluations: [
            { index: 1, passed: true, finalScore: 0.9 },
            {
              index: 2,
              passed: false,
              finalScore: 0.4,
              remediations: [{ action: 'Regenerate the shot' }],
            },
          ],
        },
      },
      toolArguments: {
        scenes: [{ index: 2, timeRange: { start: 4, end: 9 } }],
      },
      toolCallId: 'call-qc',
      toolName: 'QualityCheck',
      observedAt: 10,
      runId: 'run-quality',
    });

    expect(signal).toEqual(
      expect.objectContaining({
        kind: 'tool-review',
        observedAt: 10,
        toolCallId: 'call-qc',
        toolName: 'QualityCheck',
        status: 'failed',
        summary: 'QualityReview failed 1/2 scene(s): scene(s) 2; 1 remediation hint(s) available.',
        repairGuidance:
          'Repair the failing quality-check result. Focus on scene(s) 2 and apply 1 suggested remediation step(s) as needed.',
        repeatKey: 'quality-review:run-quality:QualityCheck',
        runId: 'run-quality',
        metadata: {
          mode: 'analysis',
          totalScenes: 2,
          passed: 1,
          failed: 1,
          failingSceneIndexes: [2],
          remediationCount: 1,
        },
        evidence: expect.objectContaining({
          id: 'quality-review:run-quality:call-qc',
          toolName: 'QualityCheck',
        }),
      }),
    );
  });

  it('normalizes partial QualityCheckConsistency reports before creating validation', () => {
    const adapter = createQualityReviewValidationAdapter();

    const signal = adapter.createSignal({
      result: {
        callId: 'call-consistency',
        name: 'QualityCheckConsistency',
        success: true,
        data: {
          overallConsistency: 58,
          styleDrift: [
            { fromScene: 1, toScene: 2, driftScore: 60, description: 'strong style drift' },
          ],
        },
      },
      toolArguments: {
        scenes: [
          { sceneIndex: 1, timeRange: { start: 0, end: 4 } },
          { sceneIndex: 2, timeRange: { start: 4, end: 8 } },
        ],
      },
      toolCallId: 'call-consistency',
      toolName: 'QualityCheckConsistency',
      observedAt: 20,
    });

    expect(signal).toEqual(
      expect.objectContaining({
        kind: 'tool-review',
        toolName: 'QualityCheckConsistency',
        status: 'failed',
        metadata: expect.objectContaining({
          mode: 'consistency',
          failed: 2,
          failingSceneIndexes: [1, 2],
        }),
        evidence: expect.objectContaining({
          data: expect.objectContaining({
            adapterDiagnostics: [
              'missing-characterConsistency',
              'missing-aestheticScore',
              'missing-recommendations',
            ],
            continuityEdgeCandidates: [
              expect.objectContaining({
                issue: 'color-pop',
              }),
            ],
          }),
        }),
      }),
    );
  });
});

function createLegacyQualityReviewData(): Record<string, unknown> {
  return {
    kind: 'quality-review',
    mode: 'analysis',
    toolCallId: 'call-qc',
    runId: 'run-quality',
    totalScenes: 3,
    passed: 1,
    failed: 2,
    failingSceneIndexes: [2, 3],
    remediationCount: 3,
    recommendations: [
      {
        sceneIndex: 2,
        text: 'Regenerate with steadier motion',
        source: 'remediation',
      },
      {
        sceneIndex: 3,
        text: 'Trim the jump cut by 6 frames',
        source: 'remediation',
      },
      {
        sceneIndex: 3,
        text: 'Stabilize camera drift before accepting the shot',
        source: 'remediation',
      },
    ],
  };
}
