import { describe, expect, it } from 'vitest';
import { createQualityReviewEvidence } from '../quality-review-evidence';

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
        data: {
          kind: 'quality-review',
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
        },
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
